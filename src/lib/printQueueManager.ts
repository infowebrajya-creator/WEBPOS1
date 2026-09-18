import { MenuItem } from "../types";
import { PhysicalThermalPrinter, getWRPrinterSettings } from "./printerService";
import { LocalDB, Order } from "./db";

export interface PrinterConfig {
  id: string; // "bill" | "kitchen" | "bar" | "dessert"
  name: string; // e.g., "Billing Counter Printer"
  role: "bill" | "kitchen" | "bar" | "dessert";
  type: "usb" | "network" | "bluetooth" | "fallback";
  address: string; // IP address, USB device info, or bluetooth name
  paperWidth: "58mm" | "80mm";
  autoPrint: boolean;
  copies: number;
  encoding: "ASCII" | "UTF-8" | "Windows-1252";
  density: "light" | "normal" | "dark";
  margin: number; // in pixels
  status: "online" | "offline";
}

export interface PrintJob {
  id: string;
  orderId: string;
  type: "Bill" | "KOT" | "Add-On KOT";
  role: "bill" | "kitchen" | "bar" | "dessert";
  printerName: string;
  items: { name: string; quantity: number; price?: number; customization?: string }[];
  status: "Pending" | "Printing" | "Printed" | "Failed" | "Retrying";
  errorMessage?: string;
  createdAt: string;
  retryCount: number;
  isReprint?: boolean;
  reprintCount?: number;
  originalPrintTime?: string;
}

export interface PrintHistoryLog {
  id: string;
  orderId: string;
  printerId: string;
  printerName: string;
  printType: "Bill" | "KOT" | "Add-On KOT";
  printedBy: string;
  printTime: string;
  status: "Success" | "Failed";
  errorMessage?: string;
  reprints: number;
  originalPrintTime?: string;
  reprintTime?: string;
}

const DEFAULT_PRINTER_CONFIGS: PrinterConfig[] = [
  {
    id: "bill",
    name: "Billing Counter Printer",
    role: "bill",
    type: "fallback",
    address: "192.168.1.100",
    paperWidth: "80mm",
    autoPrint: true,
    copies: 1,
    encoding: "UTF-8",
    density: "normal",
    margin: 8,
    status: "online",
  },
  {
    id: "kitchen",
    name: "Kitchen KOT Printer",
    role: "kitchen",
    type: "fallback",
    address: "192.168.1.101",
    paperWidth: "80mm",
    autoPrint: true,
    copies: 1,
    encoding: "UTF-8",
    density: "normal",
    margin: 8,
    status: "online",
  },
  {
    id: "bar",
    name: "Beverage Bar Printer",
    role: "bar",
    type: "fallback",
    address: "192.168.1.102",
    paperWidth: "58mm",
    autoPrint: true,
    copies: 1,
    encoding: "UTF-8",
    density: "normal",
    margin: 6,
    status: "online",
  },
  {
    id: "dessert",
    name: "Dessert Station Printer",
    role: "dessert",
    type: "fallback",
    address: "192.168.1.103",
    paperWidth: "58mm",
    autoPrint: true,
    copies: 1,
    encoding: "UTF-8",
    density: "normal",
    margin: 6,
    status: "online",
  },
];

export class PrintQueueManager {
  private static subscribers: Set<() => void> = new Set();

  public static subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private static notifySubscribers() {
    this.subscribers.forEach((cb) => cb());
    window.dispatchEvent(new Event("print_queue_updated"));
  }

  // --- CONFIGURATIONS ---
  public static getPrinterConfigs(): PrinterConfig[] {
    const stored = localStorage.getItem("sr_printer_configs");
    if (!stored) {
      localStorage.setItem("sr_printer_configs", JSON.stringify(DEFAULT_PRINTER_CONFIGS));
      return DEFAULT_PRINTER_CONFIGS;
    }
    return JSON.parse(stored);
  }

  public static savePrinterConfigs(configs: PrinterConfig[]) {
    localStorage.setItem("sr_printer_configs", JSON.stringify(configs));
    this.notifySubscribers();
  }

