import React from "react";
import { Star, Flame, Plus, Minus, ThumbsUp, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { MenuItem } from "../types";

interface MenuItemCardProps {
  key?: string;
  item: MenuItem;
  quantityInCart: number;
  onAddToCart: (item: MenuItem) => void;
  onRemoveFromCart: (item: MenuItem) => void;
}

export default function MenuItemCard({
  item,
  quantityInCart,
  onAddToCart,
  onRemoveFromCart
}: MenuItemCardProps) {
  // Generate spicy chilis array
  const renderSpiciness = () => {
    if (item.spiciness === 0) return null;
    return (
      <div className="flex items-center gap-0.5 text-red-500" title={`Spicy Level: ${item.spiciness}`}>
        {Array.from({ length: item.spiciness }).map((_, i) => (
          <Flame key={i} className="w-3.5 h-3.5 fill-current" />
        ))}
      </div>
    );
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4 }}
      className="group relative bg-white rounded-2xl overflow-hidden border border-stone-150 hover:border-[#d4af37]/50 transition-all duration-300 flex flex-col h-full shadow-[0_4px_15px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_25px_rgba(212,175,55,0.06)] hover:-translate-y-1"
      id={`menu-item-${item.id}`}
    >
      {/* Card Content Details */}
      <div className="p-5 sm:p-6 flex flex-col flex-grow justify-between">
        <div>
          {/* Top Ribbons & Tags */}
          <div className="flex items-center justify-between gap-2 mb-3">
            {/* Veg Symbol overlay (Pure Veg green square frame with solid circle inside) */}
            <div className="bg-emerald-50 px-1.5 py-1.5 rounded-lg border border-emerald-150 flex items-center justify-center shadow-xs">
              <div className="w-3.5 h-3.5 border-2 border-green-600 p-[1.5px] flex items-center justify-center bg-transparent rounded-sm" title="Pure Veg">
                <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
              </div>
            </div>

            {/* Bestseller or Chef Special Badge */}
            {item.isChefSpecial ? (
              <div className="bg-gradient-to-r from-red-600 to-amber-600 text-white text-[9px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-amber-200 animate-pulse" />
                Chef's Special
              </div>
            ) : item.isBestseller ? (
              <div className="bg-gradient-to-r from-[#d4af37] to-[#aa7c11] text-black text-[9px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                <ThumbsUp className="w-2.5 h-2.5 text-black" />
                Bestseller
              </div>
            ) : null}
          </div>

          {/* Card Title Box & Chili level */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="text-base sm:text-lg font-serif font-bold text-stone-850 tracking-wide group-hover:text-[#aa7c11] transition-colors duration-200 line-clamp-1">
              {item.name}
            </h3>
            {renderSpiciness()}
          </div>

          {/* Rating Badge */}
          <div className="flex items-center gap-1 mb-3 text-xs font-medium text-stone-600">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{item.rating.toFixed(1)}</span>
            <span className="text-stone-400 font-light">({item.ratingCount} reviews)</span>
          </div>

          <p className="text-xs sm:text-sm text-stone-500 font-sans leading-relaxed line-clamp-2 h-10 mb-4 font-light">
            {item.description}
          </p>
        </div>

        {/* Price Tag & Custom Action Add Buttons */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-stone-100">
          <div className="flex flex-col">
            <span className="text-xs text-stone-400 font-mono tracking-wider uppercase">PRICE</span>
            <span className="text-lg sm:text-xl font-mono text-[#d4af37] font-medium leading-none">
              ₹{item.price}
            </span>
          </div>

          <div>
            {quantityInCart > 0 ? (
              <div className="flex items-center gap-2 bg-[#d4af37] rounded-xl p-1 shadow-md shadow-[#d4af37]/10 border border-[#d4af37]">
                <button
                  type="button"
                  onClick={() => onRemoveFromCart(item)}
                  className="w-8 h-8 rounded-lg bg-stone-900 text-[#d4af37] flex items-center justify-center hover:bg-[#aa7c11] hover:text-[#d4af37] transition-colors focus:outline-none cursor-pointer"
                  id={`remove-btn-${item.id}`}
                >
                  <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
                <span className="text-stone-950 font-mono font-bold text-sm w-5 text-center px-0.5">
                  {quantityInCart}
                </span>
                <button
                  type="button"
                  onClick={() => onAddToCart(item)}
                  className="w-8 h-8 rounded-lg bg-stone-900 text-[#d4af37] flex items-center justify-center hover:bg-[#aa7c11] hover:text-[#d4af37] transition-colors focus:outline-none cursor-pointer"
                  id={`add-more-btn-${item.id}`}
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onAddToCart(item)}
                className="px-4 py-2 bg-gradient-to-r from-stone-900 to-stone-800 hover:from-[#d4af37] hover:to-[#aa7c11] hover:text-black text-xs font-bold tracking-wider text-stone-200 rounded-xl border border-stone-700 hover:border-transparent transition-all duration-300 flex items-center gap-1.5 cursor-pointer shadow-sm focus:outline-none"
                id={`add-btn-${item.id}`}
              >
                <Plus className="w-3.5 h-3.5 text-[#d4af37] group-hover:text-black" />
                ADD TO CART
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
