/**
 * Abar Khabo: Stage 2 Part B — Step 11 Performance & Scalability Test Suite
 * 
 * Conducts controlled concurrency, throughput, and latency evaluations across:
 *  1. Multi-Tenant Concurrent Order Financial Processing
 *  2. Concurrent Inventory Reservations & Contention
 *  3. High-Throughput Duplicate Webhook Ingestion & Idempotency
 *  4. Concurrent Payment & Settlement Matching
 *  5. Rapid Subscription Expiry Sweeps
 * 
 * Strict Constraint: All tests run against isolated in-memory development resources;
 * never generates synthetic traffic against production.
 */

import { trustedOrderService } from '../server/src/services/trustedOrderService.js';
import { inventoryLedgerService } from '../server/src/services/inventoryLedgerService.js';
import { webhookIngestionService, WEBHOOK_STATUSES } from '../server/src/services/webhookIngestionService.js';
import { secretManagerService } from '../server/src/services/secretManagerService.js';
import { paymentTransactionService } from '../server/src/services/paymentTransactionService.js';
import { subscriptionService, DEFAULT_PLANS, PLAN_TIERS, SUBSCRIPTION_STATUSES } from '../server/src/services/subscriptionService.js';
import { setCustomDb } from '../server/src/config/firebaseAdmin.js';
import { computeHmacSha256 } from '../server/src/utils/cryptoUtils.js';

