import { Order } from "./db";
import { MenuItem, Category } from "../types";

export type DateRangePreset = 
  | "today" 
  | "yesterday" 
  | "last_7_days" 
  | "last_30_days" 
  | "this_month" 
  | "last_month" 
  | "this_year" 
  | "last_year" 
  | "custom";

export interface DateRange {
  preset: DateRangePreset;
  startDate: Date;
  endDate: Date;
  label: string;
}

export interface SalesSummaryMetrics {
  todaySales: number;
  todayOrders: number;
  todayAov: number;
  
  thisMonthSales: number;
  lastMonthSales: number;
  monthGrowthPercent: number | null; // null if no prior data
  
  thisYearSales: number;
  lastYearSales: number;
  yearGrowthPercent: number | null;
  
  periodSales: number;
  periodOrders: number;
  periodAov: number;
  
  periodGrossSales: number;
  periodDiscount: number;
  periodGst: number;
  periodPackaging: number;
  periodNetSales: number;
  
  cancelledCount: number;
  cancelledValue: number;
}

export interface DailySalesRecord {
  dateKey: string; // YYYY-MM-DD
  formattedDate: string; // e.g. "17 Aug 2026"
  dayName: string; // "Mon", "Tue"
  ordersCount: number;
  grossSales: number;
  discount: number;
  gst: number;
  packaging: number;
  netSales: number;
  grandTotal: number;
  aov: number;
}

export interface MonthlySalesRecord {
  monthIndex: number; // 0-11
  monthName: string; // "January", "February"...
  monthShort: string; // "Jan", "Feb"...
  ordersCount: number;
  grossSales: number;
  discount: number;
  gst: number;
  packaging: number;
  netSales: number;
  grandTotal: number;
  isFuture: boolean;
  growthVsPrevMonth: number | null;
}

export interface YearlySalesRecord {
  year: number;
  ordersCount: number;
  grossSales: number;
  discount: number;
  gst: number;
  netSales: number;
  grandTotal: number;
  aov: number;
  growthVsPrevYear: number | null;
}

export interface OrderTypeBreakdown {
  type: string;
  label: string;
  ordersCount: number;
  revenue: number;
  percentage: number;
  color: string;
}

export interface PaymentMethodBreakdown {
  method: string;
  ordersCount: number;
  totalAmount: number;
  percentage: number;
  color: string;
}

export interface ItemSalesRecord {
  rank: number;
  menuItemId?: string;
  name: string;
  category: string;
  quantitySold: number;
  totalRevenue: number;
  percentageOfSales: number;
  averagePrice: number;
}

export interface CategorySalesRecord {
  category: string;
  icon?: string;
  quantitySold: number;
  totalRevenue: number;
  percentageOfSales: number;
  ordersCount: number;
}

export interface HourlySalesRecord {
  hour: number; // 0 - 23
  hourLabel: string; // "12 AM", "1 PM"
  ordersCount: number;
  revenue: number;
}

// -------------------------------------------------------------
// HELPER: Format Date to YYYY-MM-DD in local timezone
// -------------------------------------------------------------
export function getLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// -------------------------------------------------------------
// HELPER: Determine if an order is valid (not cancelled/rejected)
// -------------------------------------------------------------
export function isValidOrder(order: Order): boolean {
  if (!order) return false;
  const status = (order.orderStatus || "").toLowerCase().trim();
  return status !== "cancelled" && status !== "rejected" && status !== "deleted";
}

