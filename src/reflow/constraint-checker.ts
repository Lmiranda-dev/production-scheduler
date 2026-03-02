import {
  WorkOrder,
  WorkCenter,
  ConstraintViolation,
  ValidationResult,
} from "./types";
import { parseDate, rangesOverlap, isDuringShift, isDuringMaintenance } from "../utils/date-utils";

// ============================================================================
// Constraint Checker — validates a schedule against all hard constraints
// ============================================================================

/** Validate the entire schedule. Returns all violations found. */
export function validateSchedule(
  workOrders: WorkOrder[],
  workCenters: WorkCenter[]
): ValidationResult {
  const violations: ConstraintViolation[] = [
    ...checkWorkCenterOverlaps(workOrders),
    ...checkDependencies(workOrders),
    ...checkShiftBoundaries(workOrders, workCenters),
    ...checkMaintenanceWindows(workOrders, workCenters),
  ];

  return { isValid: violations.length === 0, violations };
}

/** No two non-maintenance work orders should overlap on the same work center. */
export function checkWorkCenterOverlaps(workOrders: WorkOrder[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const byCenter = new Map<string, WorkOrder[]>();

  for (const wo of workOrders) {
    if (!byCenter.has(wo.data.workCenterId)) byCenter.set(wo.data.workCenterId, []);
    byCenter.get(wo.data.workCenterId)!.push(wo);
  }

  for (const [_, orders] of byCenter) {
    const sorted = [...orders].sort(
      (a, b) => parseDate(a.data.startDate).getTime() - parseDate(b.data.startDate).getTime()
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const currentEnd = parseDate(sorted[i].data.endDate);
      const nextStart = parseDate(sorted[i + 1].data.startDate);

      if (currentEnd.getTime() > nextStart.getTime()) {
        violations.push({
          type: "overlap",
          workOrderId: sorted[i + 1].docId,
          conflictsWith: sorted[i].docId,
          message:
            `${sorted[i + 1].data.workOrderNumber} overlaps with ` +
            `${sorted[i].data.workOrderNumber} on work center ${sorted[i].data.workCenterId}`,
        });
      }
    }
  }

  return violations;
}

/** All parent dependencies must end before the child starts. */
export function checkDependencies(workOrders: WorkOrder[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const orderMap = new Map(workOrders.map(wo => [wo.docId, wo]));

  for (const wo of workOrders) {
    for (const parentId of wo.data.dependsOnWorkOrderIds) {
      const parent = orderMap.get(parentId);
      if (!parent) continue;

      if (parseDate(parent.data.endDate).getTime() > parseDate(wo.data.startDate).getTime()) {
        violations.push({
          type: "dependency",
          workOrderId: wo.docId,
          conflictsWith: parentId,
          message:
            `${wo.data.workOrderNumber} starts before dependency ` +
            `${parent.data.workOrderNumber} finishes`,
        });
      }
    }
  }

  return violations;
}

/** Work order start times must be during shift hours. */
export function checkShiftBoundaries(
  workOrders: WorkOrder[],
  workCenters: WorkCenter[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const centerMap = new Map(workCenters.map(wc => [wc.docId, wc]));

  for (const wo of workOrders) {
    const center = centerMap.get(wo.data.workCenterId);
    if (!center) continue;

    const start = parseDate(wo.data.startDate);
    if (!isDuringShift(start, center.data.shifts)) {
      violations.push({
        type: "shift",
        workOrderId: wo.docId,
        message: `${wo.data.workOrderNumber} starts outside shift hours`,
      });
    }
  }

  return violations;
}

/**
 * Non-maintenance work orders should not have their START or END times
 * fall within a maintenance window.
 *
 * Note: A work order's overall time range [startDate, endDate] may CONTAIN
 * a maintenance window — this is valid because the reflow algorithm pauses
 * work during maintenance and resumes after. The actual work segments don't
 * overlap with maintenance. We only flag a violation if the work order's
 * start or end falls INSIDE the maintenance window, which would indicate
 * actual work is being performed during maintenance.
 */
export function checkMaintenanceWindows(
  workOrders: WorkOrder[],
  workCenters: WorkCenter[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const centerMap = new Map(workCenters.map(wc => [wc.docId, wc]));

  for (const wo of workOrders) {
    if (wo.data.isMaintenance) continue;

    const center = centerMap.get(wo.data.workCenterId);
    if (!center) continue;

    const woStart = parseDate(wo.data.startDate);
    const woEnd = parseDate(wo.data.endDate);

    for (const mw of center.data.maintenanceWindows) {
      const mwStart = parseDate(mw.startDate);
      const mwEnd = parseDate(mw.endDate);

      // Check if work order STARTS during maintenance
      const startsDuringMaint =
        woStart.getTime() >= mwStart.getTime() && woStart.getTime() < mwEnd.getTime();

      // Check if work order ENDS during maintenance
      // (end is exclusive, so ending exactly at mwStart is fine)
      const endsDuringMaint =
        woEnd.getTime() > mwStart.getTime() && woEnd.getTime() <= mwEnd.getTime();

      if (startsDuringMaint || endsDuringMaint) {
        violations.push({
          type: "maintenance",
          workOrderId: wo.docId,
          message:
            `${wo.data.workOrderNumber} ${startsDuringMaint ? "starts" : "ends"} during ` +
            `maintenance (${mw.reason || "scheduled maintenance"})`,
        });
      }
    }
  }

  return violations;
}
