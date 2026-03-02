import { ReflowService } from "../reflow/reflow.service";
import { validateSchedule } from "../reflow/constraint-checker";
import { createExtrusionLine1, createWorkOrder, createManufacturingOrder } from "../data/sample-data";
import { printReflowResult, printValidation } from "../utils/display";

// ============================================================================
// Scenario 2: Maintenance Conflict
// ============================================================================
// Line 1 has maintenance Tue 10AM-12PM
// WO-D scheduled Tue 9AM-11AM (overlaps maintenance!)
// WO-E depends on WO-D
// Expected: WO-D starts 9AM, works 60min until 10AM, pauses for maintenance,
//           resumes 12PM, works remaining 60min, finishes 1PM
//           WO-E starts after WO-D finishes
// ============================================================================

export function runMaintenanceConflict(): void {
  const workCenters = [
    createExtrusionLine1([
      {
        startDate: "2025-01-07T10:00:00.000Z",  // Tue 10AM
        endDate: "2025-01-07T12:00:00.000Z",    // Tue 12PM
        reason: "Scheduled die cleaning",
      },
    ]),
  ];

  const manufacturingOrders = [
    createManufacturingOrder({
      docId: "mo-002", manufacturingOrderNumber: "MO-002",
      itemId: "pipe-75mm", quantity: 50, dueDate: "2025-01-08T17:00:00.000Z",
    }),
  ];

  // Jan 7, 2025 = Tuesday
  const workOrders = [
    createWorkOrder({
      docId: "wo-d", workOrderNumber: "WO-D", workCenterId: "wc-line1",
      startDate: "2025-01-07T09:00:00.000Z",  // Tue 9AM (before maintenance)
      endDate: "2025-01-07T11:00:00.000Z",    // Tue 11AM (wrong, overlaps maint)
      durationMinutes: 120,
      dependsOnWorkOrderIds: [],
    }),
    createWorkOrder({
      docId: "wo-e", workOrderNumber: "WO-E", workCenterId: "wc-line1",
      startDate: "2025-01-07T11:00:00.000Z",
      endDate: "2025-01-07T13:00:00.000Z",
      durationMinutes: 120,
      dependsOnWorkOrderIds: ["wo-d"],
    }),
  ];

  const result = new ReflowService().reflow({ workOrders, workCenters, manufacturingOrders });
  printReflowResult(result, "Maintenance Conflict");
  printValidation(validateSchedule(result.updatedWorkOrders, workCenters));
}

runMaintenanceConflict();
