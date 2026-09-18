import { useState, useMemo } from "react";
import { motion } from "motion/react";
import { Sparkles, Armchair, HelpCircle } from "lucide-react";

interface TableInfo {
  id: string; // e.g. "Table 1"
  name: string; // e.g. "Table 1"
  number: number;
  capacity: number;
  section: "Main Hall" | "VIP Lounge" | "Window View";
  shape: "circle" | "rect";
  x: number; // grid layout coordinates or manual positioning hints
  y: number;
}

interface TableFloorplanProps {
  selectedTable: string;
  onSelectTable: (tableName: string) => void;
}

export default function TableFloorplan({ selectedTable, onSelectTable }: TableFloorplanProps) {
  const [activeSection, setActiveSection] = useState<"All" | "Main Hall" | "VIP Lounge" | "Window View">("All");

  // Define 20 tables with structured metadata for the floorplan
  const tables: TableInfo[] = useMemo(() => {
    const list: TableInfo[] = [];
    
    // Main Hall: Tables 1-10
    // VIP Lounge: Tables 11-14 (Larger, higher capacity)
    // Window View: Tables 15-20 (Scenic view, premium seating)
    for (let i = 1; i <= 20; i++) {
      let section: "Main Hall" | "VIP Lounge" | "Window View" = "Main Hall";
      let capacity = 4;
      let shape: "circle" | "rect" = "rect";

      if (i >= 11 && i <= 14) {
        section = "VIP Lounge";
        capacity = 6;
        shape = "circle"; // VIP round tables
      } else if (i >= 15) {
        section = "Window View";
        capacity = 2; // Intimate 2-seaters by the panoramic window
        shape = "rect";
      } else {
        // Main Hall custom capacities
        capacity = i % 3 === 0 ? 6 : i % 2 === 0 ? 2 : 4;
        shape = i % 3 === 0 ? "circle" : "rect";
      }

      list.push({
        id: `Table ${i}`,
        name: `Table ${i}`,
        number: i,
        capacity,
        section,
        shape,
        x: 0,
        y: 0
      });
    }
    return list;
  }, []);

  const filteredTables = useMemo(() => {
    if (activeSection === "All") return tables;
    return tables.filter(t => t.section === activeSection);
  }, [activeSection, tables]);

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-4.5 space-y-4 font-sans text-left mt-2 shadow-sm">
      {/* Floorplan Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 justify-between">
          <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-stone-400">
            Interactive Table Planner
          </span>
          <span className="text-[9px] font-mono text-emerald-650 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-sm">
            Live Booking Map
          </span>
        </div>
        <h4 className="text-xs font-serif font-bold text-stone-900 uppercase tracking-widest">
          WebRajya POS Dining Area
        </h4>
        <p className="text-[10px] text-stone-500">
          Tap on a table below to allocate your seat. Your order will be served directly at that table.
        </p>
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-stone-200 pb-2">
        {(["All", "Main Hall", "VIP Lounge", "Window View"] as const).map((sec) => (
          <button
            key={sec}
            type="button"
            onClick={() => setActiveSection(sec)}
            className={`px-2.5 py-1 text-[9px] font-bold tracking-wider uppercase rounded-md border transition-all cursor-pointer ${
              activeSection === sec
                ? "bg-[#d4af37] text-white border-[#d4af37] shadow-sm"
                : "bg-white text-stone-500 border-stone-200 hover:text-stone-700 hover:bg-stone-50"
            }`}
          >
            {sec}
          </button>
        ))}
      </div>

      {/* Interactive Restaurant layout blueprint */}
      <div className="relative border border-stone-300 bg-white rounded-xl p-3 shadow-inner min-h-[220px] select-none">
        
        {/* Layout Landmarks */}
        <div className="flex justify-between items-center text-[8px] font-mono font-bold uppercase tracking-widest text-stone-400 border-b border-stone-100 pb-1 mb-3">
          <div className="px-2 py-0.5 bg-stone-100 rounded-sm border border-stone-200">🚪 Main Entrance</div>
          <div className="px-2 py-0.5 bg-[#d4af37]/10 text-[#aa7c11] rounded-sm border border-[#d4af37]/20">🛎️ Guest Reception</div>
          <div className="px-2 py-0.5 bg-stone-100 rounded-sm border border-stone-200">🍳 Kitchen Pass</div>
        </div>

        {/* Scenic Window Indicator for Premium Side */}
        {activeSection === "All" || activeSection === "Window View" ? (
          <div className="absolute right-0 top-12 bottom-12 w-1.5 bg-blue-150 border-l border-blue-300 flex items-center justify-center rounded-l-md shadow-sm">
            <span className="text-[7px] font-mono text-blue-600 font-bold uppercase vertical-text tracking-widest h-full flex items-center justify-center" style={{ writingMode: "vertical-rl" }}>
              🪟 Panoramic Glass Window Front
            </span>
          </div>
        ) : null}

        {/* Visual Table Grid */}
        <div className="grid grid-cols-4 gap-2.5 pr-4">
          {filteredTables.map((table) => {
            // Check if selected
            const isSelected = selectedTable === table.name || selectedTable === String(table.number);

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => onSelectTable(table.name)}
                className={`relative px-1 py-2.5 rounded-xl border flex flex-col items-center justify-between transition-all duration-205 cursor-pointer hover:border-[#aa7c11] active:scale-95 group ${
                  isSelected
                    ? "bg-[#d4af37] border-[#aa7c11] text-white shadow-md ring-2 ring-[#d4af37]/30 scale-102 z-10"
                    : "bg-[#FAF7F2] border-stone-200 text-stone-800 hover:bg-amber-50/50"
                }`}
              >
                {/* Table Shape Decorator */}
                <div className={`w-6 h-6 flex items-center justify-center mb-1.5 transition-colors ${
                  table.shape === "circle" ? "rounded-full" : "rounded-md"
                } ${isSelected ? "bg-white/20 text-white" : "bg-stone-200/60 text-stone-500 group-hover:text-amber-700"}`}>
                  <span className="text-[10px] font-serif font-black">{table.number}</span>
                </div>

                {/* Seats indicator dots */}
                <div className="flex gap-0.5 justify-center mt-1">
                  {Array.from({ length: table.capacity }).map((_, idx) => (
                    <span 
                      key={idx}
                      className={`w-1 h-1 rounded-full ${
                        isSelected ? "bg-white" : "bg-[#aa7c11] opacity-70"
                      }`}
                    />
                  ))}
                </div>

                {/* Hover Seating Info / Section info */}
                <div className="text-[7px] font-sans font-light mt-1.5 opacity-80 uppercase tracking-wider scale-90">
                  {table.capacity} Seats
                </div>

                {/* Custom VIP Badge */}
                {table.section === "VIP Lounge" && (
                  <span className={`absolute -top-1 -right-1 text-[6px] font-mono px-1 rounded-sm border ${
                    isSelected 
                      ? "bg-amber-500 text-white border-amber-600 font-bold" 
                      : "bg-amber-100 text-amber-800 border-amber-200 font-semibold"
                  }`}>
                    VIP
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Floorplan Footer Map Legends */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5 mt-4">
          <div className="flex items-center gap-1.5 text-[8px] font-mono text-stone-500 uppercase">
            <span className="w-2.5 h-2.5 rounded-full bg-[#d4af37]" /> Selected Table
            <span className="w-2.5 h-2.5 rounded bg-[#FAF7F2] border border-stone-200" /> Standard Available
          </div>
          <div className="text-[8px] font-mono text-stone-400 italic">
            🛋️ Double sofa blocks at circular tables.
          </div>
        </div>

      </div>

      {/* Micro-notification helper */}
      {selectedTable ? (
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 text-amber-900 rounded-lg p-2.5 text-[10.5px]">
          <span className="text-xs">🪑</span>
          <p>
            You have chosen <strong>{selectedTable}</strong>. Your gourmet meals will be delivered and served there in style!
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 bg-stone-100 border border-stone-200 text-stone-600 rounded-lg p-2.5 text-[10px]">
          <span className="text-xs">👉</span>
          <p>Select a table directly on the grid floorplan to guarantee physical desk assignment.</p>
        </div>
      )}
    </div>
  );
}
