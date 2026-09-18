import { RestaurantSettings } from "./db";

export interface TaxSettings {
  gstEnabled: boolean;
  gstin: string;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
}

export interface TaxCalculationResult extends TaxSettings {
  totalGst: number;
  cgstAmount: number;
  sgstAmount: number;
}

/**
 * Extract normalized GST tax settings from restaurant settings.
 */
export function getTaxSettings(settings: Partial<RestaurantSettings> | null | undefined): TaxSettings {
  if (!settings) {
    return {
      gstEnabled: false,
      gstin: "",
      gstRate: 0,
      cgstRate: 0,
      sgstRate: 0,
    };
  }

  // GST is disabled by default unless explicitly enabled with a positive rate
  const gstEnabled = settings.gstEnabled === true && (Number(settings.gstRate ?? settings.gstPercentage ?? 0) > 0);
  const gstRate = gstEnabled ? (typeof settings.gstRate === "number" ? settings.gstRate : (typeof settings.gstPercentage === "number" ? settings.gstPercentage : 0)) : 0;
  const cgstRate = gstEnabled ? (typeof settings.cgstRate === "number" ? settings.cgstRate : gstRate / 2) : 0;
  const sgstRate = gstEnabled ? (typeof settings.sgstRate === "number" ? settings.sgstRate : gstRate / 2) : 0;
  const gstin = settings.gstin || "";

  return {
    gstEnabled,
    gstin,
    gstRate,
    cgstRate,
    sgstRate,
  };
}

/**
 * Centralized Tax & GST Calculation Engine.
 * Consistent across POS Cart, Bill, Order Details, Reports, and Printed Receipts.
 */
export function calculateTax(taxableSubtotal: number, settings: Partial<RestaurantSettings> | null | undefined): TaxCalculationResult {
  const config = getTaxSettings(settings);

  if (!config.gstEnabled || taxableSubtotal <= 0 || config.gstRate <= 0) {
    return {
      ...config,
      totalGst: 0,
      cgstAmount: 0,
      sgstAmount: 0,
    };
  }

  const totalGst = Math.round((taxableSubtotal * (config.gstRate / 100)) * 100) / 100;
  const cgstAmount = Math.round((totalGst * (config.cgstRate / config.gstRate)) * 100) / 100;
  const sgstAmount = Math.round((totalGst - cgstAmount) * 100) / 100;

  return {
    ...config,
    totalGst,
    cgstAmount,
    sgstAmount,
  };
}
