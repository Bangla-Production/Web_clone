/**
 * Abar Khabo: Unified Payment Transaction Architecture & Lifecycle Engine
 * 
 * Provides an authoritative, backend-managed financial transaction engine.
 * Strictly enforces:
 *  1. Separation between RESTAURANT_COLLECTED (POS Cash/UPI/Card/Direct) and AGGREGATOR_COLLECTED (Swiggy/Zomato).
 *  2. 7-state payment lifecycle state machine with validated transitions.
 *  3. Idempotent payment submissions via deterministic SHA-256 keys to prevent double-charging.
 *  4. Full, partial, item-level, and cancellation refunds with balance validation.
 *  5. Strict sensitive data hygiene (PCI-DSS aligned: never stores raw card/CVV/bank tokens).
 */

import { getDb } from '../config/firebaseAdmin.js';
import { generateSha256 } from '../utils/cryptoUtils.js';
import { toPaise, toRupees, addMoney, subtractMoney } from '../utils/monetaryUtils.js';
import logger from '../utils/logger.js';

export const PAYMENT_METHODS = {
  CASH: 'CASH',
  UPI: 'UPI',
  CARD: 'CARD',
  DIRECT_ONLINE: 'DIRECT_ONLINE',
  SWIGGY_ONLINE: 'SWIGGY_ONLINE',
  ZOMATO_ONLINE: 'ZOMATO_ONLINE',
  OTHER_CONFIGURED_METHOD: 'OTHER_CONFIGURED_METHOD'
};

export const PAYMENT_SOURCES = {
  POS: 'POS',
  DIRECT_ONLINE: 'DIRECT_ONLINE',
  SWIGGY: 'SWIGGY',
  ZOMATO: 'ZOMATO',
  SETTLEMENT_IMPORT: 'SETTLEMENT_IMPORT'
};

export const COLLECTION_TYPES = {
  RESTAURANT_COLLECTED: 'RESTAURANT_COLLECTED',
  AGGREGATOR_COLLECTED: 'AGGREGATOR_COLLECTED'
};

export const PAYMENT_STATUSES = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED'
};

export const ALLOWED_PAYMENT_TRANSITIONS = {
  [PAYMENT_STATUSES.PENDING]: [
    PAYMENT_STATUSES.AUTHORIZED,
    PAYMENT_STATUSES.CAPTURED,
    PAYMENT_STATUSES.FAILED,
    PAYMENT_STATUSES.CANCELLED
  ],
  [PAYMENT_STATUSES.AUTHORIZED]: [
    PAYMENT_STATUSES.CAPTURED,
    PAYMENT_STATUSES.FAILED,
    PAYMENT_STATUSES.CANCELLED
  ],
  [PAYMENT_STATUSES.CAPTURED]: [
    PAYMENT_STATUSES.PARTIALLY_REFUNDED,
    PAYMENT_STATUSES.REFUNDED
  ],
  [PAYMENT_STATUSES.PARTIALLY_REFUNDED]: [
    PAYMENT_STATUSES.PARTIALLY_REFUNDED,
    PAYMENT_STATUSES.REFUNDED
  ],
  [PAYMENT_STATUSES.FAILED]: [],
  [PAYMENT_STATUSES.CANCELLED]: [],
  [PAYMENT_STATUSES.REFUNDED]: []
};

export class PaymentTransactionService {
  constructor() {
    this.db = null;
  }

  _getDb() {
    if (!this.db) {
      this.db = getDb();
    }
    return this.db;
  }

  resolveCollectionType(paymentMethod, paymentSource) {
    const src = String(paymentSource || '').toUpperCase();
    const method = String(paymentMethod || '').toUpperCase();

    if (src === 'SWIGGY' || src === 'ZOMATO' || method === 'SWIGGY_ONLINE' || method === 'ZOMATO_ONLINE') {
      return COLLECTION_TYPES.AGGREGATOR_COLLECTED;
    }

    return COLLECTION_TYPES.RESTAURANT_COLLECTED;
  }

  generateTransactionIdempotencyKey(restaurantId, outletId, orderId, amount, paymentMethod) {
    const raw = `${restaurantId}:${outletId}:${orderId}:${toPaise(amount)}:${paymentMethod}`;
    return generateSha256(raw);
  }