  // --- QUEUE ---
  public static getQueue(): PrintJob[] {
    const stored = localStorage.getItem("sr_print_queue");
    if (!stored) {
      localStorage.setItem("sr_print_queue", JSON.stringify([]));
      return [];
    }
    return JSON.parse(stored);
  }

  public static saveQueue(queue: PrintJob[]) {
    localStorage.setItem("sr_print_queue", JSON.stringify(queue));
    this.notifySubscribers();
  }

  // --- LOGS ---
  public static getLogs(): PrintHistoryLog[] {
    const stored = localStorage.getItem("sr_print_logs_v2");
    if (!stored) {
      localStorage.setItem("sr_print_logs_v2", JSON.stringify([]));
      return [];
    }
    return JSON.parse(stored);
  }

  public static saveLogs(logs: PrintHistoryLog[]) {
    localStorage.setItem("sr_print_logs_v2", JSON.stringify(logs));
    this.notifySubscribers();
  }

  // Determine which printer handles which menu item category
  public static getItemRole(categoryName: string): "kitchen" | "bar" | "dessert" {
    const lower = categoryName.toLowerCase();
    if (lower.includes("beverage") || lower.includes("drink") || lower.includes("mocktail") || lower.includes("shake") || lower.includes("soda") || lower.includes("bar")) {
      return "bar";
    }
    if (lower.includes("dessert") || lower.includes("sweet") || lower.includes("ice cream") || lower.includes("kulfi") || lower.includes("cake") || lower.includes("pastry")) {
      return "dessert";
    }
    return "kitchen";
  }

  /**
   * Spools a KOT for an order, splitting items by printer roles.
   * Handles Add-on KOT logic automatically by comparing with previous print jobs of the same order.
   */
  public static async spoolKOT(order: Order, isReprint: boolean = false) {
    const configs = this.getPrinterConfigs();
    const queue = this.getQueue();
    const logs = this.getLogs();
    const menuItems = LocalDB.getMenuItems();

    // Find all items in the order and resolve their categories
    const resolvedItems = order.items.map((item) => {
      const dbItem = menuItems.find((m) => m.id === item.menuItemId);
      const cat = dbItem?.category || "other";
      const role = this.getItemRole(cat);
      return {
        ...item,
        role,
      };
    });

    // Check what has already been printed for this order to support "ADD-ON KOT"
    // Find previous non-failed KOT jobs for this order in the history logs
    const previousKotLogs = logs.filter(
      (l) => l.orderId === order.id && l.status === "Success" && (l.printType === "KOT" || l.printType === "Add-On KOT")
    );

    const isAddOn = previousKotLogs.length > 0 && !isReprint;

    // Group current items by printer role
    const itemsByRole: Record<"kitchen" | "bar" | "dessert", typeof resolvedItems> = {
      kitchen: [],
      bar: [],
      dessert: [],
    };

    resolvedItems.forEach((itm) => {
      itemsByRole[itm.role].push(itm);
    });

    // For each role, check if there are items to print
    for (const role of ["kitchen", "bar", "dessert"] as const) {
      let roleItems = itemsByRole[role];
      if (roleItems.length === 0) continue;

      const printerConfig = configs.find((c) => c.role === role);
      if (!printerConfig) continue;

      // Filter items to print
      let finalItemsToPrint = roleItems.map((ri) => ({
        name: ri.name,
        quantity: ri.quantity,
        customization: ri.customization,
      }));

      if (isAddOn) {
        // Find how many of this item were already printed in previous successful runs
        const printedQuantities: Record<string, number> = {};
        
        // Let's inspect the successful print logs or print jobs for this order ID
        const previousSuccessJobs = queue.filter(
          (j) => j.orderId === order.id && j.role === role && j.status === "Printed"
        );

        previousSuccessJobs.forEach((job) => {
          job.items.forEach((it) => {
            const key = it.name + (it.customization || "");
            printedQuantities[key] = (printedQuantities[key] || 0) + it.quantity;
          });
        });

        // Compute the delta
        const deltaItems = roleItems
          .map((ri) => {
            const key = ri.name + (ri.customization || "");
            const printedQty = printedQuantities[key] || 0;
            const newQty = ri.quantity - printedQty;
            return {
              name: ri.name,
              quantity: newQty,
              customization: ri.customization,
            };
          })
          .filter((ri) => ri.quantity > 0);

        if (deltaItems.length === 0) {
          // No newly added items for this printer, skip spooling KOT
          continue;
        }

        finalItemsToPrint = deltaItems;
      }

      // If reprint, we print all items of this role
      if (isReprint) {
        finalItemsToPrint = roleItems.map((ri) => ({
          name: ri.name,
          quantity: ri.quantity,
          customization: ri.customization,
        }));
      }

      const jobType = isReprint ? "KOT" : (isAddOn ? "Add-On KOT" : "KOT");

      // Count reprints if applicable
      let reprintCount = 0;
      let originalPrintTime: string | undefined;
      if (isReprint) {
        const matchingSuccessLogs = logs.filter(
          (l) => l.orderId === order.id && l.printerId === printerConfig.id && l.status === "Success"
        );
        reprintCount = matchingSuccessLogs.length;
        if (matchingSuccessLogs.length > 0) {
          originalPrintTime = matchingSuccessLogs[matchingSuccessLogs.length - 1].printTime;
        }
      }

      // Create Print Job
      const newJob: PrintJob = {
        id: `job-${Date.now()}-${role}-${Math.floor(Math.random() * 1000)}`,
        orderId: order.id,
        type: jobType,
        role: role,
        printerName: printerConfig.name,
        items: finalItemsToPrint,
        status: printerConfig.autoPrint ? "Pending" : "Failed", // Failed represents "manual click needed" if auto-print is disabled
        errorMessage: printerConfig.autoPrint ? undefined : "Auto-print is disabled for this printer.",
        createdAt: new Date().toISOString(),
        retryCount: 0,
        isReprint,
        reprintCount,
        originalPrintTime,
      };

      queue.push(newJob);
    }

    this.saveQueue(queue);

    // Prompt processor to check and print jobs immediately
    this.processQueue();
  }

