// ====================================================================
// WEBRAJYA POS - INVENTORY UNIT NORMALIZATION & CONVERSION ENGINE
// ====================================================================

export type SupportedUnit = 'g' | 'kg' | 'ml' | 'l' | 'pcs';

export const SUPPORTED_UNITS: readonly SupportedUnit[] = ['g', 'kg', 'ml', 'l', 'pcs'] as const;

export type UnitDimension = 'weight' | 'volume' | 'count';

export interface UnitMetadata {
  unit: SupportedUnit;
  label: string;
  dimension: UnitDimension;
  baseUnit: SupportedUnit;
  factorToBase: number; // Multiply this unit by factorToBase to get base unit quantity
  description: string;
}

export const UNIT_METADATA_MAP: Record<SupportedUnit, UnitMetadata> = {
  kg: {
    unit: 'kg',
    label: 'Kilograms (kg)',
    dimension: 'weight',
    baseUnit: 'kg',
    factorToBase: 1,
    description: 'Standard metric weight base unit'
  },
  g: {
    unit: 'g',
    label: 'Grams (g)',
    dimension: 'weight',
    baseUnit: 'kg',
    factorToBase: 0.001,
    description: 'Sub-unit of weight (1,000 g = 1 kg)'
  },
  l: {
    unit: 'l',
    label: 'Liters (l)',
    dimension: 'volume',
    baseUnit: 'l',
    factorToBase: 1,
    description: 'Standard metric liquid volume base unit'
  },
  ml: {
    unit: 'ml',
    label: 'Milliliters (ml)',
    dimension: 'volume',
    baseUnit: 'l',
    factorToBase: 0.001,
    description: 'Sub-unit of volume (1,000 ml = 1 l)'
  },
  pcs: {
    unit: 'pcs',
    label: 'Pieces (pcs)',
    dimension: 'count',
    baseUnit: 'pcs',
    factorToBase: 1,
    description: 'Discrete unit quantity'
  }
};

/**
 * Validates whether a unit string is one of the supported units
 */
export function isSupportedUnit(unit: string): unit is SupportedUnit {
  return SUPPORTED_UNITS.includes(unit as SupportedUnit);
}

/**
 * Returns the normalized base unit for a given supported unit.
 * Weight -> 'kg'
 * Volume -> 'l'
 * Count -> 'pcs'
 */
export function getBaseUnit(unit: SupportedUnit): SupportedUnit {
  const meta = UNIT_METADATA_MAP[unit];
  if (!meta) {
    throw new Error(`Invalid unit '${unit}'. Supported units are: ${SUPPORTED_UNITS.join(', ')}`);
  }
  return meta.baseUnit;
}

/**
 * Returns the physical dimension for a given unit.
 */
export function getUnitDimension(unit: SupportedUnit): UnitDimension {
  const meta = UNIT_METADATA_MAP[unit];
  if (!meta) {
    throw new Error(`Invalid unit '${unit}'. Supported units are: ${SUPPORTED_UNITS.join(', ')}`);
  }
  return meta.dimension;
}

/**
 * Checks if two units share the same physical dimension.
 */
export function areUnitsCompatible(unitA: string, unitB: string): boolean {
  if (!isSupportedUnit(unitA) || !isSupportedUnit(unitB)) return false;
  return UNIT_METADATA_MAP[unitA].dimension === UNIT_METADATA_MAP[unitB].dimension;
}

/**
 * Converts a quantity from one unit to another compatible unit.
 * Throws an error if units belong to different dimensions.
 */
export function convertQuantity(
  quantity: number,
  fromUnit: SupportedUnit,
  toUnit: SupportedUnit
): number {
  if (!isSupportedUnit(fromUnit)) {
    throw new Error(`Invalid fromUnit '${fromUnit}'.`);
  }
  if (!isSupportedUnit(toUnit)) {
    throw new Error(`Invalid toUnit '${toUnit}'.`);
  }

  if (fromUnit === toUnit) {
    return quantity;
  }

  const fromMeta = UNIT_METADATA_MAP[fromUnit];
  const toMeta = UNIT_METADATA_MAP[toUnit];

  if (fromMeta.dimension !== toMeta.dimension) {
    throw new Error(
      `Cannot convert between incompatible dimensions: '${fromUnit}' (${fromMeta.dimension}) and '${toUnit}' (${toMeta.dimension})`
    );
  }

  // 1. Convert from source unit to base unit
  const baseQuantity = quantity * fromMeta.factorToBase;

  // 2. Convert from base unit to destination unit
  const targetQuantity = baseQuantity / toMeta.factorToBase;

  // Round to 4 decimal places to prevent floating point inaccuracies
  return Math.round(targetQuantity * 10000) / 10000;
}

/**
 * Normalizes any quantity to its physical base unit (kg, l, or pcs).
 */
export function normalizeToBaseQuantity(
  quantity: number,
  unit: SupportedUnit
): { baseQuantity: number; baseUnit: SupportedUnit } {
  const baseUnit = getBaseUnit(unit);
  const baseQuantity = convertQuantity(quantity, unit, baseUnit);
  return { baseQuantity, baseUnit };
}

/**
 * Converts cost per unit to cost per base unit.
 * E.g. ₹0.28 per g -> ₹280 per kg.
 * E.g. ₹280 per kg -> ₹280 per kg.
 */
export function normalizeCostToBaseUnit(
  costPerUnit: number,
  unit: SupportedUnit
): { costPerBaseUnit: number; baseUnit: SupportedUnit } {
  if (costPerUnit < 0) {
    throw new Error('Cost cannot be negative.');
  }
  const baseUnit = getBaseUnit(unit);
  if (unit === baseUnit) {
    return { costPerBaseUnit: costPerUnit, baseUnit };
  }

  const factor = UNIT_METADATA_MAP[unit].factorToBase; // e.g. 0.001
  // If 1g costs X, 1kg costs X / 0.001 = X * 1000
  const costPerBaseUnit = Math.round((costPerUnit / factor) * 100) / 100;
  return { costPerBaseUnit, baseUnit };
}

/**
 * Formats a stock value with its unit and an optional base unit annotation.
 * E.g. "500 g (0.5 kg)" or "10 kg"
 */
export function formatQuantityDisplay(
  quantity: number,
  unit: SupportedUnit
): { display: string; normalizedStr: string } {
  const base = normalizeToBaseQuantity(quantity, unit);
  const display = `${Number(quantity.toFixed(3))} ${unit}`;
  const normalizedStr = unit !== base.baseUnit 
    ? `${Number(base.baseQuantity.toFixed(3))} ${base.baseUnit}`
    : display;
  return { display, normalizedStr };
}
