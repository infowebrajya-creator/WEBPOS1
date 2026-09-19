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

  return {
    gstEnabled: false,
    gstin: settings?.gstin || "",
    gstRate: 0,
    cgstRate: 0,
    sgstRate: 0,
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