// -------------------------------------------------------------
// HELPER: Parse Date safely from order createdAt
// -------------------------------------------------------------
export function getOrderDate(order: Order): Date {
  if (!order.createdAt) return new Date();
  const parsed = new Date(order.createdAt);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

// -------------------------------------------------------------
// HELPER: Generate Date Range based on Preset
// -------------------------------------------------------------
export function calculateDateRange(
  preset: DateRangePreset, 
  customStart?: string, 
  customEnd?: string
): DateRange {
  const now = new Date();
  
  // Start of today (00:00:00.000) in local timezone
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  
  switch (preset) {
    case "today":
      return {
        preset: "today",
        startDate: todayStart,
        endDate: todayEnd,
        label: "Today"
      };
      
    case "yesterday": {
      const yStart = new Date(todayStart);
      yStart.setDate(yStart.getDate() - 1);
      const yEnd = new Date(todayEnd);
      yEnd.setDate(yEnd.getDate() - 1);
      return {
        preset: "yesterday",
        startDate: yStart,
        endDate: yEnd,
        label: "Yesterday"
      };
    }
    
    case "last_7_days": {
      const s = new Date(todayStart);
      s.setDate(s.getDate() - 6);
      return {
        preset: "last_7_days",
        startDate: s,
        endDate: todayEnd,
        label: "Last 7 Days"
      };
    }
    
    case "last_30_days": {
      const s = new Date(todayStart);
      s.setDate(s.getDate() - 29);
      return {
        preset: "last_30_days",
        startDate: s,
        endDate: todayEnd,
        label: "Last 30 Days"
      };
    }
    
    case "this_month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return {
        preset: "this_month",
        startDate: s,
        endDate: e,
        label: "This Month"
      };
    }
    
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return {
        preset: "last_month",
        startDate: s,
        endDate: e,
        label: "Last Month"
      };
    }
    
    case "this_year": {
      const s = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const e = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return {
        preset: "this_year",
        startDate: s,
        endDate: e,
        label: "This Year"
      };
    }
    
    case "last_year": {
      const s = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      const e = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      return {
        preset: "last_year",
        startDate: s,
        endDate: e,
        label: "Last Year"
      };
    }
    
    case "custom": {
      let s: Date;
      let e: Date;
      
      if (customStart) {
        const parts = customStart.split("-").map(Number);
        s = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
      } else {
        s = new Date(todayStart);
      }

      if (customEnd) {
        const parts = customEnd.split("-").map(Number);
        e = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
      } else {
        e = new Date(todayEnd);
      }
      
      if (isNaN(s.getTime())) s = new Date(todayStart);
      if (isNaN(e.getTime())) e = new Date(todayEnd);
      if (s.getTime() > e.getTime()) {
        const temp = s;
        s = e;
        e = temp;
      }
      
      const sStr = s.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      const eStr = e.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      
      return {
        preset: "custom",
        startDate: s,
        endDate: e,
        label: `${sStr} - ${eStr}`
      };
    }
    
    default:
      return {
        preset: "today",
        startDate: todayStart,
        endDate: todayEnd,
        label: "Today"
      };
  }
}

// -------------------------------------------------------------
// FILTER ORDERS BY DATE RANGE
// -------------------------------------------------------------
export function filterOrdersByDateRange(orders: Order[], range: DateRange): Order[] {
  const startMs = range.startDate.getTime();
  const endMs = range.endDate.getTime();
  
  return orders.filter(o => {
    const oDate = getOrderDate(o);
    const ms = oDate.getTime();
    return ms >= startMs && ms <= endMs;
  });
}

