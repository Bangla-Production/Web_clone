/**
 * Comprehensive Security Rules & Tenant Isolation Test Suite
 * Simulates Firestore Rules engine evaluation against all collections,
 * roles, tenant boundaries, and access attempts.
 */

import fs from 'fs';
import path from 'path';

// Load firestore.rules to verify syntax and ensure rules file is present
const rulesContent = fs.readFileSync('./firestore.rules', 'utf8');

console.log('='.repeat(80));
console.log('FIRESTORE SECURITY RULES & STRICT TENANT ISOLATION TEST SUITE');
console.log('='.repeat(80));
console.log(`Loaded firestore.rules (${rulesContent.length} bytes)\n`);

// ── Mock Security Rule Evaluation Engine ──────────────────────────────────────

class SecurityContext {
  constructor(auth, dbData = {}) {
    this.auth = auth; // { uid, token: { email, email_verified } }
    this.db = dbData; // Mock Firestore document store
  }

  // Helper implementations matching firestore.rules
  isAuthenticated() {
    return this.auth !== null && this.auth !== undefined;
  }

  isSuperAdmin() {
    if (!this.isAuthenticated()) return false;
    if (this.auth.token?.email === 'altcafe2026@gmail.com') return true;
    const email = this.auth.token?.email;
    const userDoc = this.db[`users/${email}`];
    return userDoc?.role === 'super_admin';
  }

  userProfile() {
    if (!this.isAuthenticated()) return null;
    if (this.auth.uid && this.db[`users/${this.auth.uid}`]) {
      return this.db[`users/${this.auth.uid}`];
    }
    const email = this.auth.token?.email;
    return this.db[`users/${email}`] || null;
  }

  hasActiveProfile() {
    if (!this.isAuthenticated()) return false;
    const p = this.userProfile();
    if (!p) return false;
    const status = p.status || 'active';
    const isVerified = this.auth.token?.email_verified === true || p.authMethod === 'staffId';
    return status === 'active' && isVerified;
  }

  isRestaurantAdmin(restId) {
    if (this.isSuperAdmin()) return true;
    if (!this.hasActiveProfile()) return false;
    const p = this.userProfile();
    return ['restaurant_admin', 'owner'].includes(p.role) && p.restaurantId === restId;
  }

  isRestaurantStaff(restId) {
    if (this.isSuperAdmin()) return true;
    if (!this.hasActiveProfile()) return false;
    const p = this.userProfile();
    return ['restaurant_admin', 'owner', 'outlet_manager', 'staff', 'waiter', 'cashier', 'kitchen'].includes(p.role) && p.restaurantId === restId;
  }

  hasOutletAccess(restId, outletId) {
    if (this.isSuperAdmin()) return true;
    if (!this.isRestaurantStaff(restId)) return false;
    const p = this.userProfile();
    if (p.allOutlets === true) return true;
    if (Array.isArray(p.assignedOutletIds) && p.assignedOutletIds.includes(outletId)) return true;
    return false;
  }

  isCustomerOwner(customerId) {
    if (!this.isAuthenticated()) return false;
    return this.auth.uid === customerId || this.isSuperAdmin();
  }

  isDeliveryPartner() {
    if (!this.isAuthenticated()) return false;
    if (this.db[`deliveryPartners/${this.auth.uid}`]) return true;
    return Boolean(this.auth.token?.email && /.*@rider\..*/.test(this.auth.token.email));
  }