  sanitizePaymentDetails(details = {}) {
    if (!details) return {};

    const sanitized = { ...details };

    delete sanitized.cardNumber;
    delete sanitized.cvv;
    delete sanitized.cvc;
    delete sanitized.expiry;
    delete sanitized.pin;
    delete sanitized.password;

    if (details.cardNumber) {
      const clean = String(details.cardNumber).replace(/\D/g, '');
      sanitized.cardLast4 = clean.slice(-4);
    } else if (details.cardLast4) {
      sanitized.cardLast4 = String(details.cardLast4).slice(-4);
    }

    if (details.cardType) {
      sanitized.cardType = String(details.cardType).toUpperCase();
    }

    return sanitized;
  }

  /**
   * Convenience alias for createPaymentTransaction.
   */
  async recordPayment(restaurantId, payload, actor = { uid: 'system', role: 'system', name: 'System' }) {
    return this.createPaymentTransaction({ ...payload, restaurantId }, actor);
  }

  async createPaymentTransaction(payload, actor = { uid: 'system', role: 'system', name: 'System' }) {
    const {
      restaurantId,
      outletId,
      orderId,
      amount,
      paymentMethod = PAYMENT_METHODS.CASH,
      paymentSource = PAYMENT_SOURCES.POS,
      providerTransactionRef = null,
      details = {},
      status = PAYMENT_STATUSES.CAPTURED,
      pricingBreakdown = null,
      idempotencyKey: customIdempotencyKey = null,
      metadata = {}
    } = payload;

    if (!restaurantId || !outletId || !orderId || amount === undefined || amount === null) {
      throw new Error('Missing mandatory payment fields (restaurantId, outletId, orderId, amount)');
    }

    const db = this._getDb();
    const collectionType = this.resolveCollectionType(paymentMethod, paymentSource);

    if (collectionType === COLLECTION_TYPES.AGGREGATOR_COLLECTED) {
      if (paymentMethod === PAYMENT_METHODS.CASH || paymentMethod === PAYMENT_METHODS.CARD || paymentMethod === PAYMENT_METHODS.UPI) {
        throw new Error(
          `Aggregator order (${paymentSource}) cannot be recorded with tender type ${paymentMethod}. It must be marked as SWIGGY_ONLINE or ZOMATO_ONLINE.`
        );
      }
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      throw new Error(`Invalid transaction amount: ${amount}`);
    }

    const idempotencyKey = customIdempotencyKey || this.generateTransactionIdempotencyKey(
      restaurantId,
      outletId,
      orderId,
      numAmount,
      paymentMethod
    );

    const transactionId = `TXN_${idempotencyKey.substring(0, 16)}`;
    const docPath = `restaurants/${restaurantId}/paymentTransactions/${transactionId}`;
    const txnRef = db.doc(docPath);

    const existingSnap = await txnRef.get();
    if (existingSnap.exists) {
      logger.info('Duplicate payment transaction submission prevented via idempotency key', {
        transactionId,
        orderId,
        idempotencyKey
      });
      return {
        success: true,
        idempotent: true,
        transaction: existingSnap.data()
      };
    }

    const now = new Date().toISOString();
    const sanitizedDetails = this.sanitizePaymentDetails(details);

    const transactionData = {
      transactionId,
      restaurantId,
      outletId,
      compositeKey: `${restaurantId}#${outletId}`,
      orderId,
      paymentSource,
      paymentMethod,
      collectionType,
      amount: toRupees(toPaise(numAmount)),
      amountMinor: toPaise(numAmount),
      currency: 'INR',
      currencySymbol: '₹',
      paymentStatus: status,
      providerTransactionRef,
      paymentDetails: sanitizedDetails,
      pricingBreakdown: pricingBreakdown || null,
      idempotencyKey,
      totalRefundedAmount: 0,
      totalRefundedAmountMinor: 0,
      refunds: [],
      metadata: {
        ...metadata,
        createdActor: actor
      },
      statusHistory: [
        {
          status,
          timestamp: now,
          actor: actor.name || actor.uid || 'System',
          note: `Transaction initialized as ${status}`
        }
      ],
      createdAt: now,
      updatedAt: now
    };

    await txnRef.set(transactionData);

    logger.info('Authoritative payment transaction created', {
      transactionId,
      orderId,
      restaurantId,
      outletId,
      amount: transactionData.amount,
      collectionType,
      paymentMethod,
      status
    });

    return {
      success: true,
      idempotent: false,
      transactionId,
      transaction: transactionData
    };
  }

