/**
 * Abar Khabo: Enterprise Multi-Tenant SaaS
 * Normalized Order Schema & Idempotent Legacy Dual-Mirroring Engine
 * 
 * Authoritative Collection: aggregatorOrders/{orderId}
 * Legacy Mirror Collections:
 *   1. Subcollection Mirror: restaurants/{restaurantId}/onlineOrders/{orderId} (Staff POS/KDS)
 *   2. Root Mirror: onlineOrders/{orderId} (Customer tracking & Dispatch)
 * 
 * Schema Version: 2.0.0
 */

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch
} from '../firebase/config.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. ORDER CONSTANTS & LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

export const ORDER_SOURCES = {
  ABAR_KHABO: 'ABAR_KHABO',
  POS: 'POS',
  SWIGGY: 'SWIGGY',
  ZOMATO: 'ZOMATO',
  TAKEAWAY: 'TAKEAWAY'
};

export const ORDER_TYPES = {
  DELIVERY: 'DELIVERY',
  DINE_IN: 'DINE_IN',
  TAKEAWAY: 'TAKEAWAY'
};

export const ORDER_STATUS = {
  PLACED: 'PLACED',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  DISPATCHED: 'DISPATCHED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED'
};

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED'
};

export const MIRROR_STATUS = {
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED'
};

// Valid status lifecycle transitions graph
export const VALID_STATUS_TRANSITIONS = {
  [ORDER_STATUS.PLACED]: [ORDER_STATUS.ACCEPTED, ORDER_STATUS.REJECTED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.ACCEPTED]: [ORDER_STATUS.PREPARING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PREPARING]: [ORDER_STATUS.READY, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.READY]: [ORDER_STATUS.DISPATCHED, ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.DISPATCHED]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.COMPLETED]: [], // Terminal state
  [ORDER_STATUS.CANCELLED]: [], // Terminal state
  [ORDER_STATUS.REJECTED]: []   // Terminal state
};

/**
 * Validates whether a requested order status transition is allowed by the lifecycle state machine.
 * @param {string} currentStatus 
 * @param {string} targetStatus 
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateStatusTransition(currentStatus, targetStatus) {
  if (!currentStatus || !targetStatus) {
    return { valid: false, error: 'Both currentStatus and targetStatus are required.' };
  }
  if (currentStatus === targetStatus) {
    return { valid: true }; // Idempotent same-state transition
  }
  const allowedNext = VALID_STATUS_TRANSITIONS[currentStatus];
  if (!allowedNext) {
    return { valid: false, error: `Unknown current status "${currentStatus}".` };
  }
  if (!allowedNext.includes(targetStatus)) {
    return {
      valid: false,
      error: `Invalid status transition from "${currentStatus}" to "${targetStatus}". Allowed next states: [${allowedNext.join(', ')}].`
    };
  }
  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. IDEMPOTENCY KEY GENERATION (Pure Functions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a deterministic business idempotency key for an order.
 * Format for external aggregator orders: ${PROVIDER}_${OUTLET_ID}_${EXTERNAL_ORDER_ID}
 * 
 * @param {string} source - e.g. SWIGGY, ZOMATO, ABAR_KHABO, POS
 * @param {string} outletId - e.g. spice-haven_main
 * @param {string} [externalOrderId] - e.g. 581902482
 * @param {string} [fallbackSeed] - UUID or timestamp for internal direct orders
 * @returns {string}
 */
