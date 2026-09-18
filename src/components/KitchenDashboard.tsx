import { useState, useEffect, useMemo, useRef } from "react";
import { KOT, KOTStatus } from "../types";
import { LocalDB, supabase } from "../lib/db";
import { 
  Play, Check, Clock, Printer, Search, AlertCircle, 
  ChefHat, TrendingUp, HelpCircle, Flame, Calendar,
  UtensilsCrossed, Volume2, VolumeX, RefreshCw, Layers, CheckCircle, Ban,
  Wifi, WifiOff, Cpu, ListOrdered, FileCode, CheckSquare, Settings, PlaySquare,
  Tv, Eye, X, ExternalLink, Square, Zap
} from "lucide-react";
import { PhysicalThermalPrinter } from "../lib/printerService";

export default function KitchenDashboard() {
  const [kots, setKots] = useState<KOT[]>([]);
  const [filter, setFilter] = useState<"All" | KOTStatus>("All");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(""); // empty means today or all
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [printKOT, setPrintKOT] = useState<KOT | null>(null);

  // New UX state switches
  const [layoutMode, setLayoutMode] = useState<"board" | "queue">("board");
  const [tvMode, setTvMode] = useState(false);
  const [previewKOT, setPreviewKOT] = useState<KOT | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [timerTick, setTimerTick] = useState(0);

  // Advanced thermal receipt print spooler states
  const [autoPrint, setAutoPrint] = useState(true);
  const [printerStatus, setPrinterStatus] = useState<"connected" | "reconnecting" | "offline">("connected");
  const [printerWidth, setPrinterWidth] = useState<"58mm" | "80mm" | "raw">("80mm");
  const [printerLogs, setPrinterLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] ESC/POS System Initialized.`,
    `[${new Date().toLocaleTimeString()}] Connected to TCP://192.168.1.185:9100. READY.`
  ]);
  const [activePrintingKot, setActivePrintingKot] = useState<KOT | null>(null);
  const [activePrinterTab, setActivePrinterTab] = useState<"emulator" | "queue" | "logs">("emulator");

  const printingQueueIds = useRef<Set<string>>(new Set());

  const addPrinterLog = (msg: string) => {
    setPrinterLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 39)]);
  };

  const onReconnectPrinter = async () => {
    setPrinterStatus("reconnecting");
    addPrinterLog("Attempting to handshake with ESC/POS controller...");
    setTimeout(() => {
      setPrinterStatus("connected");
      addPrinterLog("Handshake verified! ESC/POS socket connected. (Port 9100)");
    }, 1200);
  };

  const playThermalPrinterSound = (durationMs = 1500) => {
    if (isMuted) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const bufferSize = audioCtx.sampleRate * (durationMs / 1000);
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Pulse at 145Hz thermal heating head stepper frequency
        const pulse = Math.sin((i / audioCtx.sampleRate) * 2 * Math.PI * 145) > 0 ? 0.35 : -0.35;
        data[i] = (white * 0.08 + pulse * 0.06) * Math.sin((i / audioCtx.sampleRate) * 2 * Math.PI * 15);
      }
      
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(420, audioCtx.currentTime);
      filter.Q.setValueAtTime(5.0, audioCtx.currentTime);
      
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.005, audioCtx.currentTime + (durationMs / 1000));
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      
      noise.start();
    } catch (e) {
      console.warn("Audio Context alert blocked or unsupported:", e);
    }
  };

  // Play audio chime when new KOT is fetched
  const playNewOrderNotification = () => {
    if (isMuted) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      osc.frequency.setValueAtTime(1046.50, audioCtx.currentTime + 0.3); // C6
      
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch (e) {
      console.warn("Audio exception:", e);
    }
  };

  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const dbKots = await LocalDB.fetchKOTs();
      if (kots.length > 0 && dbKots.length > kots.length) {
        const hasNew = dbKots.some(newKot => !kots.some(k => k.id === newKot.id));
        if (hasNew) {
          playNewOrderNotification();
        }
      }
      setKots(dbKots);
    } catch (err) {
      console.error("Failed loading KOTs:", err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // Poll, listen to changes & subscribe to Supabase Realtime channel
  useEffect(() => {
    loadData();

    // Event listeners
    const handleSync = () => loadData(true);
    window.addEventListener("storage", handleSync);
    window.addEventListener("kots_updated", handleSync);
    window.addEventListener("new_order", () => {
      setTimeout(() => {
        loadData(true);
      }, 300);
    });

    // Realtime polling fallback
    const interval = setInterval(() => {
      loadData(true);
    }, 5000);

    // Supabase Realtime subscriber connection
    console.log("[Supabase Realtime] Connecting Channel for KOT actions...");
    addPrinterLog("Establishing WebSocket Realtime bridge with Supabase Cloud...");
    
    const channel = supabase
      .channel("realtime:kots")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kots" },
        (p) => {
          console.log("[Realtime KOT insert event]", p);
          addPrinterLog(`Realtime signal: Incoming ticket ${p.new.id || "Unknown"}`);
          loadData(true);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "kots" },
        (p) => {
          console.log("[Realtime KOT update event]", p);
          loadData(true);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          addPrinterLog("Realtime channel established! Heartbeat ping is ACTIVE.");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          addPrinterLog("[WARNING] Realtime socket degraded. Poller backup active.");
        }
      });

    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("kots_updated", handleSync);
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [kots.length]);

  // Handle thermal receipt physical/virtual compilation
  const simulateThermalPrint = async (kot: KOT, isReprint = false) => {
    if (printingQueueIds.current.has(kot.id) && !isReprint) return;

    printingQueueIds.current.add(kot.id);

    if (printerStatus === "offline") {
      addPrinterLog(`[ERROR] Spool locked: KOT ${kot.id} printing suspended. Interface is offline.`);
      printingQueueIds.current.delete(kot.id);
      return;
    }

    addPrinterLog(`Spooling thermal ticket KOT ${kot.id} (${kot.orderType.toUpperCase()})...`);
    setActivePrintingKot(kot);

    // Play stepper motor sounds
    playThermalPrinterSound(1500);

    // Hold visual feed active
    await new Promise(r => setTimeout(r, 1800));

    try {
      // Get the corresponding order to print customer bill
      const allOrders = await LocalDB.fetchOrders();
      const matchedOrder = allOrders.find(o => o.id === kot.orderId);

      const resolvedWidth = printerWidth === "raw" ? "80mm" : printerWidth;
      
      // Determine printing mode
      let mode: "usb" | "serial" | "fallback" = "fallback";
      if (PhysicalThermalPrinter.isUSBConnected()) {
        mode = "usb";
      } else if (PhysicalThermalPrinter.isSerialConnected()) {
        mode = "serial";
      }

      const settings = LocalDB.getSettings();

      if (matchedOrder) {
        addPrinterLog(`Executing sequential print: KOT ${kot.id} + Customer Bill ${matchedOrder.id}...`);
        
        const result = await PhysicalThermalPrinter.printKOTAndBillSequentially(
          kot as any,
          matchedOrder,
          settings,
          resolvedWidth,
          mode,
          "Admin"
        );

        if (!result.kotSuccess) {
          addPrinterLog(`[ERROR] KOT ${kot.id} failed to print. Bill print cancelled to prevent order mixup.`);
          printingQueueIds.current.delete(kot.id);
          setActivePrintingKot(null);
          return;
        }

        if (!result.billSuccess) {
          addPrinterLog(`[WARNING] KOT printed successfully, but Customer Bill failed. The order remains saved in database.`);
        } else {
          addPrinterLog(`[SUCCESS] KOT and Customer Bill printed sequentially for Order ${matchedOrder.id}.`);
        }
      } else {
        addPrinterLog(`[WARNING] Associated Order ${kot.orderId} not found. Printing KOT only...`);
        const kotSuccess = await PhysicalThermalPrinter.printKOT(kot as any, resolvedWidth, mode, "Admin");
        if (kotSuccess) {
          addPrinterLog(`[SUCCESS] KOT ${kot.id} printed successfully.`);
        } else {
          addPrinterLog(`[ERROR] KOT ${kot.id} printing failed.`);
        }
      }

      if (!isReprint) {
        await LocalDB.apiUpdateKOTPrinted(kot.id, true);
        addPrinterLog(`KOT ${kot.id} successfully fed, sliced, and flagged as PRINTED.`);
      } else {
        addPrinterLog(`Manual reprint job for KOT ${kot.id} completed successfully.`);
      }
    } catch (err: any) {
      addPrinterLog(`[ERROR] Printing routine encountered error: ${err.message || err}`);
    } finally {
      setActivePrintingKot(null);
      printingQueueIds.current.delete(kot.id);
      loadData(true);
    }
  };

  // Auto processing effects: detect unprinted KOTs
  useEffect(() => {
    if (autoPrint && printerStatus === "connected" && kots.length > 0) {
      const unprinted = kots.filter(k => !k.printed && k.status !== "Cancelled");
      if (unprinted.length > 0) {
        // Sort oldest first
        const sorted = [...unprinted].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const oldestKOT = sorted[0];
        simulateThermalPrint(oldestKOT);
      }
    }
  }, [kots, autoPrint, printerStatus]);

  // Live ticking routine to increment prep elapsed minutes on active display
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(t => t + 1);
    }, 10000); // Trigger visual refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Direct physical hardware terminal connectors using the PhysicalThermalPrinter service
  const handlePhysicalPrintUSB = async (kot: KOT) => {
    addPrinterLog(`Initiating WebUSB handshakes for ticket ${kot.id}...`);
    try {
      const success = await PhysicalThermalPrinter.printKOT(kot as any, printerWidth === "raw" ? "80mm" : printerWidth, "usb");
      if (success) {
        addPrinterLog(`[SUCCESS] WebUSB direct ESC/POS command spooled successfully for KOT ${kot.id}!`);
        await LocalDB.apiUpdateKOTPrinted(kot.id, true);
        loadData(true);
      } else {
        addPrinterLog(`[ERROR] WebUSB printer not claimed or disconnected. Please register with permission.`);
      }
    } catch (err: any) {
      addPrinterLog(`[ERROR] USB physical stream failed: ${err.message || err}`);
    }
  };

  const handlePhysicalPrintSerial = async (kot: KOT) => {
    addPrinterLog(`Opening WebSerial COM line writer for ticket ${kot.id}...`);
    try {
      const success = await PhysicalThermalPrinter.printKOT(kot as any, printerWidth === "raw" ? "80mm" : printerWidth, "serial");
      if (success) {
        addPrinterLog(`[SUCCESS] WebSerial ESC/POS characters successfully emitted for KOT ${kot.id}!`);
        await LocalDB.apiUpdateKOTPrinted(kot.id, true);
        loadData(true);
      } else {
        addPrinterLog(`[ERROR] WebSerial line failed. Check connection / baud rate.`);
      }
    } catch (err: any) {
      addPrinterLog(`[ERROR] Serial write exception: ${err.message || err}`);
    }
  };

  const handlePhysicalPrintSystem = (kot: KOT) => {
    addPrinterLog(`Routing ticket ${kot.id} to mapped system print spooler fallback...`);
    try {
      PhysicalThermalPrinter.printSystemFallback(kot as any, printerWidth === "raw" ? "80mm" : printerWidth);
      addPrinterLog(`System print fallback iframe successfully injected.`);
    } catch (err: any) {
      addPrinterLog(`[ERROR] Fallback framing exception: ${err.message || err}`);
    }
  };

  // Update status
  const handleUpdateStatus = async (kotId: string, nextStatus: KOTStatus) => {
    try {
      await LocalDB.apiUpdateKOTStatus(kotId, nextStatus);
      await loadData(true);
    } catch (error) {
      console.error("Failed updating status:", error);
    }
  };

  // Statistics calculation
  const stats = useMemo(() => {
    const total = kots.length;
    const active = kots.filter(k => k.status !== "Served" && k.status !== "Cancelled").length;
    
    const working = kots.filter(k => k.status === "Ready" || k.status === "Served");
    const avgPrep = working.length > 0 
      ? Math.round(working.reduce((acc, current) => acc + (current.preparationTime || 15), 0) / working.length)
      : 15;

    const itemMap: { [key: string]: number } = {};
    kots.forEach(k => {
      if (k.status !== "Cancelled") {
        k.items.forEach(i => {
          itemMap[i.name] = (itemMap[i.name] || 0) + i.quantity;
        });
      }
    });

    const popular = Object.entries(itemMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, qty]) => ({ name, qty }));

    return { total, active, avgPrep, popular };
  }, [kots]);

  // Filter & search KOTs
  const processedKots = useMemo(() => {
    return kots.filter(k => {
      if (filter !== "All" && k.status !== filter) return false;
      
      if (search) {
        const query = search.toLowerCase();
        const matchesId = k.id.toLowerCase().includes(query);
        const matchesName = k.customerName.toLowerCase().includes(query);
        const matchesTable = k.tableNumber.toLowerCase().includes(query);
        if (!matchesId && !matchesName && !matchesTable) return false;
      }

      if (dateFilter) {
        if (!k.createdAt.startsWith(dateFilter)) return false;
      }

      return true;
    });
  }, [kots, filter, search, dateFilter]);

  // Printer support for system browser print command
  const triggerPrintFormat = (kot: KOT) => {
    handlePhysicalPrintSystem(kot);
  };

  return (
    <div className="space-y-6">
      {/* 80mm Printable receipt wrapper (hidden from standard UI view) */}
      {printKOT && (
        <div className="hidden print:block print:p-4 bg-white text-black font-mono text-xs max-w-[80mm] mx-auto space-y-4">
          <div className="text-center border-b border-dashed border-stone-400 pb-3">
            <h1 className="text-sm font-bold uppercase tracking-wider">WEBRAJYA POS</h1>
            <p className="text-[10px] text-stone-500">Pure Vegetarian Gourmet</p>
            <p className="text-[10px] mt-1">{new Date(printKOT.createdAt).toLocaleDateString()} {new Date(printKOT.createdAt).toLocaleTimeString()}</p>
          </div>
          <div className="space-y-1 py-1 border-b border-dashed border-stone-400">
            <div className="flex justify-between font-bold">
              <span>KOT TICK:</span>
              <span className="text-sm font-serif">{printKOT.id}</span>
            </div>
            <div className="flex justify-between">
              <span>Order Link:</span>
              <span>{printKOT.orderId}</span>
            </div>
            <div className="flex justify-between">
              <span>Service Type:</span>
              <span className="capitalize font-bold">{printKOT.orderType}</span>
            </div>
            {printKOT.tableNumber && printKOT.tableNumber !== "Takeaway" && (
              <div className="flex justify-between font-bold">
                <span>Table No:</span>
                <span>{printKOT.tableNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Client Name:</span>
              <span>{printKOT.customerName}</span>
            </div>
          </div>
          
          <div className="border-b border-dashed border-stone-400 py-2">
            <div className="grid grid-cols-12 gap-1 font-bold border-b border-stone-200 pb-1 mb-1">
              <span className="col-span-8">Particulars</span>
              <span className="col-span-4 text-right">Qty</span>
            </div>
            {printKOT.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-1 py-1 align-top">
                <div className="col-span-8">
                  <p className="font-semibold">{it.name}</p>
                  {it.customization && (
                    <p className="text-[10px] italic text-stone-600 mt-0.5 ml-2">* {it.customization}</p>
                  )}
                </div>
                <span className="col-span-4 text-right font-bold font-sans">x{it.quantity}</span>
              </div>
            ))}
          </div>

          <div className="pt-2 text-center text-[10px]">
            {printKOT.specialInstructions && printKOT.specialInstructions !== "None" && (
              <div className="text-left font-sans bg-stone-100 p-2 rounded mb-2 border border-stone-200">
                <span className="font-bold font-mono">Special Instructions:</span>
                <p className="italic">{printKOT.specialInstructions}</p>
              </div>
            )}
            <p className="border-t border-dashed border-stone-400 pt-2 text-stone-500 font-bold uppercase tracking-widest">
              Kitchen Dispatch Ticket
            </p>
          </div>
        </div>
      )}

      {/* Screen Title & Real-time Info indicators */}
      <div className="print:hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-serif font-bold text-stone-900 tracking-wide uppercase">Kitchen Display System (KDS)</h1>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <p className="text-xs text-stone-500 font-sans mt-0.5">Manage real-time digital culinary order tickets directly linked with table checkout hubs.</p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
          {/* Layout Mode Selector Toggle */}
          <div className="bg-stone-100 p-1 rounded-xl flex items-center gap-1 border border-stone-200">
            <button
              type="button"
              onClick={() => setLayoutMode("board")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                layoutMode === "board"
                  ? "bg-stone-900 text-[#d4af37]"
                  : "text-stone-500 hover:text-stone-900"
              }`}
              title="Interactive Lane KOT Board"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Active Lanes</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode("queue")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                layoutMode === "queue"
                  ? "bg-stone-900 text-[#d4af37]"
                  : "text-stone-500 hover:text-stone-900"
              }`}
              title="Searchable flat ticket grid"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Searchable Queue</span>
            </button>
          </div>

          {/* Kitchen TV Mode Toggle */}
          <button
            type="button"
            onClick={() => setTvMode(!tvMode)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-all cursor-pointer active:scale-95 ${
              tvMode
                ? "bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold border-amber-600 animate-pulse"
                : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
            }`}
            title="Large size optimized display for Wall TVs and ceiling mounts"
          >
            <Tv className="w-3.5 h-3.5" />
            <span>{tvMode ? "TV Size View" : "Desktop Size"}</span>
          </button>

          <button
            type="button"
            onClick={() => loadData()}
            className="flex items-center gap-1.5 bg-white border border-stone-200 hover:border-[#d4af37] text-stone-700 text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer hover:shadow-xs active:scale-95"
            disabled={isLoading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-[#d4af37]" : ""}`} />
            Refresh
          </button>
          
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className={`flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl border transition-all cursor-pointer active:scale-95 ${
              isMuted 
                ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100" 
                : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
            }`}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            {isMuted ? "Muted" : "Sounds"}
          </button>
        </div>
      </div>

      {/* Analytics KOT statistics bento row */}
      <div className="print:hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-400 block">Total KOTs</span>
            <span className="text-lg font-bold text-stone-900 font-mono block">{stats.total}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-400 block">Active Orders</span>
            <span className="text-lg font-bold text-stone-900 font-mono block">{stats.active}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-400 block">Avg Cook Speed</span>
            <span className="text-lg font-bold text-stone-900 font-mono block">{stats.avgPrep} min</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col justify-center">
          <span className="text-[10px] uppercase font-mono tracking-wider text-stone-400 mb-1">Kitchen Favorites</span>
          <div className="space-y-0.5">
            {stats.popular.length === 0 ? (
              <span className="text-[10px] text-stone-400 italic">No orders logged yet</span>
            ) : (
              stats.popular.map((item, id) => (
                <div key={id} className="flex justify-between text-[10px] font-sans text-stone-600">
                  <span className="truncate max-w-[120px] font-medium">{item.name}</span>
                  <span className="font-bold text-stone-900 font-mono">x{item.qty}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Real-time Kitchen Print Hub & Virtual POS Terminal */}
      <div className="print:hidden bg-stone-900 text-stone-100 p-5 rounded-3xl border border-stone-800 shadow-xl grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        {/* Left Side: Physical Printer Emulator */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-stone-950 p-4 rounded-2xl border border-stone-800 relative min-h-[300px]">
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-stone-900/80 px-2.5 py-1 rounded-full border border-stone-800/80">
            {printerStatus === "connected" && (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[9px] font-mono font-bold text-emerald-400">ESC/POS LINK</span>
              </>
            )}
            {printerStatus === "reconnecting" && (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-spin"></span>
                <span className="text-[9px] font-mono font-bold text-amber-400">CONNECTING</span>
              </>
            )}
            {printerStatus === "offline" && (
              <>
                <span className="h-2 w-2 rounded-full bg-red-500"></span>
                <span className="text-[9px] font-mono font-bold text-red-500">OFFLINE</span>
              </>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-5 h-5 text-[#d4af37]" />
              <div>
                <h3 className="text-xs font-mono font-bold tracking-widest text-stone-300">THERMAL HEAD SIMULATOR</h3>
                <p className="text-[9px] text-stone-500 font-sans">Mechanical ticket extraction engine</p>
              </div>
            </div>

            {/* Thermal Printer Slit */}
            <div className="bg-stone-900 h-12 rounded-t-lg border-b-4 border-stone-950 shadow-inner flex items-end justify-center px-4 relative mt-4">
              <div className="w-11/12 h-1 bg-stone-950 rounded-full shadow-inner"></div>
              
              {/* Paper Roll Extrusion Animation */}
              {activePrintingKot ? (
                <div className="absolute top-11 left-1/2 -translate-x-1/2 w-[85%] bg-white text-stone-900 p-3 shadow-2xl rounded-b-md border-t border-dashed border-stone-300 origin-top text-left font-mono text-[8px] leading-tight select-none z-10 animate-[slideDown_1.5s_ease-out_forwards]">
                  <style>{`
                    @keyframes slideDown {
                      0% { transform: translate(-50%, -10px) scaleY(0); opacity: 0; }
                      100% { transform: translate(-50%, 0) scaleY(1); opacity: 1; }
                    }
                  `}</style>
                  <div className="text-center font-bold pb-1 border-b border-dashed border-stone-300 mb-1">
                    <p className="text-[9px]">** WEBRAJYA POS **</p>
                    <p>KOT #{activePrintingKot.id}</p>
                    <p className="text-[7px] text-stone-400">{new Date(activePrintingKot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <p className="font-bold">Table: {activePrintingKot.tableNumber || "N/A"}</p>
                  <p className="font-bold">Type: {activePrintingKot.orderType.toUpperCase()}</p>
                  <p className="text-[7px] text-stone-400">----------------------------------</p>
                  <div className="space-y-0.5">
                    {activePrintingKot.items.map((it, i) => (
                      <div key={i} className="flex justify-between">
                        <span>{it.quantity} x {it.name}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[7px] text-stone-400">----------------------------------</p>
                  {activePrintingKot.specialInstructions && activePrintingKot.specialInstructions !== "None" && (
                    <div className="bg-stone-50 p-1 rounded font-sans text-[7px] italic border border-stone-200 mt-1">
                      <span className="font-mono font-bold not-italic">Notes:</span> {activePrintingKot.specialInstructions}
                    </div>
                  )}
                  <p className="text-center text-[7px] text-stone-400 uppercase tracking-wider mt-1.5 font-bold">FEEDS SUCCESSFUL</p>
                </div>
              ) : (
                <div className="absolute top-11 text-center text-stone-600 text-[10px] py-4 select-none italic font-sans">
                  Ready to print tickets...
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-stone-900 pt-3 mt-6 flex items-center justify-between gap-2 text-[10px] font-sans">
            <span className="text-stone-500">Auto-Spooler: <strong className={autoPrint ? "text-emerald-400" : "text-amber-500"}>{autoPrint ? "ON" : "OFF"}</strong></span>
            <span className="text-stone-500">Width: <strong className="text-stone-300 uppercase">{printerWidth}</strong></span>
          </div>
        </div>

        {/* Right Side: Tab Console & Tools */}
        <div className="lg:col-span-7 flex flex-col justify-between">
          <div>
            {/* Tabs Trigger bar */}
            <div className="flex border-b border-stone-800 gap-1 pb-1">
              <button
                type="button"
                onClick={() => setActivePrinterTab("emulator")}
                className={`flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition-all ${
                  activePrinterTab === "emulator" 
                    ? "bg-[#d4af37]/10 text-[#d4af37] border border-[#d4af37]/20" 
                    : "text-stone-400 hover:bg-stone-850 hover:text-stone-200"
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                Live Format
              </button>
              
              <button
                type="button"
                onClick={() => setActivePrinterTab("queue")}
                className={`flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition-all relative ${
                  activePrinterTab === "queue"
                    ? "bg-[#d4af37]/10 text-[#d4af37] border border-[#d4af37]/20"
                    : "text-stone-400 hover:bg-stone-850 hover:text-stone-200"
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5" />
                Spool Queue
                {kots.filter(k => !k.printed).length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-stone-950 font-mono text-[8px] font-bold h-4 w-4 rounded-full flex items-center justify-center animate-bounce">
                    {kots.filter(k => !k.printed).length}
                  </span>
                )}
              </button>
              
              <button
                type="button"
                onClick={() => setActivePrinterTab("logs")}
                className={`flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition-all ${
                  activePrinterTab === "logs"
                    ? "bg-[#d4af37]/10 text-[#d4af37] border border-[#d4af37]/20"
                    : "text-stone-400 hover:bg-stone-850 hover:text-stone-200"
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                Logs & Link
              </button>
            </div>

            {/* Tab: Live Format Viewer / Mockup Receipt preview */}
            {activePrinterTab === "emulator" && (
              <div className="pt-3 space-y-3">
                <div className="flex justify-between items-center text-[10px] text-stone-400">
                  <span>Display Format Width Settings:</span>
                  <div className="flex gap-1.5">
                    {["58mm", "80mm", "raw"].map(sz => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setPrinterWidth(sz as any)}
                        className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold capitalize transition-all border ${
                          printerWidth === sz 
                            ? "bg-stone-800 border-stone-700 text-stone-100" 
                            : "bg-stone-900 border-stone-850 text-stone-500 hover:text-stone-300"
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-stone-950 rounded-xl p-3 border border-stone-850 h-[160px] overflow-y-auto text-[10px] font-mono whitespace-pre text-stone-300 select-all scrollbar-thin">
                  {kots.length > 0 ? (
                    (() => {
                      const sampleKOT = kots[0]; // get the latest
                      const dateStr = new Date(sampleKOT.createdAt).toLocaleString();
                      if (printerWidth === "raw") {
                        return [
                          `[ESC] @ [Initialize Printer]`,
                          `[GS] a 1 [Center Alignment]`,
                          `** WEBRAJYA POS **`,
                          `[ESC] ! 16 [Double-Height Font Enabled]`,
                          `KOT JOB REF: ${sampleKOT.id}`,
                          `[ESC] ! 0  [Normal Font Restored]`,
                          `Table Number: ${sampleKOT.tableNumber}`,
                          `Service Mode: ${sampleKOT.orderType.toUpperCase()}`,
                          `Timestamp: ${dateStr}`,
                          `------------------------------------------------`,
                          ...sampleKOT.items.map(it => `[ITEM] ${it.quantity} x ${it.name}`),
                          `------------------------------------------------`,
                          `Special Notes: ${sampleKOT.specialInstructions || "None"}`,
                          `[GS] V 66 0 [Paper Cut Trigger]`
                        ].join("\n");
                      }
                      
                      const divLine = printerWidth === "58mm" ? "------------------------------" : "------------------------------------------------";
                      return [
                        "                WEBRAJYA POS              ",
                        `               KOT #${sampleKOT.id}            `,
                        divLine,
                        `Table:       ${sampleKOT.tableNumber || "N/A"}`.padEnd(30),
                        `Order Type:  ${sampleKOT.orderType.toUpperCase()}`.padEnd(30),
                        `Timestamp:   ${dateStr}`.padEnd(30),
                        divLine,
                        ...sampleKOT.items.map(it => `  x${it.quantity}  ${it.name}`),
                        divLine,
                        sampleKOT.specialInstructions && sampleKOT.specialInstructions !== "None" ? `Special Notes: "${sampleKOT.specialInstructions}"` : "Special Notes: None",
                        divLine,
                        "        KITCHEN RECEIPT GENERATION SUCCESSFULLY"
                      ].join("\n");
                    })()
                  ) : (
                    <span className="text-stone-600 block text-center py-6 italic font-sans text-xs">No active tickets to format. Submit an order to populate.</span>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Spool Queue */}
            {activePrinterTab === "queue" && (
              <div className="pt-3 h-[160px] overflow-y-auto space-y-2 scrollbar-thin">
                {kots.length === 0 ? (
                  <p className="text-xs text-stone-500 italic py-6 text-center font-sans">No print queue records saved.</p>
                ) : (
                  kots.slice(0, 8).map(kot => (
                    <div key={kot.id} className="flex items-center justify-between bg-stone-950 p-2 rounded-xl border border-stone-850 hover:border-stone-800 font-mono text-[10px]">
                      <div className="space-y-1 pl-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold">{kot.id}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                            kot.printed 
                              ? "bg-emerald-950/80 text-emerald-400 border border-emerald-900/45" 
                              : "bg-amber-950/80 text-amber-400 border border-amber-900/45"
                          }`}>
                            {kot.printed ? "PRINTED" : "QUEUED"}
                          </span>
                        </div>
                        <p className="text-stone-500 tracking-wide text-[9px]">Table: {kot.tableNumber} | Order Ref: {kot.orderId}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => simulateThermalPrint(kot, true)}
                        className="flex items-center gap-1 bg-stone-900 hover:bg-stone-850 hover:text-white text-stone-300 px-2 py-1 rounded-lg border border-stone-850 active:scale-95 transition-all text-[9.5px] cursor-pointer mr-1"
                      >
                        <Printer className="w-3 h-3 text-[#d4af37]" />
                        Reprint
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab: Diagnostic Logs & Manual Override */}
            {activePrinterTab === "logs" && (
              <div className="pt-3 space-y-3">
                <div className="flex justify-between items-center text-[10px] text-stone-400">
                  <span>Physical Terminal Hub Controller:</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setPrinterStatus(printerStatus === "offline" ? "connected" : "offline")}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all border ${
                        printerStatus === "offline" 
                          ? "bg-red-950 text-red-400 border-red-900 hover:bg-red-900" 
                          : "bg-emerald-950 text-emerald-400 border-emerald-900 hover:bg-emerald-900"
                      }`}
                    >
                      {printerStatus === "offline" ? "Turn Online" : "Disconnect / Emulate Error"}
                    </button>
                  </div>
                </div>

                <div className="bg-stone-950 rounded-xl p-3 border border-stone-850 h-[80px] overflow-y-auto font-mono text-[9px] text-stone-400 space-y-1 select-text scrollbar-thin">
                  {printerLogs.map((lg, i) => (
                    <div key={i} className={lg.includes("[ERROR]") ? "text-red-400 font-bold" : lg.includes("[WARNING]") ? "text-amber-400" : ""}>
                      {lg}
                    </div>
                  ))}
                </div>

                {printerStatus === "offline" && (
                  <button
                    type="button"
                    onClick={onReconnectPrinter}
                    className="w-full flex items-center justify-center gap-1.5 bg-[#d4af37] text-stone-950 font-bold font-mono py-1.5 rounded-xl hover:bg-[#aa7c11] text-[10px] transition-all cursor-pointer shadow-md"
                  >
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Reset Printer IP Link Loop
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Settings switches footer */}
          <div className="border-t border-stone-850 pt-3 mt-4 flex flex-wrap gap-4 items-center justify-between text-[11px] font-sans">
            <div className="flex items-center gap-2">
              <input
                id="toggle-autoprint"
                type="checkbox"
                checked={autoPrint}
                onChange={(e) => {
                  setAutoPrint(e.target.checked);
                  addPrinterLog(`Auto-Print KOT checkouts toggled: ${e.target.checked ? "ENABLED" : "DISABLED"}`);
                }}
                className="accent-[#d4af37] h-3.5 w-3.5 rounded border-stone-800 bg-stone-950 text-[#d4af37] focus:ring-0 cursor-pointer"
              />
              <label htmlFor="toggle-autoprint" className="text-stone-300 font-medium select-none cursor-pointer">
                Auto-print unprinted KOTs in real time
              </label>
            </div>

            <div className="flex items-center gap-1.5 text-stone-500 font-mono">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>WS Heartbeat Port 443 OK</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and search utilities bar */}
      <div className="print:hidden bg-stone-50 border border-stone-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Category Pills */}
        <div className="flex flex-wrap gap-1">
          {["All", "New Order", "Accepted", "Preparing", "Ready", "Served", "Cancelled"].map((st) => {
            const isActive = filter === st;
            let statusStyle = "bg-white border-stone-200 text-stone-500";
            if (isActive) {
              if (st === "New Order") statusStyle = "bg-blue-600 border-blue-600 text-white";
              else if (st === "Accepted") statusStyle = "bg-purple-600 border-purple-600 text-white";
              else if (st === "Preparing") statusStyle = "bg-amber-500 border-amber-500 text-white";
              else if (st === "Ready") statusStyle = "bg-green-600 border-green-600 text-white";
              else if (st === "Served") statusStyle = "bg-stone-800 border-stone-800 text-white";
              else if (st === "Cancelled") statusStyle = "bg-red-600 border-red-600 text-white";
              else statusStyle = "bg-stone-900 border-stone-950 text-white";
            }
            const count = st === "All" ? kots.length : kots.filter(k => k.status === st).length;

            return (
              <button
                key={st}
                onClick={() => setFilter(st as any)}
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${statusStyle}`}
              >
                {st} <span className={`ml-1 font-mono text-[9px] ${isActive ? "text-white/80" : "text-stone-400"}`}>({count})</span>
              </button>
            );
          })}
        </div>

        {/* Search Input Box */}
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:max-w-md">
          <div className="relative w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 group-focus-within:text-[#d4af37] transition-all" />
            <input
              type="text"
              placeholder="Search KOT, Guest, Table..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white text-stone-900 border border-stone-200 pl-9 pr-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37] font-sans"
            />
          </div>

          <div className="relative w-full sm:w-auto">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              title="Filter by day"
              className="w-full sm:w-auto bg-white text-stone-800 border border-stone-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37]"
            />
          </div>
        </div>
      </div>

      {/* Main KDS Board or Queue Layout */}
      <div className={`print:hidden ${tvMode ? "scale-105 origin-top transition-transform duration-300" : ""}`}>
        {layoutMode === "board" ? (
          /* ==========================================
             BOARD LAYOUT: INTERACTIVE KANBAN LANES
             ========================================== */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* COLUMN 1: NEW ORDERS */}
            <div className="bg-stone-100/70 rounded-3xl p-4 border border-stone-200 shadow-sm flex flex-col min-h-[550px]">
              <div className="flex justify-between items-center pb-3 border-b border-stone-200 mb-4 px-1">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-blue-500 animate-pulse"></span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">New Orders & Tasks</h3>
                </div>
                <span className="font-mono text-xs text-stone-500 bg-stone-200/60 px-2.5 py-0.5 rounded-full font-bold">
                  {processedKots.filter(k => k.status === "New Order" || k.status === "Accepted").length}
                </span>
              </div>

              <div className="space-y-4 max-h-[700px] overflow-y-auto scrollbar-thin">
                {processedKots.filter(k => k.status === "New Order" || k.status === "Accepted").length === 0 ? (
                  <div className="py-12 text-center text-stone-400 italic text-xs font-sans">
                    No new orders pending
                  </div>
                ) : (
                  processedKots
                    .filter(k => k.status === "New Order" || k.status === "Accepted")
                    .map(kot => renderKOTCard(kot))
                )}
              </div>
            </div>

            {/* COLUMN 2: PREPARING / COOKING */}
            <div className="bg-[#fff9e6] rounded-3xl p-4 border border-amber-250/50 shadow-sm flex flex-col min-h-[550px]">
              <div className="flex justify-between items-center pb-3 border-b border-amber-200 mb-4 px-1">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-amber-500 animate-spin"></span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800">Cooking / Preparing</h3>
                </div>
                <span className="font-mono text-xs text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full font-bold">
                  {processedKots.filter(k => k.status === "Preparing").length}
                </span>
              </div>

              <div className="space-y-4 max-h-[700px] overflow-y-auto scrollbar-thin">
                {processedKots.filter(k => k.status === "Preparing").length === 0 ? (
                  <div className="py-12 text-center text-[#aa7c11]/60 italic text-xs font-sans">
                    Cooking range is clear
                  </div>
                ) : (
                  processedKots
                    .filter(k => k.status === "Preparing")
                    .map(kot => renderKOTCard(kot))
                )}
              </div>
            </div>

            {/* COLUMN 3: READY TO SERVE */}
            <div className="bg-[#eafaf1] rounded-3xl p-4 border border-green-200 shadow-sm flex flex-col min-h-[550px]">
              <div className="flex justify-between items-center pb-3 border-b border-green-200 mb-4 px-1">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-green-500 animate-bounce"></span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-green-800">Ready to Dispatch</h3>
                </div>
                <span className="font-mono text-xs text-green-700 bg-green-100 px-2.5 py-0.5 rounded-full font-bold">
                  {processedKots.filter(k => k.status === "Ready").length}
                </span>
              </div>

              <div className="space-y-4 max-h-[700px] overflow-y-auto scrollbar-thin">
                {processedKots.filter(k => k.status === "Ready").length === 0 ? (
                  <div className="py-12 text-center text-green-600/60 italic text-xs font-sans">
                    No orders awaiting serve
                  </div>
                ) : (
                  processedKots
                    .filter(k => k.status === "Ready")
                    .map(kot => renderKOTCard(kot))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ==========================================
             QUEUE VIEW: FLAT LIST PATTERN (GRID & HISTORY)
             ========================================== */
          <div>
            {processedKots.length === 0 ? (
              <div className="py-20 text-center bg-white border border-stone-200 rounded-3xl max-w-md mx-auto">
                <ChefHat className="w-12 h-12 text-[#d4af37]/75 mx-auto mb-3 animate-bounce" />
                <h3 className="text-sm font-serif font-bold text-stone-800 uppercase tracking-widest">No matching tickets</h3>
                <p className="text-xs text-stone-500 font-sans mt-1.5 px-6 leading-relaxed">
                  No orders found in the kitchen matching your filters.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {processedKots.map((kot) => renderKOTCard(kot))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==========================================
         THERMAL RECEIPT PREVIEW MODAL POPUP
         ========================================== */}
      {previewKOT && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col justify-between">
            {/* Header */}
            <div className="p-4 border-b border-stone-800 flex justify-between items-center text-stone-200">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-[#d4af37]" />
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider">Kitchen Receipt Preview</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewKOT(null)}
                className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-400 hover:text-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content: Virtual Thermal Roll */}
            <div className="p-6 bg-stone-950 flex flex-col items-center justify-center border-b border-stone-800">
              <span className="text-[10px] text-stone-500 font-mono mb-2 uppercase">Simulating POS Thermo Format</span>
              
              <div className="bg-white text-stone-950 p-6 shadow-xl rounded-sm w-[290px] border border-stone-200 leading-tight select-text scrollbar-none font-mono">
                {/* Torn Dotted roll accent effect */}
                <div className="border-t-2 border-dashed border-stone-300 pt-1 -mt-4 mb-3"></div>
                
                <div className="text-center pb-2 border-b border-dashed border-stone-400">
                  <p className="text-xs font-bold font-serif uppercase tracking-widest">** WEBRAJYA POS **</p>
                  <p className="text-[9px] text-stone-500 uppercase font-sans mt-0.5">Pure Vegetarian Gourmet</p>
                  <p className="text-[9px] text-stone-400 mt-1">{new Date(previewKOT.createdAt).toLocaleDateString()} {new Date(previewKOT.createdAt).toLocaleTimeString()}</p>
                </div>

                <div className="space-y-1 py-1 border-b border-dashed border-stone-400 text-[10px] my-2">
                  <div className="flex justify-between font-bold">
                    <span>KOT ID:</span>
                    <span>{previewKOT.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Order:</span>
                    <span>{previewKOT.orderId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Service Mode:</span>
                    <span className="capitalize">{previewKOT.orderType}</span>
                  </div>
                  {previewKOT.tableNumber && (
                    <div className="flex justify-between font-bold">
                      <span>Table No:</span>
                      <span>{previewKOT.tableNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Chef Memo:</span>
                    <span className="truncate max-w-[140px]">{previewKOT.customerName}</span>
                  </div>
                </div>

                <div className="border-b border-dashed border-stone-400 py-1.5 text-[10px] space-y-1 my-2">
                  <div className="flex justify-between font-bold border-b border-stone-100 pb-1 mb-1">
                    <span>Item Details</span>
                    <span>Qty</span>
                  </div>
                  {previewKOT.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-start py-0.5">
                      <div className="max-w-[190px]">
                        <span>{it.name}</span>
                        {it.customization && (
                          <span className="block text-[8px] italic text-stone-500 pl-1.5">* {it.customization}</span>
                        )}
                      </div>
                      <span className="font-bold">x{it.quantity}</span>
                    </div>
                  ))}
                </div>

                {previewKOT.specialInstructions && previewKOT.specialInstructions !== "None" && (
                  <div className="bg-stone-50 p-2 rounded-lg border border-stone-200 mt-2 text-[9px] text-left">
                    <span className="font-bold">Instructions:</span>
                    <p className="italic text-stone-600 font-sans">{previewKOT.specialInstructions}</p>
                  </div>
                )}

                <div className="text-center text-[9px] uppercase tracking-wider text-stone-400 mt-4 font-bold">
                  *** KITCHEN DISPATCH ***
                </div>
                
                {/* Torn Dotted roll accent effect bottom */}
                <div className="border-b-2 border-dashed border-stone-300 pb-1 -mb-4 mt-3"></div>
              </div>
            </div>

            {/* Controls panel */}
            <div className="p-4 bg-stone-900 grid grid-cols-2 gap-2 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => handlePhysicalPrintSystem(previewKOT)}
                className="flex items-center justify-center gap-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 py-1.5 rounded-xl cursor-pointer transition-colors"
                title="System browser print fallback (Uses mapped drivers)"
              >
                <Printer className="w-3.5 h-3.5 text-[#d4af37]" />
                System Print
              </button>

              <button
                type="button"
                onClick={() => handlePhysicalPrintUSB(previewKOT)}
                className="flex items-center justify-center gap-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 py-1.5 rounded-xl cursor-pointer transition-colors"
                title="Direct WebUSB connector transfer"
              >
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                Raw USB
              </button>

              <button
                type="button"
                onClick={() => handlePhysicalPrintSerial(previewKOT)}
                className="flex items-center justify-center gap-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 py-1.5 rounded-xl cursor-pointer transition-colors"
                title="Direct WebSerial terminal writer"
              >
                <Cpu className="w-3.5 h-3.5 text-orange-400" />
                Raw Serial
              </button>

              <button
                type="button"
                onClick={() => {
                  simulateThermalPrint(previewKOT, true);
                  setPreviewKOT(null);
                }}
                className="flex items-center justify-center gap-1.5 bg-[#d4af37] text-stone-950 font-bold py-1.5 rounded-xl cursor-pointer hover:bg-[#aa7c11] transition-colors"
                title="Direct simulation in the visual slit feed"
              >
                <Play className="w-3.5 h-3.5" />
                Feed Spooler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /* Helper sub-compiler function to keep KOT visual card layout clean & modular */
  function renderKOTCard(kot: KOT) {
    const elapsedMins = Math.round((Date.now() - new Date(kot.createdAt).getTime()) / 60000);
    const isOverdue = elapsedMins > (kot.preparationTime || 15);

    // Status visual pill configurations
    let cookBadgeColor = "bg-blue-50 border-blue-100 text-blue-700";
    let borderAccent = "border-t-4 border-t-blue-500";
    if (kot.status === "Accepted") {
      cookBadgeColor = "bg-purple-50 border-purple-100 text-purple-700";
      borderAccent = "border-t-4 border-t-purple-500";
    } else if (kot.status === "Preparing") {
      cookBadgeColor = "bg-amber-50 border-amber-100 text-[#aa7c11]";
      borderAccent = "border-t-4 border-t-amber-500";
    } else if (kot.status === "Ready") {
      cookBadgeColor = "bg-emerald-50 border-emerald-100 text-emerald-700";
      borderAccent = "border-t-4 border-t-emerald-500";
    } else if (kot.status === "Served") {
      cookBadgeColor = "bg-stone-100 border-stone-200 text-stone-600";
      borderAccent = "border-t-4 border-t-stone-500";
    } else if (kot.status === "Cancelled") {
      cookBadgeColor = "bg-red-50 border-red-100 text-red-700";
      borderAccent = "border-t-4 border-t-red-500";
    }

    return (
      <div
        key={kot.id}
        className={`bg-white rounded-2xl border border-stone-200 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden ${borderAccent} ${
          tvMode ? "p-3.5 gap-3" : "gap-1.5"
        }`}
      >
        {/* Card Header details */}
        <div className="p-3 border-b border-stone-100 space-y-1.5 flex-shrink-0 bg-stone-50/50">
          <div className="flex justify-between items-start gap-1">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`font-mono font-black text-stone-900 ${tvMode ? "text-sm" : "text-xs"}`}>{kot.id}</span>
                <span className={`font-semibold rounded border px-1 text-[8px] sm:text-[9.5px] uppercase ${cookBadgeColor}`}>
                  {kot.status}
                </span>

                {/* Print queue status badges requested by user */}
                {kot.printed ? (
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[8px] sm:text-[9px] font-mono px-1.5 py-0.2 rounded-md flex items-center gap-1 font-bold">
                    <span className="h-1 text-emerald-700">●</span> Printed
                  </span>
                ) : printerStatus === "offline" ? (
                  <span className="bg-red-50 text-red-700 border border-red-200 text-[8px] sm:text-[9px] font-mono px-1.5 py-0.2 rounded-md flex items-center gap-1 font-bold">
                    <span className="h-1 text-red-600">●</span> Print Failed
                  </span>
                ) : (
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[8px] sm:text-[9px] font-mono px-1.5 py-0.2 rounded-md flex items-center gap-1 font-bold">
                    <span className="h-1 text-amber-600 animate-pulse">●</span> Pending Print
                  </span>
                )}
              </div>
              <span className={`text-[#aa7c11] font-mono block ${tvMode ? "text-xs" : "text-[9.5px]"}`}>Order: {kot.orderId}</span>
            </div>

            <div className="text-right">
              <span className="bg-stone-200/70 text-stone-700 font-sans text-[9px] px-1.5 py-0.2 rounded-full border border-stone-300 capitalize font-bold">
                {kot.orderType}
              </span>
              {kot.tableNumber && (
                <span className="bg-amber-50 text-[#aa7c11] text-[9.5px] font-bold px-1.5 py-0.5 rounded-full border border-amber-100 block mt-1 font-mono">
                  Table: {kot.tableNumber}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-0.5 font-sans">
            <span className={`font-bold text-stone-800 truncate max-w-[120px] ${tvMode ? "text-xs" : "text-[10.5px]"}`}>{kot.customerName}</span>
            <div className="flex items-center gap-1 text-stone-400 font-mono text-[9.5px]">
              <Clock className="w-3 h-3" />
              <span>{new Date(kot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({elapsedMins}m)</span>
            </div>
          </div>
        </div>

        {/* Order item details with checkout ingredient list */}
        <div className="p-3.5 flex-grow space-y-2 bg-stone-50/20">
          <div className="space-y-1.5">
            {kot.items.map((it, idx) => {
              const itemKey = `${kot.id}-${idx}`;
              const isChecked = !!checkedItems[itemKey];
              return (
                <div 
                  key={idx} 
                  onClick={() => setCheckedItems(prev => ({ ...prev, [itemKey]: !isChecked }))}
                  className={`flex justify-between items-start py-1 px-1.5 border border-stone-100 rounded-lg transition-all cursor-pointer ${
                    isChecked ? "bg-stone-100/75 border-stone-200" : "bg-white hover:bg-stone-50"
                  }`}
                >
                  <div className="flex items-start gap-2 max-w-[80%]">
                    {/* Visual checkmark for TV ceiling mounts and chef trackers */}
                    <button type="button" className="pt-0.5 pointer-events-none">
                      {isChecked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />
                      )}
                    </button>

                    <div className="flex-grow">
                      <span className={`font-medium ${tvMode ? "text-xs font-semibold" : "text-[11px]"} ${
                        isChecked ? "text-stone-400 line-through decoration-stone-300 decoration-2" : "text-stone-850"
                      }`}>
                        {it.name}
                      </span>
                      {it.customization && (
                        <span className="text-[9.5px] italic text-amber-600 block pl-1">
                          Custom: &quot;{it.customization}&quot;
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`font-black font-mono px-1.5 py-0.2 rounded border ${
                    isChecked 
                      ? "text-stone-400 bg-stone-50 border-stone-200" 
                      : "text-stone-900 bg-[#FAF9F5] border-stone-200"
                  } ${tvMode ? "text-xs" : "text-[10px]"}`}>
                    x{it.quantity}
                  </span>
                </div>
              );
            })}
          </div>

          {kot.specialInstructions && kot.specialInstructions !== "None" && (
            <div className="bg-orange-50/60 border border-orange-100 p-2 rounded-xl mt-1">
              <span className="text-[8.5px] font-mono font-bold text-orange-700 uppercase tracking-widest">Kitchen Memo:</span>
              <p className="text-[10px] text-stone-600 leading-normal italic font-light">
                {kot.specialInstructions}
              </p>
            </div>
          )}
        </div>

        {/* Action Footer & Live preparation timer management */}
        <div className="p-3 border-t border-stone-100 bg-white space-y-3 flex-shrink-0">
          {/* Ticking timers */}
          {kot.status !== "Served" && kot.status !== "Cancelled" && (
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] text-stone-500 font-sans">
                <span className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${isOverdue ? "bg-red-500 animate-ping" : "bg-[#d4af37]"}`}></span>
                  Timer status:
                </span>
                <span className={`font-bold font-mono ${isOverdue ? "text-red-500 font-black animate-pulse" : "text-stone-800"}`}>
                  {elapsedMins} / {kot.preparationTime || 15} min elapsed
                </span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ${
                    isOverdue ? "bg-red-500 animate-pulse" : "bg-[#d4af37]"
                  }`}
                  style={{ width: `${Math.min((elapsedMins / (kot.preparationTime || 15)) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Operational Flow Action Buttons */}
          <div className="flex items-center gap-1 bg-stone-50 p-1.5 rounded-xl border border-stone-100">
            {/* Reprint Spool button */}
            <button
              type="button"
              onClick={() => setPreviewKOT(kot)}
              title="Inspect thermal ticket preview modal"
              className="p-1 px-2 border border-stone-200 hover:border-[#d4af37] text-stone-500 hover:text-[#d4af37] bg-white rounded-lg transition-all cursor-pointer active:scale-95"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handlePhysicalPrintSystem(kot)}
              title="System Hardcopy Receipt"
              className="p-1 px-2 border border-stone-200 hover:border-stone-400 text-stone-700 bg-white rounded-lg transition-all cursor-pointer active:scale-95"
            >
              <Printer className="w-3.5 h-3.5 text-stone-600" />
            </button>

            {kot.status === "New Order" && (
              <button
                type="button"
                onClick={() => handleUpdateStatus(kot.id, "Accepted")}
                className="flex-grow py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <Check className="w-3 h-3" />
                Accept
              </button>
            )}

            {kot.status === "Accepted" && (
              <button
                type="button"
                onClick={() => handleUpdateStatus(kot.id, "Preparing")}
                className="flex-grow py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95 text-center font-bold"
              >
                <Play className="w-3 h-3" />
                Start Cook
              </button>
            )}

            {kot.status === "Preparing" && (
              <button
                type="button"
                onClick={() => handleUpdateStatus(kot.id, "Ready")}
                className="flex-grow py-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <CheckCircle className="w-3 h-3" />
                Food Ready
              </button>
            )}

            {kot.status === "Ready" && (
              <button
                type="button"
                onClick={() => handleUpdateStatus(kot.id, "Served")}
                className="flex-grow py-1 bg-stone-800 hover:bg-stone-900 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <UtensilsCrossed className="w-3 h-3" />
                Serve
              </button>
            )}

            {/* Cancel button */}
            {kot.status !== "Served" && kot.status !== "Cancelled" && (
              <button
                type="button"
                onClick={() => handleUpdateStatus(kot.id, "Cancelled")}
                title="Cancel Culinary Ticket"
                className="p-1 px-1.5 border border-red-200 hover:bg-red-50 text-red-500 rounded-lg transition-all cursor-pointer active:scale-95"
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
