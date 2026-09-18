import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Home,
  Utensils,
  Search,
  ShoppingBag,
  User,
  MapPin,
  Phone,
  Clock,
  Star,
  Flame,
  Sparkles,
  Plus,
  Minus,
  Send,
  CheckCircle2,
  MessageSquare,
  Facebook,
  Instagram,
  Twitter,
  X,
  ChevronRight,
  ChevronLeft,
  Leaf,
  ThumbsUp,
  Info,
  Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MenuItem, CartItem, Category } from "../types";
import { categories as defaultCategories } from "../data";
import { LocalDB } from "../lib/db";
import { getScannedTableNumber } from "../lib/router";
import TableFloorplan from "./TableFloorplan";

interface MobileViewProps {
  menuList: MenuItem[];
  cart: CartItem[];
  onAddToCart: (item: MenuItem) => void;
  onRemoveFromCart: (item: MenuItem) => void;
  onRemoveEntirelyFromCart: (item: MenuItem) => void;
  onUpdateCustomization: (itemId: string, note: string) => void;
  onClearCart: () => void;
  onAdminClick: () => void;
}

export default function MobileView({
  menuList,
  cart,
  onAddToCart,
  onRemoveFromCart,
  onRemoveEntirelyFromCart,
  onUpdateCustomization,
  onClearCart,
  onAdminClick,
}: MobileViewProps) {
  // Mobile active tab: "home" | "menu" | "search" | "cart" | "contact"
  const [activeTab, setActiveTab] = useState<
    "home" | "menu" | "search" | "cart" | "contact"
  >(() => (getScannedTableNumber() ? "menu" : "home"));

  // Searching & Filtering States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMobileCategory, setSelectedMobileCategory] = useState("all");
  const [vegOnly, setVegOnly] = useState(false);
  const [bestsellerOnly, setBestsellerOnly] = useState(false);

  // Cart Form input states
  const [userName, setUserName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [orderType, setOrderType] = useState<"dine-in" | "takeaway">("dine-in");
  const [tableNumber, setTableNumber] = useState("");
  const [isQrScannedMobile, setIsQrScannedMobile] = useState(false);
  const [address, setAddress] = useState("");
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [isSubmittingMobile, setIsSubmittingMobile] = useState(false);
  const [checkoutErrorMobile, setCheckoutErrorMobile] = useState<string | null>(
    null,
  );

  // Pre-fill table number from scanned table URL parameters with page refresh persistence
  useEffect(() => {
    const syncTable = () => {
      try {
        const tableVal = getScannedTableNumber();
        if (tableVal) {
          setTableNumber(tableVal);
          setOrderType("dine-in");
          setIsQrScannedMobile(true);
        } else {
          setTableNumber("");
          setIsQrScannedMobile(false);
        }
      } catch (e) {
        // safe fallback
      }
    };

    syncTable();
    window.addEventListener("app_route_change", syncTable);
    window.addEventListener("storage", syncTable);

    return () => {
      window.removeEventListener("app_route_change", syncTable);
      window.removeEventListener("storage", syncTable);
    };
  }, []);

  // OTP Verification System variables (Mobile)
  const [showOtpMobile, setShowOtpMobile] = useState(false);
  const [otpCodeMobile, setOtpCodeMobile] = useState("");
  const [generatedOtpMobile, setGeneratedOtpMobile] = useState("");
  const [otpErrorMobile, setOtpErrorMobile] = useState<string | null>(null);
  const [otpCountdownMobile, setOtpCountdownMobile] = useState(0);

  // Countdown timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showOtpMobile && otpCountdownMobile > 0) {
      timer = setInterval(() => {
        setOtpCountdownMobile((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showOtpMobile, otpCountdownMobile]);

  const handleCancelOtpMobile = () => {
    setShowOtpMobile(false);
    setOtpCodeMobile("");
    setOtpErrorMobile(null);
  };

  const handleResendOtpMobile = () => {
    const randomOtp = Math.floor(1000 + Math.random() * 9000).toString();
    setGeneratedOtpMobile(randomOtp);
    setOtpCountdownMobile(60);
    setOtpCodeMobile("");
    setOtpErrorMobile(null);
  };

  // Skeleton loading state simulated on first mount for a premium app feel
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 900);
    return () => clearTimeout(timer);
  }, []);

  // User Profile Order Tracking
  const [pastOrdersMobile, setPastOrdersMobile] = useState<any[]>(() => LocalDB.getOrders());

  useEffect(() => {
    const handleSync = () => {
      setPastOrdersMobile(LocalDB.getOrders());
    };
    window.addEventListener("new_order", handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("new_order", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, []);

  const handleReorderMobile = (order: any) => {
    order.items.forEach((item: any) => {
      const menuItem = menuList.find((m) => m.id === item.menuItemId);
      if (menuItem) {
        onAddToCart(menuItem);
      }
    });
    setActiveTab("cart");
  };

  // Derived calculations
  const totalItems = useMemo(
    () => cart.reduce((count, item) => count + item.quantity, 0),
    [cart],
  );
  const subtotal = useMemo(
    () =>
      cart.reduce((sum, item) => sum + item.menuItem.price * item.quantity, 0),
    [cart],
  );
  const settings = LocalDB.getSettings();
  const gst = settings.gstEnabled && Number(settings.gstRate || 0) > 0 ? Math.round(subtotal * (settings.gstRate / 100)) : 0;
  const packagingCharge = orderType === "dine-in" || orderType === "takeaway" ? 0 : 25;
  const grandTotal = subtotal + gst + packagingCharge;

  const chefSpecialsList = useMemo(() => {
    return menuList.filter((item) => item.isChefSpecial);
  }, [menuList]);

  // Dynamic filter lists
  const filteredMenuList = useMemo(() => {
    return menuList.filter((item) => {
      // Availability filter
      if (item.available === false) return false;

      // Category mapping
      if (selectedMobileCategory !== "all") {
        const itCat = (item.category || "").toLowerCase().trim();
        const selCat = selectedMobileCategory.toLowerCase().trim();
        if (selCat === "south-indian") {
          if (!["idli", "uttapam", "dosa", "south-indian", "south indian"].includes(itCat))
            return false;
        } else if (selCat === "drinks") {
          if (
            !["milkshakes", "mocktails", "tea-coffee", "refreshers", "beverages", "drinks"].includes(
              itCat,
            )
          )
            return false;
        } else {
          if (itCat !== selCat) return false;
        }
      }

      // Search matching
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesDesc = item.description.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) return false;
      }

      // Veg Toggles
      if (vegOnly && !item.isVeg) return false;

      // Bestseller toggles
      if (bestsellerOnly && !item.isBestseller) return false;

      return true;
    });
  }, [selectedMobileCategory, searchQuery, vegOnly, bestsellerOnly, menuList]);

  // Mobile categories specification derived dynamically from active menu items
  const mobileCategoryChips = useMemo(() => {
    const chips: { id: string; label: string; emoji: string }[] = [{ id: "all", label: "✨ All", emoji: "✨" }];
    const seen = new Set<string>();

    const emojiMap: Record<string, string> = {
      soup: "🍲",
      starter: "🥟",
      "crispy starter": "🥢",
      "veg noodles": "🍜",
      "veg rice": "🍚",
      rolls: "🌯",
      combo: "🍱",
      beverages: "🥤",
      drinks: "🥤",
      dessert: "🍨",
      desserts: "🍨",
      main: "🍛"
    };

    // First collect unique categories directly from actual menu items
    for (const item of menuList) {
      if (item.category) {
        const raw = item.category.trim();
        const lower = raw.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          const emoji = emojiMap[lower] || "🍽️";
          chips.push({ id: raw, label: `${emoji} ${raw}`, emoji });
        }
      }
    }

    // Also include standard categories if not already present
    const list = LocalDB.getCategories();
    list.forEach(c => {
      const lower = c.id.toLowerCase().trim();
      const nameLower = c.name.toLowerCase().trim();
      if (!seen.has(lower) && !seen.has(nameLower)) {
        seen.add(lower);
        chips.push({ id: c.id, label: `${c.icon} ${c.name}`, emoji: c.icon });
      }
    });

    return chips;
  }, [menuList]);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) return;

    // Validate table number for Dine-In orders
    if (orderType === "dine-in") {
      const activeTableNum = tableNumber || localStorage.getItem("ij_scanned_table") || "";
      if (!activeTableNum.trim()) {
        setCheckoutErrorMobile("Validation failed: Table number is required for Dine-In orders. Please scan a table QR code or enter table number.");
        return;
      }
    }

    if (!showOtpMobile) {
      // Step 1: generate OTP and trigger verification screen
      const randomOtp = Math.floor(1000 + Math.random() * 9000).toString();
      setGeneratedOtpMobile(randomOtp);
      setOtpCountdownMobile(60);
      setOtpCodeMobile("");
      setOtpErrorMobile(null);
      setShowOtpMobile(true);
      return;
    }

    if (otpCodeMobile !== generatedOtpMobile) {
      setOtpErrorMobile(
        "Incorrect verification code. Please check and re-enter.",
      );
      return;
    }

    setIsSubmittingMobile(true);
    setCheckoutErrorMobile(null);
    setOtpErrorMobile(null);

    try {
      const orderData = {
        customerName: userName.trim(),
        phoneNumber: phoneNumber.trim() || "+91-11-4560-4560",
        email: `${userName.toLowerCase().trim().replace(/\s+/g, "")}@webrajya-guest.com`,
        orderType: orderType,
        tableNumber: orderType === "dine-in" ? tableNumber : undefined,
        address: orderType === "delivery" ? address : undefined,
        items: cart.map((ci) => ({
          menuItemId: ci.menuItem.id,
          name: ci.menuItem.name,
          price: ci.menuItem.price,
          quantity: ci.quantity,
          customization: ci.customization,
        })),
        subtotal: subtotal,
        gst: gst,
        packagingCharge: packagingCharge,
        discountAmount: 0,
        grandTotal: grandTotal,
        orderStatus: "New Order" as const,
        paymentStatus: "Pending" as const,
        paymentMethod: "Cash on Delivery",
        totalAmount: grandTotal,
        source: orderType === "dine-in" ? "QR" : "ONLINE",
        billedBy: orderType === "dine-in" ? "Table QR" : "Online Guest",
      };

      const savedOrder = await LocalDB.apiAddOrder(orderData);

      setOrderPlaced(true);
      setShowOtpMobile(false);
      setOtpCodeMobile("");
      setGeneratedOtpMobile("");
      setTimeout(() => {
        setOrderPlaced(false);
        onClearCart();
        setActiveTab("home");
      }, 4000);
    } catch (err: any) {
      console.error(err);
      setCheckoutErrorMobile(
        err.message || "Failed to finalize order checkout structure.",
      );
    } finally {
      setIsSubmittingMobile(false);
    }
  };

  return (
    <div
      className="bg-[#FAF9F5] text-stone-850 min-h-screen min-h-dvh flex flex-col font-sans select-none antialiased relative pb-24"
      id="mobile-viewport"
    >
      {/* Top Banner / Status bar */}
      <div className="bg-stone-900 text-[10px] font-mono font-medium text-[#d4af37] border-b border-[#d4af37]/10 py-2.5 text-center tracking-wider uppercase flex items-center justify-center gap-1.5 px-4 sticky top-0 z-40">
        <Sparkles className="w-3.5 h-3.5 text-[#d4af37] animate-pulse" />
        <span>THE XINGS KITCHEN • Customer Digital Menu</span>
        {tableNumber && (
          <>
            <span>•</span>
            <span className="bg-[#d4af37] text-stone-950 px-2 py-0.5 rounded-full font-bold font-mono">
              Table #{tableNumber}
            </span>
          </>
        )}
      </div>

      {animateContainer(isLoading, activeTab, {
        home: (
          <div className="space-y-8 animate-fade-in pb-12">
            {/* Elegant Mobile Hero Section */}
            <div
              className="relative overflow-hidden rounded-3xl mx-4 mt-4 h-[340px] bg-cover bg-center shadow-[0_12px_40px_rgba(40,30,10,0.12)]"
              style={{
                backgroundImage:
                  "linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.9)), url('https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=800')",
              }}
            >
              {/* Glassmorphic border lines */}
              <div className="absolute inset-0 border border-white/10 rounded-3xl pointer-events-none" />

              {/* Floating badges */}
              <div className="absolute top-4 left-4 flex gap-2">
                <div className="bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-full border border-gray-800 text-[10px] font-semibold text-amber-400 flex items-center gap-1 shadow-lg">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span>4.8 Rating</span>
                </div>
                <div className="bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-full border border-gray-800 text-[10px] font-semibold text-white flex items-center gap-1 shadow-lg">
                  <Clock className="w-3 h-3 text-[#d4af37]" />
                  <span>Fresh Dine-In</span>
                </div>
              </div>

              {/* Logo icon representation */}
              <div className="absolute top-4 right-4 bg-black/85 backdrop-blur-md p-2 rounded-2xl border border-gray-800/80 shadow-md">
                <span className="text-sm font-serif font-extrabold text-[#d4af37]">
                  XK
                </span>
              </div>

              {/* Hero Content Bottom */}
              <div className="absolute bottom-6 left-6 right-6 space-y-3">
                <span className="text-[10px] font-mono tracking-[0.25em] text-[#d4af37] uppercase font-bold">
                  THE XINGS KITCHEN
                </span>
                <h1 className="text-3xl font-serif font-extrabold text-white leading-tight tracking-wide">
                  THE XINGS KITCHEN
                  <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#d4af37] to-[#f3e5ab] text-xl font-medium mt-0.5">
                    {tableNumber ? `Table #${tableNumber} Digital Menu` : "Self-Ordering Digital Menu"}
                  </span>
                </h1>
                <p className="text-xs text-gray-300 font-sans tracking-wide italic font-light opacity-90">
                  &ldquo;Taste That Brings You Back&rdquo;
                </p>

                {/* Floating Action Button */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveTab("menu")}
                  className="mt-2 w-full py-3 bg-gradient-to-r from-[#d4af37] to-[#aa7c11] text-black font-bold text-xs uppercase tracking-widest rounded-xl shadow-[0_10px_20px_rgba(212,175,55,0.3)] flex items-center justify-center gap-2"
                >
                  <Utensils className="w-4 h-4" />
                  Order Now
                </motion.button>
              </div>
            </div>

            {/* Quick Promo Ribbon */}
            <div className="mx-4 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                  <Flame className="w-5 h-5 text-[#d4af37] animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                    Free Delivery Coupon
                  </h4>
                  <p className="text-[10px] text-stone-500 mt-0.5">
                    Auto-applies above ₹400 orders
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-[#aa7c11] bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 font-bold">
                SRFREE
              </span>
            </div>

            {/* Chef's Signature Specials Carousel Section */}
            <div className="space-y-4">
              <div className="px-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#d4af37]" />
                  <h2 className="text-lg font-serif font-bold text-stone-900 uppercase tracking-wide">
                    Chef&apos;s Specials
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-stone-400 uppercase">
                  Swipe Left
                </span>
              </div>

              {/* Horizontal Scroll wrapper */}
              <div className="overflow-x-auto pb-4 px-4 flex gap-4 scrollbar-none snap-x snap-mandatory">
                {chefSpecialsList.map((item) => {
                  const qty =
                    cart.find((ci) => ci.menuItem.id === item.id)?.quantity ||
                    0;
                  return (
                    <div
                      key={item.id}
                      className="w-[280px] flex-shrink-0 bg-white border border-stone-200/85 rounded-3xl overflow-hidden snap-start shadow-[0_8px_30px_rgba(40,30,10,0.04)] flex flex-col justify-between"
                    >
                      <div className="p-4 flex-grow flex flex-col justify-between space-y-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5">
                              {/* Veg square green dot */}
                              <div className="border border-green-600 p-[1px] flex items-center justify-center w-3 h-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
                              </div>
                              <span className="bg-[#aa7c11]/10 text-[#aa7c11] text-[8px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                <Flame className="w-2 h-2 fill-current" /> Popular
                              </span>
                            </div>
                            <div className="flex items-center gap-0.5 text-[9px] text-stone-600 font-medium">
                              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-500" />
                              <span>{item.rating.toFixed(1)}</span>
                            </div>
                          </div>
                          <h3 className="text-sm font-serif font-bold text-stone-900 line-clamp-1">
                            {item.name}
                          </h3>
                          <p className="text-[11px] text-stone-550 line-clamp-2 leading-relaxed font-light">
                            {item.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                          <span className="text-sm font-mono text-[#aa7c11] font-semibold">
                            ₹{item.price}
                          </span>

                          {qty > 0 ? (
                            <div className="flex items-center gap-2 bg-[#d4af37] rounded-xl p-0.5 border border-[#d4af37]">
                              <button
                                onClick={() => onRemoveFromCart(item)}
                                className="w-6 h-6 rounded-lg bg-stone-900 text-[#d4af37] flex items-center justify-center active:bg-stone-850"
                              >
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <span className="text-black font-mono font-bold text-xs w-4 text-center">
                                {qty}
                              </span>
                              <button
                                onClick={() => onAddToCart(item)}
                                className="w-6 h-6 rounded-lg bg-stone-900 text-[#d4af37] flex items-center justify-center active:bg-stone-850"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={() => onAddToCart(item)}
                              className="px-2.5 py-1.5 bg-stone-900 hover:bg-stone-805 text-[10px] font-bold tracking-wider text-white rounded-lg border border-stone-800 flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3 text-[#d4af37]" /> ADD
                            </motion.button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Direct Menu Browsing Trigger Cards (Bento-grid styled highlights) */}
            <div className="px-4 space-y-4">
              <h2 className="text-lg font-serif font-bold text-stone-900 uppercase tracking-wide">
                Popular Flavors
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div
                  onClick={() => {
                    setSelectedMobileCategory("south-indian");
                    setActiveTab("menu");
                  }}
                  className="relative h-24 rounded-2xl overflow-hidden cursor-pointer group shadow-[0_8px_25px_rgba(40,30,10,0.05)]"
                >
                  <img
                    src="https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&q=80&w=300"
                    className="w-full h-full object-cover brightness-[0.7] group-hover:scale-105 transition-all duration-300"
                    alt="South Indian"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-3 left-3 text-xs font-serif font-bold text-white">
                    🥞 South Indian
                  </span>
                </div>
                <div
                  onClick={() => {
                    setSelectedMobileCategory("chinese");
                    setActiveTab("menu");
                  }}
                  className="relative h-24 rounded-2xl overflow-hidden cursor-pointer group shadow-[0_8px_25px_rgba(40,30,10,0.05)]"
                >
                  <img
                    src="https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&q=80&w=300"
                    className="w-full h-full object-cover brightness-[0.7] group-hover:scale-105 transition-all duration-300"
                    alt="Chinese"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-3 left-3 text-xs font-serif font-bold text-white">
                    🥢 Chinese Wok
                  </span>
                </div>
                <div
                  onClick={() => {
                    setSelectedMobileCategory("main-course");
                    setActiveTab("menu");
                  }}
                  className="relative h-24 rounded-2xl overflow-hidden cursor-pointer group shadow-[0_8px_25px_rgba(40,30,10,0.05)]"
                >
                  <img
                    src="https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&q=80&w=300"
                    className="w-full h-full object-cover brightness-[0.7] group-hover:scale-105 transition-all duration-300"
                    alt="Indian Main Course"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-3 left-3 text-xs font-serif font-bold text-white">
                    🥘 Indian Mains
                  </span>
                </div>
                <div
                  onClick={() => {
                    setSelectedMobileCategory("pizza");
                    setActiveTab("menu");
                  }}
                  className="relative h-24 rounded-2xl overflow-hidden cursor-pointer group shadow-[0_8px_25px_rgba(40,30,10,0.05)]"
                >
                  <img
                    src="https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&q=80&w=300"
                    className="w-full h-full object-cover brightness-[0.7] group-hover:scale-105 transition-all duration-300"
                    alt="Pizza"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-3 left-3 text-xs font-serif font-bold text-white">
                    🍕 Pizza & Italian
                  </span>
                </div>
              </div>
            </div>

          </div>
        ),
        menu: (
          <div className="animate-fade-in pb-12">
            {/* Sticky/Fixed-style Search Bar & Veg Toggles for fast food-app browsing */}
            <div className="bg-[#FAF9F5]/98 backdrop-blur-xl sticky top-11 z-30 px-4 py-3.5 space-y-3.5 border-b border-stone-200/65 shadow-[0_4px_20px_rgba(40,30,10,0.015)]">
              {/* Premium Culinary Search Track */}
              <div className="relative bg-white rounded-xl border border-stone-200 shadow-[0_2px_12px_rgba(40,30,10,0.01)] flex items-center transition-all duration-300 focus-within:border-[#aa7c11] focus-within:ring-2 focus-within:focus-within:ring-[#aa7c11]/10 px-3 py-1.5">
                <Search className="h-4 w-4 text-[#aa7c11] mr-2 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search pure savory starters, dosas, shakes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-stone-900 placeholder-stone-400 focus:outline-none text-[11px] font-sans font-medium"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute inset-y-0 right-3 flex items-center justify-center p-1 rounded-full hover:bg-stone-50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-stone-500" />
                  </button>
                )}
              </div>

              {/* Toggles bar */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVegOnly(!vegOnly)}
                  className={`relative flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-[10px] uppercase tracking-widest font-bold font-mono transition-all duration-300 border cursor-pointer ${
                    vegOnly
                      ? "bg-green-500/8 text-green-700 border-green-300 shadow-inner"
                      : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex items-center justify-center border ${vegOnly ? "border-green-600 bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" : "border-stone-400 bg-stone-150"}`}
                  >
                    <span
                      className="w-1 h-1 rounded-full bg-current"
                      style={{ display: vegOnly ? "block" : "none" }}
                    />
                  </span>
                  PURE VEG
                </button>

                <button
                  type="button"
                  onClick={() => setBestsellerOnly(!bestsellerOnly)}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-[10px] uppercase tracking-widest font-bold font-mono transition-all duration-300 border cursor-pointer ${
                    bestsellerOnly
                      ? "bg-amber-500/8 text-[#aa7c11] border-amber-300 shadow-inner"
                      : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <ThumbsUp
                    className={`w-3.5 h-3.5 ${bestsellerOnly ? "text-[#aa7c11] fill-current" : "text-stone-400"}`}
                  />
                  BESTSELLERS
                </button>
              </div>

              {/* Horizontal Category Chips */}
              <div className="relative">
                <div className="overflow-x-auto pb-1 flex gap-1.5 scrollbar-none scroll-smooth">
                  {mobileCategoryChips.map((chip) => {
                    const isSelected = selectedMobileCategory === chip.id;
                    return (
                      <motion.button
                        key={chip.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedMobileCategory(chip.id)}
                        className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-[10px] font-bold tracking-wider transition-all duration-200 flex items-center gap-1.5 cursor-pointer relative ${
                          isSelected
                            ? "bg-[#aa7c11] text-white shadow-md shadow-[#aa7c11]/10 border border-[#aa7c11]"
                            : "bg-white text-stone-600 border border-stone-200 hover:border-stone-300"
                        }`}
                      >
                        <span className="text-[11px]">{chip.emoji}</span>
                        <span className="font-sans text-[10px] uppercase tracking-wider">
                          {chip.label.replace(chip.emoji, "").trim()}
                        </span>
                        {isSelected && (
                          <motion.span
                            layoutId="mobileActiveIndicator"
                            className="absolute -bottom-0.5 left-1/4 right-1/4 h-[2px] bg-white rounded-full"
                            transition={{
                              type: "spring",
                              stiffness: 380,
                              damping: 30,
                            }}
                          />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Menu Cards List */}
            <div className="px-4 py-4 space-y-4">
              {filteredMenuList.length === 0 ? (
                <div className="py-16 text-center max-w-xs mx-auto">
                  <div className="w-12 h-12 rounded-full bg-white border border-stone-200 flex items-center justify-center text-[#aa7c11] mx-auto mb-3">
                    <Utensils className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-stone-900 uppercase tracking-wider">
                    No Dishes Found
                  </h4>
                  <p className="text-xs text-stone-500 font-light mt-1.5">
                    Savor another search term or select a broader category!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredMenuList.map((item) => {
                    const qty =
                      cart.find((ci) => ci.menuItem.id === item.id)?.quantity ||
                      0;
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className="bg-white border border-stone-200/90 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(40,30,10,0.02)] p-4 flex gap-3 relative"
                      >
                        {/* Text & Cart controls */}
                        <div className="flex-grow flex flex-col justify-between min-w-0">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 mb-1">
                              {/* Pure Veg square green dot */}
                              <div className="border border-green-600 p-[1px] flex items-center justify-center w-3 h-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
                              </div>
                              {item.isBestseller && (
                                <span className="text-[7px] font-mono bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded uppercase font-bold flex-shrink-0">
                                  Bestseller
                                </span>
                              )}
                            </div>
                            <div className="flex items-start justify-between gap-1">
                              <h3 className="text-xs font-serif font-bold text-stone-900 line-clamp-1">
                                {item.name}
                              </h3>
                            </div>
                            <p className="text-[10px] text-stone-500 font-sans leading-relaxed line-clamp-2">
                              {item.description}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-stone-100 mt-1">
                            <span className="text-xs font-mono font-bold text-[#aa7c11]">
                              ₹{item.price}
                            </span>

                            {qty > 0 ? (
                              <div className="flex items-center gap-2 bg-[#d4af37] rounded-lg p-0.5">
                                <button
                                  onClick={() => onRemoveFromCart(item)}
                                  className="w-5.5 h-5.5 rounded bg-stone-900 text-[#d4af37] flex items-center justify-center"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-black font-mono font-black text-xs w-4 text-center">
                                  {qty}
                                </span>
                                <button
                                  onClick={() => onAddToCart(item)}
                                  className="w-5.5 h-5.5 rounded bg-stone-900 text-[#d4af37] flex items-center justify-center"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => onAddToCart(item)}
                                className="px-3 py-1 bg-stone-900 border border-stone-800 text-[9px] font-mono font-bold text-white rounded-lg flex items-center gap-1 hover:border-[#aa7c11] cursor-pointer"
                              >
                                <Plus className="w-2.5 h-2.5 text-[#d4af37]" />{" "}
                                ADD
                              </motion.button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ),
        search: (
          <div className="px-4 py-6 animate-fade-in pb-12 space-y-4">
            <h2 className="text-lg font-serif font-bold text-stone-900 uppercase tracking-wide flex items-center gap-2">
              <Search className="w-5 h-5 text-[#aa7c11]" /> Direct Instant
              Search
            </h2>

            <div className="relative bg-white rounded-xl border border-stone-200 shadow-[0_2px_12px_rgba(40,30,10,0.01)] flex items-center transition-all duration-300 focus-within:border-[#aa7c11] focus-within:ring-2 focus-within:ring-[#aa7c11]/10 px-3 py-2">
              <Search className="h-4 w-4 text-[#aa7c11] mr-2 flex-shrink-0" />
              <input
                type="text"
                placeholder="Type name, category or tag (e.g. Dosa, Soup, Paneer)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-[#2c2c2c] placeholder-stone-400 focus:outline-none text-[11px] font-sans font-medium"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-3 flex items-center justify-center p-1 rounded-full hover:bg-stone-50 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-stone-500" />
                </button>
              )}
            </div>

            {searchQuery ? (
              <div className="space-y-4">
                <h3 className="text-xs font-mono font-bold text-stone-500 uppercase">
                  Search Results ({filteredMenuList.length})
                </h3>
                {filteredMenuList.map((item) => {
                  const qty =
                    cart.find((ci) => ci.menuItem.id === item.id)?.quantity ||
                    0;
                  return (
                    <div
                      key={item.id}
                      className="bg-white p-4 rounded-xl border border-stone-200/95 flex gap-3 shadow-[0_4px_15px_rgba(40,30,10,0.02)] animate-fade-in"
                    >
                      <div className="flex-grow min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            {/* Pure Veg green dot */}
                            <div className="border border-green-600 p-[1px] flex items-center justify-center w-2.5 h-2.5">
                              <div className="w-1 h-1 rounded-full bg-green-600" />
                            </div>
                          </div>
                          <h4 className="text-xs font-bold text-stone-900 truncate">
                            {item.name}
                          </h4>
                          <p className="text-[10px] text-stone-500 line-clamp-1">
                            {item.description}
                          </p>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs font-mono text-[#aa7c11] font-semibold">
                            ₹{item.price}
                          </span>
                          {qty > 0 ? (
                            <div className="flex items-center gap-1.5 bg-[#d4af37] rounded p-0.5">
                              <button
                                onClick={() => onRemoveFromCart(item)}
                                className="w-5 h-5 bg-stone-900 text-[#d4af37] rounded flex items-center justify-center"
                              >
                                -
                              </button>
                              <span className="text-[10px] text-black font-mono font-bold w-3 text-center">
                                {qty}
                              </span>
                              <button
                                onClick={() => onAddToCart(item)}
                                className="w-5 h-5 bg-stone-900 text-[#d4af37] rounded flex items-center justify-center"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => onAddToCart(item)}
                              className="text-[9px] font-mono bg-stone-900 border border-stone-800 text-white px-2 py-0.5 rounded flex items-center gap-0.5 cursor-pointer"
                            >
                              + ADD
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center space-y-4 max-w-xs mx-auto">
                <p className="text-xs text-stone-500">Popular hot searches:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "Masala Dosa",
                    "Veg Kurkure Momos",
                    "Paneer Butter Masala",
                    "Chilli Paneer",
                    "Cold Coffee",
                    "Chana Masala",
                  ].map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSearchQuery(tag)}
                      className="px-3 py-1.5 bg-white border border-stone-200 text-[10px] text-stone-600 rounded-lg hover:border-[#aa7c11] hover:text-stone-900 transition-all cursor-pointer shadow-sm"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ),
        cart: (
          <div className="animate-fade-in pb-12">
            <div className="px-4 py-5 border-b border-stone-200/85 flex items-center justify-between bg-white shadow-sm">
              <h2 className="text-lg font-serif font-bold text-stone-900 uppercase tracking-wide flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#aa7c11]" /> Luxury Basket
              </h2>
              <span className="text-xs font-mono text-stone-550">
                ({totalItems} Items)
              </span>
            </div>

            {orderPlaced ? (
              <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <CheckCircle2 className="w-16 h-16 text-[#aa7c11] animate-bounce" />
                <h3 className="mt-4 text-lg font-serif font-bold text-stone-900 uppercase tracking-wide">
                  Order Dispatched!
                </h3>
                <p className="mt-2 text-xs text-stone-550 leading-relaxed font-sans max-w-xs">
                  Your order has been directly submitted to our live kitchen dashboard.
                  Staff will prepare your delicious pure vegetarian dishes shortly!
                </p>
                <span className="mt-4 text-[10px] font-mono bg-stone-50 border border-stone-150 px-3 py-1 rounded text-stone-505">
                  Order registered successfully
                </span>
              </div>
            ) : cart.length === 0 ? (
              <div className="py-20 text-center space-y-4 max-w-xs mx-auto">
                <div className="w-14 h-14 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-400 mx-auto shadow-sm">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-stone-900">
                  Your Plate is Empty
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed max-w-[200px] mx-auto">
                  Browse through our menu categories and add pure veg dishes to
                  order.
                </p>
                <button
                  onClick={() => setActiveTab("menu")}
                  className="px-4 py-2 bg-[#aa7c11] text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer"
                >
                  Browse Menu
                </button>
              </div>
            ) : (
              <form onSubmit={handleCheckoutSubmit} className="flex flex-col">
                {/* Cart Items */}
                <div className="px-4 py-4 space-y-3">
                  {cart.map((item) => (
                    <div
                      key={item.menuItem.id}
                      className="bg-white p-3.5 rounded-xl border border-stone-250 flex flex-col gap-2.5 shadow-sm"
                    >
                      <div className="flex gap-3">
                        <img
                          src={item.menuItem.imageUrl}
                          alt={item.menuItem.name}
                          className="w-12 h-12 rounded-lg object-cover bg-stone-105"
                        />
                        <div className="flex-grow min-w-0">
                          <div className="flex justify-between">
                            <h4 className="text-xs font-bold text-stone-900 truncate font-sans">
                              {item.menuItem.name}
                            </h4>
                            <span className="text-xs font-mono font-bold text-[#aa7c11]">
                              ₹{item.menuItem.price * item.quantity}
                            </span>
                          </div>
                          <span className="text-[10px] text-stone-400 font-mono">
                            ₹{item.menuItem.price} each
                          </span>
                        </div>
                      </div>

                      {/* Customization Note per item inside cart */}
                      <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                        <input
                          type="text"
                          placeholder="No onion, extra spicy etc..."
                          value={item.customization || ""}
                          onChange={(e) =>
                            onUpdateCustomization(
                              item.menuItem.id,
                              e.target.value,
                            )
                          }
                          className="text-[10px] bg-stone-50 text-stone-850 placeholder-stone-400 rounded p-1.5 focus:outline-none border border-stone-200 w-32 font-sans font-light"
                        />
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-stone-50 p-0.5 rounded border border-stone-200">
                            <button
                              type="button"
                              onClick={() => onRemoveFromCart(item.menuItem)}
                              className="w-5 h-5 text-stone-500 hover:text-stone-950 cursor-pointer"
                            >
                              -
                            </button>
                            <span className="text-[11px] font-mono text-stone-900 font-bold w-4 text-center">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => onAddToCart(item.menuItem)}
                              className="w-5 h-5 text-stone-500 hover:text-stone-950 cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onRemoveEntirelyFromCart(item.menuItem)
                            }
                            className="text-stone-400 hover:text-red-500 hover:bg-red-50/50 p-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center border border-stone-200"
                            title="Remove from cart"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Form Billing */}
                <div className="bg-white m-4 p-4 rounded-2xl border border-stone-250 space-y-4 shadow-sm">
                  {showOtpMobile ? (
                    <div className="space-y-4 font-sans text-left">
                      <div className="flex items-center gap-2 text-[#aa7c11]">
                        <svg
                          className="w-5 h-5 animate-pulse"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#aa7c11]">
                          OTP Security Gate
                        </span>
                      </div>

                      <p className="text-stone-500 text-xs leading-relaxed font-sans">
                        To reserve your kitchen service and complete checkout, a
                        simulated 4-digit code has been dispatched via cellular
                        gateway to:{" "}
                        <strong className="text-stone-900">
                          {phoneNumber || "+91 11-4560-4560"}
                        </strong>
                        .
                      </p>

                      <div className="space-y-1.5">
                        <label className="text-[9px] text-stone-550 font-mono block">
                          ENTER 4-DIGIT VERIFICATION CODE
                        </label>
                        <input
                          type="text"
                          maxLength={4}
                          required
                          placeholder="••••"
                          value={otpCodeMobile}
                          onChange={(e) =>
                            setOtpCodeMobile(e.target.value.replace(/\D/g, ""))
                          }
                          className="w-full text-center tracking-[0.8em] font-mono font-bold bg-white text-stone-900 placeholder-stone-300 text-base border border-stone-200 rounded-xl p-3 focus:outline-none focus:border-[#aa7c11]"
                        />
                        {otpErrorMobile && (
                          <p className="text-[10px] text-red-650 font-sans mt-1">
                            {otpErrorMobile}
                          </p>
                        )}
                      </div>

                      {/* Verification passcode display for demo/sandbox environment */}
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[9px] text-stone-750 font-mono flex items-center justify-between">
                        <span>🔐 SMS VERIFICATION CODE:</span>
                        <strong className="text-xs font-bold text-[#aa7c11] tracking-wide font-mono">
                          {generatedOtpMobile}
                        </strong>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-xs">
                        <button
                          type="button"
                          onClick={handleCancelOtpMobile}
                          className="text-stone-500 hover:text-stone-750 font-medium underline cursor-pointer"
                        >
                          Modify Details
                        </button>

                        {otpCountdownMobile > 0 ? (
                          <span className="text-stone-400 font-mono text-[10px]">
                            Resend in {otpCountdownMobile}s
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleResendOtpMobile}
                            className="text-[#aa7c11] hover:text-[#aa7c11]/80 font-bold underline cursor-pointer"
                          >
                            Resend Code
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4 className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-widest">
                        Diner & Service Details
                      </h4>

                      {/* Dine-in vs Takeaway selector */}
                      <div className="grid grid-cols-2 gap-2 bg-stone-105 p-1 rounded-lg border border-stone-200">
                        {(["dine-in", "takeaway"] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setOrderType(type)}
                            className={`py-1.5 rounded text-[9px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                              orderType === type
                                ? "bg-[#d4af37] text-black shadow-sm"
                                : "text-stone-500 hover:text-stone-800"
                            }`}
                          >
                            {type.replace("-", " ")}
                          </button>
                        ))}
                      </div>

                      {/* Form inputs */}
                      <div className="space-y-3">
                        <div>
                          <label className="text-[9px] text-stone-550 font-mono block mb-1">
                            YOUR NAME *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Aaryan Rajput"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            className="w-full bg-white text-stone-850 placeholder-stone-400 text-xs border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:border-[#aa7c11]"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] text-stone-550 font-mono block mb-1">
                            PHONE NUMBER (OPTIONAL)
                          </label>
                          <input
                            type="tel"
                            placeholder="+91-11-XXXX-XXXX"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className="w-full bg-white text-stone-850 placeholder-stone-400 text-xs border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:border-[#aa7c11]"
                          />
                        </div>

                        {orderType === "dine-in" && (
                          <div className="space-y-3">
                            <div>
                              <label className="text-[9px] text-stone-550 font-mono block mb-1 font-bold">
                                TABLE NUMBER *
                              </label>
                              {!tableNumber ? (
                                <div className="bg-red-50 border border-red-200 p-2.5 rounded-xl text-[10px] text-red-800 font-sans flex items-center gap-1.5 mb-1.5 shadow-xs">
                                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                  <span>
                                    No valid table detected. Scanned Table QR Code is strictly required to place a Dine-In order.
                                  </span>
                                </div>
                              ) : (
                                <div className="bg-amber-50 border border-amber-200/60 p-2 rounded-xl text-[10px] text-[#aa7c11] font-sans flex items-center gap-1.5 mb-1.5 shadow-xs">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                  <span>
                                    Table #{tableNumber} pre-filled via dining
                                    QR code!
                                  </span>
                                </div>
                              )}
                              <input
                                type="text"
                                required
                                readOnly
                                placeholder="⚠️ Scan table QR to detect"
                                value={tableNumber ? `Table #${tableNumber}` : ""}
                                className="w-full bg-stone-100 text-stone-500 font-bold placeholder-stone-400 text-xs border border-stone-200 rounded-lg p-2.5 outline-none cursor-not-allowed select-none"
                              />
                            </div>
                          </div>
                        )}

                        {orderType === "delivery" && (
                          <div>
                            <label className="text-[9px] text-stone-550 font-mono block mb-1">
                              DELIVERY ADDRESS *
                            </label>
                            <textarea
                              required
                              placeholder="Write address, landmarks, sector codes..."
                              rows={2}
                              value={address}
                              onChange={(e) => setAddress(e.target.value)}
                              className="w-full bg-white text-stone-850 placeholder-stone-400 text-xs border border-stone-200 rounded-lg p-2.5 focus:outline-none focus:border-[#aa7c11] resize-none"
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Subtotal & Call-To-Action sticky button */}
                <div className="bg-white border-t border-stone-205 p-4 space-y-3 pb-8 shadow-[0_-8px_30px_rgba(40,30,10,0.02)]">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-stone-500">
                      <span>Plates Price</span>
                      <span className="font-mono">₹{subtotal}</span>
                    </div>
                    {settings.gstEnabled && gst > 0 && (
                      <>
                        <div className="flex justify-between text-stone-500">
                          <span>CGST ({((settings.cgstRate ?? 2.5)).toFixed(1)}%)</span>
                          <span className="font-mono">₹{(gst / 2).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-stone-500">
                          <span>SGST ({((settings.sgstRate ?? 2.5)).toFixed(1)}%)</span>
                          <span className="font-mono">₹{(gst / 2).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    {packagingCharge > 0 && (
                      <div className="flex justify-between text-stone-500">
                        <span>Convenience Packing</span>
                        <span className="font-mono font-medium">
                          ₹{packagingCharge}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-stone-900 text-base font-bold pt-2 border-t border-stone-105">
                      <span className="font-serif italic font-medium">
                        Total Price
                      </span>
                      <span className="font-mono text-[#aa7c11]">
                        ₹{grandTotal}
                      </span>
                    </div>
                  </div>

                  {checkoutErrorMobile && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs text-center font-sans">
                      {checkoutErrorMobile}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmittingMobile}
                    className="w-full mt-2 py-3.5 bg-stone-900 hover:bg-[#aa7c11] text-white font-bold rounded-xl text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <Send
                      className={`w-4 h-4 text-white fill-current ${isSubmittingMobile ? "animate-bounce" : ""}`}
                    />
                    {isSubmittingMobile
                      ? "RESERVING DISHES..."
                      : showOtpMobile
                        ? "VERIFY OTP & CONFIRM"
                        : "Place Order Online"}
                  </button>
                </div>
              </form>
            )}
          </div>
        ),
        contact: (
          <div className="px-4 py-6 animate-fade-in pb-12 space-y-6">
            {/* Restaurant Brand Card */}
            <div className="bg-white border border-stone-200 rounded-3xl p-6 text-center shadow-xs space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-[#d4af37]/30 flex items-center justify-center text-[#aa7c11] mx-auto shadow-xs">
                <Utensils className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-900 tracking-wide uppercase">
                {settings.name || "THE XINGS KITCHEN"}
              </h3>
              <p className="text-xs text-stone-500 font-sans">
                Authentic Flavor & Hospitality • Dine-In & Takeaway
              </p>
            </div>

            <h2 className="text-xl font-serif font-bold text-stone-900 uppercase tracking-wide flex items-center gap-2 pt-2">
              <Info className="w-5 h-5 text-[#aa7c11]" /> Contact & Reach Us
            </h2>

            {/* Quick action buttons row */}
            <div className="grid grid-cols-2 gap-3">
              <a
                href="tel:+919209521933"
                className="bg-white border border-stone-200 p-4 rounded-2xl flex flex-col items-center text-center justify-center space-y-2 shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-[#aa7c11]" />
                </div>
                <span className="text-xs font-bold text-stone-900">
                  Call Kitchen
                </span>
                <span className="text-[10px] text-stone-500">
                  +91 92095 21933
                </span>
              </a>

              <div
                className="bg-white border border-stone-200 p-4 rounded-2xl flex flex-col items-center text-center justify-center space-y-2 shadow-sm focus:outline-none"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-[#aa7c11]" />
                </div>
                <span className="text-xs font-bold text-stone-900">
                  Visit Venue
                </span>
                <span className="text-[10px] text-stone-500">
                  Trimurti Nagar, Nagpur
                </span>
              </div>
            </div>

            {/* Timings and details list */}
            <div className="bg-white border border-stone-200 p-5 rounded-3xl space-y-4 shadow-sm">
              <div className="flex gap-3">
                <Clock className="w-5 h-5 text-[#aa7c11] flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                    Operating Hours
                  </h4>
                  <p className="text-xs text-stone-500 mt-1">
                    Open 7 days a week
                  </p>
                  <p className="text-[10px] font-mono text-[#aa7c11] mt-0.5 font-bold">
                    Mon-Thu: 7 AM - 10:30 PM | Fri-Sat: 7 AM - 10 PM | Sun: 7 AM - 10:30 PM
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <MapPin className="w-5 h-5 text-[#aa7c11] flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">
                    Restaurant Address
                  </h4>
                  <p className="text-xs text-stone-500 mt-1 font-light leading-relaxed">
                    Shop No. G-3, Shivpuja Apartment, Plot No. 50,
                    <br />
                    Beside Trimurti Nagar Bus Stop, Mankapur Ring Road,
                    <br />
                    Subhash Nagar, Trimurti Nagar, Nagpur 440022
                  </p>
                </div>
              </div>
            </div>

            {/* Location Map Embedding with premium light design overlay */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono font-bold text-stone-500 uppercase">
                Find on Google Maps
              </h3>
              <div className="w-full h-48 rounded-2xl overflow-hidden border border-stone-200 bg-[#FAF9F5] flex items-center justify-center relative shadow-sm">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3501.0772718136367!2d77.1082!3d28.6322!2m3!1f0!2f0!3f0!3m2!1i1248!2i786!4m2!3m1!1s0x0%3A0x0!2zMjgmdW5pcXVl!5e0!3m2!1sen!2sin!4v1680000000000!5m2!1sen!2sin"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen={true}
                  loading="lazy"
                  title="WebRajya POS Restaurant Map"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="opacity-90 focus:outline-none"
                ></iframe>

                <a
                  href="https://maps.google.com"
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-stone-250 text-[10px] font-bold uppercase tracking-wider text-stone-900 shadow-sm flex items-center gap-1 cursor-pointer"
                >
                  <MapPin className="w-3 h-3 text-[#aa7c11]" /> Directions
                </a>
              </div>
            </div>

            {/* Social icons list */}
            <div className="flex justify-center items-center gap-5 pt-4">
              <a
                href="https://facebook.com"
                className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:text-[#aa7c11] shadow-sm"
              >
                <Facebook className="w-4 h-4" />
              </a>
              <a
                href="https://instagram.com"
                className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:text-[#aa7c11] shadow-sm"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://twitter.com"
                className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-500 hover:text-[#aa7c11] shadow-sm"
              >
                <Twitter className="w-4 h-4" />
              </a>
            </div>


          </div>
        ),
      })}

      {/* Floating Bottom Menu Cart Basket Trigger when Cart has items */}
      <AnimatePresence>
        {totalItems > 0 && activeTab !== "cart" && (
          <motion.button
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            onClick={() => setActiveTab("cart")}
            className="fixed bottom-20 left-4 right-4 z-40 bg-gradient-to-r from-[#d4af37] to-[#aa7c11] text-amber-950 font-bold p-3.5 rounded-xl shadow-xl border border-yellow-300/30 flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="relative">
                <ShoppingBag className="w-5 h-5 stroke-[2]" />
                <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white animate-pulse">
                  {totalItems}
                </span>
              </div>
              <span className="text-[11px] uppercase tracking-wider font-extrabold pr-1">
                Total Plates in Basket
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-sm font-black">
              <span>₹{grandTotal}</span>
              <ChevronRight className="w-4 h-4 stroke-[2.5] bg-black/10 rounded-full" />
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Sticky Bottom Navigation Bar requested in requirements */}
      {/* Home, Menu, Search, Cart, Profile / Contact */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-stone-200/80 z-50 py-2.5 px-4 flex justify-between items-center select-none shadow-[0_-8px_30px_rgba(0,0,0,0.04)]">
        {[
          { tab: "home" as const, label: "Home", icon: Home },
          { tab: "menu" as const, label: "Menu", icon: Utensils },
          { tab: "search" as const, label: "Search", icon: Search },
          {
            tab: "cart" as const,
            label: "Cart",
            icon: ShoppingBag,
            badge: totalItems,
          },
          { tab: "contact" as const, label: "Info", icon: Info },
        ].map(({ tab, label, icon: Icon, badge }) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex flex-col items-center justify-center w-16 relative py-1 focus:outline-none transition-colors duration-250 cursor-pointer ${
                isActive
                  ? "text-[#aa7c11]"
                  : "text-stone-400 hover:text-stone-700"
              }`}
            >
              <div className="relative font-sans">
                <Icon
                  className={`w-5 h-5 stroke-[2] transition-transform duration-300 ${isActive ? "scale-110" : ""}`}
                />
                {badge !== undefined && badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white">
                    {badge}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-medium mt-1 leading-none tracking-wide font-sans">
                {label}
              </span>

              {/* Highlight bar indicator */}
              {isActive && (
                <motion.div
                  layoutId="indicator"
                  className="absolute bottom-0 w-8 h-[2px] bg-[#aa7c11] rounded-full"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// Simulated App Skeleton Loading Screen for high-end mobile experience
function MobileSkeleton() {
  return (
    <div className="px-4 py-6 space-y-6 animate-pulse">
      <div className="h-[340px] bg-stone-200/60 rounded-3xl w-full" />
      <div className="h-16 bg-stone-200/60 rounded-2xl w-full" />
      <div className="space-y-3">
        <div className="h-5 bg-stone-200/60 rounded w-1/3" />
        <div className="flex gap-4 overflow-hidden">
          <div className="h-44 bg-stone-200/60 rounded-3xl w-60 flex-shrink-0" />
          <div className="h-44 bg-stone-200/60 rounded-3xl w-60 flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}

// Router switcher with animated keyframes
function animateContainer(
  isLoading: boolean,
  activeTab: string,
  views: { [key: string]: React.ReactNode },
) {
  if (isLoading) return <MobileSkeleton />;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeTab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: "easeInOut" }}
        className="flex-grow"
      >
        {views[activeTab]}
      </motion.div>
    </AnimatePresence>
  );
}
