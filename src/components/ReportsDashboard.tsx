import React, { useState, useMemo, useEffect } from "react";
import {
  BarChart3, Calendar, Download, Printer, RefreshCw, TrendingUp, TrendingDown,
  DollarSign, ShoppingBag, PieChart as PieChartIcon, Clock, Layers, Utensils,
  ChevronRight, AlertCircle, ArrowUpRight, ArrowDownRight, CheckCircle2,
  FileSpreadsheet, Filter, Search, Sparkles, X, Check, Landmark, Lock,
  MessageCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from "recharts";
import { Order, LocalDB, RestaurantSettings } from "../lib/db";
import { MenuItem, Category } from "../types";
import WhatsAppDailySummaryModal from "./WhatsAppDailySummaryModal";
import {
  DateRangePreset, DateRange, calculateDateRange, filterOrdersByDateRange,
  computeSalesMetrics, computeDailySales, computeMonthlySales, computeYearlySales,
  computeOrderTypeBreakdown, computePaymentMethodBreakdown, computeTopSellingItems,
  computeCategoryBreakdown, computeHourlySales, exportOrdersToCSV, isValidOrder, getOrderDate,
  getLocalDateKey
} from "../lib/reports";

interface ReportsDashboardProps {
  orders: Order[];
  menuItems: MenuItem[];
  categories: Category[];
  settings?: RestaurantSettings;
  onUpdateSettings?: (settings: RestaurantSettings) => void;
  onRefreshOrders?: () => Promise<void>;
  initialSubTab?: "overview" | "daily" | "monthly" | "yearly" | "items" | "categories" | "ledger" | "shifts";
  onSubTabChange?: (tab: "overview" | "daily" | "monthly" | "yearly" | "items" | "categories" | "ledger" | "shifts") => void;
}

export default function ReportsDashboard({
  orders,
  menuItems,
  categories,
  settings: propSettings,
  onUpdateSettings,
  onRefreshOrders,
  initialSubTab = "overview",
  onSubTabChange
}: ReportsDashboardProps) {
  const settings = propSettings || LocalDB.getSettings();
  // Sub-tabs: "overview" | "daily" | "monthly" | "yearly" | "items" | "categories" | "ledger" | "shifts"
  const [activeTab, setActiveTab] = useState<
    "overview" | "daily" | "monthly" | "yearly" | "items" | "categories" | "ledger" | "shifts"
  >(initialSubTab);

  useEffect(() => {
    if (initialSubTab && initialSubTab !== activeTab) {
      setActiveTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleSubTabClick = (tab: "overview" | "daily" | "monthly" | "yearly" | "items" | "categories" | "ledger" | "shifts") => {
    setActiveTab(tab);
    onSubTabChange?.(tab);
  };

  // Date Filter State
  const [preset, setPreset] = useState<DateRangePreset>("last_30_days");
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalDateKey(d);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => {
    return getLocalDateKey(new Date());
  });

  // Selected year for Monthly Tab
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Search & Filters inside specific tabs
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [selectedItemCategory, setSelectedItemCategory] = useState("All");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState("All");
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState("All");

  // Loading & refreshing state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  // Compute Active Date Range
  const dateRange: DateRange = useMemo(() => {
    return calculateDateRange(preset, customStart, customEnd);
  }, [preset, customStart, customEnd]);

  // Filter Orders for the active date range
  const filteredOrders = useMemo(() => {
    return filterOrdersByDateRange(orders, dateRange);
  }, [orders, dateRange]);

  // Compute Summary Metrics
  const metrics = useMemo(() => {
    return computeSalesMetrics(orders, filteredOrders);
  }, [orders, filteredOrders]);

  // Compute Daily Sales
  const dailySales = useMemo(() => {
    return computeDailySales(filteredOrders, dateRange);
  }, [filteredOrders, dateRange]);

  // Compute Monthly Sales for the selected year
  const monthlySales = useMemo(() => {
    return computeMonthlySales(orders, selectedYear);
  }, [orders, selectedYear]);

  // Compute Yearly Sales
  const yearlySales = useMemo(() => {
    return computeYearlySales(orders);
  }, [orders]);

  // Available Years list from orders
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(new Date().getFullYear());
    orders.forEach(o => {
      if (o.createdAt) {
        const y = new Date(o.createdAt).getFullYear();
        if (!isNaN(y)) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [orders]);

  // Order Type Breakdown
  const orderTypeData = useMemo(() => {
    return computeOrderTypeBreakdown(filteredOrders);
  }, [filteredOrders]);

  // Payment Method Breakdown
  const paymentMethodData = useMemo(() => {
    return computePaymentMethodBreakdown(filteredOrders);
  }, [filteredOrders]);

  // Top Selling Items
  const topSellingItems = useMemo(() => {
    return computeTopSellingItems(filteredOrders, menuItems);
  }, [filteredOrders, menuItems]);

  // Top Categories Breakdown
  const categoryData = useMemo(() => {
    return computeCategoryBreakdown(filteredOrders, menuItems, categories);
  }, [filteredOrders, menuItems, categories]);

  // Hourly Distribution
  const hourlyData = useMemo(() => {
    return computeHourlySales(filteredOrders);
  }, [filteredOrders]);

  // Filtered Item records for the Items Tab
  const filteredItemsTabList = useMemo(() => {
    return topSellingItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
                            item.category.toLowerCase().includes(itemSearchQuery.toLowerCase());
      const matchesCat = selectedItemCategory === "All" || item.category === selectedItemCategory;
      return matchesSearch && matchesCat;
    });
  }, [topSellingItems, itemSearchQuery, selectedItemCategory]);

  // Categories list for Items Tab filter
  const itemCategoryList = useMemo(() => {
    const set = new Set(topSellingItems.map(i => i.category));
    return ["All", ...Array.from(set)];
  }, [topSellingItems]);

  // Filtered Ledger Orders
  const filteredLedgerOrders = useMemo(() => {
    return filteredOrders.filter(o => {
      const matchesSearch = 
        o.id.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        (o.customerName || "").toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        (o.phoneNumber || "").includes(ledgerSearch);
      
      const matchesStatus = ledgerStatusFilter === "All" || o.orderStatus === ledgerStatusFilter;
      const matchesType = ledgerTypeFilter === "All" || o.orderType === ledgerTypeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [filteredOrders, ledgerSearch, ledgerStatusFilter, ledgerTypeFilter]);

  // Manual Refresh Handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefreshOrders) {
        await onRefreshOrders();
      } else {
        await LocalDB.fetchOrders();
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  // CSV Export Handler
  const handleExportCSV = () => {
    const filename = `WEBRAJYA_POS_Sales_${preset}_${getLocalDateKey(new Date())}.csv`;
    exportOrdersToCSV(filteredOrders, filename);
  };

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* ======================================================== */}
      {/* 1. TOP HEADER & ACTION CONTROLS */}
      {/* ======================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-50 text-[#aa7c11] rounded-xl border border-amber-100">
              <BarChart3 className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-serif font-bold text-stone-900 uppercase tracking-wider">
              Sales & Performance Reports
            </h2>
          </div>
          <p className="text-xs text-stone-500 font-sans">
            Real-time culinary sales intelligence, item velocity, and revenue reconciliation for WebRajya POS.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 border border-stone-200 shadow-xs"
            title="Reload real-time order records from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-stone-600 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Syncing..." : "Refresh"}
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Download CSV sales ledger for the selected date range"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export CSV
          </button>

          <button
            type="button"
            id="btn-reports-whatsapp-summary"
            onClick={() => setShowWhatsAppModal(true)}
            className="px-3.5 py-2 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Send 1-Click Daily Sales Summary to Owner via WhatsApp"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp Summary
          </button>

          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="px-4 py-2 bg-[#d4af37] hover:bg-[#aa7c11] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Generate A4 printable sales summary"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Report
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. GLOBAL DATE RANGE SELECTOR BAR */}
      {/* ======================================================== */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-stone-700 uppercase tracking-wider font-sans">
            <Calendar className="w-4 h-4 text-[#aa7c11]" />
            <span>Reporting Window:</span>
            <span className="px-2.5 py-1 bg-amber-50 text-amber-900 rounded-lg border border-amber-200/80 font-mono text-[11px]">
              {dateRange.label} ({filteredOrders.filter(isValidOrder).length} valid orders)
            </span>
          </div>

          {/* Quick Preset Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "last_7_days", label: "7 Days" },
              { id: "last_30_days", label: "30 Days" },
              { id: "this_month", label: "This Month" },
              { id: "last_month", label: "Last Month" },
              { id: "this_year", label: "This Year" },
              { id: "custom", label: "Custom Range" }
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id as DateRangePreset)}
                className={`text-[11px] px-3 py-1.5 rounded-lg border font-bold font-sans transition-all cursor-pointer ${
                  preset === p.id
                    ? "bg-[#d4af37] border-[#d4af37] text-white shadow-xs"
                    : "bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Range Picker Inputs (visible if preset === 'custom') */}
        {preset === "custom" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="pt-2 border-t border-stone-100 flex flex-wrap items-center gap-3 text-xs font-sans"
          >
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">FROM:</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono text-stone-800 focus:outline-none focus:border-[#d4af37]"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">TO:</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono text-stone-800 focus:outline-none focus:border-[#d4af37]"
              />
            </div>
            <span className="text-[11px] text-stone-400 italic">
              * Dates are filtered in Indian Standard Time (IST)
            </span>
          </motion.div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. SUB-NAVIGATION TABS */}
      {/* ======================================================== */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-stone-200/80 font-sans">
        {[
          { id: "overview", label: "Overview", icon: <BarChart3 className="w-3.5 h-3.5" /> },
          { id: "daily", label: "Daily Sales", icon: <Calendar className="w-3.5 h-3.5" /> },
          { id: "monthly", label: "Monthly Sales", icon: <TrendingUp className="w-3.5 h-3.5" /> },
          { id: "yearly", label: "Yearly Sales", icon: <Layers className="w-3.5 h-3.5" /> },
          { id: "items", label: "Best-Selling Items", icon: <Utensils className="w-3.5 h-3.5" /> },
          { id: "categories", label: "Categories", icon: <PieChartIcon className="w-3.5 h-3.5" /> },
          { id: "ledger", label: "Sales Ledger", icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
          { id: "shifts", label: "Shift Reconciliation", icon: <Landmark className="w-3.5 h-3.5" /> }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleSubTabClick(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? "bg-stone-900 text-white shadow-xs"
                : "bg-white hover:bg-stone-100 text-stone-600 border border-stone-200/60"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ======================================================== */}
      {/* 4. TAB CONTENT ROUTING */}
      {/* ======================================================== */}

      {/* -------------------------------------------------------- */}
      {/* TAB 1: OVERVIEW */}
      {/* -------------------------------------------------------- */}
      {activeTab === "overview" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* End-of-Day WhatsApp Owner Summary Quick Banner */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50/40 to-amber-50/40 border border-emerald-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#25D366] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-xs sm:text-sm flex items-center gap-2">
                  End-of-Day Automated Owner Summary
                  <span className="bg-[#25D366]/20 text-[#128C7E] font-mono text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                    1-Click WhatsApp
                  </span>
                </h4>
                <p className="text-[11px] text-stone-500">
                  Dispatch today's gross sales, cash vs UPI split, and top selling dishes to the owner with one tap.
                </p>
              </div>
            </div>
            <button
              type="button"
              id="btn-overview-send-whatsapp"
              onClick={() => setShowWhatsAppModal(true)}
              className="px-4 py-2 bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap self-stretch sm:self-auto"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Send Summary to Owner</span>
            </button>
          </div>

          {/* Top KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Today's Sales Card */}
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Today's Sales</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-stone-900 font-mono">
                ₹{metrics.todaySales.toLocaleString()}
              </div>
              <div className="flex items-center justify-between text-[11px] text-stone-500 font-sans">
                <span>{metrics.todayOrders} orders today</span>
                <span className="font-mono text-stone-400">AOV: ₹{metrics.todayAov}</span>
              </div>
            </div>

            {/* Selected Period Sales */}
            <div className="bg-white p-4 rounded-2xl border border-amber-200/80 bg-amber-50/20 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-amber-900">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Period Revenue</span>
                <ShoppingBag className="w-4 h-4 text-[#aa7c11]" />
              </div>
              <div className="text-xl font-bold text-amber-950 font-mono">
                ₹{metrics.periodSales.toLocaleString()}
              </div>
              <div className="flex items-center justify-between text-[11px] text-amber-800/80 font-sans">
                <span>{metrics.periodOrders} total orders</span>
                <span className="font-mono">AOV: ₹{metrics.periodAov}</span>
              </div>
            </div>

            {/* This Month & Growth */}
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">This Month</span>
                {metrics.monthGrowthPercent !== null && metrics.monthGrowthPercent >= 0 ? (
                  <span className="flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                    <ArrowUpRight className="w-3 h-3" /> +{metrics.monthGrowthPercent}%
                  </span>
                ) : metrics.monthGrowthPercent !== null ? (
                  <span className="flex items-center text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-100">
                    <ArrowDownRight className="w-3 h-3" /> {metrics.monthGrowthPercent}%
                  </span>
                ) : null}
              </div>
              <div className="text-xl font-bold text-stone-900 font-mono">
                ₹{metrics.thisMonthSales.toLocaleString()}
              </div>
              <p className="text-[11px] text-stone-500 truncate">
                Last month: ₹{metrics.lastMonthSales.toLocaleString()}
              </p>
            </div>

            {/* This Year & Growth */}
            <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">This Year</span>
                {metrics.yearGrowthPercent !== null && metrics.yearGrowthPercent >= 0 ? (
                  <span className="flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                    <ArrowUpRight className="w-3 h-3" /> +{metrics.yearGrowthPercent}%
                  </span>
                ) : metrics.yearGrowthPercent !== null ? (
                  <span className="flex items-center text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-100">
                    <ArrowDownRight className="w-3 h-3" /> {metrics.yearGrowthPercent}%
                  </span>
                ) : null}
              </div>
              <div className="text-xl font-bold text-stone-900 font-mono">
                ₹{metrics.thisYearSales.toLocaleString()}
              </div>
              <p className="text-[11px] text-stone-500 truncate">
                Last year: ₹{metrics.lastYearSales.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Secondary Financial Breakdown Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-200/70 text-xs font-sans">
            <div>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block font-mono">GROSS (SUBTOTAL)</span>
              <span className="font-bold font-mono text-stone-900 text-sm">₹{metrics.periodGrossSales.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest block font-mono">DISCOUNTS GIVEN</span>
              <span className="font-bold font-mono text-rose-700 text-sm">-₹{metrics.periodDiscount.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block font-mono">GST TAX COLLECTED</span>
              <span className="font-bold font-mono text-stone-900 text-sm">₹{metrics.periodGst.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block font-mono">PACKAGING CHARGES</span>
              <span className="font-bold font-mono text-stone-900 text-sm">₹{metrics.periodPackaging.toLocaleString()}</span>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest block font-mono">CANCELLED BILLS</span>
              <span className="font-bold font-mono text-stone-600 text-sm">
                {metrics.cancelledCount} bills (₹{metrics.cancelledValue.toLocaleString()})
              </span>
            </div>
          </div>

          {/* Main Trend Line Chart */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#aa7c11]" />
                  Daily Revenue Trend
                </h3>
                <p className="text-[11px] text-stone-500">Continuous daily billing flow for {dateRange.label}</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono text-stone-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#d4af37]" /> Revenue (₹)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-stone-300" /> Orders
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              {dailySales.length === 0 || dailySales.every(d => d.grandTotal === 0) ? (
                <div className="h-full flex flex-col items-center justify-center text-stone-400 text-xs font-sans gap-2">
                  <BarChart3 className="w-8 h-8 opacity-40" />
                  <span>No completed orders recorded in this date range.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailySales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d4af37" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#d4af37" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" vertical={false} />
                    <XAxis 
                      dataKey="formattedDate" 
                      tick={{ fontSize: 10, fill: '#78716c' }} 
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: '#78716c' }} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(v) => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                    />
                    <Tooltip 
                      formatter={(value: any, name: any) => [
                        name === "grandTotal" ? `₹${Number(value).toLocaleString()}` : value,
                        name === "grandTotal" ? "Revenue" : "Orders"
                      ]}
                      labelFormatter={(label) => `Date: ${label}`}
                      contentStyle={{ backgroundColor: "#1c1917", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px" }}
                      itemStyle={{ color: "#facc15" }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="grandTotal" 
                      stroke="#d4af37" 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#salesGrad)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Breakdowns Grid: Order Types & Payment Methods */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1. Order Type Breakdown */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <h4 className="text-xs font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-[#aa7c11]" />
                  Sales by Service Channel
                </h4>
                <span className="text-[10px] font-mono text-stone-400">CHANNEL RATIO</span>
              </div>

              <div className="space-y-3">
                {orderTypeData.map(ot => (
                  <div key={ot.type} className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-sans">
                      <span className="font-semibold text-stone-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ot.color }} />
                        {ot.label}
                      </span>
                      <div className="space-y-0.5 text-right font-mono">
                        <span className="font-bold text-stone-900">₹{ot.revenue.toLocaleString()}</span>
                        <span className="text-[10px] text-stone-400 ml-1.5">({ot.ordersCount} bills · {ot.percentage}%)</span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500" 
                        style={{ width: `${ot.percentage}%`, backgroundColor: ot.color }} 
                      />
                    </div>
                  </div>
                ))}

                {orderTypeData.length === 0 && (
                  <p className="text-center py-6 text-xs text-stone-400">No channel order data recorded.</p>
                )}
              </div>
            </div>

            {/* 2. Payment Method Breakdown */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <h4 className="text-xs font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  Sales by Payment Method
                </h4>
                <span className="text-[10px] font-mono text-stone-400">SETTLEMENT MODES</span>
              </div>

              <div className="space-y-3">
                {paymentMethodData.map(pm => (
                  <div key={pm.method} className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-sans">
                      <span className="font-semibold text-stone-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pm.color }} />
                        {pm.method}
                      </span>
                      <div className="space-y-0.5 text-right font-mono">
                        <span className="font-bold text-stone-900">₹{pm.totalAmount.toLocaleString()}</span>
                        <span className="text-[10px] text-stone-400 ml-1.5">({pm.ordersCount} txns · {pm.percentage}%)</span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500" 
                        style={{ width: `${pm.percentage}%`, backgroundColor: pm.color }} 
                      />
                    </div>
                  </div>
                ))}

                {paymentMethodData.length === 0 && (
                  <p className="text-center py-6 text-xs text-stone-400">No payment records available.</p>
                )}
              </div>
            </div>
          </div>

          {/* Top 5 Quick Dishes Preview */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <h4 className="text-xs font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                <Utensils className="w-4 h-4 text-[#aa7c11]" />
                Top 5 High Velocity Dishes
              </h4>
              <button
                type="button"
                onClick={() => setActiveTab("items")}
                className="text-[11px] text-[#aa7c11] hover:underline font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
              >
                View Full Item Rankings <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              {topSellingItems.slice(0, 5).map((item, idx) => (
                <div key={item.name + idx} className="bg-[#FAF9F5] p-3.5 rounded-xl border border-stone-200/80 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                      idx === 0 ? "bg-amber-100 text-amber-900" :
                      idx === 1 ? "bg-stone-200 text-stone-800" :
                      idx === 2 ? "bg-orange-100 text-orange-900" : "bg-stone-100 text-stone-600"
                    }`}>
                      #{item.rank}
                    </span>
                    <span className="text-stone-400">{item.category}</span>
                  </div>
                  <h5 className="font-bold text-xs text-stone-900 truncate font-sans" title={item.name}>
                    {item.name}
                  </h5>
                  <div className="flex justify-between items-center text-[11px] font-mono pt-1 border-t border-stone-200/50">
                    <span className="text-stone-500">{item.quantitySold} units</span>
                    <span className="font-bold text-stone-900">₹{item.totalRevenue.toLocaleString()}</span>
                  </div>
                </div>
              ))}

              {topSellingItems.length === 0 && (
                <div className="col-span-5 py-8 text-center text-xs text-stone-400">
                  No dish sales recorded in this timeframe.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* -------------------------------------------------------- */}
      {/* TAB 2: DAILY SALES */}
      {/* -------------------------------------------------------- */}
      {activeTab === "daily" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Daily Bar Chart */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#aa7c11]" />
                  Day-by-Day Revenue Volume
                </h3>
                <p className="text-[11px] text-stone-500">Gross billing comparison across every single operating day.</p>
              </div>
              <span className="text-xs font-mono text-stone-500">
                Total Period: ₹{metrics.periodSales.toLocaleString()}
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" vertical={false} />
                  <XAxis dataKey="formattedDate" tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#78716c' }} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(v) => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip 
                    formatter={(value: any) => [`₹${Number(value).toLocaleString()}`, "Grand Total"]}
                    labelFormatter={(label) => `Date: ${label}`}
                    contentStyle={{ backgroundColor: "#1c1917", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px" }}
                    itemStyle={{ color: "#facc15" }}
                  />
                  <Bar dataKey="grandTotal" fill="#d4af37" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Peak Ordering Hours (Hourly Rush Analysis) */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h4 className="text-xs font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#aa7c11]" />
                  Peak Dining Rush Hours (00:00 - 23:00)
                </h4>
                <p className="text-[11px] text-stone-500">Identify breakfast, lunch, and dinner peak rush timings</p>
              </div>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#f5f5f4" vertical={false} />
                  <XAxis dataKey="hourLabel" tick={{ fontSize: 9, fill: '#a8a29e' }} interval={2} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#a8a29e' }} tickLine={false} axisLine={false} />
                  <Tooltip 
                    formatter={(v: any, n: any) => [n === "ordersCount" ? `${v} orders` : `₹${v}`, n === "ordersCount" ? "Bills Count" : "Sales"]}
                    contentStyle={{ backgroundColor: "#1c1917", borderRadius: "10px", border: "none", color: "#fff", fontSize: "10px" }}
                  />
                  <Bar dataKey="ordersCount" fill="#C67C4E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Day by Day Detailed Audit Table */}
          <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 bg-stone-50 border-b border-stone-200 flex justify-between items-center">
              <h4 className="text-xs font-serif font-bold text-stone-900 uppercase tracking-wider">
                Daily Sales Reconciliation Breakdown
              </h4>
              <span className="text-[10px] font-mono text-stone-500">
                {dailySales.filter(d => d.ordersCount > 0).length} ACTIVE TRADING DAYS
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans border-collapse">
                <thead>
                  <tr className="bg-stone-100/70 border-b border-stone-200 text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                    <th className="p-3.5">DATE</th>
                    <th className="p-3.5">DAY</th>
                    <th className="p-3.5 text-center">BILLS</th>
                    <th className="p-3.5 text-right">GROSS (₹)</th>
                    <th className="p-3.5 text-right">DISCOUNT (₹)</th>
                    <th className="p-3.5 text-right">GST (₹)</th>
                    <th className="p-3.5 text-right">PACKAGING (₹)</th>
                    <th className="p-3.5 text-right">NET REVENUE (₹)</th>
                    <th className="p-3.5 text-right">AOV (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700">
                  {dailySales.filter(d => d.ordersCount > 0).length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-10 text-center text-stone-400 font-light">
                        No active daily billing transactions recorded in this selected range.
                      </td>
                    </tr>
                  ) : (
                    dailySales.map(day => (
                      <tr key={day.dateKey} className="hover:bg-stone-50/50 transition-colors">
                        <td className="p-3.5 font-bold font-mono text-stone-900">{day.formattedDate}</td>
                        <td className="p-3.5 text-stone-500">{day.dayName}</td>
                        <td className="p-3.5 text-center font-mono font-bold">{day.ordersCount}</td>
                        <td className="p-3.5 text-right font-mono">₹{day.grossSales.toLocaleString()}</td>
                        <td className="p-3.5 text-right font-mono text-rose-600">
                          {day.discount > 0 ? `-₹${day.discount.toLocaleString()}` : "₹0"}
                        </td>
                        <td className="p-3.5 text-right font-mono">₹{day.gst.toLocaleString()}</td>
                        <td className="p-3.5 text-right font-mono">₹{day.packaging.toLocaleString()}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-[#aa7c11]">
                          ₹{day.grandTotal.toLocaleString()}
                        </td>
                        <td className="p-3.5 text-right font-mono text-stone-600">₹{day.aov}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {dailySales.length > 0 && (
                  <tfoot>
                    <tr className="bg-stone-100 border-t-2 border-stone-300 font-bold font-mono text-stone-900 text-xs">
                      <td colSpan={2} className="p-3.5 uppercase font-sans">PERIOD TOTALS</td>
                      <td className="p-3.5 text-center">{metrics.periodOrders}</td>
                      <td className="p-3.5 text-right">₹{metrics.periodGrossSales.toLocaleString()}</td>
                      <td className="p-3.5 text-right text-rose-600">-₹{metrics.periodDiscount.toLocaleString()}</td>
                      <td className="p-3.5 text-right">₹{metrics.periodGst.toLocaleString()}</td>
                      <td className="p-3.5 text-right">₹{metrics.periodPackaging.toLocaleString()}</td>
                      <td className="p-3.5 text-right text-[#aa7c11]">₹{metrics.periodSales.toLocaleString()}</td>
                      <td className="p-3.5 text-right">₹{metrics.periodAov}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* -------------------------------------------------------- */}
      {/* TAB 3: MONTHLY SALES */}
      {/* -------------------------------------------------------- */}
      {activeTab === "monthly" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Year Selector Bar */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-stone-700 uppercase tracking-wider font-sans">
                SELECT CALENDAR YEAR:
              </span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono font-bold text-stone-900 focus:outline-none focus:border-[#d4af37] cursor-pointer"
              >
                {availableYears.map(yr => (
                  <option key={yr} value={yr}>Year {yr}</option>
                ))}
              </select>
            </div>

            <span className="text-xs text-stone-500 font-mono">
              Annual Revenue ({selectedYear}): ₹{monthlySales.reduce((acc, m) => acc + m.grandTotal, 0).toLocaleString()}
            </span>
          </div>

          {/* 12-Month Performance Bar Chart */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#aa7c11]" />
                {selectedYear} Monthly Revenue Trajectory (Jan - Dec)
              </h3>
              <span className="text-[10px] font-mono text-stone-400">12 MONTHS AUDIT</span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" vertical={false} />
                  <XAxis dataKey="monthShort" tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#78716c' }} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(v) => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip 
                    formatter={(value: any, name: any, item: any) => [
                      item.payload.isFuture ? "Future Month" : `₹${Number(value).toLocaleString()}`, 
                      "Total Sales"
                    ]}
                    labelFormatter={(label, payload) => {
                      const item = payload[0]?.payload;
                      return item ? `${item.monthName} ${selectedYear}` : label;
                    }}
                    contentStyle={{ backgroundColor: "#1c1917", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px" }}
                    itemStyle={{ color: "#facc15" }}
                  />
                  <Bar dataKey="grandTotal" fill="#C67C4E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Month-by-Month Detailed Table */}
          <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 bg-stone-50 border-b border-stone-200 flex justify-between items-center">
              <h4 className="text-xs font-serif font-bold text-stone-900 uppercase tracking-wider">
                Monthly Performance & Month-over-Month Growth
              </h4>
              <span className="text-[10px] font-mono text-stone-500">CALENDAR YEAR {selectedYear}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans border-collapse">
                <thead>
                  <tr className="bg-stone-100/70 border-b border-stone-200 text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                    <th className="p-3.5">MONTH</th>
                    <th className="p-3.5 text-center">BILLS COUNT</th>
                    <th className="p-3.5 text-right">GROSS (₹)</th>
                    <th className="p-3.5 text-right">DISCOUNTS (₹)</th>
                    <th className="p-3.5 text-right">GST (₹)</th>
                    <th className="p-3.5 text-right">NET REVENUE (₹)</th>
                    <th className="p-3.5 text-right">M-O-M GROWTH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700">
                  {monthlySales.map(m => (
                    <tr key={m.monthIndex} className={`hover:bg-stone-50/50 transition-colors ${m.isFuture ? "opacity-40" : ""}`}>
                      <td className="p-3.5 font-bold font-sans text-stone-900">
                        {m.monthName}
                        {m.isFuture && <span className="ml-2 text-[9px] font-normal text-stone-400 font-mono">(Upcoming)</span>}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold">
                        {m.isFuture ? "-" : m.ordersCount}
                      </td>
                      <td className="p-3.5 text-right font-mono">
                        {m.isFuture ? "-" : `₹${m.grossSales.toLocaleString()}`}
                      </td>
                      <td className="p-3.5 text-right font-mono text-rose-600">
                        {m.isFuture ? "-" : m.discount > 0 ? `-₹${m.discount.toLocaleString()}` : "₹0"}
                      </td>
                      <td className="p-3.5 text-right font-mono">
                        {m.isFuture ? "-" : `₹${m.gst.toLocaleString()}`}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-stone-900">
                        {m.isFuture ? "-" : `₹${m.grandTotal.toLocaleString()}`}
                      </td>
                      <td className="p-3.5 text-right font-mono">
                        {m.isFuture || m.growthVsPrevMonth === null ? (
                          <span className="text-stone-400">-</span>
                        ) : m.growthVsPrevMonth >= 0 ? (
                          <span className="text-emerald-600 font-bold">+{m.growthVsPrevMonth}% ↑</span>
                        ) : (
                          <span className="text-rose-600 font-bold">{m.growthVsPrevMonth}% ↓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-stone-100 border-t-2 border-stone-300 font-bold font-mono text-stone-900 text-xs">
                    <td className="p-3.5 uppercase font-sans">ANNUAL TOTAL ({selectedYear})</td>
                    <td className="p-3.5 text-center">
                      {monthlySales.reduce((acc, m) => acc + m.ordersCount, 0)}
                    </td>
                    <td className="p-3.5 text-right">
                      ₹{monthlySales.reduce((acc, m) => acc + m.grossSales, 0).toLocaleString()}
                    </td>
                    <td className="p-3.5 text-right text-rose-600">
                      -₹{monthlySales.reduce((acc, m) => acc + m.discount, 0).toLocaleString()}
                    </td>
                    <td className="p-3.5 text-right">
                      ₹{monthlySales.reduce((acc, m) => acc + m.gst, 0).toLocaleString()}
                    </td>
                    <td className="p-3.5 text-right text-[#aa7c11]">
                      ₹{monthlySales.reduce((acc, m) => acc + m.grandTotal, 0).toLocaleString()}
                    </td>
                    <td className="p-3.5 text-right">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* -------------------------------------------------------- */}
      {/* TAB 4: YEARLY SALES */}
      {/* -------------------------------------------------------- */}
      {activeTab === "yearly" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#aa7c11]" />
                Multi-Year Comparative Growth Ledger
              </h3>
              <span className="text-[10px] font-mono text-stone-400">HISTORICAL ARCHIVE</span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlySales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#78716c', fontWeight: 'bold' }} tickLine={false} />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#78716c' }} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(v) => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip 
                    formatter={(value: any) => [`₹${Number(value).toLocaleString()}`, "Total Revenue"]}
                    contentStyle={{ backgroundColor: "#1c1917", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px" }}
                    itemStyle={{ color: "#facc15" }}
                  />
                  <Bar dataKey="grandTotal" fill="#aa7c11" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans border-collapse">
                <thead>
                  <tr className="bg-stone-100/70 border-b border-stone-200 text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                    <th className="p-3.5">OPERATING YEAR</th>
                    <th className="p-3.5 text-center">TOTAL BILLS</th>
                    <th className="p-3.5 text-right">GROSS SALES (₹)</th>
                    <th className="p-3.5 text-right">DISCOUNTS (₹)</th>
                    <th className="p-3.5 text-right">GST TAX (₹)</th>
                    <th className="p-3.5 text-right">NET REVENUE (₹)</th>
                    <th className="p-3.5 text-right">AOV (₹)</th>
                    <th className="p-3.5 text-right">Y-O-Y GROWTH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700">
                  {yearlySales.map(y => (
                    <tr key={y.year} className="hover:bg-stone-50/50 transition-colors">
                      <td className="p-3.5 font-bold font-mono text-stone-900 text-sm">{y.year}</td>
                      <td className="p-3.5 text-center font-mono font-bold">{y.ordersCount}</td>
                      <td className="p-3.5 text-right font-mono">₹{y.grossSales.toLocaleString()}</td>
                      <td className="p-3.5 text-right font-mono text-rose-600">
                        {y.discount > 0 ? `-₹${y.discount.toLocaleString()}` : "₹0"}
                      </td>
                      <td className="p-3.5 text-right font-mono">₹{y.gst.toLocaleString()}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-[#aa7c11]">
                        ₹{y.grandTotal.toLocaleString()}
                      </td>
                      <td className="p-3.5 text-right font-mono">₹{y.aov}</td>
                      <td className="p-3.5 text-right font-mono font-bold">
                        {y.growthVsPrevYear === null ? (
                          <span className="text-stone-400">-</span>
                        ) : y.growthVsPrevYear >= 0 ? (
                          <span className="text-emerald-600">+{y.growthVsPrevYear}% ↑</span>
                        ) : (
                          <span className="text-rose-600">{y.growthVsPrevYear}% ↓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* -------------------------------------------------------- */}
      {/* TAB 5: BEST-SELLING ITEMS */}
      {/* -------------------------------------------------------- */}
      {activeTab === "items" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* Filter & Search Bar */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative group w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 group-focus-within:text-[#d4af37] transition-colors" />
              <input
                type="text"
                value={itemSearchQuery}
                onChange={(e) => setItemSearchQuery(e.target.value)}
                placeholder="Search recipe or category..."
                className="w-full bg-stone-50 border border-stone-200 pl-10 pr-4 py-2 text-xs rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-[#d4af37] font-sans"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              {itemCategoryList.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedItemCategory(cat)}
                  className={`text-[10px] px-2.5 py-1.5 rounded-lg border font-bold font-sans transition-all cursor-pointer ${
                    selectedItemCategory === cat
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white hover:bg-stone-50 text-stone-600 border-stone-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Top 10 Items Bar Chart */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-stone-100 pb-3">
              <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                <Utensils className="w-4 h-4 text-[#aa7c11]" />
                Top 10 Menu Items by Revenue
              </h3>
              <span className="text-[10px] font-mono text-stone-400">UNITS & REVENUE</span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={topSellingItems.slice(0, 10)} 
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `₹${v}`} tick={{ fontSize: 10, fill: '#78716c' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#1c1917', fontWeight: 'bold' }} width={120} />
                  <Tooltip 
                    formatter={(val: any, name: any) => [
                      name === "totalRevenue" ? `₹${Number(val).toLocaleString()}` : `${val} units`,
                      name === "totalRevenue" ? "Revenue" : "Quantity"
                    ]}
                    contentStyle={{ backgroundColor: "#1c1917", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px" }}
                    itemStyle={{ color: "#facc15" }}
                  />
                  <Bar dataKey="totalRevenue" fill="#d4af37" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Full Items Ranking Table */}
          <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 bg-stone-50 border-b border-stone-200 flex justify-between items-center">
              <h4 className="text-xs font-serif font-bold text-stone-900 uppercase tracking-wider">
                Full Item Sales Velocity & Revenue Contribution
              </h4>
              <span className="text-[10px] font-mono text-stone-500">
                {filteredItemsTabList.length} ITEMS CATALOGED
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans border-collapse">
                <thead>
                  <tr className="bg-stone-100/70 border-b border-stone-200 text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                    <th className="p-3.5 text-center w-12">RANK</th>
                    <th className="p-3.5">DISH / RECIPE</th>
                    <th className="p-3.5">CATEGORY</th>
                    <th className="p-3.5 text-center">QUANTITY SOLD</th>
                    <th className="p-3.5 text-right">AVG UNIT PRICE</th>
                    <th className="p-3.5 text-right">TOTAL REVENUE (₹)</th>
                    <th className="p-3.5 text-right">SALES SHARE (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700">
                  {filteredItemsTabList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-stone-400 font-light">
                        No recipe items matching search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredItemsTabList.map(item => (
                      <tr key={item.rank + item.name} className="hover:bg-stone-50/50 transition-colors">
                        <td className="p-3.5 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono font-bold ${
                            item.rank === 1 ? "bg-amber-400 text-white shadow-xs" :
                            item.rank === 2 ? "bg-stone-300 text-stone-800" :
                            item.rank === 3 ? "bg-amber-600 text-white" : "bg-stone-100 text-stone-600"
                          }`}>
                            {item.rank}
                          </span>
                        </td>
                        <td className="p-3.5 font-bold text-stone-900">{item.name}</td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded text-[10px] font-mono">
                            {item.category}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-stone-800">
                          {item.quantitySold}
                        </td>
                        <td className="p-3.5 text-right font-mono text-stone-500">
                          ₹{item.averagePrice}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-[#aa7c11]">
                          ₹{item.totalRevenue.toLocaleString()}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold">
                          {item.percentageOfSales}%
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

      {/* -------------------------------------------------------- */}
      {/* TAB 6: CATEGORIES */}
      {/* -------------------------------------------------------- */}
      {activeTab === "categories" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Donut Chart */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-[#aa7c11]" />
                  Category Revenue Share
                </h3>
                <span className="text-[10px] font-mono text-stone-400">PROPORTION</span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="totalRevenue"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {categoryData.map((_, index) => {
                        const colors = ["#d4af37", "#C67C4E", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B"];
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Pie>
                    <Tooltip 
                      formatter={(val: any) => [`₹${Number(val).toLocaleString()}`, "Revenue"]}
                      contentStyle={{ backgroundColor: "#1c1917", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px" }}
                    />
                    <Legend 
                      formatter={(val) => <span className="text-[11px] font-sans font-medium text-stone-700">{val}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category Performance Cards */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-stone-100 pb-3">
                <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#aa7c11]" />
                  Category Metrics Summary
                </h3>
                <span className="text-[10px] font-mono text-stone-400">VOLUME & VALUE</span>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {categoryData.map((cat, idx) => (
                  <div key={cat.category + idx} className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl p-2 bg-white rounded-lg border border-stone-200">{cat.icon}</span>
                      <div>
                        <h5 className="font-bold text-xs text-stone-900 font-sans">{cat.category}</h5>
                        <p className="text-[10px] text-stone-400 font-mono">{cat.quantitySold} dishes sold ({cat.ordersCount} bills)</p>
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-stone-900 text-xs">₹{cat.totalRevenue.toLocaleString()}</div>
                      <div className="text-[10px] text-[#aa7c11] font-bold">{cat.percentageOfSales}% share</div>
                    </div>
                  </div>
                ))}

                {categoryData.length === 0 && (
                  <p className="text-center py-10 text-xs text-stone-400">No category sales recorded.</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* -------------------------------------------------------- */}
      {/* TAB 7: SALES LEDGER (Detailed Transactions) */}
      {/* -------------------------------------------------------- */}
      {activeTab === "ledger" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative group w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 group-focus-within:text-[#d4af37] transition-colors" />
              <input
                type="text"
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                placeholder="Search Order ID, Guest Name, Phone..."
                className="w-full bg-stone-50 border border-stone-200 pl-10 pr-4 py-2 text-xs rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:border-[#d4af37] font-mono"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <select
                value={ledgerStatusFilter}
                onChange={(e) => setLedgerStatusFilter(e.target.value)}
                className="px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-sans text-stone-700 focus:outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="Delivered">Delivered / Served</option>
                <option value="New Order">New Order</option>
                <option value="Preparing">Preparing</option>
                <option value="Ready">Ready</option>
                <option value="Cancelled">Cancelled</option>
              </select>

              <select
                value={ledgerTypeFilter}
                onChange={(e) => setLedgerTypeFilter(e.target.value)}
                className="px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-sans text-stone-700 focus:outline-none uppercase"
              >
                <option value="All">All Channels</option>
                <option value="dine-in">Dine-In</option>
                <option value="takeaway">Takeaway</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans border-collapse">
                <thead>
                  <tr className="bg-stone-100/70 border-b border-stone-200 text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                    <th className="p-3.5">ORDER ID</th>
                    <th className="p-3.5">DATE & TIME</th>
                    <th className="p-3.5">GUEST & CONTACT</th>
                    <th className="p-3.5">TYPE / TABLE</th>
                    <th className="p-3.5">SUBTOTAL</th>
                    <th className="p-3.5">DISCOUNT</th>
                    <th className="p-3.5">GST</th>
                    <th className="p-3.5">GRAND TOTAL</th>
                    <th className="p-3.5">PAYMENT</th>
                    <th className="p-3.5">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700">
                  {filteredLedgerOrders.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-stone-400 font-light font-sans">
                        No transactions match current ledger parameters.
                      </td>
                    </tr>
                  ) : (
                    filteredLedgerOrders.map(o => (
                      <tr key={o.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="p-3.5 font-bold font-mono text-stone-900">#{o.id}</td>
                        <td className="p-3.5 whitespace-nowrap">
                          <div className="font-medium text-stone-900 font-mono text-[11px]">
                            {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                          <div className="text-[10px] text-stone-400 font-mono">
                            {new Date(o.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-stone-900">{o.customerName || "Walk-in Guest"}</div>
                          <div className="text-stone-400 text-[10px] font-mono">{o.phoneNumber || "-"}</div>
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            o.orderType === "dine-in" ? "bg-teal-50 text-teal-700 border border-teal-100" :
                            o.orderType === "takeaway" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                            "bg-blue-50 text-blue-700 border border-blue-100"
                          }`}>
                            {o.orderType} {o.tableNumber ? `(T-${o.tableNumber})` : ""}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-stone-600">₹{o.subtotal || 0}</td>
                        <td className="p-3.5 font-mono text-rose-600">
                          {o.discountAmount ? `-₹${o.discountAmount}` : "₹0"}
                        </td>
                        <td className="p-3.5 font-mono text-stone-600">₹{o.gst || 0}</td>
                        <td className="p-3.5 font-mono font-bold text-stone-900">₹{o.grandTotal}</td>
                        <td className="p-3.5">
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-stone-100 rounded text-stone-700">
                            {o.paymentMethod || "Cash"}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            o.orderStatus === "Delivered" ? "bg-green-50 text-green-700 border border-green-100" :
                            o.orderStatus === "Cancelled" ? "bg-red-50 text-red-650 border border-red-100" :
                            "bg-amber-50 text-amber-800 border border-amber-150"
                          }`}>
                            {o.orderStatus}
                          </span>
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

      {/* -------------------------------------------------------- */}
      {/* TAB 8: SHIFT RECONCILIATION & CASH DRAWER AUDIT */}
      {/* -------------------------------------------------------- */}
      {activeTab === "shifts" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {(() => {
            const allShifts = LocalDB.getShifts();
            const totalCashInDrawers = allShifts
              .filter(s => s.status === "Open" || s.status === "Closing")
              .reduce((sum, s) => {
                try {
                  const fin = LocalDB.calculateShiftFinancials(s.id);
                  return sum + fin.expectedCash;
                } catch {
                  return sum + s.openingCash;
                }
              }, 0);

            const totalShiftRevenue = allShifts.reduce((sum, s) => sum + (s.totalSales || 0), 0);
            const totalDiscrepancies = allShifts.reduce((sum, s) => sum + (s.difference || 0), 0);

            return (
              <>
                {/* Top Metrics Banner */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between text-stone-400">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Total Recorded Shifts</span>
                      <Landmark className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="text-xl font-bold text-stone-900 font-mono">
                      {allShifts.length}
                    </div>
                    <div className="text-[11px] text-stone-500 font-sans">
                      {allShifts.filter(s => s.status === "Open").length} currently active
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between text-stone-400">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Live Drawer Cash</span>
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-xl font-bold text-emerald-900 font-mono">
                      ₹{totalCashInDrawers.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[11px] text-stone-500 font-sans">
                      In active register tills
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between text-stone-400">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Total Shift Revenue</span>
                      <ShoppingBag className="w-4 h-4 text-[#aa7c11]" />
                    </div>
                    <div className="text-xl font-bold text-stone-900 font-mono">
                      ₹{totalShiftRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[11px] text-stone-500 font-sans">
                      Across all closed & active shifts
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between text-stone-400">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Net Cash Discrepancy</span>
                      <AlertCircle className={`w-4 h-4 ${Math.abs(totalDiscrepancies) > 0.01 ? (totalDiscrepancies < 0 ? "text-rose-600" : "text-emerald-600") : "text-stone-400"}`} />
                    </div>
                    <div className={`text-xl font-bold font-mono ${totalDiscrepancies < -0.01 ? "text-rose-700" : totalDiscrepancies > 0.01 ? "text-emerald-700" : "text-stone-900"}`}>
                      {totalDiscrepancies < 0 ? `-₹${Math.abs(totalDiscrepancies).toFixed(2)}` : `+₹${totalDiscrepancies.toFixed(2)}`}
                    </div>
                    <div className="text-[11px] text-stone-500 font-sans">
                      {Math.abs(totalDiscrepancies) <= 0.01 ? "100% Balanced reconciliation" : "Accumulated variance"}
                    </div>
                  </div>
                </div>

                {/* Shifts Table */}
                <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-stone-200 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-stone-900">Shift Reconciliation Log</h4>
                      <p className="text-xs text-stone-400">Opening floats, expected vs actual cash counts & discrepancy audit notes</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse font-sans">
                      <thead>
                        <tr className="bg-stone-50/80 border-b border-stone-200 text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
                          <th className="p-3.5">SHIFT ID</th>
                          <th className="p-3.5">DATE / CASHIER</th>
                          <th className="p-3.5">OPENED BY / TIME</th>
                          <th className="p-3.5">CLOSED BY / TIME</th>
                          <th className="p-3.5 text-right">OPENING FLOAT</th>
                          <th className="p-3.5 text-right">TOTAL SALES</th>
                          <th className="p-3.5 text-right">EXPECTED CASH</th>
                          <th className="p-3.5 text-right">ACTUAL CASH</th>
                          <th className="p-3.5 text-right">VARIANCE</th>
                          <th className="p-3.5 text-center">STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {allShifts.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="p-8 text-center text-stone-400 text-xs">
                              No shift sessions recorded yet. Start a shift in the POS Billing Portal to begin tracking cashier drawer reconciliation.
                            </td>
                          </tr>
                        ) : (
                          allShifts.map((s) => {
                            const diff = s.difference || 0;
                            const isLive = s.status === "Open" || s.status === "Closing";

                            return (
                              <tr key={s.id} className="hover:bg-stone-50/60 transition-colors">
                                <td className="p-3.5 font-mono font-bold text-stone-900">
                                  #{s.id}
                                </td>
                                <td className="p-3.5">
                                  <div className="font-semibold text-stone-900">{s.cashierName}</div>
                                  <div className="text-[10px] text-stone-400 font-mono">{s.businessDate}</div>
                                </td>
                                <td className="p-3.5">
                                  <div className="text-stone-800">{s.openedBy}</div>
                                  <div className="text-[10px] text-stone-400 font-mono">{new Date(s.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                                </td>
                                <td className="p-3.5">
                                  {s.closedAt ? (
                                    <>
                                      <div className="text-stone-800">{s.closedBy || "Admin"}</div>
                                      <div className="text-[10px] text-stone-400 font-mono">{new Date(s.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                                    </>
                                  ) : (
                                    <span className="text-emerald-600 font-semibold text-[11px] animate-pulse">In Progress</span>
                                  )}
                                </td>
                                <td className="p-3.5 text-right font-mono text-stone-700">
                                  ₹{s.openingCash.toFixed(2)}
                                </td>
                                <td className="p-3.5 text-right font-mono font-bold text-stone-900">
                                  ₹{(s.totalSales ?? 0).toFixed(2)}
                                </td>
                                <td className="p-3.5 text-right font-mono text-amber-950 font-bold">
                                  ₹{s.expectedCash.toFixed(2)}
                                </td>
                                <td className="p-3.5 text-right font-mono font-bold text-stone-900">
                                  {s.actualCash !== undefined ? `₹${s.actualCash.toFixed(2)}` : "—"}
                                </td>
                                <td className="p-3.5 text-right font-mono font-bold">
                                  {s.difference !== undefined ? (
                                    <span className={diff < -0.01 ? "text-rose-600" : diff > 0.01 ? "text-emerald-600" : "text-stone-600"}>
                                      {diff < -0.01 ? `-₹${Math.abs(diff).toFixed(2)}` : diff > 0.01 ? `+₹${diff.toFixed(2)}` : "₹0.00"}
                                    </span>
                                  ) : (
                                    <span className="text-stone-400">—</span>
                                  )}
                                  {s.differenceReason && (
                                    <div className="text-[9px] text-stone-500 font-normal italic mt-0.5 max-w-[120px] truncate ml-auto" title={s.differenceReason}>
                                      "{s.differenceReason}"
                                    </div>
                                  )}
                                </td>
                                <td className="p-3.5 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    isLive
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : s.status === "Force Closed"
                                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                                      : "bg-stone-100 text-stone-700 border border-stone-200"
                                  }`}>
                                    {s.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
        </motion.div>
      )}

      {/* ======================================================== */}
      {/* 5. MODAL: PRINTABLE A4 SALES REPORT */}
      {/* ======================================================== */}
      <AnimatePresence>
        {showPrintModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPrintModal(false)}
              className="fixed inset-0 bg-black z-50 backdrop-blur-xs"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-4 max-w-4xl mx-auto my-auto h-fit bg-white border border-stone-300 rounded-3xl p-6 sm:p-8 z-50 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              {/* Modal Top Actions */}
              <div className="flex justify-between items-center border-b border-stone-200 pb-4 mb-6 print:hidden">
                <div className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-[#aa7c11]" />
                  <h3 className="text-sm font-serif font-bold text-stone-900 uppercase tracking-wider">
                    Print Official Sales Summary
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Open Print Dialog
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPrintModal(false)}
                    className="p-2 text-stone-400 hover:text-stone-900 rounded-lg cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Printable Document Body */}
              <div className="p-4 sm:p-6 text-stone-800 font-sans space-y-6 bg-white" id="printable-sales-report">
                {/* Header */}
                <div className="text-center border-b-2 border-stone-900 pb-4 space-y-1">
                  <h1 className="text-2xl font-serif font-bold text-stone-900 tracking-wider uppercase">
                    WEBRJAYA POS
                  </h1>
                  <p className="text-xs font-mono text-stone-500 uppercase tracking-widest">
                    Authentic South Indian Culinary · POS Sales & Performance Audit
                  </p>
                  <div className="flex justify-center gap-4 text-[11px] font-mono text-stone-600 pt-2">
                    <span>REPORT PERIOD: <strong>{dateRange.label}</strong></span>
                    <span>•</span>
                    <span>GENERATED AT: <strong>{new Date().toLocaleString("en-IN")}</strong></span>
                  </div>
                </div>

                {/* KPI Overview Summary */}
                <div className="grid grid-cols-4 gap-3 text-center border border-stone-300 p-4 rounded-xl">
                  <div>
                    <span className="text-[10px] font-mono text-stone-500 uppercase block">TOTAL BILLS</span>
                    <span className="text-base font-bold font-mono text-stone-900">{metrics.periodOrders}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-stone-500 uppercase block">GROSS REVENUE</span>
                    <span className="text-base font-bold font-mono text-stone-900">₹{metrics.periodGrossSales.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-stone-500 uppercase block">GST TAX</span>
                    <span className="text-base font-bold font-mono text-stone-900">₹{metrics.periodGst.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-stone-500 uppercase block">NET SALES VALUE</span>
                    <span className="text-base font-bold font-mono text-stone-900">₹{metrics.periodSales.toLocaleString()}</span>
                  </div>
                </div>

                {/* Service Types Breakdown */}
                <div className="space-y-2">
                  <h3 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider border-b border-stone-200 pb-1">
                    1. Channel Performance
                  </h3>
                  <table className="w-full text-left text-xs border-collapse font-sans">
                    <thead>
                      <tr className="border-b border-stone-200 text-[10px] font-mono font-bold text-stone-500">
                        <th className="py-1">SERVICE CHANNEL</th>
                        <th className="py-1 text-center">BILLS</th>
                        <th className="py-1 text-right">TOTAL AMOUNT (₹)</th>
                        <th className="py-1 text-right">% REVENUE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {orderTypeData.map(ot => (
                        <tr key={ot.type}>
                          <td className="py-1.5 font-medium">{ot.label}</td>
                          <td className="py-1.5 text-center font-mono">{ot.ordersCount}</td>
                          <td className="py-1.5 text-right font-mono">₹{ot.revenue.toLocaleString()}</td>
                          <td className="py-1.5 text-right font-mono font-bold">{ot.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Top 10 Best Sellers */}
                <div className="space-y-2">
                  <h3 className="text-xs font-mono font-bold text-stone-900 uppercase tracking-wider border-b border-stone-200 pb-1">
                    2. Top 10 Menu Items Velocity
                  </h3>
                  <table className="w-full text-left text-xs border-collapse font-sans">
                    <thead>
                      <tr className="border-b border-stone-200 text-[10px] font-mono font-bold text-stone-500">
                        <th className="py-1 text-center w-8">#</th>
                        <th className="py-1">DISH NAME</th>
                        <th className="py-1">CATEGORY</th>
                        <th className="py-1 text-center">QTY</th>
                        <th className="py-1 text-right">TOTAL SALES (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {topSellingItems.slice(0, 10).map(it => (
                        <tr key={it.rank + it.name}>
                          <td className="py-1 text-center font-mono font-bold">{it.rank}</td>
                          <td className="py-1 font-medium">{it.name}</td>
                          <td className="py-1 text-stone-500">{it.category}</td>
                          <td className="py-1 text-center font-mono">{it.quantitySold}</td>
                          <td className="py-1 text-right font-mono font-bold">₹{it.totalRevenue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Signoff / Verification footer */}
                <div className="pt-8 border-t border-stone-300 grid grid-cols-2 gap-8 text-xs font-mono">
                  <div>
                    <p className="text-stone-400 text-[10px]">PREPARED BY:</p>
                    <div className="mt-6 border-b border-stone-400 w-48" />
                    <p className="mt-1 font-bold text-stone-800">Store Manager / Cashier</p>
                  </div>
                  <div className="text-right">
                    <p className="text-stone-400 text-[10px]">VERIFIED & AUDITED BY:</p>
                    <div className="mt-6 border-b border-stone-400 w-48 ml-auto" />
                    <p className="mt-1 font-bold text-stone-800">WEBRAJYA POS Administration</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 1-Click WhatsApp Daily Closing Summary Modal */}
      <WhatsAppDailySummaryModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        orders={orders}
        settings={settings}
        onUpdateSettings={onUpdateSettings}
      />
    </div>
  );
}
