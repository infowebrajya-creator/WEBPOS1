import { MenuItem, Shift, ShiftFinancials } from "../types";
import { ESCPOSBuilder } from "./escposBuilder";
import { NativePrinterService } from "./nativePrinterService";
import { RestaurantSettings, defaultOutlets, defaultTermsAndConditions } from "./db";
import { PrinterManager } from "./printerManager";

export { PrinterManager };

export interface PrinterItem {
  name: string;
  quantity: number;
  price?: number;
  customization?: string;
  isManual?: boolean;
}

export interface PrinterData {
  id: string;
  tableNumber?: string;
  orderType: string;
  createdAt: string;
  items: PrinterItem[];
  specialInstructions?: string;
  subtotal?: number;
  gst?: number;
  packagingCharge?: number;
  discountAmount?: number;
  appliedCoupon?: string;
  grandTotal?: number;
  paymentStatus?: string;
  phoneNumber?: string;
  customerName?: string;
}

export interface PrintableLine {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  doubleSize?: boolean;
  doubleHeight?: boolean;
}

/**
 * Modern Browser-based Physical thermal ESC/POS Printing Service
 * Generates all receipts dynamically from an array of printable lines.
 */
export class PhysicalThermalPrinter {
  private static usbDevice: any = null;
  private static serialPort: any = null;

  public static isUSBConnected(): boolean {
    return !!this.usbDevice;
  }

  public static isSerialConnected(): boolean {
    return !!this.serialPort;
  }

  /**
   * Helper to encode standard text to raw Uint8Array (Windows-1252 / ASCII compatible)
   */
  private static encodeASCII(text: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(text);
  }

