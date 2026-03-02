// ============================================================================
// Core Document Types
// ============================================================================

export interface Document<T extends string, D> {
  docId: string;
  docType: T;
  data: D;
}

// ============================================================================
// Work Order
// ============================================================================

export interface WorkOrderData {
  workOrderNumber: string;
  manufacturingOrderId: string;
  workCenterId: string;
  startDate: string;                  // ISO 8601 UTC
  endDate: string;                    // ISO 8601 UTC
  durationMinutes: number;            // Total working time required
  isMaintenance: boolean;             // Cannot be rescheduled if true
  dependsOnWorkOrderIds: string[];    // All must complete before this starts
  setupTimeMinutes?: number;          // Optional setup time before production
}

export type WorkOrder = Document<"workOrder", WorkOrderData>;

// ============================================================================
// Work Center
// ============================================================================

export interface Shift {
  dayOfWeek: number;    // 0-6, Sunday = 0
  startHour: number;    // 0-23
  endHour: number;      // 0-23
}

export interface MaintenanceWindow {
  startDate: string;    // ISO 8601 UTC
  endDate: string;      // ISO 8601 UTC
  reason?: string;
}

export interface WorkCenterData {
  name: string;
  shifts: Shift[];
  maintenanceWindows: MaintenanceWindow[];
}

export type WorkCenter = Document<"workCenter", WorkCenterData>;

// ============================================================================
// Manufacturing Order
// ============================================================================

export interface ManufacturingOrderData {
  manufacturingOrderNumber: string;
  itemId: string;
  quantity: number;
  dueDate: string;
}

export type ManufacturingOrder = Document<"manufacturingOrder", ManufacturingOrderData>;

// ============================================================================
// Reflow Input / Output
// ============================================================================

export interface ReflowInput {
  workOrders: WorkOrder[];
  workCenters: WorkCenter[];
  manufacturingOrders: ManufacturingOrder[];
}

export interface ReflowChange {
  workOrderId: string;
  workOrderNumber: string;
  field: "startDate" | "endDate";
  oldValue: string;
  newValue: string;
  deltaMinutes: number;
  reason: string;
}

export interface ReflowResult {
  updatedWorkOrders: WorkOrder[];
  changes: ReflowChange[];
  explanation: string;
  metrics?: ReflowMetrics;
}

// ============================================================================
// Metrics & Validation
// ============================================================================

export interface ReflowMetrics {
  totalDelayMinutes: number;
  workOrdersAffected: number;
  workOrdersUnchanged: number;
  utilizationByWorkCenter: Record<string, number>;
  idleTimeByWorkCenter: Record<string, number>;
}

export interface DAGNode {
  workOrderId: string;
  dependsOn: string[];
  dependedBy: string[];
}

export interface DAGResult {
  sortedOrder: string[];
  hasCycle: boolean;
  cycleDetails?: string[];
}

export interface ConstraintViolation {
  type: "overlap" | "dependency" | "shift" | "maintenance" | "cycle";
  workOrderId: string;
  conflictsWith?: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  violations: ConstraintViolation[];
}
