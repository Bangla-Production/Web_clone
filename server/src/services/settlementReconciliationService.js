/**
 * Abar Khabo: Aggregator Settlement & Financial Reconciliation Engine
 * 
 * Ingests, validates, and reconciles settlement reports from Swiggy, Zomato,
 * or direct payment gateways against internal authoritative order & payment records.
 * 
 * Supports:
 *  - Configurable variance thresholds (absolute ₹ & percentage %).
 *  - 6 reconciliation outcomes: MATCHED, PARTIALLY_MATCHED, MISMATCHED, MISSING_ORDER, DUPLICATE_ENTRY, PENDING_REVIEW.
 *  - JSON batch payloads & CSV settlement import adapters.
 *  - Immutable settlement history and discrepancy audit tracking.
 */

import { getDb } from '../config/firebaseAdmin.js';
import { generateSha256 } from '../utils/cryptoUtils.js';
import { toPaise, toRupees, isWithinTolerance } from '../utils/monetaryUtils.js';
import logger from '../utils/logger.js';

export const RECONCILIATION_OUTCOMES = {
  MATCHED: 'MATCHED',
  PARTIALLY_MATCHED: 'PARTIALLY_MATCHED',
  MISMATCHED: 'MISMATCHED',
  MISSING_ORDER: 'MISSING_ORDER',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  PENDING_REVIEW: 'PENDING_REVIEW'
};

export const SETTLEMENT_STATUSES = {
  RECONCILED: 'RECONCILED',
  DISCREPANCY: 'DISCREPANCY',
  PENDING_REVIEW: 'PENDING_REVIEW',
  DISBURSED: 'DISBURSED'
};

export const DEFAULT_RECONCILIATION_CONFIG = {
  absoluteToleranceRupees: 2.00,
  percentageTolerance: 0.5, // 0.5%
  autoReconcileWithinTolerance: true
};

export class SettlementReconciliationService {
  constructor(config = DEFAULT_RECONCILIATION_CONFIG) {
    this.config = { ...DEFAULT_RECONCILIATION_CONFIG, ...config };
    this.db = null;
  }

  _getDb() {
    if (!this.db) {
      this.db = getDb();
    }
    return this.db;
  }

  /**
   * Parses standard settlement CSV text into a normalized batch structure.
   */
  parseSettlementCsv(csvText, providerName, restaurantId, outletId) {
    if (!csvText || typeof csvText !== 'string') {
      throw new Error('Invalid CSV input: expected non-empty string');
    }

    const lines = csvText.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      throw new Error('CSV must contain at least a header and one data row');
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
    
    // Find column indexes
    const orderIdIdx = headers.findIndex(h => h.includes('orderid') || h.includes('orderref') || h.includes('order#'));
    const grossIdx = headers.findIndex(h => h.includes('gross') || h.includes('itemtotal') || h.includes('totalbill'));
    const commIdx = headers.findIndex(h => h.includes('commission') || h.includes('comm'));
    const tcsIdx = headers.findIndex(h => h.includes('tcs') || h.includes('tcsgst'));
    const tdsIdx = headers.findIndex(h => h.includes('tds'));
    const netIdx = headers.findIndex(h => h.includes('net') || h.includes('netpayout') || h.includes('payable'));
    const utrIdx = headers.findIndex(h => h.includes('utr') || h.includes('bankref'));

    if (orderIdIdx === -1 || grossIdx === -1) {
      throw new Error('CSV missing required columns: Order ID and Gross Amount');
    }

    const orders = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length <= orderIdIdx || !cols[orderIdIdx]) continue;

      const orderRef = cols[orderIdIdx];
      const grossAmount = parseFloat(cols[grossIdx]) || 0;
      const commission = commIdx !== -1 ? parseFloat(cols[commIdx]) || 0 : 0;
      const tcsGst = tcsIdx !== -1 ? parseFloat(cols[tcsIdx]) || 0 : 0;
      const tds = tdsIdx !== -1 ? parseFloat(cols[tdsIdx]) || 0 : 0;
      const netPayout = netIdx !== -1 ? parseFloat(cols[netIdx]) || 0 : (grossAmount - commission - tcsGst - tds);
      const utr = utrIdx !== -1 ? cols[utrIdx] : null;