  /**
   * Automatically wrap long text into chunks of at most 'limit' characters, splitting at words where possible.
   */
  public static wrapText(text: string, limit: number): string[] {
    if (!text) return [""];
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      if (!word) continue;

      if (word.length > limit) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = "";
        }
        let remaining = word;
        while (remaining.length > limit) {
          lines.push(remaining.substring(0, limit));
          remaining = remaining.substring(limit);
        }
        currentLine = remaining;
      } else {
        if (currentLine.length + word.length + (currentLine ? 1 : 0) <= limit) {
          currentLine += (currentLine ? " " : "") + word;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines.length > 0 ? lines : [""];
  }

  /**
   * Generate PrintableLine array for Kitchen Order Ticket (KOT)
   */
  public static generateKOTLines(data: PrinterData, width: "58mm" | "80mm" = "80mm", cashierName: string = "Cashier"): PrintableLine[] {
    const divider = "-".repeat(32);
    const lines: PrintableLine[] = [];

    // 1. Header (Centered, bold)
    lines.push({ text: "THE XINGS KITCHEN", align: "center", bold: true });
    lines.push({ text: "KOT", align: "center", bold: true });
    lines.push({ text: divider, align: "center" });

    // 2. Metadata Section (Left aligned)
    const rawKot = (data as any).kotNumber || (data as any).kot_number || data.id || "001";
    const kotClean = String(rawKot).replace(/KOT-?/i, "").trim() || "001";
    const kotNum = kotClean.length < 3 && /^\d+$/.test(kotClean) ? kotClean.padStart(3, "0") : kotClean;

    const rawOrder = (data as any).orderId || (data as any).order_id || data.id || "1042";
    const orderClean = String(rawOrder).replace(/^#/, "");

    const leftMeta = `KOT: ${kotNum}`;
    const rightMeta = `#${orderClean}`;
    const spacesMeta = Math.max(1, 32 - leftMeta.length - rightMeta.length);
    lines.push({ text: leftMeta + " ".repeat(spacesMeta) + rightMeta, align: "left" });

    const rawTable = data.tableNumber;
    const isTakeaway = (data.orderType || "").toLowerCase() === "takeaway";
    const hasTable = rawTable &&
      rawTable !== "0" &&
      rawTable !== "null" &&
      rawTable !== "undefined" &&
      String(rawTable).trim() !== "" &&
      !isTakeaway;

    if (hasTable) {
      lines.push({ text: `TABLE: ${String(rawTable).padStart(2, "0")}`, align: "left" });
    }

    lines.push({ text: `TYPE: ${(data.orderType || "TAKEAWAY").toUpperCase()}`, align: "left" });

    const d = new Date(data.createdAt || Date.now());
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const timeStr = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
    lines.push({ text: `TIME: ${timeStr}`, align: "left" });

    // 3. Items Table
    lines.push({ text: divider, align: "center" });
    lines.push({ text: "QTY    ITEM", align: "left", bold: true });
    lines.push({ text: divider, align: "center" });

    for (const item of data.items) {
      const qtyStr = String(item.quantity || 1).padStart(2, " ");
      lines.push({ text: `${qtyStr}     ${item.name}`, align: "left", bold: true });
      if (item.customization) {
        lines.push({ text: `       NOTE: ${item.customization}`, align: "left" });
      }
    }
    lines.push({ text: divider, align: "center" });

    // 4. Order Notes
    const rawNotes = data.specialInstructions;
    const hasNotes = rawNotes &&
      typeof rawNotes === "string" &&
      rawNotes.trim() !== "" &&
      rawNotes.trim().toLowerCase() !== "none";

    if (hasNotes) {
      lines.push({ text: "NOTE:", align: "left", bold: true });
      const noteLines = rawNotes
        .split(/[\r\n]+/)
        .flatMap((l: string) => l.split(","))
        .map((l: string) => l.trim())
        .filter(Boolean);

      for (const nl of noteLines) {
        lines.push({ text: nl, align: "left" });
      }
      lines.push({ text: divider, align: "center" });
    }

    return lines;
  }

  /**
   * Generate PrintableLine array for Customer Bill
   */
  public static generateBillLines(data: any, settings: any, width: "58mm" | "80mm" = "80mm"): PrintableLine[] {
    const is80 = width === "80mm";
    const lineWidth = is80 ? 40 : 32;
    const divider = "-".repeat(lineWidth);

    const lines: PrintableLine[] = [];

    // 1. Centered Title
    lines.push({ text: "THE XINGS KITCHEN", align: "center", bold: true });
    lines.push({ text: "-----------------", align: "center" });

    // 2. Metadata Section
    const rawBillNo = data.billNo || data.billNumber || data.id || "SR-345484";
    const billNo = String(rawBillNo).toUpperCase().startsWith("SR-") ? String(rawBillNo) : `SR-${rawBillNo}`;
    lines.push({ text: `Bill No: ${billNo}`, align: "left" });

    const rawTable = data.tableNumber || data.table || data.table_number;
    const isTakeaway = (data.orderType || "").toLowerCase() === "takeaway";
    const hasTable = rawTable &&
      rawTable !== "0" &&
      rawTable !== 0 &&
      rawTable !== "null" &&
      rawTable !== "undefined" &&
      String(rawTable).trim() !== "" &&
      !isTakeaway;

    if (hasTable) {
      lines.push({ text: `Table: ${String(rawTable).padStart(2, "0")}`, align: "left" });
    }

    const d = new Date(data.createdAt || Date.now());
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const timeStr = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;

    lines.push({ text: `Date: ${dateStr}     Time: ${timeStr}`, align: "left" });
    lines.push({ text: `Order Type: ${(data.orderType || "DINE-IN").toUpperCase()}`, align: "left" });
    lines.push({ text: divider, align: "center" });

    // 3. Items List
    const fmt = (val: number): string => (Number.isInteger(val) ? String(val) : val.toFixed(2));
    if (is80) {
      lines.push({ text: "ITEM".padEnd(20) + "QTY".padStart(5) + "RATE".padStart(8) + "AMT".padStart(7), align: "left", bold: true });
      lines.push({ text: divider, align: "center" });

      for (const item of (data.items || [])) {
        const qty = Number(item.quantity) || 1;
        const rate = Number(item.price ?? item.unitPrice ?? 0);
        const amt = rate * qty;
        lines.push({
          text: (item.name || "Item").slice(0, 20).padEnd(20) + String(qty).padStart(5) + fmt(rate).padStart(8) + fmt(amt).padStart(7),
          align: "left"
        });
        if (item.customization) {
          lines.push({ text: `  + ${item.customization}`, align: "left" });
        }
      }
    } else {
      lines.push({ text: "ITEM".padEnd(14) + "QTY".padStart(4) + "RATE".padStart(7) + "AMT".padStart(7), align: "left", bold: true });
      lines.push({ text: divider, align: "center" });

      for (const item of (data.items || [])) {
        const qty = Number(item.quantity) || 1;
        const rate = Number(item.price ?? item.unitPrice ?? 0);
        const amt = rate * qty;
        lines.push({
          text: (item.name || "Item").slice(0, 14).padEnd(14) + String(qty).padStart(4) + fmt(rate).padStart(7) + fmt(amt).padStart(7),
          align: "left"
        });
        if (item.customization) {
          lines.push({ text: `  + ${item.customization}`, align: "left" });
        }
      }
    }
    lines.push({ text: divider, align: "center" });

    // 4. Financial Summary
    const items = data.items || [];
    const calculatedSubtotal = items.reduce((sum: number, it: any) => sum + (Number(it.price ?? it.unitPrice ?? 0) * (Number(it.quantity) || 1)), 0);
    const subtotalVal = Number(data.subtotal ?? calculatedSubtotal);
    const discountVal = Number(data.discountAmount ?? data.discount ?? 0);
    const gstVal = Number(data.gst ?? data.totalGst ?? 0);
    const packagingVal = isTakeaway ? 0 : Number(data.packagingCharge || 0);
    const grandTotalVal = isTakeaway
      ? Math.max(0, Math.round(subtotalVal - discountVal + gstVal))
      : Number(data.grandTotal ?? Math.round(subtotalVal - discountVal + packagingVal + gstVal));

    if (is80) {
      lines.push({ text: "SUBTOTAL".padStart(32) + fmt(subtotalVal).padStart(8), align: "left" });
      if (discountVal > 0) {
        lines.push({ text: "DISCOUNT".padStart(32) + fmt(discountVal).padStart(8), align: "left" });
      }
      if (!isTakeaway && packagingVal > 0) {
        lines.push({ text: "PACKING CHARGES".padStart(32) + fmt(packagingVal).padStart(8), align: "left" });
      }
      if (gstVal > 0) {
        lines.push({ text: "GST".padStart(32) + fmt(gstVal).padStart(8), align: "left" });
      }
      lines.push({ text: divider, align: "center" });
      lines.push({ text: "GRAND TOTAL".padStart(28) + (" ₹" + fmt(grandTotalVal)).padStart(12), align: "left", bold: true });
    } else {
      lines.push({ text: "SUBTOTAL".padStart(24) + fmt(subtotalVal).padStart(8), align: "left" });
      if (discountVal > 0) {
        lines.push({ text: "DISCOUNT".padStart(24) + fmt(discountVal).padStart(8), align: "left" });
      }
      if (!isTakeaway && packagingVal > 0) {
        lines.push({ text: "PACKING".padStart(24) + fmt(packagingVal).padStart(8), align: "left" });
      }
      if (gstVal > 0) {
        lines.push({ text: "GST".padStart(24) + fmt(gstVal).padStart(8), align: "left" });
      }
      lines.push({ text: divider, align: "center" });
      lines.push({ text: "GRAND TOTAL".padStart(22) + (" ₹" + fmt(grandTotalVal)).padStart(10), align: "left", bold: true });
    }
    lines.push({ text: divider, align: "center" });

    // 5. Clean Footer
    lines.push({ text: "Thank You! Visit Again", align: "center" });

    return lines;
  }

  /**
   * Generate PrintableLine array for Back Side (Outlets & Terms)
   */
  public static generateBackSideLines(settings: any, width: "58mm" | "80mm" = "80mm"): PrintableLine[] {
    const is80 = width === "80mm";
    const lineCharWidth = is80 ? 48 : 32;
    const divider = "-".repeat(lineCharWidth);
    const doubleDivider = "=".repeat(lineCharWidth);

    const lines: PrintableLine[] = [];

    // Header
    lines.push({ text: `  ${(settings.name || "WEBRAJYA POS").toUpperCase()}  `, align: "center", bold: true, doubleSize: true });
    lines.push({ text: (settings.backSideTitle || "OUR BRANCH OUTLETS & POLICIES").toUpperCase(), align: "center", bold: true });
    lines.push({ text: doubleDivider, align: "center" });

    // Outlets
    lines.push({ text: "=== OUR OUTLET LOCATIONS ===", align: "center", bold: true });
    const outlets = (settings.outlets && settings.outlets.length > 0) ? settings.outlets : defaultOutlets;
    outlets.forEach((o: any, i: number) => {
      lines.push({ text: `${i + 1}. ${o.name}`, align: "left", bold: true });
      lines.push({ text: `   ${o.address}`, align: "left" });
      lines.push({ text: `   Ph: ${o.contactNumber}`, align: "left" });
    });
    lines.push({ text: divider, align: "center" });

    // Terms
    lines.push({ text: "=== TERMS & CONDITIONS ===", align: "center", bold: true });
    const terms = (settings.termsAndConditions && settings.termsAndConditions.length > 0) ? settings.termsAndConditions : defaultTermsAndConditions;
    terms.forEach((t: string, i: number) => {
      lines.push({ text: `${i + 1}. ${t}`, align: "left" });
    });
    lines.push({ text: doubleDivider, align: "center" });

    // Footer
    lines.push({ text: settings.backSideFooterNote || "Thank You For Your Patronage! Visit Again.", align: "center", bold: true });
    if (settings.website) {
      lines.push({ text: `Web: ${settings.website}`, align: "center" });
    }
    lines.push({ text: divider, align: "center" });

    return lines;
  }

  /**
   * Generate combined PrintableLine array for Double-Sided Bill
   */
  public static generateDoubleSidedLines(data: any, settings: any, width: "58mm" | "80mm" = "80mm"): PrintableLine[] {
    const frontLines = this.generateBillLines(data, settings, width);
    const backLines = this.generateBackSideLines(settings, width);
    return [...frontLines, ...backLines];
  }

  /**
   * Build ESC/POS physical printer bytes sequence from a flat array of PrintableLine objects
   */
  public static linesToEscPosBytes(lines: PrintableLine[]): Uint8Array {
    const esc = 0x1b;
    const gs = 0x1d;

    const commands = {
      init: [esc, 0x40],
      alignLeft: [esc, 0x61, 0x00],
      alignCenter: [esc, 0x61, 0x01],
      alignRight: [esc, 0x61, 0x02],
      boldOn: [esc, 0x45, 0x01],
      boldOff: [esc, 0x45, 0x00],
      doubleSizeOn: [esc, 0x21, 0x30],
      doubleHeightOn: [esc, 0x21, 0x10],
      fontNormal: [esc, 0x21, 0x00],
      lineFeed: [0x0a],
      paperCut: [gs, 0x56, 0x42, 0x00], // Immediate partial paper cut
    };

    const byteArrays: Uint8Array[] = [];
    const pushBytes = (arr: number[]) => { byteArrays.push(new Uint8Array(arr)); };
    const pushText = (text: string) => { byteArrays.push(this.encodeASCII(text)); };

    // Initialize printer once
    pushBytes(commands.init);

    // Write all lines with appropriate styling
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Alignment style
      if (line.align === "center") {
        pushBytes(commands.alignCenter);
      } else if (line.align === "right") {
        pushBytes(commands.alignRight);
      } else {
        pushBytes(commands.alignLeft);
      }

      // Bold style
      if (line.bold) {
        pushBytes(commands.boldOn);
      } else {
        pushBytes(commands.boldOff);
      }

      // Sizing style
      if (line.doubleSize) {
        pushBytes(commands.doubleSizeOn);
      } else if (line.doubleHeight) {
        pushBytes(commands.doubleHeightOn);
      } else {
        pushBytes(commands.fontNormal);
      }

      // Print line content
      pushText(line.text + "\n");
    }

    // Feed exactly 3 lines immediately after the footer text
    pushBytes(commands.lineFeed);
    pushBytes(commands.lineFeed);
    pushBytes(commands.lineFeed);

    // Then trigger the ESC/POS paper cut command
    pushBytes(commands.paperCut);

    // Flatten to a single byte buffer
    const totalLength = byteArrays.reduce((acc, val) => acc + val.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of byteArrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  /**
   * Generates a deterministic barcode using pure CSS/HTML representation
   */
  public static generateBarcodeHTML(text: string, color: string = "#000"): string {
    const normalized = text.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    let html = `<div style="display: flex; align-items: center; justify-content: center; height: 28px; overflow: hidden; margin: 4px auto; background: #ffffff; padding: 2px; width: 85%; border-radius: 2px; border: 1px solid #ddd;">`;
    
    // Start guards
    html += `<div style="width: 2px; height: 100%; background: #000; margin-right: 1px;"></div>`;
    html += `<div style="width: 1px; height: 100%; background: #000; margin-right: 2px;"></div>`;
    
    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      for (let bit = 0; bit < 6; bit++) {
        const isBar = (charCode >> bit) & 1;
        const thickness = isBar ? (bit % 2 === 0 ? 2.5 : 2) : 1;
        const barColor = bit % 2 === 0 ? "#000000" : "transparent";
        html += `<div style="width: ${thickness}px; height: 100%; background: ${barColor};"></div>`;
      }
    }
    
    // End guards
    html += `<div style="width: 1px; height: 100%; background: #000; margin-left: 2px;"></div>`;
    html += `<div style="width: 2px; height: 100%; background: #000; margin-left: 1px;"></div>`;
    html += `</div>`;
    html += `<div style="text-align: center; font-size: 7px; letter-spacing: 2px; font-family: monospace; margin-top: 1px; color: ${color}; font-weight: bold;">*${normalized}*</div>`;
    return html;
  }

  /**
   * Helper to convert numbers to Indian Rupee Words format (e.g., Rupees One Hundred Fifty Only)
   */
  public static numberToWordsINR(amount: number): string {
    if (isNaN(amount) || amount === 0) return "Rupees Zero Only";
    
    const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
      "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const numToWords = (n: number): string => {
      let str = "";
      if (n >= 10000000) {
        str += numToWords(Math.floor(n / 10000000)) + " Crore ";
        n %= 10000000;
      }
      if (n >= 100000) {
        str += numToWords(Math.floor(n / 100000)) + " Lakh ";
        n %= 100000;
      }
      if (n >= 1000) {
        str += numToWords(Math.floor(n / 1000)) + " Thousand ";
        n %= 1000;
      }
      if (n >= 100) {
        str += numToWords(Math.floor(n / 100)) + " Hundred ";
        n %= 100;
      }
      if (n > 0) {
        if (n < 20) {
          str += units[n] + " ";
        } else {
          str += tens[Math.floor(n / 10)] + " " + units[n % 10] + " ";
        }
      }
      return str.trim();
    };

    const integerPart = Math.floor(Math.abs(amount));
    const decimalPart = Math.round((Math.abs(amount) - integerPart) * 100);

    let result = "Rupees " + numToWords(integerPart);
    if (decimalPart > 0) {
      result += " and " + numToWords(decimalPart) + " Paise";
    }
    result += " Only";
    return result.replace(/\s+/g, " ").trim();
  }

  /**
   * Generates the FRONT SIDE (Tax Invoice / Customer Bill) in 80mm thermal format
   */
  public static generateFrontSideHTML(
    data: any,
    settings: any,
    options: any = {},
    copyLabel: string = "",
    watermarkText: string = ""
  ): string {
    const opts = {
      paperWidth: options.paperWidth || settings.paperWidth || "80mm",
      darkPrintMode: options.darkPrintMode ?? false,
      marginControl: options.marginControl ?? 8,
      characterDensity: options.characterDensity || "normal",
      fontScaling: options.fontScaling || 100,
      logoUrl: options.logoUrl || settings.logoUrl || "",
      customFooter: options.customFooter || settings.customFooter || "Taste That Brings You Back. Visit Again Soon.",
      showWatermark: options.showWatermark || "none",
      showQrCode: options.showQrCode ?? settings.showQrCode ?? true,
      showBarcode: options.showBarcode ?? settings.showBarcode ?? true,
      showSignature: options.showSignature ?? settings.showSignature ?? true,
      showLogo: options.showLogo ?? settings.showLogo ?? true,
      showGstin: options.showGstin ?? settings.showGstin ?? true,
      showFssai: options.showFssai ?? settings.showFssai ?? true,
      showPax: options.showPax ?? settings.showPax ?? true,
      showCashier: options.showCashier ?? settings.showCashier ?? true,
      showAmountInWords: options.showAmountInWords ?? settings.showAmountInWords ?? true,
      invoiceTitle: options.invoiceTitle || settings.invoiceTitle || "TAX INVOICE",
      cashierName: options.cashierName || data.cashierName || settings.cashierName || "Cashier",
      pax: data.pax || settings.defaultPax || 2,
    };

    const is80 = opts.paperWidth === "80mm";
    const paperWidthPixels = is80 ? "290px" : "210px";
    
    const isVeg = (name: string): boolean => {
      const lower = name.toLowerCase();
      if (lower.includes("chicken") || lower.includes("egg") || lower.includes("mutton") || lower.includes("fish") || lower.includes("non-veg") || lower.includes("nonveg") || lower.includes("meat") || lower.includes("kabab")) {
        return false;
      }
      return true;
    };

    const items = data.items || [];
    const fontSizeBase = is80 ? 12.5 : 10.5;
    const finalFontSize = fontSizeBase * (opts.fontScaling / 100);
    const lineSpacing = opts.characterDensity === "compact" ? "1.1" : opts.characterDensity === "spacious" ? "1.35" : "1.22";
    const paddingVal = `${opts.marginControl}px`;

    const isDark = opts.darkPrintMode;
    const bg = isDark ? "#121212" : "#ffffff";
    const textCol = isDark ? "#f3f4f6" : "#000000";
    const borderCol = isDark ? "#2d2d2d" : "#000000";
    
    let logoHtml = "";
    if (opts.logoUrl && opts.logoUrl.trim().length > 0) {
      logoHtml = `<div style="text-align: center; margin-bottom: 6px;"><img src="${opts.logoUrl}" alt="${settings.name || 'Logo'}" style="max-height: 48px; max-width: 140px; object-fit: contain;" /></div>`;
    } else {
      logoHtml = `
        <div style="text-align: center; margin-bottom: 4px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${textCol}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block;">
            <path d="M12 2l3 6 6 1-4.5 4.5L17.5 20 12 17l-5.5 3 1-6.5L3 9l6-1z" />
          </svg>
        </div>
      `;
    }

    const invoiceNo = data.id || "SR-1024";
    const billNo = data.id || "SR-1024";
    const orderNumOnly = invoiceNo.replace("SR-", "#");
    
    const isTakeaway = (data.orderType || "").toLowerCase() === "takeaway";
    const subtotal = data.subtotal || 0;
    const discountAmount = data.discountAmount || 0;
    const coupon = data.appliedCoupon || "";
    const packagingCharge = isTakeaway ? 0 : (data.packagingCharge || 0);
    const gst = data.gst || 0;
    const deliveryCharge = data.orderType === "delivery" ? (settings.deliveryCharges || 0) : 0;
    const grandTotal = isTakeaway
      ? Math.max(0, Math.round(subtotal - discountAmount + gst))
      : (data.grandTotal || (subtotal - discountAmount + packagingCharge + gst + deliveryCharge));
    const roundOff = (Math.round(grandTotal) - grandTotal).toFixed(2);
    const finalGrandTotal = Math.round(grandTotal);
    const totalQty = items.reduce((acc: number, it: any) => acc + (Number(it.quantity) || 1), 0);
    const totalItemsCount = items.length;

    const createdAtDate = new Date(data.createdAt || Date.now());
    const gstinVal = settings.gstEnabled ? (settings.gstin || "") : "";
    const fssaiVal = settings.fssaiNumber || "11520056000020";
    const contactVal = settings.contactNumber || "+91 7020796007";
    const addressVal = settings.address || "B-10, Central MIDC Road, Hingna Industrial Area, Nagpur, Maharashtra, India";
    const legalNameVal = settings.legalName || "L N FOODS";
    const estdVal = settings.estd || "ESTD. 1975";
    const gstPct = Number(settings.gstPercentage) || 5;
    const halfGstPct = (gstPct / 2).toFixed(1).replace(".0", "");

    const paymentMode = (data.paymentMethod || data.paymentMode || "CASH").toUpperCase();
    const paymentStatus = (data.paymentStatus || "PAID").toUpperCase();

    return `
      <div style="position: relative; width: ${paperWidthPixels}; background: ${bg}; color: ${textCol}; padding: ${paddingVal}; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; font-size: ${finalFontSize}px; font-weight: bold; line-height: ${lineSpacing}; text-align: left; overflow: hidden; margin: 0 auto; border: 1px solid ${isDark ? "#292524" : "#000000"};">
        
        ${watermarkText ? `
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-family: sans-serif; font-size: 24px; font-weight: 900; color: ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}; text-transform: uppercase; white-space: nowrap; pointer-events: none; z-index: 10; letter-spacing: 2px;">
            ${watermarkText}
          </div>
        ` : ""}

        <!-- Restaurant Header -->
        ${opts.showLogo ? logoHtml : ""}
        <div style="text-align: center;">
          <div style="font-size: ${finalFontSize * 0.85}px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">
            ${estdVal}
          </div>
          <div style="font-size: ${finalFontSize * 1.5}px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px; margin-top: 1px;">
            ${settings.name || "WEBRAJYA POS"}
          </div>
          ${legalNameVal ? `
            <div style="font-size: ${finalFontSize * 0.95}px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 1px;">
              ${legalNameVal}
            </div>
          ` : ""}
          <div style="font-size: ${finalFontSize * 0.8}px; font-weight: 600; margin-top: 2px; line-height: 1.25;">
            ${addressVal}
          </div>
          <div style="font-size: ${finalFontSize * 0.82}px; font-weight: 700; margin-top: 2px;">
            Phone: ${contactVal}
          </div>
          
          ${opts.showFssai && fssaiVal ? `
            <div style="font-size: ${finalFontSize * 0.8}px; font-weight: 700; margin-top: 1px;">
              FSSAI No: ${fssaiVal}
            </div>
          ` : ""}

          ${opts.showGstin && gstinVal ? `
            <div style="font-size: ${finalFontSize * 0.78}px; font-weight: 700; margin-top: 1px;">
              GSTIN: ${gstinVal}
            </div>
          ` : ""}

          <!-- Document Invoice Title -->
          <div style="margin-top: 4px; display: inline-block; border: 1.5px solid ${textCol}; padding: 2px 12px; font-size: ${finalFontSize * 0.92}px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; background: ${isDark ? "#1e1e1e" : "#f4f4f5"};">
            *** ${opts.invoiceTitle} ***
          </div>
        </div>

        <div style="border-bottom: 1.5px dashed ${textCol}; margin: 6px 0;"></div>

        <!-- Order Information Section -->
        <div style="font-size: ${finalFontSize * 0.9}px; font-weight: 700; line-height: 1.35;">
          <div style="display: flex; justify-content: space-between;">
            <span><b>Memo#:</b> ${billNo}${copyLabel}</span>
            <span><b>${createdAtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b></span>
            <span><b>${createdAtDate.toLocaleDateString()}</b></span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 2px;">
            ${opts.showCashier ? `<span><b>User:</b> ${opts.cashierName}</span>` : `<span><b>Order:</b> ${orderNumOnly}</span>`}
            ${opts.showPax ? `<span><b>Pax#:</b> ${opts.pax}</span>` : `<span></span>`}
            <span><b>${data.tableNumber ? `Table #${data.tableNumber}` : (data.orderType || "DINE-IN").toUpperCase()}</b></span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 2px;">
            <span><b>Order#:</b> ${orderNumOnly}</span>
            ${data.customerName ? `<span><b>Cust:</b> ${data.customerName}</span>` : `<span></span>`}
          </div>
        </div>

        <div style="border-bottom: 1.5px dashed ${textCol}; margin: 6px 0;"></div>

        <!-- Professional Items Table (Sr | Product | Qty | Rate | Amount) -->
        <table style="width: 100%; border-collapse: collapse; text-align: left; table-layout: fixed;">
          <thead>
            <tr style="border-bottom: 1.5px solid ${textCol}; font-weight: 900; font-size: ${finalFontSize * 0.9}px; text-transform: uppercase;">
              <th style="padding: 3px 0; width: 9%; text-align: left;">Sr</th>
              <th style="padding: 3px 0; width: 45%;">Product</th>
              <th style="padding: 3px 0; width: 14%; text-align: right;">Qty</th>
              <th style="padding: 3px 0; width: 16%; text-align: right;">Rate</th>
              <th style="padding: 3px 0; width: 16%; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item: any, idx: number) => {
              const itemVeg = isVeg(item.name);
              const icon = itemVeg 
                ? `<span style="border: 1px solid #22c55e; display: inline-flex; justify-content: center; align-items: center; width: 7px; height: 7px; font-size: 5px; color: #22c55e; font-weight: bold; margin-right: 2px; vertical-align: middle; line-height: 1;">□</span>`
                : `<span style="border: 1px solid #ef4444; display: inline-flex; justify-content: center; align-items: center; width: 7px; height: 7px; font-size: 5px; color: #ef4444; font-weight: bold; margin-right: 2px; vertical-align: middle; line-height: 1;">▲</span>`;

              const isManual = item.isManual || item.menuItemId === 'manual' || item.name.toUpperCase() === item.name || item.name.toLowerCase().includes("manual");
              const originalPrice = Number(item.price) || 0;
              const qty = Number(item.quantity) || 1;
              const itemTotal = originalPrice * qty;
              const isFree = originalPrice === 0;
              const formattedQty = (qty % 1 === 0) ? qty.toFixed(3) : qty.toFixed(3);

              return `
                <tr style="border-bottom: 1px dotted ${isDark ? "#444" : "#000000"}; font-size: ${finalFontSize * 0.92}px;">
                  <td style="padding: 4px 0; vertical-align: top; font-weight: 700; font-size: ${finalFontSize * 0.85}px;">${idx + 1}</td>
                  <td style="padding: 4px 0; vertical-align: top; font-weight: 800; word-break: break-word;">
                    ${icon}${item.name}
                    ${isManual ? `<span style="border: 1px solid ${textCol}; padding: 0 2px; font-size: 7px; border-radius: 1px; font-weight: bold; margin-left: 2px; display: inline-block;">(M)</span>` : ""}
                    ${item.customization ? `<div style="font-size: ${finalFontSize * 0.8}px; color: ${isDark ? "#a8a29e" : "#555555"}; font-style: italic; font-weight: 600; padding-left: 8px;">+ ${item.customization}</div>` : ""}
                  </td>
                  <td style="padding: 4px 0; text-align: right; vertical-align: top; font-family: monospace; font-weight: 900; font-size: ${finalFontSize * 0.95}px;">${formattedQty}</td>
                  <td style="padding: 4px 0; text-align: right; vertical-align: top; font-family: monospace; font-weight: 700; font-size: ${finalFontSize * 0.9}px;">${isFree ? "0.00" : originalPrice.toFixed(2)}</td>
                  <td style="padding: 4px 0; text-align: right; vertical-align: top; font-family: monospace; font-weight: 900; font-size: ${finalFontSize * 0.95}px;">
                    ${isFree ? "FREE" : itemTotal.toFixed(2)}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>

        <div style="border-bottom: 1.5px dashed ${textCol}; margin: 5px 0;"></div>

        <!-- Quantity & Subtotal Summary -->
        <div style="font-family: monospace; font-size: ${finalFontSize * 0.95}px; font-weight: 700;">
          <div style="display: flex; justify-content: space-between; padding: 2px 0;">
            <span>Sub Total:</span>
            <span>₹${subtotal.toFixed(2)}</span>
          </div>

          <div style="display: flex; justify-content: space-between; padding: 1px 0; font-size: ${finalFontSize * 0.85}px; color: ${isDark ? "#cbd5e1" : "#4b5563"};">
            <span>Total Qty: <b>${totalQty.toFixed(3)}</b></span>
            <span>Total Items: <b>${totalItemsCount}</b></span>
          </div>
          
          ${discountAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; color: ${isDark ? "#34d399" : "#059669"}; font-weight: 800; padding: 2px 0;">
              <span>Discount ${coupon ? `(${coupon})` : ""}:</span>
              <span>-₹${discountAmount.toFixed(2)}</span>
            </div>
          ` : ""}

          ${packagingCharge > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
              <span>Packing Charge:</span>
              <span>₹${packagingCharge.toFixed(2)}</span>
            </div>
          ` : ""}

          ${deliveryCharge > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
              <span>Delivery Charge:</span>
              <span>₹${deliveryCharge.toFixed(2)}</span>
            </div>
          ` : ""}

          ${gst > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 1px 0;">
              <span>SGST (${halfGstPct}%):</span>
              <span>₹${(gst / 2).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 1px 0;">
              <span>CGST (${halfGstPct}%):</span>
              <span>₹${(gst / 2).toFixed(2)}</span>
            </div>
          ` : ""}

          ${Number(roundOff) !== 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 1px 0;">
              <span>Round Off:</span>
              <span>₹${roundOff}</span>
            </div>
          ` : ""}

          <!-- Grand Total Box -->
          <div style="border-top: 2px solid ${textCol}; border-bottom: 2px solid ${textCol}; margin: 5px 0; padding: 5px 0;">
            <div style="display: flex; justify-content: space-between; font-size: ${finalFontSize * 1.35}px; font-weight: 950;">
              <span>GRAND TOTAL:</span>
              <span>₹${finalGrandTotal.toFixed(2)}</span>
            </div>
          </div>

          ${opts.showAmountInWords ? `
            <div style="padding: 2px 0; font-size: ${finalFontSize * 0.78}px; color: ${isDark ? "#cbd5e1" : "#1f2937"}; font-weight: bold; font-style: italic; line-height: 1.25;">
              (Rupees ${PhysicalThermalPrinter.numberToWordsINR(finalGrandTotal)} Only)
            </div>
          ` : ""}

          <!-- Payment Info -->
          <div style="font-size: ${finalFontSize * 0.85}px; padding: 3px 0; border-top: 1px dotted ${isDark ? "#444" : "#000000"}; margin-top: 3px;">
            <div style="display: flex; justify-content: space-between;">
              <span>Pay Mode: <b>${paymentMode}</b></span>
              <span>Status: <b style="color: ${paymentStatus === 'PAID' ? '#16a34a' : paymentStatus === 'PARTIAL' ? '#d97706' : '#ea580c'};">${paymentStatus}</b></span>
            </div>
            ${data.paidAmount !== undefined && Number(data.paidAmount) > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-top: 2px; font-size: ${finalFontSize * 0.82}px;">
                <span>Total Paid: ₹${Number(data.paidAmount).toFixed(2)}</span>
                <span>Balance Due: ₹${Math.max(0, Number(data.remainingAmount !== undefined ? data.remainingAmount : (finalGrandTotal - Number(data.paidAmount)))).toFixed(2)}</span>
              </div>
            ` : ""}
            ${(data.payments && Array.isArray(data.payments) && data.payments.length > 0) ? `
              <div style="margin-top: 3px; padding-top: 2px; border-top: 0.5px dashed ${isDark ? '#444' : '#ccc'}; font-size: ${finalFontSize * 0.78}px;">
                ${data.payments.filter((p: any) => p.status === 'Paid').map((p: any) => `
                  <div style="display: flex; justify-content: space-between;">
                    <span>• ${p.paymentMethod}${p.transactionReference ? ` (${p.transactionReference})` : ''}</span>
                    <span>₹${Number(p.amount).toFixed(2)}</span>
                  </div>
                `).join('')}
              </div>
            ` : ""}
          </div>
        </div>
          
          ${discountAmount > 0 ? `
            <div style="display: flex; justify-content: space-between; color: ${isDark ? "#34d399" : "#059669"}; font-weight: 800; padding: 2px 0;">
              <span>Discount ${coupon ? `(${coupon})` : ""}:</span>
              <span>-₹${discountAmount.toFixed(2)}</span>
            </div>
          ` : ""}

          ${packagingCharge > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
              <span>Packing Charge:</span>
              <span>₹${packagingCharge.toFixed(2)}</span>
            </div>
          ` : ""}

          ${deliveryCharge > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
              <span>Delivery Charge:</span>
              <span>₹${deliveryCharge.toFixed(2)}</span>
            </div>
          ` : ""}

          ${gst > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 1px 0;">
              <span>SGST (${halfGstPct}%):</span>
              <span>₹${(gst / 2).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 1px 0;">
              <span>CGST (${halfGstPct}%):</span>
              <span>₹${(gst / 2).toFixed(2)}</span>
            </div>
          ` : ""}

          ${Number(roundOff) !== 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 1px 0;">
              <span>Round Off:</span>
              <span>₹${roundOff}</span>
            </div>
          ` : ""}

          <!-- Grand Total Box -->
          <div style="border-top: 2px solid ${textCol}; border-bottom: 2px solid ${textCol}; margin: 5px 0; padding: 5px 0;">
            <div style="display: flex; justify-content: space-between; font-size: ${finalFontSize * 1.4}px; font-weight: 950;">
              <span>GRAND TOTAL:</span>
              <span>₹${finalGrandTotal.toLocaleString()}.00</span>
            </div>
          </div>

          ${opts.showAmountInWords ? `
            <div style="padding: 2px 0; font-size: ${finalFontSize * 0.78}px; color: ${isDark ? "#cbd5e1" : "#1f2937"}; font-style: italic; line-height: 1.2;">
              <b>In Words:</b> ${PhysicalThermalPrinter.numberToWordsINR(finalGrandTotal)}
            </div>
          ` : ""}

          <!-- Payment Info -->
          <div style="display: flex; justify-content: space-between; font-size: ${finalFontSize * 0.85}px; padding: 3px 0; border-top: 1px dotted ${isDark ? "#444" : "#000000"}; margin-top: 3px;">
            <span>Payment Mode: <b>${paymentMode}</b></span>
            <span>Status: <b style="color: ${paymentStatus === 'PAID' ? '#16a34a' : '#ea580c'};">${paymentStatus}</b></span>
          </div>
        </div>

        <!-- Dynamic UPI QR Code & Barcode -->
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 6px;">
          ${opts.showBarcode ? `
            <div style="flex: 1;">
              ${PhysicalThermalPrinter.generateBarcodeHTML(billNo, textCol)}
            </div>
          ` : ""}
        </div>

        ${opts.showSignature ? `
          <div style="display: flex; justify-content: space-between; margin-top: 10px; padding-top: 8px; font-size: ${finalFontSize * 0.78}px; font-weight: bold;">
            <div>Customer Sign: ________</div>
            <div style="text-align: right;">Auth Sign: ________</div>
          </div>
        ` : ""}

        <!-- Front Side Footer -->
        <div style="text-align: center; margin-top: 8px; border-top: 1.5px dashed ${textCol}; padding-top: 6px;">
          <div style="font-size: ${finalFontSize * 1.05}px; font-weight: 900; letter-spacing: 0.5px;">
            Thank You! Visit Again.
          </div>
          <div style="font-size: ${finalFontSize * 0.78}px; color: ${isDark ? "#a8a29e" : "#555555"}; font-weight: 600; margin-top: 2px;">
            ${opts.customFooter}
          </div>
          ${settings.website ? `
            <div style="font-size: ${finalFontSize * 0.75}px; color: ${isDark ? "#9ca3af" : "#666666"}; font-weight: 700; margin-top: 1px;">
              ${settings.website}
            </div>
          ` : ""}
        </div>

      </div>
    `;
  }

  /**
   * Generates the BACK SIDE (Outlet Locations & Terms and Conditions) in 80mm thermal format
   */
  public static generateBackSideHTML(
    settings: any,
    options: any = {}
  ): string {
    const opts = {
      paperWidth: options.paperWidth || settings.paperWidth || "80mm",
      darkPrintMode: options.darkPrintMode ?? false,
      marginControl: options.marginControl ?? 8,
      characterDensity: options.characterDensity || "normal",
      fontScaling: options.fontScaling || 100,
      backSideTitle: options.backSideTitle || settings.backSideTitle || "OUR OUTLETS",
      backSideFooterNote: options.backSideFooterNote || settings.backSideFooterNote || "Thank You For Visiting",
    };

    const is80 = opts.paperWidth === "80mm";
    const paperWidthPixels = is80 ? "290px" : "210px";
    const isDark = opts.darkPrintMode;
    const bg = isDark ? "#121212" : "#ffffff";
    const textCol = isDark ? "#f3f4f6" : "#000000";
    const fontSizeBase = is80 ? 12.0 : 10.0;
    const finalFontSize = fontSizeBase * (opts.fontScaling / 100);
    const paddingVal = `${opts.marginControl}px`;

    const outlets = (settings.outlets && settings.outlets.length > 0) ? settings.outlets : defaultOutlets;
    const terms = (settings.termsAndConditions && settings.termsAndConditions.length > 0) ? settings.termsAndConditions : defaultTermsAndConditions;
    const estdVal = settings.estd || "ESTD. 1975";
    const cityVal = settings.city || "NAGPUR";

    return `
      <div style="position: relative; width: ${paperWidthPixels}; background: ${bg}; color: ${textCol}; padding: ${paddingVal}; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; font-size: ${finalFontSize}px; font-weight: bold; line-height: 1.25; text-align: left; overflow: hidden; margin: 0 auto; border: 1px solid ${isDark ? "#292524" : "#000000"};">
        
        <!-- Back Side Header -->
        <div style="text-align: center;">
          <div style="font-size: ${finalFontSize * 0.85}px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">
            ${estdVal}
          </div>
          <div style="font-size: ${finalFontSize * 1.5}px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px; margin-top: 1px;">
            ${settings.name || "WEBRAJYA POS"}
          </div>
          <div style="font-size: ${finalFontSize * 0.9}px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-top: 1px;">
            ${cityVal}
          </div>
          <div style="font-size: ${finalFontSize * 0.88}px; font-weight: 900; border-top: 1.5px solid ${textCol}; border-bottom: 1.5px solid ${textCol}; padding: 3px 0; margin: 5px 0; letter-spacing: 0.8px; text-transform: uppercase; background: ${isDark ? "#1e1e1e" : "#f4f4f5"};">
            *** ${opts.backSideTitle} ***
          </div>
        </div>

        <!-- Dynamic Outlets List -->
        <div style="margin-top: 5px;">
          <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 6px;">
            ${outlets.map((outlet: any, idx: number) => `
              <div style="border-bottom: 1px dotted ${isDark ? "#444" : "#000000"}; padding-bottom: 3px;">
                <div style="font-size: ${finalFontSize * 0.95}px; font-weight: 900;">${idx + 1}. ${outlet.name.toUpperCase()}</div>
                <div style="font-size: ${finalFontSize * 0.82}px; font-weight: 600; color: ${isDark ? "#d1d5db" : "#333333"}; margin-top: 1px; line-height: 1.25;">${outlet.address}</div>
                <div style="font-size: ${finalFontSize * 0.82}px; font-weight: 800; color: ${isDark ? "#e5e7eb" : "#000000"}; margin-top: 1px;">Phone: ${outlet.contactNumber}</div>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- Separator -->
        <div style="border-bottom: 1.5px dashed ${textCol}; margin: 7px 0;"></div>

        <!-- Customizable Terms & Conditions -->
        <div>
          <div style="font-size: ${finalFontSize * 0.88}px; font-weight: 900; text-align: center; text-transform: uppercase; background: ${isDark ? "#262626" : "#f4f4f5"}; padding: 2px 4px; border: 1px solid ${textCol}; letter-spacing: 0.5px;">
            TERMS & CONDITIONS
          </div>

          <div style="margin-top: 5px; font-size: ${finalFontSize * 0.8}px; line-height: 1.3; font-weight: 600;">
            ${terms.map((term: string, idx: number) => `
              <div style="margin-bottom: 3px; display: flex; gap: 4px;">
                <span style="font-weight: 900; flex-shrink: 0;">${idx + 1}.</span>
                <span>${term}</span>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- Contact Information Section -->
        <div style="border-top: 1.5px dashed ${textCol}; margin-top: 7px; padding-top: 4px; font-size: ${finalFontSize * 0.8}px; font-weight: 700; text-align: center;">
          <div>Customer Care: ${settings.customerCare || settings.contactNumber || "+91 7020796007"}</div>
          <div style="margin-top: 1px;">Website: ${settings.website || ""}</div>
          <div style="margin-top: 1px;">Email: ${settings.email || ""}</div>
        </div>

        <!-- Back Side Footer -->
        <div style="border-top: 1.5px solid ${textCol}; margin-top: 6px; padding-top: 5px; text-align: center;">
          <div style="font-size: ${finalFontSize * 0.92}px; font-weight: 900; letter-spacing: 0.5px;">
            ${opts.backSideFooterNote}
          </div>
        </div>

      </div>
    `;
  }

  /**
   * Generates a premium restaurant POS thermal receipt in HTML/CSS
   */
  public static generatePremiumReceiptHTML(
    type: "bill" | "kot" | "customer-copy" | "kitchen-copy" | "duplicate-copy" | "front-side" | "back-side" | "double-sided",
    data: any,
    settings: any,
    options: any = {}
  ): string {
    const opts = {
      paperWidth: options.paperWidth || settings?.paperWidth || "80mm",
      autoScale: options.autoScale ?? true,
      autoWidthDetection: options.autoWidthDetection ?? true,
      autoCut: options.autoCut ?? true,
      darkPrintMode: options.darkPrintMode ?? false,
      marginControl: options.marginControl ?? 8,
      characterDensity: options.characterDensity || "normal",
      fontScaling: options.fontScaling || 100,
      multipleCopies: options.multipleCopies || 1,
      logoUrl: options.logoUrl || settings?.logoUrl || "",
      customFooter: options.customFooter || settings?.customFooter || "Taste That Brings You Back.",
      showWatermark: options.showWatermark || "none",
      showQrCode: options.showQrCode ?? settings?.showQrCode ?? true,
      showBarcode: options.showBarcode ?? settings?.showBarcode ?? true,
      printCount: options.printCount ?? 1,
      showSignature: options.showSignature ?? settings?.showSignature ?? true,
      enableDoubleSided: options.enableDoubleSided ?? settings?.enableDoubleSided ?? false,
    };

    const is80 = opts.paperWidth === "80mm";
    const paperWidthPixels = is80 ? "290px" : "210px";
    
    const isVeg = (name: string): boolean => {
      const lower = name.toLowerCase();
      if (lower.includes("chicken") || lower.includes("egg") || lower.includes("mutton") || lower.includes("fish") || lower.includes("non-veg") || lower.includes("nonveg") || lower.includes("meat") || lower.includes("kabab")) {
        return false;
      }
      return true;
    };

    const items = data.items || [];
    
    let watermarkText = "";
    if (opts.showWatermark !== "none" && opts.showWatermark) {
      watermarkText = opts.showWatermark.toUpperCase() + " COPY";
    } else if (type === "customer-copy") {
      watermarkText = "CUSTOMER COPY";
    } else if (type === "kitchen-copy") {
      watermarkText = "KITCHEN COPY";
    } else if (type === "duplicate-copy") {
      watermarkText = "DUPLICATE COPY";
    }

    const fontSizeBase = is80 ? 13.0 : 11.0;
    const finalFontSize = fontSizeBase * (opts.fontScaling / 100);
    const lineSpacing = opts.characterDensity === "compact" ? "1.1" : opts.characterDensity === "spacious" ? "1.4" : "1.25";
    const paddingVal = `${opts.marginControl}px`;

    const isDark = opts.darkPrintMode;
    const bg = isDark ? "#121212" : "#ffffff";
    const textCol = isDark ? "#f3f4f6" : "#000000";

    // Standalone Back Side Check
    if (type === "back-side") {
      return this.generateBackSideHTML(settings, opts);
    }

    let fullOutputHtml = "";

    for (let copy = 0; copy < opts.multipleCopies; copy++) {
      const isCopyLabelNeeded = copy > 0 || opts.multipleCopies > 1;
      const currentCopyLabel = isCopyLabelNeeded ? ` (COPY ${copy + 1} OF ${opts.multipleCopies})` : "";
      
      let bodyHtml = "";

      if (type === "kot" || type === "kitchen-copy") {
        const kotNo = data.id || "KOT-NEW";
        const orderNo = data.orderId || "SR-NEW";
        const orderNumOnly = orderNo.replace("SR-", "#");

        bodyHtml = `
          <div style="position: relative; width: ${paperWidthPixels}; background: ${bg}; color: ${textCol}; padding: ${paddingVal}; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; font-size: ${finalFontSize}px; font-weight: bold; line-height: ${lineSpacing}; text-align: left; overflow: hidden; margin: 0 auto; border: 1px solid ${isDark ? "#292524" : "#000000"};">
            
            ${watermarkText ? `
              <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-family: sans-serif; font-size: 24px; font-weight: 900; color: ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)"}; text-transform: uppercase; white-space: nowrap; pointer-events: none; z-index: 10; letter-spacing: 2px;">
                ${watermarkText}
              </div>
            ` : ""}

            <div style="text-align: center; text-transform: uppercase;">
              <div style="font-size: ${finalFontSize * 1.15}px; font-weight: bold; letter-spacing: 1px;">${settings.name || "WEBRAJYA POS"}</div>
              <div style="font-size: ${finalFontSize * 1.4}px; font-weight: 900; margin: 4px 0; border: 1.5px solid ${textCol}; padding: 3px; display: inline-block; letter-spacing: 1px;">${(data as any).isAddOn ? "ADD-ON KOT" : "KITCHEN ORDER TICKET"}</div>
              <div style="font-size: ${finalFontSize * 1.1}px; font-weight: bold; margin-top: 2px;">KOT: ${kotNo}${currentCopyLabel}</div>
            </div>

            <div style="border-bottom: 1px dashed ${textCol}; margin: 6px 0;"></div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: ${finalFontSize * 0.95}px;">
              <div><b>Table:</b> <span style="font-size: ${finalFontSize * 1.3}px; font-weight: 900; background: ${isDark ? "#292524" : "#e5e5e5"}; padding: 1px 4px; border-radius: 2px;">${data.tableNumber || "Takeaway"}</span></div>
              <div style="text-align: right;"><b>Order:</b> ${orderNo}</div>
              <div><b>Type:</b> ${(data.orderType || "dine-in").toUpperCase()}</div>
              <div style="text-align: right;"><b>Captain:</b> Admin</div>
              <div><b>Date:</b> ${new Date(data.createdAt || Date.now()).toLocaleDateString()}</div>
              <div style="text-align: right;"><b>Time:</b> ${new Date(data.createdAt || Date.now()).toLocaleTimeString()}</div>
            </div>

            <div style="border-bottom: 1px dashed ${textCol}; margin: 6px 0;"></div>

            <div style="text-align: center; margin: 8px 0; padding: 4px; background: ${isDark ? "#1c1917" : "#fafaf9"}; border: 1px dashed ${textCol};">
              <span style="font-size: ${finalFontSize * 0.85}px; font-weight: bold; display: block; letter-spacing: 1px; color: ${isDark ? "#a8a29e" : "#000000"};">QUEUE TOKEN</span>
              <span style="font-size: ${finalFontSize * 1.8}px; font-weight: 950; letter-spacing: 2px;">${orderNumOnly}</span>
            </div>

            <div style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-bottom: 6px;">
              ${isVeg(items[0]?.name || "") ? `<span style="border: 1px solid #22c55e; color: #22c55e; padding: 1px 4px; font-size: ${finalFontSize * 0.8}px; font-weight: bold; border-radius: 2px;">PURE VEG</span>` : `<span style="border: 1px solid #ef4444; color: #ef4444; padding: 1px 4px; font-size: ${finalFontSize * 0.8}px; font-weight: bold; border-radius: 2px;">NON-VEG</span>`}
              ${data.specialInstructions ? `<span style="border: 1px solid #ea580c; color: #ea580c; padding: 1px 4px; font-size: ${finalFontSize * 0.8}px; font-weight: bold; border-radius: 2px;">RUSH ORDER</span>` : ""}
              ${items.some((it: any) => it.isChefSpecial) ? `<span style="border: 1px solid #c026d3; color: #c026d3; padding: 1px 4px; font-size: ${finalFontSize * 0.8}px; font-weight: bold; border-radius: 2px;">CHEF SPECIAL</span>` : ""}
            </div>

            <div style="border-bottom: 1px dashed ${textCol}; margin: 6px 0;"></div>

            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid ${textCol}; font-weight: bold; font-size: ${finalFontSize * 0.95}px;">
                  <th style="padding: 3px 0; width: 15%; text-align: center;">QTY</th>
                  <th style="padding: 3px 0; width: 85%;">KITCHEN PREP ITEM</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item: any) => {
                  const itemVeg = isVeg(item.name);
                  const icon = itemVeg 
                    ? `<span style="border: 1.5px solid #22c55e; display: inline-flex; justify-content: center; align-items: center; width: 10px; height: 10px; font-size: 7px; color: #22c55e; font-weight: bold; margin-right: 4px; vertical-align: middle; line-height: 1;">□</span>`
                    : `<span style="border: 1.5px solid #ef4444; display: inline-flex; justify-content: center; align-items: center; width: 10px; height: 10px; font-size: 7px; color: #ef4444; font-weight: bold; margin-right: 4px; vertical-align: middle; line-height: 1;">▲</span>`;

                  const isManual = item.isManual || item.menuItemId === 'manual' || item.name.toUpperCase() === item.name || item.name.toLowerCase().includes("manual");

                  return `
                    <tr style="border-bottom: 1px dotted ${isDark ? "#444" : "#000000"}; font-size: ${finalFontSize}px;">
                      <td style="padding: 6px 0; text-align: center; font-size: ${finalFontSize * 1.3}px; font-weight: 900; vertical-align: top;">${item.quantity}</td>
                      <td style="padding: 6px 0; vertical-align: top; font-weight: bold;">
                        ${icon}${item.name}
                        ${isManual ? `<span style="border: 1px solid ${textCol}; padding: 0 2px; font-size: 7px; border-radius: 1px; font-weight: bold; margin-left: 3px; display: inline-block;">(Manual)</span>` : ""}
                        ${item.customization ? `<div style="font-size: ${finalFontSize * 0.85}px; font-weight: bold; font-style: italic; color: ${isDark ? "#a8a29e" : "#000000"}; margin-top: 2px; padding-left: 14px;">+ ${item.customization}</div>` : ""}
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>

            <div style="border-bottom: 1px dashed ${textCol}; margin: 6px 0;"></div>

            ${data.specialInstructions && data.specialInstructions !== "None" && data.specialInstructions.trim() !== "" ? `
              <div style="border: 1px solid ${textCol}; padding: 5px; margin: 6px 0; background: ${isDark ? "#1c1917" : "#fafaf9"}; border-radius: 3px;">
                <b style="font-size: ${finalFontSize * 0.85}px; display: block; margin-bottom: 2px;">KITCHEN INSTRUCTIONS:</b>
                <span style="font-size: ${finalFontSize * 0.95}px; font-style: italic; color: #e11d48; font-weight: bold;">"${data.specialInstructions}"</span>
              </div>
            ` : ""}

            <div style="text-align: center; font-size: ${finalFontSize * 0.85}px; margin-top: 8px; color: ${isDark ? "#a8a29e" : "#000000"}; font-weight: bold;">
              <div>KOT Printed At: ${new Date().toLocaleTimeString()}</div>
              <div>KOT Print Count: ${opts.printCount}</div>
              <div style="font-weight: bold; margin-top: 4px; letter-spacing: 1px;">*** KITCHEN COPY ONLY ***</div>
            </div>

          </div>
        `;
      } else {
        // Front side bill generation
        const frontHtml = this.generateFrontSideHTML(data, settings, opts, currentCopyLabel, watermarkText);

        // Check if double-sided receipt is requested
        const isDoubleSided = type === "double-sided" || (type === "bill" && opts.enableDoubleSided);

        if (isDoubleSided) {
          const backHtml = this.generateBackSideHTML(settings, opts);
          bodyHtml = `
            ${frontHtml}
            <div class="page-break" style="page-break-after: always; break-after: page; height: 1px; margin: 14px 0; border-top: 1.5px dashed #888888; text-align: center; font-size: 8px; font-family: monospace; color: #666; padding-top: 4px;">
              --- [PAGE BREAK: BACK SIDE OF THERMAL RECEIPT] ---
            </div>
            ${backHtml}
          `;
        } else {
          bodyHtml = frontHtml;
        }
      }

      fullOutputHtml += bodyHtml;

      if (copy < opts.multipleCopies - 1) {
        fullOutputHtml += `<div class="page-break" style="page-break-after: always; break-after: page; height: 1px;"></div>`;
      }
    }

    return fullOutputHtml;
  }

  /**
   * Triggers the beautiful, stylized POS thermal receipt print using system dialog.
   */
  public static printPremiumHTML(
    type: "bill" | "kot" | "customer-copy" | "kitchen-copy" | "duplicate-copy" | "front-side" | "back-side" | "double-sided",
    data: any,
    settings: any,
    options: any = {}
  ): void {
    const is80 = (options.paperWidth || settings?.paperWidth || "80mm") === "80mm";
    
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0px";
    iframe.style.height = "0px";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    // Force light print mode (black on white) for physical receipt paper outputs!
    const receiptHtml = this.generatePremiumReceiptHTML(type, data, settings, {
      ...options,
      darkPrintMode: false
    });

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page {
              size: ${is80 ? "80mm" : "58mm"} auto;
              margin: 0 !important;
            }
            body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              text-align: center;
              box-sizing: border-box;
              font-weight: bold !important;
            }
            .page-break {
              page-break-after: always !important;
              break-after: page !important;
              height: 0 !important;
              margin: 0 !important;
              border: none !important;
              display: block !important;
            }
            @media print {
              body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                font-weight: bold !important;
              }
              .page-break {
                page-break-after: always !important;
                break-after: page !important;
                height: 0 !important;
                margin: 0 !important;
                border: none !important;
                display: block !important;
                visibility: hidden !important;
              }
              div {
                border-color: #000000 !important;
              }
            }
          </style>
        </head>
        <body>
          ${receiptHtml}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  }

  /**
   * Fallback print lines function kept for full backward-compatibility with custom text drivers
   */
  public static printLinesSystemFallback(lines: PrintableLine[], width: "58mm" | "80mm" = "80mm"): void {
    const is80 = width === "80mm";
    const paperWidthPixels = is80 ? "280px" : "180px";

    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0px";
    iframe.style.height = "0px";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    const linesHtml = lines.map((line) => {
      const alignment = line.align || "center";
      const fontWeight = line.bold ? "bold" : "normal";
      
      let fontSize = "13px";
      if (line.doubleSize) {
        fontSize = "18px";
      } else if (line.doubleHeight) {
        fontSize = "15px";
      }

      return `
        <div style="
          white-space: pre-wrap;
          word-break: break-all;
          font-family: 'Courier New', Courier, monospace;
          text-align: ${alignment};
          font-weight: ${fontWeight};
          font-size: ${fontSize};
          line-height: 1.3;
          margin: 0;
          padding: 0;
        ">${line.text}</div>
      `;
    }).join("");

    doc.open();
    doc.write(`
      <html>
        <head>
          <style>
            @page {
              size: ${is80 ? "80mm" : "58mm"} auto;
              margin: 0 !important;
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              width: ${paperWidthPixels};
              margin: 0 auto !important;
              padding: 10px 10px 10px 10px !important;
              color: #000;
              background: #fff;
              box-sizing: border-box;
              text-align: center;
            }
          </style>
        </head>
        <body>
          ${linesHtml}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  }

  /**
   * Public interface wrapper to construct ESC/POS bytes for KOT
   */
  public static buildEscPosBytes(data: PrinterData, width: "58mm" | "80mm" = "80mm", cashierName: string = "Cashier"): Uint8Array {
    const lines = this.generateKOTLines(data, width, cashierName);
    return this.linesToEscPosBytes(lines);
  }

  /**
   * Public interface wrapper to construct ESC/POS bytes for Customer Bill
   */
  public static buildBillEscPosBytes(data: any, settings: any, width: "58mm" | "80mm" = "80mm"): Uint8Array {
    const lines = this.generateBillLines(data, settings, width);
    return this.linesToEscPosBytes(lines);
  }

  /**
   * Public KOT fallback rendering entrypoint
   */
  public static printSystemFallback(data: PrinterData, width: "58mm" | "80mm" = "80mm", cashierName: string = "Cashier"): void {
    this.printPremiumHTML("kot", data, { name: "WEBRAJYA POS" }, { paperWidth: width });
  }

  /**
   * Public Bill fallback rendering entrypoint
   */
  public static printBillSystemFallback(data: any, settings: any, width: "58mm" | "80mm" = "80mm"): void {
    this.printPremiumHTML("bill", data, settings, { paperWidth: width });
  }

  /**
   * Generates a focused thermal receipt for an individual split bill settlement
   */
  public static generateSplitReceiptHTML(
    split: any,
    parentOrder: any,
    settings: any,
    options: any = {}
  ): string {
    const paperWidth = options.paperWidth || settings?.paperWidth || "80mm";
    const is80 = paperWidth === "80mm";
    const paperWidthPixels = is80 ? "290px" : "210px";
    const fontSize = is80 ? "12px" : "10px";
    const titleSize = is80 ? "15px" : "13px";
    const isDark = options.darkPrintMode || false;
    const bg = isDark ? "#121212" : "#ffffff";
    const textCol = isDark ? "#f3f4f6" : "#000000";

    const items = split.items || [];
    const splitTotal = Number(split.allocatedTotal || split.paidAmount || 0).toFixed(2);
    const splitSubtotal = Number(split.allocatedSubtotal || 0).toFixed(2);
    const splitGst = Number(split.allocatedGst || 0).toFixed(2);
    const splitDiscount = Number(split.allocatedDiscount || 0).toFixed(2);

    return `
      <div style="width: ${paperWidthPixels}; background: ${bg}; color: ${textCol}; padding: 8px; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; font-size: ${fontSize}; font-weight: bold; line-height: 1.25; margin: 0 auto; border: 1px solid ${isDark ? "#333" : "#000"}; text-align: left;">
        <div style="text-align: center; text-transform: uppercase;">
          <div style="font-size: ${titleSize}; font-weight: 900; letter-spacing: 1px;">${settings?.name || "RESTAURANT POS"}</div>
          <div style="font-size: ${fontSize}; margin-top: 2px;">${settings?.address || ""}</div>
          <div style="font-size: ${fontSize};">Tel: ${settings?.contactNumber || ""}</div>
          <div style="margin: 6px 0; border: 1.5px solid ${textCol}; padding: 2px 6px; display: inline-block; font-size: ${fontSize}; font-weight: 900;">
            *** SPLIT BILL RECEIPT ***
          </div>
        </div>

        <div style="border-bottom: 1px dashed ${textCol}; margin: 6px 0;"></div>

        <div style="font-size: ${fontSize}; line-height: 1.35;">
          <div><b>Invoice #:</b> ${parentOrder.id}</div>
          <div><b>Share:</b> ${split.personName || `Person #${split.splitIndex + 1}`} (${(split.splitType || "items").toUpperCase()})</div>
          <div><b>Table / Type:</b> ${parentOrder.tableNumber ? `Table #${parentOrder.tableNumber}` : (parentOrder.orderType || "Dine-in").toUpperCase()}</div>
          <div><b>Date:</b> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>

        <div style="border-bottom: 1px dashed ${textCol}; margin: 6px 0;"></div>

        ${items.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; font-size: ${fontSize}; margin-bottom: 6px;">
            <thead>
              <tr style="border-bottom: 1px solid ${textCol};">
                <th style="text-align: left; padding: 2px 0;">ITEM</th>
                <th style="text-align: center; padding: 2px 0;">QTY</th>
                <th style="text-align: right; padding: 2px 0;">AMT</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it: any) => `
                <tr>
                  <td style="padding: 2px 0;">${it.name}</td>
                  <td style="text-align: center; padding: 2px 0;">${it.quantity}</td>
                  <td style="text-align: right; padding: 2px 0;">₹${(Number(it.unitPrice || it.price || 0) * it.quantity).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `
          <div style="padding: 4px 0; font-style: italic; text-align: center;">
            Allocated share of bill (${split.splitType === 'equal' ? 'Equal Split' : 'Custom Amount'})
          </div>
        `}

        <div style="border-top: 1px dashed ${textCol}; padding-top: 4px; font-size: ${fontSize}; line-height: 1.35;">
          ${Number(splitSubtotal) > 0 ? `
            <div style="display: flex; justify-content: space-between;">
              <span>Subtotal:</span>
              <span>₹${splitSubtotal}</span>
            </div>
          ` : ""}
          ${Number(splitDiscount) > 0 ? `
            <div style="display: flex; justify-content: space-between;">
              <span>Discount Share:</span>
              <span>-₹${splitDiscount}</span>
            </div>
          ` : ""}
          ${Number(splitGst) > 0 ? `
            <div style="display: flex; justify-content: space-between;">
              <span>GST Share:</span>
              <span>₹${splitGst}</span>
            </div>
          ` : ""}
          
          <div style="border-top: 1.5px solid ${textCol}; border-bottom: 1.5px solid ${textCol}; margin: 4px 0; padding: 4px 0; display: flex; justify-content: space-between; font-size: ${titleSize}; font-weight: 900;">
            <span>SHARE TOTAL:</span>
            <span>₹${splitTotal}</span>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: ${fontSize}; padding-top: 2px;">
            <span>Payment Mode:</span>
            <span><b>${(split.paymentMethod || "CASH").toUpperCase()}</b></span>
          </div>
          ${split.transactionReference ? `
            <div style="display: flex; justify-content: space-between; font-size: ${fontSize};">
              <span>Txn Ref:</span>
              <span>${split.transactionReference}</span>
            </div>
          ` : ""}
          <div style="display: flex; justify-content: space-between; font-size: ${fontSize};">
            <span>Status:</span>
            <span style="color: ${split.paymentStatus === 'Paid' ? '#16a34a' : '#ea580c'}; font-weight: 900;">${(split.paymentStatus || 'PENDING').toUpperCase()}</span>
          </div>
        </div>

        <div style="border-bottom: 1px dashed ${textCol}; margin: 6px 0;"></div>
        
        <div style="text-align: center; font-size: 9px; line-height: 1.3;">
          <div>Total Bill: ₹${Number(parentOrder.grandTotal).toFixed(2)} | Split 1 of ${(parentOrder.splitSettlements || []).length || 1}</div>
          <div style="margin-top: 4px; font-weight: bold;">THANK YOU! VISIT AGAIN.</div>
        </div>
      </div>
    `;
  }

  /**
   * Direct printing helper for split receipts
   */
  public static printSplitReceipt(
    split: any,
    parentOrder: any,
    settings: any,
    options: any = {}
  ): void {
    const htmlContent = this.generateSplitReceiptHTML(split, parentOrder, settings, options);
    const paperWidth = options.paperWidth || settings?.paperWidth || "80mm";
    const is80 = paperWidth === "80mm";

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Split Bill - ${split.personName || parentOrder.id}</title>
          <style>
            @page {
              size: ${is80 ? "80mm" : "58mm"} auto;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 6px;
              display: flex;
              justify-content: center;
              background: #fff;
            }
          </style>
        </head>
        <body>
          ${htmlContent}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }, 400);
  }

  /**
   * WebUSB & WebSerial Direct Connection Managers
   */
  public static async connectUSB(): Promise<boolean> {
    if (!("usb" in navigator)) {
      throw new Error("WebUSB API is not supported in this browser environment.");
    }
    try {
      const device = await (navigator as any).usb.requestDevice({
        filters: [{ classCode: 0x07 }]
      });
      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);
      this.usbDevice = device;
      return true;
    } catch (err: any) {
      console.error("WebUSB connection failed:", err);
      return false;
    }
  }

  public static async connectSerial(): Promise<boolean> {
    if (!("serial" in navigator)) {
      throw new Error("WebSerial API is not supported in this browser environment.");
    }
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      this.serialPort = port;
      return true;
    } catch (err) {
      console.error("WebSerial connection failed:", err);
      return false;
    }
  }

  /**
   * Print KOT
   */
  public static async printKOT(
    kot: PrinterData,
    width: "58mm" | "80mm" = "80mm",
    mode: "usb" | "serial" | "fallback" | "native" = "native",
    cashierName: string = "Cashier"
  ): Promise<boolean> {
    const pSettings = getWRPrinterSettings();
    if (NativePrinterService.isAvailable()) {
      const hex = buildKOTESCPOS(kot, pSettings);
      const res = await NativePrinterService.printRawHex(pSettings.printerName, hex, pSettings.copies);
      return res.success;
    }

    if (mode === "usb") {
      const bytes = this.buildEscPosBytes(kot, width, cashierName);
      if (!this.usbDevice) {
        const connected = await this.connectUSB();
        if (!connected) return false;
      }
      try {
        await this.usbDevice!.transferOut(1, bytes);
        return true;
      } catch (err) {
        console.error("WebUSB raw print transfer failed:", err);
        return false;
      }
    } else if (mode === "serial") {
      const bytes = this.buildEscPosBytes(kot, width, cashierName);
      if (!this.serialPort) {
        const connected = await this.connectSerial();
        if (!connected) return false;
      }
      try {
        const writer = this.serialPort.writable.getWriter();
        await writer.write(bytes);
        writer.releaseLock();
        return true;
      } catch (err) {
        console.error("WebSerial raw print write failed:", err);
        return false;
      }
    } else {
      this.printSystemFallback(kot, width, cashierName);
      return true;
    }
  }

  /**
   * Print Bill
   */
  public static async printBill(
    order: any,
    settings: any,
    width: "58mm" | "80mm" = "80mm",
    mode: "usb" | "serial" | "fallback" | "native" = "native"
  ): Promise<boolean> {
    const pSettings = getWRPrinterSettings();
    if (NativePrinterService.isAvailable()) {
      const hex = buildBillESCPOS(order, settings, pSettings);
      const res = await NativePrinterService.printRawHex(pSettings.printerName, hex, pSettings.copies);
      return res.success;
    }

    if (mode === "usb") {
      const bytes = this.buildBillEscPosBytes(order, settings, width);
      if (!this.usbDevice) {
        const connected = await this.connectUSB();
        if (!connected) return false;
      }
      try {
        await this.usbDevice!.transferOut(1, bytes);
        return true;
      } catch (err) {
        console.error("WebUSB raw print transfer failed:", err);
        return false;
      }
    } else if (mode === "serial") {
      const bytes = this.buildBillEscPosBytes(order, settings, width);
      if (!this.serialPort) {
        const connected = await this.connectSerial();
        if (!connected) return false;
      }
      try {
        const writer = this.serialPort.writable.getWriter();
        await writer.write(bytes);
        writer.releaseLock();
        return true;
      } catch (err) {
        console.error("WebSerial raw print write failed:", err);
        return false;
      }
    } else {
      this.printBillSystemFallback(order, settings, width);
      return true;
    }
  }

  /**
   * Helper to build standard KOT data object from an order
   */
  public static buildKOTDataFromOrder(order: any): any {
    return {
      id: `KOT-${order.id}`,
      orderId: order.id,
      kotNumber: `KOT-${order.id}`,
      tableNumber: order.tableNumber,
      orderType: order.orderType,
      customerName: order.customerName,
      phoneNumber: order.phoneNumber,
      createdAt: order.createdAt,
      items: order.items || [],
      specialInstructions: order.notes || (Array.isArray(order.items) ? order.items.map((i: any) => i.customization).filter(Boolean).join(", ") : undefined)
    };
  }

  /**
   * Print Combined Customer Bill + ESC/POS Cut + Kitchen Order Ticket (KOT) as one Native print job
   */
  public static async printCombinedBillAndKOT(
    order: any,
    settings: any,
    mode: "usb" | "serial" | "fallback" | "native" = "native"
  ): Promise<boolean> {
    const pSettings = getWRPrinterSettings();
    const kotData = this.buildKOTDataFromOrder(order);

    if (NativePrinterService.isAvailable()) {
      const billHex = buildBillESCPOS(order, settings, pSettings);
      const kotHex = buildKOTESCPOS(kotData, pSettings);
      const combinedHex = billHex + kotHex;
      const res = await NativePrinterService.printRawHex(pSettings.printerName, combinedHex, pSettings.copies);
      return res.success;
    }

    const billSuccess = await this.printBill(order, settings, pSettings.paperWidth, mode);
    const kotSuccess = await this.printKOT(kotData, pSettings.paperWidth, mode);
    return billSuccess && kotSuccess;
  }

  /**
   * Alias for printCombinedBillAndKOT
   */
  public static async printBillAndKot(
    order: any,
    settings: any,
    mode: "usb" | "serial" | "fallback" | "native" = "native"
  ): Promise<boolean> {
    return this.printCombinedBillAndKOT(order, settings, mode);
  }

  /**
   * Print KOT and Bill sequentially with separate cuts and 1000ms delay
   */
  public static async printKOTAndBillSequentially(
    kot: any,
    order: any,
    settings: any,
    width: "58mm" | "80mm" = "80mm",
    mode: "usb" | "serial" | "fallback" | "native" = "native",
    cashierName: string = "Cashier"
  ): Promise<{ kotSuccess: boolean; billSuccess: boolean }> {
    console.log("=== START SEQUENTIAL THERMAL PRINT WORKFLOW ===");
    
    console.log("Step 1: Printing Customer Bill automatically...");
    const billSuccess = await this.printBill(order, settings, width, mode);
    if (!billSuccess) {
      console.error("Customer Bill printing failed.");
      return { kotSuccess: false, billSuccess: false };
    }
    console.log("Customer Bill printed successfully, separate paper cut command sent.");

    console.log("Step 2: Waiting 1200ms...");
    await new Promise((resolve) => setTimeout(resolve, 1200));

    console.log("Step 3: Printing KOT...");
    const kotSuccess = await this.printKOT(kot, width, mode, cashierName);
    if (!kotSuccess) {
      console.error("KOT printing failed! Aborting sequence as per POS rules.");
      return { kotSuccess: false, billSuccess: true };
    }
    
    console.log("KOT printed successfully, separate paper cut command sent.");
    return { kotSuccess: true, billSuccess: true };
  }
}

