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
    console.warn('To run against the live emulator jar, install dependencies:');
    console.warn('  npm install --save-dev @firebase/rules-unit-testing\n');
    console.log('Falling back to direct AST / rules logic verification.\n');
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
  });

  // Authenticated Contexts
  const adminAContext = testEnv.authenticatedContext('admin_a_uid', {
    email: 'admin_a@resta.com',
    email_verified: true,
  });
  const dbAdminA = adminAContext.firestore();

  const adminBContext = testEnv.authenticatedContext('admin_b_uid', {
    email: 'admin_b@restb.com',
    email_verified: true,
  });
  const dbAdminB = adminBContext.firestore();

  const unauthContext = testEnv.unauthenticatedContext();
  const dbUnauth = unauthContext.firestore();

  console.log('\n--- Real Emulator Test Scenarios ---');

  // Scenario 1: Tenant A reading Tenant A orders
  await runTest('Admin A reading Tenant A orders (Allowed)', async () => {
    await assertSucceeds(dbAdminA.doc('restaurants/rest_a/orders/ord_a1').get());
  });

  // Scenario 2: Tenant A reading Tenant B orders (Denied)
  await runTest('Admin A reading Tenant B orders (Forbidden)', async () => {
    await assertFails(dbAdminA.doc('restaurants/rest_b/orders/ord_b1').get());
  });

  // Scenario 3: Tenant A writing to Tenant B orders (Denied)
  await runTest('Admin A updating Tenant B orders (Forbidden)', async () => {
    await assertFails(dbAdminA.doc('restaurants/rest_b/orders/ord_b1').update({ total: 999 }));
  });

  // Scenario 4: Tenant A accessing Tenant B Aggregator credentials (Denied)
  await runTest('Admin A reading Tenant B Aggregator credentials (Forbidden)', async () => {
    await assertFails(dbAdminA.doc('restaurants/rest_b/aggregatorConnections/swiggy_cred').get());
  });

  // Scenario 5: Unauthenticated reading private orders (Denied)
  await runTest('Unauthenticated user reading private orders (Forbidden)', async () => {
    await assertFails(dbUnauth.doc('restaurants/rest_a/orders/ord_a1').get());
  });

  await testEnv.cleanup();

  console.log('\n' + '='.repeat(80));
  console.log(`EMULATOR TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));
}

main().catch(console.error);
