import React, { useState } from "react";
import { Search, Sparkles, Flame, Check, ThumbsUp, Leaf } from "lucide-react";
import { motion } from "motion/react";
import { LocalDB } from "../lib/db";
import { Category } from "../types";

interface HeaderProps {
  children?: React.ReactNode;
  categories?: Category[];
  onSearchChange: (search: string) => void;
  selectedCategory: string;
  onCategorySelect: (categoryId: string) => void;
  showVegOnly: boolean;
  onVegOnlyChange: (show: boolean) => void;
  showBestsellersOnly: boolean;
  onBestsellersChange: (show: boolean) => void;
}

export default function Header({
  children,
  categories: propCategories,
  onSearchChange,
  selectedCategory,
  onCategorySelect,
  showVegOnly,
  onVegOnlyChange,
  showBestsellersOnly,
  onBestsellersChange
}: HeaderProps) {
  const categoriesList = propCategories && propCategories.length > 0 
    ? propCategories 
    : LocalDB.getCategories();
  const [searchValue, setSearchValue] = useState("");

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    onSearchChange(value);
  };

  const handleCategoryClick = (catId: string) => {
    onCategorySelect(catId);
    setTimeout(() => {
      const targetId = catId === "all" ? "digital-menu-grid" : `section-${catId}`;
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        const menuGrid = document.getElementById("digital-menu-grid");
        if (menuGrid) {
          menuGrid.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }, 150);
  };

  return (
    <header className="relative w-full overflow-hidden" id="restaurant-header">
      {/* Background Hero Banner */}
      <div className="relative h-[480px] w-full flex items-center justify-center">
        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{
          backgroundImage: "linear-gradient(to bottom, rgba(15, 15, 15, 0.4), rgba(10, 10, 10, 0.95)), url('https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=1200')"
        }} />
        
        {/* Golden Ornate Frame Borders */}
        <div className="absolute inset-0 pointer-events-none border-[12px] border-[#d4af37]/10 m-4 sm:m-6 rounded-sm md:border-[16px]" />
        
        {/* Hero Content */}
        <div className="relative text-center px-6 max-w-4xl z-10">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex items-center justify-center gap-2 mb-3"
          >
            <span className="h-px w-8 sm:w-16 bg-gradient-to-r from-transparent to-[#d4af37]" />
            <span className="text-[#d4af37] font-serif tracking-[0.25em] text-xs sm:text-sm uppercase font-semibold">RESTAURANT & CULINARY HUB</span>
            <span className="h-px w-8 sm:w-16 bg-gradient-to-l from-transparent to-[#d4af37]" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.1 }}
            className="text-4xl sm:text-6xl md:text-7xl font-serif font-extrabold text-white tracking-wide"
            id="brand-title"
          >
            THE XINGS KITCHEN
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="mt-4 text-gray-300 font-sans tracking-wide text-sm sm:text-lg italic font-light"
          >
            &ldquo;Authentic Flavors & Smart Billing Operations&rdquo;
          </motion.p>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs font-mono text-gray-400">
            <span className="flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-[#d4af37]" /> 100% Veg</span>
            <span className="text-[#d4af37]">•</span>
            <span className="flex items-center gap-1.5"><Flame className="w-3 h-3 text-[#d4af37]" /> Authentic South Indian</span>
          </div>

          {/* Search Box */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-8 max-w-xl mx-auto relative group bg-white/95 backdrop-blur-md rounded-full border border-stone-200 p-1.5 focus-within:border-[#d4af37] transition-all duration-300 shadow-xl"
          >
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-[#d4af37] group-focus-within:text-stone-900 transition-colors duration-200" />
            </div>
            <input
              type="text"
              placeholder="Search dishes (e.g., Masala Dosa, Momos, Paneer...)"
              value={searchValue}
              onChange={handleSearch}
              className="w-full pl-12 pr-6 py-3 bg-transparent text-stone-900 placeholder-stone-400 focus:outline-none text-sm sm:text-base font-sans"
              id="search-input"
            />
          </motion.div>

          {/* Category Navigation Quick Links with Smooth Scrolling */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.55 }}
            className="mt-6 flex items-center justify-center gap-2 max-w-3xl mx-auto overflow-x-auto px-4 pb-2 scrollbar-none scroll-smooth"
          >
            <button
              onClick={() => handleCategoryClick("all")}
              className={`px-4 py-2 rounded-full text-xs font-sans font-bold uppercase tracking-wider transition-all duration-300 whitespace-nowrap border cursor-pointer ${
                selectedCategory === "all"
                  ? "bg-[#d4af37] text-stone-950 border-[#d4af37] shadow-lg shadow-[#d4af37]/25 font-bold"
                  : "bg-black/45 text-stone-200 border-stone-750 hover:bg-black/60 hover:text-white"
              }`}
            >
              🍽️ All Menu
            </button>
            {categoriesList.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat.id)}
                className={`px-4 py-2 rounded-full text-xs font-sans font-bold uppercase tracking-wider transition-all duration-300 whitespace-nowrap flex items-center gap-1.5 border cursor-pointer ${
                  selectedCategory === cat.id
                    ? "bg-[#d4af37] text-stone-950 border-[#d4af37] shadow-lg shadow-[#d4af37]/25 font-bold"
                    : "bg-black/45 text-stone-200 border-stone-750 hover:bg-black/60 hover:text-white"
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </motion.div>
        </div>
      </div>

      {children}
    </header>
  );
}