// --- MASTER PRINTER CONFIGURATION STORAGE AND ESC/POS BUILDERS ---

export interface WRPrinterSettings {
  printerName: string;
  paperWidth: "58mm" | "80mm";
  autoPrintBill: boolean;
  autoPrintKOT: boolean;
  autoCut: boolean;
  cutType: "full" | "partial";
  feedBeforeCutBill: number;
  feedBeforeCutKOT: number;
  copies: number;
  useQZTray: boolean;
}

export function getWRPrinterSettings(): WRPrinterSettings {
  try {
    const config = PrinterManager.getConfiguredPrinter();
    return {
      printerName: config.receiptPrinterName || "EPSON TM-T82X Receipt",
      paperWidth: config.paperWidth,
      autoPrintBill: config.autoPrintBill,
      autoPrintKOT: config.autoPrintKOT,
      autoCut: config.autoCut,
      cutType: config.cutType,
      feedBeforeCutBill: config.feedBeforeCutBill,
      feedBeforeCutKOT: config.feedBeforeCutKOT,
      copies: config.copies,
      useQZTray: false,
    };
  } catch (e) {
    return {
      printerName: "EPSON TM-T82X Receipt",
      paperWidth: "80mm",
      autoPrintBill: true,
      autoPrintKOT: true,
      autoCut: true,
      cutType: "full",
      feedBeforeCutBill: 5,
      feedBeforeCutKOT: 3,
      copies: 1,
      useQZTray: false,
    };
  }
}

