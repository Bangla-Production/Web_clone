/**
 * Abar Khabo: Enterprise Multi-Tenant SaaS
 * Client-Side Unit Converter & Measurement Engine
 */

export const UNIT_DIMENSIONS = {
  MASS: 'MASS',
  VOLUME: 'VOLUME',
  COUNT: 'COUNT'
};

export const BASE_UNITS = {
  MASS: 'kg',
  VOLUME: 'litre',
  COUNT: 'pcs'
};

const UNIT_DEFINITIONS = {
  // Mass (Base: kg)
  kg: { dimension: UNIT_DIMENSIONS.MASS, toBase: 1.0, canonical: 'kg' },
  kilogram: { dimension: UNIT_DIMENSIONS.MASS, toBase: 1.0, canonical: 'kg' },
  kilograms: { dimension: UNIT_DIMENSIONS.MASS, toBase: 1.0, canonical: 'kg' },
  g: { dimension: UNIT_DIMENSIONS.MASS, toBase: 0.001, canonical: 'g' },
  gram: { dimension: UNIT_DIMENSIONS.MASS, toBase: 0.001, canonical: 'g' },
  grams: { dimension: UNIT_DIMENSIONS.MASS, toBase: 0.001, canonical: 'g' },
  mg: { dimension: UNIT_DIMENSIONS.MASS, toBase: 0.000001, canonical: 'mg' },
  milligram: { dimension: UNIT_DIMENSIONS.MASS, toBase: 0.000001, canonical: 'mg' },
  milligrams: { dimension: UNIT_DIMENSIONS.MASS, toBase: 0.000001, canonical: 'mg' },

  // Volume (Base: litre)
  l: { dimension: UNIT_DIMENSIONS.VOLUME, toBase: 1.0, canonical: 'l' },
  litre: { dimension: UNIT_DIMENSIONS.VOLUME, toBase: 1.0, canonical: 'l' },
  litres: { dimension: UNIT_DIMENSIONS.VOLUME, toBase: 1.0, canonical: 'l' },
  liter: { dimension: UNIT_DIMENSIONS.VOLUME, toBase: 1.0, canonical: 'l' },
  liters: { dimension: UNIT_DIMENSIONS.VOLUME, toBase: 1.0, canonical: 'l' },
  ml: { dimension: UNIT_DIMENSIONS.VOLUME, toBase: 0.001, canonical: 'ml' },
  millilitre: { dimension: UNIT_DIMENSIONS.VOLUME, toBase: 0.001, canonical: 'ml' },
  millilitres: { dimension: UNIT_DIMENSIONS.VOLUME, toBase: 0.001, canonical: 'ml' },

  // Discrete Count (Base: pcs)
  pcs: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'pcs' },
  piece: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'pcs' },
  pieces: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'pcs' },
  pc: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'pcs' },
  pkt: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'pkt' },
  packet: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'pkt' },
  packets: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'pkt' },
  box: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'box' },
  boxes: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'box' },
  can: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'can' },
  cans: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'can' },
  bottle: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'bottle' },
  bottles: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'bottle' },
  portion: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'portion' },
  portions: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'portion' },
  slice: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'slice' },
  slices: { dimension: UNIT_DIMENSIONS.COUNT, toBase: 1.0, canonical: 'slice' }
};

export function normalizeUnit(unit) {
  if (!unit || typeof unit !== 'string') return 'pcs';
  const clean = unit.trim().toLowerCase();
  const def = UNIT_DEFINITIONS[clean];
  return def ? def.canonical : clean;
}

export function getUnitDimension(unit) {
  if (!unit || typeof unit !== 'string') return null;
  const clean = unit.trim().toLowerCase();
  const def = UNIT_DEFINITIONS[clean];
  return def ? def.dimension : null;
}

export function areUnitsCompatible(fromUnit, toUnit) {
  const normFrom = normalizeUnit(fromUnit);
  const normTo = normalizeUnit(toUnit);
  if (normFrom === normTo) return true;

  const dim1 = getUnitDimension(fromUnit);
  const dim2 = getUnitDimension(toUnit);
  if (!dim1 || !dim2) return false;
  return dim1 === dim2;
}

export function convertUnit(quantity, fromUnit, toUnit, precision = 4) {
  const num = Number(quantity);
  if (isNaN(num)) {
    throw new Error(`Invalid quantity provided for unit conversion: ${quantity}`);
  }

  const cleanFrom = fromUnit ? fromUnit.trim().toLowerCase() : '';
  const cleanTo = toUnit ? toUnit.trim().toLowerCase() : '';

  if (cleanFrom === cleanTo) {
    return Number(num.toFixed(precision));
  }

  const fromDef = UNIT_DEFINITIONS[cleanFrom];
  const toDef = UNIT_DEFINITIONS[cleanTo];

  if (!fromDef) {
    throw new Error(`Unsupported source unit: "${fromUnit}"`);
  }
  if (!toDef) {
    throw new Error(`Unsupported target unit: "${toUnit}"`);
  }

  if (fromDef.dimension !== toDef.dimension) {
    throw new Error(
      `Incompatible unit conversion between ${fromDef.dimension} (${fromUnit}) and ${toDef.dimension} (${toUnit})`
    );
  }

  const baseValue = num * fromDef.toBase;
  const targetValue = baseValue / toDef.toBase;

  return Number(targetValue.toFixed(precision));
}