// -------------------------------------------------------------
// COMPUTE COMPREHENSIVE SALES METRICS
// -------------------------------------------------------------
export function computeSalesMetrics(
  allOrders: Order[], 
  filteredOrders: Order[]
): SalesSummaryMetrics {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  // Current Month vs Last Month
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();

  // Current Year vs Last Year
  const currentYearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
  const currentYearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999).getTime();
  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0).getTime();
  const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999).getTime();

  let todaySales = 0;
  let todayOrders = 0;
  
  let thisMonthSales = 0;
  let lastMonthSales = 0;
  
  let thisYearSales = 0;
  let lastYearSales = 0;

  // Process all orders for relative metrics
  allOrders.forEach(order => {
    const isVal = isValidOrder(order);
    if (!isVal) return;
    
    const dateMs = getOrderDate(order).getTime();
    const grandTotal = Number(order.grandTotal) || 0;

    // Today
    if (dateMs >= todayStart && dateMs <= todayEnd) {
      todaySales += grandTotal;
      todayOrders += 1;
    }

    // Month
    if (dateMs >= currentMonthStart && dateMs <= currentMonthEnd) {
      thisMonthSales += grandTotal;
    } else if (dateMs >= lastMonthStart && dateMs <= lastMonthEnd) {
      lastMonthSales += grandTotal;
    }

    // Year
    if (dateMs >= currentYearStart && dateMs <= currentYearEnd) {
      thisYearSales += grandTotal;
    } else if (dateMs >= lastYearStart && dateMs <= lastYearEnd) {
      lastYearSales += grandTotal;
    }
  });

  const todayAov = todayOrders > 0 ? Math.round(todaySales / todayOrders) : 0;

  // Growth calculations
  let monthGrowthPercent: number | null = null;
  if (lastMonthSales > 0) {
    monthGrowthPercent = Math.round(((thisMonthSales - lastMonthSales) / lastMonthSales) * 100);
  } else if (thisMonthSales > 0) {
    monthGrowthPercent = 100; // 100% growth from 0 base
  }

  let yearGrowthPercent: number | null = null;
  if (lastYearSales > 0) {
    yearGrowthPercent = Math.round(((thisYearSales - lastYearSales) / lastYearSales) * 100);
  } else if (thisYearSales > 0) {
    yearGrowthPercent = 100;
  }

  // Selected Period Metrics
  let periodSales = 0;
  let periodOrders = 0;
  let periodGrossSales = 0;
  let periodDiscount = 0;
  let periodGst = 0;
  let periodPackaging = 0;
  let cancelledCount = 0;
  let cancelledValue = 0;

  filteredOrders.forEach(order => {
    const isVal = isValidOrder(order);
    const grandTotal = Number(order.grandTotal) || 0;
    const subtotal = Number(order.subtotal) || 0;
    const discount = Number(order.discountAmount) || 0;
    const gst = Number(order.gst) || 0;
    const packaging = Number(order.packagingCharge) || 0;

    if (!isVal) {
      cancelledCount += 1;
      cancelledValue += grandTotal > 0 ? grandTotal : subtotal;
      return;
    }

    periodSales += grandTotal;
    periodOrders += 1;
    periodGrossSales += subtotal;
    periodDiscount += discount;
    periodGst += gst;
    periodPackaging += packaging;
  });

  const periodAov = periodOrders > 0 ? Math.round(periodSales / periodOrders) : 0;
  const periodNetSales = periodGrossSales - periodDiscount;

  return {
    todaySales,
    todayOrders,
    todayAov,
    thisMonthSales,
    lastMonthSales,
    monthGrowthPercent,
    thisYearSales,
    lastYearSales,
    yearGrowthPercent,
    periodSales,
    periodOrders,
    periodAov,
    periodGrossSales,
    periodDiscount,
    periodGst,
    periodPackaging,
    periodNetSales,
    cancelledCount,
    cancelledValue
  };
}

