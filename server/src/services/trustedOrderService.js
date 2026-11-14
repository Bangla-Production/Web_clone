/**
 * Abar Khabo: Authoritative Trusted Order Service (Backend / Firebase Admin SDK)
 * Executes authoritative order ingestion, cryptographic idempotency enforcement,
 * financial rule calculation, and independent per-destination legacy mirroring.
 *
 * Single Source of Truth: aggregatorOrders/{orderId}
 */

import { getDb } from '../config/firebaseAdmin.js';
import { generateDeterministicOrderId } from '../utils/cryptoUtils.js';
import { resolveFinancialRules, calculateOrderPricing } from '../config/financialConfig.js';
import logger from '../utils/logger.js';
import { inventoryLedgerService } from './inventoryLedgerService.js';
import { paymentTransactionService, PAYMENT_METHODS, PAYMENT_STATUSES, PAYMENT_SOURCES } from './paymentTransactionService.js';

export const ORDER_SOURCES = {
  SWIGGY: 'SWIGGY',
  ZOMATO: 'ZOMATO',
  ABAR_KHABO: 'ABAR_KHABO',
  POS: 'POS',
  TAKEAWAY: 'TAKEAWAY'
};

export const ORDER_STATUSES = {
  PLACED: 'PLACED',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  DISPATCHED: 'DISPATCHED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED'
};

export const TERMINAL_STATUSES = new Set([
  ORDER_STATUSES.COMPLETED,
  ORDER_STATUSES.CANCELLED,
  ORDER_STATUSES.REJECTED
]);

class TrustedOrderService {
  /**
   * Independently validates that tenant and outlet exist and are operational.
   */
  async validateTenantAndOutlet(restaurantId, outletId) {
    const db = getDb();
    
    // Check tenant existence
    const restSnap = await db.doc(`restaurants/${restaurantId}`).get();
    if (!restSnap.exists) {
      return { valid: false, reason: `Tenant restaurant "${restaurantId}" does not exist` };
    }

    // Check outlet existence
    const outletSnap = await db.doc(`restaurants/${restaurantId}/outlets/${outletId}`).get();
    if (!outletSnap.exists) {
      // Check if synthetic default outlet should be verified
      if (outletId === `${restaurantId}_main`) {
        return { valid: true, outletData: restSnap.data() };
      }
      return { valid: false, reason: `Outlet "${outletId}" does not exist for restaurant "${restaurantId}"` };
    }

    const outletData = outletSnap.data();
    if (outletData.status && outletData.status !== 'ACTIVE') {
      return { valid: false, reason: `Outlet "${outletId}" is currently ${outletData.status}` };
    }

    return { valid: true, outletData, restData: restSnap.data() };
  }