      orders.push({
        externalOrderRef: orderRef,
        grossAmount: toRupees(toPaise(grossAmount)),
        commission: toRupees(toPaise(commission)),
        tcsGst: toRupees(toPaise(tcsGst)),
        tds: toRupees(toPaise(tds)),
        netPayout: toRupees(toPaise(netPayout)),
        utrNumber: utr
      });
    }

    return {
      providerName: providerName.toUpperCase(),
      restaurantId,
      outletId,
      orders
    };
  }

  /**
   * Ingests and reconciles an aggregator settlement batch against internal order records.
   */
  async ingestAndReconcileBatch(batchPayload, actor = { uid: 'system', name: 'Settlement System' }) {
    const {
      settlementBatchId: customBatchId,
      providerName = 'SWIGGY',
      restaurantId,
      outletId,
      settlementPeriod = {},
      orders = [],
      paymentReference = {},
      customTolerance = null
    } = batchPayload;

    if (!restaurantId || !outletId || !orders.length) {
      throw new Error('Settlement batch requires restaurantId, outletId, and at least one order');
    }

    const db = this._getDb();
    const toleranceRupees = customTolerance?.absoluteToleranceRupees ?? this.config.absoluteToleranceRupees;
    const tolerancePercent = customTolerance?.percentageTolerance ?? this.config.percentageTolerance;

    const settlementBatchId = customBatchId || `SETTLE_${providerName}_${restaurantId}_${outletId}_${Date.now()}`;
    const docPath = `restaurants/${restaurantId}/settlementRecords/${settlementBatchId}`;
    const batchRef = db.doc(docPath);

    // Prevent duplicate batch ingestion
    const existingSnap = await batchRef.get();
    if (existingSnap.exists) {
      logger.info('Duplicate settlement batch submission prevented', { settlementBatchId });
      return {
        success: true,
        idempotent: true,
        settlement: existingSnap.data()
      };
    }

    let batchGrossPaise = 0;
    let batchCommissionPaise = 0;
    let batchTaxesPaise = 0;
    let batchNetPaise = 0;

    let matchedCount = 0;
    let discrepancyCount = 0;
    let missingCount = 0;

    const reconciledOrders = [];
    const seenOrderRefs = new Set();

    // Reconcile each order in the batch
    for (const item of orders) {
      const orderRef = String(item.externalOrderRef || item.orderId || '').trim();
      const settlementGross = toRupees(toPaise(Number(item.grossAmount || 0)));
      const settlementCommission = toRupees(toPaise(Number(item.commission || 0)));
      const settlementTcs = toRupees(toPaise(Number(item.tcsGst || 0)));
      const settlementTds = toRupees(toPaise(Number(item.tds || 0)));
      const settlementNet = toRupees(toPaise(Number(item.netPayout || 0)));

      batchGrossPaise += toPaise(settlementGross);
      batchCommissionPaise += toPaise(settlementCommission);
      batchTaxesPaise += toPaise(settlementTcs) + toPaise(settlementTds);
      batchNetPaise += toPaise(settlementNet);

      // Check for duplicate entry in same batch
      if (seenOrderRefs.has(orderRef)) {
        discrepancyCount++;
        reconciledOrders.push({
          ...item,
          outcome: RECONCILIATION_OUTCOMES.DUPLICATE_ENTRY,
          discrepancyReason: `Order reference ${orderRef} appears more than once in settlement batch`
        });
        continue;
      }
      seenOrderRefs.add(orderRef);

      // Look up internal order in aggregatorOrders
      // Try direct ID, then externalOrderId, then legacy order ID
      let internalOrder = null;
      const orderSnap = await db.doc(`aggregatorOrders/${orderRef}`).get();

      if (orderSnap.exists) {
        internalOrder = orderSnap.data();
      } else {
        // Query by externalOrderId within tenant and outlet
        const querySnap = await db
          .collection('aggregatorOrders')
          .where('restaurantId', '==', restaurantId)
          .where('externalOrderId', '==', orderRef)
          .limit(1)
          .get();

        if (!querySnap.empty) {
          internalOrder = querySnap.docs[0].data();
        }
      }

      if (!internalOrder) {
        missingCount++;
        reconciledOrders.push({
          externalOrderRef: orderRef,
          settlementGross,
          settlementCommission,
          settlementNet,
          outcome: RECONCILIATION_OUTCOMES.MISSING_ORDER,
          discrepancyReason: `Order ${orderRef} does not exist in restaurant order database`
        });
        continue;
      }

      // Check tenant / outlet boundary of the internal order
      if (internalOrder.restaurantId !== restaurantId || internalOrder.outletId !== outletId) {
        discrepancyCount++;
        reconciledOrders.push({
          externalOrderRef: orderRef,
          internalOrderId: internalOrder.orderId,
          outcome: RECONCILIATION_OUTCOMES.MISMATCHED,
          discrepancyReason: `Order belongs to tenant/outlet ${internalOrder.restaurantId}#${internalOrder.outletId}, not ${restaurantId}#${outletId}`
        });
        continue;
      }

      // Compare financials
      const internalGrandTotal = internalOrder.pricing?.grandTotal || internalOrder.totalAmount || 0;
      const internalCommission = internalOrder.pricing?.commissionAmount || 0;
      const internalNetPayout = internalOrder.pricing?.merchantNetPayout || (internalGrandTotal - internalCommission);

      const grossMatches = isWithinTolerance(settlementGross, internalGrandTotal, toleranceRupees, tolerancePercent);
      const netMatches = isWithinTolerance(settlementNet, internalNetPayout, toleranceRupees, tolerancePercent);

      let outcome;
      let reason = null;

      if (grossMatches && netMatches) {
        const isExact = (toPaise(settlementGross) === toPaise(internalGrandTotal)) && (toPaise(settlementNet) === toPaise(internalNetPayout));
        outcome = isExact ? RECONCILIATION_OUTCOMES.MATCHED : RECONCILIATION_OUTCOMES.PARTIALLY_MATCHED;
        matchedCount++;
      } else {
        outcome = RECONCILIATION_OUTCOMES.MISMATCHED;
        discrepancyCount++;
        reason = `Variance detected. Internal Gross: ₹${internalGrandTotal}, Settlement Gross: ₹${settlementGross}. Internal Net: ₹${internalNetPayout}, Settlement Net: ₹${settlementNet}.`;
      }

      reconciledOrders.push({
        externalOrderRef: orderRef,
        internalOrderId: internalOrder.orderId,
        orderDate: internalOrder.timestamps?.placedAt || null,
        settlementGross,
        internalGross: internalGrandTotal,
        settlementCommission,
        internalCommission,
        settlementNet,
        internalNet: internalNetPayout,
        varianceGross: toRupees(toPaise(settlementGross) - toPaise(internalGrandTotal)),
        varianceNet: toRupees(toPaise(settlementNet) - toPaise(internalNetPayout)),
        outcome,
        discrepancyReason: reason
      });
    }

    const overallStatus = (discrepancyCount === 0 && missingCount === 0)
      ? SETTLEMENT_STATUSES.RECONCILED
      : SETTLEMENT_STATUSES.DISCREPANCY;

    const now = new Date().toISOString();
    const settlementRecord = {
      settlementBatchId,
      restaurantId,
      outletId,
      compositeKey: `${restaurantId}#${outletId}`,
      providerName: providerName.toUpperCase(),
      settlementPeriod: {
        startDate: settlementPeriod.startDate || now,
        endDate: settlementPeriod.endDate || now
      },
      orderCount: orders.length,
      matchedCount,
      discrepancyCount,
      missingCount,
      summary: {
        grossOrderAmount: toRupees(batchGrossPaise),
        totalCommission: toRupees(batchCommissionPaise),
        totalTaxes: toRupees(batchTaxesPaise),
        totalNetPayable: toRupees(batchNetPaise),
        actualPayoutAmount: toRupees(toPaise(paymentReference.payoutAmount || toRupees(batchNetPaise)))
      },
      payoutStatus: overallStatus,
      paymentReference: {
        utrNumber: paymentReference.utrNumber || null,
        bankName: paymentReference.bankName || null,
        accountNumberLast4: paymentReference.accountNumberLast4 ? String(paymentReference.accountNumberLast4).slice(-4) : null,
        disbursedAt: paymentReference.disbursedAt || now
      },
      reconciledOrders,
      importedBy: actor.name || actor.uid || 'System',
      createdAt: now,
      updatedAt: now
    };

    await batchRef.set(settlementRecord);

    logger.info('Settlement batch reconciled and persisted', {
      settlementBatchId,
      restaurantId,
      outletId,
      orderCount: orders.length,
      matchedCount,
      discrepancyCount,
      missingCount,
      payoutStatus: overallStatus
    });

    return {
      success: true,
      idempotent: false,
      settlement: settlementRecord
    };
  }

  /**
   * Retrieves a settlement record by batch ID.
   */
  async getSettlementBatch(restaurantId, settlementBatchId) {
    const db = this._getDb();
    const snap = await db.doc(`restaurants/${restaurantId}/settlementRecords/${settlementBatchId}`).get();
    if (!snap.exists) return null;
    return snap.data();
  }

  /**
   * Lists settlement batches for an outlet with optional filters.
   */
  async listSettlementBatches(restaurantId, outletId, filters = {}) {
    const db = this._getDb();
    let query = db
      .collection(`restaurants/${restaurantId}/settlementRecords`)
      .where('outletId', '==', outletId);

    if (filters.providerName) {
      query = query.where('providerName', '==', filters.providerName.toUpperCase());
    }
    if (filters.payoutStatus) {
      query = query.where('payoutStatus', '==', filters.payoutStatus);
    }

    const snap = await query.get();
    return snap.docs.map(d => d.data());
  }

  /**
   * Resolves a discrepancy line item in a settlement record.
   */
  async resolveDiscrepancy(restaurantId, settlementBatchId, externalOrderRef, resolution, actor = { uid: 'admin', name: 'Admin' }) {
    const db = this._getDb();
    const batchRef = db.doc(`restaurants/${restaurantId}/settlementRecords/${settlementBatchId}`);
    const snap = await batchRef.get();

    if (!snap.exists) {
      throw new Error(`Settlement batch ${settlementBatchId} not found`);
    }

    const record = snap.data();
    const orders = record.reconciledOrders || [];
    const idx = orders.findIndex(o => o.externalOrderRef === externalOrderRef);

    if (idx === -1) {
      throw new Error(`Order ${externalOrderRef} not found in settlement batch`);
    }

    orders[idx] = {
      ...orders[idx],
      outcome: RECONCILIATION_OUTCOMES.MATCHED,
      discrepancyResolution: {
        resolvedBy: actor.name || actor.uid || 'Admin',
        resolutionNote: resolution.note || 'Manually approved',
        resolvedAt: new Date().toISOString()
      }
    };

    const remainingDiscrepancies = orders.filter(
      o => o.outcome === RECONCILIATION_OUTCOMES.MISMATCHED || o.outcome === RECONCILIATION_OUTCOMES.MISSING_ORDER
    ).length;

    const newStatus = remainingDiscrepancies === 0 ? SETTLEMENT_STATUSES.RECONCILED : SETTLEMENT_STATUSES.DISCREPANCY;

    await batchRef.update({
      reconciledOrders: orders,
      payoutStatus: newStatus,
      updatedAt: new Date().toISOString()
    });

    return {
      success: true,
      settlementBatchId,
      payoutStatus: newStatus,
      resolvedOrder: orders[idx]
    };
  }
}

export const settlementReconciliationService = new SettlementReconciliationService();
export default settlementReconciliationService;
