import React, { useState, useMemo } from "react";
import {
  X,
  MessageCircle,
  Phone,
  Copy,
  Check,
  Calendar,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Order, RestaurantSettings } from "../lib/db";
import {
  computeDailySummaryData,
  buildWhatsAppSummaryMessage,
  openWhatsAppSummary,
  formatWhatsAppPhoneNumber,
} from "../lib/whatsappSummary";

interface WhatsAppDailySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  settings: RestaurantSettings;
  onUpdateSettings?: (updated: RestaurantSettings) => void;
}

export default function WhatsAppDailySummaryModal({
  isOpen,
  onClose,
  orders,
  settings,
  onUpdateSettings,
}: WhatsAppDailySummaryModalProps) {
  // Date selection: 'today' | 'yesterday' | 'custom'
  const [dateMode, setDateMode] = useState<"today" | "yesterday" | "custom">("today");
  const [customDate, setCustomDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Owner phone editing
  const [ownerPhone, setOwnerPhone] = useState<string>(settings.ownerWhatsApp || "");
  const [isEditingPhone, setIsEditingPhone] = useState<boolean>(!settings.ownerWhatsApp);
  const [phoneSavedToast, setPhoneSavedToast] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync phone when settings change
  React.useEffect(() => {
    if (settings.ownerWhatsApp) {
      setOwnerPhone(settings.ownerWhatsApp);
      setIsEditingPhone(false);
    }
  }, [settings.ownerWhatsApp]);

  // Compute targeted date
  const targetDate = useMemo(() => {
    if (dateMode === "yesterday") {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d;
    }
    if (dateMode === "custom" && customDate) {
      const [y, m, d] = customDate.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  }, [dateMode, customDate]);

  // Daily Summary Data
  const summaryData = useMemo(() => {
    return computeDailySummaryData(
      orders,
      targetDate,
      settings.name || "WEBRAJYA POS",
      settings.cashierName || "Cashier (Counter 1)"
    );
  }, [orders, targetDate, settings.name, settings.cashierName]);

  // Live Message Text
  const messageText = useMemo(() => {
    return buildWhatsAppSummaryMessage(summaryData);
  }, [summaryData]);

  // Handle saving phone number to settings
  const handleSavePhone = () => {
    const updated = {
      ...settings,
      ownerWhatsApp: ownerPhone.trim(),
    };
    onUpdateSettings?.(updated);
    setIsEditingPhone(false);
    setPhoneSavedToast(true);
    setTimeout(() => setPhoneSavedToast(false), 3000);
  };

  // Handle copying message text
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for iframe restrictions
      const textArea = document.createElement("textarea");
      textArea.value = messageText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Handle dispatching WhatsApp
  const handleSendWhatsApp = () => {
    // If phone was changed in the input without clicking save, auto-save it
    if (ownerPhone.trim() && ownerPhone.trim() !== settings.ownerWhatsApp) {
      onUpdateSettings?.({
        ...settings,
        ownerWhatsApp: ownerPhone.trim(),
      });
    }

    openWhatsAppSummary(ownerPhone, messageText);
  };

  if (!isOpen) return null;

  const formattedTargetPhone = formatWhatsAppPhoneNumber(ownerPhone);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl shadow-2xl border border-stone-200/80 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="bg-[#25D366] text-white p-4 sm:p-5 flex items-center justify-between relative overflow-hidden flex-shrink-0 shadow-sm">
            <div className="relative z-10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center border border-white/30 backdrop-blur-xs shadow-inner">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-base sm:text-lg tracking-wide flex items-center gap-2">
                  Daily Closing Summary
                  <span className="text-[10px] font-sans font-semibold bg-white/25 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    WhatsApp 1-Click
                  </span>
                </h3>
                <p className="text-xs text-white/90 font-sans">
                  Send today's gross sales, cash vs UPI breakdown, & top dishes to the owner
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="relative z-10 p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Decorative background shape */}
            <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />
          </div>

          {/* Body Content */}
          <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-grow text-xs font-sans text-stone-700">
            {/* 1. Date Selector Pills */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-stone-50 rounded-xl border border-stone-200/80">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 pl-2">
                  Report Date:
                </span>
                <button
                  type="button"
                  onClick={() => setDateMode("today")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    dateMode === "today"
                      ? "bg-white text-stone-900 shadow-xs border border-stone-200"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  Today ({new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })})
                </button>
                <button
                  type="button"
                  onClick={() => setDateMode("yesterday")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    dateMode === "yesterday"
                      ? "bg-white text-stone-900 shadow-xs border border-stone-200"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={() => setDateMode("custom")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    dateMode === "custom"
                      ? "bg-white text-stone-900 shadow-xs border border-stone-200"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  Custom
                </button>
              </div>

              {dateMode === "custom" && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="bg-white border border-stone-300 px-2.5 py-1 text-xs rounded-lg font-mono text-stone-800 focus:outline-none focus:border-stone-500"
                />
              )}
            </div>

            {/* 2. Owner Phone Configuration Box */}
            <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-amber-700" />
                  <span className="font-bold text-amber-950 text-xs uppercase tracking-wider">
                    Recipient (Owner's WhatsApp Number)
                  </span>
                </div>
                {!isEditingPhone && ownerPhone && (
                  <button
                    type="button"
                    onClick={() => setIsEditingPhone(true)}
                    className="text-[11px] text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer"
                  >
                    Change Number
                  </button>
                )}
              </div>

              {isEditingPhone ? (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      placeholder="e.g. +91 98765 43210 or 9876543210"
                      className="flex-grow bg-white border border-amber-300 px-3 py-1.5 text-xs rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-900 placeholder:text-stone-400"
                    />
                    <button
                      type="button"
                      onClick={handleSavePhone}
                      className="px-3 py-1.5 bg-[#aa7c11] hover:bg-[#8c6409] text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs transition-all whitespace-nowrap"
                    >
                      Save to Settings
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-800">
                    💡 If 10 digits are entered (e.g. 9876543210), India country code (+91) is automatically applied.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-stone-900 text-sm">
                      {ownerPhone || "No number configured"}
                    </span>
                    {formattedTargetPhone && (
                      <span className="text-[10px] font-mono text-stone-400">
                        (wa.me/{formattedTargetPhone})
                      </span>
                    )}
                  </div>
                  {phoneSavedToast && (
                    <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Saved!
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 3. Quick KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-stone-50 border border-stone-200/80 p-3 rounded-xl space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
                  TOTAL SALES
                </span>
                <p className="text-base sm:text-lg font-bold font-mono text-stone-900">
                  ₹{summaryData.totalSales.toLocaleString("en-IN")}
                </p>
                <span className="text-[10px] text-stone-500 font-sans block">
                  {summaryData.orderCount} total orders
                </span>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-200/80 p-3 rounded-xl space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-700">
                  CASH IN DRAWER
                </span>
                <p className="text-base sm:text-lg font-bold font-mono text-emerald-900">
                  ₹{summaryData.cashSales.toLocaleString("en-IN")}
                </p>
                <span className="text-[10px] text-emerald-600 font-sans block">
                  Physical cash sales
                </span>
              </div>

              <div className="bg-blue-50/60 border border-blue-200/80 p-3 rounded-xl space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-700">
                  UPI / CARD / ONLINE
                </span>
                <p className="text-base sm:text-lg font-bold font-mono text-blue-900">
                  ₹{summaryData.onlineSales.toLocaleString("en-IN")}
                </p>
                <span className="text-[10px] text-blue-600 font-sans block">
                  Direct digital payments
                </span>
              </div>

              <div className="bg-amber-50/60 border border-amber-200/80 p-3 rounded-xl space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700">
                  AVG BILL VALUE
                </span>
                <p className="text-base sm:text-lg font-bold font-mono text-amber-900">
                  ₹{Math.round(summaryData.avgBill).toLocaleString("en-IN")}
                </p>
                <span className="text-[10px] text-amber-600 font-sans block">
                  Discounts: ₹{summaryData.totalDiscounts}
                </span>
              </div>
            </div>

            {/* 4. Live WhatsApp Message Preview Bubble */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Live WhatsApp Message Preview:
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-stone-600 hover:text-stone-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Text</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-[#EFEAE2] p-3 sm:p-4 rounded-xl border border-stone-300/80 font-mono text-[11px] leading-relaxed relative">
                {/* WhatsApp Chat Bubble style */}
                <div className="bg-white p-3.5 rounded-lg rounded-tl-none shadow-xs border border-stone-200 max-w-full whitespace-pre-wrap text-stone-800 selection:bg-emerald-100">
                  {messageText}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="p-4 sm:p-5 bg-stone-50 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
            <div className="text-[11px] text-stone-500 flex items-center gap-1.5 text-center sm:text-left">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                Opens WhatsApp Web on PC or WhatsApp App on Phone with text ready to send.
              </span>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? "COPIED" : "COPY TEXT"}</span>
              </button>

              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="flex-1 sm:flex-none px-6 py-2.5 bg-[#25D366] hover:bg-[#1EBE5D] active:bg-[#16A34A] text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-lg hover:-translate-y-0.5"
              >
                <MessageCircle className="w-4 h-4" />
                <span>SEND VIA WHATSAPP</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
