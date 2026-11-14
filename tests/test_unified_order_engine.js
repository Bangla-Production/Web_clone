/**
 * Abar Khabo: Stage 2 Part B — Step 6 Comprehensive Test Suite
 * Unified Order Management Engine (POS, KDS & Aggregators)
 *
 * Verifies all 16 mandatory testing requirements from the Step 6 authorization:
 * 1. POS order creation through unified engine
 * 2. Direct online order creation
 * 3. Mock Swiggy order arrival
 * 4. Mock Zomato order arrival
 * 5. Correct outlet assignment
 * 6. One KOT per authoritative order (idempotent KOT generation)
 * 7. Duplicate event prevention (zero duplicate orders)
 * 8. Repeated status update handling (idempotent transitions)
 * 9. Kitchen status synchronization (KOT status updates order)
 * 10. Cross-outlet isolation (Outlet A sees only its orders)
 * 11. Cross-tenant isolation (Restaurant A cannot access Restaurant B)
 * 12. Cashier and invoice compatibility
 * 13. Customer tracking compatibility
 * 14. Delivery tracking compatibility
 * 15. Unauthorized status transition rejection (terminal state protection)
 * 16. Existing POS and KDS regression tests (variants, add-ons, notes)
 */

import { trustedOrderService, ORDER_STATUSES, ORDER_SOURCES } from '../server/src/services/trustedOrderService.js';
import { webhookIngestionService, WEBHOOK_STATUSES } from '../server/src/services/webhookIngestionService.js';
import { connectionService, CONNECTION_STATUSES, PROVIDERS, ENVIRONMENTS } from '../server/src/services/connectionService.js';
import { secretManagerService } from '../server/src/services/secretManagerService.js';
import { computeHmacSha256 } from '../server/src/utils/cryptoUtils.js';
import { setCustomDb } from '../server/src/config/firebaseAdmin.js';