  /**
   * Ingests an order authoritatively inside a Firestore transaction.
   * Guarantees that duplicate submissions are deduplicated without duplicate KOTs or stock deductions.
   */
  async ingestOrder(orderPayload, connectionConfig = null) {
    const db = getDb();
    const source = String(orderPayload.orderSource || ORDER_SOURCES.ABAR_KHABO).toUpperCase();
    const restaurantId = String(orderPayload.restaurantId).trim();
    const outletId = String(orderPayload.outletId).trim();
    const externalOrderId = String(orderPayload.externalOrderId || `EXT_${Date.now()}`).trim();

    // 1. Independent tenant & outlet validation
    const valResult = await this.validateTenantAndOutlet(restaurantId, outletId);
    if (!valResult.valid) {
      logger.error('Order ingestion rejected: Invalid tenant or outlet', {
        restaurantId,
        outletId,
        reason: valResult.reason
      });
      return { success: false, reason: valResult.reason, status: 'REJECTED' };
    }

    // 2. Cryptographic deterministic order ID & canonical tuple
    const idGen = generateDeterministicOrderId(source, restaurantId, outletId, externalOrderId);
    const orderId = idGen.orderId;
    const orderDocRef = db.doc(`aggregatorOrders/${orderId}`);

    // 3. Resolve dynamic financial rules from outlet/connection settings
    const financialRules = resolveFinancialRules(
      valResult.restData,
      valResult.outletData,
      connectionConfig
    );

    // 4. Calculate authoritative immutable financial snapshot
    const pricing = calculateOrderPricing(
      orderPayload.items || [],
      orderPayload.charges || orderPayload.pricing || {},
      financialRules
    );

    const now = new Date().toISOString();

    // 4b. Pre-transaction check for duplicate order delivery
    const existingCheck = await orderDocRef.get();
    if (existingCheck.exists) {
      const existingData = existingCheck.data();
      logger.info('Duplicate order delivery detected — returning existing record', {
        orderId,
        canonicalKey: idGen.canonicalKey,
        existingStatus: existingData.orderStatus
      });
      return {
        success: true,
        status: 'DUPLICATE_IGNORED',
        orderId,
        order: existingData,
        isDuplicate: true
      };
    }

    // 4c. Inventory stock reservation check
    let reservationResult = { success: true, reserved: false, requiredIngredients: [] };
    try {
      reservationResult = await inventoryLedgerService.reserveOrderStock(
        restaurantId,
        outletId,
        { ...orderPayload, orderId },
        { uid: source, role: 'order_source', name: source }
      );
    } catch (invErr) {
      logger.error('Inventory reservation error during order ingestion', { error: invErr.message, orderId });
    }

    if (!reservationResult.success && reservationResult.reason === 'INSUFFICIENT_STOCK') {
      logger.warn('Order rejected due to insufficient stock', {
        orderId,
        details: reservationResult.details
      });
      return {
        success: false,
        status: 'INSUFFICIENT_STOCK',
        orderId,
        reason: `Insufficient stock for ingredient: ${reservationResult.details?.ingredientName || reservationResult.details?.ingredientId}`,
        details: reservationResult.details
      };
    }

    // 5. Transaction-safe ingestion and deduplication
    const result = await db.runTransaction(async (transaction) => {
      const existingSnap = await transaction.get(orderDocRef);

      if (existingSnap.exists) {
        const existingData = existingSnap.data();
        logger.info('Duplicate order delivery detected — returning existing record', {
          orderId,
          canonicalKey: idGen.canonicalKey,
          existingStatus: existingData.orderStatus
        });
        return {
          success: true,
          status: 'DUPLICATE_IGNORED',
          orderId,
          order: existingData,
          isDuplicate: true
        };
      }

      // Format canonical normalized order document
      const normalizedOrder = {
        _schemaVersion: '2.0.0',
        orderId,
        externalOrderId,
        canonicalKey: idGen.canonicalKey,
        idempotencyHash: idGen.sha256Hash,
        orderSource: source,
        orderType: orderPayload.orderType || 'DELIVERY',
        restaurantId,
        outletId,
        compositeKey: `${restaurantId}#${outletId}`,
        outletName: valResult.outletData?.outletName || valResult.restData?.name || outletId,

        tableId: orderPayload.tableId || null,
        tableNumber: orderPayload.tableNumber || null,
        waiterId: orderPayload.waiterId || null,
        waiterName: orderPayload.waiterName || null,

        customer: {
          uid: orderPayload.customer?.uid || null,
          name: orderPayload.customer?.name || 'Customer',
          phone: orderPayload.customer?.phone || '',
          email: orderPayload.customer?.email || '',
          deliveryAddress: orderPayload.customer?.deliveryAddress || null
        },

        items: (orderPayload.items || []).map((item, idx) => ({
          id: item.id || `item_${idx + 1}`,
          name: item.name || 'Menu Item',
          category: item.category || 'Main Course',
          variant: item.variant || null,
          addons: item.addons || [],
          unitPrice: Number(item.unitPrice || item.price || 0),
          quantity: Number(item.quantity || 1),
          subtotal: Number(item.subtotal || ((item.unitPrice || item.price || 0) * (item.quantity || 1))),
          taxRate: financialRules.gstRate,
          taxAmount: Number((((item.subtotal || 0) * financialRules.gstRate) / 100).toFixed(2)),
          instructions: item.instructions || ''
        })),

        pricing,

        payment: {
          status: orderPayload.payment?.status || (source === 'SWIGGY' || source === 'ZOMATO' ? 'PAID' : 'PENDING'),
          method: orderPayload.payment?.method || (source === 'SWIGGY' || source === 'ZOMATO' ? 'ONLINE' : 'CASH'),
          provider: orderPayload.payment?.provider || source,
          transactionId: orderPayload.payment?.transactionId || `TXN_${idGen.sha256Hash.substring(0, 12)}`,
          paidAt: orderPayload.payment?.paidAt || (source === 'SWIGGY' || source === 'ZOMATO' ? now : null)
        },

        delivery: {
          partnerType: orderPayload.delivery?.partnerType || `${source}_FLEET`,
          riderId: orderPayload.delivery?.riderId || null,
          riderName: orderPayload.delivery?.riderName || null,
          riderPhone: orderPayload.delivery?.riderPhone || null,
          riderCoordinates: orderPayload.delivery?.riderCoordinates || null,
          pickupOtp: orderPayload.delivery?.pickupOtp || String(Math.floor(1000 + Math.random() * 9000)),
          estimatedPrepTimeMinutes: Number(orderPayload.delivery?.estimatedPrepTimeMinutes || 25),
          estimatedDeliveryTimeMinutes: Number(orderPayload.delivery?.estimatedDeliveryTimeMinutes || 45)
        },

        orderStatus: ORDER_STATUSES.PLACED,
        statusHistory: [
          { status: ORDER_STATUSES.PLACED, timestamp: now, actor: source }
        ],

        // Independent per-destination mirroring tracking
        mirrorStatus: {
          tenantSubcollection: {
            status: 'PENDING',
            destination: `restaurants/${restaurantId}/onlineOrders/${orderId}`,
            attempts: 0,
            lastAttemptAt: null,
            lastSyncedAt: null,
            error: null
          },
          rootCollection: {
            status: 'PENDING',
            destination: `onlineOrders/${orderId}`,
            attempts: 0,
            lastAttemptAt: null,
            lastSyncedAt: null,
            error: null
          }
        },

        timestamps: {
          placedAt: now,
          acceptedAt: null,
          preparingAt: null,
          readyAt: null,
          dispatchedAt: null,
          completedAt: null,
          cancelledAt: null
        },

        cancellation: {
          cancelledBy: null,
          reason: null,
          refundStatus: null
        },

        inventorySnapshot: {
          status: reservationResult.reserved ? 'RESERVED' : 'NOT_CONFIGURED',
          requiredIngredients: reservationResult.requiredIngredients || [],
          ledgerEntries: reservationResult.ledgerEntries || [],
          reservedAt: reservationResult.reserved ? now : null,
          consumedAt: null
        },

        createdAt: now,
        updatedAt: now
      };

      transaction.set(orderDocRef, normalizedOrder);
      return { success: true, status: 'INGESTED', orderId, order: normalizedOrder, isDuplicate: false };
    });

    // 6. Asynchronous legacy dual-mirroring (runs independently per destination)
    if (result.status === 'INGESTED') {
      const mirrorResult = await this.mirrorOrderToLegacyDestinations(result.order);
      result.order.mirrorStatus = mirrorResult;

      // 7. Generate idempotent KOT for the kitchen
      const kotResult = await this.ensureOrderKOT(result.order);
      result.kot = kotResult.kot;

      // 8. Record authoritative payment transaction
      try {
        const isAggregator = source === 'SWIGGY' || source === 'ZOMATO';
        const method = isAggregator
          ? (source === 'SWIGGY' ? PAYMENT_METHODS.SWIGGY_ONLINE : PAYMENT_METHODS.ZOMATO_ONLINE)
          : (result.order.payment?.method || PAYMENT_METHODS.CASH);

        const paymentStatus = (result.order.payment?.status === 'PAID' || isAggregator)
          ? PAYMENT_STATUSES.CAPTURED
          : PAYMENT_STATUSES.PENDING;

        const txnResult = await paymentTransactionService.createPaymentTransaction({
          restaurantId: result.order.restaurantId,
          outletId: result.order.outletId,
          orderId: result.order.orderId,
          amount: result.order.pricing.grandTotal,
          paymentMethod: method,
          paymentSource: source,
          providerTransactionRef: result.order.payment?.transactionId || null,
          status: paymentStatus,
          pricingBreakdown: result.order.pricing,
          metadata: {
            orderNumber: result.order.orderNumber,
            customerName: result.order.customer?.name,
            channel: source
          }
        }, { uid: 'ingestion_engine', role: 'system', name: 'Ingestion Engine' });

        result.paymentTransaction = txnResult.transaction;
      } catch (payErr) {
        logger.error('Failed to create payment transaction on ingestion', { error: payErr.message, orderId });
      }
    }

    return result;
  }

