/**
 * Abar Khabo: Stage 2 Part B — Step 2 Unit Test Suite
 * Staff Identity & Outlet Authorization Verification
 */

import {
  ROLES,
  BRAND_ADMIN_ROLES,
  canAccessOutlet,
  validateOutletSelection,
  normalizeStaffProfile
} from '../client/src/services/staffIdentityService.js';

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
console.log('  ABAR KHABO: STAGE 2 PART B — STEP 2 UNIT TESTS');
console.log('  UID Staff Identity & Outlet Authorization Verification');
console.log('================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. OUTLET ACCESS AUTHORIZATION (canAccessOutlet)
// ─────────────────────────────────────────────────────────────────────────────
console.log('[SUITE 1] Explicit Outlet Authorization Logic');

const superAdmin = {
  uid: 'super_1',
  role: ROLES.SUPER_ADMIN,
  status: 'active'
};
assert(
  canAccessOutlet(superAdmin, 'spice-haven_main') === true,
  'Super Admin has universal access to any outlet'
);
assert(
  canAccessOutlet(superAdmin, 'wok-express_branch2') === true,
  'Super Admin can access secondary tenant outlets'
);

const brandAdmin = {
  uid: 'admin_1',
  role: ROLES.RESTAURANT_ADMIN,
  restaurantId: 'spice-haven',
  allOutlets: true,
  assignedOutletIds: [],
  status: 'active'
};
assert(
  canAccessOutlet(brandAdmin, 'spice-haven_main') === true,
  'Restaurant Admin with allOutlets: true can access primary outlet'
);
assert(
  canAccessOutlet(brandAdmin, 'spice-haven_saltlake') === true,
  'Restaurant Admin with allOutlets: true can access secondary outlet'
);

const branchStaff = {
  uid: 'staff_1',
  role: ROLES.CASHIER,
  restaurantId: 'spice-haven',
  allOutlets: false,
  assignedOutletIds: ['spice-haven_main'],
  status: 'active'
};
assert(
  canAccessOutlet(branchStaff, 'spice-haven_main') === true,
  'Branch staff can access their explicitly assigned outlet'
);
assert(
  canAccessOutlet(branchStaff, 'spice-haven_saltlake') === false,
  'Branch staff CANNOT access unassigned outlet within the same restaurant'
);

const multiBranchStaff = {
  uid: 'mgr_1',
  role: ROLES.OUTLET_MANAGER,
  restaurantId: 'spice-haven',
  allOutlets: false,
  assignedOutletIds: ['spice-haven_main', 'spice-haven_newtown'],
  status: 'active'
};
assert(
  canAccessOutlet(multiBranchStaff, 'spice-haven_main') === true,
  'Outlet Manager can access assigned outlet 1'
);
assert(
  canAccessOutlet(multiBranchStaff, 'spice-haven_newtown') === true,
  'Outlet Manager can access assigned outlet 2'
);
assert(
  canAccessOutlet(multiBranchStaff, 'spice-haven_saltlake') === false,
  'Outlet Manager CANNOT access unassigned outlet 3'
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. RESTRICTIVE OUTLET DEFAULTS (NO IMPLICIT UNIVERSAL ACCESS)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 2] Strict Access Enforcement (Empty/Missing Outlets Check)');

const staffWithEmptyOutlets = {
  uid: 'staff_empty',
  role: ROLES.WAITER,
  restaurantId: 'spice-haven',
  allOutlets: false,
  assignedOutletIds: [],
  status: 'active'
};
assert(
  canAccessOutlet(staffWithEmptyOutlets, 'spice-haven_main') === false,
  'Empty assignedOutletIds with allOutlets: false strictly DENIES outlet access'
);

const staffWithMissingOutlets = {
  uid: 'staff_missing',
  role: ROLES.KITCHEN,
  restaurantId: 'spice-haven',
  status: 'active'
};
assert(
  canAccessOutlet(staffWithMissingOutlets, 'spice-haven_main') === false,
  'Missing assignedOutletIds with allOutlets undefined strictly DENIES outlet access'
);

const suspendedStaff = {
  uid: 'staff_suspended',
  role: ROLES.CASHIER,
  restaurantId: 'spice-haven',
  allOutlets: true,
  status: 'suspended'
};
assert(
  canAccessOutlet(suspendedStaff, 'spice-haven_main') === false,
  'Suspended staff member cannot access any outlet regardless of allOutlets'
);

assert(
  canAccessOutlet(null, 'spice-haven_main') === false,
  'Null user profile evaluates safely to false'
);

assert(
  canAccessOutlet(brandAdmin, null) === false,
  'Null target outlet evaluates safely to false'
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. OUTLET SELECTION VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 3] Outlet Selection Validation & Fallbacks');

const validSelection = validateOutletSelection(branchStaff, 'spice-haven_main');
assert(
  validSelection.allowed === true,
  'Authorized outlet selection passes validation'
);

const invalidSelection = validateOutletSelection(branchStaff, 'spice-haven_saltlake');
assert(
  invalidSelection.allowed === false,
  'Unauthorized outlet selection is rejected'
);
assert(
  invalidSelection.fallbackOutletId === 'spice-haven_main',
  'Provides fallback to user first authorized outlet'
);
assert(
  invalidSelection.reason.includes('not authorized'),
  'Provides informative audit reason on rejection'
);

const unauthValidation = validateOutletSelection(null, 'spice-haven_main');
assert(
  unauthValidation.allowed === false && unauthValidation.reason.includes('No active user session'),
  'Rejects selection when no user session is present'
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. PROFILE NORMALIZATION & ENTERPRISE ROLES
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 4] Staff Profile Normalization');

const rawWaiter = {
  email: '  WAITER_1@SPICEHAVEN.COM ',
  name: 'Rahul Roy',
  role: ROLES.WAITER,
  restaurantId: 'spice-haven',
  phone: '+919830012345'
};
const normWaiter = normalizeStaffProfile(rawWaiter, 'uid_waiter_1');

assert(normWaiter.uid === 'uid_waiter_1', 'Binds authenticated UID as primary key');
assert(normWaiter.email === 'waiter_1@spicehaven.com', 'Cleans, trims, and lowercases email');
assert(normWaiter.displayName === 'Rahul Roy', 'Sets standard displayName');
assert(normWaiter.allOutlets === false, 'Branch waiter defaults allOutlets to false');
assert(normWaiter.assignedOutletIds.length === 1 && normWaiter.assignedOutletIds[0] === 'spice-haven_main', 'Auto-assigns deterministic default outlet for branch staff');
assert(normWaiter.role === 'waiter', 'Preserves role');

const rawAdmin = {
  email: 'admin@spicehaven.com',
  name: 'Brand Owner',
  role: ROLES.RESTAURANT_ADMIN,
  restaurantId: 'spice-haven'
};
const normAdmin = normalizeStaffProfile(rawAdmin, 'uid_admin_1');
assert(normAdmin.allOutlets === true, 'Brand admin defaults allOutlets to true');

// ─────────────────────────────────────────────────────────────────────────────
// 5. ROLE CLASSIFICATION INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 5] Role Classification & Brand Admin Scopes');

const expectedRoles = [
  'super_admin',
  'owner',
  'restaurant_admin',
  'outlet_manager',
  'cashier',
  'kitchen',
  'waiter',
  'delivery_partner',
  'customer'
];
expectedRoles.forEach((r) => {
  assert(Object.values(ROLES).includes(r), `Role "${r}" is officially supported in ROLES definition`);
});

assert(BRAND_ADMIN_ROLES.includes('super_admin'), 'super_admin is in BRAND_ADMIN_ROLES');
assert(BRAND_ADMIN_ROLES.includes('owner'), 'owner is in BRAND_ADMIN_ROLES');
assert(BRAND_ADMIN_ROLES.includes('restaurant_admin'), 'restaurant_admin is in BRAND_ADMIN_ROLES');
assert(!BRAND_ADMIN_ROLES.includes('cashier'), 'cashier is NOT in BRAND_ADMIN_ROLES');
assert(!BRAND_ADMIN_ROLES.includes('outlet_manager'), 'outlet_manager is NOT in BRAND_ADMIN_ROLES');

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`  STEP 2 UNIT TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