  async transitionPaymentStatus(restaurantId, transactionId, targetStatus, actor = 'System', note = null) {
    const db = this._getDb();
    const txnRef = db.doc(`restaurants/${restaurantId}/paymentTransactions/${transactionId}`);
    const snap = await txnRef.get();

    if (!snap.exists) {
      throw new Error(`Transaction ${transactionId} not found in restaurant ${restaurantId}`);
    }

    const currentData = snap.data();
    const currentStatus = currentData.paymentStatus;

    if (currentStatus === targetStatus) {
      return { success: true, idempotent: true, transaction: currentData };
    }

    const allowedNext = ALLOWED_PAYMENT_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(targetStatus)) {
      throw new Error(
        `Illegal payment transition from ${currentStatus} to ${targetStatus}. Allowed: [${allowedNext.join(', ')}]`
      );
    }

    const now = new Date().toISOString();
    const history = [...(currentData.statusHistory || [])];
    history.push({
      status: targetStatus,
      timestamp: now,
      actor: typeof actor === 'object' ? actor.name || actor.uid : String(actor),
      note: note || `Status changed from ${currentStatus} to ${targetStatus}`
    });

    const updatePayload = {
      paymentStatus: targetStatus,
      statusHistory: history,
      updatedAt: now
    };

    await txnRef.update(updatePayload);

    logger.info('Payment transaction status transitioned', {
      transactionId,
      from: currentStatus,
      to: targetStatus,
      actor
    });