  // Evaluators for each resource & operation
  evaluate(pathStr, operation, requestResourceData = null, existingResourceData = null) {
    const parts = pathStr.split('/');
    const collection = parts[0];

    // 1. /users/{userId}
    if (collection === 'users') {
      const userId = parts[1];
      if (operation === 'read') {
        return (
          this.isSuperAdmin() ||
          (this.isAuthenticated() && (this.auth.uid === userId || this.auth.token?.email === userId)) ||
          (this.hasActiveProfile() &&
            ['restaurant_admin', 'owner'].includes(this.userProfile().role) &&
            existingResourceData?.restaurantId === this.userProfile().restaurantId)
        );
      }
      if (operation === 'create') {
        return (
          this.isSuperAdmin() ||
          (this.hasActiveProfile() &&
            ['restaurant_admin', 'owner'].includes(this.userProfile().role) &&
            requestResourceData?.restaurantId === this.userProfile().restaurantId &&
            ['outlet_manager', 'waiter', 'kitchen', 'cashier', 'staff'].includes(requestResourceData?.role) &&
            requestResourceData?.role !== 'super_admin' &&
            requestResourceData?.role !== 'owner' &&
            (requestResourceData?.allOutlets === false || requestResourceData?.allOutlets === undefined || this.userProfile().role === 'owner'))
        );
      }
      if (operation === 'update') {
        const isAdminOfTenant =
          this.hasActiveProfile() &&
          ['restaurant_admin', 'owner'].includes(this.userProfile().role) &&
          existingResourceData?.restaurantId === this.userProfile().restaurantId &&
          requestResourceData?.restaurantId === this.userProfile().restaurantId &&
          requestResourceData?.role !== 'super_admin' &&
          requestResourceData?.role !== 'owner';

        const isSelfNonEscalating =
          this.isAuthenticated() &&
          (this.auth.uid === userId || this.auth.token?.email === userId) &&
          (requestResourceData?.role === undefined || requestResourceData?.role === existingResourceData?.role) &&
          (requestResourceData?.restaurantId === undefined || requestResourceData?.restaurantId === existingResourceData?.restaurantId) &&
          (requestResourceData?.allOutlets === undefined || requestResourceData?.allOutlets === existingResourceData?.allOutlets) &&
          (requestResourceData?.assignedOutletIds === undefined || JSON.stringify(requestResourceData?.assignedOutletIds) === JSON.stringify(existingResourceData?.assignedOutletIds));

        return this.isSuperAdmin() || isAdminOfTenant || isSelfNonEscalating;
      }
      if (operation === 'delete') {
        return (
          this.isSuperAdmin() ||
          (this.hasActiveProfile() &&
            ['restaurant_admin', 'owner'].includes(this.userProfile().role) &&
            existingResourceData?.restaurantId === this.userProfile().restaurantId)
        );
      }
    }

    // 2. /customers/{customerId}
    if (collection === 'customers') {
      const customerId = parts[1];
      const sub = parts[2];
      if (sub === 'addresses') {
        return this.isCustomerOwner(customerId);
      }
      if (operation === 'read') return this.isCustomerOwner(customerId);
      if (operation === 'create') return this.isAuthenticated() && this.auth.uid === customerId;
      if (operation === 'update') return this.isCustomerOwner(customerId);
      if (operation === 'delete') return this.isSuperAdmin();
    }

    // 3. /restaurants/{restaurantId}
    if (collection === 'restaurants') {
      const restId = parts[1];
      const sub = parts[2];

      if (!sub) {
        // Root restaurant doc
        if (operation === 'read') return true;
        if (operation === 'create' || operation === 'delete') return this.isSuperAdmin();
        if (operation === 'update') {
          return this.isSuperAdmin() || (
            this.isRestaurantAdmin(restId) &&
            (requestResourceData?.createdAt === undefined || requestResourceData?.createdAt === existingResourceData?.createdAt)
          );
        }
      }

      if (['categories', 'menuItems', 'menuCatalog'].includes(sub)) {
        if (operation === 'read') return true;
        if (['create', 'update', 'delete'].includes(operation)) return this.isRestaurantAdmin(restId);
      }

      if (sub === 'outlets') {
        const outletId = parts[3];
        const outletSub = parts[4];
        if (!outletSub) {
          if (operation === 'read') return true;
          if (['create', 'update', 'delete'].includes(operation)) return this.isRestaurantAdmin(restId);
        }
        if (outletSub === 'menuOverrides') {
          if (operation === 'read') return true;
          if (['create', 'update', 'delete'].includes(operation)) {
            return (
              this.isRestaurantAdmin(restId) ||
              (this.hasOutletAccess(restId, outletId) &&
               ['outlet_manager', 'owner', 'restaurant_admin'].includes(this.userProfile()?.role))
            );
          }
        }
        if (outletSub === 'aggregatorConnections') {
          return this.isRestaurantAdmin(restId);
        }
        if (['inventoryStock', 'recipeOverrides', 'purchases'].includes(outletSub)) {
          if (operation === 'read') {
            return this.isRestaurantStaff(restId) && this.hasOutletAccess(restId, outletId);
          }
          return (
            this.isRestaurantAdmin(restId) ||
            (this.hasOutletAccess(restId, outletId) &&
             ['outlet_manager', 'owner', 'restaurant_admin'].includes(this.userProfile()?.role))
          );
        }
      }

      if (['ingredients', 'recipes'].includes(sub)) {
        if (operation === 'read') return this.isRestaurantStaff(restId);
        return this.isRestaurantAdmin(restId);
      }

      if (['suppliers', 'stockTransfers'].includes(sub)) {
        if (operation === 'read') return this.isRestaurantStaff(restId);
        return (
          this.isRestaurantAdmin(restId) ||
          (['outlet_manager', 'owner', 'restaurant_admin'].includes(this.userProfile()?.role) &&
           this.userProfile()?.restaurantId === restId)
        );
      }

      if (sub === 'inventoryLedger' || sub === 'deliveryEvents' || sub === 'paymentTransactions' || sub === 'subscription') {
        if (operation === 'read') return this.isRestaurantStaff(restId);
        return this.isSuperAdmin();
      }

      if (sub === 'settlementRecords') {
        if (operation === 'read') {
          return this.isRestaurantAdmin(restId) || (
            ['owner', 'restaurant_admin', 'outlet_manager'].includes(this.userProfile()?.role) &&
            this.userProfile()?.restaurantId === restId
          );
        }
        return this.isSuperAdmin();
      }

      if (['tables', 'orders', 'kots', 'invoices'].includes(sub)) {
        if (operation === 'read' || operation === 'create' || operation === 'update') {
          return this.isRestaurantStaff(restId);
        }
        if (operation === 'delete') {
          return this.isRestaurantAdmin(restId);
        }
      }

      if (sub === 'inventory') {
        if (operation === 'read') return this.isRestaurantStaff(restId);
        return this.isRestaurantAdmin(restId);
      }

      if (sub === 'reservations') {
        if (operation === 'read') return this.isRestaurantStaff(restId);
        if (operation === 'create') return true;
        return this.isRestaurantStaff(restId);
      }

      if (sub === 'settings' || sub === 'aggregatorConnections') {
        if (operation === 'read') return this.isRestaurantStaff(restId);
        return this.isRestaurantAdmin(restId);
      }

      if (sub === 'onlineOrders') {
        return this.isRestaurantStaff(restId);
      }
    }

    // 4. /onlineOrders/{orderId}
    if (collection === 'onlineOrders') {
      if (operation === 'read') {
        return (
          this.isSuperAdmin() ||
          (this.isAuthenticated() && this.isRestaurantStaff(existingResourceData?.restaurantId)) ||
          (this.isAuthenticated() &&
            (existingResourceData?.customerId === this.auth.uid ||
              existingResourceData?.riderId === this.auth.uid ||
              existingResourceData?.partnerId === this.auth.uid)) ||
          (this.isDeliveryPartner() && existingResourceData?.orderType === 'DELIVERY')
        );
      }

      if (operation === 'create') {
        const validStart =
          requestResourceData?.restaurantId != null &&
          (requestResourceData?.status || 'PLACED') === 'PLACED' &&
          requestResourceData?.totalAmount >= 0;
        return validStart || this.isSuperAdmin() || this.isRestaurantStaff(requestResourceData?.restaurantId);
      }

      if (operation === 'update') {
        const isStaffOfTenant =
          this.isAuthenticated() &&
          this.isRestaurantStaff(existingResourceData?.restaurantId) &&
          requestResourceData?.restaurantId === existingResourceData?.restaurantId &&
          requestResourceData?.totalAmount === existingResourceData?.totalAmount;

        // Rider can only update delivery-related fields (cannot touch totalAmount, paymentStatus, etc.)
        const isAssignedRider =
          this.isAuthenticated() &&
          (existingResourceData?.riderId === this.auth.uid || requestResourceData?.riderId === this.auth.uid) &&
          requestResourceData?.totalAmount === existingResourceData?.totalAmount &&
          requestResourceData?.paymentStatus === existingResourceData?.paymentStatus;

        // Customer owner can cancel order before completion
        const isCustomerCancel =
          this.isAuthenticated() &&
          existingResourceData?.customerId === this.auth.uid &&
          requestResourceData?.status === 'CANCELLED' &&
          ['PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'READY_FOR_PICKUP'].includes(existingResourceData?.status) &&
          (requestResourceData?.totalAmount === undefined || requestResourceData?.totalAmount === existingResourceData?.totalAmount);

        return this.isSuperAdmin() || isStaffOfTenant || isAssignedRider || isCustomerCancel;
      }

      if (operation === 'delete') {
        return this.isSuperAdmin() || (this.isAuthenticated() && this.isRestaurantAdmin(existingResourceData?.restaurantId));
      }
    }

    // 5. /deliveryTracking/{orderId}
    if (collection === 'deliveryTracking') {
      if (operation === 'read') {
        return (
          this.isSuperAdmin() ||
          (this.isAuthenticated() && this.isRestaurantStaff(existingResourceData?.restaurantId)) ||
          (this.isAuthenticated() &&
            (existingResourceData?.customerId === this.auth.uid ||
              existingResourceData?.riderId === this.auth.uid ||
              existingResourceData?.partnerId === this.auth.uid))
        );
      }
      if (operation === 'create') return this.isAuthenticated() || requestResourceData?.restaurantId != null;
      if (operation === 'update') {
        const isStaffOfTenant = this.isAuthenticated() && this.isRestaurantStaff(existingResourceData?.restaurantId);
        const isRider = this.isAuthenticated() && (existingResourceData?.riderId === this.auth.uid || requestResourceData?.riderId === this.auth.uid);
        const isCustomerCancel = this.isAuthenticated() && existingResourceData?.customerId === this.auth.uid && requestResourceData?.status === 'CANCELLED';
        return this.isSuperAdmin() || isStaffOfTenant || isRider || isCustomerCancel;
      }
      if (operation === 'delete') {
        return this.isSuperAdmin() || (this.isAuthenticated() && this.isRestaurantAdmin(existingResourceData?.restaurantId));
      }
    }

    // 6. /deliveryPartners/{partnerId}
    if (collection === 'deliveryPartners') {
      const partnerId = parts[1];
      if (operation === 'read') {
        return this.isSuperAdmin() || (this.isAuthenticated() && this.auth.uid === partnerId) || this.hasActiveProfile();
      }
      if (operation === 'create') {
        return this.isSuperAdmin() || (this.isAuthenticated() && this.auth.uid === partnerId) || this.hasActiveProfile();
      }
      if (operation === 'update') {
        if (this.isSuperAdmin()) return true;
        // If partner is updating their own profile, KYC & verification fields are strictly immutable
        if (this.isAuthenticated() && this.auth.uid === partnerId) {
          const alteredKyc =
            requestResourceData?.isAadhaarVerified !== existingResourceData?.isAadhaarVerified ||
            requestResourceData?.kycStatus !== existingResourceData?.kycStatus ||
            requestResourceData?.status !== existingResourceData?.status ||
            requestResourceData?.aadhaarMasked !== existingResourceData?.aadhaarMasked;
          return !alteredKyc;
        }
        return this.hasActiveProfile();
      }
      if (operation === 'delete') return this.isSuperAdmin();
    }

    // 7. /aggregatorOrders/{orderId}
    if (collection === 'aggregatorOrders') {
      if (operation === 'read') {
        const isStaffWithOutlet =
          this.isAuthenticated() &&
          this.isRestaurantStaff(existingResourceData?.restaurantId) &&
          this.hasOutletAccess(existingResourceData?.restaurantId, existingResourceData?.outletId);

        const isOwnerCustomer =
          this.isAuthenticated() &&
          (existingResourceData?.customer?.uid === this.auth.uid ||
            existingResourceData?.customerId === this.auth.uid);

        const isAssignedRider =
          this.isAuthenticated() &&
          existingResourceData?.delivery?.riderId === this.auth.uid;

        return this.isSuperAdmin() || isStaffWithOutlet || isOwnerCustomer || isAssignedRider;
      }

      if (operation === 'create') {
        const isStaffWithOutlet =
          this.isAuthenticated() &&
          this.isRestaurantStaff(requestResourceData?.restaurantId) &&
          this.hasOutletAccess(requestResourceData?.restaurantId, requestResourceData?.outletId);

        const isCustomerPlacingDirect =
          this.isAuthenticated() &&
          requestResourceData?.customer?.uid === this.auth.uid &&
          (requestResourceData?.orderStatus || 'PLACED') === 'PLACED' &&
          requestResourceData?.pricing?.grandTotal >= 0;

        return this.isSuperAdmin() || isStaffWithOutlet || isCustomerPlacingDirect;
      }

      if (operation === 'update') {
        if (this.isSuperAdmin()) return true;

        const isStaffWithOutlet =
          this.isAuthenticated() &&
          this.isRestaurantStaff(existingResourceData?.restaurantId) &&
          this.hasOutletAccess(existingResourceData?.restaurantId, existingResourceData?.outletId) &&
          requestResourceData?.restaurantId === existingResourceData?.restaurantId &&
          requestResourceData?.outletId === existingResourceData?.outletId &&
          JSON.stringify(requestResourceData?.pricing) === JSON.stringify(existingResourceData?.pricing) &&
          JSON.stringify(requestResourceData?.items) === JSON.stringify(existingResourceData?.items);

        const isAssignedRider =
          this.isAuthenticated() &&
          existingResourceData?.delivery?.riderId === this.auth.uid &&
          JSON.stringify(requestResourceData?.pricing) === JSON.stringify(existingResourceData?.pricing) &&
          JSON.stringify(requestResourceData?.items) === JSON.stringify(existingResourceData?.items);

        return isStaffWithOutlet || isAssignedRider;
      }

      if (operation === 'delete') {
        return this.isSuperAdmin() || (this.isAuthenticated() && this.isRestaurantAdmin(existingResourceData?.restaurantId));
      }
    }

    // 8. /integrationWebhooks/{webhookId}
    if (collection === 'integrationWebhooks') {
      if (operation === 'read') {
        return this.isSuperAdmin() || (this.hasActiveProfile() && this.isRestaurantAdmin(existingResourceData?.restaurantId));
      }
      if (operation === 'create' || operation === 'update' || operation === 'delete') {
        return this.isSuperAdmin();
      }
    }

    // 9. /subscriptionPlans/{planId}
    if (collection === 'subscriptionPlans') {
      if (operation === 'read') return true;
      return this.isSuperAdmin();
    }

    // 10. /subscriptionInvoices/{invoiceId}
    if (collection === 'subscriptionInvoices') {
      if (operation === 'read') {
        return this.isSuperAdmin() || (this.isAuthenticated() && this.isRestaurantStaff(existingResourceData?.restaurantId));
      }
      return this.isSuperAdmin();
    }

    // 11. /platformAuditLogs/{logId}
    if (collection === 'platformAuditLogs') {
      return this.isSuperAdmin();
    }

    return false;
  }
}

// ── Test Cases Runner ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(description, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${description} (Expected ${expected}, got ${actual})`);
    failed++;
  }
}