// -------------------------------------------------------------
// DAILY SALES AGGREGATION
// -------------------------------------------------------------
export function computeDailySales(
  filteredOrders: Order[], 
  range: DateRange
): DailySalesRecord[] {
  const dailyMap = new Map<string, {
    date: Date;
    ordersCount: number;
    grossSales: number;
    discount: number;
    gst: number;
    packaging: number;
    grandTotal: number;
  }>();

  // If the range spans 31 days or fewer, pre-fill all dates so the chart has continuous points
  const diffDays = Math.ceil((range.endDate.getTime() - range.startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 31 && diffDays > 0) {
    const curr = new Date(range.startDate);
    while (curr <= range.endDate) {
      const key = getLocalDateKey(curr);
      dailyMap.set(key, {
        date: new Date(curr),
        ordersCount: 0,
        grossSales: 0,
        discount: 0,
        gst: 0,
        packaging: 0,
        grandTotal: 0
      });
      curr.setDate(curr.getDate() + 1);
    }
  }

  // Populate actual valid orders
  filteredOrders.forEach(order => {
    if (!isValidOrder(order)) return;
    const dateObj = getOrderDate(order);
    const key = getLocalDateKey(dateObj);

    const current = dailyMap.get(key) || {
      date: dateObj,
      ordersCount: 0,
      grossSales: 0,
      discount: 0,
      gst: 0,
      packaging: 0,
      grandTotal: 0
    };

    current.ordersCount += 1;
    current.grossSales += Number(order.subtotal) || 0;
    current.discount += Number(order.discountAmount) || 0;
    current.gst += Number(order.gst) || 0;
    current.packaging += Number(order.packagingCharge) || 0;
    current.grandTotal += Number(order.grandTotal) || 0;

    dailyMap.set(key, current);
  });

  // Sort chronologically
  const sortedKeys = Array.from(dailyMap.keys()).sort();
  
  return sortedKeys.map(key => {
    const item = dailyMap.get(key)!;
    const netSales = item.grossSales - item.discount;
    const aov = item.ordersCount > 0 ? Math.round(item.grandTotal / item.ordersCount) : 0;
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    
    return {
      dateKey: key,
      formattedDate: item.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      dayName: dayNames[item.date.getDay()],
      ordersCount: item.ordersCount,
      grossSales: item.grossSales,
      discount: item.discount,
      gst: item.gst,
      packaging: item.packaging,
      netSales,
      grandTotal: item.grandTotal,
      aov
    };
  });
}

// -------------------------------------------------------------
// MONTHLY SALES AGGREGATION (For a specific Year)
// -------------------------------------------------------------
export function computeMonthlySales(
  allOrders: Order[], 
  targetYear: number
): MonthlySalesRecord[] {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthShort = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const now = new Date();
  const isCurrentYear = targetYear === now.getFullYear();
  const currentMonthIdx = now.getMonth();

  const records: MonthlySalesRecord[] = monthNames.map((name, idx) => ({
    monthIndex: idx,
    monthName: name,
    monthShort: monthShort[idx],
    ordersCount: 0,
    grossSales: 0,
    discount: 0,
    gst: 0,
    packaging: 0,
    netSales: 0,
    grandTotal: 0,
    isFuture: isCurrentYear ? idx > currentMonthIdx : targetYear > now.getFullYear(),
    growthVsPrevMonth: null
  }));

  allOrders.forEach(order => {
    if (!isValidOrder(order)) return;
    const dateObj = getOrderDate(order);
    if (dateObj.getFullYear() !== targetYear) return;

    const mIdx = dateObj.getMonth();
    const rec = records[mIdx];
    if (!rec) return;

    rec.ordersCount += 1;
    rec.grossSales += Number(order.subtotal) || 0;
    rec.discount += Number(order.discountAmount) || 0;
    rec.gst += Number(order.gst) || 0;
    rec.packaging += Number(order.packagingCharge) || 0;
    rec.grandTotal += Number(order.grandTotal) || 0;
  });

  // Calculate netSales and month-over-month growth
  records.forEach((rec, idx) => {
    rec.netSales = rec.grossSales - rec.discount;
    if (idx > 0) {
      const prev = records[idx - 1];
      if (prev.grandTotal > 0 && !rec.isFuture) {
        rec.growthVsPrevMonth = Math.round(((rec.grandTotal - prev.grandTotal) / prev.grandTotal) * 100);
      } else if (rec.grandTotal > 0 && prev.grandTotal === 0) {
        rec.growthVsPrevMonth = 100;
      }
    }
  });

  return records;
}

// -------------------------------------------------------------
// YEARLY SALES AGGREGATION
// -------------------------------------------------------------
export function computeYearlySales(allOrders: Order[]): YearlySalesRecord[] {
  const yearMap = new Map<number, {
    ordersCount: number;
    grossSales: number;
    discount: number;
    gst: number;
    grandTotal: number;
  }>();

  // Find all distinct years in data, plus current year
  const currentYear = new Date().getFullYear();
  yearMap.set(currentYear, { ordersCount: 0, grossSales: 0, discount: 0, gst: 0, grandTotal: 0 });

  allOrders.forEach(order => {
    if (!isValidOrder(order)) return;
    const y = getOrderDate(order).getFullYear();
    const current = yearMap.get(y) || { ordersCount: 0, grossSales: 0, discount: 0, gst: 0, grandTotal: 0 };
    
    current.ordersCount += 1;
    current.grossSales += Number(order.subtotal) || 0;
    current.discount += Number(order.discountAmount) || 0;
    current.gst += Number(order.gst) || 0;
    current.grandTotal += Number(order.grandTotal) || 0;

    yearMap.set(y, current);
  });

  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);
  const result: YearlySalesRecord[] = [];

  sortedYears.forEach((year, index) => {
    const data = yearMap.get(year)!;
    const netSales = data.grossSales - data.discount;
    const aov = data.ordersCount > 0 ? Math.round(data.grandTotal / data.ordersCount) : 0;
    
    let growthVsPrevYear: number | null = null;
    if (index > 0) {
      const prevData = yearMap.get(sortedYears[index - 1]);
      if (prevData && prevData.grandTotal > 0) {
        growthVsPrevYear = Math.round(((data.grandTotal - prevData.grandTotal) / prevData.grandTotal) * 100);
      } else if (data.grandTotal > 0) {
        growthVsPrevYear = 100;
      }
    }

    result.push({
      year,
      ordersCount: data.ordersCount,
      grossSales: data.grossSales,
      discount: data.discount,
      gst: data.gst,
      netSales,
      grandTotal: data.grandTotal,
      aov,
      growthVsPrevYear
    });
  });

  return result;
}

