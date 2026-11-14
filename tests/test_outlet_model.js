/**
 * Abar Khabo: Stage 2 Part B — Step 1 Unit Test Suite
 * Restaurant and Outlet Data Model Verification
 */

import {
  getOutletDocPath,
  getDefaultOutletId,
  formatCompositeOutletKey,
  parseCompositeOutletKey,
  validateOutletData,
  normalizeOutletData,
  synthesizeDefaultOutlet
} from '../client/src/services/outletService.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
    failedTests++;
  }
}

console.log('================================================================');
console.log('  ABAR KHABO: STAGE 2 PART B — STEP 1 UNIT TESTS');
console.log('  Restaurant & Outlet Data Model Verification');
console.log('================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. CANONICAL DOCUMENT PATH GENERATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('[SUITE 1] Canonical Document Paths');

assert(
  getOutletDocPath('spice-haven', 'spice-haven_main') === 'restaurants/spice-haven/outlets/spice-haven_main',
  'Constructs canonical path for default outlet'
);

assert(
  getOutletDocPath('wok-express', 'wok-branch-02') === 'restaurants/wok-express/outlets/wok-branch-02',
  'Constructs canonical path for secondary branch outlet'
);

let missingParamThrew = false;
try {
  getOutletDocPath('spice-haven', '');
} catch (e) {
  missingParamThrew = true;
}
assert(missingParamThrew, 'Throws error when outletId is empty');

// ─────────────────────────────────────────────────────────────────────────────
// 2. DETERMINISTIC DEFAULT OUTLET ID
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 2] Deterministic Default Outlet ID Strategy');

assert(
  getDefaultOutletId('spice-haven') === 'spice-haven_main',
  'Generates deterministic ID ${restaurantId}_main for default outlet'
);

assert(
  getDefaultOutletId('biryani-house-saltlake') === 'biryani-house-saltlake_main',
  'Generates deterministic ID with complex hyphenated tenant ID'
);

assert(
  getDefaultOutletId('') === '',
  'Returns empty string when restaurantId is empty'
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. COMPOSITE KEY FORMATTING & PARSING
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 3] Composite Key Business Identity');

const composite = formatCompositeOutletKey('spice-haven', 'spice-haven_main');
assert(
  composite === 'spice-haven#spice-haven_main',
  'Formats composite business key as restaurantId#outletId'
);

const parsed = parseCompositeOutletKey(composite);
assert(
  parsed.restaurantId === 'spice-haven' && parsed.outletId === 'spice-haven_main',
  'Parses composite business key accurately into tenant and outlet identity'
);

const fallbackComposite = formatCompositeOutletKey('spice-haven', null);
assert(
  fallbackComposite === 'spice-haven#spice-haven_main',
  'Automatically falls back to default outlet ID if outletId is omitted in composite key'
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. SCHEMA VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 4] Outlet Schema Validation');

const validOutlet = {
  restaurantId: 'spice-haven',
  outletName: 'Park Street Main Branch',
  status: 'ACTIVE'
};
const val1 = validateOutletData(validOutlet);
assert(val1.valid === true, 'Accepts valid minimal outlet payload');

const missingRestId = {
  outletName: 'Park Street Main Branch'
};
const val2 = validateOutletData(missingRestId);
assert(
  val2.valid === false && val2.errors.some(e => e.includes('restaurantId')),
  'Rejects payload missing restaurantId'
);

const missingName = {
  restaurantId: 'spice-haven'
};
const val3 = validateOutletData(missingName);
assert(
  val3.valid === false && val3.errors.some(e => e.includes('outletName')),
  'Rejects payload missing outletName'
);

const invalidStatus = {
  restaurantId: 'spice-haven',
  outletName: 'Salt Lake Branch',
  status: 'INVALID_STATUS'
};
const val4 = validateOutletData(invalidStatus);
assert(
  val4.valid === false && val4.errors.some(e => e.includes('status')),
  'Rejects payload with invalid status'
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. NORMALIZATION & ENTERPRISE DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 5] Payload Normalization & Enterprise Defaults');

const rawData = {
  outletName: 'Spice Haven South City',
  branchCode: 'SC-02',
  phone: '+919830112233',
  address: '375 Prince Anwar Shah Rd, Kolkata',
  coordinates: { lat: 22.499, lng: 88.361 },
  deliveryRadius: 10,
  minOrder: 250
};

const normalized = normalizeOutletData(rawData, 'spice-haven', 'spice-haven_sc02');

