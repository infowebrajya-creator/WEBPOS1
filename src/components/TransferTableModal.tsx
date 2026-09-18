import React, { useState, useMemo, useEffect } from "react";
import {
  ArrowRightLeft,
  X,
  Check,
  AlertCircle,
  ArrowRight,
  Search,
  Users,
  Layers,
  Clock,
  CheckCircle2,
  Table as TableIcon,
  AlertTriangle,
  RotateCw,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LocalDB, Order } from "../lib/db";
import { RestaurantTable } from "../types";

export interface TransferTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceTableNumber?: string | null;
  initialSourceTableNumber?: string | null;
  sourceOrder?: Order | null;
  initialSourceOrder?: Order | null;
  tables?: RestaurantTable[];
  orders?: Order[];
  currentUser?: string;
  onSuccess?: (result: { type: "transfer" | "merge"; order: Order; message: string }) => void;
  onTransferSuccess?: (sourceTable: string, targetTable: string) => void;
}

export default function TransferTableModal({
  isOpen,
  onClose,
  sourceTableNumber: propSourceTableNumber,
  initialSourceTableNumber,
  sourceOrder: propSourceOrder,
  initialSourceOrder,
  tables: propTables,
  orders: propOrders,
  currentUser = "Staff",
  onSuccess,
  onTransferSuccess
}: TransferTableModalProps) {
  // Local state for source table if not passed via props
  const [selectedSourceTable, setSelectedSourceTable] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"All" | "Available" | "Occupied">("All");
  const [selectedTargetTable, setSelectedTargetTable] = useState<RestaurantTable | null>(null);
  const [step, setStep] = useState<"select" | "confirm_transfer" | "confirm_merge">("select");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Synchronize initial source table
  useEffect(() => {
    const initial = propSourceTableNumber || initialSourceTableNumber || "";
    setSelectedSourceTable(initial);
    setStep("select");
    setSelectedTargetTable(null);
    setErrorMessage(null);
    setSuccessToast(null);
    setSearchQuery("");
  }, [isOpen, propSourceTableNumber, initialSourceTableNumber]);

  // Derived tables list (falls back to LocalDB)
  const currentTables = useMemo(() => {
    if (propTables && propTables.length > 0) return propTables;
    return LocalDB.getTables();
  }, [propTables, isOpen]);

  // Derived orders list (falls back to LocalDB)
  const currentOrders = useMemo(() => {
    if (propOrders && propOrders.length > 0) return propOrders;
    return LocalDB.getOrders();
  }, [propOrders, isOpen]);

  const effectiveSourceTable = selectedSourceTable || propSourceTableNumber || initialSourceTableNumber || "";

  // Locate the active source order
  const activeSourceOrder = useMemo(() => {
    if (propSourceOrder) return propSourceOrder;
    if (initialSourceOrder) return initialSourceOrder;
    if (!effectiveSourceTable) return null;
    return LocalDB.getActiveOrderForTable(effectiveSourceTable) || null;
  }, [propSourceOrder, initialSourceOrder, effectiveSourceTable, currentOrders]);

  // Locate target table's active order if target is selected
  const activeTargetOrder = useMemo(() => {
    if (!selectedTargetTable) return null;
    return LocalDB.getActiveOrderForTable(selectedTargetTable.tableNumber) || null;
  }, [selectedTargetTable, currentOrders]);

  // Filter destination tables list
  const filteredTables = useMemo(() => {
    return currentTables.filter(t => {
      // Exclude source table from destination choices
      const isSource = String(t.tableNumber).trim() === String(effectiveSourceTable).trim();
      if (isSource) return false;

      // Filter by status if specified
      if (filterStatus === "Available" && t.status !== "Available") return false;
      if (filterStatus === "Occupied" && t.status !== "Occupied") return false;

      // Search query by table number or area
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesNo = String(t.tableNumber).toLowerCase().includes(q);
        const matchesArea = (t.seatingArea || "").toLowerCase().includes(q);
        return matchesNo || matchesArea;
      }
      return true;
    });
  }, [currentTables, effectiveSourceTable, filterStatus, searchQuery]);

  // Occupied tables with active orders for source selection dropdown if none selected
  const occupiedSourceOptions = useMemo(() => {
    return currentTables.filter(t => {
      const activeOrd = LocalDB.getActiveOrderForTable(t.tableNumber);
      return t.status === "Occupied" || activeOrd !== null;
    });
  }, [currentTables, currentOrders]);

  // Table selection handler
  const handleSelectTable = (table: RestaurantTable) => {
    if (!effectiveSourceTable) {
      setErrorMessage("Please select a source table first.");
      return;
    }
    setSelectedTargetTable(table);
    setErrorMessage(null);

    const targetOrder = LocalDB.getActiveOrderForTable(table.tableNumber);
    if (table.status === "Occupied" || targetOrder) {
      setStep("confirm_merge");
    } else {
      setStep("confirm_transfer");
    }
  };

  // Perform standard transfer
  const handleExecuteTransfer = async () => {
    if (!selectedTargetTable || !effectiveSourceTable) return;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const result = await LocalDB.apiTransferTableOrder(
        effectiveSourceTable,
        selectedTargetTable.tableNumber,
        currentUser
      );

      setSuccessToast(result.message);
      if (onSuccess) {
        onSuccess({ type: "transfer", order: result.order, message: result.message });
      }
      if (onTransferSuccess) {
        onTransferSuccess(effectiveSourceTable, selectedTargetTable.tableNumber);
      }

      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 900);
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err.message || "Failed to transfer table. Please retry.");
    }
  };

  // Perform merge transfer
  const handleExecuteMerge = async () => {
    if (!selectedTargetTable || !activeSourceOrder || !activeTargetOrder) {
      if (!activeTargetOrder && selectedTargetTable && effectiveSourceTable) {
        // Destination is occupied but has no separate unpaid order, perform direct transfer
        return handleExecuteTransfer();
      }
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const result = await LocalDB.apiMergeTableOrders(
        activeSourceOrder.id,
        activeTargetOrder.id,
        currentUser
      );

      setSuccessToast(result.message);
      if (onSuccess) {
        onSuccess({ type: "merge", order: result.mergedOrder, message: result.message });
      }
      if (onTransferSuccess) {
        onTransferSuccess(effectiveSourceTable, selectedTargetTable.tableNumber);
      }

      setTimeout(() => {
        setIsProcessing(false);
        onClose();
      }, 900);
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err.message || "Failed to merge table orders. Please retry.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs font-sans overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="bg-[#FAF9F5] border-b border-stone-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-800">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-serif font-bold text-stone-900">
                  Transfer Table & Move Order
                </h3>
                {effectiveSourceTable ? (
                  <span className="bg-amber-100 text-amber-850 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border border-amber-200 uppercase">
                    From Table #{effectiveSourceTable}
                  </span>
                ) : (
                  <span className="bg-stone-100 text-stone-600 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border border-stone-200 uppercase">
                    Select Origin Table
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 font-sans mt-0.5">
                Seamlessly move active guest orders, update kitchen tickets, and free previous table.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-200/60 flex items-center justify-center text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source Table Selector if not pre-selected */}
        {!propSourceTableNumber && !initialSourceTableNumber && (
          <div className="bg-stone-50 border-b border-stone-200 px-6 py-3 flex items-center gap-3">
            <label className="text-xs font-mono font-bold text-stone-700 uppercase tracking-wider whitespace-nowrap">
              Origin Table:
            </label>
            <select
              value={selectedSourceTable}
              onChange={(e) => setSelectedSourceTable(e.target.value)}
              className="bg-white border border-stone-300 text-stone-900 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-medium"
            >
              <option value="">-- Choose Origin Table with Active Order --</option>
              {occupiedSourceOptions.map(t => (
                <option key={t.id} value={t.tableNumber}>
                  Table #{t.tableNumber} ({t.status}) - {t.seatingArea || "Main"}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Source Order Info Strip */}
        {activeSourceOrder ? (
          <div className="bg-amber-50/50 border-b border-amber-100/80 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-stone-900">
                Order #{activeSourceOrder.id}
              </span>
              <span className="text-stone-400">•</span>
              <span className="text-stone-700 font-medium">
                {activeSourceOrder.customerName || "Dine-In Guest"}
                {activeSourceOrder.phoneNumber ? ` (${activeSourceOrder.phoneNumber})` : ""}
              </span>
            </div>
            <div className="flex items-center gap-4 font-mono">
              <span className="text-stone-500">
                {activeSourceOrder.items?.reduce((s, i) => s + i.quantity, 0) || 0} Items
              </span>
              <span className="font-bold text-stone-950 text-sm bg-white px-2.5 py-0.5 rounded-lg border border-amber-200 shadow-2xs">
                ₹{activeSourceOrder.grandTotal}
              </span>
              <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-md uppercase">
                {activeSourceOrder.orderStatus}
              </span>
            </div>
          </div>
        ) : effectiveSourceTable ? (
          <div className="bg-stone-50 border-b border-stone-200 px-6 py-2.5 text-xs text-stone-600 flex items-center gap-2">
            <Info className="w-4 h-4 text-stone-500 shrink-0" />
            <span>Table #{effectiveSourceTable} selected. Any existing reservation or seating will transfer.</span>
          </div>
        ) : null}

        {/* Success Toast */}
        <AnimatePresence>
          {successToast && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-emerald-500 text-white px-6 py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{successToast}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs text-rose-700 font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body Content by Step */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {step === "select" && (
            <>
              {/* Search & Filter Toolbar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search table # or section..."
                    className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Filter Badges */}
                <div className="flex items-center gap-1.5 self-start sm:self-auto bg-stone-100 p-1 rounded-xl">
                  {(["All", "Available", "Occupied"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilterStatus(f)}
                      className={`px-3 py-1 text-[11px] font-mono font-medium rounded-lg transition-all cursor-pointer ${
                        filterStatus === f
                          ? "bg-white text-stone-900 shadow-2xs font-bold"
                          : "text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      {f === "All" && `All (${Math.max(0, currentTables.length - 1)})`}
                      {f === "Available" && `Available (${currentTables.filter(t => t.status === "Available" && t.tableNumber !== effectiveSourceTable).length})`}
                      {f === "Occupied" && `Occupied (${currentTables.filter(t => t.status === "Occupied" && t.tableNumber !== effectiveSourceTable).length})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table Selection Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-stone-400 uppercase tracking-wider">
                  <span>Select Destination Table</span>
                  <span>{filteredTables.length} Options</span>
                </div>

                {filteredTables.length === 0 ? (
                  <div className="py-12 text-center text-stone-400 bg-stone-50/50 rounded-2xl border border-dashed border-stone-200 space-y-2">
                    <TableIcon className="w-8 h-8 mx-auto text-stone-300" />
                    <p className="text-xs">No matching destination tables found.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredTables.map((table) => {
                      const isOccupied = table.status === "Occupied";
                      const isReserved = table.status === "Reserved";
                      const isServiceReq = table.status === "Service Required";
                      const targetActiveOrder = LocalDB.getActiveOrderForTable(table.tableNumber);

                      let badgeStyle = "bg-green-50 text-green-700 border-green-200";
                      let borderStyle = "border-stone-200 hover:border-green-400 hover:bg-green-50/20";
                      let dotColor = "bg-green-500";

                      if (isOccupied) {
                        badgeStyle = "bg-amber-50 text-amber-800 border-amber-200";
                        borderStyle = "border-amber-200 hover:border-amber-400 hover:bg-amber-50/30";
                        dotColor = "bg-amber-500";
                      } else if (isReserved) {
                        badgeStyle = "bg-blue-50 text-blue-700 border-blue-200";
                        borderStyle = "border-blue-200 hover:border-blue-400 hover:bg-blue-50/20";
                        dotColor = "bg-blue-500";
                      } else if (isServiceReq) {
                        badgeStyle = "bg-rose-50 text-rose-700 border-rose-200";
                        borderStyle = "border-rose-200 hover:border-rose-400 hover:bg-rose-50/20";
                        dotColor = "bg-rose-500";
                      }

                      return (
                        <div
                          key={table.id}
                          onClick={() => handleSelectTable(table)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left space-y-2 bg-white hover:shadow-md relative group ${borderStyle}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${badgeStyle}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${table.status === "Available" ? "animate-pulse" : ""}`} />
                              {table.status}
                            </span>
                            <span className="text-[10px] font-mono text-stone-400 flex items-center gap-1">
                              <Users className="w-3 h-3" /> {table.capacity} Pax
                            </span>
                          </div>

                          <div className="pt-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-serif font-bold text-stone-900 text-lg group-hover:text-amber-800 transition-colors">
                                Table #{table.tableNumber}
                              </h4>
                              <ArrowRight className="w-4 h-4 text-stone-300 group-hover:text-amber-700 group-hover:translate-x-0.5 transition-all" />
                            </div>
                            <p className="text-[11px] text-stone-400 truncate">
                              {table.seatingArea || "Main Area"}
                            </p>
                          </div>

                          {/* Occupied active order info */}
                          {targetActiveOrder && (
                            <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] font-mono text-amber-900 bg-amber-50/60 p-1.5 rounded-lg">
                              <span className="truncate max-w-[90px]">
                                👤 {targetActiveOrder.customerName || "Guest"}
                              </span>
                              <span className="font-bold">
                                ₹{targetActiveOrder.grandTotal}
                              </span>
                            </div>
                          )}

                          {isOccupied && !targetActiveOrder && (
                            <div className="pt-1.5 border-t border-stone-100 text-[10px] text-amber-700 font-mono">
                              Occupied (Ready to merge)
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* STEP: CONFIRM REGULAR TRANSFER */}
          {step === "confirm_transfer" && selectedTargetTable && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              {/* Transfer Visual Route Flow */}
              <div className="bg-stone-50 rounded-2xl p-5 border border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                <div className="flex-1 bg-white p-4 rounded-xl border border-stone-200 shadow-2xs">
                  <span className="text-[10px] font-mono text-stone-400 uppercase block font-bold">
                    ORIGIN TABLE
                  </span>
                  <div className="font-serif font-black text-2xl text-stone-900 mt-0.5">
                    Table #{effectiveSourceTable}
                  </div>
                  <span className="text-[11px] text-stone-500 block mt-1">
                    Will be released to <b className="text-green-700">Available</b>
                  </span>
                </div>

                <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-md shrink-0">
                  <ArrowRight className="w-5 h-5" />
                </div>

                <div className="flex-1 bg-white p-4 rounded-xl border border-amber-300 shadow-2xs ring-1 ring-amber-400/30">
                  <span className="text-[10px] font-mono text-amber-800 uppercase block font-bold">
                    DESTINATION TABLE
                  </span>
                  <div className="font-serif font-black text-2xl text-stone-900 mt-0.5">
                    Table #{selectedTargetTable.tableNumber}
                  </div>
                  <span className="text-[11px] text-stone-500 block mt-1">
                    {selectedTargetTable.seatingArea} • {selectedTargetTable.capacity} Pax
                  </span>
                </div>
              </div>

              {/* Key Items Summary */}
              {activeSourceOrder && (
                <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-3">
                  <h4 className="text-xs font-mono font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Order Items to Move ({activeSourceOrder.items?.length || 0} items)</span>
                  </h4>
                  <div className="max-h-40 overflow-y-auto divide-y divide-stone-100 text-xs">
                    {activeSourceOrder.items?.map((item, idx) => (
                      <div key={idx} className="py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-stone-100 font-mono text-[11px] font-bold flex items-center justify-center text-stone-700">
                            {item.quantity}x
                          </span>
                          <span className="text-stone-800 font-medium">{item.name}</span>
                          {item.customization && (
                            <span className="text-[10px] text-stone-400 italic">
                              ({item.customization})
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-stone-600">
                          ₹{item.price * item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reassurance Notice */}
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200/80 text-xs text-blue-800 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Transferring will retain all customer notes, applied discounts, GST calculation, and linked kitchen tickets (KOTs). Both tables will automatically update across all POS, Kitchen, and Admin monitors.
                </p>
              </div>
            </motion.div>
          )}

          {/* STEP: CONFIRM MERGE WITH OCCUPIED TABLE */}
          {step === "confirm_merge" && selectedTargetTable && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              {/* Alert Banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-amber-900">
                    Destination Table #{selectedTargetTable.tableNumber} is Currently Occupied!
                  </h4>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Would you like to <b>merge the orders</b> together? All items from Table #{effectiveSourceTable} will be combined into Table #{selectedTargetTable.tableNumber}, preserving item quantities and recalculating taxes.
                  </p>
                </div>
              </div>

              {/* Side by side comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Source Order Card */}
                <div className="bg-white rounded-2xl border border-stone-200 p-4 space-y-2">
                  <span className="text-[10px] font-mono text-stone-400 uppercase font-bold block">
                    Source (Table #{effectiveSourceTable})
                  </span>
                  <div className="font-bold text-stone-900 text-sm">
                    {activeSourceOrder?.customerName || "Guest"}
                  </div>
                  <div className="text-xs text-stone-500">
                    {activeSourceOrder?.items?.reduce((s, i) => s + i.quantity, 0) || 0} items
                  </div>
                  <div className="text-base font-mono font-bold text-stone-900 pt-1 border-t border-stone-100">
                    ₹{activeSourceOrder?.grandTotal || 0}
                  </div>
                </div>

                {/* Target Order Card */}
                <div className="bg-amber-50/40 rounded-2xl border border-amber-200 p-4 space-y-2">
                  <span className="text-[10px] font-mono text-amber-800 uppercase font-bold block">
                    Target (Table #{selectedTargetTable.tableNumber})
                  </span>
                  <div className="font-bold text-stone-900 text-sm">
                    {activeTargetOrder?.customerName || "Dine-In Guest"}
                  </div>
                  <div className="text-xs text-stone-500">
                    {activeTargetOrder?.items?.reduce((s, i) => s + i.quantity, 0) || 0} items
                  </div>
                  <div className="text-base font-mono font-bold text-stone-900 pt-1 border-t border-amber-200">
                    ₹{activeTargetOrder?.grandTotal || 0}
                  </div>
                </div>
              </div>

              {/* Combined Projected Total */}
              <div className="bg-[#FAF9F5] rounded-2xl p-4 border border-stone-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-stone-500 block">Combined Total Bill</span>
                  <span className="text-[11px] text-stone-400">
                    Table #{effectiveSourceTable} will be freed & marked Available
                  </span>
                </div>
                <div className="font-serif font-black text-2xl text-stone-900">
                  ₹{Math.max(0, (activeSourceOrder?.grandTotal || 0) + (activeTargetOrder?.grandTotal || 0))}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="bg-[#FAF9F5] border-t border-stone-200 px-6 py-4 flex items-center justify-between gap-3">
          {step === "select" ? (
            <>
              <span className="text-xs text-stone-400 font-mono">
                Click any table above to proceed
              </span>
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-mono text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
            </>
          ) : step === "confirm_transfer" ? (
            <>
              <button
                onClick={() => setStep("select")}
                disabled={isProcessing}
                className="px-4 py-2.5 text-stone-600 hover:bg-stone-100 font-mono text-xs font-medium rounded-xl transition-all cursor-pointer"
              >
                ← Back to Tables
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  disabled={isProcessing}
                  className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-mono text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteTransfer}
                  disabled={isProcessing}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-mono text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Transferring...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm Transfer (Table #{selectedTargetTable?.tableNumber})</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Confirm Merge step */
            <>
              <button
                onClick={() => setStep("select")}
                disabled={isProcessing}
                className="px-4 py-2.5 text-stone-600 hover:bg-stone-100 font-mono text-xs font-medium rounded-xl transition-all cursor-pointer"
              >
                ← Pick Different Table
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  disabled={isProcessing}
                  className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-mono text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteMerge}
                  disabled={isProcessing}
                  className="px-6 py-2.5 bg-stone-900 hover:bg-stone-800 active:scale-98 text-white font-mono text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Merging Orders...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>Merge Orders into Table #{selectedTargetTable?.tableNumber}</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