// -------------------------------------------------------------
// ORDER TYPE BREAKDOWN
// -------------------------------------------------------------
export function computeOrderTypeBreakdown(filteredOrders: Order[]): OrderTypeBreakdown[] {
  let dineInRev = 0;
  let dineInCount = 0;
  let takeawayRev = 0;
  let takeawayCount = 0;
  let deliveryRev = 0;
  let deliveryCount = 0;
  let qrOnlineRev = 0;
  let qrOnlineCount = 0;

  filteredOrders.forEach(order => {
    if (!isValidOrder(order)) return;
    const total = Number(order.grandTotal) || 0;
    const rawType = (order.orderType || "").toLowerCase().trim();

    // Check if it is a QR / Web self-order (e.g. tableNumber present with QR pattern or online customer order)
    const isQR = rawType.includes("qr") || (order.tableNumber && !order.items.some(i => i.addedBy?.includes("Cashier") || i.addedBy?.includes("POS")));

    if (rawType === "dine-in" || rawType === "dinein" || rawType === "table") {
      if (isQR) {
        qrOnlineRev += total;
        qrOnlineCount += 1;
      } else {
        dineInRev += total;
        dineInCount += 1;
      }
    } else if (rawType === "takeaway" || rawType === "pickup") {
      takeawayRev += total;
      takeawayCount += 1;
    } else if (rawType === "delivery") {
      deliveryRev += total;
      deliveryCount += 1;
    } else {
      dineInRev += total;
      dineInCount += 1;
    }
  });

  const totalRev = dineInRev + takeawayRev + deliveryRev + qrOnlineRev;

  const list: OrderTypeBreakdown[] = [
    {
      type: "dine-in",
      label: "Dine-In",
      ordersCount: dineInCount,
      revenue: dineInRev,
      percentage: totalRev > 0 ? Math.round((dineInRev / totalRev) * 100) : 0,
      color: "#059669" // Emerald green
    },
    {
      type: "takeaway",
      label: "Takeaway",
      ordersCount: takeawayCount,
      revenue: takeawayRev,
      percentage: totalRev > 0 ? Math.round((takeawayRev / totalRev) * 100) : 0,
      color: "#D97706" // Amber
    },
    {
      type: "delivery",
      label: "Home Delivery",
      ordersCount: deliveryCount,
      revenue: deliveryRev,
      percentage: totalRev > 0 ? Math.round((deliveryRev / totalRev) * 100) : 0,
      color: "#2563EB" // Blue
    },
    {
      type: "qr_online",
      label: "QR / Table Self-Order",
      ordersCount: qrOnlineCount,
      revenue: qrOnlineRev,
      percentage: totalRev > 0 ? Math.round((qrOnlineRev / totalRev) * 100) : 0,
      color: "#7C3AED" // Purple
    }
  ];

  return list.filter(item => item.ordersCount > 0 || totalRev === 0);
}

