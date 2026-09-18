import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Printer, 
  RefreshCw, 
  Trash2, 
  Sliders, 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  Terminal,
  Activity,
  Wifi,
  WifiOff,
  Save
} from "lucide-react";
import { PrintQueueManager, PrintJob, PrintHistoryLog } from "../lib/printQueueManager";
import { 
  getWRPrinterSettings, 
  saveWRPrinterSettings, 
  WRPrinterSettings
} from "../lib/printerService";
import { JSPrintManagerService, JSPMStatusInfo } from "../lib/jsprintmanagerService";
import { ESCPOSBuilder } from "../lib/escposBuilder";

export default function PrintersConfigTab() {
  const [pSettings, setPSettings] = useState<WRPrinterSettings>(() => getWRPrinterSettings());
  const [jspmStatus, setJspmStatus] = useState<JSPMStatusInfo>(() => JSPrintManagerService.getStatus());
  
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([]);
  const [queue, setQueue] = useState<PrintJob[]>(() => PrintQueueManager.getQueue());
  const [logs, setLogs] = useState<PrintHistoryLog[]>(() => PrintQueueManager.getLogs());
  const [isProcessing, setIsProcessing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Query installed system printers via JSPrintManager
  const fetchPrinters = async () => {
    try {
      const printers = await JSPrintManagerService.getPrinters();
      if (printers && printers.length > 0) {
        setDetectedPrinters(printers);
      }
    } catch (err) {
      console.warn("[PrintersConfigTab] Failed to query printers:", err);
    }
  };

  useEffect(() => {
    JSPrintManagerService.init().then(() => {
      fetchPrinters();
    });

    const unsubscribe = JSPrintManagerService.onStatusChange((status) => {
      setJspmStatus(status);
      if (status.isConnected) {
        fetchPrinters();
      }
    });

    const handleUpdate = () => {
      setQueue(PrintQueueManager.getQueue());
      setLogs(PrintQueueManager.getLogs());
    };

    window.addEventListener("print_queue_updated", handleUpdate);
    const interval = setInterval(handleUpdate, 3000);

    return () => {
      unsubscribe();
      window.removeEventListener("print_queue_updated", handleUpdate);
      clearInterval(interval);
    };
  }, []);

  const handleSaveSettings = () => {
    saveWRPrinterSettings(pSettings);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    window.dispatchEvent(new CustomEvent("print_queue_updated"));
  };

  const handleTestPrint = async () => {
    try {
      const builder = new ESCPOSBuilder();
      
      builder.alignCenter().bold(true).doubleSize(true);
      builder.writeText("THE XINGS KITCHEN\n");
      
      builder.bold(false).doubleSize(false).doubleHeight(true);
      builder.writeText("PRINTER TEST PAGE\n");
      builder.doubleHeight(false);
      
      builder.divider(pSettings.paperWidth);
      
      builder.alignLeft();
      builder.writeText(`Date: ${new Date().toLocaleDateString()}\n`);
      builder.writeText(`Time: ${new Date().toLocaleTimeString()}\n`);
      builder.writeText(`Printer: ${pSettings.printerName || "Default Spooler"}\n`);
      builder.writeText(`Paper Width: ${pSettings.paperWidth}\n`);
      builder.writeText(`Print Mode: Direct RAW ESC/POS via JSPrintManager\n`);
      
      builder.divider(pSettings.paperWidth);
      
      builder.alignCenter().bold(true);
      builder.writeText("TEST PRINT SUCCESSFUL\n");
      builder.bold(false);
      
      const feedLines = pSettings.feedBeforeCutBill ?? 5;
      builder.feed(feedLines);
      
      if (pSettings.autoCut) {
        if (pSettings.cutType === "partial") {
          builder.cutPartial();
        } else {
          builder.cutFull();
        }
      }
      
      const hex = builder.compileHex();
      await JSPrintManagerService.printRawHex(hex, pSettings.printerName, pSettings.copies, "Test-Print");
      alert("🚀 Test print successfully sent to thermal printer via JSPrintManager!");
    } catch (err: any) {
      alert("❌ Test Print Failed: " + (err.message || "Unknown error"));
    }
  };

  const handleManualRetry = async () => {
    setIsProcessing(true);
    await PrintQueueManager.processQueue();
    setIsProcessing(false);
  };

  const handleClearQueue = () => {
    if (confirm("Are you sure you want to clear the print queue?")) {
      PrintQueueManager.saveQueue([]);
    }
  };

  const handlePurgeLogs = () => {
    if (confirm("Are you sure you want to clear the transaction log history?")) {
      PrintQueueManager.saveLogs([]);
    }
  };

  const isPrinterFound = detectedPrinters.length === 0 || detectedPrinters.includes(pSettings.printerName);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 w-full text-left">
      
      {/* Title Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-serif font-bold text-stone-900 uppercase tracking-wider text-left flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#C67C4E]" />
            THE XINGS KITCHEN — Desktop Thermal Printer Suite
          </h2>
          <p className="text-xs text-stone-500 font-sans">
            Direct native Windows ESC/POS thermal printing configuration for Epson TM series printers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualRetry}
            disabled={isProcessing}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? "animate-spin" : ""}`} />
            <span>{isProcessing ? "Processing..." : "Process Queue"}</span>
          </button>
          <button
            type="button"
            onClick={handleClearQueue}
            className="px-4 py-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 font-semibold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-stone-500" />
            <span>Purge Queue</span>
          </button>
        </div>
      </div>

      {/* Grid: Console Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Status & Settings Panel */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Connection Status Panel */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs">
            <h3 className="text-2xs font-mono font-bold text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-stone-400" />
              JSPRINTMANAGER PRINTING BRIDGE TELEMETRY
            </h3>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-stone-50 p-4 border border-stone-200 rounded-xl">
              <div className="flex items-center gap-3">
                <span className={`p-2.5 rounded-xl border ${
                  jspmStatus.isConnected 
                    ? "bg-green-50 border-green-200 text-green-600" 
                    : "bg-amber-50 border-amber-200 text-amber-600"
                }`}>
                  {jspmStatus.isConnected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                </span>
                <div>
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider leading-none block mb-1">
                    JSPrintManager Client Bridge
                  </span>
                  <span className="text-sm font-bold text-stone-850 block leading-tight">
                    {jspmStatus.isConnected ? "CONNECTED — Direct Thermal Spooling Active" : `Bridge Offline — ${jspmStatus.label}`}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchPrinters}
                  className="px-3 py-1.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 text-[9px] uppercase font-bold tracking-wider rounded-lg transition-all cursor-pointer"
                >
                  Scan Installed Printers
                </button>
                <span className="text-[9px] font-mono text-stone-400">
                  {detectedPrinters.length} detected
                </span>
              </div>
            </div>

            {!jspmStatus.isConnected && (
              <div className="mt-3 bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start justify-between gap-3">
                <div className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-800 font-sans leading-relaxed">
                    {jspmStatus.code === 5 || jspmStatus.statusString === "CERTIFICATE_ERROR" ? (
                      <div>
                        <strong className="block mb-0.5 font-bold text-amber-950">SSL Certificate Trust Required:</strong>
                        <span>Chrome requires accepting the local SSL certificate for JSPrintManager over HTTPS.</span>
                        <ol className="list-decimal list-inside mt-1.5 space-y-1 text-[10px] text-amber-900 font-medium">
                          <li>Open a new tab to: <a href="https://localhost:29443" target="_blank" rel="noreferrer" className="underline font-mono font-bold text-amber-950">https://localhost:29443</a></li>
                          <li>If Chrome shows "Your connection is not private", click <strong>Advanced</strong> &gt; <strong>Proceed to localhost (unsafe)</strong></li>
                          <li>Once the page loads, return here and click <strong>Reconnect</strong></li>
                        </ol>
                      </div>
                    ) : jspmStatus.isBlocked || jspmStatus.code === 2 ? (
                      <span>
                        <strong>Website Blocked:</strong> JSPrintManager is blocking requests from this site. Please open <strong>JSPrintManager &gt; Settings &gt; Sites Manager</strong> on your Windows laptop and ensure <code>web-pos-1.vercel.app</code> is in <em>Authorized Sites</em>.
                      </span>
                    ) : (
                      <span>
                        <strong>JSPrintManager Desktop Client Required:</strong> Please verify that the <strong>JSPrintManager</strong> application is running in the background on your restaurant laptop (system tray icon). Once running, the web POS will automatically link to your thermal printer.
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    JSPrintManagerService.init().then(() => fetchPrinters());
                  }}
                  className="shrink-0 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[9px] font-bold uppercase rounded-lg transition-colors cursor-pointer"
                >
                  Reconnect
                </button>
              </div>
            )}

            {jspmStatus.isConnected && !isPrinterFound && pSettings.printerName && (
              <div className="mt-3 bg-amber-50 border border-amber-200 p-3 rounded-xl flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 font-sans leading-relaxed">
                  <strong>Printer Mismatch Warning:</strong> Printer <strong>"{pSettings.printerName}"</strong> is not found in your installed system printers. Available: <em>{detectedPrinters.join(", ") || "None"}</em>.
                </p>
              </div>
            )}
          </div>

          {/* Master Printer Configuration panel */}
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-2xs space-y-6">
            <div className="border-b border-stone-150 pb-4">
              <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wide">
                Hardware Configuration & Directives
              </h3>
              <p className="text-[11px] text-stone-500 font-sans">
                Configure physical printer target, paper width, copies, and auto-cut rules.
              </p>
            </div>

            {/* Form fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <div className="space-y-1">
                <label className="text-[9px] font-mono font-extrabold text-stone-450 uppercase tracking-wider block">
                  SELECT WINDOWS PRINTER
                </label>
                {detectedPrinters.length > 0 ? (
                  <select
                    value={pSettings.printerName}
                    onChange={(e) => setPSettings({ ...pSettings, printerName: e.target.value })}
                    className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] font-sans text-stone-900 font-bold"
                  >
                    <option value="">-- Select Installed Windows Printer --</option>
                    {detectedPrinters.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={pSettings.printerName}
                    onChange={(e) => setPSettings({ ...pSettings, printerName: e.target.value })}
                    className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] font-sans text-stone-900 font-bold"
                    placeholder="Enter Windows printer name (e.g. EPSON TM-T82X)"
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono font-extrabold text-stone-450 uppercase tracking-wider block">
                  PAPER ROLL WIDTH
                </label>
                <select
                  value={pSettings.paperWidth}
                  onChange={(e) => setPSettings({ ...pSettings, paperWidth: e.target.value as any })}
                  className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] font-sans text-stone-900 font-bold"
                >
                  <option value="80mm">80mm Professional Thermal Roll (Epson Standard)</option>
                  <option value="58mm">58mm Compact Roll</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono font-extrabold text-stone-450 uppercase tracking-wider block">
                  PRINT COPIES
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={pSettings.copies}
                  onChange={(e) => setPSettings({ ...pSettings, copies: Math.max(1, Number(e.target.value)) })}
                  className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] font-sans text-stone-900 font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono font-extrabold text-stone-450 uppercase tracking-wider block">
                  AUTOMATIC PAPER CUT
                </label>
                <div className="flex items-center gap-3 bg-[#FAF6F0]/30 border border-stone-200 px-3 py-2 rounded-xl h-[42px]">
                  <input
                    type="checkbox"
                    id="autoCutCheckbox"
                    checked={pSettings.autoCut}
                    onChange={(e) => setPSettings({ ...pSettings, autoCut: e.target.checked })}
                    className="w-4 h-4 accent-[#C67C4E]"
                  />
                  <label htmlFor="autoCutCheckbox" className="text-xs text-stone-700 font-bold select-none">
                    Send ESC/POS Auto Cut Command
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono font-extrabold text-stone-450 uppercase tracking-wider block">
                  CUSTOMER BILL AUTO PRINT
                </label>
                <div className="flex items-center gap-3 bg-[#FAF6F0]/30 border border-stone-200 px-3 py-2 rounded-xl h-[42px]">
                  <input
                    type="checkbox"
                    id="autoPrintBillCheckbox"
                    checked={pSettings.autoPrintBill}
                    onChange={(e) => setPSettings({ ...pSettings, autoPrintBill: e.target.checked })}
                    className="w-4 h-4 accent-[#C67C4E]"
                  />
                  <label htmlFor="autoPrintBillCheckbox" className="text-xs text-stone-700 font-bold select-none">
                    Auto-Print Bill on Checkout
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono font-extrabold text-stone-450 uppercase tracking-wider block">
                  KITCHEN ORDER TICKET AUTO PRINT
                </label>
                <div className="flex items-center gap-3 bg-[#FAF6F0]/30 border border-stone-200 px-3 py-2 rounded-xl h-[42px]">
                  <input
                    type="checkbox"
                    id="autoPrintKOTCheckbox"
                    checked={pSettings.autoPrintKOT}
                    onChange={(e) => setPSettings({ ...pSettings, autoPrintKOT: e.target.checked })}
                    className="w-4 h-4 accent-[#C67C4E]"
                  />
                  <label htmlFor="autoPrintKOTCheckbox" className="text-xs text-stone-700 font-bold select-none">
                    Auto-Print KOT on Checkout
                  </label>
                </div>
              </div>

            </div>

            {/* Action panel footer */}
            <div className="pt-4 border-t border-stone-150 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-5 py-3 bg-[#C67C4E] hover:bg-[#aa663a] text-white font-bold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer shadow-2xs flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Printer Parameters</span>
                </button>
                
                <button
                  type="button"
                  onClick={handleTestPrint}
                  className="px-5 py-3 bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer shadow-2xs"
                >
                  🚀 Direct Test Print
                </button>
              </div>

              {saveSuccess && (
                <span className="text-[10px] font-mono font-bold text-green-600 bg-green-50 px-3 py-1 rounded-lg border border-green-200">
                  ✔ Printer parameters saved successfully!
                </span>
              )}
            </div>

          </div>

        </div>

        {/* Right column: Dispatch Telemetry */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-stone-900 text-stone-100 border border-stone-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-stone-800 pb-2.5">
              <Sliders className="w-4 h-4 text-[#e2935c]" />
              <h4 className="text-2xs font-mono font-bold uppercase tracking-wider text-stone-300">
                HARDWARE SPOOLER TELEMETRY
              </h4>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[9px] font-mono text-stone-500 uppercase block leading-none mb-1">
                  Active Spools
                </span>
                <span className="text-lg font-bold font-mono text-[#e2935c]">
                  {queue.filter(j => j.status === "Pending" || j.status === "Retrying").length}
                </span>
              </div>
              <div>
                <span className="text-[9px] font-mono text-stone-500 uppercase block leading-none mb-1">
                  Total Jobs
                </span>
                <span className="text-lg font-bold font-mono text-stone-100">
                  {queue.length}
                </span>
              </div>
              <div>
                <span className="text-[9px] font-mono text-stone-500 uppercase block leading-none mb-1">
                  Printed Slips
                </span>
                <span className="text-lg font-bold font-mono text-green-400">
                  {logs.filter(l => l.status === "Success").length}
                </span>
              </div>
              <div>
                <span className="text-[9px] font-mono text-stone-500 uppercase block leading-none mb-1">
                  Print Errors
                </span>
                <span className="text-lg font-bold font-mono text-red-400">
                  {logs.filter(l => l.status === "Failed").length}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
            <h4 className="text-2xs font-mono font-bold text-stone-400 uppercase tracking-widest">
              EPSON THERMAL PRINT RULES
            </h4>
            <ul className="text-[11px] text-stone-600 font-sans space-y-2 leading-relaxed">
              <li className="flex items-start gap-1.5">
                <span className="text-[#C67C4E] font-bold">•</span>
                <span><strong>Sequential Printing:</strong> Customer Bill prints first, followed by hardware cut, then KOT prints followed by hardware cut.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-[#C67C4E] font-bold">•</span>
                <span><strong>Silent Output:</strong> Windows RAW printer IPC writes directly to OS Spooler without showing browser dialogs.</span>
              </li>
            </ul>
          </div>
        </div>

      </div>

    </motion.div>
  );
}
