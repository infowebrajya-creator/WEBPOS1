export interface MenuItem {
  id: string;
  itemCode: string;
  category: string;
  name: string;
  description: string;
  price: number;
  isVeg: boolean;
  imageUrl: string;
  rating: number;
  ratingCount: number;
  isBestseller: boolean;
  isChefSpecial: boolean;
  spiciness: number;
  gstPercent?: number;
  hsnCode?: string;
  available?: boolean;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  customization?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string; // Lucide icon name or emoji
  description: string;
}

export interface Review {
  id: string;
  name: string;
  rating: number;
  date: string;
  comment: string;
  avatar: string;
}

export type OrderStatus =
  | "Draft"
  | "New Order"
  | "Confirmed"
  | "Accepted"
  | "Preparing"
  | "In Kitchen"
  | "Ready"
  | "Served"
  | "Packed"
  | "Out for Delivery"
  | "Out For Delivery"
  | "Delivered"
  | "Completed"
  | "Cancelled"
  | "Voided"
  | "Rejected";

export interface OrderLifecycleMetrics {
  confirmationTimeMinutes?: number;
  preparationTimeMinutes?: number;
  fulfillmentTimeMinutes?: number;
  totalTurnaroundMinutes?: number;
  isDelayed?: boolean;
}

export interface OrderTransitionContext {
  orderId: string;
  targetStatus: OrderStatus;
  user: string;
  role?: StaffRole;
  reason?: string;
  notes?: string;
  deliveryPartner?: string;
  trackingNumber?: string;
  forceOverride?: boolean;
  authorizedBy?: string;
  expectedVersion?: number;
}

export interface OrderTransitionValidation {
  valid: boolean;
  requiresManagerOverride?: boolean;
  requiredPermission?: PermissionKey;
  reason?: string;
  suggestedAction?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  customization?: string;
  addedAt?: string;
  addedBy?: string;
  kotNumber?: string;
  sessionNumber?: number;
}

export type OrderSource = "POS" | "QR" | "ONLINE" | "DINE_IN_QR";

export type KOTStatus = "New Order" | "Accepted" | "Preparing" | "Ready" | "Served" | "Cancelled";

export interface KOT {
  id: string; // Format: KOT-0001, etc.
  orderId: string;
  tableNumber: string;
  customerName: string;
  orderType: "dine-in" | "takeaway" | "delivery";
  status: KOTStatus;
  specialInstructions: string;
  createdAt: string;
  preparationTime: number; // Duration in minutes to prepare
  printed?: boolean; // Tracking thermal/POS ticket layout generation
  items: {
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    customization?: string;
  }[];
  isAddOn?: boolean;
}

export interface RestaurantTable {
  id: string;
  tableNumber: string;
  capacity: number;
  seatingArea: string;
  status: "Available" | "Occupied" | "Reserved" | "Service Required";
}

export type PaymentStatus = "Pending" | "Partial" | "Paid" | "Failed" | "Refunded" | "Voided";
export type PaymentMethod = "Cash" | "UPI" | "Card" | "Bank Transfer" | "Credit" | "Other";

export interface PaymentRecord {
  id: string; // e.g. PAY-123456
  tenantId?: string;
  orderId: string;
  shiftId?: string;
  amount: number;
  paymentMethod: PaymentMethod | string;
  status: PaymentStatus;
  transactionReference?: string;
  notes?: string;
  createdBy: string;
  createdAt: string; // ISO string
  splitGroupId?: string;
  splitIndex?: number;
  splitType?: "items" | "equal" | "amount" | "multi_pay" | "single";
  splitItemNames?: string[];
  customerName?: string;
}

export type ShiftStatus = "Open" | "Closing" | "Closed" | "Suspended" | "Force Closed";
export type CashAdjustmentType = "Cash In" | "Cash Out" | "Float Addition";

export interface CashAdjustment {
  id: string;
  tenantId?: string;
  shiftId: string;
  amount: number;
  type: CashAdjustmentType;
  reason: string;
  authorizedBy: string;
  createdBy: string;
  createdAt: string;
}