assert(normalized.id === 'spice-haven_sc02', 'Sets normalized document ID');
assert(normalized.outletId === 'spice-haven_sc02', 'Sets normalized outletId field');
assert(normalized.restaurantId === 'spice-haven', 'Binds tenant restaurantId');
assert(normalized.isDefaultOutlet === false, 'Correctly flags non-default branch');
assert(normalized.branchCode === 'SC-02', 'Preserves branch code');
assert(normalized.contact.phone === '+919830112233', 'Structures contact details');
assert(normalized.location.address.includes('Prince Anwar Shah'), 'Structures location address');
assert(normalized.location.coordinates.lat === 22.499, 'Normalizes latitude');
assert(normalized.deliveryConfig.radiusKm === 10, 'Normalizes delivery radius');
assert(normalized.deliveryConfig.minOrderAmount === 250, 'Normalizes min order amount');
assert(normalized.deliveryConfig.baseDeliveryCharge === 35, 'Applies default delivery charge');
assert(normalized.operatingHours.isOpen === true, 'Provides standard operating hours object');
assert(normalized.status === 'ACTIVE', 'Sets default status to ACTIVE');

// ─────────────────────────────────────────────────────────────────────────────
// 6. BACKWARD COMPATIBILITY: SYNTHETIC DEFAULT OUTLET
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 6] Zero-Downtime Backward Compatibility Synthesis');

const legacyRestaurantDoc = {
  id: 'royal-feast',
  name: 'Royal Feast Heritage',
  phone: '+919876543210',
  email: 'contact@royalfeast.com',
  address: '45 Chowringhee Road, Kolkata 700071',
  city: 'Kolkata',
  state: 'West Bengal',
  pincode: '700071',
  coordinates: { lat: 22.545, lng: 88.350 },
  deliveryRadius: 6.5,
  minOrder: 180,
  deliveryFee: 40,
  fssaiNumber: '12821019000456',
  gstin: '19AABCR1234F1Z1',
  status: 'active'
};

const synthetic = synthesizeDefaultOutlet(legacyRestaurantDoc);

assert(synthetic !== null, 'Successfully synthesizes outlet from legacy doc');
assert(synthetic.id === 'royal-feast_main', 'Synthesizes deterministic default ID');
assert(synthetic.outletId === 'royal-feast_main', 'Binds synthetic outletId');
assert(synthetic.restaurantId === 'royal-feast', 'Binds synthetic restaurantId');
assert(synthetic.isDefaultOutlet === true, 'Flags synthetic outlet as default branch');
assert(synthetic.outletName === 'Royal Feast Heritage - Main Branch', 'Derives name from restaurant');
assert(synthetic.contact.phone === '+919876543210', 'Transfers legacy phone number');
assert(synthetic.location.address.includes('Chowringhee Road'), 'Transfers legacy address');
assert(synthetic.deliveryConfig.radiusKm === 6.5, 'Transfers legacy delivery radius');
assert(synthetic.deliveryConfig.minOrderAmount === 180, 'Transfers legacy min order');
assert(synthetic.deliveryConfig.baseDeliveryCharge === 40, 'Transfers legacy delivery fee');
assert(synthetic.fssaiLicenseNumber === '12821019000456', 'Transfers FSSAI number');
assert(synthetic.status === 'ACTIVE', 'Maps legacy active status to ACTIVE');

// ─────────────────────────────────────────────────────────────────────────────
// 7. MULTI-OUTLET TENANT INDEPENDENCE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 7] Multi-Outlet Discrimination & Independence');

const branchA = normalizeOutletData({
  outletName: 'Mocambo - Park Street',
  deliveryRadius: 5
}, 'mocambo', 'mocambo_main');

const branchB = normalizeOutletData({
  outletName: 'Mocambo - Newtown Cloud Kitchen',
  deliveryRadius: 12
}, 'mocambo', 'mocambo_newtown');

assert(branchA.isDefaultOutlet === true, 'Branch A marked as default branch');
assert(branchB.isDefaultOutlet === false, 'Branch B marked as secondary branch');
assert(branchA.deliveryConfig.radiusKm === 5, 'Branch A has independent radius (5 km)');
assert(branchB.deliveryConfig.radiusKm === 12, 'Branch B has independent radius (12 km)');
assert(branchA.id !== branchB.id, 'Branch IDs are completely distinct');
assert(branchA.restaurantId === branchB.restaurantId, 'Both branches share same tenant brand');

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`  STEP 1 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