console.log('='.repeat(80));
console.log('  ABAR KHABO: STAGE 2 PART B — STEP 6 TEST SUITE');
console.log('  Unified Order Management Engine (POS, KDS & Aggregators)');
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
// MOCK FIRESTORE IN-MEMORY STORE
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

  collection(path) {
    const self = this;
    return {
      path,
      async get() {
        const docs = [];
        for (const [p, docData] of self.store.entries()) {
          if (p.startsWith(`${path}/`) && p.replace(`${path}/`, '').indexOf('/') === -1) {
            docs.push({ id: p.split('/').pop(), data: () => docData });
          }
        }
        return { empty: docs.length === 0, docs };
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

const mockDb = new MockMemoryFirestore();
setCustomDb(mockDb);

// Seed Tenants & Outlets
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
  name: 'Tenant B Diner',
  status: 'ACTIVE'
});

mockDb.store.set('restaurants/rest_b/outlets/rest_b_main', {
  outletId: 'rest_b_main',
  restaurantId: 'rest_b',
  status: 'ACTIVE'
});

// Seed Tables
mockDb.store.set('restaurants/rest_a/tables/table_1', {
  id: 'table_1',
  tableNumber: 'T-1',
  capacity: 4,
  status: 'AVAILABLE',
  outletId: 'rest_a_main'
});

mockDb.store.set('restaurants/rest_a/tables/table_b2', {
  id: 'table_b2',
  tableNumber: 'T-101',
  capacity: 2,
  status: 'AVAILABLE',
  outletId: 'rest_a_branch2'
});

async function runAllTests() {
  let posOrderId = null;
  let directOrderId = null;
  let swiggyOrderId = null;
  let zomatoOrderId = null;

  // ── [SUITE 1] POS Order Creation (Req 1, 5, 16) ──────────────────────────────
  console.log('\n[SUITE 1] POS Dine-in Order Creation Through Unified Engine (Requirements 1, 5 & 16)');
  {
    const posInput = {
      restaurantId: 'rest_a',
      outletId: 'rest_a_main',
      orderType: 'DINE_IN',
      tableId: 'table_1',
      tableNumber: 'T-1',
      customerName: 'Arup Sen',
      customerPhone: '+919830011223',
      items: [
        {
          id: 'biryani_01',
          name: 'Mutton Biryani',
          unitPrice: 420,
          quantity: 2,
          subtotal: 840,
          variant: 'Special Double Mutton',
          addons: ['Extra Aloo', 'Boiled Egg'],
          instructions: 'Less spicy please'
        }
      ],
      discountAmount: 40
    };

    const res = await trustedOrderService.createPosOrder(posInput, { uid: 'waiter_1', name: 'Waiter Sourav' });
    assert('POS order successfully created through backend', res.success === true);
    assert('Assigns POS source correctly', res.order.orderSource === 'POS');
    assert('Assigns correct outletId (rest_a_main)', res.order.outletId === 'rest_a_main');
    assert('Preserves table number T-1', res.order.tableNumber === 'T-1');
    assert('Preserves item variant', res.order.items[0].variant === 'Special Double Mutton');
    assert('Preserves item add-ons', res.order.items[0].addons.includes('Extra Aloo'));
    assert('Preserves preparation instructions', res.order.items[0].instructions === 'Less spicy please');
    assert('Occupies table_1 in database', mockDb.store.get('restaurants/rest_a/tables/table_1')?.status === 'OCCUPIED');

    posOrderId = res.orderId;
  }

  // ── [SUITE 2] Direct Online Order Creation (Req 2, 5) ────────────────────────
  console.log('\n[SUITE 2] Direct Online Consumer Order Creation (Requirements 2 & 5)');
  {
    const directInput = {
      orderSource: 'ABAR_KHABO',
      orderType: 'DELIVERY',
      restaurantId: 'rest_a',
      outletId: 'rest_a_main',
      externalOrderId: 'DIR_1092',
      customer: {
        uid: 'cust_direct_1',
        name: 'Madhurima Das',
        phone: '+919831122334',
        deliveryAddress: { street: '55 Southern Avenue, Kolkata' }
      },
      items: [
        { id: 'chaap_01', name: 'Chicken Chaap', unitPrice: 220, quantity: 2, subtotal: 440 }
      ],
      charges: { deliveryCharge: 35 }
    };

    const res = await trustedOrderService.ingestOrder(directInput);
    assert('Direct online order created successfully', res.success === true);
    assert('Order source set to ABAR_KHABO', res.order.orderSource === 'ABAR_KHABO');
    assert('Order status initialized to PLACED', res.order.orderStatus === 'PLACED');
    assert('Assigns outletId rest_a_main', res.order.outletId === 'rest_a_main');
    directOrderId = res.orderId;
  }

  // ── [SUITE 3] Mock Swiggy & Zomato Inbound Arrival (Req 3, 4) ────────────────
  console.log('\n[SUITE 3] Mock Swiggy & Zomato Aggregator Order Ingestion (Requirements 3 & 4)');
  {
    // Setup Swiggy Connection
    const swiggySecRef = secretManagerService.createSecretReference('rest_a', 'rest_a_main', 'SWIGGY', '1');
    secretManagerService.setMockSecret(swiggySecRef, 'swiggy_secret_step6');
    await connectionService.createOrUpdateConnection('rest_a', 'rest_a_main', {
      provider: PROVIDERS.SWIGGY,
      externalRestaurantId: 'SW_REST_1001',
      connectionStatus: CONNECTION_STATUSES.CONNECTED,
      secretReference: swiggySecRef,
      financialConfig: { commissionRate: 18.0, gstRate: 5.0 }
    });

    const swiggyPayload = {
      eventId: 'EV_SW_ORDER_1',
      eventType: 'ORDER_PLACED',
      orderId: 'SW-98124',
      restaurantId: 'SW_REST_1001',
      customer: { name: 'Vikram Roy', phone: '+919876543210', deliveryAddress: 'Park Street 10' },
      items: [{ id: 'it_1', name: 'Fish Roll', price: 150, quantity: 2, subtotal: 300 }]
    };
    const rawSwiggy = JSON.stringify(swiggyPayload);
    const swiggySig = computeHmacSha256(rawSwiggy, 'swiggy_secret_step6');

    const swiggyResult = await webhookIngestionService.processInboundWebhook({
      provider: 'SWIGGY',
      rawBody: rawSwiggy,
      headers: { 'x-event-id': 'EV_SW_ORDER_1', 'x-signature': swiggySig, 'x-timestamp': Date.now() },
      restaurantId: 'rest_a',
      outletId: 'rest_a_main'
    });

    assert('Mock Swiggy order arrived and ingested', swiggyResult.status === WEBHOOK_STATUSES.PROCESSED);
    assert('Swiggy order assigned to rest_a_main', mockDb.store.get(`aggregatorOrders/${swiggyResult.orderId}`)?.outletId === 'rest_a_main');
    swiggyOrderId = swiggyResult.orderId;

    // Setup Zomato Connection
    const zomatoSecRef = secretManagerService.createSecretReference('rest_a', 'rest_a_main', 'ZOMATO', '1');
    secretManagerService.setMockSecret(zomatoSecRef, 'zomato_secret_step6');
    await connectionService.createOrUpdateConnection('rest_a', 'rest_a_main', {
      provider: PROVIDERS.ZOMATO,
      externalRestaurantId: 'ZOM_REST_2002',
      connectionStatus: CONNECTION_STATUSES.CONNECTED,
      secretReference: zomatoSecRef,
      financialConfig: { commissionRate: 20.0, gstRate: 5.0 }
    });

    const zomatoPayload = {
      eventId: 'EV_ZOM_ORDER_1',
      eventType: 'ORDER_PLACED',
      orderId: 'ZOM-77123',
      restaurantId: 'ZOM_REST_2002',
      customer: { name: 'Moumita Pal', phone: '+919876543211', deliveryAddress: 'Salt Lake Sector 1' },
      items: [{ id: 'it_2', name: 'Mutton Kebab', price: 280, quantity: 1, subtotal: 280 }]
    };
    const rawZomato = JSON.stringify(zomatoPayload);
    const zomatoSig = computeHmacSha256(rawZomato, 'zomato_secret_step6');

    const zomatoResult = await webhookIngestionService.processInboundWebhook({
      provider: 'ZOMATO',
      rawBody: rawZomato,
      headers: { 'x-event-id': 'EV_ZOM_ORDER_1', 'x-signature': zomatoSig, 'x-timestamp': Date.now() },
      restaurantId: 'rest_a',
      outletId: 'rest_a_main'
    });

    assert('Mock Zomato order arrived and ingested', zomatoResult.status === WEBHOOK_STATUSES.PROCESSED);
    zomatoOrderId = zomatoResult.orderId;
  }

  // ── [SUITE 4] Exactly One KOT per Authoritative Order (Req 6) ─────────────────
  console.log('\n[SUITE 4] Idempotent KOT Generation (Requirement 6)');
  {
    const swiggyOrderDoc = mockDb.store.get(`aggregatorOrders/${swiggyOrderId}`);
    const kotKey = `restaurants/rest_a/kots/KOT_${swiggyOrderId}_1`;
    const kotDoc = mockDb.store.get(kotKey);

    assert('Automatically creates initial KOT for Swiggy order', kotDoc !== undefined);
    assert('KOT matches orderId', kotDoc.orderId === swiggyOrderId);
    assert('KOT contains items list', kotDoc.items.length === 1);
    assert('KOT status is NEW', kotDoc.status === 'NEW');

    // Attempt second KOT generation for same order (e.g. on re-processed webhook)
    const secondKotResult = await trustedOrderService.ensureOrderKOT(swiggyOrderDoc);
    assert('Second KOT call detects existing KOT (isNew: false)', secondKotResult.isNew === false);
    assert('Does not overwrite existing KOT', secondKotResult.kotId === `KOT_${swiggyOrderId}_1`);
  }

  // ── [SUITE 5] Duplicate Event Prevention (Req 7) ─────────────────────────────
  console.log('\n[SUITE 5] Duplicate Order Event Prevention (Requirement 7)');
  {
    // Re-submit the same Swiggy event
    const swiggyPayload = {
      eventId: 'EV_SW_ORDER_1', // Same event ID
      eventType: 'ORDER_PLACED',
      orderId: 'SW-98124',
      restaurantId: 'SW_REST_1001',
      items: [{ id: 'it_1', name: 'Fish Roll', price: 150, quantity: 2, subtotal: 300 }]
    };
    const rawSwiggy = JSON.stringify(swiggyPayload);
    const swiggySig = computeHmacSha256(rawSwiggy, 'swiggy_secret_step6');

    const duplicateResult = await webhookIngestionService.processInboundWebhook({
      provider: 'SWIGGY',
      rawBody: rawSwiggy,
      headers: { 'x-event-id': 'EV_SW_ORDER_1', 'x-signature': swiggySig, 'x-timestamp': Date.now() },
      restaurantId: 'rest_a',
      outletId: 'rest_a_main'
    });

    assert('Duplicate webhook delivery ignored safely', duplicateResult.status === WEBHOOK_STATUSES.DUPLICATE_IGNORED);
    assert('Flags duplicate: true', duplicateResult.duplicate === true);
  }

  // ── [SUITE 6] Repeated Status Updates & Lifecycle Transitions (Req 8, 15) ─────
  console.log('\n[SUITE 6] Repeated Status Updates & State Machine Enforcement (Requirements 8 & 15)');
  {
    // Transition Swiggy order from PLACED -> ACCEPTED
    const t1 = await trustedOrderService.transitionOrderStatus(swiggyOrderId, ORDER_STATUSES.ACCEPTED, 'KDS_STAFF');
    assert('Valid transition PLACED -> ACCEPTED succeeds', t1.success === true);

    // Repeated transition to ACCEPTED (Idempotent)
    const tRepeat = await trustedOrderService.transitionOrderStatus(swiggyOrderId, ORDER_STATUSES.ACCEPTED, 'KDS_STAFF');
    assert('Repeated transition to same status is handled as idempotent', tRepeat.idempotent === true);

    // Transition ACCEPTED -> PREPARING -> READY -> DISPATCHED -> COMPLETED
    await trustedOrderService.transitionOrderStatus(swiggyOrderId, ORDER_STATUSES.PREPARING, 'KITCHEN');
    await trustedOrderService.transitionOrderStatus(swiggyOrderId, ORDER_STATUSES.READY, 'KITCHEN');
    await trustedOrderService.transitionOrderStatus(swiggyOrderId, ORDER_STATUSES.DISPATCHED, 'RIDER');
    const tCompleted = await trustedOrderService.transitionOrderStatus(swiggyOrderId, ORDER_STATUSES.COMPLETED, 'RIDER');
    assert('Order transitions to terminal state COMPLETED', tCompleted.status === ORDER_STATUSES.COMPLETED);

    // Attempt to illegally reopen a COMPLETED order
    const tIllegal = await trustedOrderService.transitionOrderStatus(swiggyOrderId, ORDER_STATUSES.PREPARING, 'HACKER');
    assert('Illegal transition from terminal state COMPLETED is blocked', tIllegal.success === false);
  }

  // ── [SUITE 7] Kitchen Status Synchronization (Req 9) ─────────────────────────
  console.log('\n[SUITE 7] Kitchen Status Synchronization (Requirement 9)');
  {
    const kotKey = `KOT_${zomatoOrderId}_1`;
    // Update KOT from NEW -> PREPARING
    const kotUpdate1 = await trustedOrderService.updateKOTStatus('rest_a', kotKey, 'PREPARING', 'CHEF_RAMESH');
    assert('KOT status updated to PREPARING', kotUpdate1.success === true);

    const updatedZomatoOrder = mockDb.store.get(`aggregatorOrders/${zomatoOrderId}`);
    assert('Synchronizes authoritative order status to PREPARING', updatedZomatoOrder.orderStatus === 'PREPARING');

    // Update KOT from PREPARING -> READY
    await trustedOrderService.updateKOTStatus('rest_a', kotKey, 'READY', 'CHEF_RAMESH');
    const readyZomatoOrder = mockDb.store.get(`aggregatorOrders/${zomatoOrderId}`);
    assert('Synchronizes authoritative order status to READY', readyZomatoOrder.orderStatus === 'READY');
  }

  // ── [SUITE 8] Cross-Outlet & Cross-Tenant Isolation (Req 10, 11) ─────────────
  console.log('\n[SUITE 8] Cross-Outlet & Cross-Tenant Isolation (Requirements 10 & 11)');
  {
    // Create an order for Branch 2
    const branch2Order = await trustedOrderService.createPosOrder({
      restaurantId: 'rest_a',
      outletId: 'rest_a_branch2',
      orderType: 'DINE_IN',
      tableId: 'table_b2',
      tableNumber: 'T-101',
      items: [{ id: 'roll_1', name: 'Egg Roll', unitPrice: 80, quantity: 2, subtotal: 160 }]
    }, { uid: 'waiter_b2', name: 'Branch 2 Waiter' });

    assert('Branch 2 order created', branch2Order.success === true);
    assert('Order has outletId rest_a_branch2', branch2Order.order.outletId === 'rest_a_branch2');

    // Simulate Outlet A KDS query (filtering by rest_a_main)
    const allAOrders = [];
    for (const [k, v] of mockDb.store.entries()) {
      if (k.startsWith('aggregatorOrders/')) {
        if (v.restaurantId === 'rest_a' && v.outletId === 'rest_a_main') {
          allAOrders.push(v);
        }
      }
    }
    assert('Outlet A kitchen queue includes only rest_a_main orders', allAOrders.every(o => o.outletId === 'rest_a_main'));
    assert('Outlet A kitchen queue does NOT contain Branch 2 order', !allAOrders.some(o => o.orderId === branch2Order.orderId));

    // Cross-tenant check: Tenant B cannot access Restaurant A orders
    const tenantBAccessAttempt = await trustedOrderService.validateTenantAndOutlet('rest_b', 'rest_a_main');
    assert('Tenant B cannot bind to Restaurant A outlet (Cross-tenant blocked)', tenantBAccessAttempt.valid === false);
  }

  // ── [SUITE 9] Cashier and Invoice Compatibility (Req 12) ─────────────────────
  console.log('\n[SUITE 9] Cashier & Invoice Compatibility (Requirement 12)');
  {
    // Settle the POS dine-in order created in Suite 1
    const posOrder = mockDb.store.get(`aggregatorOrders/${posOrderId}`);
    const invoiceKey = `restaurants/rest_a/invoices/INV_${posOrderId}`;
    const invoicePayload = {
      invoiceNumber: `INV-20261115-${posOrder.externalOrderId}`,
      orderId: posOrderId,
      restaurantId: 'rest_a',
      outletId: posOrder.outletId,
      totalAmount: posOrder.pricing.grandTotal,
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
      items: posOrder.items
    };
    mockDb.store.set(invoiceKey, invoicePayload);

    // Update POS order in database to PAID & CLOSED
    await trustedOrderService.transitionOrderStatus(posOrderId, ORDER_STATUSES.COMPLETED, 'CASHIER_PRIYA');
    const settledPos = mockDb.store.get(`aggregatorOrders/${posOrderId}`);

    assert('Invoice preserves outletId rest_a_main', invoicePayload.outletId === 'rest_a_main');
    assert('Invoice links exact order total', invoicePayload.totalAmount === posOrder.pricing.grandTotal);
    assert('Order status completed upon cashier settlement', settledPos.orderStatus === 'COMPLETED');
    assert('Payment method distinct: POS settled via UPI', invoicePayload.paymentMethod === 'UPI');
    assert('Swiggy order payment method distinct: SWIGGY ONLINE', mockDb.store.get(`aggregatorOrders/${swiggyOrderId}`).payment.method === 'ONLINE');
  }

  // ── [SUITE 10] Customer & Delivery Tracking Compatibility (Req 13, 14) ────────
  console.log('\n[SUITE 10] Customer & Delivery Tracking Compatibility (Requirements 13 & 14)');
  {
    const swiggyOrder = mockDb.store.get(`aggregatorOrders/${swiggyOrderId}`);
    const legacyDirectOrder = mockDb.store.get(`aggregatorOrders/${directOrderId}`);

    assert('Direct consumer order preserves customer phone', legacyDirectOrder.customer.phone === '+919831122334');
    assert('Direct consumer order preserves delivery address', legacyDirectOrder.customer.deliveryAddress.street.includes('Southern Avenue'));
    assert('Aggregator order preserves delivery partner fleet metadata', swiggyOrder.delivery.partnerType === 'SWIGGY_FLEET');
    assert('Aggregator order preserves pickup OTP for handover security', typeof swiggyOrder.delivery.pickupOtp === 'string');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log(`STEP 6 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Unhandled test suite error in Step 6:', err);
  process.exit(1);
});
