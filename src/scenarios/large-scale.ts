import { ReflowService } from "../reflow/reflow.service";
import { validateSchedule } from "../reflow/constraint-checker";
import {
  generateData,
  GeneratorConfig,
  PRESET_SMALL,
  PRESET_MEDIUM,
  PRESET_LARGE,
  PRESET_STRESS,
} from "../data/generator";
import { printHeader, printSubHeader, printValidation } from "../utils/display";

// ============================================================================
// Large-Scale Scenario Runner
// ============================================================================
// Generates and reflows schedules at configurable scale.
// Usage:
//   npm run scenario:scale              (default: 500 orders)
//   npm run scenario:scale -- --small   (100 orders)
//   npm run scenario:scale -- --medium  (500 orders)
//   npm run scenario:scale -- --large   (1000 orders)
//   npm run scenario:scale -- --stress  (2000 orders)
//   npm run scenario:scale -- --count 1500  (custom count)
// ============================================================================

function getConfig(): GeneratorConfig {
  const args = process.argv.slice(2);

  if (args.includes("--small")) return PRESET_SMALL;
  if (args.includes("--large")) return PRESET_LARGE;
  if (args.includes("--stress")) return PRESET_STRESS;

  // Custom count
  const countIdx = args.indexOf("--count");
  if (countIdx !== -1 && args[countIdx + 1]) {
    const count = parseInt(args[countIdx + 1], 10);
    return {
      ...PRESET_MEDIUM,
      workOrderCount: count,
      workCenterCount: Math.max(5, Math.ceil(count / 50)),
      manufacturingOrderCount: Math.max(10, Math.ceil(count / 6)),
    };
  }

  // Default: medium
  return PRESET_MEDIUM;
}

export function runLargeScale(): void {
  const config = getConfig();

  printHeader(
    `LARGE-SCALE SCENARIO: ${config.workOrderCount} Work Orders`
  );

  // -----------------------------------------------------------------------
  // Generate data
  // -----------------------------------------------------------------------
  console.log("\n⏳ Generating data...");
  const genStart = Date.now();
  const { workOrders, workCenters, manufacturingOrders, stats } = generateData(config);
  const genTime = Date.now() - genStart;

  printSubHeader("Generated Data Statistics");
  console.log("  Work Orders:          " + stats.totalWorkOrders);
  console.log("  Work Centers:         " + stats.totalWorkCenters);
  console.log("  Manufacturing Orders: " + stats.totalManufacturingOrders);
  console.log("  Dependencies:         " + stats.totalDependencies);
  console.log("  Maintenance Windows:  " + stats.totalMaintenanceWindows);
  console.log("  Disrupted Orders:     " + stats.disruptedOrders);
  console.log("  Maintenance Orders:   " + stats.maintenanceOrders);
  console.log("  Generation Time:      " + genTime + "ms");

  // Show work center breakdown
  printSubHeader("Work Centers");
  for (const wc of workCenters) {
    const woCount = workOrders.filter(wo => wo.data.workCenterId === wc.docId).length;
    const mwCount = wc.data.maintenanceWindows.length;
    console.log(
      "  " + wc.data.name + ": " +
      woCount + " orders, " + mwCount + " maintenance window(s)"
    );
  }

  // -----------------------------------------------------------------------
  // Run reflow
  // -----------------------------------------------------------------------
  printSubHeader("Running Reflow Algorithm");
  console.log("  ⏳ Processing " + workOrders.length + " work orders...");

  const reflowStart = Date.now();
  const service = new ReflowService();

  try {
    const result = service.reflow({ workOrders, workCenters, manufacturingOrders });
    const reflowTime = Date.now() - reflowStart;

    // -----------------------------------------------------------------------
    // Results summary
    // -----------------------------------------------------------------------
    printSubHeader("Reflow Results");
    console.log("  Reflow Time:          " + reflowTime + "ms");
    console.log("  Throughput:           " + Math.round(workOrders.length / (reflowTime / 1000)) + " orders/sec");
    console.log("  Total Changes:        " + result.changes.length);
    console.log();

    if (result.metrics) {
      console.log("  Total Delay:          " + result.metrics.totalDelayMinutes + " min");
      console.log("  Orders Affected:      " + result.metrics.workOrdersAffected);
      console.log("  Orders Unchanged:     " + result.metrics.workOrdersUnchanged);

      if (Object.keys(result.metrics.utilizationByWorkCenter).length > 0) {
        console.log("  Utilization:");
        for (const [name, util] of Object.entries(result.metrics.utilizationByWorkCenter)) {
          const filled = Math.min(20, Math.round(util * 20));
          const empty = Math.max(0, 20 - filled);
          const bar = "█".repeat(filled) + "░".repeat(empty);
          console.log("    " + name.substring(0, 30).padEnd(32) + " " + bar + " " + (util * 100).toFixed(1) + "%");
        }
      }
    }

    // -----------------------------------------------------------------------
    // Sample of changes (first 10)
    // -----------------------------------------------------------------------
    if (result.changes.length > 0) {
      printSubHeader("Sample Changes (first 10 of " + result.changes.length + ")");
      const sample = result.changes.slice(0, 10);
      for (const c of sample) {
        const dir = c.deltaMinutes > 0 ? "+" : "";
        console.log(
          "  [" + c.workOrderNumber + "] " + c.field + ": " +
          dir + c.deltaMinutes + " min"
        );
      }
      if (result.changes.length > 10) {
        console.log("  ... and " + (result.changes.length - 10) + " more changes");
      }
    }

    // -----------------------------------------------------------------------
    // Validate
    // -----------------------------------------------------------------------
    console.log("\n  ⏳ Validating schedule...");
    const valStart = Date.now();
    const validation = validateSchedule(result.updatedWorkOrders, workCenters);
    const valTime = Date.now() - valStart;

    printValidation(validation);
    console.log("  Validation Time:      " + valTime + "ms");

    // -----------------------------------------------------------------------
    // Performance summary
    // -----------------------------------------------------------------------
    printSubHeader("Performance Summary");
    const totalTime = genTime + reflowTime + valTime;
    console.log("  Data Generation:  " + genTime + "ms");
    console.log("  Reflow Algorithm: " + reflowTime + "ms");
    console.log("  Validation:       " + valTime + "ms");
    console.log("  Total:            " + totalTime + "ms");
    console.log("  Scale:            " + config.workOrderCount + " work orders / " + config.workCenterCount + " work centers");

  } catch (e: any) {
    const reflowTime = Date.now() - reflowStart;
    console.error("\n  ❌ Reflow failed after " + reflowTime + "ms: " + e.message);
  }
}

runLargeScale();