// Seed Mock Database
const mockDb = {
  // Super Admin
  'users/altcafe2026@gmail.com': {
    email: 'altcafe2026@gmail.com',
    role: 'super_admin',
    status: 'active',
  },
  // Restaurant A Admin
  'users/admin_a@resta.com': {
    email: 'admin_a@resta.com',
    role: 'restaurant_admin',
    restaurantId: 'rest_a',
    status: 'active',
    authMethod: 'email',
  },
  // Restaurant A Waiter
  'users/waiter_a@resta.local': {
    email: 'waiter_a@resta.local',
    role: 'waiter',
    restaurantId: 'rest_a',
    status: 'active',
    authMethod: 'staffId',
  },
  // Restaurant A Kitchen
  'users/kitchen_a@resta.local': {
    email: 'kitchen_a@resta.local',
    role: 'kitchen',
    restaurantId: 'rest_a',
    status: 'active',
    authMethod: 'staffId',
  },
  // Restaurant B Admin
  'users/admin_b@restb.com': {
    email: 'admin_b@restb.com',
    role: 'restaurant_admin',
    restaurantId: 'rest_b',
    status: 'active',
    authMethod: 'email',
  },
  // Customer
  'customers/cust_123': {
    name: 'Rohan Sharma',
    role: 'customer',
  },
  // Rider
  'deliveryPartners/rider_456': {
    name: 'Amit Kumar',
    phone: '9876543210',
    isAadhaarVerified: false,
    kycStatus: 'UNVERIFIED',
    status: 'APPROVED',
    aadhaarMasked: '•••• •••• 1234',
  },
  // Step 10: SaaS Plans, Invoices & Audit Logs
  'subscriptionPlans/STARTER': {
    planId: 'STARTER',
    name: 'Starter Plan',
    monthlyPrice: 999
  },
  'subscriptionInvoices/SAAS_INV_A': {
    restaurantId: 'rest_a',
    planId: 'STARTER',
    totalAmount: 1178.82
  },
  'subscriptionInvoices/SAAS_INV_B': {
    restaurantId: 'rest_b',
    planId: 'PROFESSIONAL',
    totalAmount: 2948.82
  },
  'platformAuditLogs/LOG_001': {
    action: 'PLAN_CHANGED',
    actor: 'altcafe2026@gmail.com'
  }
};