// -------------------------------------------------------------
// PAYMENT METHOD BREAKDOWN
// -------------------------------------------------------------
export function computePaymentMethodBreakdown(filteredOrders: Order[]): PaymentMethodBreakdown[] {
  const methodMap = new Map<string, { count: number; total: number }>();

  filteredOrders.forEach(order => {
    if (!isValidOrder(order)) return;
    
    // Check if the order has detailed payment records
    const validPayments = (order.payments || []).filter(p => p.status === "Paid");

    if (validPayments.length > 0) {
      validPayments.forEach(p => {
        const amt = Number(p.amount) || 0;
        let m = (p.paymentMethod || "").trim();
        const mLower = m.toLowerCase();
        let normalized = "Other";
        if (mLower.includes("cash")) normalized = "Cash";
        else if (mLower.includes("upi") || mLower.includes("gpay") || mLower.includes("phonepe") || mLower.includes("paytm")) normalized = "UPI";
        else if (mLower.includes("card") || mLower.includes("pos") || mLower.includes("credit") || mLower.includes("debit")) normalized = "Card / EDC";
        else if (mLower.includes("bank") || mLower.includes("transfer") || mLower.includes("neft") || mLower.includes("rtgs")) normalized = "Bank Transfer";
        else if (mLower.includes("online") || mLower.includes("razorpay") || mLower.includes("stripe")) normalized = "Online Gateway";
        else normalized = m || "Other";

        const current = methodMap.get(normalized) || { count: 0, total: 0 };
        current.count += 1;
        current.total += amt;
        methodMap.set(normalized, current);
      });
    } else {
      const collectedAmount = order.paymentStatus === "Paid"
        ? (Number(order.grandTotal) || 0)
        : (Number(order.paidAmount) || 0);

      if (collectedAmount <= 0) {
        return; // Unpaid / Pending order with 0 settled tender
      }

      let m = (order.paymentMethod || "").trim();
      
      if (!m) {
        m = "Cash";
      }

      // Check if order has comma or plus separated multi methods
      const mLower = m.toLowerCase();
      let normalized = "Other";
      if (mLower.includes("cash")) normalized = "Cash";
      else if (mLower.includes("upi") || mLower.includes("gpay") || mLower.includes("phonepe") || mLower.includes("paytm")) normalized = "UPI";
      else if (mLower.includes("card") || mLower.includes("pos") || mLower.includes("credit") || mLower.includes("debit")) normalized = "Card / EDC";
      else if (mLower.includes("bank") || mLower.includes("transfer")) normalized = "Bank Transfer";
      else if (mLower.includes("online") || mLower.includes("razorpay") || mLower.includes("stripe")) normalized = "Online Gateway";
      else normalized = m;

      const current = methodMap.get(normalized) || { count: 0, total: 0 };
      current.count += 1;
      current.total += collectedAmount;
      methodMap.set(normalized, current);
    }
  });

  const totalAllRev = Array.from(methodMap.values()).reduce((sum, v) => sum + v.total, 0);

  const colors: Record<string, string> = {
    "Cash": "#10B981", // Green
    "UPI": "#6366F1", // Indigo
    "Card / EDC": "#F59E0B", // Amber
    "Bank Transfer": "#0EA5E9", // Sky
    "Online Gateway": "#3B82F6", // Blue
    "Other": "#8B5CF6" // Purple
  };

  const results: PaymentMethodBreakdown[] = [];
  methodMap.forEach((val, key) => {
    results.push({
      method: key,
      ordersCount: val.count,
      totalAmount: Math.round(val.total * 100) / 100,
      percentage: totalAllRev > 0 ? Math.round((val.total / totalAllRev) * 100) : 0,
      color: colors[key] || "#94A3B8"
    });
  });

  return results.sort((a, b) => b.totalAmount - a.totalAmount);
}

