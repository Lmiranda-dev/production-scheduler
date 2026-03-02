import { ReflowService } from "./reflow/reflow.service";
import { validateSchedule } from "./reflow/constraint-checker";
import { printReflowResult, printValidation, printHeader } from "./utils/display";
import { createExtrusionLine1, createWorkOrder, createManufacturingOrder } from "./data/sample-data";

printHeader("Production Schedule Reflow System");
console.log("  Built for Naologic Technical Assessment\n");
console.log("  Commands:");
console.log("    npm start                  Quick demo");
console.log("    npm run scenario:all       All 4 scenarios");
console.log("    npm run scenario:delay     Delay cascade");
console.log("    npm run scenario:maintenance  Maintenance conflict");
console.log("    npm run scenario:shift     Shift spanning");
console.log("    npm run scenario:complex   Multi-constraint");
console.log("    npm run test               Run test suite\n");

// Quick demo
const service = new ReflowService();
const wc = [createExtrusionLine1()];
const mo = [createManufacturingOrder({
  docId: "mo-demo", manufacturingOrderNumber: "MO-DEMO",
  itemId: "pipe-demo", quantity: 10, dueDate: "2025-01-10T17:00:00.000Z",
})];
const wo = [
  createWorkOrder({ docId: "wo-1", workOrderNumber: "WO-DEMO-1", workCenterId: "wc-line1",
    startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T10:00:00.000Z", durationMinutes: 120 }),
  createWorkOrder({ docId: "wo-2", workOrderNumber: "WO-DEMO-2", workCenterId: "wc-line1",
    startDate: "2025-01-06T10:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
    durationMinutes: 120, dependsOnWorkOrderIds: ["wo-1"] }),
];

try {
  const result = service.reflow({ workOrders: wo, workCenters: wc, manufacturingOrders: mo });
  printReflowResult(result, "Quick Demo");
  printValidation(validateSchedule(result.updatedWorkOrders, wc));
} catch (e: any) {
  console.error("Error: " + e.message);
}