  /**
   * Spools a customer bill for the Billing Counter Printer.
   */
  public static async spoolBill(order: Order, isReprint: boolean = false) {
    const configs = this.getPrinterConfigs();
    const queue = this.getQueue();
    const logs = this.getLogs();

    const printerConfig = configs.find((c) => c.role === "bill");
    if (!printerConfig) return;

    // Count reprints
    let reprintCount = 0;
    let originalPrintTime: string | undefined;
    if (isReprint) {
      const matchingSuccessLogs = logs.filter(
        (l) => l.orderId === order.id && l.printerId === printerConfig.id && l.status === "Success"
      );
      reprintCount = matchingSuccessLogs.length;
      if (matchingSuccessLogs.length > 0) {
        originalPrintTime = matchingSuccessLogs[matchingSuccessLogs.length - 1].printTime;
      }
    }

    const newJob: PrintJob = {
      id: `job-${Date.now()}-bill-${Math.floor(Math.random() * 1000)}`,
      orderId: order.id,
      type: "Bill",
      role: "bill",
      printerName: printerConfig.name,
      items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, customization: i.customization })),
      status: printerConfig.autoPrint ? "Pending" : "Failed",
      errorMessage: printerConfig.autoPrint ? undefined : "Auto-print is disabled for this printer.",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      isReprint,
      reprintCount,
      originalPrintTime,
    };

    queue.push(newJob);
    this.saveQueue(queue);

    this.processQueue();
  }

  private static isProcessing = false;

  /**
   * Background print queue processor.
   * Sequentially prints pending jobs, handles retries, and records logs.
   */
  public static async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      let queue = this.getQueue();
      const configs = this.getPrinterConfigs();

      // Find first job that is Pending or Retrying
      let activeJobIdx = queue.findIndex((j) => j.status === "Pending" || j.status === "Retrying");
      
      while (activeJobIdx !== -1) {
        const job = queue[activeJobIdx];
        const printerConfig = configs.find((c) => c.role === job.role || c.name === job.printerName);

        // Update status to Printing
        job.status = "Printing";
        this.saveQueue(queue);

        // Fetch corresponding order and settings
        const allOrders = await LocalDB.fetchOrders();
        const order = allOrders.find((o) => o.id === job.orderId);
        const settings = LocalDB.getSettings();

        if (!order) {
          job.status = "Failed";
          job.errorMessage = "Order record not found.";
          this.saveQueue(queue);
          activeJobIdx = queue.findIndex((j) => j.status === "Pending" || j.status === "Retrying");
          continue;
        }

        // Simulate printer connection and offline error state
        const isPrinterOffline = printerConfig?.status === "offline";

        let success = false;
        let errMsg = "";

        if (isPrinterOffline) {
          success = false;
          errMsg = "Printer is offline. Paper out or cover open.";
        } else {
          // Trigger the printing!
          try {
            // Setup details
            const paperWidth = printerConfig?.paperWidth || "80mm";
            const copies = printerConfig?.copies || 1;
            const margin = printerConfig?.margin || 8;
            const density = printerConfig?.density || "normal";
            const fontScaling = printerConfig?.paperWidth === "58mm" ? 90 : 100;

            const printOptions = {
              paperWidth,
              multipleCopies: copies,
              marginControl: margin,
              characterDensity: density === "light" ? "compact" : density === "dark" ? "spacious" : "normal",
              fontScaling,
              printCount: (job.reprintCount || 0) + 1,
              showWatermark: job.isReprint ? "duplicate" : "none",
            };

            // Sound chime for printer engine
            try {
              const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const osc = audioCtx.createOscillator();
              const gain = audioCtx.createGain();
              osc.type = "sawtooth";
              osc.frequency.setValueAtTime(350, audioCtx.currentTime);
              gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.2);
              osc.connect(gain);
              gain.connect(audioCtx.destination);
              osc.start();
              osc.stop(audioCtx.currentTime + 1.2);
            } catch (_) {}

            // Format job items into order format for rendering
            const tempOrder = {
              ...order,
              items: job.items,
            };

            const pSettings = getWRPrinterSettings();

            if (job.type === "Bill") {
              await PhysicalThermalPrinter.printBill(tempOrder, settings, pSettings.paperWidth, "native");
            } else {
              const kotData = {
                id: order.kotNumber || `KOT-${order.id.replace("SR-", "")}`,
                orderId: order.id,
                tableNumber: order.tableNumber || "Takeaway",
                customerName: order.customerName,
                orderType: order.orderType,
                createdAt: order.createdAt,
                items: job.items,
                specialInstructions: order.items.map((i) => i.customization).filter(Boolean).join(", ") || undefined,
              };
              await PhysicalThermalPrinter.printKOT(kotData, pSettings.paperWidth, "native");
            }
            success = true;
          } catch (printErr: any) {
            success = false;
            errMsg = printErr.message || "Failed during physical stream transfer.";
          }
        }

        if (success) {
          job.status = "Printed";
          job.errorMessage = undefined;

          // Flag DB print status
          await LocalDB.apiUpdateOrderPrintStatus(order.id, job.type === "Bill" ? "bill" : "kot", "Printed");

          // Add to Print Logs
          this.addHistoryLog({
            orderId: job.orderId,
            printerId: printerConfig?.id || "unknown",
            printerName: job.printerName,
            printType: job.type,
            printedBy: "Automatic Spooler",
            status: "Success",
            reprints: job.reprintCount || 0,
            originalPrintTime: job.originalPrintTime,
            reprintTime: job.isReprint ? new Date().toISOString() : undefined,
          });

          // Add to Audit Logs
          await LocalDB.apiAddAuditLog(
            `${job.type} Printed`,
            `Auto-spooled ${job.type} ticket successfully sent to printer: ${job.printerName} for Order #${order.id}.`
          );
        } else {
          job.retryCount += 1;
          if (job.retryCount >= 3) {
            job.status = "Failed";
            job.errorMessage = errMsg;

            // Flag DB print status
            await LocalDB.apiUpdateOrderPrintStatus(order.id, job.type === "Bill" ? "bill" : "kot", "Failed");

            this.addHistoryLog({
              orderId: job.orderId,
              printerId: printerConfig?.id || "unknown",
              printerName: job.printerName,
              printType: job.type,
              printedBy: "Automatic Spooler",
              status: "Failed",
              errorMessage: errMsg,
              reprints: job.reprintCount || 0,
            });

            await LocalDB.apiAddAuditLog(
              `${job.type} Print Failed`,
              `Failed spooling ${job.type} to printer: ${job.printerName} for Order #${order.id}. Reason: ${errMsg}`
            );
          } else {
            job.status = "Retrying";
            job.errorMessage = `${errMsg} (Retry ${job.retryCount}/3)`;
            
            // Wait 3 seconds before retrying
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        }

        this.saveQueue(queue);

        // Find next job
        queue = this.getQueue();
        activeJobIdx = queue.findIndex((j) => j.status === "Pending" || j.status === "Retrying");
      }
    } catch (err) {
      console.error("Queue processor exception:", err);
    } finally {
      this.isProcessing = false;
    }
  }

  private static isListenerInitialized = false;

  public static initAutoPrintListeners() {
    if (typeof window === "undefined" || this.isListenerInitialized) return;
    this.isListenerInitialized = true;

    console.log("[PrintQueueManager] Initializing background auto-print event listeners...");

    // 1. Listen to "new_order" event (when orders are created)
    window.addEventListener("new_order", (e: any) => {
      const order = e.detail as Order;
      if (!order) return;
      console.log("[PrintQueueManager Listener] New order placed:", order.id);

      // If order originated from POS counter, printing is executed directly on button press
      if (order.source === "POS") {
        console.log("[PrintQueueManager Listener] POS order direct print handled at counter. Skipping background auto-spooling.");
        return;
      }

      const autoPrintEnabled = localStorage.getItem("sr_auto_print_enabled") !== "false";
      if (!autoPrintEnabled) {
        console.log("[PrintQueueManager Listener] Auto-printing is disabled. Skipping automatic spooling.");
        return;
      }

      // KOT prints instantly in background
      this.spoolKOT(order);

      // If already Paid, spool the customer bill immediately too
      if (order.paymentStatus === "Paid") {
        console.log("[PrintQueueManager Listener] Pre-paid customer order, spooling Bill instantly");
        this.spoolBill(order);
      }
    });

    // 2. Listen to "order_updated_auto_print" event
    window.addEventListener("order_updated_auto_print", (e: any) => {
      const detail = e.detail;
      if (!detail || !detail.order) return;
      const { order, previousStatus, previousPaymentStatus } = detail;

      console.log(`[PrintQueueManager Listener] Order updated: ${order.id}. Status: ${previousStatus} -> ${order.orderStatus}, Payment: ${previousPaymentStatus} -> ${order.paymentStatus}`);

      const autoPrintEnabled = localStorage.getItem("sr_auto_print_enabled") !== "false";
      if (!autoPrintEnabled) {
        console.log("[PrintQueueManager Listener] Auto-printing is disabled. Skipping automatic spooling on update.");
        return;
      }

      // If transitioned to Paid, automatically print bill!
      if (order.paymentStatus === "Paid" && previousPaymentStatus !== "Paid") {
        console.log("[PrintQueueManager Listener] Order payment completed. Spooling bill.");
        this.spoolBill(order);
      }

      // If status finalized (e.g. Ready, Served, Delivered) and bill was never printed, trigger it
      if ((order.orderStatus === "Delivered" || order.orderStatus === "Served" || order.orderStatus === "Ready") && previousStatus !== order.orderStatus) {
        const queue = this.getQueue();
        const logs = this.getLogs();
        const billPrinted = queue.some(j => j.orderId === order.id && j.type === "Bill" && j.status === "Printed") ||
                            logs.some(l => l.orderId === order.id && l.printType === "Bill" && l.status === "Success");

        if (!billPrinted) {
          console.log("[PrintQueueManager Listener] Order finalized without bill print. Spooling bill now.");
          this.spoolBill(order);
        }
      }
    });

    // 3. Start a periodic watchdog every 10 seconds to process the queue in case of retries
    setInterval(() => {
      this.processQueue();
    }, 10000);
  }

  private static addHistoryLog(log: Omit<PrintHistoryLog, "id" | "printTime">) {
    const logs = this.getLogs();
    const newLog: PrintHistoryLog = {
      ...log,
      id: `prt-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      printTime: new Date().toISOString(),
    };
    logs.unshift(newLog);
    this.saveLogs(logs);
  }
}
