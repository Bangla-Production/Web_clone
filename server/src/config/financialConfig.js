/**
 * Abar Khabo: Configurable Financial Rules & Pricing Engine
 * Dynamically resolves GST rates, CGST/SGST splits, packaging charges, and
 * aggregator commission rates from restaurant/outlet configuration rather than
 * relying on hardcoded static values.
 */

export const DEFAULT_FINANCIAL_RULES = {
  defaultGstRate: 5.0, // 5% GST for Indian restaurants
  defaultCgstRate: 2.5,
  defaultSgstRate: 2.5,
  defaultCommissionRate: 18.0, // 18% standard aggregator platform commission
  isPackagingTaxable: false,
  isDeliveryTaxable: false,
  currency: 'INR',
  currencySymbol: '₹',
  roundingMode: 'NEAREST_INTEGER' // Rounds final payable total to nearest rupee
};

/**
 * Resolves effective financial rules by merging system defaults with
 * outlet overrides and connection settings.
 */
export function resolveFinancialRules(restaurantSettings = {}, outletConfig = {}, connectionConfig = {}) {
  const gstRate = Number(
    connectionConfig?.financialConfig?.gstRate ??
    outletConfig?.taxRate ??
    restaurantSettings?.taxRate ??
    DEFAULT_FINANCIAL_RULES.defaultGstRate
  );

  const halfRate = Number((gstRate / 2).toFixed(2));

  const commissionRate = Number(
    connectionConfig?.financialConfig?.commissionRate ??
    outletConfig?.commissionRate ??
    DEFAULT_FINANCIAL_RULES.defaultCommissionRate
  );

  const isPackagingTaxable = Boolean(
    connectionConfig?.financialConfig?.isPackagingTaxable ??
    DEFAULT_FINANCIAL_RULES.isPackagingTaxable
  );

  return {
    gstRate,
    cgstRate: halfRate,
    sgstRate: halfRate,
    commissionRate,
    isPackagingTaxable,
    currency: restaurantSettings?.currency || DEFAULT_FINANCIAL_RULES.currency,
    currencySymbol: restaurantSettings?.currencySymbol || DEFAULT_FINANCIAL_RULES.currencySymbol
  };
}

/**
 * Computes authoritative financial figures and creates an immutable snapshot.
 *
 * @param {Array} items - List of normalized order items with unitPrice, quantity, addons, variants
 * @param {Object} charges - Additional fees { discountAmount, deliveryCharge, packagingCharge, tipAmount }
 * @param {Object} rules - Effective financial rules from resolveFinancialRules
 * @returns {Object} Complete, immutable pricing breakdown snapshot
 */
export function calculateOrderPricing(items = [], charges = {}, rules = DEFAULT_FINANCIAL_RULES) {
  // 1. Calculate items subtotal
  let itemTotal = 0;
  for (const item of items) {
    const unitPrice = Number(item.unitPrice || item.price || 0);
    const qty = Number(item.quantity || 1);
    const itemSubtotal = Number(item.subtotal ?? (unitPrice * qty));
    itemTotal += itemSubtotal;
  }
  itemTotal = Number(itemTotal.toFixed(2));

  // 2. Discounts
  const discountAmount = Math.min(Number(charges.discountAmount || 0), itemTotal);
  const couponCode = charges.couponCode ? String(charges.couponCode).trim() : null;

  // 3. Taxable Base
  const packagingCharge = Number(charges.packagingCharge || 0);
  const deliveryCharge = Number(charges.deliveryCharge || 0);
  const tipAmount = Number(charges.tipAmount || 0);

  let taxableBase = itemTotal - discountAmount;
  if (rules.isPackagingTaxable) {
    taxableBase += packagingCharge;
  }
  taxableBase = Math.max(0, Number(taxableBase.toFixed(2)));

  // 4. GST Taxes
  const gstRate = Number(rules.gstRate ?? rules.defaultGstRate ?? 5.0);
  const totalTaxAmount = Number(((taxableBase * gstRate) / 100).toFixed(2));

  const cgstRate = Number(rules.cgstRate ?? (gstRate / 2));
  const sgstRate = Number(rules.sgstRate ?? (gstRate / 2));
  const cgstAmount = Number(((taxableBase * cgstRate) / 100).toFixed(2));
  const sgstAmount = Number(((taxableBase * sgstRate) / 100).toFixed(2));

  // 5. Grand Total (Payable by customer)
  const rawGrandTotal = taxableBase + totalTaxAmount + (rules.isPackagingTaxable ? 0 : packagingCharge) + deliveryCharge + tipAmount;
  const grandTotal = Math.round(rawGrandTotal);
  const roundOff = Number((grandTotal - rawGrandTotal).toFixed(2));

  // 6. Aggregator Commission & Merchant Net Payout
  const commissionRate = Number(rules.commissionRate ?? rules.defaultCommissionRate ?? 18.0);
  // Commission calculated on net item subtotal (after discount)
  const commissionBase = Math.max(0, itemTotal - discountAmount);
  const commissionAmount = Number(((commissionBase * commissionRate) / 100).toFixed(2));
  
  // Net payout = Grand total minus commission minus customer delivery charge & tip (if aggregator fleet)
  const merchantNetPayout = Number((grandTotal - commissionAmount - deliveryCharge - tipAmount).toFixed(2));

  return {
    itemTotal,
    discountAmount,
    couponCode,
    taxableAmount: taxableBase,
    taxRate: gstRate,
    taxAmount: totalTaxAmount,
    taxes: [
      { name: 'CGST', rate: cgstRate, amount: cgstAmount },
      { name: 'SGST', rate: sgstRate, amount: sgstAmount }
    ],
    deliveryCharge,
    packagingCharge,
    tipAmount,
    roundOff,
    grandTotal,
    commissionRate,
    commissionAmount,
    merchantNetPayout,
    currency: rules.currency || 'INR',
    calculatedAt: new Date().toISOString()
  };
}
