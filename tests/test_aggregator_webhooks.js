/**
 * Abar Khabo: Stage 2 Part B — Step 5 Comprehensive Test Suite
 * Aggregator Connection State & Webhook Ingestion Pipeline (Mock / Sandbox)
 *
 * Covers all 16 mandatory testing requirements from the official Step 5 authorization:
 * 1. Mock Swiggy connection creation
 * 2. Mock Zomato connection creation
 * 3. Connection state transitions
 * 4. Invalid connection authorization
 * 5. Valid mock webhook signature
 * 6. Invalid webhook signature
 * 7. Replayed webhook rejection
 * 8. Duplicate event prevention
 * 9. Cross-tenant webhook isolation
 * 10. Cross-outlet webhook isolation
 * 11. Normalized order ingestion through trusted backend
 * 12. Retry after temporary processing failure
 * 13. Dead-letter handling
 * 14. Legacy mirror retry
 * 15. No credential exposure in client bundles or logs
 * 16. Existing POS, KDS, Cashier and customer ordering compatibility
 */

import { generateDeterministicOrderId, computeHmacSha256, verifyHmacSha256, validateTimestampDrift, generateWebhookEventId } from '../server/src/utils/cryptoUtils.js';
import { resolveFinancialRules, calculateOrderPricing } from '../server/src/config/financialConfig.js';
import { secretManagerService } from '../server/src/services/secretManagerService.js';
import { connectionService, CONNECTION_STATUSES, PROVIDERS, ENVIRONMENTS } from '../server/src/services/connectionService.js';
import { trustedOrderService, ORDER_STATUSES } from '../server/src/services/trustedOrderService.js';
import { webhookIngestionService, WEBHOOK_STATUSES, SIGNATURE_STATUSES } from '../server/src/services/webhookIngestionService.js';
import { logger } from '../server/src/utils/logger.js';
import fs from 'fs';

console.log('='.repeat(80));
console.log('  ABAR KHABO: STAGE 2 PART B — STEP 5 TEST SUITE');
console.log('  Aggregator Connection State & Webhook Ingestion Pipeline (Mock/Sandbox)');
console.log('='.repeat(80));

let passed = 0;
let failed = 0;

