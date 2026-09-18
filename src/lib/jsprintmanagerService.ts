import * as JSPM from "jsprintmanager";
import { 
  getWRPrinterSettings, 
  saveWRPrinterSettings,
  buildBillESCPOS, 
  buildKOTESCPOS, 
  PhysicalThermalPrinter 
} from "./printerService";
import { PrinterManager, DiscoveredPrinter } from "./printerManager";

/**
 * Converts ESC/POS hexadecimal command string to a Uint8Array byte buffer
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/[^0-9A-Fa-f]/g, "");
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export type JSPMStatusCodeString = 
  | "OPEN" 
  | "CLOSED" 
  | "BLOCKED" 
  | "WAITING_APPROVAL" 
  | "NOT_INSTALLED" 
  | "CERTIFICATE_ERROR" 
  | "CONNECTION_ERROR";

export interface JSPMStatusInfo {
  code: number;
  label: string;
  statusString: JSPMStatusCodeString;
  isConnected: boolean;
  isBlocked: boolean;
  hint?: string;
  detectedPrinters?: string[];
  activePrinter?: string;
}

export interface JSPMDiagnosticState {
  status: JSPMStatusCodeString;
  statusCode: number;
  statusLabel: string;
  isConnected: boolean;
  websitePackageVersion: string;
  desktopClientVersion: string | null;
  secureWebSocket: boolean;
  connectionHost: string;
  connectionPort: number | null;
  activeWorkerPort: number | null;
  detectedPrinters: string[];
  configuredPrinter: string;
}

/**
 * Official JSPrintManager Service for THE XINGS KITCHEN POS
 * Communicates directly with the JSPrintManager client on the restaurant laptop
 * to output raw ESC/POS thermal receipt commands without browser print dialogs.
 */
export class JSPrintManagerService {
  private static statusListeners: Array<(status: JSPMStatusInfo) => void> = [];
  private static initPromise: Promise<boolean> | null = null;
  private static heartbeatTimer: any = null;
  private static lastLoggedStatus: number = -1;
  private static cachedPrinters: string[] = [];
  private static cachedClientVersion: string | null = null;
  private static lastRecordedStatus: number | null = null;
  private static lastCloseReason: { code: number; detail: string } | null = null;

  /**
   * Translates numeric status to standard string name
   */
  public static getStatusName(status: number): string {
    switch (status) {
      case JSPM.WSStatus.Open:
        return "Open";
      case JSPM.WSStatus.Closed:
        return "Closed";
      case JSPM.WSStatus.Blocked:
        return "Blocked";
      case JSPM.WSStatus.WaitingForUserResponse:
        return "WaitingForUserResponse";
      case JSPM.WSStatus.NotInstalled:
        return "NotInstalled";
      case JSPM.WSStatus.CertificateError:
        return "CertificateError";
      case JSPM.WSStatus.ConnectionError:
        return "ConnectionError";
      default:
        return `Unknown(${status})`;
    }
  }

  /**
   * Check if JSPrintManager WebSocket is currently open and ready
   * STRICT SINGLE SOURCE OF TRUTH: JSPM.JSPrintManager.websocket_status === JSPM.WSStatus.Open
   */
  public static isConnected(): boolean {
    if (typeof window === "undefined") return false;
    try {
      return JSPM.JSPrintManager.websocket_status === JSPM.WSStatus.Open;
    } catch {
      return false;
    }
  }

