import { ReflowService } from "../reflow/reflow.service";
import { validateSchedule } from "../reflow/constraint-checker";
import { createExtrusionLine1, createWorkOrder, createManufacturingOrder } from "../data/sample-data";
import { printReflowResult, printValidation } from "../utils/display";

// ============================================================================
// Scenario 3: Shift Spanning
// ============================================================================
// Line 1: Mon-Fri 8AM-5PM (540 min/day)
// WO-F needs 600 minutes (more than one full shift!)
// Expected: Mon 8AM-5PM (540 min), pause, Tue 8AM-9AM (60 min) = done
// WO-G depends on WO-F and should start after Tue 9AM
// ============================================================================

export function runShiftSpanning(): void {
  const workCenters = [createExtrusionLine1()];
  const manufacturingOrders = [
    createManufacturingOrder({
      docId: "mo-003", manufacturingOrderNumber: "MO-003",
      itemId: "pipe-100mm", quantity: 200, dueDate: "2025-01-10T17:00:00.000Z",
    }),
  ];

  // Jan 6, 2025 = Monday
  const workOrders = [
    createWorkOrder({
      docId: "wo-f", workOrderNumber: "WO-F", workCenterId: "wc-line1",
      startDate: "2025-01-06T08:00:00.000Z",  // Mon 8AM
      endDate: "2025-01-06T18:00:00.000Z",     // WRONG: 6PM (ignores shift end at 5PM)
      durationMinutes: 600,                      // 10 hours
      dependsOnWorkOrderIds: [],
    }),
    createWorkOrder({
      docId: "wo-g", workOrderNumber: "WO-G", workCenterId: "wc-line1",
      startDate: "2025-01-06T18:00:00.000Z",   // WRONG: based on old WO-F end
      endDate: "2025-01-06T20:00:00.000Z",
      durationMinutes: 120,
      dependsOnWorkOrderIds: ["wo-f"],
    }),
  ];

  const result = new ReflowService().reflow({ workOrders, workCenters, manufacturingOrders });
  printReflowResult(result, "Shift Spanning");
  printValidation(validateSchedule(result.updatedWorkOrders, workCenters));
}

runShiftSpanning();
