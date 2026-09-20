import React, { useState, useMemo, useEffect } from "react";
import {
  Plus, Search, Calculator, Shield, ShieldAlert,
  Trash2, Edit3, ClipboardList, CheckCircle, FileText, ShoppingCart,
  Percent, ArrowRight, User, Phone, MapPin, Sparkles, Hash, Layers,
  Printer, AlertCircle, RefreshCw, X, ArrowRightLeft, Receipt, Loader2, CheckCircle2,
  MessageCircle, UtensilsCrossed, Users, MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LocalDB, Order, Coupon, InventoryItem, AuditLog, RestaurantSettings, isSameTable } from "../lib/db";
import { MenuItem, RestaurantTable, Category, StaffMember, PermissionKey } from "../types";
import { PhysicalThermalPrinter, getWRPrinterSettings } from "../lib/printerService";
import { JSPrintManagerService, JSPMStatusInfo } from "../lib/jsprintmanagerService";
import { PrinterManager } from "../lib/printerManager";
import { RBACService } from "../lib/rbac";
import { calculateTax } from "../lib/taxService";
import TransferTableModal from "./TransferTableModal";
import { SplitBillModal } from "./SplitBillModal";
import WhatsAppDailySummaryModal from "./WhatsAppDailySummaryModal";
import VisualTableManagement from "./VisualTableManagement";

interface PosBillingPortalProps {
  menuItems: MenuItem[];
  orders: Order[];
  tables: RestaurantTable[];
  settings: RestaurantSettings;
  coupons: Coupon[];
  onOrderPlaced: () => void;
  setShowBillPrint?: (order: Order | null) => void;
  initialTableNumber?: string;
}

interface CartItem {
  id: string; // "item-" + id or "manual-" + timestamp
  name: string;
  price: number;
  quantity: number;
  customization?: string;
  isManual: boolean;
  category?: string;
  gstRate: number; // e.g. 5, 12, 18, 28
  discount: number; // item-level discount percentage (0 to 100)
  hsnCode?: string;
  isKotSent?: boolean;
  kotNumber?: string;
}