  /**
   * Intelligently resolves the target thermal printer against installed system printers.
   * Handles driver variations like "EPSON TM-T82X" vs "EPSON TM-T82X Receipt",
   * strips punctuation/whitespace, filters out virtual printers (OneNote, PDF, Fax),
   * and auto-detects Epson/Receipt thermal printers seamlessly.
   */
  public static resolveSystemPrinter(
    requestedPrinter: string | undefined,
    systemPrinters: string[]
  ): { resolvedName: string; autoUpdated: boolean; matchType: string } | null {
    if (!systemPrinters || systemPrinters.length === 0) {
      return requestedPrinter ? { resolvedName: requestedPrinter, autoUpdated: false, matchType: "raw_fallback" } : null;
    }

    const req = (requestedPrinter || "").trim();
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const reqClean = clean(req);

    // 1. Exact case-insensitive match
    if (req) {
      const exact = systemPrinters.find(p => p.toLowerCase() === req.toLowerCase());
      if (exact) {
        return { resolvedName: exact, autoUpdated: exact !== req, matchType: "exact" };
      }
    }

    // 2. Normalized alphanumeric containment (e.g. "EPSON TM-T82X" vs "EPSON TM-T82X Receipt")
    // "epsontmt82x" is contained in "epsontmt82xreceipt"
    if (reqClean) {
      const normMatch = systemPrinters.find(p => {
        const pClean = clean(p);
        return pClean.includes(reqClean) || reqClean.includes(pClean);
      });
      if (normMatch) {
        return { resolvedName: normMatch, autoUpdated: true, matchType: "normalized_contains" };
      }
    }

    // 3. Substring case-insensitive match
    if (req) {
      const subMatch = systemPrinters.find(p => {
        const pLower = p.toLowerCase();
        const rLower = req.toLowerCase();
        return pLower.includes(rLower) || rLower.includes(pLower);
      });
      if (subMatch) {
        return { resolvedName: subMatch, autoUpdated: true, matchType: "substring" };
      }
    }

    // Helper: Identify virtual or non-thermal system printers
    const isVirtualPrinter = (name: string) => {
      const n = name.toLowerCase();
      return (
        n.includes("onenote") ||
        n.includes("pdf") ||
        n.includes("xps") ||
        n.includes("fax") ||
        n.includes("send to") ||
        n.includes("document writer")
      );
    };

    const physicalPrinters = systemPrinters.filter(p => !isVirtualPrinter(p));

    // 4. Epson TM-T82 / TM-T82X series match (official Windows receipt driver name: "EPSON TM-T82X Receipt")
    const epsonT82 = physicalPrinters.find(p => {
      const c = clean(p);
      return (c.includes("epson") && c.includes("t82")) || c.includes("tmt82") || c.includes("t82x");
    });
    if (epsonT82) {
      return { resolvedName: epsonT82, autoUpdated: true, matchType: "epson_t82_detected" };
    }

    // 5. Any Epson thermal printer
    const epsonAny = physicalPrinters.find(p => p.toLowerCase().includes("epson"));
    if (epsonAny) {
      return { resolvedName: epsonAny, autoUpdated: true, matchType: "epson_detected" };
    }

    // 6. Any printer explicitly named Receipt, Thermal, POS, KOT, Bill
    const receiptPrinter = physicalPrinters.find(p => {
      const n = p.toLowerCase();
      return n.includes("receipt") || n.includes("thermal") || n.includes("pos") || n.includes("bill") || n.includes("kot");
    });
    if (receiptPrinter) {
      return { resolvedName: receiptPrinter, autoUpdated: true, matchType: "receipt_detected" };
    }

    // 7. First physical non-virtual printer fallback
    if (physicalPrinters.length > 0) {
      return { resolvedName: physicalPrinters[0], autoUpdated: true, matchType: "physical_first" };
    }

    // 8. Fallback to requested or first detected
    return { resolvedName: req || systemPrinters[0], autoUpdated: false, matchType: "fallback" };
  }

