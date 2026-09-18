import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Utensils, Star, Flame, Sparkles } from "lucide-react";
import Header from "./components/Header";
import MenuItemCard from "./components/MenuItemCard";
import ChefSpecials from "./components/ChefSpecials";
import Footer from "./components/Footer";
import CartOverlay from "./components/CartOverlay";
import AdminLogin from "./components/AdminLogin";
import AdminDashboard from "./components/AdminDashboard";
import MobileView from "./components/MobileView";
import { LocalDB } from "./lib/db";
import { PrintQueueManager } from "./lib/printQueueManager";
import { JSPrintManagerService } from "./lib/jsprintmanagerService";
import { CartItem, MenuItem, Category } from "./types";
import { parseCurrentRoute, navigateTo, getScannedTableNumber } from "./lib/router";

export default function App() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showVegOnly, setShowVegOnly] = useState(false);
  const [showBestsellersOnly, setShowBestsellersOnly] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [tableNumber, setTableNumber] = useState<string>(() => getScannedTableNumber());

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Client router logic powered by router utility
  const [view, setView] = useState<"menu" | "admin">(() => parseCurrentRoute().view);
  
  const [adminToken, setAdminToken] = useState<string | null>(
    localStorage.getItem("ij_admin_jwt") || sessionStorage.getItem("ij_admin_jwt")
  );

  // Dynamic menu items read directly from LocalDB
  const [menuList, setMenuList] = useState<MenuItem[]>(() => LocalDB.getMenuItems());

  // Listen to local DB updates so changes made inside Admin panel are rendered live
  useEffect(() => {
    // Initialize background auto-print listeners
    PrintQueueManager.initAutoPrintListeners();

    // Initialize shared JSPrintManager client connection
    JSPrintManagerService.init();

    const handleSync = () => {
      setMenuList(LocalDB.getMenuItems());
      const scanned = getScannedTableNumber();
      if (scanned) {
        setTableNumber(scanned);
      }
    };
    window.addEventListener("storage", handleSync);
    // Custom internal dispatch sync
    window.addEventListener("menu_updated", handleSync);

    // Dynamic backend catalog sync on mount
    const loadRealData = async () => {
      try {
        const items = await LocalDB.fetchMenuItems();
        setMenuList(items);
      } catch (err) {
        // Fallback
      }
    };
    loadRealData();
    
    // Router pop, hash, and route change updates
    const handleRoute = () => {
      const current = parseCurrentRoute();
      setView(current.view);
      const scanned = getScannedTableNumber();
      if (scanned) {
        setTableNumber(scanned);
      }
    };
    window.addEventListener("hashchange", handleRoute);
    window.addEventListener("popstate", handleRoute);
    window.addEventListener("app_route_change", handleRoute);

    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("menu_updated", handleSync);
      window.removeEventListener("hashchange", handleRoute);
      window.removeEventListener("popstate", handleRoute);
      window.removeEventListener("app_route_change", handleRoute);
    };
  }, []);

  const handleAdminLoginSuccess = (token: string, rememberMe: boolean) => {
    if (rememberMe) {
      localStorage.setItem("ij_admin_jwt", token);
    } else {
      sessionStorage.setItem("ij_admin_jwt", token);
    }
    setAdminToken(token);
    setView("admin");
    const route = parseCurrentRoute();
    if (route.view !== "admin") {
      navigateTo("/admin/dashboard");
    }
    
    // Force sync the state once loaded
    setMenuList(LocalDB.getMenuItems());
  };

  const handleAdminLogout = () => {
    localStorage.removeItem("ij_admin_jwt");
    sessionStorage.removeItem("ij_admin_jwt");
    setAdminToken(null);
    setView("menu");
    navigateTo("/", { replace: true });
    setMenuList(LocalDB.getMenuItems());
  };

  // Derived list of Chef's Specials from dynamic menuList
  const chefSpecialsList = useMemo(() => {
    return menuList.filter((item) => item.isChefSpecial);
  }, [menuList]);

  // Quick lookup of item quantities in the active cart
  const cartQuantities = useMemo(() => {
    const quantities: { [key: string]: number } = {};
    cart.forEach((item) => {
      quantities[item.menuItem.id] = item.quantity;
    });
    return quantities;
  }, [cart]);

  // Cart operations
  const handleAddToCart = (item: MenuItem) => {
    setCart((prevCart) => {
      const existing = prevCart.find((ci) => ci.menuItem.id === item.id);
      if (existing) {
        return prevCart.map((ci) =>
          ci.menuItem.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [...prevCart, { menuItem: item, quantity: 1 }];
    });
  };

  const handleRemoveFromCart = (item: MenuItem) => {
    setCart((prevCart) => {
      const existing = prevCart.find((ci) => ci.menuItem.id === item.id);
      if (existing) {
        if (existing.quantity === 1) {
          return prevCart.filter((ci) => ci.menuItem.id !== item.id);
        }
        return prevCart.map((ci) =>
          ci.menuItem.id === item.id ? { ...ci, quantity: ci.quantity - 1 } : ci
        );
      }
      return prevCart;
    });
  };

  const handleRemoveEntirelyFromCart = (item: MenuItem) => {
    setCart((prevCart) => prevCart.filter((ci) => ci.menuItem.id !== item.id));
  };

  const handleUpdateCustomization = (itemId: string, note: string) => {
    setCart((prevCart) =>
      prevCart.map((ci) =>
        ci.menuItem.id === itemId ? { ...ci, customization: note } : ci
      )
    );
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Filter food items based on selected criteria from dynamic menuList
  const filteredItems = useMemo(() => {
    const items = menuList.filter((item) => {
      // Availability filter
      if (item.available === false) {
        return false;
      }
      // Category filter
      if (selectedCategory !== "all") {
        const itCat = (item.category || "").toLowerCase().trim();
        const selCat = selectedCategory.toLowerCase().trim();
        if (itCat !== selCat) return false;
      }
      // Search filter
      if (
        searchQuery &&
        !item.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !item.description.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      // Bestseller filter
      if (showBestsellersOnly && !item.isBestseller) {
        return false;
      }
      // Veg Filter
      if (showVegOnly && !item.isVeg) {
        return false;
      }
      return true;
    });
    console.log(`[Menu Cards Render Log] Rendering ${items.length} cards in public menu view.`);
    return items;
  }, [selectedCategory, searchQuery, showVegOnly, showBestsellersOnly, menuList]);

  // Derive full dynamic categories list from LocalDB and menuList
  const activeCategories = useMemo(() => {
    const list: Category[] = [...LocalDB.getCategories()];
    const seen = new Set(list.map(c => c.id.toLowerCase().trim()));

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

    for (const item of menuList) {
      if (item.category && !seen.has(item.category.toLowerCase().trim())) {
        const catName = item.category.trim();
        const lower = catName.toLowerCase();
        seen.add(lower);
        list.push({
          id: catName,
          name: catName,
          icon: emojiMap[lower] || "🍽️",
          description: `Authentic ${catName} specialties`
        });
      }
    }
    return list;
  }, [menuList]);

  // Group items by category for "all" view
  const categorizedItems = useMemo(() => {
    const list: { categoryId: string; items: MenuItem[] }[] = [];
    activeCategories.forEach((cat) => {
      const itemsForCategory = filteredItems.filter(
        (item) => item.category.toLowerCase().trim() === cat.id.toLowerCase().trim() ||
                  item.category.toLowerCase().trim() === cat.name.toLowerCase().trim()
      );
      if (itemsForCategory.length > 0) {
        list.push({ categoryId: cat.id, items: itemsForCategory });
      }
    });
    return list;
  }, [filteredItems, activeCategories]);

  // If view is administrative
  if (view === "admin") {
    if (adminToken) {
      return <AdminDashboard onLogout={handleAdminLogout} />;
    }
    return <AdminLogin onLoginSuccess={handleAdminLoginSuccess} />;
  }

  if (isMobile) {
    return (
      <MobileView
        menuList={menuList}
        cart={cart}
        onAddToCart={handleAddToCart}
        onRemoveFromCart={handleRemoveFromCart}
        onRemoveEntirelyFromCart={handleRemoveEntirelyFromCart}
        onUpdateCustomization={handleUpdateCustomization}
        onClearCart={handleClearCart}
        onAdminClick={() => {
          navigateTo("/admin/dashboard");
          setView("admin");
        }}
      />
    );
  }

  return (
    <div className="bg-[#FAF9F5] min-h-screen min-h-dvh text-stone-800 flex flex-col font-sans select-none antialiased selection:bg-[#d4af37] selection:text-black">
      
      {/* Ornate Top Banner / Announcement Bar */}
      <div className="bg-stone-900 text-[10px] sm:text-xs font-mono font-semibold text-[#d4af37] border-b border-stone-850/10 py-2.5 text-center tracking-widest uppercase flex items-center justify-center gap-1.5 sm:gap-3 px-4 relative z-40">
        <Sparkles className="w-3.5 h-3.5 animate-pulse text-[#d4af37]" />
        <span>THE XINGS KITCHEN • Customer Digital Menu</span>
        {tableNumber && (
          <>
            <span className="text-[#d4af37]/40">•</span>
            <span className="bg-[#d4af37] text-stone-950 px-2.5 py-0.5 rounded-full font-bold">
              Table #{tableNumber}
            </span>
          </>
        )}
      </div>

      {/* Main Hero Header Filter Navigation */}
      <Header
        categories={activeCategories}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategorySelect={setSelectedCategory}
        showVegOnly={showVegOnly}
        onVegOnlyChange={setShowVegOnly}
        showBestsellersOnly={showBestsellersOnly}
        onBestsellersChange={setShowBestsellersOnly}
      >
        {/* Culinary Chef's Special highlights */}
        <ChefSpecials
          specials={chefSpecialsList}
          cartQuantities={cartQuantities}
          onAddToCart={handleAddToCart}
          onRemoveFromCart={handleRemoveFromCart}
        />
      </Header>

      {/* Main Delicious Menu Content */}
      <main className="flex-grow py-16 px-4 max-w-7xl mx-auto w-full relative" id="digital-menu-grid">
        {/* Background Visual Flair */}
        <div className="absolute top-1/4 left-10 w-80 h-80 bg-[#d4af37]/2 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-yellow-900/2 blur-[130px] rounded-full pointer-events-none" />

        {/* Dynamic Category Layout or Grids */}
        {selectedCategory === "all" ? (
          /* Multi-Category Scrollview with beautiful custom headers */
          <div className="space-y-16">
            {categorizedItems.length === 0 ? (
              <NoItemsState searchQuery={searchQuery} />
            ) : (
              categorizedItems.map(({ categoryId, items }) => {
                const categoryDef = activeCategories.find((c) => c.id === categoryId);
                if (!categoryDef) return null;
                
                return (
                  <div key={categoryId} className="scroll-mt-32" id={`section-${categoryId}`}>
                    {/* Category Title Headers */}
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-stone-200 pb-4 mb-8">
                      <div className="flex items-center gap-3.5">
                        <span className="text-3xl bg-white p-2.5 rounded-2xl border border-stone-250 flex items-center justify-center shadow-sm" title={categoryDef.name}>
                          {categoryDef.icon}
                        </span>
                        <div>
                          <h3 className="text-xl sm:text-2xl font-serif font-bold text-stone-900 tracking-wide uppercase">
                            {categoryDef.name}
                          </h3>
                          <p className="text-xs sm:text-sm text-stone-500 font-sans font-light mt-0.5">
                            {categoryDef.description}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-[#aa7c11] bg-[#d4af37]/5 px-3 py-1 rounded-full border border-[#d4af37]/20">
                        {items.length} {items.length === 1 ? "Item" : "Dishes"}
                      </span>
                    </div>

                    {/* Food Items Cards Box Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                      {items.map((item) => (
                        <MenuItemCard
                          key={item.id}
                          item={item}
                          quantityInCart={cartQuantities[item.id] || 0}
                          onAddToCart={handleAddToCart}
                          onRemoveFromCart={handleRemoveFromCart}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Single Selected Category Grid */
          <div>
            {filteredItems.length === 0 ? (
              <NoItemsState searchQuery={searchQuery} />
            ) : (
              <div>
                {/* Single View Title */}
                <div className="border-b border-stone-200 pb-4 mb-8 flex items-center gap-4">
                  <span className="text-4xl bg-white p-3 rounded-2xl border border-stone-200 flex items-center justify-center shadow-sm">
                    {activeCategories.find((c) => c.id.toLowerCase().trim() === selectedCategory.toLowerCase().trim())?.icon || "🍽️"}
                  </span>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-wide uppercase">
                      {activeCategories.find((c) => c.id.toLowerCase().trim() === selectedCategory.toLowerCase().trim())?.name || selectedCategory}
                    </h2>
                    <p className="text-xs sm:text-sm text-stone-500 font-sans font-light mt-0.5">
                      {activeCategories.find((c) => c.id.toLowerCase().trim() === selectedCategory.toLowerCase().trim())?.description || `Authentic ${selectedCategory} selection`}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {filteredItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      quantityInCart={cartQuantities[item.id] || 0}
                      onAddToCart={handleAddToCart}
                      onRemoveFromCart={handleRemoveFromCart}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Premium contacts addresses operating hours google maps */}
      <Footer onAdminClick={() => {
        navigateTo("/admin/dashboard");
        setView("admin");
      }} />

      {/* Floating Checkout sync online basket drawer overlay */}
      <CartOverlay
        cart={cart}
        onAddToCart={handleAddToCart}
        onRemoveFromCart={handleRemoveFromCart}
        onRemoveEntirelyFromCart={handleRemoveEntirelyFromCart}
        onUpdateCustomization={handleUpdateCustomization}
        onClearCart={handleClearCart}
      />
    </div>
  );
}

/* Local Component Helper for Empty Search Results State */
interface NoItemsStateProps {
  searchQuery: string;
}

function NoItemsState({ searchQuery }: NoItemsStateProps) {
  return (
    <div className="py-24 text-center max-w-md mx-auto" id="no-items-state">
      <div className="w-16 h-16 rounded-full bg-white border border-stone-100 flex items-center justify-center text-[#d4af37] mx-auto mb-4 shadow-sm">
        <Utensils className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-serif font-bold text-stone-900 uppercase tracking-wider">No Delicious Dishes Found</h3>
      <p className="text-sm text-stone-500 font-sans font-light mt-2 leading-relaxed">
        We couldn&apos;t find any items matching &ldquo;<span className="text-stone-700 font-medium">{searchQuery}</span>&rdquo;. Savor another search parameter or toggle categories to find the best flavors!
      </p>
    </div>
  );
}
