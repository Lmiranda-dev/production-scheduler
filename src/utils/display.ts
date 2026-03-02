import { ReflowResult, ValidationResult } from "../reflow/types";

const DIVIDER = "=".repeat(70);
const THIN = "-".repeat(70);

export function printHeader(title: string): void {
  console.log("\n" + DIVIDER);
  console.log("  " + title);
  console.log(DIVIDER);
}

export function printSubHeader(title: string): void {
  console.log("\n" + THIN);
  console.log("  " + title);
  console.log(THIN);
}

export function printReflowResult(result: ReflowResult, scenarioName: string): void {
  printHeader("SCENARIO: " + scenarioName);

  printSubHeader("Explanation");
  console.log(result.explanation);

  printSubHeader("Changes");
  if (result.changes.length === 0) {
    console.log("  No changes made.");
  } else {
    for (const c of result.changes) {
      console.log("  [" + c.workOrderNumber + "] " + c.field + ":");
      console.log("    Old: " + c.oldValue);
      console.log("    New: " + c.newValue);
      console.log("    Delta: " + (c.deltaMinutes > 0 ? "+" : "") + c.deltaMinutes + " min");
      console.log("    Reason: " + c.reason);
      console.log();
    }
  }

  printSubHeader("Updated Schedule");
  for (const wo of result.updatedWorkOrders) {
    const tag = wo.data.isMaintenance ? " [MAINTENANCE]" : "";
    console.log(
      "  " + wo.data.workOrderNumber + tag + ": " +
      wo.data.startDate + " -> " + wo.data.endDate +
      " (" + wo.data.durationMinutes + " min) " +
      "[" + wo.data.workCenterId + "]"
    );
    if (wo.data.dependsOnWorkOrderIds.length > 0) {
      console.log("    depends on: " + wo.data.dependsOnWorkOrderIds.join(", "));
    }
  }

  if (result.metrics) {
    printSubHeader("Metrics");
    console.log("  Total delay: " + result.metrics.totalDelayMinutes + " min");
    console.log("  Orders affected: " + result.metrics.workOrdersAffected);
    console.log("  Orders unchanged: " + result.metrics.workOrdersUnchanged);
    if (Object.keys(result.metrics.utilizationByWorkCenter).length > 0) {
      console.log("  Utilization:");
      for (const [name, util] of Object.entries(result.metrics.utilizationByWorkCenter)) {
        console.log("    " + name + ": " + (util * 100).toFixed(1) + "%");
      }
    }
  }
}

export function printValidation(validation: ValidationResult): void {
  printSubHeader("Validation");
  if (validation.isValid) {
    console.log("  ✅ Schedule is VALID. All constraints satisfied.");
  } else {
    console.log("  ❌ " + validation.violations.length + " violation(s):");
    for (const v of validation.violations) {
      console.log("    [" + v.type + "] " + v.message);
    }
  }
}
