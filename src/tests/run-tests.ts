import { describe, it, expect, runTests } from "./test-runner";
import {
  parseDate, toISO, addMinutes, diffMinutes,
  isDuringShift, isDuringMaintenance, rangesOverlap,
  getNextShiftStart, snapToWorkingTime,
  calculateEndDateWithShifts, getWorkingMinutesBetween,
} from "../utils/date-utils";
import { topologicalSort, findMissingDependencies } from "../reflow/dag";
import { ReflowService } from "../reflow/reflow.service";
import { validateSchedule } from "../reflow/constraint-checker";
import { createWorkOrder, createExtrusionLine1, createExtrusionLine2, createManufacturingOrder } from "../data/sample-data";
import { Shift } from "../reflow/types";

// Standard Mon-Fri 8AM-5PM shifts
const STD_SHIFTS: Shift[] = [
  { dayOfWeek: 1, startHour: 8, endHour: 17 },
  { dayOfWeek: 2, startHour: 8, endHour: 17 },
  { dayOfWeek: 3, startHour: 8, endHour: 17 },
  { dayOfWeek: 4, startHour: 8, endHour: 17 },
  { dayOfWeek: 5, startHour: 8, endHour: 17 },
];

// ============================================================================
// Date Utils Tests
// ============================================================================

describe("parseDate", () => {
  it("should parse valid ISO string", () => {
    const d = parseDate("2025-01-06T08:00:00.000Z");
    expect(d.getTime()).toBe(new Date("2025-01-06T08:00:00.000Z").getTime());
  });
  it("should throw on invalid date", () => {
    expect(() => parseDate("not-a-date")).toThrow("Invalid date");
  });
});

describe("isDuringShift", () => {
  it("true during shift", () => {
    expect(isDuringShift(parseDate("2025-01-06T09:00:00.000Z"), STD_SHIFTS)).toBeTruthy();
  });
  it("false before shift", () => {
    expect(isDuringShift(parseDate("2025-01-06T06:00:00.000Z"), STD_SHIFTS)).toBeFalsy();
  });
  it("false on weekend", () => {
    expect(isDuringShift(parseDate("2025-01-04T09:00:00.000Z"), STD_SHIFTS)).toBeFalsy();
  });
  it("false at shift end (exclusive)", () => {
    expect(isDuringShift(parseDate("2025-01-06T17:00:00.000Z"), STD_SHIFTS)).toBeFalsy();
  });
});

describe("isDuringMaintenance", () => {
  const mw = [{ startDate: "2025-01-07T10:00:00.000Z", endDate: "2025-01-07T12:00:00.000Z" }];
  it("true during maintenance", () => {
    expect(isDuringMaintenance(parseDate("2025-01-07T11:00:00.000Z"), mw)).toBeTruthy();
  });
  it("false outside maintenance", () => {
    expect(isDuringMaintenance(parseDate("2025-01-07T09:00:00.000Z"), mw)).toBeFalsy();
  });
});

describe("rangesOverlap", () => {
  it("detects overlap", () => {
    expect(rangesOverlap(
      parseDate("2025-01-06T08:00:00.000Z"), parseDate("2025-01-06T12:00:00.000Z"),
      parseDate("2025-01-06T10:00:00.000Z"), parseDate("2025-01-06T14:00:00.000Z"),
    )).toBeTruthy();
  });
  it("adjacent ranges do not overlap", () => {
    expect(rangesOverlap(
      parseDate("2025-01-06T08:00:00.000Z"), parseDate("2025-01-06T10:00:00.000Z"),
      parseDate("2025-01-06T10:00:00.000Z"), parseDate("2025-01-06T12:00:00.000Z"),
    )).toBeFalsy();
  });
});

