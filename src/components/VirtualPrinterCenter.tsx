import React, { useState, useEffect, useRef } from "react";
import { 
  Printer, 
  Settings, 
  Trash2, 
  Play, 
  Pause, 
  FileText, 
  Layers, 
  History, 
  BarChart, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  ArrowDown, 
  X, 
  Copy, 
  Download,
  Activity,
  Award
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { KOT, PrinterEmulatorLog } from "../types";
import { LocalDB, supabase } from "../lib/db";

export default function VirtualPrinterCenter() {
  const [logs, setLogs] = useState<PrinterEmulatorLog[]>([]);
  const [kots, setKots] = useState<KOT[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [printerStatus, setPrinterStatus] = useState<"online" | "idle" | "offline">("online");
  const [isAutoPrintActive, setIsAutoPrintActive] = useState(true);
  
  // Modal State
  const [selectedLog, setSelectedLog] = useState<PrinterEmulatorLog | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"58mm" | "80mm">("80mm");

  // Animation States
  const [isPrinting, setIsPrinting] = useState(false);
  const [currentPrintingText, setCurrentPrintingText] = useState("");
  const [currentPrintingKOTNumber, setCurrentPrintingKOTNumber] = useState("");
  
  // Interactive queues
  const [queue, setQueue] = useState<Omit<PrinterEmulatorLog, "id" | "createdAt" | "receiptText">[]>([]);

  // Paper feeder list (contains text snippets that animate out)
  const paperOutputRef = useRef<HTMLDivElement>(null);

  // Load logs and KOT details
  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const dbLogs = await LocalDB.fetchPrinterLogs();
      const dbKots = await LocalDB.fetchKOTs();
      setLogs(dbLogs || []);
      setKots(dbKots || []);
    } catch (e) {
      console.error(e);
      setLogs(LocalDB.getPrinterLogs());
      setKots(LocalDB.getKOTs());
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // Setup Realtime subscriptions
  useEffect(() => {
    loadData();

    const handleSync = () => loadData(true);
    window.addEventListener("storage", handleSync);
    window.addEventListener("printer_logs_updated", handleSync);
    window.addEventListener("kots_updated", handleSync);

    // Setup Supabase subscription specifically for automatic printer queue triggers
    const channel = supabase
      .channel("realtime_virtual_printer")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kots" },
        (p) => {
          console.log("[VirtualPrinter] Realtime new KOT:", p);
          if (isAutoPrintActive && printerStatus === "online") {
            const freshKot = p.new as any;
            triggerVirtualPrint(freshKot);
          } else {
            loadData(true);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "kots" },
        (p) => {
          console.log("[VirtualPrinter] Realtime KOT update:", p);
          loadData(true);
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("printer_logs_updated", handleSync);
      window.removeEventListener("kots_updated", handleSync);
      supabase.removeChannel(channel);
    };
  }, [isAutoPrintActive, printerStatus]);

  // Scroll to bottom of receipt when printing completes or rolls
  useEffect(() => {
    if (paperOutputRef.current) {
      paperOutputRef.current.scrollTop = paperOutputRef.current.scrollHeight;
    }
  }, [currentPrintingText, isPrinting]);

  // Generates thermal print receipt text
  const generateReceiptText = (kot: any) => {
    const itemsText = Array.isArray(kot.items) 
      ? kot.items.map((i: any) => `${i.quantity} x ${i.name}`).join("\n")
      : "No items recorded.";

    return `================================
         WEBRAJYA POS
================================

KOT #${kot.id || "KOT-NEW"}

Table: T-${kot.tableNumber || "Takeaway"}
Order Type: ${(kot.orderType || "dine-in").toUpperCase()}

--------------------------------

${itemsText}

--------------------------------

Notes:
${kot.specialInstructions || "No instructions."}

--------------------------------

Printed At:
${new Date().toLocaleTimeString()}

================================

Kitchen Copy
`;
  };

  // Perform virtual print simulation sequence with animation
  const triggerVirtualPrint = async (kot: any) => {
    if (isPrinting) {
      // Add to queue panel
      setQueue((prev) => [...prev, {
        kotId: kot.id,
        kotNumber: kot.id,
        restaurantId: "webrajya-pos-main",
        printStatus: "Pending"
      }]);
      return;
    }

    setIsPrinting(true);
    setCurrentPrintingKOTNumber(kot.id);
    setPrinterStatus("idle");

    const receipt = generateReceiptText(kot);
    const lines = receipt.split("\n");
    let progressiveText = "";

    // Add to active queue as "Printing"
    setQueue((prev) => [...prev, {
      kotId: kot.id,
      kotNumber: kot.id,
      restaurantId: "webrajya-pos-main",
      printStatus: "Printing"
    }]);

    // Feed lines line by line to create a realistic typewriter/paper-out effect
    for (let i = 0; i < lines.length; i++) {
      progressiveText += lines[i] + "\n";
      setCurrentPrintingText(progressiveText);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    // Done printing
    setIsPrinting(false);
    setPrinterStatus("online");

    // Add to print history log & update remote database KOT status as printed
    try {
      await LocalDB.apiAddPrinterLog({
        kotId: kot.id,
        kotNumber: kot.id,
        restaurantId: "webrajya-pos-main",
        receiptText: receipt,
        printStatus: "Printed"
      });

      await LocalDB.apiUpdateKOTPrinted(kot.id, true);
    } catch (err) {
      console.error(err);
    }

    // Remove from simulation queue, mark status as printed
    setQueue((prev) => prev.filter(q => q.kotId !== kot.id));
    loadData(true);

    // Process next item in queue if queue has items
    setTimeout(() => {
      // Small trigger
    }, 500);
  };

  const handleTestPrint = () => {
    const randomKot: KOT = {
      id: `KOT-${String(Math.floor(Math.random() * 8999) + 1000)}`,
      orderId: `SR-${Math.floor(Math.random() * 1000) + 1000}`,
      tableNumber: String(Math.floor(Math.random() * 12) + 1),
      customerName: "Aaryan Rajput",
      orderType: "dine-in",
      status: "New Order",
      specialInstructions: "Less spices, no garlic onion.",
      createdAt: new Date().toISOString(),
      preparationTime: 12,
      items: [
        { menuItemId: "i1", name: "Masala Dosa", price: 180, quantity: 2 },
        { menuItemId: "i2", name: "Rava Idli Sambar", price: 140, quantity: 1 },
        { menuItemId: "i3", name: "Filter Coffee", price: 70, quantity: 1 }
      ]
    };
    triggerVirtualPrint(randomKot);
  };

  // Helper values
  const totalToday = logs.length;
  const failedPrinters = logs.filter(l => l.printStatus === "Failed").length;
  const reprintCount = logs.filter(l => l.receiptText.includes("REPRINT") || l.receiptText.includes("REPRINTED")).length;

  // Hourly volume distributions
  const hourlyStats = [
    { hour: "11:00 AM", count: 4 },
    { hour: "12:00 PM", count: 8 },
    { hour: "01:00 PM", count: 14 },
    { hour: "02:00 PM", count: 11 },
    { hour: "07:00 PM", count: 18 },
    { hour: "08:00 PM", count: 22 },
    { hour: "09:00 PM", count: 15 },
    { hour: "10:00 PM", count: 6 }
  ];

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    // Custom trigger notifications
    const event = new CustomEvent("print_alert", {
      detail: { message: "Receipt text copied to clipboard!", type: "success" }
    });
    window.dispatchEvent(event);
  };

  // Simulates downloading receipt file in JSON/txt format
  const handleDownloadTxt = (log: PrinterEmulatorLog) => {
    const blob = new Blob([log.receiptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Receipt_${log.kotNumber}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      
      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/60 p-6 rounded-3xl border border-stone-200/80 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-xl font-serif font-black text-indigo-900 uppercase tracking-wide flex items-center gap-2">
            🖨️ Virtual KOT Printer Center
          </h2>
          <p className="text-xs text-stone-500">
            Realtime thermal emulation suite to audit receipt layout outputs, spooled files, and kitchen printer states.
          </p>
        </div>

        <div className="flex gap-2 font-sans">
          <button
            onClick={handleTestPrint}
            disabled={isPrinting}
            className="flex items-center gap-2 py-2 px-4 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold uppercase tracking-widest cursor-pointer disabled:opacity-50 shadow-md border-none"
          >
            <Printer className="w-4 h-4" /> Simulate KOT Print
          </button>
        </div>
      </div>

      {/* Printer Status Panel Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Connection status card */}
        <div className="bg-white border border-stone-250/50 p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-stone-100">
            <span className="text-[10px] tracking-wider uppercase font-extrabold text-stone-400 font-sans">Printer Node</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              printerStatus === "online" ? "bg-emerald-50 text-emerald-700" :
              printerStatus === "idle" ? "bg-amber-50 text-amber-700 animate-pulse" :
              "bg-rose-50 text-rose-700"
            }`}>
              {printerStatus === "online" ? "🟢 ONLINE" : printerStatus === "idle" ? "🟡 PRINTING" : "🔴 OFFLINE"}
            </span>
          </div>
          
          <div className="space-y-1">
            <span className="text-2xl font-black font-sans text-stone-850">Emulator #1</span>
            <p className="text-[10px] text-stone-400 font-light">Subhash Nagar Main Kitchen Core (POS-80)</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setPrinterStatus(prev => prev === "offline" ? "online" : "offline")}
              className={`flex-1 py-1 px-2 border rounded-xl text-[10px] font-semibold transition cursor-pointer font-sans text-center ${
                printerStatus === "offline" ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-rose-50 border-rose-300 text-rose-800"
              }`}
            >
              {printerStatus === "offline" ? "Set Online" : "Go Offline"}
            </button>
          </div>
        </div>

        {/* Auto Dispatch Card */}
        <div className="bg-white border border-stone-250/50 p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-stone-100">
            <span className="text-[10px] tracking-wider uppercase font-extrabold text-stone-400 font-sans">Auto-Spoooler</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              isAutoPrintActive ? "bg-indigo-50 text-indigo-700" : "bg-stone-50 text-stone-550"
            }`}>
              {isAutoPrintActive ? "ACTIVE" : "STANDBY"}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-2xl font-black font-sans text-stone-850">Listening</span>
            <p className="text-[10px] text-stone-400 font-light">Auto catches Supabase real-time inserts</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsAutoPrintActive(!isAutoPrintActive)}
              className="flex-1 py-1 px-2 border border-stone-200 hover:bg-stone-50 rounded-xl text-[10px] font-semibold transition cursor-pointer font-sans text-center text-stone-705"
            >
              {isAutoPrintActive ? "Pause Auto-Print" : "Enable Auto-Print"}
            </button>
          </div>
        </div>

        {/* Total stats card */}
        <div className="bg-white border border-stone-250/50 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center border-b border-stone-100 pb-2">
            <span className="text-[10px] tracking-wider uppercase font-extrabold text-stone-400 font-sans">Daily Output</span>
            <Clock className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <div className="py-2">
            <span className="text-3xl font-black font-sans text-stone-855">{totalToday}</span>
            <span className="text-[10px] text-stone-400 block mt-1">Virtually printed receipts today</span>
          </div>
        </div>

        {/* Queue panel count */}
        <div className="bg-indigo-50/50 border border-indigo-200/50 p-5 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="flex justify-between items-center border-b border-indigo-150 pb-2">
            <span className="text-[10px] tracking-wider uppercase font-extrabold text-indigo-500 font-sans">Spooled Queue</span>
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="py-2">
            <span className="text-3xl font-black font-sans text-indigo-800">{queue.length}</span>
            <span className="text-[10px] text-indigo-500 block mt-1">Pending queue backlog</span>
          </div>
        </div>

      </div>

      {/* Main Core Section: Interactive simulator & Queue management */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Thermal Printer Graphics simulator */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-stone-900 border-4 border-stone-850 p-6 rounded-3xl shadow-2xl space-y-4">
            
            {/* Realistic Printer Enclosure Header */}
            <div className="flex justify-between items-center text-white bg-stone-800/80 p-3 rounded-2xl border border-stone-700">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${isPrinting ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
                <span className="font-mono text-[10px] font-bold text-stone-300">THERMAL EMULATION SLOT #1</span>
              </div>
              <span className="text-[9px] font-mono text-indigo-400 font-bold bg-indigo-950 px-2 py-0.5 rounded border border-indigo-900">POS-80MM</span>
            </div>

            {/* Simulated Paper rollout viewport window */}
            <div className="bg-stone-800 p-5 rounded-2xl border border-stone-750 relative overflow-hidden flex flex-col items-center">
              
              {/* Paper Roll Indicator (Moving/Slicing) */}
              <div className="absolute top-0 inset-x-0 h-4 bg-gradient-to-b from-stone-900 via-stone-800 to-transparent z-20 flex justify-center">
                <div className="w-2/3 h-1 bg-indigo-500 rounded-b opacity-80 animate-pulse" />
              </div>

              {/* White receipt paper element */}
              <div 
                ref={paperOutputRef}
                className={`w-full max-w-sm h-96 overflow-y-auto bg-[#fffff8] border border-stone-300 rounded-lg p-5 font-mono text-[11px] text-stone-900 shadow-inner scroll-smooth ${
                  isPrinting ? "animate-[pulse_1.5s_infinite]" : ""
                }`}
              >
                {/* Jagged tear paper decoration top */}
                <div className="border-b border-dotted border-stone-400 py-1 mb-3 text-center text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                  --- POS Spooler Output ---
                </div>

                {isPrinting || currentPrintingText ? (
                  <pre className="whitespace-pre-wrap leading-relaxed font-mono select-text font-medium text-stone-900 text-center">
                    {currentPrintingText}
                  </pre>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-stone-400 py-12 space-y-3 font-sans">
                    <Printer className="w-10 h-10 stroke-1 text-stone-300 animate-bounce" />
                    <p className="font-bold text-xs text-stone-600 font-sans">Spooler Is Sleeping</p>
                    <p className="text-[10px] text-stone-400 max-w-xs leading-relaxed font-sans">Submit a new KOT from mobile menu or click 'Simulate KOT Print' up top to watch real-time compiler paper feed animation here.</p>
                  </div>
                )}
                
                {/* Jagged tear paper decoration bottom */}
                <div className="border-t border-dotted border-stone-400 py-1 mt-4 text-center text-[9px] text-stone-350">
                  --- EOF Paper Roll ---
                </div>
              </div>

              {/* Realistic Laser guide cutter line */}
              <div className="absolute bottom-4 left-4 right-4 h-1 bg-red-650 opacity-60 animate-pulse" />

            </div>

            {/* Controller interface buttons */}
            <div className="flex justify-between items-center text-xs text-stone-400 font-mono">
              <span>Feed Paper (Scrolls)</span>
              <button 
                onClick={() => {
                  setCurrentPrintingText("");
                  setCurrentPrintingKOTNumber("");
                }}
                className="py-1 px-2.5 bg-stone-800 hover:bg-stone-750 text-stone-300 border border-stone-700 rounded-lg cursor-pointer transition text-[10px] font-bold"
              >
                Clear Paper Snippets
              </button>
            </div>

          </div>
        </div>

        {/* Right: Virtual Queue & Analytics block */}
        <div className="lg:col-span-6 space-y-6">
          
          {/* Virtual Queue Panel */}
          <div className="bg-white border border-stone-250/50 p-5 rounded-3xl space-y-4">
            <h3 className="text-sm font-sans font-bold text-stone-900 uppercase tracking-wide flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" /> Virtual Queue Panel
            </h3>
            
            <div className="space-y-2">
              {queue.length === 0 ? (
                <div className="py-6 border border-dashed border-stone-200 rounded-2xl text-center text-xs text-stone-400">
                  No active spools in print-controller queue. Idle.
                </div>
              ) : (
                queue.map((qItem, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-stone-50 border border-stone-150 rounded-xl text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-[#C67C4E]/10 rounded-full flex items-center justify-center text-[#C67C4E] font-black text-[10px]">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-stone-800">{qItem.kotNumber}</span>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-sans font-bold ${
                      qItem.printStatus === "Pending" ? "bg-amber-50 border border-amber-200 text-amber-700" :
                      qItem.printStatus === "Printing" ? "bg-blue-50 border border-blue-200 text-blue-700 animate-pulse" :
                      "bg-rose-50 border border-rose-200 text-rose-700"
                    }`}>
                      {qItem.printStatus}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Analytics trend graphs */}
          <div className="bg-white border border-stone-250/50 p-5 rounded-3xl space-y-4">
            <div className="flex justify-between items-baseline">
              <h3 className="text-sm font-sans font-bold text-stone-900 uppercase tracking-wide flex items-center gap-2">
                <BarChart className="w-4 h-4 text-indigo-600" /> KOT Daily Volume Hourly Trend
              </h3>
              <span className="text-[10px] font-mono text-indigo-600 font-bold">24H Spool Logs</span>
            </div>

            {/* Small custom SVG styled chart */}
            <div className="h-28 flex items-end justify-between gap-1.5 pt-4 px-2 relative font-mono text-[9px] text-stone-400">
              {hourlyStats.map((hl, idx) => {
                const maxCount = 25;
                const pct = Math.min(100, (hl.count / maxCount) * 100);
                
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                    <div className="absolute -top-6 bg-stone-900 text-white px-2 py-0.5 rounded text-[8px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                      {hl.count} KOTs
                    </div>
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-t-lg h-20 relative overflow-hidden flex items-end">
                      <div 
                        className="w-full bg-gradient-to-t from-indigo-500 to-indigo-600 transition-all duration-700"
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span>{hl.hour.split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>

          </div>

        </div>

      </div>

      {/* Printer History table ledger */}
      <div className="bg-white border border-stone-250/50 p-6 rounded-3xl space-y-4">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2">
          <div className="space-y-1">
            <h3 className="text-sm font-sans font-bold text-stone-900 uppercase tracking-wide flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" /> Print History Logs Table
            </h3>
            <p className="text-[11px] text-stone-400">Archived list of compiled logs submitted to printer emulator services.</p>
          </div>
        </div>

        <div className="border border-stone-150 rounded-2xl overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-[10px] uppercase font-bold tracking-wider text-stone-500 font-mono">
                  <th className="py-3 px-4 font-bold">KOT Number</th>
                  <th className="py-3 px-4 font-bold">Store Node</th>
                  <th className="py-3 px-4 font-bold">Table</th>
                  <th className="py-3 px-4 text-center font-bold">Status</th>
                  <th className="py-3 px-4 font-bold">Printed Timestamp</th>
                  <th className="py-3 px-4 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs font-sans text-stone-700">
                {isLoading ? (
                  // Loading rows
                  Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td colSpan={6} className="py-3 px-4"><div className="h-4 bg-stone-100 rounded w-full" /></td>
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-stone-400 text-xs">
                      No printed KOT receipts tracked in emulator logs.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono font-bold text-stone-950">
                          {log.kotNumber}
                        </td>
                        <td className="py-3 px-4 text-stone-800">
                          WebRajya POS Main
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-[#aa7c11] bg-amber-50/40 px-2 py-0.5 rounded border border-amber-200/20">
                            T-Core
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2.5 py-0.5 text-[10px] font-semibold bg-emerald-50 border border-emerald-250/30 text-emerald-800 rounded-full">
                            {log.printStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-stone-550 font-mono text-[11px]">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="px-2.5 py-1 bg-stone-50 hover:bg-stone-100 rounded border border-stone-200/50 text-stone-605 transition cursor-pointer font-bold text-[10px] uppercase font-mono"
                            >
                              View
                            </button>
                            <button
                              onClick={() => {
                                // Reprint trigger
                                const mappedKOT = kots.find(k => k.id === log.kotNumber) || {
                                  id: log.kotNumber,
                                  tableNumber: "1",
                                  orderType: "dine-in",
                                  specialInstructions: "Reprinted",
                                  items: []
                                };
                                triggerVirtualPrint(mappedKOT);
                              }}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200/20 text-indigo-700 transition cursor-pointer font-bold text-[10px] uppercase font-mono"
                            >
                              Reprint
                            </button>
                            <button
                              onClick={() => handleDownloadTxt(log)}
                              className="p-1 text-stone-500 hover:text-indigo-600 transition cursor-pointer"
                              title="Download Thermal TXT Receipt"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Receipts Preview thermal popover dialog */}
      <AnimatePresence>
        {selectedLog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLog(null)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="fixed inset-0 m-auto w-full max-w-sm h-fit max-h-[85vh] bg-white border border-stone-200 rounded-3xl z-50 p-6 shadow-2xl flex flex-col justify-between space-y-4"
            >
              {/* Header selectors */}
              <div className="flex items-center justify-between border-b border-stone-150 pb-3 text-stone-850">
                <div className="flex gap-1.5 bg-stone-100 p-0.5 rounded-lg border border-stone-200">
                  {(["58mm", "80mm"] as const).map((width) => (
                    <button
                      key={width}
                      onClick={() => setPreviewWidth(width)}
                      className={`px-3 py-1 text-[10px] font-mono font-bold rounded-md transition cursor-pointer ${
                        previewWidth === width ? "bg-white text-stone-900 border border-stone-250/20 shadow-xs" : "text-stone-500 hover:text-stone-850"
                      }`}
                    >
                      {width}
                    </button>
                  ))}
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => handleCopyText(selectedLog.receiptText)}
                    className="p-1 text-stone-500 hover:text-stone-900 cursor-pointer"
                    title="Copy Receipt Text"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDownloadTxt(selectedLog)}
                    className="p-1 text-stone-500 hover:text-indigo-600 cursor-pointer"
                    title="Download Text File"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSelectedLog(null)}
                    className="p-1 px-2 bg-stone-100 rounded-full text-stone-550 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Scrollable thermal paper preview wrap */}
              <div className="flex-1 overflow-y-auto px-4 py-6 bg-stone-50 border border-stone-200 rounded-2xl flex justify-center">
                <div 
                  className="bg-white p-5 border border-stone-300 shadow-md font-mono text-[11px] leading-relaxed relative flex flex-col select-text"
                  style={{ width: previewWidth === "58mm" ? "210px" : "280px" }}
                >
                  <pre className="whitespace-pre-wrap leading-relaxed font-mono font-bold text-stone-900 overflow-x-hidden text-center">
                    {selectedLog.receiptText}
                  </pre>
                </div>
              </div>

              {/* Action */}
              <button
                onClick={() => {
                  const mappedKOT = kots.find(k => k.id === selectedLog.kotNumber) || {
                    id: selectedLog.kotNumber,
                    tableNumber: "1",
                    orderType: "dine-in",
                    specialInstructions: "Reprinted",
                    items: []
                  };
                  triggerVirtualPrint(mappedKOT);
                  setSelectedLog(null);
                }}
                className="w-full py-3 bg-indigo-650 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
              >
                <Printer className="w-3.5 h-3.5" /> Reprint Thermal Ticket
              </button>

            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
