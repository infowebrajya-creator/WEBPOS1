// -------------------------------------------------------------
// WEBRAJYA POS — CLIENT ROUTER & URL PERSISTENCE ENGINE
// -------------------------------------------------------------

export type AdminTab = 
  | "analytics" 
  | "pos"
  | "orders"
  | "history"
  | "tables" 
  | "menu" 
  | "reports" 
  | "printers" 
  | "settings" 
  | "kitchen" 
  | "supabase";

export type ReportsSubTab = 
  | "overview" 
  | "daily" 
  | "monthly" 
  | "yearly" 
  | "items" 
  | "categories" 
  | "ledger";

export type MenuSubTab = "items" | "categories";

export interface ParsedRoute {
  view: "menu" | "admin";
  adminTab: AdminTab;
  reportsSubTab: ReportsSubTab;
  menuSubTab: MenuSubTab;
  rawPath: string;
  tableNumber?: string;
}

const VALID_ADMIN_TABS: Record<string, AdminTab> = {
  "dashboard": "analytics",
  "analytics": "analytics",
  "overview": "analytics",
  "pos": "pos",
  "billing": "pos",
  "orders": "orders",
  "order-management": "orders",
  "history": "history",
  "order-history": "history",
  "tables": "tables",
  "reservations": "tables",
  "menu": "menu",
  "catalog": "menu",
  "reports": "reports",
  "sales-reports": "reports",
  "printers": "printers",
  "settings": "settings",
  "kitchen": "kitchen",
  "kds": "kitchen",
  "supabase": "supabase",
  "diagnostics": "supabase"
};

const VALID_REPORTS_SUBTABS: Record<string, ReportsSubTab> = {
  "overview": "overview",
  "daily": "daily",
  "monthly": "monthly",
  "yearly": "yearly",
  "items": "items",
  "categories": "categories",
  "ledger": "ledger"
};

/**
 * Retrieves the currently scanned table number from:
 * 1. Pathname (/table/:tableNumber)
 * 2. Query parameter (?table=:tableNumber or ?t=:tableNumber)
 * 3. LocalStorage cache (ij_scanned_table)
 */
export function getScannedTableNumber(): string {
  if (typeof window === "undefined") return "";

  // 1. Check path: /table/:tableNumber
  const pathMatch = window.location.pathname.match(/^\/table\/([^\/?#]+)/i);
  if (pathMatch && pathMatch[1]) {
    const val = decodeURIComponent(pathMatch[1]).trim();
    if (val) {
      localStorage.setItem("ij_scanned_table", val);
      localStorage.setItem("ij_is_qr_scanned", "true");
      return val;
    }
  }

  // 2. Check query params: ?table=:tableNumber or ?t=:tableNumber
  try {
    const params = new URLSearchParams(window.location.search);
    const queryVal = (params.get("table") || params.get("t") || "").trim();
    if (queryVal) {
      localStorage.setItem("ij_scanned_table", queryVal);
      localStorage.setItem("ij_is_qr_scanned", "true");
      return queryVal;
    }
  } catch (e) {}

  // 3. Fallback to localStorage
  try {
    return localStorage.getItem("ij_scanned_table") || "";
  } catch (e) {
    return "";
  }
}

/**
 * Builds the canonical relative customer URL for a given table number.
 */
export function buildTableUrl(tableNumber: string | number): string {
  return `/table/${encodeURIComponent(tableNumber)}`;
}

/**
 * Builds the canonical absolute customer URL for a given table number.
 */
export function buildTableFullUrl(tableNumber: string | number): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/table/${encodeURIComponent(tableNumber)}`;
}

/**
 * Parse the current browser location (pathname and hash) into a structured route.
 */
export function parseCurrentRoute(): ParsedRoute {
  if (typeof window === "undefined") {
    return {
      view: "menu",
      adminTab: "analytics",
      reportsSubTab: "overview",
      menuSubTab: "items",
      rawPath: "/"
    };
  }

  let path = window.location.pathname;
  const hash = window.location.hash;

  // If pathname is root but hash contains #admin or #/admin, use hash path
  if (hash.startsWith("#admin") || hash.startsWith("#/admin")) {
    path = hash.replace(/^#\/?/, "/");
  }

  // Check if this is an admin route
  const isAdmin = path === "/admin" || path.startsWith("/admin/");

  if (!isAdmin) {
    const tableNumber = getScannedTableNumber() || undefined;
    return {
      view: "menu",
      adminTab: "analytics",
      reportsSubTab: "overview",
      menuSubTab: "items",
      rawPath: path,
      tableNumber
    };
  }

  // Split path segments: e.g. /admin/reports/monthly -> ["admin", "reports", "monthly"]
  const cleanPath = path.replace(/\/+$/, ""); // trim trailing slash
  const segments = cleanPath.split("/").filter(Boolean); // ["admin", ...]

  const secondSegment = (segments[1] || "dashboard").toLowerCase();
  const thirdSegment = (segments[2] || "").toLowerCase();

  const adminTab: AdminTab = VALID_ADMIN_TABS[secondSegment] || "analytics";

  let reportsSubTab: ReportsSubTab = "overview";
  if (adminTab === "reports" && thirdSegment && VALID_REPORTS_SUBTABS[thirdSegment]) {
    reportsSubTab = VALID_REPORTS_SUBTABS[thirdSegment];
  }

  let menuSubTab: MenuSubTab = "items";
  if (adminTab === "menu") {
    if (thirdSegment === "categories") {
      menuSubTab = "categories";
    } else {
      menuSubTab = "items";
    }
  }

  return {
    view: "admin",
    adminTab,
    reportsSubTab,
    menuSubTab,
    rawPath: path
  };
}

/**
 * Constructs the canonical URL for a given admin tab and sub-tab.
 */
export function buildAdminUrl(
  tab: AdminTab, 
  subTab?: ReportsSubTab | MenuSubTab | string
): string {
  let basePath = "/admin";

  switch (tab) {
    case "analytics":
      return "/admin/dashboard";
    case "reports":
      if (subTab && VALID_REPORTS_SUBTABS[subTab]) {
        return `/admin/reports/${subTab}`;
      }
      return "/admin/reports";
    case "menu":
      if (subTab === "categories") {
        return "/admin/menu/categories";
      }
      return "/admin/menu/items";
    case "tables":
      return "/admin/reservations";
    case "pos":
      return "/admin/pos";
    case "orders":
      return "/admin/orders";
    case "history":
      return "/admin/history";
    case "printers":
      return "/admin/printers";
    case "settings":
      return "/admin/settings";
    case "kitchen":
      return "/admin/kitchen";
    case "supabase":
      return "/admin/supabase";
    default:
      return `${basePath}/${tab}`;
  }
}

/**
 * Navigate to a specific URL and update browser history and dispatch route events.
 */
export function navigateTo(
  url: string, 
  options: { replace?: boolean } = {}
): void {
  if (typeof window === "undefined") return;

  const currentPath = window.location.pathname + window.location.hash;
  if (currentPath === url) return;

  if (options.replace) {
    window.history.replaceState({ url }, "", url);
  } else {
    window.history.pushState({ url }, "", url);
  }

  // Dispatch custom event to notify all listening components
  window.dispatchEvent(new Event("app_route_change"));
}
