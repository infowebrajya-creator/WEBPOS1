import { MenuItem, Review, KOT, KOTStatus, OrderItem, RestaurantTable, PrinterEmulatorLog, Category, PaymentRecord, PaymentStatus, PaymentMethod, SplitItemAssignment, SplitSettlement, Shift, ShiftStatus, CashAdjustment, CashAdjustmentType, ShiftFinancials, OrderStatus } from "../types";
import { menuItems as defaultMenuItems, reviews as defaultReviews, categories as defaultCategories } from "../data";
import { createClient } from "@supabase/supabase-js";

// Load configuration with broad support for multiple environments
const anyMeta = import.meta as any;
const supabaseUrl = anyMeta.env?.VITE_SUPABASE_URL || 
                    anyMeta.env?.NEXT_PUBLIC_SUPABASE_URL || 
                    "https://jkkwrhywfpbitwvffkxx.supabase.co";

const supabaseKey = anyMeta.env?.VITE_SUPABASE_ANON_KEY || 
                    anyMeta.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                    anyMeta.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
                    "sb_publishable_D1rREhO08nd1vWNmxyugCg_Fff4X10Y";

export const supabase = createClient(supabaseUrl, supabaseKey);

const isDev = Boolean(
  anyMeta.env?.DEV || 
  (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"))
);

function debugLog(...args: any[]) {
  if (isDev) {
    console.log(...args);
  }
}

export interface OrderTimelineEvent {
  event: string;
  timestamp: string;
  details?: string;
  operator?: string;
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
  isManagerOverride?: boolean;
}

export interface Order {
  id: string;
  customerName: string;
  phoneNumber: string;
  email: string;
  orderType: "dine-in" | "takeaway" | "delivery";
  tableNumber?: string;
  address?: string;
  items: {
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    customization?: string;
    addedAt?: string;
    addedBy?: string;
    kotNumber?: string;
    sessionNumber?: number;
    isManual?: boolean;
    category?: string;
    gstRate?: number;
    discount?: number;
    hsnCode?: string;
    notes?: string;
  }[];
  subtotal: number;
  gst: number;
  packagingCharge: number;
  discountAmount: number;
  appliedCoupon?: string;
  grandTotal: number;
  paidAmount?: number;
  remainingAmount?: number;
  paymentStatus: "Pending" | "Partial" | "Paid" | "Failed" | "Refunded" | "Voided";
  orderStatus: OrderStatus;
  createdAt: string; // ISO string or date
  paymentMethod?: string;
  payments?: PaymentRecord[];
  splitSettlements?: SplitSettlement[];
  kotNumber?: string;
  kotPrintStatus?: "Pending" | "Printing" | "Printed" | "Failed";
  kotPrintTimestamp?: string;
  billPrintStatus?: "Pending" | "Printing" | "Printed" | "Failed";
  billPrintTimestamp?: string;
  timeline?: OrderTimelineEvent[];
  addOnCount?: number;
  shiftId?: string;
  billedBy?: string;

  // Lifecycle Timestamps
  confirmedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  servedAt?: string;
  packedAt?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  voidedAt?: string;

  // Lifecycle Metadata & Audit
  cancellationReason?: string;
  voidReason?: string;
  statusUpdatedBy?: string;
  version?: number;
  fulfillmentNotes?: string;
  deliveryPartner?: string;
  deliveryTrackingId?: string;
  source?: "POS" | "QR" | "ONLINE" | string;
}

/**
 * Strict Order Filter: Returns true ONLY for genuine customer Dine-In QR orders.
 * POS-created orders (Dine-In, Takeaway, Delivery, Manual) MUST NEVER pass.
 * Takeaway and Delivery orders MUST NEVER pass.
 * Orders without a valid assigned table MUST NEVER pass.
 */
export function isDineInQrOrder(order: any): boolean {
  if (!order || typeof order !== "object") return false;

  // 1. Order Type check: Must strictly be Dine-In (excludes takeaway, delivery, etc.)
  const rawType = String(order.orderType || order.order_type || "").trim().toLowerCase();
  const isDineIn = rawType === "dine-in" || rawType === "dine_in";
  if (!isDineIn) {
    return false;
  }

  // 3. Table Requirement: Dine-In QR order must be associated with a valid restaurant table
  const rawTable = String(order.tableNumber || order.table_number || "").trim();
  const hasValidTable = 
    rawTable.length > 0 && 
    rawTable.toLowerCase() !== "takeaway" && 
    rawTable.toLowerCase() !== "delivery" && 
    rawTable.toLowerCase() !== "null" && 
    rawTable.toLowerCase() !== "undefined";

  if (!hasValidTable) {
    return false;
  }

  // 4. POS Source Exclusion: Check all POS indicators
  const source = String(order.source || "").trim().toUpperCase();
  const billedBy = String(order.billedBy || "").trim().toUpperCase();
  const paymentMethod = String(order.paymentMethod || order.payment_method || "").trim().toUpperCase();
  const specialInstructions = String(order.specialInstructions || order.special_instructions || "").toUpperCase();

  // If created or marked by POS, NEVER trigger live notification
  if (
    source === "POS" ||
    billedBy.includes("POS") ||
    paymentMethod.includes("POS COUNTER") ||
    paymentMethod.includes("POS TERMINAL") ||
    specialInstructions.includes("[SOURCE:POS]")
  ) {
    return false;
  }

  // Check if items were added by POS
  if (Array.isArray(order.items) && order.items.length > 0) {
    const hasPosItems = order.items.some((it: any) => 
      String(it?.addedBy || "").toUpperCase().includes("POS")
    );
    if (hasPosItems) {
      return false;
    }
  }

  // 5. Positive Confirmation of QR source
  const isQrSource =
    source === "QR" ||
    source === "QR_DINE_IN" ||
    specialInstructions.includes("[SOURCE:QR]") ||
    billedBy.includes("TABLE QR") ||
    (Array.isArray(order.items) && order.items.some((it: any) => String(it?.addedBy || "").toUpperCase().includes("TABLE QR")));

  return isQrSource || (source !== "POS" && isDineIn && hasValidTable && !billedBy.includes("POS"));
}

export interface Coupon {
  code: string;
  type: "percentage" | "fixed";
  value: number;
  expiryDate: string;
  usageLimit: number;
  usageCount: number;
  minOrderAmount?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  stock: number; // in kg or units
  unit: string;
  minAlertLevel: number;
  category: "Dairy" | "Dry Goods" | "Vegetables" | "Spices" | "Packaging" | "Other";
  lastRestocked: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
  ipAddress: string;
}

export interface RestaurantOutlet {
  id: string;
  name: string;
  address: string;
  contactNumber: string;
  isMain?: boolean;
}

export interface RestaurantSettings {
  name: string;
  contactNumber: string;
  address: string;
  businessHours: string;
  deliveryCharges: number;
  gstPercentage: number;
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  googleMapsUrl: string;

  // Professional Front Side Tax Invoice & Registration Fields
  estd?: string;
  establishedYear?: string | number;
  legalName?: string;
  city?: string;
  state?: string;
  country?: string;
  email?: string;
  customerCare?: string;
  gstin?: string;
  gstEnabled?: boolean;
  gstRate?: number;
  cgstRate?: number;
  sgstRate?: number;
  fssaiNumber?: string;
  tagline?: string;
  website?: string;
  customFooter?: string;
  invoiceTitle?: string;
  cashierName?: string;
  defaultPax?: number;
  logoUrl?: string;

  // Double-Sided Thermal Receipt Settings
  enableDoubleSided?: boolean;
  outlets?: RestaurantOutlet[];
  termsAndConditions?: string[];
  backSideTitle?: string;
  backSideFooterNote?: string;

  // Thermal Printing Display Preferences
  showGstin?: boolean;
  showFssai?: boolean;
  showPax?: boolean;
  showCashier?: boolean;
  showLogo?: boolean;
  showQrCode?: boolean;
  showBarcode?: boolean;
  showSignature?: boolean;
  showAmountInWords?: boolean;
  paperWidth?: "80mm" | "58mm";
}

// Clean empty arrays for WebRajya POS Base
export const defaultOutlets: RestaurantOutlet[] = [];
export const defaultTermsAndConditions: string[] = [];

const defaultSettings: RestaurantSettings = {
  name: "THE XINGS KITCHEN",
  contactNumber: "",
  address: "",
  businessHours: "Mon-Sun: 10:00 AM - 10:00 PM",
  deliveryCharges: 0,
  gstEnabled: true,
  gstRate: 5,
  cgstRate: 2.5,
  sgstRate: 2.5,
  gstPercentage: 5,
  invoiceTitle: "TAX INVOICE",
  cashierName: "Cashier",
  defaultPax: 2,
  paperWidth: "80mm",
  facebookUrl: "",
  instagramUrl: "",
  twitterUrl: "",
  googleMapsUrl: ""
};

const defaultAuditLogs: AuditLog[] = [];

// Clean local storage migration on application load
if (typeof window !== "undefined") {
  const ERASE_VERSION = "webrajya_base_v1";
  if (localStorage.getItem("wr_db_erased_version") !== ERASE_VERSION) {
    localStorage.setItem("ij_orders", JSON.stringify([]));
    localStorage.setItem("ij_reviews", JSON.stringify([]));
    localStorage.setItem("ij_menu_items", JSON.stringify([]));
    localStorage.setItem("ij_audit_logs", JSON.stringify([]));
    localStorage.removeItem("ij_coupons");
    localStorage.removeItem("ij_settings");
    localStorage.removeItem("ij_inventory");
    localStorage.setItem("wr_db_erased_version", ERASE_VERSION);
  }
}

// Deterministic string-to-64bit-integer hash function to handle legacy/live bigint IDs safely within JS MAX_SAFE_INTEGER
export function stringToNumericId(str: string): number {
  if (!str) return 0;
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash) % 9007199254740991; // Safe inside JS 53-bit float and Postgres bigint
}

// 4 Standard Deployed Dining Tables for Restaurant POS & QR Self-Ordering
export const DEFAULT_DEPLOYED_TABLES: RestaurantTable[] = [
  {
    id: "tbl-01",
    tableNumber: "01",
    capacity: 2,
    seatingArea: "Main Dining Hall",
    status: "Available"
  },
  {
    id: "tbl-02",
    tableNumber: "02",
    capacity: 4,
    seatingArea: "Main Dining Hall",
    status: "Available"
  },
  {
    id: "tbl-03",
    tableNumber: "03",
    capacity: 4,
    seatingArea: "Family Section",
    status: "Available"
  },
  {
    id: "tbl-04",
    tableNumber: "04",
    capacity: 6,
    seatingArea: "VIP Lounge",
    status: "Available"
  }
];

// Database state managers with both offline localStorage caching and full-stack Express API integration
export class LocalDB {
  static apiCallCount = 0;
  static incrementApiCallCount(apiName: string) {
    this.apiCallCount++;
    console.log(`[Supabase API Call Count] Total calls: ${this.apiCallCount} (Triggered by: ${apiName})`);
  }

