import { WorkOrder, WorkCenter, ManufacturingOrder, Shift } from "../reflow/types";

// ============================================================================
// Large-Scale Data Generator
// ============================================================================
// Generates realistic manufacturing data at configurable scale.
// Can produce hundreds to thousands of work orders across multiple
// work centers with dependencies, maintenance windows, and varied shifts.
// ============================================================================

export interface GeneratorConfig {
  /** Number of work orders to generate */
  workOrderCount: number;
  /** Number of work centers (extrusion lines) */
  workCenterCount: number;
  /** Number of manufacturing orders (work orders are grouped into these) */
  manufacturingOrderCount: number;
  /** Probability that a work order depends on another (0-1) */
  dependencyProbability: number;
  /** Max number of parent dependencies per work order */
  maxDependencies: number;
  /** Probability that a work center has a maintenance window (0-1) */
  maintenanceProbability: number;
  /** Min work order duration in minutes */
  minDurationMinutes: number;
  /** Max work order duration in minutes */
  maxDurationMinutes: number;
  /** Percentage of work orders that are "delayed" (need reflow) */
  disruptionPercentage: number;
  /** Start date for the schedule (ISO string) */
  scheduleStartDate: string;
  /** How many working days the schedule spans */
  scheduleDays: number;
  /** Seed for reproducible random numbers (optional) */
  seed?: number;
}

