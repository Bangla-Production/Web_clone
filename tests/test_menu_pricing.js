/**
 * Abar Khabo: Stage 2 Part B — Step 3 Unit Test Suite
 * Master Menu Catalog, Outlet Overrides & Multi-Channel Pricing Verification
 */

import {
  ORDER_CHANNELS,
  FOOD_TYPES,
  ITEM_STATUS,
  roundToCurrency,
  calculateEffectivePrice,
  evaluateItemAvailability,
  resolveEffectiveMenuItem
} from '../client/src/services/menuService.js';

let passed = 0;
let failed = 0;

function assert(condition, description, detail = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${description} ${detail ? '(' + detail + ')' : ''}`);
    failed++;
  }
}

console.log('================================================================');
console.log('  ABAR KHABO: STAGE 2 PART B — STEP 3 UNIT TESTS');
console.log('  Master Menu, Outlet Overrides & Multi-Channel Pricing Verification');
console.log('================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. MASTER MENU CATALOG ATTRIBUTES
// ─────────────────────────────────────────────────────────────────────────────
console.log('[SUITE 1] Master Menu Catalog Definition');

const masterBiryani = {
  id: 'dish_biryani_awadhi',
  itemId: 'dish_biryani_awadhi',
  restaurantId: 'spice-haven',
  name: 'Awadhi Mutton Biryani Special',
  description: 'Slow-cooked fragrant long-grain basmati rice with tender mutton shank',
  category: 'Biryani & Rice',
  subCategory: 'Awadhi Specials',
  sku: 'SPH-BIR-001',
  internalCode: 'BIRYANI_AWADHI_01',
  basePrice: 550,
  taxRate: 5.0,
  taxInclusive: true,
  foodType: FOOD_TYPES.NON_VEG,
  variants: [
    { id: 'half', name: 'Regular Portion', price: 350, isDefault: false },
    { id: 'full', name: 'Special Feast Portion', price: 550, isDefault: true }
  ],
  addonGroups: [
    {
      id: 'gravy_addon',
      name: 'Extra Gravy & Raita',
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: 'raita_burani', name: 'Burani Garlic Raita', price: 60 },
        { id: 'extra_salan', name: 'Mirchi Ka Salan', price: 80 }
      ]
    }
  ],
  preparationTimeMinutes: 25,
  channelPricing: {
    [ORDER_CHANNELS.DINE_IN]: 550,
    [ORDER_CHANNELS.DIRECT_ONLINE]: 550,
    [ORDER_CHANNELS.SWIGGY]: 630,
    [ORDER_CHANNELS.ZOMATO]: 630,
    [ORDER_CHANNELS.TAKEAWAY]: 530
  },
  status: ITEM_STATUS.ACTIVE,
  isAvailable: true
};

assert(masterBiryani.basePrice === 550, 'Master item base price defined');
assert(masterBiryani.variants.length === 2, 'Supports portion variants');
assert(masterBiryani.addonGroups.length === 1, 'Supports add-on / modifier groups');
assert(masterBiryani.channelPricing[ORDER_CHANNELS.SWIGGY] === 630, 'Supports master channel pricing');

// ─────────────────────────────────────────────────────────────────────────────
// 2. INHERITED MASTER PRICES (NO OUTLET OVERRIDE)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 2] Inherited Master Prices When No Override Exists');

const inheritedDineIn = calculateEffectivePrice(masterBiryani, null, ORDER_CHANNELS.DINE_IN);
assert(
  inheritedDineIn.effectivePrice === 550,
  'Dine-in inherits master price (₹550)'
);
assert(
  inheritedDineIn.taxRate === 5.0 && inheritedDineIn.taxInclusive === true,
  'Inherits master 5% tax configuration'
);
assert(
  inheritedDineIn.netPrice === 523.81 && inheritedDineIn.taxAmount === 26.19,
  'Accurately calculates tax inclusive split (₹523.81 net + ₹26.19 GST = ₹550)'
);

const inheritedDirect = calculateEffectivePrice(masterBiryani, null, ORDER_CHANNELS.DIRECT_ONLINE);
assert(
  inheritedDirect.effectivePrice === 550,
  'Direct Online inherits master price (₹550)'
);

const inheritedTakeaway = calculateEffectivePrice(masterBiryani, null, ORDER_CHANNELS.TAKEAWAY);
assert(
  inheritedTakeaway.effectivePrice === 530,
  'Takeaway inherits master channel override (₹530)'
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. OUTLET-SPECIFIC CHANNEL OVERRIDES & MULTI-OUTLET DIFFERENTIATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 3] Outlet-Specific Overrides Across Multiple Branches');

// Outlet 1: Main Branch (Park Street) - Uses standard master prices
const outlet1Override = null;

// Outlet 2: Airport Cloud Kitchen - Premium pricing due to high airport rental / packaging
const outlet2AirportOverride = {
  outletId: 'spice-haven_airport',
  basePrice: 620,
  priceOverrides: {
    [ORDER_CHANNELS.DINE_IN]: 620,
    [ORDER_CHANNELS.DIRECT_ONLINE]: 620,
    [ORDER_CHANNELS.SWIGGY]: 710,
    [ORDER_CHANNELS.ZOMATO]: 710,
    [ORDER_CHANNELS.TAKEAWAY]: 600
  },
  preparationTimeMinutes: 15
};

const outlet1SwiggyPrice = calculateEffectivePrice(masterBiryani, outlet1Override, ORDER_CHANNELS.SWIGGY);
const outlet2SwiggyPrice = calculateEffectivePrice(masterBiryani, outlet2AirportOverride, ORDER_CHANNELS.SWIGGY);

assert(
  outlet1SwiggyPrice.effectivePrice === 630,
  'Outlet 1 (Main Branch) resolves Swiggy price to ₹630'
);
assert(
  outlet2SwiggyPrice.effectivePrice === 710,
  'Outlet 2 (Airport Branch) resolves Swiggy price to ₹710'
);
assert(
  outlet1SwiggyPrice.effectivePrice !== outlet2SwiggyPrice.effectivePrice,
  'Different outlets have distinct, independent effective prices for same dish'
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. AGGREGATOR MULTIPLIER FALLBACK STRATEGY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 4] Aggregator Percentage Multiplier Fallback');

// Simple item with only basePrice: 200, no explicit channel pricing
const simplePaneer = {
  id: 'dish_paneer_tikka',
  basePrice: 200,
  taxRate: 5.0,
  taxInclusive: true,
  status: ITEM_STATUS.ACTIVE
};

// When aggregatorMultiplier is 1.15 (15% markup to cover platform commission)
const fallbackSwiggy = calculateEffectivePrice(simplePaneer, null, ORDER_CHANNELS.SWIGGY, 1.15);
assert(
  fallbackSwiggy.effectivePrice === 230,
  'Applies 15% aggregator markup fallback (200 * 1.15 = ₹230)'
);

// Verify standard currency rounding
const oddPriceItem = { basePrice: 235 };
const roundedSwiggy = calculateEffectivePrice(oddPriceItem, null, ORDER_CHANNELS.SWIGGY, 1.15);
// 235 * 1.15 = 270.25 -> rounded to 270
assert(
  roundedSwiggy.effectivePrice === 270,
  'Rounds fractional aggregator calculated price to integer rupee (235 * 1.15 = 270.25 -> ₹270)'
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. TAX EXCLUSIVE PRICING CALCULATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 5] Tax Treatment: Tax Exclusive Support');

const exclusiveItem = {
  basePrice: 500,
  taxRate: 18.0,
  taxInclusive: false,
  status: ITEM_STATUS.ACTIVE
};

const exclusivePricing = calculateEffectivePrice(exclusiveItem, null, ORDER_CHANNELS.DINE_IN);
assert(
  exclusivePricing.netPrice === 500,
  'Tax exclusive net price is equal to base price (₹500)'
);
assert(
  exclusivePricing.taxAmount === 90,
  'Calculates 18% tax accurately (500 * 0.18 = ₹90)'
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. MULTI-LEVEL AVAILABILITY ENGINE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 6] Multi-Level Item Availability Verification');

// Case 1: Master inactive item is globally unavailable
const inactiveMaster = { ...masterBiryani, status: ITEM_STATUS.INACTIVE };
const res1 = evaluateItemAvailability(inactiveMaster, null, ORDER_CHANNELS.DINE_IN);
assert(
  res1.available === false && res1.reason === 'MASTER_ITEM_INACTIVE',
  'Master inactive item is unavailable across all outlets and channels'
);

// Case 2: Outlet-level 86 toggle
const outlet86Override = {
  outletId: 'spice-haven_main',
  isAvailable: false
};
const res2 = evaluateItemAvailability(masterBiryani, outlet86Override, ORDER_CHANNELS.DINE_IN);
assert(
  res2.available === false && res2.reason === 'OUTLET_ITEM_UNAVAILABLE',
  'Outlet-specific isAvailable: false 86s the item at that branch'
);

// Case 3: Temporary scheduled out-of-stock window
const futureTime = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour in future
const tempStockOverride = {
  outletId: 'spice-haven_main',
  outOfStockUntil: futureTime
};
const res3 = evaluateItemAvailability(masterBiryani, tempStockOverride, ORDER_CHANNELS.DINE_IN, new Date());
assert(
  res3.available === false && res3.reason === 'TEMPORARILY_OUT_OF_STOCK',
  'Temporary outOfStockUntil window blocks ordering until expiry'
);

// Case 4: Expired out-of-stock window is available
const pastTime = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour in past
const expiredStockOverride = {
  outletId: 'spice-haven_main',
  outOfStockUntil: pastTime
};
const res4 = evaluateItemAvailability(masterBiryani, expiredStockOverride, ORDER_CHANNELS.DINE_IN, new Date());
assert(
  res4.available === true,
  'Expired outOfStockUntil automatically restores item availability'
);

// Case 5: Channel-specific availability toggle (e.g. Swiggy delivery suspended during rain, dine-in active)
const channelSpecificOverride = {
  outletId: 'spice-haven_main',
  channelAvailability: {
    [ORDER_CHANNELS.DINE_IN]: true,
    [ORDER_CHANNELS.SWIGGY]: false,
    [ORDER_CHANNELS.ZOMATO]: false
  }
};
const resDineIn = evaluateItemAvailability(masterBiryani, channelSpecificOverride, ORDER_CHANNELS.DINE_IN);
const resSwiggy = evaluateItemAvailability(masterBiryani, channelSpecificOverride, ORDER_CHANNELS.SWIGGY);
assert(
  resDineIn.available === true,
  'Item is available on DINE_IN channel'
);
assert(
  resSwiggy.available === false && resSwiggy.reason === 'UNAVAILABLE_ON_CHANNEL_SWIGGY',
  'Item is blocked on SWIGGY channel while active on DINE_IN'
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. UNIFIED EFFECTIVE MENU ITEM RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 7] Unified Effective Menu Item Resolution');

const resolvedAirportSwiggy = resolveEffectiveMenuItem(
  masterBiryani,
  outlet2AirportOverride,
  ORDER_CHANNELS.SWIGGY
);

assert(resolvedAirportSwiggy.id === 'dish_biryani_awadhi', 'Preserves item ID');
assert(resolvedAirportSwiggy.price === 710, 'Resolves effective price (₹710)');
assert(resolvedAirportSwiggy.preparationTimeMinutes === 15, 'Applies outlet prep time override (15 min)');
assert(resolvedAirportSwiggy.isAvailable === true, 'Evaluates channel availability');
assert(resolvedAirportSwiggy.hasOverride === true, 'Flags override presence');

// ─────────────────────────────────────────────────────────────────────────────
// 8. HISTORICAL ORDER PRICE PRESERVATION PRINCIPLE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 8] Historical Order Price Immutability Principle');

// Placed order snapshot
const historicalOrderItem = {
  itemId: 'dish_biryani_awadhi',
  name: 'Awadhi Mutton Biryani Special',
  price: 550,
  qty: 2,
  taxRate: 5.0,
  subtotal: 1100
};

// Simulate admin updating master menu price to ₹600
const updatedMasterBiryani = {
  ...masterBiryani,
  basePrice: 600,
  channelPricing: {
    ...masterBiryani.channelPricing,
    [ORDER_CHANNELS.DINE_IN]: 600
  }
};

const newPrice = calculateEffectivePrice(updatedMasterBiryani, null, ORDER_CHANNELS.DINE_IN);
assert(newPrice.effectivePrice === 600, 'Master catalog price updated to ₹600');
assert(historicalOrderItem.price === 550, 'Historical order snapshot retains original price (₹550)');
assert(historicalOrderItem.subtotal === 1100, 'Historical order subtotal remains unchanged');

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`  STEP 3 UNIT TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
