import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  getPrinters: () => ipcRenderer.invoke("get-printers"),
  printRawEscPos: (options: { printerName: string; hexData: string; copies?: number }) =>
    ipcRenderer.invoke("print-raw-escpos", options),
});
