export interface ElectronPrinterInfo {
  name: string;
  isDefault: boolean;
  description?: string;
}

export interface ElectronPrintOptions {
  printerName: string;
  hexData: string;
  copies?: number;
}

export interface ElectronPrintResult {
  success: boolean;
  printerUsed: string;
  error?: string;
}

export interface IElectronAPI {
  isElectron: boolean;
  getPrinters: () => Promise<ElectronPrinterInfo[]>;
  printRawEscPos: (options: ElectronPrintOptions) => Promise<ElectronPrintResult>;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}
