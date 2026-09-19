import React, { useState, useMemo, useEffect } from "react";
import { 
  Users, Clock, Receipt, Plus, ArrowRightLeft, CheckCircle2, 
  Utensils, User, X, Layers, RefreshCw, Sparkles, Filter, ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Order, LocalDB, isSameTable } from "../lib/db";
import { RestaurantTable } from "../types";

interface VisualTableManagementProps {
  tables: RestaurantTable[];
  orders: Order[];
  onSelectTableForBilling: (tableNumber: string) => void;
  onPrintBill?: (order: Order) => void;
  onSettleOrder?: (order: Order) => void;
  onTransferTable?: (tableNumber: string, order: Order) => void;
  onRefreshData?: () => void;
}

export default function VisualTableManagement({
  tables,
  orders,
  onSelectTableForBilling,
  onPrintBill,
  onSettleOrder,
  onTransferTable,
  onRefreshData
}: VisualTableManagementProps) {
  const [activeArea, setActiveArea] = useState<string>("All");
  const [selectedTableForDrawer, setSelectedTableForDrawer] = useState<RestaurantTable | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Live timer update every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Derive unique seating areas from deployed tables + default standard zones
  const seatingAreas = useMemo(() => {
    const areaSet = new Set<string>();
    tables.forEach(t => {
      if (t.seatingArea) areaSet.add(t.seatingArea);
    });
    // Ensure default areas exist for rich tab switching
    const defaults = ["Main Dining Hall", "VIP Lounge", "Rooftop Area", "Garden Area"];
    defaults.forEach(d => areaSet.add(d));
    return ["All", ...Array.from(areaSet)];
  }, [tables]);

  // Map active unpaid orders to their corresponding table number
  const activeOrdersMap = useMemo(() => {
    const map: Record<string, Order> = {};
    tables.forEach(t => {
      const activeOrd = orders.find(o =>
        o.orderType === "dine-in" &&
        isSameTable(o.tableNumber, t.tableNumber) &&
        o.paymentStatus !== "Paid" &&
        o.orderStatus !== "Cancelled" &&
        o.orderStatus !== "Completed"
      );
      if (activeOrd) {
        map[t.tableNumber] = activeOrd;
      }
    });
    return map;
  }, [orders, tables]);

  // Filter tables by selected area tab
  const filteredTables = useMemo(() => {
    if (activeArea === "All") return tables;
    return tables.filter(t => t.seatingArea === activeArea);
  }, [tables, activeArea]);

  // Occupancy Statistics Counter
  const stats = useMemo(() => {
    let available = 0;
    let occupied = 0;
    let ordered = 0;

    tables.forEach(t => {
      const activeOrd = activeOrdersMap[t.tableNumber];
      if (activeOrd) {
        ordered++;
      } else if (t.status === "Occupied") {
        occupied++;
      } else {
        available++;
      }
    });

    return { available, occupied, ordered, total: tables.length };
  }, [tables, activeOrdersMap]);

  // Calculate elapsed time formatted string (e.g. "18m", "1h 12m")
  const getElapsedTime = (isoDateString?: string) => {
    if (!isoDateString) return "0m";
    const created = new Date(isoDateString).getTime();
    if (isNaN(created)) return "0m";
    const diffMs = Math.max(0, currentTime - created);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 60) return `${diffMins}m`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  };

  const activeOrderForDrawer = selectedTableForDrawer ? activeOrdersMap[selectedTableForDrawer.tableNumber] : null;

  return (
    <div className="space-y-5 font-sans text-stone-900 w-full">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#C67C4E]/10 rounded-lg text-[#C67C4E]">
              <Layers className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-serif font-bold text-stone-900 tracking-tight">
              Visual Table Floorplan Management
            </h2>
          </div>
          <p className="text-xs text-stone-500 max-w-2xl font-light">
            Monitor real-time table occupancy, elapsed dining duration, live running bills, and dispatch orders directly to any dining zone.
          </p>
        </div>

        {/* Live Status Counter Badges */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl font-mono text-[11px] font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Available: {stats.available}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-200 px-3 py-1.5 rounded-xl font-mono text-[11px] font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Occupied: {stats.occupied}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-rose-50 text-rose-900 border border-rose-200 px-3 py-1.5 rounded-xl font-mono text-[11px] font-bold">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>Ordered: {stats.ordered}</span>
          </div>
          {onRefreshData && (
            <button
              type="button"
              onClick={onRefreshData}
              className="p-2 text-stone-500 hover:text-stone-850 hover:bg-stone-100 rounded-xl transition-all cursor-pointer border border-stone-200"
              title="Refresh Floorplan"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Area Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-stone-200 pb-3">
        <div className="flex items-center gap-1.5 text-stone-400 font-mono text-[10px] font-bold uppercase tracking-wider mr-2 shrink-0">
          <Filter className="w-3.5 h-3.5 text-[#C67C4E]" />
          <span>Dining Zones:</span>
        </div>
        {seatingAreas.map(area => {
          const isActive = activeArea === area;
          const areaCount = area === "All" ? tables.length : tables.filter(t => t.seatingArea === area).length;
          return (
            <button
              key={area}
              type="button"
              onClick={() => setActiveArea(area)}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-2 border ${
                isActive
                  ? "bg-[#C67C4E] text-white border-[#C67C4E] shadow-sm"
                  : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50 hover:text-stone-900"
              }`}
            >
              <span>{area}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                isActive ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
              }`}>
                {areaCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* Interactive Visual Table Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
        {filteredTables.map(table => {
          const activeOrd = activeOrdersMap[table.tableNumber];
          const hasOrder = !!activeOrd;
          const isOccupied = table.status === "Occupied" || hasOrder;

          // Status Theme Logic:
          // 🟢 Available (Green)
          // 🟡 Occupied (Yellow/Orange)
          // 🔴 Ordered (Pink/Red - active KOT/order)
          let cardBg = "bg-emerald-50/70 hover:bg-emerald-100/70 border-emerald-300 text-emerald-950";
          let badgeBg = "bg-emerald-100 text-emerald-800 border-emerald-250";
          let statusLabel = "Available";
          let statusDotColor = "bg-emerald-500";

          if (hasOrder) {
            cardBg = "bg-rose-50/80 hover:bg-rose-100/80 border-rose-300 text-rose-950 shadow-sm";
            badgeBg = "bg-rose-100 text-rose-900 border-rose-250";
            statusLabel = "Ordered";
            statusDotColor = "bg-rose-500 animate-ping";
          } else if (isOccupied) {
            cardBg = "bg-amber-50/80 hover:bg-amber-100/80 border-amber-300 text-amber-950 shadow-sm";
            badgeBg = "bg-amber-100 text-amber-900 border-amber-250";
            statusLabel = "Occupied";
            statusDotColor = "bg-amber-500";
          }

          const elapsedTime = hasOrder ? getElapsedTime(activeOrd?.createdAt) : isOccupied ? "Seated" : null;

          return (
            <motion.div
              key={table.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedTableForDrawer(table)}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between min-h-[140px] relative overflow-hidden group ${cardBg}`}
            >
              {/* Card Header: Table Number & Status Indicator */}
              <div className="flex items-start justify-between gap-1">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-serif font-black text-xl tracking-tight text-stone-900">
                      T{table.tableNumber}
                    </span>
                    <span className="text-[10px] font-mono text-stone-500 font-semibold">
                      ({table.capacity} pax)
                    </span>
                  </div>
                  <span className="text-[9px] font-medium text-stone-500 uppercase tracking-wider block">
                    {table.seatingArea || "Main Hall"}
                  </span>
                </div>

                <div className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase font-mono flex items-center gap-1 shrink-0 ${badgeBg}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor}`} />
                  <span>{statusLabel}</span>
                </div>
              </div>

              {/* Card Center Body: Live Amount & Duration */}
              <div className="my-2 space-y-1">
                {hasOrder ? (
                  <div>
                    <div className="text-base font-extrabold font-mono text-stone-900 tracking-tight">
                      ₹{activeOrd.grandTotal}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-mono text-stone-600">
                      <Clock className="w-3 h-3 text-stone-500" />
                      <span>{elapsedTime} elapsed</span>
                    </div>
                  </div>
                ) : isOccupied ? (
                  <div className="flex items-center gap-1 text-[10px] font-mono text-amber-800 font-semibold">
                    <Clock className="w-3 h-3 text-amber-600" />
                    <span>Seated & Dining</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                    <span>Ready for guests</span>
                  </div>
                )}
              </div>

              {/* Card Footer: Quick Action Prompt */}
              <div className="pt-2 border-t border-stone-200/60 flex items-center justify-between text-[10px] font-semibold text-stone-600 group-hover:text-stone-900">
                <span>{hasOrder ? `${activeOrd.items?.length || 0} items ordered` : "Tap to manage"}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ACTIVE TABLE DRAWER / ACTION MODAL */}
      <AnimatePresence>
        {selectedTableForDrawer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-stone-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden text-left font-sans"
            >
              {/* Modal Header */}
              <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-[#C67C4E] rounded-lg text-white font-serif font-black text-sm">
                    T{selectedTableForDrawer.tableNumber}
                  </span>
                  <div>
                    <h3 className="font-serif font-bold text-base tracking-wide">
                      Table #{selectedTableForDrawer.tableNumber} Management
                    </h3>
                    <p className="text-[10px] font-mono text-stone-400">
                      {selectedTableForDrawer.seatingArea} • Capacity: {selectedTableForDrawer.capacity} Guests
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTableForDrawer(null)}
                  className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                {activeOrderForDrawer ? (
                  <>
                    {/* Active Order Banner */}
                    <div className="p-3 bg-amber-50 border border-amber-250 rounded-xl flex items-center justify-between text-amber-900 text-xs">
                      <div>
                        <div className="font-mono font-bold">Order #{activeOrderForDrawer.id}</div>
                        <div className="text-[10px] text-amber-700 flex items-center gap-1.5 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>Duration: {getElapsedTime(activeOrderForDrawer.createdAt)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 bg-amber-200 text-amber-950 font-bold font-mono text-[10px] rounded-md uppercase">
                          {activeOrderForDrawer.orderStatus || "In Progress"}
                        </span>
                        <div className="text-base font-extrabold font-mono text-stone-900 mt-0.5">
                          ₹{activeOrderForDrawer.grandTotal}
                        </div>
                      </div>
                    </div>

                    {/* Ordered Items List */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider">
                        Running Kitchen Order Items ({activeOrderForDrawer.items?.length || 0})
                      </div>
                      <div className="divide-y divide-stone-100 bg-stone-50 border border-stone-200 rounded-xl p-2.5 max-h-48 overflow-y-auto">
                        {activeOrderForDrawer.items?.map((item, idx) => (
                          <div key={idx} className="py-1.5 flex items-center justify-between text-xs font-medium text-stone-850">
                            <div>
                              <span className="font-bold">{item.name}</span>
                              <span className="text-stone-500 text-[10px] ml-1.5">x{item.quantity}</span>
                              {item.customization && (
                                <div className="text-[9px] text-stone-500 italic">{item.customization}</div>
                              )}
                            </div>
                            <span className="font-mono font-bold text-stone-900">₹{item.price * item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  /* Available / Empty Table View */
                  <div className="p-6 text-center bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                    <h4 className="font-serif font-bold text-stone-900 text-sm">Table is Available</h4>
                    <p className="text-xs text-stone-500 max-w-xs mx-auto">
                      There is currently no active open tab for Table #{selectedTableForDrawer.tableNumber}. Tap below to start taking an order.
                    </p>
                  </div>
                )}
              </div>

              {/* Modal Footer Quick Actions */}
              <div className="p-4 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-end gap-2">
                {activeOrderForDrawer ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const tbl = selectedTableForDrawer.tableNumber;
                        setSelectedTableForDrawer(null);
                        onSelectTableForBilling(tbl);
                      }}
                      className="px-3 py-2 bg-[#C67C4E] hover:bg-[#a8653b] text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Items</span>
                    </button>

                    {onPrintBill && (
                      <button
                        type="button"
                        onClick={() => {
                          onPrintBill(activeOrderForDrawer);
                          setSelectedTableForDrawer(null);
                        }}
                        className="px-3 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Receipt className="w-3.5 h-3.5 text-amber-400" />
                        <span>Print Bill</span>
                      </button>
                    )}

                    {onTransferTable && (
                      <button
                        type="button"
                        onClick={() => {
                          onTransferTable(selectedTableForDrawer.tableNumber, activeOrderForDrawer);
                          setSelectedTableForDrawer(null);
                        }}
                        className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-amber-250"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Transfer</span>
                      </button>
                    )}

                    {onSettleOrder && (
                      <button
                        type="button"
                        onClick={() => {
                          onSettleOrder(activeOrderForDrawer);
                          setSelectedTableForDrawer(null);
                        }}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Pay & Settle</span>
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const tbl = selectedTableForDrawer.tableNumber;
                      setSelectedTableForDrawer(null);
                      onSelectTableForBilling(tbl);
                    }}
                    className="px-4 py-2 bg-[#C67C4E] hover:bg-[#a8653b] text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Start New Order for T{selectedTableForDrawer.tableNumber}</span>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