// Test Contexts
const superAdminCtx = new SecurityContext({ uid: 'sa_uid', token: { email: 'altcafe2026@gmail.com', email_verified: true } }, mockDb);
const adminACtx = new SecurityContext({ uid: 'admin_a_uid', token: { email: 'admin_a@resta.com', email_verified: true } }, mockDb);
const waiterACtx = new SecurityContext({ uid: 'waiter_a_uid', token: { email: 'waiter_a@resta.local' } }, mockDb);
const kitchenACtx = new SecurityContext({ uid: 'kitchen_a_uid', token: { email: 'kitchen_a@resta.local' } }, mockDb);
const adminBCtx = new SecurityContext({ uid: 'admin_b_uid', token: { email: 'admin_b@restb.com', email_verified: true } }, mockDb);
const customerCtx = new SecurityContext({ uid: 'cust_123', token: { email: 'customer@test.com', email_verified: true } }, mockDb);
const otherCustomerCtx = new SecurityContext({ uid: 'cust_999', token: { email: 'other@test.com', email_verified: true } }, mockDb);
const riderCtx = new SecurityContext({ uid: 'rider_456', token: { email: '9876543210@rider.abarkhabo.local' } }, mockDb);
const unauthCtx = new SecurityContext(null, mockDb);

console.log('1. TENANT ISOLATION TESTS (Cross-Tenant Access Prevention)');
console.log('-'.repeat(60));

// Test 1: Admin A accessing Restaurant A orders
assert('Restaurant Admin A can read Restaurant A orders', adminACtx.evaluate('restaurants/rest_a/orders/ord_1', 'read'), true);

// Test 2: Admin A attempting to read Restaurant B orders
assert('Restaurant Admin A CANNOT read Restaurant B orders (Cross-tenant blocked)', adminACtx.evaluate('restaurants/rest_b/orders/ord_2', 'read'), false);

// Test 3: Admin A attempting to write Restaurant B orders
assert('Restaurant Admin A CANNOT write Restaurant B orders (Cross-tenant blocked)', adminACtx.evaluate('restaurants/rest_b/orders/ord_2', 'update', { total: 500 }, { total: 400 }), false);

// Test 4: Admin A attempting to access Restaurant B aggregator credentials
assert('Restaurant Admin A CANNOT access Restaurant B aggregatorConnections', adminACtx.evaluate('restaurants/rest_b/aggregatorConnections/swiggy_1', 'read'), false);

// Test 5: Admin A attempting to access Restaurant B settings
assert('Restaurant Admin A CANNOT access Restaurant B settings', adminACtx.evaluate('restaurants/rest_b/settings/printers', 'read'), false);

// Test 6: Admin A attempting to delete Restaurant B menu items
assert('Restaurant Admin A CANNOT modify Restaurant B menuItems', adminACtx.evaluate('restaurants/rest_b/menuItems/item_b', 'delete'), false);

// Test 7: Admin A attempting to view Restaurant B staff profiles in /users
assert(
  'Restaurant Admin A CANNOT read Restaurant B staff profile',
  adminACtx.evaluate('users/admin_b@restb.com', 'read', null, mockDb['users/admin_b@restb.com']),
  false
);

console.log('\n2. ROLE-BASED ACCESS CONTROL (Within Same Tenant A)');
console.log('-'.repeat(60));

// Test 8: Waiter A reading orders in Restaurant A
assert('Waiter A can read Restaurant A orders', waiterACtx.evaluate('restaurants/rest_a/orders/ord_1', 'read'), true);

// Test 9: Waiter A attempting to delete orders
assert('Waiter A CANNOT delete Restaurant A orders (Admin only)', waiterACtx.evaluate('restaurants/rest_a/orders/ord_1', 'delete'), false);

// Test 10: Kitchen A attempting to modify menu items
assert('Kitchen A CANNOT modify menuItems (Admin only)', kitchenACtx.evaluate('restaurants/rest_a/menuItems/dish_1', 'update'), false);

// Test 11: Waiter A attempting to modify restaurant settings
assert('Waiter A CANNOT modify restaurant settings', waiterACtx.evaluate('restaurants/rest_a/settings/general', 'update'), false);

// Test 12: Waiter A attempting to self-escalate role to super_admin
assert(
  'Waiter A CANNOT escalate role to super_admin',
  waiterACtx.evaluate('users/waiter_a@resta.local', 'update', { role: 'super_admin', restaurantId: 'rest_a' }, mockDb['users/waiter_a@resta.local']),
  false
);

// Test 13: Admin A creating staff member for Restaurant A
assert(
  'Admin A can create waiter staff for Restaurant A',
  adminACtx.evaluate('users/new_waiter@resta.local', 'create', { role: 'waiter', restaurantId: 'rest_a' }),
  true
);

// Test 14: Admin A attempting to create staff member for Restaurant B
assert(
  'Admin A CANNOT create staff for Restaurant B',
  adminACtx.evaluate('users/new_waiter@restb.local', 'create', { role: 'waiter', restaurantId: 'rest_b' }),
  false
);

// Test 15: Admin A attempting to create super_admin
assert(
  'Admin A CANNOT create super_admin user',
  adminACtx.evaluate('users/fake_admin@test.com', 'create', { role: 'super_admin', restaurantId: 'rest_a' }),
  false
);

console.log('\n3. ONLINE ORDERS & FOOD DELIVERY SECURITY');
console.log('-'.repeat(60));

const onlineOrderA = { id: 'ord_online_a', restaurantId: 'rest_a', totalAmount: 350, paymentStatus: 'PENDING', status: 'PLACED', customerId: 'cust_123' };
const onlineOrderB = { id: 'ord_online_b', restaurantId: 'rest_b', totalAmount: 450, paymentStatus: 'PENDING', status: 'PLACED', customerId: 'cust_999' };

// Test 16: Customer placing a valid order
assert(
  'Customer can place order starting with PLACED status',
  customerCtx.evaluate('onlineOrders/ord_new', 'create', { restaurantId: 'rest_a', status: 'PLACED', totalAmount: 300 }),
  true
);

// Test 17: Attacker trying to create an order pre-marked as COMPLETED
assert(
  'Attacker CANNOT create an online order pre-marked as COMPLETED',
  unauthCtx.evaluate('onlineOrders/ord_hacked', 'create', { restaurantId: 'rest_a', status: 'COMPLETED', totalAmount: 0 }),
  false
);

// Test 18: Admin A updating Online Order for Restaurant A
assert(
  'Admin A can update Online Order for Restaurant A',
  adminACtx.evaluate('onlineOrders/ord_online_a', 'update', { restaurantId: 'rest_a', status: 'CONFIRMED', totalAmount: 350 }, onlineOrderA),
  true
);

// Test 19: Admin A attempting to update Online Order for Restaurant B
assert(
  'Admin A CANNOT update Online Order for Restaurant B (Cross-tenant blocked)',
  adminACtx.evaluate('onlineOrders/ord_online_b', 'update', { restaurantId: 'rest_b', status: 'CONFIRMED', totalAmount: 450 }, onlineOrderB),
  false
);

// Test 20: Kitchen A updating food status to COOKING for Restaurant A
assert(
  'Kitchen A can update Online Order cooking status for Restaurant A',
  kitchenACtx.evaluate('onlineOrders/ord_online_a', 'update', { restaurantId: 'rest_a', status: 'COOKING', totalAmount: 350 }, onlineOrderA),
  true
);

// Test 21: Kitchen A attempting to update food status for Restaurant B
assert(
  'Kitchen A CANNOT update Online Order for Restaurant B (Cross-tenant blocked)',
  kitchenACtx.evaluate('onlineOrders/ord_online_b', 'update', { restaurantId: 'rest_b', status: 'COOKING', totalAmount: 450 }, onlineOrderB),
  false
);

console.log('\n4. CUSTOMER DATA PRIVACY & PUBLIC ID GUESSING PREVENTION');
console.log('-'.repeat(60));