export function saveWRPrinterSettings(settings: WRPrinterSettings) {
  try {
    PrinterManager.saveConfiguredPrinter({
      receiptPrinterName: settings.printerName,
      paperWidth: settings.paperWidth,
      autoPrintBill: settings.autoPrintBill,
      autoPrintKOT: settings.autoPrintKOT,
      autoCut: settings.autoCut,
      cutType: settings.cutType,
      feedBeforeCutBill: settings.feedBeforeCutBill,
      feedBeforeCutKOT: settings.feedBeforeCutKOT,
      copies: settings.copies
    });
  } catch (e) {
    localStorage.setItem("wr_printer_settings", JSON.stringify(settings));
  }
}

// Helper to split an item name into words wrapped to a max column width without breaking words
function wrapItemWords(name: string, maxLen: number): string[] {
  if (!name || name.length <= maxLen) return [name || ""];
  const words = name.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      if (word.length > maxLen) {
        let w = word;
        while (w.length > maxLen) {
          lines.push(w.slice(0, maxLen));
          w = w.slice(maxLen);
        }
        currentLine = w;
      } else {
        currentLine = word;
      }
    } else if (currentLine.length + 1 + word.length <= maxLen) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      if (word.length > maxLen) {
        let w = word;
        while (w.length > maxLen) {
          lines.push(w.slice(0, maxLen));
          w = w.slice(maxLen);
        }
        currentLine = w;
      } else {
        currentLine = word;
      }
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

