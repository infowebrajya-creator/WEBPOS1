import { Sparkles, Star, Plus, Minus } from "lucide-react";
import { motion } from "motion/react";
import { MenuItem } from "../types";

interface ChefSpecialsProps {
  specials: MenuItem[];
  cartQuantities: { [key: string]: number };
  onAddToCart: (item: MenuItem) => void;
  onRemoveFromCart: (item: MenuItem) => void;
}

export default function ChefSpecials({
  specials,
  cartQuantities,
  onAddToCart,
  onRemoveFromCart
}: ChefSpecialsProps) {
  if (specials.length === 0) return null;

  return (
    <section className="py-16 px-6 bg-gradient-to-b from-[#FAF8F2] to-[#FAF9F5] relative border-t border-stone-200/80 overflow-hidden" id="chef-specials">
      {/* Decorative Golden Orbs */}
      <div className="absolute -top-40 right-1/4 w-96 h-96 bg-[#d4af37]/3 select-none blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-40 left-1/4 w-96 h-96 bg-stone-300/15 select-none blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 bg-[#d4af37]/10 px-4 py-1.5 rounded-full border border-[#d4af37]/20 mb-3"
          >
            <Sparkles className="w-4 h-4 text-[#d4af37] animate-spin" />
            <span className="text-[#aa7c11] text-xs font-mono font-bold tracking-widest uppercase">CULINARY MASTERPIECES</span>
          </motion.div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-stone-900 tracking-wide">
            Chef&apos;s Signature Specials
          </h2>
          <p className="mt-3 text-sm sm:text-base text-stone-500 font-sans max-w-2xl mx-auto font-light">
            Savor our most exclusive culinary creations, crafted by our heritage Master Chefs with hand-picked spices and modern visual flair.
          </p>
        </div>

        {/* Specials Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {specials.map((item, index) => {
            const quantityInCart = cartQuantities[item.id] || 0;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white border border-stone-150 rounded-3xl overflow-hidden hover:border-[#d4af37]/50 transition-all duration-300 flex flex-col group shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_35px_rgba(212,175,55,0.06)] relative"
              >
                {/* Text Context Content Inside Card */}
                <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between relative z-10">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        {/* Organic Badge Overlay */}
                        <div className="bg-emerald-50 px-1.5 py-1.5 rounded-lg border border-emerald-150 flex items-center justify-center shadow-xs">
                          <div className="w-3.5 h-3.5 border-2 border-green-600 p-[1.5px] flex items-center justify-center rounded-sm">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                          <span className="text-stone-700 text-xs font-semibold font-sans">{item.rating.toFixed(1)}</span>
                        </div>
                      </div>
                      <span className="text-emerald-700 text-[10px] sm:text-xs font-mono font-bold tracking-widest bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded uppercase">
                        Signature Handcrafted
                      </span>
                    </div>

                    <h3 className="text-xl sm:text-2xl font-serif font-bold text-[#aa7c11] tracking-wide mb-2 group-hover:text-stone-900 transition-colors duration-200">
                      {item.name}
                    </h3>

                    <p className="text-xs sm:text-sm text-stone-500 font-sans leading-relaxed font-light mb-6">
                      {item.description}
                    </p>
                  </div>

                  {/* Pricing action bottom */}
                  <div className="flex items-center justify-between pt-4 border-t border-stone-100">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-stone-400 font-mono tracking-wider uppercase">PRICE</span>
                      <span className="text-xl font-mono text-[#d4af37] font-semibold">₹{item.price}</span>
                    </div>

                    <div>
                      {quantityInCart > 0 ? (
                        <div className="flex items-center gap-2 bg-[#d4af37] rounded-xl p-1.5 shadow-md border border-[#d4af37]">
                          <button
                            type="button"
                            onClick={() => onRemoveFromCart(item)}
                            className="w-7 h-7 rounded-lg bg-stone-900 text-[#d4af37] flex items-center justify-center hover:bg-[#aa7c11] hover:text-[#d4af37] transition-colors focus:outline-none cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                          <span className="text-stone-950 font-mono font-bold text-xs w-5 text-center">
                            {quantityInCart}
                          </span>
                          <button
                            type="button"
                            onClick={() => onAddToCart(item)}
                            className="w-7 h-7 rounded-lg bg-stone-900 text-[#d4af37] flex items-center justify-center hover:bg-[#aa7c11] hover:text-[#d4af37] transition-colors focus:outline-none cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAddToCart(item)}
                          className="px-4 py-2 bg-gradient-to-r from-stone-900 to-stone-800 hover:from-[#d4af37] hover:to-[#aa7c11] hover:text-black text-stone-200 hover:text-black text-xs font-bold tracking-wider rounded-xl transition-all duration-300 flex items-center gap-1.5 cursor-pointer shadow-sm focus:outline-none"
                        >
                          <Plus className="w-3.5 h-3.5 text-[#d4af37] group-hover:text-black" />
                          ADD DISH
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
