import { ReflowService } from "../reflow/reflow.service";
import { validateSchedule } from "../reflow/constraint-checker";
import {
  createExtrusionLine1, createExtrusionLine2,
  createWorkOrder, createManufacturingOrder,
} from "../data/sample-data";
import { printReflowResult, printValidation } from "../utils/display";

// ============================================================================
// Scenario 4: Complex Multi-Constraint
// ============================================================================
// Two work centers, cross-center dependencies, maintenance, shift spanning.
//
// Dependency graph:
//   WO-H (Line 1, 6h) --\
//                          +--> WO-J (Line 2, 6h) --> WO-K (Line 2, 2h)
//   WO-I (Line 1, 2h) --/
//
// Line 2 has maintenance Tue 1PM-3PM
// WO-H is delayed (takes 6h instead of planned 4h)
// WO-J must wait for both WO-H and WO-I, then hits maintenance on Line 2
// ============================================================================

export function runComplexMultiConstraint(): void {
  const workCenters = [
    createExtrusionLine1(),
    createExtrusionLine2([
      {
        startDate: "2025-01-07T13:00:00.000Z",  // Tue 1PM
        endDate: "2025-01-07T15:00:00.000Z",    // Tue 3PM
        reason: "Unplanned repair - bearing replacement",
      },
    ]),
  ];

  const manufacturingOrders = [
    createManufacturingOrder({
      docId: "mo-004", manufacturingOrderNumber: "MO-004",
      itemId: "pipe-assembly", quantity: 75, dueDate: "2025-01-10T17:00:00.000Z",
    }),
  ];

  // Jan 6 = Monday, Jan 7 = Tuesday
  const workOrders = [
    createWorkOrder({
      docId: "wo-h", workOrderNumber: "WO-H", workCenterId: "wc-line1",
      startDate: "2025-01-06T08:00:00.000Z",   // Mon 8AM
      endDate: "2025-01-06T14:00:00.000Z",     // Mon 2PM (DELAYED from 12PM)
      durationMinutes: 360,                      // 6 hours
      dependsOnWorkOrderIds: [],
    }),
    createWorkOrder({
      docId: "wo-i", workOrderNumber: "WO-I", workCenterId: "wc-line1",
      startDate: "2025-01-06T14:00:00.000Z",   // Mon 2PM (after WO-H on same center)
      endDate: "2025-01-06T16:00:00.000Z",     // Mon 4PM
      durationMinutes: 120,
      dependsOnWorkOrderIds: [],
    }),
    createWorkOrder({
      docId: "wo-j", workOrderNumber: "WO-J", workCenterId: "wc-line2",
      startDate: "2025-01-07T08:00:00.000Z",   // Tue 8AM (old schedule)
      endDate: "2025-01-07T14:00:00.000Z",
      durationMinutes: 360,                      // 6h - will hit maintenance window
      dependsOnWorkOrderIds: ["wo-h", "wo-i"],  // Both must finish
    }),
    createWorkOrder({
      docId: "wo-k", workOrderNumber: "WO-K", workCenterId: "wc-line2",
      startDate: "2025-01-07T14:00:00.000Z",
      endDate: "2025-01-07T16:00:00.000Z",
      durationMinutes: 120,
      dependsOnWorkOrderIds: ["wo-j"],
    }),
  ];

  const result = new ReflowService().reflow({ workOrders, workCenters, manufacturingOrders });
  printReflowResult(result, "Complex Multi-Constraint");
  printValidation(validateSchedule(result.updatedWorkOrders, workCenters));
}

runComplexMultiConstraint();