export function buildBillESCPOS(data: any, settings: any, printerSettings: WRPrinterSettings): string {
  const builder = new ESCPOSBuilder();
  const width = printerSettings.paperWidth || "80mm";
  const lineWidth = width === "80mm" ? 40 : 32;
  const dividerLine = "-".repeat(lineWidth) + "\n";

  // 1. Restaurant Header (No address, No phone number, No payment info)
  builder.alignCenter().bold(true);
  builder.writeText("THE XINGS KITCHEN\n");
  builder.writeText("-----------------\n\n");
  builder.bold(false);

  // 2. Metadata Section (Left aligned)
  builder.alignLeft();
  const rawBillNo = data.billNo || data.billNumber || data.id || "SR-345484";
  const billNo = String(rawBillNo).toUpperCase().startsWith("SR-") ? String(rawBillNo) : `SR-${rawBillNo}`;
  builder.writeText(`Bill No: ${billNo}\n`);

  // Table (Omit if takeaway or no table)
  const rawTable = data.tableNumber || data.table || data.table_number;
  const isTakeaway = (data.orderType || "").toLowerCase() === "takeaway";
  const hasTable = rawTable &&
    rawTable !== "0" &&
    rawTable !== 0 &&
    rawTable !== "null" &&
    rawTable !== "undefined" &&
    String(rawTable).trim() !== "" &&
    !isTakeaway;

  if (hasTable) {
    const tableStr = String(rawTable).padStart(2, "0");
    builder.writeText(`Table: ${tableStr}\n`);
  }

  // Date & Time: 18/09/2026     Time: 01:48 PM
  const d = new Date(data.createdAt || Date.now());
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const dateStr = `${day}/${month}/${year}`;

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;

  builder.writeText(`Date: ${dateStr}     Time: ${timeStr}\n`);
  builder.writeText(`Order Type: ${(data.orderType || "DINE-IN").toUpperCase()}\n\n`);

  // 3. Item Table
  builder.writeText(dividerLine);

  const fmt = (val: number): string => (Number.isInteger(val) ? String(val) : val.toFixed(2));

  if (width === "80mm") {
    // 80mm Layout (40 chars): ITEM (20), QTY (5), RATE (8), AMT (7)
    builder.bold(true);
    builder.writeText("ITEM".padEnd(20) + "QTY".padStart(5) + "RATE".padStart(8) + "AMT".padStart(7) + "\n");
    builder.bold(false);
    builder.writeText(dividerLine);

    const items = data.items || [];
    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      const rate = Number(item.price ?? item.unitPrice ?? 0);
      const amt = rate * qty;

      const nameChunks = wrapItemWords(item.name || "Item", 20);
      const firstChunk = (nameChunks[0] || "Item").padEnd(20);
      const qtyStr = String(qty).padStart(5);
      const rateStr = fmt(rate).padStart(8);
      const amtStr = fmt(amt).padStart(7);

      builder.writeText(firstChunk + qtyStr + rateStr + amtStr + "\n");

      for (let i = 1; i < nameChunks.length; i++) {
        builder.writeText("  " + nameChunks[i] + "\n");
      }
      if (item.customization) {
        builder.writeText("  + " + item.customization + "\n");
      }
    }
  } else {
    // 58mm Layout (32 chars): ITEM (14), QTY (4), RATE (7), AMT (7)
    builder.bold(true);
    builder.writeText("ITEM".padEnd(14) + "QTY".padStart(4) + "RATE".padStart(7) + "AMT".padStart(7) + "\n");
    builder.bold(false);
    builder.writeText(dividerLine);

    const items = data.items || [];
    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      const rate = Number(item.price ?? item.unitPrice ?? 0);
      const amt = rate * qty;

      const nameChunks = wrapItemWords(item.name || "Item", 14);
      const firstChunk = (nameChunks[0] || "Item").padEnd(14);
      const qtyStr = String(qty).padStart(4);
      const rateStr = fmt(rate).padStart(7);
      const amtStr = fmt(amt).padStart(7);

      builder.writeText(firstChunk + qtyStr + rateStr + amtStr + "\n");

      for (let i = 1; i < nameChunks.length; i++) {
        builder.writeText("  " + nameChunks[i] + "\n");
      }
      if (item.customization) {
        builder.writeText("  + " + item.customization + "\n");
      }
    }
  }

  builder.writeText(dividerLine);

  // 4. Totals (Subtotal, Discount, Grand Total with ₹)
  const items = data.items || [];
  const calculatedSubtotal = items.reduce((sum: number, it: any) => sum + (Number(it.price ?? it.unitPrice ?? 0) * (Number(it.quantity) || 1)), 0);
  const subtotalVal = Number(data.subtotal ?? calculatedSubtotal);
  const discountVal = Number(data.discountAmount ?? data.discount ?? 0);
  const gstVal = Number(data.gst ?? data.totalGst ?? 0);
  const packagingVal = isTakeaway ? 0 : Number(data.packagingCharge || 0);
  const grandTotalVal = isTakeaway
    ? Math.max(0, Math.round(subtotalVal - discountVal + gstVal))
    : Number(data.grandTotal ?? Math.round(subtotalVal - discountVal + packagingVal + gstVal));

  if (width === "80mm") {
    // 40 chars width
    const subtotalRow = "SUBTOTAL".padStart(32) + fmt(subtotalVal).padStart(8);
    builder.writeText(subtotalRow + "\n");

    if (discountVal > 0) {
      const discountRow = "DISCOUNT".padStart(32) + fmt(discountVal).padStart(8);
      builder.writeText(discountRow + "\n");
    }

    if (!isTakeaway && packagingVal > 0) {
      const pkgRow = "PACKING CHARGES".padStart(32) + fmt(packagingVal).padStart(8);
      builder.writeText(pkgRow + "\n");
    }

    if (gstVal > 0) {
      const gstRow = "GST".padStart(32) + fmt(gstVal).padStart(8);
      builder.writeText(gstRow + "\n");
    }

    builder.writeText(dividerLine);

    builder.bold(true);
    const grandTotalRow = "GRAND TOTAL".padStart(28) + (" ₹" + fmt(grandTotalVal)).padStart(12);
    builder.writeText(grandTotalRow + "\n");
    builder.bold(false);
  } else {
    // 32 chars width
    const subtotalRow = "SUBTOTAL".padStart(24) + fmt(subtotalVal).padStart(8);
    builder.writeText(subtotalRow + "\n");

    if (discountVal > 0) {
      const discountRow = "DISCOUNT".padStart(24) + fmt(discountVal).padStart(8);
      builder.writeText(discountRow + "\n");
    }

    if (!isTakeaway && packagingVal > 0) {
      const pkgRow = "PACKING".padStart(24) + fmt(packagingVal).padStart(8);
      builder.writeText(pkgRow + "\n");
    }

    if (gstVal > 0) {
      const gstRow = "GST".padStart(24) + fmt(gstVal).padStart(8);
      builder.writeText(gstRow + "\n");
    }

    builder.writeText(dividerLine);

    builder.bold(true);
    const grandTotalRow = "GRAND TOTAL".padStart(22) + (" ₹" + fmt(grandTotalVal)).padStart(10);
    builder.writeText(grandTotalRow + "\n");
    builder.bold(false);
  }

  builder.writeText(dividerLine);

  // 5. Footer (Thank You! Visit Again)
  builder.feed(1);
  builder.alignCenter();
  builder.writeText("Thank You! Visit Again\n");

  // Feed before cut
  const feedLines = printerSettings.feedBeforeCutBill ?? 5;
  builder.feed(feedLines);

  // Auto paper cut
  if (printerSettings.autoCut) {
    if (printerSettings.cutType === "partial") {
      builder.cutPartial();
    } else {
      builder.cutFull();
    }
  }

  return builder.compileHex();
}

