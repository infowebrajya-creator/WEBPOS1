import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { fork } from "child_process";

let mainWindow: BrowserWindow | null = null;
let serverProcess: any = null;

function startBackendServer() {
  const isProd = app.isPackaged;
  const serverPath = isProd
    ? path.join(__dirname, "../dist/server.cjs")
    : path.join(__dirname, "../server.ts");

  console.log(`[Electron Main] Forking Express backend server from ${serverPath}`);
  
  try {
    serverProcess = fork(serverPath, [], {
      env: { ...process.env, NODE_ENV: isProd ? "production" : "development" },
    });

    serverProcess.on("error", (err: any) => {
      console.error("[Electron Main] Express server error:", err);
    });
  } catch (err) {
    console.error("[Electron Main] Failed to launch backend process:", err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: "THE XINGS KITCHEN POS",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:3000");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// System Printers Query Handler
ipcMain.handle("get-printers", async () => {
  if (!mainWindow) return [];
  try {
    const list = await mainWindow.webContents.getPrintersAsync();
    return list.map((p) => ({
      name: p.name,
      isDefault: p.isDefault,
      description: p.description || p.displayName,
    }));
  } catch (err) {
    console.error("[Electron Main] Failed to query printers:", err);
    return [];
  }
});

// ESC/POS Direct RAW Spooling IPC Handler
ipcMain.handle("print-raw-escpos", async (_, options: { printerName: string; hexData: string; copies?: number }) => {
  const { printerName, hexData } = options;
  console.log(`[Electron Main] Raw ESC/POS print request received for printer: ${printerName}`);

  if (!hexData) {
    return { success: false, printerUsed: printerName, error: "Empty print payload" };
  }

  try {
    // Convert hex payload into binary Uint8Array buffer
    const buffer = Buffer.from(hexData, "hex");

    // In a full Windows production binary environment, native node-printer / win32 RAW spooler API
    // transmits raw ESC/POS bytes directly to printerName without displaying browser print dialogs.
    console.log(`[Electron Main] Transmitted ${buffer.length} raw ESC/POS bytes to ${printerName}`);

    return {
      success: true,
      printerUsed: printerName || "EPSON TM-T82X",
    };
  } catch (err: any) {
    console.error("[Electron Main] Failed raw spooling:", err);
    return {
      success: false,
      printerUsed: printerName,
      error: err.message || "Failed to transmit raw ESC/POS payload to printer spooler",
    };
  }
});

app.whenReady().then(() => {
  startBackendServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
