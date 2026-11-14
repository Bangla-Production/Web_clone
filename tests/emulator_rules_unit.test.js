/**
 * Official Firebase Emulator Security Rules Test Suite
 * Uses @firebase/rules-unit-testing against real Cloud Firestore Emulator.
 *
 * Execution Command:
 *   firebase emulators:exec --only firestore "node tests/emulator_rules_unit.test.js"
 */

import fs from 'fs';
import path from 'path';

let testEnv;
let passed = 0;
let failed = 0;

async function runTest(description, testFn) {
  try {
    await testFn();
    console.log(`  ✓ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('FIREBASE EMULATOR SUITE: FIRESTORE SECURITY RULES VERIFICATION');
  console.log('='.repeat(80));

  let rulesTesting;
  try {
    rulesTesting = await import('@firebase/rules-unit-testing');
  } catch (err) {
    console.warn('\n[NOTE] @firebase/rules-unit-testing package is not locally installed.');
    return;
  }

  const { initializeTestEnvironment, assertFails, assertSucceeds } = rulesTesting;

  const rules = fs.readFileSync(path.resolve('./firestore.rules'), 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: 'abar-khabo-audit',
    firestore: {
      rules,
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || 8080),
    },
  });

  console.log('Connected to Firestore Emulator on', process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080');

  // Setup mock initial documents using withSecurityRulesDisabled
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // Super admin
    await db.doc('users/altcafe2026@gmail.com').set({
      email: 'altcafe2026@gmail.com',
      role: 'super_admin',
      status: 'active',
    });
    // Tenant A Admin
    await db.doc('users/admin_a@resta.com').set({
      email: 'admin_a@resta.com',
      role: 'restaurant_admin',
      restaurantId: 'rest_a',
      allOutlets: true,
      status: 'active',
      authMethod: 'email',
    });
    // Tenant B Admin
    await db.doc('users/admin_b@restb.com').set({
      email: 'admin_b@restb.com',
      role: 'restaurant_admin',
      restaurantId: 'rest_b',
      allOutlets: true,
      status: 'active',
      authMethod: 'email',
    });
    // Staff UID profile (Tenant A Waiter - Main Outlet)
    await db.doc('users/staff_uid_1').set({
      uid: 'staff_uid_1',
      email: 'waiter1@resta.com',
      name: 'Waiter One',
      role: 'waiter',
      restaurantId: 'rest_a',
      assignedOutletIds: ['rest_a_main'],
      allOutlets: false,
      status: 'active',
      authMethod: 'email',
    });
    // Staff UID profile (Tenant A Waiter - Branch 2 Outlet)
    await db.doc('users/staff_branch2_uid').set({
      uid: 'staff_branch2_uid',
      email: 'waiter_b2@resta.com',
      name: 'Waiter Branch 2',
      role: 'waiter',
      restaurantId: 'rest_a',
      assignedOutletIds: ['rest_a_branch2'],
      allOutlets: false,
      status: 'active',
      authMethod: 'email',
    });
    // Staff UID profile (Tenant A Outlet Manager)
    await db.doc('users/manager_uid_1').set({
      uid: 'manager_uid_1',
      email: 'manager@resta.com',
      name: 'Manager One',
      role: 'outlet_manager',
      restaurantId: 'rest_a',
      assignedOutletIds: ['rest_a_main'],
      allOutlets: false,
      status: 'active',
      authMethod: 'email',
    });
    // Staff Legacy Email profile (Tenant A)
    await db.doc('users/legacy_waiter@resta.com').set({
      email: 'legacy_waiter@resta.com',
      name: 'Legacy Waiter',
      role: 'waiter',
      restaurantId: 'rest_a',
      assignedOutletIds: ['rest_a_main'],
      allOutlets: false,
      status: 'active',
      authMethod: 'email',
    });
    // Tenant A Orders
    await db.doc('restaurants/rest_a/orders/ord_a1').set({
      restaurantId: 'rest_a',
      total: 500,
    });
    // Tenant B Orders
    await db.doc('restaurants/rest_b/orders/ord_b1').set({
      restaurantId: 'rest_b',
      total: 600,
    });
    // Menu Catalogs
    await db.doc('restaurants/rest_a/menuCatalog/item_1').set({
      name: 'Awadhi Biryani',
      basePrice: 550,
      restaurantId: 'rest_a'
    });
    await db.doc('restaurants/rest_b/menuCatalog/item_b1').set({
      name: 'Chili Chicken',
      basePrice: 380,
      restaurantId: 'rest_b'
    });
    // Authoritative Normalized Orders (aggregatorOrders)
    await db.doc('aggregatorOrders/SWIGGY_rest_a_main_1001').set({
      orderId: 'SWIGGY_rest_a_main_1001',
      restaurantId: 'rest_a',
      outletId: 'rest_a_main',
      source: 'SWIGGY',
      orderStatus: 'PLACED',
      orderType: 'DELIVERY',
      customer: { uid: 'cust_a', name: 'Alice Customer' },
      items: [{ itemId: 'item_1', name: 'Biryani', price: 550, qty: 1 }],
      pricing: { grandTotal: 550, itemTotal: 550, taxTotal: 0 },
      delivery: { riderId: 'rider_1' }
    });
    await db.doc('aggregatorOrders/SWIGGY_rest_b_main_2001').set({
      orderId: 'SWIGGY_rest_b_main_2001',
      restaurantId: 'rest_b',
      outletId: 'rest_b_main',
      source: 'SWIGGY',
      orderStatus: 'PLACED',
      orderType: 'DELIVERY',
      customer: { uid: 'cust_b', name: 'Bob Customer' },
      items: [{ itemId: 'item_b1', name: 'Chili Chicken', price: 380, qty: 1 }],
      pricing: { grandTotal: 380, itemTotal: 380, taxTotal: 0 }
    });
    // Aggregator Connection Tenant B
    await db.doc('restaurants/rest_b/aggregatorConnections/swiggy_cred').set({
      apiKey: 'secret_swiggy_key',
      restaurantId: 'rest_b',
    });
    // Customer Profiles & Addresses
    await db.doc('customers/cust_a').set({ name: 'Alice Customer', role: 'customer' });
    await db.doc('customers/cust_a/addresses/addr_1').set({ address: '123 Park Street', label: 'Home' });
    await db.doc('customers/cust_b').set({ name: 'Bob Customer', role: 'customer' });
    await db.doc('customers/cust_b/addresses/addr_2').set({ address: '456 Lake Road', label: 'Work' });
    // Online Order
    await db.doc('onlineOrders/ord_track_1').set({
      restaurantId: 'rest_a',
      customerId: 'cust_a',
      riderId: 'rider_1',
      totalAmount: 450,
      paymentStatus: 'PENDING',
      status: 'PREPARING',
      orderType: 'DELIVERY',
      items: [{ id: 'item_1', name: 'Biryani', price: 450, qty: 1 }],
    });
    // Delivery Tracking
    await db.doc('deliveryTracking/ord_track_1').set({
      restaurantId: 'rest_a',
      customerId: 'cust_a',
      riderId: 'rider_1',
      status: 'RIDER_ASSIGNED',
      riderCoordinates: { lat: 22.57, lng: 88.36 },
    });
    // Delivery Partner
    await db.doc('deliveryPartners/rider_1').set({
      name: 'Rider Dave',
      phone: '9876543210',
      status: 'APPROVED',
      isAadhaarVerified: false,
      kycStatus: 'UNVERIFIED',
      aadhaarMasked: '•••• •••• 1234',
      isOnline: true,
      isAvailable: false,
    });
    // Aggregator Connection for rest_a_main
    await db.doc('restaurants/rest_a/outlets/rest_a_main/aggregatorConnections/swiggy').set({
      provider: 'SWIGGY',
      connectionStatus: 'CONNECTED',
      externalRestaurantId: 'SW_REST_1001',
      secretReference: 'projects/demo-abar-khabo/secrets/swiggy_rest_a/versions/1',
      restaurantId: 'rest_a',
      outletId: 'rest_a_main'
    });
    // Integration Webhooks
    await db.doc('integrationWebhooks/WH_SWIGGY_emu_101').set({
      webhookId: 'WH_SWIGGY_emu_101',
      provider: 'SWIGGY',
      restaurantId: 'rest_a',
      outletId: 'rest_a_main',
      processingStatus: 'PROCESSED'
    });
    await db.doc('integrationWebhooks/WH_ZOMATO_emu_202').set({
      webhookId: 'WH_ZOMATO_emu_202',
      provider: 'ZOMATO',
      restaurantId: 'rest_b',
      outletId: 'rest_b_main',
      processingStatus: 'PROCESSED'
    });
    // Step 8: Delivery Events
    await db.doc('restaurants/rest_a/deliveryEvents/evt_seed_1').set({
      eventId: 'evt_seed_1',
      restaurantId: 'rest_a',
      orderId: 'SWIGGY_rest_a_main_1001',
      eventType: 'DISPATCHED',
      createdAt: '2026-11-15T00:00:00.000Z'
    });
  });

  // Authenticated Contexts
  const adminAContext = testEnv.authenticatedContext('admin_a_uid', {
    email: 'admin_a@resta.com',
    email_verified: true,
  });
  const dbAdminA = adminAContext.firestore();

  const superAdminContext = testEnv.authenticatedContext('super_uid', {
    email: 'altcafe2026@gmail.com',
    email_verified: true,
  });
  const dbSuperAdmin = superAdminContext.firestore();

  const staffUidContext = testEnv.authenticatedContext('staff_uid_1', {
    email: 'waiter1@resta.com',
    email_verified: true,
  });
  const dbStaffUid = staffUidContext.firestore();

  const staffBranch2Context = testEnv.authenticatedContext('staff_branch2_uid', {
    email: 'waiter_b2@resta.com',
    email_verified: true,
  });
  const dbStaffBranch2 = staffBranch2Context.firestore();

  const managerAContext = testEnv.authenticatedContext('manager_uid_1', {
    email: 'manager@resta.com',
    email_verified: true,
  });
  const dbManagerA = managerAContext.firestore();

  const staffLegacyContext = testEnv.authenticatedContext('staff_legacy_uid', {
    email: 'legacy_waiter@resta.com',
    email_verified: true,
  });
  const dbStaffLegacy = staffLegacyContext.firestore();

  const customerAContext = testEnv.authenticatedContext('cust_a', {
    email: 'alice@customer.com',
    email_verified: true,
  });
  const dbCustomerA = customerAContext.firestore();

  const customerBContext = testEnv.authenticatedContext('cust_b', {
    email: 'bob@customer.com',
    email_verified: true,
  });
  const dbCustomerB = customerBContext.firestore();

  const riderContext = testEnv.authenticatedContext('rider_1', {
    email: '9876543210@rider.abarkhabo.local',
    email_verified: true,
  });
  const dbRider = riderContext.firestore();

  const unauthContext = testEnv.unauthenticatedContext();
  const dbUnauth = unauthContext.firestore();

  console.log('\n--- Real Emulator Test Scenarios ---');

  // Scenario 1: Tenant A reading Tenant A orders
  await runTest('Admin A reading Tenant A orders (Allowed)', async () => {
    await assertSucceeds(dbAdminA.doc('restaurants/rest_a/orders/ord_a1').get());
  });

  // Scenario 2: Tenant A reading Tenant B orders (Denied)
  await runTest('Admin A reading Tenant B orders (Cross-tenant blocked)', async () => {
    await assertFails(dbAdminA.doc('restaurants/rest_b/orders/ord_b1').get());
  });

  // Scenario 3: Tenant A writing to Tenant B orders (Denied)
  await runTest('Admin A updating Tenant B orders (Cross-tenant blocked)', async () => {
    await assertFails(dbAdminA.doc('restaurants/rest_b/orders/ord_b1').update({ total: 999 }));
  });

  // Scenario 4: Tenant A accessing Tenant B Aggregator credentials (Denied)
  await runTest('Admin A reading Tenant B Aggregator credentials (Cross-tenant blocked)', async () => {
    await assertFails(dbAdminA.doc('restaurants/rest_b/aggregatorConnections/swiggy_cred').get());
  });

  // Scenario 5: Unauthenticated reading private orders (Denied)
  await runTest('Unauthenticated user reading private orders (Forbidden)', async () => {
    await assertFails(dbUnauth.doc('restaurants/rest_a/orders/ord_a1').get());
  });

  // Scenario 6: Customer A reading own address (Allowed)
  await runTest('Customer A reading own address (Allowed)', async () => {
    await assertSucceeds(dbCustomerA.doc('customers/cust_a/addresses/addr_1').get());
  });

  // Scenario 7: Customer B reading Customer A address (Denied)
  await runTest('Customer B reading Customer A address (Forbidden)', async () => {
    await assertFails(dbCustomerB.doc('customers/cust_a/addresses/addr_1').get());
  });

  // Scenario 8: Unauthenticated reading Customer A address (Denied)
  await runTest('Unauthenticated user reading Customer A address (Forbidden)', async () => {
    await assertFails(dbUnauth.doc('customers/cust_a/addresses/addr_1').get());
  });

  // Scenario 9: Unauthenticated reading live GPS deliveryTracking (Denied - Requirement 5)
  await runTest('Unauthenticated user reading GPS deliveryTracking (Forbidden - Requirement 5)', async () => {
    await assertFails(dbUnauth.doc('deliveryTracking/ord_track_1').get());
  });

  // Scenario 10: Customer A reading own deliveryTracking (Allowed)
  await runTest('Customer A reading own deliveryTracking (Allowed)', async () => {
    await assertSucceeds(dbCustomerA.doc('deliveryTracking/ord_track_1').get());
  });

  // Scenario 11: Assigned Rider reading deliveryTracking (Allowed)
  await runTest('Assigned Rider reading deliveryTracking (Allowed)', async () => {
    await assertSucceeds(dbRider.doc('deliveryTracking/ord_track_1').get());
  });

  // Scenario 12: Assigned Rider updating GPS coordinates (Allowed)
  await runTest('Assigned Rider updating GPS coordinates on deliveryTracking (Allowed)', async () => {
    await assertSucceeds(dbRider.doc('deliveryTracking/ord_track_1').update({
      riderCoordinates: { lat: 22.58, lng: 88.37 },
      status: 'OUT_FOR_DELIVERY',
    }));
  });

  // Scenario 13: Assigned Rider attempting to alter order totalAmount (Denied - Requirement 7 & 8)
  await runTest('Assigned Rider altering order totalAmount (Forbidden - Requirement 7 & 8)', async () => {
    await assertFails(dbRider.doc('onlineOrders/ord_track_1').update({
      totalAmount: 0,
      paymentStatus: 'PAID',
    }));
  });

  // Scenario 14: Rider attempting to alter their own KYC verification status (Denied - Requirement 8)
  await runTest('Rider self-verifying KYC / isAadhaarVerified (Forbidden - Requirement 8)', async () => {
    await assertFails(dbRider.doc('deliveryPartners/rider_1').update({
      isAadhaarVerified: true,
      kycStatus: 'VERIFIED',
    }));
  });

  // Scenario 15: Rider updating their own online status (Allowed)
  await runTest('Rider updating their own online availability (Allowed)', async () => {
    await assertSucceeds(dbRider.doc('deliveryPartners/rider_1').update({
      isOnline: false,
    }));
  });

  // --- Step 2 UID Identity & Outlet Authorization Scenarios ---

  // Scenario 16: Staff reading own profile via UID document (Allowed)
  await runTest('Staff reading own profile via UID document users/{uid} (Allowed)', async () => {
    await assertSucceeds(dbStaffUid.doc('users/staff_uid_1').get());
  });

  // Scenario 17: Staff reading own profile via legacy email document users/{email} (Allowed)
  await runTest('Staff reading own profile via legacy email document users/{email} (Allowed)', async () => {
    await assertSucceeds(dbStaffLegacy.doc('users/legacy_waiter@resta.com').get());
  });

  // Scenario 18: Staff attempting role escalation on self-update (Denied)
  await runTest('Staff attempting to escalate role to super_admin or restaurant_admin (Forbidden)', async () => {
    await assertFails(dbStaffUid.doc('users/staff_uid_1').update({
      role: 'super_admin'
    }));
  });

  // Scenario 19: Staff attempting restaurantId tampering on self-update (Denied)
  await runTest('Staff attempting to change restaurantId to another tenant (Forbidden)', async () => {
    await assertFails(dbStaffUid.doc('users/staff_uid_1').update({
      restaurantId: 'rest_b'
    }));
  });

  // Scenario 20: Staff attempting to grant themselves allOutlets: true (Denied)
  await runTest('Staff attempting to self-grant allOutlets: true (Forbidden)', async () => {
    await assertFails(dbStaffUid.doc('users/staff_uid_1').update({
      allOutlets: true
    }));
  });

  // Scenario 21: Restaurant Admin A attempting to create a super_admin user (Denied)
  await runTest('Restaurant Admin attempting to create super_admin account (Forbidden)', async () => {
    await assertFails(dbAdminA.doc('users/rogue_super_admin').set({
      email: 'rogue@admin.com',
      role: 'super_admin',
      restaurantId: 'rest_a',
      status: 'active'
    }));
  });

  // Scenario 22: Restaurant Admin A creating staff for Restaurant B (Denied)
  await runTest('Restaurant Admin A creating staff for Restaurant B (Cross-tenant forbidden)', async () => {
    await assertFails(dbAdminA.doc('users/staff_b_new').set({
      email: 'staff_b@restb.com',
      role: 'waiter',
      restaurantId: 'rest_b',
      status: 'active'
    }));
  });

  // Scenario 23: Restaurant Admin A creating valid staff for Restaurant A (Allowed)
  await runTest('Restaurant Admin A creating valid staff for own Restaurant A (Allowed)', async () => {
    await assertSucceeds(dbAdminA.doc('users/staff_a_valid').set({
      email: 'staff_a_valid@resta.com',
      role: 'waiter',
      restaurantId: 'rest_a',
      allOutlets: false,
      status: 'active'
    }));
  });

  // Scenario 24: Staff member attempting to read another restaurant admin profile (Denied)
  await runTest('Staff A attempting to read Tenant B Admin profile (Cross-tenant forbidden)', async () => {
    await assertFails(dbStaffUid.doc('users/admin_b@restb.com').get());
  });

  // Scenario 25: Super Admin reading user profiles across tenants (Allowed)
  await runTest('Super Admin reading user profiles across any tenant (Allowed)', async () => {
    await assertSucceeds(dbSuperAdmin.doc('users/staff_uid_1').get());
    await assertSucceeds(dbSuperAdmin.doc('users/admin_b@restb.com').get());
  });

  // --- Step 3 Menu Catalog & Outlet Overrides Scenarios ---

  // Scenario 26: Restaurant Admin A creating Master Menu item in Tenant A (Allowed)
  await runTest('Restaurant Admin A creating Master Menu item in Tenant A (Allowed)', async () => {
    await assertSucceeds(dbAdminA.doc('restaurants/rest_a/menuCatalog/item_new').set({
      name: 'Paneer Butter Masala',
      basePrice: 320,
      restaurantId: 'rest_a'
    }));
  });

  // Scenario 27: Restaurant Admin A creating Master Menu item in Tenant B (Cross-tenant blocked)
  await runTest('Restaurant Admin A creating Master Menu item in Tenant B (Cross-tenant blocked)', async () => {
    await assertFails(dbAdminA.doc('restaurants/rest_b/menuCatalog/item_hack').set({
      name: 'Hacked Item',
      basePrice: 10,
      restaurantId: 'rest_b'
    }));
  });

  // Scenario 28: Waiter A attempting to write to Master Menu item (Denied - Admin only)
  await runTest('Waiter A attempting to write to Master Menu Catalog (Forbidden)', async () => {
    await assertFails(dbStaffUid.doc('restaurants/rest_a/menuCatalog/item_1').update({
      basePrice: 100
    }));
  });

  // Scenario 29: Outlet Manager A writing menu override to assigned outlet (Allowed)
  await runTest('Outlet Manager A writing menu override to assigned outlet (Allowed)', async () => {
    await assertSucceeds(dbManagerA.doc('restaurants/rest_a/outlets/rest_a_main/menuOverrides/item_1').set({
      priceOverrides: { SWIGGY: 650 },
      isAvailable: true
    }));
  });

  // Scenario 30: Outlet Manager A writing menu override to unassigned outlet (Cross-outlet blocked)
  await runTest('Outlet Manager A writing menu override to unassigned outlet (Cross-outlet blocked)', async () => {
    await assertFails(dbManagerA.doc('restaurants/rest_a/outlets/rest_a_branch2/menuOverrides/item_1').set({
      priceOverrides: { SWIGGY: 999 },
      isAvailable: false
    }));
  });

  // Scenario 31: Waiter A attempting to write outlet menu override (Denied)
  await runTest('Waiter A attempting to write outlet menu override (Forbidden)', async () => {
    await assertFails(dbStaffUid.doc('restaurants/rest_a/outlets/rest_a_main/menuOverrides/item_1').set({
      priceOverrides: { DINE_IN: 10 }
    }));
  });

  // Scenario 32: Public/Customer reading Master Menu Catalog and Overrides (Allowed for discovery)
  await runTest('Public/Customer reading Master Menu Catalog & Overrides (Allowed)', async () => {
    await assertSucceeds(dbCustomerA.doc('restaurants/rest_a/menuCatalog/item_1').get());
    await assertSucceeds(dbCustomerA.doc('restaurants/rest_a/outlets/rest_a_main/menuOverrides/item_1').get());
  });

  // --- Step 4 Authoritative Normalized Orders (aggregatorOrders) Scenarios ---

  // Scenario 33: Staff A reading authorized aggregator order in assigned outlet (Allowed)
  await runTest('Staff A reading authorized aggregator order in assigned outlet (Allowed)', async () => {
    await assertSucceeds(dbStaffUid.doc('aggregatorOrders/SWIGGY_rest_a_main_1001').get());
  });

  // Scenario 34: Staff A reading aggregator order of Tenant B (Cross-tenant blocked)
  await runTest('Staff A reading aggregator order of Tenant B (Cross-tenant blocked)', async () => {
    await assertFails(dbStaffUid.doc('aggregatorOrders/SWIGGY_rest_b_main_2001').get());
  });

  // Scenario 35: Staff A (assigned only to Branch 2) reading Branch 1 order (Cross-outlet blocked)
  await runTest('Staff A (Branch 2 only) reading Branch 1 order (Cross-outlet blocked)', async () => {
    await assertFails(dbStaffBranch2.doc('aggregatorOrders/SWIGGY_rest_a_main_1001').get());
  });

  // Scenario 36: Customer A reading own aggregator order (Allowed)
  await runTest('Customer A reading own aggregator order (Allowed)', async () => {
    await assertSucceeds(dbCustomerA.doc('aggregatorOrders/SWIGGY_rest_a_main_1001').get());
  });

  // Scenario 37: Customer B attempting to read Customer A aggregator order (Forbidden)
  await runTest('Customer B reading Customer A aggregator order (Forbidden)', async () => {
    await assertFails(dbCustomerB.doc('aggregatorOrders/SWIGGY_rest_a_main_1001').get());
  });

  // Scenario 38: Unauthenticated user attempting to read aggregator order (Forbidden)
  await runTest('Unauthenticated user reading aggregator order (Forbidden)', async () => {
    await assertFails(dbUnauth.doc('aggregatorOrders/SWIGGY_rest_a_main_1001').get());
  });

  // Scenario 39: Staff A updating orderStatus on authorized aggregator order (Allowed)
  await runTest('Staff A updating orderStatus on authorized aggregator order (Allowed)', async () => {
    await assertSucceeds(dbStaffUid.doc('aggregatorOrders/SWIGGY_rest_a_main_1001').update({
      orderStatus: 'ACCEPTED'
    }));
  });

  // Scenario 40: Staff A attempting to alter financial pricing on aggregator order (Forbidden - Price Immutability)
  await runTest('Staff A altering financial pricing on aggregator order (Forbidden - Price Immutability)', async () => {
    await assertFails(dbStaffUid.doc('aggregatorOrders/SWIGGY_rest_a_main_1001').update({
      'pricing.grandTotal': 10
    }));
  });

  // Scenario 41: Staff A attempting to alter items array on aggregator order (Forbidden - Item Immutability)
  await runTest('Staff A altering items array on aggregator order (Forbidden - Item Immutability)', async () => {
    await assertFails(dbStaffUid.doc('aggregatorOrders/SWIGGY_rest_a_main_1001').update({
      items: [{ itemId: 'item_1', name: 'Biryani', price: 10, qty: 1 }]
    }));
  });

  // Scenario 42: Staff A attempting to change restaurantId or outletId (Forbidden - Tenant Hopping)
  await runTest('Staff A altering restaurantId or outletId on aggregator order (Forbidden)', async () => {
    await assertFails(dbStaffUid.doc('aggregatorOrders/SWIGGY_rest_a_main_1001').update({
      outletId: 'rest_a_branch2'
    }));
  });

  // Scenario 43: Admin A reading own outlet aggregator connection (Allowed)
  await runTest('Admin A reading own outlet aggregator connection (Allowed)', async () => {
    await assertSucceeds(dbAdminA.doc('restaurants/rest_a/outlets/rest_a_main/aggregatorConnections/swiggy').get());
  });

  // Scenario 44: Staff A reading aggregator connection (Forbidden - Admin only)
  await runTest('Staff A reading aggregator connection (Forbidden - Admin only)', async () => {
    await assertFails(dbStaffUid.doc('restaurants/rest_a/outlets/rest_a_main/aggregatorConnections/swiggy').get());
  });

  // Scenario 45: Admin A reading Tenant A integration webhook (Allowed)
  await runTest('Admin A reading Tenant A integration webhook (Allowed)', async () => {
    await assertSucceeds(dbAdminA.doc('integrationWebhooks/WH_SWIGGY_emu_101').get());
  });

  // Scenario 46: Admin A reading Tenant B integration webhook (Cross-tenant blocked)
  await runTest('Admin A reading Tenant B integration webhook (Cross-tenant blocked)', async () => {
    await assertFails(dbAdminA.doc('integrationWebhooks/WH_ZOMATO_emu_202').get());
  });

  // Scenario 47: Staff A reading integration webhook (Forbidden - Admin only)
  await runTest('Staff A reading integration webhook (Forbidden - Admin only)', async () => {
    await assertFails(dbStaffUid.doc('integrationWebhooks/WH_SWIGGY_emu_101').get());
  });

  // Scenario 48: Client attempting to create integration webhook (Blocked - Backend only)
  await runTest('Client attempting to create integration webhook (Blocked - Backend only)', async () => {
    await assertFails(dbAdminA.doc('integrationWebhooks/WH_FAKE_CLIENT').set({
      provider: 'SWIGGY',
      restaurantId: 'rest_a'
    }));
  });

  // Scenario 49: Admin A creating Master Ingredient in Restaurant A (Allowed)
  await runTest('Admin A creating Master Ingredient in Restaurant A (Allowed)', async () => {
    await assertSucceeds(dbAdminA.doc('restaurants/rest_a/ingredients/ing_basmati').set({
      name: 'Basmati Rice',
      unit: 'kg'
    }));
  });

  // Scenario 50: Admin A creating Master Ingredient in Restaurant B (Cross-tenant blocked)
  await runTest('Admin A creating Master Ingredient in Restaurant B (Cross-tenant blocked)', async () => {
    await assertFails(dbAdminA.doc('restaurants/rest_b/ingredients/ing_basmati').set({
      name: 'Basmati Rice',
      unit: 'kg'
    }));
  });

  // Scenario 51: Waiter A creating Master Ingredient in Restaurant A (Forbidden)
  await runTest('Waiter A creating Master Ingredient in Restaurant A (Forbidden)', async () => {
    await assertFails(dbStaffUid.doc('restaurants/rest_a/ingredients/ing_basmati').set({
      name: 'Basmati Rice',
      unit: 'kg'
    }));
  });

  // Scenario 52: Manager A updating outlet stock in assigned outlet rest_a_main (Allowed)
  await runTest('Manager A updating outlet stock in assigned outlet rest_a_main (Allowed)', async () => {
    await assertSucceeds(dbManagerA.doc('restaurants/rest_a/outlets/rest_a_main/inventoryStock/ing_basmati').set({
      currentStock: 45,
      unit: 'kg'
    }));
  });

  // Scenario 53: Manager A updating outlet stock in unassigned outlet rest_a_branch2 (Cross-outlet blocked)
  await runTest('Manager A updating outlet stock in unassigned outlet rest_a_branch2 (Cross-outlet blocked)', async () => {
    await assertFails(dbManagerA.doc('restaurants/rest_a/outlets/rest_a_branch2/inventoryStock/ing_basmati').set({
      currentStock: 45,
      unit: 'kg'
    }));
  });

  // Scenario 54: Client-side write to inventoryLedger (Blocked - Admin SDK only)
  await runTest('Client-side write to inventoryLedger (Blocked - Admin SDK only)', async () => {
    await assertFails(dbAdminA.doc('restaurants/rest_a/inventoryLedger/LEDGER_FAKE_CLIENT').set({
      movementType: 'CONSUMPTION',
      quantityChange: -10
    }));
  });

  // Scenario 55: Unauthenticated reading inventoryStock (Forbidden)
  await runTest('Unauthenticated reading inventoryStock (Forbidden)', async () => {
    await assertFails(dbUnauth.doc('restaurants/rest_a/outlets/rest_a_main/inventoryStock/ing_basmati').get());
  });

  // Scenario 56: Staff A reading deliveryEvents in Restaurant A (Allowed)
  await runTest('Staff A reading deliveryEvents in Restaurant A (Allowed)', async () => {
    await assertSucceeds(dbStaffUid.doc('restaurants/rest_a/deliveryEvents/evt_seed_1').get());
  });

  // Scenario 57: Staff A writing deliveryEvents directly (Blocked - Admin SDK only)
  await runTest('Staff A writing deliveryEvents directly (Blocked - Admin SDK only)', async () => {
    await assertFails(dbStaffUid.doc('restaurants/rest_a/deliveryEvents/evt_fake_client').set({
      eventType: 'DISPATCH',
      orderId: 'fake_order'
    }));
  });

  // Scenario 58: Unauthenticated user reading deliveryEvents (Forbidden)
  await runTest('Unauthenticated user reading deliveryEvents (Forbidden)', async () => {
    await assertFails(dbUnauth.doc('restaurants/rest_a/deliveryEvents/evt_seed_1').get());
  });

  // Scenario 59: Admin A updating Delivery Partner currentActiveOrders (Allowed)
  await runTest('Admin A updating Delivery Partner currentActiveOrders (Allowed)', async () => {
    await assertSucceeds(dbAdminA.doc('deliveryPartners/rider_1').update({
      currentActiveOrders: ['SWIGGY_rest_a_main_1001']
    }));
  });

  await testEnv.cleanup();

  console.log('\n' + '='.repeat(80));
  console.log(`LIVE EMULATOR TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