// -------------------------------------------------------------
// TOP SELLING ITEMS
// -------------------------------------------------------------
export function computeTopSellingItems(
  filteredOrders: Order[], 
  menuItems: MenuItem[]
): ItemSalesRecord[] {
  const itemMap = new Map<string, {
    menuItemId?: string;
    name: string;
    category: string;
    quantitySold: number;
    totalRevenue: number;
  }>();

  // Create menu map for quick category and price lookup
  const menuMap = new Map<string, MenuItem>();
  menuItems.forEach(mi => {
    menuMap.set(mi.id, mi);
    menuMap.set(mi.name.toLowerCase().trim(), mi);
  });

  filteredOrders.forEach(order => {
    if (!isValidOrder(order)) return;
    if (!Array.isArray(order.items)) return;

    order.items.forEach(it => {
      const name = (it.name || "Unknown Dish").trim();
      const qty = Number(it.quantity) || 1;
      const price = Number(it.price) || 0;
      const revenue = qty * price;

      // Determine category
      let category = "General";
      const matched = it.menuItemId ? menuMap.get(it.menuItemId) : menuMap.get(name.toLowerCase());
      if (matched && matched.category) {
        category = matched.category;
      }

      const key = it.menuItemId || name.toLowerCase();
      const current = itemMap.get(key) || {
        menuItemId: it.menuItemId,
        name,
        category,
        quantitySold: 0,
        totalRevenue: 0
      };

      current.quantitySold += qty;
      current.totalRevenue += revenue;
      itemMap.set(key, current);
    });
  });

  const totalRev = Array.from(itemMap.values()).reduce((sum, i) => sum + i.totalRevenue, 0);

  const sorted = Array.from(itemMap.values()).sort((a, b) => b.quantitySold - a.quantitySold || b.totalRevenue - a.totalRevenue);

  return sorted.map((item, idx) => ({
    rank: idx + 1,
    menuItemId: item.menuItemId,
    name: item.name,
    category: item.category,
    quantitySold: item.quantitySold,
    totalRevenue: item.totalRevenue,
    percentageOfSales: totalRev > 0 ? Number(((item.totalRevenue / totalRev) * 100).toFixed(1)) : 0,
    averagePrice: item.quantitySold > 0 ? Math.round(item.totalRevenue / item.quantitySold) : 0
  }));
}