// Simple seeded random number generator (mulberry32)
function createRNG(seed: number) {
  let state = seed;
  return function (): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Default configuration for ~100 work orders */
export const PRESET_SMALL: GeneratorConfig = {
  workOrderCount: 100,
  workCenterCount: 5,
  manufacturingOrderCount: 20,
  dependencyProbability: 0.3,
  maxDependencies: 2,
  maintenanceProbability: 0.4,
  minDurationMinutes: 30,
  maxDurationMinutes: 480,
  disruptionPercentage: 0.15,
  scheduleStartDate: "2025-01-06T08:00:00.000Z",
  scheduleDays: 10,
  seed: 42,
};

/** Medium configuration for ~500 work orders */
export const PRESET_MEDIUM: GeneratorConfig = {
  workOrderCount: 500,
  workCenterCount: 10,
  manufacturingOrderCount: 80,
  dependencyProbability: 0.25,
  maxDependencies: 3,
  maintenanceProbability: 0.5,
  minDurationMinutes: 30,
  maxDurationMinutes: 600,
  disruptionPercentage: 0.2,
  scheduleStartDate: "2025-01-06T08:00:00.000Z",
  scheduleDays: 20,
  seed: 123,
};

/** Large configuration for ~1000 work orders */
export const PRESET_LARGE: GeneratorConfig = {
  workOrderCount: 1000,
  workCenterCount: 15,
  manufacturingOrderCount: 150,
  dependencyProbability: 0.2,
  maxDependencies: 3,
  maintenanceProbability: 0.6,
  minDurationMinutes: 15,
  maxDurationMinutes: 720,
  disruptionPercentage: 0.2,
  scheduleStartDate: "2025-01-06T08:00:00.000Z",
  scheduleDays: 30,
  seed: 456,
};

/** Stress test configuration for ~2000+ work orders */
export const PRESET_STRESS: GeneratorConfig = {
  workOrderCount: 2000,
  workCenterCount: 20,
  manufacturingOrderCount: 300,
  dependencyProbability: 0.15,
  maxDependencies: 4,
  maintenanceProbability: 0.5,
  minDurationMinutes: 15,
  maxDurationMinutes: 540,
  disruptionPercentage: 0.25,
  scheduleStartDate: "2025-01-06T08:00:00.000Z",
  scheduleDays: 60,
  seed: 789,
};

// ============================================================================
// Shift Templates
// ============================================================================

const SHIFT_TEMPLATES: { name: string; shifts: Shift[] }[] = [
  {
    name: "Standard (Mon-Fri 8AM-5PM)",
    shifts: [
      { dayOfWeek: 1, startHour: 8, endHour: 17 },
      { dayOfWeek: 2, startHour: 8, endHour: 17 },
      { dayOfWeek: 3, startHour: 8, endHour: 17 },
      { dayOfWeek: 4, startHour: 8, endHour: 17 },
      { dayOfWeek: 5, startHour: 8, endHour: 17 },
    ],
  },
  {
    name: "Extended (Mon-Fri 6AM-10PM)",
    shifts: [
      { dayOfWeek: 1, startHour: 6, endHour: 22 },
      { dayOfWeek: 2, startHour: 6, endHour: 22 },
      { dayOfWeek: 3, startHour: 6, endHour: 22 },
      { dayOfWeek: 4, startHour: 6, endHour: 22 },
      { dayOfWeek: 5, startHour: 6, endHour: 22 },
    ],
  },
  {
    name: "Full Week (Mon-Sat 7AM-7PM)",
    shifts: [
      { dayOfWeek: 1, startHour: 7, endHour: 19 },
      { dayOfWeek: 2, startHour: 7, endHour: 19 },
      { dayOfWeek: 3, startHour: 7, endHour: 19 },
      { dayOfWeek: 4, startHour: 7, endHour: 19 },
      { dayOfWeek: 5, startHour: 7, endHour: 19 },
      { dayOfWeek: 6, startHour: 7, endHour: 19 },
    ],
  },
  {
    name: "Early Shift (Mon-Fri 5AM-1PM)",
    shifts: [
      { dayOfWeek: 1, startHour: 5, endHour: 13 },
      { dayOfWeek: 2, startHour: 5, endHour: 13 },
      { dayOfWeek: 3, startHour: 5, endHour: 13 },
      { dayOfWeek: 4, startHour: 5, endHour: 13 },
      { dayOfWeek: 5, startHour: 5, endHour: 13 },
    ],
  },
  {
    name: "Late Shift (Mon-Fri 2PM-10PM)",
    shifts: [
      { dayOfWeek: 1, startHour: 14, endHour: 22 },
      { dayOfWeek: 2, startHour: 14, endHour: 22 },
      { dayOfWeek: 3, startHour: 14, endHour: 22 },
      { dayOfWeek: 4, startHour: 14, endHour: 22 },
      { dayOfWeek: 5, startHour: 14, endHour: 22 },
    ],
  },
];

const PRODUCT_NAMES = [
  "pipe-25mm", "pipe-50mm", "pipe-75mm", "pipe-100mm", "pipe-150mm",
  "pipe-200mm", "pipe-elbow-90", "pipe-elbow-45", "pipe-tee", "pipe-reducer",
  "pipe-cap", "pipe-flange", "pipe-coupling", "pipe-valve", "pipe-gasket",
  "conduit-20mm", "conduit-25mm", "conduit-32mm", "tubing-flexible",
  "tubing-rigid", "fitting-compression", "fitting-push", "fitting-threaded",
];

const MAINTENANCE_REASONS = [
  "Scheduled die cleaning",
  "Bearing replacement",
  "Calibration check",
  "Cooling system flush",
  "Extruder screw inspection",
  "Hydraulic system service",
  "Electrical panel maintenance",
  "Safety inspection",
  "Tool changeover",
  "Preventive lubrication",
  "Filter replacement",
  "Temperature sensor calibration",
  "Emergency repair - motor",
  "Emergency repair - gearbox",
  "Unplanned downtime - overheating",
];

// ============================================================================
// Generator
// ============================================================================

export function generateData(config: GeneratorConfig): {
  workOrders: WorkOrder[];
  workCenters: WorkCenter[];
  manufacturingOrders: ManufacturingOrder[];
  stats: {
    totalWorkOrders: number;
    totalWorkCenters: number;
    totalManufacturingOrders: number;
    totalDependencies: number;
    totalMaintenanceWindows: number;
    disruptedOrders: number;
    maintenanceOrders: number;
  };
} {
  const rand = createRNG(config.seed || Date.now());

  // Helper functions
  const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const randChoice = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const addMin = (iso: string, min: number) =>
    new Date(new Date(iso).getTime() + min * 60000).toISOString();
  const addDaysToISO = (iso: string, days: number) => {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString();
  };

  // -----------------------------------------------------------------------
  // Generate Work Centers
  // -----------------------------------------------------------------------
  const workCenters: WorkCenter[] = [];

  for (let i = 0; i < config.workCenterCount; i++) {
    const template = SHIFT_TEMPLATES[i % SHIFT_TEMPLATES.length];
    const maintenanceWindows: WorkCenter["data"]["maintenanceWindows"] = [];

    // Add maintenance windows
    if (rand() < config.maintenanceProbability) {
      const numWindows = randInt(1, Math.ceil(config.scheduleDays / 7));
      for (let m = 0; m < numWindows; m++) {
        const dayOffset = randInt(1, config.scheduleDays - 1);
        const startHour = randInt(8, 14);
        const durationHours = randInt(1, 4);
        const mwStart = addDaysToISO(config.scheduleStartDate, dayOffset);
        const mwStartDate = new Date(mwStart);
        mwStartDate.setUTCHours(startHour, 0, 0, 0);

        maintenanceWindows.push({
          startDate: mwStartDate.toISOString(),
          endDate: addMin(mwStartDate.toISOString(), durationHours * 60),
          reason: randChoice(MAINTENANCE_REASONS),
        });
      }
    }

    workCenters.push({
      docId: `wc-line${i + 1}`,
      docType: "workCenter",
      data: {
        name: `Extrusion Line ${i + 1} (${template.name})`,
        shifts: template.shifts,
        maintenanceWindows,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Generate Manufacturing Orders
  // -----------------------------------------------------------------------
  const manufacturingOrders: ManufacturingOrder[] = [];

  for (let i = 0; i < config.manufacturingOrderCount; i++) {
    const dueDayOffset = randInt(
      Math.ceil(config.scheduleDays / 2),
      config.scheduleDays + 5
    );
    manufacturingOrders.push({
      docId: `mo-${String(i + 1).padStart(4, "0")}`,
      docType: "manufacturingOrder",
      data: {
        manufacturingOrderNumber: `MO-${String(i + 1).padStart(4, "0")}`,
        itemId: randChoice(PRODUCT_NAMES),
        quantity: randInt(10, 500),
        dueDate: addDaysToISO(config.scheduleStartDate, dueDayOffset),
      },
    });
  }

  // -----------------------------------------------------------------------
  // Generate Work Orders
  // -----------------------------------------------------------------------
  const workOrders: WorkOrder[] = [];
  let totalDependencies = 0;
  let disruptedCount = 0;
  let maintenanceOrderCount = 0;

  // Track per-work-center scheduling cursor (to avoid generating overlapping orders)
  const centerCursors = new Map<string, string>();
  for (const wc of workCenters) {
    centerCursors.set(wc.docId, config.scheduleStartDate);
  }

  for (let i = 0; i < config.workOrderCount; i++) {
    const woId = `wo-${String(i + 1).padStart(5, "0")}`;
    const woNumber = `WO-${String(i + 1).padStart(5, "0")}`;
    const center = workCenters[i % config.workCenterCount];
    const moId = manufacturingOrders[i % config.manufacturingOrderCount].docId;

    // Duration
    const duration = randInt(config.minDurationMinutes, config.maxDurationMinutes);

    // Maintenance work orders are modeled through work center maintenance windows,
    // not as individual flagged orders in this generator.
    const isMaintenance = false;

    // Calculate start date from the work center cursor
    let cursor = centerCursors.get(center.docId)!;

    // Add some gap between orders (0-120 min)
    const gap = randInt(0, 120);
    const startDate = addMin(cursor, gap);

    // Simple end date estimate (not shift-aware — the reflow will fix it)
    const endDate = addMin(startDate, duration);

    // Update cursor
    centerCursors.set(center.docId, endDate);

    // Dependencies: can only depend on EARLIER orders to avoid cycles
    const deps: string[] = [];
    if (i > 0 && rand() < config.dependencyProbability) {
      const numDeps = randInt(1, Math.min(config.maxDependencies, i));
      const candidates = new Set<number>();

      for (let attempt = 0; attempt < numDeps * 3; attempt++) {
        if (candidates.size >= numDeps) break;
        // Pick from recent orders (within last 50) for realistic deps
        const lookback = Math.min(50, i);
        const depIndex = i - randInt(1, lookback);
        if (depIndex >= 0) candidates.add(depIndex);
      }

      for (const depIdx of candidates) {
        deps.push(`wo-${String(depIdx + 1).padStart(5, "0")}`);
        totalDependencies++;
      }
    }

    // Disruption: some orders have inflated durations or shifted starts
    let actualDuration = duration;
    let actualStart = startDate;
    let actualEnd = endDate;

    if (!isMaintenance && rand() < config.disruptionPercentage) {
      disruptedCount++;
      const disruptionType = rand();
      if (disruptionType < 0.5) {
        // Duration overrun (20-100% longer)
        const overrun = Math.ceil(duration * (0.2 + rand() * 0.8));
        actualDuration = duration + overrun;
        actualEnd = addMin(actualStart, actualDuration);
      } else {
        // Late start (30-240 min late)
        const lateBy = randInt(30, 240);
        actualStart = addMin(startDate, lateBy);
        actualEnd = addMin(actualStart, duration);
      }
    }

    // Setup time (bonus feature, ~20% of orders)
    const setupTime = rand() < 0.2 ? randInt(10, 60) : undefined;

    workOrders.push({
      docId: woId,
      docType: "workOrder",
      data: {
        workOrderNumber: woNumber,
        manufacturingOrderId: moId,
        workCenterId: center.docId,
        startDate: actualStart,
        endDate: actualEnd,
        durationMinutes: actualDuration,
        isMaintenance,
        dependsOnWorkOrderIds: deps,
        setupTimeMinutes: setupTime,
      },
    });
  }

  return {
    workOrders,
    workCenters,
    manufacturingOrders,
    stats: {
      totalWorkOrders: workOrders.length,
      totalWorkCenters: workCenters.length,
      totalManufacturingOrders: manufacturingOrders.length,
      totalDependencies,
      totalMaintenanceWindows: workCenters.reduce(
        (sum, wc) => sum + wc.data.maintenanceWindows.length, 0
      ),
      disruptedOrders: disruptedCount,
      maintenanceOrders: maintenanceOrderCount,
    },
  };
}