function assert(description, condition, extraInfo = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${description} ${extraInfo ? `(${extraInfo})` : ''}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK FIRESTORE MEMORY STORE FOR ISOLATED UNIT TESTING
// ─────────────────────────────────────────────────────────────────────────────
class MockMemoryFirestore {
  constructor() {
    this.store = new Map();
  }

  doc(path) {
    const self = this;
    return {
      path,
      async get() {
        const data = self.store.get(path);
        return {
          exists: data !== undefined,
          data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
        };
      },
      async set(data, options = {}) {
        if (options.merge && self.store.has(path)) {
          const current = self.store.get(path);
          self.store.set(path, { ...current, ...JSON.parse(JSON.stringify(data)) });
        } else {
          self.store.set(path, JSON.parse(JSON.stringify(data)));
        }
        return { writeTime: new Date() };
      },
      async update(data) {
        if (!self.store.has(path)) {
          throw new Error(`Document ${path} does not exist to update`);
        }
        const current = self.store.get(path);
        self.store.set(path, { ...current, ...JSON.parse(JSON.stringify(data)) });
        return { writeTime: new Date() };
      }
    };
  }

  collectionGroup(colId) {
    const self = this;
    return {
      where(field, op, value) {
        return {
          where(field2, op2, value2) {
            return {
              limit() {
                return {
                  async get() {
                    const results = [];
                    for (const [p, docData] of self.store.entries()) {
                      if (p.includes(`/${colId}/`)) {
                        if (docData[field] === value && docData[field2] === value2) {
                          results.push({ data: () => docData });
                        }
                      }
                    }
                    return { empty: results.length === 0, docs: results };
                  }
                };
              }
            };
          }
        };
      }
    };
  }

  async runTransaction(updateFunction) {
    const self = this;
    const transaction = {
      async get(docRef) {
        return docRef.get();
      },
      set(docRef, data) {
        self.store.set(docRef.path, JSON.parse(JSON.stringify(data)));
      },
      update(docRef, data) {
        const current = self.store.get(docRef.path) || {};
        self.store.set(docRef.path, { ...current, ...JSON.parse(JSON.stringify(data)) });
      }
    };
    return updateFunction(transaction);
  }
}

// Attach Mock DB to firebaseAdmin for standalone test execution
const mockDb = new MockMemoryFirestore();

// Seed Tenant Restaurant and Outlets in Mock DB
mockDb.store.set('restaurants/rest_a', {
  id: 'rest_a',
  name: 'Abar Khabo — Park Street',
  status: 'ACTIVE',
  taxRate: 5.0,
  currency: 'INR'
});

mockDb.store.set('restaurants/rest_a/outlets/rest_a_main', {
  outletId: 'rest_a_main',
  restaurantId: 'rest_a',
  outletName: 'Park Street Main Branch',
  status: 'ACTIVE',
  isDefaultOutlet: true
});

mockDb.store.set('restaurants/rest_a/outlets/rest_a_branch2', {
  outletId: 'rest_a_branch2',
  restaurantId: 'rest_a',
  outletName: 'Salt Lake Sector V Branch',
  status: 'ACTIVE',
  isDefaultOutlet: false
});

mockDb.store.set('restaurants/rest_b', {
  id: 'rest_b',
  name: 'Tenant B Bistro',
  status: 'ACTIVE'
});

mockDb.store.set('restaurants/rest_b/outlets/rest_b_main', {
  outletId: 'rest_b_main',
  restaurantId: 'rest_b',
  status: 'ACTIVE'
});

// Patch getDb to return mockDb during test run
import { setCustomDb } from '../server/src/config/firebaseAdmin.js';
setCustomDb(mockDb);

async function runAllTests() {
  // ── [SUITE 1] Mock Swiggy Connection Creation (Req 1, 15) ─────────────────────
  console.log('\n[SUITE 1] Mock Swiggy Connection Creation (Requirements 1 & 15)');
  {
    const swiggySecRef = secretManagerService.createSecretReference('rest_a', 'rest_a_main', 'SWIGGY', '1');
    secretManagerService.setMockSecret(swiggySecRef, 'mock_swiggy_secret_key_12345');

    const swiggyConn = await connectionService.createOrUpdateConnection('rest_a', 'rest_a_main', {
      provider: PROVIDERS.SWIGGY,
      externalRestaurantId: 'SW_REST_1001',
      connectionStatus: CONNECTION_STATUSES.CONNECTED,
      environment: ENVIRONMENTS.MOCK,
      secretReference: swiggySecRef,
      financialConfig: { commissionRate: 18.0, gstRate: 5.0 }
    });

    assert('Creates Swiggy connection document', swiggyConn.provider === 'SWIGGY');
    assert('Assigns correct outletId', swiggyConn.outletId === 'rest_a_main');
    assert('Sets externalRestaurantId', swiggyConn.externalRestaurantId === 'SW_REST_1001');
    assert('Sets secretReference path', swiggyConn.secretReference === swiggySecRef);
    assert('Does not store plaintext secrets in record', swiggyConn.apiKey === undefined && swiggyConn.clientSecret === undefined);
  }

  // ── [SUITE 2] Mock Zomato Connection Creation (Req 2, 15) ─────────────────────
  console.log('\n[SUITE 2] Mock Zomato Connection Creation (Requirements 2 & 15)');
  {
    const zomatoSecRef = secretManagerService.createSecretReference('rest_a', 'rest_a_main', 'ZOMATO', '1');
    secretManagerService.setMockSecret(zomatoSecRef, 'mock_zomato_secret_key_67890');

    const zomatoConn = await connectionService.createOrUpdateConnection('rest_a', 'rest_a_main', {
      provider: PROVIDERS.ZOMATO,
      externalRestaurantId: 'ZOM_REST_2002',
      connectionStatus: CONNECTION_STATUSES.CONNECTED,
      environment: ENVIRONMENTS.MOCK,
      secretReference: zomatoSecRef,
      financialConfig: { commissionRate: 20.0, gstRate: 5.0 }
    });

    assert('Creates Zomato connection document', zomatoConn.provider === 'ZOMATO');
    assert('Sets externalRestaurantId for Zomato', zomatoConn.externalRestaurantId === 'ZOM_REST_2002');
    assert('Sets custom Zomato commission rate (20%)', zomatoConn.financialConfig.commissionRate === 20.0);
  }

  // ── [SUITE 3] Connection State Transitions (Req 3) ───────────────────────────
  console.log('\n[SUITE 3] Connection State Transitions (Requirement 3)');
  {
    await connectionService.updateConnectionStatus('rest_a', 'rest_a_main', 'swiggy', CONNECTION_STATUSES.ERROR, {
      code: 'AUTH_EXPIRED',
      message: 'OAuth token expired'
    });
    let fetched = await connectionService.getConnection('rest_a', 'rest_a_main', 'swiggy');
    assert('Transitions to ERROR status', fetched.connectionStatus === CONNECTION_STATUSES.ERROR);
    assert('Captures error details', fetched.lastError.code === 'AUTH_EXPIRED');

    await connectionService.updateConnectionStatus('rest_a', 'rest_a_main', 'swiggy', CONNECTION_STATUSES.SUSPENDED);
    fetched = await connectionService.getConnection('rest_a', 'rest_a_main', 'swiggy');
    assert('Transitions to SUSPENDED status', fetched.connectionStatus === CONNECTION_STATUSES.SUSPENDED);

    await connectionService.updateConnectionStatus('rest_a', 'rest_a_main', 'swiggy', CONNECTION_STATUSES.CONNECTED);
    fetched = await connectionService.getConnection('rest_a', 'rest_a_main', 'swiggy');
    assert('Transitions back to CONNECTED status and clears error', fetched.connectionStatus === CONNECTION_STATUSES.CONNECTED && fetched.lastError === null);
  }

  // ── [SUITE 4] Invalid Connection Authorization & Secret Validation (Req 4) ───
  console.log('\n[SUITE 4] Invalid Connection Authorization & Validation (Requirement 4)');
  {
    let rejectedPlaintext = false;
    try {
      await connectionService.createOrUpdateConnection('rest_a', 'rest_a_main', {
        provider: 'SWIGGY',
        apiKey: 'plaintext_leaked_key'
      });
    } catch {
      rejectedPlaintext = true;
    }
    assert('Rejects connection creation with plaintext secret field', rejectedPlaintext);

    const inactiveCheck = connectionService.validateConnectionActive({
      connectionStatus: CONNECTION_STATUSES.DISCONNECTED,
      secretReference: 'valid_ref'
    });
    assert('Detects inactive disconnected connection', !inactiveCheck.active);

    const missingSecretCheck = connectionService.validateConnectionActive({
      connectionStatus: CONNECTION_STATUSES.CONNECTED,
      secretReference: ''
    });
    assert('Detects missing secretReference in connected status', !missingSecretCheck.active);
  }

  // ── [SUITE 5] HMAC-SHA256 Signature Verification (Req 5, 6) ──────────────────
  console.log('\n[SUITE 5] HMAC-SHA256 Signature Verification (Requirements 5 & 6)');
  {
    const secret = 'test_secret_abc123';
    const rawPayload = JSON.stringify({ orderId: 'SW-101', total: 500 });
    const validSignature = computeHmacSha256(rawPayload, secret);
    const tamperedPayload = JSON.stringify({ orderId: 'SW-101', total: 100 }); // Price tampered!

    assert('Valid HMAC signature returns true', verifyHmacSha256(rawPayload, secret, validSignature) === true);
    assert('Tampered payload signature returns false', verifyHmacSha256(tamperedPayload, secret, validSignature) === false);
    assert('Invalid secret signature returns false', verifyHmacSha256(rawPayload, 'wrong_secret', validSignature) === false);
    assert('Empty signature returns false safely', verifyHmacSha256(rawPayload, secret, '') === false);
  }

  // ── [SUITE 6] Replay Attack Mitigation (Timestamp Drift) (Req 7) ─────────────
  console.log('\n[SUITE 6] Webhook Replay Attack Mitigation (Requirement 7)');
  {
    const now = Date.now();
    const freshCheck = validateTimestampDrift(now, 300);
    assert('Fresh timestamp (< 5s drift) is accepted', freshCheck.valid === true);

    const stale10MinAgo = now - 600 * 1000;
    const staleCheck = validateTimestampDrift(stale10MinAgo, 300);
    assert('Stale timestamp (10 minutes old) is rejected as replay', staleCheck.valid === false);

    const futureDrift = now + 400 * 1000;
    const futureCheck = validateTimestampDrift(futureDrift, 300);
    assert('Future timestamp (> 5 minutes ahead) is rejected', futureCheck.valid === false);
  }

  // ── [SUITE 7] Webhook Event Deduplication & Processing (Req 8) ───────────────
  console.log('\n[SUITE 7] Webhook Event Deduplication & Processing (Requirement 8)');
  {
    const swiggySecret = await secretManagerService.getSecret(
      secretManagerService.createSecretReference('rest_a', 'rest_a_main', 'SWIGGY', '1')
    );

    const eventPayload = {
      eventId: 'EV_SWIGGY_UNIQUE_1',
      eventType: 'ORDER_PLACED',
      orderId: 'SW_EXT_8899',
      restaurantId: 'SW_REST_1001',
      customer: { name: 'Priya Mukherjee', phone: '+919830099887' },
      items: [{ id: 'biryani_01', name: 'Mutton Biryani', price: 400, quantity: 2, subtotal: 800 }],
      packagingCharge: 20
    };

    const rawBody = JSON.stringify(eventPayload);
    const signature = computeHmacSha256(rawBody, swiggySecret);
    const headers = {
      'x-event-id': 'EV_SWIGGY_UNIQUE_1',
      'x-signature': signature,
      'x-timestamp': Date.now()
    };

    // First Delivery
    const firstDelivery = await webhookIngestionService.processInboundWebhook({
      provider: 'SWIGGY',
      rawBody,
      headers,
      restaurantId: 'rest_a',
      outletId: 'rest_a_main'
    });

    assert('First webhook delivery is PROCESSED', firstDelivery.status === WEBHOOK_STATUSES.PROCESSED);
    assert('Generates authoritative order ID', firstDelivery.orderId !== undefined);

    // Duplicate Delivery (Replay of same event)
    const duplicateDelivery = await webhookIngestionService.processInboundWebhook({
      provider: 'SWIGGY',
      rawBody,
      headers,
      restaurantId: 'rest_a',
      outletId: 'rest_a_main'
    });

    assert('Duplicate webhook delivery returns DUPLICATE_IGNORED', duplicateDelivery.status === WEBHOOK_STATUSES.DUPLICATE_IGNORED);
    assert('Duplicate does not re-create order', duplicateDelivery.duplicate === true);
  }

  // ── [SUITE 8] Cross-Tenant & Cross-Outlet Isolation (Req 9, 10) ──────────────
  console.log('\n[SUITE 8] Cross-Tenant & Cross-Outlet Isolation (Requirements 9 & 10)');
  {
    const swiggySecret = await secretManagerService.getSecret(
      secretManagerService.createSecretReference('rest_a', 'rest_a_main', 'SWIGGY', '1')
    );

    const bodyObj = {
      eventId: 'EV_CROSS_TENANT_ATTACK',
      eventType: 'ORDER_PLACED',
      orderId: 'SW_EXT_HACK',
      customer: { name: 'Intruder' },
      items: [{ id: 'item1', name: 'Dosa', price: 100, quantity: 1, subtotal: 100 }]
    };
    const rawBody = JSON.stringify(bodyObj);
    const signature = computeHmacSha256(rawBody, swiggySecret);

    // Attempt routing to non-existent restaurant (Cross-tenant attempt)
    const crossTenantAttempt = await webhookIngestionService.processInboundWebhook({
      provider: 'SWIGGY',
      rawBody,
      headers: { 'x-event-id': 'EV_CROSS_TENANT_ATTACK', 'x-signature': signature, 'x-timestamp': Date.now() },
      restaurantId: 'rest_unknown_intruder',
      outletId: 'outlet_x'
    });
    assert('Cross-tenant webhook rejected: connection not found', crossTenantAttempt.success === false);

    // Attempt routing to non-existent outlet of Restaurant A
    const crossOutletAttempt = await webhookIngestionService.processInboundWebhook({
      provider: 'SWIGGY',
      rawBody,
      headers: { 'x-event-id': 'EV_CROSS_OUTLET_ATTACK', 'x-signature': signature, 'x-timestamp': Date.now() },
      restaurantId: 'rest_a',
      outletId: 'outlet_nonexistent'
    });
    assert('Cross-outlet webhook rejected: connection not found', crossOutletAttempt.success === false);
  }

  // ── [SUITE 9] Authoritative Order Ingestion via Trusted Backend (Req 11) ───────
  console.log('\n[SUITE 9] Normalized Order Ingestion via Trusted Backend (Requirement 11)');
  {
    const orderInput = {
      orderSource: 'ZOMATO',
      orderType: 'DELIVERY',
      restaurantId: 'rest_a',
      outletId: 'rest_a_main',
      externalOrderId: 'ZOM_88210',
      customer: { name: 'Ananya Sen', phone: '+919831122334' },
      items: [
        { id: 'chaap_01', name: 'Chicken Chaap', price: 250, quantity: 2, subtotal: 500 }
      ],
      charges: { packagingCharge: 30, discountAmount: 50 }
    };

    const zomatoConn = await connectionService.getConnection('rest_a', 'rest_a_main', 'zomato');
    const result = await trustedOrderService.ingestOrder(orderInput, zomatoConn);

    assert('Trusted order ingestion succeeds', result.success === true);
    assert('Generates deterministic order ID with ZOMATO prefix', result.orderId.startsWith('ZOMATO_'));
    assert('Calculates 5% GST on taxable base (₹450 * 5% = ₹22.50)', result.order.pricing.taxAmount === 22.5);
    assert('Applies configured 20% Zomato commission (₹450 * 20% = ₹90)', result.order.pricing.commissionAmount === 90);
    assert('Sets independent mirrorStatus object', typeof result.order.mirrorStatus === 'object');
    assert('Tenant subcollection mirror marked SYNCED', result.order.mirrorStatus.tenantSubcollection.status === 'SYNCED');
    assert('Root collection mirror marked SYNCED', result.order.mirrorStatus.rootCollection.status === 'SYNCED');
  }

  // ── [SUITE 10] Retry & Dead-Letter Handling (Req 12, 13) ──────────────────────
  console.log('\n[SUITE 10] Retry & Dead-Letter Handling (Requirements 12 & 13)');
  {
    // Simulate failing payload (throwing error during normalization)
    const badBody = {
      eventId: 'EV_CORRUPT_PAYLOAD_1',
      eventType: 'ORDER_PLACED',
      orderId: 'ERR_1',
      items: 'NOT_AN_ARRAY' // Causes normalization throw
    };

    const swiggySecret = await secretManagerService.getSecret(
      secretManagerService.createSecretReference('rest_a', 'rest_a_main', 'SWIGGY', '1')
    );
    const rawBadBody = JSON.stringify(badBody);
    const signature = computeHmacSha256(rawBadBody, swiggySecret);

    // Initial failure (attempt 1)
    const attempt1 = await webhookIngestionService.processInboundWebhook({
      provider: 'SWIGGY',
      rawBody: rawBadBody,
      headers: { 'x-event-id': 'EV_CORRUPT_PAYLOAD_1', 'x-signature': signature, 'x-timestamp': Date.now() },
      restaurantId: 'rest_a',
      outletId: 'rest_a_main'
    });
    assert('First failure records status FAILED and retryCount 1', attempt1.status === WEBHOOK_STATUSES.FAILED && attempt1.retryCount === 1);

    // Attempt 2
    const attempt2 = await webhookIngestionService.processInboundWebhook({
      provider: 'SWIGGY',
      rawBody: rawBadBody,
      headers: { 'x-event-id': 'EV_CORRUPT_PAYLOAD_1', 'x-signature': signature, 'x-timestamp': Date.now() },
      restaurantId: 'rest_a',
      outletId: 'rest_a_main'
    });
    assert('Second failure increments retryCount to 2', attempt2.retryCount === 2);

    // Attempt 3 (Reaches MAX_WEBHOOK_RETRIES = 3, moves to DEAD_LETTER)
    const attempt3 = await webhookIngestionService.processInboundWebhook({
      provider: 'SWIGGY',
      rawBody: rawBadBody,
      headers: { 'x-event-id': 'EV_CORRUPT_PAYLOAD_1', 'x-signature': signature, 'x-timestamp': Date.now() },
      restaurantId: 'rest_a',
      outletId: 'rest_a_main'
    });
    assert('Third consecutive failure moves event to DEAD_LETTER', attempt3.status === WEBHOOK_STATUSES.DEAD_LETTER);
  }

  // ── [SUITE 11] Legacy Mirror Retry (Req 14) ──────────────────────────────────
  console.log('\n[SUITE 11] Independent Legacy Mirror Retry (Requirement 14)');
  {
    // Create an order with simulated failed tenantSubcollection mirror
    const idGen = generateDeterministicOrderId('SWIGGY', 'rest_a', 'rest_a_main', 'SW_MIRROR_TEST');
    const orderDocPath = `aggregatorOrders/${idGen.orderId}`;
    mockDb.store.set(orderDocPath, {
      orderId: idGen.orderId,
      restaurantId: 'rest_a',
      outletId: 'rest_a_main',
      orderSource: 'SWIGGY',
      orderStatus: 'PLACED',
      pricing: { grandTotal: 300, itemTotal: 300, taxAmount: 0 },
      items: [{ id: '1', name: 'Roll', unitPrice: 300, quantity: 1, subtotal: 300 }],
      timestamps: { placedAt: new Date().toISOString() },
      mirrorStatus: {
        tenantSubcollection: { status: 'FAILED', destination: `restaurants/rest_a/onlineOrders/${idGen.orderId}`, attempts: 1, error: 'Network timeout' },
        rootCollection: { status: 'SYNCED', destination: `onlineOrders/${idGen.orderId}`, attempts: 1, error: null }
      }
    });

    // Retry only the tenantSubcollection destination
    const retryResult = await trustedOrderService.retryMirrorDestination(idGen.orderId, 'tenantSubcollection');
    assert('Retrying tenantSubcollection destination sets status to SYNCED', retryResult.tenantSubcollection.status === 'SYNCED');
    assert('Increments attempts counter to 2', retryResult.tenantSubcollection.attempts === 2);
    assert('Leaves rootCollection status untouched as SYNCED', retryResult.rootCollection.status === 'SYNCED');
  }

  // ── [SUITE 12] Zero Credential Exposure in Bundles or Logs (Req 15) ───────────
  console.log('\n[SUITE 12] Zero Credential Exposure in Bundles or Logs (Requirement 15)');
  {
    // Verify client bundle does not import secretManagerService
    const clientFiles = fs.readdirSync('client/src/services');
    assert('secretManagerService is NOT present in client/src/services', !clientFiles.includes('secretManagerService.js'));
    assert('webhookIngestionService is NOT present in client/src/services', !clientFiles.includes('webhookIngestionService.js'));

    // Verify structured logger redacts secret fields
    const testLogObj = {
      user: 'admin',
      password: 'super_secret_password',
      apiKey: 'xyz_key',
      clientSecret: 'shhh',
      customerPhone: '+919830012345'
    };
    const logOutput = JSON.parse(logger._format('INFO', 'Test log', testLogObj));
    assert('Logger redacts password to [REDACTED]', logOutput.password === '[REDACTED]');
    assert('Logger redacts apiKey to [REDACTED]', logOutput.apiKey === '[REDACTED]');
    assert('Logger redacts clientSecret to [REDACTED]', logOutput.clientSecret === '[REDACTED]');
    assert('Logger masks customer phone number', logOutput.customerPhone.includes('••••'));
  }

  // ── [SUITE 13] Backward Compatibility with POS, KDS, Cashier (Req 16) ────────
  console.log('\n[SUITE 13] Backward Compatibility with POS, KDS & Cashier (Requirement 16)');
  {
    const idGen = generateDeterministicOrderId('SWIGGY', 'rest_a', 'rest_a_main', 'SW_LEGACY_CHECK');
    const normalized = {
      orderId: idGen.orderId,
      restaurantId: 'rest_a',
      outletId: 'rest_a_main',
      orderSource: 'SWIGGY',
      orderStatus: 'PLACED',
      customer: { name: 'Tanmoy Das', phone: '+919876543210', deliveryAddress: { street: '12 Lake Road' } },
      items: [{ id: '1', name: 'Chicken Biryani', unitPrice: 350, quantity: 1, subtotal: 350, variant: 'Regular', addons: ['Raita'] }],
      pricing: { grandTotal: 368, itemTotal: 350, taxAmount: 18, deliveryCharge: 0 },
      payment: { status: 'PAID', method: 'ONLINE' },
      timestamps: { placedAt: new Date().toISOString() }
    };

    const legacyPayload = trustedOrderService.toLegacyMirrorPayload(normalized);
    assert('Mirror maps legacy orderId', legacyPayload.orderId === idGen.orderId);
    assert('Mirror maps customerName for legacy KDS', legacyPayload.customerName === 'Tanmoy Das');
    assert('Mirror maps legacy totalAmount field', legacyPayload.totalAmount === 368);
    assert('Mirror maps legacy status field', legacyPayload.status === 'PLACED');
    assert('Mirror flags isLegacyMirror: true', legacyPayload.isLegacyMirror === true);
    assert('Mirror references authoritative document path', legacyPayload.authoritativeRef === `aggregatorOrders/${idGen.orderId}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log(`STEP 5 UNIT TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
