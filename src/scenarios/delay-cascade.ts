import { ReflowService } from "../reflow/reflow.service";
import { validateSchedule } from "../reflow/constraint-checker";
import { createExtrusionLine1, createWorkOrder, createManufacturingOrder } from "../data/sample-data";
import { printReflowResult, printValidation } from "../utils/display";

// ============================================================================
// Scenario 1: Delay Cascade
// ============================================================================
// WO-A -> WO-B -> WO-C on Line 1 (dependency chain)
// WO-A delayed from 120min to 240min (now ends 12PM instead of 10AM)
// Expected: WO-B pushed to 12PM, WO-C pushed accordingly
// ============================================================================

export function runDelayCascade(): void {
  const workCenters = [createExtrusionLine1()];
  const manufacturingOrders = [
    createManufacturingOrder({
      docId: "mo-001", manufacturingOrderNumber: "MO-001",
      itemId: "pipe-50mm", quantity: 100, dueDate: "2025-01-06T17:00:00.000Z",
    }),
  ];

  // Jan 6, 2025 = Monday
  const workOrders = [
    createWorkOrder({
      docId: "wo-a", workOrderNumber: "WO-A", workCenterId: "wc-line1",
      startDate: "2025-01-06T08:00:00.000Z",
      endDate: "2025-01-06T12:00:00.000Z",  // DELAYED: was 10AM, now 12PM
      durationMinutes: 240,                   // Was 120, now 240
      dependsOnWorkOrderIds: [],
    }),
    createWorkOrder({
      docId: "wo-b", workOrderNumber: "WO-B", workCenterId: "wc-line1",
      startDate: "2025-01-06T10:00:00.000Z",  // Old schedule: 10AM
      endDate: "2025-01-06T12:00:00.000Z",
      durationMinutes: 120,
      dependsOnWorkOrderIds: ["wo-a"],
    }),
    createWorkOrder({
      docId: "wo-c", workOrderNumber: "WO-C", workCenterId: "wc-line1",
      startDate: "2025-01-06T12:00:00.000Z",
      endDate: "2025-01-06T14:00:00.000Z",
      durationMinutes: 120,
      dependsOnWorkOrderIds: ["wo-b"],
    }),
  ];

  const result = new ReflowService().reflow({ workOrders, workCenters, manufacturingOrders });
  printReflowResult(result, "Delay Cascade");
  printValidation(validateSchedule(result.updatedWorkOrders, workCenters));
}

runDelayCascade();
