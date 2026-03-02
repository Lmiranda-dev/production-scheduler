import { runDelayCascade } from "./delay-cascade";
import { runMaintenanceConflict } from "./maintenance-conflict";
import { runShiftSpanning } from "./shift-spanning";
import { runComplexMultiConstraint } from "./complex-multi-constraint";

console.log("Production Schedule Reflow - All Scenarios");
console.log("==========================================\n");

const scenarios = [
  { name: "Delay Cascade", fn: runDelayCascade },
  { name: "Maintenance Conflict", fn: runMaintenanceConflict },
  { name: "Shift Spanning", fn: runShiftSpanning },
  { name: "Complex Multi-Constraint", fn: runComplexMultiConstraint },
];

for (const s of scenarios) {
  try {
    s.fn();
  } catch (e: any) {
    console.error("Scenario (" + s.name + ") failed: " + e.message);
  }
}

console.log("\n\nAll scenarios complete.");