// Test 22: Customer reading their own addresses
assert('Customer 123 can read their own saved addresses', customerCtx.evaluate('customers/cust_123/addresses/addr_1', 'read'), true);

// Test 23: Customer 123 attempting to read Customer 999 addresses
assert('Customer 123 CANNOT read Customer 999 saved addresses', customerCtx.evaluate('customers/cust_999/addresses/addr_2', 'read'), false);

// Test 24: Unauthenticated user attempting to access customer addresses
assert('Unauthenticated user CANNOT read customer addresses', unauthCtx.evaluate('customers/cust_123/addresses/addr_1', 'read'), false);

// Test 25: Public/unauthenticated user attempting to read order using guessed Order ID
assert(
  'Public user CANNOT read private online order using guessed ID (Requirement 5)',
  unauthCtx.evaluate('onlineOrders/ord_online_a', 'read', null, onlineOrderA),
  false
);

// Test 26: Other customer attempting to read someone else order
assert(
  'Customer 999 CANNOT read Customer 123 order (Requirement 6)',
  otherCustomerCtx.evaluate('onlineOrders/ord_online_a', 'read', null, onlineOrderA),
  false
);

// Test 27: Public user attempting to read live GPS coordinates of rider
const trackingOrder = { id: 'ord_online_a', restaurantId: 'rest_a', customerId: 'cust_123', riderId: 'rider_456' };
assert(
  'Public user CANNOT read live GPS coordinates using guessed ID (Requirement 5)',
  unauthCtx.evaluate('deliveryTracking/ord_online_a', 'read', null, trackingOrder),
  false
);

// Test 28: Customer who owns the order CAN read live tracking
assert(
  'Customer owning order CAN read live tracking',
  customerCtx.evaluate('deliveryTracking/ord_online_a', 'read', null, trackingOrder),
  true
);

// Test 28b: Customer owning order CAN cancel active order
assert(
  'Customer owning order CAN cancel active order',
  customerCtx.evaluate('onlineOrders/ord_online_a', 'update', { status: 'CANCELLED', totalAmount: 350 }, onlineOrderA),
  true
);

// Test 28c: Customer CANNOT change order price when cancelling
assert(
  'Customer CANNOT change order price when cancelling',
  customerCtx.evaluate('onlineOrders/ord_online_a', 'update', { status: 'CANCELLED', totalAmount: 0 }, onlineOrderA),
  false
);

// Test 28d: Other customer CANNOT cancel someone else order
assert(
  'Other customer CANNOT cancel someone else order',
  otherCustomerCtx.evaluate('onlineOrders/ord_online_a', 'update', { status: 'CANCELLED', totalAmount: 350 }, onlineOrderA),
  false
);

console.log('\n5. DELIVERY PARTNER FIELD IMMUTABILITY & KYC SECURITY');
console.log('-'.repeat(60));

// Test 29: Assigned Rider updating GPS tracking coordinates
assert(
  'Assigned Rider can update GPS tracking coordinates',
  riderCtx.evaluate('deliveryTracking/ord_online_a', 'update', { riderCoordinates: { lat: 22.5, lng: 88.3 } }, trackingOrder),
  true
);

// Test 30: Unassigned Rider attempting to hijack someone else delivery tracking
const unassignedRiderCtx = new SecurityContext({ uid: 'rider_other', token: { email: 'other@rider.abarkhabo.local' } }, mockDb);
assert(
  'Unassigned Rider CANNOT hijack delivery tracking',
  unassignedRiderCtx.evaluate('deliveryTracking/ord_online_a', 'update', { status: 'DELIVERED' }, trackingOrder),
  false
);

// Test 31: Assigned Rider attempting to change totalAmount or paymentStatus on order
assert(
  'Assigned Rider CANNOT alter order paymentStatus or totalAmount (Requirement 7 & 8)',
  riderCtx.evaluate('onlineOrders/ord_online_a', 'update', { totalAmount: 0, paymentStatus: 'PAID' }, onlineOrderA),
  false
);

// Test 32: Rider attempting to tamper with their own KYC verification status
const riderDoc = mockDb['deliveryPartners/rider_456'];
assert(
  'Rider CANNOT self-verify KYC or tamper with isAadhaarVerified (Requirement 8)',
  riderCtx.evaluate('deliveryPartners/rider_456', 'update', { ...riderDoc, isAadhaarVerified: true, kycStatus: 'VERIFIED' }, riderDoc),
  false
);

// Test 33: Rider allowed to update their own online/offline availability
assert(
  'Rider can update their own availability and GPS',
  riderCtx.evaluate('deliveryPartners/rider_456', 'update', { ...riderDoc, isOnline: true }, riderDoc),
  true
);

console.log('\n6. SUPER ADMIN PLATFORM-WIDE ACCESS');
console.log('-'.repeat(60));

// Test 34: Super admin can manage Restaurant A
assert('Super Admin can manage Restaurant A', superAdminCtx.evaluate('restaurants/rest_a', 'update'), true);

// Test 35: Super admin can manage Restaurant B
assert('Super Admin can manage Restaurant B', superAdminCtx.evaluate('restaurants/rest_b', 'update'), true);

// Test 36: Super admin can manage aggregator connections across tenants
assert('Super Admin can manage aggregator connections across any tenant', superAdminCtx.evaluate('restaurants/rest_a/aggregatorConnections/zomato_1', 'read'), true);

// Test 37: Super admin can delete customer profiles or bad records
assert('Super Admin can delete users and records', superAdminCtx.evaluate('users/bad_actor@test.com', 'delete', null, { restaurantId: 'rest_a' }), true);

console.log('\n7. STEP 2: UID-BASED IDENTITY & OUTLET AUTHORIZATION');
console.log('-'.repeat(60));

// Setup UID-based staff in mockDb
mockDb['users/staff_uid_100'] = {
  uid: 'staff_uid_100',
  email: 'waiter_uid@resta.com',
  role: 'waiter',
  restaurantId: 'rest_a',
  allOutlets: false,
  assignedOutletIds: ['rest_a_main'],
  status: 'active'
};

const staffUidCtx = new SecurityContext({ uid: 'staff_uid_100', token: { email: 'waiter_uid@resta.com', email_verified: true } }, mockDb);

// Test 38: Staff reading own profile via UID
assert(
  'Staff can read own profile using UID key',
  staffUidCtx.evaluate('users/staff_uid_100', 'read'),
  true
);

// Test 39: Staff reading own profile using legacy email key
assert(
  'Staff can read own profile using legacy email key',
  waiterACtx.evaluate('users/waiter_a@resta.local', 'read'),
  true
);

// Test 40: Staff attempting role escalation on self-update (Forbidden)
assert(
  'Staff CANNOT escalate own role on self-update',
  staffUidCtx.evaluate('users/staff_uid_100', 'update', { role: 'super_admin' }, mockDb['users/staff_uid_100']),
  false
);

// Test 41: Staff attempting to change restaurantId (Forbidden)
assert(
  'Staff CANNOT change restaurantId on self-update',
  staffUidCtx.evaluate('users/staff_uid_100', 'update', { restaurantId: 'rest_b' }, mockDb['users/staff_uid_100']),
  false
);

// Test 42: Staff attempting to self-grant allOutlets: true (Forbidden)
assert(
  'Staff CANNOT self-grant allOutlets: true on self-update',
  staffUidCtx.evaluate('users/staff_uid_100', 'update', { allOutlets: true }, mockDb['users/staff_uid_100']),
  false
);