    return {
      success: true,
      transaction: { ...currentData, ...updatePayload }
    };
  }

  async capturePayment(restaurantId, transactionId, providerRef = null, actor = 'System') {
    const db = this._getDb();
    const txnRef = db.doc(`restaurants/${restaurantId}/paymentTransactions/${transactionId}`);
    const snap = await txnRef.get();

    if (!snap.exists) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const data = snap.data();
    if (data.paymentStatus === PAYMENT_STATUSES.CAPTURED) {
      return { success: true, idempotent: true, transaction: data };
    }

    const allowed = ALLOWED_PAYMENT_TRANSITIONS[data.paymentStatus] || [];
    if (!allowed.includes(PAYMENT_STATUSES.CAPTURED)) {
      throw new Error(`Cannot capture payment in ${data.paymentStatus} state`);
    }

    const now = new Date().toISOString();
    const history = [...(data.statusHistory || [])];
    history.push({
      status: PAYMENT_STATUSES.CAPTURED,
      timestamp: now,
      actor: typeof actor === 'object' ? actor.name || actor.uid : String(actor),
      note: 'Payment successfully captured'
    });

    const updatePayload = {
      paymentStatus: PAYMENT_STATUSES.CAPTURED,
      providerTransactionRef: providerRef || data.providerTransactionRef,
      statusHistory: history,
      capturedAt: now,
      updatedAt: now
    };

    await txnRef.update(updatePayload);

    return {
      success: true,
      transaction: { ...data, ...updatePayload }
    };
  }

  async failPayment(restaurantId, transactionId, failureReason = 'Payment failed', actor = 'System') {
    return this.transitionPaymentStatus(
      restaurantId,
      transactionId,
      PAYMENT_STATUSES.FAILED,
      actor,
      `Failure reason: ${failureReason}`
    );
  }

  async cancelPayment(restaurantId, transactionId, cancellationReason = 'Payment cancelled', actor = 'System') {
    return this.transitionPaymentStatus(
      restaurantId,
      transactionId,
      PAYMENT_STATUSES.CANCELLED,
      actor,
      `Cancellation reason: ${cancellationReason}`
    );
  }

  async processRefund(restaurantId, transactionId, refundInput, actor = { uid: 'system', name: 'System' }) {
    let actualTxnId = transactionId;
    let actualInput = refundInput;
    if (typeof transactionId === 'object' && (!refundInput || refundInput.uid)) {
      if (refundInput && refundInput.uid) actor = refundInput;
      actualInput = transactionId;
      actualTxnId = transactionId.transactionId;
    }

    const {
      amount = actualInput?.refundAmount,
      reason = 'Customer request',
      refundType = 'PARTIAL',
      items = null,
      externalRefundRef = null,
      idempotencyKey: customRefundKey = null
    } = actualInput || {};

    const numRefundAmount = Number(amount);
    if (isNaN(numRefundAmount) || numRefundAmount <= 0) {
      throw new Error(`Invalid refund amount: ${amount}`);
    }

    const refundPaise = toPaise(numRefundAmount);
    const db = this._getDb();
    const txnRef = db.doc(`restaurants/${restaurantId}/paymentTransactions/${actualTxnId}`);
    const snap = await txnRef.get();

    if (!snap.exists) {
      throw new Error(`Transaction ${actualTxnId} not found in restaurant ${restaurantId}`);
    }

    const txn = snap.data();

    if (
      txn.paymentStatus !== PAYMENT_STATUSES.CAPTURED &&
      txn.paymentStatus !== PAYMENT_STATUSES.PARTIALLY_REFUNDED
    ) {
      throw new Error(
        `Cannot refund transaction in status ${txn.paymentStatus}. Must be CAPTURED or PARTIALLY_REFUNDED.`
      );
    }

    const refundIdempotencyKey = customRefundKey || generateSha256(
      `REFUND:${actualTxnId}:${refundPaise}:${reason}:${externalRefundRef || ''}`
    );

    const existingRefund = (txn.refunds || []).find(r => r.idempotencyKey === refundIdempotencyKey);
    if (existingRefund) {
      logger.info('Duplicate refund request prevented via idempotency key', {
        transactionId: actualTxnId,
        refundId: existingRefund.refundId
      });
      return {
        success: true,
        idempotent: true,
        refund: existingRefund,
        transaction: txn
      };
    }

    const currentTotalRefundedPaise = txn.totalRefundedAmountMinor || toPaise(txn.totalRefundedAmount || 0);
    const transactionTotalPaise = txn.amountMinor || toPaise(txn.amount);
    const remainingRefundablePaise = transactionTotalPaise - currentTotalRefundedPaise;

    if (refundPaise > remainingRefundablePaise) {
      throw new Error(
        `Refund amount ₹${toRupees(refundPaise)} exceeds remaining refundable balance ₹${toRupees(remainingRefundablePaise)}`
      );
    }

    const newTotalRefundedPaise = currentTotalRefundedPaise + refundPaise;
    const isFullRefund = newTotalRefundedPaise >= transactionTotalPaise;
    const targetStatus = isFullRefund ? PAYMENT_STATUSES.REFUNDED : PAYMENT_STATUSES.PARTIALLY_REFUNDED;

    const refundId = `REF_${refundIdempotencyKey.substring(0, 14)}`;
    const now = new Date().toISOString();

    const refundRecord = {
      refundId,
      idempotencyKey: refundIdempotencyKey,
      amount: toRupees(refundPaise),
      amountMinor: refundPaise,
      currency: 'INR',
      refundType,
      reason,
      items: items || null,
      externalRefundRef,
      processedBy: actor.name || actor.uid || 'System',
      processedAt: now
    };

    const updatedRefunds = [...(txn.refunds || []), refundRecord];
    const history = [...(txn.statusHistory || [])];
    history.push({
      status: targetStatus,
      timestamp: now,
      actor: actor.name || actor.uid || 'System',
      note: `Refund ₹${refundRecord.amount} processed (${reason}). New balance refunded: ₹${toRupees(newTotalRefundedPaise)}`
    });

    const updatePayload = {
      paymentStatus: targetStatus,
      totalRefundedAmount: toRupees(newTotalRefundedPaise),
      totalRefundedAmountMinor: newTotalRefundedPaise,
      refunds: updatedRefunds,
      statusHistory: history,
      updatedAt: now
    };

    await txnRef.update(updatePayload);

    logger.info('Refund successfully recorded on payment transaction', {
      transactionId: actualTxnId,
      refundId,
      refundAmount: refundRecord.amount,
      targetStatus
    });

    return {
      success: true,
      idempotent: false,
      refund: refundRecord,
      transaction: { ...txn, ...updatePayload }
    };
  }

  async getTransaction(restaurantId, transactionId) {
    const db = this._getDb();
    const snap = await db.doc(`restaurants/${restaurantId}/paymentTransactions/${transactionId}`).get();
    if (!snap.exists) return null;
    return snap.data();
  }

  async getTransactionsByOrder(restaurantId, orderId) {
    const db = this._getDb();
    const snap = await db
      .collection(`restaurants/${restaurantId}/paymentTransactions`)
      .where('orderId', '==', orderId)
      .get();

    return snap.docs.map(d => d.data());
  }

  async getTransactionsByOutlet(restaurantId, outletId, filters = {}) {
    const db = this._getDb();
    let query = db
      .collection(`restaurants/${restaurantId}/paymentTransactions`)
      .where('outletId', '==', outletId);

    if (filters.paymentMethod) {
      query = query.where('paymentMethod', '==', filters.paymentMethod);
    }
    if (filters.collectionType) {
      query = query.where('collectionType', '==', filters.collectionType);
    }
    if (filters.paymentStatus) {
      query = query.where('paymentStatus', '==', filters.paymentStatus);
    }

    const snap = await query.get();
    return snap.docs.map(d => d.data());
  }
}

export const paymentTransactionService = new PaymentTransactionService();
export default paymentTransactionService;
