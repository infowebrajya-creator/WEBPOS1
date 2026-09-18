/**
 * WebRajya POS — Enterprise Multi-Tenant Thermal Printer Manager
 * 
 * Provides automated printer discovery, intelligent thermal classification,
 * fuzzy & normalized family matching, tenant-isolated configuration storage,
 * and reliable ESC/POS print job dispatching via JSPrintManager.
 */

import * as JSPM from "jsprintmanager";
import { ESCPOSBuilder } from "./escposBuilder";
import { LocalDB, RestaurantSettings, RestaurantOutlet } from "./db";
import { AuthService } from "./rbac";

// -------------------------------------------------------------
// TYPES & INTERFACES
// -------------------------------------------------------------

export type PrinterClassification = 
  | "thermal_receipt" 
  | "kitchen_kot" 
  | "potential_thermal" 
  | "standard_desktop" 
  | "system_virtual";

export type MatchType = 
  | "exact" 
  | "normalized" 
  | "family" 
  | "fuzzy" 
  | "auto_thermal" 
  | "none";

export interface DiscoveredPrinter {
  name: string;
  normalizedName: string;
  classification: PrinterClassification;
  classificationLabel: string;
  thermalScore: number;
  isVirtual: boolean;
  isRecommended: boolean;
  brandFamily: string;
}

export interface TenantPrinterConfig {
  organizationId: string;
  organizationName: string;
  branchId: string;
  branchName: string;
  receiptPrinterName: string;
  kotPrinterName: string;
  paperWidth: "58mm" | "80mm";
  autoPrintBill: boolean;
  autoPrintKOT: boolean;
  autoCut: boolean;
  cutType: "full" | "partial";
  copies: number;
  feedBeforeCutBill: number;
  feedBeforeCutKOT: number;
  enabled: boolean;
  lastDetectedTimestamp: string;
  lastResolvedReceiptPrinter?: string;
  lastResolvedKOTPrinter?: string;
}

export interface PrinterResolutionResult {
  status: "exact_match" | "fuzzy_match" | "single_candidate" | "multiple_candidates" | "no_match" | "service_offline";
  resolvedPrinter: string | null;
  configuredPrinter: string;
  matchType: MatchType;
  confidence: number; // 0 to 1
  candidatePrinters: string[];
  message: string;
  warning?: string;
}

// -------------------------------------------------------------
// BLACKLIST / VIRTUAL PRINTER IDENTIFIERS
// -------------------------------------------------------------

const VIRTUAL_PRINTER_PATTERNS = [
  "pdf",
  "onenote",
  "xps",
  "fax",
  "send to",
  "document writer",
  "virtual",
  "anydesk",
  "acrobat",
  "cute pdf",
  "cutepdf",
  "foxit",
  "nitro",
  "root print queue",
  "generic / text only",
  "print to file"
];

// -------------------------------------------------------------
// THERMAL HARDWARE BRAND & MODEL KEYWORDS
// -------------------------------------------------------------

interface KeywordWeight {
  pattern: string;
  weight: number;
  family?: string;
}