export default function PosBillingPortal({
  menuItems,
  orders,
  tables,

  settings,
  coupons,
  onOrderPlaced,
  setShowBillPrint,
  initialTableNumber
}: PosBillingPortalProps) {
  // Staff Operator & Role State
  const [activeStaff, setActiveStaff] = useState<StaffMember>(() => RBACService.getActiveStaff());
  const currentRole = (activeStaff.role === "Owner" ? "Owner" : activeStaff.role === "Manager" ? "Manager" : "Cashier") as "Owner" | "Manager" | "Cashier";

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);

  // Customer State
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  // Order Configuration State (DEFAULT IS TAKEAWAY)
  const [orderType, setOrderType] = useState<"dine-in" | "takeaway" | "delivery">("takeaway");
  const [selectedTable, setSelectedTable] = useState("");
  const [posPaymentStatus, setPosPaymentStatus] = useState<"Paid" | "Pending">("Paid");
  const [posPaymentMethod, setPosPaymentMethod] = useState<"UPI" | "Cash" | "Card">("UPI");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Additional POS Session Metadata (Staff, PAX, Order Instructions)
  const [staffList, setStaffList] = useState<StaffMember[]>(() => RBACService.getStaffMembers());
  const [selectedStaffName, setSelectedStaffName] = useState<string>(() => activeStaff.name || "SATENDRA");
  const [paxCount, setPaxCount] = useState<number>(1);
  const [orderInstructions, setOrderInstructions] = useState<string>("");

  // Group cart items into printed KOT batches and new unprinted items
  const groupedKotItems = useMemo(() => {
    const printedBatches: Record<string, CartItem[]> = {};
    const unprintedItems: CartItem[] = [];

    cart.forEach(item => {
      if (item.isKotSent && item.kotNumber) {
        if (!printedBatches[item.kotNumber]) {
          printedBatches[item.kotNumber] = [];
        }
        printedBatches[item.kotNumber].push(item);
      } else {
        unprintedItems.push(item);
      }
    });

    return { printedBatches, unprintedItems };
  }, [cart]);

  // Total Quantity of all items in cart
  const totalCartQuantity = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Multi-Table Cart Memory & Customer Info state map
  const [tableCarts, setTableCarts] = useState<Record<string, CartItem[]>>({});
  const [tableCustomerInfo, setTableCustomerInfo] = useState<Record<string, { name: string; phone: string; email: string; address: string }>>({});

  const handleTableChange = (newTable: string) => {
    // 1. Save active cart and customer details for current selectedTable before switching
    if (selectedTable && orderType === "dine-in") {
      setTableCarts(prev => ({ ...prev, [selectedTable]: cart }));
      setTableCustomerInfo(prev => ({
        ...prev,
        [selectedTable]: {
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          address: customerAddress
        }
      }));
    }

    setSelectedTable(newTable);

    if (!newTable) {
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setCustomerAddress("");
      return;
    }

    // 2. Load draft cart if present in tableCarts
    if (tableCarts[newTable] && tableCarts[newTable].length > 0) {
      setCart(tableCarts[newTable]);
      const info = tableCustomerInfo[newTable];
      if (info) {
        setCustomerName(info.name || "");
        setCustomerPhone(info.phone || "");
        setCustomerEmail(info.email || "");
        setCustomerAddress(info.address || "");
      }
    } else {
      // 3. Otherwise, check for existing active unpaid order for newTable
      const activeOrder = orders.find(
        o => o.orderType === "dine-in" &&
          isSameTable(o.tableNumber, newTable) &&
          o.paymentStatus !== "Paid" &&
          o.orderStatus !== "Cancelled"
      );

      if (activeOrder && activeOrder.items && activeOrder.items.length > 0) {
        const loadedCart: CartItem[] = activeOrder.items.map((item, idx) => ({
          id: `order-item-${idx}-${item.name}`,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          customization: item.customization || "",
          isManual: false,
          category: item.category || "General",
          gstRate: item.gstRate ?? (settings.gstEnabled ? (settings.gstRate || 0) : 0),
          discount: item.discount ?? 0,
          hsnCode: item.hsnCode || "",
          isKotSent: true,
          kotNumber: item.kotNumber || activeOrder.kotNumber || "KOT-0001"
        }));
        setCart(loadedCart);
        setCustomerName(activeOrder.customerName || `Table #${newTable}`);
        setCustomerPhone(activeOrder.phoneNumber || "");
        setCustomerEmail(activeOrder.email || "");
        setCustomerAddress(activeOrder.address || "");
      } else {
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setCustomerEmail("");
        setCustomerAddress("");
      }
    }
  };

  useEffect(() => {
    if (initialTableNumber) {
      setOrderType("dine-in");
      handleTableChange(initialTableNumber);
    }
  }, [initialTableNumber]);

  const [isFinalizing, setIsFinalizing] = useState(false);
  const [justPrinted, setJustPrinted] = useState(false);
  const [isPrintingKOT, setIsPrintingKOT] = useState(false);
  const [justPrintedKOT, setJustPrintedKOT] = useState(false);
  const [printNotice, setPrintNotice] = useState<{
    type: "success" | "warning";
    message: string;
    details?: string;
    order?: Order;
    suggestedPrinter?: string;
    candidatePrinters?: string[];
  } | null>(null);

  // Table Transfer Modal State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSourceTable, setTransferSourceTable] = useState<string | null>(null);
  const [transferSourceOrder, setTransferSourceOrder] = useState<Order | null>(null);

  // Split Bill & Settlement Modal State
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitTargetOrder, setSplitTargetOrder] = useState<Order | null>(null);

  // JSPrintManager Live Connection & Printer Status
  const [jspmStatus, setJspmStatus] = useState<JSPMStatusInfo>(() => JSPrintManagerService.getStatus());
  const [detectedPrinterName, setDetectedPrinterName] = useState<string>(() => JSPrintManagerService.getStatus().activePrinter || "EPSON TM-T82X Receipt");
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Safe inline reconnect handler without navigation or popup
  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      await JSPrintManagerService.init();
      const updated = JSPrintManagerService.getStatus();
      setJspmStatus(updated);
      if (updated.activePrinter) {
        setDetectedPrinterName(updated.activePrinter);
      }
      if (updated.isConnected) {
        setPrintNotice(prev => prev?.type === "warning" ? null : prev);
      }
    } catch (err) {
      console.warn("[POS Reconnect Error]", err);
    } finally {
      setIsReconnecting(false);
    }
  };

  useEffect(() => {
    // Initialize shared JSPrintManager client connection on POS mount
    JSPrintManagerService.init();

    const unsubscribe = JSPrintManagerService.onStatusChange((status) => {
      setJspmStatus(status);
      if (status.activePrinter) {
        setDetectedPrinterName(status.activePrinter);
      } else if (status.detectedPrinters && status.detectedPrinters.length > 0) {
        setDetectedPrinterName(status.detectedPrinters[0]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleStorageChange = () => {
      onOrderPlaced();
    };
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("new_order", handleStorageChange);
    window.addEventListener("tables_updated", handleStorageChange);
    window.addEventListener("payments_updated", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("new_order", handleStorageChange);
      window.removeEventListener("tables_updated", handleStorageChange);
      window.removeEventListener("payments_updated", handleStorageChange);
    };
  }, [onOrderPlaced]);

  const activeOrderForSelectedTable = useMemo(() => {
    if (orderType !== "dine-in" || !selectedTable) return null;
    return orders.find(o =>
      o.orderType === "dine-in" &&
      isSameTable(o.tableNumber, selectedTable) &&
      o.paymentStatus !== "Paid" &&
      o.orderStatus !== "Cancelled"
    );
  }, [orderType, selectedTable, orders]);

  // Search & Filters for Regular Items Catalog
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");

  // Modals Toggles
  const [showManualModal, setShowManualModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showBillPreviewModal, setShowBillPreviewModal] = useState(false);
  // Manual Item Form States
  const [manualName, setManualName] = useState("");
  const [manualCategory, setManualCategory] = useState("General");
  const [manualQuantity, setManualQuantity] = useState(1);
  const [manualPrice, setManualPrice] = useState("");
  const [manualGstRate, setManualGstRate] = useState(settings.gstEnabled ? (settings.gstRate || 0) : 0);
  const [manualDiscount, setManualDiscount] = useState(0);
  const [manualHsnCode, setManualHsnCode] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualFormErrors, setManualFormErrors] = useState<string[]>([]);

  // Item inline editing state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPriceVal, setEditPriceVal] = useState("");
  const [editDiscountVal, setEditDiscountVal] = useState("");

  // Filter menu items
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.itemCode?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === "All" || item.category === activeCategory;
      return matchesSearch && matchesCategory && item.available !== false;
    });
  }, [menuItems, searchQuery, activeCategory]);

  // Categories list derived from menu
  const categories = useMemo(() => {
    const list = new Set(menuItems.map(i => i.category));
    return ["All", ...Array.from(list)];
  }, [menuItems]);

  // Math Calculations for current Register Cart
  const cartTotals = useMemo(() => {
    let rawSubtotal = 0;
    let totalDiscount = 0;

    cart.forEach(item => {
      const itemBase = item.price * item.quantity;
      const itemDiscountAmount = itemBase * (item.discount / 100);
      rawSubtotal += itemBase;
      totalDiscount += itemDiscountAmount;
    });

    // Global coupon discount
    let couponDiscountAmount = 0;
    if (appliedCoupon) {
      const currentSubtotal = rawSubtotal - totalDiscount;
      if (appliedCoupon.type === "percentage") {
        couponDiscountAmount = Math.round(currentSubtotal * (appliedCoupon.value / 100));
      } else {
        couponDiscountAmount = Math.min(appliedCoupon.value, currentSubtotal);
      }
    }

    const netTaxableSubtotal = Math.max(0, rawSubtotal - totalDiscount - couponDiscountAmount);
    const taxRes = calculateTax(netTaxableSubtotal, settings);

    const packagingCharge = (orderType === "dine-in" || orderType === "takeaway") ? 0 : 25;
    const finalGrandTotal = Math.max(0, Math.round(netTaxableSubtotal + taxRes.totalGst + packagingCharge));

    return {
      subtotal: rawSubtotal,
      itemDiscounts: totalDiscount,
      couponDiscount: couponDiscountAmount,
      gst: taxRes.totalGst,
      cgst: taxRes.cgstAmount,
      sgst: taxRes.sgstAmount,
      gstEnabled: taxRes.gstEnabled,
      gstRate: taxRes.gstRate,
      cgstRate: taxRes.cgstRate,
      sgstRate: taxRes.sgstRate,
      packaging: packagingCharge,
      grandTotal: finalGrandTotal
    };
  }, [cart, appliedCoupon, orderType, settings]);

  // Handle adding regular menu items to cart
  const handleAddRegularToCart = (item: MenuItem) => {
    // Check if an unsent instance of this menu item exists in cart
    const unsentIndex = cart.findIndex(c => c.name === item.name && !c.isKotSent);
    if (unsentIndex !== -1) {
      setCart(prev => prev.map((c, idx) => idx === unsentIndex ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      const newItem: CartItem = {
        id: `reg-${item.id}-${Date.now()}`,
        name: item.name,
        price: item.price,
        quantity: 1,
        isManual: false,
        category: item.category,
        gstRate: settings.gstEnabled ? (item.gstPercent || settings.gstPercentage || 0) : 0,
        discount: 0,
        hsnCode: item.hsnCode || "2106",
        isKotSent: false
      };
      setCart(prev => [...prev, newItem]);
    }
  };

  // Validate and submit manual billing item
  const handleAddManualItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: string[] = [];

    if (!manualName.trim()) {
      errors.push("Culinary Item Name is strictly required.");
    }
    const parsedPrice = parseFloat(manualPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      errors.push("Unit Price must be a valid number greater than zero.");
    }
    if (manualQuantity < 1) {
      errors.push("Quantity must be at least 1.");
    }
    if (manualDiscount < 0 || manualDiscount > 100) {
      errors.push("Discount percentage must be between 0% and 100%.");
    }

    if (errors.length > 0) {
      setManualFormErrors(errors);
      return;
    }

    const performAdd = () => {
      const newItem: CartItem = {
        id: `manual-${Date.now()}`,
        name: manualName.trim(),
        price: parsedPrice,
        quantity: manualQuantity,
        isManual: true,
        category: manualCategory,
        gstRate: manualGstRate,
        discount: manualDiscount,
        hsnCode: manualHsnCode.trim() || "9963", // standard F&B service code
        customization: manualNotes.trim() || undefined
      };

      setCart(prev => [...prev, newItem]);
      LocalDB.addAuditLog(
        "Manual Item Added to POS Cart",
        `Added manual item: "${manualName}" @ ₹${parsedPrice} x${manualQuantity} (GST: ${manualGstRate}%, Disc: ${manualDiscount}%)`,
        `POS (${activeStaff.name} - ${activeStaff.role})`
      );

      // Close modal and reset
      setShowManualModal(false);
      setManualName("");
      setManualQuantity(1);
      setManualPrice("");
      setManualGstRate(settings.gstEnabled ? (settings.gstRate || 0) : 0);
      setManualDiscount(0);
      setManualHsnCode("");
      setManualNotes("");
      setManualFormErrors([]);
    };

    // Check RBAC permission for adding manual items
    executeWithPermission(
      "pos.manual_item",
      {
        actionType: "add_manual",
        title: "Manual Culinary Item Authorization",
        description: `Authorization required to add non-catalog open item "${manualName}" (₹${parsedPrice})`,
        targetName: manualName,
        newValue: parsedPrice
      },
      performAdd
    );
  };

  const syncCartToActiveOrder = async (updatedCart: CartItem[]) => {
    setCart(updatedCart);
    if (selectedTable && orderType === "dine-in") {
      setTableCarts(prev => ({ ...prev, [selectedTable]: updatedCart }));
    }

    if (orderType === "dine-in" && selectedTable && activeOrderForSelectedTable) {
      const newItems = updatedCart.map(item => ({
        menuItemId: item.isManual ? "manual" : item.id.replace("reg-", ""),
        name: item.name,
        price: item.price - (item.price * (item.discount / 100)),
        quantity: item.quantity,
        customization: item.customization,
        isManual: item.isManual,
        category: item.category,
        gstRate: item.gstRate,
        discount: item.discount,
        hsnCode: item.hsnCode,
        notes: item.customization,
        isKotSent: item.isKotSent,
        kotNumber: item.kotNumber
      }));

      let newSub = 0;
      let newGst = 0;
      updatedCart.forEach(i => {
        const lineNet = (i.price - (i.price * (i.discount / 100))) * i.quantity;
        newSub += lineNet;
        if (settings.gstEnabled && i.gstRate > 0) {
          newGst += lineNet * (i.gstRate / 100);
        }
      });

      await LocalDB.apiUpdateOrderItems(
        activeOrderForSelectedTable.id,
        newItems,
        newSub,
        newGst,
        newSub + newGst
      );
      onOrderPlaced();
    }
  };

  // Handle quantity adjustment (If qty drops to 0, remove item)
  const handleAdjustQuantity = (id: string, delta: number) => {
    const target = cart.find(item => item.id === id);
    if (!target) return;

    if (delta < 0 && target.quantity <= 1) {
      handleRemoveFromCart(id);
      return;
    }

    const nextCart = cart.map(item => {
      if (item.id === id) {
        return { ...item, quantity: item.quantity + delta };
      }
      return item;
    });

    syncCartToActiveOrder(nextCart);
  };

  // RBAC Permission verification helper
  const executeWithPermission = (
    _permission: PermissionKey,
    _context: any,
    successCallback: () => void
  ) => {
    successCallback();
  };

  // Handle manual/normal item price modifier
  const handleUpdatePrice = (id: string, newPriceStr: string) => {
    const val = parseFloat(newPriceStr);
    if (isNaN(val) || val <= 0) return;

    const targetItem = cart.find(c => c.id === id);
    if (!targetItem) return;

    executeWithPermission(
      "pos.edit_price",
      {
        actionType: "edit_price",
        title: "Unit Price Override Authorization",
        description: `Modify price for "${targetItem.name}" from ₹${targetItem.price} to ₹${val}`,
        targetId: id,
        targetName: targetItem.name,
        originalValue: targetItem.price,
        newValue: val
      },
      () => {
        const nextCart = cart.map(item => item.id === id ? { ...item, price: val } : item);
        syncCartToActiveOrder(nextCart);
        LocalDB.addAuditLog(
          "POS Price Override",
          `Overrode unit price for "${targetItem.name}" from ₹${targetItem.price} to ₹${val}`,
          `POS (${activeStaff.name} - ${activeStaff.role})`
        );
        setEditingItemId(null);
      }
    );
  };

  // Handle discount override
  const handleUpdateDiscount = (id: string, newDiscStr: string) => {
    const val = parseInt(newDiscStr, 10);
    if (isNaN(val) || val < 0 || val > 100) return;

    const targetItem = cart.find(c => c.id === id);
    if (!targetItem) return;

    executeWithPermission(
      "pos.apply_discount",
      {
        actionType: "edit_discount",
        title: "Item Discount Authorization",
        description: `Apply ${val}% item-level discount on "${targetItem.name}"`,
        targetId: id,
        targetName: targetItem.name,
        originalValue: targetItem.discount,
        newValue: val
      },
      () => {
        const nextCart = cart.map(item => item.id === id ? { ...item, discount: val } : item);
        syncCartToActiveOrder(nextCart);
        LocalDB.addAuditLog(
          "POS Item Discount Overridden",
          `Overrode item-level discount for "${targetItem.name}" to ${val}%`,
          `POS (${activeStaff.name} - ${activeStaff.role})`
        );
        setEditingItemId(null);
      }
    );
  };

  // Handle manual / regular item removal (Void) - Works for quantity 1, 20, or any amount
  const handleRemoveFromCart = (id: string) => {
    const targetItem = cart.find(c => c.id === id);
    if (!targetItem) return;

    executeWithPermission(
      "pos.void_item",
      {
        actionType: "delete_item",
        title: "Cart Item Void Authorization",
        description: `Void and remove item "${targetItem.name}" (Qty: ${targetItem.quantity}, Total: ₹${targetItem.price * targetItem.quantity}) from active bill`,
        targetId: id,
        targetName: targetItem.name,
        originalValue: targetItem.price * targetItem.quantity
      },
      () => {
        const nextCart = cart.filter(item => item.id !== id);
        syncCartToActiveOrder(nextCart);
        LocalDB.addAuditLog(
          "POS Cart Item Deleted",
          `Removed item "${targetItem.name}" (Qty: ${targetItem.quantity}) from billing cart`,
          `POS (${activeStaff.name} - ${activeStaff.role})`
        );
      }
    );
  };

  // Handle 1-click Clear Bill (Void all items and free table)
  const handleClearCart = () => {
    if (cart.length === 0 && !selectedTable) return;

    if (window.confirm("Are you sure you want to clear all items from this active bill and make the table available?")) {
      executeWithPermission(
        "pos.void_item",
        {
          actionType: "clear_bill",
          title: "Clear Active Bill Authorization",
          description: `Clear all ${cart.length} items from active bill for Table #${selectedTable || "N/A"}`
        },
        async () => {
          await syncCartToActiveOrder([]);
          setCart([]);
          setCustomerName("");
          setCustomerPhone("");
          setCustomerEmail("");
          setCustomerAddress("");
          setPaxCount(1);
          setOrderInstructions("");
          setAppliedCoupon(null);
          setCouponCode("");

          if (selectedTable) {
            const dbTables = LocalDB.getTables();
            LocalDB.saveTables(dbTables.map(t => isSameTable(t.tableNumber, selectedTable) ? { ...t, status: "Available" } : t));

            setTableCarts(prev => {
              const next = { ...prev };
              Object.keys(next).forEach(k => {
                if (isSameTable(k, selectedTable)) delete next[k];
              });
              return next;
            });
            setTableCustomerInfo(prev => {
              const next = { ...prev };
              Object.keys(next).forEach(k => {
                if (isSameTable(k, selectedTable)) delete next[k];
              });
              return next;
            });
            setSelectedTable("");
            window.dispatchEvent(new Event("storage"));
          }

          LocalDB.addAuditLog(
            "POS Bill Cleared",
            `Cleared all items from billing cart and marked table Available [Table #${selectedTable || "N/A"}]`,
            `POS (${activeStaff.name} - ${activeStaff.role})`
          );
        }
      );
    }
  };

  // Verify and apply global promo coupons
  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError(null);

    if (!couponCode.trim()) return;

    const code = couponCode.trim().toUpperCase();
    const matched = coupons.find(c => c.code === code);

    if (!matched) {
      setCouponError("Invalid coupon promotional key.");
      return;
    }

    // Expiry check
    if (new Date(matched.expiryDate) < new Date()) {
      setCouponError("This promotion campaign has expired.");
      return;
    }

    const netItemTotal = cartTotals.subtotal - cartTotals.itemDiscounts;
    if (matched.minOrderAmount && netItemTotal < matched.minOrderAmount) {
      setCouponError(`Minimum purchase threshold of ₹${matched.minOrderAmount} not satisfied.`);
      return;
    }

    const applyAction = () => {
      setAppliedCoupon(matched);
      setCouponCode("");
      LocalDB.addAuditLog(
        "POS Coupon Applied",
        `Applied promotion code: ${code} (Discount: ${matched.value}${matched.type === "percentage" ? "%" : " Fixed"})`,
        `POS (${activeStaff.name} - ${activeStaff.role})`
      );
    };

    executeWithPermission(
      "pos.apply_discount",
      {
        actionType: "apply_global_discount",
        title: "Promotional Coupon Authorization",
        description: `Apply coupon ${code} (${matched.value}${matched.type === "percentage" ? "%" : "₹"} off) to active order`,
        targetName: code,
        newValue: matched.value
      },
      applyAction
    );
  };

  // Pre-print Bill Preview & Validation Trigger
  const handleOpenBillPreview = () => {
    if (cart.length === 0 || isFinalizing) return;

    if (orderType === "dine-in") {
      if (!selectedTable) {
        alert("Table allocation is required for Dine-In orders. Please select a table before finalizing.");
        return;
      }
    } else if (orderType === "delivery") {
      if (!customerName.trim()) {
        alert("Customer recipient name is required for delivery orders.");
        return;
      }
      if (!customerPhone.trim() || customerPhone.replace(/\D/g, "").length < 7) {
        alert("A valid 10-digit mobile contact number is required for delivery dispatch.");
        return;
      }
      if (!customerAddress.trim()) {
        alert("A complete delivery/shipping address is required for delivery orders.");
        return;
      }
    }

    setShowBillPreviewModal(true);
  };

  // Process and save finalized invoice with direct QZ Tray thermal printing
  const handleFinalizeCheckout = async () => {
    if (cart.length === 0 || isFinalizing) return;

    // 1. Strict validation per order type
    if (orderType === "dine-in") {
      if (!selectedTable) {
        alert("Table allocation is required for Dine-In orders. Please select a table before finalizing.");
        return;
      }
    } else if (orderType === "delivery") {
      if (!customerName.trim()) {
        alert("Customer recipient name is required for delivery orders.");
        return;
      }
      if (!customerPhone.trim() || customerPhone.replace(/\D/g, "").length < 7) {
        alert("A valid 10-digit mobile contact number is required for delivery dispatch.");
        return;
      }
      if (!customerAddress.trim()) {
        alert("A complete delivery/shipping address is required for delivery orders.");
        return;
      }
    }

    setIsFinalizing(true);
    try {
      // Formulate Order Object for LocalDB saving
      const finalOrderItems = cart.map(item => ({
        menuItemId: item.isManual ? "manual" : item.id.replace("reg-", ""),
        name: item.name,
        price: item.price - (item.price * (item.discount / 100)), // discounted price
        quantity: item.quantity,
        customization: item.customization,
        // Store complete manual attributes for ledger reports
        isManual: item.isManual,
        category: item.category,
        gstRate: item.gstRate,
        discount: item.discount,
        hsnCode: item.hsnCode,
        notes: item.customization
      }));

      const defaultName = orderType === "dine-in"
        ? "Walk-in Guest"
        : orderType === "takeaway"
          ? "Takeaway Guest"
          : "Delivery Customer";

      const orderPayload: Omit<Order, "id" | "createdAt"> = {
        customerName: customerName.trim() || defaultName,
        phoneNumber: customerPhone.trim() || (orderType === "dine-in" ? "+91 00000 00000" : ""),
        email: customerEmail.trim() || "walkin@webrajya.com",
        orderType: orderType,
        tableNumber: orderType === "dine-in" ? selectedTable : undefined,
        address: orderType === "delivery" ? customerAddress.trim() : undefined,
        pax: paxCount,
        orderInstructions: orderInstructions.trim() || undefined,
        staffName: selectedStaffName || undefined,
        items: finalOrderItems,
        subtotal: cartTotals.subtotal - cartTotals.itemDiscounts,
        gst: cartTotals.gst,
        packagingCharge: cartTotals.packaging,
        discountAmount: cartTotals.couponDiscount,
        appliedCoupon: appliedCoupon?.code || undefined,
        grandTotal: cartTotals.grandTotal,
        paymentStatus: orderType === "dine-in" ? posPaymentStatus : "Paid",
        orderStatus: "New Order",
        paymentMethod: orderType === "delivery" && posPaymentMethod === "Cash" ? "Cash On Delivery" : posPaymentMethod,
        // Include POS employee tracker metadata
        kotPrintStatus: "Pending",
        billPrintStatus: "Pending",
        source: "POS",
        billedBy: `POS (${currentRole})`
      };

      // Inject staff role into order database representation safely and persist to DB
      const finalOrder = await LocalDB.apiAddOrder({
        ...orderPayload,
        source: "POS",
        billedBy: `POS (${currentRole})`
      } as any);

      // Save customized report log details
      LocalDB.addAuditLog(
        "POS Checkout Completed",
        `Finalized invoice #${finalOrder.id} [${orderType.toUpperCase()}${orderType === "dine-in" ? ` - Table #${selectedTable}` : ""}] for ₹${finalOrder.grandTotal} containing ${cart.length} culinary elements.`,
        `POS (${currentRole})`
      );

      // If dine-in, mark table status as Available & clear table session memory
      if (orderType === "dine-in" && selectedTable) {
        const dbTables = LocalDB.getTables();
        const targetStatus = "Available";
        LocalDB.saveTables(dbTables.map(t => isSameTable(t.tableNumber, selectedTable) ? { ...t, status: targetStatus } : t));

        if (targetStatus === "Available") {
          setTableCarts(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(k => {
              if (isSameTable(k, selectedTable)) delete next[k];
            });
            return next;
          });
          setTableCustomerInfo(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(k => {
              if (isSameTable(k, selectedTable)) delete next[k];
            });
            return next;
          });
        }
      }

      onOrderPlaced();

      // Clean current checkout state immediately so POS is ready for next customer
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setCustomerAddress("");
      setPaxCount(1);
      setOrderInstructions("");
      setOrderType("takeaway");
      setSelectedTable("");
      setAppliedCoupon(null);
      setCouponCode("");

      // DIRECT THERMAL PRINTING VIA JSPRINTMANAGER (CUSTOMER BILL)
      try {
        let isConnected = JSPrintManagerService.isConnected();
        if (!isConnected) {
          isConnected = await JSPrintManagerService.init();
        }

        if (isConnected && JSPrintManagerService.isConnected()) {
          // 1. Print FINAL BILL (Containing ALL current items)
          await JSPrintManagerService.printBill(finalOrder, settings);
          await LocalDB.apiUpdateOrderPrintStatus(finalOrder.id, "bill", "Printed");

          // 2. Print FINAL KOT (Only for Takeaway / Delivery orders; for Dine-In, KOTs are sent separately)
          if (finalOrder.orderType !== "dine-in") {
            const finalKotData = {
              id: `KOT-${finalOrder.id}`,
              kotNumber: `KOT-${finalOrder.id}`,
              kotTitle: "FINAL KOT",
              orderId: finalOrder.id,
              tableNumber: finalOrder.tableNumber,
              orderType: finalOrder.orderType,
              customerName: finalOrder.customerName,
              phoneNumber: finalOrder.phoneNumber,
              restaurantName: settings?.name || "KITCHEN ORDER TICKET",
              createdAt: new Date().toISOString(),
              items: finalOrder.items.map(i => ({
                name: i.name,
                quantity: i.quantity,
                customization: i.customization || ""
              })),
              specialInstructions: "FINAL KOT | COMPLETE SESSION ORDER"
            };
            await JSPrintManagerService.printKOT(finalKotData);
            await LocalDB.apiUpdateOrderPrintStatus(finalOrder.id, "kot", "Printed");
          }

          setJustPrinted(true);
          setTimeout(() => setJustPrinted(false), 3000);

          setPrintNotice({
            type: "success",
            message: `Bill #${finalOrder.id} printed successfully & recorded to Sales.`,
            details: `Invoice ₹${finalOrder.grandTotal} recorded in Daily Sales & Dashboard revenue.`,
            order: finalOrder
          });

          // Auto-dismiss success notification after 5 seconds
          setTimeout(() => {
            setPrintNotice(prev => prev?.order?.id === finalOrder.id && prev.type === "success" ? null : prev);
          }, 5000);
        } else {
          // JSPrintManager desktop client is not active on this machine
          await LocalDB.apiUpdateOrderPrintStatus(finalOrder.id, "bill", "Pending");
          setPrintNotice({
            type: "warning",
            message: "JSPrintManager desktop service is not running on this computer.",
            details: "Order saved successfully to Sales. You can use 'BROWSER PRINT' or start JSPrintManager to spool to your thermal printer.",
            order: finalOrder
          });
        }
      } catch (printErr: any) {
        console.warn("[POS Direct Print via JSPrintManager]", printErr);
        await LocalDB.apiUpdateOrderPrintStatus(finalOrder.id, "bill", "Failed");

        const rawMsg = printErr?.message || "";
        let inlineMsg = "JSPrintManager is not connected. Please start JSPrintManager on the restaurant laptop.";
        let inlineDetails = "Order is saved to database. Use BROWSER PRINT, RECONNECT, or RETRY PRINT to dispatch.";
        let suggestedPrinter = printErr?.suggestedPrinter;
        let candidatePrinters = printErr?.candidatePrinters;

        if (printErr?.isOffline) {
          inlineMsg = "Print service unavailable. Order saved successfully.";
          inlineDetails = "JSPrintManager desktop service is not currently running. Order has been recorded safely.";
        } else if (rawMsg.includes("is not currently available") || rawMsg.includes("not found")) {
          inlineMsg = rawMsg;
          inlineDetails = suggestedPrinter
            ? `Detected candidate printer: '${suggestedPrinter}'. Click 'USE DETECTED PRINTER' below to print immediately.`
            : "Your configured printer is not available. Please verify cable or Windows printer settings.";
        } else if (rawMsg.includes("certificate") || rawMsg.includes("Certificate")) {
          inlineMsg = "JSPrintManager secure connection requires certificate trust.";
          inlineDetails = "To trust the certificate, open https://localhost:29443 once in a separate window, click Advanced -> Proceed, then return and click RECONNECT.";
        } else if (rawMsg.includes("blocked") || rawMsg.includes("Sites Manager")) {
          inlineMsg = "web-pos-1.vercel.app is blocked in JSPrintManager Sites Manager.";
          inlineDetails = "Open JSPrintManager Settings -> Sites Manager on the Windows laptop and allow this site.";
        } else if (rawMsg.includes("not running") || rawMsg.includes("disconnected") || rawMsg.includes("not connected")) {
          inlineMsg = "JSPrintManager is not connected. Please start JSPrintManager on the restaurant laptop.";
          inlineDetails = "Ensure the JSPrintManager desktop client is running in the Windows taskbar/system tray.";
        } else if (rawMsg) {
          inlineMsg = rawMsg;
        }

        setPrintNotice({
          type: "warning",
          message: inlineMsg,
          details: inlineDetails,
          order: finalOrder,
          suggestedPrinter,
          candidatePrinters
        });

        // Trigger direct standard 1-click browser print fallback without workstation popup
        try {
          PhysicalThermalPrinter.printBillSystemFallback(finalOrder, settings, "80mm");
        } catch (fErr) {
          console.warn("[POS Fallback Print]", fErr);
        }
      }
    } catch (err: any) {
      alert(err.message || "Failed to finalize order.");
    } finally {
      setIsFinalizing(false);
    }
  };

  // Dedicated KOT (Kitchen Order Ticket) handler: prints ONLY Qty and Items for the kitchen, NO sales entry
  // Process and save finalized KOT with incremental unsent items printing
  const handleSaveOrder = async () => {
    if (cart.length === 0 || isPrintingKOT || isFinalizing) return;

    if (orderType === "dine-in" && !selectedTable) {
      alert("Please select a Table Number for Dine-In order before printing KOT.");
      return;
    }

    // Calculate unprinted quantity per item: currentQuantity - alreadyPrintedQuantity
    const unprintedItems = cart
      .map(item => ({
        item,
        unprintedQty: Math.max(0, item.quantity - (item.printedKotQuantity || 0))
      }))
      .filter(x => x.unprintedQty > 0);

    let itemsToPrint = unprintedItems;
    let isReprint = false;

    if (unprintedItems.length === 0) {
      const confirmReprint = window.confirm(
        "All items in this active order have already been sent to the kitchen via previous KOTs.\n\nDo you want to RE-PRINT the full consolidated KOT for all items?"
      );
      if (!confirmReprint) return;
      itemsToPrint = cart.map(item => ({ item, unprintedQty: item.quantity }));
      isReprint = true;
    }

    setIsPrintingKOT(true);

    try {
      const hasSentBefore = cart.some(item => (item.printedKotQuantity || 0) > 0);
      const kotCount = (LocalDB.getKOTs()?.length || 0) + 1;
      const kotNumber = `KOT-${String(kotCount).padStart(4, "0")}`;
      const headerTitle = isReprint
        ? `KOT (RE-PRINT FULL)`
        : hasSentBefore
          ? `KOT (ADD-ON ORDER)`
          : `KOT (INITIAL ORDER)`;

      const kotData = {
        id: kotNumber,
        kotNumber: kotNumber,
        kotTitle: isReprint ? "KOT (RE-PRINT)" : "KOT",
        orderId: selectedTable ? `TBL-${selectedTable}` : `POS-${Date.now().toString().slice(-4)}`,
        tableNumber: orderType === "dine-in" ? selectedTable : undefined,
        orderType: orderType,
        customerName: customerName.trim() || (orderType === "dine-in" ? `Table #${selectedTable}` : "Takeaway Guest"),
        phoneNumber: customerPhone.trim() || undefined,
        restaurantName: settings?.name || "KITCHEN ORDER TICKET",
        createdAt: new Date().toISOString(),
        items: itemsToPrint.map(x => ({
          name: x.item.name,
          quantity: x.unprintedQty,
          customization: x.item.customization || ""
        })),
        specialInstructions: [
          headerTitle,
          customerName ? `Guest: ${customerName}` : "",
          customerPhone ? `Ph: ${customerPhone}` : "",
        ].filter(Boolean).join(" | ") || undefined
      };

      // Mark all cart items printedKotQuantity = quantity
      const updatedCart = cart.map(item => ({
        ...item,
        isKotSent: true,
        printedKotQuantity: item.quantity,
        kotNumber: item.kotNumber || kotNumber
      }));
      setCart(updatedCart);

      if (orderType === "dine-in" && selectedTable) {
        const dbTables = LocalDB.getTables();
        LocalDB.saveTables(dbTables.map(t => t.tableNumber === selectedTable ? { ...t, status: "Occupied" } : t));
        setTableCarts(prev => ({ ...prev, [selectedTable]: updatedCart }));
        setTableCustomerInfo(prev => ({
          ...prev,
          [selectedTable]: {
            name: customerName,
            phone: customerPhone,
            email: customerEmail,
            address: customerAddress
          }
        }));

        LocalDB.addOrder({
          orderType: "dine-in",
          tableNumber: selectedTable,
          customerName: customerName.trim() || `Table #${selectedTable}`,
          phoneNumber: customerPhone.trim() || "",
          email: customerEmail || "",
          items: updatedCart.map(i => ({
            menuItemId: i.id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            customization: i.customization || "",
            gstRate: i.gstRate,
            discount: i.discount,
            hsnCode: i.hsnCode,
            kotNumber: i.kotNumber || kotNumber,
            printedKotQuantity: i.quantity
          })),
          subtotal: cartTotals.subtotal - cartTotals.itemDiscounts,
          gst: cartTotals.gst,
          packagingCharge: cartTotals.packaging,
          discountAmount: cartTotals.couponDiscount,
          grandTotal: cartTotals.grandTotal,
          paymentStatus: "Pending",
          orderStatus: "New Order",
          paymentMethod: posPaymentMethod,
          source: "POS"
        });

        onOrderPlaced();
      }

      let isConnected = JSPrintManagerService.isConnected();
      if (!isConnected) {
        isConnected = await JSPrintManagerService.init();
      }

      if (isConnected && JSPrintManagerService.isConnected()) {
        await JSPrintManagerService.printKOT(kotData);
        setJustPrintedKOT(true);
        setTimeout(() => setJustPrintedKOT(false), 3000);
        setPrintNotice({
          type: "success",
        }, 5000);
      } else {
        setPrintNotice({
          type: "warning",
          message: "JSPrintManager is not running on this laptop.",
          details: "Start JSPrintManager to send KOT directly to your thermal kitchen printer."
        });
      }
    } catch (err: any) {
      console.warn("[POS Print KOT Error]", err);
      setPrintNotice({
        type: "warning",
        message: err.message || "Failed to print KOT to kitchen printer.",
        details: err.suggestedPrinter ? `Detected candidate printer: ${err.suggestedPrinter}` : undefined,
        suggestedPrinter: err.suggestedPrinter,
        candidatePrinters: err.candidatePrinters
      });
    } finally {
      setIsPrintingKOT(false);
    }
  };

  // Retry direct thermal print handler for notification banner (100% inline, no navigation, no alert)
  const handleRetryPrint = async (order: Order) => {
    try {
      if (order.orderType === "dine-in") {
        await JSPrintManagerService.printBill(order, settings);
        await LocalDB.apiUpdateOrderPrintStatus(order.id, "bill", "Printed");
        setPrintNotice({
          type: "success",
          message: `Bill #${order.id} printed successfully via JSPrintManager.`,
          order
        });
      } else {
        await JSPrintManagerService.printCombinedBillAndKOT(order, settings);
        await LocalDB.apiUpdateOrderPrintStatus(order.id, "bill", "Printed");
        await LocalDB.apiUpdateOrderPrintStatus(order.id, "kot", "Printed");
        setPrintNotice({
          type: "success",
          message: `Bill & KOT #${order.id} printed successfully via JSPrintManager.`,
          order
        });
      }
      setTimeout(() => {
        setPrintNotice(prev => prev?.order.id === order.id && prev.type === "success" ? null : prev);
      }, 5000);
    } catch (err: any) {
      console.warn("[POS Retry Print Error]", err);
      const rawMsg = err?.message || "";
      let inlineMsg = "JSPrintManager is not connected. Please start JSPrintManager on the restaurant laptop.";
      let inlineDetails = "Ensure the JSPrintManager desktop client is running on the restaurant laptop.";
      let suggestedPrinter = err?.suggestedPrinter;
      let candidatePrinters = err?.candidatePrinters;

      if (err?.isOffline) {
        inlineMsg = "Print service unavailable. Order saved successfully.";
        inlineDetails = "JSPrintManager desktop service is not currently running.";
      } else if (rawMsg.includes("is not currently available") || rawMsg.includes("not found")) {
        inlineMsg = rawMsg;
        inlineDetails = suggestedPrinter
          ? `Detected candidate printer: '${suggestedPrinter}'. Click 'USE DETECTED PRINTER' below to print immediately.`
          : "Please check your printer configuration or cable connection.";
      } else if (rawMsg.includes("certificate") || rawMsg.includes("Certificate")) {
        inlineMsg = "JSPrintManager secure connection requires certificate trust.";
        inlineDetails = "To trust the certificate, open https://localhost:29443 once in a separate window, click Advanced -> Proceed, then return and click RECONNECT.";
      } else if (rawMsg.includes("blocked") || rawMsg.includes("Sites Manager")) {
        inlineMsg = "web-pos-1.vercel.app is blocked in JSPrintManager Sites Manager.";
        inlineDetails = "Open JSPrintManager Settings -> Sites Manager on the Windows laptop and allow this site.";
      } else if (rawMsg) {
        inlineMsg = rawMsg;
      }

      setPrintNotice({
        type: "warning",
        message: inlineMsg,
        details: inlineDetails,
        order,
        suggestedPrinter,
        candidatePrinters
      });
    }
  };

  return (
    <div className="space-y-2 w-full text-xs font-sans text-stone-700" id="pos-billing-portal">
      {/* 1. Header Navigation Bar (Compact) */}
      <div className="bg-white px-3 py-1.5 rounded-xl border border-stone-200 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="p-1 bg-[#C67C4E]/10 rounded-md text-[#C67C4E]">
            <Calculator className="w-3.5 h-3.5" />
          </span>
          <h3 className="text-xs font-serif font-bold text-stone-900 uppercase tracking-wide">
            Active Register
          </h3>
          <span className="text-[10px] text-stone-400 hidden lg:inline font-mono">
            • Rapid Order Invoicing & Billing
          </span>
        </div>

        {/* Controller selectors */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* JSPrintManager Live Connection & Printer Status Indicator */}
          {jspmStatus.isConnected && jspmStatus.code === 0 && JSPrintManagerService.isConnected() ? (
            <div
              title={`JSPrintManager Connected • Direct Thermal Spooling Active${detectedPrinterName ? ` • Printer: ${detectedPrinterName}` : ""}`}
              className="px-2 py-0.5 rounded-lg flex items-center gap-1.5 border bg-emerald-50 text-emerald-800 border-emerald-200 shadow-2xs select-none"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <Printer className="w-3 h-3 text-emerald-600" />
              <span className="font-mono text-[9px] font-bold uppercase">
                JSPM Connected {detectedPrinterName ? `(${detectedPrinterName})` : ""}
              </span>
            </div>
          ) : jspmStatus.code === 5 || jspmStatus.statusString === "CERTIFICATE_ERROR" ? (
            <button
              type="button"
              onClick={handleReconnect}
              title="JSPrintManager certificate requires trust. Click to retry connection."
              className="px-2 py-0.5 rounded-lg flex items-center gap-1 border bg-amber-50 text-amber-800 border-amber-300 shadow-2xs hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <Printer className="w-3 h-3 text-amber-600" />
              <span className="font-mono text-[9px] font-bold uppercase">
                Cert Trust Req.
              </span>
            </button>
          ) : jspmStatus.isBlocked || jspmStatus.code === 2 ? (
            <button
              type="button"
              onClick={handleReconnect}
              title="web-pos-1.vercel.app is blocked in JSPrintManager Sites Manager. Click to retry."
              className="px-2 py-0.5 rounded-lg flex items-center gap-1 border bg-rose-50 text-rose-800 border-rose-200 shadow-2xs hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <Printer className="w-3 h-3 text-rose-600" />
              <span className="font-mono text-[9px] font-bold uppercase">
                JSPM Blocked
              </span>
            </button>
          ) : jspmStatus.code === 3 ? (
            <div
              title="Waiting for user response in JSPrintManager client"
              className="px-2 py-0.5 rounded-lg flex items-center gap-1 border bg-blue-50 text-blue-800 border-blue-200 shadow-2xs select-none"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
              <Printer className="w-3 h-3 text-blue-600" />
              <span className="font-mono text-[9px] font-bold uppercase">
                Approval Req.
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleReconnect}
              title={jspmStatus.hint || "JSPrintManager is not running or disconnected. Click to reconnect."}
              className="px-2 py-0.5 rounded-lg flex items-center gap-1 border bg-stone-100 text-stone-600 border-stone-200 shadow-2xs hover:bg-stone-150 transition-colors cursor-pointer"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isReconnecting ? "bg-amber-500 animate-ping" : "bg-stone-400"}`} />
              <Printer className="w-3 h-3 text-stone-400" />
              <span className="font-mono text-[9px] font-bold uppercase">
                {isReconnecting ? "Connecting..." : "JSPM Disconnected"}
              </span>
            </button>
          )}

          {/* Transfer Table Quick Action (Only for Dine-In) */}
          {orderType === "dine-in" && (
            <button
              type="button"
              onClick={() => {
                if (!selectedTable) {
                  alert("Please choose a table first to initiate a table transfer.");
                  return;
                }
                executeWithPermission(
                  "pos.transfer_table",
                  {
                    actionType: "edit_price",
                    title: "Table Transfer Authorization",
                    description: `Authorize table relocation and transfer of active orders for Table ${selectedTable || 'Active'}`
                  },
                  () => {
                    setTransferSourceTable(selectedTable || null);
                    setTransferSourceOrder(activeOrderForSelectedTable || null);
                    setShowTransferModal(true);
                  }
                );
              }}
              className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-lg flex items-center gap-1 font-mono text-[9px] font-bold uppercase transition-all cursor-pointer shadow-xs"
              title="Transfer Table / Switch Table Order"
            >
              <ArrowRightLeft className="w-3 h-3 text-amber-700" />
              <span>Transfer Table</span>
            </button>
          )}

          {/* Split Bill & Multi-Payment Settlement */}
          <button
            type="button"
            onClick={() => {
              const target = (orderType === "dine-in" && activeOrderForSelectedTable)
                ? activeOrderForSelectedTable
                : orders.find(o => o.orderStatus !== "Delivered" && o.orderStatus !== "Cancelled");
              if (target) {
                executeWithPermission(
                  "pos.split_bill",
                  {
                    actionType: "edit_price",
                    title: "Split Bill Authorization",
                    description: `Authorize multi-tender splitting and partial settlements for Bill #${target.id}`
                  },
                  () => {
                    setSplitTargetOrder(target);
                    setShowSplitModal(true);
                  }
                );
              } else {
                alert("Please select a table with an active order or select an active order to split.");
              }
            }}
            className="bg-[#d4af37]/15 hover:bg-[#d4af37]/25 text-[#886915] dark:text-[#d4af37] border border-[#d4af37]/40 px-2 py-0.5 rounded-lg flex items-center gap-1 font-mono text-[9px] font-bold uppercase transition-all cursor-pointer shadow-xs"
            title="Split Bill & Settle Multi-Payment"
          >
            <Receipt className="w-3 h-3 text-[#9a7b20]" />
            <span>Split Bill</span>
          </button>

          {/* 1-Click WhatsApp Daily Closing Summary */}
          <button
            type="button"
            id="btn-pos-whatsapp-summary"
            onClick={() => setShowWhatsAppModal(true)}
            className="bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#128C7E] border border-[#25D366]/40 px-2 py-0.5 rounded-lg flex items-center gap-1 font-mono text-[9px] font-bold uppercase transition-all cursor-pointer shadow-xs"
            title="Send 1-Click Daily Sales Summary to Owner via WhatsApp"
          >
            <MessageCircle className="w-3 h-3 text-[#25D366]" />
            <span>Day Summary</span>
          </button>
        </div>
      </div>

      {/* QZ Direct Print Notification Banner */}
      <AnimatePresence>
        {printNotice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${printNotice.type === "success"
              ? "bg-emerald-50/90 border-emerald-300 text-emerald-950"
              : "bg-amber-50/95 border-amber-300 text-amber-950"
              }`}
          >
            <div className="flex items-start gap-3">
              <span className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${printNotice.type === "success" ? "bg-emerald-200/60 text-emerald-800" : "bg-amber-200/60 text-amber-800"}`}>
                {printNotice.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              </span>
              <div className="space-y-0.5">
                <p className="text-xs font-bold leading-tight">{printNotice.message}</p>
                {printNotice.details && (
                  <p className="text-[11px] opacity-80 leading-relaxed font-sans">{printNotice.details}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-end sm:self-center shrink-0">
              {printNotice.type === "warning" && (
                <>
                  {printNotice.suggestedPrinter && printNotice.order && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = printNotice.suggestedPrinter!;
                        PrinterManager.saveConfiguredPrinter({
                          receiptPrinterName: target,
                          kotPrinterName: target
                        });
                        if (printNotice.order) handleRetryPrint(printNotice.order);
                      }}
                      className="px-3 py-1.5 bg-[#C67C4E] hover:bg-[#b0673b] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      title={`Switch configuration to '${printNotice.suggestedPrinter}' and retry printing`}
                    >
                      <Printer className="w-3 h-3" />
                      <span>USE {printNotice.suggestedPrinter}</span>
                    </button>
                  )}
                  {printNotice.candidatePrinters && printNotice.candidatePrinters.length > 1 && !printNotice.suggestedPrinter && printNotice.order && (
                    printNotice.candidatePrinters.slice(0, 2).map((cand) => (
                      <button
                        key={cand}
                        type="button"
                        onClick={() => {
                          PrinterManager.saveConfiguredPrinter({
                            receiptPrinterName: cand,
                            kotPrinterName: cand
                          });
                          if (printNotice.order) handleRetryPrint(printNotice.order);
                        }}
                        className="px-2.5 py-1.5 bg-[#C67C4E] hover:bg-[#b0673b] text-white rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Use {cand}</span>
                      </button>
                    ))
                  )}
                  {printNotice.order && (
                    <button
                      type="button"
                      onClick={() => {
                        if (printNotice.order) {
                          PhysicalThermalPrinter.printBillSystemFallback(printNotice.order, settings, "80mm");
                        }
                      }}
                      className="px-3 py-1.5 bg-stone-800 hover:bg-stone-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                      title="Print receipt using browser / system print"
                    >
                      <Printer className="w-3 h-3" />
                      <span>BROWSER PRINT</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleReconnect}
                    disabled={isReconnecting}
                    className="px-3 py-1.5 bg-stone-700 hover:bg-stone-800 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isReconnecting ? "animate-spin" : ""}`} />
                    <span>{isReconnecting ? "CONNECTING..." : "RECONNECT"}</span>
                  </button>
                  {printNotice.order && (
                    <button
                      type="button"
                      onClick={() => {
                        if (printNotice.order) handleRetryPrint(printNotice.order);
                      }}
                      className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    >
                      <Printer className="w-3 h-3" />
                      <span>RETRY PRINT</span>
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => setPrintNotice(null)}
                className="p-1 rounded-md text-stone-500 hover:text-stone-800 hover:bg-black/5 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. EATSPACE 3-COLUMN POS BILLING WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-start w-full">

        {/* COLUMN 1: LEFT TABLE DIRECTORY RAIL (Eatspace Style) */}
        <div className="lg:col-span-3 xl:col-span-3 2xl:col-span-3 bg-white p-3 rounded-2xl border border-stone-200 shadow-2xs flex flex-col gap-2.5 max-h-[calc(100vh-125px)] overflow-y-auto">
          {/* Table Rail Header */}
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900 font-serif">
              <Layers className="w-3.5 h-3.5 text-[#C67C4E]" />
              <span>Dining Tables ({tables.length})</span>
            </div>
            <span className="text-[9px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">
              {tables.filter(t => t.status === "Occupied").length} Active
            </span>
          </div>

          {/* Table Cards Square Grid */}
          <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-0.5">
            {tables.map(table => {
              const activeOrd = orders.find(
                o => o.orderType === "dine-in" &&
                  isSameTable(o.tableNumber, table.tableNumber) &&
                  o.paymentStatus !== "Paid" &&
                  o.orderStatus !== "Cancelled"
              );
              const hasOrder = !!activeOrd;
              const isOccupied = table.status === "Occupied" || hasOrder;
              const isSelected = isSameTable(selectedTable, table.tableNumber) && orderType === "dine-in";

              let cardBg = "bg-emerald-500/50 border-emerald-600/60 shadow-xs hover:bg-emerald-500/60";
              let badgeBg = "bg-emerald-800 text-white border-emerald-900";
              let badgeText = "Available";
              let badgeDot = "bg-emerald-200";
              let tableIconBg = "bg-white text-emerald-800 border-emerald-300 font-black shadow-xs";
              let textColor = "text-stone-900";
              let subTextColor = "text-emerald-950";
              let footerBorder = "border-emerald-600/30";

              if (isOccupied) {
                // Occupied / Ordered -> 80% Red Theme
                cardBg = "bg-red-500/85 border-red-600 shadow-xs text-white hover:bg-red-600/90";
                badgeBg = "bg-red-950 text-white border-red-800";
                badgeText = hasOrder ? "Ordered" : "On dine";
                badgeDot = "bg-rose-400 animate-ping";
                tableIconBg = "bg-white text-red-700 border-red-200 font-black shadow-xs";
                textColor = "text-white";
                subTextColor = "text-red-100";
                footerBorder = "border-red-400/60";
              }

              return (
                <div
                  key={table.id}
                  onClick={() => {
                    setOrderType("dine-in");
                    handleTableChange(table.tableNumber);
                  }}
                  className={`aspect-square p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between items-center text-center relative group ${cardBg} ${isSelected
                      ? "ring-2 ring-[#C67C4E] border-[#C67C4E] shadow-sm scale-[1.02]"
                      : ""
                    }`}
                >
                  {/* Top Header Row: Seat Count & Status Badge */}
                  <div className="w-full flex items-center justify-between gap-1">
                    <span className={`text-[9px] font-mono font-bold ${subTextColor}`}>
                      {table.capacity}p
                    </span>
                    <span className={`px-1 py-0.2 rounded-full border text-[7px] font-bold uppercase font-mono flex items-center gap-0.5 ${badgeBg}`}>
                      <span className={`w-1 h-1 rounded-full ${badgeDot}`} />
                      <span>{badgeText}</span>
                    </span>
                  </div>

                  {/* Center Table Number & Name */}
                  <div className="flex flex-col items-center justify-center gap-0.5 my-auto">
                    <div className={`w-10 h-10 rounded-xl font-serif font-black text-base flex items-center justify-center border ${tableIconBg}`}>
                      T{table.tableNumber}
                    </div>
                    <span className={`text-[10px] font-bold truncate max-w-[85px] ${textColor}`} title={activeOrd?.customerName || `Table #${table.tableNumber}`}>
                      {activeOrd?.customerName || (isOccupied ? `Table #${table.tableNumber}` : `Available`)}
                    </span>
                  </div>

                  {/* Bottom Footer Row: Amount or Area */}
                  <div className={`w-full pt-1 border-t ${footerBorder} flex items-center justify-center`}>
                    {hasOrder ? (
                      <span className="text-[10px] font-mono font-extrabold text-red-950 bg-white px-1.5 py-0.2 rounded border border-red-200 shadow-2xs">
                        ₹{activeOrd.grandTotal}
                      </span>
                    ) : (
                      <span className={`text-[8px] font-mono truncate ${subTextColor}`}>
                        {table.seatingArea || "Main Hall"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMN 2: CENTER CATEGORY TILES & MENU CATALOG GRID (Eatspace Style) */}
        <div className="lg:col-span-5 xl:col-span-5 2xl:col-span-5 flex flex-col gap-3 min-w-0">
          {/* Visual Category Tiles */}
          <div className="grid grid-cols-4 gap-1.5">
            {categories.slice(0, 4).map((cat) => {
              const count = cat === "All" ? menuItems.length : menuItems.filter(i => i.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[54px] ${activeCategory === cat
                      ? "bg-[#C67C4E] text-white border-[#C67C4E] shadow-2xs"
                      : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                    }`}
                >
                  <span className="font-serif font-bold text-xs truncate">{cat}</span>
                  <span className={`text-[9px] font-mono ${activeCategory === cat ? "text-white/80" : "text-stone-400"}`}>
                    {count} Items
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Bar & Manual Add Row */}
          <div className="bg-white p-3 rounded-2xl border border-stone-200 shadow-xs space-y-3">
            <div className="flex gap-2.5 items-center">
              <div className="relative flex-grow">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search catalog menu items (e.g. Masala Dosa, Coffee...)"
                  className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200/80 focus:border-[#C67C4E] rounded-xl text-xs sm:text-sm font-sans placeholder:text-stone-400 focus:outline-none transition-all shadow-2xs"
                />
              </div>

              <button
                onClick={() => {
                  executeWithPermission(
                    "pos.manual_item",
                    {
                      actionType: "add_manual",
                      title: "Manual Item Insertion Authorization",
                      description: "Authorization required to create and add a non-catalog custom culinary item"
                    },
                    () => setShowManualModal(true)
                  );
                }}
                className="px-3.5 py-2 bg-[#C67C4E] hover:bg-[#b26938] text-white font-sans font-bold uppercase tracking-wider text-xs rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>+ MANUAL</span>
              </button>
            </div>

            {/* Category horizontal badges */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar select-none">
              {categories.map((cat) => {
                const isAll = cat === "All";
                const displayCat = isAll ? "ALL" : cat.toUpperCase().replace(/\s+/g, "-");
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all whitespace-nowrap cursor-pointer ${
                      isActive
                        ? "bg-[#C67C4E] text-white shadow-2xs"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200/80 hover:text-stone-900 border border-stone-200/60"
                    }`}
                  >
                    {displayCat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Menu Catalog Grid - Clean 3-Column Light Theme Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 overflow-y-auto max-h-[calc(100vh-250px)] min-h-[280px] pr-0.5">
            {filteredMenuItems.map((item) => {
              const itemQty = cart.filter(c => c.name === item.name).reduce((sum, c) => sum + c.quantity, 0);
              const isSelected = itemQty > 0;

              return (
                <div
                  key={item.id}
                  onClick={() => handleAddRegularToCart(item)}
                  className={`p-3.5 rounded-2xl border text-left transition-all duration-200 hover:shadow-md cursor-pointer group flex flex-col justify-between min-h-[145px] relative ${
                    isSelected
                      ? "bg-amber-50/20 border-[#C67C4E] ring-2 ring-[#C67C4E]/40 shadow-xs"
                      : "bg-white border-stone-200 hover:border-stone-300 shadow-2xs"
                  }`}
                >
                  <div>
                    {/* Top Row: Veg Icon & Popular Badge */}
                    <div className="flex justify-between items-center gap-1.5 mb-2">
                      {/* Square Pure Veg Green Icon / Red Non-Veg Icon */}
                      <div
                        className={`w-4 h-4 border-[1.5px] p-[1.5px] flex items-center justify-center rounded-[3px] shrink-0 ${
                          item.isVeg !== false
                            ? "border-emerald-600"
                            : "border-red-600"
                        }`}
                        title={item.isVeg !== false ? "Pure Veg" : "Non-Veg"}
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.isVeg !== false ? "bg-emerald-600" : "bg-red-600"
                          }`}
                        />
                      </div>

                      {/* POPULAR Badge */}
                      {(item.isBestseller || item.isChefSpecial) && (
                        <span className="bg-amber-100/90 text-amber-900 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md tracking-wider font-mono">
                          POPULAR
                        </span>
                      )}
                    </div>

                    {/* Middle Row: Title */}
                    <div className="mb-3">
                      <h5
                        className={`font-bold text-sm sm:text-base leading-snug line-clamp-2 transition-colors ${
                          isSelected ? "text-[#C67C4E]" : "text-stone-900 group-hover:text-[#C67C4E]"
                        }`}
                        title={item.name}
                      >
                        {item.name}
                      </h5>
                    </div>
                  </div>

                  {/* Bottom Row: Price & + ADD Button */}
                  <div className="flex justify-between items-center border-t border-stone-100 pt-2.5 mt-auto">
                    <span className="text-stone-900 font-sans font-bold text-base sm:text-lg">
                      ₹{item.price.toLocaleString("en-IN")}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddRegularToCart(item);
                      }}
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#C67C4E] text-white shadow-2xs hover:bg-[#b26938]"
                          : "bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200/80"
                      }`}
                    >
                      <span>+ ADD</span>
                      {itemQty > 0 && <span className="ml-1 text-[10px] bg-white/30 px-1.5 py-0.2 rounded-full">({itemQty})</span>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMN 3: RIGHT ACTIVE BILLING CART & SETTLEMENT PANEL */}
        <div className="lg:col-span-4 xl:col-span-4 2xl:col-span-4 bg-white border border-stone-200 rounded-xl sm:rounded-2xl shadow-xs overflow-hidden flex flex-col lg:sticky lg:top-2 self-start max-h-[calc(100vh-125px)]">

          {/* Top Order Type Toggle Bar */}
          <div className="p-2 bg-stone-100 border-b border-stone-200 flex-shrink-0">
            <div className="grid grid-cols-3 gap-1 bg-stone-200 p-0.5 rounded-lg border border-stone-250">
              {(["dine-in", "takeaway", "delivery"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setOrderType(type);
                    if (type !== "dine-in") handleTableChange("");
                  }}
                  className={`py-1 rounded-md font-bold text-[9px] tracking-wider uppercase transition-all cursor-pointer ${orderType === type
                    ? "bg-[#C67C4E] text-white shadow-2xs"
                    : "text-stone-500 hover:text-stone-850"
                    }`}
                >
                  {type === "dine-in" ? "Dine-In" : type === "takeaway" ? "Takeaway" : "Delivery"}
                </button>
              ))}
            </div>
          </div>

          {/* TOP SESSION HEADER GRID (5 Info Boxes) */}
          <div className="p-2.5 bg-stone-50 border-b border-stone-200 space-y-2 flex-shrink-0">
            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
              {/* Box 1: Table No. */}
              <div className="bg-white p-1.5 rounded-lg border border-stone-200 shadow-2xs flex flex-col justify-between min-h-[46px]">
                <span className="text-[8px] font-bold text-stone-400 uppercase tracking-wider block">TABLE NO.</span>
                {orderType === "dine-in" ? (
                  <select
                    value={selectedTable}
                    onChange={(e) => handleTableChange(e.target.value)}
                    className="w-full bg-transparent font-bold font-mono text-stone-900 text-[11px] focus:outline-none cursor-pointer py-0.5 truncate"
                  >
                    <option value="">Choose Table</option>
                    {tables.map(table => (
                      <option key={table.id} value={table.tableNumber}>
                        #{table.tableNumber} {table.status === "Occupied" ? "• Occupied" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-bold font-mono text-stone-700 text-[11px] py-0.5">Counter</span>
                )}
              </div>

              {/* Box 2: Invc / Token # */}
              <div className="bg-white p-1.5 rounded-lg border border-stone-200 shadow-2xs flex flex-col justify-between min-h-[46px]">
                <span className="text-[8px] font-bold text-stone-400 uppercase tracking-wider block">INVC / TOKEN #</span>
                <span className="font-bold font-mono text-amber-700 text-[11px] truncate py-0.5">
                  {activeOrderForSelectedTable ? `#${activeOrderForSelectedTable.id.slice(-6)}` : "Auto-Gen"}
                </span>
              </div>

              {/* Box 3: Select Staff */}
              <div className="bg-white p-1.5 rounded-lg border border-stone-200 shadow-2xs flex flex-col justify-between min-h-[46px]">
                <span className="text-[8px] font-bold text-stone-400 uppercase tracking-wider block">SELECT STAFF</span>
                <select
                  value={selectedStaffName}
                  onChange={(e) => setSelectedStaffName(e.target.value)}
                  className="w-full bg-transparent font-semibold text-stone-900 text-[10px] focus:outline-none cursor-pointer py-0.5 truncate"
                >
                  <option value="">Staff</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              {/* Box 4: PAX (Guest Count) */}
              <div className="bg-white p-1.5 rounded-lg border border-stone-200 shadow-2xs flex items-center justify-between min-h-[42px]">
                <div>
                  <span className="text-[8px] font-bold text-stone-400 uppercase tracking-wider block">PAX (GUESTS)</span>
                  <span className="font-bold font-mono text-stone-900 text-xs">{paxCount}</span>
                </div>
                <div className="flex items-center gap-1 bg-stone-100 rounded border border-stone-250 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPaxCount(prev => Math.max(1, prev - 1))}
                    className="w-5 h-5 bg-white hover:bg-stone-200 rounded font-bold text-stone-700 flex items-center justify-center cursor-pointer shadow-2xs text-xs"
                  >-</button>
                  <button
                    type="button"
                    onClick={() => setPaxCount(prev => prev + 1)}
                    className="w-5 h-5 bg-white hover:bg-stone-200 rounded font-bold text-stone-700 flex items-center justify-center cursor-pointer shadow-2xs text-xs"
                  >+</button>
                </div>
              </div>

              {/* Box 5: Add Customer */}
              <div className="bg-white p-1.5 rounded-lg border border-stone-200 shadow-2xs flex flex-col justify-between min-h-[42px]">
                <span className="text-[8px] font-bold text-stone-400 uppercase tracking-wider block">ADD CUSTOMER</span>
                <input
                  type="text"
                  maxLength={40}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Guest Name"
                  className="w-full bg-transparent font-medium text-stone-900 text-[10px] focus:outline-none placeholder:text-stone-300 py-0.5"
                />
              </div>
            </div>

            {/* Extended Contact Fields when Customer details are present or for Delivery */}
            {(customerName || orderType === "delivery") && (
              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                <input
                  type="text"
                  maxLength={15}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value.replace(/[^\d+ -]/g, ""))}
                  placeholder="Phone No. (Optional)"
                  className="bg-white border border-stone-200 rounded-lg py-1 px-2 text-[10px] focus:outline-none focus:border-[#C67C4E]"
                />
                {orderType === "delivery" ? (
                  <input
                    type="text"
                    maxLength={100}
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Delivery Address *"
                    className="bg-white border border-stone-200 rounded-lg py-1 px-2 text-[10px] focus:outline-none focus:border-purple-600"
                  />
                ) : (
                  <input
                    type="email"
                    maxLength={50}
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="Email (Optional)"
                    className="bg-white border border-stone-200 rounded-lg py-1 px-2 text-[10px] focus:outline-none focus:border-[#C67C4E]"
                  />
                )}
              </div>
            )}

            {/* Active Table Notification & Quick Split/Transfer Pills */}
            {activeOrderForSelectedTable && (
              <div className="p-1.5 bg-amber-50 border border-amber-250 text-amber-900 rounded-lg flex items-center justify-between gap-1 font-medium text-[9px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full flex-shrink-0 animate-pulse" />
                  <span className="truncate font-semibold">Active: ₹{activeOrderForSelectedTable.grandTotal}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSplitTargetOrder(activeOrderForSelectedTable);
                      setShowSplitModal(true);
                    }}
                    className="px-1.5 py-0.5 bg-[#d4af37]/20 hover:bg-[#d4af37]/30 text-[#886915] font-bold rounded flex items-center gap-1 cursor-pointer text-[9px]"
                  >
                    <Receipt className="w-2.5 h-2.5" />
                    <span>Split</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTransferSourceTable(selectedTable);
                      setTransferSourceOrder(activeOrderForSelectedTable);
                      setShowTransferModal(true);
                    }}
                    className="px-1.5 py-0.5 bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold rounded flex items-center gap-1 cursor-pointer text-[9px]"
                  >
                    <ArrowRightLeft className="w-2.5 h-2.5" />
                    <span>Transfer</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CART ITEMS CONTAINER WITH KOT GROUPING */}
          <div className="flex-grow overflow-y-auto max-h-[34vh] xl:max-h-[40vh] 2xl:max-h-[44vh] p-2.5 sm:p-3 space-y-3 min-h-[160px] bg-stone-50/50">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-stone-400 flex flex-col items-center justify-center gap-1.5">
                <div className="p-3 bg-stone-100 rounded-full text-stone-300">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-semibold text-stone-600 text-xs">POS Cart is empty</p>
                  <p className="text-[9px] text-stone-400">Click catalog items to populate order</p>
                </div>
              </div>
            ) : (
              <>
                {/* Render Printed KOT Batches */}
                {groupedKotItems.printedBatches.map((batch, idx) => (
                  <div key={batch.kotNumber || `batch-${idx}`} className="space-y-1.5">
                    {/* Printed KOT Header */}
                    <div className="flex items-center justify-between bg-purple-100 border-l-4 border-purple-600 px-2 py-1 rounded-r-md text-[9px] font-mono text-purple-900 font-bold">
                      <span className="flex items-center gap-1">
                        <UtensilsCrossed className="w-3 h-3 text-purple-700" />
                        <span>{batch.kotNumber || "KOT BATCH"}</span>
                      </span>
                      <span className="text-purple-700 text-[8px] bg-purple-200 px-1 py-0.2 rounded font-mono">PRINTED</span>
                    </div>

                    {/* Batch Items */}
                    <div className="space-y-1.5 bg-white p-2 rounded-lg border border-purple-100 shadow-2xs divide-y divide-stone-100">
                      {batch.items.map(item => {
                        const isEditing = editingItemId === item.id;
                        const lineItemTotal = ((item.price * item.quantity) - (item.price * item.quantity * (item.discount / 100)));

                        return (
                          <div key={item.id} className="pt-1.5 first:pt-0 flex flex-col gap-1">
                            <div className="flex justify-between items-start gap-1">
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <div className="font-bold text-stone-900 flex items-center gap-1 flex-wrap text-xs">
                                  <span className="truncate max-w-[140px]" title={item.name}>{item.name}</span>
                                  {item.customization && (
                                    <span className="text-[8px] italic text-[#C67C4E] block truncate max-w-[140px]" title={item.customization}>
                                      Note: {item.customization}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] font-mono text-stone-500">
                                  ₹{item.price} x {item.quantity} {item.discount > 0 && <span className="text-green-600 font-bold">(-{item.discount}%)</span>}
                                </div>
                              </div>

                              <div className="text-right space-y-1 flex-shrink-0">
                                <span className="font-mono font-bold text-stone-900 block text-xs">
                                  ₹{lineItemTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </span>

                                <div className="flex items-center border border-stone-200 rounded bg-stone-50 h-5 overflow-hidden select-none ml-auto">
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustQuantity(item.id, -1)}
                                    className="px-1.5 text-stone-500 hover:bg-stone-200 cursor-pointer h-full font-bold text-xs"
                                  >-</button>
                                  <span className="px-1.5 font-mono text-xs font-bold text-stone-900">{item.quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustQuantity(item.id, 1)}
                                    className="px-1.5 text-stone-500 hover:bg-stone-200 cursor-pointer h-full font-bold text-xs"
                                  >+</button>
                                </div>
                              </div>
                            </div>

                            {/* Item Actions */}
                            <div className="flex items-center justify-between text-[8px] pt-0.5">
                              {isEditing ? (
                                <div className="flex gap-1 items-center bg-stone-50 p-1 rounded border border-stone-200 w-full">
                                  <input
                                    type="number"
                                    value={editPriceVal}
                                    onChange={(e) => setEditPriceVal(e.target.value)}
                                    placeholder={`₹${item.price}`}
                                    className="w-16 bg-white border border-stone-200 rounded px-1 py-0.5 text-[9px]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (editPriceVal && parseFloat(editPriceVal) !== item.price) {
                                        handleUpdatePrice(item.id, editPriceVal);
                                      } else {
                                        setEditingItemId(null);
                                      }
                                    }}
                                    className="px-1.5 py-0.5 bg-green-600 text-white rounded font-bold cursor-pointer"
                                  >Save</button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingItemId(null)}
                                    className="px-1.5 py-0.5 bg-stone-400 text-white rounded font-bold cursor-pointer"
                                  >✕</button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingItemId(item.id);
                                      setEditPriceVal(item.price.toString());
                                      setEditDiscountVal(item.discount.toString());
                                    }}
                                    className="text-[#C67C4E] hover:underline font-bold font-mono flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Edit3 className="w-2.5 h-2.5" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFromCart(item.id)}
                                    className="text-red-500 hover:underline font-bold font-mono flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" /> Remove
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Render Unprinted / New Items */}
                {groupedKotItems.unprintedItems.length > 0 && (
                  <div className="space-y-1.5">
                    {/* Unprinted KOT Header */}
                    <div className="flex items-center justify-between bg-amber-100 border-l-4 border-amber-500 px-2 py-1 rounded-r-md text-[9px] font-mono text-amber-900 font-bold">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                        <span>NEW ITEMS (UNPRINTED)</span>
                      </span>
                      <span className="text-amber-800 text-[8px] bg-amber-200 px-1 py-0.2 rounded font-mono">READY</span>
                    </div>

                    {/* Unprinted Items List */}
                    <div className="space-y-1.5 bg-white p-2 rounded-lg border border-amber-200/80 shadow-2xs divide-y divide-stone-100">
                      {groupedKotItems.unprintedItems.map(item => {
                        const isEditing = editingItemId === item.id;
                        const lineItemTotal = ((item.price * item.quantity) - (item.price * item.quantity * (item.discount / 100)));

                        return (
                          <div key={item.id} className="pt-1.5 first:pt-0 flex flex-col gap-1">
                            <div className="flex justify-between items-start gap-1">
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <div className="font-bold text-stone-900 flex items-center gap-1 flex-wrap text-xs">
                                  <span className="truncate max-w-[140px]" title={item.name}>{item.name}</span>
                                  <span className="bg-amber-50 border border-amber-200 text-amber-800 text-[7px] font-bold px-1 py-0.2 rounded font-mono animate-pulse">
                                    NEW
                                  </span>
                                  {item.customization && (
                                    <span className="text-[8px] italic text-[#C67C4E] block truncate max-w-[140px]" title={item.customization}>
                                      Note: {item.customization}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] font-mono text-stone-500">
                                  ₹{item.price} x {item.quantity} {item.discount > 0 && <span className="text-green-600 font-bold">(-{item.discount}%)</span>}
                                </div>
                              </div>

                              <div className="text-right space-y-1 flex-shrink-0">
                                <span className="font-mono font-bold text-stone-900 block text-xs">
                                  ₹{lineItemTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </span>

                                <div className="flex items-center border border-stone-200 rounded bg-stone-50 h-5 overflow-hidden select-none ml-auto">
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustQuantity(item.id, -1)}
                                    className="px-1.5 text-stone-500 hover:bg-stone-200 cursor-pointer h-full font-bold text-xs"
                                  >-</button>
                                  <span className="px-1.5 font-mono text-xs font-bold text-stone-900">{item.quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleAdjustQuantity(item.id, 1)}
                                    className="px-1.5 text-stone-500 hover:bg-stone-200 cursor-pointer h-full font-bold text-xs"
                                  >+</button>
                                </div>
                              </div>
                            </div>

                            {/* Item Actions */}
                            <div className="flex items-center justify-between text-[8px] pt-0.5">
                              {isEditing ? (
                                <div className="flex gap-1 items-center bg-stone-50 p-1 rounded border border-stone-200 w-full">
                                  <input
                                    type="number"
                                    value={editPriceVal}
                                    onChange={(e) => setEditPriceVal(e.target.value)}
                                    placeholder={`₹${item.price}`}
                                    className="w-16 bg-white border border-stone-200 rounded px-1 py-0.5 text-[9px]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (editPriceVal && parseFloat(editPriceVal) !== item.price) {
                                        handleUpdatePrice(item.id, editPriceVal);
                                      } else {
                                        setEditingItemId(null);
                                      }
                                    }}
                                    className="px-1.5 py-0.5 bg-green-600 text-white rounded font-bold cursor-pointer"
                                  >Save</button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingItemId(null)}
                                    className="px-1.5 py-0.5 bg-stone-400 text-white rounded font-bold cursor-pointer"
                                  >✕</button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingItemId(item.id);
                                      setEditPriceVal(item.price.toString());
                                      setEditDiscountVal(item.discount.toString());
                                    }}
                                    className="text-[#C67C4E] hover:underline font-bold font-mono flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Edit3 className="w-2.5 h-2.5" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFromCart(item.id)}
                                    className="text-red-500 hover:underline font-bold font-mono flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" /> Remove
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* TOTAL QUANTITY & GRAND TOTAL SUMMARY BANNER (Teal Theme) */}
          <div className="bg-teal-700 text-white px-3 py-2 flex items-center justify-between font-mono shadow-xs border-t border-b border-teal-800 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-teal-100 text-[11px] font-sans font-semibold">Quantity:</span>
              <span className="bg-teal-900 text-teal-100 px-2 py-0.5 rounded font-bold text-xs border border-teal-600/50">
                {totalCartQuantity}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-teal-100 text-[11px] font-sans font-semibold">Total (With Taxes):</span>
              <span className="text-white font-bold text-sm tracking-tight">
                ₹{cartTotals.grandTotal.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* ORDER INSTRUCTIONS INPUT */}
          <div className="p-2 bg-stone-50 border-b border-stone-200 flex-shrink-0">
            <div className="flex items-center gap-1.5 bg-white border border-stone-300 rounded-lg px-2 py-1 shadow-2xs">
              <MessageSquare className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <input
                type="text"
                maxLength={150}
                value={orderInstructions}
                onChange={(e) => setOrderInstructions(e.target.value)}
                placeholder="Order Instructions (e.g. Less spicy, Chef notes...)"
                className="w-full text-[10px] text-stone-800 placeholder:text-stone-400 focus:outline-none"
              />
            </div>
          </div>

          {/* BOTTOM STREAMLINED ACTION BUTTONS BAR */}
          <div className="p-2 sm:p-2.5 bg-stone-900 text-white space-y-2 flex-shrink-0">
            <div className="grid grid-cols-4 gap-1.5">
              {/* 1. CANCEL */}
              <button
                type="button"
                onClick={handleClearCart}
                disabled={cart.length === 0}
                className={`py-2 px-1 rounded-lg font-mono font-bold text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${cart.length === 0
                  ? "bg-stone-800 text-stone-500 cursor-not-allowed border border-stone-700/50"
                  : "bg-red-600 hover:bg-red-700 text-white shadow-xs cursor-pointer active:scale-95"
                  }`}
                title="Clear all cart items"
              >
                <Trash2 className="w-3 h-3" />
                <span>CANCEL</span>
              </button>

              {/* 2. SETTLE NOW */}
              <button
                type="button"
                onClick={async () => {
                  if (activeOrderForSelectedTable) {
                    setSplitTargetOrder(activeOrderForSelectedTable);
                    setShowSplitModal(true);
                  } else if (cart.length > 0) {
                    handleOpenBillPreview();
                  } else {
                    alert("Cart is empty.");
                  }
                }}
                disabled={cart.length === 0 && !activeOrderForSelectedTable}
                className={`py-2 px-1 rounded-lg font-mono font-bold text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${cart.length === 0 && !activeOrderForSelectedTable
                  ? "bg-stone-800 text-stone-500 cursor-not-allowed border border-stone-700/50"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer active:scale-95"
                  }`}
                title="Settle Bill & Collect Payment"
              >
                <span>⚡</span>
                <span>SETTLE</span>
              </button>

              {/* 3. VIEW BILL */}
              <button
                type="button"
                onClick={handleOpenBillPreview}
                disabled={cart.length === 0 || isFinalizing}
                className={`py-2 px-1 rounded-lg font-mono font-bold text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${cart.length === 0 || isFinalizing
                  ? "bg-stone-800 text-stone-500 cursor-not-allowed border border-stone-700/50"
                  : "bg-[#C67C4E] hover:bg-[#aa7c11] text-white shadow-xs cursor-pointer active:scale-95"
                  }`}
                title="View Bill Preview & Print"
              >
                <Receipt className="w-3 h-3" />
                <span>VIEW BILL</span>
              </button>

              {/* 4. PRINT KOT */}
              <button
                type="button"
                onClick={handleSaveOrder}
                disabled={cart.length === 0 || isPrintingKOT || isFinalizing}
                className={`py-2 px-1 rounded-lg font-mono font-bold text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${cart.length === 0 || isPrintingKOT || isFinalizing
                  ? "bg-stone-800 text-stone-500 cursor-not-allowed border border-stone-700/50"
                  : "bg-purple-600 hover:bg-purple-500 text-white shadow-xs cursor-pointer active:scale-95"
                  }`}
                title="Print Kitchen Order Ticket"
              >
                <UtensilsCrossed className="w-3 h-3" />
                <span>KOT</span>
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* ======================================================== */}
      {/* 4. MODAL DIALOGS AND SECURITY OVERLAYS */}
      {/* ======================================================== */}

      {/* MODAL 1: ADD MANUAL CULINARY ITEM FORM */}
      <AnimatePresence>
        {showManualModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowManualModal(false)}
              className="fixed inset-0 bg-[#0c0a09]/40 z-40 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-4 max-w-md mx-auto my-auto h-fit bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 z-50 shadow-2xl overflow-y-auto max-h-[85vh]"
            >
              <div className="flex justify-between items-start border-b border-stone-100 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#C67C4E]/10 text-[#C67C4E] rounded-xl">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-serif font-bold text-stone-900 uppercase tracking-wide">
                      Add Manual Item
                    </h3>
                    <p className="text-[10px] text-stone-400 mt-0.5">Bill a product/service not present in the menu</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowManualModal(false)}
                  className="p-1 text-stone-400 hover:text-stone-900 cursor-pointer text-sm"
                >
                  ✕
                </button>
              </div>

              {manualFormErrors.length > 0 && (
                <div className="mb-4 bg-red-50 border border-red-200 p-3.5 rounded-xl text-[10px] text-red-800 space-y-1">
                  <div className="font-bold uppercase tracking-wider flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" /> validation errors found:
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 font-sans">
                    {manualFormErrors.map(e => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}

              <form onSubmit={handleAddManualItemSubmit} className="space-y-4 text-xs font-sans text-stone-700">
                {/* Name */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-mono font-bold text-stone-450 uppercase tracking-widest">
                    ITEM NAME *
                  </label>
                  <input
                    required
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="e.g. Butter Naan Special Pack"
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-[#C67C4E]"
                  />
                </div>

                {/* Price & Quantity Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-stone-450 uppercase tracking-widest">
                      UNIT PRICE (INR) *
                    </label>
                    <input
                      required
                      type="number"
                      step="any"
                      min="0.01"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      placeholder="₹250.00"
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-[#C67C4E]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-stone-450 uppercase tracking-widest">
                      QUANTITY *
                    </label>
                    <input
                      required
                      type="number"
                      min="1"
                      value={manualQuantity}
                      onChange={(e) => setManualQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      placeholder="1"
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-[#C67C4E]"
                    />
                  </div>
                </div>

                {/* GST & Discount Grid */}
                <div className={`grid ${settings.gstEnabled ? "grid-cols-2" : "grid-cols-1"} gap-3`}>
                  {settings.gstEnabled && (
                    <div className="space-y-1">
                      <label className="block text-[10px] font-mono font-bold text-stone-450 uppercase tracking-widest">
                        GST RATE *
                      </label>
                      <select
                        value={manualGstRate}
                        onChange={(e) => setManualGstRate(parseInt(e.target.value, 10))}
                        className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-[#C67C4E]"
                      >
                        <option value={0}>0% Exempted</option>
                        <option value={5}>5% Standard F&B</option>
                        <option value={12}>12% Butter/Dairy</option>
                        <option value={18}>18% Luxury Surcharge</option>
                        <option value={28}>28% Sin/Cess Rate</option>
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-stone-450 uppercase tracking-widest">
                      DISCOUNT (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={manualDiscount}
                      onChange={(e) => setManualDiscount(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                      placeholder="0"
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-[#C67C4E]"
                    />
                  </div>
                </div>

                {/* Category & HSN Code */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-stone-450 uppercase tracking-widest">
                      CATEGORY (OPTIONAL)
                    </label>
                    <input
                      type="text"
                      value={manualCategory}
                      onChange={(e) => setManualCategory(e.target.value)}
                      placeholder="e.g. Desserts"
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-[#C67C4E]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-stone-450 uppercase tracking-widest">
                      HSN CODE
                    </label>
                    <input
                      type="text"
                      value={manualHsnCode}
                      onChange={(e) => setManualHsnCode(e.target.value)}
                      placeholder="e.g. 9963"
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-[#C67C4E]"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-mono font-bold text-stone-450 uppercase tracking-widest">
                    CULINARY PREPARATION NOTES
                  </label>
                  <textarea
                    rows={2}
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    placeholder="Provide special tandoor prep notes, packing specifications..."
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-900 focus:outline-none focus:border-[#C67C4E]"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2.5 pt-3">
                  <button
                    type="submit"
                    className="flex-grow py-3 bg-[#C67C4E] hover:bg-[#aa7c11] text-white font-mono font-semibold tracking-wider text-[10px] uppercase rounded-xl transition-all cursor-pointer"
                  >
                    Add to Bill
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowManualModal(false)}
                    className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-mono font-semibold tracking-wider text-[10px] uppercase rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* TABLE TRANSFER & MERGE MODAL */}
      <TransferTableModal
        isOpen={showTransferModal}
        onClose={() => {
          setShowTransferModal(false);
          setTransferSourceTable(null);
          setTransferSourceOrder(null);
        }}
        initialSourceTableNumber={transferSourceTable || undefined}
        initialSourceOrder={transferSourceOrder || undefined}
        onTransferSuccess={(src, tgt) => {
          // If the currently selected table in the POS was transferred to tgt, switch selection to tgt
          if (selectedTable === src) {
            handleTableChange(tgt);
          }
          onOrderPlaced();
        }}
      />

      {/* SPLIT BILL & PAYMENT SETTLEMENT MODAL */}
      {showSplitModal && splitTargetOrder && (
        <SplitBillModal
          isOpen={showSplitModal}
          onClose={() => {
            setShowSplitModal(false);
            setSplitTargetOrder(null);
          }}
          order={splitTargetOrder}
          settings={settings}
          currentUser={currentRole}
          onOrderUpdated={(updatedOrder) => {
            onOrderPlaced();
            setSplitTargetOrder(updatedOrder);
          }}
        />
      )}

      {/* 1-Click WhatsApp Daily Closing Summary Modal */}
      <WhatsAppDailySummaryModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        orders={orders}
        settings={settings}
      />

      {/* DINE-IN / POS BILL PREVIEW & CONFIRMATION MODAL */}
      <AnimatePresence>
        {showBillPreviewModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBillPreviewModal(false)}
              className="fixed inset-0 bg-[#0c0a09]/80 z-50 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="fixed inset-3 sm:inset-6 md:inset-10 max-w-2xl mx-auto bg-stone-900 text-white z-50 shadow-2xl rounded-2xl border border-stone-700/80 overflow-hidden flex flex-col max-h-[92vh]"
            >
              {/* Modal Header Bar */}
              <div className="p-3.5 bg-stone-950 border-b border-stone-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#C67C4E]/20 text-[#C67C4E] flex items-center justify-center font-bold">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-serif font-black text-sm tracking-wide text-white">Bill Preview & Print Confirmation</h3>
                    <p className="text-[9px] font-mono text-stone-400">
                      {orderType.toUpperCase()} • {orderType === "dine-in" ? `TABLE #${selectedTable}` : "COUNTER"} • REVIEW INVOICE BEFORE PRINTING
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBillPreviewModal(false)}
                  className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Thermal Paper Receipt Preview Body */}
              <div className="p-4 overflow-y-auto flex-grow bg-stone-950/60 font-mono text-stone-900 select-none">
                <div className="max-w-sm mx-auto bg-amber-50/95 text-stone-950 p-5 rounded-xl shadow-lg border border-amber-200/80 space-y-3 font-mono text-xs relative">
                  <div className="text-center space-y-1 pb-3 border-b border-dashed border-stone-400">
                    <div className="font-serif font-black text-base uppercase tracking-wider text-stone-900">
                      {settings.name || "THE XINGS KITCHEN"}
                    </div>
                    <div className="text-[9px] text-stone-600 font-sans">{settings.address || "Main Dining Hall, Sector 18"}</div>
                    <div className="text-[9px] text-stone-600 font-sans">Contact: {settings.contactNumber || "+91 98765 43210"}</div>
                    {settings.gstin && (
                      <div className="text-[9px] font-bold text-stone-700">GSTIN: {settings.gstin}</div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 text-[10px] py-1 border-b border-dashed border-stone-400 gap-y-1">
                    <div>
                      <span className="text-stone-500 block">TYPE:</span>
                      <strong className="text-stone-900 uppercase font-bold">{orderType}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-stone-500 block">TABLE:</span>
                      <strong className="text-[#C67C4E] text-xs font-black">
                        {orderType === "dine-in" ? `TABLE #${selectedTable}` : "TAKEAWAY"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-stone-500 block">GUEST:</span>
                      <span className="font-semibold text-stone-850 truncate block max-w-[130px]">{customerName || "Walk-In Guest"}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-stone-500 block">TIME:</span>
                      <span className="text-[9px] text-stone-700">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="grid grid-cols-12 text-[9px] font-bold text-stone-500 border-b border-stone-300 pb-1">
                      <span className="col-span-6">ITEM</span>
                      <span className="col-span-2 text-center">QTY</span>
                      <span className="col-span-2 text-right">RATE</span>
                      <span className="col-span-2 text-right">AMT</span>
                    </div>

                    {cart.map((item, idx) => {
                      const effectivePrice = item.price - (item.price * (item.discount / 100));
                      const itemTotal = effectivePrice * item.quantity;
                      return (
                        <div key={idx} className="grid grid-cols-12 text-[10px] py-0.5 border-b border-stone-200/60 items-center">
                          <span className="col-span-6 font-semibold text-stone-900 truncate" title={item.name}>
                            {item.name}
                          </span>
                          <span className="col-span-2 text-center font-bold">{item.quantity}</span>
                          <span className="col-span-2 text-right text-stone-600">₹{effectivePrice}</span>
                          <span className="col-span-2 text-right font-bold text-stone-950">₹{itemTotal}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-1 pt-2 border-t border-dashed border-stone-400 text-[10px]">
                    <div className="flex justify-between text-stone-600">
                      <span>Subtotal ({cart.length} items):</span>
                      <span>₹{cartTotals.subtotal}</span>
                    </div>
                    {cartTotals.itemDiscounts > 0 && (
                      <div className="flex justify-between text-green-700 font-semibold">
                        <span>Item Discounts:</span>
                        <span>-₹{cartTotals.itemDiscounts}</span>
                      </div>
                    )}
                    {cartTotals.couponDiscount > 0 && (
                      <div className="flex justify-between text-green-700 font-semibold">
                        <span>Coupon ({appliedCoupon?.code}):</span>
                        <span>-₹{cartTotals.couponDiscount}</span>
                      </div>
                    )}
                    {cartTotals.gstEnabled && cartTotals.gst > 0 && (
                      <div className="flex justify-between text-stone-600">
                        <span>GST ({cartTotals.gstRate}%):</span>
                        <span>₹{cartTotals.gst}</span>
                      </div>
                    )}
                    {cartTotals.packaging > 0 && (
                      <div className="flex justify-between text-stone-600">
                        <span>Packaging Charge:</span>
                        <span>₹{cartTotals.packaging}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-sm font-black border-t-2 border-stone-900 pt-2 text-stone-950">
                      <span>TOTAL AMOUNT:</span>
                      <span className="text-[#C67C4E] text-base font-black">₹{cartTotals.grandTotal}</span>
                    </div>

                    <div className="pt-1 flex justify-between items-center text-[9px] text-stone-500 font-sans">
                      <span>SETTLEMENT STATUS:</span>
                      <span className={`px-2 py-0.5 rounded font-bold font-mono text-[9px] uppercase ${posPaymentStatus === "Paid" ? "bg-green-100 text-green-800 border border-green-300" : "bg-amber-100 text-amber-900 border border-amber-300"}`}>
                        {posPaymentStatus === "Paid" ? "PAID ✓" : "UNPAID (OPEN TAB)"}
                      </span>
                    </div>
                  </div>

                  <div className="text-center pt-3 border-t border-dashed border-stone-400 text-[8px] text-stone-500 space-y-0.5">
                    <div>*** THANK YOU FOR DINING WITH US ***</div>
                    <div>POWERED BY WEBRAJYA POS</div>
                  </div>
                </div>
              </div>

              {/* Modal Control Action Buttons */}
              <div className="p-3.5 bg-stone-950 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowBillPreviewModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 font-mono font-bold text-[10px] uppercase rounded-xl transition-all cursor-pointer border border-stone-700"
                >
                  ✏️ Cancel & Edit Items
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {setShowBillPrint && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowBillPreviewModal(false);
                        const dummyOrder: Order = {
                          id: `PREVIEW-${Date.now()}`,
                          customerName: customerName.trim() || "Walk-In Guest",
                          phoneNumber: customerPhone || "",
                          email: customerEmail || "",
                          orderType: orderType,
                          tableNumber: selectedTable,
                          items: cart.map(i => ({
                            menuItemId: i.id,
                            name: i.name,
                            price: i.price,
                            quantity: i.quantity,
                            customization: i.customization
                          })),
                          subtotal: cartTotals.subtotal,
                          gst: cartTotals.gst,
                          packagingCharge: cartTotals.packaging,
                          discountAmount: cartTotals.couponDiscount,
                          grandTotal: cartTotals.grandTotal,
                          paymentStatus: posPaymentStatus,
                          orderStatus: "New Order",
                          createdAt: new Date().toISOString()
                        };
                        PhysicalThermalPrinter.printBillSystemFallback(dummyOrder, settings, "80mm");
                      }}
                      className="flex-1 sm:flex-none px-3 py-2.5 bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-600/40 font-mono font-bold text-[10px] uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-400" />
                      <span>Direct Browser Print</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isFinalizing}
                    onClick={async () => {
                      setShowBillPreviewModal(false);
                      await handleFinalizeCheckout();
                    }}
                    className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 hover:from-emerald-500 hover:to-emerald-400 text-white font-mono font-bold text-[11px] uppercase rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-98"
                  >
                    {isFinalizing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Printing...</span>
                      </>
                    ) : (
                      <>
                        <Printer className="w-4 h-4" />
                        <span>Confirm & Print Bill</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
