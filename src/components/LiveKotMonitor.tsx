import React, { useState, useEffect, useRef } from "react";
import { 
  Eye, 
  Printer, 
  FileText, 
  ChevronRight, 
  X, 
  Clock, 
  RefreshCw, 
  UtensilsCrossed, 
  AlertCircle,
  TrendingUp,
  Sliders,
  CheckCircle2,
  Package,
  Layers,
  Calendar
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { KOT, KOTStatus, PrinterEmulatorLog } from "../types";
import { LocalDB, supabase } from "../lib/db";

export default function LiveKotMonitor() {
  const [kots, setKots] = useState<KOT[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedKot, setSelectedKot] = useState<KOT | null>(null);
  const [previewKot, setPreviewKot] = useState<KOT | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"58mm" | "80mm">("80mm");
  const [error, setError] = useState<string | null>(null);

  // Load KOTs
  const loadKOTs = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await LocalDB.fetchKOTs();
      setKots(data || []);
      setError(null);
    } catch (err: any) {
      console.error("Error loading KOTs in Monitor: ", err);
      // Fallback
      setKots(LocalDB.getKOTs());
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadKOTs();

    // Handle updates from localStorage or sync actions
    const handleSync = () => loadKOTs(true);
    window.addEventListener("storage", handleSync);
    window.addEventListener("kots_updated", handleSync);

    // Setup Supabase Realtime channel
    console.log("[Supabase LiveKOTMonitor] Connecting channel...");
    const channel = supabase
      .channel("realtime_kot_monitor")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kots" },
        (payload) => {
          console.log("Realtime INSERT seen in LiveKotMonitor:", payload);
          loadKOTs(true);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "kots" },
        (payload) => {
          console.log("Realtime UPDATE seen in LiveKotMonitor:", payload);
          loadKOTs(true);
        }
      )
      .subscribe((status) => {
        console.log("Realtime channel status:", status);
      });

    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("kots_updated", handleSync);
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter KOTs for today
  const getTodayKots = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    return kots.filter(k => k.createdAt.startsWith(todayStr));
  };

  const todayKots = getTodayKots();
  const sortedKots = [...kots]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  // Statistics calculation
  const totalToday = todayKots.length;
  const pendingCount = todayKots.filter(k => k.status === "New Order").length;
  const preparingCount = todayKots.filter(k => k.status === "Preparing").length;
  const readyCount = todayKots.filter(k => k.status === "Ready").length;
  const printedCount = todayKots.filter(k => k.printed).length;

  const getStatusBadge = (status: KOTStatus) => {
    const configs: Record<KOTStatus, { bg: string; text: string; label: string }> = {
      "New Order": { bg: "bg-amber-50 border-amber-250/50", text: "text-amber-750 font-bold", label: "New Order" },
      "Accepted": { bg: "bg-indigo-50 border-indigo-200/60", text: "text-indigo-700 font-bold", label: "Accepted" },
      "Preparing": { bg: "bg-sky-50 border-sky-200/60", text: "text-sky-700 font-bold", label: "Preparing" },
      "Ready": { bg: "bg-emerald-50 border-emerald-200/65", text: "text-emerald-700 font-bold", label: "Ready" },
      "Served": { bg: "bg-stone-50 border-stone-200/60", text: "text-stone-600", label: "Served" },
      "Cancelled": { bg: "bg-rose-50 border-rose-200/60", text: "text-rose-700 font-bold", label: "Cancelled" }
    };

    const config = configs[status] || { bg: "bg-stone-50 border-stone-100", text: "text-stone-500", label: status };

    return (
      <span className={`px-2.5 py-1 text-[10px] uppercase tracking-wide border rounded-full font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const getPrintBadge = (printed?: boolean) => {
    return printed ? (
      <span className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide bg-emerald-50 border border-emerald-250/30 text-emerald-800 rounded-full">
        Printed
      </span>
    ) : (
      <span className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide bg-amber-50 border border-amber-250/30 text-amber-800 rounded-full animate-pulse">
        Pending
      </span>
    );
  };

  // Reprint KOT function
  const handleReprint = async (kot: KOT) => {
    try {
      // Simulate reprint
      await LocalDB.apiUpdateKOTPrinted(kot.id, true);
      
      // Compute formatted receipt text
      const itemsText = kot.items.map(item => `${item.quantity} x ${item.name}`).join("\n");
      const receiptText = `
================================
          WEBRAJYA POS
================================
KOT NUMBER: ${kot.id}
TABLE: ${kot.tableNumber}
ORDER TYPE: ${kot.orderType.toUpperCase()}
--------------------------------
ITEMS:
${itemsText}
--------------------------------
NOTES:
${kot.specialInstructions || "None"}
--------------------------------
Printed At:
${new Date().toLocaleTimeString()}
================================
KITCHEN COPY
`;

      // Log in print emulators
      await LocalDB.apiAddPrinterLog({
        kotId: kot.id,
        kotNumber: kot.id,
        restaurantId: "webrajya-pos-main",
        receiptText: receiptText.trim(),
        printStatus: "Printed"
      });

      // Show alert or animation success
      const notification = new CustomEvent("print_alert", {
        detail: { message: `KOT ${kot.id} reprinted successfully!`, type: "success" }
      });
      window.dispatchEvent(notification);

      // Reload
      loadKOTs(true);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-md border border-stone-200/80 rounded-3xl p-6 shadow-xl space-y-6">
      
      {/* Header section with Indigo look */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-100 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-ping" />
            <span className="text-xs font-mono font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">KOT Live Core</span>
          </div>
          <h3 className="text-lg font-serif font-bold text-stone-900 uppercase tracking-wide">Live Kitchen Order Tickets</h3>
          <p className="text-xs text-stone-500 font-light">Monitor live cooking tickets and kitchen performance metrics synchronizing in real-time.</p>
        </div>
        
        <button 
          onClick={() => loadKOTs(false)}
          className="self-start md:self-auto flex items-center gap-1 py-1.5 px-3 bg-white border border-stone-200 rounded-xl text-stone-600 text-xs hover:bg-stone-50 transition cursor-pointer font-semibold shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Sync Feed</span>
        </button>
      </div>

      {/* 5 Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total KOTs Today", count: totalToday, bg: "bg-indigo-50/70 border-indigo-200/50", text: "text-indigo-800", subtitle: "Active tickets today" },
          { label: "Pending KOTs", count: pendingCount, bg: "bg-amber-50/70 border-amber-250/50", text: "text-amber-800", subtitle: "Queued for kitchen" },
          { label: "Preparing KOTs", count: preparingCount, bg: "bg-sky-50/70 border-sky-200/50", text: "text-sky-800", subtitle: "Under active chef care" },
          { label: "Ready KOTs", count: readyCount, bg: "bg-emerald-50/70 border-emerald-200/50", text: "text-emerald-800", subtitle: "Awaiting service" },
          { label: "Printed KOTs", count: printedCount, bg: "bg-stone-50/70 border-stone-200/50", text: "text-stone-800", subtitle: "Dispatched to POS" }
        ].map((card, idx) => (
          <div key={idx} className={`p-4 rounded-2xl border ${card.bg} flex flex-col justify-between shadow-xs transition-all duration-300 hover:shadow-md`}>
            <span className="text-[10px] uppercase font-bold tracking-wider text-stone-500 font-sans">
              {card.label}
            </span>
            <div className="flex items-baseline justify-between mt-2.5">
              <span className={`text-2xl font-black font-sans leading-none ${card.text}`}>
                {card.count}
              </span>
            </div>
            <span className="text-[9px] text-stone-400 font-light mt-1 text-ellipsis overflow-hidden whitespace-nowrap">
              {card.subtitle}
            </span>
          </div>
        ))}
      </div>

      {/* Real-time KOT Table */}
      <div className="border border-stone-150/80 rounded-2xl overflow-hidden bg-white/50">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50/80 border-b border-stone-200/80 text-[10px] uppercase tracking-wider font-bold text-stone-500 font-mono">
                <th className="py-3.5 px-4 font-bold">KOT Number</th>
                <th className="py-3.5 px-4 font-bold">Restaurant</th>
                <th className="py-3.5 px-4 font-bold">Table</th>
                <th className="py-3.5 px-4 font-bold text-center">Type</th>
                <th className="py-3.5 px-4 text-center font-bold">Items Count</th>
                <th className="py-3.5 px-4 font-bold">Status</th>
                <th className="py-3.5 px-4 font-bold">Print Status</th>
                <th className="py-3.5 px-4 font-bold">Created At</th>
                <th className="py-3.5 px-4 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs font-sans text-stone-700">
              {isLoading ? (
                // Skeleton loading rows
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse bg-stone-50/20">
                    <td className="py-4 px-4"><div className="h-4 w-20 bg-stone-150 rounded" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-24 bg-stone-150 rounded" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-10 bg-stone-150 rounded" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-16 bg-stone-150 mx-auto rounded" /></td>
                    <td className="py-4 px-4 text-center"><div className="h-4 w-8 bg-stone-150 mx-auto rounded" /></td>
                    <td className="py-4 px-4"><div className="h-5 w-20 bg-stone-150 rounded-full" /></td>
                    <td className="py-4 px-4"><div className="h-5 w-16 bg-stone-150 rounded-full" /></td>
                    <td className="py-4 px-4"><div className="h-4 w-24 bg-stone-150 rounded" /></td>
                    <td className="py-4 px-4 text-right"><div className="h-6 w-12 bg-stone-150 ml-auto rounded" /></td>
                  </tr>
                ))
              ) : sortedKots.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 bg-stone-50 border border-stone-150 rounded-full flex items-center justify-center">
                        <UtensilsCrossed className="w-5 h-5 text-stone-400" />
                      </div>
                      <p className="text-xs font-bold text-stone-700">No Kitchen Orders Available</p>
                      <p className="text-[11px] text-stone-400 max-w-xs leading-relaxed">Incoming orders and table seat requests will pop up automatically.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedKots.map((kot) => {
                  const itemCount = kot.items.reduce((sum, i) => sum + i.quantity, 0);
                  const createdTime = new Date(kot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <tr 
                      key={kot.id} 
                      className={`hover:bg-slate-50/60 transition-colors ${kot.status === "New Order" ? "bg-amber-50/10 font-medium" : ""}`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-stone-900 border-none">
                        {kot.id}
                      </td>
                      <td className="py-3 px-4 border-none text-stone-800">
                        WebRajya POS
                      </td>
                      <td className="py-3 px-4 border-none">
                        <span className="font-mono bg-stone-100/80 px-2 py-0.5 rounded border border-stone-200/50 text-stone-700 text-[11px] font-bold">
                          T-{kot.tableNumber}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center border-none">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider font-mono ${
                          kot.orderType === "dine-in" ? "bg-indigo-50 border border-indigo-200/20 text-indigo-700" :
                          kot.orderType === "takeaway" ? "bg-amber-50 border border-amber-200/20 text-amber-700" :
                          "bg-purple-50 border border-purple-200/20 text-purple-700"
                        }`}>
                          {kot.orderType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold text-stone-800 border-none">
                        {itemCount}
                      </td>
                      <td className="py-3 px-4 border-none">
                        {getStatusBadge(kot.status)}
                      </td>
                      <td className="py-3 px-4 border-none">
                        {getPrintBadge(kot.printed)}
                      </td>
                      <td className="py-3 px-4 text-stone-500 font-mono border-none text-[11px]">
                        {createdTime}
                      </td>
                      <td className="py-3 px-4 text-right border-none">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedKot(kot)}
                            title="View Complete KOT Details"
                            className="p-1.5 h-8 w-8 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-600 transition flex items-center justify-center border border-stone-200/40 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          
                          <button
                            onClick={() => handleReprint(kot)}
                            title="Re-Spool Printer Job"
                            className="p-1.5 h-8 w-8 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition flex items-center justify-center border border-indigo-200/30 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setPreviewKot(kot)}
                            title="Thermal POS Receipt Preview"
                            className="p-1.5 h-8 w-8 rounded-lg bg-stone-50 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200/50 text-stone-500 transition flex items-center justify-center border border-stone-200/40 cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
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

      {/* Side Drawer details sheet */}
      <AnimatePresence>
        {selectedKot && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedKot(null)}
              className="fixed inset-0 bg-black/50 z-50 backdrop-blur-xs"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#FAF9F6] border-l border-stone-200 z-50 shadow-2xl p-6 flex flex-col justify-between text-stone-850"
            >
              <div className="space-y-6 overflow-y-auto pr-1">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-stone-150 pb-4">
                  <div>
                    <h4 className="text-xs font-mono font-bold text-[#aa7c11] uppercase tracking-widest">{selectedKot.orderType} Ticket</h4>
                    <h3 className="font-serif font-black text-stone-900 text-lg uppercase tracking-wide">KOT #{selectedKot.id}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedKot(null)}
                    className="p-2 bg-stone-100 hover:bg-stone-200 rounded-full text-stone-550 transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-4 bg-white/70 border border-stone-250/20 p-4 rounded-2xl text-xs shadow-xs">
                  <div>
                    <span className="text-stone-400 font-mono text-[10px] uppercase block">Restaurant Store</span>
                    <span className="font-bold text-stone-800">WebRajya POS Central</span>
                  </div>
                  <div>
                    <span className="text-stone-400 font-mono text-[10px] uppercase block">Seated Table</span>
                    <span className="font-mono font-black text-stone-900 bg-stone-100 border border-stone-200 px-2.5 py-0.5 rounded">T-{selectedKot.tableNumber}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 font-mono text-[10px] uppercase block">Guest Identity</span>
                    <span className="font-medium text-stone-800">{selectedKot.customerName || "Walk-In Guest"}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 font-mono text-[10px] uppercase block">Created Timestamp</span>
                    <span className="font-mono text-stone-600">{new Date(selectedKot.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-3 bg-white/70 border border-stone-250/20 p-4 rounded-2xl text-xs shadow-xs justify-between">
                  <div>
                    <span className="text-stone-400 font-mono text-[10px] uppercase block mb-1">Kitchen Status</span>
                    {getStatusBadge(selectedKot.status)}
                  </div>
                  <div>
                    <span className="text-stone-400 font-mono text-[10px] uppercase block mb-1">Spool POS Dispatch</span>
                    {getPrintBadge(selectedKot.printed)}
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-[#aa7c11] border-b border-stone-200/60 pb-1 font-bold">Culinary Dishes Required</h4>
                  <div className="space-y-2">
                    {selectedKot.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white border border-stone-150 p-3 rounded-xl text-xs font-sans">
                        <div>
                          <p className="font-bold text-stone-900">{item.name}</p>
                          {item.customization && (
                            <p className="text-[10px] text-amber-650 font-medium italic mt-0.5">Note: {item.customization}</p>
                          )}
                        </div>
                        <span className="font-mono bg-stone-100 border border-stone-200 font-black text-stone-800 px-2 py-0.5 rounded">
                          x{item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Special instructions */}
                <div className="p-4 bg-amber-50/50 border border-amber-250/30 rounded-2xl space-y-1.5">
                  <h4 className="text-[10px] mt-1 font-mono uppercase tracking-wider text-amber-750 font-bold">Special Kitchen Instructions</h4>
                  <p className="text-xs text-stone-650 italic leading-relaxed">
                    {selectedKot.specialInstructions || "None specified by customer."}
                  </p>
                </div>
              </div>

              {/* Drawer actions */}
              <div className="border-t border-stone-200/80 pt-4 flex gap-2">
                <button
                  onClick={() => {
                    handleReprint(selectedKot);
                    setSelectedKot(null);
                  }}
                  className="flex-1 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs uppercase font-bold tracking-widest flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md"
                >
                  <Printer className="w-3.5 h-3.5" /> Restart Printing Job
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* POS Thermal Receipt Modal */}
      <AnimatePresence>
        {previewKot && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewKot(null)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="fixed inset-0 m-auto w-full max-w-sm h-fit max-h-[85vh] bg-white border border-stone-200 rounded-3xl z-50 p-6 shadow-2xl flex flex-col justify-between space-y-4"
            >
              {/* Header controls for thermal sizes */}
              <div className="flex items-center justify-between border-b border-stone-150 pb-3">
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
                
                <button
                  onClick={() => setPreviewKot(null)}
                  className="p-1.5 bg-stone-100 hover:bg-stone-200 rounded-full text-stone-500 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Thermal Paper roll viewport */}
              <div className="flex-1 overflow-y-auto px-4 py-6 bg-stone-50 border border-stone-200 rounded-2xl flex justify-center">
                <div 
                  className="bg-white p-5 border border-stone-300 shadow-md font-mono text-[11px] leading-relaxed relative flex flex-col items-center"
                  style={{ width: previewWidth === "58mm" ? "210px" : "280px" }}
                >
                  {/* Jagged paper edge decorations top and bottom */}
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-stone-200/30 to-transparent" />
                  
                  {/* Brand header */}
                  <span className="font-black text-xs block text-stone-950 uppercase tracking-widest text-center">WEBRAJYA POS</span>
                  <span className="text-[9px] text-stone-500 text-center block mb-2">PURE VEGETARIAN SPLENDOR</span>
                  
                  <div className="w-full border-t border-dashed border-stone-400 my-1.5" />

                  {/* KOT Number */}
                  <div className="w-full flex justify-between font-bold text-stone-900">
                    <span>KOT ID:</span>
                    <span>{previewKot.id}</span>
                  </div>
                  
                  {/* Table details */}
                  <div className="w-full flex justify-between font-bold text-stone-900 mt-1">
                    <span>TABLE NUMBER:</span>
                    <span>T-{previewKot.tableNumber}</span>
                  </div>

                  {/* Order type */}
                  <div className="w-full flex justify-between font-bold text-stone-900 mt-1">
                    <span>ORDER TYPE:</span>
                    <span className="uppercase">{previewKot.orderType}</span>
                  </div>

                  <div className="w-full border-t border-dashed border-stone-400 my-1.5" />

                  {/* Items */}
                  <div className="w-full text-left font-bold text-stone-850 mb-1 font-mono uppercase tracking-wide text-[10px]">REQUIRED DISHES</div>
                  <div className="w-full space-y-1 text-stone-800 text-[10px]">
                    {previewKot.items.map((item, idx) => (
                      <div key={idx} className="w-full flex justify-between items-start">
                        <span className="text-left font-bold">{item.quantity} x {item.name}</span>
                        {item.customization && (
                          <div className="text-[8px] text-stone-500 italic ml-4 block">- {item.customization}</div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="w-full border-t border-dashed border-stone-400 my-1.5" />

                  {/* Special notes */}
                  <div className="w-full text-left font-mono text-[9px] text-stone-605">
                    <span className="font-bold block text-stone-800 text-[10px]">KITCHEN NOTES:</span>
                    <p className="italic leading-relaxed">{previewKot.specialInstructions || "No onion garlic special instructions requested."}</p>
                  </div>

                  <div className="w-full border-t border-dashed border-stone-400 my-1.5" />

                  <div className="w-full flex justify-between text-[9px] text-stone-550">
                    <span>PRINT STATE:</span>
                    <span className="font-bold text-emerald-700">{previewKot.printed ? "SUCCESS (ONLINE)" : "PENDING SPOOL"}</span>
                  </div>

                  <div className="w-full border-t border-dashed border-stone-400 my-2" />

                  <span className="text-[10px] font-extrabold text-stone-900 text-center uppercase tracking-widest">--- KITCHEN COPY ---</span>
                </div>
              </div>

              {/* Action options */}
              <button
                onClick={() => {
                  handleReprint(previewKot);
                  setPreviewKot(null);
                }}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition shadow-md cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> Print Thermal Ticket
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