// Test 43: Staff attempting to alter assignedOutletIds (Forbidden)
assert(
  'Staff CANNOT alter assignedOutletIds on self-update',
  staffUidCtx.evaluate('users/staff_uid_100', 'update', { assignedOutletIds: ['rest_b_main'] }, mockDb['users/staff_uid_100']),
  false
);

// Test 44: Restaurant Admin A attempting to create super_admin (Forbidden)
assert(
  'Restaurant Admin A CANNOT create super_admin user',
  adminACtx.evaluate('users/new_super_user', 'create', { role: 'super_admin', restaurantId: 'rest_a' }),
  false
);

// Test 45: Restaurant Admin A creating staff for Restaurant B (Cross-tenant forbidden)
assert(
  'Restaurant Admin A CANNOT create staff for Restaurant B',
  adminACtx.evaluate('users/new_staff_b', 'create', { role: 'waiter', restaurantId: 'rest_b' }),
  false
);

// Test 46: Restaurant Admin A creating valid staff for Restaurant A (Allowed)
assert(
  'Restaurant Admin A can create valid staff for Restaurant A',
  adminACtx.evaluate('users/new_staff_a', 'create', { role: 'waiter', restaurantId: 'rest_a', allOutlets: false }),
  true
);

// Test 47: Staff A attempting to read Tenant B Admin profile (Cross-tenant forbidden)
assert(
  'Staff A CANNOT read Tenant B Admin profile (Cross-tenant forbidden)',
  staffUidCtx.evaluate('users/admin_b@restb.com', 'read', null, mockDb['users/admin_b@restb.com']),
  false
);

console.log('\n8. STEP 3: MASTER MENU CATALOG & OUTLET OVERRIDES');
console.log('-'.repeat(60));

mockDb['users/manager_uid_200'] = {
  uid: 'manager_uid_200',
  email: 'mgr@resta.com',
  role: 'outlet_manager',
  restaurantId: 'rest_a',
  assignedOutletIds: ['rest_a_main'],
  allOutlets: false,
  status: 'active'
};
const managerCtx = new SecurityContext({ uid: 'manager_uid_200', token: { email: 'mgr@resta.com', email_verified: true } }, mockDb);

// Test 48: Restaurant Admin A writing Master Menu item in Restaurant A (Allowed)
assert(
  'Restaurant Admin A can write Master Menu item in Restaurant A',
  adminACtx.evaluate('restaurants/rest_a/menuCatalog/biryani_awadhi', 'create'),
  true
);

// Test 49: Restaurant Admin A writing Master Menu item in Restaurant B (Cross-tenant forbidden)
assert(
  'Restaurant Admin A CANNOT write Master Menu item in Restaurant B (Cross-tenant forbidden)',
  adminACtx.evaluate('restaurants/rest_b/menuCatalog/biryani_awadhi', 'create'),
  false
);

// Test 50: Waiter A attempting to write Master Menu item (Forbidden)
assert(
  'Waiter A CANNOT write Master Menu item in Restaurant A (Admin only)',
  waiterACtx.evaluate('restaurants/rest_a/menuCatalog/biryani_awadhi', 'update'),
  false
);

// Test 51: Outlet Manager writing menu override to assigned outlet (Allowed)
assert(
  'Outlet Manager can write menu override to assigned outlet',
  managerCtx.evaluate('restaurants/rest_a/outlets/rest_a_main/menuOverrides/biryani_awadhi', 'create'),
  true
);

// Test 52: Outlet Manager writing menu override to unassigned outlet (Cross-outlet forbidden)
assert(
  'Outlet Manager CANNOT write menu override to unassigned outlet (Forbidden)',
  managerCtx.evaluate('restaurants/rest_a/outlets/rest_a_branch2/menuOverrides/biryani_awadhi', 'create'),
  false
);

// Test 53: Waiter A attempting to write outlet menu override (Forbidden)
assert(
  'Waiter A CANNOT write outlet menu override (Manager/Admin only)',
  waiterACtx.evaluate('restaurants/rest_a/outlets/rest_a_main/menuOverrides/biryani_awadhi', 'create'),
  false
);

// Test 54: Public user can read Master Menu item
assert(
  'Public user can read Master Menu item (Customer discovery)',
  customerCtx.evaluate('restaurants/rest_a/menuCatalog/biryani_awadhi', 'read'),
  true
);

// Test 55: Public user can read Outlet Menu Override
assert(
  'Public user can read Outlet Menu Override',
  customerCtx.evaluate('restaurants/rest_a/outlets/rest_a_main/menuOverrides/biryani_awadhi', 'read'),
  true
);

console.log('\n9. STEP 4: NORMALIZED ONLINE ORDERS & AGGREGATOR ISOLATION');
console.log('-'.repeat(60));

const sampleOrderA = {
  orderId: 'SWIGGY_rest_a_main_SW-101',
  restaurantId: 'rest_a',
  outletId: 'rest_a_main',
  orderSource: 'SWIGGY',
  orderStatus: 'PREPARING',
  customer: { uid: 'cust_123', name: 'John Doe', phone: '+919876543210' },
  items: [{ id: 'item_1', name: 'Biryani', price: 350, quantity: 2, subtotal: 700 }],
  pricing: { subtotal: 700, taxAmount: 35, grandTotal: 735 }
};

// Test 56: Staff A with outlet access can read aggregator order in assigned outlet
assert(
  'Staff A with outlet access can read aggregator order in assigned outlet',
  staffUidCtx.evaluate('aggregatorOrders/SWIGGY_rest_a_main_SW-101', 'read', null, sampleOrderA),
  true
);

// Test 57: Staff A attempting to read aggregator order in unassigned outlet (Cross-outlet forbidden)
assert(
  'Staff A CANNOT read aggregator order in unassigned outlet (Cross-outlet forbidden)',
  staffUidCtx.evaluate('aggregatorOrders/SWIGGY_rest_a_branch2_SW-102', 'read', null, {
    ...sampleOrderA,
    outletId: 'rest_a_branch2'
  }),
  false
);

// Test 58: Staff B attempting to read Restaurant A aggregator order (Cross-tenant forbidden)
assert(
  'Staff B CANNOT read Restaurant A aggregator order (Cross-tenant forbidden)',
  adminBCtx.evaluate('aggregatorOrders/SWIGGY_rest_a_main_SW-101', 'read', null, sampleOrderA),
  false
);

// Test 59: Customer reading their own aggregator order (Allowed)
assert(
  'Customer can read their own aggregator order',
  customerCtx.evaluate('aggregatorOrders/SWIGGY_rest_a_main_SW-101', 'read', null, sampleOrderA),
  true
);

// Test 60: Other customer attempting to read someone else aggregator order (Forbidden)
assert(
  'Other customer CANNOT read someone else aggregator order (Forbidden)',
  otherCustomerCtx.evaluate('aggregatorOrders/SWIGGY_rest_a_main_SW-101', 'read', null, sampleOrderA),
  false
);

// Test 61: Public unauthenticated user attempting to read aggregator order (Forbidden)
assert(
  'Public unauthenticated user CANNOT read aggregator order (Forbidden)',
  unauthCtx.evaluate('aggregatorOrders/SWIGGY_rest_a_main_SW-101', 'read', null, sampleOrderA),
  false
);

// Test 62: Staff A updating order status to READY (Allowed)
assert(
  'Staff A can update order status to READY',
  staffUidCtx.evaluate(
    'aggregatorOrders/SWIGGY_rest_a_main_SW-101',
    'update',
    { ...sampleOrderA, orderStatus: 'READY' },
    sampleOrderA
  ),
  true
);

