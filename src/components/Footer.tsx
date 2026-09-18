import { Phone, Mail, MapPin, Clock, ChevronUp } from "lucide-react";

export default function Footer({ onAdminClick }: { onAdminClick?: () => void }) {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="bg-stone-950 text-stone-300 border-t border-stone-900 pt-16 pb-8 px-6 relative overflow-hidden" id="restaurant-footer">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent" />

      <div className="max-w-7xl mx-auto z-10 relative">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 mb-12">
          
          {/* Column 1: Brand & Description */}
          <div className="lg:col-span-6 space-y-4">
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-wide">
              THE XINGS KITCHEN <span className="text-[#d4af37]">POS</span>
            </h2>
            <p className="text-xs sm:text-sm text-stone-400 leading-relaxed font-sans font-light max-w-md">
              Standalone Desktop Point of Sale & Kitchen Management Portal for The Xings Kitchen restaurant operations.
            </p>
          </div>

          {/* Column 2: System Capabilities */}
          <div className="lg:col-span-6 space-y-4">
            <h3 className="text-xs font-mono font-bold text-white tracking-widest uppercase text-[#d4af37]">
              SYSTEM FEATURES
            </h3>
            <ul className="grid grid-cols-2 gap-2 text-xs font-sans text-stone-400">
              <li>• POS Billing Portal</li>
              <li>• Epson Thermal Printing</li>
              <li>• Kitchen Order Tickets (KOT)</li>
              <li>• Table Floorplan Management</li>
              <li>• Supabase Cloud Synchronization</li>
              <li>• Sales Reports & Analytics</li>
            </ul>
          </div>

        </div>

        {/* Bottom Credits strip & Back to top button */}
        <div className="pt-8 border-t border-stone-900/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500 font-sans tracking-wide">
          <div className="flex flex-col sm:flex-row items-center gap-2 text-center sm:text-left">
            <span>
              &copy; {new Date().getFullYear()} THE XINGS KITCHEN. All Rights Reserved.
            </span>
            {onAdminClick && (
              <span className="inline-flex items-center gap-1.5 ml-2">
                <span className="text-stone-800">|</span>
                <button
                  type="button"
                  onClick={onAdminClick}
                  className="px-2 py-0.5 bg-[#d4af37]/10 hover:bg-[#d4af37] border border-[#d4af37]/20 hover:border-transparent text-[10px] text-[#d4af37] hover:text-black font-semibold rounded transition-all cursor-pointer focus:outline-none"
                  id="footer-admin-login-link"
                >
                  🔐 Admin Login
                </button>
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-6">
            <button
              onClick={scrollToTop}
              className="px-3 py-2 bg-stone-900 hover:bg-[#d4af37] border border-stone-850 hover:border-transparent text-stone-450 hover:text-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer focus:outline-none"
              title="Return to top"
              id="back-to-top-btn"
            >
              Back to Top
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
