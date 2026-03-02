import { WorkOrder, WorkCenter, ManufacturingOrder } from "../reflow/types";

// ============================================================================
// Shared Sample Data Factories
// ============================================================================

/** Extrusion Line 1: Mon-Fri, 8AM-5PM UTC */
export function createExtrusionLine1(
  maintenanceWindows: WorkCenter["data"]["maintenanceWindows"] = []
): WorkCenter {
  return {
    docId: "wc-line1",
    docType: "workCenter",
    data: {
      name: "Extrusion Line 1",
      shifts: [
        { dayOfWeek: 1, startHour: 8, endHour: 17 },
        { dayOfWeek: 2, startHour: 8, endHour: 17 },
        { dayOfWeek: 3, startHour: 8, endHour: 17 },
        { dayOfWeek: 4, startHour: 8, endHour: 17 },
        { dayOfWeek: 5, startHour: 8, endHour: 17 },
      ],
      maintenanceWindows,
    },
  };
}

/** Extrusion Line 2: Mon-Fri, 8AM-5PM UTC */
export function createExtrusionLine2(
  maintenanceWindows: WorkCenter["data"]["maintenanceWindows"] = []
): WorkCenter {
  return {
    docId: "wc-line2",
    docType: "workCenter",
    data: {
      name: "Extrusion Line 2",
      shifts: [
        { dayOfWeek: 1, startHour: 8, endHour: 17 },
        { dayOfWeek: 2, startHour: 8, endHour: 17 },
        { dayOfWeek: 3, startHour: 8, endHour: 17 },
        { dayOfWeek: 4, startHour: 8, endHour: 17 },
        { dayOfWeek: 5, startHour: 8, endHour: 17 },
      ],
      maintenanceWindows,
    },
  };
}

/** Helper to create a work order with defaults. */
export function createWorkOrder(overrides: {
  docId: string;
  workOrderNumber: string;
  workCenterId: string;
  startDate: string;
  endDate: string;
  durationMinutes: number;
  manufacturingOrderId?: string;
  isMaintenance?: boolean;
  dependsOnWorkOrderIds?: string[];
  setupTimeMinutes?: number;
}): WorkOrder {
  return {
    docId: overrides.docId,
    docType: "workOrder",
    data: {
      workOrderNumber: overrides.workOrderNumber,
      manufacturingOrderId: overrides.manufacturingOrderId || "mo-default",
      workCenterId: overrides.workCenterId,
      startDate: overrides.startDate,
      endDate: overrides.endDate,
      durationMinutes: overrides.durationMinutes,
      isMaintenance: overrides.isMaintenance || false,
      dependsOnWorkOrderIds: overrides.dependsOnWorkOrderIds || [],
      setupTimeMinutes: overrides.setupTimeMinutes,
    },
  };
}

/** Helper to create a manufacturing order. */
export function createManufacturingOrder(overrides: {
  docId: string;
  manufacturingOrderNumber: string;
  itemId: string;
  quantity: number;
  dueDate: string;
}): ManufacturingOrder {
  return {
    docId: overrides.docId,
    docType: "manufacturingOrder",
    data: overrides,
  };
}