  /**
   * Map JSPrintManager numeric WSStatus to human-readable information
   */
  public static getStatus(): JSPMStatusInfo {
    if (typeof window === "undefined") {
      return { 
        code: 1, 
        label: "JSPrintManager Disconnected", 
        statusString: "CLOSED", 
        isConnected: false, 
        isBlocked: false,
        hint: "Browser environment only"
      };
    }

    try {
      const liveStatus = JSPM.JSPrintManager.websocket_status;
      const isConn = liveStatus === JSPM.WSStatus.Open;

      // If liveStatus is Closed (1) because JSPM nullified WS on error, use captured lastRecordedStatus
      const effectiveCode = isConn 
        ? JSPM.WSStatus.Open 
        : (this.lastRecordedStatus !== null && this.lastRecordedStatus !== JSPM.WSStatus.Open ? this.lastRecordedStatus : liveStatus);

      const isBlocked = effectiveCode === JSPM.WSStatus.Blocked;

      let label = "JSPrintManager Disconnected";
      let statusString: JSPMStatusCodeString = "CLOSED";
      let hint = "";

      switch (effectiveCode) {
        case JSPM.WSStatus.Open:
          label = "JSPrintManager Connected";
          statusString = "OPEN";
          hint = "Connected and ready to print";
          break;
        case JSPM.WSStatus.Closed:
          label = "JSPrintManager Disconnected";
          statusString = "CLOSED";
          hint = "JSPrintManager is not running or disconnected.";
          break;
        case JSPM.WSStatus.Blocked:
          label = "JSPrintManager Blocked";
          statusString = "BLOCKED";
          hint = "web-pos-1.vercel.app is blocked in JSPrintManager Sites Manager.";
          break;
        case JSPM.WSStatus.WaitingForUserResponse:
          label = "Approval Required";
          statusString = "WAITING_APPROVAL";
          hint = "Waiting for user response in JSPrintManager client.";
          break;
        case JSPM.WSStatus.NotInstalled:
          label = "JSPrintManager Not Running";
          statusString = "NOT_INSTALLED";
          hint = "JSPrintManager is not running or disconnected.";
          break;
        case JSPM.WSStatus.CertificateError:
          label = "Certificate Trust Required";
          statusString = "CERTIFICATE_ERROR";
          hint = "JSPrintManager certificate requires trust on this computer.";
          break;
        case JSPM.WSStatus.ConnectionError:
          label = "Connection Error";
          statusString = "CONNECTION_ERROR";
          hint = "JSPrintManager is not running or disconnected.";
          break;
        default:
          label = isConn ? "JSPrintManager Connected" : "JSPrintManager Disconnected";
          statusString = isConn ? "OPEN" : "CLOSED";
          break;
      }

      const pSettings = getWRPrinterSettings();
      let activePrinter = pSettings.printerName;
      if (this.cachedPrinters.length > 0) {
        const resolved = this.resolveSystemPrinter(activePrinter, this.cachedPrinters);
        if (resolved?.resolvedName) {
          activePrinter = resolved.resolvedName;
        }
      }

      return { 
        code: typeof effectiveCode === "number" ? effectiveCode : 1, 
        label, 
        statusString,
        isConnected: isConn, 
        isBlocked,
        hint,
        detectedPrinters: this.cachedPrinters,
        activePrinter: activePrinter || (this.cachedPrinters[0] || "")
      };
    } catch {
      return { 
        code: 1, 
        label: "JSPrintManager Disconnected", 
        statusString: "CLOSED", 
        isConnected: false, 
        isBlocked: false,
        hint: "Error inspecting JSPrintManager status"
      };
    }
  }

  /**
   * Diagnostic state snapshot for debugging & error reporting
   */
  public static getDiagnosticState(): JSPMDiagnosticState {
    const status = this.getStatus();
    const pSettings = getWRPrinterSettings();
    const isHttps = typeof window !== "undefined" ? window.location.protocol === "https:" : true;
    const ws = JSPM.JSPrintManager.WS;

    return {
      status: status.statusString,
      statusCode: status.code,
      statusLabel: status.label,
      isConnected: status.isConnected,
      websitePackageVersion: "9.0.2",
      desktopClientVersion: this.cachedClientVersion,
      secureWebSocket: isHttps,
      connectionHost: ws?.address || "localhost",
      connectionPort: ws?.port || 29443,
      activeWorkerPort: ws?.workerPort || null,
      detectedPrinters: this.cachedPrinters,
      configuredPrinter: pSettings.printerName || "Default Thermal Printer",
    };
  }