const THERMAL_KEYWORDS: KeywordWeight[] = [
  // High-confidence thermal series & models
  { pattern: "tm-t82", weight: 45, family: "Epson TM-T82" },
  { pattern: "t82x", weight: 45, family: "Epson TM-T82X" },
  { pattern: "tmt82", weight: 45, family: "Epson TM-T82" },
  { pattern: "tm-t88", weight: 45, family: "Epson TM-T88" },
  { pattern: "tm-t20", weight: 40, family: "Epson TM-T20" },
  { pattern: "tm-m30", weight: 40, family: "Epson TM-m30" },
  { pattern: "tm-m", weight: 35, family: "Epson TM-m Series" },
  { pattern: "tm-u", weight: 35, family: "Epson TM-U Impact/KOT" },
  { pattern: "tsp100", weight: 45, family: "Star TSP100" },
  { pattern: "tsp650", weight: 45, family: "Star TSP650" },
  { pattern: "srp-350", weight: 45, family: "Bixolon SRP-350" },
  { pattern: "srp-", weight: 40, family: "Bixolon SRP Series" },
  
  // Brands
  { pattern: "epson", weight: 30, family: "Epson" },
  { pattern: "bixolon", weight: 35, family: "Bixolon" },
  { pattern: "star micronics", weight: 35, family: "Star Micronics" },
  { pattern: "star", weight: 25, family: "Star" },
  { pattern: "citizen", weight: 30, family: "Citizen" },
  { pattern: "sewoo", weight: 30, family: "Sewoo" },
  { pattern: "tvse", weight: 30, family: "TVS Electronics" },
  { pattern: "tvs", weight: 25, family: "TVS Electronics" },
  { pattern: "rongta", weight: 30, family: "Rongta" },
  { pattern: "munbyn", weight: 30, family: "Munbyn" },
  { pattern: "ngx", weight: 30, family: "NGX" },
  { pattern: "xprinter", weight: 30, family: "Xprinter" },
  { pattern: "everycom", weight: 25, family: "Everycom" },
  { pattern: "posbank", weight: 30, family: "Posbank" },
  { pattern: "hoin", weight: 25, family: "Hoin" },
  { pattern: "tsc", weight: 25, family: "TSC" },
  { pattern: "zebra", weight: 25, family: "Zebra" },

  // Functional Thermal Terms
  { pattern: "receipt", weight: 35 },
  { pattern: "thermal", weight: 35 },
  { pattern: "esc/pos", weight: 40 },
  { pattern: "escpos", weight: 40 },
  { pattern: "pos", weight: 25 },
  { pattern: "kot", weight: 30 },
  { pattern: "kitchen", weight: 25 },
  { pattern: "bill", weight: 25 },
  { pattern: "80mm", weight: 25 },
  { pattern: "58mm", weight: 25 },
  { pattern: "roll", weight: 20 },
  { pattern: "barcode", weight: 15 },
  { pattern: "label", weight: 15 }
];

// Suffix words that often differ between driver installs (e.g. "EPSON TM-T82X" vs "EPSON TM-T82X Receipt")
const STRIP_SUFFIX_TOKENS = new Set([
  "receipt",
  "printer",
  "printers",
  "series",
  "driver",
  "usb",
  "pos",
  "v1",
  "v2",
  "copy",
  "1",
  "2",
  "3"
]);

// -------------------------------------------------------------
// CENTRALIZED PRINTER MANAGER CLASS
// -------------------------------------------------------------

export class PrinterManager {
  private static cachedPrinters: DiscoveredPrinter[] = [];
  private static isInitialized = false;

  // -----------------------------------------------------------
  // 1. NORMALIZATION UTILITY
  // -----------------------------------------------------------

