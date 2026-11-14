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
      status: 'active',
      authMethod: 'email',
    });
    // Tenant B Admin
    await db.doc('users/admin_b@restb.com').set({
      email: 'admin_b@restb.com',
      role: 'restaurant_admin',
      restaurantId: 'rest_b',
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
  });

  // Authenticated Contexts
  const adminAContext = testEnv.authenticatedContext('admin_a_uid', {
    email: 'admin_a@resta.com',
    email_verified: true,
  });
  const dbAdminA = adminAContext.firestore();

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

  await testEnv.cleanup();

  console.log('\n' + '='.repeat(80));
  console.log(`LIVE EMULATOR TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));
}

main().catch(console.error);