  static getMenuItems(): MenuItem[] {
    const stored = localStorage.getItem("ij_menu_items");
    if (!stored) {
      return [];
    }
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed;
    } catch (_) {
      return [];
    }
  }

  static saveMenuItems(items: MenuItem[]): void {
    localStorage.setItem("ij_menu_items", JSON.stringify(items));
    window.dispatchEvent(new Event("storage"));
  }

  static getReviews(): Review[] {
    const stored = localStorage.getItem("ij_reviews");
    if (!stored) {
      localStorage.setItem("ij_reviews", JSON.stringify([]));
      return [];
    }
    return JSON.parse(stored);
  }

  static saveReviews(reviews: any[]): void {
    localStorage.setItem("ij_reviews", JSON.stringify(reviews));
  }

  static getOrders(): Order[] {
    const stored = localStorage.getItem("ij_orders");
    if (!stored) {
      localStorage.setItem("ij_orders", JSON.stringify([]));
      return [];
    }
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      const seen = new Set<string>();
      const unique: Order[] = [];
      for (const item of parsed) {
        if (item && item.id && !seen.has(item.id)) {
          seen.add(item.id);
          unique.push(item);
        }
      }
      return unique;
    } catch {
      return [];
    }
  }

  static saveOrders(orders: Order[]): void {
    const seen = new Set<string>();
    const unique: Order[] = [];
    for (const item of orders) {
      if (item && item.id && !seen.has(item.id)) {
        seen.add(item.id);
        unique.push(item);
      }
    }
    localStorage.setItem("ij_orders", JSON.stringify(unique));
    window.dispatchEvent(new Event("storage"));
  }

  static getTables(): RestaurantTable[] {
    const stored = localStorage.getItem("ij_tables");
    if (!stored) {
      this.saveTables(DEFAULT_DEPLOYED_TABLES);
      return [...DEFAULT_DEPLOYED_TABLES];
    }
    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        this.saveTables(DEFAULT_DEPLOYED_TABLES);
        return [...DEFAULT_DEPLOYED_TABLES];
      }
      return parsed;
    } catch {
      this.saveTables(DEFAULT_DEPLOYED_TABLES);
      return [...DEFAULT_DEPLOYED_TABLES];
    }
  }

  static deployDefaultTables(count: number = 4): RestaurantTable[] {
    const tablesToDeploy = DEFAULT_DEPLOYED_TABLES.slice(0, count);
    this.saveTables(tablesToDeploy);
    this.addAuditLog("Tables Deployed", `Deployed ${tablesToDeploy.length} dining tables (Table 01 - Table 0${tablesToDeploy.length}) with QR self-ordering support.`, "Admin System");
    return tablesToDeploy;
  }

  static saveTables(tables: RestaurantTable[]): void {
    localStorage.setItem("ij_tables", JSON.stringify(tables));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("tables_updated"));
  }


  static addOrder(order: Omit<Order, "id" | "createdAt">): Order {
    if (order.orderType === "dine-in" && order.tableNumber) {
      const activeOrder = this.getActiveOrderForTable(order.tableNumber);
      if (activeOrder) {
        const orders = this.getOrders();
        const idx = orders.findIndex(o => o.id === activeOrder.id);
        if (idx !== -1) {
          const kotCount = this.getKOTs().length + 1;
          const kotNumber = `KOT-${String(kotCount).padStart(4, "0")}`;
          const addOnCount = (activeOrder.addOnCount || 0) + 1;
          
          const newlyAddedItemsWithTracking = order.items.map((item) => ({
            menuItemId: item.menuItemId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            customization: item.customization || "",
            addedAt: new Date().toISOString(),
            addedBy: (order as any).billedBy || "Waiter",
            kotNumber: kotNumber,
            sessionNumber: addOnCount + 1
          }));

          const existingItemsWithTracking = activeOrder.items.map(item => ({
            ...item,
            addedAt: item.addedAt || activeOrder.createdAt,
            addedBy: item.addedBy || "Guest",
            kotNumber: item.kotNumber || activeOrder.kotNumber || "KOT-0001",
            sessionNumber: item.sessionNumber || 1
          }));

          const combinedItems = [...existingItemsWithTracking, ...newlyAddedItemsWithTracking];
          const subtotal = combinedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
          const gst = Math.round(subtotal * 0.05);
          const packagingCharge = 0;
          
          let discountAmount = activeOrder.discountAmount || 0;
          if (activeOrder.appliedCoupon) {
            const coupon = this.getCoupons().find(c => c.code === activeOrder.appliedCoupon);
            if (coupon) {
              if (coupon.type === "percentage") {
                discountAmount = Math.round(subtotal * (coupon.value / 100));
              } else {
                discountAmount = Math.min(coupon.value, subtotal);
              }
            }
          }
          const grandTotal = subtotal + gst + packagingCharge - discountAmount;

          const timeline = activeOrder.timeline || [
            { event: "Order Created", timestamp: activeOrder.createdAt, details: "Initial order created." }
          ];
          timeline.push({
            event: "Additional Items Added",
            timestamp: new Date().toISOString(),
            details: `Added ${newlyAddedItemsWithTracking.length} items via ${kotNumber}.`
          });

          const updatedOrder: Order = {
            ...activeOrder,
            items: combinedItems,
            subtotal,
            gst,
            grandTotal,
            discountAmount,
            timeline,
            addOnCount
          };

          if (idx !== -1) {
            orders.splice(idx, 1);
            orders.unshift(updatedOrder);
            this.saveOrders(orders);
          } else {
            orders.unshift(updatedOrder);
            this.saveOrders(orders);
          }

          // Add add-on KOT
          const freshKOT: KOT = {
            id: kotNumber,
            orderId: activeOrder.id,
            tableNumber: activeOrder.tableNumber || "Takeaway",
            customerName: activeOrder.customerName,
            orderType: activeOrder.orderType,
            status: "New Order",
            specialInstructions: newlyAddedItemsWithTracking.map(i => i.customization).filter(Boolean).join(", ") || "None",
            createdAt: new Date().toISOString(),
            preparationTime: 15,
            items: newlyAddedItemsWithTracking.map(item => ({
              menuItemId: item.menuItemId,
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              customization: item.customization
            })),
            isAddOn: true
          };

          const localKOTs = this.getKOTs();
          localKOTs.unshift(freshKOT);
          this.saveKOTs(localKOTs);

          // Trigger background Supabase sync
          this.apiSyncOrderTimelineAndItems(activeOrder.id, combinedItems, timeline, addOnCount).catch(e => console.warn(e));
          this.apiAddOrderItems(activeOrder.id, newlyAddedItemsWithTracking).catch(e => console.warn(e));
          this.apiAddKOT(freshKOT).catch(e => console.warn(e));



          // Play sound
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.5);
          } catch (e) {
            // Audio lock bypass
          }

          // Dispatch events
          const event = new CustomEvent("new_order", { detail: updatedOrder });
          window.dispatchEvent(event);
          window.dispatchEvent(new Event("storage"));

          // Fire auto print notification for printers
          window.dispatchEvent(new CustomEvent("order_updated_auto_print", {
            detail: { orderId: activeOrder.id, kotId: kotNumber }
          }));

          return updatedOrder;
        }
      }
    }

    const orders = this.getOrders();
    const uniqueIdSuffix = Math.floor(100 + Math.random() * 900);
    const newId = `SR-${1000 + orders.length}-${uniqueIdSuffix}`;
    const kotCount = this.getKOTs().length + 1;
    const kotNumber = `KOT-${String(kotCount).padStart(4, "0")}`;

    const initialItemsWithTracking = order.items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      customization: item.customization || "",
      addedAt: new Date().toISOString(),
      addedBy: (order as any).billedBy || "Waiter",
      kotNumber: kotNumber,
      sessionNumber: 1
    }));

    const timeline = [
      { event: "Order Created", timestamp: new Date().toISOString(), details: `Initial order created with ${order.items.length} items.` }
    ];

    const isTakeaway = (order.orderType || "").toLowerCase() === "takeaway";
    const subtotal = Number(order.subtotal || 0);
    const discountAmount = Number(order.discountAmount || 0);
    const gst = Number(order.gst || 0);
    const packagingCharge = isTakeaway ? 0 : Number(order.packagingCharge || 0);
    const grandTotal = isTakeaway
      ? Math.max(0, Math.round(subtotal - discountAmount + gst))
      : Number(order.grandTotal ?? Math.round(subtotal - discountAmount + gst + packagingCharge));

    const fullOrder: Order = {
      ...order,
      packagingCharge,
      grandTotal,
      items: initialItemsWithTracking,
      id: newId,
      createdAt: new Date().toISOString(),
      timeline,
      addOnCount: 0,
      kotNumber: kotNumber
    };
    orders.unshift(fullOrder);
    this.saveOrders(orders);
    
    // Play sound
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      // Audio lock bypass
    }

    const event = new CustomEvent("new_order", { detail: fullOrder });
    window.dispatchEvent(event);



    return fullOrder;
  }

  static getInventory(): InventoryItem[] {
    const stored = localStorage.getItem("ij_inventory");
    if (!stored) {
      localStorage.setItem("ij_inventory", JSON.stringify([]));
      return [];
    }
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  static saveInventory(inventory: InventoryItem[]): void {
    localStorage.setItem("ij_inventory", JSON.stringify(inventory));
  }

  static getCoupons(): Coupon[] {
    const stored = localStorage.getItem("ij_coupons");
    if (!stored) {
      localStorage.setItem("ij_coupons", JSON.stringify([]));
      return [];
    }
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  static saveCoupons(coupons: Coupon[]): void {
    localStorage.setItem("ij_coupons", JSON.stringify(coupons));
  }

  static getSettings(): RestaurantSettings {
    const stored = localStorage.getItem("ij_settings");
    if (!stored) {
      localStorage.setItem("ij_settings", JSON.stringify(defaultSettings));
      return defaultSettings;
    }
    try {
      const parsed = JSON.parse(stored);
      if (!parsed || !parsed.name) {
        localStorage.setItem("ij_settings", JSON.stringify(defaultSettings));
        return defaultSettings;
      }
      const merged: RestaurantSettings = {
        ...defaultSettings,
        ...parsed,
        outlets: parsed.outlets && parsed.outlets.length > 0 ? parsed.outlets : defaultOutlets,
        termsAndConditions: parsed.termsAndConditions && parsed.termsAndConditions.length > 0 ? parsed.termsAndConditions : defaultTermsAndConditions
      };
      return merged;
    } catch {
      return defaultSettings;
    }
  }

  static saveSettings(settings: RestaurantSettings): void {
    localStorage.setItem("ij_settings", JSON.stringify(settings));
    window.dispatchEvent(new Event("storage"));
  }

  static getCategories(): Category[] {
    const stored = localStorage.getItem("ij_categories");
    if (!stored) {
      localStorage.setItem("ij_categories", JSON.stringify(defaultCategories));
      return defaultCategories;
    }
    return JSON.parse(stored);
  }

  static saveCategories(cats: Category[]): void {
    localStorage.setItem("ij_categories", JSON.stringify(cats));
    window.dispatchEvent(new Event("storage"));
  }

  static getAuditLogs(): AuditLog[] {
    const stored = localStorage.getItem("ij_audit_logs");
    if (!stored) {
      localStorage.setItem("ij_audit_logs", JSON.stringify(defaultAuditLogs));
      return defaultAuditLogs;
    }
    return JSON.parse(stored);
  }

  static addAuditLog(action: string, details: string, user: string = "Admin (owner)"): void {
    const logs = this.getAuditLogs();
    const newLog: AuditLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user,
      action,
      details,
      ipAddress: "127.0.0.1"
    };
    logs.unshift(newLog);
    localStorage.setItem("ij_audit_logs", JSON.stringify(logs));
  }

  static addOrderTimelineEvent(orderId: string, event: string, details?: string): void {
    try {
      const orders = this.getOrders();
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        if (!orders[idx].timeline) {
          orders[idx].timeline = [
            { event: "Order Created", timestamp: orders[idx].createdAt || new Date().toISOString(), details: "Initial order created." }
          ];
        }
        orders[idx].timeline!.push({
          event,
          timestamp: new Date().toISOString(),
          details: details || ""
        });
        this.saveOrders(orders);
        
        // Push the entire order timeline or items to Supabase too if online
        this.apiSyncOrderTimelineAndItems(orderId, orders[idx].items, orders[idx].timeline, orders[idx].addOnCount);
      }
    } catch (err) {
      console.error("[LocalDB Exception adding timeline event]", err);
    }
  }

  static async apiSyncOrderTimelineAndItems(orderId: string, items: any[], timeline: any[], addOnCount?: number): Promise<void> {
    try {
      const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const gst = Math.round(subtotal * 0.05);
      const grand_total = subtotal + gst;
      
      const updatePayload: any = {
        items: items,
        subtotal,
        gst,
        grand_total
      };

      await supabase
        .from("orders")
        .update(updatePayload)
        .eq("id", orderId);
    } catch (err) {
      console.error("[Supabase Sync Timeline and Items failed]", err);
    }
  }

  // --- SUPABASE DIRECT INTEGRATION CODES & BACKENDS ---
  
  static getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem("ij_admin_jwt") || sessionStorage.getItem("ij_admin_jwt");
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  static subscribeToOrders(onUpdate: (event: any) => void): () => void {
    const channelName = `orders_realtime_stream_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          debugLog("[REALTIME EVENT] Received Supabase postgres_changes event for orders:", payload.eventType, payload.new || payload.old);
          onUpdate(payload);
        }
      )
      .subscribe((status) => {
        debugLog("[REALTIME EVENT] Supabase order stream channel status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }

  static async fetchOrders(): Promise<Order[]> {
    this.incrementApiCallCount("fetchOrders");
    debugLog("[ORDER MANAGEMENT FETCH] Loading orders list from Supabase...");
    try {
      const { data, error, status } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("[ORDER MANAGEMENT FETCH] Supabase fetch warning:", error);
        this.addAuditLog(
          "Supabase API Warning",
          `HTTP ${status} - Failed to fetch orders from Supabase REST endpoint: ${error.message} (${error.details}). Check if 'orders' table exists in dashboard. Falling back to local ledger cache.`,
          "System (Supabase)"
        );
        const local = this.getOrders();
        debugLog(`[ORDER MANAGEMENT FETCH] Fallback loaded ${local.length} orders from local cache. IDs:`, local.map(o => o.id));
        return local;
      }

      debugLog(`[ORDER MANAGEMENT FETCH] Successfully retrieved ${(data || []).length} orders from Supabase. IDs:`, (data || []).map((o: any) => o.id));

      // Translate snake_case keys back to client camelCase with strict ID deduplication
      const seenIds = new Set<string>();
      const mapped: Order[] = [];
      for (const item of (data || [])) {
        if (!item || !item.id || seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        const parsedItems = Array.isArray(item.items) ? item.items : (typeof item.items === 'string' ? JSON.parse(item.items) : []);
        const itemSource = item.special_instructions?.includes("[SOURCE:POS]") 
          ? "POS"
          : item.special_instructions?.includes("[SOURCE:QR]")
          ? "QR"
          : (parsedItems[0]?.addedBy?.toUpperCase().includes("POS") || item.payment_method?.toUpperCase().includes("POS"))
          ? "POS"
          : (item.order_type === "dine-in" && item.table_number ? "QR" : "ONLINE");

        const billedBy = item.special_instructions?.includes("[SOURCE:POS]")
          ? "POS"
          : (parsedItems[0]?.addedBy)
          ? parsedItems[0].addedBy
          : (item.order_type === "dine-in" ? "Table QR" : undefined);

        const isTakeaway = (item.order_type || "").toLowerCase() === "takeaway";
        const subtotal = Number(item.subtotal || 0);
        const gst = Number(item.gst || 0);
        const discountAmount = Number(item.discount_amount || 0);
        const packagingCharge = isTakeaway ? 0 : Number(item.packaging_charge || 0);
        const grandTotal = isTakeaway
          ? Math.max(0, Math.round(subtotal - discountAmount + gst))
          : Number(item.grand_total || 0);

        mapped.push({
          id: item.id,
          customerName: item.customer_name || "Guest User",
          phoneNumber: item.phone_number || "",
          email: item.email || "",
          orderType: item.order_type || "takeaway",
          tableNumber: item.table_number || undefined,
          address: item.address || undefined,
          items: parsedItems,
          subtotal,
          gst,
          packagingCharge,
          discountAmount,
          appliedCoupon: item.applied_coupon || undefined,
          grandTotal,
          paymentStatus: item.payment_status || "Pending",
          orderStatus: item.order_status || "New Order",
          createdAt: item.created_at || new Date().toISOString(),
          paymentMethod: item.payment_method || "Cash on Delivery",
          kotNumber: item.kot_number || undefined,
          source: itemSource,
          billedBy: billedBy
        });
      }

      // Preserve any local unsynced offline orders that exist in local disk but not yet in Supabase response
      const localOrders = this.getOrders();
      const merged: Order[] = [...mapped];
      for (const local of localOrders) {
        if (local && local.id && !seenIds.has(local.id)) {
          seenIds.add(local.id);
          merged.unshift(local);
          // Try background sync
          const sanitizedPayload: any = {
            id: local.id,
            customer_name: local.customerName,
            phone_number: local.phoneNumber,
            email: local.email,
            order_type: local.orderType,
            table_number: local.tableNumber || null,
            address: local.address || null,
            items: local.items,
            subtotal: Number(local.subtotal || 0),
            gst: Number(local.gst || 0),
            packaging_charge: Number(local.packagingCharge || 0),
            discount_amount: Number(local.discountAmount || 0),
            applied_coupon: local.appliedCoupon || null,
            grand_total: Number(local.grandTotal || 0),
            payment_status: local.paymentStatus || "Pending",
            order_status: local.orderStatus || "New Order",
            created_at: local.createdAt,
            payment_method: local.paymentMethod || "Cash on Delivery",
            special_instructions: `[SOURCE:${local.source || (local.billedBy?.includes("POS") ? "POS" : "QR")}]`
          };
          try {
            await supabase.from("orders").insert(sanitizedPayload);
          } catch (_) {}
        }
      }

      this.saveOrders(merged);
      return merged;
    } catch (err: any) {
      console.warn("[ORDER MANAGEMENT FETCH] Supabase transport error:", err);
      this.addAuditLog(
        "Supabase Bridge Offline",
        `Transport link offline: ${err.message || err.toString()}. Reading orders offline from local disk cache.`,
        "System (Offline)"
      );
      return this.getOrders();
    }
  }

  static getActiveOrderForTable(tableNumber: string): Order | undefined {
    const orders = this.getOrders();
    const activeStatuses = ["New Order", "Accepted", "Preparing", "Ready", "Served"];
    return orders.find(o => 
      o.orderType === "dine-in" && 
      String(o.tableNumber).trim() === String(tableNumber).trim() && 
      o.orderStatus !== "Cancelled" &&
      (activeStatuses.includes(o.orderStatus) || o.paymentStatus !== "Paid")
    );
  }

  static async apiTransferTableOrder(
    sourceTableNumber: string,
    targetTableNumber: string,
    user: string = "Staff"
  ): Promise<{ success: boolean; order: Order; message: string }> {
    console.log(`[LocalDB & Supabase] Transferring order from Table ${sourceTableNumber} to Table ${targetTableNumber} by ${user}`);

    const srcNum = String(sourceTableNumber).trim();
    const tgtNum = String(targetTableNumber).trim();

    if (!srcNum) {
      throw new Error("Source table number is required.");
    }
    if (!tgtNum) {
      throw new Error("Destination table number is required.");
    }
    if (srcNum === tgtNum) {
      throw new Error(`Source and destination tables are identical (Table #${srcNum}).`);
    }

    // 1. Locate active order on source table
    const orders = this.getOrders();
    const sourceOrder = this.getActiveOrderForTable(srcNum);

    if (!sourceOrder) {
      throw new Error(`No active order found at Table #${srcNum} to transfer.`);
    }

    const orderIdx = orders.findIndex(o => o.id === sourceOrder.id);
    if (orderIdx === -1) {
      throw new Error(`Order #${sourceOrder.id} could not be located in orders ledger.`);
    }

    // 2. Validate destination table existence in tables registry
    const tables = this.getTables();
    const targetTableObj = tables.find(t => String(t.tableNumber).trim() === tgtNum);
    if (!targetTableObj) {
      throw new Error(`Destination Table #${tgtNum} does not exist in the restaurant floorplan.`);
    }

    // 3. Prepare timeline and updated order
    const timeline = sourceOrder.timeline || [
      { event: "Order Created", timestamp: sourceOrder.createdAt, details: "Initial order created." }
    ];
    timeline.push({
      event: "Table Transferred",
      timestamp: new Date().toISOString(),
      details: `Active order transferred from Table #${srcNum} to Table #${tgtNum} by ${user}.`
    });

    const updatedOrder: Order = {
      ...sourceOrder,
      tableNumber: tgtNum,
      timeline
    };

    // Update in local orders array
    orders[orderIdx] = updatedOrder;
    this.saveOrders(orders);

    // 4. Update tables status in LocalDB
    let tablesChanged = false;

    // Check if source table has any other remaining active orders
    const otherOrdersOnSource = orders.filter(
      o => o.id !== sourceOrder.id &&
      o.orderType === "dine-in" &&
      String(o.tableNumber).trim() === srcNum &&
      o.orderStatus !== "Cancelled" &&
      o.paymentStatus !== "Paid"
    );

    const sourceTableObj = tables.find(t => String(t.tableNumber).trim() === srcNum);
    if (sourceTableObj) {
      if (otherOrdersOnSource.length === 0) {
        sourceTableObj.status = "Available";
        tablesChanged = true;
      }
    }

    targetTableObj.status = "Occupied";
    tablesChanged = true;

    if (tablesChanged) {
      this.saveTables(tables);
    }

    // 5. Update linked active KOTs for kitchen transparency (no duplicate KOT created)
    const kots = this.getKOTs();
    let kotsChanged = false;
    kots.forEach(kot => {
      if (kot.orderId === sourceOrder.id || (kot.tableNumber === srcNum && kot.status !== "Served" && kot.status !== "Cancelled")) {
        kot.tableNumber = tgtNum;
        kotsChanged = true;
      }
    });
    if (kotsChanged) {
      this.saveKOTs(kots);
    }

    // 6. Add audit log
    const auditText = `Order ${sourceOrder.id} (₹${sourceOrder.grandTotal}, ${sourceOrder.customerName || "Guest"}) moved from Table #${srcNum} to Table #${tgtNum}`;
    this.addAuditLog("Table Transferred", auditText, user);

    // 7. Asynchronously sync order and KOT updates to Supabase
    try {
      await supabase
        .from("orders")
        .update({
          table_number: tgtNum,
          items: updatedOrder.items
        })
        .eq("id", sourceOrder.id);

      // Update KOTs in Supabase
      await supabase
        .from("kots")
        .update({ table_number: tgtNum })
        .eq("order_id", sourceOrder.id);
    } catch (syncErr) {
      console.warn("[Supabase Sync Table Transfer Notice]:", syncErr);
    }

    // 8. Dispatch events across all open tabs / windows
    window.dispatchEvent(new CustomEvent("new_order", { detail: updatedOrder }));
    window.dispatchEvent(new CustomEvent("table_transferred", {
      detail: {
        orderId: sourceOrder.id,
        sourceTable: srcNum,
        targetTable: tgtNum,
        user
      }
    }));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("tables_updated"));
    window.dispatchEvent(new Event("kots_updated"));

    return {
      success: true,
      order: updatedOrder,
      message: `Order #${sourceOrder.id} successfully transferred from Table #${srcNum} to Table #${tgtNum}.`
    };
  }

  static async apiMergeTableOrders(
    sourceOrderId: string,
    targetOrderId: string,
    user: string = "Staff"
  ): Promise<{ success: boolean; mergedOrder: Order; message: string }> {
    console.log(`[LocalDB & Supabase] Merging Order ${sourceOrderId} into Order ${targetOrderId} by ${user}`);

    if (sourceOrderId === targetOrderId) {
      throw new Error("Cannot merge an order into itself.");
    }

    const orders = this.getOrders();
    const sourceIdx = orders.findIndex(o => o.id === sourceOrderId);
    const targetIdx = orders.findIndex(o => o.id === targetOrderId);

    if (sourceIdx === -1) {
      throw new Error(`Source order #${sourceOrderId} was not found.`);
    }
    if (targetIdx === -1) {
      throw new Error(`Target order #${targetOrderId} was not found.`);
    }

    const sourceOrder = orders[sourceIdx];
    const targetOrder = orders[targetIdx];

    const sourceTableNum = String(sourceOrder.tableNumber || "").trim();
    const targetTableNum = String(targetOrder.tableNumber || "").trim();

    const addOnCount = (targetOrder.addOnCount || 0) + 1;

    // 1. COMBINE ITEMS WITH EQUIVALENT ITEM MERGING RULE:
    // - Items with same menuItemId (or name), same customization/modifier, and same price merge quantities.
    // - Items with different modifiers, customizations, or prices remain separate line items.
    const mergedItems: Order["items"] = targetOrder.items.map(item => ({ ...item }));

    for (const srcItem of sourceOrder.items) {
      const srcCust = (srcItem.customization || "").trim().toLowerCase();

      const matchIdx = mergedItems.findIndex(tgtItem => {
        const tgtCust = (tgtItem.customization || "").trim().toLowerCase();
        const isSameId = tgtItem.menuItemId && srcItem.menuItemId
          ? tgtItem.menuItemId === srcItem.menuItemId
          : tgtItem.name.trim().toLowerCase() === srcItem.name.trim().toLowerCase();
        const isSamePrice = tgtItem.price === srcItem.price;
        const isSameCustomization = tgtCust === srcCust;

        return isSameId && isSamePrice && isSameCustomization;
      });

      if (matchIdx !== -1) {
        // Equivalent item: merge quantities
        mergedItems[matchIdx].quantity += srcItem.quantity;
      } else {
        // Different modifier, price, or new item: keep as distinct line item
        mergedItems.push({
          ...srcItem,
          addedAt: srcItem.addedAt || new Date().toISOString(),
          addedBy: `Merged from Table #${sourceTableNum} (${srcItem.addedBy || user})`,
          sessionNumber: addOnCount + 1
        });
      }
    }

    // 2. RECALCULATE TAXES, DISCOUNTS & GRAND TOTAL
    const subtotal = mergedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const settings = this.getSettings();
    const gstRate = (settings.gstPercentage ?? 5) / 100;
    const gst = Math.round(subtotal * gstRate);
    const packagingCharge = 0; // Dine-in orders have 0 packaging charge

    // Determine coupon / discount calculation
    let discountAmount = 0;
    let appliedCoupon = targetOrder.appliedCoupon || sourceOrder.appliedCoupon;
    
    if (appliedCoupon) {
      const coupon = this.getCoupons().find(c => c.code === appliedCoupon);
      if (coupon) {
        if (coupon.type === "percentage") {
          discountAmount = Math.round(subtotal * (coupon.value / 100));
        } else {
          discountAmount = Math.min(coupon.value, subtotal);
        }
      }
    } else {
      // Sum flat discounts up to the subtotal amount
      const targetDisc = targetOrder.discountAmount || 0;
      const sourceDisc = sourceOrder.discountAmount || 0;
      discountAmount = Math.min(subtotal, targetDisc + sourceDisc);
    }

    const grandTotal = Math.max(0, subtotal + gst + packagingCharge - discountAmount);

    // 3. PREPARE TIMELINES
    const targetTimeline = targetOrder.timeline || [
      { event: "Order Created", timestamp: targetOrder.createdAt, details: "Initial order created." }
    ];
    targetTimeline.push({
      event: "Orders Merged",
      timestamp: new Date().toISOString(),
      details: `Merged Order #${sourceOrder.id} from Table #${sourceTableNum} (${sourceOrder.items.length} items, subtotal ₹${sourceOrder.subtotal}) by ${user}.`
    });

    const updatedTargetOrder: Order = {
      ...targetOrder,
      items: mergedItems,
      subtotal,
      gst,
      grandTotal,
      discountAmount,
      appliedCoupon,
      timeline: targetTimeline,
      addOnCount
    };

    // Update source order to mark as merged / closed
    const sourceTimeline = sourceOrder.timeline || [
      { event: "Order Created", timestamp: sourceOrder.createdAt, details: "Initial order created." }
    ];
    sourceTimeline.push({
      event: "Order Merged Out",
      timestamp: new Date().toISOString(),
      details: `Transferred and merged into Order #${targetOrder.id} at Table #${targetTableNum} by ${user}.`
    });

    const updatedSourceOrder: Order = {
      ...sourceOrder,
      orderStatus: "Served",
      paymentStatus: "Paid",
      paymentMethod: `Merged into #${targetOrder.id}`,
      timeline: sourceTimeline
    };

    // Update orders in local cache
    orders[targetIdx] = updatedTargetOrder;
    orders[sourceIdx] = updatedSourceOrder;
    this.saveOrders(orders);

    // 4. UPDATE TABLES STATUS
    const tables = this.getTables();
    let tablesChanged = false;
    const sourceTableObj = tables.find(t => String(t.tableNumber).trim() === sourceTableNum);
    if (sourceTableObj) {
      sourceTableObj.status = "Available";
      tablesChanged = true;
    }
    const targetTableObj = tables.find(t => String(t.tableNumber).trim() === targetTableNum);
    if (targetTableObj) {
      targetTableObj.status = "Occupied";
      tablesChanged = true;
    }
    if (tablesChanged) {
      this.saveTables(tables);
    }

    // 5. UPDATE EXISTING KOTS WITHOUT DUPLICATING
    // Existing active kitchen tickets from source order are reassigned to target table
    const kots = this.getKOTs();
    let kotsChanged = false;
    kots.forEach(kot => {
      if (kot.orderId === sourceOrder.id || (sourceTableNum && kot.tableNumber === sourceTableNum && kot.status !== "Served" && kot.status !== "Cancelled")) {
        kot.tableNumber = targetTableNum;
        kot.orderId = targetOrder.id;
        kotsChanged = true;
      }
    });
    if (kotsChanged) {
      this.saveKOTs(kots);
    }

    // 6. ADD AUDIT LOG
    this.addAuditLog(
      "Orders Merged",
      `Order #${sourceOrder.id} from Table #${sourceTableNum} merged into Order #${targetOrder.id} at Table #${targetTableNum}. Combined Total: ₹${grandTotal}`,
      user
    );

    // 7. SUPABASE ASYNC SYNC
    try {
      await this.apiSyncOrderTimelineAndItems(targetOrder.id, mergedItems, targetTimeline, addOnCount);
      await supabase.from("orders").update({
        order_status: "Served",
        payment_status: "Paid",
        payment_method: `Merged into #${targetOrder.id}`
      }).eq("id", sourceOrder.id);
      
      // Update KOT table numbers in Supabase
      await supabase
        .from("kots")
        .update({ table_number: targetTableNum, order_id: targetOrder.id })
        .eq("order_id", sourceOrder.id);
    } catch (syncErr) {
      console.warn("[Supabase Sync Merge Notice]:", syncErr);
    }

    // 8. DISPATCH GLOBAL EVENTS
    window.dispatchEvent(new CustomEvent("new_order", { detail: updatedTargetOrder }));
    window.dispatchEvent(new CustomEvent("table_transferred", {
      detail: {
        sourceOrderId,
        targetOrderId,
        sourceTable: sourceTableNum,
        targetTable: targetTableNum,
        merged: true,
        user
      }
    }));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("tables_updated"));
    window.dispatchEvent(new Event("kots_updated"));

    return {
      success: true,
      mergedOrder: updatedTargetOrder,
      message: `Orders successfully merged into Table #${targetTableNum}. Total bill is now ₹${grandTotal}.`
    };
  }

  static async apiMergeIntoExistingOrder(existingOrder: Order, newItems: any[], addedBy: string): Promise<Order> {
    console.log(`[LocalDB] Merging items into active order ${existingOrder.id} for Table ${existingOrder.tableNumber}`);
    const orders = this.getOrders();
    const idx = orders.findIndex(o => o.id === existingOrder.id);
    const kotCount = this.getKOTs().length + 1;
    const kotNumber = `KOT-${String(kotCount).padStart(4, "0")}`;
    const addOnCount = (existingOrder.addOnCount || 0) + 1;

    const newlyAddedItemsWithTracking = newItems.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      customization: item.customization || "",
      addedAt: new Date().toISOString(),
      addedBy: addedBy || "Waiter",
      kotNumber: kotNumber,
      sessionNumber: addOnCount + 1
    }));

    const existingItemsWithTracking = existingOrder.items.map(item => ({
      ...item,
      addedAt: item.addedAt || existingOrder.createdAt,
      addedBy: item.addedBy || "Guest",
      kotNumber: item.kotNumber || existingOrder.kotNumber || "KOT-0001",
      sessionNumber: item.sessionNumber || 1
    }));

    const combinedItems = [...existingItemsWithTracking, ...newlyAddedItemsWithTracking];
    const subtotal = combinedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const gst = Math.round(subtotal * 0.05);
    const packagingCharge = 0;
    
    let discountAmount = existingOrder.discountAmount || 0;
    if (existingOrder.appliedCoupon) {
      const coupon = this.getCoupons().find(c => c.code === existingOrder.appliedCoupon);
      if (coupon) {
        if (coupon.type === "percentage") {
          discountAmount = Math.round(subtotal * (coupon.value / 100));
        } else {
          discountAmount = Math.min(coupon.value, subtotal);
        }
      }
    }
    const grandTotal = subtotal + gst + packagingCharge - discountAmount;

    const timeline = existingOrder.timeline || [
      { event: "Order Created", timestamp: existingOrder.createdAt, details: "Initial order created." }
    ];
    timeline.push({
      event: "Additional Items Added",
      timestamp: new Date().toISOString(),
      details: `Added ${newlyAddedItemsWithTracking.length} items via ${kotNumber}.`
    });

    const updatedOrder: Order = {
      ...existingOrder,
      items: combinedItems,
      subtotal,
      gst,
      grandTotal,
      discountAmount,
      timeline,
      addOnCount
    };

    if (idx !== -1) {
      orders.splice(idx, 1);
      orders.unshift(updatedOrder);
      this.saveOrders(orders);
    } else {
      orders.unshift(updatedOrder);
      this.saveOrders(orders);
    }

    // Add add-on KOT
    const freshKOT: KOT = {
      id: kotNumber,
      orderId: existingOrder.id,
      tableNumber: existingOrder.tableNumber || "Takeaway",
      customerName: existingOrder.customerName,
      orderType: existingOrder.orderType,
      status: "New Order",
      specialInstructions: newlyAddedItemsWithTracking.map(i => i.customization).filter(Boolean).join(", ") || "None",
      createdAt: new Date().toISOString(),
      preparationTime: 15,
      items: newlyAddedItemsWithTracking.map(item => ({
        menuItemId: item.menuItemId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        customization: item.customization
      })),
      isAddOn: true
    };

    const localKOTs = this.getKOTs();
    localKOTs.unshift(freshKOT);
    this.saveKOTs(localKOTs);

    // Trigger background Supabase sync
    try {
      await this.apiSyncOrderTimelineAndItems(existingOrder.id, combinedItems, timeline, addOnCount);
      await this.apiAddOrderItems(existingOrder.id, newlyAddedItemsWithTracking);
      await this.apiAddKOT(freshKOT);
    } catch (err) {
      console.warn("[apiMergeIntoExistingOrder Sync warning]", err);
    }

    // Dispatch events
    const event = new CustomEvent("new_order", { detail: updatedOrder });
    window.dispatchEvent(event);
    window.dispatchEvent(new Event("storage"));

    // Play sound
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      // Audio lock bypass
    }

    // Fire auto print notification for printers
    window.dispatchEvent(new CustomEvent("order_updated_auto_print", {
      detail: { orderId: existingOrder.id, kotId: kotNumber }
    }));

    return updatedOrder;
  }

  static async apiAddOrder(order: Omit<Order, "id" | "createdAt">): Promise<Order> {
    debugLog(`[QR ORDER] Initializing order placement - Type: ${order.orderType}, Table: ${order.tableNumber || 'None'}, Items: ${order.items.length}, Grand Total: ₹${order.grandTotal}`);

    // Core boundary validation for Table QR code source
    if (order.orderType === "dine-in") {
      if (!order.tableNumber || !String(order.tableNumber).trim()) {
        console.error("[QR ORDER] Validation Error: Missing Table Number for Dine-In order.");
        throw new Error("Missing Table Number: Dine-In checkout requires a table QR source.");
      }
    }

    const newId = `SR-${Date.now().toString().slice(-6)}`;
    const kotNumber = `KOT-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;

    const determinedSource: string = (order as any).source || (
      (order as any).billedBy?.toUpperCase().includes("POS") || (order as any).paymentMethod?.toUpperCase().includes("POS")
        ? "POS"
        : (order.orderType === "dine-in" && order.tableNumber ? "QR" : "ONLINE")
    );

    const initialItemsWithTracking = order.items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      customization: item.customization || "",
      addedAt: new Date().toISOString(),
      addedBy: (order as any).billedBy || (determinedSource === "POS" ? "POS" : (order.orderType === "dine-in" ? "Table QR" : "Online Guest")),
      kotNumber: kotNumber,
      sessionNumber: 1
    }));

    const timeline = [
      { event: "Order Created", timestamp: new Date().toISOString(), details: `Initial order created with ${order.items.length} items from ${determinedSource}.` }
    ];

    const activeShift = this.getActiveShift();
    const effectiveShiftId = (order as any).shiftId || activeShift?.id;

    const isTakeaway = (order.orderType || "").toLowerCase() === "takeaway";
    const subtotal = Number(order.subtotal || 0);
    const discountAmount = Number(order.discountAmount || 0);
    const gst = Number(order.gst || 0);
    const packagingCharge = isTakeaway ? 0 : Number(order.packagingCharge || 0);
    const grandTotal = isTakeaway
      ? Math.max(0, Math.round(subtotal - discountAmount + gst))
      : Number(order.grandTotal ?? Math.round(subtotal - discountAmount + gst + packagingCharge));

    const fullOrder: Order = {
      ...order,
      packagingCharge,
      grandTotal,
      source: determinedSource,
      shiftId: effectiveShiftId,
      items: initialItemsWithTracking,
      id: newId,
      createdAt: new Date().toISOString(),
      timeline,
      addOnCount: 0,
      kotNumber: kotNumber
    };

    // Prepare Supabase Payload
    const payload: any = {
      id: fullOrder.id,
      customer_name: fullOrder.customerName,
      phone_number: fullOrder.phoneNumber,
      email: fullOrder.email,
      order_type: fullOrder.orderType,
      table_number: fullOrder.tableNumber || null,
      address: fullOrder.address || null,
      items: fullOrder.items,
      subtotal: Number(fullOrder.subtotal || 0),
      gst: Number(fullOrder.gst || 0),
      packaging_charge: Number(fullOrder.packagingCharge || 0),
      discount_amount: Number(fullOrder.discountAmount || 0),
      applied_coupon: fullOrder.appliedCoupon || null,
      grand_total: Number(fullOrder.grandTotal || 0),
      payment_status: fullOrder.paymentStatus || "Pending",
      order_status: fullOrder.orderStatus || "New Order",
      created_at: fullOrder.createdAt,
      payment_method: fullOrder.paymentMethod || "Cash on Delivery",
      kot_number: kotNumber,
      special_instructions: `[SOURCE:${determinedSource}]`,
      restaurant_id: null
    };

    debugLog("[SUPABASE ORDER INSERT] Submitting payload to Supabase 'orders':", payload);

    try {
      const { data, error, status } = await supabase
        .from("orders")
        .insert(payload)
        .select();

      if (error) {
        console.error("[SUPABASE ORDER INSERT] FAILED with status " + status + ":", error);
        
        // If client is online and Supabase returned a real error, reject with clear message
        if (typeof navigator !== "undefined" && navigator.onLine) {
          this.addAuditLog(
            "Supabase Sync Error",
            `HTTP ${status} - Error inserting order to server: ${error.message} (${error.details || ""}).`,
            "System"
          );
          throw new Error(`Order database submission failed: ${error.message || 'Database error'}`);
        } else {
          // Offline fallback
          console.warn("[SUPABASE ORDER INSERT] Device is offline. Storing order in local cache for background sync.");
        }
      } else {
        debugLog(`[SUPABASE ORDER INSERT] SUCCESS! Order ${newId} inserted into Supabase:`, data);
        this.addAuditLog(
          "Supabase Sync Success",
          `Order reference ${newId} with total ₹${fullOrder.grandTotal} stored inside cloud database successfully.`,
          "System"
        );
      }
    } catch (err: any) {
      if (err.message && err.message.startsWith("Order database submission failed")) {
        throw err;
      }
      console.warn("[SUPABASE ORDER INSERT] Network transport error:", err);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        debugLog("[SUPABASE ORDER INSERT] Offline mode active.");
      } else {
        throw new Error(`Unable to reach order server: ${err.message || "Network error"}. Please check your connection and retry.`);
      }
    }

    // Update LocalDB cache
    const current = this.getOrders();
    if (!current.some(o => o.id === fullOrder.id)) {
      current.unshift(fullOrder);
      this.saveOrders(current);
    }

    // Auto-record payment ledger entry if created as Paid and no payments exist
    if (fullOrder.paymentStatus === "Paid" && fullOrder.grandTotal > 0) {
      const existingPayments = this.getPaymentsForOrder(fullOrder.id);
      if (existingPayments.length === 0) {
        const autoPayment: PaymentRecord = {
          id: `PAY-${Date.now()}-0-${Math.floor(Math.random() * 900 + 100)}`,
          orderId: fullOrder.id,
          shiftId: effectiveShiftId,
          amount: fullOrder.grandTotal,
          paymentMethod: fullOrder.paymentMethod || "Cash on Delivery",
          status: "Paid",
          createdBy: (order as any).billedBy || "POS System",
          createdAt: fullOrder.createdAt,
          customerName: fullOrder.customerName
        };
        const allPayments = this.getPayments();
        allPayments.push(autoPayment);
        this.savePayments(allPayments);
      }
    }

    // Save KOT locally and in Supabase
    try {
      const freshKOT: KOT = {
        id: kotNumber,
        orderId: fullOrder.id,
        tableNumber: fullOrder.tableNumber || "Takeaway",
        customerName: fullOrder.customerName,
        orderType: fullOrder.orderType,
        status: "New Order",
        specialInstructions: fullOrder.items.map(i => i.customization).filter(Boolean).join(", ") || "None",
        createdAt: fullOrder.createdAt,
        preparationTime: 15,
        items: fullOrder.items
      };
      
      const localKOTs = this.getKOTs();
      if (!localKOTs.some(k => k.id === freshKOT.id)) {
        localKOTs.unshift(freshKOT);
        this.saveKOTs(localKOTs);
      }

      // Trigger child tables sync (order_items and kots)
      await this.apiAddOrderItems(fullOrder.id, fullOrder.items);
      await this.apiAddKOT(freshKOT);
    } catch (childErr) {
      console.warn("[KOT/Items Child Sync Notice]:", childErr);
    }

    // Notify all UI listeners immediately
    const event = new CustomEvent("new_order", { detail: fullOrder });
    window.dispatchEvent(event);
    window.dispatchEvent(new Event("storage"));

    // Play order sound ONLY for genuine Dine-In QR customer orders (POS orders must remain silent)
    if (isDineInQrOrder(fullOrder)) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      } catch (e) {}
    }

    console.log(`[QR ORDER] Order ${fullOrder.id} successfully completed.`);



    return fullOrder;
  }

  static async apiUpdateOrderStatus(orderId: string, status: Order["orderStatus"], paymentStatus?: string, operator: string = "Staff"): Promise<Order> {
    console.log(`[LocalDB & Supabase] Updating Order ${orderId} status to ${status}`);
    
    // 1. UPDATE LOCAL DB FIRST (Guarantees responsive UI and reliable fallback offline)
    const current = this.getOrders();
    const idx = current.findIndex(o => o.id === orderId);
    let previousStatus = "";
    let previousPaymentStatus = "";
    let orderCopy: Order | null = null;
    const nowIso = new Date().toISOString();

    if (idx !== -1) {
      previousStatus = current[idx].orderStatus;
      previousPaymentStatus = current[idx].paymentStatus || "Pending";
      current[idx].orderStatus = status;
      current[idx].statusUpdatedBy = operator;
      current[idx].version = (current[idx].version || 1) + 1;

      // Lifecycle timestamp tracking
      const sNorm = (status || "").trim().toLowerCase();
      if ((sNorm === "confirmed" || sNorm === "accepted" || sNorm === "new order") && !current[idx].confirmedAt) {
        current[idx].confirmedAt = nowIso;
      } else if ((sNorm === "preparing" || sNorm === "in kitchen") && !current[idx].preparingAt) {
        current[idx].preparingAt = nowIso;
      } else if (sNorm === "ready" && !current[idx].readyAt) {
        current[idx].readyAt = nowIso;
      } else if (sNorm === "served" && !current[idx].servedAt) {
        current[idx].servedAt = nowIso;
      } else if (sNorm === "packed" && !current[idx].packedAt) {
        current[idx].packedAt = nowIso;
      } else if ((sNorm === "out for delivery" || sNorm === "out_for_delivery") && !current[idx].dispatchedAt) {
        current[idx].dispatchedAt = nowIso;
      } else if (sNorm === "delivered" && !current[idx].deliveredAt) {
        current[idx].deliveredAt = nowIso;
      } else if (sNorm === "completed" && !current[idx].completedAt) {
        current[idx].completedAt = nowIso;
      } else if (sNorm === "cancelled") {
        current[idx].cancelledAt = nowIso;
      } else if (sNorm === "voided") {
        current[idx].voidedAt = nowIso;
      }

      if (paymentStatus) {
        current[idx].paymentStatus = paymentStatus as any;
      }

      // Append Timeline Event
      if (!current[idx].timeline) current[idx].timeline = [];
      current[idx].timeline.push({
        event: `Status: ${status}`,
        timestamp: nowIso,
        operator,
        previousStatus,
        newStatus: status,
        details: `Order status transitioned from '${previousStatus}' to '${status}' by ${operator}`
      });

      // Table Management
      if (current[idx].orderType === "dine-in" && current[idx].tableNumber) {
        const tables = this.getTables();
        const t = tables.find(tbl => tbl.tableNumber === current[idx].tableNumber || tbl.id === current[idx].tableNumber);
        if (t) {
          if (sNorm === "completed" || sNorm === "cancelled" || sNorm === "voided") {
            if (current[idx].paymentStatus === "Paid" || sNorm === "cancelled" || sNorm === "voided") {
              t.status = "Available";
              this.saveTables(tables);
            }
          } else if (sNorm === "confirmed" || sNorm === "preparing" || sNorm === "ready" || sNorm === "served") {
            if (t.status !== "Occupied") {
              t.status = "Occupied";
              this.saveTables(tables);
            }
          }
        }
      }

      // KOT Sync
      const kots = this.getKOTs();
      let kotsModified = false;
      for (const kot of kots) {
        if (kot.orderId === orderId) {
          if (sNorm === "preparing" && kot.status === "New Order") {
            kot.status = "Preparing";
            kotsModified = true;
          } else if (sNorm === "ready" && (kot.status === "Preparing" || kot.status === "New Order" || kot.status === "Accepted")) {
            kot.status = "Ready";
            kotsModified = true;
          } else if (sNorm === "served" && kot.status !== "Served" && kot.status !== "Cancelled") {
            kot.status = "Served";
            kotsModified = true;
          } else if ((sNorm === "cancelled" || sNorm === "voided") && kot.status !== "Cancelled") {
            kot.status = "Cancelled";
            kotsModified = true;
          }
        }
      }
      if (kotsModified) {
        this.saveKOTs(kots);
        window.dispatchEvent(new Event("kots_updated"));
      }

      this.saveOrders(current);
      orderCopy = { ...current[idx] };
      // Dispatch storage event so other components and tabs update immediately
      window.dispatchEvent(new Event("storage"));
    }

    // 2. ATTEMPT SUPABASE SYNC IN BACKGROUND / GRACEFULLY
    try {
      const updatePayload: any = { 
        order_status: status,
        confirmed_at: current[idx]?.confirmedAt || null,
        preparing_at: current[idx]?.preparingAt || null,
        ready_at: current[idx]?.readyAt || null,
        served_at: current[idx]?.servedAt || null,
        packed_at: current[idx]?.packedAt || null,
        dispatched_at: current[idx]?.dispatchedAt || null,
        delivered_at: current[idx]?.deliveredAt || null,
        completed_at: current[idx]?.completedAt || null,
        cancelled_at: current[idx]?.cancelledAt || null,
        voided_at: current[idx]?.voidedAt || null,
        status_updated_by: operator,
        version: current[idx]?.version || 1,
        timeline: current[idx]?.timeline || []
      };
      if (paymentStatus) {
        updatePayload.payment_status = paymentStatus;
      }

      const { error, status: httpStatus } = await supabase
         .from("orders")
         .update(updatePayload)
         .eq("id", orderId);

      if (error) {
        console.warn("[Supabase API Sync Warning] Order status update failed on remote server:", error);
      } else {
        console.log(`[Supabase API Sync Success] Order ${orderId} synced.`);
      }
    } catch (err: any) {
      console.warn("[Supabase API Network Exception] Relying on local database:", err);
    }

    if (orderCopy) {
      window.dispatchEvent(new CustomEvent("order_updated_auto_print", {
        detail: {
          order: orderCopy,
          previousStatus,
          previousPaymentStatus
        }
      }));


    }

    // 3. Always return the updated local order
    return current[idx] || { id: orderId, orderStatus: status, paymentStatus: paymentStatus } as any;
  }

  static supportedColumns: string[] = [];

  static async detectSupportedColumns(): Promise<string[]> {
    if (this.supportedColumns.length > 0) return this.supportedColumns;
    
    const candidateColumns = [
      "id", "name", "item_name", "price", "category", "description", 
      "is_veg", "best_seller", "chef_special", "special", "is_bestseller", "is_chef_special", "image", "image_url", 
      "spiciness", "rating", "rating_count",
      "gst_percent", "gst_percentage", "gst", "hsn_code", "hsn", "available", "is_available"
    ];
    
    const detected: string[] = [];
    for (const col of candidateColumns) {
      try {
        const { error } = await supabase.from("menu_items").select(col).limit(1);
        if (!error || error.code !== "42703") {
          detected.push(col);
        }
      } catch (e) {
        // Fallback to including it if unsure
        detected.push(col);
      }
    }
    this.supportedColumns = detected;
    return detected;
  }

  static findMatchingCategoryId(inputCat: string): string {
    const activeCategories = this.getCategories();
    if (!inputCat) return activeCategories[0]?.id || "soups";
    const normalizedInput = inputCat.trim().toLowerCase();
    
    // Try exact match on ID
    const matchById = activeCategories.find(c => c.id.toLowerCase() === normalizedInput);
    if (matchById) return matchById.id;

    // Try exact match on name
    const matchByName = activeCategories.find(c => c.name.toLowerCase() === normalizedInput);
    if (matchByName) return matchByName.id;

    // Try matched slugified (replace space with dash)
    const slugified = normalizedInput.replace(/\s+/g, "-");
    const matchBySlug = activeCategories.find(c => c.id.toLowerCase() === slugified || c.name.toLowerCase().replace(/\s+/g, "-") === slugified);
    if (matchBySlug) return matchBySlug.id;

    // Try partial match or word match (e.g. "Main Course" -> matches "Indian Main Course")
    const matchByPartial = activeCategories.find(c => {
      const nameLower = c.name.toLowerCase();
      const idLower = c.id.toLowerCase();
      return nameLower.includes(normalizedInput) || normalizedInput.includes(nameLower) || idLower.includes(normalizedInput) || normalizedInput.includes(idLower);
    });
    if (matchByPartial) return matchByPartial.id;

    // If no match found, preserve the input category directly instead of forcing to soups
    return inputCat.trim();
  }

  static mapDatabaseMenuItem(item: any): MenuItem {
    if (!item) {
      return {
        id: `item-${Date.now()}-${Math.random()}`,
        itemCode: "ITEM-UNKNOWN",
        category: "soups",
        name: "Unnamed Item",
        description: "",
        price: 0,
        isVeg: true,
        imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500",
        rating: 4.5,
        ratingCount: 0,
        isBestseller: false,
        isChefSpecial: false,
        spiciness: 0,
      };
    }

    const rawId = item.id !== undefined && item.id !== null ? String(item.id) : `item-${Date.now()}-${Math.random()}`;
    return {
      id: rawId,
      itemCode: item.item_code || `ITEM-${rawId.toUpperCase()}`,
      category: this.findMatchingCategoryId(item.category),
      name: item.name || item.item_name || "Unnamed Item",
      description: item.description || "",
      price: Number(item.price || 0),
      isVeg: item.is_veg !== undefined && item.is_veg !== null 
        ? !!item.is_veg 
        : (item.food_type 
            ? (String(item.food_type).trim().toLowerCase() === "veg") 
            : true),
      imageUrl: item.image_url || item.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500",
      rating: Number(item.rating !== undefined && item.rating !== null ? item.rating : 4.5),
      ratingCount: Number(item.rating_count !== undefined && item.rating_count !== null ? item.rating_count : (item.ratingCount || 0)),
      isBestseller: item.best_seller !== undefined && item.best_seller !== null 
        ? !!item.best_seller 
        : (item.is_bestseller !== undefined && item.is_bestseller !== null ? !!item.is_bestseller : !!item.isBestseller),
      isChefSpecial: item.chef_special !== undefined && item.chef_special !== null 
        ? !!item.chef_special 
        : (item.is_chef_special !== undefined && item.is_chef_special !== null ? !!item.is_chef_special : !!item.isChefSpecial),
      spiciness: Number(item.spiciness !== undefined && item.spiciness !== null ? item.spiciness : 0),
      gstPercent: item.gst_percent !== undefined ? Number(item.gst_percent) : (item.gst_percentage !== undefined ? Number(item.gst_percentage) : (item.gst !== undefined ? Number(item.gst) : undefined)),
      hsnCode: item.hsn_code || item.hsn || undefined,
      available: item.available !== undefined ? !!item.available : (item.is_available !== undefined ? !!item.is_available : undefined),
    };
  }

  static mapMenuItemForInsert(item: MenuItem, supportedColumns: string[]): any {
    const obj: any = {};
    const isPureDigits = /^\d+$/.test(item.id);
    obj.id = isPureDigits ? Number(item.id) : item.id;

    if (supportedColumns.includes("item_code")) {
      obj.item_code = item.itemCode || `ITEM-${item.id.toUpperCase()}`;
    }
    if (supportedColumns.includes("category")) {
      obj.category = item.category;
    }
    if (supportedColumns.includes("name")) {
      obj.name = item.name;
    }
    if (supportedColumns.includes("item_name")) {
      obj.item_name = item.name;
    }
    if (supportedColumns.includes("description")) {
      obj.description = item.description;
    }
    if (supportedColumns.includes("price")) {
      obj.price = Number(item.price || 0);
    }
    if (supportedColumns.includes("is_veg")) {
      obj.is_veg = item.isVeg;
    }
    if (supportedColumns.includes("food_type")) {
      obj.food_type = item.isVeg ? "Veg" : "Non-Veg";
    }
    if (supportedColumns.includes("image_url")) {
      obj.image_url = item.imageUrl;
    }
    if (supportedColumns.includes("image")) {
      obj.image = item.imageUrl;
    }
    if (supportedColumns.includes("rating")) {
      obj.rating = Number(item.rating !== undefined ? item.rating : 4.5);
    }
    if (supportedColumns.includes("rating_count")) {
      obj.rating_count = Number(item.ratingCount !== undefined ? item.ratingCount : 0);
    }
    if (supportedColumns.includes("best_seller")) {
      obj.best_seller = !!item.isBestseller;
    } else if (supportedColumns.includes("is_bestseller")) {
      obj.is_bestseller = !!item.isBestseller;
    }
    if (supportedColumns.includes("chef_special")) {
      obj.chef_special = !!item.isChefSpecial;
    } else if (supportedColumns.includes("is_chef_special")) {
      obj.is_chef_special = !!item.isChefSpecial;
    }
    if (supportedColumns.includes("special")) {
      obj.special = !!item.isChefSpecial || !!item.isBestseller;
    }
    if (supportedColumns.includes("spiciness")) {
      obj.spiciness = Number(item.spiciness !== undefined ? item.spiciness : 0);
    }
    if (supportedColumns.includes("gst_percent")) {
      obj.gst_percent = Number(item.gstPercent !== undefined ? item.gstPercent : 5);
    } else if (supportedColumns.includes("gst_percentage")) {
      obj.gst_percentage = Number(item.gstPercent !== undefined ? item.gstPercent : 5);
    } else if (supportedColumns.includes("gst")) {
      obj.gst = Number(item.gstPercent !== undefined ? item.gstPercent : 5);
    }
    if (supportedColumns.includes("hsn_code")) {
      obj.hsn_code = item.hsnCode || "";
    } else if (supportedColumns.includes("hsn")) {
      obj.hsn = item.hsnCode || "";
    }
    if (supportedColumns.includes("available")) {
      obj.available = item.available !== undefined ? item.available : true;
    } else if (supportedColumns.includes("is_available")) {
      obj.is_available = item.available !== undefined ? item.available : true;
    }

    return obj;
  }

  static mapMenuItemForUpdate(item: MenuItem, supportedColumns: string[]): any {
    return this.mapMenuItemForInsert(item, supportedColumns);
  }

  static async fetchMenuItems(): Promise<MenuItem[]> {
    this.incrementApiCallCount("fetchMenuItems");
    console.log("[Supabase API Request] Loading menus list with robust fallback mapping...");
    try {
      const { data, error, status } = await supabase
        .from("menu_items")
        .select("*");

      if (error) {
        console.warn("[Supabase API Error] Menu catalog load failed:", error);
        this.addAuditLog(
          "Catalog Sync Error",
          `HTTP ${status} - Failed to fetch menu catalog from Supabase: ${error.message}. Using offline defaults.`,
          "System (Supabase)"
        );
        return this.getMenuItems();
      }

      console.log("[Supabase API Response] Successfully fetched menus count:", data?.length);

      if (!data || data.length === 0) {
        console.log("[Supabase API] Menu table is empty in Supabase.");
        this.saveMenuItems([]);
        return [];
      }

      const mapped: MenuItem[] = (data || []).map((item: any) => this.mapDatabaseMenuItem(item));

      // De-duplicate items by category and name (uniqueness is per category using existing category column)
      const uniqueMapped: MenuItem[] = [];
      const seenKeys = new Set<string>();
      
      for (const item of mapped) {
        const key = `${(item.category || "").toLowerCase().trim()}::${(item.name || "").toLowerCase().trim()}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueMapped.push(item);
        }
      }

      // Identify actual duplicates in the database to trigger a background cleanup (uniqueness is per category and name)
      const duplicateIds: any[] = [];
      const seenDbKeys = new Set<string>();
      
      for (const item of (data || [])) {
        const mappedItem = this.mapDatabaseMenuItem(item);
        const key = `${(mappedItem.category || "").toLowerCase().trim()}::${(mappedItem.name || "").toLowerCase().trim()}`;
        if (seenDbKeys.has(key)) {
          duplicateIds.push(item.id);
        } else {
          seenDbKeys.add(key);
        }
      }

      if (duplicateIds.length > 0) {
        console.log("[Supabase API] Detected duplicate item rows in database. Cleaning up background IDs:", duplicateIds);
        supabase.from("menu_items").delete().in("id", duplicateIds).then(({ error }) => {
          if (error) console.error("[Supabase API] Background duplicate cleanup failed:", error);
          else console.log("[Supabase API] Background duplicate cleanup completed successfully.");
        });
      }

      // Sort on frontend to avoid database column order issues
      uniqueMapped.sort((a, b) => a.name.localeCompare(b.name));

      // Dynamically sync categories derived from actual Supabase menu items
      const uniqueCategoryNames = Array.from(new Set(uniqueMapped.map(it => it.category).filter(Boolean)));
      if (uniqueCategoryNames.length > 0) {
        const existingCats = this.getCategories();
        const catMap = new Map<string, Category>();
        for (const c of existingCats) {
          catMap.set(c.id.toLowerCase().trim(), c);
          catMap.set(c.name.toLowerCase().trim(), c);
        }
        const emojiMap: Record<string, string> = {
          soup: "🍲",
          starter: "🥟",
          "crispy starter": "🥢",
          "veg noodles": "🍜",
          "veg rice": "🍚",
          rolls: "🌯",
          combo: "🍱",
          beverages: "🥤",
          drinks: "🥤",
          dessert: "🍨",
          desserts: "🍨",
          main: "🍛"
        };
        for (const cName of uniqueCategoryNames) {
          const lower = cName.toLowerCase().trim();
          if (!catMap.has(lower)) {
            const newCat: Category = {
              id: cName,
              name: cName,
              icon: emojiMap[lower] || "🍽️",
              description: `Authentic ${cName} specialties`
            };
            catMap.set(lower, newCat);
          }
        }
        this.saveCategories(Array.from(new Set(Array.from(catMap.values()))));
      }

      this.saveMenuItems(uniqueMapped);
      return uniqueMapped;
    } catch (err: any) {
      console.error("[Menu Transport Sync Error]", err);
      return this.getMenuItems();
    }
  }

  static async apiSaveMenuItems(items: MenuItem[]): Promise<void> {
    this.incrementApiCallCount("apiSaveMenuItems");
    try {
      const supported = await this.detectSupportedColumns();
      console.log("[Supabase API] Supported columns on menu_items table detected:", supported);

      // 1. Fetch current database state to check what actually exists using verified existing columns only
      const { data: dbItems, error: fetchErr } = await supabase
        .from("menu_items")
        .select("id, name, category");

      if (fetchErr) {
        console.warn("[Supabase Sync Warning] Failed to fetch current items for matching, proceeding with empty array:", fetchErr);
      }

      const existingDbItems = dbItems || [];

      // 2. Classify items into Updates and Inserts with strict validation
      const updates: { id: any; payload: any; item: MenuItem }[] = [];
      const inserts: { payload: any; item: MenuItem }[] = [];
      const matchedDbIds = new Set<any>();

      for (const item of items) {
        // Find if this item has an existing match in the database by ID
        let dbMatch: any = null;

        const isNumericId = /^\d+$/.test(String(item.id));
        if (isNumericId) {
          const numId = Number(item.id);
          dbMatch = existingDbItems.find((x: any) => Number(x.id) === numId);
        } else {
          dbMatch = existingDbItems.find((x: any) => String(x.id).toLowerCase() === String(item.id).toLowerCase());
        }

        // If not matched by ID, but it is a standard default seeded item (e.g. s1, s2, i1, i2, etc. or a numeric index),
        // we try to resolve it to an existing database row by Name + Category to prevent duplicate inserts and bridge IDs.
        const isDefaultSeededItem = /^s\d+$/.test(String(item.id)) || /^\d+$/.test(String(item.id)) || /^i\d+$/.test(String(item.id));
        if (!dbMatch && isDefaultSeededItem && item.name && item.category) {
          dbMatch = existingDbItems.find(
            (x: any) =>
              String(x.name || "").trim().toLowerCase() === String(item.name).trim().toLowerCase() &&
              String(x.category || "").trim().toLowerCase() === String(item.category).trim().toLowerCase()
          );
        }

        const operation = dbMatch ? "UPDATE" : "CREATE";

        // Requirement 1 & 2: Log every item before saving with detailed fields
        console.log(`\n=== [Supabase API Sync Item Pre-Save Log] ===`);
        console.log(`- Local ID: ${item.id}`);
        console.log(`- Database Matched ID: ${dbMatch ? dbMatch.id : "None"}`);
        console.log(`- Name: "${item.name}"`);
        console.log(`- Category: "${item.category}"`);
        console.log(`- Chosen Operation: ${operation}`);

        // Requirement 3: If classified as CREATE, explain exactly why no existing database row was matched
        if (operation === "CREATE") {
          console.log(`- Explanation for CREATE classification:`);
          console.log(`  1. No existing database row has an ID matching "${item.id}" (searched case-insensitively and numerically).`);
          
          const duplicateByNameAndCat = existingDbItems.find(
            (x: any) =>
              String(x.name || "").trim().toLowerCase() === String(item.name).trim().toLowerCase() &&
              String(x.category || "").trim().toLowerCase() === String(item.category).trim().toLowerCase()
          );

          if (duplicateByNameAndCat) {
            console.log(`  2. WARNING: A row with name "${item.name}" and category "${item.category}" ALREADY exists in the database with ID "${duplicateByNameAndCat.id}"!`);
            console.log(`     However, it was NOT matched because the local item ID is "${item.id}" which is not in a default seeded pattern (e.g., s1, s2 or numeric), so ID bridging was not applied.`);
          } else {
            console.log(`  2. No database row matches both the name "${item.name}" and category "${item.category}" case-insensitively.`);
            const partialNameMatch = existingDbItems.find(
              (x: any) => String(x.name || "").trim().toLowerCase() === String(item.name).trim().toLowerCase()
            );
            if (partialNameMatch) {
              console.log(`     (Note: A database row with the name "${partialNameMatch.name}" exists but in category "${partialNameMatch.category}" instead of "${item.category}").`);
            }
          }
        }

        // Prepare the mapped payload object
        const mappedPayload = this.mapMenuItemForInsert(item, supported);
        // ALWAYS delete id from updates (it's specified in .eq("id", id))
        delete mappedPayload.id;

        if (dbMatch) {
          // This is an EDIT operation!
          // Check if another item in the database already has the same name and category
          const duplicate = existingDbItems.find(
            (x: any) =>
              String(x.id) !== String(dbMatch.id) &&
              String(x.name || "").trim().toLowerCase() === String(item.name).trim().toLowerCase() &&
              String(x.category || "").trim().toLowerCase() === String(item.category).trim().toLowerCase()
          );

          if (duplicate) {
            console.error(`[Supabase Validation Error] Cannot edit item. A menu item with name "${item.name}" already exists in category "${item.category}".`);
            throw new Error("A menu item with this name already exists in this category.");
          }

          updates.push({
            id: dbMatch.id,
            payload: mappedPayload,
            item
          });
          matchedDbIds.add(dbMatch.id);
        } else {
          // This is a CREATE operation!
          // Check whether a row already exists with the same unique fields
          const duplicate = existingDbItems.find(
            (x: any) =>
              String(x.name || "").trim().toLowerCase() === String(item.name).trim().toLowerCase() &&
              String(x.category || "").trim().toLowerCase() === String(item.category).trim().toLowerCase()
          );

          if (duplicate) {
            console.error(`[Supabase Validation Error] Cannot create item. A menu item with name "${item.name}" already exists in category "${item.category}".`);
            throw new Error("A menu item with this name already exists in this category.");
          }

          // Generate a valid UUID for the new item if the current id is not a UUID
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(item.id));
          const newId = isUuid ? item.id : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });

          mappedPayload.id = newId;

          inserts.push({
            payload: mappedPayload,
            item
          });
        }
      }

      // 3. Delete items that are in the database but no longer in the frontend list
      const deleteIds = existingDbItems
        .map((x: any) => x.id)
        .filter((id: any) => !matchedDbIds.has(id));

      if (deleteIds.length > 0) {
        console.log(`[Supabase API Sync] Deleting ${deleteIds.length} removed items from database...`);
        for (const id of deleteIds) {
          console.log("Operation: DELETE");
          console.log("Item ID:", id);
          console.log("Data: { id: " + JSON.stringify(id) + " }");
          console.log(`Executing Supabase query: supabase.from("menu_items").delete().eq("id", "${id}")`);

          const { error: delErr } = await supabase
            .from("menu_items")
            .delete()
            .eq("id", id);

          if (delErr) {
            console.error(`[Supabase Sync Error] Failed to delete removed menu item ID ${id}:`, delErr);
            throw new Error(`Database rejected deletion of menu item ${id}: ${delErr.message}`);
          }
        }
      }

      // 4. Perform Updates
      if (updates.length > 0) {
        console.log(`[Supabase API Sync] Updating ${updates.length} items...`);
        for (const update of updates) {
          const sqlEquivalent = `UPDATE public.menu_items SET ${Object.entries(update.payload).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(", ")} WHERE id = '${update.id}';`;
          const stackTrace = new Error("Stack trace collector").stack || "";

          console.log("\n=== [Supabase Diagnostic Log] Before UPDATE ===");
          // Requirement 4: Before executing database query, print whether calling insert() or update()
          console.log("Calling: update() on table 'menu_items'");
          console.log("Responsible File: /src/lib/db.ts");
          console.log("Responsible Function: LocalDB.apiSaveMenuItems");
          console.log("Operation: UPDATE");
          console.log("Payload:", JSON.stringify(update.payload, null, 2));
          console.log("SQL Equivalent:", sqlEquivalent);
          console.log("ID Target:", update.id);
          console.log("Stack Trace:\n", stackTrace);

          try {
            const { error: updateErr } = await supabase
              .from("menu_items")
              .update(update.payload)
              .eq("id", update.id);

            console.log("\n=== [Supabase Diagnostic Log] After UPDATE ===");
            console.log("Returned ID:", update.id);
            console.log("Returned Error:", updateErr ? JSON.stringify(updateErr, null, 2) : "None (Success)");

            if (updateErr) {
              console.error(`[Supabase API Sync Error] Failed to update item ID ${update.id}:`, updateErr);
              this.addAuditLog(
                "Supabase Sync Error",
                `Database rejected update for item ${update.id}: ${updateErr.message}`,
                "System"
              );
              throw new Error(`Supabase rejected update on menu item (${update.id}): ${updateErr.message}`);
            }
          } catch (err: any) {
            console.error("[Supabase Sync Error on Update]:", err.message);
            throw err;
          }
        }
      }

      // 5. Perform Inserts
      if (inserts.length > 0) {
        console.log(`[Supabase API Sync] Inserting ${inserts.length} new items...`);
        for (const insert of inserts) {
          const sqlEquivalent = `INSERT INTO public.menu_items (${Object.keys(insert.payload).join(", ")}) VALUES (${Object.values(insert.payload).map(v => JSON.stringify(v)).join(", ")});`;
          const stackTrace = new Error("Stack trace collector").stack || "";

          console.log("\n=== [Supabase Diagnostic Log] Before CREATE ===");
          console.log("Calling: insert() on table 'menu_items'");
          console.log("Responsible File: /src/lib/db.ts");
          console.log("Responsible Function: LocalDB.apiSaveMenuItems");
          console.log("Operation: CREATE");
          console.log("Payload:", JSON.stringify(insert.payload, null, 2));
          console.log("SQL Equivalent:", sqlEquivalent);
          console.log("ID Target:", insert.payload.id);
          console.log("Stack Trace:\n", stackTrace);

          try {
            const { error: insertErr } = await supabase
              .from("menu_items")
              .insert([insert.payload]);

            console.log("\n=== [Supabase Diagnostic Log] After CREATE ===");
            console.log("Returned ID:", insert.payload.id);
            console.log("Returned Error:", insertErr ? JSON.stringify(insertErr, null, 2) : "None (Success)");

            if (insertErr) {
              console.error("[Supabase API Sync Error] Failed to insert new item into cloud database:", insertErr);
              this.addAuditLog(
                "Supabase Sync Error",
                `Database rejected insert for item "${insert.item.name}": ${insertErr.message}`,
                "System"
              );
              throw new Error(`Supabase rejected insert on menu_items: ${insertErr.message}`);
            }
          } catch (err: any) {
            console.error("[Supabase Sync Error on Insert]:", err.message);
            throw err;
          }
        }
      }

      console.log("[Supabase API Sync Success] Database catalog successfully fully updated and synced.");
      this.saveMenuItems(items);
      this.addAuditLog("Menu Catalog Saved", `Catalog containing ${items.length} dishes updated inside Supabase and local disk.`, "Admin (owner)");
    } catch (err: any) {
      console.error("[Menu Sync Exception - Database mutation failed]", err);
      throw err;
    }
  }

  static async fetchInventory(): Promise<InventoryItem[]> {
    this.incrementApiCallCount("fetchInventory");
    try {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .order("name", { ascending: true });

      if (error) {
        console.warn("[Supabase] inventory missing. Falling back to local storage.", error);
        return this.getInventory();
      }

      const mapped: InventoryItem[] = (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        stock: Number(item.stock || 0),
        unit: item.unit || "kg",
        minAlertLevel: Number(item.min_alert_level || 10),
        category: item.category || "Other",
        lastRestocked: item.last_restocked || new Date().toISOString().split("T")[0]
      }));

      this.saveInventory(mapped);
      return mapped;
    } catch {
      return this.getInventory();
    }
  }

  static async apiSaveInventory(inventory: InventoryItem[]): Promise<void> {
    const payload = inventory.map(item => ({
      id: item.id,
      name: item.name,
      stock: Number(item.stock || 0),
      unit: item.unit,
      min_alert_level: Number(item.minAlertLevel || 10),
      category: item.category,
      last_restocked: item.lastRestocked
    }));

    try {
      const { error } = await supabase.from("inventory").upsert(payload);
      if (error) throw error;
      this.saveInventory(inventory);
    } catch (err) {
      console.error("[Supabase Inventory Sync Failed]", err);
      this.saveInventory(inventory);
    }
  }

  static async fetchCoupons(): Promise<Coupon[]> {
    this.incrementApiCallCount("fetchCoupons");
    try {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .order("code", { ascending: true });

      if (error) {
        console.warn("[Supabase] 'coupons' table missing. Using client defaults.", error);
        return this.getCoupons();
      }

      const mapped: Coupon[] = (data || []).map((item: any) => ({
        code: item.code,
        type: item.type || "percentage",
        value: Number(item.value || 0),
        expiryDate: item.expiry_date || "2200-12-31",
        usageLimit: Number(item.usage_limit || 100),
        usageCount: Number(item.usage_count || 0),
        minOrderAmount: item.min_order_amount ? Number(item.min_order_amount) : undefined
      }));

      this.saveCoupons(mapped);
      return mapped;
    } catch {
      return this.getCoupons();
    }
  }

  static async apiSaveCoupons(coupons: Coupon[]): Promise<void> {
    const payload = coupons.map(item => ({
      code: item.code,
      type: item.type,
      value: Number(item.value || 0),
      expiry_date: item.expiryDate,
      usage_limit: Number(item.usageLimit || 100),
      usage_count: Number(item.usageCount || 0),
      min_order_amount: item.minOrderAmount || null
    }));

    try {
      const { error } = await supabase.from("coupons").upsert(payload);
      if (error) throw error;
      this.saveCoupons(coupons);
    } catch (err) {
      console.error("[Supabase Coupons Sync Failed]", err);
      this.saveCoupons(coupons);
    }
  }

  static async fetchReviews(): Promise<Review[]> {
    this.incrementApiCallCount("fetchReviews");
    try {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .order("date", { ascending: false });

      if (error) {
        console.warn("[Supabase] 'reviews' query fallback to localStorage.", error);
        return this.getReviews();
      }

      const mapped: Review[] = (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        rating: Number(item.rating || 5),
        date: item.date || new Date().toISOString(),
        comment: item.comment || "",
        avatar: item.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100"
      }));

      this.saveReviews(mapped);
      return mapped;
    } catch {
      return this.getReviews();
    }
  }

  static async apiPostReview(review: Review): Promise<void> {
    const payload = {
      id: review.id,
      name: review.name,
      rating: Number(review.rating || 5),
      date: review.date,
      comment: review.comment,
      avatar: review.avatar
    };

    try {
      const { error } = await supabase.from("reviews").insert(payload);
      if (error) throw error;
      await this.fetchReviews();
    } catch (err) {
      console.error("[Supabase Review POST Failed]", err);
      const current = this.getReviews();
      current.unshift(review);
      this.saveReviews(current);
    }
  }

  static async apiSaveReviews(reviews: Review[]): Promise<void> {
    const payload = reviews.map(item => ({
      id: item.id,
      name: item.name,
      rating: Number(item.rating || 5),
      date: item.date,
      comment: item.comment,
      avatar: item.avatar
    }));

    try {
      const { error } = await supabase.from("reviews").upsert(payload);
      if (error) throw error;
      this.saveReviews(reviews);
    } catch (err) {
      console.error("[Supabase Reviews Batch Saving Failed]", err);
      this.saveReviews(reviews);
    }
  }

  static async fetchSettings(): Promise<RestaurantSettings> {
    this.incrementApiCallCount("fetchSettings");
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .limit(1);

      if (error || !data || data.length === 0) {
        console.warn("[Supabase] Settings fetch fallback.", error);
        return this.getSettings();
      }

      const item = data[0];
      const mapped: RestaurantSettings = {
        ...this.getSettings(),
        name: item.name || "WebRajya POS",
        contactNumber: item.contact_number || "",
        address: item.address || "",
        businessHours: item.business_hours || "Mon-Sun: 10:00 AM - 10:00 PM",
        deliveryCharges: Number(item.delivery_charges || 0),
        gstEnabled: item.gst_enabled !== false,
        gstRate: Number(item.gst_rate ?? item.gst_percentage ?? 5),
        cgstRate: Number(item.cgst_rate ?? (Number(item.gst_rate ?? item.gst_percentage ?? 5) / 2)),
        sgstRate: Number(item.sgst_rate ?? (Number(item.gst_rate ?? item.gst_percentage ?? 5) / 2)),
        gstPercentage: Number(item.gst_percentage ?? item.gst_rate ?? 5),
        gstin: item.gstin || "",
        facebookUrl: item.facebook_url || "",
        instagramUrl: item.instagram_url || "",
        twitterUrl: item.twitter_url || "",
        googleMapsUrl: item.google_maps_url || ""
      };

      this.saveSettings(mapped);
      return mapped;
    } catch {
      return this.getSettings();
    }
  }

  static async apiSaveSettings(settings: RestaurantSettings): Promise<void> {
    const payload = {
      id: "singleton-config", // Keep simple single row config
      name: settings.name,
      contact_number: settings.contactNumber,
      address: settings.address,
      business_hours: settings.businessHours,
      delivery_charges: Number(settings.deliveryCharges || 0),
      gst_enabled: settings.gstEnabled !== false,
      gst_rate: Number(settings.gstRate ?? settings.gstPercentage ?? 5),
      cgst_rate: Number(settings.cgstRate ?? 2.5),
      sgst_rate: Number(settings.sgstRate ?? 2.5),
      gst_percentage: Number(settings.gstPercentage ?? settings.gstRate ?? 5),
      gstin: settings.gstin || "",
      facebook_url: settings.facebookUrl,
      instagram_url: settings.instagramUrl,
      twitter_url: settings.twitterUrl,
      google_maps_url: settings.googleMapsUrl
    };

    try {
      const { error } = await supabase.from("settings").upsert(payload);
      if (error) throw error;
      this.saveSettings(settings);
    } catch (err) {
      console.error("[Supabase Settings save failed]", err);
      this.saveSettings(settings);
    }
  }

  static async fetchAuditLogs(): Promise<AuditLog[]> {
    this.incrementApiCallCount("fetchAuditLogs");
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("timestamp", { ascending: false });

      if (error) {
        console.warn("[Supabase] 'audit_logs' query fallback to localStorage.", error);
        return this.getAuditLogs();
      }

      const mapped: AuditLog[] = (data || []).map((item: any) => ({
        id: item.id,
        timestamp: item.timestamp || new Date().toISOString(),
        user: item.user || "Admin",
        action: item.action || "Log Captured",
        details: item.details || "",
        ipAddress: item.ip_address || "127.0.0.1"
      }));

      localStorage.setItem("ij_audit_logs", JSON.stringify(mapped));
      return mapped;
    } catch {
      return this.getAuditLogs();
    }
  }

  static async apiAddAuditLog(action: string, details: string, user: string = "Admin"): Promise<void> {
    const logId = `log-${Date.now()}`;
    const payload = {
      id: logId,
      timestamp: new Date().toISOString(),
      user: user,
      action: action,
      details: details,
      ip_address: "127.0.0.1"
    };

    try {
      const { error } = await supabase.from("audit_logs").insert(payload);
      if (error) throw error;
      await this.fetchAuditLogs();
    } catch (err) {
      console.error("[Supabase Audit Log POST Failed]", err);
      const logs = this.getAuditLogs();
      logs.unshift({
        id: logId,
        timestamp: payload.timestamp,
        user: payload.user,
        action: payload.action,
        details: payload.details,
        ipAddress: payload.ip_address
      });
      localStorage.setItem("ij_audit_logs", JSON.stringify(logs));
    }
  }

  // --- KOT DATABASE SYSTEM OPERATIONS ---
  static getKOTs(): KOT[] {
    const stored = localStorage.getItem("ij_kots");
    if (!stored) {
      // Seed with fallback mock KOTs matching existing active mock orders for initial realism
      const fallbackKOTs: KOT[] = [];
      localStorage.setItem("ij_kots", JSON.stringify(fallbackKOTs));
      return fallbackKOTs;
    }
    return JSON.parse(stored);
  }

  static saveKOTs(kots: KOT[]): void {
    localStorage.setItem("ij_kots", JSON.stringify(kots));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("kots_updated"));
  }

  static async fetchKOTs(): Promise<KOT[]> {
    console.log("[Supabase API Request] Loading KOT list...");
    try {
      const { data, error } = await supabase
        .from("kots")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("[Supabase] 'kots' query fallback to localStorage.", error);
        return this.getKOTs();
      }

      const orders = this.getOrders();
      const mapped: KOT[] = (data || []).map((item: any) => {
        const linkedOrder = orders.find(o => o.id === item.order_id);
        return {
          id: item.id,
          orderId: item.order_id,
          tableNumber: item.table_number || linkedOrder?.tableNumber || "Takeaway",
          customerName: linkedOrder?.customerName || item.customer_name || "Guest User",
          orderType: item.order_type || linkedOrder?.orderType || "takeaway",
          status: item.status || "New Order",
          specialInstructions: item.special_instructions || "None",
          createdAt: item.created_at || new Date().toISOString(),
          preparationTime: Number(item.preparation_time || 15),
          printed: item.printed !== undefined ? !!item.printed : (Number(item.printed_count || 0) > 0),
          items: Array.isArray(item.items) ? item.items : (typeof item.items === 'string' ? JSON.parse(item.items) : [])
        };
      });

      this.saveKOTs(mapped);
      return mapped;
    } catch (err) {
      console.error("[KOT Transport Sync Error]", err);
      return this.getKOTs();
    }
  }

  static async apiAddKOT(kot: KOT): Promise<KOT> {
    // Supabase kots table columns: id, order_id, table_number, order_type, items, status, created_at, special_instructions, printed_count, add_on_number
    const payload: any = {
      id: kot.id,
      order_id: kot.orderId || kot.id.replace(/^KOT-/, ""),
      table_number: kot.tableNumber || null,
      order_type: kot.orderType || "takeaway",
      status: kot.status || "New Order",
      special_instructions: kot.specialInstructions || null,
      created_at: kot.createdAt || new Date().toISOString(),
      printed_count: kot.printed ? 1 : 0,
      add_on_number: 0,
      items: kot.items || []
    };

    try {
      const { error } = await supabase.from("kots").insert(payload);
      if (error) {
        console.warn("[Supabase KOT insertion notice]", error.message || error);
      }
    } catch (err) {
      console.warn("[Supabase KOT connection notice]", err);
    }

    const kots = this.getKOTs();
    // check unique
    if (!kots.some(k => k.id === kot.id)) {
      kots.unshift({ ...kot, printed: kot.printed || false });
      this.saveKOTs(kots);
    }

    return kot;
  }

  static async apiUpdateKOTPrinted(kotId: string, printed: boolean): Promise<void> {
    console.log(`[Supabase API Request] Updating KOT ${kotId} printed status to ${printed}`);
    try {
      const { error } = await supabase
        .from("kots")
        .update({ printed_count: printed ? 1 : 0 })
        .eq("id", kotId);
      
      if (error) {
        console.warn("[Supabase KOT Printed update notice]", error.message || error);
      }

      // Update in local cache
      const kots = this.getKOTs();
      const kotIdx = kots.findIndex(k => k.id === kotId);
      if (kotIdx !== -1) {
        kots[kotIdx].printed = printed;
        this.saveKOTs(kots);
      }
    } catch (err) {
      console.warn("[KOT printed update notice]", err);
      // Fallback update in local cache
      const kots = this.getKOTs();
      const kotIdx = kots.findIndex(k => k.id === kotId);
      if (kotIdx !== -1) {
        kots[kotIdx].printed = printed;
        this.saveKOTs(kots);
      }
    }
  }

  static async apiUpdateKOTStatus(kotId: string, status: KOTStatus): Promise<void> {
    console.log(`[Supabase API Request] Updating KOT status ${kotId} to ${status}`);
    try {
      const { error } = await supabase
        .from("kots")
        .update({ status })
        .eq("id", kotId);
      
      if (error) {
        console.error("[Supabase KOT Status update failed]", error);
      }

      // Update in local cache
      const kots = this.getKOTs();
      const kotIdx = kots.findIndex(k => k.id === kotId);
      if (kotIdx !== -1) {
        kots[kotIdx].status = status;
        this.saveKOTs(kots);

        // Map KOTStatus to OrderStatus and update linked order status
        const orderId = kots[kotIdx].orderId;
        const orders = this.getOrders();
        const linkedOrder = orders.find(o => o.id === orderId);
        const orderType = linkedOrder?.orderType || "dine-in";
        
        let mappedOrderStatus = status as any;
        if (status === "New Order") mappedOrderStatus = "New Order";
        else if (status === "Accepted") mappedOrderStatus = "Accepted";
        else if (status === "Preparing") mappedOrderStatus = "Preparing";
        else if (status === "Ready") mappedOrderStatus = "Ready";
        else if (status === "Served") {
          if (orderType === "dine-in") mappedOrderStatus = "Served";
          else if (orderType === "takeaway") mappedOrderStatus = "Packed";
          else if (orderType === "delivery") mappedOrderStatus = "Delivered";
        } else if (status === "Cancelled") mappedOrderStatus = "Cancelled";
        
        await this.apiUpdateOrderStatus(orderId, mappedOrderStatus, undefined, "Kitchen KDS");
      }
    } catch (err) {
      console.error("[KOT status update exception]", err);
      // Fallback update in local cache
      const kots = this.getKOTs();
      const kotIdx = kots.findIndex(k => k.id === kotId);
      if (kotIdx !== -1) {
        kots[kotIdx].status = status;
        this.saveKOTs(kots);
      }
    }
  }

  static async apiAddOrderItems(orderId: string, items: { menuItemId: string; name: string; price: number; quantity: number; customization?: string }[]): Promise<void> {
    const payloads = items.map((item, index) => ({
      id: `${orderId}-item-${index}-${Date.now()}`,
      order_id: orderId,
      menu_item_id: item.menuItemId,
      name: item.name,
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 1),
      customization: item.customization || ""
    }));

    debugLog(`[ORDER ITEMS INSERT] Inserting ${payloads.length} item records for order ${orderId}:`, payloads);

    try {
      const { data, error } = await supabase.from("order_items").insert(payloads).select();
      if (error) {
        console.warn("[ORDER ITEMS INSERT] Notice (items stored in orders.items JSONB column):", error.message);
      } else {
        debugLog(`[ORDER ITEMS INSERT] SUCCESS! Stored ${payloads.length} items in relational order_items table:`, data);
      }
    } catch (err) {
      console.warn("[ORDER ITEMS INSERT] Relational items table notice:", err);
    }
  }

  static getPrinterLogs(): PrinterEmulatorLog[] {
    const stored = localStorage.getItem("ij_printer_logs");
    if (!stored) {
      localStorage.setItem("ij_printer_logs", JSON.stringify([]));
      return [];
    }
    return JSON.parse(stored);
  }

  static savePrinterLogs(logs: PrinterEmulatorLog[]): void {
    localStorage.setItem("ij_printer_logs", JSON.stringify(logs));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("printer_logs_updated"));
  }

  static async fetchPrinterLogs(): Promise<PrinterEmulatorLog[]> {
    try {
      const { data, error } = await supabase
        .from("printer_emulator_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("[Supabase] 'printer_emulator_logs' table select error:", error);
        return this.getPrinterLogs();
      }

      const mapped: PrinterEmulatorLog[] = (data || []).map((item: any) => ({
        id: item.id,
        kotId: item.kot_id,
        kotNumber: item.kot_number,
        restaurantId: item.restaurant_id,
        receiptText: item.receipt_text,
        printStatus: item.print_status,
        createdAt: item.created_at
      }));

      this.savePrinterLogs(mapped);
      return mapped;
    } catch (err) {
      console.error("[Supabase fetchPrinterLogs failure]:", err);
      return this.getPrinterLogs();
    }
  }

  static async apiAddPrinterLog(log: Omit<PrinterEmulatorLog, "id" | "createdAt">): Promise<PrinterEmulatorLog> {
    const logs = this.getPrinterLogs();
    const newId = `PRT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const fullLog: PrinterEmulatorLog = {
      ...log,
      id: newId,
      createdAt: new Date().toISOString()
    };

    const payload = {
      id: fullLog.id,
      kot_id: fullLog.kotId,
      kot_number: fullLog.kotNumber,
      restaurant_id: fullLog.restaurantId,
      receipt_text: fullLog.receiptText,
      print_status: fullLog.printStatus,
      created_at: fullLog.createdAt
    };

    try {
      const { error } = await supabase.from("printer_emulator_logs").insert(payload);
      if (error) {
        console.error("[Supabase insertion printer_emulator_logs failed]", error);
      }
    } catch (err) {
      console.error("[Supabase connection printer_emulator_logs failed]", err);
    }

    logs.unshift(fullLog);
    this.savePrinterLogs(logs);
    return fullLog;
  }

  static async apiUpdateOrderPrintStatus(
    orderId: string, 
    type: "kot" | "bill", 
    status: "Pending" | "Printing" | "Printed" | "Failed"
  ): Promise<void> {
    console.log(`[LocalDB] Updating ${type} print status for order ${orderId} to ${status}`);
    try {
      const orders = this.getOrders();
      const orderIdx = orders.findIndex(o => o.id === orderId);
      if (orderIdx !== -1) {
        const order = orders[orderIdx];
        if (type === "kot") {
          order.kotPrintStatus = status;
          order.kotPrintTimestamp = new Date().toISOString();
        } else {
          order.billPrintStatus = status;
          order.billPrintTimestamp = new Date().toISOString();
        }
        this.saveOrders(orders);
        window.dispatchEvent(new Event("storage"));
      }
    } catch (err) {
      console.error("[LocalDB Exception updating print status]", err);
    }
  }

  // =========================================================================
  // PAYMENT SETTLEMENT & SPLIT BILL ENGINE
  // =========================================================================

  static getPayments(): PaymentRecord[] {
    const stored = localStorage.getItem("webrajya_pos_payments");
    if (!stored) {
      localStorage.setItem("webrajya_pos_payments", JSON.stringify([]));
      return [];
    }
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static savePayments(payments: PaymentRecord[]): void {
    const seen = new Set<string>();
    const unique: PaymentRecord[] = [];
    for (const p of payments) {
      if (p && p.id && !seen.has(p.id)) {
        seen.add(p.id);
        unique.push(p);
      }
    }
    localStorage.setItem("webrajya_pos_payments", JSON.stringify(unique));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("payments_updated", { detail: unique }));
  }

  static getPaymentsForOrder(orderId: string): PaymentRecord[] {
    const all = this.getPayments();
    const matches = all.filter(p => p.orderId === orderId);
    if (matches.length > 0) return matches;

    // Fallback to order's embedded payments if present
    const order = this.getOrders().find(o => o.id === orderId);
    return order?.payments || [];
  }

  /**
   * Atomically settles payments for an order (single, multiple, split, or partial).
   */
  static async apiSettleOrderPayment(
    orderId: string,
    newPaymentItems: {
      amount: number;
      paymentMethod: PaymentMethod | string;
      transactionReference?: string;
      notes?: string;
      createdBy?: string;
      splitGroupId?: string;
      splitIndex?: number;
      splitType?: "items" | "equal" | "amount" | "multi_pay" | "single";
      splitItemNames?: string[];
      customerName?: string;
    }[],
    user: string = "Admin",
    options?: {
      freeTableIfPaid?: boolean;
      splitSettlements?: SplitSettlement[];
    }
  ): Promise<{ success: boolean; order: Order; payments: PaymentRecord[]; message: string }> {
    console.log(`[Payment Engine] Settle payments for Order ${orderId}:`, newPaymentItems);

    const orders = this.getOrders();
    const orderIdx = orders.findIndex(o => o.id === orderId);
    if (orderIdx === -1) {
      throw new Error(`Order #${orderId} not found in database.`);
    }

    const order = orders[orderIdx];
    const existingPayments = this.getPaymentsForOrder(orderId).filter(p => p.status === "Paid");
    const existingPaid = existingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // Validate new payment items
    if (!newPaymentItems || newPaymentItems.length === 0) {
      throw new Error("No payment entries provided for settlement.");
    }

    for (const p of newPaymentItems) {
      if (typeof p.amount !== "number" || isNaN(p.amount) || p.amount <= 0) {
        throw new Error(`Invalid payment amount: ₹${p.amount}. Amount must be greater than 0.`);
      }
      if (!p.paymentMethod || !p.paymentMethod.trim()) {
        throw new Error("Payment method is required for every settlement entry.");
      }
    }

    const newPaymentTotal = newPaymentItems.reduce((sum, p) => sum + p.amount, 0);
    const candidatePaid = existingPaid + newPaymentTotal;

    // Safety threshold: permit minor cent rounding up to 0.05
    if (candidatePaid > order.grandTotal + 0.05) {
      const excess = (candidatePaid - order.grandTotal).toFixed(2);
      throw new Error(`Overpayment detected. Order grand total is ₹${order.grandTotal}, but total payments would be ₹${candidatePaid.toFixed(2)} (Excess: ₹${excess}).`);
    }

    const nowIso = new Date().toISOString();
    const timestampMs = Date.now();
    const activeShift = this.getActiveShift();
    const effectiveShiftId = (order as any).shiftId || activeShift?.id;
    if (activeShift && !order.shiftId) {
      order.shiftId = activeShift.id;
    }

    // Create normalized PaymentRecord objects
    const createdRecords: PaymentRecord[] = newPaymentItems.map((item, idx) => ({
      id: `PAY-${timestampMs}-${idx}-${Math.floor(Math.random() * 900 + 100)}`,
      orderId: order.id,
      shiftId: (item as any).shiftId || effectiveShiftId,
      amount: Math.round(item.amount * 100) / 100,
      paymentMethod: item.paymentMethod.trim(),
      status: "Paid",
      transactionReference: item.transactionReference?.trim() || undefined,
      notes: item.notes?.trim() || undefined,
      createdBy: item.createdBy || user,
      createdAt: nowIso,
      splitGroupId: item.splitGroupId,
      splitIndex: item.splitIndex,
      splitType: item.splitType || (newPaymentItems.length > 1 ? "multi_pay" : "single"),
      splitItemNames: item.splitItemNames,
      customerName: item.customerName || order.customerName
    }));

    // Update global payments ledger
    const allPayments = this.getPayments();
    allPayments.push(...createdRecords);
    this.savePayments(allPayments);

    // Compute updated order state
    const allOrderValidPayments = allPayments.filter(p => p.orderId === orderId && p.status === "Paid");
    const totalPaidCalculated = allOrderValidPayments.reduce((sum, p) => sum + p.amount, 0);
    const finalPaid = Math.min(order.grandTotal, Math.round(totalPaidCalculated * 100) / 100);
    const remaining = Math.max(0, Math.round((order.grandTotal - finalPaid) * 100) / 100);

    const isFullyPaid = remaining <= 0.01;
    const isPartialPaid = !isFullyPaid && finalPaid > 0;

    order.paidAmount = finalPaid;
    order.remainingAmount = remaining;
    order.paymentStatus = isFullyPaid ? "Paid" : isPartialPaid ? "Partial" : "Pending";

    // Summarize payment methods on the order
    const methodCounts: Record<string, number> = {};
    allOrderValidPayments.forEach(p => {
      methodCounts[p.paymentMethod] = (methodCounts[p.paymentMethod] || 0) + p.amount;
    });
    const methodSummary = Object.entries(methodCounts)
      .map(([m, amt]) => `${m}: ₹${amt.toFixed(2).replace(/\.00$/, '')}`)
      .join(" + ");
    
    order.paymentMethod = methodSummary || order.paymentMethod || "Cash on Delivery";
    order.payments = allOrderValidPayments;

    if (options?.splitSettlements) {
      order.splitSettlements = options.splitSettlements;
    }

    // Add Timeline Event
    if (!order.timeline) order.timeline = [];
    const paymentBreakdownDesc = createdRecords
      .map(r => `₹${r.amount} via ${r.paymentMethod}${r.transactionReference ? ` (Ref: ${r.transactionReference})` : ""}`)
      .join(", ");

    order.timeline.push({
      event: isFullyPaid ? "Payment Completed" : "Partial Payment Received",
      timestamp: nowIso,
      details: `${paymentBreakdownDesc}. Total Paid: ₹${finalPaid}/${order.grandTotal}. Remaining: ₹${remaining} by ${user}.`
    });

    // Save updated order
    orders[orderIdx] = order;
    this.saveOrders(orders);

    // Table Management integration
    if (order.orderType === "dine-in" && order.tableNumber) {
      const tables = this.getTables();
      const targetTable = tables.find(t => t.tableNumber === order.tableNumber || t.id === order.tableNumber);
      if (targetTable) {
        if (isFullyPaid && options?.freeTableIfPaid !== false) {
          targetTable.status = "Available";
          this.saveTables(tables);
        } else if (isPartialPaid || !isFullyPaid) {
          // Keep table occupied during partial settlement
          if (targetTable.status !== "Occupied") {
            targetTable.status = "Occupied";
            this.saveTables(tables);
          }
        }
      }
    }

    // Audit Log entry
    const auditSummary = `Settled ${createdRecords.length} payment(s) totaling ₹${newPaymentTotal} for Order #${order.id}. Total Paid: ₹${finalPaid}/${order.grandTotal}. Status: ${order.paymentStatus}.`;
    this.addAuditLog("Payment Settled", auditSummary, user);

    // Asynchronous Supabase Sync
    this.syncOrderPaymentsToSupabase(order, createdRecords).catch(e => {
      console.warn("[Payment Supabase Sync Background Notice]:", e);
    });

    // Dispatch custom events for reactive UI updates
    window.dispatchEvent(new CustomEvent("order_payment_settled", {
      detail: {
        order,
        payments: createdRecords,
        isFullyPaid,
        remaining
      }
    }));
    window.dispatchEvent(new Event("storage"));

    return {
      success: true,
      order,
      payments: createdRecords,
      message: isFullyPaid 
        ? `Invoice #${order.id} fully settled (₹${order.grandTotal}).` 
        : `Partial payment of ₹${newPaymentTotal} recorded. ₹${remaining} remaining.`
    };
  }

  /**
   * Syncs order payment status & payment records to Supabase in the background.
   */
  private static async syncOrderPaymentsToSupabase(order: Order, newRecords: PaymentRecord[]): Promise<void> {
    try {
      // 1. Update Order in Supabase
      const updateOrderPayload: any = {
        payment_status: order.paymentStatus,
        payment_method: order.paymentMethod,
        paid_amount: order.paidAmount,
        remaining_amount: order.remainingAmount,
        split_settlements: order.splitSettlements || []
      };

      await supabase.from("orders").update(updateOrderPayload).eq("id", order.id);

      // 2. Insert new payment records to Supabase `payments` table
      if (newRecords.length > 0) {
        const paymentPayloads = newRecords.map(r => ({
          id: r.id,
          order_id: r.orderId,
          amount: r.amount,
          payment_method: r.paymentMethod,
          status: r.status,
          transaction_reference: r.transactionReference || null,
          notes: r.notes || null,
          created_by: r.createdBy,
          created_at: r.createdAt,
          split_group_id: r.splitGroupId || null,
          split_index: r.splitIndex ?? null,
          split_type: r.splitType || null,
          split_item_names: r.splitItemNames || []
        }));

        await supabase.from("payments").insert(paymentPayloads);
      }
    } catch (err) {
      console.warn("[syncOrderPaymentsToSupabase] Background sync exception:", err);
    }
  }

  /**
   * Voids a payment record with full audit history without deleting relations.
   */
  static async apiVoidPaymentRecord(paymentId: string, user: string = "Admin", reason?: string): Promise<{ success: boolean; order: Order; message: string }> {
    const allPayments = this.getPayments();
    const pIdx = allPayments.findIndex(p => p.id === paymentId);
    if (pIdx === -1) {
      throw new Error(`Payment #${paymentId} not found.`);
    }

    const payment = allPayments[pIdx];
    if (payment.status === "Voided") {
      throw new Error(`Payment #${paymentId} is already voided.`);
    }

    payment.status = "Voided";
    payment.notes = `${payment.notes ? payment.notes + " | " : ""}Voided by ${user}: ${reason || "No reason provided"}`;
    this.savePayments(allPayments);

    const orders = this.getOrders();
    const orderIdx = orders.findIndex(o => o.id === payment.orderId);
    if (orderIdx === -1) {
      throw new Error(`Associated order #${payment.orderId} not found.`);
    }

    const order = orders[orderIdx];
    const validPayments = allPayments.filter(p => p.orderId === order.id && p.status === "Paid");
    const totalPaid = validPayments.reduce((sum, p) => sum + p.amount, 0);
    const finalPaid = Math.min(order.grandTotal, Math.round(totalPaid * 100) / 100);
    const remaining = Math.max(0, Math.round((order.grandTotal - finalPaid) * 100) / 100);

    order.paidAmount = finalPaid;
    order.remainingAmount = remaining;
    order.paymentStatus = remaining <= 0.01 ? "Paid" : finalPaid > 0 ? "Partial" : "Pending";
    order.payments = validPayments;

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      event: "Payment Voided",
      timestamp: new Date().toISOString(),
      details: `Voided payment #${paymentId} of ₹${payment.amount} (${payment.paymentMethod}). Reason: ${reason || "None"}. By ${user}.`
    });

    orders[orderIdx] = order;
    this.saveOrders(orders);

    // If order is dine-in and was previously marked Available, revert table to Occupied if balance due
    if (order.orderType === "dine-in" && order.tableNumber && remaining > 0) {
      const tables = this.getTables();
      const t = tables.find(tbl => tbl.tableNumber === order.tableNumber);
      if (t && t.status === "Available") {
        t.status = "Occupied";
        this.saveTables(tables);
      }
    }

    this.addAuditLog("Payment Voided", `Voided ₹${payment.amount} (${payment.paymentMethod}) for Order #${order.id}. ${reason || ""}`, user);

    // Sync to Supabase in background
    try {
      await supabase.from("payments").update({ status: "Voided", notes: payment.notes }).eq("id", paymentId);
      await supabase.from("orders").update({
        payment_status: order.paymentStatus,
        paid_amount: order.paidAmount,
        remaining_amount: order.remainingAmount
      }).eq("id", order.id);
    } catch (e) {
      console.warn("[apiVoidPaymentRecord] Supabase sync fallback:", e);
    }

    window.dispatchEvent(new CustomEvent("payment_voided", { detail: { payment, order } }));
    window.dispatchEvent(new Event("storage"));

    return {
      success: true,
      order,
      message: `Payment #${paymentId} for ₹${payment.amount} has been voided.`
    };
  }

  /**
   * Persists draft split settlements to an order.
   */
  static async apiSaveSplitSettlement(orderId: string, splitSettlements: SplitSettlement[], user: string = "Admin"): Promise<{ success: boolean; order: Order }> {
    const orders = this.getOrders();
    const orderIdx = orders.findIndex(o => o.id === orderId);
    if (orderIdx === -1) {
      throw new Error(`Order #${orderId} not found.`);
    }

    const order = orders[orderIdx];
    order.splitSettlements = splitSettlements;
    orders[orderIdx] = order;
    this.saveOrders(orders);

    this.addAuditLog("Split Bill Configured", `Configured ${splitSettlements.length} split settlements for Order #${order.id} (${splitSettlements[0]?.splitType || 'custom'}).`, user);

    try {
      await supabase.from("orders").update({ split_settlements: splitSettlements }).eq("id", orderId);
    } catch (e) {
      console.warn("[apiSaveSplitSettlement] Supabase sync notice:", e);
    }

    return { success: true, order };
  }

  // =========================================================================
  // SHIFT MANAGEMENT & CASH DRAWER RECONCILIATION ENGINE
  // =========================================================================

  static getShifts(): Shift[] {
    const stored = localStorage.getItem("webrajya_pos_shifts");
    if (!stored) {
      localStorage.setItem("webrajya_pos_shifts", JSON.stringify([]));
      return [];
    }
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static saveShifts(shifts: Shift[]): void {
    const seen = new Set<string>();
    const unique: Shift[] = [];
    for (const s of shifts) {
      if (s && s.id && !seen.has(s.id)) {
        seen.add(s.id);
        unique.push(s);
      }
    }
    localStorage.setItem("webrajya_pos_shifts", JSON.stringify(unique));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("shifts_updated", { detail: unique }));
  }

  static getActiveShift(): Shift | null {
    const shifts = this.getShifts();
    return shifts.find(s => s.status === "Open" || s.status === "Closing") || null;
  }

  static getShiftById(id: string): Shift | null {
    const shifts = this.getShifts();
    return shifts.find(s => s.id === id) || null;
  }

  static getCashAdjustments(shiftId?: string): CashAdjustment[] {
    const stored = localStorage.getItem("webrajya_pos_cash_adjustments");
    let all: CashAdjustment[] = [];
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        all = Array.isArray(parsed) ? parsed : [];
      } catch {
        all = [];
      }
    }
    if (shiftId) {
      return all.filter(a => a.shiftId === shiftId);
    }
    return all;
  }

  static saveCashAdjustments(adjustments: CashAdjustment[]): void {
    const seen = new Set<string>();
    const unique: CashAdjustment[] = [];
    for (const a of adjustments) {
      if (a && a.id && !seen.has(a.id)) {
        seen.add(a.id);
        unique.push(a);
      }
    }
    localStorage.setItem("webrajya_pos_cash_adjustments", JSON.stringify(unique));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("cash_adjustments_updated", { detail: unique }));
  }

  /**
   * Authoritatively computes shift financials from immutable payment and cash adjustment records.
   */
  static calculateShiftFinancials(shiftId: string, customActualCash?: number): ShiftFinancials {
    const shift = this.getShiftById(shiftId);
    if (!shift) {
      throw new Error(`Shift #${shiftId} not found in database.`);
    }

    const allPayments = this.getPayments();
    const allOrders = this.getOrders();
    const adjustments = this.getCashAdjustments(shiftId);

    const shiftOpenedMs = new Date(shift.openedAt).getTime();
    const shiftClosedMs = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now() + 86400000;

    // Filter payments linked by shiftId OR timestamp fallback
    const shiftPayments = allPayments.filter(p => {
      if (p.shiftId === shift.id) return true;
      if (!p.shiftId && (shift.status === "Open" || shift.status === "Closing")) {
        const pTime = new Date(p.createdAt).getTime();
        return pTime >= shiftOpenedMs && pTime <= shiftClosedMs;
      }
      return false;
    });

    const validPayments = shiftPayments.filter(p => p.status === "Paid");
    const voidedPayments = shiftPayments.filter(p => p.status === "Voided");
    const refundedPayments = shiftPayments.filter(p => p.status === "Refunded");

    let cashSales = 0;
    let upiSales = 0;
    let cardSales = 0;
    let otherSales = 0;

    validPayments.forEach(p => {
      const m = (p.paymentMethod || "").toLowerCase().trim();
      const amt = Number(p.amount) || 0;
      if (m.includes("cash")) {
        cashSales += amt;
      } else if (m.includes("upi") || m.includes("gpay") || m.includes("phonepe") || m.includes("paytm") || m.includes("qr") || m.includes("bank")) {
        upiSales += amt;
      } else if (m.includes("card") || m.includes("pos") || m.includes("visa") || m.includes("master") || m.includes("credit")) {
        cardSales += amt;
      } else {
        otherSales += amt;
      }
    });

    cashSales = Math.round(cashSales * 100) / 100;
    upiSales = Math.round(upiSales * 100) / 100;
    cardSales = Math.round(cardSales * 100) / 100;
    otherSales = Math.round(otherSales * 100) / 100;
    const totalSales = Math.round((cashSales + upiSales + cardSales + otherSales) * 100) / 100;

    const voidedTotal = Math.round(voidedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) * 100) / 100;
    const refundedTotal = Math.round(refundedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) * 100) / 100;

    let cashIn = 0;
    let cashOut = 0;
    adjustments.forEach(adj => {
      const amt = Number(adj.amount) || 0;
      if (adj.type === "Cash In" || adj.type === "Float Addition") {
        cashIn += amt;
      } else if (adj.type === "Cash Out") {
        cashOut += amt;
      }
    });

    cashIn = Math.round(cashIn * 100) / 100;
    cashOut = Math.round(cashOut * 100) / 100;
    const netAdjustments = Math.round((cashIn - cashOut) * 100) / 100;

    // Expected Closing Cash = Opening Cash + Cash Sales + Net Cash Adjustments
    const expectedCash = Math.max(0, Math.round((shift.openingCash + cashSales + netAdjustments) * 100) / 100);

    const effectiveActual = customActualCash !== undefined ? customActualCash : shift.actualCash;
    let difference: number | undefined = undefined;
    let differenceType: "Exact" | "Short" | "Excess" | undefined = undefined;

    if (effectiveActual !== undefined && effectiveActual !== null) {
      difference = Math.round((effectiveActual - expectedCash) * 100) / 100;
      if (Math.abs(difference) <= 0.01) {
        difference = 0;
        differenceType = "Exact";
      } else if (difference < 0) {
        differenceType = "Short";
      } else {
        differenceType = "Excess";
      }
    }

    const shiftOrderIds = new Set(validPayments.map(p => p.orderId));
    const shiftOrders = allOrders.filter(o => o.shiftId === shift.id || shiftOrderIds.has(o.id));

    return {
      shiftId: shift.id,
      openingCash: shift.openingCash,
      cashSales,
      upiSales,
      cardSales,
      otherSales,
      totalSales,
      cashIn,
      cashOut,
      netAdjustments,
      voidedTotal,
      refundedTotal,
      expectedCash,
      actualCash: effectiveActual,
      difference,
      differenceType,
      orderCount: shiftOrders.length,
      paymentCount: validPayments.length,
      orders: shiftOrders,
      payments: shiftPayments,
      adjustments
    };
  }

  /**
   * Opens a new Shift with opening cash balance.
   */
  static async apiOpenShift(params: {
    openingCash: number;
    cashierName?: string;
    cashierId?: string;
    openedBy?: string;
    openingNotes?: string;
    businessDate?: string;
  }): Promise<Shift> {
    const active = this.getActiveShift();
    if (active) {
      throw new Error(`A shift is already active (#${active.id} opened by ${active.cashierName} at ${new Date(active.openedAt).toLocaleTimeString()}). Please close the active shift first.`);
    }

    const openingCash = Math.max(0, Math.round((Number(params.openingCash) || 0) * 100) / 100);
    const now = new Date();
    const nowIso = now.toISOString();
    const bDate = params.businessDate || now.toISOString().slice(0, 10);
    const cashier = params.cashierName?.trim() || "POS Cashier";
    const user = params.openedBy || cashier;

    const newShift: Shift = {
      id: `SHIFT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Date.now().toString().slice(-4)}`,
      cashierId: params.cashierId || `CASHIER-${Date.now().toString().slice(-4)}`,
      cashierName: cashier,
      status: "Open",
      openingCash: openingCash,
      expectedCash: openingCash,
      openedAt: nowIso,
      openedBy: user,
      openingNotes: params.openingNotes?.trim() || undefined,
      businessDate: bDate,
      cashSales: 0,
      upiSales: 0,
      cardSales: 0,
      otherSales: 0,
      totalSales: 0,
      cashInAdjustments: 0,
      cashOutAdjustments: 0,
      voidedAmount: 0,
      refundedAmount: 0,
      orderCount: 0
    };

    const shifts = this.getShifts();
    shifts.unshift(newShift);
    this.saveShifts(shifts);

    this.addAuditLog(
      "Shift Opened",
      `Shift #${newShift.id} opened by ${user} with initial float ₹${openingCash}. (Business Day: ${bDate})`,
      user
    );

    this.syncShiftToSupabase(newShift).catch(e => {
      console.warn("[Shift Supabase Sync Background Notice]:", e);
    });

    window.dispatchEvent(new CustomEvent("shift_opened", { detail: newShift }));
    window.dispatchEvent(new Event("storage"));

    return newShift;
  }

  /**
   * Records a Cash Drawer Adjustment (Cash In / Cash Out / Float).
   */
  static async apiAddCashAdjustment(params: {
    shiftId: string;
    amount: number;
    type: CashAdjustmentType;
    reason: string;
    authorizedBy?: string;
    createdBy?: string;
  }): Promise<CashAdjustment> {
    const shift = this.getShiftById(params.shiftId);
    if (!shift) {
      throw new Error(`Shift #${params.shiftId} not found.`);
    }
    if (shift.status === "Closed" || shift.status === "Force Closed") {
      throw new Error(`Cannot add cash adjustment to a closed shift (#${shift.id}).`);
    }

    const amt = Math.round((Number(params.amount) || 0) * 100) / 100;
    if (amt <= 0) {
      throw new Error("Cash adjustment amount must be greater than ₹0.");
    }
    if (!params.reason || !params.reason.trim()) {
      throw new Error("A clear reason is required for cash adjustments.");
    }

    const user = params.createdBy || "POS Cashier";
    const authBy = params.authorizedBy || user;

    const adjustment: CashAdjustment = {
      id: `ADJ-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      shiftId: shift.id,
      amount: amt,
      type: params.type,
      reason: params.reason.trim(),
      authorizedBy: authBy,
      createdBy: user,
      createdAt: new Date().toISOString()
    };

    const adjustments = this.getCashAdjustments();
    adjustments.unshift(adjustment);
    this.saveCashAdjustments(adjustments);

    // Re-calculate shift snapshot metrics
    const financials = this.calculateShiftFinancials(shift.id);
    const shifts = this.getShifts();
    const sIdx = shifts.findIndex(s => s.id === shift.id);
    if (sIdx !== -1) {
      shifts[sIdx].expectedCash = financials.expectedCash;
      shifts[sIdx].cashInAdjustments = financials.cashIn;
      shifts[sIdx].cashOutAdjustments = financials.cashOut;
      this.saveShifts(shifts);
    }

    this.addAuditLog(
      `Cash Adjustment (${params.type})`,
      `${params.type} of ₹${amt} recorded on Shift #${shift.id}. Reason: "${params.reason}". Auth: ${authBy}.`,
      user
    );

    this.syncCashAdjustmentToSupabase(adjustment).catch(e => console.warn(e));

    window.dispatchEvent(new CustomEvent("cash_adjustment_added", { detail: adjustment }));
    window.dispatchEvent(new Event("storage"));

    return adjustment;
  }

  /**
   * Finalizes and closes a shift with physical cash count and reconciliation.
   */
  static async apiCloseShift(params: {
    shiftId: string;
    actualCash: number;
    differenceReason?: string;
    closingNotes?: string;
    closedBy?: string;
    forceClose?: boolean;
    forceCloseReason?: string;
  }): Promise<{ success: boolean; shift: Shift; financials: ShiftFinancials; message: string }> {
    const shift = this.getShiftById(params.shiftId);
    if (!shift) {
      throw new Error(`Shift #${params.shiftId} not found.`);
    }
    if (shift.status === "Closed" || shift.status === "Force Closed") {
      throw new Error(`Shift #${shift.id} is already finalized and closed.`);
    }

    const actualCash = Math.max(0, Math.round((Number(params.actualCash) || 0) * 100) / 100);
    const user = params.closedBy || "Admin";

    // Authoritative calculation
    const financials = this.calculateShiftFinancials(shift.id, actualCash);
    const expectedCash = financials.expectedCash;
    const diff = Math.round((actualCash - expectedCash) * 100) / 100;
    const diffType = Math.abs(diff) <= 0.01 ? "Exact" : diff < 0 ? "Short" : "Excess";

    if (diffType !== "Exact" && !params.differenceReason?.trim() && !params.forceClose) {
      throw new Error(`Cash difference of ₹${Math.abs(diff)} (${diffType}) detected. Please provide a discrepancy note before closing.`);
    }

    const nowIso = new Date().toISOString();
    const finalStatus: ShiftStatus = params.forceClose ? "Force Closed" : "Closed";

    shift.status = finalStatus;
    shift.actualCash = actualCash;
    shift.expectedCash = expectedCash;
    shift.difference = diff;
    shift.differenceType = diffType;
    shift.differenceReason = params.differenceReason?.trim() || (params.forceClose ? params.forceCloseReason : undefined);
    shift.closingNotes = params.closingNotes?.trim() || undefined;
    shift.closedAt = nowIso;
    shift.closedBy = user;
    if (params.forceClose) {
      shift.forceClosedAt = nowIso;
      shift.forceClosedBy = user;
      shift.forceCloseReason = params.forceCloseReason || "Administrative force closure";
    }

    // Persist final financial snapshot metrics
    shift.cashSales = financials.cashSales;
    shift.upiSales = financials.upiSales;
    shift.cardSales = financials.cardSales;
    shift.otherSales = financials.otherSales;
    shift.totalSales = financials.totalSales;
    shift.cashInAdjustments = financials.cashIn;
    shift.cashOutAdjustments = financials.cashOut;
    shift.voidedAmount = financials.voidedTotal;
    shift.refundedAmount = financials.refundedTotal;
    shift.orderCount = financials.orderCount;

    const shifts = this.getShifts();
    const sIdx = shifts.findIndex(s => s.id === shift.id);
    if (sIdx !== -1) {
      shifts[sIdx] = shift;
      this.saveShifts(shifts);
    }

    const diffSummary = diffType === "Exact" ? "Exact Match (₹0 difference)" : `${diffType.toUpperCase()} of ₹${Math.abs(diff)}`;
    this.addAuditLog(
      params.forceClose ? "Shift Force Closed" : "Shift Closed (Z-Report)",
      `Shift #${shift.id} closed by ${user}. Expected: ₹${expectedCash}, Actual: ₹${actualCash} (${diffSummary}). Total Sales: ₹${financials.totalSales}.`,
      user
    );

    this.syncShiftToSupabase(shift).catch(e => {
      console.warn("[Shift Close Supabase Sync Notice]:", e);
    });

    window.dispatchEvent(new CustomEvent("shift_closed", { detail: { shift, financials } }));
    window.dispatchEvent(new Event("storage"));

    return {
      success: true,
      shift,
      financials,
      message: `Shift #${shift.id} finalized successfully. Drawer status: ${diffSummary}.`
    };
  }

  /**
   * Reopens a closed shift with required manager/admin authorization and audit trail.
   */
  static async apiReopenShift(params: {
    shiftId: string;
    reopenedBy: string;
    reason: string;
  }): Promise<Shift> {
    const active = this.getActiveShift();
    if (active) {
      throw new Error(`Cannot reopen Shift #${params.shiftId} because Shift #${active.id} is currently active. Please close the active shift first.`);
    }

    const shift = this.getShiftById(params.shiftId);
    if (!shift) {
      throw new Error(`Shift #${params.shiftId} not found.`);
    }
    if (shift.status === "Open" || shift.status === "Closing") {
      throw new Error(`Shift #${shift.id} is already open.`);
    }
    if (!params.reason || !params.reason.trim()) {
      throw new Error("A justification reason is required to reopen a closed shift.");
    }

    const user = params.reopenedBy || "Manager";
    shift.status = "Open";
    shift.reopenedAt = new Date().toISOString();
    shift.reopenedBy = user;
    shift.reopenReason = params.reason.trim();
    // Clear closing timestamp so active transactions can attach
    shift.closedAt = undefined;
    shift.closedBy = undefined;

    const shifts = this.getShifts();
    const sIdx = shifts.findIndex(s => s.id === shift.id);
    if (sIdx !== -1) {
      shifts[sIdx] = shift;
      this.saveShifts(shifts);
    }

    this.addAuditLog(
      "Shift Reopened",
      `Shift #${shift.id} reopened by ${user}. Reason: "${params.reason.trim()}".`,
      user
    );

    this.syncShiftToSupabase(shift).catch(e => console.warn(e));

    window.dispatchEvent(new CustomEvent("shift_reopened", { detail: shift }));
    window.dispatchEvent(new Event("storage"));

    return shift;
  }

  /**
   * Supabase sync helper for Shifts.
   */
  private static async syncShiftToSupabase(shift: Shift): Promise<void> {
    try {
      const payload: any = {
        id: shift.id,
        cashier_id: shift.cashierId,
        cashier_name: shift.cashierName,
        status: shift.status,
        opening_cash: shift.openingCash,
        expected_cash: shift.expectedCash,
        actual_cash: shift.actualCash ?? null,
        difference: shift.difference ?? null,
        difference_type: shift.differenceType ?? null,
        difference_reason: shift.differenceReason ?? null,
        opened_at: shift.openedAt,
        closed_at: shift.closedAt ?? null,
        opened_by: shift.openedBy,
        closed_by: shift.closedBy ?? null,
        opening_notes: shift.openingNotes ?? null,
        closing_notes: shift.closingNotes ?? null,
        business_date: shift.businessDate,
        cash_sales: shift.cashSales ?? 0,
        upi_sales: shift.upiSales ?? 0,
        card_sales: shift.cardSales ?? 0,
        other_sales: shift.otherSales ?? 0,
        total_sales: shift.totalSales ?? 0,
        order_count: shift.orderCount ?? 0,
        reopened_at: shift.reopenedAt ?? null,
        reopened_by: shift.reopenedBy ?? null,
        reopen_reason: shift.reopenReason ?? null,
        force_closed_at: shift.forceClosedAt ?? null,
        force_closed_by: shift.forceClosedBy ?? null,
        force_close_reason: shift.forceCloseReason ?? null
      };

      await supabase.from("shifts").upsert(payload);
    } catch (err) {
      console.warn("[syncShiftToSupabase] Background sync exception:", err);
    }
  }

  /**
   * Supabase sync helper for Cash Adjustments.
   */
  private static async syncCashAdjustmentToSupabase(adjustment: CashAdjustment): Promise<void> {
    try {
      const payload: any = {
        id: adjustment.id,
        shift_id: adjustment.shiftId,
        amount: adjustment.amount,
        type: adjustment.type,
        reason: adjustment.reason,
        authorized_by: adjustment.authorizedBy,
        created_by: adjustment.createdBy,
        created_at: adjustment.createdAt
      };

      await supabase.from("cash_adjustments").upsert(payload);
    } catch (err) {
      console.warn("[syncCashAdjustmentToSupabase] Background sync exception:", err);
    }
  }
}


