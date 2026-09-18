import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  BarChart3, ShoppingCart, Utensils, Users, Landmark, Ticket, 
  MessageSquare, Package, ShieldCheck, Settings, LogOut, Check, X,
  Search, Plus, Filter, Download, Info, Trash2, Edit2, AlertCircle, 
  Activity, Star, Sparkles, Volume2, VolumeX, Printer, CheckCircle, QrCode,
  BookOpen, Eye, Calculator, History, Bell, Lock, RefreshCw, TrendingUp,
  FileText, Layers, Store, MapPin, Phone, ListPlus, Sliders, RotateCcw,
  ArrowRightLeft, Receipt, Scale, Truck, PieChart, User
} from "lucide-react";
import { jsPDF } from "jspdf";
import { motion, AnimatePresence } from "motion/react";
import { LocalDB, Order, Coupon, InventoryItem, AuditLog, RestaurantSettings, RestaurantOutlet, defaultOutlets, defaultTermsAndConditions, isDineInQrOrder } from "../lib/db";
import { MenuItem, RestaurantTable, KOT, Category } from "../types";
import { PhysicalThermalPrinter, getWRPrinterSettings } from "../lib/printerService";
import KitchenDashboard from "./KitchenDashboard";
import LiveKotMonitor from "./LiveKotMonitor";
import SupabaseDiagnostics from "../pages/admin/SupabaseDiagnostics";
import BulkMenuImporter from "./BulkMenuImporter";
import PosBillingPortal from "./PosBillingPortal";
import PrintersConfigTab from "./PrintersConfigTab";
import ReportsDashboard from "./ReportsDashboard";
import TransferTableModal from "./TransferTableModal";
import { SplitBillModal } from "./SplitBillModal";
import OrderLifecycleTimeline from "./OrderLifecycleTimeline";
import { OrderLifecycleService } from "../lib/orderLifecycle";
import { RBACService } from "../lib/rbac";
import { StaffMember } from "../types";
import { parseCurrentRoute, buildAdminUrl, navigateTo, AdminTab, ReportsSubTab, MenuSubTab } from "../lib/router";

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  // Read initial route for zero-flicker instant deep linking
  const initialRoute = parseCurrentRoute();

  const [activeTab, setActiveTab] = useState<AdminTab>(() => initialRoute.adminTab);
  const [reportsSubTab, setReportsSubTab] = useState<ReportsSubTab>(() => initialRoute.reportsSubTab);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Local sync states
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings>(() => LocalDB.getSettings());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [categoriesList, setCategoriesList] = useState<Category[]>(() => LocalDB.getCategories());
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("🍽️");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");
  const [selectedTableForQr, setSelectedTableForQr] = useState<RestaurantTable | null>(null);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [newTableNo, setNewTableNo] = useState("");
  const [newCapacity, setNewCapacity] = useState(4);
  const [newArea, setNewArea] = useState("Main Dining Hall");
  const [showAddTable, setShowAddTable] = useState(false);

  // Table Transfer Modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSourceTable, setTransferSourceTable] = useState<string | null>(null);
  const [transferSourceOrder, setTransferSourceOrder] = useState<Order | null>(null);

  // Split Bill Modal state
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitTargetOrder, setSplitTargetOrder] = useState<Order | null>(null);

  // Active User Profile State
  const [activeStaff, setActiveStaff] = useState<StaffMember>(() => RBACService.getActiveStaff());

  // Sound selection
  const [soundEnabled, setSoundEnabled] = useState(true);

  // New Order floating alert/toast list
  const [activeAlerts, setActiveAlerts] = useState<Order[]>([]);
  const notifiedOrderIdsRef = useRef<Set<string>>(new Set());

  // Audio chime player for notifications
  const playOrderChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch (_) {}
  };

  // Dedicated Live Order Notification dispatcher with strict Dine-In QR filtering and deduplication
  const showLiveOrderNotification = (order: Order) => {
    // 1. Strict filter: ONLY genuine customer Dine-In QR orders (POS orders, Takeaway, Delivery are excluded)
    if (!isDineInQrOrder(order)) {
      return;
    }

    // 2. Strict deduplication key: Order ID
    if (notifiedOrderIdsRef.current.has(order.id)) {
      return;
    }
    notifiedOrderIdsRef.current.add(order.id);

    // 3. Play audio chime
    playOrderChime();

    // 4. Show the Live Order Received notification card
    setActiveAlerts(prev => {
      if (!prev.some(a => a.id === order.id)) {
        return [order, ...prev];
      }
      return prev;
    });
  };

  const [selectedOrderDetails, setSelectedOrderDetails] = useState<Order | null>(null);
  const [showBillPrint, setShowBillPrint] = useState<Order | null>(null);
  
  // Custom single-printer thermal hub states
  const [adminPrinterWidth, setAdminPrinterWidth] = useState<"58mm" | "80mm">("80mm");
  const [adminPrinterMode, setAdminPrinterMode] = useState<"native" | "usb" | "serial" | "fallback">("native");
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<"bill" | "kot" | "customer-copy" | "kitchen-copy" | "duplicate-copy" | "front-side" | "back-side" | "double-sided">("bill");

  // Outlets & Terms & Conditions management states for Settings Tab
  const [showAddOutletModal, setShowAddOutletModal] = useState(false);
  const [editingOutletIndex, setEditingOutletIndex] = useState<number | null>(null);
  const [outletForm, setOutletForm] = useState<{ name: string; address: string; contactNumber: string }>({
    name: "",
    address: "",
    contactNumber: ""
  });
  const [newTermInput, setNewTermInput] = useState("");
  const [editingTermIndex, setEditingTermIndex] = useState<number | null>(null);
  const [editingTermInput, setEditingTermInput] = useState("");

  // Premium Printer Engine Configuration States
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [customFooter, setCustomFooter] = useState<string>("Taste That Brings You Back.");
  const [showQrCode, setShowQrCode] = useState<boolean>(true);
  const [showBarcode, setShowBarcode] = useState<boolean>(true);
  const [showSignature, setShowSignature] = useState<boolean>(true);
  const [fontScaling, setFontScaling] = useState<number>(100);
  const [marginControl, setMarginControl] = useState<number>(8);
  const [characterDensity, setCharacterDensity] = useState<"compact" | "normal" | "spacious">("normal");
  const [multipleCopies, setMultipleCopies] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [darkPreview, setDarkPreview] = useState<boolean>(false);
  const [printCountMap, setPrintCountMap] = useState<Record<string, number>>({});
  const [printHistoryList, setPrintHistoryList] = useState<{ id: string; type: string; timestamp: string; copies: number }[]>([]);
  const [simulatedEmail, setSimulatedEmail] = useState<string>("");
  const [simulatedPhone, setSimulatedPhone] = useState<string>("");
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);
  const [phoneSuccessMsg, setPhoneSuccessMsg] = useState<string | null>(null);

  // Inactivity tracking: 10 minutes auto-logout
  const [secondsRemaining, setSecondsRemaining] = useState(600); // 10 minutes
  
  // Tab-specific interactive states
  const [autoPrintEnabled, setAutoPrintEnabled] = useState<boolean>(() => localStorage.getItem("ij_auto_print_enabled") !== "false");
  const [orderFilter, setOrderFilter] = useState<string>("All");
  const [orderSearch, setOrderSearch] = useState<string>("");
  const [menuSearch, setMenuSearch] = useState<string>("");
  const [menuFilterCategory, setMenuFilterCategory] = useState<string>("All");
  const [customerSearch, setCustomerSearch] = useState<string>("");

  // Order History tab states
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilterStatus, setHistoryFilterStatus] = useState("All");
  const [historyFilterType, setHistoryFilterType] = useState("All");

  // Modals for ADDING/EDITING MENU
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<Partial<MenuItem> | null>(null);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [inlineEditCategories, setInlineEditCategories] = useState<boolean>(() => initialRoute.menuSubTab === "categories");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Navigation handlers with URL synchronization
  const handleTabSelect = (tab: AdminTab) => {
    setActiveTab(tab);
    if (tab === "reports") {
      navigateTo(buildAdminUrl("reports", reportsSubTab));
    } else if (tab === "menu") {
      navigateTo(buildAdminUrl("menu", inlineEditCategories ? "categories" : "items"));
    } else {
      navigateTo(buildAdminUrl(tab));
    }
  };

  const handleReportsSubTabChange = (subTab: ReportsSubTab) => {
    setReportsSubTab(subTab);
    navigateTo(buildAdminUrl("reports", subTab));
  };

  const handleToggleCategories = (enable: boolean) => {
    setInlineEditCategories(enable);
    navigateTo(buildAdminUrl("menu", enable ? "categories" : "items"));
  };

  // URL Synchronization effect for Back/Forward and direct URL transitions
  useEffect(() => {
    const syncRouteFromUrl = () => {
      const route = parseCurrentRoute();
      if (route.view === "admin") {
        setActiveTab(route.adminTab);
        if (route.adminTab === "reports") {
          setReportsSubTab(route.reportsSubTab);
        }
        if (route.adminTab === "menu") {
          setInlineEditCategories(route.menuSubTab === "categories");
        }
      }
    };

    // Ensure canonical URL on initial mount
    const initial = parseCurrentRoute();
    if (initial.view === "admin") {
      const canonical = initial.adminTab === "reports" 
        ? buildAdminUrl("reports", initial.reportsSubTab)
        : initial.adminTab === "menu"
        ? buildAdminUrl("menu", initial.menuSubTab)
        : buildAdminUrl(initial.adminTab);
      
      navigateTo(canonical, { replace: true });
    }

    window.addEventListener("popstate", syncRouteFromUrl);
    window.addEventListener("hashchange", syncRouteFromUrl);
    window.addEventListener("app_route_change", syncRouteFromUrl);

    return () => {
      window.removeEventListener("popstate", syncRouteFromUrl);
      window.removeEventListener("hashchange", syncRouteFromUrl);
      window.removeEventListener("app_route_change", syncRouteFromUrl);
    };
  }, []);

  // Modals for ADDING/EDITING COUPON
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Partial<Coupon> | null>(null);

  // Modals for INVENTORY RESTOCK
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(10);

  // User Manual Modal
  const [showManualPreview, setShowManualPreview] = useState(false);

  // Dynamic receipt verification seeder
  const seedVerificationOrders = async () => {
    try {
      const currentOrders = await LocalDB.fetchOrders();

      const orderItems = (count: number) => {
        const itemTemplates = [
          { menuItemId: "i1", name: "Masala Dosa Classic Plain", price: 180 },
          { menuItemId: "i2", name: "Rava Idli Sambar Signature Platter with Coconut Chutney", price: 140 }, // long wrapped name
          { menuItemId: "i3", name: "Filter Coffee", price: 70 },
          { menuItemId: "i4", name: "Paneer Butter Masala Creamy Style", price: 240 },
          { menuItemId: "i5", name: "Butter Naan Tandoori Fresh", price: 50 },
          { menuItemId: "i6", name: "Dal Makhani Double Butter cooked overnight", price: 210 },
          { menuItemId: "i7", name: "Veg Spring Roll Crispy Hot", price: 150 },
          { menuItemId: "i8", name: "Gulab Jamun Sweet Sensation (2 Pcs)", price: 80 }
        ];

        const items: any[] = [];
        let totalItemsAdded = 0;
        let index = 0;

        while (totalItemsAdded < count) {
          const t = itemTemplates[index % itemTemplates.length];
          const remaining = count - totalItemsAdded;
          const qty = Math.min(Math.floor(Math.random() * 3) + 1, remaining);
          items.push({
            menuItemId: t.menuItemId,
            name: `${t.name} (v${index + 1})`,
            price: t.price,
            quantity: qty
          });
          totalItemsAdded += qty;
          index++;
        }
        return items;
      };

      const makeOrder = (itemCount: number, customIdSuffix: string): Order => {
        const items = orderItems(itemCount);
        const subtotal = items.reduce((acc, it) => acc + (it.price * it.quantity), 0);
        const gst = Math.round(subtotal * 0.05); // 5% GST
        const packagingCharge = itemCount > 10 ? 30 : 15;
        const discountAmount = itemCount > 25 ? 50 : 0;
        const grandTotal = subtotal + gst + packagingCharge - discountAmount;

        return {
          id: `SR-VERIFY-${itemCount}-${customIdSuffix}`,
          customerName: `Verify User (${itemCount} Items)`,
          phoneNumber: "+91 9999999999",
          email: "verify@webrajya.com",
          orderType: "dine-in",
          tableNumber: String(Math.floor(Math.random() * 12) + 1),
          items,
          subtotal,
          gst,
          packagingCharge,
          discountAmount,
          appliedCoupon: discountAmount > 0 ? "WELCOME50" : undefined,
          grandTotal,
          paymentStatus: "Paid",
          orderStatus: "New Order",
          createdAt: new Date().toISOString(),
          paymentMethod: "UPI Direct",
          kotNumber: `KOT-V-${itemCount}-${customIdSuffix}`
        };
      };

      const idSuffix = String(Math.floor(Math.random() * 899) + 100);
      const sizes = [1, 5, 15, 30, 50];
      const newSeedOrders = sizes.map(size => makeOrder(size, idSuffix));

      // Append to database
      const updatedOrders = [...newSeedOrders, ...currentOrders];
      await LocalDB.saveOrders(updatedOrders);
      
      // Seed matching KOTs to local database as well so reprints of KOTs work flawlessly
      for (const ord of newSeedOrders) {
        const k: KOT = {
          id: ord.kotNumber!,
          orderId: ord.id,
          tableNumber: ord.tableNumber || "Takeaway",
          customerName: ord.customerName,
          orderType: ord.orderType,
          status: "New Order",
          specialInstructions: "Verification order with dynamic line wrapping and auto-length calculation. Do not drop items.",
          createdAt: ord.createdAt,
          preparationTime: 15,
          printed: false,
          items: ord.items
        };
        const currentKots = await LocalDB.fetchKOTs();
        await LocalDB.saveKOTs([k, ...currentKots]);
      }

      await refreshAllData();
      alert(`Successfully seeded 5 verification orders containing exactly 1, 5, 15, 30, and 50 items!\n\nUse the search or filter in the dispatcher table to see them (with ID prefix "SR-VERIFY-").`);
    } catch (err: any) {
      alert(`Failed to seed verification orders: ${err.message || err}`);
    }
  };

  const handleDownloadUserManual = () => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      // Theme colors
      const primaryColor = [28, 25, 23]; // deep-slate charcoal #1C1917
      const accentColor = [170, 124, 17]; // amber gold #aa7c11
      const secondaryColor = [120, 113, 108]; // soft stone #78716C
      const white = [255, 255, 255];

      let pageNum = 1;
      const margin = 20;
      const pageWidth = 210;
      const pageHeight = 297;
      const contentWidth = pageWidth - (margin * 2);

      // Helper to draw header
      const drawHeader = (title: string) => {
        // Top primary bar
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, 0, pageWidth, 25, "F");

        // Top accent line
        doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.rect(0, 25, pageWidth, 1.5, "F");

        // Title text
        doc.setTextColor(white[0], white[1], white[2]);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(14);
        doc.text("WEBRAJYA POS DIGITAL MENU - STAFF USER MANUAL", margin, 15);

        doc.setFontSize(9);
        doc.setFont("Helvetica", "normal");
        doc.text(title, pageWidth - margin - doc.getTextWidth(title), 15);
      };

      // Helper to draw footer
      const drawFooter = () => {
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(0, pageHeight - 15, pageWidth, 15, "F");

        doc.setFontSize(8);
        doc.setFont("Helvetica", "normal");
        doc.setTextColor(200, 200, 200);
        doc.text("WebRajya POS Portal • Confidential Internal Staff Document", margin, pageHeight - 8);

        const pageStr = `Page ${pageNum}`;
        doc.text(pageStr, pageWidth - margin - doc.getTextWidth(pageStr), pageHeight - 8);
      };

      // --- PAGE 1: TITLE & SYSTEM OVERVIEW ---
      drawHeader("1. SYSTEM OVERVIEW");

      // Title Banner Card
      doc.setFillColor(250, 249, 245); // Warm cream background
      doc.rect(margin, 40, contentWidth, 40, "F");
      doc.setDrawColor(230, 225, 215);
      doc.rect(margin, 40, contentWidth, 40, "S");

      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.setFontSize(18);
      doc.setFont("Helvetica", "bold");
      doc.text("WEBRAJYA POS DIGITAL MENU & POS SYSTEM", margin + 10, 52);

      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFontSize(11);
      doc.setFont("Helvetica", "normal");
      doc.text("Operational & Tactical Manual for Restaurant Front-of-House and Kitchen Staff", margin + 10, 60);
      doc.text("Version 2.4.0 • Highly Encrypted Memory-Sync Service State", margin + 10, 66);

      // Content Block 1
      let y = 95;
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFontSize(14);
      doc.setFont("Helvetica", "bold");
      doc.text("1. Welcome to WebRajya POS Engine", margin, y);
      
      y += 8;
      doc.setFontSize(10);
      doc.setFont("Helvetica", "normal");
      const p1_txt = "The WebRajya POS Digital Menu Portal integrates real-time tableside guest ordering, high-performance kitchen dispatch coordination, and full financial oversight into a single operational workspace. This manual guides restaurant staff in managing the daily lifecycle of menu operations, guest orders, print queues, and system analytics.";
      const p1_lines = doc.splitTextToSize(p1_txt, contentWidth);
      doc.text(p1_lines, margin, y);

      y += (p1_lines.length * 5) + 5;
      doc.setFontSize(12);
      doc.setFont("Helvetica", "bold");
      doc.text("Core System Flow Architecture:", margin, y);

      const steps = [
        { num: "01", title: "Customer Scan", desc: "Guests scan the unique Table QR Code with their smartphones." },
        { num: "02", title: "Self-Ordering", desc: "Guests browse the rich digital menu, add item customizations, and place orders." },
        { num: "03", title: "Instant Notification", desc: "The Admin Control Center receives a live alert and triggers a sound notification." },
        { num: "04", title: "Kitchen Dispatch (KDS)", desc: "The order is routed immediately to the Kitchen Dashboard for preparers." },
        { num: "05", title: "POS Printing", desc: "Staff view print previews, issue thermal receipts, and complete checkouts." }
      ];

      y += 5;
      steps.forEach((step) => {
        y += 4;
        // Step indicator box
        doc.setFillColor(245, 240, 230);
        doc.rect(margin, y - 4, 10, 12, "F");
        doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(11);
        doc.text(step.num, margin + 2.5, y + 4);

        // Title and desc
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFontSize(10);
        doc.setFont("Helvetica", "bold");
        doc.text(step.title, margin + 14, y);
        
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        const step_desc_lines = doc.splitTextToSize(step.desc, contentWidth - 20);
        doc.text(step_desc_lines, margin + 14, y + 4.5);

        y += 10;
      });

      drawFooter();

      // --- PAGE 2: MENU MANAGEMENT ---
      doc.addPage();
      pageNum = 2;
      drawHeader("2. MENU MANAGEMENT");

      y = 40;
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFontSize(14);
      doc.setFont("Helvetica", "bold");
      doc.text("2. Menu Management & Catalog Operations", margin, y);

      y += 8;
      doc.setFontSize(10);
      doc.setFont("Helvetica", "normal");
      const p2_txt = "Keeping your menu catalog accurate is critical to prevent guests from ordering out-of-stock dishes. The Menu Catalog section enables staff to modify prices, toggle food availability, manage tags, and define chef specials in real time.";
      const p2_lines = doc.splitTextToSize(p2_txt, contentWidth);
      doc.text(p2_lines, margin, y);

      y += (p2_lines.length * 5) + 5;
      doc.setFontSize(11);
      doc.setFont("Helvetica", "bold");
      doc.text("Operational Step-by-Step Instructions:", margin, y);

      const menuInstructions = [
        { step: "A. Adding or Editing Items", desc: "Click the 'Menu Catalog' tab on the sidebar. To create a new item, click '+ Deploy New Item'. To edit an existing item, click the pencil 'Edit' icon. Provide the item title, price (INR), category, description, image URL, and food status (e.g. Vegetarian/Vegan tags)." },
        { step: "B. Toggling Instantly in/out of Stock", desc: "Locate the item in the Menu Catalog sheet. Toggle the 'Stock Status' checkbox. When disabled, the item is instantly hidden from the guest self-ordering portal, preventing duplicate orders of depleted dishes." },
        { step: "C. Marking Chef's Specials & Popular Items", desc: "Use the star rating or special indicators in the edit form. Marking an item as 'Chef Special' attaches a premium sparkle badge to it on the mobile menu, encouraging guests to select it." },
        { step: "D. Bulk Menu Import", desc: "To upload complete menus at once, click the 'Bulk Import Excel' option in the catalog. Upload a standardized CSV or Excel sheet with Columns: Name, Price, Category, Description, and Tags to synchronize instantly." }
      ];

      menuInstructions.forEach((inst) => {
        y += 8;
        doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text(inst.step, margin, y);
        
        y += 4.5;
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9.5);
        const inst_lines = doc.splitTextToSize(inst.desc, contentWidth);
        doc.text(inst_lines, margin, y);
        y += (inst_lines.length * 4.5);
      });

      drawFooter();

      // --- PAGE 3: ORDER HANDLING ---
      doc.addPage();
      pageNum = 3;
      drawHeader("3. ORDER HANDLING & LIVE QUEUE");

      y = 40;
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFontSize(14);
      doc.setFont("Helvetica", "bold");
      doc.text("3. Order Lifecycle Handling & Live Queue", margin, y);

      y += 8;
      doc.setFontSize(10);
      doc.setFont("Helvetica", "normal");
      const p3_txt = "The Order Management workspace provides a multi-view operational queue where staff can transition orders from placement to final checkout. Real-time updates sync instantly with the Kitchen Display System (KDS).";
      const p3_lines = doc.splitTextToSize(p3_txt, contentWidth);
      doc.text(p3_lines, margin, y);

      y += (p3_lines.length * 5) + 5;
      doc.setFontSize(11);
      doc.setFont("Helvetica", "bold");
      doc.text("Standard Order State Transitions:", margin, y);

      const states = [
        { state: "1. NEW ORDER (Alert / Pending)", desc: "Triggered instantly upon guest checkout. A gold flashing alert box displays with an audible ding sound. Inspect order details and click 'Accept Order' to dispatch to the kitchen." },
        { state: "2. PREPARING (Kitchen / KDS)", desc: "The order populates on the Kitchen Display System. Chefs view prep timers, special customer instructions, and update prep progress directly on the kitchen monitor." },
        { state: "3. READY FOR SERVING", desc: "Once the kitchen completes cooking, they click 'Mark Ready'. The front-of-house staff receives a visual indicator that the hot food is waiting at the counter." },
        { state: "4. PAID & COMPLETED", desc: "The final step. Staff print the official premium receipt, process payment (UPI/Cash/Card), and close the order, releasing the table floorplan status back to 'Available'." }
      ];

      states.forEach((s) => {
        y += 8;
        doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text(s.state, margin, y);

        y += 4.5;
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9.5);
        const s_lines = doc.splitTextToSize(s.desc, contentWidth);
        doc.text(s_lines, margin, y);
        y += (s_lines.length * 4.5);
      });

      drawFooter();

      // --- PAGE 4: USING PRINT PREVIEW ---
      doc.addPage();
      pageNum = 4;
      drawHeader("4. PRINT PREVIEW & THERMAL RECEIPTER");

      y = 40;
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFontSize(14);
      doc.setFont("Helvetica", "bold");
      doc.text("4. Using the Advanced Print Preview Screen", margin, y);

      y += 8;
      doc.setFontSize(10);
      doc.setFont("Helvetica", "normal");
      const p4_txt = "Our premium POS printer engine generates high-fidelity thermal representations of receipts and kitchen order tickets (KOTs). This ensures legibility for kitchen cooks and a high-end experience for diners.";
      const p4_lines = doc.splitTextToSize(p4_txt, contentWidth);
      doc.text(p4_lines, margin, y);

      y += (p4_lines.length * 5) + 5;
      doc.setFontSize(11);
      doc.setFont("Helvetica", "bold");
      doc.text("Key Printing Capabilities & Controls:", margin, y);

      const printPoints = [
        { title: "Dual Copy Types (Bill vs KOT)", desc: "Choose between 'Kitchen Copy (KOT)' which lists only items and prep customizations in huge bold font, and the 'Customer Bill' which details subtotals, packaging, GST taxes, and final grand totals." },
        { title: "Direct System Print Integration", desc: "Clicking 'Dispatch Print' launches your local operating system print dialog or routes directly to physical USB/Serial POS thermal hardware with paper widths ranging from 58mm to 80mm." },
        { title: "Visual Layout Customizations", desc: "Staff can dynamically adjust font scaling (50% to 150%), customize receipt margins, toggle density (compact vs spacious), and add multiple copies to print duplicates automatically." },
        { title: "Audit Verification Logs", desc: "Every print event is logged with a secure cryptographic sequence in the 'Audit Log Ledger' to track manual re-prints and prevent duplicate billing discrepancies." }
      ];

      printPoints.forEach((p) => {
        y += 8;
        doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text(p.title, margin, y);

        y += 4.5;
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9.5);
        const p_lines = doc.splitTextToSize(p.desc, contentWidth);
        doc.text(p_lines, margin, y);
        y += (p_lines.length * 4.5);
      });

      drawFooter();

      // --- PAGE 5: ADMIN NAVIGATION & AUDITING ---
      doc.addPage();
      pageNum = 5;
      drawHeader("5. NAVIGATION & SYSTEM AUDITING");

      y = 40;
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFontSize(14);
      doc.setFont("Helvetica", "bold");
      doc.text("5. Admin Dashboard Navigation & Audits", margin, y);

      y += 8;
      doc.setFontSize(10);
      doc.setFont("Helvetica", "normal");
      const p5_txt = "The Admin Dashboard is the nerve center of WebRajya POS. Accessible only to verified operating officers, it hosts real-time revenue parameters, customer directories, promotions, and live audit logs.";
      const p5_lines = doc.splitTextToSize(p5_txt, contentWidth);
      doc.text(p5_lines, margin, y);

      y += (p5_lines.length * 5) + 5;
      doc.setFontSize(11);
      doc.setFont("Helvetica", "bold");
      doc.text("Essential Navigation Tabs:", margin, y);

      const tabsInfo = [
        { tab: "• Analytics & Revenue Metrics", desc: "Real-time summary of sales, daily active orders, total guest traffic, and average transaction values." },
        { tab: "• Table Floorplan & Self-Order QR Codes", desc: "Enables deploying new dining tables, setting guest capacities, and downloading high-definition table self-ordering QR codes." },
        { tab: "• Customer & Guest Directory", desc: "A detailed database of customer visits, contact information, total order spending, and review scores." },
        { tab: "• Promo Coupons & Special Discounts", desc: "Allows managers to create promotional campaign codes (e.g. WELCOME20), specify discount rates, and set validity dates." },
        { tab: "• Audit Security Ledger & Supabase Diagnostics", desc: "A tamper-proof ledger of every critical system operation (e.g. logins, stock adjustments, print reprints) synchronized directly to the secure Supabase database." }
      ];

      tabsInfo.forEach((t) => {
        y += 6;
        doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text(t.tab, margin, y);

        y += 4.5;
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9.5);
        const t_lines = doc.splitTextToSize(t.desc, contentWidth);
        doc.text(t_lines, margin, y);
        y += (t_lines.length * 4.5);
      });

      drawFooter();

      // Save the PDF
      doc.save("WebRajya_POS_User_Manual.pdf");
      LocalDB.apiAddAuditLog("Manual Downloaded", "WebRajya POS Staff User Manual downloaded as PDF");
    } catch (err: any) {
      alert("Failed to generate PDF: " + err.message);
    }
  };

  // Load state from server/localStorage on boot and poll periodically
  useEffect(() => {
    refreshAllData();

    // Listen to background checkout events
    const handleNewOrderEvent = (e: Event) => {
      const order = (e as CustomEvent).detail as Order;
      if (order && order.id) {
        setOrders(prev => {
          const exists = prev.some(o => o.id === order.id);
          if (exists) {
            return prev.map(o => o.id === order.id ? order : o);
          }
          return [order, ...prev];
        });

        // Strict filter: ONLY trigger live order notification for genuine Dine-In QR orders
        if (isDineInQrOrder(order)) {
          showLiveOrderNotification(order);
        }
      }
      refreshAllData();
    };

    const handleStorageEvent = () => {
      const localOrds = LocalDB.getOrders();
      setOrders(localOrds);
    };

    window.addEventListener("new_order", handleNewOrderEvent);
    window.addEventListener("storage", handleStorageEvent);
    return () => {
      window.removeEventListener("new_order", handleNewOrderEvent);
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, []);

  // Auto-select first table for preview
  useEffect(() => {
    if (tables.length > 0 && !selectedTableForQr) {
      setSelectedTableForQr(tables[0]);
    }
  }, [tables, selectedTableForQr]);

  const ordersRef = useRef(orders);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const [isRefreshingOrders, setIsRefreshingOrders] = useState(false);

  // Setup initial fetch, Realtime subscription, and fallback polling for cross-session/cross-device synchronicity
  useEffect(() => {
    // 1. Initial direct load on mount (seed deduplication set so historical orders do not alert on page load/refresh)
    LocalDB.fetchOrders().then((initialOrders) => {
      initialOrders.forEach(o => notifiedOrderIdsRef.current.add(o.id));
      setOrders(initialOrders);
    }).catch(() => {});

    // 2. Supabase Realtime channel stream
    const unsubscribeRealtime = LocalDB.subscribeToOrders(async (payload) => {
      if ((import.meta as any).env?.DEV) {
        console.log("[REALTIME EVENT] Triggering instant orders refresh on AdminDashboard:", payload);
      }
      try {
        // Fast-path: Check incoming Realtime INSERT event
        if (payload?.eventType === "INSERT" && payload.new) {
          const rawNew = payload.new;
          if (isDineInQrOrder(rawNew) && !notifiedOrderIdsRef.current.has(rawNew.id)) {
            const parsedItems = Array.isArray(rawNew.items) ? rawNew.items : (typeof rawNew.items === "string" ? JSON.parse(rawNew.items) : []);
            const mappedNewOrder: Order = {
              id: rawNew.id,
              customerName: rawNew.customer_name || "Dine-In Guest",
              phoneNumber: rawNew.phone_number || "",
              email: rawNew.email || "",
              orderType: (rawNew.order_type || "dine-in") as any,
              tableNumber: rawNew.table_number || undefined,
              address: rawNew.address || undefined,
              items: parsedItems,
              subtotal: Number(rawNew.subtotal || 0),
              gst: Number(rawNew.gst || 0),
              packagingCharge: (rawNew.order_type || "").toLowerCase() === "takeaway" ? 0 : Number(rawNew.packaging_charge || 0),
              discountAmount: Number(rawNew.discount_amount || 0),
              grandTotal: Number(rawNew.grand_total || 0),
              paymentStatus: rawNew.payment_status || "Pending",
              orderStatus: rawNew.order_status || "New Order",
              createdAt: rawNew.created_at || new Date().toISOString(),
              paymentMethod: rawNew.payment_method || "Cash on Delivery",
              source: "QR"
            };
            showLiveOrderNotification(mappedNewOrder);
          }
        }

        const freshOrders = await LocalDB.fetchOrders();
        const currentOrders = ordersRef.current;
        const existingIds = new Set(currentOrders.map(o => o.id));
        const newOrders = freshOrders.filter(o => !existingIds.has(o.id));
        
        // Filter ONLY genuine Dine-In QR orders that have not been notified yet
        for (const order of newOrders) {
          if (isDineInQrOrder(order)) {
            showLiveOrderNotification(order);
          }
        }

        setOrders(freshOrders);
      } catch (err) {
        console.warn("[REALTIME EVENT] Background refresh warning:", err);
      }
    });

    // 3. Fallback polling interval every 2.5 seconds
    const pollTimer = setInterval(async () => {
      try {
        const freshOrders = await LocalDB.fetchOrders();
        const currentOrders = ordersRef.current;
        const existingIds = new Set(currentOrders.map(o => o.id));
        const newOrders = freshOrders.filter(o => !existingIds.has(o.id));
        
        // Filter ONLY genuine Dine-In QR orders that have not been notified yet
        for (const order of newOrders) {
          if (isDineInQrOrder(order)) {
            showLiveOrderNotification(order);
          }
        }

        const isDifferent = freshOrders.length !== currentOrders.length ||
          freshOrders.some((fo) => {
            const match = currentOrders.find(co => co.id === fo.id);
            return !match || match.orderStatus !== fo.orderStatus || match.grandTotal !== fo.grandTotal;
          });
        
        if (isDifferent) {
          setOrders(freshOrders);
        }
      } catch (_) {}
    }, 2500);

    // 4. Instant synchronization for local storage and custom table events
    const handleStorageAndTableSync = () => {
      setTables(LocalDB.getTables());
      setOrders(LocalDB.getOrders());
    };
    window.addEventListener("storage", handleStorageAndTableSync);
    window.addEventListener("tables_updated", handleStorageAndTableSync);
    window.addEventListener("table_transferred", handleStorageAndTableSync);

    return () => {
      unsubscribeRealtime();
      clearInterval(pollTimer);
      window.removeEventListener("storage", handleStorageAndTableSync);
      window.removeEventListener("tables_updated", handleStorageAndTableSync);
      window.removeEventListener("table_transferred", handleStorageAndTableSync);
    };
  }, []);

  const refreshAllData = async () => {
    try {
      const ords = await LocalDB.fetchOrders();
      setOrders(ords);
    } catch (_) {
      setOrders(LocalDB.getOrders());
    }
    try {
      const items = await LocalDB.fetchMenuItems();
      setMenuItems(items);
    } catch (_) {
      setMenuItems(LocalDB.getMenuItems());
    }
    try {
      const inv = await LocalDB.fetchInventory();
      setInventory(inv);
    } catch (_) {
      setInventory(LocalDB.getInventory());
    }
    try {
      const cps = await LocalDB.fetchCoupons();
      setCoupons(cps);
    } catch (_) {
      setCoupons(LocalDB.getCoupons());
    }
    try {
      const revs = await LocalDB.fetchReviews();
      setReviews(revs);
    } catch (_) {
      setReviews(LocalDB.getReviews());
    }
    try {
      const sts = await LocalDB.fetchSettings();
      setSettings(sts);
    } catch (_) {
      setSettings(LocalDB.getSettings());
    }
    try {
      const logs = await LocalDB.fetchAuditLogs();
      setAuditLogs(logs);
    } catch (_) {
      setAuditLogs(LocalDB.getAuditLogs());
    }
    try {
      setTables(LocalDB.getTables());
    } catch (_) {
      // safe fallback
    }
    try {
      setCategoriesList(LocalDB.getCategories());
    } catch (_) {
      // safe fallback
    }
  };

  // Keep countdown timer for inactive auto logout
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          LocalDB.addAuditLog("Auto Logout", "Session terminated due to 10 minutes of inactivity", "Secure Gate");
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Reset countdown on active events
    const resetTimer = () => {
      setSecondsRemaining(600);
    };

    const debounceEvents = ["mousedown", "keydown", "scroll", "touchstart"];
    debounceEvents.forEach(evt => window.addEventListener(evt, resetTimer));

    return () => {
      clearInterval(timer);
      debounceEvents.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [onLogout]);

  // Derived settings and stats
  const formatTimeRemaining = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // CALCULATE SECTIONS
  // 1. Orders sub-breakdowns
  const orderStats = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const todayOrders = orders.filter(o => o.createdAt.startsWith(todayStr));
    
    const revenueSum = orders
      .filter(o => o.orderStatus !== "Cancelled")
      .reduce((sum, o) => sum + o.grandTotal, 0);

    const todayRevenue = todayOrders
      .filter(o => o.orderStatus !== "Cancelled")
      .reduce((sum, o) => sum + o.grandTotal, 0);

    return {
      today: todayOrders.length,
      total: orders.length,
      pending: orders.filter(o => o.orderStatus === "New Order").length,
      preparing: orders.filter(o => o.orderStatus === "Preparing").length,
      delivering: orders.filter(o => o.orderStatus === "Out For Delivery").length,
      completed: orders.filter(o => o.orderStatus === "Delivered").length,
      cancelled: orders.filter(o => o.orderStatus === "Cancelled").length,
      revenue: revenueSum,
      todayRevenue: todayRevenue
    };
  }, [orders]);

  // Aggregate Customer Data
  const customerAnalytics = useMemo(() => {
    const groups: { [emailOrPhone: string]: { name: string; phone: string; email: string; totalSpend: number; count: number; lastDate: string } } = {};
    
    orders.forEach(o => {
      const key = o.email || o.phoneNumber || o.customerName;
      if (!groups[key]) {
        groups[key] = {
          name: o.customerName,
          phone: o.phoneNumber,
          email: o.email || "walk-in@webrajya.com",
          totalSpend: 0,
          count: 0,
          lastDate: o.createdAt
        };
      }
      
      if (o.orderStatus !== "Cancelled") {
        groups[key].totalSpend += o.grandTotal;
      }
      groups[key].count += 1;
      if (new Date(o.createdAt) > new Date(groups[key].lastDate)) {
        groups[key].lastDate = o.createdAt;
      }
    });

    return Object.values(groups);
  }, [orders]);

  // Best selling menu items logic
  const bestSellersStats = useMemo(() => {
    const tally: { [id: string]: { name: string; category: string; count: number; earnings: number } } = {};
    orders.forEach(o => {
      if (o.orderStatus !== "Cancelled") {
        o.items.forEach(itm => {
          if (!tally[itm.menuItemId]) {
            tally[itm.menuItemId] = { name: itm.name, category: "All", count: 0, earnings: 0 };
          }
          tally[itm.menuItemId].count += itm.quantity;
          tally[itm.menuItemId].earnings += itm.price * itm.quantity;
        });
      }
    });
    return Object.values(tally).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [orders]);

  // Categories stats
  const categoriesSales = useMemo(() => {
    const data: { [cat: string]: number } = {};
    orders.forEach(o => {
      if (o.orderStatus !== "Cancelled") {
        o.items.forEach(itm => {
          const itemDef = menuItems.find(m => m.id === itm.menuItemId);
          const cat = itemDef?.category || (itm as any).category || "other";
          data[cat] = (data[cat] || 0) + itm.quantity;
        });
      }
    });
    return Object.entries(data).map(([cat, qty]) => ({ name: cat.toUpperCase(), quantity: qty }));
  }, [orders, menuItems]);

  // Low stock inventory alert list
  const lowStockItems = useMemo(() => {
    return inventory.filter(i => i.stock <= i.minAlertLevel);
  }, [inventory]);

  // EXPORT UTILS
  const handleExportCSV = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    LocalDB.addAuditLog("Data Backup Export", `Exported document file: ${filename}.csv`, "Admin");
  };

  const exportCustomersCSV = () => {
    let csv = "Customer Name,Phone Number,Email,Total Spending,Orders Placed,Last Order Date\n";
    customerAnalytics.forEach(c => {
      csv += `"${c.name}","${c.phone}","${c.email}",₹${c.totalSpend},${c.count},"${new Date(c.lastDate).toLocaleDateString()}"\n`;
    });
    handleExportCSV("WebRajya_Customers", csv);
  };

  const exportRevenueCSV = () => {
    let csv = "Order ID,Customer,Amount,Status,Date & Time,Type,Coupon,GST\n";
    orders.forEach(o => {
      csv += `${o.id},"${o.customerName}",₹${o.grandTotal},${o.orderStatus},"${new Date(o.createdAt).toLocaleString()}",${o.orderType},"${o.appliedCoupon || ""}",₹${o.gst}\n`;
    });
    handleExportCSV("WebRajya_RevenueReport", csv);
  };

  // SOUND/CHIME FOR DEVELOPERS
  const triggerReviewChime = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      osc.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.15); // C#5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (_) {}
  };

  // PRINT ACTION WORKBENCH FOR SINGLE THERMAL PRINTER SUPPORT (KOT / Bill / Both)
  const handlePrintAction = async (action: "kot" | "bill" | "both") => {
    if (!showBillPrint) return;
    setIsPrinting(true);
    setPrintError(null);

    try {
      // 1. Fetch KOT list or synthesize a KOT on the fly
      const dbKots = await LocalDB.fetchKOTs();
      let matchedKot = dbKots.find(k => k.orderId === showBillPrint.id);
      if (!matchedKot) {
        matchedKot = {
          id: showBillPrint.kotNumber || `KOT-${showBillPrint.id.replace("SR-", "")}`,
          orderId: showBillPrint.id,
          tableNumber: showBillPrint.tableNumber || "Takeaway",
          customerName: showBillPrint.customerName,
          orderType: showBillPrint.orderType,
          status: "New Order",
          specialInstructions: showBillPrint.items.map(i => i.customization).filter(Boolean).join(", ") || "None",
          createdAt: showBillPrint.createdAt,
          preparationTime: 15,
          items: showBillPrint.items
        };
      }

      const cashierName = "Admin";

      if (action === "kot") {
        await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "kot", "Printing");
        const success = await PhysicalThermalPrinter.printKOT(matchedKot as any, adminPrinterWidth, adminPrinterMode, cashierName);
        if (success) {
          await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "kot", "Printed");
          await LocalDB.apiAddAuditLog("KOT Reprinted", `KOT printed manually for Order: ${showBillPrint.id}`);
        } else {
          await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "kot", "Failed");
          throw new Error("Failed to communicate with the thermal printer interface. Please check USB/Serial connection or use System Fallback.");
        }
      } else if (action === "bill") {
        await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "bill", "Printing");
        const success = await PhysicalThermalPrinter.printBill(showBillPrint, settings, adminPrinterWidth, adminPrinterMode);
        if (success) {
          await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "bill", "Printed");
          await LocalDB.apiAddAuditLog("Receipt Printed", `Bill printed manually for Order: ${showBillPrint.id}`);
        } else {
          await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "bill", "Failed");
          throw new Error("Failed to print Customer Bill. The order remains saved in the database.");
        }
      } else if (action === "both") {
        // Print Both Sequentially with granular database tracking
        await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "kot", "Printing");
        await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "bill", "Pending");
        
        console.log("Printing KOT first...");
        const kotSuccess = await PhysicalThermalPrinter.printKOT(matchedKot as any, adminPrinterWidth, adminPrinterMode, cashierName);
        
        if (!kotSuccess) {
          await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "kot", "Failed");
          await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "bill", "Failed");
          throw new Error("KOT printing failed! Bill printing aborted to prevent raw out-of-order slips.");
        }
        
        await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "kot", "Printed");
        await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "bill", "Printing");
        
        console.log("KOT printed, waiting 1000ms delay for paper feed and cut...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        console.log("Printing Customer Bill...");
        const billSuccess = await PhysicalThermalPrinter.printBill(showBillPrint, settings, adminPrinterWidth, adminPrinterMode);
        
        if (!billSuccess) {
          await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "bill", "Failed");
          throw new Error("KOT printed successfully, but Customer Bill printing failed. The order remains saved in the database.");
        }
        
        await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, "bill", "Printed");
        await LocalDB.apiAddAuditLog("Sequential Print", `KOT & Bill printed sequentially for Order: ${showBillPrint.id}`);
      }
      
      // Update the active order state to reflect the database changes in the current modal instantly
      const updatedOrders = await LocalDB.fetchOrders();
      const match = updatedOrders.find(o => o.id === showBillPrint.id);
      if (match) {
        setShowBillPrint(match);
      }
      await refreshAllData();
    } catch (err: any) {
      console.error(err);
      setPrintError(err.message || "An unexpected printing exception occurred.");
    } finally {
      setIsPrinting(false);
    }
  };

  // OPERATIONS MODIFIERS
  // 1. Order Status Updates
  const updateOrderStatus = async (orderId: string, status: Order["orderStatus"]) => {
    try {
      await LocalDB.apiUpdateOrderStatus(orderId, status);
      await refreshAllData();
      triggerReviewChime();
    } catch (err: any) {
      alert(err.message || "Failed to update status on server.");
    }
  };

  // 2. Menu Item modifications
  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMenuItem?.name || !editingMenuItem?.price) return;

    let updatedList = [...menuItems];
    if (editingMenuItem.id) {
      // Edit mode
      const editedItem: MenuItem = {
        id: editingMenuItem.id,
        itemCode: editingMenuItem.itemCode || `ITEM-${editingMenuItem.id.toUpperCase()}`,
        name: editingMenuItem.name,
        price: Number(editingMenuItem.price),
        category: editingMenuItem.category || "soups",
        description: editingMenuItem.description || "",
        isVeg: editingMenuItem.isVeg !== false,
        isBestseller: !!editingMenuItem.isBestseller,
        isChefSpecial: !!editingMenuItem.isChefSpecial,
        imageUrl: editingMenuItem.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=600",
        spiciness: Number(editingMenuItem.spiciness || 0),
        rating: Number(editingMenuItem.rating || 4.5),
        ratingCount: Number(editingMenuItem.ratingCount || 0)
      };
      updatedList = updatedList.map(item => item.id === editingMenuItem.id ? editedItem : item);
      await LocalDB.apiAddAuditLog("Menu Item Edited", `Pricing/Details modified for dish: ${editingMenuItem.name}`);
    } else {
      // Create mode
      const newItem: MenuItem = {
        id: `s_item_${Date.now()}`,
        itemCode: editingMenuItem.itemCode || `ITEM-S_${Date.now()}`,
        name: editingMenuItem.name,
        price: Number(editingMenuItem.price),
        category: editingMenuItem.category || "soups",
        description: editingMenuItem.description || "",
        isVeg: editingMenuItem.isVeg !== false,
        isBestseller: !!editingMenuItem.isBestseller,
        isChefSpecial: !!editingMenuItem.isChefSpecial,
        imageUrl: editingMenuItem.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=600",
        spiciness: Number(editingMenuItem.spiciness || 0),
        rating: 4.8,
        ratingCount: 15
      };
      updatedList.unshift(newItem);
      await LocalDB.apiAddAuditLog("Menu Item Created", `New dish added: ${newItem.name} (₹${newItem.price})`);
    }

    try {
      await LocalDB.apiSaveMenuItems(updatedList);
      await refreshAllData();
      setShowMenuModal(false);
      setEditingMenuItem(null);
    } catch (err: any) {
      alert("Failed to save menu items: " + err.message);
    }
  };

  const handleDeleteMenuItem = async (itemId: string, itemName: string) => {
    if (window.confirm(`Are you sure you want to permanently delete: ${itemName}?`)) {
      const updated = menuItems.filter(item => item.id !== itemId);
      try {
        await LocalDB.apiSaveMenuItems(updated);
        await LocalDB.apiAddAuditLog("Menu Item Deleted", `Permanently wiped: ${itemName}`);
        await refreshAllData();
      } catch (err: any) {
        alert("Failed to delete menu item: " + err.message);
      }
    }
  };

  // Category modifications
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    const id = newCategoryId.trim() || newCategoryName.trim().toLowerCase().replace(/\s+/g, "-");
    const exists = categoriesList.some(c => c.id === id);
    if (exists) {
      alert("A category with this ID already exists.");
      return;
    }

    const newCat: Category = {
      id,
      name: newCategoryName.trim(),
      icon: newCategoryIcon.trim() || "🍽️",
      description: newCategoryDesc.trim() || "Delicious custom culinary selection"
    };

    const updated = [...categoriesList, newCat];
    LocalDB.saveCategories(updated);
    LocalDB.addAuditLog("Category Created", `New category deployed: ${newCat.name} (${newCat.id})`);
    
    // Reset fields
    setNewCategoryName("");
    setNewCategoryId("");
    setNewCategoryIcon("🍽️");
    setNewCategoryDesc("");
    
    await refreshAllData();
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;

    const updated = categoriesList.map(c => c.id === editingCategory.id ? editingCategory : c);
    LocalDB.saveCategories(updated);
    LocalDB.addAuditLog("Category Updated", `Category details modified: ${editingCategory.name} (${editingCategory.id})`);
    
    setEditingCategory(null);
    await refreshAllData();
  };

  const handleDeleteCategory = async (catId: string, catName: string) => {
    if (window.confirm(`Are you sure you want to permanently delete the category: ${catName}? This will not delete the dishes themselves, but their category filter will fallback to Soups.`)) {
      const updated = categoriesList.filter(c => c.id !== catId);
      LocalDB.saveCategories(updated);
      LocalDB.addAuditLog("Category Deleted", `Permanently wiped category: ${catName} (${catId})`);
      await refreshAllData();
    }
  };

  // 3. Coupon modifications
  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoupon?.code || !editingCoupon?.value) return;

    let list = [...coupons];
    const isEdit = list.some(c => c.code === editingCoupon.code);

    if (isEdit) {
      list = list.map(c => c.code === editingCoupon.code ? (editingCoupon as Coupon) : c);
      await LocalDB.apiAddAuditLog("Coupon Updated", `Code: ${editingCoupon.code} modified parameters`);
    } else {
      const newC: Coupon = {
        code: editingCoupon.code.toUpperCase(),
        type: editingCoupon.type || "percentage",
        value: Number(editingCoupon.value),
        expiryDate: editingCoupon.expiryDate || "2200-12-31",
        cursor: "pointer",
        usageLimit: Number(editingCoupon.usageLimit || 100),
        usageCount: 0,
        minOrderAmount: Number(editingCoupon.minOrderAmount || 0)
      } as any;
      list.unshift(newC);
      await LocalDB.apiAddAuditLog("Coupon Created", `New reward code launched: ${newC.code}`);
    }

    try {
      await LocalDB.apiSaveCoupons(list);
      await refreshAllData();
      setShowCouponModal(false);
      setEditingCoupon(null);
    } catch (err: any) {
      alert("Failed to save coupons: " + err.message);
    }
  };

  const handleDeleteCoupon = async (code: string) => {
    if (window.confirm(`Delete coupon code: ${code}?`)) {
      const updated = coupons.filter(c => c.code !== code);
      try {
        await LocalDB.apiSaveCoupons(updated);
        await LocalDB.apiAddAuditLog("Coupon Suspended", `Deactivated coupon: ${code}`);
        await refreshAllData();
      } catch (err: any) {
        alert("Failed to delete coupon: " + err.message);
      }
    }
  };

  // 4. Inventory restock trigger
  const handleRestockSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInventoryItem) return;

    const updated = inventory.map(item => {
      if (item.id === selectedInventoryItem.id) {
        const newStock = Number(item.stock) + Number(restockAmount);
        return { ...item, stock: newStock, lastRestocked: new Date().toISOString().split("T")[0] };
      }
      return item;
    });

    try {
      await LocalDB.apiSaveInventory(updated);
      await LocalDB.apiAddAuditLog("Inventory Restocked", `Brought in +${restockAmount} ${selectedInventoryItem.unit} of ${selectedInventoryItem.name}`);
      await refreshAllData();
      setShowRestockModal(false);
      setSelectedInventoryItem(null);
    } catch (err: any) {
      alert("Failed to restock layout: " + err.message);
    }
  };

  // 5. Review Approvals
  const toggleReviewApproval = async (reviewId: string, currentStatus: boolean) => {
    const updated = reviews.map(r => r.id === reviewId ? { ...r, approved: !currentStatus } : r);
    try {
      await LocalDB.apiSaveReviews(updated);
      await LocalDB.apiAddAuditLog("Review Moderated", `Approved status toggled for review #${reviewId}`);
      await refreshAllData();
      triggerReviewChime();
    } catch (err: any) {
      alert("Failed to alter review approval: " + err.message);
    }
  };

  const toggleReviewFeatured = async (reviewId: string, currentFeatured: boolean) => {
    const updated = reviews.map(r => r.id === reviewId ? { ...r, featured: !currentFeatured } : r);
    try {
      await LocalDB.apiSaveReviews(updated);
      await LocalDB.apiAddAuditLog("Review Moderated", `Featured tag toggled for review ${reviewId}`);
      await refreshAllData();
      triggerReviewChime();
    } catch (err: any) {
      alert("Failed to feature review: " + err.message);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (window.confirm("Permanently wipe this review from Guest book?")) {
      const updated = reviews.filter(r => r.id !== reviewId);
      try {
        await LocalDB.apiSaveReviews(updated);
        await LocalDB.apiAddAuditLog("Review Deleted", `Wiped review ledger id ${reviewId}`);
        await refreshAllData();
      } catch (err: any) {
        alert("Failed to delete review: " + err.message);
      }
    }
  };

  // 6. Settings Updates
  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await LocalDB.apiSaveSettings(settings);
      await LocalDB.apiAddAuditLog("Settings Adjusted", `Restaurant operating variables and double-sided thermal parameters synchronized`);
      await refreshAllData();
      alert("WebRajya POS Settings Saved successfully. Your public footer, bill print templates, and double-sided settings are updated in real time!");
    } catch (err: any) {
      alert("Failed to save settings: " + err.message);
    }
  };

  // Outlet CRUD Handlers
  const handleSaveOutlet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!outletForm.name.trim() || !outletForm.address.trim()) return;

    const currentOutlets = settings.outlets && settings.outlets.length > 0 ? [...settings.outlets] : [...defaultOutlets];
    
    if (editingOutletIndex !== null) {
      currentOutlets[editingOutletIndex] = {
        id: currentOutlets[editingOutletIndex]?.id || `outlet-${Date.now()}`,
        name: outletForm.name.trim(),
        address: outletForm.address.trim(),
        contactNumber: outletForm.contactNumber.trim()
      };
    } else {
      currentOutlets.push({
        id: `outlet-${Date.now()}`,
        name: outletForm.name.trim(),
        address: outletForm.address.trim(),
        contactNumber: outletForm.contactNumber.trim()
      });
    }

    setSettings({ ...settings, outlets: currentOutlets });
    setShowAddOutletModal(false);
    setEditingOutletIndex(null);
    setOutletForm({ name: "", address: "", contactNumber: "" });
  };

  const handleEditOutlet = (index: number) => {
    const currentOutlets = settings.outlets && settings.outlets.length > 0 ? settings.outlets : defaultOutlets;
    const item = currentOutlets[index];
    if (item) {
      setOutletForm({
        name: item.name,
        address: item.address,
        contactNumber: item.contactNumber
      });
      setEditingOutletIndex(index);
      setShowAddOutletModal(true);
    }
  };

  const handleDeleteOutlet = (index: number) => {
    const currentOutlets = settings.outlets && settings.outlets.length > 0 ? [...settings.outlets] : [...defaultOutlets];
    currentOutlets.splice(index, 1);
    setSettings({ ...settings, outlets: currentOutlets });
  };

  const handleRestoreDefaultOutlets = () => {
    if (window.confirm("Restore default 5 branch outlets?")) {
      setSettings({ ...settings, outlets: [...defaultOutlets] });
    }
  };

  // Terms & Conditions CRUD Handlers
  const handleAddTerm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTermInput.trim()) return;
    const currentTerms = settings.termsAndConditions && settings.termsAndConditions.length > 0 ? [...settings.termsAndConditions] : [...defaultTermsAndConditions];
    currentTerms.push(newTermInput.trim());
    setSettings({ ...settings, termsAndConditions: currentTerms });
    setNewTermInput("");
  };

  const handleSaveEditedTerm = (index: number) => {
    if (!editingTermInput.trim()) return;
    const currentTerms = settings.termsAndConditions && settings.termsAndConditions.length > 0 ? [...settings.termsAndConditions] : [...defaultTermsAndConditions];
    currentTerms[index] = editingTermInput.trim();
    setSettings({ ...settings, termsAndConditions: currentTerms });
    setEditingTermIndex(null);
    setEditingTermInput("");
  };

  const handleDeleteTerm = (index: number) => {
    const currentTerms = settings.termsAndConditions && settings.termsAndConditions.length > 0 ? [...settings.termsAndConditions] : [...defaultTermsAndConditions];
    currentTerms.splice(index, 1);
    setSettings({ ...settings, termsAndConditions: currentTerms });
  };

  const handleRestoreDefaultTerms = () => {
    if (window.confirm("Restore default terms and conditions?")) {
      setSettings({ ...settings, termsAndConditions: [...defaultTermsAndConditions] });
    }
  };


  // 7. Table QR Management Handlers
  const handleAddTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNo) return;
    
    // Check if tableNumber already exists
    if (tables.some(t => t.tableNumber === newTableNo)) {
      alert(`Table ${newTableNo} already exists! Please use a unique number.`);
      return;
    }

    const newTbl: RestaurantTable = {
      id: `tbl-${Date.now()}`,
      tableNumber: newTableNo,
      capacity: newCapacity,
      seatingArea: newArea,
      status: "Available"
    };

    const updated = [...tables, newTbl];
    LocalDB.saveTables(updated);
    setTables(updated);
    setSelectedTableForQr(newTbl);
    
    // Reset fields
    setNewTableNo("");
    setNewCapacity(4);
    setShowAddTable(false);

    try {
      LocalDB.addAuditLog("Table Created", `Added restaurant Table #${newTbl.tableNumber} with capacity of ${newTbl.capacity}`, "Admin Panel");
    } catch (_) {
      // safe fallback if addAuditLog differs
    }
  };

  const handleUpdateTableStatus = (tableId: string, status: "Available" | "Occupied" | "Reserved" | "Service Required") => {
    const updated = tables.map(t => t.id === tableId ? { ...t, status } : t as any);
    LocalDB.saveTables(updated);
    setTables(updated);
    if (selectedTableForQr?.id === tableId) {
      setSelectedTableForQr({ ...selectedTableForQr, status });
    }
    try {
      LocalDB.addAuditLog("Table Status Updated", `Updated Table ID ${tableId} status to ${status}`, "Admin Panel");
    } catch (_) {
      // safe fallback
    }
  };

  const handleDeleteTable = (tableId: string) => {
    const tableToDelete = tables.find(t => t.id === tableId);
    if (!tableToDelete) return;
    if (!confirm(`Are you sure you want to delete Table #${tableToDelete.tableNumber}?`)) return;

    const updated = tables.filter(t => t.id !== tableId);
    LocalDB.saveTables(updated);
    setTables(updated);
    
    if (selectedTableForQr?.id === tableId) {
      setSelectedTableForQr(updated[0] || null);
    }
    try {
      LocalDB.addAuditLog("Table Deleted", `Removed Table #${tableToDelete.tableNumber} from table list`, "Admin Panel");
    } catch (_) {
      // safe fallback
    }
  };

  // INTERACTIVE FILTERS
  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesStatus = orderFilter === "All" || o.orderStatus === orderFilter;
      const term = orderSearch.toLowerCase();
      const matchesSearch = !term || 
        o.customerName.toLowerCase().includes(term) ||
        o.id.toLowerCase().includes(term) ||
        o.phoneNumber.includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [orders, orderFilter, orderSearch]);

  // Filtered history orders list
  const filteredHistoryOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesStatus = historyFilterStatus === "All" || o.orderStatus === historyFilterStatus;
      const matchesType = historyFilterType === "All" || o.orderType === historyFilterType;
      const term = historySearch.toLowerCase();
      const matchesSearch = !term || 
        o.customerName.toLowerCase().includes(term) ||
        o.id.toLowerCase().includes(term) ||
        o.phoneNumber.includes(term);
      return matchesStatus && matchesType && matchesSearch;
    });
  }, [orders, historyFilterStatus, historyFilterType, historySearch]);

  // Filtered menu items
  const filteredMenuItems = useMemo(() => {
    const items = menuItems.filter(item => {
      const categoryMatch = menuFilterCategory === "All" || item.category === menuFilterCategory;
      const query = menuSearch.toLowerCase();
      const searchMatch = !query || 
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);
      return categoryMatch && searchMatch;
    });
    console.log(`[Admin Cards Render Log] Rendering ${items.length} cards in Admin Menu Catalog tab.`);
    return items;
  }, [menuItems, menuFilterCategory, menuSearch]);

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-stone-850 flex flex-col font-sans select-none overflow-hidden" id="admin-hub-system">
      
      {/* Dynamic Floating Global Alerts for New Orders */}
      <div className="fixed top-5 right-5 z-50 space-y-3 max-w-sm w-full font-sans">
        <AnimatePresence>
          {activeAlerts.map((alertItem) => (
            <motion.div
              key={alertItem.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              className="bg-white border border-stone-200 p-5 rounded-2xl shadow-2xl text-stone-900 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1.5 h-full bg-[#aa7c11]" />
              <div className="flex justify-between items-start mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping" />
                  <span className="text-xs font-mono text-[#aa7c11] font-semibold">🚨 LIVE ORDER RECEIVED</span>
                </div>
                <button 
                  onClick={() => setActiveAlerts(prev => prev.filter(a => a.id !== alertItem.id))}
                  className="text-stone-400 hover:text-stone-850 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <h4 className="text-sm font-semibold truncate leading-tight font-sans">{alertItem.customerName}</h4>
              <p className="text-xs text-stone-500 mt-1">Placed order {alertItem.id} worth <strong className="text-stone-900">₹{alertItem.grandTotal}</strong></p>
              <div className="mt-3.5 flex gap-2">
                <button
                  onClick={() => {
                    setSelectedOrderDetails(alertItem);
                    setActiveAlerts(prev => prev.filter(a => a.id !== alertItem.id));
                  }}
                  className="px-3.5 py-1.5 bg-[#aa7c11] text-white font-semibold text-[10px] rounded-lg tracking-wider uppercase hover:bg-[#aa7c11]/90 cursor-pointer"
                >
                  Inspect details
                </button>
                <button
                  onClick={() => {
                    updateOrderStatus(alertItem.id, "Accepted");
                    setActiveAlerts(prev => prev.filter(a => a.id !== alertItem.id));
                  }}
                  className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold text-[10px] rounded-lg tracking-wider uppercase border border-stone-200 cursor-pointer"
                >
                  Accept Order
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Top Professional Control Strip */}
      <header className="bg-white border-b border-stone-200/80 py-2.5 md:py-3.5 px-4 md:px-6 flex items-center justify-between relative z-30 shadow-xs">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-stone-50 to-stone-100 border border-stone-200 rounded-lg md:rounded-xl flex items-center justify-center text-[#aa7c11] flex-shrink-0">
            <ShieldCheck className="w-4.5 h-4.5 md:w-5.5 md:h-5.5" />
          </div>
          <div>
            <h1 className="text-xs md:text-sm font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1">
              <span className="hidden sm:inline">WebRajya POS</span> <span className="sm:hidden inline">WR</span> <span className="text-[#aa7c11]">Admin</span>
              <span className="text-[8px] md:text-[9px] font-mono text-[#aa7c11] bg-amber-50 border border-amber-250/50 px-1 md:px-1.5 py-0.2 md:py-0.5 rounded font-bold">PRO</span>
            </h1>
            <p className="text-[8px] md:text-[10px] text-stone-400 font-mono tracking-wide uppercase mt-0.5">Control Center</p>
          </div>
        </div>

        {/* Diagnostic controls, staff profile and countdown */}
        <div className="flex items-center gap-2 md:gap-3 text-xs font-mono">
          {/* Authenticated User Profile Badge */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-left">
            <div className="w-6 h-6 rounded-lg bg-amber-100 text-[#aa7c11] flex items-center justify-center font-bold text-[10px] shrink-0 border border-amber-200">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="hidden sm:block">
              <div className="text-[11px] font-bold text-stone-900 leading-tight">
                {activeStaff.name || "Owner"}
              </div>
              <div className="text-[9px] text-stone-500 font-mono">
                <span className="font-semibold text-[#aa7c11]">{activeStaff.role || "Owner"}</span>
              </div>
            </div>
          </div>

          {/* Sound settings */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 md:p-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg text-stone-500 hover:text-stone-950 transition-colors cursor-pointer"
            title={soundEnabled ? "Disable audio alerts" : "Enable audio alerts"}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#aa7c11]" /> : <VolumeX className="w-3.5 h-3.5 md:w-4 md:h-4 text-stone-400" />}
          </button>

          <button
            onClick={() => {
              LocalDB.addAuditLog("Admin Logout", "Authorized admin logout triggered manually", "Admin");
              onLogout();
            }}
            className="p-1.5 md:px-3.5 md:py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-lg transition-colors flex items-center gap-1 cursor-pointer font-bold"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Grid Work Space */}
      <div className="flex-grow flex flex-col lg:flex-row overflow-hidden">
        
        {/* Sidebar Nav rail */}
        <aside className="w-56 xl:w-60 bg-white border-r border-stone-200/80 hidden lg:flex flex-col p-3 xl:p-4 justify-between flex-shrink-0 overflow-y-auto">
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono text-stone-400 tracking-widest uppercase pl-3.5 mb-1.5">OPERATIONS</p>
            <SidebarBtn icon={<BarChart3 />} label="Dashboard" active={activeTab === "analytics"} onClick={() => handleTabSelect("analytics")} />
            <SidebarBtn icon={<Calculator />} label="POS Billing" active={activeTab === "pos"} onClick={() => handleTabSelect("pos")} />
            <SidebarBtn icon={<ShoppingCart />} label="Orders & History" active={activeTab === "orders" || activeTab === "history"} count={orders.filter(o => o.orderStatus === "New Order").length} onClick={() => handleTabSelect("orders")} />
            <SidebarBtn icon={<QrCode />} label="Tables & QR Codes" active={activeTab === "tables"} onClick={() => handleTabSelect("tables")} />
            
            <p className="text-[10px] font-mono text-stone-400 tracking-widest uppercase pl-3.5 pt-4 mb-1.5">MENU</p>
            <SidebarBtn icon={<Utensils />} label="Menu Management" active={activeTab === "menu"} onClick={() => handleTabSelect("menu")} />
            
            <p className="text-[10px] font-mono text-stone-400 tracking-widest uppercase pl-3.5 pt-4 mb-1.5">BUSINESS</p>
            <SidebarBtn icon={<TrendingUp />} label="Sales & Reports" active={activeTab === "reports"} onClick={() => handleTabSelect("reports")} />
            <SidebarBtn icon={<PieChart />} label="Analytics" active={activeTab === "analytics"} onClick={() => handleTabSelect("analytics")} />

            <p className="text-[10px] font-mono text-stone-400 tracking-widest uppercase pl-3.5 pt-4 mb-1.5">SYSTEM</p>
            <SidebarBtn icon={<Printer />} label="Printers" active={activeTab === "printers"} onClick={() => handleTabSelect("printers")} />
            <SidebarBtn icon={<Settings />} label="Settings" active={activeTab === "settings"} onClick={() => handleTabSelect("settings")} />
          </div>

          {/* Quick legal credentials */}
          <div className="bg-stone-50 p-3 rounded-xl border border-stone-250/30 text-[9px] font-mono text-stone-500 space-y-1">
            <p className="text-[#aa7c11] font-bold uppercase text-[9px] tracking-widest">WEBRAJYA POS BASE</p>
            <p>Version: Clean Base 1.0</p>
            <p>Session State: Memory-Sync</p>
            <p>IP Address: 127.0.0.1</p>
          </div>
        </aside>

        {/* Small screen mobile dropdown select terminal */}
        <div className="lg:hidden bg-stone-50/50 px-4 py-2.5 border-b border-stone-200 select-none flex-shrink-0 z-20">
          <div className="flex items-center justify-between bg-white border border-stone-200/90 shadow-[0_2px_10px_rgba(40,30,10,0.01)] rounded-xl p-2">
            <div className="flex items-center gap-2">
              <span className="text-[#aa7c11] bg-amber-50 p-1.5 rounded-lg border border-amber-100 flex items-center justify-center">
                {activeTab === "analytics" && <BarChart3 className="w-4 h-4" />}
                {activeTab === "reports" && <TrendingUp className="w-4 h-4" />}
                {activeTab === "pos" && <Calculator className="w-4 h-4" />}
                {activeTab === "orders" && <ShoppingCart className="w-4 h-4" />}
                {activeTab === "history" && <History className="w-4 h-4" />}
                {activeTab === "menu" && <Utensils className="w-4 h-4" />}
                {activeTab === "settings" && <Settings className="w-4 h-4" />}
                {activeTab === "printers" && <Printer className="w-4 h-4" />}
                {activeTab === "kitchen" && <Utensils className="w-4 h-4" />}
                {activeTab === "tables" && <QrCode className="w-4 h-4" />}
                {activeTab === "supabase" && <Activity className="w-4 h-4" />}
              </span>
              <div>
                <span className="text-[8px] text-stone-400 font-mono uppercase block leading-none">CURRENT BOARD</span>
                <span className="text-xs font-bold text-[#2a2a2a] uppercase font-sans tracking-wide">
                  {activeTab === "analytics" && "Dashboard"}
                  {activeTab === "reports" && "Sales & Performance Reports"}
                  {activeTab === "pos" && "POS Billing Portal"}
                  {activeTab === "orders" && `Orders Queue (${orders.filter(o => o.orderStatus === "New Order").length})`}
                  {activeTab === "history" && "Past Order History"}
                  {activeTab === "menu" && "Menu Management"}
                  {activeTab === "settings" && "Portal Settings"}
                  {activeTab === "printers" && "Printers Manager"}
                  {activeTab === "kitchen" && "Kitchen Tickets (KDS)"}
                  {activeTab === "tables" && "Tables & QR Codes"}
                  {activeTab === "supabase" && "Supabase Diagnostics"}
                </span>
              </div>
            </div>
            
            <button 
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-[10px] bg-stone-900 hover:bg-stone-850 text-white font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold cursor-pointer transition-all border border-stone-900"
            >
              <span>{isMobileMenuOpen ? "CLOSE" : "MENU"}</span>
              <span className="text-[8px]">{isMobileMenuOpen ? "▲" : "▼"}</span>
            </button>
          </div>

          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mt-1.5"
              >
                <div className="bg-white p-2.5 rounded-xl border border-stone-200/95 grid grid-cols-2 sm:grid-cols-3 gap-2 shadow-lg max-h-56 overflow-y-auto">
                  <MobileGridBtn id="analytics" label="Dashboard" active={activeTab === "analytics"} icon={<BarChart3 />} onClick={() => { handleTabSelect("analytics"); setIsMobileMenuOpen(false); }} />
                  <MobileGridBtn id="pos" label="POS Desk" active={activeTab === "pos"} icon={<Calculator />} onClick={() => { handleTabSelect("pos"); setIsMobileMenuOpen(false); }} />
                  <MobileGridBtn id="orders" label="Orders Queue" active={activeTab === "orders" || activeTab === "history"} icon={<ShoppingCart />} count={orders.filter(o => o.orderStatus === "New Order").length} onClick={() => { handleTabSelect("orders"); setIsMobileMenuOpen(false); }} />
                  <MobileGridBtn id="tables" label="Tables & QR" active={activeTab === "tables"} icon={<QrCode />} onClick={() => { handleTabSelect("tables"); setIsMobileMenuOpen(false); }} />
                  <MobileGridBtn id="menu" label="Menu" active={activeTab === "menu"} icon={<Utensils />} onClick={() => { handleTabSelect("menu"); setIsMobileMenuOpen(false); }} />
                  <MobileGridBtn id="reports" label="Sales Reports" active={activeTab === "reports"} icon={<TrendingUp />} onClick={() => { handleTabSelect("reports"); setIsMobileMenuOpen(false); }} />
                  <MobileGridBtn id="printers" label="Printers" active={activeTab === "printers"} icon={<Printer />} onClick={() => { handleTabSelect("printers"); setIsMobileMenuOpen(false); }} />
                  <MobileGridBtn id="settings" label="Settings" active={activeTab === "settings"} icon={<Settings />} onClick={() => { handleTabSelect("settings"); setIsMobileMenuOpen(false); }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Core Main Sheet Content Scroll area */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5 bg-[#FAF9F5]">
          <div className={`mx-auto ${activeTab === "pos" ? "max-w-[1680px] w-full space-y-3 sm:space-y-4" : "max-w-6xl w-full space-y-6"}`}>

            {/* TAB CONTENT: ANALYTICS DASHBOARD OVERVIEW */}
            {activeTab === "analytics" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                
                {/* Header title */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-amber-100 text-[#aa7c11] border border-amber-300/40 rounded-full text-[9px] font-mono font-extrabold uppercase tracking-widest">WEBRAJYA POS</span>
                      <span className="text-[10px] font-mono text-stone-400">Live Operating Center</span>
                    </div>
                    <h2 className="text-xl font-serif font-bold text-stone-900 uppercase tracking-wider">ADMIN DASHBOARD</h2>
                    <p className="text-xs text-stone-500">Real-time restaurant performance metrics, revenue summary, and active order dispatcher.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTabSelect("reports")}
                    className="px-4 py-2.5 bg-[#d4af37] hover:bg-[#aa7c11] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer self-start sm:self-auto"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Open Sales Reports
                  </button>
                </div>

                {/* 6 KPI Cards Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                  <AnalyticsStatCard title="Today's Orders" count={orderStats.today} change="Daily order total" />
                  <AnalyticsStatCard title="Today's Sales" count={`₹${orderStats.todayRevenue.toLocaleString()}`} change="Gross daily sales" highlight={true} />
                  <AnalyticsStatCard title="Pending Orders" count={orderStats.pending} change="Awaiting confirmation" badgeColor="bg-amber-50 text-amber-700" />
                  <AnalyticsStatCard title="Preparing Orders" count={orderStats.preparing} change="Kitchen cooking active" badgeColor="bg-blue-50 text-blue-600" />
                  <AnalyticsStatCard title="Completed Orders" count={orderStats.completed} change="Fulfilling completed" badgeColor="bg-green-50 text-green-600" />
                  <AnalyticsStatCard title="Cancelled / Refunded" count={orderStats.cancelled} change="Voided transactions" badgeColor="bg-red-50 text-red-600" />
                </div>

                {/* Recent Orders Table */}
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-xs space-y-4 p-5">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div>
                      <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wider">Recent Orders</h3>
                      <p className="text-[11px] text-stone-500">Latest transactions and active dining sessions.</p>
                    </div>
                    <button
                      onClick={() => handleTabSelect("orders")}
                      className="text-xs font-bold text-[#aa7c11] hover:text-[#C67C4E] uppercase tracking-wider cursor-pointer flex items-center gap-1"
                    >
                      <span>View All Queue</span>
                      <span>→</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-sans text-xs">
                      <thead>
                        <tr className="bg-stone-50 text-stone-500 text-[10px] uppercase tracking-wider font-mono border-b border-stone-200">
                          <th className="p-3">Order ID</th>
                          <th className="p-3">Type / Table</th>
                          <th className="p-3">Customer</th>
                          <th className="p-3">Items</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Grand Total</th>
                          <th className="p-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 text-stone-700">
                        {orders.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-stone-400 font-mono text-xs">
                              No recent orders recorded yet. Open POS Billing to start taking orders!
                            </td>
                          </tr>
                        ) : (
                          orders.slice(0, 8).map((order) => (
                            <tr key={order.id} className="hover:bg-stone-50/60 transition-colors">
                              <td className="p-3 font-mono font-bold text-stone-900">#{order.id.slice(0, 8)}</td>
                              <td className="p-3 font-mono text-xs">{order.orderType === "Dine-In" ? `Table ${order.tableNo || "-"}` : order.orderType}</td>
                              <td className="p-3 font-medium">{order.customerName || "Walk-In Guest"}</td>
                              <td className="p-3 font-mono">{order.items?.length || 0} items</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono uppercase ${
                                  order.orderStatus === "Completed" || order.orderStatus === "Delivered" ? "bg-green-50 text-green-700 border border-green-200" :
                                  order.orderStatus === "Preparing" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                                  order.orderStatus === "New Order" ? "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse" :
                                  order.orderStatus === "Cancelled" ? "bg-red-50 text-red-600 border border-red-200" :
                                  "bg-stone-100 text-stone-600"
                                }`}>
                                  {order.orderStatus}
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-stone-900">₹{order.grandTotal}</td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => setSelectedOrderDetails(order)}
                                  className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-[10px] font-bold uppercase transition-colors cursor-pointer"
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </motion.div>
            )}

            {/* TAB CONTENT: SALES & PERFORMANCE REPORTS */}
            {activeTab === "reports" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <ReportsDashboard
                  orders={orders}
                  menuItems={menuItems}
                  categories={categoriesList}
                  initialSubTab={reportsSubTab}
                  onSubTabChange={handleReportsSubTabChange}
                  onRefreshOrders={async () => {
                    const fresh = await LocalDB.fetchOrders();
                    setOrders(fresh);
                  }}
                />
              </motion.div>
            )}

            {/* TAB CONTENT: POS BILLING PORTAL */}
            {activeTab === "pos" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 sm:space-y-4">
                <PosBillingPortal
                  menuItems={menuItems}
                  orders={orders}
                  tables={tables}
                  settings={settings}
                  coupons={coupons}
                  onOrderPlaced={() => {
                    setOrders(LocalDB.getOrders());
                  }}
                  setShowBillPrint={(order) => {
                    setShowBillPrint(order);
                  }}
                />
              </motion.div>
            )}

            {/* TAB CONTENT: ORDERS & HISTORY LIST */}
            {activeTab === "orders" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                
                {/* Header title */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-serif font-bold text-stone-900 uppercase tracking-wider">Orders & History</h2>
                      <button
                        onClick={async () => {
                          setIsRefreshingOrders(true);
                          try {
                            const fresh = await LocalDB.fetchOrders();
                            setOrders(fresh);
                          } finally {
                            setTimeout(() => setIsRefreshingOrders(false), 500);
                          }
                        }}
                        disabled={isRefreshingOrders}
                        className="flex items-center gap-1.5 px-3 py-1 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-[10px] font-bold font-sans transition-all shadow-sm select-none cursor-pointer uppercase tracking-wider disabled:opacity-50"
                        title="Force reload orders directly from Supabase database."
                      >
                        <RefreshCw className={`w-3 h-3 ${isRefreshingOrders ? "animate-spin" : ""}`} />
                        {isRefreshingOrders ? "Fetching..." : "Refresh Orders"}
                      </button>
                    </div>
                    <p className="text-xs text-stone-500">View customer orders and reprint thermal receipts and kitchen order tickets.</p>
                  </div>
                </div>

                {/* Search bar inside orders */}
                <div className="relative group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 group-focus-within:text-[#d4af37] transition-colors" />
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Search by ID, guest name, or telephone number..."
                    className="w-full bg-white border border-stone-200 pl-11 pr-4 py-2.5 text-xs rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-[#d4af37] font-mono shadow-xs"
                  />
                </div>

                {/* Main Orders ledger list Table */}
                <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse font-sans text-xs">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-left text-[10px]">
                          <th className="p-3.5">ID</th>
                          <th className="p-3.5">Client & Contact</th>
                          <th className="p-3.5">Mode</th>
                          <th className="p-3.5">Billing Sum</th>
                          <th className="p-3.5">Status</th>
                          <th className="p-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 text-stone-700">
                        {filteredOrders.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-10 text-center text-stone-400 font-light font-sans">
                              No customer order records match search query.
                            </td>
                          </tr>
                        ) : (
                          filteredOrders.map((o) => (
                            <tr key={o.id} className="hover:bg-stone-50/40 transition-colors">
                              <td className="p-3.5 font-bold text-stone-900 text-xs font-mono">{o.id}</td>
                              <td className="p-3.5 space-y-0.5">
                                <div className="font-semibold text-stone-900 font-sans">{o.customerName}</div>
                                <div className="text-stone-400 text-[11px] font-mono">{o.phoneNumber}</div>
                              </td>
                              <td className="p-3.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  o.orderType === "dine-in" ? "bg-teal-50 text-teal-700 border border-teal-100" :
                                  o.orderType === "takeaway" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                                  "bg-blue-50 text-blue-700 border border-blue-105"
                                }`}>
                                  {o.orderType} {o.tableNumber ? `(T-${o.tableNumber})` : ""}
                                </span>
                              </td>
                              <td className="p-3.5 text-xs text-[#C67C4E] font-bold">₹{o.grandTotal}</td>
                              <td className="p-3.5">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase">
                                  ORDER PLACED
                                </span>
                              </td>
                              <td className="p-3.5 text-right flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setSelectedOrderDetails(o)}
                                  className="px-2.5 py-1 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded text-stone-700 text-[10px] font-bold uppercase cursor-pointer flex items-center gap-1"
                                  title="Inspect full order details"
                                >
                                  <Info className="w-3 h-3 text-stone-500" />
                                  <span>View</span>
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      await PhysicalThermalPrinter.printCombinedBillAndKOT(o, settings, "native");
                                      alert(`Bill & KOT for Order #${o.id} sent to thermal printer.`);
                                    } catch (err: any) {
                                      alert(`Thermal printer error: ${err.message || err}`);
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-bold uppercase cursor-pointer flex items-center gap-1 shadow-xs"
                                  title="Print Bill + ESC/POS Cut + KOT via JSPrintManager"
                                >
                                  <Printer className="w-3 h-3 text-white" />
                                  <span>Print</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </motion.div>
            )}

            {/* TAB CONTENT: ORDER HISTORY SECTION */}
            {activeTab === "history" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                
                {/* Header title */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                        <History className="w-5 h-5 text-[#aa7c11]" />
                        Past Customer Order History
                      </h2>
                    </div>
                    <p className="text-xs text-stone-500">
                      Query, search, and audit past customer order receipts, timestamps, and itemized billing structures.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await refreshAllData();
                        LocalDB.addAuditLog("Order History Refresh", "Manually pulled fresh order logs from database.", "Admin");
                      }}
                      className="px-4 py-2 bg-stone-900 hover:bg-stone-850 text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm border border-stone-900"
                    >
                      <Activity className="w-4 h-4 text-[#d4af37] animate-pulse" />
                      Sync Cloud Database
                    </button>
                  </div>
                </div>

                {/* Filter and Search Bar Dashboard Controls */}
                <div className="bg-white border border-stone-200/85 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Search query field */}
                    <div className="relative group md:col-span-1">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 group-focus-within:text-[#d4af37] transition-colors" />
                      <input
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search ID, customer name, phone..."
                        className="w-full bg-white border border-stone-200 pl-11 pr-4 py-2.5 text-xs rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-[#d4af37] font-mono shadow-xs"
                      />
                    </div>

                    {/* Status filter dropdown/selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono">Filter by Status</label>
                      <div className="flex flex-wrap gap-1">
                        {["All", "Delivered", "Cancelled", "New Order", "Preparing"].map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setHistoryFilterStatus(status)}
                            className={`text-[10px] px-2.5 py-1.5 rounded-lg border font-bold transition-all cursor-pointer ${
                              historyFilterStatus === status
                                ? "bg-[#d4af37] border-[#d4af37] text-white"
                                : "bg-white hover:bg-stone-50 border-stone-200 text-stone-500 hover:text-stone-850"
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Order type filter */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-mono">Filter by Service Type</label>
                      <div className="flex flex-wrap gap-1">
                        {["All", "dine-in", "takeaway", "delivery"].map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setHistoryFilterType(type)}
                            className={`text-[10px] px-2.5 py-1.5 rounded-lg border font-bold transition-all cursor-pointer uppercase ${
                              historyFilterType === type
                                ? "bg-[#d4af37] border-[#d4af37] text-white"
                                : "bg-white hover:bg-stone-50 border-stone-200 text-stone-500 hover:text-stone-850"
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Orders History Ledger Table */}
                <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse font-sans text-xs">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-left text-[10px]">
                          <th className="p-3.5">ID</th>
                          <th className="p-3.5">Timestamp</th>
                          <th className="p-3.5">Customer & Contacts</th>
                          <th className="p-3.5">Type & Channel</th>
                          <th className="p-3.5">Culinary Items</th>
                          <th className="p-3.5">Grand Total</th>
                          <th className="p-3.5">State</th>
                          <th className="p-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 text-stone-700">
                        {filteredHistoryOrders.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-12 text-center text-stone-400 font-light font-sans">
                              No archived customer orders found matching these query criteria.
                            </td>
                          </tr>
                        ) : (
                          filteredHistoryOrders.map((o) => (
                            <tr key={o.id} className="hover:bg-stone-50/40 transition-colors">
                              <td className="p-3.5 font-bold text-stone-900 font-mono text-xs">{o.id}</td>
                              <td className="p-3.5 whitespace-nowrap">
                                <div className="font-semibold text-stone-900">
                                  {new Date(o.createdAt).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </div>
                                <div className="text-[10px] text-stone-400 font-mono">
                                  {new Date(o.createdAt).toLocaleTimeString(undefined, {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                              </td>
                              <td className="p-3.5">
                                <div className="font-semibold text-stone-900">{o.customerName}</div>
                                <div className="text-stone-400 text-[10px] font-mono">{o.phoneNumber}</div>
                                {o.email && <div className="text-stone-400 text-[10px] truncate max-w-[120px]">{o.email}</div>}
                              </td>
                              <td className="p-3.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  o.orderType === "dine-in" ? "bg-teal-50 text-teal-700 border border-teal-100" :
                                  o.orderType === "takeaway" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                                  "bg-blue-50 text-blue-700 border border-blue-100"
                                }`}>
                                  {o.orderType} {o.tableNumber ? `(T-${o.tableNumber})` : ""}
                                </span>
                              </td>
                              <td className="p-3.5 max-w-[200px]">
                                <div className="text-stone-600 font-medium truncate" title={o.items.map(it => `${it.name} x${it.quantity}`).join(", ")}>
                                  {o.items.map(it => `${it.name} x${it.quantity}`).join(", ")}
                                </div>
                                <div className="text-[10px] text-stone-400 font-mono">
                                  {o.items.reduce((acc, it) => acc + it.quantity, 0)} total items
                                </div>
                              </td>
                              <td className="p-3.5 font-bold text-stone-900 text-xs font-mono">
                                ₹{o.grandTotal}
                              </td>
                              <td className="p-3.5">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  o.orderStatus === "Delivered" ? "bg-green-50 text-green-700 border border-green-100" :
                                  o.orderStatus === "Cancelled" ? "bg-red-50 text-red-650 border border-red-100" :
                                  o.orderStatus === "New Order" ? "bg-red-50 text-red-650 border border-red-100 animate-pulse" :
                                  o.orderStatus === "Preparing" ? "bg-blue-50 text-blue-600 border border-blue-100" :
                                  o.orderStatus === "Ready" ? "bg-amber-50 text-amber-850 border border-amber-150" :
                                  "bg-stone-50 text-stone-500 border border-stone-200"
                                }`}>
                                  {o.orderStatus}
                                </span>
                              </td>
                              <td className="p-3.5 text-right flex items-center justify-end gap-1.5">
                                {o.orderStatus !== "Cancelled" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSplitTargetOrder(o);
                                      setShowSplitModal(true);
                                    }}
                                    className="p-1.5 bg-[#d4af37]/15 hover:bg-[#d4af37]/25 border border-[#d4af37]/30 rounded text-[#886915] cursor-pointer shadow-xs"
                                    title="Split Bill & Settle Multi-Payment"
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {o.orderType === "dine-in" && o.orderStatus !== "Cancelled" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTransferSourceTable(o.tableNumber || "");
                                      setTransferSourceOrder(o);
                                      setShowTransferModal(true);
                                    }}
                                    className="p-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-250 rounded text-amber-800 cursor-pointer shadow-xs"
                                    title="Transfer Table / Switch Table"
                                  >
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setSelectedOrderDetails(o)}
                                  className="p-1.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded text-stone-600 hover:text-stone-900 cursor-pointer shadow-xs"
                                  title="Inspect full details"
                                >
                                  <Info className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowBillPrint(o)}
                                  className="p-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded text-blue-600 cursor-pointer shadow-xs"
                                  title="Reprint/View Receipt"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </motion.div>
            )}

            {/* TAB CONTENT: MENU MANAGEMENT */}
            {activeTab === "menu" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                
                {/* Header & Add Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-serif font-bold text-stone-900 uppercase tracking-wider">Dishes & Menu Catalog</h2>
                    <p className="text-xs text-stone-500">Insert new dishes, edit pricing structures, disable stock availability.</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleToggleCategories(!inlineEditCategories)}
                      className={`px-4 py-2.5 font-semibold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer focus:outline-none border shadow-sm ${
                        inlineEditCategories 
                          ? "bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-300 ring-2 ring-amber-300/35"
                          : "bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200"
                      }`}
                    >
                      <Settings className={`w-4 h-4 ${inlineEditCategories ? "text-amber-600 animate-spin" : "text-stone-500"}`} />
                      {inlineEditCategories ? "Exit Category Editor" : "Edit Categories"}
                    </button>
                    <button
                      onClick={() => setShowBulkImportModal(true)}
                      className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs uppercase tracking-wider rounded-xl transition-colors flex items-center gap-2 cursor-pointer focus:outline-none border border-stone-200 shadow-sm"
                    >
                      <Download className="w-4 h-4 text-stone-500" />
                      Import Menu
                    </button>
                    <button
                      onClick={() => {
                        setEditingMenuItem({});
                        setShowMenuModal(true);
                      }}
                      className="px-4 py-2.5 bg-[#d4af37] hover:bg-[#C67C4E] text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition-colors flex items-center gap-2 cursor-pointer focus:outline-none shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      New Dish
                    </button>
                  </div>
                </div>

                {inlineEditCategories ? (
                  <div className="bg-[#FAF6F0] border border-stone-250/30 rounded-2xl p-6 shadow-sm space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                      
                      {/* Left: Active Categories List & Quick Actions */}
                      <div className="flex-1 space-y-4 w-full">
                        <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                          <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wider">
                            Active Menu Categories ({categoriesList.length})
                          </h3>
                          <span className="text-[10px] font-mono text-stone-400">SELECT TO EDIT OR DELETE</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1">
                          {categoriesList.map((cat) => {
                            const isBeingEdited = editingCategory && editingCategory.id === cat.id;
                            return (
                              <div 
                                key={cat.id} 
                                className={`bg-white p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 shadow-xs ${
                                  isBeingEdited 
                                    ? "border-[#d4af37] ring-2 ring-[#d4af37]/20 bg-[#FAF9F5]" 
                                    : "border-stone-200 hover:border-[#d4af37]/55"
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <span className="text-2xl p-2 bg-stone-50 rounded-xl border border-stone-100 flex-shrink-0 shadow-3xs">{cat.icon}</span>
                                  <div className="space-y-1 min-w-0">
                                    <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5 font-sans truncate">
                                      {cat.name}
                                      <span className="text-[9px] font-mono text-stone-400 font-normal">({cat.id})</span>
                                    </h4>
                                    <p className="text-[10px] text-stone-500 font-normal leading-relaxed line-clamp-2">{cat.description || "No description provided."}</p>
                                  </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                                  <button
                                    type="button"
                                    onClick={() => setEditingCategory({ ...cat })}
                                    className="p-1.5 bg-stone-50 hover:bg-stone-100 rounded text-stone-500 hover:text-[#d4af37] border border-stone-200 transition-colors cursor-pointer text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
                                    title="Edit category info"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                    className="p-1.5 bg-stone-50 hover:bg-red-50 rounded text-stone-500 hover:text-red-500 border border-stone-200 transition-colors cursor-pointer text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
                                    title="Delete category"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Delete
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right: Add or Update Category Form */}
                      <div className="w-full md:w-80 bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex-shrink-0 space-y-4">
                        {editingCategory ? (
                          <form onSubmit={handleUpdateCategory} className="space-y-4">
                            <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                              <h4 className="text-xs font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
                                Edit Category
                              </h4>
                              <button 
                                type="button" 
                                onClick={() => setEditingCategory(null)}
                                className="text-[10px] font-mono text-stone-400 hover:text-stone-900 uppercase cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest block">CATEGORY NAME</label>
                              <input
                                required
                                type="text"
                                value={editingCategory.name}
                                onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37] text-stone-900 font-sans font-medium"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest block">EMOJI ICON</label>
                              <input
                                required
                                type="text"
                                value={editingCategory.icon}
                                onChange={(e) => setEditingCategory({ ...editingCategory, icon: e.target.value })}
                                className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37] text-stone-900 font-sans"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest block">DESCRIPTION</label>
                              <textarea
                                required
                                value={editingCategory.description}
                                onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                                rows={3}
                                className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37] text-stone-900 font-sans resize-none"
                              />
                            </div>

                            <button
                              type="submit"
                              className="w-full py-2.5 bg-[#d4af37] hover:bg-[#C67C4E] text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer focus:outline-none shadow-xs flex items-center justify-center gap-1.5 font-sans"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Save Changes
                            </button>
                          </form>
                        ) : (
                          <form onSubmit={handleSaveCategory} className="space-y-4">
                            <h4 className="text-xs font-serif font-bold text-stone-900 uppercase tracking-wider border-b border-stone-200 pb-2">
                              + Deploy New Category
                            </h4>

                            <div className="space-y-1">
                              <label className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest block">CATEGORY NAME</label>
                              <input
                                required
                                type="text"
                                placeholder="e.g. Desserts"
                                value={newCategoryName}
                                onChange={(e) => {
                                  setNewCategoryName(e.target.value);
                                  if (!newCategoryId) {
                                    setNewCategoryId(e.target.value.toLowerCase().replace(/\s+/g, "-"));
                                  }
                                }}
                                className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37] text-stone-900 font-sans"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest block">SLUG / UNIQUE ID</label>
                              <input
                                required
                                type="text"
                                placeholder="e.g. desserts"
                                value={newCategoryId}
                                onChange={(e) => setNewCategoryId(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                                className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37] text-stone-900 font-mono"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest block">EMOJI ICON</label>
                              <input
                                required
                                type="text"
                                placeholder="e.g. 🍰"
                                value={newCategoryIcon}
                                onChange={(e) => setNewCategoryIcon(e.target.value)}
                                className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37] text-stone-900 font-sans"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest block">DESCRIPTION</label>
                              <textarea
                                placeholder="Sweet and delicious desserts to finish..."
                                value={newCategoryDesc}
                                onChange={(e) => setNewCategoryDesc(e.target.value)}
                                rows={2}
                                className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37] text-stone-900 font-sans resize-none"
                              />
                            </div>

                            <button
                              type="submit"
                              className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer focus:outline-none shadow-xs font-sans"
                            >
                              Deploy Category
                            </button>
                          </form>
                        )}
                      </div>

                    </div>
                  </div>
                ) : (
                  <>
                    {/* Filters Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      
                      {/* Category switcher */}
                      <select
                        value={menuFilterCategory}
                        onChange={(e) => setMenuFilterCategory(e.target.value)}
                        className="bg-white border border-stone-200 px-3 py-2.5 text-xs rounded-xl text-stone-700 focus:outline-none focus:border-[#d4af37] shadow-xs cursor-pointer"
                      >
                        <option value="All">All Food Categories</option>
                        {categoriesList.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>

                      {/* Search query */}
                      <div className="relative group sm:col-span-2">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 group-focus-within:text-[#d4af37] transition-colors" />
                        <input
                          type="text"
                          value={menuSearch}
                          onChange={(e) => setMenuSearch(e.target.value)}
                          placeholder="Search culinary items by name, ingredients, descriptions..."
                          className="w-full bg-white border border-stone-200 pl-11 pr-4 py-2.5 text-xs rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-[#d4af37] shadow-xs"
                        />
                      </div>

                    </div>

                    {/* Menu items grid */}
                    <div className="bg-[#FAF6F0] border border-stone-250/30 rounded-2xl p-6 shadow-sm">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {filteredMenuItems.length === 0 ? (
                          <div className="col-span-full py-16 text-center text-xs font-mono text-stone-400">
                            No recipe item catalog matches criteria. Customize searches or launch a new recipe!
                          </div>
                        ) : (
                          filteredMenuItems.map((item) => (
                            <div key={item.id} className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 flex flex-col justify-between group hover:border-[#d4af37]/50 hover:shadow-md transition-all shadow-xs">
                              
                              <div className="space-y-2">
                                {/* Food Image and quick tags */}
                                <div className="w-full h-32 rounded-lg bg-stone-50 overflow-hidden relative border border-stone-150">
                                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none" />
                                  <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${item.isVeg ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-250"}`}>
                                    {item.isVeg ? "VEG" : "NON-VEG"}
                                  </span>
                                  
                                  <div className="absolute top-2 right-2 flex gap-1">
                                    {item.isChefSpecial && <span className="bg-[#d4af37] text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-xs">CHEF</span>}
                                    {item.isBestseller && <span className="bg-[#C67C4E] text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-xs">BEST</span>}
                                  </div>
                                </div>

                                <div>
                                  <h4 className="text-sm font-bold text-stone-900 leading-tight font-sans truncate">{item.name}</h4>
                                  <p className="text-[10px] text-stone-550 mt-1 line-clamp-2 font-sans font-normal leading-relaxed">{item.description}</p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                                <span className="text-sm font-sans font-bold text-[#C67C4E]">₹{item.price}</span>
                                
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingMenuItem({ ...item });
                                      setShowMenuModal(true);
                                    }}
                                    className="p-1.5 bg-stone-50 hover:bg-stone-100 rounded text-stone-500 hover:text-[#d4af37] border border-stone-200 transition-colors cursor-pointer"
                                    title="Edit Item parameters"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteMenuItem(item.id, item.name)}
                                    className="p-1.5 bg-stone-50 hover:bg-red-50 rounded text-stone-500 hover:text-red-500 border border-stone-200 transition-colors cursor-pointer"
                                    title="Delete dish item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}

              </motion.div>
            )}





            {/* TAB CONTENT: SETTINGS */}
            {activeTab === "settings" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                
                {/* Title */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-serif font-bold text-stone-900 uppercase tracking-wider text-left">Restaurant & Bill Printing Settings</h2>
                    <p className="text-xs text-stone-500 font-sans">Configure restaurant identity, tax & FSSAI licensing, double-sided 80mm thermal receipts, branch outlets, and custom terms & conditions.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSettingsSave}
                    className="px-5 py-2.5 bg-[#C67C4E] hover:bg-[#b06a3e] text-white font-bold text-xs tracking-wider uppercase rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Save All Changes</span>
                  </button>
                </div>

                {/* 1. General Restaurant Identity & Contact */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4 shadow-sm text-left">
                  <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                    <Store className="w-4 h-4 text-[#C67C4E]" />
                    <h3 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider">1. Restaurant Identity & General Information</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Restaurant Legal Name</label>
                      <input
                        type="text"
                        value={settings.name || ""}
                        onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                        placeholder="WEBRAJYA POS"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Tagline / Brand Slogan</label>
                      <input
                        type="text"
                        value={settings.tagline || ""}
                        onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                        placeholder="AUTHENTIC SOUTH INDIAN TASTE"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Main Contact Telephone</label>
                      <input
                        type="text"
                        value={settings.contactNumber || ""}
                        onChange={(e) => setSettings({ ...settings, contactNumber: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                        placeholder="+91 98765 43210"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Official Website URL</label>
                      <input
                        type="text"
                        value={settings.website || ""}
                        onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                        placeholder="www.webrajya.com"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Operating Service Timings</label>
                      <input
                        type="text"
                        value={settings.businessHours || ""}
                        onChange={(e) => setSettings({ ...settings, businessHours: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                        placeholder="7:00 AM - 11:00 PM (Mon-Sun)"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Front-Side Bill Custom Footer</label>
                      <input
                        type="text"
                        value={settings.customFooter || ""}
                        onChange={(e) => setSettings({ ...settings, customFooter: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                        placeholder="Taste That Brings You Back. Visit Again Soon."
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Main Geolocation Postal Address</label>
                      <input
                        type="text"
                        value={settings.address || ""}
                        onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                        placeholder="Shop No. 4, Ground Floor, Food Street, Bangalore, Karnataka - 560001"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Logo Image URL</label>
                      <input
                        type="text"
                        value={settings.logoUrl || ""}
                        onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                        placeholder="https://example.com/logo.png"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Tax / GST Settings */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4 shadow-sm text-left">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <h3 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider">2. Tax / GST Settings</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold uppercase text-stone-500">GST Status:</span>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, gstEnabled: !(settings.gstEnabled !== false) })}
                        className={`px-3.5 py-1 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
                          settings.gstEnabled !== false ? "bg-emerald-600 text-white shadow-xs" : "bg-stone-200 text-stone-700"
                        }`}
                      >
                        {settings.gstEnabled !== false ? "GST ON" : "GST OFF"}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">GSTIN Number</label>
                      <input
                        type="text"
                        disabled={settings.gstEnabled === false}
                        value={settings.gstin || ""}
                        onChange={(e) => setSettings({ ...settings, gstin: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-mono uppercase disabled:opacity-40"
                        placeholder="29ABCDE1234F1Z5"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">GST Rate (%)</label>
                      <input
                        type="number"
                        disabled={settings.gstEnabled === false}
                        value={settings.gstRate ?? settings.gstPercentage ?? 5}
                        onChange={(e) => {
                          const newRate = Number(e.target.value) || 0;
                          const half = Math.round((newRate / 2) * 100) / 100;
                          setSettings({
                            ...settings,
                            gstRate: newRate,
                            gstPercentage: newRate,
                            cgstRate: half,
                            sgstRate: half
                          });
                        }}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-mono disabled:opacity-40"
                        placeholder="5"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">CGST Rate (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        disabled={settings.gstEnabled === false}
                        value={settings.cgstRate ?? ((settings.gstRate ?? settings.gstPercentage ?? 5) / 2)}
                        onChange={(e) => setSettings({ ...settings, cgstRate: Number(e.target.value) })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-mono disabled:opacity-40"
                        placeholder="2.5"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">SGST Rate (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        disabled={settings.gstEnabled === false}
                        value={settings.sgstRate ?? ((settings.gstRate ?? settings.gstPercentage ?? 5) / 2)}
                        onChange={(e) => setSettings({ ...settings, sgstRate: Number(e.target.value) })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-mono disabled:opacity-40"
                        placeholder="2.5"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Front & Back Bill Printing Engine Settings */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-5 shadow-sm text-left">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <Printer className="w-4 h-4 text-[#C67C4E]" />
                      <h3 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider">3. Double-Sided Thermal Receipt Configuration (80mm / 58mm)</h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#C67C4E]/10 text-[#C67C4E]">
                      80mm THERMAL STANDARD
                    </span>
                  </div>

                  {/* Double Sided Master Toggle Banner */}
                  <div className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    settings.enableDoubleSided ? "bg-amber-50/60 border-amber-200" : "bg-stone-50 border-stone-200"
                  }`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Layers className={`w-4 h-4 ${settings.enableDoubleSided ? "text-[#C67C4E]" : "text-stone-400"}`} />
                        <span className="text-xs font-bold text-stone-900">Enable Double-Sided Receipts (Front: Tax Invoice + Back: Outlets & Terms)</span>
                      </div>
                      <p className="text-[11px] text-stone-500">
                        When enabled, printing a customer bill automatically generates the Front Side Tax Invoice followed by the Back Side containing all branch outlet addresses, telephone contacts, and customizable customer policies with clean thermal separation.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, enableDoubleSided: !settings.enableDoubleSided })}
                      className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer flex items-center gap-2 self-start sm:self-auto ${
                        settings.enableDoubleSided
                          ? "bg-[#C67C4E] text-white shadow-sm"
                          : "bg-stone-200 text-stone-700 hover:bg-stone-300"
                      }`}
                    >
                      <span>{settings.enableDoubleSided ? "ENABLED" : "DISABLED"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Tax Invoice Header Title</label>
                      <input
                        type="text"
                        value={settings.invoiceTitle || "TAX INVOICE"}
                        onChange={(e) => setSettings({ ...settings, invoiceTitle: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                        placeholder="TAX INVOICE"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Default Cashier / Operator Name</label>
                      <input
                        type="text"
                        value={settings.cashierName || "Admin / Cashier"}
                        onChange={(e) => setSettings({ ...settings, cashierName: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                        placeholder="Admin / Cashier"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Default Guests / Pax Count</label>
                      <input
                        type="number"
                        value={settings.defaultPax || 2}
                        onChange={(e) => setSettings({ ...settings, defaultPax: Number(e.target.value) })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-mono"
                        placeholder="2"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Thermal Paper Roll Width</label>
                      <select
                        value={settings.paperWidth || "80mm"}
                        onChange={(e) => setSettings({ ...settings, paperWidth: e.target.value as "58mm" | "80mm" })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans cursor-pointer"
                      >
                        <option value="80mm">80mm (Standard POS Thermal)</option>
                        <option value="58mm">58mm (Compact Mobile Thermal)</option>
                      </select>
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Back Side Title / Header</label>
                      <input
                        type="text"
                        value={settings.backSideTitle || "OUR BRANCH OUTLETS & CUSTOMER POLICIES"}
                        onChange={(e) => setSettings({ ...settings, backSideTitle: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                        placeholder="OUR BRANCH OUTLETS & CUSTOMER POLICIES"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Back Side Footer Note</label>
                      <input
                        type="text"
                        value={settings.backSideFooterNote || "Thank You For Your Patronage! Visit www.webrajya.com"}
                        onChange={(e) => setSettings({ ...settings, backSideFooterNote: e.target.value })}
                        className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                        placeholder="Thank You For Your Patronage! Visit www.webrajya.com"
                      />
                    </div>
                  </div>

                  {/* Quick Feature Toggles */}
                  <div className="pt-2 border-t border-stone-100">
                    <label className="text-[10px] font-mono text-stone-400 font-bold uppercase tracking-wider block mb-2">Front Side Thermal Receipt Detail Elements</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: "showLogo", label: "Restaurant Logo", val: settings.showLogo !== false },
                        { key: "showAmountInWords", label: "Amount in Words", val: settings.showAmountInWords !== false },
                        { key: "showPax", label: "Pax / Guest Count", val: settings.showPax !== false },
                        { key: "showCashier", label: "Cashier / User", val: settings.showCashier !== false },
                        { key: "showBarcode", label: "Barcode Stamp", val: settings.showBarcode !== false },
                        { key: "showQrCode", label: "UPI QR Code", val: settings.showQrCode !== false },
                        { key: "showSignature", label: "Authorized Sign Box", val: settings.showSignature !== false }
                      ].map((tog) => (
                        <button
                          key={tog.key}
                          type="button"
                          onClick={() => setSettings({ ...settings, [tog.key]: !tog.val })}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                            tog.val
                              ? "bg-stone-900 text-white border-stone-900"
                              : "bg-stone-100 text-stone-500 border-stone-200 hover:bg-stone-200"
                          }`}
                        >
                          <Check className={`w-3 h-3 ${tog.val ? "opacity-100" : "opacity-0"}`} />
                          <span>{tog.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. Branch Outlets Management (Dynamic Back Side Outlet Directory) */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4 shadow-sm text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#C67C4E]" />
                      <h3 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider">
                        4. Branch Outlet Directory (Printed on Back Side) ({ (settings.outlets || defaultOutlets).length })
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRestoreDefaultOutlets}
                        className="px-2.5 py-1 text-[10px] font-mono text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restore Defaults</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOutletIndex(null);
                          setOutletForm({ name: "", address: "", contactNumber: "" });
                          setShowAddOutletModal(true);
                        }}
                        className="px-3 py-1.5 bg-[#C67C4E] hover:bg-[#b06a3e] text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Outlet</span>
                      </button>
                    </div>
                  </div>

                  {/* Outlets List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(settings.outlets && settings.outlets.length > 0 ? settings.outlets : defaultOutlets).map((outlet, idx) => (
                      <div key={outlet.id || idx} className="p-3.5 bg-[#FAF6F0]/70 rounded-xl border border-stone-200/80 flex flex-col justify-between gap-2 hover:border-stone-300 transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-[#C67C4E]/10 text-[#C67C4E] text-[10px] font-mono font-bold flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <h4 className="text-xs font-bold text-stone-900">{outlet.name}</h4>
                            </div>
                            {outlet.isMain && (
                              <span className="px-2 py-0.5 rounded text-[8px] font-mono font-bold bg-amber-100 text-[#aa7c11]">
                                MAIN
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-600 font-sans pl-6.5 leading-relaxed">{outlet.address}</p>
                          <p className="text-[10px] font-mono text-stone-500 pl-6.5 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-[#C67C4E]" />
                            <span>{outlet.contactNumber}</span>
                          </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-stone-200/40">
                          <button
                            type="button"
                            onClick={() => handleEditOutlet(idx)}
                            className="px-2 py-1 text-[10px] font-mono text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 rounded transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOutlet(idx)}
                            className="px-2 py-1 text-[10px] font-mono text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. Terms & Conditions Management (Dynamic Back Side Policy List) */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4 shadow-sm text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#C67C4E]" />
                      <h3 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider">
                        5. Terms & Conditions (Printed on Back Side) ({ (settings.termsAndConditions || defaultTermsAndConditions).length })
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleRestoreDefaultTerms}
                      className="px-2.5 py-1 text-[10px] font-mono text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore Default Terms</span>
                    </button>
                  </div>

                  {/* Add New Term Input */}
                  <form onSubmit={handleAddTerm} className="flex gap-2">
                    <input
                      type="text"
                      value={newTermInput}
                      onChange={(e) => setNewTermInput(e.target.value)}
                      placeholder="Add a new policy or term (e.g. GST is charged as per prevailing government norms)..."
                      className="flex-1 bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                    />
                    <button
                      type="submit"
                      disabled={!newTermInput.trim()}
                      className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Term</span>
                    </button>
                  </form>

                  {/* Terms List */}
                  <div className="space-y-2 pt-1">
                    {(settings.termsAndConditions && settings.termsAndConditions.length > 0 ? settings.termsAndConditions : defaultTermsAndConditions).map((term, idx) => (
                      <div key={idx} className="p-3 bg-[#FAF6F0]/60 rounded-xl border border-stone-200/80 flex items-start justify-between gap-3">
                        {editingTermIndex === idx ? (
                          <div className="flex-1 flex gap-2">
                            <input
                              type="text"
                              value={editingTermInput}
                              onChange={(e) => setEditingTermInput(e.target.value)}
                              className="flex-1 bg-white border border-stone-300 px-3 py-1.5 text-xs rounded-lg focus:outline-none focus:border-[#C67C4E]"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEditedTerm(idx)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTermIndex(null)}
                              className="px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start gap-2 text-xs text-stone-800 font-sans leading-relaxed">
                              <span className="font-mono font-bold text-stone-400 text-[11px] pt-0.5">{idx + 1}.</span>
                              <span>{term}</span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTermIndex(idx);
                                  setEditingTermInput(term);
                                }}
                                className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-200/60 rounded transition-colors cursor-pointer"
                                title="Edit term"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTerm(idx)}
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="Delete term"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save All Settings Master Button */}
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSettingsSave}
                    className="px-6 py-3 bg-[#C67C4E] hover:bg-[#b06a3e] text-white font-bold text-xs tracking-wider uppercase rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Save All Restaurant & Bill Settings</span>
                  </button>
                </div>

                {/* PDF User Manual Generation Card */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-4 text-left">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-amber-50 text-[#aa7c11] border border-amber-100 rounded-xl flex-shrink-0">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wide">staff operating user manual</h3>
                      <p className="text-xs text-stone-500 font-sans leading-relaxed">
                        Generate and download a comprehensive, beautifully typeset PDF manual for restaurant staff. Includes Menu Management, Order Handling, Print Preview screen, and Admin Dashboard navigation.
                      </p>
                    </div>
                  </div>
                  
                  <div className="pt-2 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleDownloadUserManual}
                      className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-semibold text-[11px] uppercase tracking-wider rounded-xl transition-colors flex items-center gap-2 cursor-pointer border border-stone-900"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download User Manual (PDF)</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setShowManualPreview(true)}
                      className="px-4 py-2.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-800 font-semibold text-[11px] uppercase tracking-wider rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#aa7c11]" />
                      <span>View Manual On-Screen</span>
                    </button>
                  </div>
                </div>

                {/* MODAL: ADD / EDIT OUTLET */}
                <AnimatePresence>
                  {showAddOutletModal && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.6 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowAddOutletModal(false)}
                        className="fixed inset-0 bg-black z-50 backdrop-blur-xs"
                      />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg bg-white rounded-2xl shadow-2xl z-50 border border-stone-200 p-6 space-y-4 text-left"
                      >
                        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                          <h3 className="text-sm font-bold font-serif text-stone-900 uppercase tracking-wide">
                            {editingOutletIndex !== null ? "Edit Branch Outlet" : "Add New Branch Outlet"}
                          </h3>
                          <button
                            type="button"
                            onClick={() => setShowAddOutletModal(false)}
                            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <form onSubmit={handleSaveOutlet} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Outlet Name / Landmark</label>
                            <input
                              type="text"
                              required
                              value={outletForm.name}
                              onChange={(e) => setOutletForm({ ...outletForm, name: e.target.value })}
                              placeholder="e.g. WebRajya POS - Main Outlet"
                              className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Complete Address</label>
                            <textarea
                              required
                              rows={2}
                              value={outletForm.address}
                              onChange={(e) => setOutletForm({ ...outletForm, address: e.target.value })}
                              placeholder="e.g. 100 Feet Road, HAL 2nd Stage, Indiranagar, Bangalore - 560038"
                              className="w-full bg-[#FAF6F0]/60 border border-stone-200 p-3 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 resize-none font-sans"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-sans font-bold text-stone-500 uppercase tracking-widest block">Contact Telephone</label>
                            <input
                              type="text"
                              required
                              value={outletForm.contactNumber}
                              onChange={(e) => setOutletForm({ ...outletForm, contactNumber: e.target.value })}
                              placeholder="e.g. +91 98450 12345"
                              className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3.5 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900"
                            />
                          </div>

                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setShowAddOutletModal(false)}
                              className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="px-5 py-2 bg-[#C67C4E] hover:bg-[#b06a3e] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                            >
                              {editingOutletIndex !== null ? "Update Outlet" : "Save Outlet"}
                            </button>
                          </div>
                        </form>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>

              </motion.div>
            )}

            {/* TAB CONTENT: KITCHEN DISPLAY */}
            {activeTab === "kitchen" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 w-full">
                <KitchenDashboard />
              </motion.div>
            )}

            {/* TAB CONTENT: TABLES & QR CODES */}
            {activeTab === "tables" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 w-full">
                
                {/* Descriptive Top Panel Card */}
                <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-serif font-bold text-stone-900 uppercase tracking-wide">Table QR Self-Ordering Engine</h3>
                    <p className="text-xs text-stone-500 font-sans font-light leading-relaxed max-w-2xl">
                      Generate unique, secure table QR codes. Guests simply scan their table's code, which automatically opens the digital menu, locks their table location, and enables direct checkout.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowAddTable(true);
                    }}
                    className="px-4 py-2.5 bg-stone-900 hover:bg-stone-850 text-white font-mono font-semibold text-[11px] tracking-widest uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 self-start md:self-auto border border-stone-900"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Deploy New Table</span>
                  </button>
                </div>

                {/* Main Two-Column split Workspace */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                  
                  {/* Left Column (7/12 widths): Table Floorplan list */}
                  <div className="xl:col-span-7 bg-white p-5 rounded-2xl border border-stone-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-3">
                      <h4 className="text-xs font-mono font-bold text-stone-400 uppercase tracking-widest">Active Table Directory ({tables.length})</h4>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                          {tables.filter(t => t.status === "Available").length} Available
                        </span>
                        <span className="text-[10px] font-mono text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          {tables.filter(t => t.status === "Occupied").length} Occupied
                        </span>
                        <span className="text-[10px] font-mono text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                          {tables.filter(t => t.status === "Service Required").length} Service Req.
                        </span>
                        <span className="text-[10px] font-mono text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          {tables.filter(t => t.status === "Reserved").length} Reserved
                        </span>
                      </div>
                    </div>
 
                     {/* Table Bento List */}
                     <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                       {tables.map((table) => {
                         const isSelected = selectedTableForQr?.id === table.id;
                         
                         // Status styling configuration
                         let statusColorClasses = "bg-stone-50 text-stone-500 border-stone-200";
                         let borderClasses = "border-stone-200 hover:border-stone-300 bg-stone-50/20 border-l-4 border-l-stone-400";
                         let StatusIcon = null;
                         let pingDot = null;

                         if (table.status === "Available") {
                           statusColorClasses = "bg-green-50 text-green-700 border-green-100";
                           borderClasses = "border-stone-200 hover:border-green-300 bg-green-50/5 border-l-4 border-l-green-500";
                           pingDot = <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>;
                         } else if (table.status === "Occupied") {
                           statusColorClasses = "bg-amber-50 text-amber-700 border-amber-100";
                           borderClasses = "border-stone-200 hover:border-amber-300 bg-amber-50/5 border-l-4 border-l-amber-500";
                           pingDot = <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>;
                         } else if (table.status === "Service Required") {
                           statusColorClasses = "bg-rose-50 text-rose-700 border-rose-200 font-bold flex items-center gap-1 shadow-xs";
                           borderClasses = "border-rose-300 hover:border-rose-400 bg-rose-50/10 border-l-4 border-l-rose-500 shadow-sm shadow-rose-100/50 animate-pulse";
                           StatusIcon = <Bell className="w-3.5 h-3.5 text-rose-600 animate-bounce" />;
                           pingDot = (
                             <span className="relative flex h-1.5 w-1.5">
                               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                               <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                             </span>
                           );
                         } else if (table.status === "Reserved") {
                           statusColorClasses = "bg-blue-50 text-blue-700 border-blue-100";
                           borderClasses = "border-stone-200 hover:border-blue-300 bg-blue-50/5 border-l-4 border-l-blue-400";
                           StatusIcon = <Lock className="w-3 h-3 text-blue-600" />;
                           pingDot = <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>;
                         }

                         return (
                           <div
                             key={table.id}
                             onClick={() => setSelectedTableForQr(table)}
                             className={`p-4 rounded-xl border transition-all cursor-pointer text-left space-y-2 relative flex flex-col justify-between ${
                               isSelected
                                 ? "border-[#d4af37] bg-amber-50/20 shadow-sm ring-1 ring-amber-450/30"
                                 : borderClasses
                             }`}
                           >
                             <div>
                               <div className="flex items-center justify-between">
                                 <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${statusColorClasses}`}>
                                   {pingDot}
                                   {table.status}
                                 </span>
                                 <span className="text-[9px] font-mono text-stone-400">
                                   🪑 {table.capacity} Pax
                                 </span>
                               </div>
                               <div className="flex items-center justify-between gap-1 mt-2">
                                 <h5 className="font-serif font-bold text-stone-900 text-base">
                                   Table #{table.tableNumber}
                                 </h5>
                                 {StatusIcon}
                               </div>
                               <p className="text-[10px] text-stone-400 font-sans truncate">
                                 {table.seatingArea}
                               </p>
                             </div>
 
                             <div className="flex items-center justify-between pt-3 border-t border-stone-100 mt-2">
                               {/* Status Quick changer */}
                               <select
                                 value={table.status}
                                 onClick={(e) => e.stopPropagation()}
                                 onChange={(e) => handleUpdateTableStatus(table.id, e.target.value as any)}
                                 className="text-[9px] bg-transparent text-stone-600 border border-stone-200 rounded p-1 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                               >
                                 <option value="Available">Available</option>
                                 <option value="Occupied">Occupied</option>
                                 <option value="Service Required">Service Required</option>
                                 <option value="Reserved">Reserved</option>
                               </select>
                               <button
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   handleDeleteTable(table.id);
                                 }}
                                 className="p-1 hover:text-red-500 hover:bg-red-50 text-stone-400 rounded-lg transition-colors cursor-pointer"
                                 title="Delete Table"
                               >
                                 <Trash2 className="w-3.5 h-3.5" />
                               </button>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                  </div>

                  {/* Right Column (5/12 width): Table QR Code Viewer & Frame Stand Generator */}
                  <div className="xl:col-span-5 flex flex-col gap-6">
                    {selectedTableForQr ? (
                      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-5 text-center flex flex-col items-center">
                        <div className="border-b border-stone-100 pb-3 w-full text-left flex items-center justify-between">
                          <h4 className="text-xs font-mono font-bold text-stone-400 uppercase tracking-widest">QR Framing Stand</h4>
                          <span className="text-[10px] font-mono bg-stone-950 text-stone-100 px-2 py-0.5 rounded-md uppercase">
                            Premium Stand
                          </span>
                        </div>

                        {/* Interactive URL frame code value generator */}
                        {(() => {
                          const tableNoStr = selectedTableForQr.tableNumber;
                          const qrLink = `${window.location.origin}/table/${encodeURIComponent(tableNoStr)}`;
                          const googleQrApi = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrLink)}&qzone=1`;

                          return (
                            <div className="w-full flex flex-col items-center gap-4">
                              
                              {/* Decorative Table Stand Mockup Frame */}
                              <div className="bg-[#FAF9F5] border-4 border-stone-900 rounded-3xl p-5 w-full max-w-[280px] shadow-lg flex flex-col items-center space-y-4 relative">
                                <span className="absolute top-3 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-stone-900 rounded-full"></span>
                                
                                <div className="text-stone-900 font-serif font-extrabold uppercase text-xs tracking-wider border-b border-stone-200 pb-1.5 w-full text-center">
                                  THE XINGS KITCHEN
                                </div>

                                <div className="p-3 bg-white rounded-2xl border-2 border-stone-900/10 shadow-inner flex items-center justify-center">
                                  <img
                                    src={googleQrApi}
                                    alt={`Table ${tableNoStr} QR Code`}
                                    referrerPolicy="no-referrer"
                                    className="w-40 h-40 object-contain"
                                  />
                                </div>

                                <div className="space-y-1 text-center">
                                  <div className="text-[10px] font-mono text-amber-800 tracking-widest font-bold uppercase">
                                    DINE-IN ORDERING PORTAL
                                  </div>
                                  <div className="font-serif font-black text-2xl text-stone-950 uppercase">
                                    Table #{tableNoStr}
                                  </div>
                                  <p className="text-[9px] text-stone-500 leading-normal max-w-[190px] mx-auto font-sans">
                                    Scan QR with your smartphone camera to browse menu, select dishes, & order instantly!
                                  </p>
                                </div>
                              </div>

                              {/* Action Items for QR Stand */}
                              <div className="w-full space-y-2 mt-2">
                                <div className="p-3 bg-stone-50 rounded-xl text-left border border-stone-250/50 font-mono space-y-1">
                                  <span className="text-[8px] text-stone-400 block uppercase font-bold">Encrypted Web Address:</span>
                                  <span className="text-[10px] text-stone-700 block select-all break-all leading-tight bg-white p-1.5 rounded border border-stone-150">
                                    {qrLink}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <a
                                    href={googleQrApi}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3.5 py-2.5 bg-stone-900 hover:bg-stone-850 text-white font-mono font-bold text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 border border-stone-900"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>Download QR</span>
                                  </a>
                                  <button
                                    onClick={() => {
                                      const printHtml = `
                                        <html>
                                          <head>
                                            <title>Print Stand - Table ${tableNoStr}</title>
                                            <style>
                                              body { font-family: 'Georgia', serif; text-align: center; padding: 40px; background: #fff; }
                                              .stand { border: 8px solid #000; border-radius: 40px; padding: 30px; display: inline-block; max-width: 400px; background: #faf9f5; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                                              .header { text-transform: uppercase; font-size: 16px; font-weight: bold; margin-bottom: 25px; border-bottom: 3px solid #000; padding-bottom: 10px; }
                                              .qr-container { padding: 20px; background: #fff; border-radius: 20px; border: 3px solid #000; display: inline-block; margin-bottom: 25px; }
                                              .qr { width: 250px; height: 250px; }
                                              .sub { font-size: 12px; color: #b45309; letter-spacing: 2px; font-weight: bold; margin-bottom: 5px; }
                                              .table-num { font-size: 36px; font-weight: 900; margin: 10px 0; }
                                              .desc { font-size: 11px; color: #555; max-width: 300px; margin: 0 auto; line-height: 1.5; }
                                            </style>
                                          </head>
                                          <body>
                                            <div class="stand">
                                              <div class="header">THE XINGS KITCHEN</div>
                                              <div class="qr-container">
                                                <img class="qr" src="${googleQrApi}" />
                                              </div>
                                              <div class="sub">DINE-IN ORDERING PORTAL</div>
                                              <div class="table-num">TABLE #${tableNoStr}</div>
                                              <p class="desc">Scan this QR code with your smartphone camera to browse menu, select delicacies and order directly to your table!</p>
                                            </div>
                                            <script>
                                              window.onload = function() { window.print(); if (window.location.host) { window.close(); } }
                                            </script>
                                          </body>
                                        </html>
                                      `;

                                      let printWin: Window | null = null;
                                      try {
                                        printWin = window.open("", "_blank");
                                      } catch (e) {
                                        console.warn("Popup print window was blocked, falling back to silent iframe print.");
                                      }

                                      if (printWin) {
                                        printWin.document.write(printHtml);
                                        printWin.document.close();
                                      } else {
                                        const iframe = document.createElement("iframe");
                                        iframe.style.position = "absolute";
                                        iframe.style.width = "0px";
                                        iframe.style.height = "0px";
                                        iframe.style.border = "none";
                                        document.body.appendChild(iframe);

                                        const doc = iframe.contentWindow?.document || iframe.contentDocument;
                                        if (doc) {
                                          doc.open();
                                          doc.write(printHtml);
                                          doc.close();

                                          setTimeout(() => {
                                            iframe.contentWindow?.focus();
                                            iframe.contentWindow?.print();
                                            setTimeout(() => {
                                              document.body.removeChild(iframe);
                                            }, 1000);
                                          }, 800);
                                        }
                                      }
                                    }}
                                    className="px-3.5 py-2.5 bg-[#FAF9F5] hover:bg-stone-50 border border-stone-250 text-stone-850 font-mono font-bold text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                                  >
                                    <Printer className="w-3 h-3" />
                                    <span>Print Stand</span>
                                  </button>
                                </div>
                                {selectedTableForQr.status === "Occupied" && (
                                  <div className="grid grid-cols-2 gap-2 mt-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const activeOrder = LocalDB.getActiveOrderForTable(selectedTableForQr.tableNumber);
                                        if (activeOrder) {
                                          setSplitTargetOrder(activeOrder);
                                          setShowSplitModal(true);
                                        } else {
                                          alert("No active order found for this table.");
                                        }
                                      }}
                                      className="py-2.5 bg-[#d4af37] hover:bg-[#b5952f] text-stone-950 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                      <Receipt className="w-4 h-4" />
                                      <span>Split / Pay</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const activeOrder = LocalDB.getActiveOrderForTable(selectedTableForQr.tableNumber);
                                        setTransferSourceTable(selectedTableForQr.tableNumber);
                                        setTransferSourceOrder(activeOrder);
                                        setShowTransferModal(true);
                                      }}
                                      className="py-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                      <ArrowRightLeft className="w-4 h-4" />
                                      <span>Transfer</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="bg-stone-50 p-12 text-center rounded-2xl border border-stone-205 text-stone-400 font-sans font-light">
                        Select a table to review and download its dynamic self-ordering QR sheet or stand cardboard mockup.
                      </div>
                    )}
                  </div>
                </div>

                {/* Deploy New Table Modal Popup dialog */}
                <AnimatePresence>
                  {showAddTable && (
                    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-sm w-full overflow-hidden"
                      >
                        <div className="bg-stone-900 text-white p-4 font-mono font-bold text-xs uppercase tracking-widest flex items-center justify-between">
                          <span>DEPLOY NEW RESTAURANT TABLE</span>
                          <button
                            onClick={() => setShowAddTable(false)}
                            className="text-stone-400 hover:text-white transition-colors cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <form onSubmit={handleAddTable} className="p-5 space-y-4">
                          <div>
                            <label className="text-[10px] text-stone-450 font-mono block mb-1 font-bold">TABLE IDENTIFIER/NUMBER *</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g., 9"
                              value={newTableNo}
                              onChange={(e) => setNewTableNo(e.target.value)}
                              className="w-full bg-white text-stone-950 placeholder-stone-400 text-xs border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:border-stone-900 transition-all font-sans"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-stone-450 font-mono block mb-1 font-bold">SEATING CAPACITY *</label>
                            <select
                              value={newCapacity}
                              onChange={(e) => setNewCapacity(Number(e.target.value))}
                              className="w-full bg-white text-stone-950 text-xs border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:border-stone-900 transition-all font-sans"
                            >
                              <option value="2">2 Guests (Couple Seating)</option>
                              <option value="4">4 Guests (Standard Box)</option>
                              <option value="6">6 Guests (Family Table)</option>
                              <option value="8">8 Guests (Large VIP Sofa)</option>
                              <option value="12">12 Guests (Feast Suite)</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] text-stone-450 font-mono block mb-1 font-bold">DINING AREA SECTION *</label>
                            <select
                              value={newArea}
                              onChange={(e) => setNewArea(e.target.value)}
                              className="w-full bg-white text-stone-950 text-xs border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:border-stone-900 transition-all font-sans"
                            >
                              <option value="Main Dining Hall">Main Dining Hall</option>
                              <option value="Window Alcove">Window Alcove</option>
                              <option value="Family Suite">Family Suite</option>
                              <option value="VIP Lounge">VIP Lounge</option>
                              <option value="Balcony Area">Balcony Area</option>
                              <option value="Courtyard Garden">Courtyard Garden</option>
                            </select>
                          </div>

                          <button
                            type="submit"
                            className="w-full py-3 bg-[#d4af37] hover:bg-amber-600 text-stone-950 font-mono font-bold text-xs tracking-wider uppercase rounded-xl transition-all shadow-sm cursor-pointer border border-[#d4af37]"
                          >
                            AUTHORIZE AND LAUNCH TABLE
                          </button>
                        </form>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

              </motion.div>
            )}

            {/* TAB CONTENT: PRINTERS & SPOOLS MANAGER */}
            {activeTab === "printers" && (
              <PrintersConfigTab />
            )}



            {/* TAB CONTENT: SUPABASE DIAGNOSTICS */}
            {activeTab === "supabase" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 w-full">
                <SupabaseDiagnostics />
              </motion.div>
            )}

          </div>
        </main>

      </div>

      {/* DETAIL MODAL: ORDER FULL VIEWER */}
      <AnimatePresence>
        {selectedOrderDetails && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }} onClick={() => setSelectedOrderDetails(null)} className="fixed inset-0 bg-[#0c0a09]/40 z-40 backdrop-blur-xs" />
            
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-4 max-w-lg mx-auto my-auto h-fit bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 z-50 shadow-2xl overflow-y-auto max-h-[85vh]">
              <div className="flex justify-between items-start border-b border-stone-200 pb-4 mb-4">
                <div>
                  <h3 className="text-base font-serif font-bold text-stone-900 uppercase tracking-wider">Inspect Invoice Details</h3>
                  <p className="text-[10px] font-mono text-[#C67C4E] mt-0.5 font-bold">Order ID: {selectedOrderDetails.id}</p>
                </div>
                <button onClick={() => setSelectedOrderDetails(null)} className="p-1 text-stone-400 hover:text-stone-900 cursor-pointer">✕</button>
              </div>

              <div className="space-y-4 font-sans text-xs">
                
                {/* Customer specs */}
                <div className="bg-[#FAF6F0] p-4 rounded-xl border border-stone-200/80 space-y-1 text-stone-600">
                  <p className="text-stone-900 font-bold text-sm mb-1.5">{selectedOrderDetails.customerName}</p>
                  <p className="text-[11px]">CONTACT: <span className="text-stone-850 font-bold font-mono">{selectedOrderDetails.phoneNumber}</span></p>
                  <p className="text-[11px]">EMAIL: <span className="text-stone-850 font-mono lowercase">{selectedOrderDetails.email}</span></p>
                  <p className="text-[11px]">ORDER TYPE: <span className="text-stone-850 font-bold uppercase">{selectedOrderDetails.orderType}</span></p>
                  {selectedOrderDetails.tableNumber && <p className="text-[11px]">TABLE ALLOCATION: <span className="text-[#C67C4E] font-bold">Table #{selectedOrderDetails.tableNumber}</span></p>}
                  {selectedOrderDetails.address && <p className="text-[11px]">SHIPPING TARGET: <span className="text-stone-800 font-medium">{selectedOrderDetails.address}</span></p>}
                </div>

                {/* Items ledger */}
                <div>
                  <p className="text-[10px] text-stone-404 font-bold uppercase tracking-wider mb-2 font-mono">CULINARY ITEMS ORDERED</p>
                  <div className="space-y-2">
                    {selectedOrderDetails.items.map((itm, idx) => (
                      <div key={idx} className="bg-white p-3 rounded-xl border border-stone-200 flex justify-between items-center shadow-xs">
                        <div>
                          <div className="text-stone-900 font-bold">{itm.name} <span className="text-[#C67C4E] font-bold">x{itm.quantity}</span></div>
                          {itm.customization && <div className="text-[10px] text-stone-400 mt-0.5 italic font-sans font-medium">Notes: {itm.customization}</div>}
                        </div>
                        <span className="text-stone-750 font-bold font-mono">₹{itm.price * itm.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="bg-[#FAF6F0] p-4 rounded-xl border border-stone-200/80 space-y-1.5 text-stone-605 font-sans">
                  <div className="flex justify-between text-xs">
                    <span>Subtotal Basket</span>
                    <span className="font-semibold text-stone-800 font-mono">₹{selectedOrderDetails.subtotal}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>CGST (2.5%)</span>
                    <span className="font-semibold text-stone-800 font-mono">₹{(selectedOrderDetails.gst / 2).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>SGST (2.5%)</span>
                    <span className="font-semibold text-stone-800 font-mono">₹{(selectedOrderDetails.gst / 2).toFixed(2)}</span>
                  </div>
                  {selectedOrderDetails.packagingCharge > 0 && (selectedOrderDetails.orderType || "").toLowerCase() !== "takeaway" && (
                    <div className="flex justify-between text-xs">
                      <span>Packaging Surcharge</span>
                      <span className="font-semibold text-stone-800 font-mono">₹{selectedOrderDetails.packagingCharge}</span>
                    </div>
                  )}
                  {selectedOrderDetails.discountAmount > 0 && (
                    <div className="flex justify-between text-xs text-green-700">
                      <span>Coupon Discount ({selectedOrderDetails.appliedCoupon})</span>
                      <span className="font-bold font-mono">-₹{selectedOrderDetails.discountAmount}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-stone-250/60 pt-2 font-bold text-stone-900 text-sm">
                    <span className="text-[#C67C4E]">GRAND DISPATCH TOTAL</span>
                    <span className="text-[#C67C4E] font-mono">₹{selectedOrderDetails.grandTotal}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2.5">
                {selectedOrderDetails.orderStatus !== "Cancelled" && (
                  <button
                    onClick={() => {
                      setSplitTargetOrder(selectedOrderDetails);
                      setShowSplitModal(true);
                      setSelectedOrderDetails(null);
                    }}
                    className="px-4 py-2 bg-[#d4af37]/15 hover:bg-[#d4af37]/25 border border-[#d4af37]/40 text-[#886915] text-xs font-bold font-sans rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Receipt className="w-4 h-4 text-[#9a7b20]" />
                    Split / Settle Bill
                  </button>
                )}
                {selectedOrderDetails.orderType === "dine-in" && selectedOrderDetails.orderStatus !== "Cancelled" && (
                  <button
                    onClick={() => {
                      setTransferSourceTable(selectedOrderDetails.tableNumber || "");
                      setTransferSourceOrder(selectedOrderDetails);
                      setShowTransferModal(true);
                      setSelectedOrderDetails(null);
                    }}
                    className="px-4 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold font-sans rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <ArrowRightLeft className="w-4 h-4 text-amber-700" />
                    Transfer Table
                  </button>
                )}
                <button
                  onClick={async () => {
                    try {
                      await PhysicalThermalPrinter.printCombinedBillAndKOT(selectedOrderDetails, settings, "native");
                      alert(`Bill & KOT for Order #${selectedOrderDetails.id} sent to thermal printer.`);
                    } catch (err: any) {
                      alert(`Thermal printer error: ${err.message || err}`);
                    }
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold font-sans rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4 text-white" />
                  Print Bill + KOT
                </button>
                <button
                  onClick={() => setSelectedOrderDetails(null)}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer"
                >
                  Close panel
                </button>
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* DETAIL MODAL: BILLING RECEIPTS & PRINTING COMPONENT */}
      <AnimatePresence>
        {showBillPrint && (() => {
          // Find or synthesize matched KOT
          const matchedKot = {
            id: showBillPrint.kotNumber || `KOT-${showBillPrint.id.replace("SR-", "")}`,
            orderId: showBillPrint.id,
            tableNumber: showBillPrint.tableNumber || "Takeaway",
            customerName: showBillPrint.customerName,
            orderType: showBillPrint.orderType,
            status: "New Order",
            specialInstructions: showBillPrint.items.map(i => i.customization).filter(Boolean).join(", ") || "None",
            createdAt: showBillPrint.createdAt,
            preparationTime: 15,
            items: showBillPrint.items
          };

          // Session/Historical print count tracker for this invoice
          const currentPrintCount = printCountMap[showBillPrint.id] || 0;

          // Generate the live HTML receipt mockup!
          const liveReceiptHTML = PhysicalThermalPrinter.generatePremiumReceiptHTML(
            previewTab, 
            previewTab === "kot" || previewTab === "kitchen-copy" ? matchedKot : showBillPrint, 
            settings, 
            {
              paperWidth: adminPrinterWidth,
              autoScale: true,
              autoWidthDetection: true,
              autoCut: true,
              darkPrintMode: darkPreview,
              marginControl,
              characterDensity,
              fontScaling,
              multipleCopies,
              logoUrl,
              customFooter,
              showWatermark: previewTab === "duplicate-copy" ? "duplicate" : previewTab === "customer-copy" ? "customer" : previewTab === "kitchen-copy" ? "kitchen" : "none",
              showQrCode,
              showBarcode,
              printCount: currentPrintCount + 1,
              showSignature
            }
          );

          // Digital Download trigger
          const handleDownloadHTML = () => {
            const htmlContent = `
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Receipt_POS_${showBillPrint.id}</title>
                  <meta charset="utf-8">
                  <style>
                    body {
                      background: #f5f5f4;
                      padding: 30px 10px;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      min-height: 100vh;
                      margin: 0;
                    }
                  </style>
                </head>
                <body>
                  ${liveReceiptHTML}
                </body>
              </html>
            `;
            const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `RECEIPT_POS_${previewTab.toUpperCase()}_${showBillPrint.id}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Log event
            logPrintEvent("download html");
          };

          // Spool print logger helper
          const logPrintEvent = (actionType: string) => {
            const newHistory = {
              id: `SPL-${Math.floor(1000 + Math.random() * 9000)}`,
              type: `${previewTab.toUpperCase()} (${actionType.toUpperCase()})`,
              timestamp: new Date().toLocaleTimeString(),
              copies: multipleCopies
            };
            setPrintHistoryList(prev => [newHistory, ...prev]);
            
            // Increment print count
            setPrintCountMap(prev => ({
              ...prev,
              [showBillPrint.id]: (prev[showBillPrint.id] || 0) + 1
            }));
          };

          // Master Print Trigger for fallbacks or WebUSB
          const handleDirectPrint = async (targetType: typeof previewTab) => {
            setIsPrinting(true);
            setPrintError(null);
            try {
              const count = currentPrintCount + 1;
              logPrintEvent(`physical print`);

              // Update system DB status
              const dbFieldName = (targetType === "kot" || targetType === "kitchen-copy") ? "kot" : "bill";
              await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, dbFieldName, "Printing");

              if (adminPrinterMode === "fallback") {
                // High fidelity CSS system fallback print (manual browser print dialog)
                const isKotStyle = targetType === "kot" || targetType === "kitchen-copy";
                PhysicalThermalPrinter.printPremiumHTML(
                  targetType, 
                  isKotStyle ? matchedKot : showBillPrint, 
                  settings, 
                  {
                    paperWidth: adminPrinterWidth,
                    marginControl,
                    characterDensity,
                    fontScaling,
                    multipleCopies,
                    logoUrl,
                    customFooter,
                    showWatermark: targetType === "duplicate-copy" ? "duplicate" : targetType === "customer-copy" ? "customer" : targetType === "kitchen-copy" ? "kitchen" : "none",
                    showQrCode,
                    showBarcode,
                    printCount: count,
                    showSignature
                  }
                );
                await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, dbFieldName, "Printed");
                await LocalDB.apiAddAuditLog("Receipt Printed", `Premium ${targetType.toUpperCase()} ticket dispatched via Print Dialog for Order: ${showBillPrint.id}`);
              } else {
                // Direct physical hardware printing (JSPrintManager raw ESC/POS, WebUSB, or WebSerial)
                const isKotStyle = targetType === "kot" || targetType === "kitchen-copy";
                const success = isKotStyle 
                  ? await PhysicalThermalPrinter.printKOT(matchedKot as any, adminPrinterWidth, adminPrinterMode, "Admin")
                  : await PhysicalThermalPrinter.printBill(showBillPrint, settings, adminPrinterWidth, adminPrinterMode);

                if (success) {
                  await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, dbFieldName, "Printed");
                  await LocalDB.apiAddAuditLog("Receipt Printed", `Premium ${targetType.toUpperCase()} sent to direct physical hardware for Order: ${showBillPrint.id}`);
                } else {
                  await LocalDB.apiUpdateOrderPrintStatus(showBillPrint.id, dbFieldName, "Failed");
                  throw new Error(`Direct thermal print failed on mode "${adminPrinterMode.toUpperCase()}". Check printer connection.`);
                }
              }

              // Sync details
              const updatedOrders = await LocalDB.fetchOrders();
              const match = updatedOrders.find(o => o.id === showBillPrint.id);
              if (match) {
                setShowBillPrint(match);
              }
              await refreshAllData();
            } catch (err: any) {
              setPrintError(err.message || "An unexpected print spooling error occurred.");
            } finally {
              setIsPrinting(false);
            }
          };

          // Sequential print both tickets sequentially
          const handlePrintBothSequential = async () => {
            setIsPrinting(true);
            setPrintError(null);
            try {
              // 1. Spool KOT
              await handleDirectPrint("kot");
              
              // Spacing delay for physical cutter
              await new Promise((resolve) => setTimeout(resolve, 800));

              // 2. Spool Customer Bill
              await handleDirectPrint("bill");
            } catch (err: any) {
              setPrintError(err.message || "Sequential print error occurred.");
            } finally {
              setIsPrinting(false);
            }
          };

          // File reader Base64 converter for Logo Upload (Requirement 7)
          const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onloadend = () => {
                setLogoUrl(reader.result as string);
              };
              reader.readAsDataURL(file);
            }
          };

          const handleSimulatedEmail = (e: React.FormEvent) => {
            e.preventDefault();
            setEmailSuccessMsg(`Digital receipt successfully emailed to ${simulatedEmail}!`);
            setTimeout(() => setEmailSuccessMsg(null), 5000);
            logPrintEvent("email send");
          };

          const handleSimulatedWhatsApp = (e: React.FormEvent) => {
            e.preventDefault();
            setPhoneSuccessMsg(`Bill PDF dispatched to WhatsApp +91 ${simulatedPhone}!`);
            setTimeout(() => setPhoneSuccessMsg(null), 5000);
            logPrintEvent("whatsapp send");
          };

          const kotStatus = showBillPrint.kotPrintStatus || "Pending";
          const billStatus = showBillPrint.billPrintStatus || "Pending";
          const kotTime = showBillPrint.kotPrintTimestamp ? new Date(showBillPrint.kotPrintTimestamp).toLocaleTimeString() : null;
          const billTime = showBillPrint.billPrintTimestamp ? new Date(showBillPrint.billPrintTimestamp).toLocaleTimeString() : null;

          return (
            <>
              {/* Dark Overlay */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} exit={{ opacity: 0 }} onClick={() => setShowBillPrint(null)} className="fixed inset-0 bg-[#0c0a09]/75 z-40 backdrop-blur-sm" />
              
              {/* Premium Print Workstation Layout Container */}
              <motion.div initial={{ opacity: 0, scale: 0.98, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 10 }} className="fixed inset-4 md:inset-8 max-w-6xl mx-auto bg-[#fafaf9] text-stone-950 z-50 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] rounded-2xl border border-stone-200 overflow-hidden flex flex-col md:flex-row print-area">
                
                {/* Left Panel: Workspace Control Station (55% width) */}
                <div className="w-full md:w-[55%] p-5 sm:p-6 overflow-y-auto flex flex-col justify-between border-b md:border-b-0 md:border-r border-stone-200 select-none bg-white">
                  <div className="space-y-5">
                    
                    {/* Workspace Title bar */}
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-[#C67C4E]/10 rounded-lg text-[#C67C4E]">
                            <Printer className="w-5 h-5" />
                          </div>
                          <h3 className="text-base font-serif font-black tracking-wide text-stone-900">POS Print Station Workstation</h3>
                        </div>
                        <p className="text-[10px] font-mono text-stone-400 mt-0.5">ORDER ID: {showBillPrint.id} • STATUS: {showBillPrint.orderStatus.toUpperCase()}</p>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-md text-[9px] font-mono font-bold bg-[#C67C4E]/10 text-[#C67C4E] border border-[#C67C4E]/20">
                          {showBillPrint.orderType.toUpperCase()}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md text-[9px] font-mono font-bold bg-stone-100 text-stone-600 border border-stone-200">
                          COPIES: {multipleCopies}
                        </span>
                      </div>
                    </div>

                    {/* 1. Template Copy Tab Selector (Front, Back, Double-Sided & Standard Copies) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] font-mono text-stone-400 uppercase tracking-widest block font-bold">1. Select Print Copy Template Type</label>
                        {settings.enableDoubleSided && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            DOUBLE-SIDED ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-stone-100 p-1.5 rounded-xl border border-stone-200">
                        <button
                          onClick={() => setPreviewTab("double-sided")}
                          className={`px-2 py-2 rounded-lg text-[10px] font-extrabold transition-all duration-150 flex flex-col items-center gap-1 cursor-pointer ${
                            previewTab === "double-sided" ? "bg-[#C67C4E] text-white shadow-sm" : "bg-white/80 text-stone-700 hover:text-stone-950 border border-stone-200"
                          }`}
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span className="truncate">Double-Sided</span>
                        </button>

                        <button
                          onClick={() => setPreviewTab("bill")}
                          className={`px-2 py-2 rounded-lg text-[10px] font-extrabold transition-all duration-150 flex flex-col items-center gap-1 cursor-pointer ${
                            previewTab === "bill" ? "bg-white text-stone-950 shadow-sm border border-stone-200" : "text-stone-500 hover:text-stone-850"
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span className="truncate">Front Side</span>
                        </button>

                        <button
                          onClick={() => setPreviewTab("back-side")}
                          className={`px-2 py-2 rounded-lg text-[10px] font-extrabold transition-all duration-150 flex flex-col items-center gap-1 cursor-pointer ${
                            previewTab === "back-side" ? "bg-white text-stone-950 shadow-sm border border-stone-200" : "text-stone-500 hover:text-stone-850"
                          }`}
                        >
                          <Store className="w-3.5 h-3.5" />
                          <span className="truncate">Back Side</span>
                        </button>

                        <button
                          onClick={() => setPreviewTab("kot")}
                          className={`px-2 py-2 rounded-lg text-[10px] font-extrabold transition-all duration-150 flex flex-col items-center gap-1 cursor-pointer ${
                            previewTab === "kot" ? "bg-white text-stone-950 shadow-sm border border-stone-200" : "text-stone-500 hover:text-stone-850"
                          }`}
                        >
                          <Utensils className="w-3.5 h-3.5" />
                          <span className="truncate">KOT Slip</span>
                        </button>

                        <button
                          onClick={() => setPreviewTab("customer-copy")}
                          className={`px-2 py-2 rounded-lg text-[10px] font-extrabold transition-all duration-150 flex flex-col items-center gap-1 cursor-pointer ${
                            previewTab === "customer-copy" ? "bg-white text-stone-950 shadow-sm border border-stone-200" : "text-stone-500 hover:text-stone-850"
                          }`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span className="truncate">Cust Copy</span>
                        </button>

                        <button
                          onClick={() => setPreviewTab("kitchen-copy")}
                          className={`px-2 py-2 rounded-lg text-[10px] font-extrabold transition-all duration-150 flex flex-col items-center gap-1 cursor-pointer ${
                            previewTab === "kitchen-copy" ? "bg-white text-stone-950 shadow-sm border border-stone-200" : "text-stone-500 hover:text-stone-850"
                          }`}
                        >
                          <Utensils className="w-3.5 h-3.5" />
                          <span className="truncate">Kit Copy</span>
                        </button>

                        <button
                          onClick={() => setPreviewTab("duplicate-copy")}
                          className={`px-2 py-2 rounded-lg text-[10px] font-extrabold transition-all duration-150 flex flex-col items-center gap-1 cursor-pointer ${
                            previewTab === "duplicate-copy" ? "bg-white text-stone-950 shadow-sm border border-stone-200" : "text-stone-500 hover:text-stone-850"
                          }`}
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span className="truncate">Duplicate</span>
                        </button>
                      </div>
                    </div>

                    {/* 2. Hardware configuration & width selection (Requirement 11) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200">
                      <div>
                        <label className="block text-[9px] text-stone-400 font-extrabold uppercase tracking-widest mb-1.5">Roll Width Sizing</label>
                        <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-200/50 rounded-lg">
                          <button
                            onClick={() => setAdminPrinterWidth("80mm")}
                            className={`py-1.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                              adminPrinterWidth === "80mm" ? "bg-white text-stone-900 shadow-xs" : "text-stone-500 hover:text-stone-800"
                            }`}
                          >
                            80mm (Standard)
                          </button>
                          <button
                            onClick={() => setAdminPrinterWidth("58mm")}
                            className={`py-1.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                              adminPrinterWidth === "58mm" ? "bg-white text-stone-900 shadow-xs" : "text-stone-500 hover:text-stone-800"
                            }`}
                          >
                            58mm (Compact)
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-[9px] text-stone-400 font-extrabold uppercase tracking-widest">Printer Interface Mode</label>
                          <span className="text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            NATIVE DESKTOP ACTIVE
                          </span>
                        </div>
                        <select
                          value={adminPrinterMode}
                          onChange={(e) => setAdminPrinterMode(e.target.value as any)}
                          className="w-full text-[10px] font-extrabold p-2 bg-white border border-stone-300 rounded-lg text-stone-800 focus:outline-none focus:border-[#C67C4E] h-[32px] cursor-pointer"
                        >
                          <option value="native">Native Windows RAW Spooler (Epson TM-T82X)</option>
                          <option value="fallback">System Fallback (Print Dialog)</option>
                          <option value="usb">Direct WebUSB (Raw ESC/POS)</option>
                          <option value="serial">Direct WebSerial COM (ESC/POS)</option>
                        </select>
                      </div>
                    </div>

                    {/* 3. Sliders and styling micro-adjustments (Requirement 11) */}
                    <div className="space-y-3 p-4 bg-stone-50/50 rounded-xl border border-stone-200/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest font-extrabold">2. Styling Micro-Adjustments</span>
                        <button
                          onClick={() => {
                            setFontScaling(100);
                            setMarginControl(8);
                            setCharacterDensity("normal");
                          }}
                          className="text-[8px] font-mono text-[#C67C4E] hover:underline uppercase font-bold cursor-pointer"
                        >
                          Reset Styles
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Font Scaling Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-stone-600">
                            <span>Font Scaling:</span>
                            <span className="font-bold">{fontScaling}%</span>
                          </div>
                          <input
                            type="range"
                            min="80"
                            max="120"
                            step="5"
                            value={fontScaling}
                            onChange={(e) => setFontScaling(Number(e.target.value))}
                            className="w-full h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-[#C67C4E]"
                          />
                        </div>

                        {/* Margin Control Slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-stone-600">
                            <span>Margin Control (Side Padding):</span>
                            <span className="font-bold">{marginControl}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="24"
                            step="2"
                            value={marginControl}
                            onChange={(e) => setMarginControl(Number(e.target.value))}
                            className="w-full h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-[#C67C4E]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                        {/* Character Density Options */}
                        <div>
                          <label className="block text-[8px] font-mono text-stone-400 uppercase font-bold mb-1">Character Density</label>
                          <div className="flex bg-stone-200 p-0.5 rounded-lg text-[9px] font-bold">
                            {(["compact", "normal", "spacious"] as const).map((d) => (
                              <button
                                key={d}
                                onClick={() => setCharacterDensity(d)}
                                className={`flex-1 py-1 text-center rounded transition-all capitalize cursor-pointer ${
                                  characterDensity === d ? "bg-white text-stone-900 shadow-xs" : "text-stone-500"
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Multiple Copies Counter */}
                        <div>
                          <label className="block text-[8px] font-mono text-stone-400 uppercase font-bold mb-1">Copies count</label>
                          <div className="flex items-center justify-between border border-stone-300 rounded-lg bg-white h-[26px]">
                            <button
                              onClick={() => setMultipleCopies(Math.max(1, multipleCopies - 1))}
                              className="px-2.5 text-stone-600 hover:text-stone-900 font-bold h-full border-r border-stone-200 cursor-pointer"
                            >
                              -
                            </button>
                            <span className="text-xs font-mono font-black text-stone-800">{multipleCopies}</span>
                            <button
                              onClick={() => setMultipleCopies(multipleCopies + 1)}
                              className="px-2.5 text-stone-600 hover:text-stone-900 font-bold h-full border-l border-stone-200 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Paper Zoom Slider */}
                        <div>
                          <label className="block text-[8px] font-mono text-stone-400 uppercase font-bold mb-1">UI Preview Zoom</label>
                          <div className="flex items-center justify-between border border-stone-300 rounded-lg bg-white h-[26px] px-2">
                            <input
                              type="range"
                              min="80"
                              max="120"
                              step="10"
                              value={zoomLevel}
                              onChange={(e) => setZoomLevel(Number(e.target.value))}
                              className="w-[60%] h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-[#C67C4E]"
                            />
                            <span className="text-[9px] font-mono font-bold text-stone-700">{zoomLevel}%</span>
                          </div>
                        </div>
                      </div>
                    </div>



                  </div>

                  {/* Print Actions Console Footer */}
                  <div className="space-y-2 pt-4 border-t border-stone-200 mt-5">
                    {printError && (
                      <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          <div className="text-[11px] font-bold leading-relaxed">
                            {printError}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1 border-t border-amber-200/80">
                          <button
                            type="button"
                            onClick={() => {
                              // Manual Browser Print Fallback
                              const isKotStyle = previewTab === "kot" || previewTab === "kitchen-copy";
                              PhysicalThermalPrinter.printPremiumHTML(
                                previewTab,
                                isKotStyle ? matchedKot : showBillPrint,
                                settings,
                                {
                                  paperWidth: adminPrinterWidth,
                                  marginControl,
                                  characterDensity,
                                  fontScaling,
                                  multipleCopies,
                                  logoUrl,
                                  customFooter,
                                  showWatermark: previewTab === "duplicate-copy" ? "duplicate" : previewTab === "customer-copy" ? "customer" : previewTab === "kitchen-copy" ? "kitchen" : "none",
                                  showQrCode,
                                  showBarcode,
                                  printCount: currentPrintCount + 1,
                                  showSignature
                                }
                              );
                              setPrintError(null);
                            }}
                            className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Browser Print (Manual Fallback)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDirectPrint(previewTab)}
                            className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Retry Direct QZ Print</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        disabled={isPrinting}
                        onClick={() => handleDirectPrint(previewTab)}
                        className="py-3 bg-stone-900 hover:bg-stone-850 text-white rounded-xl text-xs font-bold tracking-wide transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <Printer className="h-4 w-4" />
                        {isPrinting ? "Printing dispatch..." : `Print Selected ${previewTab.replace("-", " ").toUpperCase()}`}
                      </button>

                      <button
                        disabled={isPrinting}
                        onClick={handlePrintBothSequential}
                        className="py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-md"
                      >
                        <Activity className="h-4 w-4" />
                        {isPrinting ? "Sequential active..." : "Sequential Auto-Print (Both)"}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 select-none">
                      <button
                        onClick={handleDownloadHTML}
                        className="py-2 bg-stone-100 text-stone-700 hover:bg-stone-200 hover:text-stone-950 rounded-lg text-[10.5px] font-bold transition-all flex items-center justify-center gap-1.5 border border-stone-200 cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download Print HTML
                      </button>

                      <button
                        onClick={() => setShowBillPrint(null)}
                        className="py-2 bg-stone-100 text-stone-600 hover:text-stone-900 hover:bg-stone-200 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer"
                      >
                        Close Station
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Panel: Interactive WYSIWYG Thermal Mockup (45% width) */}
                <div className="w-full md:w-[45%] bg-stone-800 p-6 overflow-y-auto flex flex-col items-center justify-start select-text relative">
                  
                  {/* Decorative hardware elements */}
                  <div className="absolute top-2 right-2 flex gap-1 select-none text-[8.5px] font-mono text-stone-400">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> ONLINE
                  </div>

                  <div className="text-center space-y-1 mb-5 select-none">
                    <h4 className="text-[10px] font-mono font-extrabold text-stone-400 uppercase tracking-widest">
                      Live WYSIWYG Thermal Facsimile
                    </h4>
                    <p className="text-[9px] text-stone-500 font-sans leading-none">
                      What You See Is What You Get • Real-time Spool preview
                    </p>
                  </div>

                  {/* Dark / Light simulated paper toggle switch */}
                  <div className="flex items-center gap-3 bg-stone-900/60 p-1.5 rounded-lg border border-stone-700 mb-6 select-none">
                    <span className="text-[9.5px] font-mono text-stone-300 font-bold">Simulated Paper Mode:</span>
                    <button
                      onClick={() => setDarkPreview(false)}
                      className={`px-3 py-1 rounded text-[9px] font-black transition-all cursor-pointer ${
                        !darkPreview ? "bg-[#fafaf9] text-stone-900 shadow-sm" : "text-stone-400 hover:text-stone-200"
                      }`}
                    >
                      Classic Paper
                    </button>
                    <button
                      onClick={() => setDarkPreview(true)}
                      className={`px-3 py-1 rounded text-[9px] font-black transition-all cursor-pointer ${
                        darkPreview ? "bg-stone-800 text-stone-100 shadow-sm border border-stone-700" : "text-stone-400 hover:text-stone-200"
                      }`}
                    >
                      Dark Glow
                    </button>
                  </div>

                  {/* Physical Receipt Facsimile Envelope */}
                  <div 
                    style={{ transform: `scale(${zoomLevel / 100})` }}
                    className="w-full max-w-[310px] transition-transform duration-150 origin-top select-all shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
                  >
                    <div className="relative rounded-t-sm rounded-b-md overflow-hidden bg-white">
                      
                      {/* Top feed-line shadow */}
                      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-b from-stone-400/40 to-transparent z-20 pointer-events-none" />
                      
                      {/* Live rendered HTML content directly! */}
                      <div 
                        dangerouslySetInnerHTML={{ __html: liveReceiptHTML }} 
                        className="w-full overflow-x-hidden"
                      />

                      {/* Bottom tear indicator */}
                      <div className="border-t border-dashed border-stone-300/40 pt-2 pb-1.5 text-center bg-stone-100 select-none">
                        <span className="text-[8px] font-bold text-stone-400 tracking-widest font-mono uppercase block">
                          ✂️ {adminPrinterWidth} ROLL DISPATCH SPOOL • AUTO CUT ✂️
                        </span>
                      </div>

                      {/* Torn paper jagged teeth */}
                      <div className="absolute -bottom-1 inset-x-0 h-1.5 flex select-none pointer-events-none z-10">
                        {Array.from({ length: 30 }).map((_, i) => (
                          <div
                            key={i}
                            className="w-full h-0 border-t-[5px] border-t-white border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent"
                          />
                        ))}
                      </div>

                    </div>
                  </div>

                  {/* Paper Spacing Helper */}
                  <div className="h-10"></div>

                </div>

              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* DETAIL MODAL: MENU ITEM ADD/EDIT WORKBENCH */}
      <AnimatePresence>
        {showMenuModal && editingMenuItem && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }} onClick={() => setShowMenuModal(false)} className="fixed inset-0 bg-[#0c0a09]/45 z-40 backdrop-blur-xs" />
            
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-4 max-w-lg mx-auto my-auto h-fit bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 z-50 shadow-2xl overflow-y-auto max-h-[85vh]">
              
              <div className="flex justify-between items-start border-b border-stone-200 pb-4 mb-4 select-none">
                <div>
                  <h3 className="text-base font-serif font-bold text-stone-900 uppercase tracking-wider">
                    {editingMenuItem.id ? "Edit Culinary Item Properties" : "Introduce New Dish Recipe"}
                  </h3>
                  <p className="text-xs text-stone-500 font-sans">Modify menus rendered in the client storefront.</p>
                </div>
                <button onClick={() => setShowMenuModal(false)} className="p-1 text-stone-400 hover:text-stone-900 cursor-pointer">✕</button>
              </div>

              <form onSubmit={handleSaveMenuItem} className="space-y-4 text-xs font-sans text-stone-700">
                
                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-stone-400 uppercase tracking-widest block">DISH NAME</label>
                  <input
                    required
                    type="text"
                    value={editingMenuItem.name || ""}
                    onChange={(e) => setEditingMenuItem({ ...editingMenuItem, name: e.target.value })}
                    className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-bold text-stone-400 uppercase tracking-widest block">PRICE AMOUNT (₹)</label>
                    <input
                      required
                      type="number"
                      value={editingMenuItem.price || ""}
                      onChange={(e) => setEditingMenuItem({ ...editingMenuItem, price: Number(e.target.value) })}
                      className="w-full bg-[#FAF6F0]/65 border border-stone-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-bold text-[#C67C4E] uppercase tracking-widest block">CATALOG CATEGORY</label>
                    <select
                      value={editingMenuItem.category || (categoriesList[0]?.id || "soups")}
                      onChange={(e) => setEditingMenuItem({ ...editingMenuItem, category: e.target.value })}
                      className="w-full bg-[#FAF6F0]/65 border border-stone-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-700 font-sans cursor-pointer"
                    >
                      {categoriesList.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-bold text-stone-400 uppercase tracking-widest block font-sans">SPICINESS LEVEL (0 - 3)</label>
                    <input
                      type="number"
                      min={0}
                      max={3}
                      value={editingMenuItem.spiciness || 0}
                      onChange={(e) => setEditingMenuItem({ ...editingMenuItem, spiciness: Number(e.target.value) })}
                      className="w-full bg-[#FAF6F0]/65 border border-stone-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans font-semibold"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-bold text-stone-400 uppercase tracking-widest block font-sans">DISH IMAGE URL</label>
                    <input
                      type="text"
                      placeholder="https://..."
                      value={editingMenuItem.imageUrl || ""}
                      onChange={(e) => setEditingMenuItem({ ...editingMenuItem, imageUrl: e.target.value })}
                      className="w-full bg-[#FAF6F0]/65 border border-stone-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-stone-400 uppercase tracking-widest block">DISH RECIPE DESCRIPTION</label>
                  <textarea
                    rows={2}
                    value={editingMenuItem.description || ""}
                    onChange={(e) => setEditingMenuItem({ ...editingMenuItem, description: e.target.value })}
                    className="w-full bg-[#FAF6F0]/65 border border-stone-200 p-3 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 resize-none font-sans"
                  />
                </div>

                {/* Switch toggles */}
                <div className="flex flex-wrap gap-4 select-none pt-2">
                  <label className="flex items-center gap-2.5 text-xs text-stone-600 cursor-pointer font-sans font-semibold">
                    <input
                      type="checkbox"
                      checked={editingMenuItem.isVeg !== false}
                      onChange={(e) => setEditingMenuItem({ ...editingMenuItem, isVeg: e.target.checked })}
                      className="accent-[#C67C4E] w-4 h-4 rounded"
                    />
                    Pure Vegetarian Item
                  </label>
                  
                  <label className="flex items-center gap-2.5 text-xs text-stone-600 cursor-pointer font-sans font-semibold">
                    <input
                      type="checkbox"
                      checked={!!editingMenuItem.isBestseller}
                      onChange={(e) => setEditingMenuItem({ ...editingMenuItem, isBestseller: e.target.checked })}
                      className="accent-[#C67C4E] w-4 h-4 rounded"
                    />
                    Mark Bestseller
                  </label>
 
                  <label className="flex items-center gap-2.5 text-xs text-stone-600 cursor-pointer font-sans font-semibold">
                    <input
                      type="checkbox"
                      checked={!!editingMenuItem.isChefSpecial}
                      onChange={(e) => setEditingMenuItem({ ...editingMenuItem, isChefSpecial: e.target.checked })}
                      className="accent-[#C67C4E] w-4 h-4 rounded"
                    />
                    Mark Chef Selection
                  </label>
                </div>

                <div className="flex justify-end gap-2 text-xs pt-4 select-none font-sans">
                  <button
                    type="button"
                    onClick={() => setShowMenuModal(false)}
                    className="px-4 py-2 bg-stone-50 border border-stone-200 text-stone-550 rounded-xl hover:text-stone-900 hover:bg-stone-100 cursor-pointer font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#C67C4E] text-white font-bold rounded-xl hover:bg-[#aa7c11] cursor-pointer shadow-sm"
                  >
                    Authorize Changes
                  </button>
                </div>

              </form>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* DETAIL MODAL: COUPON CODE ADD/EDIT */}
      <AnimatePresence>
        {showCouponModal && editingCoupon && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }} onClick={() => setShowCouponModal(false)} className="fixed inset-0 bg-[#0c0a09]/45 z-40 backdrop-blur-xs" />
            
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-4 max-w-sm mx-auto my-auto h-fit bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 z-50 shadow-2xl">
              
              <div className="flex justify-between items-start border-b border-stone-200 pb-4 mb-4 select-none">
                <div>
                  <h3 className="text-base font-serif font-bold text-stone-900 uppercase tracking-wider">Configure Coupon Promo</h3>
                  <p className="text-xs text-stone-500 font-sans font-medium">Design customer reward coupons.</p>
                </div>
                <button onClick={() => setShowCouponModal(false)} className="p-1 text-stone-400 hover:text-stone-900 cursor-pointer">✕</button>
              </div>

              <form onSubmit={handleSaveCoupon} className="space-y-4 text-xs font-sans text-stone-700">
                
                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-stone-400 uppercase tracking-widest block">COUPON CODE (UPPERCASE)</label>
                  <input
                    required
                    type="text"
                    value={editingCoupon.code || ""}
                    onChange={(e) => setEditingCoupon({ ...editingCoupon, code: e.target.value.toUpperCase() })}
                    placeholder="E.G. FESTIVE50"
                    className="w-full bg-[#FAF6F0]/65 border border-stone-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-mono font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-bold text-[#C67C4E] uppercase tracking-widest block font-sans">TYPE</label>
                    <select
                      value={editingCoupon.type || "percentage"}
                      onChange={(e) => setEditingCoupon({ ...editingCoupon, type: e.target.value as any })}
                      className="w-full bg-[#FAF6F0]/65 border border-stone-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-700 font-sans"
                    >
                      <option value="percentage">Percentage Off</option>
                      <option value="fixed">Fixed Sum Off</option>
                    </select>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-bold text-stone-450 uppercase tracking-widest block font-sans">REWARD VALUE</label>
                    <input
                      required
                      type="number"
                      value={editingCoupon.value || ""}
                      onChange={(e) => setEditingCoupon({ ...editingCoupon, value: Number(e.target.value) })}
                      placeholder="E.G. 20 for 20%"
                      className="w-full bg-[#FAF6F0]/65 border border-stone-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-bold text-stone-400 uppercase tracking-widest block font-sans font-bold">USAGE LIMIT</label>
                    <input
                      type="number"
                      value={editingCoupon.usageLimit || 100}
                      onChange={(e) => setEditingCoupon({ ...editingCoupon, usageLimit: Number(e.target.value) })}
                      className="w-full bg-[#FAF6F0]/65 border border-stone-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-mono font-bold"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-sans font-bold text-stone-400 uppercase tracking-widest block font-sans font-bold">MIN AMOUNT VALUE (₹)</label>
                    <input
                      type="number"
                      value={editingCoupon.minOrderAmount || 0}
                      onChange={(e) => setEditingCoupon({ ...editingCoupon, minOrderAmount: Number(e.target.value) })}
                      className="w-full bg-[#FAF6F0]/65 border border-stone-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-stone-400 uppercase tracking-widest block font-sans font-bold">EXPIRATION DATE</label>
                  <input
                    type="date"
                    value={editingCoupon.expiryDate || ""}
                    onChange={(e) => setEditingCoupon({ ...editingCoupon, expiryDate: e.target.value })}
                    className="w-full bg-[#FAF6F0]/65 border border-stone-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-sans text-left"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 select-none font-sans">
                  <button
                    type="button"
                    onClick={() => setShowCouponModal(false)}
                    className="px-4 py-2 bg-stone-50 border border-stone-200 text-stone-550 rounded-xl hover:text-stone-900 hover:bg-stone-100 cursor-pointer font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#C67C4E] text-white font-bold rounded-xl hover:bg-[#aa7c11] cursor-pointer shadow-sm"
                  >
                    Authorize Promo
                  </button>
                </div>

              </form>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* DETAIL MODAL: STOCK RESTOCK DIALOG */}
      <AnimatePresence>
        {showRestockModal && selectedInventoryItem && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }} onClick={() => setShowRestockModal(false)} className="fixed inset-0 bg-[#0c0a09]/45 z-40 backdrop-blur-xs" />
            
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-4 max-w-sm mx-auto my-auto h-fit bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 z-50 shadow-2xl">
              
              <div className="flex justify-between items-start border-b border-stone-200 pb-4 mb-4 select-none">
                <div>
                  <h3 className="text-base font-serif font-bold text-stone-900 uppercase tracking-wider">Refill Inventory Allocation</h3>
                  <p className="text-xs text-stone-500 font-sans">Record supplier restock quantities.</p>
                </div>
                <button onClick={() => setShowRestockModal(false)} className="p-1 text-stone-400 hover:text-stone-900 cursor-pointer">✕</button>
              </div>

              <form onSubmit={handleRestockSave} className="space-y-4 text-xs font-sans text-stone-700">
                
                <div className="bg-[#FAF6F0] p-4 rounded-xl border border-stone-200 text-center font-sans">
                  <p className="text-stone-400 uppercase text-[10px] font-bold tracking-widest font-sans">CURRENT STOCK POSITION</p>
                  <p className="text-sm font-bold text-stone-900 mt-1">{selectedInventoryItem.name}</p>
                  <p className="text-base font-bold text-[#C67C4E] mt-1.5 font-mono">{selectedInventoryItem.stock} {selectedInventoryItem.unit} left</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-stone-450 uppercase tracking-widest block">QUANTITY TO DISPENSE ({selectedInventoryItem.unit})</label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={restockAmount}
                    onChange={(e) => setRestockAmount(Number(e.target.value))}
                    className="w-full bg-[#FAF6F0]/65 border border-stone-200 px-4 py-2 text-xs rounded-xl focus:outline-none focus:border-[#C67C4E] text-stone-900 font-mono font-bold"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 select-none font-sans">
                  <button
                    type="button"
                    onClick={() => setShowRestockModal(false)}
                    className="px-4 py-2 bg-stone-50 border border-stone-200 text-stone-500 rounded-xl hover:text-stone-900 hover:bg-stone-100 cursor-pointer font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#C67C4E] text-white font-bold rounded-xl hover:bg-[#aa7c11] cursor-pointer shadow-sm"
                  >
                    Confirm Refill
                  </button>
                </div>

              </form>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* BULK IMPORTER MODAL */}
      <AnimatePresence>
        {showBulkImportModal && (
          <BulkMenuImporter 
            onClose={() => setShowBulkImportModal(false)} 
            onImportSuccess={async () => {
              try {
                const items = await LocalDB.fetchMenuItems();
                setMenuItems(items);
              } catch (_) {
                setMenuItems(LocalDB.getMenuItems());
              }
              setShowBulkImportModal(false);
            }} 
          />
        )}
      </AnimatePresence>

      {/* STAFF USER MANUAL MODAL */}
      <AnimatePresence>
        {showManualPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs select-none"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#FAF9F5] w-full max-w-4xl h-[85vh] rounded-2xl border border-stone-200 flex flex-col overflow-hidden shadow-2xl text-left"
            >
              {/* Header */}
              <div className="bg-stone-900 text-white p-4 flex justify-between items-center border-b border-stone-850">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#aa7c11] rounded-lg flex items-center justify-center text-white">
                    <BookOpen className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-serif font-bold uppercase tracking-wider">webrajya pos portal</h3>
                    <p className="text-[10px] font-mono text-stone-400">STAFF USER OPERATING GUIDE (PDF SEED ACTIVE)</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadUserManual}
                    className="px-3 py-1.5 bg-[#aa7c11] hover:bg-[#c39121] text-white rounded-lg text-[10px] font-mono tracking-wider uppercase font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-[#aa7c11]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Get PDF Manual</span>
                  </button>
                  <button
                    onClick={() => setShowManualPreview(false)}
                    className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-400 hover:text-white transition-all cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Main Content Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Intro Section */}
                <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-2xs space-y-2">
                  <h4 className="text-base font-serif font-bold text-[#aa7c11] uppercase tracking-wide">1. Welcome to WebRajya POS Engine</h4>
                  <p className="text-xs text-stone-650 leading-relaxed font-sans">
                    The WebRajya POS Digital Menu Portal integrates real-time tableside guest ordering, high-performance kitchen dispatch coordination, and full financial oversight into a single operational workspace. This manual guides restaurant staff in managing the daily lifecycle of menu operations, guest orders, print queues, and system analytics.
                  </p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
                    <div className="bg-stone-50 p-3 rounded-lg border border-stone-150 text-center">
                      <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">App Version</span>
                      <span className="text-xs font-bold text-stone-900 font-mono">2.4.0 (Active)</span>
                    </div>
                    <div className="bg-stone-50 p-3 rounded-lg border border-stone-150 text-center">
                      <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">State Type</span>
                      <span className="text-xs font-bold text-stone-900 font-mono">Memory-Sync</span>
                    </div>
                    <div className="bg-stone-50 p-3 rounded-lg border border-stone-150 text-center">
                      <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">Database Server</span>
                      <span className="text-xs font-bold text-stone-900 font-mono">Supabase Online</span>
                    </div>
                    <div className="bg-stone-50 p-3 rounded-lg border border-stone-150 text-center">
                      <span className="text-[10px] font-mono text-stone-400 uppercase tracking-wider block">Security Level</span>
                      <span className="text-xs font-bold text-[#aa7c11] font-mono">HMAC SHA256</span>
                    </div>
                  </div>
                </div>

                {/* Grid Sections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Menu Management */}
                  <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                      <Utensils className="w-4 h-4 text-[#aa7c11]" />
                      <h4 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider font-bold">2. Menu & Catalog Management</h4>
                    </div>
                    <ul className="space-y-2.5 text-xs text-stone-605 font-sans">
                      <li>
                        <strong className="text-stone-900 block font-bold">A. Adding or Editing Items:</strong>
                        Go to the Menu Catalog tab. Click "+ Deploy New Item" to create one. Provide title, categories, price (INR), tags, and descriptions.
                      </li>
                      <li>
                        <strong className="text-stone-900 block font-bold">B. Instant Stock Toggling:</strong>
                        Locate items in your list and toggle the Stock checkbox. Disabled items are hidden immediately on the guest mobile menu to prevent ordering depleted items.
                      </li>
                      <li>
                        <strong className="text-stone-900 block font-bold">C. Highlighting Specials:</strong>
                        Mark items as Chef Specials to automatically display premium golden sparkle badges on the digital menu.
                      </li>
                    </ul>
                  </div>

                  {/* Order Handling */}
                  <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                      <ShoppingCart className="w-4 h-4 text-[#aa7c11]" />
                      <h4 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider font-bold">3. Order Lifecycle Handling</h4>
                    </div>
                    <ul className="space-y-2.5 text-xs text-stone-605 font-sans">
                      <li>
                        <strong className="text-stone-900 block font-bold">A. New Pending Orders:</strong>
                        Upon tableside checkouts, a gold banner pops up with a sound chime. Inspect, then click "Accept Order" to dispatch to the kitchen.
                      </li>
                      <li>
                        <strong className="text-stone-900 block font-bold">B. Kitchen Preparation (KDS):</strong>
                        Accepted orders sync instantly to the Kitchen Dashboard where chefs see timers and prep indicators.
                      </li>
                      <li>
                        <strong className="text-stone-900 block font-bold">C. Order Complete:</strong>
                        Once cooked, chefs click "Mark Ready". Front-of-house staff processes payment (UPI/Cash/Card) and prints the bill.
                      </li>
                    </ul>
                  </div>

                  {/* Print Preview Screen */}
                  <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                      <Printer className="w-4 h-4 text-[#aa7c11]" />
                      <h4 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider font-bold">4. Using the Print Preview Screen</h4>
                    </div>
                    <ul className="space-y-2.5 text-xs text-stone-605 font-sans">
                      <li>
                        <strong className="text-stone-900 block font-bold">A. Selecting Copy Type:</strong>
                        Under POS dispatcher, view real-time receipt copies: Kitchen KOT (giant font for chefs) or Customer Bill (with packing charges, GST, and subtotals).
                      </li>
                      <li>
                        <strong className="text-stone-900 block font-bold">B. Direct System Print:</strong>
                        Launch the OS print system directly with tailored margin and font size controls (50% to 150%) optimized for 58mm & 80mm thermal printers.
                      </li>
                      <li>
                        <strong className="text-stone-900 block font-bold">C. Reprint Operations:</strong>
                        Every reprint event requires authentication and creates a secure log inside the Audit ledger.
                      </li>
                    </ul>
                  </div>

                  {/* Dashboard Navigation */}
                  <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                      <ShieldCheck className="w-4 h-4 text-[#aa7c11]" />
                      <h4 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider font-bold">5. Dashboard Navigation & Audits</h4>
                    </div>
                    <ul className="space-y-2.5 text-xs text-stone-605 font-sans">
                      <li>
                        <strong className="text-stone-900 block font-bold">A. Operational Analytics:</strong>
                        View live daily gross revenue, total tables occupied, average transaction value, and real-time customer volumes.
                      </li>
                      <li>
                        <strong className="text-stone-900 block font-bold">B. Promo Coupon Creation:</strong>
                        Navigate to Promo Coupons, create seasonal vouchers (e.g. WELCOME50), and set validation bounds.
                      </li>
                      <li>
                        <strong className="text-stone-900 block font-bold">C. Security Audits:</strong>
                        View the immutable audit trail detailing staff logins, configuration updates, and print event telemetry.
                      </li>
                    </ul>
                  </div>

                </div>

              </div>

              {/* Footer */}
              <div className="bg-stone-50 border-t border-stone-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] font-mono text-stone-450 uppercase tracking-wider">
                <span>webrajya pos portal • all rights reserved</span>
                <span className="text-stone-500 font-bold">confidential internal staff manual</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MENU CATEGORIES MANAGEMENT MODAL */}
      <AnimatePresence>
        {showCategoriesModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs select-none"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#FAF9F5] w-full max-w-3xl h-[80vh] rounded-2xl border border-stone-200 flex flex-col overflow-hidden shadow-2xl text-left"
            >
              {/* Header */}
              <div className="bg-stone-900 text-white p-4 flex justify-between items-center border-b border-stone-850">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[#d4af37] rounded-lg flex items-center justify-center text-white">
                    <Settings className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-serif font-bold uppercase tracking-wider">webrajya pos category hub</h3>
                    <p className="text-[10px] font-mono text-stone-400">DEPLOY OR TEARDOWN SYSTEM CATEGORIES</p>
                  </div>
                </div>
                
                <button
                  onClick={() => setShowCategoriesModal(false)}
                  className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-400 hover:text-white transition-all cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-5 gap-6">
                
                {/* Left Side: Current Categories List */}
                <div className="md:col-span-3 space-y-4">
                  <h4 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider border-b border-stone-200 pb-2">
                    Active Categories ({categoriesList.length})
                  </h4>
                  
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {categoriesList.length === 0 ? (
                      <p className="text-xs text-stone-400 italic">No categories deployed. Create one on the right.</p>
                    ) : (
                      categoriesList.map((cat) => (
                        <div key={cat.id} className="bg-white p-3 rounded-xl border border-stone-200 flex items-center justify-between gap-3 shadow-2xs hover:border-amber-300 transition-all">
                          <div className="flex items-center gap-3 truncate">
                            <span className="text-xl p-1 bg-stone-50 rounded-lg border border-stone-100 flex-shrink-0">{cat.icon}</span>
                            <div className="truncate">
                              <h5 className="text-xs font-bold text-stone-900 flex items-center gap-1.5 font-sans">
                                {cat.name}
                                <span className="text-[9px] font-mono text-stone-400 font-normal">({cat.id})</span>
                              </h5>
                              <p className="text-[10px] text-stone-500 truncate mt-0.5">{cat.description}</p>
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat.id, cat.name)}
                            className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer flex-shrink-0"
                            title="Delete category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right Side: Create Category Form */}
                <form onSubmit={handleSaveCategory} className="md:col-span-2 space-y-4 bg-white p-4 rounded-xl border border-stone-200 shadow-2xs">
                  <h4 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider border-b border-stone-200 pb-2">
                    + Deploy New Category
                  </h4>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest block">CATEGORY NAME</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Desserts"
                      value={newCategoryName}
                      onChange={(e) => {
                        setNewCategoryName(e.target.value);
                        // Auto-generate ID if empty
                        if (!newCategoryId) {
                          setNewCategoryId(e.target.value.toLowerCase().replace(/\s+/g, "-"));
                        }
                      }}
                      className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37] text-stone-900 font-sans"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest block font-sans">SLUG / UNIQUE ID</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. desserts"
                      value={newCategoryId}
                      onChange={(e) => setNewCategoryId(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                      className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37] text-stone-900 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest block font-sans">EMOJI ICON</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. 🍰"
                      value={newCategoryIcon}
                      onChange={(e) => setNewCategoryIcon(e.target.value)}
                      className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37] text-stone-900 font-sans"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest block font-sans">DESCRIPTION</label>
                    <textarea
                      placeholder="Sweet and delicious desserts to finish..."
                      value={newCategoryDesc}
                      onChange={(e) => setNewCategoryDesc(e.target.value)}
                      rows={2}
                      className="w-full bg-[#FAF6F0]/60 border border-stone-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:border-[#d4af37] text-stone-900 font-sans resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-[#d4af37] hover:bg-[#C67C4E] text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer focus:outline-none shadow-sm font-sans"
                  >
                    Deploy Category
                  </button>
                </form>

              </div>

              {/* Footer */}
              <div className="bg-stone-50 border-t border-stone-200 px-6 py-4 flex items-center justify-between text-[10px] font-mono text-stone-450 uppercase tracking-wider">
                <span>webrajya pos portal</span>
                <span className="text-amber-600 font-bold">dynamic catalog syncing</span>
              </div>
            </motion.div>
          </motion.div>
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
          const updatedTables = LocalDB.getTables();
          setTables(updatedTables);
          const updatedOrders = LocalDB.getOrders();
          setOrders(updatedOrders);
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
          currentUser="Admin"
          onOrderUpdated={(updatedOrder) => {
            const updatedOrders = LocalDB.getOrders();
            setOrders(updatedOrders);
            const updatedTables = LocalDB.getTables();
            setTables(updatedTables);
            setSplitTargetOrder(updatedOrder);
          }}
        />
      )}

    </div>
  );
}

// Sidebar Button component helper to keep views modular & pretty
interface SidebarBtnProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  count?: number;
  alertColor?: string;
  onClick: () => void;
}

function SidebarBtn({ icon, label, active, count, alertColor = "bg-red-500", onClick }: SidebarBtnProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-xs font-bold uppercase tracking-wider py-2.5 px-3.5 rounded-xl flex items-center justify-between transition-all cursor-pointer select-none focus:outline-none ${active ? "bg-[#aa7c11] text-white shadow-[0_4px_15px_rgba(170,124,17,0.15)]" : "text-stone-605 hover:text-stone-900 hover:bg-stone-100"}`}
    >
      <div className="flex items-center gap-2.5">
        {React.cloneElement(icon as React.ReactElement, { className: "w-4 h-4" })}
        <span>{label}</span>
      </div>
      
      {count !== undefined && count > 0 && (
        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full text-white font-black animate-pulse ${alertColor}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// Mobile Grid Navigation Button helper
interface MobileGridBtnProps {
  id: string;
  label: string;
  active?: boolean;
  icon: React.ReactNode;
  count?: number;
  alertColor?: string;
  onClick: () => void;
}

function MobileGridBtn({ id, label, active, icon, count, alertColor = "bg-red-500", onClick }: MobileGridBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1.8 border rounded-lg text-[9px] font-sans font-bold uppercase tracking-wider flex items-center justify-between transition-all cursor-pointer ${
        active 
          ? "bg-[#aa7c11] text-white border-[#aa7c11] shadow-[0_2px_8px_rgba(170,124,17,0.2)]" 
          : "bg-stone-50 text-stone-600 border-stone-200 hover:border-stone-300 hover:bg-stone-100"
      }`}
    >
      <div className="flex items-center gap-1.5 truncate">
        {React.cloneElement(icon as React.ReactElement, { className: "w-3 h-3 flex-shrink-0" })}
        <span className="truncate">{label}</span>
      </div>
      {count !== undefined && count > 0 && (
        <span className={`text-[8px] font-mono px-1 py-0.2 rounded-full text-white font-black ml-1.5 ${alertColor}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// Stat Card helper layout
function AnalyticsStatCard({ title, count, change, highlight = false, badgeColor = "bg-stone-100 text-stone-500" }: { title: string; count: any; change: string; highlight?: boolean; badgeColor?: string }) {
  return (
    <div className={`p-4.5 rounded-2xl border transition-colors ${highlight ? "bg-gradient-to-br from-white to-amber-50/40 border-amber-300/30 shadow-md" : "bg-white border-stone-200 hover:border-stone-300 shadow-xs"}`}>
      <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest block">{title}</span>
      <h3 className={`text-xl sm:text-2xl font-mono font-bold mt-1.5 ${highlight ? "text-[#aa7c11]" : "text-stone-900"}`}>{count}</h3>
      <span className={`inline-block text-[9px] font-mono mt-1 px-1.5 py-0.5 rounded ${badgeColor}`}>{change}</span>
    </div>
  );
}
