import React, { useState, useEffect, useMemo } from "react";
import { 
  X, 
  Users, 
  Utensils, 
  DollarSign, 
  CreditCard, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Trash2, 
  RotateCcw, 
  ArrowRight,
  Receipt,
  Smartphone,
  Banknote,
  ShieldAlert,
  ChevronRight
} from "lucide-react";
import { PaymentRecord, SplitSettlement, SplitItemAssignment } from "../types";
import { LocalDB, Order, RestaurantSettings } from "../lib/db";
import { PhysicalThermalPrinter } from "../lib/printerService";

interface SplitBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  settings: RestaurantSettings;
  currentUser?: string;
  onOrderUpdated?: (updatedOrder: Order) => void;
}

type SplitMode = "items" | "equal" | "amount" | "multi_tender";

export const SplitBillModal: React.FC<SplitBillModalProps> = ({
  isOpen,
  onClose,
  order,
  settings,
  currentUser = "Admin",
  onOrderUpdated
}) => {
  const [currentOrder, setCurrentOrder] = useState<Order>(order);
  const [activeMode, setActiveMode] = useState<SplitMode>("equal");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Equal Split State
  const [equalPeopleCount, setEqualPeopleCount] = useState<number>(2);
  const [equalPayMethods, setEqualPayMethods] = useState<Record<number, { method: string; ref: string }>>({
    0: { method: "Cash", ref: "" },
    1: { method: "UPI", ref: "" }
  });

  // Custom Amount Split State
  const [customSplits, setCustomSplits] = useState<Array<{ id: string; name: string; amount: number; method: string; ref: string }>>([
    { id: "cust-1", name: "Person 1", amount: Math.round((order.grandTotal / 2) * 100) / 100, method: "Cash", ref: "" },
    { id: "cust-2", name: "Person 2", amount: Math.round((order.grandTotal - Math.round((order.grandTotal / 2) * 100) / 100) * 100) / 100, method: "UPI", ref: "" }
  ]);

  // Split by Items State: people list and item quantity assignments
  const [itemSplitPeople, setItemSplitPeople] = useState<Array<{ id: string; name: string; method: string; ref: string }>>([
    { id: "person-1", name: "Person 1", method: "Cash", ref: "" },
    { id: "person-2", name: "Person 2", method: "UPI", ref: "" }
  ]);
  // Map of `${personId}_${itemIndex}` -> quantity
  const [itemAssignments, setItemAssignments] = useState<Record<string, number>>({});

  // Multi-Tender Payment State (paying single bill with multiple tenders like Cash + UPI)
  const [multiTenders, setMultiTenders] = useState<Array<{ id: string; method: string; amount: number; ref: string }>>([
    { id: "tender-1", method: "Cash", amount: 0, ref: "" },
    { id: "tender-2", method: "UPI", amount: 0, ref: "" }
  ]);

  // Partial Payment Direct Amount
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [partialMethod, setPartialMethod] = useState<string>("Cash");
  const [partialRef, setPartialRef] = useState<string>("");

  // Sync when prop order changes
  useEffect(() => {
    setCurrentOrder(order);
    const remaining = Math.max(0, order.grandTotal - (order.paidAmount || 0));
    setPartialAmount(remaining > 0 ? remaining.toString() : "");

    // Initialize multi-tender with default cash/upi split if zero
    setMultiTenders([
      { id: "tender-1", method: "Cash", amount: Math.round(remaining / 2), ref: "" },
      { id: "tender-2", method: "UPI", amount: Math.round((remaining - Math.round(remaining / 2)) * 100) / 100, ref: "" }
    ]);
  }, [order]);

  // Keep local payments refreshed
  const orderPayments = useMemo(() => {
    return LocalDB.getPaymentsForOrder(currentOrder.id);
  }, [currentOrder]);

  const existingPaid = useMemo(() => {
    return orderPayments
      .filter(p => p.status === "Paid")
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [orderPayments]);

  const balanceDue = useMemo(() => {
    return Math.max(0, Math.round((currentOrder.grandTotal - existingPaid) * 100) / 100);
  }, [currentOrder.grandTotal, existingPaid]);

  const isFullyPaid = balanceDue <= 0.01;

  // -------------------------------------------------------------
  // EQUAL SPLIT CALCULATIONS
  // -------------------------------------------------------------
  const equalSplitShares = useMemo(() => {
    const total = balanceDue > 0 ? balanceDue : currentOrder.grandTotal;
    const count = Math.max(1, equalPeopleCount);
    const baseShare = Math.floor((total / count) * 100) / 100;
    const remainder = Math.round((total - (baseShare * count)) * 100) / 100;

    return Array.from({ length: count }, (_, idx) => {
      // Allocate the fractional cent remainder to the first person
      const allocated = idx === 0 ? Math.round((baseShare + remainder) * 100) / 100 : baseShare;
      return {
        index: idx,
        name: `Person ${idx + 1}`,
        amount: allocated,
        method: equalPayMethods[idx]?.method || (idx % 2 === 0 ? "Cash" : "UPI"),
        ref: equalPayMethods[idx]?.ref || ""
      };
    });
  }, [balanceDue, currentOrder.grandTotal, equalPeopleCount, equalPayMethods]);

  // -------------------------------------------------------------
  // CUSTOM AMOUNT CALCULATIONS
  // -------------------------------------------------------------
  const customTotalAllocated = useMemo(() => {
    return Math.round(customSplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0) * 100) / 100;
  }, [customSplits]);

  const customRemaining = useMemo(() => {
    const target = balanceDue > 0 ? balanceDue : currentOrder.grandTotal;
    return Math.round((target - customTotalAllocated) * 100) / 100;
  }, [balanceDue, currentOrder.grandTotal, customTotalAllocated]);

  // -------------------------------------------------------------
  // ITEM SPLIT CALCULATIONS
  // -------------------------------------------------------------
  // Calculate assigned vs unassigned quantities for each order item
  const itemAllocationStatus = useMemo(() => {
    return (currentOrder.items || []).map((item, itemIdx) => {
      let assignedQty = 0;
      itemSplitPeople.forEach(p => {
        const qty = itemAssignments[`${p.id}_${itemIdx}`] || 0;
        assignedQty += qty;
      });
      const unassignedQty = Math.max(0, item.quantity - assignedQty);
      return {
        item,
        itemIdx,
        totalQty: item.quantity,
        assignedQty,
        unassignedQty,
        isFullyAssigned: assignedQty === item.quantity,
        isOverAssigned: assignedQty > item.quantity
      };
    });
  }, [currentOrder.items, itemSplitPeople, itemAssignments]);

  const allItemsFullyAssigned = useMemo(() => {
    return itemAllocationStatus.every(s => s.isFullyAssigned);
  }, [itemAllocationStatus]);

  // Calculate proportional totals per person in item split
  const itemSplitSummaries = useMemo(() => {
    const orderSubtotal = currentOrder.subtotal || 1;
    const effectiveDiscount = currentOrder.discountAmount || 0;
    const effectiveGst = currentOrder.gst || 0;
    const effectivePackaging = (currentOrder.orderType || "").toLowerCase() === "takeaway" ? 0 : (currentOrder.packagingCharge || 0);

    const summaries = itemSplitPeople.map(person => {
      let personSubtotal = 0;
      const personAssignedItems: SplitItemAssignment[] = [];

      (currentOrder.items || []).forEach((item, itemIdx) => {
        const qty = itemAssignments[`${person.id}_${itemIdx}`] || 0;
        if (qty > 0) {
          const lineTotal = item.price * qty;
          personSubtotal += lineTotal;
          personAssignedItems.push({
            menuItemId: item.menuItemId,
            name: item.name,
            unitPrice: item.price,
            quantity: qty,
            customization: item.customization
          });
        }
      });

      const subtotalRatio = orderSubtotal > 0 ? (personSubtotal / orderSubtotal) : (1 / itemSplitPeople.length);
      const allocatedDiscount = Math.round(effectiveDiscount * subtotalRatio * 100) / 100;
      const allocatedGst = Math.round(effectiveGst * subtotalRatio * 100) / 100;
      const allocatedPackaging = Math.round(effectivePackaging * subtotalRatio * 100) / 100;
      const calculatedTotal = Math.max(0, Math.round((personSubtotal - allocatedDiscount + allocatedGst + allocatedPackaging) * 100) / 100);

      return {
        person,
        items: personAssignedItems,
        subtotal: personSubtotal,
        discount: allocatedDiscount,
        gst: allocatedGst,
        packaging: allocatedPackaging,
        total: calculatedTotal
      };
    });

    if (allItemsFullyAssigned) {
      const sumCalculated = Math.round(summaries.reduce((sum, s) => sum + s.total, 0) * 100) / 100;
      const diff = Math.round((currentOrder.grandTotal - sumCalculated) * 100) / 100;
      if (Math.abs(diff) > 0 && Math.abs(diff) <= 0.5) {
        for (let i = summaries.length - 1; i >= 0; i--) {
          if (summaries[i].items.length > 0) {
            summaries[i].total = Math.max(0, Math.round((summaries[i].total + diff) * 100) / 100);
            break;
          }
        }
      }
    }

    return summaries;
  }, [currentOrder, itemSplitPeople, itemAssignments, allItemsFullyAssigned]);

  const itemSplitTotalSum = useMemo(() => {
    return Math.round(itemSplitSummaries.reduce((sum, s) => sum + s.total, 0) * 100) / 100;
  }, [itemSplitSummaries]);

  // Multi-Tender Sum
  const multiTenderSum = useMemo(() => {
    return Math.round(multiTenders.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) * 100) / 100;
  }, [multiTenders]);

  const multiTenderRemaining = useMemo(() => {
    const target = balanceDue > 0 ? balanceDue : currentOrder.grandTotal;
    return Math.round((target - multiTenderSum) * 100) / 100;
  }, [balanceDue, currentOrder.grandTotal, multiTenderSum]);

  // -------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------

  const handleSettleEqualSplit = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsProcessing(true);

    try {
      const splitGroupId = `SPLIT-EQ-${Date.now()}`;
      const paymentItems = equalSplitShares.map(share => ({
        amount: share.amount,
        paymentMethod: share.method,
        transactionReference: share.ref || undefined,
        notes: `Equal split (${share.name} of ${equalPeopleCount})`,
        createdBy: currentUser,
        splitGroupId,
        splitIndex: share.index,
        splitType: "equal" as const,
        customerName: share.name
      }));

      const settlements: SplitSettlement[] = equalSplitShares.map(share => ({
        id: `STL-${Date.now()}-${share.index}`,
        splitIndex: share.index,
        personName: share.name,
        splitType: "equal",
        allocatedSubtotal: share.amount,
        allocatedGst: 0,
        allocatedDiscount: 0,
        allocatedPackaging: 0,
        allocatedTotal: share.amount,
        paidAmount: share.amount,
        paymentStatus: "Paid",
        paymentMethod: share.method,
        transactionReference: share.ref,
        settledAt: new Date().toISOString(),
        settledBy: currentUser
      }));

      const result = await LocalDB.apiSettleOrderPayment(
        currentOrder.id,
        paymentItems,
        currentUser,
        {
          freeTableIfPaid: true,
          splitSettlements: settlements
        }
      );

      setCurrentOrder(result.order);
      setSuccessMsg(result.message);
      if (onOrderUpdated) onOrderUpdated(result.order);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to settle equal split payments.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSettleSingleEqualShare = async (share: typeof equalSplitShares[0]) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsProcessing(true);

    try {
      const paymentItem = {
        amount: share.amount,
        paymentMethod: share.method,
        transactionReference: share.ref || undefined,
        notes: `Equal split share for ${share.name}`,
        createdBy: currentUser,
        splitIndex: share.index,
        splitType: "equal" as const,
        customerName: share.name
      };

      const result = await LocalDB.apiSettleOrderPayment(
        currentOrder.id,
        [paymentItem],
        currentUser,
        { freeTableIfPaid: true }
      );

      setCurrentOrder(result.order);
      setSuccessMsg(`Recorded ₹${share.amount} payment for ${share.name}.`);
      if (onOrderUpdated) onOrderUpdated(result.order);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to settle share.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSettleCustomSplit = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const target = balanceDue > 0 ? balanceDue : currentOrder.grandTotal;
    if (Math.abs(customTotalAllocated - target) > 0.05) {
      setErrorMsg(`Total allocated (₹${customTotalAllocated}) does not match required payable amount (₹${target}). Difference: ₹${customRemaining}`);
      return;
    }

    setIsProcessing(true);

    try {
      const splitGroupId = `SPLIT-CUST-${Date.now()}`;
      const paymentItems = customSplits.map((s, idx) => ({
        amount: s.amount,
        paymentMethod: s.method,
        transactionReference: s.ref || undefined,
        notes: `Custom amount split for ${s.name}`,
        createdBy: currentUser,
        splitGroupId,
        splitIndex: idx,
        splitType: "amount" as const,
        customerName: s.name
      }));

      const settlements: SplitSettlement[] = customSplits.map((s, idx) => ({
        id: `STL-${Date.now()}-${idx}`,
        splitIndex: idx,
        personName: s.name,
        splitType: "amount",
        allocatedSubtotal: s.amount,
        allocatedGst: 0,
        allocatedDiscount: 0,
        allocatedPackaging: 0,
        allocatedTotal: s.amount,
        paidAmount: s.amount,
        paymentStatus: "Paid",
        paymentMethod: s.method,
        transactionReference: s.ref,
        settledAt: new Date().toISOString(),
        settledBy: currentUser
      }));

      const result = await LocalDB.apiSettleOrderPayment(
        currentOrder.id,
        paymentItems,
        currentUser,
        {
          freeTableIfPaid: true,
          splitSettlements: settlements
        }
      );

      setCurrentOrder(result.order);
      setSuccessMsg(result.message);
      if (onOrderUpdated) onOrderUpdated(result.order);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to settle custom split.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSettleItemSplit = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!allItemsFullyAssigned) {
      setErrorMsg("All ordered items and quantities must be assigned to people before settling split by items.");
      return;
    }

    setIsProcessing(true);

    try {
      const splitGroupId = `SPLIT-ITEM-${Date.now()}`;
      const paymentItems = itemSplitSummaries
        .filter(s => s.total > 0)
        .map((s, idx) => ({
          amount: s.total,
          paymentMethod: s.person.method,
          transactionReference: s.person.ref || undefined,
          notes: `Itemized split bill for ${s.person.name}`,
          createdBy: currentUser,
          splitGroupId,
          splitIndex: idx,
          splitType: "items" as const,
          splitItemNames: s.items.map(it => `${it.quantity}x ${it.name}`),
          customerName: s.person.name
        }));

      const settlements: SplitSettlement[] = itemSplitSummaries.map((s, idx) => ({
        id: `STL-${Date.now()}-${idx}`,
        splitIndex: idx,
        personName: s.person.name,
        splitType: "items",
        items: s.items,
        allocatedSubtotal: s.subtotal,
        allocatedGst: s.gst,
        allocatedDiscount: s.discount,
        allocatedPackaging: s.packaging,
        allocatedTotal: s.total,
        paidAmount: s.total,
        paymentStatus: "Paid",
        paymentMethod: s.person.method,
        transactionReference: s.person.ref,
        settledAt: new Date().toISOString(),
        settledBy: currentUser
      }));

      const result = await LocalDB.apiSettleOrderPayment(
        currentOrder.id,
        paymentItems,
        currentUser,
        {
          freeTableIfPaid: true,
          splitSettlements: settlements
        }
      );

      setCurrentOrder(result.order);
      setSuccessMsg(result.message);
      if (onOrderUpdated) onOrderUpdated(result.order);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to settle itemized split.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSettleMultiTender = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const target = balanceDue > 0 ? balanceDue : currentOrder.grandTotal;
    if (Math.abs(multiTenderSum - target) > 0.05) {
      setErrorMsg(`Total tender amount (₹${multiTenderSum}) does not match payable amount (₹${target}). Difference: ₹${multiTenderRemaining}`);
      return;
    }

    setIsProcessing(true);

    try {
      const splitGroupId = `MULTI-${Date.now()}`;
      const validTenders = multiTenders.filter(t => t.amount > 0);
      const paymentItems = validTenders.map((t, idx) => ({
        amount: t.amount,
        paymentMethod: t.method,
        transactionReference: t.ref || undefined,
        notes: `Multi-tender payment (${t.method})`,
        createdBy: currentUser,
        splitGroupId,
        splitIndex: idx,
        splitType: "multi_pay" as const
      }));

      const result = await LocalDB.apiSettleOrderPayment(
        currentOrder.id,
        paymentItems,
        currentUser,
        { freeTableIfPaid: true }
      );

      setCurrentOrder(result.order);
      setSuccessMsg(result.message);
      if (onOrderUpdated) onOrderUpdated(result.order);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process multi-tender payment.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecordPartialPayment = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const amt = parseFloat(partialAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg("Please enter a valid partial payment amount greater than 0.");
      return;
    }

    if (amt > balanceDue + 0.05) {
      setErrorMsg(`Amount ₹${amt} exceeds the remaining balance due of ₹${balanceDue}.`);
      return;
    }

    setIsProcessing(true);

    try {
      const paymentItem = {
        amount: amt,
        paymentMethod: partialMethod,
        transactionReference: partialRef || undefined,
        notes: `Partial payment received`,
        createdBy: currentUser,
        splitType: "single" as const
      };

      const result = await LocalDB.apiSettleOrderPayment(
        currentOrder.id,
        [paymentItem],
        currentUser,
        { freeTableIfPaid: true }
      );

      setCurrentOrder(result.order);
      setSuccessMsg(`Recorded partial payment of ₹${amt} via ${partialMethod}.`);
      setPartialAmount("");
      setPartialRef("");
      if (onOrderUpdated) onOrderUpdated(result.order);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to record partial payment.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoidPayment = async (paymentId: string) => {
    if (!window.confirm(`Are you sure you want to void payment #${paymentId}? This will reverse the paid amount on this order.`)) {
      return;
    }

    const reason = window.prompt("Enter reason for voiding this payment:", "Customer requested reversal");
    if (reason === null) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const result = await LocalDB.apiVoidPaymentRecord(paymentId, currentUser, reason);
      setCurrentOrder(result.order);
      setSuccessMsg(result.message);
      if (onOrderUpdated) onOrderUpdated(result.order);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to void payment.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintFullBill = () => {
    PhysicalThermalPrinter.printBillSystemFallback(currentOrder, settings);
  };

  const handlePrintSplitSlip = (split: SplitSettlement | any) => {
    PhysicalThermalPrinter.printSplitReceipt(split, currentOrder, settings);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-stone-900/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        id="split-bill-modal-container"
        className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-[#d4af37]/15 text-[#9a7b20] dark:text-[#d4af37] rounded-lg">
                <Receipt className="w-5 h-5" />
              </span>
              <h3 className="font-serif font-bold text-stone-900 dark:text-stone-100 text-lg sm:text-xl">
                Split Bill & Payment Settlement
              </h3>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 flex items-center gap-2">
              <span>Order #{currentOrder.id}</span>
              <span>•</span>
              <span className="font-medium text-stone-700 dark:text-stone-300">
                {currentOrder.tableNumber ? `Table #${currentOrder.tableNumber}` : (currentOrder.orderType || "Dine-in").toUpperCase()}
              </span>
              <span>•</span>
              <span>{currentOrder.items?.length || 0} Items</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintFullBill}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Print standard thermal tax bill"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print Tax Bill</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ORDER FINANCIAL SUMMARY BANNER */}
        <div className="bg-stone-100/70 dark:bg-stone-800/60 px-4 sm:px-6 py-3 border-b border-stone-200 dark:border-stone-800 grid grid-cols-3 gap-3 text-center">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500 dark:text-stone-400 block">Total Bill</span>
            <span className="font-serif font-bold text-base sm:text-lg text-stone-900 dark:text-stone-100">
              ₹{Number(currentOrder.grandTotal).toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500 dark:text-stone-400 block">Paid Amount</span>
            <span className="font-serif font-bold text-base sm:text-lg text-emerald-600 dark:text-emerald-400">
              ₹{existingPaid.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500 dark:text-stone-400 block">Balance Due</span>
            <span className={`font-serif font-bold text-base sm:text-lg ${isFullyPaid ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              ₹{balanceDue.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ALERTS */}
        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* SPLIT TABS SELECTION */}
        <div className="px-4 sm:px-6 pt-3 flex gap-2 border-b border-stone-200 dark:border-stone-800 overflow-x-auto">
          <button
            id="tab-equal-split"
            onClick={() => setActiveMode("equal")}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeMode === "equal"
                ? "border-[#d4af37] text-[#9a7b20] dark:text-[#d4af37]"
                : "border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            <Users className="w-4 h-4" />
            Split Equally
          </button>
          <button
            id="tab-items-split"
            onClick={() => setActiveMode("items")}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeMode === "items"
                ? "border-[#d4af37] text-[#9a7b20] dark:text-[#d4af37]"
                : "border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            <Utensils className="w-4 h-4" />
            Split by Items
          </button>
          <button
            id="tab-amount-split"
            onClick={() => setActiveMode("amount")}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeMode === "amount"
                ? "border-[#d4af37] text-[#9a7b20] dark:text-[#d4af37]"
                : "border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Custom Amount
          </button>
          <button
            id="tab-multi-tender"
            onClick={() => setActiveMode("multi_tender")}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeMode === "multi_tender"
                ? "border-[#d4af37] text-[#9a7b20] dark:text-[#d4af37]"
                : "border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Multi-Tender Pay
          </button>
        </div>

        {/* MODAL MAIN CONTENT BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* 1. EQUAL SPLIT MODE */}
          {activeMode === "equal" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-stone-50 dark:bg-stone-800/40 p-4 rounded-xl border border-stone-200 dark:border-stone-800">
                <div>
                  <label className="text-xs font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider block">
                    Number of People
                  </label>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Bill of ₹{balanceDue > 0 ? balanceDue.toFixed(2) : currentOrder.grandTotal.toFixed(2)} will be divided accurately.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEqualPeopleCount(Math.max(2, equalPeopleCount - 1))}
                    className="w-8 h-8 rounded-lg bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 font-bold text-stone-800 dark:text-stone-200 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-mono font-bold text-base px-3 py-1 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-lg min-w-10 text-center">
                    {equalPeopleCount}
                  </span>
                  <button
                    onClick={() => setEqualPeopleCount(Math.min(16, equalPeopleCount + 1))}
                    className="w-8 h-8 rounded-lg bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 font-bold text-stone-800 dark:text-stone-200 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* SHARES LIST */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {equalSplitShares.map((share) => (
                  <div
                    key={share.index}
                    className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 space-y-3 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-mono font-bold flex items-center justify-center">
                          {share.index + 1}
                        </span>
                        <span className="font-semibold text-stone-800 dark:text-stone-200 text-sm">
                          {share.name}
                        </span>
                      </div>
                      <span className="font-serif font-bold text-base text-stone-900 dark:text-stone-100">
                        ₹{share.amount.toFixed(2)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-stone-400 font-mono uppercase block mb-1">Pay Mode</label>
                        <select
                          value={equalPayMethods[share.index]?.method || share.method}
                          onChange={(e) => {
                            const m = e.target.value;
                            setEqualPayMethods(prev => ({
                              ...prev,
                              [share.index]: { ...(prev[share.index] || { ref: "" }), method: m }
                            }));
                          }}
                          className="w-full text-xs p-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-medium"
                        >
                          <option value="Cash">💵 Cash</option>
                          <option value="UPI">📱 UPI</option>
                          <option value="Card">💳 Card</option>
                          <option value="Bank Transfer">🏦 Bank Transfer</option>
                          <option value="Other">🏷️ Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-stone-400 font-mono uppercase block mb-1">Txn Ref #</label>
                        <input
                          type="text"
                          placeholder="Optional"
                          value={equalPayMethods[share.index]?.ref || ""}
                          onChange={(e) => {
                            const r = e.target.value;
                            setEqualPayMethods(prev => ({
                              ...prev,
                              [share.index]: { ...(prev[share.index] || { method: "Cash" }), ref: r }
                            }));
                          }}
                          className="w-full text-xs p-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800">
                      <button
                        onClick={() => handlePrintSplitSlip({
                          personName: share.name,
                          splitIndex: share.index,
                          splitType: "equal",
                          allocatedTotal: share.amount,
                          paidAmount: share.amount,
                          paymentStatus: "Paid",
                          paymentMethod: equalPayMethods[share.index]?.method || share.method,
                          transactionReference: equalPayMethods[share.index]?.ref || ""
                        })}
                        className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 flex items-center gap-1 font-medium cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Print Slip
                      </button>

                      <button
                        onClick={() => handleSettleSingleEqualShare(share)}
                        disabled={isProcessing || isFullyPaid}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Pay Share
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* BATCH ACTION */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSettleEqualSplit}
                  disabled={isProcessing || isFullyPaid}
                  className="w-full sm:w-auto px-6 py-2.5 bg-stone-900 hover:bg-stone-800 dark:bg-[#d4af37] dark:hover:bg-[#b5952f] text-white dark:text-stone-900 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Settle All {equalPeopleCount} Shares (₹{balanceDue > 0 ? balanceDue.toFixed(2) : currentOrder.grandTotal.toFixed(2)})
                </button>
              </div>
            </div>
          )}

          {/* 2. SPLIT BY ITEMS MODE */}
          {activeMode === "items" && (
            <div className="space-y-5">
              {/* PEOPLE CONTROLS */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider">
                    People & Item Allocations
                  </h4>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Assign ordered dishes to guests. Taxes & discounts are distributed proportionally.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newId = `person-${itemSplitPeople.length + 1}`;
                    setItemSplitPeople(prev => [
                      ...prev,
                      { id: newId, name: `Person ${prev.length + 1}`, method: "Cash", ref: "" }
                    ]);
                  }}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Person
                </button>
              </div>

              {/* ITEMS ALLOCATION MATRIX */}
              <div className="border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden bg-white dark:bg-stone-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-stone-50 dark:bg-stone-800/70 border-b border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 font-mono uppercase text-[10px]">
                        <th className="p-3">Item Name</th>
                        <th className="p-3 text-center">Unit Price</th>
                        <th className="p-3 text-center">Total Qty</th>
                        {itemSplitPeople.map((p) => (
                          <th key={p.id} className="p-3 text-center min-w-28">
                            <input
                              type="text"
                              value={p.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setItemSplitPeople(prev => prev.map(itemP => itemP.id === p.id ? { ...itemP, name: val } : itemP));
                              }}
                              className="font-bold text-center bg-transparent border-b border-dashed border-stone-300 dark:border-stone-600 focus:outline-none text-xs w-full text-stone-900 dark:text-stone-100"
                            />
                          </th>
                        ))}
                        <th className="p-3 text-center">Unassigned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {itemAllocationStatus.map(({ item, itemIdx, totalQty, assignedQty, unassignedQty, isOverAssigned }) => (
                        <tr key={itemIdx} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                          <td className="p-3 font-semibold text-stone-800 dark:text-stone-200">
                            {item.name}
                            {item.customization && (
                              <span className="block text-[10px] font-normal text-stone-400 italic">
                                + {item.customization}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono text-stone-600 dark:text-stone-400">
                            ₹{Number(item.price).toFixed(2)}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-stone-800 dark:text-stone-200">
                            {totalQty}
                          </td>

                          {/* People Quantity Steppers */}
                          {itemSplitPeople.map((p) => {
                            const key = `${p.id}_${itemIdx}`;
                            const currentQty = itemAssignments[key] || 0;
                            return (
                              <td key={p.id} className="p-2 text-center">
                                <div className="inline-flex items-center border border-stone-300 dark:border-stone-700 rounded-lg overflow-hidden bg-stone-50 dark:bg-stone-800">
                                  <button
                                    onClick={() => {
                                      setItemAssignments(prev => ({
                                        ...prev,
                                        [key]: Math.max(0, currentQty - 1)
                                      }));
                                    }}
                                    disabled={currentQty <= 0}
                                    className="px-2 py-1 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-30 cursor-pointer font-bold"
                                  >
                                    -
                                  </button>
                                  <span className="w-7 text-center font-mono font-bold text-xs">
                                    {currentQty}
                                  </span>
                                  <button
                                    onClick={() => {
                                      if (unassignedQty > 0) {
                                        setItemAssignments(prev => ({
                                          ...prev,
                                          [key]: currentQty + 1
                                        }));
                                      }
                                    }}
                                    disabled={unassignedQty <= 0}
                                    className="px-2 py-1 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-30 cursor-pointer font-bold"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                            );
                          })}

                          <td className="p-3 text-center font-mono">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              unassignedQty === 0
                                ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                                : isOverAssigned
                                ? "bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300"
                                : "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300"
                            }`}>
                              {unassignedQty} left
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* PERSON SUMMARIES & PAYMENT CONTROLS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {itemSplitSummaries.map(({ person, items: assignedItems, subtotal: pSubtotal, discount: pDisc, gst: pGst, packaging: pPkg, total: pTotal }, idx) => (
                  <div key={person.id} className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-stone-800 dark:text-stone-200">
                        {person.name} ({assignedItems.length} items)
                      </span>
                      <span className="font-serif font-bold text-base text-stone-900 dark:text-stone-100">
                        ₹{pTotal.toFixed(2)}
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-500 dark:text-stone-400 space-y-1 bg-stone-50 dark:bg-stone-800/40 p-2.5 rounded-lg font-mono">
                      <div className="flex justify-between">
                        <span>Items Subtotal:</span>
                        <span>₹{pSubtotal.toFixed(2)}</span>
                      </div>
                      {pDisc > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                          <span>Discount Share:</span>
                          <span>-₹{pDisc.toFixed(2)}</span>
                        </div>
                      )}
                      {pGst > 0 && (
                        <div className="flex justify-between">
                          <span>GST Share:</span>
                          <span>+₹{pGst.toFixed(2)}</span>
                        </div>
                      )}
                      {pPkg > 0 && (
                        <div className="flex justify-between">
                          <span>Packaging Share:</span>
                          <span>+₹{pPkg.toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={person.method}
                        onChange={(e) => {
                          const m = e.target.value;
                          setItemSplitPeople(prev => prev.map(p => p.id === person.id ? { ...p, method: m } : p));
                        }}
                        className="text-xs p-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                      >
                        <option value="Cash">💵 Cash</option>
                        <option value="UPI">📱 UPI</option>
                        <option value="Card">💳 Card</option>
                        <option value="Bank Transfer">🏦 Bank Transfer</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Txn Ref #"
                        value={person.ref}
                        onChange={(e) => {
                          const r = e.target.value;
                          setItemSplitPeople(prev => prev.map(p => p.id === person.id ? { ...p, ref: r } : p));
                        }}
                        className="text-xs p-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => handlePrintSplitSlip({
                          personName: person.name,
                          splitIndex: idx,
                          splitType: "items",
                          items: assignedItems,
                          allocatedSubtotal: pSubtotal,
                          allocatedDiscount: pDisc,
                          allocatedGst: pGst,
                          allocatedPackaging: pPkg,
                          allocatedTotal: pTotal,
                          paidAmount: pTotal,
                          paymentStatus: "Paid",
                          paymentMethod: person.method,
                          transactionReference: person.ref
                        })}
                        className="text-xs text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 flex items-center gap-1 font-medium cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Print Split Slip
                      </button>

                      {itemSplitPeople.length > 2 && (
                        <button
                          onClick={() => {
                            setItemSplitPeople(prev => prev.filter(p => p.id !== person.id));
                          }}
                          className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* ITEM SPLIT SUBMIT ACTION */}
              <div className="pt-2 flex justify-between items-center">
                <div className="text-xs">
                  <span className="text-stone-500">Allocated Sum: </span>
                  <span className="font-mono font-bold text-stone-800 dark:text-stone-200">₹{itemSplitTotalSum.toFixed(2)}</span>
                  <span className="text-stone-400"> / ₹{currentOrder.grandTotal.toFixed(2)}</span>
                </div>

                <button
                  onClick={handleSettleItemSplit}
                  disabled={isProcessing || !allItemsFullyAssigned || isFullyPaid}
                  className="px-6 py-2.5 bg-stone-900 hover:bg-stone-800 dark:bg-[#d4af37] dark:hover:bg-[#b5952f] text-white dark:text-stone-900 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Settle Itemized Split Bill
                </button>
              </div>
            </div>
          )}

          {/* 3. CUSTOM AMOUNT SPLIT MODE */}
          {activeMode === "amount" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider">
                    Custom Amount Distribution
                  </h4>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Specify exact payment amounts for each party. Total must equal ₹{balanceDue > 0 ? balanceDue.toFixed(2) : currentOrder.grandTotal.toFixed(2)}.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const newId = `cust-${customSplits.length + 1}`;
                    setCustomSplits(prev => [
                      ...prev,
                      { id: newId, name: `Person ${prev.length + 1}`, amount: Math.max(0, customRemaining), method: "Cash", ref: "" }
                    ]);
                  }}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Payer
                </button>
              </div>

              <div className="space-y-2.5">
                {customSplits.map((s, idx) => (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-center"
                  >
                    <div>
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomSplits(prev => prev.map(item => item.id === s.id ? { ...item, name: val } : item));
                        }}
                        className="w-full text-xs font-semibold p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200"
                        placeholder="Person Name"
                      />
                    </div>

                    <div>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 text-stone-400 font-mono text-xs">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          value={s.amount || ""}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setCustomSplits(prev => prev.map(item => item.id === s.id ? { ...item, amount: val } : item));
                          }}
                          className="w-full text-xs font-mono font-bold pl-6 p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div>
                      <select
                        value={s.method}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomSplits(prev => prev.map(item => item.id === s.id ? { ...item, method: val } : item));
                        }}
                        className="w-full text-xs p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-medium"
                      >
                        <option value="Cash">💵 Cash</option>
                        <option value="UPI">📱 UPI</option>
                        <option value="Card">💳 Card</option>
                        <option value="Bank Transfer">🏦 Bank Transfer</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Txn Ref #"
                        value={s.ref}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomSplits(prev => prev.map(item => item.id === s.id ? { ...item, ref: val } : item));
                        }}
                        className="w-full text-xs p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono"
                      />
                      {customSplits.length > 2 && (
                        <button
                          onClick={() => setCustomSplits(prev => prev.filter(item => item.id !== s.id))}
                          className="p-2 text-stone-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* ALLOCATION PROGRESS BAR */}
              <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2">
                <div className="flex justify-between text-xs font-mono font-semibold">
                  <span>Allocated: ₹{customTotalAllocated.toFixed(2)}</span>
                  <span className={customRemaining === 0 ? "text-emerald-600" : "text-amber-600"}>
                    {customRemaining === 0 ? "✓ Exact Total Reached" : `Remaining: ₹${customRemaining.toFixed(2)}`}
                  </span>
                </div>
                <div className="w-full bg-stone-200 dark:bg-stone-700 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${customRemaining === 0 ? "bg-emerald-500" : "bg-[#d4af37]"}`}
                    style={{ width: `${Math.min(100, (customTotalAllocated / (balanceDue > 0 ? balanceDue : currentOrder.grandTotal)) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSettleCustomSplit}
                  disabled={isProcessing || Math.abs(customRemaining) > 0.05 || isFullyPaid}
                  className="px-6 py-2.5 bg-stone-900 hover:bg-stone-800 dark:bg-[#d4af37] dark:hover:bg-[#b5952f] text-white dark:text-stone-900 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Settle Custom Amounts (₹{customTotalAllocated.toFixed(2)})
                </button>
              </div>
            </div>
          )}

          {/* 4. MULTI-TENDER / PARTIAL PAYMENT MODE */}
          {activeMode === "multi_tender" && (
            <div className="space-y-6">
              {/* MULTI TENDER SECTION */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider">
                      Split by Payment Tender (e.g. Cash + UPI)
                    </h4>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      Settle a single bill using multiple payment methods simultaneously.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const newId = `tender-${multiTenders.length + 1}`;
                      setMultiTenders(prev => [
                        ...prev,
                        { id: newId, method: "Card", amount: Math.max(0, multiTenderRemaining), ref: "" }
                      ]);
                    }}
                    className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Tender
                  </button>
                </div>

                <div className="space-y-2">
                  {multiTenders.map((tender) => (
                    <div
                      key={tender.id}
                      className="p-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center"
                    >
                      <select
                        value={tender.method}
                        onChange={(e) => {
                          const m = e.target.value;
                          setMultiTenders(prev => prev.map(t => t.id === tender.id ? { ...t, method: m } : t));
                        }}
                        className="text-xs p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 font-semibold text-stone-800 dark:text-stone-200"
                      >
                        <option value="Cash">💵 Cash</option>
                        <option value="UPI">📱 UPI</option>
                        <option value="Card">💳 Card</option>
                        <option value="Bank Transfer">🏦 Bank Transfer</option>
                        <option value="Credit">📋 Customer Credit</option>
                      </select>

                      <div className="relative">
                        <span className="absolute left-2.5 top-2 text-stone-400 font-mono text-xs">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          value={tender.amount || ""}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setMultiTenders(prev => prev.map(t => t.id === tender.id ? { ...t, amount: val } : t));
                          }}
                          className="w-full text-xs font-mono font-bold pl-6 p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100"
                          placeholder="Amount"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Txn Ref #"
                          value={tender.ref}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMultiTenders(prev => prev.map(t => t.id === tender.id ? { ...t, ref: val } : t));
                          }}
                          className="w-full text-xs p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-mono"
                        />
                        {multiTenders.length > 1 && (
                          <button
                            onClick={() => setMultiTenders(prev => prev.filter(t => t.id !== tender.id))}
                            className="p-1.5 text-stone-400 hover:text-rose-500 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-mono">
                    Total: <b>₹{multiTenderSum.toFixed(2)}</b> / ₹{(balanceDue > 0 ? balanceDue : currentOrder.grandTotal).toFixed(2)}
                  </span>
                  <button
                    onClick={handleSettleMultiTender}
                    disabled={isProcessing || Math.abs(multiTenderRemaining) > 0.05 || isFullyPaid}
                    className="px-6 py-2.5 bg-stone-900 hover:bg-stone-800 dark:bg-[#d4af37] dark:hover:bg-[#b5952f] text-white dark:text-stone-900 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Settle Multi-Tender Payment
                  </button>
                </div>
              </div>

              {/* DIRECT PARTIAL PAYMENT SECTION */}
              <div className="pt-4 border-t border-stone-200 dark:border-stone-800">
                <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider mb-1">
                  Record Single Partial Payment / Advance
                </h4>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mb-3">
                  Take a partial installment. The order and table will remain active until the total bill is satisfied.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-center bg-stone-50 dark:bg-stone-800/40 p-3.5 rounded-xl border border-stone-200 dark:border-stone-800">
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-stone-400 font-mono text-xs">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Amount"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      className="w-full text-xs font-mono font-bold pl-6 p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900"
                    />
                  </div>

                  <select
                    value={partialMethod}
                    onChange={(e) => setPartialMethod(e.target.value)}
                    className="text-xs p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 font-medium"
                  >
                    <option value="Cash">💵 Cash</option>
                    <option value="UPI">📱 UPI</option>
                    <option value="Card">💳 Card</option>
                    <option value="Bank Transfer">🏦 Bank Transfer</option>
                  </select>

                  <input
                    type="text"
                    placeholder="Txn Reference (Opt)"
                    value={partialRef}
                    onChange={(e) => setPartialRef(e.target.value)}
                    className="text-xs p-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 font-mono"
                  />

                  <button
                    onClick={handleRecordPartialPayment}
                    disabled={isProcessing || !partialAmount || isFullyPaid}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Record Partial
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5. PAYMENTS LEDGER & TRANSACTION HISTORY */}
          {orderPayments.length > 0 && (
            <div className="pt-4 border-t border-stone-200 dark:border-stone-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider">
                  Payment Transactions Ledger ({orderPayments.length})
                </h4>
                <span className="text-[11px] font-mono text-stone-500">
                  Total Settled: ₹{existingPaid.toFixed(2)}
                </span>
              </div>

              <div className="divide-y divide-stone-100 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden bg-white dark:bg-stone-900">
                {orderPayments.map((p) => {
                  const isVoided = p.status === "Voided";
                  return (
                    <div key={p.id} className={`p-3 text-xs flex items-center justify-between gap-2 ${isVoided ? "opacity-50 bg-stone-50/50" : ""}`}>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                            ₹{Number(p.amount).toFixed(2)}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                            {p.paymentMethod}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            p.status === "Paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-rose-100 text-rose-700"
                          }`}>
                            {p.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-stone-400 font-mono">
                          {p.id} • {new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by {p.createdBy}
                          {p.transactionReference ? ` • Ref: ${p.transactionReference}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isVoided && (
                          <button
                            onClick={() => handleVoidPayment(p.id)}
                            disabled={isProcessing}
                            className="px-2 py-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded text-[11px] font-medium transition-colors cursor-pointer"
                            title="Void this payment transaction"
                          >
                            Void
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 flex items-center justify-between">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {isFullyPaid ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Fully Settled & Cleared
              </span>
            ) : (
              <span>Balance due: <b>₹{balanceDue.toFixed(2)}</b></span>
            )}
          </span>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Done / Close
          </button>
        </div>
      </div>
    </div>
  );
};