  /**
   * Generates a deterministic, idempotent Kitchen Order Ticket (KOT) for an order.
   * Path: restaurants/{restaurantId}/kots/{kotId}
   * Guarantees that duplicate order deliveries or status updates NEVER create duplicate KOTs.
   */
  async ensureOrderKOT(order) {
    const db = getDb();
    const kotId = `KOT_${order.orderId}_1`;
    const kotDocRef = db.doc(`restaurants/${order.restaurantId}/kots/${kotId}`);

    const existingSnap = await kotDocRef.get();
    if (existingSnap.exists) {
      return { success: true, isNew: false, kotId, kot: existingSnap.data() };
    }

    const now = new Date().toISOString();
    const kotPayload = {
      id: kotId,
      kotNumber: `KOT-${order.externalOrderId || order.orderId}-1`,
      kotIndex: 1,
      orderId: order.orderId,
      orderNumber: order.externalOrderId || order.orderId,
      restaurantId: order.restaurantId,
      outletId: order.outletId,
      orderSource: order.orderSource,
      orderType: order.orderType,
      tableId: order.tableId || null,
      tableNumber: order.tableNumber || null,
      waiterId: order.waiterId || null,
      waiterName: order.waiterName || null,
      customerName: order.customer?.name || null,
      items: (order.items || []).map(it => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        variant: it.variant ? (typeof it.variant === 'object' ? it.variant.name : it.variant) : '',
        addons: Array.isArray(it.addons) ? it.addons.map(a => typeof a === 'object' ? a.name : a) : [],
        instructions: it.instructions || ''
      })),
      orderNotes: order.orderNotes || '',
      status: 'NEW', // NEW, PREPARING, READY, SERVED
      isPrinted: false,
      printerDestination: 'KITCHEN',
      createdAt: now,
      updatedAt: now
    };

    await kotDocRef.set(kotPayload);
    logger.info('Idempotent KOT generated for order', { orderId: order.orderId, kotId, outletId: order.outletId });
    return { success: true, isNew: true, kotId, kot: kotPayload };
  }

  /**
   * Updates KOT status and synchronizes back to authoritative order record and mirrors.
   */
  async updateKOTStatus(restaurantId, kotId, newStatus, actor = 'KITCHEN_STAFF') {
    const db = getDb();
    const kotDocRef = db.doc(`restaurants/${restaurantId}/kots/${kotId}`);
    const snap = await kotDocRef.get();
    if (!snap.exists) {
      return { success: false, reason: `KOT ${kotId} not found` };
    }

    const kotData = snap.data();
    const now = new Date().toISOString();

    await kotDocRef.update({
      status: newStatus,
      updatedAt: now
    });

    // Synchronize to authoritative order
    if (kotData.orderId) {
      let mappedOrderStatus = null;
      if (newStatus === 'PREPARING') mappedOrderStatus = ORDER_STATUSES.PREPARING;
      if (newStatus === 'READY') mappedOrderStatus = ORDER_STATUSES.READY;
      if (newStatus === 'SERVED' && kotData.orderType === 'DINE_IN') mappedOrderStatus = ORDER_STATUSES.COMPLETED;

      if (mappedOrderStatus) {
        await this.transitionOrderStatus(kotData.orderId, mappedOrderStatus, actor);
      }
    }

    return { success: true, kotId, status: newStatus };
  }

  /**
   * Creates an order from POS (Dine-in or Takeaway) through the trusted backend engine.
   */
  async createPosOrder(posInput, waiterData) {
    const restaurantId = posInput.restaurantId;
    const outletId = posInput.outletId || `${restaurantId}_main`;
    const orderType = posInput.orderType || 'DINE_IN';
    const source = orderType === 'TAKEAWAY' ? ORDER_SOURCES.TAKEAWAY : ORDER_SOURCES.POS;

    const timestamp = new Date();
    const dateStr = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ORD-${dateStr}-${randomSuffix}`;

    const orderPayload = {
      orderSource: source,
      orderType,
      restaurantId,
      outletId,
      externalOrderId: orderNumber,
      tableId: posInput.tableId || null,
      tableNumber: posInput.tableNumber || null,
      waiterId: waiterData?.uid || null,
      waiterName: waiterData?.name || 'Staff',
      customer: {
        name: posInput.customerName || (orderType === 'TAKEAWAY' ? 'Takeaway Guest' : 'Dine-In Guest'),
        phone: posInput.customerPhone || ''
      },
      items: posInput.items || [],
      charges: {
        discountAmount: posInput.discountAmount || 0,
        discountType: posInput.discountType || null,
        packagingCharge: posInput.packagingCharge || 0
      },
      payment: {
        status: posInput.paymentStatus || 'UNPAID',
        method: posInput.paymentMethod || 'CASH'
      }
    };

    const ingested = await this.ingestOrder(orderPayload);

    // If dine-in, mark table as OCCUPIED in database
    if (ingested.success && orderType === 'DINE_IN' && posInput.tableId) {
      const db = getDb();
      try {
        await db.doc(`restaurants/${restaurantId}/tables/${posInput.tableId}`).update({
          status: 'OCCUPIED',
          activeOrder: {
            orderId: ingested.orderId,
            orderNumber,
            totalAmount: ingested.order.pricing.grandTotal
          },
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        logger.warn('Could not update table status on POS order creation', { error: err.message });
      }
    }

    return ingested;
  }

  /**
   * Translates normalized order to legacy mirror format for backward compatibility.
   */
  toLegacyMirrorPayload(normalized) {
    return {
      id: normalized.orderId,
      orderId: normalized.orderId,
      restaurantId: normalized.restaurantId,
      outletId: normalized.outletId,
      orderSource: normalized.orderSource,
      customerName: normalized.customer?.name || 'Guest',
      customerPhone: normalized.customer?.phone || '',
      deliveryAddress: normalized.customer?.deliveryAddress?.street || normalized.customer?.deliveryAddress || '',
      items: normalized.items.map(item => ({
        id: item.id,
        name: item.name,
        price: item.unitPrice,
        quantity: item.quantity,
        variant: item.variant?.name || item.variant || '',
        addons: Array.isArray(item.addons) ? item.addons.map(a => typeof a === 'object' ? a.name : a) : [],
        instructions: item.instructions || '',
        subtotal: item.subtotal
      })),
      totalAmount: normalized.pricing.grandTotal,
      subtotal: normalized.pricing.itemTotal,
      taxAmount: normalized.pricing.taxAmount,
      deliveryFee: normalized.pricing.deliveryCharge,
      status: normalized.orderStatus,
      orderType: normalized.orderType,
      tableId: normalized.tableId || null,
      tableNumber: normalized.tableNumber || null,
      waiterId: normalized.waiterId || null,
      waiterName: normalized.waiterName || null,
      paymentStatus: normalized.payment?.status || 'PENDING',
      paymentMethod: normalized.payment?.method || 'CASH',
      orderTime: normalized.timestamps.placedAt,
      inventorySnapshot: normalized.inventorySnapshot || null,
      isLegacyMirror: true,
      authoritativeRef: `aggregatorOrders/${normalized.orderId}`,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Dual-mirrors an order to both legacy destinations independently.
   */
  async mirrorOrderToLegacyDestinations(normalizedOrder) {
    const db = getDb();
    const mirrorPayload = this.toLegacyMirrorPayload(normalizedOrder);
    const orderDocRef = db.doc(`aggregatorOrders/${normalizedOrder.orderId}`);
    const now = new Date().toISOString();

    const mirrorStatusUpdate = { ...normalizedOrder.mirrorStatus };

    // Destination 1: Tenant subcollection
    const tenantDest = `restaurants/${normalizedOrder.restaurantId}/onlineOrders/${normalizedOrder.orderId}`;
    try {
      await db.doc(tenantDest).set(mirrorPayload, { merge: true });
      mirrorStatusUpdate.tenantSubcollection = {
        status: 'SYNCED',
        destination: tenantDest,
        attempts: (normalizedOrder.mirrorStatus?.tenantSubcollection?.attempts || 0) + 1,
        lastAttemptAt: now,
        lastSyncedAt: now,
        error: null
      };
    } catch (err) {
      logger.error('Failed to write tenant subcollection mirror', { destination: tenantDest, error: err.message });
      mirrorStatusUpdate.tenantSubcollection = {
        status: 'FAILED',
        destination: tenantDest,
        attempts: (normalizedOrder.mirrorStatus?.tenantSubcollection?.attempts || 0) + 1,
        lastAttemptAt: now,
        lastSyncedAt: null,
        error: err.message
      };
    }

    // Destination 2: Root onlineOrders
    const rootDest = `onlineOrders/${normalizedOrder.orderId}`;
    try {
      await db.doc(rootDest).set(mirrorPayload, { merge: true });
      mirrorStatusUpdate.rootCollection = {
        status: 'SYNCED',
        destination: rootDest,
        attempts: (normalizedOrder.mirrorStatus?.rootCollection?.attempts || 0) + 1,
        lastAttemptAt: now,
        lastSyncedAt: now,
        error: null
      };
    } catch (err) {
      logger.error('Failed to write root collection mirror', { destination: rootDest, error: err.message });
      mirrorStatusUpdate.rootCollection = {
        status: 'FAILED',
        destination: rootDest,
        attempts: (normalizedOrder.mirrorStatus?.rootCollection?.attempts || 0) + 1,
        lastAttemptAt: now,
        lastSyncedAt: null,
        error: err.message
      };
    }

    // Update authoritative document with mirror tracking
    try {
      await orderDocRef.update({
        mirrorStatus: mirrorStatusUpdate,
        updatedAt: now
      });
    } catch (err) {
      logger.warn('Could not update mirrorStatus on authoritative record', { error: err.message });
    }

    return mirrorStatusUpdate;
  }

  /**
   * Independently retries mirroring for a specific destination without touching the other.
   */
  async retryMirrorDestination(orderId, destinationType) {
    const db = getDb();
    const orderDocRef = db.doc(`aggregatorOrders/${orderId}`);
    const snap = await orderDocRef.get();
    if (!snap.exists) {
      throw new Error(`Order ${orderId} not found`);
    }

    const orderData = snap.data();
    const mirrorPayload = this.toLegacyMirrorPayload(orderData);
    const now = new Date().toISOString();
    const currentMirrorStatus = orderData.mirrorStatus || {};

    if (destinationType === 'tenantSubcollection') {
      const destPath = `restaurants/${orderData.restaurantId}/onlineOrders/${orderId}`;
      try {
        await db.doc(destPath).set(mirrorPayload, { merge: true });
        currentMirrorStatus.tenantSubcollection = {
          status: 'SYNCED',
          destination: destPath,
          attempts: (currentMirrorStatus.tenantSubcollection?.attempts || 0) + 1,
          lastAttemptAt: now,
          lastSyncedAt: now,
          error: null
        };
      } catch (err) {
        currentMirrorStatus.tenantSubcollection = {
          status: 'FAILED',
          destination: destPath,
          attempts: (currentMirrorStatus.tenantSubcollection?.attempts || 0) + 1,
          lastAttemptAt: now,
          lastSyncedAt: null,
          error: err.message
        };
      }
    } else if (destinationType === 'rootCollection') {
      const destPath = `onlineOrders/${orderId}`;
      try {
        await db.doc(destPath).set(mirrorPayload, { merge: true });
        currentMirrorStatus.rootCollection = {
          status: 'SYNCED',
          destination: destPath,
          attempts: (currentMirrorStatus.rootCollection?.attempts || 0) + 1,
          lastAttemptAt: now,
          lastSyncedAt: now,
          error: null
        };
      } catch (err) {
        currentMirrorStatus.rootCollection = {
          status: 'FAILED',
          destination: destPath,
          attempts: (currentMirrorStatus.rootCollection?.attempts || 0) + 1,
          lastAttemptAt: now,
          lastSyncedAt: null,
          error: err.message
        };
      }
    } else {
      throw new Error(`Invalid destinationType: ${destinationType}`);
    }

    await orderDocRef.update({
      mirrorStatus: currentMirrorStatus,
      updatedAt: now
    });

    return currentMirrorStatus;
  }

  /**
   * Privileged status transitions executed by trusted backend.
   */
  async transitionOrderStatus(orderId, newStatus, actor = 'SYSTEM', reason = null) {
    const db = getDb();
    const orderDocRef = db.doc(`aggregatorOrders/${orderId}`);
    const snap = await orderDocRef.get();
    if (!snap.exists) {
      return { success: false, reason: `Order ${orderId} does not exist` };
    }

    const orderData = snap.data();
    const currentStatus = orderData.orderStatus;

    if (currentStatus === newStatus) {
      return { success: true, idempotent: true, status: currentStatus };
    }

    if (TERMINAL_STATUSES.has(currentStatus)) {
      return {
        success: false,
        reason: `Cannot transition from terminal state ${currentStatus} to ${newStatus}`
      };
    }

    const now = new Date().toISOString();
    const history = orderData.statusHistory || [];
    history.push({ status: newStatus, timestamp: now, actor, reason });

    const timestamps = { ...orderData.timestamps };
    if (newStatus === ORDER_STATUSES.ACCEPTED) timestamps.acceptedAt = now;
    if (newStatus === ORDER_STATUSES.PREPARING) timestamps.preparingAt = now;
    if (newStatus === ORDER_STATUSES.READY) timestamps.readyAt = now;
    if (newStatus === ORDER_STATUSES.DISPATCHED) timestamps.dispatchedAt = now;
    if (newStatus === ORDER_STATUSES.COMPLETED) timestamps.completedAt = now;
    if (newStatus === ORDER_STATUSES.CANCELLED) timestamps.cancelledAt = now;

    const updatePayload = {
      orderStatus: newStatus,
      statusHistory: history,
      timestamps,
      updatedAt: now
    };

    if (newStatus === ORDER_STATUSES.CANCELLED && reason) {
      updatePayload.cancellation = {
        cancelledBy: actor,
        reason,
        refundStatus: 'PENDING'
      };
    }

    // Inventory lifecycle transitions
    if (newStatus === ORDER_STATUSES.PREPARING) {
      try {
        await inventoryLedgerService.consumeOrderStock(orderData.restaurantId, orderData.outletId, orderData, { uid: actor, role: 'kitchen', name: actor });
        updatePayload['inventorySnapshot.status'] = 'CONSUMED';
        updatePayload['inventorySnapshot.consumedAt'] = now;
      } catch (invErr) {
        logger.error('Failed to consume stock during PREPARING transition', { error: invErr.message, orderId });
      }
    } else if (newStatus === ORDER_STATUSES.CANCELLED || newStatus === ORDER_STATUSES.REJECTED) {
      try {
        const cancelResult = await inventoryLedgerService.handleOrderCancellation(orderData.restaurantId, orderData.outletId, orderData, { uid: actor, role: 'staff', name: actor });
        updatePayload['inventorySnapshot.status'] = cancelResult.released ? 'RELEASED' : (cancelResult.wastageRecorded ? 'WASTAGE' : 'CANCELLED');
        updatePayload['inventorySnapshot.cancelledAt'] = now;
      } catch (invErr) {
        logger.error('Failed to handle inventory on order cancellation', { error: invErr.message, orderId });
      }

      // Handle payment refund or cancellation
      try {
        const txns = await paymentTransactionService.getTransactionsByOrder(orderData.restaurantId, orderId);
        for (const txn of txns) {
          if (txn.paymentStatus === PAYMENT_STATUSES.CAPTURED || txn.paymentStatus === PAYMENT_STATUSES.PARTIALLY_REFUNDED) {
            const currentRefunded = txn.totalRefundedAmountMinor || 0;
            const txnTotal = txn.amountMinor || 0;
            const remainingToRefundPaise = txnTotal - currentRefunded;
            if (remainingToRefundPaise > 0) {
              await paymentTransactionService.processRefund(orderData.restaurantId, txn.transactionId, {
                amount: remainingToRefundPaise / 100,
                reason: reason || 'Order cancelled',
                refundType: 'CANCELLATION'
              }, { uid: actor, name: actor });
            }
          } else if (txn.paymentStatus === PAYMENT_STATUSES.AUTHORIZED || txn.paymentStatus === PAYMENT_STATUSES.PENDING) {
            await paymentTransactionService.cancelPayment(orderData.restaurantId, txn.transactionId, reason || 'Order cancelled', actor);
          }
        }
      } catch (payErr) {
        logger.error('Failed to handle payment refund on order cancellation', { error: payErr.message, orderId });
      }
    }

    await orderDocRef.update(updatePayload);

    // Synchronize to mirrors
    await this.mirrorOrderToLegacyDestinations({
      ...orderData,
      ...updatePayload
    });

    return { success: true, previousStatus: currentStatus, status: newStatus };
  }
}

export const trustedOrderService = new TrustedOrderService();
export default trustedOrderService;
