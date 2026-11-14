/**
 * Abar Khabo: Stage 2 Part B — Step 4 Unit Test Suite
 * Normalized Online Orders Schema & Idempotent Legacy Dual-Mirroring Engine
 */

import {
  ORDER_SOURCES,
  ORDER_TYPES,
  ORDER_STATUS,
  PAYMENT_STATUS,
  MIRROR_STATUS,
  validateStatusTransition,
  generateOrderIdempotencyKey,
  normalizeOrderItemSnapshots,
  calculateOrderPricing,
  buildNormalizedOrderPayload,
  buildLegacyMirrorPayload
} from '../client/src/services/normalizedOrderService.js';

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
console.log('  ABAR KHABO: STAGE 2 PART B — STEP 4 UNIT TESTS');
console.log('  Normalized Online Orders & Dual-Mirroring Engine Verification');
console.log('================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. DETERMINISTIC IDEMPOTENCY KEY GENERATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('[SUITE 1] Deterministic Idempotency Key Generation');

const swiggyKey = generateOrderIdempotencyKey('SWIGGY', 'spice-haven_main', '1598218902');
assert(
  swiggyKey === 'SWIGGY_spice-haven_main_1598218902',
  'Constructs deterministic Swiggy idempotency key: SWIGGY_outlet_externalId'
);

const zomatoKey = generateOrderIdempotencyKey('zomato', 'spice-haven_airport', 'ZOM-4819024');
assert(
  zomatoKey === 'ZOMATO_spice-haven_airport_ZOM-4819024',
  'Constructs normalized uppercase Zomato idempotency key'
);

const posKey = generateOrderIdempotencyKey('POS', 'spice-haven_main', null, 'POS_BILL_1001');
assert(
  posKey === 'POS_spice-haven_main_POS_BILL_1001',
  'Constructs deterministic POS idempotency key using receipt seed'
);

// Verify idempotency guarantee: repeated calls produce identical keys
const swiggyRepeat = generateOrderIdempotencyKey('SWIGGY', 'spice-haven_main', '1598218902');
assert(
  swiggyKey === swiggyRepeat,
  'Repeated submissions produce identical deterministic idempotency key'
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. FINANCIAL PRICING BREAKDOWN & TAX IMMUTABILITY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 2] Financial Calculations & Item Snapshot Locking');

const rawItems = [
  {
    itemId: 'dish_biryani_awadhi',
    name: 'Awadhi Mutton Biryani Special',
    basePrice: 550,
    price: 550,
    qty: 2,
    variant: { id: 'full', name: 'Feast Portion', price: 550 },
    addons: [
      { id: 'burani_raita', name: 'Burani Garlic Raita', price: 60 }
    ],
    cookingNotes: 'Extra spicy, tender meat'
  },
  {
    itemId: 'dish_firni',
    name: 'Kesariya Shahi Firni',
    basePrice: 120,
    price: 120,
    qty: 1
  }
];

const normalizedItems = normalizeOrderItemSnapshots(rawItems);

assert(normalizedItems.length === 2, 'Normalizes all item snapshots');
// Item 1: (550 + 60) * 2 = 1220
assert(normalizedItems[0].subtotal === 1220, 'Calculates item 1 subtotal including variant + addon');
// Item 2: 120 * 1 = 120
assert(normalizedItems[1].subtotal === 120, 'Calculates item 2 subtotal');
assert(normalizedItems[0].cookingNotes === 'Extra spicy, tender meat', 'Preserves cooking instructions');

const pricing = calculateOrderPricing(normalizedItems, {
  packagingCharge: 40,
  deliveryFee: 50,
  restaurantDiscount: 100,
  aggregatorDiscount: 40,
  taxRate: 5.0,
  commissionRate: 18.0
});

// Item total: 1220 + 120 = 1340
assert(pricing.itemTotal === 1340, 'Calculates item total (₹1340)');
// Taxable: 1340 + 40 (packaging) - 100 (discount) = 1280
// Tax: 1280 * 0.05 = 64
assert(pricing.taxTotal === 64, 'Calculates 5% GST on taxable base (₹64)');
// Grand total: 1280 + 64 (tax) + 50 (delivery) = 1394
assert(pricing.grandTotal === 1394, 'Calculates grand total payable (₹1394)');
// Commission: 1340 * 0.18 = 241.20
assert(pricing.commissionAmount === 241.2, 'Calculates 18% aggregator commission (₹241.20)');
// Net payout: 1394 - 241.20 - 40 (aggregatorDiscount) = 1112.80
assert(pricing.netPayout === 1112.8, 'Calculates net merchant payout (₹1112.80)');

// ─────────────────────────────────────────────────────────────────────────────
// 3. CANONICAL NORMALIZED ORDER SCHEMA
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 3] Canonical Normalized Order Payload Validation');

const rawOrder = {
  restaurantId: 'spice-haven',
  outletId: 'spice-haven_main',
  source: ORDER_SOURCES.SWIGGY,
  externalOrderId: '1598218902',
  orderType: ORDER_TYPES.DELIVERY,
  customer: {
    uid: 'cust_swiggy_481',
    name: 'Priyanka Sen',
    phone: '+919830098300',
    address: 'Flat 4B, South City Towers, Kolkata 700068'
  },
  items: rawItems,
  payment: {
    method: 'SWIGGY_PAY',
    status: PAYMENT_STATUS.PAID,
    transactionId: 'TXN_SW_891240182'
  },
  delivery: {
    deliveryBy: 'SWIGGY_FLEET',
    riderName: 'Suman Das',
    riderPhone: '+919874512345',
    pickupOtp: '4819'
  },
  pricing: {
    packagingCharge: 40,
    deliveryFee: 0,
    restaurantDiscount: 100,
    commissionRate: 18.0
  }
};

