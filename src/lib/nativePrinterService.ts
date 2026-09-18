import { JSPrintManagerService } from "./jsprintmanagerService";
import { ElectronPrinterInfo } from "../types/electron";

export class NativePrinterOfflineError extends Error {
  constructor(message = "JSPrintManager desktop printing service is unavailable or target printer is disconnected.") {
    super(message);
    this.name = "NativePrinterOfflineError";
  }
}

export class NativePrinterService {
  /**
   * Check if JSPrintManager service is available in browser
   */
  public static isAvailable(): boolean {
    return typeof window !== "undefined";
  }

  /**
   * Fetch installed system thermal printers directly from JSPrintManager
   */
  public static async getPrinters(): Promise<ElectronPrinterInfo[]> {
    try {
      const printerNames = await JSPrintManagerService.getPrinters();
      return printerNames.map((name) => ({
        name,
        displayName: name,
        description: "Installed Printer",
        status: 0,
        isDefault: false,
      }));
    } catch (err) {
      console.error("[NativePrinterService] Failed to query system printers via JSPrintManager:", err);
      return [];
    }
  }

  /**
   * Print raw ESC/POS hex payload directly to thermal printer via JSPrintManager
   */
  public static async printRawHex(
    printerName: string = "EPSON TM-T82X Receipt",
    hexString: string,
    copies: number = 1
  ): Promise<{ success: boolean; printerUsed: string }> {
    return JSPrintManagerService.printRawHex(hexString, printerName, copies, "POS-Order");
  }

  /**
   * Print Combined Customer Bill + ESC/POS Cut + Kitchen Order Ticket (KOT) as one JSPrintManager print job
   * Canonical Sequence: CUSTOMER BILL -> PAPER CUT -> KOT -> PAPER CUT
   */
  public static async printCombinedBillAndKOT(order: any, settings: any): Promise<boolean> {
    return JSPrintManagerService.printCombinedBillAndKOT(order, settings);
  }

  /**
   * Print Customer Bill only via JSPrintManager
   */
  public static async printBill(order: any, settings: any): Promise<boolean> {
    return JSPrintManagerService.printBill(order, settings);
  }

  /**
   * Print Kitchen Order Ticket (KOT) only via JSPrintManager
   */
  public static async printKOT(kotData: any): Promise<boolean> {
    return JSPrintManagerService.printKOT(kotData);
  }
}