  /**
   * Cleans and normalizes a printer name string for comparison:
   * - Converts to lowercase
   * - Trims leading and trailing whitespace
   * - Normalizes multiple spaces into a single space
   * - Strips non-alphanumeric punctuation where appropriate
   */
  public static normalizePrinterName(name: string): string {
    if (!name) return "";
    return name
      .toLowerCase()
      .replace(/[\(\)\[\]\{\}\-_,;:\/\\#\.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Alphanumeric-only strip for tight substring and token comparison
   */
  public static cleanAlphaNumeric(str: string): string {
    return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  /**
   * Extracts significant family tokens from a printer name
   * (e.g., "EPSON TM-T82X Receipt" -> ["epson", "tm", "t82x"])
   */
  public static getSignificantTokens(name: string): string[] {
    const normalized = this.normalizePrinterName(name);
    return normalized
      .split(" ")
      .map(t => t.trim())
      .filter(t => t.length > 0 && !STRIP_SUFFIX_TOKENS.has(t));
  }

  // -----------------------------------------------------------
  // 2. THERMAL PRINTER SCORING & CLASSIFICATION
  // -----------------------------------------------------------

  /**
   * Scores a printer name based on thermal keywords and virtual exclusions.
   * Returns a score from 0 to 100+.
   */
  public static scorePrinter(name: string): { score: number; detectedFamily: string; isVirtual: boolean } {
    const raw = (name || "").toLowerCase();
    const clean = this.cleanAlphaNumeric(name);

    // Step 1: Check virtual blacklist
    for (const pattern of VIRTUAL_PRINTER_PATTERNS) {
      if (raw.includes(pattern)) {
        return { score: 0, detectedFamily: "System Virtual Printer", isVirtual: true };
      }
    }

    // Step 2: Score against thermal keywords
    let score = 0;
    let detectedFamily = "General Printer";

    for (const kw of THERMAL_KEYWORDS) {
      const pClean = this.cleanAlphaNumeric(kw.pattern);
      if (raw.includes(kw.pattern) || clean.includes(pClean)) {
        score += kw.weight;
        if (kw.family && (detectedFamily === "General Printer" || kw.weight > 30)) {
          detectedFamily = kw.family;
        }
      }
    }

    return { score, detectedFamily, isVirtual: false };
  }

  /**
   * Helper to check whether a printer is a virtual / software spooler
   */
  public static isVirtualPrinter(name: string): boolean {
    return this.scorePrinter(name).isVirtual;
  }

  /**
   * Classifies a printer into a structured classification
   */
  public static classifyPrinter(name: string): DiscoveredPrinter {
    const { score, detectedFamily, isVirtual } = this.scorePrinter(name);
    const normalized = this.normalizePrinterName(name);

    let classification: PrinterClassification = "standard_desktop";
    let classificationLabel = "Standard Desktop Printer";

    if (isVirtual) {
      classification = "system_virtual";
      classificationLabel = "System Virtual Printer (Excluded)";
    } else if (score >= 40) {
      if (normalized.includes("kitchen") || normalized.includes("kot")) {
        classification = "kitchen_kot";
        classificationLabel = "Kitchen KOT Thermal Printer";
      } else {
        classification = "thermal_receipt";
        classificationLabel = "Thermal Receipt Printer";
      }
    } else if (score >= 20) {
      classification = "potential_thermal";
      classificationLabel = "POS Thermal Compatible";
    }

    return {
      name,
      normalizedName: normalized,
      classification,
      classificationLabel,
      thermalScore: score,
      isVirtual,
      isRecommended: classification === "thermal_receipt" || classification === "kitchen_kot",
      brandFamily: detectedFamily
    };
  }

  // -----------------------------------------------------------
  // 3. AUTOMATIC PRINTER DISCOVERY
  // -----------------------------------------------------------

  /**
   * Queries JSPrintManager for all installed Windows system printers,
   * classifies and scores each, and returns sorted recommendations.
   */
  public static async discoverPrinters(forceRefresh = false): Promise<DiscoveredPrinter[]> {
    if (!forceRefresh && this.cachedPrinters.length > 0) {
      return this.cachedPrinters;
    }

    try {
      let isConnected = false;
      try {
        isConnected = JSPM.JSPrintManager.websocket_status === JSPM.WSStatus.Open;
      } catch {
        isConnected = false;
      }

      if (!isConnected) {
        console.warn("[PrinterManager] JSPrintManager is not currently connected.");
        return this.cachedPrinters;
      }

      const rawPrinters = await JSPM.JSPrintManager.getPrinters();
      const printerList: string[] = Array.isArray(rawPrinters) ? rawPrinters : [];

      console.log(`[PrinterManager] Printers discovered (${printerList.length}):`, printerList);

      const classified = printerList.map(name => this.classifyPrinter(name));

      // Sort: recommended thermals first (highest score), then standard physical, virtual last
      classified.sort((a, b) => {
        if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
        return b.thermalScore - a.thermalScore;
      });

      this.cachedPrinters = classified;
      this.isInitialized = true;
      return classified;
    } catch (err) {
      console.warn("[PrinterManager] Error discovering printers from JSPrintManager:", err);
      return this.cachedPrinters;
    }
  }

  /**
   * Synchronous getter for currently cached discovered printers
   */
  public static getDiscoveredPrinters(): DiscoveredPrinter[] {
    return this.cachedPrinters;
  }

  // -----------------------------------------------------------
  // 4. FUZZY & NORMALIZED FAMILY MATCHING
  // -----------------------------------------------------------

  /**
   * Finds the best printer match for a requested/configured name among system printers.
   * Recognizes variations like "EPSON TM-T82X" vs "EPSON TM-T82X Receipt" as the same family.
   * Never matches unrelated printers or virtual PDF/OneNote printers.
   */
  public static findBestPrinterMatch(
    requestedName: string | undefined,
    availablePrinters: string[]
  ): {
    matchedPrinter: string | null;
    matchType: MatchType;
    confidence: number;
    candidates: string[];
    isSafeMatch: boolean;
  } {
    const rawReq = (requestedName || "").trim();
    if (!rawReq || availablePrinters.length === 0) {
      return { matchedPrinter: null, matchType: "none", confidence: 0, candidates: [], isSafeMatch: false };
    }

    const normReq = this.normalizePrinterName(rawReq);
    const cleanReq = this.cleanAlphaNumeric(rawReq);
    const reqTokens = this.getSignificantTokens(rawReq);

    // Rule 1: Exact case-insensitive match
    const exact = availablePrinters.find(p => p.toLowerCase() === rawReq.toLowerCase());
    if (exact) {
      console.log(`[PrinterManager] Exact match: '${exact}'`);
      return { matchedPrinter: exact, matchType: "exact", confidence: 1.0, candidates: [exact], isSafeMatch: true };
    }

    // Rule 2: Normalized exact match (ignores spacing, casing, and punctuation)
    const normExact = availablePrinters.find(p => this.normalizePrinterName(p) === normReq);
    if (normExact) {
      console.log(`[PrinterManager] Normalized exact match: '${normExact}' for '${rawReq}'`);
      return { matchedPrinter: normExact, matchType: "normalized", confidence: 0.95, candidates: [normExact], isSafeMatch: true };
    }

    // Filter out virtual printers for family/fuzzy searches
    const nonVirtualPrinters = availablePrinters.filter(p => {
      const pLower = p.toLowerCase();
      return !VIRTUAL_PRINTER_PATTERNS.some(v => pLower.includes(v));
    });

    // Rule 3: Direct AlphaNumeric Substring / Containment (e.g. "epsontmt82x" in "epsontmt82xreceipt")
    const cleanMatches = nonVirtualPrinters.filter(p => {
      const pClean = this.cleanAlphaNumeric(p);
      return pClean.includes(cleanReq) || cleanReq.includes(pClean);
    });

    if (cleanMatches.length === 1) {
      console.log(`[PrinterManager] Normalized substring match: '${cleanMatches[0]}' for '${rawReq}'`);
      return { matchedPrinter: cleanMatches[0], matchType: "family", confidence: 0.90, candidates: cleanMatches, isSafeMatch: true };
    } else if (cleanMatches.length > 1) {
      // Find the one with highest thermal score
      cleanMatches.sort((a, b) => this.scorePrinter(b).score - this.scorePrinter(a).score);
      return { matchedPrinter: cleanMatches[0], matchType: "family", confidence: 0.85, candidates: cleanMatches, isSafeMatch: cleanMatches.length === 1 };
    }

    // Rule 4: Family Significant Token Match
    // If all significant tokens of configured printer (e.g. "epson", "tm", "t82x") exist in installed printer
    const familyMatches = nonVirtualPrinters.filter(p => {
      const pTokens = new Set(this.getSignificantTokens(p));
      const pClean = this.cleanAlphaNumeric(p);
      return reqTokens.every(t => pTokens.has(t) || pClean.includes(this.cleanAlphaNumeric(t)));
    });

    if (familyMatches.length === 1) {
      console.log(`[PrinterManager] Family token match: '${familyMatches[0]}' for '${rawReq}'`);
      return { matchedPrinter: familyMatches[0], matchType: "family", confidence: 0.88, candidates: familyMatches, isSafeMatch: true };
    } else if (familyMatches.length > 1) {
      return { matchedPrinter: familyMatches[0], matchType: "family", confidence: 0.75, candidates: familyMatches, isSafeMatch: false };
    }

    // Rule 5: Token Overlap / Jaccard similarity for typo resilience
    const tokenScores = nonVirtualPrinters.map(p => {
      const pTokens = new Set(this.getSignificantTokens(p));
      const matchCount = reqTokens.filter(t => pTokens.has(t)).length;
      const unionCount = new Set([...reqTokens, ...pTokens]).size;
      const jaccard = unionCount > 0 ? matchCount / unionCount : 0;
      return { name: p, score: jaccard };
    }).filter(item => item.score >= 0.5);

    tokenScores.sort((a, b) => b.score - a.score);

    if (tokenScores.length === 1) {
      console.log(`[PrinterManager] Fuzzy match: '${tokenScores[0].name}' (${tokenScores[0].score}) for '${rawReq}'`);
      return { matchedPrinter: tokenScores[0].name, matchType: "fuzzy", confidence: tokenScores[0].score, candidates: [tokenScores[0].name], isSafeMatch: true };
    } else if (tokenScores.length > 1) {
      return { matchedPrinter: tokenScores[0].name, matchType: "fuzzy", confidence: tokenScores[0].score, candidates: tokenScores.map(t => t.name), isSafeMatch: false };
    }

    // Rule 6: Fallback to high-confidence detected thermal printer if user asked for a thermal brand
    const reqIsEpson = normReq.includes("epson") || normReq.includes("tm");
    if (reqIsEpson) {
      const epsonThermals = nonVirtualPrinters.filter(p => {
        const c = p.toLowerCase();
        return c.includes("epson") && (c.includes("t82") || c.includes("receipt") || c.includes("pos") || c.includes("thermal"));
      });
      if (epsonThermals.length === 1) {
        console.log(`[PrinterManager] Brand thermal fallback: '${epsonThermals[0]}' for '${rawReq}'`);
        return { matchedPrinter: epsonThermals[0], matchType: "auto_thermal", confidence: 0.80, candidates: epsonThermals, isSafeMatch: true };
      } else if (epsonThermals.length > 1) {
        return { matchedPrinter: epsonThermals[0], matchType: "auto_thermal", confidence: 0.70, candidates: epsonThermals, isSafeMatch: false };
      }
    }

    return { matchedPrinter: null, matchType: "none", confidence: 0, candidates: [], isSafeMatch: false };
  }

  // -----------------------------------------------------------
  // 5. PRINTER RESOLUTION & VALIDATION ENGINE
  // -----------------------------------------------------------

  /**
   * Resolves a configured printer against currently available system printers.
   * Adheres strictly to the 9-step printing logic directive:
   * 1. Check connection
   * 2. Refresh printers
   * 3. Resolve configured printer
   * 4. Exact name
   * 5. Safe normalized/fuzzy match
   * 6. If exactly 1 match -> return it
   * 7. If multiple matches -> return candidates for user choice
   * 8. If no match -> return descriptive error and available printers
   * 9. NEVER silently print to Microsoft Print to PDF
   */
  public static async resolvePrinter(
    targetRole: "receipt" | "kot" = "receipt",
    explicitName?: string
  ): Promise<PrinterResolutionResult> {
    const config = this.getConfiguredPrinter();
    const configuredTarget = explicitName || (targetRole === "kot" ? config.kotPrinterName : config.receiptPrinterName);

    console.log(`[PrinterManager] Configured printer for role '${targetRole}': '${configuredTarget}'`);

    // Step 1 & 2: Check connection & refresh printers
    let isConnected = false;
    try {
      isConnected = JSPM.JSPrintManager.websocket_status === JSPM.WSStatus.Open;
    } catch {
      isConnected = false;
    }

    if (!isConnected) {
      return {
        status: "service_offline",
        resolvedPrinter: null,
        configuredPrinter: configuredTarget,
        matchType: "none",
        confidence: 0,
        candidatePrinters: [],
        message: "JSPrintManager desktop service is not connected on the restaurant laptop."
      };
    }

    const discovered = await this.discoverPrinters(this.cachedPrinters.length === 0);
    const systemPrinterNames = discovered.map(p => p.name);

    if (systemPrinterNames.length === 0) {
      return {
        status: "no_match",
        resolvedPrinter: null,
        configuredPrinter: configuredTarget,
        matchType: "none",
        confidence: 0,
        candidatePrinters: [],
        message: "No installed printers found on this system via JSPrintManager."
      };
    }

    // Step 3, 4, 5: Find best match
    const match = this.findBestPrinterMatch(configuredTarget, systemPrinterNames);

    // If exactly 1 safe match exists, use it
    if (match.isSafeMatch && match.matchedPrinter) {
      console.log(`[PrinterManager] Selected printer: '${match.matchedPrinter}' (Match: ${match.matchType}, Confidence: ${match.confidence})`);

      // Auto-update saved configuration if name differed slightly so future prints are instant
      if (match.matchedPrinter !== configuredTarget) {
        if (targetRole === "kot") {
          config.lastResolvedKOTPrinter = match.matchedPrinter;
        } else {
          config.lastResolvedReceiptPrinter = match.matchedPrinter;
        }
        // Save back to tenant config
        this.saveConfiguredPrinter({
          ...config,
          [targetRole === "kot" ? "kotPrinterName" : "receiptPrinterName"]: match.matchedPrinter
        });
      }

      return {
        status: match.matchType === "exact" ? "exact_match" : "fuzzy_match",
        resolvedPrinter: match.matchedPrinter,
        configuredPrinter: configuredTarget,
        matchType: match.matchType,
        confidence: match.confidence,
        candidatePrinters: [match.matchedPrinter],
        message: `Successfully resolved printer '${match.matchedPrinter}'.`
      };
    }

    // If multiple potential candidates exist
    if (match.candidates.length > 1) {
      return {
        status: "multiple_candidates",
        resolvedPrinter: null,
        configuredPrinter: configuredTarget,
        matchType: match.matchType,
        confidence: match.confidence,
        candidatePrinters: match.candidates,
        message: `Multiple potential printer matches found for '${configuredTarget}'. Please select your intended printer.`
      };
    }

    // Find any installed thermal printers that the user could choose from
    const thermalCandidates = discovered
      .filter(p => !p.isVirtual && (p.classification === "thermal_receipt" || p.classification === "potential_thermal"))
      .map(p => p.name);

    // If no safe match exists, show useful error
    return {
      status: "no_match",
      resolvedPrinter: null,
      configuredPrinter: configuredTarget,
      matchType: "none",
      confidence: 0,
      candidatePrinters: thermalCandidates.length > 0 ? thermalCandidates : systemPrinterNames.filter(p => !VIRTUAL_PRINTER_PATTERNS.some(v => p.toLowerCase().includes(v))),
      message: `Your configured printer '${configuredTarget}' is not currently available.`
    };
  }

  // -----------------------------------------------------------
  // 6. TENANT & BRANCH ISOLATED PRINTER CONFIGURATION
  // -----------------------------------------------------------

  /**
   * Resolves the active tenant & branch context from POS settings & session
   */
  public static getActiveTenantContext(): {
    organizationId: string;
    organizationName: string;
    branchId: string;
    branchName: string;
  } {
    let orgName = "WebRajya POS";
    let orgId = "org_default";
    let branchName = "Main Branch";
    let branchId = "branch_main";

    try {
      const settings = LocalDB.getSettings();
      if (settings?.name) {
        orgName = settings.name;
        orgId = this.cleanAlphaNumeric(settings.name) || "org_default";
      }

      const activeUser = AuthService.getActiveUser();
      if (activeUser?.tenantId) {
        orgId = activeUser.tenantId;
      }
      if (activeUser?.outletId) {
        branchId = activeUser.outletId;
      }

      // If branch outlet list exists, find matched outlet
      if (settings.outlets && settings.outlets.length > 0) {
        const outlet = settings.outlets.find(o => o.id === branchId) || settings.outlets[0];
        if (outlet) {
          branchId = outlet.id;
          branchName = outlet.name;
        }
      }
    } catch (_) {}

    return { organizationId: orgId, organizationName: orgName, branchId, branchName };
  }

  /**
   * Gets the tenant & branch scoped storage key
   */
  private static getTenantStorageKey(orgId: string, branchId: string): string {
    return `wr_printer_config_${orgId}_${branchId}`;
  }

  /**
   * Retrieves the saved printer configuration for the current or specified tenant & branch.
   * Scoped per tenant to enforce strict multi-tenant isolation.
   */
  public static getConfiguredPrinter(orgId?: string, branchId?: string): TenantPrinterConfig {
    const ctx = this.getActiveTenantContext();
    const effectiveOrgId = orgId || ctx.organizationId;
    const effectiveBranchId = branchId || ctx.branchId;
    const key = this.getTenantStorageKey(effectiveOrgId, effectiveBranchId);

    const legacyKey = "wr_printer_settings";
    const stored = localStorage.getItem(key) || localStorage.getItem(legacyKey);

    const defaults: TenantPrinterConfig = {
      organizationId: effectiveOrgId,
      organizationName: ctx.organizationName,
      branchId: effectiveBranchId,
      branchName: ctx.branchName,
      receiptPrinterName: "EPSON TM-T82X Receipt",
      kotPrinterName: "EPSON TM-T82X Receipt",
      paperWidth: "80mm",
      autoPrintBill: true,
      autoPrintKOT: true,
      autoCut: true,
      cutType: "full",
      copies: 1,
      feedBeforeCutBill: 5,
      feedBeforeCutKOT: 3,
      enabled: true,
      lastDetectedTimestamp: new Date().toISOString()
    };

    if (!stored) {
      localStorage.setItem(key, JSON.stringify(defaults));
      return defaults;
    }

    try {
      const parsed = JSON.parse(stored);
      // Migrate legacy single printerName field if needed
      if (parsed.printerName && !parsed.receiptPrinterName) {
        parsed.receiptPrinterName = parsed.printerName;
      }
      if (!parsed.kotPrinterName) {
        parsed.kotPrinterName = parsed.receiptPrinterName || defaults.receiptPrinterName;
      }
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  }

  /**
   * Saves the printer configuration scoped to the current tenant & branch.
   * Also synchronizes to legacy `wr_printer_settings` for full backward compatibility.
   */
  public static saveConfiguredPrinter(config: Partial<TenantPrinterConfig>): TenantPrinterConfig {
    const current = this.getConfiguredPrinter();
    const updated: TenantPrinterConfig = {
      ...current,
      ...config,
      lastDetectedTimestamp: new Date().toISOString()
    };

    const key = this.getTenantStorageKey(updated.organizationId, updated.branchId);
    localStorage.setItem(key, JSON.stringify(updated));

    // Mirror to legacy format so existing components remain functional
    const legacy = {
      printerName: updated.receiptPrinterName,
      paperWidth: updated.paperWidth,
      autoPrintBill: updated.autoPrintBill,
      autoPrintKOT: updated.autoPrintKOT,
      autoCut: updated.autoCut,
      cutType: updated.cutType,
      feedBeforeCutBill: updated.feedBeforeCutBill,
      feedBeforeCutKOT: updated.feedBeforeCutKOT,
      copies: updated.copies,
      useQZTray: false
    };
    localStorage.setItem("wr_printer_settings", JSON.stringify(legacy));

    // Broadcast update event
    window.dispatchEvent(new CustomEvent("printer_config_updated", { detail: updated }));
    return updated;
  }

  // -----------------------------------------------------------
  // 7. TEST PRINT EXECUTION
  // -----------------------------------------------------------

  /**
   * Generates and executes an official WebRajya POS test receipt:
   * --------------------------
   * WEBRAJYA POS
   * --------------------------
   * PRINTER TEST
   * --------------------------
   * Printer: <detected printer name>
   * Branch: <branch name>
   * Date: <current date>
   * Time: <current time>
   * --------------------------
   * Printer connection successful
   * --------------------------
   */
  public static async testPrint(
    targetRoleOrPrinter?: "receipt" | "kot" | string,
    explicitPrinterName?: string
  ): Promise<{ success: boolean; printerUsed: string; error?: string }> {
    let role: "receipt" | "kot" = "receipt";
    let printerTarget: string | undefined = undefined;

    if (targetRoleOrPrinter === "receipt" || targetRoleOrPrinter === "kot") {
      role = targetRoleOrPrinter;
      printerTarget = explicitPrinterName;
    } else if (typeof targetRoleOrPrinter === "string") {
      printerTarget = targetRoleOrPrinter;
    }

    console.log(`[PrinterManager] Print job started: TEST PRINT (Role: ${role}) on '${printerTarget || "Auto-Resolve"}'`);

    const resolution = await this.resolvePrinter(role, printerTarget);
    if (!resolution.resolvedPrinter) {
      console.warn("[PrinterManager] Print job failed: No printer resolved for test print.", resolution.message);
      return { success: false, printerUsed: printerTarget || "unknown", error: resolution.message };
    }

    const printerToUse = resolution.resolvedPrinter;
    const ctx = this.getActiveTenantContext();
    const config = this.getConfiguredPrinter();

    const builder = new ESCPOSBuilder();

    // 1. Header
    builder.alignCenter().bold(true).doubleSize(true);
    builder.writeText("WEBRAJYA POS\n");
    builder.bold(false).doubleSize(false);

    builder.divider(config.paperWidth);

    // 2. Title
    builder.alignCenter().bold(true).doubleHeight(true);
    builder.writeText("PRINTER TEST\n");
    builder.bold(false).doubleHeight(false);

    builder.divider(config.paperWidth);

    // 3. Metadata
    builder.alignLeft();
    builder.writeText(`Printer: ${printerToUse}\n`);
    builder.writeText(`Branch:  ${ctx.branchName || "Main Outlet"}\n`);
    builder.writeText(`Date:    ${new Date().toLocaleDateString()}\n`);
    builder.writeText(`Time:    ${new Date().toLocaleTimeString()}\n`);

    builder.divider(config.paperWidth);

    // 4. Success Banner
    builder.alignCenter().bold(true);
    builder.writeText("Printer connection successful\n");
    builder.bold(false);

    builder.divider(config.paperWidth);

    // 5. Feed & Cut
    builder.feed(config.feedBeforeCutBill || 4);
    if (config.autoCut) {
      if (config.cutType === "partial") {
        builder.cutPartial();
      } else {
        builder.cutFull();
      }
    }

    // 6. Dispatch via JSPrintManager ClientPrintJob
    const bytes = builder.compile();
    const cpj = new JSPM.ClientPrintJob();
    cpj.clientPrinter = new JSPM.InstalledPrinter(printerToUse, true);
    cpj.binaryPrinterCommands = bytes;
    cpj.printerCommandsCopies = 1;
    cpj.printerCommandsDocName = `WebRajya-Test-Print-${Date.now()}`;

    try {
      await cpj.sendToClient();
      console.log(`[PrinterManager] Print job completed: Test print sent to '${printerToUse}'`);
      return { success: true, printerUsed: printerToUse };
    } catch (err: any) {
      console.warn(`[PrinterManager] Print job failed on '${printerToUse}':`, err);
      throw new Error(`JSPrintManager failed to dispatch test print to '${printerToUse}': ${err?.message || err}`);
    }
  }
}

export default PrinterManager;