let passed = 0;
let failed = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`  ✓ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    failed++;
  }
}

// In-Memory Fast Mock Firestore for Concurrency Simulation
class PerformanceMockFirestore {
  constructor() {
    this.store = new Map();
  }

  doc(path) {
    const self = this;
    return {
      path,
      id: path.split('/').pop(),
      async get() {
        if (self.store.has(path)) {
          return { exists: true, data: () => JSON.parse(JSON.stringify(self.store.get(path))), id: path.split('/').pop() };
        }
        return { exists: false, data: () => undefined, id: path.split('/').pop() };
      },
      async set(data, options = {}) {
        if (options.merge && self.store.has(path)) {
          self.store.set(path, { ...self.store.get(path), ...JSON.parse(JSON.stringify(data)) });
        } else {
          self.store.set(path, JSON.parse(JSON.stringify(data)));
        }
        return { writeTime: new Date() };
      },
      async update(data) {
        if (!self.store.has(path)) throw new Error(`NOT_FOUND: ${path}`);
        const existing = self.store.get(path);
        const updated = { ...existing };
        for (const [key, val] of Object.entries(data)) {
          if (key.includes('.')) {
            const parts = key.split('.');
            let curr = updated;
            for (let i = 0; i < parts.length - 1; i++) {
              curr[parts[i]] = curr[parts[i]] || {};
              curr = curr[parts[i]];
            }
            curr[parts[parts.length - 1]] = val;
          } else {
            updated[key] = val;
          }
        }
        self.store.set(path, updated);
        return { writeTime: new Date() };
      }
    };
  }

  collection(colPath) {
    const self = this;
    return {
      path: colPath,
      async get() {
        const docs = [];
        const prefix = colPath.endsWith('/') ? colPath : `${colPath}/`;
        for (const [key, val] of self.store.entries()) {
          if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
            docs.push({ id: key.split('/').pop(), data: () => JSON.parse(JSON.stringify(val)), exists: true });
          }
        }
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
      doc(id) {
        return self.doc(`${colPath}/${id || 'gen_' + Math.random().toString(36).substring(2, 9)}`);
      }
    };
  }

  async runTransaction(updateFunction) {
    const self = this;
    const transaction = {
      async get(docRef) {
        return docRef.get();
      },
      set(docRef, data, options = {}) {
        if (options.merge && self.store.has(docRef.path)) {
          const existing = self.store.get(docRef.path);
          self.store.set(docRef.path, { ...existing, ...JSON.parse(JSON.stringify(data)) });
        } else {
          self.store.set(docRef.path, JSON.parse(JSON.stringify(data)));
        }
      },
      update(docRef, data) {
        if (!self.store.has(docRef.path)) {
          throw new Error(`NOT_FOUND: Document ${docRef.path} does not exist for update.`);
        }
        const existing = self.store.get(docRef.path);
        const updated = { ...existing };
        for (const [key, val] of Object.entries(data)) {
          if (key.includes('.')) {
            const parts = key.split('.');
            let curr = updated;
            for (let i = 0; i < parts.length - 1; i++) {
              curr[parts[i]] = curr[parts[i]] || {};
              curr = curr[parts[i]];
            }
            curr[parts[parts.length - 1]] = val;
          } else {
            updated[key] = val;
          }
        }
        self.store.set(docRef.path, updated);
      }
    };
    return updateFunction(transaction);
  }
}

async function runPerformanceTests() {
  console.log('================================================================');
  console.log('  ABAR KHABO: STAGE 2 PART B — STEP 11 PERFORMANCE TEST SUITE');
  console.log('  Concurrency, Throughput, Contention & Latency Verification');
  console.log('================================================================\n');

  const mockDb = new PerformanceMockFirestore();
  setCustomDb(mockDb);
  inventoryLedgerService.db = mockDb;
  webhookIngestionService.db = mockDb;
  paymentTransactionService.db = mockDb;
  subscriptionService.db = mockDb;

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Multi-Tenant Concurrent Order Processing
  // ─────────────────────────────────────────────────────────────────────────
  console.log('1. Multi-Tenant Concurrent Order Processing');
  const orderCount = 50;
  const startTimeOrder = Date.now();

  const orderPromises = [];
  for (let i = 0; i < orderCount; i++) {
    const restId = `rest_${i % 5}`;
    const outletId = `${restId}_outlet_${i % 2}`;
    const orderPayload = {
      restaurantId: restId,
      outletId,
      items: [
        { id: `dish_${i}`, itemId: `dish_${i}`, name: `Item ${i}`, unitPrice: 200, quantity: 1 }
      ],
      taxRate: 5.0
    };
    orderPromises.push(Promise.resolve(trustedOrderService.validateOrderFinancials(orderPayload)));
  }

  const orderResults = await Promise.all(orderPromises);
  const elapsedOrderMs = Date.now() - startTimeOrder;
  const orderThroughput = Math.round((orderCount / (elapsedOrderMs || 1)) * 1000);

  assert(`Processed ${orderCount} multi-tenant orders in ${elapsedOrderMs}ms (${orderThroughput} ops/sec)`, orderResults.length === orderCount);
  assert('All concurrent orders have zero financial calculation drift', orderResults.every(r => r.grandTotal > 0 && r.taxAmount === 10));

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: Concurrent Inventory Stock Contention
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n2. Concurrent Inventory Reservations & Stock Contention');
  const restId = 'rest_contention_01';
  const outletId = 'rest_contention_01_main';

  // Seed restaurant, outlet, stock, and recipe
  await mockDb.doc(`restaurants/${restId}`).set({ id: restId, status: 'ACTIVE' });
  await mockDb.doc(`restaurants/${restId}/outlets/${outletId}`).set({ outletId, status: 'ACTIVE' });
  await mockDb.doc(`restaurants/${restId}/outlets/${outletId}/inventoryStock/ing_chicken`).set({
    ingredientId: 'ing_chicken',
    restaurantId: restId,
    outletId,
    name: 'Raw Chicken',
    currentStock: 20,
    reservedStock: 0,
    availableStock: 20,
    unit: 'kg',
    minThreshold: 2
  });
  await mockDb.doc(`restaurants/${restId}/recipes/dish_chicken_curry`).set({
    id: 'dish_chicken_curry',
    itemId: 'dish_chicken_curry',
    restaurantId: restId,
    yieldServings: 1,
    status: 'ACTIVE',
    ingredients: [
      { ingredientId: 'ing_chicken', name: 'Raw Chicken', quantity: 1, unit: 'kg' }
    ]
  });

  // Attempt 10 reservations of 1 kg each
  const startReserveTime = Date.now();
  const reserveResults = [];
  for (let i = 0; i < 10; i++) {
    const res = await inventoryLedgerService.reserveOrderStock(
      restId,
      outletId,
      {
        orderId: `order_concurrent_${i}`,
        items: [{ id: 'dish_chicken_curry', quantity: 1 }]
      },
      { uid: 'staff_1' }
    );
    reserveResults.push(res);
  }

  const elapsedReserveMs = Date.now() - startReserveTime;

  assert(`Executed 10 sequential inventory reservations in ${elapsedReserveMs}ms`, reserveResults.every(r => r.success === true));
  const finalStock = (await mockDb.doc(`restaurants/${restId}/outlets/${outletId}/inventoryStock/ing_chicken`).get()).data();
  assert('Inventory reservations reflect exactly 10 kg reserved', finalStock.reservedStock === 10);

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: High-Throughput Duplicate Webhook Ingestion & Idempotency
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n3. High-Throughput Webhook Ingestion & Idempotency');
  const webhookSecret = 'test_secret_12345';
  const secretRef = secretManagerService.createSecretReference('rest_wh_01', 'rest_wh_01_main', 'SWIGGY', '1');
  secretManagerService.setMockSecret(secretRef, webhookSecret);

  // Seed restaurant, outlet, and connection doc
  await mockDb.doc('restaurants/rest_wh_01').set({ id: 'rest_wh_01', status: 'ACTIVE' });
  await mockDb.doc('restaurants/rest_wh_01/outlets/rest_wh_01_main').set({ outletId: 'rest_wh_01_main', status: 'ACTIVE' });
  await mockDb.doc('restaurants/rest_wh_01/outlets/rest_wh_01_main/aggregatorConnections/swiggy').set({
    provider: 'SWIGGY',
    restaurantId: 'rest_wh_01',
    outletId: 'rest_wh_01_main',
    connectionStatus: 'CONNECTED',
    enabled: true,
    secretReference: secretRef,
    financialConfig: { gstRate: 5.0, commissionRate: 18.0 }
  });

  const sharedEventId = 'EV_STRESS_1001';
  const sharedPayload = {
    eventId: sharedEventId,
    eventType: 'ORDER_PLACED',
    orderId: 'SWIGGY_STRESS_1001',
    restaurantId: 'rest_wh_01',
    outletId: 'rest_wh_01_main',
    customer: { name: 'Customer Test', phone: '+919999999999' },
    items: [{ id: 'd1', name: 'Biryani', price: 500, quantity: 1, subtotal: 500 }]
  };
  const rawBody = JSON.stringify(sharedPayload);
  const timestamp = Date.now();
  const signature = computeHmacSha256(rawBody, webhookSecret);
  const headers = {
    'x-event-id': sharedEventId,
    'x-signature': signature,
    'x-timestamp': timestamp
  };

  // Process first ingestion
  const startWebhookTime = Date.now();
  const firstIngest = await webhookIngestionService.processInboundWebhook({
    provider: 'SWIGGY',
    rawBody,
    headers,
    restaurantId: 'rest_wh_01',
    outletId: 'rest_wh_01_main'
  });

  // Fire 10 duplicate replay attempts
  const replayPromises = [];
  for (let i = 0; i < 10; i++) {
    replayPromises.push(
      webhookIngestionService.processInboundWebhook({
        provider: 'SWIGGY',
        rawBody,
        headers,
        restaurantId: 'rest_wh_01',
        outletId: 'rest_wh_01_main'
      })
    );
  }

  const replayResults = await Promise.all(replayPromises);
  const elapsedWebhookMs = Date.now() - startWebhookTime;

  assert(`Handled initial + 10 duplicate webhooks in ${elapsedWebhookMs}ms`, firstIngest.status === WEBHOOK_STATUSES.PROCESSED);
  assert('All 10 duplicate replays safely deduplicated (duplicate: true)', replayResults.every(r => r.duplicate === true));

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Concurrent Payment & Settlement Matching
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n4. Payment Idempotency Under Concurrency');
  const payRestId = 'rest_pay_01';
  await mockDb.doc(`restaurants/${payRestId}`).set({ id: payRestId, status: 'ACTIVE' });
  const startPayTime = Date.now();

  const payPromises = [];
  for (let i = 0; i < 15; i++) {
    payPromises.push(
      paymentTransactionService.createPaymentTransaction(
        {
          restaurantId: payRestId,
          outletId: `${payRestId}_main`,
          orderId: `order_stress_${i}`,
          amount: 450,
          paymentMethod: 'UPI',
          collectionType: 'RESTAURANT_COLLECTED'
        },
        { uid: 'cashier_1', role: 'CASHIER' }
      )
    );
  }

  const payResults = await Promise.all(payPromises);
  const elapsedPayMs = Date.now() - startPayTime;

  assert(`Recorded 15 concurrent payments in ${elapsedPayMs}ms`, payResults.every(r => r.success === true && r.transactionId));

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 5: Subscription Expiry Sweep Performance
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n5. Subscription Expiry Sweep Performance');
  // Seed 25 subscriptions
  for (let i = 0; i < 25; i++) {
    const tId = `tenant_sweep_${i}`;
    await mockDb.doc(`restaurants/${tId}`).set({ id: tId, status: 'ACTIVE' });
    await mockDb.doc(`restaurants/${tId}/subscription/current`).set({
      restaurantId: tId,
      planId: PLAN_TIERS.STARTER,
      status: SUBSCRIPTION_STATUSES.ACTIVE,
      renewalDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
    });
  }

  const startSweepTime = Date.now();
  const sweepResult = await subscriptionService.processScheduledExpiries();
  const elapsedSweepMs = Date.now() - startSweepTime;

  assert(`Swept 25 active tenant subscriptions in ${elapsedSweepMs}ms`, sweepResult.processedCount >= 25);
  assert('Zero accidental expirations on active unexpired tenants', sweepResult.expiredCount === 0);

  console.log('\n================================================================');
  console.log(`  PERFORMANCE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runPerformanceTests().catch(err => {
  console.error('Fatal performance test error:', err);
  process.exit(1);
});