const normalizedOrder = buildNormalizedOrderPayload(rawOrder);

assert(normalizedOrder.orderId === 'SWIGGY_spice-haven_main_1598218902', 'Sets deterministic orderId');
assert(normalizedOrder.source === 'SWIGGY', 'Binds order source');
assert(normalizedOrder.restaurantId === 'spice-haven', 'Binds tenant ID');
assert(normalizedOrder.outletId === 'spice-haven_main', 'Binds outlet ID');
assert(normalizedOrder.customer.name === 'Priyanka Sen', 'Captures customer name');
assert(normalizedOrder.delivery.pickupOtp === '4819', 'Captures pickup OTP');
assert(normalizedOrder.schemaVersion === '2.0.0', 'Validates schema version 2.0.0');
assert(normalizedOrder.mirrorStatus.legacyOnlineOrders === 'PENDING', 'Initializes mirrorStatus to PENDING');

// ─────────────────────────────────────────────────────────────────────────────
// 4. LEGACY DUAL-MIRROR PAYLOAD TRANSFORMATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 4] Legacy Mirror Payload Transformation');

const legacyPayload = buildLegacyMirrorPayload(normalizedOrder);

assert(legacyPayload.id === 'SWIGGY_spice-haven_main_1598218902', 'Mirror retains same order ID');
assert(legacyPayload.restaurantId === 'spice-haven', 'Mirror retains restaurantId');
assert(legacyPayload.outletId === 'spice-haven_main', 'Mirror retains outletId');
assert(legacyPayload.orderSource === 'SWIGGY', 'Maps orderSource field');
assert(legacyPayload.customerName === 'Priyanka Sen', 'Maps customerName for legacy KDS');
assert(legacyPayload.items.length === 2, 'Maps legacy items list');
assert(legacyPayload.isLegacyMirror === true, 'Flags document as a legacy mirror copy');
assert(legacyPayload.authoritativeRef === 'aggregatorOrders/SWIGGY_spice-haven_main_1598218902', 'References authoritative record');

// ─────────────────────────────────────────────────────────────────────────────
// 5. ORDER STATUS LIFECYCLE STATE MACHINE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 5] Lifecycle State Machine Transitions');

// Valid linear path: PLACED -> ACCEPTED -> PREPARING -> READY -> DISPATCHED -> COMPLETED
assert(validateStatusTransition(ORDER_STATUS.PLACED, ORDER_STATUS.ACCEPTED).valid === true, 'PLACED -> ACCEPTED is valid');
assert(validateStatusTransition(ORDER_STATUS.ACCEPTED, ORDER_STATUS.PREPARING).valid === true, 'ACCEPTED -> PREPARING is valid');
assert(validateStatusTransition(ORDER_STATUS.PREPARING, ORDER_STATUS.READY).valid === true, 'PREPARING -> READY is valid');
assert(validateStatusTransition(ORDER_STATUS.READY, ORDER_STATUS.DISPATCHED).valid === true, 'READY -> DISPATCHED is valid');
assert(validateStatusTransition(ORDER_STATUS.DISPATCHED, ORDER_STATUS.COMPLETED).valid === true, 'DISPATCHED -> COMPLETED is valid');

// Valid branch: PLACED -> CANCELLED / REJECTED
assert(validateStatusTransition(ORDER_STATUS.PLACED, ORDER_STATUS.CANCELLED).valid === true, 'PLACED -> CANCELLED is valid');
assert(validateStatusTransition(ORDER_STATUS.PLACED, ORDER_STATUS.REJECTED).valid === true, 'PLACED -> REJECTED is valid');

// Idempotent same-state transitions
assert(validateStatusTransition(ORDER_STATUS.PREPARING, ORDER_STATUS.PREPARING).valid === true, 'PREPARING -> PREPARING is idempotent');

// Invalid illegal transitions:
assert(validateStatusTransition(ORDER_STATUS.COMPLETED, ORDER_STATUS.PLACED).valid === false, 'COMPLETED -> PLACED is illegal (terminal state)');
assert(validateStatusTransition(ORDER_STATUS.CANCELLED, ORDER_STATUS.READY).valid === false, 'CANCELLED -> READY is illegal (terminal state)');
assert(validateStatusTransition(ORDER_STATUS.PLACED, ORDER_STATUS.COMPLETED).valid === false, 'PLACED -> COMPLETED is illegal (skipping cooking steps)');
assert(validateStatusTransition(ORDER_STATUS.REJECTED, ORDER_STATUS.ACCEPTED).valid === false, 'REJECTED -> ACCEPTED is illegal');

// ─────────────────────────────────────────────────────────────────────────────
// 6. MULTI-SOURCE ORDER COVERAGE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 6] Multi-Source Order Coverage');

const allSources = [
  ORDER_SOURCES.ABAR_KHABO,
  ORDER_SOURCES.POS,
  ORDER_SOURCES.SWIGGY,
  ORDER_SOURCES.ZOMATO,
  ORDER_SOURCES.TAKEAWAY
];

allSources.forEach(s => {
  const ord = buildNormalizedOrderPayload({
    restaurantId: 'spice-haven',
    outletId: 'spice-haven_main',
    source: s,
    items: [{ itemId: 'item_1', name: 'Item', price: 100, qty: 1 }]
  });
  assert(ord.source === s, `Successfully normalizes order from source "${s}"`);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`  STEP 4 UNIT TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
