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
  Save,
  Check,
  Building2,
  Store,
  Sparkles,
  Zap,
  Info,
  Layers,
  FileCode
} from "lucide-react";
import { PrintQueueManager, PrintJob, PrintHistoryLog } from "../lib/printQueueManager";
import { JSPrintManagerService, JSPMStatusInfo } from "../lib/jsprintmanagerService";
import { 
  PrinterManager, 
  DiscoveredPrinter, 
  TenantPrinterConfig, 
  PrinterResolutionResult 
} from "../lib/printerManager";

export default function PrintersConfigTab() {
  const [config, setConfig] = useState<TenantPrinterConfig>(() => PrinterManager.getConfiguredPrinter());
  const [jspmStatus, setJspmStatus] = useState<JSPMStatusInfo>(() => JSPrintManagerService.getStatus());
  
  const [discoveredPrinters, setDiscoveredPrinters] = useState<DiscoveredPrinter[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [queue, setQueue] = useState<PrintJob[]>(() => PrintQueueManager.getQueue());
  const [logs, setLogs] = useState<PrintHistoryLog[]>(() => PrintQueueManager.getLogs());
  const [isProcessing, setIsProcessing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testPrintStatus, setTestPrintStatus] = useState<{ role: string; loading: boolean; message: string; success?: boolean } | null>(null);

  // Tenant context
  const tenantContext = PrinterManager.getActiveTenantContext();

  // Scan installed system printers via PrinterManager
  const scanPrinters = async (force: boolean = false) => {
    setIsScanning(true);
    try {
      const printers = await PrinterManager.discoverPrinters(force);
      setDiscoveredPrinters(printers);

      // Auto-validate and resolve current configuration
      const resolution = await PrinterManager.resolvePrinter("receipt", config.receiptPrinterName);
      if (resolution.status === "fuzzy_match" && resolution.resolvedPrinter && resolution.resolvedPrinter !== config.receiptPrinterName) {
        // Driver suffix auto-upgrade (e.g. "EPSON TM-T82X" -> "EPSON TM-T82X Receipt")
        const updated = PrinterManager.saveConfiguredPrinter({
          receiptPrinterName: resolution.resolvedPrinter
        });
        setConfig(updated);
        console.log(`[PrintersConfigTab] Auto-aligned printer configuration to '${resolution.resolvedPrinter}'`);
      }
    } catch (err) {
      console.warn("[PrintersConfigTab] Scan error:", err);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    // Initialize connection and scan printers
    JSPrintManagerService.init().then(() => {
      scanPrinters(true);
    });

    const unsubscribe = JSPrintManagerService.onStatusChange((status) => {
      setJspmStatus(status);
      if (status.isConnected) {
        scanPrinters(true);
      }
    });

    const handleConfigUpdate = (e: any) => {
      if (e.detail) {
        setConfig(e.detail);
      }
    };

    const handleQueueUpdate = () => {
      setQueue(PrintQueueManager.getQueue());
      setLogs(PrintQueueManager.getLogs());
    };

    window.addEventListener("printer_config_updated", handleConfigUpdate);
    window.addEventListener("print_queue_updated", handleQueueUpdate);
    const interval = setInterval(handleQueueUpdate, 3000);

    return () => {
      unsubscribe();
      window.removeEventListener("printer_config_updated", handleConfigUpdate);
      window.removeEventListener("print_queue_updated", handleQueueUpdate);
      clearInterval(interval);
    };
  }, []);

  const handleSaveSettings = () => {
    const saved = PrinterManager.saveConfiguredPrinter(config);
    setConfig(saved);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    window.dispatchEvent(new CustomEvent("print_queue_updated"));
  };

  const handleSelectPrinter = (printerName: string, role: "receipt" | "kot" | "both") => {
    let updates: Partial<TenantPrinterConfig> = {};
    if (role === "receipt" || role === "both") {
      updates.receiptPrinterName = printerName;
    }
    if (role === "kot" || role === "both") {
      updates.kotPrinterName = printerName;
    }
    const saved = PrinterManager.saveConfiguredPrinter(updates);
    setConfig(saved);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleTestPrint = async (role: "receipt" | "kot", targetPrinterName?: string) => {
    setTestPrintStatus({ role, loading: true, message: `Dispatching test print to ${targetPrinterName || (role === "receipt" ? config.receiptPrinterName : config.kotPrinterName)}...` });
    try {
      const result = await PrinterManager.testPrint(role, targetPrinterName);
      if (result.success) {
        setTestPrintStatus({
          role,
          loading: false,
          success: true,
          message: `Test print successfully spooled to '${result.printerUsed}'!`
        });
      } else {
        setTestPrintStatus({
          role,
          loading: false,
          success: false,
          message: result.error || "Test print failed."
        });
      }
    } catch (err: any) {
      setTestPrintStatus({
        role,
        loading: false,
        success: false,
        message: err.message || "Failed to execute test print."
      });
    }

    setTimeout(() => {
      setTestPrintStatus(prev => prev?.loading ? prev : null);
    }, 6000);
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

  // Find if configured receipt printer has an exact or fuzzy match
  const systemNames = discoveredPrinters.map(p => p.name);
  const bestReceiptMatch = PrinterManager.findBestPrinterMatch(config.receiptPrinterName, systemNames);
  const isReceiptFound = bestReceiptMatch.matchedPrinter !== null || discoveredPrinters.length === 0;

  // Best thermal recommendation across all discovered printers
  const recommendedThermal = discoveredPrinters.find(p => p.isRecommendedThermal && !p.isVirtual);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 w-full text-left">
      
      {/* Title Banner & Tenant Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-serif font-bold text-stone-900 uppercase tracking-wider text-left flex items-center gap-2">
              <Printer className="w-5 h-5 text-[#C67C4E]" />
              HARDWARE PRINTER MANAGER
            </h2>
            <span className="px-2 py-0.5 bg-[#C67C4E]/10 text-[#C67C4E] rounded-md text-[10px] font-mono font-bold uppercase tracking-wider">
              Multi-Tenant Architecture
            </span>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500 font-sans">
            <span className="flex items-center gap-1.5 text-stone-700 font-medium">
              <Building2 className="w-3.5 h-3.5 text-stone-400" />
              Restaurant: <strong className="text-stone-900">{tenantContext.organizationName}</strong>
            </span>
            <span className="text-stone-300">•</span>
            <span className="flex items-center gap-1.5 text-stone-700 font-medium">
              <Store className="w-3.5 h-3.5 text-stone-400" />
              Branch: <strong className="text-stone-900">{tenantContext.branchName}</strong>
            </span>
            <span className="text-stone-300">•</span>
            <span className="text-[11px] font-mono text-stone-400">
              Scope: {tenantContext.organizationId}/{tenantContext.branchId}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleManualRetry}
            disabled={isProcessing}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? "animate-spin" : ""}`} />
            <span>{isProcessing ? "Processing..." : "Process Queue"}</span>
          </button>
          <button
            type="button"
            onClick={handleClearQueue}
            className="px-4 py-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700 font-semibold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Trash2 className="w-3.5 h-3.5 text-stone-500" />
            <span>Purge Queue</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Status, Discovered Printers, and Settings */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* JSPrintManager Connection Bridge Telemetry */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs">
            <h3 className="text-2xs font-mono font-bold text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-stone-400" />
              JSPRINTMANAGER DESKTOP CLIENT TELEMETRY
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
                    WebSocket Connection State
                  </span>
                  <span className="text-sm font-bold text-stone-900 block leading-tight">
                    {jspmStatus.isConnected ? "CONNECTED — Direct Thermal Spooling Active" : `Bridge Offline — ${jspmStatus.label}`}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => scanPrinters(true)}
                  disabled={isScanning}
                  className="px-3 py-1.5 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 text-[10px] uppercase font-bold tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanning ? "animate-spin" : ""}`} />
                  <span>{isScanning ? "Scanning..." : "Rescan Printers"}</span>
                </button>
                <span className="text-[10px] font-mono text-stone-500 bg-stone-100 px-2.5 py-1 rounded-md">
                  {discoveredPrinters.length} detected
                </span>
              </div>
            </div>

            {/* Offline troubleshooting banner */}
            {!jspmStatus.isConnected && (
              <div className="mt-3 bg-amber-50 border border-amber-200 p-3.5 rounded-xl flex items-start justify-between gap-3">
                <div className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-800 font-sans leading-relaxed">
                    {jspmStatus.code === 5 || jspmStatus.statusString === "CERTIFICATE_ERROR" ? (
                      <div>
                        <strong className="block mb-0.5 font-bold text-amber-950">SSL Certificate Trust Required:</strong>
                        <span>Chrome requires trusting the local SSL certificate for JSPrintManager over HTTPS.</span>
                        <ol className="list-decimal list-inside mt-1.5 space-y-1 text-[10px] text-amber-900 font-medium">
                          <li>Open a new tab to: <a href="https://localhost:29443" target="_blank" rel="noreferrer" className="underline font-mono font-bold text-amber-950">https://localhost:29443</a></li>
                          <li>If Chrome shows "Your connection is not private", click <strong>Advanced</strong> &gt; <strong>Proceed to localhost (unsafe)</strong></li>
                          <li>Once accepted, return here and click <strong>Reconnect</strong></li>
                        </ol>
                      </div>
                    ) : jspmStatus.isBlocked || jspmStatus.code === 2 ? (
                      <span>
                        <strong>Website Blocked:</strong> JSPrintManager is blocking requests from this site. Please open <strong>JSPrintManager &gt; Settings &gt; Sites Manager</strong> on your Windows laptop and ensure <code>web-pos-1.vercel.app</code> is added to <em>Authorized Sites</em>.
                      </span>
                    ) : (
                      <span>
                        <strong>JSPrintManager Desktop Client Required:</strong> Please ensure the <strong>JSPrintManager</strong> application is running in the Windows taskbar/system tray on the restaurant billing laptop.
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    JSPrintManagerService.init().then(() => scanPrinters(true));
                  }}
                  className="shrink-0 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold uppercase rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  Reconnect
                </button>
              </div>
            )}

            {/* Mismatch banner with 1-click auto fix */}
            {jspmStatus.isConnected && !isReceiptFound && config.receiptPrinterName && (
              <div className="mt-3 bg-amber-50 border border-amber-300 p-3.5 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-900 font-sans leading-relaxed">
                    <strong className="block text-amber-950">Configured Printer Mismatch:</strong>
                    <span>
                      The configured printer <strong>"{config.receiptPrinterName}"</strong> is not found in installed system drivers.
                    </span>
                    {bestReceiptMatch.candidates.length > 0 && (
                      <span className="block mt-0.5 text-amber-800 font-medium">
                        Detected driver: <strong>{bestReceiptMatch.candidates.join(", ")}</strong>
                      </span>
                    )}
                  </div>
                </div>
                {bestReceiptMatch.candidates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSelectPrinter(bestReceiptMatch.candidates[0], "both")}
                    className="shrink-0 px-3 py-1.5 bg-[#C67C4E] hover:bg-[#B56B3D] text-white text-[10px] font-bold uppercase rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    Use {bestReceiptMatch.candidates[0]}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Automatic Printer Discovery Section */}
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-150 pb-3">
              <div>
                <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wide flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#C67C4E]" />
                  AUTOMATIC PRINTER DISCOVERY & CLASSIFICATION
                </h3>
                <p className="text-[11px] text-stone-500 font-sans">
                  Real-time detection of installed Windows printers with thermal scoring and classification.
                </p>
              </div>

              {recommendedThermal && (
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-800 text-[10px] font-bold font-mono">
                  <Zap className="w-3 h-3 text-emerald-600" />
                  Best Match: {recommendedThermal.name}
                </div>
              )}
            </div>

            {/* Printer cards list */}
            {discoveredPrinters.length > 0 ? (
              <div className="grid grid-cols-1 gap-2.5">
                {discoveredPrinters.map((printer) => {
                  const isReceiptSelected = config.receiptPrinterName.toLowerCase() === printer.name.toLowerCase();
                  const isKOTSelected = config.kotPrinterName.toLowerCase() === printer.name.toLowerCase();

                  return (
                    <div 
                      key={printer.name}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isReceiptSelected || isKOTSelected
                          ? "bg-[#FAF6F0] border-[#C67C4E]/40 shadow-xs"
                          : printer.isVirtual
                          ? "bg-stone-50/70 border-stone-200 opacity-60"
                          : "bg-white border-stone-200 hover:border-stone-300"
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-stone-900 truncate">
                            {printer.name}
                          </span>

                          {/* Classification badge */}
                          <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
                            printer.classification === "thermal_receipt"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : printer.classification === "thermal_label"
                              ? "bg-blue-100 text-blue-800 border border-blue-300"
                              : printer.isVirtual
                              ? "bg-stone-200 text-stone-600 border border-stone-300"
                              : "bg-stone-100 text-stone-700 border border-stone-200"
                          }`}>
                            {printer.classification === "thermal_receipt" ? "Thermal POS" :
                             printer.classification === "thermal_label" ? "Thermal Label" :
                             printer.isVirtual ? "Virtual / Software" : "Standard Driver"}
                          </span>

                          {/* Recommendation badge */}
                          {printer.isRecommendedThermal && !printer.isVirtual && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[9px] font-mono font-bold uppercase tracking-wider flex items-center gap-1">
                              <Zap className="w-2.5 h-2.5" />
                              Recommended
                            </span>
                          )}

                          {/* Active assignment indicators */}
                          {isReceiptSelected && (
                            <span className="px-2 py-0.5 bg-[#C67C4E] text-white rounded text-[9px] font-mono font-bold uppercase tracking-wider">
                              Receipt Printer
                            </span>
                          )}
                          {isKOTSelected && (
                            <span className="px-2 py-0.5 bg-stone-800 text-white rounded text-[9px] font-mono font-bold uppercase tracking-wider">
                              KOT Printer
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-500 font-sans">
                          {printer.isVirtual ? (
                            <span className="text-stone-500 font-medium italic">
                              Virtual printer (PDF / Document Writer) — not suitable for thermal POS receipt printing.
                            </span>
                          ) : (
                            <span>
                              Thermal Score: <strong>{printer.score}</strong> • Model tokens: {printer.normalizedTokens.join(", ") || "generic"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {!printer.isVirtual && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSelectPrinter(printer.name, "receipt")}
                              className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer border ${
                                isReceiptSelected
                                  ? "bg-[#C67C4E] text-white border-[#C67C4E]"
                                  : "bg-white hover:bg-stone-50 text-stone-700 border-stone-200"
                              }`}
                              title="Set as Bill / Receipt Printer"
                            >
                              {isReceiptSelected ? "✓ Bill Printer" : "Set as Bill"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectPrinter(printer.name, "kot")}
                              className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer border ${
                                isKOTSelected
                                  ? "bg-stone-800 text-white border-stone-800"
                                  : "bg-white hover:bg-stone-50 text-stone-700 border-stone-200"
                              }`}
                              title="Set as Kitchen Order Ticket Printer"
                            >
                              {isKOTSelected ? "✓ KOT Printer" : "Set as KOT"}
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => handleTestPrint("receipt", printer.name)}
                          className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                          title="Send test receipt directly to this printer"
                        >
                          Test
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 text-center space-y-2">
                <Printer className="w-8 h-8 text-stone-400 mx-auto" />
                <p className="text-xs text-stone-600 font-bold">
                  {jspmStatus.isConnected 
                    ? "Scanning for installed Windows printers..." 
                    : "Connect to JSPrintManager to discover installed printers."}
                </p>
                <p className="text-[11px] text-stone-400 font-sans">
                  Printers installed in Windows Settings will automatically show up here.
                </p>
              </div>
            )}
          </div>

          {/* Master Printer Configuration & Directives Form */}
          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-2xs space-y-6">
            <div className="border-b border-stone-150 pb-4">
              <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wide">
                Hardware Configuration & Directives
              </h3>
              <p className="text-[11px] text-stone-500 font-sans">
                Tenant-isolated printing parameters for {tenantContext.organizationName} ({tenantContext.branchName}).
              </p>
            </div>

            {/* Form fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <div className="space-y-1">
                <label className="text-[9px] font-mono font-extrabold text-stone-450 uppercase tracking-wider block">
                  CUSTOMER BILL / RECEIPT PRINTER
                </label>
                {discoveredPrinters.length > 0 ? (
                  <select
                    value={config.receiptPrinterName}
                    onChange={(e) => setConfig({ ...config, receiptPrinterName: e.target.value })}
                    className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] font-sans text-stone-900 font-bold"
                  >
                    <option value="">-- Select Installed Windows Printer --</option>
                    {discoveredPrinters.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.isRecommendedThermal ? "(★ Recommended Thermal)" : p.isVirtual ? "(Virtual)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={config.receiptPrinterName}
                    onChange={(e) => setConfig({ ...config, receiptPrinterName: e.target.value })}
                    className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] font-sans text-stone-900 font-bold"
                    placeholder="Enter Windows printer name (e.g. EPSON TM-T82X Receipt)"
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono font-extrabold text-stone-450 uppercase tracking-wider block">
                  KITCHEN ORDER TICKET (KOT) PRINTER
                </label>
                {discoveredPrinters.length > 0 ? (
                  <select
                    value={config.kotPrinterName}
                    onChange={(e) => setConfig({ ...config, kotPrinterName: e.target.value })}
                    className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] font-sans text-stone-900 font-bold"
                  >
                    <option value="">-- Same as Receipt Printer or Custom --</option>
                    {discoveredPrinters.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.isRecommendedThermal ? "(★ Recommended Thermal)" : p.isVirtual ? "(Virtual)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={config.kotPrinterName}
                    onChange={(e) => setConfig({ ...config, kotPrinterName: e.target.value })}
                    className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] font-sans text-stone-900 font-bold"
                    placeholder="Enter KOT printer name"
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono font-extrabold text-stone-450 uppercase tracking-wider block">
                  PAPER ROLL WIDTH
                </label>
                <select
                  value={config.paperWidth}
                  onChange={(e) => setConfig({ ...config, paperWidth: e.target.value as any })}
                  className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] font-sans text-stone-900 font-bold"
                >
                  <option value="80mm">80mm Professional Thermal Roll (Epson TM-T82X Standard)</option>
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
                  value={config.copies}
                  onChange={(e) => setConfig({ ...config, copies: Math.max(1, Number(e.target.value)) })}
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
                    checked={config.autoCut}
                    onChange={(e) => setConfig({ ...config, autoCut: e.target.checked })}
                    className="w-4 h-4 accent-[#C67C4E]"
                  />
                  <label htmlFor="autoCutCheckbox" className="text-xs text-stone-700 font-bold select-none cursor-pointer">
                    Send ESC/POS Auto Cut Command
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono font-extrabold text-stone-450 uppercase tracking-wider block">
                  PAPER CUT TYPE
                </label>
                <select
                  value={config.cutType}
                  onChange={(e) => setConfig({ ...config, cutType: e.target.value as any })}
                  className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] font-sans text-stone-900 font-bold"
                >
                  <option value="full">Full Cut (Complete Separation)</option>
                  <option value="partial">Partial Cut (Leave Small Tab)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono font-extrabold text-stone-450 uppercase tracking-wider block">
                  CUSTOMER BILL AUTO PRINT
                </label>
                <div className="flex items-center gap-3 bg-[#FAF6F0]/30 border border-stone-200 px-3 py-2 rounded-xl h-[42px]">
                  <input
                    type="checkbox"
                    id="autoPrintBillCheckbox"
                    checked={config.autoPrintBill}
                    onChange={(e) => setConfig({ ...config, autoPrintBill: e.target.checked })}
                    className="w-4 h-4 accent-[#C67C4E]"
                  />
                  <label htmlFor="autoPrintBillCheckbox" className="text-xs text-stone-700 font-bold select-none cursor-pointer">
                    Auto-Print Bill on Order Finalization
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
                    checked={config.autoPrintKOT}
                    onChange={(e) => setConfig({ ...config, autoPrintKOT: e.target.checked })}
                    className="w-4 h-4 accent-[#C67C4E]"
                  />
                  <label htmlFor="autoPrintKOTCheckbox" className="text-xs text-stone-700 font-bold select-none cursor-pointer">
                    Auto-Print KOT on Order Finalization
                  </label>
                </div>
              </div>

            </div>

            {/* Test Print notification */}
            {testPrintStatus && (
              <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium ${
                testPrintStatus.loading
                  ? "bg-stone-50 border-stone-200 text-stone-800"
                  : testPrintStatus.success
                  ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                  : "bg-red-50 border-red-300 text-red-950"
              }`}>
                <div className="flex items-center gap-2">
                  {testPrintStatus.loading ? (
                    <RefreshCw className="w-4 h-4 text-stone-500 animate-spin" />
                  ) : testPrintStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  )}
                  <span>{testPrintStatus.message}</span>
                </div>
              </div>
            )}

            {/* Action panel footer */}
            <div className="pt-4 border-t border-stone-150 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-5 py-2.5 bg-[#C67C4E] hover:bg-[#aa663a] text-white font-bold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Printer Parameters</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleTestPrint("receipt")}
                  className="px-4 py-2.5 bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Test Bill Print</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTestPrint("kot")}
                  className="px-4 py-2.5 bg-stone-700 hover:bg-stone-800 text-white font-bold text-xs tracking-wider uppercase rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Test KOT Print</span>
                </button>
              </div>

              {saveSuccess && (
                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                  <Check className="w-3 h-3" />
                  Parameters saved to {tenantContext.branchName}
                </span>
              )}
            </div>

          </div>

        </div>

        {/* Right column: Dispatch Telemetry & Rules */}
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

          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs space-y-3">
            <h4 className="text-2xs font-mono font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[#C67C4E]" />
              THERMAL DRIVER DIRECTIVES
            </h4>
            <ul className="text-[11px] text-stone-600 font-sans space-y-2.5 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-[#C67C4E] font-bold">•</span>
                <span>
                  <strong>Driver Name Tolerant:</strong> Handles Windows driver variations (e.g., <em>"EPSON TM-T82X"</em> matching <em>"EPSON TM-T82X Receipt"</em>) automatically without manual intervention.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#C67C4E] font-bold">•</span>
                <span>
                  <strong>Virtual Printer Blacklist:</strong> Filters out OneNote, Microsoft Print to PDF, and Fax to prevent silent dialog popups or frozen background spools.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#C67C4E] font-bold">•</span>
                <span>
                  <strong>Tenant Scoping:</strong> Configurations are saved strictly per organization and branch ID.
                </span>
              </li>
            </ul>
          </div>
        </div>

      </div>

    </motion.div>
  );
}
