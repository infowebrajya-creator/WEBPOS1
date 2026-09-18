import { Order } from "./db";

export interface DailySummaryData {
  restaurantName: string;
  dateStr: string;
  totalSales: number;
  orderCount: number;
  cashSales: number;
  onlineSales: number;
  otherSales: number;
  totalDiscounts: number;
  totalTax: number;
  avgBill: number;
  topItems: { name: string; quantity: number; revenue: number }[];
  cashierName: string;
}

/**
 * Intelligently cleans and normalizes a phone number for wa.me links.
 * Handles Indian numbers (10 digits starting with 6-9 -> prepends 91)
 * and strips any formatting characters.
 */
export function formatWhatsAppPhoneNumber(rawPhone: string): string {
  if (!rawPhone) return "";
  const cleaned = rawPhone.replace(/[^0-9]/g, "");
  
  // If 10 digits starting with 6, 7, 8, or 9, assume Indian mobile number and prefix 91
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return `91${cleaned}`;
  }
  
  // If 11 digits starting with 0 (e.g. 09876543210), strip the leading 0 and prefix 91
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    return `91${cleaned.slice(1)}`;
  }
  
  return cleaned;
}

/**
 * Computes the closing financial figures and best selling items for a specific date.
 */
export function computeDailySummaryData(
  orders: Order[],
  targetDate: Date = new Date(),
  restaurantName: string = "WEBRAJYA POS",
  cashierName: string = "Cashier"
): DailySummaryData {
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();
  const targetDay = targetDate.getDate();

  // Filter valid completed/active orders for the selected date
  const dayOrders = orders.filter((o) => {
    if (!o.createdAt) return false;
    if (o.orderStatus === "Cancelled") return false;

    const orderDate = new Date(o.createdAt);
    return (
      orderDate.getFullYear() === targetYear &&
      orderDate.getMonth() === targetMonth &&
      orderDate.getDate() === targetDay
    );
  });

  let totalSales = 0;
  let cashSales = 0;
  let onlineSales = 0;
  let otherSales = 0;
  let totalDiscounts = 0;
  let totalTax = 0;

  const itemMap: Record<string, { quantity: number; revenue: number }> = {};

  for (const o of dayOrders) {
    const total = Number(o.grandTotal || 0);
    totalSales += total;

    const method = (o.paymentMethod || "Cash").toLowerCase();
    if (method.includes("cash")) {
      cashSales += total;
    } else if (
      method.includes("upi") ||
      method.includes("card") ||
      method.includes("online") ||
      method.includes("gpay") ||
      method.includes("phonepe") ||
      method.includes("paytm")
    ) {
      onlineSales += total;
    } else {
      otherSales += total;
    }

    if (o.discountAmount) {
      totalDiscounts += Number(o.discountAmount || 0);
    }

    if (o.gst) {
      totalTax += Number(o.gst || 0);
    }

    // Accumulate items
    if (Array.isArray(o.items)) {
      for (const item of o.items) {
        const name = item.name || "Item";
        const qty = Number(item.quantity || 1);
        const price = Number(item.price || 0);
        if (!itemMap[name]) {
          itemMap[name] = { quantity: 0, revenue: 0 };
        }
        itemMap[name].quantity += qty;
        itemMap[name].revenue += qty * price;
      }
    }
  }

  const orderCount = dayOrders.length;
  const avgBill = orderCount > 0 ? totalSales / orderCount : 0;

  // Sort top items by volume
  const topItems = Object.entries(itemMap)
    .map(([name, stat]) => ({
      name,
      quantity: stat.quantity,
      revenue: stat.revenue,
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const dateStr = targetDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return {
    restaurantName,
    dateStr,
    totalSales,
    orderCount,
    cashSales,
    onlineSales,
    otherSales,
    totalDiscounts,
    totalTax,
    avgBill,
    topItems,
    cashierName,
  };
}

/**
 * Builds the beautifully formatted WhatsApp message.
 */
export function buildWhatsAppSummaryMessage(data: DailySummaryData): string {
  const formatINR = (amount: number) =>
    `₹${amount.toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;

  let topItemsText = "";
  if (data.topItems.length > 0) {
    topItemsText = data.topItems
      .slice(0, 3)
      .map((item, idx) => `${idx + 1}. ${item.name} (${item.quantity} portions)`)
      .join("\n");
  } else {
    topItemsText = "No items recorded today";
  }

  const lines = [
    `📊 *${data.restaurantName.toUpperCase()} — Daily Closing Report*`,
    `📅 *Date:* ${data.dateStr} | Shift: Full Day`,
    ``,
    `💰 *Total Gross Sales:* ${formatINR(data.totalSales)} (${data.orderCount} orders)`,
    `💵 *Cash:* ${formatINR(data.cashSales)}`,
    `📱 *UPI / Card / Online:* ${formatINR(data.onlineSales)}`,
  ];

  if (data.otherSales > 0) {
    lines.push(`💳 *Other Payments:* ${formatINR(data.otherSales)}`);
  }

  if (data.totalDiscounts > 0) {
    lines.push(`🏷️ *Total Discounts:* ${formatINR(data.totalDiscounts)}`);
  }

  lines.push(`🧾 *Avg Bill Value:* ${formatINR(data.avgBill)}`);

  if (data.totalTax > 0) {
    lines.push(`🏛️ *Tax Collected (GST):* ${formatINR(data.totalTax)}`);
  }

  lines.push(
    ``,
    `🔥 *Top Sellers Today:*`,
    topItemsText,
    ``,
    `🔒 *Day Closed by:* ${data.cashierName || "Cashier (Counter 1)"}`,
    `✨ _Sent automatically via WebRajya POS_`
  );

  return lines.join("\n");
}

/**
 * Triggers the browser to open WhatsApp Web / App with the pre-filled message.
 */
export function openWhatsAppSummary(phone: string, message: string): void {
  const cleanPhone = formatWhatsAppPhoneNumber(phone);
  const encodedMessage = encodeURIComponent(message);
  
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedMessage}`
    : `https://wa.me/?text=${encodedMessage}`;

  window.open(url, "_blank", "noopener,noreferrer");
}
