import {
  WorkOrder,
  WorkCenter,
  ManufacturingOrder,
  ReflowInput,
  ReflowResult,
  ReflowChange,
  ReflowMetrics,
} from "./types";
import { topologicalSort, findMissingDependencies } from "./dag";
import { validateSchedule } from "./constraint-checker";
import {
  parseDate,
  toISO,
  diffMinutes,
  snapToWorkingTime,
  calculateEndDateWithShifts,
  getWorkingMinutesBetween,
} from "../utils/date-utils";

// ============================================================================
// Reflow Service — Main Scheduling Algorithm
// ============================================================================
//
// Strategy: Topological sort + greedy forward scheduling
//
// 1. Sort work orders by dependencies (DAG topological sort)
// 2. Process each order in dependency-safe order
// 3. For each order, compute earliest valid start considering:
//    a) All parent dependencies must be complete
//    b) Work center must be free (no overlap with prior orders on same center)
//    c) Must fall within shift hours
//    d) Must avoid maintenance windows
// 4. Calculate shift-aware end date from that start
// 5. Track changes and generate explanation
// ============================================================================

export class ReflowService {
  /**
   * Main entry point: takes current (possibly invalid) schedule and produces
   * a valid one that respects all constraints.
   */
  reflow(input: ReflowInput): ReflowResult {
    const { workOrders, workCenters, manufacturingOrders } = input;

    // Build lookup maps
    const centerMap = new Map(workCenters.map(wc => [wc.docId, wc]));
    const orderMap = new Map(workOrders.map(wo => [wo.docId, wo]));

    // -----------------------------------------------------------------------
    // Step 1: Validate dependency references exist
    // -----------------------------------------------------------------------
    const missingDeps = findMissingDependencies(workOrders);
    if (missingDeps.length > 0) {
      throw new Error(
        `Missing dependency references: ${missingDeps.join(", ")}. ` +
        `All referenced work orders must exist in the input.`
      );
    }

    // -----------------------------------------------------------------------
    // Step 2: Topological sort (also detects cycles)
    // -----------------------------------------------------------------------
    const dagResult = topologicalSort(workOrders);
    if (dagResult.hasCycle) {
      throw new Error(
        `Circular dependency detected among work orders: ` +
        `${dagResult.cycleDetails?.join(", ")}. Cannot produce valid schedule.`
      );
    }

    // -----------------------------------------------------------------------
    // Step 3: Process work orders in topological order
    // -----------------------------------------------------------------------
    const changes: ReflowChange[] = [];
    const updatedOrders = new Map<string, WorkOrder>();

    // Track the latest end time per work center for conflict avoidance
    // Map<workCenterId, Date>
    const workCenterEndTimes = new Map<string, Date>();

    // Pre-register maintenance work orders — they are immovable and must be
    // accounted for before scheduling any regular orders
    for (const woId of dagResult.sortedOrder) {
      const wo = orderMap.get(woId)!;
      if (wo.data.isMaintenance) {
        updatedOrders.set(woId, wo);
        this.updateWorkCenterEndTime(
          workCenterEndTimes,
          wo.data.workCenterId,
          parseDate(wo.data.endDate)
        );
      }
    }

    for (const woId of dagResult.sortedOrder) {
      const originalWO = orderMap.get(woId)!;

      // ----- Maintenance work orders are immovable -----
      if (originalWO.data.isMaintenance) {
        updatedOrders.set(woId, originalWO);
        this.updateWorkCenterEndTime(
          workCenterEndTimes,
          originalWO.data.workCenterId,
          parseDate(originalWO.data.endDate)
        );
        continue;
      }

      // ----- Find the work center -----
      const center = centerMap.get(originalWO.data.workCenterId);
      if (!center) {
        throw new Error(
          `Work center ${originalWO.data.workCenterId} not found ` +
          `for work order ${originalWO.data.workOrderNumber}`
        );
      }

      // ----- Calculate earliest valid start -----
      let earliestStart = parseDate(originalWO.data.startDate);

      // (a) Dependency constraint: must start after ALL parents finish
      for (const parentId of originalWO.data.dependsOnWorkOrderIds) {
        const parentWO = updatedOrders.get(parentId);
        if (parentWO) {
          const parentEnd = parseDate(parentWO.data.endDate);
          if (parentEnd.getTime() > earliestStart.getTime()) {
            earliestStart = parentEnd;
          }
        }
      }

      // (b) Work center conflict: must start after previous order on same center
      const centerLastEnd = workCenterEndTimes.get(originalWO.data.workCenterId);
      if (centerLastEnd && centerLastEnd.getTime() > earliestStart.getTime()) {
        earliestStart = centerLastEnd;
      }

      // (c + d) Snap to valid working time (respects shifts + maintenance)
      const validStart = snapToWorkingTime(
        earliestStart,
        center.data.shifts,
        center.data.maintenanceWindows
      );

      // ----- Calculate total work time (including setup if applicable) -----
      const totalWorkMinutes =
        originalWO.data.durationMinutes + (originalWO.data.setupTimeMinutes || 0);

      // ----- Calculate shift-aware end date -----
      const validEnd = calculateEndDateWithShifts(
        validStart,
        totalWorkMinutes,
        center.data.shifts,
        center.data.maintenanceWindows
      );

      // ----- Build updated work order -----
      const updatedWO: WorkOrder = {
        ...originalWO,
        data: {
          ...originalWO.data,
          startDate: toISO(validStart),
          endDate: toISO(validEnd),
        },
      };
      updatedOrders.set(woId, updatedWO);

      // ----- Track work center end time -----
      this.updateWorkCenterEndTime(
        workCenterEndTimes,
        originalWO.data.workCenterId,
        validEnd
      );

      // ----- Record changes -----
      const origStart = parseDate(originalWO.data.startDate);
      const origEnd = parseDate(originalWO.data.endDate);

      const startDelta = diffMinutes(validStart, origStart);
      const endDelta = diffMinutes(validEnd, origEnd);

      if (Math.abs(startDelta) > 0.5) {
        changes.push({
          workOrderId: woId,
          workOrderNumber: originalWO.data.workOrderNumber,
          field: "startDate",
          oldValue: originalWO.data.startDate,
          newValue: toISO(validStart),
          deltaMinutes: Math.round(startDelta),
          reason: this.buildReason(originalWO, updatedOrders, centerLastEnd, center),
        });
      }

      if (Math.abs(endDelta) > 0.5) {
        changes.push({
          workOrderId: woId,
          workOrderNumber: originalWO.data.workOrderNumber,
          field: "endDate",
          oldValue: originalWO.data.endDate,
          newValue: toISO(validEnd),
          deltaMinutes: Math.round(endDelta),
          reason: this.buildReason(originalWO, updatedOrders, centerLastEnd, center),
        });
      }
    }

    // -----------------------------------------------------------------------
    // Step 4: Build result (preserve original order)
    // -----------------------------------------------------------------------
    const updatedWorkOrders = workOrders.map(
      wo => updatedOrders.get(wo.docId) || wo
    );

    // -----------------------------------------------------------------------
    // Step 5: Validate output schedule
    // -----------------------------------------------------------------------
    const validation = validateSchedule(updatedWorkOrders, workCenters);
    if (!validation.isValid) {
      console.warn("⚠️  Schedule validation warnings:");
      for (const v of validation.violations) {
        console.warn(`   [${v.type}] ${v.message}`);
      }
    }

    // -----------------------------------------------------------------------
    // Step 6: Metrics
    // -----------------------------------------------------------------------
    const metrics = this.calculateMetrics(workOrders, updatedWorkOrders, workCenters);

    return {
      updatedWorkOrders,
      changes,
      explanation: this.generateExplanation(changes),
      metrics,
    };
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  /** Update the tracked latest end time for a work center. */
  private updateWorkCenterEndTime(
    map: Map<string, Date>,
    workCenterId: string,
    endDate: Date
  ): void {
    const current = map.get(workCenterId);
    if (!current || endDate.getTime() > current.getTime()) {
      map.set(workCenterId, endDate);
    }
  }

  /**
   * Build a human-readable reason for why a work order was rescheduled.
   */
  private buildReason(
    originalWO: WorkOrder,
    updatedOrders: Map<string, WorkOrder>,
    centerLastEnd: Date | undefined,
    center: { data: { name: string; shifts: any[]; maintenanceWindows: any[] } }
  ): string {
    const reasons: string[] = [];

    // Check if any parent dependency caused a push
    for (const parentId of originalWO.data.dependsOnWorkOrderIds) {
      const parentWO = updatedOrders.get(parentId);
      if (parentWO) {
        const parentEnd = parseDate(parentWO.data.endDate);
        const origStart = parseDate(originalWO.data.startDate);
        if (parentEnd.getTime() > origStart.getTime()) {
          reasons.push(
            `Dependency: waits for ${parentWO.data.workOrderNumber} to finish`
          );
        }
      }
    }

    // Check if work center conflict caused a push
    if (centerLastEnd) {
      const origStart = parseDate(originalWO.data.startDate);
      if (centerLastEnd.getTime() > origStart.getTime()) {
        reasons.push(
          `Work center conflict: ${center.data.name} occupied until ${toISO(centerLastEnd)}`
        );
      }
    }

    // Check shift/maintenance
    const origStart = parseDate(originalWO.data.startDate);
    const snapped = snapToWorkingTime(
      origStart,
      center.data.shifts,
      center.data.maintenanceWindows
    );
    if (snapped.getTime() !== origStart.getTime()) {
      reasons.push(`Adjusted to valid shift hours on ${center.data.name}`);
    }

    return reasons.length > 0
      ? reasons.join("; ")
      : "Recalculated to respect shift boundaries";
  }

  /** Generate human-readable summary. */
  private generateExplanation(changes: ReflowChange[]): string {
    if (changes.length === 0) {
      return "No changes needed. Schedule is already valid.";
    }

    const lines = [`Reflow complete: ${changes.length} change(s) made.\n`];

    // Group by work order
    const byOrder = new Map<string, ReflowChange[]>();
    for (const change of changes) {
      if (!byOrder.has(change.workOrderNumber)) {
        byOrder.set(change.workOrderNumber, []);
      }
      byOrder.get(change.workOrderNumber)!.push(change);
    }

    for (const [woNumber, woChanges] of byOrder) {
      lines.push(`  ${woNumber}:`);
      for (const change of woChanges) {
        const direction = change.deltaMinutes > 0 ? "delayed" : "advanced";
        const absDelta = Math.abs(change.deltaMinutes);
        const hours = Math.floor(absDelta / 60);
        const mins = absDelta % 60;
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        lines.push(
          `    ${change.field} ${direction} by ${timeStr}: ${change.reason}`
        );
      }
    }

    return lines.join("\n");
  }

  /** Calculate optimization metrics. */
  private calculateMetrics(
    original: WorkOrder[],
    updated: WorkOrder[],
    workCenters: WorkCenter[]
  ): ReflowMetrics {
    let totalDelayMinutes = 0;
    let workOrdersAffected = 0;
    let workOrdersUnchanged = 0;

    const originalMap = new Map(original.map(wo => [wo.docId, wo]));
    const centerMap = new Map(workCenters.map(wc => [wc.docId, wc]));

    // Per-work-center tracking
    const totalWorkByCenter = new Map<string, number>();
    const utilizationByWorkCenter: Record<string, number> = {};
    const idleTimeByWorkCenter: Record<string, number> = {};

    for (const updatedWO of updated) {
      const originalWO = originalMap.get(updatedWO.docId);
      if (!originalWO) continue;

      const origEnd = parseDate(originalWO.data.endDate);
      const newEnd = parseDate(updatedWO.data.endDate);
      const delay = diffMinutes(newEnd, origEnd);

      if (Math.abs(delay) > 0.5) {
        totalDelayMinutes += Math.max(0, delay);
        workOrdersAffected++;
      } else {
        workOrdersUnchanged++;
      }

      // Accumulate work minutes per center
      const centerId = updatedWO.data.workCenterId;
      const prev = totalWorkByCenter.get(centerId) || 0;
      totalWorkByCenter.set(centerId, prev + updatedWO.data.durationMinutes);
    }

    // Calculate utilization per work center
    // Utilization = total working minutes / total available shift minutes in the schedule window
    for (const wc of workCenters) {
      const totalWork = totalWorkByCenter.get(wc.docId) || 0;

      // Estimate available minutes: count shift hours per week * rough weeks
      const shiftMinutesPerWeek = wc.data.shifts.reduce(
        (sum, s) => sum + (s.endHour - s.startHour) * 60, 0
      );

      // Use a 1-week window as baseline
      const available = shiftMinutesPerWeek || 1;
      utilizationByWorkCenter[wc.data.name] =
        Math.round((totalWork / available) * 100) / 100;
      idleTimeByWorkCenter[wc.data.name] = Math.max(0, available - totalWork);
    }

    return {
      totalDelayMinutes: Math.round(totalDelayMinutes),
      workOrdersAffected,
      workOrdersUnchanged,
      utilizationByWorkCenter,
      idleTimeByWorkCenter,
    };
  }
}