export interface Shift {
  id: string;
  tenantId?: string;
  cashierId: string;
  cashierName: string;
  status: ShiftStatus;
  openingCash: number;
  expectedCash: number;
  actualCash?: number;
  difference?: number;
  differenceType?: "Exact" | "Short" | "Excess";
  differenceReason?: string;
  openedAt: string;
  closedAt?: string;
  openedBy: string;
  closedBy?: string;
  openingNotes?: string;
  closingNotes?: string;
  businessDate: string;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
  forceClosedAt?: string;
  forceClosedBy?: string;
  forceCloseReason?: string;

  // Snapshot Metrics
  cashSales?: number;
  upiSales?: number;
  cardSales?: number;
  otherSales?: number;
  totalSales?: number;
  cashInAdjustments?: number;
  cashOutAdjustments?: number;
  voidedAmount?: number;
  refundedAmount?: number;
  orderCount?: number;
}

export interface ShiftFinancials {
  shiftId: string;
  openingCash: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  otherSales: number;
  totalSales: number;
  cashIn: number;
  cashOut: number;
  netAdjustments: number;
  voidedTotal: number;
  refundedTotal: number;
  expectedCash: number;
  actualCash?: number;
  difference?: number;
  differenceType?: "Exact" | "Short" | "Excess";
  orderCount: number;
  paymentCount: number;
  orders: any[];
  payments: PaymentRecord[];
  adjustments: CashAdjustment[];
}

export interface SplitItemAssignment {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  customization?: string;
}

export interface SplitSettlement {
  id: string;
  splitIndex: number;
  personName: string;
  splitType: "items" | "equal" | "amount" | "multi_pay";
  items?: SplitItemAssignment[];
  allocatedSubtotal: number;
  allocatedGst: number;
  allocatedDiscount: number;
  allocatedPackaging: number;
  allocatedTotal: number;
  paidAmount: number;
  paymentStatus: "Pending" | "Paid";
  paymentMethod?: string;
  paymentRecordId?: string;
  transactionReference?: string;
  settledAt?: string;
  settledBy?: string;
}

export interface PrinterEmulatorLog {
  id: string;
  kotId: string;
  kotNumber: string;
  restaurantId: string;
  receiptText: string;
  printStatus: "Pending" | "Printing" | "Printed" | "Failed";
  createdAt: string;
}

// -------------------------------------------------------------
// USER IDENTITY, ROLES & POS AUTHORIZATION TYPES
// -------------------------------------------------------------

export type UserRole = "Owner" | "Admin" | "Manager" | "Cashier" | "Staff";
export type StaffRole = UserRole;

export type PermissionKey =
  | "pos.access"
  | "pos.create_order"
  | "pos.apply_discount"
  | "pos.manual_item"
  | "pos.edit_price"
  | "pos.void_item"
  | "pos.void_order"
  | "pos.split_bill"
  | "pos.transfer_table"
  | "pos.reprint_bill"
  | "order.confirm"
  | "order.start_prep"
  | "order.mark_ready"
  | "order.fulfill"
  | "order.complete"
  | "order.cancel"
  | "order.void"
  | "order.rollback"
  | "payment.accept"
  | "payment.refund"
  | "payment.void"
  | "shift.open"
  | "shift.close"
  | "shift.reopen"
  | "shift.force_close"
  | "shift.cash_adjustment"
  | "shift.view_all_reports"
  | "shift.view_own_report"
  | "kitchen.view"
  | "kitchen.update_status"
  | "kitchen.cancel_item"
  | "tables.view"
  | "tables.manage"
  | "tables.assign"
  | "menu.view"
  | "menu.edit"
  | "menu.import"
  | "menu.pricing"
  | "reports.view_sales"
  | "reports.view_financials"
  | "reports.export_pdf"
  | "settings.view"
  | "settings.edit"
  | "settings.printers"
  | "settings.supabase"
  | "audit.view";

export interface UserProfile {
  id: string;
  tenantId?: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  pin?: string;
  status?: "Active" | "Inactive";
  avatar?: string;
  outletId?: string;
  createdAt?: string;
}

export type StaffMember = UserProfile;