export function buildKOTESCPOS(data: any, printerSettings: WRPrinterSettings): string {
  const builder = new ESCPOSBuilder();
  const dividerLine = "--------------------------------\n"; // 32 characters

  // 1. Header (Centered, bold)
  builder.alignCenter().bold(true);
  const kitchenTitle = (data.restaurantName || data.storeName || "KITCHEN ORDER TICKET").toUpperCase();
  builder.writeText(`${kitchenTitle}\n`);
  builder.writeText("KOT (KITCHEN COPY)\n");
  builder.bold(false);
  builder.writeText(dividerLine + "\n");

  // 2. Metadata Section (Left aligned)
  builder.alignLeft();

  // KOT number and Reference Order number
  const rawKot = data.kotNumber || data.kot_number || data.id || "001";
  const kotClean = String(rawKot).replace(/KOT-?/i, "").trim() || "001";
  const kotNum = kotClean.length < 3 && /^\d+$/.test(kotClean) ? kotClean.padStart(3, "0") : kotClean;

  const rawOrder = data.orderId || data.order_id || data.id || "1042";
  const orderClean = String(rawOrder).replace(/^#/, "");

  const leftMeta = `KOT: ${kotNum}`;
  const rightMeta = `#${orderClean}`;
  const spacesMeta = Math.max(1, 32 - leftMeta.length - rightMeta.length);
  builder.writeText(leftMeta + " ".repeat(spacesMeta) + rightMeta + "\n");

  // Table (Omit for takeaway or if no table)
  const rawTable = data.tableNumber || data.table || data.table_number;
  const isTakeaway = (data.orderType || "").toLowerCase() === "takeaway";
  const hasTable = rawTable &&
    rawTable !== "0" &&
    rawTable !== 0 &&
    rawTable !== "null" &&
    rawTable !== "undefined" &&
    String(rawTable).trim() !== "" &&
    !isTakeaway;

  if (hasTable) {
    const tableStr = String(rawTable).padStart(2, "0");
    builder.writeText(`TABLE: ${tableStr}\n`);
  }

  // Type
  builder.writeText(`TYPE: ${(data.orderType || "TAKEAWAY").toUpperCase()}\n`);

  // Time: 01:48 PM
  const d = new Date(data.createdAt || Date.now());
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
  builder.writeText(`TIME: ${timeStr}\n\n`);

  // 3. Items Table (NO PRICES, NO RATES, NO FINANCIAL TOTALS)
  builder.writeText(dividerLine);
  builder.bold(true);
  builder.writeText("QTY    ITEM\n");
  builder.bold(false);
  builder.writeText(dividerLine);

  const items = data.items || [];
  for (const item of items) {
    builder.bold(true);
    const qtyStr = String(item.quantity || 1).padStart(2, " ");
    builder.writeText(`${qtyStr}     ${item.name || "Item"}\n`);
    builder.bold(false);
    if (item.customization) {
      builder.writeText(`       NOTE: ${item.customization}\n`);
    }
  }

  builder.writeText(dividerLine);

  // 4. Order Notes (If no notes, do NOT print an empty NOTE section)
  const rawNotes = data.specialInstructions || data.notes || data.orderNotes || data.order_notes;
  const hasNotes = rawNotes &&
    typeof rawNotes === "string" &&
    rawNotes.trim() !== "" &&
    rawNotes.trim().toLowerCase() !== "none";

  if (hasNotes) {
    builder.bold(true);
    builder.writeText("\nNOTE:\n");
    builder.bold(false);

    const noteLines = rawNotes
      .split(/[\r\n]+/)
      .flatMap((line: string) => line.split(","))
      .map((line: string) => line.trim())
      .filter(Boolean);

    for (const noteLine of noteLines) {
      builder.writeText(`${noteLine}\n`);
    }

    builder.writeText("\n" + dividerLine);
  }

  // Feed before cut
  const feedLines = printerSettings.feedBeforeCutKOT ?? 3;
  builder.feed(feedLines);

  // Auto paper cut
  if (printerSettings.autoCut) {
    if (printerSettings.cutType === "partial") {
      builder.cutPartial();
    } else {
      builder.cutFull();
    }
  }

  return builder.compileHex();
}

export function buildBackSideESCPOS(settings: any, printerSettings: WRPrinterSettings): string {
  const builder = new ESCPOSBuilder();
  const width = printerSettings.paperWidth || "80mm";

  builder.alignCenter().bold(true);
  builder.writeText((settings.estd || "ESTD. 2020") + "\n");
  builder.doubleSize(true);
  builder.writeText((settings.name || "WEBRAJYA POS") + "\n");
  builder.doubleSize(false);
  builder.writeText((settings.city || "BENGALURU") + "\n");
  builder.writeText("*** " + (settings.backSideTitle || "OUR OUTLETS") + " ***\n");
  builder.divider(width, true);

  // Outlets
  builder.alignLeft();
  const outlets = (settings.outlets && settings.outlets.length > 0) ? settings.outlets : defaultOutlets;
  outlets.forEach((o: any, i: number) => {
    builder.bold(true).writeText(`${i + 1}. ${o.name.toUpperCase()}\n`).bold(false);
    builder.writeText(`   ${o.address}\n`);
    builder.writeText(`   Phone: ${o.contactNumber}\n`);
  });

  builder.divider(width, false);

  // Terms & Conditions
  builder.alignCenter().bold(true);
  builder.writeText("TERMS & CONDITIONS\n");
  builder.bold(false).alignLeft();
  const terms = (settings.termsAndConditions && settings.termsAndConditions.length > 0) ? settings.termsAndConditions : defaultTermsAndConditions;
  terms.forEach((t: string, i: number) => {
    builder.writeText(`${i + 1}. ${t}\n`);
  });

  builder.divider(width, true);

  // Contact info
  builder.alignCenter();
  builder.writeText(`Customer Care: ${settings.customerCare || settings.contactNumber || "+91 9876543210"}\n`);
  builder.writeText(`Website: ${settings.website || ""}\n`);
  builder.writeText(`Email: ${settings.email || ""}\n`);
  builder.divider(width, false);

  // Back side footer
  builder.bold(true);
  builder.writeText((settings.backSideFooterNote || "Thank You For Visiting") + "\n");
  builder.bold(false);

  const feedLines = printerSettings.feedBeforeCutBill ?? 4;
  builder.feed(feedLines);

  if (printerSettings.autoCut) {
    if (printerSettings.cutType === "partial") {
      builder.cutPartial();
    } else {
      builder.cutFull();
    }
  }

  return builder.compileHex();
}

export function buildDoubleSidedESCPOS(data: any, settings: any, printerSettings: WRPrinterSettings): string {
  const frontHex = buildBillESCPOS(data, settings, { ...printerSettings, autoCut: false });
  const backHex = buildBackSideESCPOS(settings, printerSettings);
  return frontHex + backHex;
}

export function buildZReportESCPOS(
  shift: Shift,
  financials: ShiftFinancials,
  settings: any,
  printerSettings: WRPrinterSettings,
  reportType: "Z-REPORT" | "X-REPORT" = "Z-REPORT"
): string {
  const builder = new ESCPOSBuilder();
  const width = printerSettings.paperWidth || "80mm";
  const restName = settings?.name || "WEBRAJYA POS RESTAURANT";
  const restAddress = settings?.address || "MG Road, Bengaluru";
  const gstNumber = settings?.gstEnabled ? (settings?.gstNumber || settings?.gstin || "") : "";

  builder.alignCenter().bold(true).doubleSize(true);
  builder.writeText(`${restName.toUpperCase()}\n`);
  builder.doubleSize(false).bold(false);
  builder.writeText(`${restAddress}\n`);
  if (gstNumber) {
    builder.writeText(`GSTIN: ${gstNumber}\n`);
  }
  builder.divider(width, true);

  // Header Title
  builder.bold(true).doubleHeight(true);
  builder.writeText(reportType === "Z-REPORT" ? "*** SHIFT Z-REPORT (FINAL RECONCILIATION) ***\n" : "*** SHIFT X-REPORT (MID-SHIFT AUDIT) ***\n");
  builder.bold(false).doubleHeight(false);
  builder.divider(width, false);

  builder.alignLeft();
  builder.writeText(`Shift ID    : ${shift.id}\n`);
  builder.writeText(`Cashier     : ${shift.cashierName || "Cashier"}\n`);
  builder.writeText(`Opened By   : ${shift.openedBy} (${new Date(shift.openedAt).toLocaleTimeString()})\n`);
  if (shift.closedAt) {
    builder.writeText(`Closed By   : ${shift.closedBy || "Admin"} (${new Date(shift.closedAt).toLocaleTimeString()})\n`);
  }
  builder.writeText(`Business Day: ${shift.businessDate}\n`);
  builder.writeText(`Print Time  : ${new Date().toLocaleString()}\n`);
  builder.divider(width, true);

  // Section 1: Drawer Financial Summary
  builder.bold(true);
  builder.writeText("CASH DRAWER RECONCILIATION:\n");
  builder.bold(false);
  builder.totalRow("Opening Cash Float", `Rs. ${financials.openingCash.toFixed(2)}`, width);
  builder.totalRow("(+) Cash Sales", `Rs. ${financials.cashSales.toFixed(2)}`, width);
  builder.totalRow("(+) Cash In / Additions", `Rs. ${financials.cashIn.toFixed(2)}`, width);
  builder.totalRow("(-) Cash Out / Drops", `Rs. ${financials.cashOut.toFixed(2)}`, width);
  builder.divider(width, false);

  builder.bold(true);
  builder.totalRow("EXPECTED CASH IN DRAWER", `Rs. ${financials.expectedCash.toFixed(2)}`, width);
  if (financials.actualCash !== undefined) {
    builder.totalRow("ACTUAL CASH COUNTED", `Rs. ${financials.actualCash.toFixed(2)}`, width);
    const diff = financials.difference || 0;
    const diffLabel = financials.differenceType === "Exact" ? "Rs. 0.00 (EXACT)" : diff < 0 ? `-Rs. ${Math.abs(diff).toFixed(2)} (SHORT)` : `+Rs. ${diff.toFixed(2)} (EXCESS)`;
    builder.totalRow("DISCREPANCY / VARIANCE", diffLabel, width);
    if (shift.differenceReason) {
      builder.writeText(`Discrepancy Note: "${shift.differenceReason}"\n`);
    }
  }
  builder.bold(false);
  builder.divider(width, true);

  // Section 2: Tender Breakdown
  builder.bold(true);
  builder.writeText("SALES BY TENDER / PAYMENT METHOD:\n");
  builder.bold(false);
  builder.totalRow("Cash Sales", `Rs. ${financials.cashSales.toFixed(2)}`, width);
  builder.totalRow("UPI / QR Payments", `Rs. ${financials.upiSales.toFixed(2)}`, width);
  builder.totalRow("Card / POS Payments", `Rs. ${financials.cardSales.toFixed(2)}`, width);
  if (financials.otherSales > 0) {
    builder.totalRow("Other Tender Sales", `Rs. ${financials.otherSales.toFixed(2)}`, width);
  }
  builder.divider(width, false);
  builder.bold(true);
  builder.totalRow("TOTAL REVENUE COLLECTED", `Rs. ${financials.totalSales.toFixed(2)}`, width);
  builder.bold(false);
  builder.divider(width, true);

  // Section 3: Operational Metrics & Exceptions
  builder.bold(true);
  builder.writeText("OPERATIONAL & AUDIT METRICS:\n");
  builder.bold(false);
  builder.totalRow("Total Settled Orders", `${financials.orderCount}`, width);
  builder.totalRow("Total Payment Records", `${financials.paymentCount}`, width);
  builder.totalRow("Voided Payments Total", `Rs. ${financials.voidedTotal.toFixed(2)}`, width);
  builder.totalRow("Refunds Total", `Rs. ${financials.refundedTotal.toFixed(2)}`, width);
  builder.divider(width, false);

  // Section 4: Cash Drawer Adjustments Log
  if (financials.adjustments && financials.adjustments.length > 0) {
    builder.bold(true);
    builder.writeText("CASH ADJUSTMENTS AUDIT LOG:\n");
    builder.bold(false);
    financials.adjustments.forEach((adj, idx) => {
      const timeStr = new Date(adj.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      builder.totalRow(`${idx + 1}. [${adj.type}] ${timeStr}`, `Rs. ${adj.amount.toFixed(2)}`, width);
      builder.writeText(`   Reason: ${adj.reason} (Auth: ${adj.authorizedBy})\n`);
    });
    builder.divider(width, false);
  }

  // Signatures
  builder.alignLeft();
  builder.writeText("\n\n");
  builder.writeText("Cashier Signature: ___________________\n\n");
  builder.writeText("Manager Signature: ___________________\n");
  builder.divider(width, true);

  builder.alignCenter().bold(true);
  builder.writeText(reportType === "Z-REPORT" ? "*** SHIFT OFFICIALLY RECONCILED ***\n" : "*** MID-SHIFT AUDIT ONLY ***\n");
  builder.bold(false);
  builder.writeText("Generated by WebRajya POS Financial Engine\n");

  const feedLines = printerSettings.feedBeforeCutBill ?? 4;
  builder.feed(feedLines);

  if (printerSettings.autoCut) {
    if (printerSettings.cutType === "partial") {
      builder.cutPartial();
    } else {
      builder.cutFull();
    }
  }

  return builder.compileHex();
}