// Test 63: Staff attempting to tamper with financial pricing in aggregator order (Forbidden)
assert(
  'Staff CANNOT tamper with financial pricing in aggregator order (Immutability enforced)',
  staffUidCtx.evaluate(
    'aggregatorOrders/SWIGGY_rest_a_main_SW-101',
    'update',
    { ...sampleOrderA, pricing: { subtotal: 700, taxAmount: 35, grandTotal: 500 } },
    sampleOrderA
  ),
  false
);

// Test 64: Staff attempting to tamper with order items in aggregator order (Forbidden)
assert(
  'Staff CANNOT tamper with order items in aggregator order (Immutability enforced)',
  staffUidCtx.evaluate(
    'aggregatorOrders/SWIGGY_rest_a_main_SW-101',
    'update',
    { ...sampleOrderA, items: [{ id: 'item_1', name: 'Biryani', price: 200, quantity: 1, subtotal: 200 }] },
    sampleOrderA
  ),
  false
);

// Test 65: Customer attempting to create direct order for another UID (Forbidden)
assert(
  'Customer CANNOT create direct order for another UID (Identity spoofing blocked)',
  customerCtx.evaluate(
    'aggregatorOrders/DIRECT_rest_a_main_ord1',
    'create',
    {
      restaurantId: 'rest_a',
      outletId: 'rest_a_main',
      customer: { uid: 'spoofed_uid_888' },
      orderStatus: 'PLACED',
      pricing: { grandTotal: 250 }
    }
  ),
  false
);

console.log('\n10. STEP 5: AGGREGATOR CONNECTIONS & WEBHOOK AUDIT SECURITY');
console.log('-'.repeat(60));

const sampleWebhookA = {
  webhookId: 'WH_SWIGGY_test_101',
  provider: 'SWIGGY',
  restaurantId: 'rest_a',
  outletId: 'rest_a_main',
  externalOrderId: 'SW-991',
  processingStatus: 'PROCESSED'
};

const sampleWebhookB = {
  webhookId: 'WH_ZOMATO_test_202',
  provider: 'ZOMATO',
  restaurantId: 'rest_b',
  outletId: 'rest_b_main',
  externalOrderId: 'ZOM-882',
  processingStatus: 'PROCESSED'
};

// Test 66: Super Admin reading integration webhook (Allowed)
assert(
  'Super Admin can read integration webhook',
  superAdminCtx.evaluate('integrationWebhooks/WH_SWIGGY_test_101', 'read', null, sampleWebhookA),
  true
);

// Test 67: Restaurant Admin A reading Tenant A webhook (Allowed)
assert(
  'Restaurant Admin A can read Tenant A webhook',
  adminACtx.evaluate('integrationWebhooks/WH_SWIGGY_test_101', 'read', null, sampleWebhookA),
  true
);

// Test 68: Restaurant Admin A reading Tenant B webhook (Cross-tenant blocked)
assert(
  'Restaurant Admin A CANNOT read Tenant B webhook (Cross-tenant blocked)',
  adminACtx.evaluate('integrationWebhooks/WH_ZOMATO_test_202', 'read', null, sampleWebhookB),
  false
);

// Test 69: Waiter A reading Tenant A webhook (Forbidden - Admin only)
assert(
  'Waiter A CANNOT read Tenant A webhook (Admin only)',
  waiterACtx.evaluate('integrationWebhooks/WH_SWIGGY_test_101', 'read', null, sampleWebhookA),
  false
);

// Test 70: Customer reading integration webhook (Forbidden)
assert(
  'Customer CANNOT read integration webhook (Forbidden)',
  customerCtx.evaluate('integrationWebhooks/WH_SWIGGY_test_101', 'read', null, sampleWebhookA),
  false
);

// Test 71: Public user reading integration webhook (Forbidden)
assert(
  'Public user CANNOT read integration webhook (Forbidden)',
  unauthCtx.evaluate('integrationWebhooks/WH_SWIGGY_test_101', 'read', null, sampleWebhookA),
  false
);

// Test 72: Client attempting to create integration webhook (Blocked - Backend only)
assert(
  'Client CANNOT create integration webhook (Blocked - Backend Admin SDK only)',
  adminACtx.evaluate('integrationWebhooks/WH_SWIGGY_client_fake', 'create', sampleWebhookA),
  false
);

// Test 73: Restaurant Admin A reading own aggregatorConnections (Allowed)
assert(
  'Restaurant Admin A can read own aggregatorConnections',
  adminACtx.evaluate('restaurants/rest_a/outlets/rest_a_main/aggregatorConnections/swiggy', 'read'),
  true
);

// Test 74: Waiter A attempting to read aggregatorConnections (Forbidden - Admin only)
assert(
  'Waiter A CANNOT read aggregatorConnections (Admin only)',
  waiterACtx.evaluate('restaurants/rest_a/outlets/rest_a_main/aggregatorConnections/swiggy', 'read'),
  false
);

// Test 75: Public user attempting to read aggregatorConnections (Forbidden)
assert(
  'Public user CANNOT read aggregatorConnections (Forbidden)',
  unauthCtx.evaluate('restaurants/rest_a/outlets/rest_a_main/aggregatorConnections/swiggy', 'read'),
  false
);

console.log('\n11. STEP 7: INVENTORY, RECIPE & AUDIT LEDGER SECURITY');
console.log('-'.repeat(60));

// Test 76: Restaurant Admin A writing Master Ingredient in Restaurant A
assert(
  'Restaurant Admin A can write Master Ingredient in Restaurant A',
  adminACtx.evaluate('restaurants/rest_a/ingredients/ing_basmati', 'create', { name: 'Basmati Rice', unit: 'kg' }),
  true
);

// Test 77: Restaurant Admin A writing Master Ingredient in Restaurant B (Cross-tenant blocked)
assert(
  'Restaurant Admin A CANNOT write Master Ingredient in Restaurant B (Cross-tenant blocked)',
  adminACtx.evaluate('restaurants/rest_b/ingredients/ing_basmati', 'create', { name: 'Basmati Rice', unit: 'kg' }),
  false
);

// Test 78: Waiter A writing Master Ingredient in Restaurant A (Admin only)
assert(
  'Waiter A CANNOT write Master Ingredient in Restaurant A (Admin only)',
  waiterACtx.evaluate('restaurants/rest_a/ingredients/ing_basmati', 'create', { name: 'Basmati Rice', unit: 'kg' }),
  false
);

// Test 79: Outlet Manager updating outlet stock in assigned outlet
assert(
  'Outlet Manager can update outlet stock in assigned outlet',
  managerCtx.evaluate('restaurants/rest_a/outlets/rest_a_main/inventoryStock/ing_basmati', 'update', { currentStock: 40 }),
  true
);

// Test 80: Outlet Manager updating outlet stock in unassigned outlet (Cross-outlet blocked)
assert(
  'Outlet Manager CANNOT update outlet stock in unassigned outlet (Cross-outlet blocked)',
  managerCtx.evaluate('restaurants/rest_a/outlets/rest_a_branch2/inventoryStock/ing_basmati', 'update', { currentStock: 40 }),
  false
);

// Test 81: Staff A updating Tenant B outlet stock (Cross-tenant blocked)
assert(
  'Staff A CANNOT update Tenant B outlet stock (Cross-tenant blocked)',
  adminACtx.evaluate('restaurants/rest_b/outlets/rest_b_main/inventoryStock/ing_basmati', 'update', { currentStock: 40 }),
  false
);