// -------------------------------------------------------------
// TOP CATEGORIES BREAKDOWN
// -------------------------------------------------------------
export function computeCategoryBreakdown(
  filteredOrders: Order[], 
  menuItems: MenuItem[],
  categoriesList: Category[]
): CategorySalesRecord[] {
  const catMap = new Map<string, {
    quantitySold: number;
    totalRevenue: number;
    orderIds: Set<string>;
  }>();

  const menuLookup = new Map<string, MenuItem>();
  menuItems.forEach(mi => {
    menuLookup.set(mi.id, mi);
    menuLookup.set(mi.name.toLowerCase().trim(), mi);
  });

  const catIconLookup = new Map<string, string>();
  categoriesList.forEach(c => {
    catIconLookup.set(c.id, c.icon);
    catIconLookup.set(c.name.toLowerCase(), c.icon);
  });

  filteredOrders.forEach(order => {
    if (!isValidOrder(order)) return;
    if (!Array.isArray(order.items)) return;

    order.items.forEach(it => {
      const name = (it.name || "").trim();
      const qty = Number(it.quantity) || 1;
      const price = Number(it.price) || 0;
      const revenue = qty * price;

      let catName = "Specialties";
      const matched = it.menuItemId ? menuLookup.get(it.menuItemId) : menuLookup.get(name.toLowerCase());
      if (matched && matched.category) {
        catName = matched.category;
      }

      const current = catMap.get(catName) || {
        quantitySold: 0,
        totalRevenue: 0,
        orderIds: new Set<string>()
      };

      current.quantitySold += qty;
      current.totalRevenue += revenue;
      if (order.id) current.orderIds.add(order.id);
      catMap.set(catName, current);
    });
  });

  const totalRev = Array.from(catMap.values()).reduce((sum, c) => sum + c.totalRevenue, 0);

  const results: CategorySalesRecord[] = [];
  catMap.forEach((val, catName) => {
    results.push({
      category: catName,
      icon: catIconLookup.get(catName) || catIconLookup.get(catName.toLowerCase()) || "🍲",
      quantitySold: val.quantitySold,
      totalRevenue: val.totalRevenue,
      percentageOfSales: totalRev > 0 ? Number(((val.totalRevenue / totalRev) * 100).toFixed(1)) : 0,
      ordersCount: val.orderIds.size
    });
  });

  return results.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

// -------------------------------------------------------------
// HOURLY SALES BREAKDOWN (Peak Hours)
// -------------------------------------------------------------
export function computeHourlySales(filteredOrders: Order[]): HourlySalesRecord[] {
  const hours: HourlySalesRecord[] = Array.from({ length: 24 }, (_, i) => {
    const ampm = i >= 12 ? "PM" : "AM";
    const displayHour = i % 12 === 0 ? 12 : i % 12;
    return {
      hour: i,
      hourLabel: `${displayHour} ${ampm}`,
      ordersCount: 0,
      revenue: 0
    };
  });

  filteredOrders.forEach(order => {
    if (!isValidOrder(order)) return;
    const dateObj = getOrderDate(order);
    const h = dateObj.getHours();
    if (hours[h]) {
      hours[h].ordersCount += 1;
      hours[h].revenue += Number(order.grandTotal) || 0;
    }
  });

  return hours;
}

// -------------------------------------------------------------
// EXPORT ORDERS TO CSV
// -------------------------------------------------------------
export function exportOrdersToCSV(orders: Order[], filename: string = "webrajya_sales_report.csv"): void {
  const headers = [
    "Order ID",
    "Date",
    "Time",
    "Customer Name",
    "Phone Number",
    "Order Type",
    "Table No",
    "Items Count",
    "Items Details",
    "Subtotal (₹)",
    "Discount (₹)",
    "GST (₹)",
    "Packaging (₹)",
    "Grand Total (₹)",
    "Payment Method",
    "Payment Status",
    "Order Status"
  ];

  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return '""';
    const str = String(value).replace(/"/g, '""');
    return `"${str}"`;
  };

  // Only export valid sales orders (exclude cancelled / rejected)
  const validOrders = orders.filter(isValidOrder);

  const rows = validOrders.map(order => {
    const d = getOrderDate(order);
    const dateStr = getLocalDateKey(d);
    const timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    
    const itemsCount = Array.isArray(order.items) 
      ? order.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0)
      : 0;

    const itemsSummary = Array.isArray(order.items)
      ? order.items.map(it => `${it.name} x${it.quantity}`).join("; ")
      : "";

    return [
      escapeCSV(order.id),
      escapeCSV(dateStr),
      escapeCSV(timeStr),
      escapeCSV(order.customerName || "Walk-in Guest"),
      escapeCSV(order.phoneNumber || "N/A"),
      escapeCSV(order.orderType || "dine-in"),
      escapeCSV(order.tableNumber || "-"),
      escapeCSV(itemsCount),
      escapeCSV(itemsSummary),
      escapeCSV(order.subtotal || 0),
      escapeCSV(order.discountAmount || 0),
      escapeCSV(order.gst || 0),
      escapeCSV(order.packagingCharge || 0),
      escapeCSV(order.grandTotal || 0),
      escapeCSV(order.paymentMethod || "Cash"),
      escapeCSV(order.paymentStatus || "Paid"),
      escapeCSV(order.orderStatus || "Delivered")
    ].join(",");
  });

  const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