  /**
   * Connects to the local JSPrintManager desktop client service using official API.
   * Singleton pattern: exactly one shared connection attempt.
   */
  public static async init(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (this.isConnected()) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const isHttps = window.location.protocol === "https:";
        console.log("[JSPrintManager] package/version:", "9.0.2");
        console.log(`[JSPrintManager] starting connection (host: localhost, port: 29443, secure: ${isHttps})`);
        console.log("[JSPrintManager] page protocol:", window.location.protocol);
        console.log("[JSPrintManager] browser protocol:", isHttps ? "wss://" : "ws://");
        console.log(`[JSPrintManager] websocket status: ${JSPM.JSPrintManager.websocket_status} (${this.getStatusName(JSPM.JSPrintManager.websocket_status)})`);

        JSPM.JSPrintManager.auto_reconnect = true;

        // Start official JSPrintManager connection
        // On HTTPS (https://web-pos-1.vercel.app), secure WebSocket (wss://localhost:29443) is required
        const startPromise = JSPM.JSPrintManager.start(isHttps);

        // Immediately capture WS object and attach lifecycle listeners
        const ws = JSPM.JSPrintManager.WS;
        if (ws) {
          ws.onStatusChanged = () => {
            this.handleStatusUpdate();
          };
          ws.onOpen = () => {
            this.lastRecordedStatus = JSPM.WSStatus.Open;
            this.handleStatusUpdate();
          };
          ws.onConnectionFailed = (failedStatus: any, wasConnected: any) => {
            this.lastRecordedStatus = failedStatus;
            console.warn(`[JSPrintManager] onConnectionFailed - status: ${failedStatus} (${this.getStatusName(failedStatus)}), wasConnected: ${wasConnected}`);
            this.handleStatusUpdate();
          };
          ws.onClose = (e: any) => {
            if (ws.closeReason) {
              this.lastCloseReason = ws.closeReason;
            }
            if (isHttps && e?.code === 1006) {
              this.lastRecordedStatus = JSPM.WSStatus.CertificateError;
            } else if (e?.code === 403) {
              this.lastRecordedStatus = JSPM.WSStatus.Blocked;
            }
            console.warn(`[JSPrintManager] onClose - code: ${e?.code}, reason: ${e?.reason || "none"}`);
            this.handleStatusUpdate();
          };
          (ws as any).onError = (e: any) => {
            console.warn("[JSPrintManager] onError:", e);
          };
        }

        try {
          await startPromise;
        } catch (startErr: any) {
          console.warn("[JSPrintManager] start() failed:", startErr);
          if (this.lastRecordedStatus === null) {
            this.lastRecordedStatus = isHttps ? JSPM.WSStatus.CertificateError : JSPM.WSStatus.NotInstalled;
          }
        }

        // Start background status heartbeat to keep UI updated
        this.startHeartbeat();

        // Trigger status update
        this.handleStatusUpdate();

        return this.isConnected();
      } catch (err: any) {
        console.warn("[JSPrintManager] Init error:", err);
        this.handleStatusUpdate();
        return false;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Internal status change handler: logs states & notifies UI listeners
   */
  private static handleStatusUpdate(): void {
    if (typeof window === "undefined") return;

    try {
      const currentStatus = JSPM.JSPrintManager.websocket_status;
      
      if (currentStatus !== this.lastLoggedStatus) {
        this.lastLoggedStatus = currentStatus;
        const statusName = this.getStatusName(currentStatus);
        console.log(`[JSPrintManager] websocket status: ${currentStatus} (${statusName})`);

        if (currentStatus === JSPM.WSStatus.Open) {
          this.lastRecordedStatus = JSPM.WSStatus.Open;
          console.log("[JSPrintManager] printer discovery: querying system printers...");
          this.refreshPrintersSilently();
        } else if (currentStatus === JSPM.WSStatus.Blocked) {
          console.warn("[JSPrintManager] Website is BLOCKED (code 2) by JSPrintManager desktop client. Please ensure 'web-pos-1.vercel.app' is added to Authorized Sites in JSPrintManager -> Settings -> Sites Manager.");
        } else if (currentStatus === JSPM.WSStatus.CertificateError || this.lastRecordedStatus === JSPM.WSStatus.CertificateError) {
          console.warn("[JSPrintManager] SSL Certificate Notice (code 5) connecting to wss://localhost:29443.");
          console.info("[JSPrintManager] Action required: 1. Open new tab to https://localhost:29443 2. Click 'Advanced' -> 'Proceed to localhost (unsafe)' 3. Return to POS and retry print.");
        }

        this.notifyListeners(this.getStatus());
      }
    } catch (_) {}
  }

  /**
   * Starts a background polling heartbeat to detect desktop client changes
   */
  private static startHeartbeat(): void {
    if (this.heartbeatTimer || typeof window === "undefined") return;

    this.heartbeatTimer = setInterval(() => {
      try {
        const current = JSPM.JSPrintManager.websocket_status;
        if (current !== this.lastLoggedStatus) {
          this.handleStatusUpdate();
        }
      } catch (_) {}
    }, 2000);
  }

  /**
   * Silently cache installed printers once WebSocket is OPEN
   */
  private static async refreshPrintersSilently(): Promise<void> {
    try {
      if (!this.isConnected()) return;
      const printers = await JSPM.JSPrintManager.getPrinters();
      if (Array.isArray(printers)) {
        this.cachedPrinters = printers;
        console.log("[JSPrintManager] available printers:", this.cachedPrinters);
        const pSettings = getWRPrinterSettings();
        const resolved = this.resolveSystemPrinter(pSettings.printerName, this.cachedPrinters);
        if (resolved && resolved.autoUpdated && resolved.resolvedName && resolved.resolvedName !== pSettings.printerName) {
          pSettings.printerName = resolved.resolvedName;
          saveWRPrinterSettings(pSettings);
          console.log(`[JSPrintManager] Auto-selected detected thermal printer '${resolved.resolvedName}' (saved as default)`);
        }
        console.log("[JSPrintManager] selected printer:", pSettings.printerName || (this.cachedPrinters[0] || "Default Printer"));
        this.notifyListeners(this.getStatus());
      }
    } catch (err) {
      console.warn("[JSPrintManager] Background printer discovery error:", err);
    }
  }

  /**
   * Subscribe to connection status changes
   */
  public static onStatusChange(callback: (status: JSPMStatusInfo) => void): () => void {
    this.statusListeners.push(callback);
    // Emit initial status immediately
    try {
      callback(this.getStatus());
    } catch (_) {}

    return () => {
      this.statusListeners = this.statusListeners.filter(cb => cb !== callback);
    };
  }

  private static notifyListeners(status: JSPMStatusInfo): void {
    this.statusListeners.forEach(cb => {
      try { cb(status); } catch (_) {}
    });
  }

  /**
   * Fetch all installed Windows/system printers from JSPrintManager
   * Strictly called only when WebSocket is Open
   */
  public static async getPrinters(): Promise<string[]> {
    if (typeof window === "undefined") return [];
    try {
      if (!this.isConnected()) {
        await this.init();
      }
      if (!this.isConnected()) {
        return this.cachedPrinters;
      }
      const discovered = await PrinterManager.discoverPrinters(true);
      const printers = discovered.map(p => p.name);
      if (Array.isArray(printers) && printers.length > 0) {
        this.cachedPrinters = printers;
        return printers;
      }
      return this.cachedPrinters;
    } catch (err) {
      console.warn("[JSPrintManager] Could not fetch system printers:", err);
      return this.cachedPrinters;
    }
  }

  /**
   * Print raw ESC/POS byte array directly through JSPrintManager.
   * Performs strict connection pre-checks before constructing or dispatching print jobs.
   */
  public static async printRawBytes(
    bytes: Uint8Array,
    targetPrinter?: string,
    copies: number = 1,
    docName: string = "POS-Bill"
  ): Promise<{ success: boolean; printerUsed: string }> {
    if (typeof window === "undefined") {
      throw new Error("Printing is only supported in a browser environment.");
    }

    console.log(`[PrinterManager] Print job started: '${docName}'`);

    // Step 1: Strict connection check BEFORE dispatching
    if (!this.isConnected()) {
      // Attempt reconnection once if not yet connected
      await this.init();
    }

    if (!this.isConnected()) {
      const status = this.getStatus();
      const diag = this.getDiagnosticState();
      
      let errorMsg = "JSPrintManager is not running or disconnected.";
      if (status.statusString === "BLOCKED" || status.code === 2) {
        errorMsg = "web-pos-1.vercel.app is blocked in JSPrintManager Sites Manager.";
      } else if (status.statusString === "CERTIFICATE_ERROR" || status.code === 5) {
        errorMsg = "JSPrintManager certificate requires trust on this computer.";
      } else if (status.statusString === "WAITING_APPROVAL" || status.code === 3) {
        errorMsg = "Approval Required in JSPrintManager client.";
      }

      console.warn("[PrinterManager] Print job failed: service unavailable.", errorMsg, diag);
      const offlineErr: any = new Error(errorMsg);
      offlineErr.isOffline = true;
      throw offlineErr;
    }

    // Step 2: Printer Discovery / Configuration check using centralized PrinterManager
    const resolution = await PrinterManager.resolvePrinter("receipt", targetPrinter);

    if (resolution.status === "service_offline") {
      const offlineErr: any = new Error("JSPrintManager desktop service is not running on this computer.");
      offlineErr.isOffline = true;
      throw offlineErr;
    }

    const effectivePrinterName = resolution.resolvedPrinter;

    if (!effectivePrinterName) {
      const pConfig = PrinterManager.getConfiguredPrinter();
      const configuredName = targetPrinter || pConfig.receiptPrinterName;
      let detailedMsg = `Your configured printer '${configuredName}' is not currently available.`;
      if (resolution.candidatePrinters && resolution.candidatePrinters.length > 0) {
        detailedMsg += ` Detected printer: ${resolution.candidatePrinters.join(", ")}`;
      }

      console.warn(`[PrinterManager] Print job failed: ${detailedMsg}`);
      const err: any = new Error(detailedMsg);
      err.configuredPrinter = configuredName;
      err.candidatePrinters = resolution.candidatePrinters;
      err.suggestedPrinter = resolution.candidatePrinters[0];
      throw err;
    }

    console.log(`[PrinterManager] Selected printer: '${effectivePrinterName}' (match: ${resolution.matchType || "direct"})`);

    // Step 3: Create ClientPrintJob and send ESC/POS
    const cpj = new JSPM.ClientPrintJob();
    cpj.clientPrinter = new JSPM.InstalledPrinter(effectivePrinterName, true);
    cpj.binaryPrinterCommands = bytes;
    cpj.printerCommandsCopies = Math.max(1, copies);
    cpj.printerCommandsDocName = docName;

    try {
      await cpj.sendToClient();
      console.log(`[PrinterManager] Print job completed: '${docName}' on '${effectivePrinterName}'`);
      return { success: true, printerUsed: effectivePrinterName };
    } catch (sendErr: any) {
      console.warn(`[PrinterManager] Print job failed on '${effectivePrinterName}':`, sendErr);
      throw new Error(`Failed to spool '${docName}' to printer '${effectivePrinterName}': ${sendErr?.message || sendErr}`);
    }
  }

  /**
   * Print raw ESC/POS hex string directly through JSPrintManager
   */
  public static async printRawHex(
    hex: string,
    targetPrinter?: string,
    copies: number = 1,
    docName: string = "POS-Receipt"
  ): Promise<{ success: boolean; printerUsed: string }> {
    const bytes = hexToBytes(hex);
    return this.printRawBytes(bytes, targetPrinter, copies, docName);
  }

  /**
   * Print Combined Customer Bill + ESC/POS Cut + Kitchen Order Ticket (KOT) as one JSPrintManager print job.
   * Canonical Sequence: CUSTOMER BILL -> PAPER CUT -> KOT -> PAPER CUT
   */
  public static async printCombinedBillAndKOT(order: any, settings: any): Promise<boolean> {
    const pSettings = getWRPrinterSettings();
    const kotData = PhysicalThermalPrinter.buildKOTDataFromOrder(order);

    const billHex = buildBillESCPOS(order, settings, pSettings);
    const kotHex = buildKOTESCPOS(kotData, pSettings);
    const combinedHex = billHex + kotHex;

    const res = await this.printRawHex(
      combinedHex,
      pSettings.printerName,
      pSettings.copies,
      `Bill-KOT-${order.id || "Order"}`
    );
    return res.success;
  }

  /**
   * Print Customer Bill only via JSPrintManager
   */
  public static async printBill(order: any, settings: any): Promise<boolean> {
    const pSettings = getWRPrinterSettings();
    const billHex = buildBillESCPOS(order, settings, pSettings);
    const res = await this.printRawHex(
      billHex,
      pSettings.printerName,
      pSettings.copies,
      `Bill-${order.id || "Order"}`
    );
    return res.success;
  }

  /**
   * Print Kitchen Order Ticket (KOT) only via JSPrintManager
   */
  public static async printKOT(kotData: any): Promise<boolean> {
    const pSettings = getWRPrinterSettings();
    const kotHex = buildKOTESCPOS(kotData, pSettings);
    const res = await this.printRawHex(
      kotHex,
      pSettings.printerName,
      pSettings.copies,
      `KOT-${kotData.kotNumber || kotData.id || "Ticket"}`
    );
    return res.success;
  }
}

export default JSPrintManagerService;