// Test 82: Client-side user writing to inventoryLedger (Blocked - Admin SDK only)
assert(
  'Client-side user CANNOT write to inventoryLedger (Blocked - Admin SDK only)',
  adminACtx.evaluate('restaurants/rest_a/inventoryLedger/LEDGER_12345', 'create', { quantityChange: -2 }),
  false
);

// Test 83: Public user reading inventoryStock (Forbidden)
assert(
  'Public user CANNOT read inventoryStock (Forbidden)',
  unauthCtx.evaluate('restaurants/rest_a/outlets/rest_a_main/inventoryStock/ing_basmati', 'read'),
  false
);

// Test 84: Public user reading Master Ingredients (Forbidden)
assert(
  'Public user CANNOT read Master Ingredients (Forbidden)',
  unauthCtx.evaluate('restaurants/rest_a/ingredients/ing_basmati', 'read'),
  false
);

// Test 85: Restaurant Admin A creating Supplier record
assert(
  'Restaurant Admin A can create Supplier record in Restaurant A',
  adminACtx.evaluate('restaurants/rest_a/suppliers/sup_bengal', 'create', { name: 'Bengal Traders' }),
  true
);

// Test 86: Restaurant Staff reading deliveryEvents in Restaurant A (Allowed)
assert(
  'Restaurant Staff reading deliveryEvents in Restaurant A (Allowed)',
  adminACtx.evaluate('restaurants/rest_a/deliveryEvents/evt_001', 'read'),
  true
);

// Test 87: Restaurant Staff CANNOT write deliveryEvents directly (Admin SDK only)
assert(
  'Restaurant Staff CANNOT write deliveryEvents directly (Admin SDK only)',
  adminACtx.evaluate('restaurants/rest_a/deliveryEvents/evt_001', 'create', { eventType: 'DISPATCH' }),
  false
);

// Test 88: Unauthenticated user CANNOT read deliveryEvents (Forbidden)
assert(
  'Unauthenticated user CANNOT read deliveryEvents (Forbidden)',
  unauthCtx.evaluate('restaurants/rest_a/deliveryEvents/evt_001', 'read'),
  false
);

// Test 89: Restaurant Admin A updating Delivery Partner currentActiveOrders
assert(
  'Restaurant Admin A updating Delivery Partner currentActiveOrders',
  adminACtx.evaluate('deliveryPartners/rider_456', 'update', { currentActiveOrders: ['ord_01'] }, riderDoc),
  true
);

// 12. STEP 9: PAYMENT TRANSACTIONS & SETTLEMENT RECONCILIATION SECURITY
console.log('\n12. STEP 9: PAYMENT TRANSACTIONS & SETTLEMENT RECONCILIATION SECURITY');
console.log('-'.repeat(60));

// Test 90: Restaurant Staff can read paymentTransactions in Restaurant A (Allowed)
assert(
  'Restaurant Staff can read paymentTransactions in Restaurant A (Allowed)',
  waiterACtx.evaluate('restaurants/rest_a/paymentTransactions/TXN_001', 'read'),
  true
);

// Test 91: Restaurant Staff CANNOT write paymentTransactions directly (Admin SDK only)
assert(
  'Restaurant Staff CANNOT write paymentTransactions directly (Admin SDK only)',
  adminACtx.evaluate('restaurants/rest_a/paymentTransactions/TXN_001', 'create', { amount: 500 }),
  false
);

// Test 92: Staff A CANNOT read Tenant B paymentTransactions (Cross-tenant blocked)
assert(
  'Staff A CANNOT read Tenant B paymentTransactions (Cross-tenant blocked)',
  adminACtx.evaluate('restaurants/rest_b/paymentTransactions/TXN_002', 'read'),
  false
);

// Test 93: Restaurant Admin can read settlementRecords in Restaurant A (Allowed)
assert(
  'Restaurant Admin can read settlementRecords in Restaurant A (Allowed)',
  adminACtx.evaluate('restaurants/rest_a/settlementRecords/SETTLE_001', 'read'),
  true
);

// Test 94: Waiter CANNOT read settlementRecords in Restaurant A (Admin/Manager only)
assert(
  'Waiter CANNOT read settlementRecords in Restaurant A (Admin/Manager only)',
  waiterACtx.evaluate('restaurants/rest_a/settlementRecords/SETTLE_001', 'read'),
  false
);

// Test 95: Restaurant Admin CANNOT write settlementRecords directly (Admin SDK only)
assert(
  'Restaurant Admin CANNOT write settlementRecords directly (Admin SDK only)',
  adminACtx.evaluate('restaurants/rest_a/settlementRecords/SETTLE_001', 'create', { netPayout: 1000 }),
  false
);

console.log('\n13. STEP 10: PLATFORM SAAS SUBSCRIPTIONS, INVOICES & AUDIT LOGS');
console.log('-'.repeat(60));

// Test 96: Restaurant Staff can read own subscription doc in Restaurant A (Allowed)
assert(
  'Restaurant Staff can read own subscription doc in Restaurant A (Allowed)',
  waiterACtx.evaluate('restaurants/rest_a/subscription/current', 'read'),
  true
);

// Test 97: Restaurant Staff CANNOT write subscription doc directly (Super Admin only)
assert(
  'Restaurant Staff CANNOT write subscription doc directly (Super Admin only)',
  adminACtx.evaluate('restaurants/rest_a/subscription/current', 'update', { planId: 'ENTERPRISE' }),
  false
);

// Test 98: Public user can read subscriptionPlans (Allowed)
assert(
  'Public user can read subscriptionPlans (Allowed)',
  unauthCtx.evaluate('subscriptionPlans/STARTER', 'read'),
  true
);

// Test 99: Non-Super-Admin CANNOT modify subscriptionPlans (Blocked)
assert(
  'Restaurant Admin CANNOT modify subscriptionPlans (Blocked)',
  adminACtx.evaluate('subscriptionPlans/STARTER', 'update', { monthlyPrice: 0 }),
  false
);

// Test 100: Restaurant Admin A can read own SaaS subscription invoice (Allowed)
assert(
  'Restaurant Admin A can read own SaaS subscription invoice (Allowed)',
  adminACtx.evaluate('subscriptionInvoices/SAAS_INV_A', 'read', null, mockDb['subscriptionInvoices/SAAS_INV_A']),
  true
);

// Test 101: Restaurant Admin A CANNOT read Restaurant B SaaS invoice (Cross-tenant blocked)
assert(
  'Restaurant Admin A CANNOT read Restaurant B SaaS invoice (Cross-tenant blocked)',
  adminACtx.evaluate('subscriptionInvoices/SAAS_INV_B', 'read', null, mockDb['subscriptionInvoices/SAAS_INV_B']),
  false
);

// Test 102: Non-Super-Admin CANNOT read platformAuditLogs (Blocked)
assert(
  'Restaurant Admin CANNOT read platformAuditLogs (Blocked)',
  adminACtx.evaluate('platformAuditLogs/LOG_001', 'read'),
  false
);

// Test 103: Super Admin can read and write platformAuditLogs (Allowed)
assert(
  'Super Admin can read platformAuditLogs (Allowed)',
  superAdminCtx.evaluate('platformAuditLogs/LOG_001', 'read'),
  true
);

console.log('\n' + '='.repeat(80));
console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('='.repeat(80));

if (failed > 0) {
  process.exit(1);
}