describe("getNextShiftStart", () => {
  it("returns same time if mid-shift", () => {
    const t = parseDate("2025-01-06T10:00:00.000Z");
    expect(getNextShiftStart(t, STD_SHIFTS).getTime()).toBe(t.getTime());
  });
  it("returns next morning if after shift", () => {
    const result = getNextShiftStart(parseDate("2025-01-06T18:00:00.000Z"), STD_SHIFTS);
    expect(toISO(result)).toBe("2025-01-07T08:00:00.000Z");
  });
  it("skips weekends", () => {
    const result = getNextShiftStart(parseDate("2025-01-03T18:00:00.000Z"), STD_SHIFTS);
    expect(toISO(result)).toBe("2025-01-06T08:00:00.000Z");
  });
  it("skips past maintenance window", () => {
    const mw = [{ startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T10:00:00.000Z" }];
    const result = getNextShiftStart(parseDate("2025-01-06T08:00:00.000Z"), STD_SHIFTS, mw);
    expect(toISO(result)).toBe("2025-01-06T10:00:00.000Z");
  });
});

// ============================================================================
// Phase 2: calculateEndDateWithShifts Tests
// ============================================================================

describe("calculateEndDateWithShifts", () => {
  it("simple: fits within one shift", () => {
    // Mon 8AM + 120min = Mon 10AM
    const result = calculateEndDateWithShifts(
      parseDate("2025-01-06T08:00:00.000Z"), 120, STD_SHIFTS
    );
    expect(toISO(result)).toBe("2025-01-06T10:00:00.000Z");
  });

  it("spans overnight: pauses at shift end, resumes next morning", () => {
    // Mon 4PM + 120min: 60min Mon (4-5PM), pause, 60min Tue (8-9AM)
    const result = calculateEndDateWithShifts(
      parseDate("2025-01-06T16:00:00.000Z"), 120, STD_SHIFTS
    );
    expect(toISO(result)).toBe("2025-01-07T09:00:00.000Z");
  });

  it("spans full shift: 600min from Mon 8AM", () => {
    // 540min fits Mon (8AM-5PM), remaining 60min Tue (8AM-9AM)
    const result = calculateEndDateWithShifts(
      parseDate("2025-01-06T08:00:00.000Z"), 600, STD_SHIFTS
    );
    expect(toISO(result)).toBe("2025-01-07T09:00:00.000Z");
  });

  it("skips weekend", () => {
    // Fri 4PM + 120min: 60min Fri (4-5PM), skip Sat+Sun, 60min Mon (8-9AM)
    const result = calculateEndDateWithShifts(
      parseDate("2025-01-03T16:00:00.000Z"), 120, STD_SHIFTS
    );
    expect(toISO(result)).toBe("2025-01-06T09:00:00.000Z");
  });

  it("skips maintenance window", () => {
    // Tue 9AM + 120min with maintenance 10AM-12PM:
    // Work 60min (9-10AM), skip maintenance (10-12PM), work 60min (12-1PM)
    const mw = [{ startDate: "2025-01-07T10:00:00.000Z", endDate: "2025-01-07T12:00:00.000Z" }];
    const result = calculateEndDateWithShifts(
      parseDate("2025-01-07T09:00:00.000Z"), 120, STD_SHIFTS, mw
    );
    expect(toISO(result)).toBe("2025-01-07T13:00:00.000Z");
  });

  it("zero duration returns start date", () => {
    const start = parseDate("2025-01-06T10:00:00.000Z");
    const result = calculateEndDateWithShifts(start, 0, STD_SHIFTS);
    expect(result.getTime()).toBe(start.getTime());
  });

  it("exactly fills a shift", () => {
    // Mon 8AM + 540min = Mon 5PM (exactly one full shift)
    const result = calculateEndDateWithShifts(
      parseDate("2025-01-06T08:00:00.000Z"), 540, STD_SHIFTS
    );
    expect(toISO(result)).toBe("2025-01-06T17:00:00.000Z");
  });
});

describe("getWorkingMinutesBetween", () => {
  it("full shift day = 540 min", () => {
    const result = getWorkingMinutesBetween(
      parseDate("2025-01-06T08:00:00.000Z"),
      parseDate("2025-01-06T17:00:00.000Z"),
      STD_SHIFTS
    );
    expect(result).toBe(540);
  });
  it("partial shift", () => {
    const result = getWorkingMinutesBetween(
      parseDate("2025-01-06T10:00:00.000Z"),
      parseDate("2025-01-06T14:00:00.000Z"),
      STD_SHIFTS
    );
    expect(result).toBe(240);
  });
});

// ============================================================================
// DAG Tests
// ============================================================================

describe("topologicalSort", () => {
  it("sorts independent orders", () => {
    const orders = [
      createWorkOrder({ docId: "a", workOrderNumber: "A", workCenterId: "wc1",
        startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T10:00:00.000Z", durationMinutes: 120 }),
      createWorkOrder({ docId: "b", workOrderNumber: "B", workCenterId: "wc1",
        startDate: "2025-01-06T10:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z", durationMinutes: 120 }),
    ];
    const r = topologicalSort(orders);
    expect(r.hasCycle).toBeFalsy();
    expect(r.sortedOrder).toHaveLength(2);
  });

  it("respects dependency order", () => {
    const orders = [
      createWorkOrder({ docId: "b", workOrderNumber: "B", workCenterId: "wc1",
        startDate: "2025-01-06T10:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
        durationMinutes: 120, dependsOnWorkOrderIds: ["a"] }),
      createWorkOrder({ docId: "a", workOrderNumber: "A", workCenterId: "wc1",
        startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T10:00:00.000Z",
        durationMinutes: 120 }),
    ];
    const r = topologicalSort(orders);
    expect(r.hasCycle).toBeFalsy();
    expect(r.sortedOrder.indexOf("a")).toBeLessThan(r.sortedOrder.indexOf("b"));
  });

  it("detects cycles", () => {
    const orders = [
      createWorkOrder({ docId: "a", workOrderNumber: "A", workCenterId: "wc1",
        startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T10:00:00.000Z",
        durationMinutes: 120, dependsOnWorkOrderIds: ["b"] }),
      createWorkOrder({ docId: "b", workOrderNumber: "B", workCenterId: "wc1",
        startDate: "2025-01-06T10:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
        durationMinutes: 120, dependsOnWorkOrderIds: ["a"] }),
    ];
    expect(topologicalSort(orders).hasCycle).toBeTruthy();
  });
});

describe("findMissingDependencies", () => {
  it("finds missing references", () => {
    const orders = [
      createWorkOrder({ docId: "a", workOrderNumber: "A", workCenterId: "wc1",
        startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T10:00:00.000Z",
        durationMinutes: 120, dependsOnWorkOrderIds: ["nonexistent"] }),
    ];
    expect(findMissingDependencies(orders)).toContain("nonexistent");
  });
  it("returns empty for valid refs", () => {
    const orders = [
      createWorkOrder({ docId: "a", workOrderNumber: "A", workCenterId: "wc1",
        startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T10:00:00.000Z", durationMinutes: 120 }),
      createWorkOrder({ docId: "b", workOrderNumber: "B", workCenterId: "wc1",
        startDate: "2025-01-06T10:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
        durationMinutes: 120, dependsOnWorkOrderIds: ["a"] }),
    ];
    expect(findMissingDependencies(orders)).toHaveLength(0);
  });
});

// ============================================================================
// Reflow Service Integration Tests
// ============================================================================

describe("ReflowService - Delay Cascade", () => {
  it("pushes dependent orders forward when parent is delayed", () => {
    const service = new ReflowService();
    const result = service.reflow({
      workOrders: [
        createWorkOrder({ docId: "a", workOrderNumber: "WO-A", workCenterId: "wc-line1",
          startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
          durationMinutes: 240 }),
        createWorkOrder({ docId: "b", workOrderNumber: "WO-B", workCenterId: "wc-line1",
          startDate: "2025-01-06T10:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
          durationMinutes: 120, dependsOnWorkOrderIds: ["a"] }),
      ],
      workCenters: [createExtrusionLine1()],
      manufacturingOrders: [],
    });

    const woB = result.updatedWorkOrders.find(wo => wo.docId === "b")!;
    // WO-B should start at 12PM (after WO-A ends) not 10AM
    expect(woB.data.startDate).toBe("2025-01-06T12:00:00.000Z");
    expect(woB.data.endDate).toBe("2025-01-06T14:00:00.000Z");
  });
});

describe("ReflowService - Shift Spanning", () => {
  it("correctly spans work across shifts", () => {
    const service = new ReflowService();
    const result = service.reflow({
      workOrders: [
        createWorkOrder({ docId: "f", workOrderNumber: "WO-F", workCenterId: "wc-line1",
          startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T18:00:00.000Z",
          durationMinutes: 600 }),
      ],
      workCenters: [createExtrusionLine1()],
      manufacturingOrders: [],
    });

    const woF = result.updatedWorkOrders.find(wo => wo.docId === "f")!;
    // 600min: Mon 8-5PM (540min) + Tue 8-9AM (60min)
    expect(woF.data.startDate).toBe("2025-01-06T08:00:00.000Z");
    expect(woF.data.endDate).toBe("2025-01-07T09:00:00.000Z");
  });
});

describe("ReflowService - Maintenance Avoidance", () => {
  it("work correctly spans around maintenance window", () => {
    const service = new ReflowService();
    const mw = [{ startDate: "2025-01-07T10:00:00.000Z", endDate: "2025-01-07T12:00:00.000Z", reason: "cleaning" }];
    const result = service.reflow({
      workOrders: [
        createWorkOrder({ docId: "d", workOrderNumber: "WO-D", workCenterId: "wc-line1",
          startDate: "2025-01-07T09:00:00.000Z", endDate: "2025-01-07T11:00:00.000Z",
          durationMinutes: 120 }),
      ],
      workCenters: [createExtrusionLine1(mw)],
      manufacturingOrders: [],
    });

    const woD = result.updatedWorkOrders.find(wo => wo.docId === "d")!;
    // Start 9AM, work 60min (9-10), skip maint (10-12), work 60min (12-1PM)
    expect(woD.data.startDate).toBe("2025-01-07T09:00:00.000Z");
    expect(woD.data.endDate).toBe("2025-01-07T13:00:00.000Z");
  });
});

describe("ReflowService - Validation", () => {
  it("output schedule passes all constraint checks", () => {
    const service = new ReflowService();
    const wc = [createExtrusionLine1()];
    const result = service.reflow({
      workOrders: [
        createWorkOrder({ docId: "a", workOrderNumber: "A", workCenterId: "wc-line1",
          startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
          durationMinutes: 240 }),
        createWorkOrder({ docId: "b", workOrderNumber: "B", workCenterId: "wc-line1",
          startDate: "2025-01-06T10:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
          durationMinutes: 120, dependsOnWorkOrderIds: ["a"] }),
      ],
      workCenters: wc,
      manufacturingOrders: [],
    });

    const validation = validateSchedule(result.updatedWorkOrders, wc);
    expect(validation.isValid).toBeTruthy();
  });

  it("throws on circular dependency", () => {
    const service = new ReflowService();
    expect(() => service.reflow({
      workOrders: [
        createWorkOrder({ docId: "a", workOrderNumber: "A", workCenterId: "wc-line1",
          startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T10:00:00.000Z",
          durationMinutes: 120, dependsOnWorkOrderIds: ["b"] }),
        createWorkOrder({ docId: "b", workOrderNumber: "B", workCenterId: "wc-line1",
          startDate: "2025-01-06T10:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
          durationMinutes: 120, dependsOnWorkOrderIds: ["a"] }),
      ],
      workCenters: [createExtrusionLine1()],
      manufacturingOrders: [],
    })).toThrow("Circular dependency");
  });

  it("throws on missing dependency", () => {
    const service = new ReflowService();
    expect(() => service.reflow({
      workOrders: [
        createWorkOrder({ docId: "a", workOrderNumber: "A", workCenterId: "wc-line1",
          startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T10:00:00.000Z",
          durationMinutes: 120, dependsOnWorkOrderIds: ["ghost"] }),
      ],
      workCenters: [createExtrusionLine1()],
      manufacturingOrders: [],
    })).toThrow("Missing dependency");
  });
});

describe("ReflowService - Change Tracking", () => {
  it("records changes with reasons", () => {
    const service = new ReflowService();
    const result = service.reflow({
      workOrders: [
        createWorkOrder({ docId: "a", workOrderNumber: "WO-A", workCenterId: "wc-line1",
          startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
          durationMinutes: 240 }),
        createWorkOrder({ docId: "b", workOrderNumber: "WO-B", workCenterId: "wc-line1",
          startDate: "2025-01-06T10:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
          durationMinutes: 120, dependsOnWorkOrderIds: ["a"] }),
      ],
      workCenters: [createExtrusionLine1()],
      manufacturingOrders: [],
    });

    // WO-B should have changes recorded
    const bChanges = result.changes.filter(c => c.workOrderId === "b");
    expect(bChanges.length).toBeGreaterThan(0);
    // Should mention dependency in reason
    const hasDepReason = bChanges.some(c => c.reason.includes("Dependency") || c.reason.includes("WO-A"));
    expect(hasDepReason).toBeTruthy();
  });

  it("reports metrics", () => {
    const service = new ReflowService();
    const result = service.reflow({
      workOrders: [
        createWorkOrder({ docId: "a", workOrderNumber: "A", workCenterId: "wc-line1",
          startDate: "2025-01-06T08:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
          durationMinutes: 240 }),
        createWorkOrder({ docId: "b", workOrderNumber: "B", workCenterId: "wc-line1",
          startDate: "2025-01-06T10:00:00.000Z", endDate: "2025-01-06T12:00:00.000Z",
          durationMinutes: 120, dependsOnWorkOrderIds: ["a"] }),
      ],
      workCenters: [createExtrusionLine1()],
      manufacturingOrders: [],
    });

    expect(result.metrics).toBeTruthy();
    expect(result.metrics!.workOrdersAffected).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// Run
// ============================================================================
runTests();
