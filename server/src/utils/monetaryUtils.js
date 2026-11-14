/**
 * Abar Khabo: Enterprise Monetary Arithmetic & Financial Precision Utility
 * 
 * Performs all currency calculations using integer minor units (paise: ₹1 = 100 paise)
 * to completely eliminate IEEE-754 floating-point inaccuracies (e.g., 0.1 + 0.2 !== 0.3).
 */

export const ROUNDING_MODES = {
  ROUND_HALF_UP: 'ROUND_HALF_UP',
  NEAREST_INTEGER: 'NEAREST_INTEGER',
  NONE: 'NONE'
};

/**
 * Converts a decimal rupee amount into integer paise.
 * @param {number|string} rupees - e.g. 550.50
 * @returns {number} Integer paise, e.g. 55050
 */
export function toPaise(rupees) {
  if (rupees === null || rupees === undefined || isNaN(Number(rupees))) return 0;
  return Math.round(Number(rupees) * 100);
}

/**
 * Converts integer paise into a 2-decimal rupee number.
 * @param {number} paise - e.g. 55050
 * @returns {number} Decimal rupees, e.g. 550.50
 */
export function toRupees(paise) {
  if (paise === null || paise === undefined || isNaN(Number(paise))) return 0;
  return Number((Math.round(Number(paise)) / 100).toFixed(2));
}

/**
 * Exact addition of two monetary amounts.
 */
export function addMoney(rupeesA, rupeesB) {
  const paiseA = toPaise(rupeesA);
  const paiseB = toPaise(rupeesB);
  return toRupees(paiseA + paiseB);
}

/**
 * Exact subtraction of two monetary amounts.
 */
export function subtractMoney(rupeesA, rupeesB) {
  const paiseA = toPaise(rupeesA);
  const paiseB = toPaise(rupeesB);
  return toRupees(paiseA - paiseB);
}

/**
 * Computes exact tax on a taxable base amount at a given rate percentage.
 * Returns both component breakdown (CGST/SGST) and total tax in paise and rupees.
 */
export function calculateTax(taxableBaseRupees, ratePercent) {
  const basePaise = toPaise(taxableBaseRupees);
  const rate = Number(ratePercent) || 0;

  // Total tax in paise (rounded half up)
  const totalTaxPaise = Math.round((basePaise * rate) / 100);
  
  // Split equally into CGST and SGST
  const cgstPaise = Math.floor(totalTaxPaise / 2);
  const sgstPaise = totalTaxPaise - cgstPaise; // Guarantees cgst + sgst == totalTaxPaise

  return {
    taxableBase: toRupees(basePaise),
    taxRate: rate,
    cgstRate: Number((rate / 2).toFixed(2)),
    sgstRate: Number((rate / 2).toFixed(2)),
    taxAmount: toRupees(totalTaxPaise),
    cgstAmount: toRupees(cgstPaise),
    sgstAmount: toRupees(sgstPaise),
    taxAmountPaise: totalTaxPaise,
    cgstAmountPaise: cgstPaise,
    sgstAmountPaise: sgstPaise
  };
}

/**
 * Computes exact aggregator commission and platform deductions.
 */
export function calculateCommission(commissionableBaseRupees, ratePercent) {
  const basePaise = toPaise(commissionableBaseRupees);
  const rate = Number(ratePercent) || 0;
  const commissionPaise = Math.round((basePaise * rate) / 100);

  return {
    commissionableBase: toRupees(basePaise),
    commissionRate: rate,
    commissionAmount: toRupees(commissionPaise),
    commissionAmountPaise: commissionPaise
  };
}

/**
 * Allocates an integer paise amount across multiple weights without losing pennies.
 * Uses the Largest Remainder Method (Hare-Niemeyer).
 */
export function allocateProRata(totalPaise, weights = []) {
  if (!weights.length) return [];
  const sumWeights = weights.reduce((acc, w) => acc + Number(w || 0), 0);
  if (sumWeights === 0) return weights.map(() => 0);

  const exactAllocations = weights.map(w => (totalPaise * Number(w)) / sumWeights);
  const integerParts = exactAllocations.map(a => Math.floor(a));
  let remainder = totalPaise - integerParts.reduce((a, b) => a + b, 0);

  // Pair with original index and decimal remainder
  const remainders = exactAllocations
    .map((val, idx) => ({ idx, remainder: val - integerParts[idx] }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < remainder; i++) {
    integerParts[remainders[i].idx]++;
  }

  return integerParts;
}

/**
 * Checks whether two financial values are within a specified tolerance threshold.
 */
export function isWithinTolerance(amountA, amountB, toleranceRupees = 2.00, tolerancePercent = 0.5) {
  const diff = Math.abs(toPaise(amountA) - toPaise(amountB));
  const diffRupees = toRupees(diff);

  // Absolute tolerance check
  if (diffRupees <= toleranceRupees) return true;

  // Percentage tolerance check relative to amountA
  const basePaise = toPaise(amountA);
  if (basePaise > 0) {
    const pctDiff = (diff / basePaise) * 100;
    if (pctDiff <= tolerancePercent) return true;
  }

  return false;
}