export function generateOrderIdempotencyKey(source, outletId, externalOrderId = null, fallbackSeed = null) {
  if (!source || !outletId) {
    throw new Error('Both source and outletId are required to construct an order idempotency key.');
  }
  const cleanSource = source.toUpperCase().trim();
  const cleanOutlet = outletId.trim();

  if (externalOrderId && String(externalOrderId).trim()) {
    return `${cleanSource}_${cleanOutlet}_${String(externalOrderId).trim()}`;
  }

  // Internal direct order fallback
  const seed = fallbackSeed || `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  return `${cleanSource}_${cleanOutlet}_${seed}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FINANCIAL SNAPSHOT & SCHEMA NORMALIZATION (Pure Functions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes item snapshots ensuring immutable prices, variants, add-ons, and taxes are locked.
 * @param {Array<Object>} items 
 * @returns {Array<Object>}
 */
export function normalizeOrderItemSnapshots(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((rawItem, index) => {
    const qty = Math.max(1, parseInt(rawItem.qty || rawItem.quantity || 1, 10));
    const basePrice = Number(rawItem.basePrice ?? rawItem.price ?? 0);
    const unitPrice = Number(rawItem.price ?? rawItem.basePrice ?? 0);
    const taxRate = Number(rawItem.taxRate ?? 5.0);

    // Variants snapshot
    const variant = rawItem.variant ? {
      id: rawItem.variant.id || 'standard',
      name: rawItem.variant.name || 'Standard',
      price: Number(rawItem.variant.price ?? unitPrice)
    } : null;

    // Addons / modifiers snapshot
    const addons = Array.isArray(rawItem.addons) ? rawItem.addons.map(a => ({
      id: a.id || `addon_${index}`,
      name: a.name || 'Extra Add-on',
      price: Number(a.price || 0)
    })) : [];

    const addonsTotal = addons.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
    const effectiveUnitPrice = variant ? variant.price : unitPrice;
    const subtotal = (effectiveUnitPrice + addonsTotal) * qty;

    return {
      itemId: rawItem.itemId || rawItem.id || `item_${index}`,
      name: rawItem.name || 'Menu Item',
      basePrice,
      price: effectiveUnitPrice,
      qty,
      variant,
      addons,
      taxRate,
      cookingNotes: rawItem.cookingNotes || rawItem.notes || '',
      subtotal: Math.round(subtotal)
    };
  });
}

/**
 * Calculates complete immutable financial pricing breakdown for an order.
 * 
 * @param {Array<Object>} normalizedItems 
 * @param {Object} [charges={}] 
 * @returns {Object}
 */
export function calculateOrderPricing(normalizedItems = [], charges = {}) {
  const itemTotal = normalizedItems.reduce((acc, item) => acc + (item.subtotal || 0), 0);
  const packagingCharge = Number(charges.packagingCharge || 0);
  const deliveryFee = Number(charges.deliveryFee || 0);
  const restaurantDiscount = Number(charges.restaurantDiscount || 0);
  const aggregatorDiscount = Number(charges.aggregatorDiscount || 0);
  const taxRate = Number(charges.taxRate || 5.0);
  const commissionRate = Number(charges.commissionRate || 0); // e.g. 18% for Swiggy

  // Net taxable subtotal
  const taxableAmount = Math.max(0, itemTotal + packagingCharge - restaurantDiscount);
  const taxTotal = Math.round(taxableAmount * (taxRate / 100));

  const grandTotal = Math.max(0, taxableAmount + taxTotal + deliveryFee);
  const commissionAmount = Number(((itemTotal * commissionRate) / 100).toFixed(2));
  const netPayout = Number((grandTotal - commissionAmount - aggregatorDiscount).toFixed(2));

  return {
    itemTotal: Math.round(itemTotal),
    taxTotal,
    taxRate,
    packagingCharge: Math.round(packagingCharge),
    deliveryFee: Math.round(deliveryFee),
    restaurantDiscount: Math.round(restaurantDiscount),
    aggregatorDiscount: Math.round(aggregatorDiscount),
    grandTotal: Math.round(grandTotal),
    commissionRate,
    commissionAmount,
    netPayout
  };
}

/**
 * Builds the canonical normalized order document.
 * 
 * @param {Object} rawOrder 
 * @returns {Object}
 */
export function buildNormalizedOrderPayload(rawOrder) {
  const source = rawOrder.source || rawOrder.orderSource || ORDER_SOURCES.ABAR_KHABO;
  const restaurantId = rawOrder.restaurantId;
  const outletId = rawOrder.outletId;

  if (!restaurantId || !outletId) {
    throw new Error('Both restaurantId and outletId are required for order creation.');
  }

  const idempotencyKey = rawOrder.idempotencyKey || generateOrderIdempotencyKey(
    source,
    outletId,
    rawOrder.externalOrderId,
    rawOrder.id
  );

  const orderId = rawOrder.orderId || idempotencyKey;
  const normalizedItems = normalizeOrderItemSnapshots(rawOrder.items || []);
  const pricing = calculateOrderPricing(normalizedItems, rawOrder.pricing || rawOrder);

  return {
    orderId,
    id: orderId,
    restaurantId,
    outletId,
    source,
    externalOrderId: rawOrder.externalOrderId || null,
    idempotencyKey,
    orderType: rawOrder.orderType || ORDER_TYPES.DELIVERY,
    orderStatus: rawOrder.orderStatus || rawOrder.status || ORDER_STATUS.PLACED,
    customer: {
      uid: rawOrder.customer?.uid || rawOrder.customerId || null,
      name: rawOrder.customer?.name || rawOrder.customerName || 'Guest Customer',
      phone: rawOrder.customer?.phone || rawOrder.customerPhone || '',
      email: rawOrder.customer?.email || rawOrder.customerEmail || '',
      address: rawOrder.customer?.address || rawOrder.deliveryAddress || '',
      coordinates: rawOrder.customer?.coordinates || rawOrder.customerCoordinates || null
    },
    items: normalizedItems,
    pricing,
    payment: {
      method: rawOrder.payment?.method || rawOrder.paymentMethod || 'COD',
      status: rawOrder.payment?.status || rawOrder.paymentStatus || PAYMENT_STATUS.PENDING,
      transactionId: rawOrder.payment?.transactionId || rawOrder.transactionId || null
    },
    delivery: {
      deliveryBy: rawOrder.delivery?.deliveryBy || (source === ORDER_SOURCES.SWIGGY ? 'SWIGGY_FLEET' : 'RESTAURANT_FLEET'),
      riderId: rawOrder.delivery?.riderId || rawOrder.riderId || null,
      riderName: rawOrder.delivery?.riderName || rawOrder.riderName || null,
      riderPhone: rawOrder.delivery?.riderPhone || rawOrder.riderPhone || null,
      riderCoordinates: rawOrder.delivery?.riderCoordinates || rawOrder.riderCoordinates || null,
      pickupOtp: rawOrder.delivery?.pickupOtp || rawOrder.pickupOtp || null
    },
    mirrorStatus: {
      legacyOnlineOrders: rawOrder.mirrorStatus?.legacyOnlineOrders || MIRROR_STATUS.PENDING,
      subcollectionMirror: rawOrder.mirrorStatus?.subcollectionMirror || MIRROR_STATUS.PENDING,
      retryCount: Number(rawOrder.mirrorStatus?.retryCount || 0),
      lastError: rawOrder.mirrorStatus?.lastError || null,
      lastSyncedAt: rawOrder.mirrorStatus?.lastSyncedAt || null
    },
    notes: rawOrder.notes || rawOrder.cookingNotes || '',
    schemaVersion: '2.0.0'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. FIRESTORE AUTHORITATIVE INGESTION & IDEMPOTENCY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ingests an order into the authoritative aggregatorOrders collection.
 * Guarantee: Transactional idempotency — if an order with the same orderId / idempotencyKey
 * already exists, returns the existing document without creating duplicates or double-counting.
 * 
 * @param {Object} rawOrder 
 * @returns {Promise<{ order: Object, isDuplicate: boolean, status: string }>}
 */
export async function ingestAuthoritativeOrder(rawOrder) {
  const payload = buildNormalizedOrderPayload(rawOrder);
  const docRef = doc(db, 'aggregatorOrders', payload.orderId);

  // 1. Check existing authoritative order for idempotency
  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      return {
        order: { id: existingSnap.id, ...existingSnap.data() },
        isDuplicate: true,
        status: 'DUPLICATE_IGNORED'
      };
    }
  } catch (readErr) {
    console.warn(`Idempotency check read notice (${payload.orderId}):`, readErr);
  }

  // 2. Persist new authoritative order
  const orderDoc = {
    ...payload,
    timestamps: {
      placedAt: serverTimestamp(),
      acceptedAt: null,
      preparingAt: null,
      readyAt: null,
      dispatchedAt: null,
      completedAt: null,
      cancelledAt: null
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(docRef, orderDoc);

  // 3. Asynchronously trigger dual-mirroring
  try {
    await mirrorOrderToLegacy(payload.orderId, orderDoc);
  } catch (mirrorErr) {
    console.warn(`Initial mirror execution notice (${payload.orderId}):`, mirrorErr);
  }

  return {
    order: { id: payload.orderId, ...orderDoc },
    isDuplicate: false,
    status: 'CREATED'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. LEGACY DUAL-MIRRORING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the backward-compatible legacy order document from an authoritative order.
 * @param {Object} authOrder 
 * @returns {Object}
 */
export function buildLegacyMirrorPayload(authOrder) {
  return {
    id: authOrder.orderId,
    restaurantId: authOrder.restaurantId,
    outletId: authOrder.outletId,
    orderSource: authOrder.source,
    customerName: authOrder.customer?.name || 'Guest Customer',
    customerPhone: authOrder.customer?.phone || '',
    deliveryAddress: authOrder.customer?.address || '',
    items: (authOrder.items || []).map(i => ({
      id: i.itemId,
      name: i.name,
      price: i.price,
      qty: i.qty,
      notes: i.cookingNotes || ''
    })),
    totalAmount: authOrder.pricing?.grandTotal || 0,
    status: authOrder.orderStatus,
    deliveryStatus: authOrder.orderType === ORDER_TYPES.DELIVERY ? authOrder.orderStatus : null,
    orderType: authOrder.orderType,
    paymentStatus: authOrder.payment?.status || PAYMENT_STATUS.PENDING,
    paymentMethod: authOrder.payment?.method || 'COD',
    deliveryFee: authOrder.pricing?.deliveryFee || 0,
    notes: authOrder.notes || '',
    isLegacyMirror: true,
    authoritativeRef: `aggregatorOrders/${authOrder.orderId}`,
    schemaVersion: '2.0.0'
  };
}

/**
 * Idempotently mirrors an authoritative order to legacy collections:
 * 1. restaurants/{restaurantId}/onlineOrders/{orderId} (Subcollection mirror)
 * 2. onlineOrders/{orderId} (Root mirror)
 * 
 * Tracks mirror status, retry counts, and errors in the authoritative document.
 * 
 * @param {string} orderId 
 * @param {Object} [cachedAuthOrder] 
 * @returns {Promise<{ success: boolean, retryCount: number, error?: string }>}
 */
export async function mirrorOrderToLegacy(orderId, cachedAuthOrder = null) {
  const authRef = doc(db, 'aggregatorOrders', orderId);
  let authOrder = cachedAuthOrder;

  if (!authOrder) {
    const snap = await getDoc(authRef);
    if (!snap.exists()) {
      throw new Error(`Authoritative order "${orderId}" not found for legacy mirroring.`);
    }
    authOrder = { id: snap.id, ...snap.data() };
  }

  const legacyPayload = buildLegacyMirrorPayload(authOrder);
  const currentRetries = Number(authOrder.mirrorStatus?.retryCount || 0);

  try {
    const batch = writeBatch(db);

    // 1. Subcollection mirror: restaurants/{restaurantId}/onlineOrders/{orderId}
    const subRef = doc(db, 'restaurants', authOrder.restaurantId, 'onlineOrders', orderId);
    batch.set(subRef, { ...legacyPayload, updatedAt: serverTimestamp() }, { merge: true });

    // 2. Root mirror: onlineOrders/{orderId}
    const rootRef = doc(db, 'onlineOrders', orderId);
    batch.set(rootRef, { ...legacyPayload, updatedAt: serverTimestamp() }, { merge: true });

    // 3. Update authoritative mirrorStatus
    batch.update(authRef, {
      'mirrorStatus.legacyOnlineOrders': MIRROR_STATUS.SYNCED,
      'mirrorStatus.subcollectionMirror': MIRROR_STATUS.SYNCED,
      'mirrorStatus.lastSyncedAt': serverTimestamp(),
      'mirrorStatus.lastError': null,
      updatedAt: serverTimestamp()
    });

    await batch.commit();

    return {
      success: true,
      retryCount: currentRetries
    };
  } catch (err) {
    console.error(`mirrorOrderToLegacy failed for "${orderId}":`, err);

    // Record failure status in authoritative document
    try {
      await updateDoc(authRef, {
        'mirrorStatus.legacyOnlineOrders': MIRROR_STATUS.FAILED,
        'mirrorStatus.subcollectionMirror': MIRROR_STATUS.FAILED,
        'mirrorStatus.retryCount': currentRetries + 1,
        'mirrorStatus.lastError': err.message || 'Legacy mirror batch write failed',
        updatedAt: serverTimestamp()
      });
    } catch (updateErr) {
      console.warn(`Could not update mirrorStatus failure record:`, updateErr);
    }

    return {
      success: false,
      retryCount: currentRetries + 1,
      error: err.message
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ORDER STATUS LIFECYCLE TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transitions an order to a new lifecycle status with validation and synchronized mirroring.
 * 
 * @param {string} orderId 
 * @param {string} targetStatus 
 * @param {Object} [metadata={}] 
 * @returns {Promise<Object>}
 */
export async function transitionOrderStatus(orderId, targetStatus, metadata = {}) {
  const authRef = doc(db, 'aggregatorOrders', orderId);
  const snap = await getDoc(authRef);

  if (!snap.exists()) {
    throw new Error(`Order "${orderId}" does not exist.`);
  }

  const order = snap.data();
  const currentStatus = order.orderStatus || ORDER_STATUS.PLACED;

  const validation = validateStatusTransition(currentStatus, targetStatus);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const updates = {
    orderStatus: targetStatus,
    updatedAt: serverTimestamp()
  };

  // Timestamp tracking per status
  if (targetStatus === ORDER_STATUS.ACCEPTED) updates['timestamps.acceptedAt'] = serverTimestamp();
  if (targetStatus === ORDER_STATUS.PREPARING) updates['timestamps.preparingAt'] = serverTimestamp();
  if (targetStatus === ORDER_STATUS.READY) updates['timestamps.readyAt'] = serverTimestamp();
  if (targetStatus === ORDER_STATUS.DISPATCHED) updates['timestamps.dispatchedAt'] = serverTimestamp();
  if (targetStatus === ORDER_STATUS.COMPLETED) updates['timestamps.completedAt'] = serverTimestamp();
  if (targetStatus === ORDER_STATUS.CANCELLED) {
    updates['timestamps.cancelledAt'] = serverTimestamp();
    updates.cancellationReason = metadata.reason || 'Not specified';
  }

  // Update authoritative document
  await updateDoc(authRef, updates);

  // Synchronize status update to mirrors
  const updatedOrder = { ...order, ...updates, orderStatus: targetStatus };
  await mirrorOrderToLegacy(orderId, updatedOrder);

  return { id: orderId, ...updatedOrder };
}
