/**
 * Abar Khabo: Enterprise Multi-Tenant SaaS
 * Inventory Ledger, Stock Balance & Transaction Safety Engine
 * 
 * Collections:
 * - Ingredient Catalog: restaurants/{restaurantId}/ingredients/{ingredientId}
 * - Outlet Stock: restaurants/{restaurantId}/outlets/{outletId}/inventoryStock/{ingredientId}
 * - Immutable Audit Ledger: restaurants/{restaurantId}/inventoryLedger/{ledgerId}
 * - Stock Transfers: restaurants/{restaurantId}/stockTransfers/{transferId}
 * - Purchases: restaurants/{restaurantId}/outlets/{outletId}/purchases/{purchaseId}
 */

import { getDb } from '../config/firebaseAdmin.js';
import { logger } from '../utils/logger.js';
import { generateSha256 } from '../utils/cryptoUtils.js';
import { convertUnit, areUnitsCompatible, normalizeUnit } from '../utils/unitConverter.js';
import { recipeService } from './recipeService.js';

export const MOVEMENT_TYPES = {
  OPENING_STOCK: 'OPENING_STOCK',
  PURCHASE: 'PURCHASE',
  STOCK_ADJUSTMENT: 'STOCK_ADJUSTMENT',
  RESERVATION: 'RESERVATION',
  RESERVATION_RELEASE: 'RESERVATION_RELEASE',
  CONSUMPTION: 'CONSUMPTION',
  RESTOCK: 'RESTOCK',
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  WASTAGE: 'WASTAGE'
};

export const DEFAULT_INVENTORY_POLICY = {
  allowNegativeStock: false,
  autoReleaseReservationOnCancel: true,
  postPrepCancellationAction: 'WASTAGE', // 'WASTAGE' | 'RESTOCK' | 'MANUAL'
  deductionTrigger: 'ON_PREPARATION', // 'ON_PREPARATION' | 'ON_ACCEPTANCE'
  trackWastageOnCancel: true,
  lowStockThresholdPercent: 20
};

export class InventoryLedgerService {
  /**
   * Generates a deterministic idempotency key and ledger document ID.
   */
  generateLedgerKey(movementType, restaurantId, outletId, referenceId, ingredientId) {
    const canonicalKey = `${movementType}:${restaurantId}:${outletId}:${referenceId}:${ingredientId}`;
    const hash = generateSha256(canonicalKey);
    const ledgerId = `LEDGER_${hash.substring(0, 20)}`;
    return { canonicalKey, hash, ledgerId };
  }

  /**
   * Resolves effective inventory policy for a restaurant/outlet.
   */
  async resolveInventoryPolicy(restaurantId, outletId) {
    const db = getDb();
    try {
      const policySnap = await db.doc(`restaurants/${restaurantId}/settings/inventoryPolicy`).get();
      if (policySnap.exists) {
        return { ...DEFAULT_INVENTORY_POLICY, ...policySnap.data() };
      }
    } catch (err) {
      logger.warn('Could not load custom inventory policy, using default', { error: err.message });
    }
    return { ...DEFAULT_INVENTORY_POLICY };
  }

  /**
   * Convenience alias for reserveOrderStock.
   */
  async reserveStockForOrder(restaurantId, outletId, orderId, items, actor = null) {
    return this.reserveOrderStock(restaurantId, outletId, { orderId, id: orderId, items }, actor);
  }

  /**
   * Atomically reserves stock for an order based on required ingredients.
   * 
   * @param {string} restaurantId 
   * @param {string} outletId 
   * @param {Object} order - Order object with items
   * @param {Object} [actor] 
   * @param {Object} [customPolicy] 
   * @returns {Promise<{ success: boolean, reservedIngredients: Array<Object>, reason?: string, details?: any }>}
   */
  async reserveOrderStock(restaurantId, outletId, order, actor = null, customPolicy = null) {
    const db = getDb();
    const orderId = order.orderId || order.id;
    const policy = customPolicy || await this.resolveInventoryPolicy(restaurantId, outletId);

    // 1. Resolve ingredients needed from recipes
    const resolution = await recipeService.resolveOrderIngredients(restaurantId, outletId, order.items || []);
    if (!resolution.hasRecipes || resolution.requiredIngredients.length === 0) {
      // Items have no recipe; no recipe-based stock reservation required
      return {
        success: true,
        reserved: false,
        reason: 'NO_RECIPE_CONFIGURED',
        requiredIngredients: []
      };
    }

    const requiredIngredients = resolution.requiredIngredients;
    const now = new Date().toISOString();
    const actorInfo = actor || { uid: 'system', role: 'system', name: 'Order Engine' };

    // 2. Execute transaction-safe reservation across all required ingredients
    try {
      const result = await db.runTransaction(async (transaction) => {
        const stockDocs = [];

        // Phase 1: Read all stock records and check availability
        for (const req of requiredIngredients) {
          const stockRef = db.doc(`restaurants/${restaurantId}/outlets/${outletId}/inventoryStock/${req.ingredientId}`);
          const stockSnap = await transaction.get(stockRef);

          let currentStock = 0;
          let reservedStock = 0;
          let stockUnit = req.unit;
          let minThreshold = 5;
          let name = req.name;

          if (stockSnap.exists) {
            const data = stockSnap.data();
            currentStock = Number(data.currentStock || 0);
            reservedStock = Number(data.reservedStock || 0);
            stockUnit = data.unit || req.unit;
            minThreshold = Number(data.minThreshold || 5);
            name = data.name || req.name;
          }

          // Convert recipe required quantity to stock unit
          let convertedReqQty = req.quantity;
          if (stockUnit !== req.unit) {
            if (areUnitsCompatible(req.unit, stockUnit)) {
              convertedReqQty = convertUnit(req.quantity, req.unit, stockUnit);
            } else {
              throw new Error(`Incompatible units for ingredient ${req.ingredientId}: recipe is ${req.unit}, stock is ${stockUnit}`);
            }
          }

          const availableStock = currentStock - reservedStock;

          // Check if stock is sufficient
          if (availableStock < convertedReqQty && !policy.allowNegativeStock) {
            return {
              success: false,
              insufficient: true,
              ingredientId: req.ingredientId,
              ingredientName: name,
              available: availableStock,
              required: convertedReqQty,
              unit: stockUnit
            };
          }

          stockDocs.push({
            stockRef,
            exists: stockSnap.exists,
            ingredientId: req.ingredientId,
            name,
            currentStock,
            reservedStock,
            stockUnit,
            minThreshold,
            convertedReqQty
          });
        }

        // Phase 2: If all available, commit reservation and append ledger entries
        const ledgerEntries = [];
        for (const item of stockDocs) {
          const newReserved = Number((item.reservedStock + item.convertedReqQty).toFixed(4));
          const newAvailable = Number((item.currentStock - newReserved).toFixed(4));

          const { canonicalKey, ledgerId } = this.generateLedgerKey(
            MOVEMENT_TYPES.RESERVATION,
            restaurantId,
            outletId,
            orderId,
            item.ingredientId
          );

          // Update stock balance document
          const stockPayload = {
            ingredientId: item.ingredientId,
            restaurantId,
            outletId,
            compositeKey: `${restaurantId}#${outletId}`,
            name: item.name,
            unit: item.stockUnit,
            currentStock: item.currentStock,
            reservedStock: newReserved,
            availableStock: newAvailable,
            minThreshold: item.minThreshold,
            isLowStock: newAvailable <= item.minThreshold,
            isOutOfStock: newAvailable <= 0,
            lastMovementType: MOVEMENT_TYPES.RESERVATION,
            lastMovementAt: now,
            updatedAt: now
          };

          transaction.set(item.stockRef, stockPayload, { merge: true });

          // Write ledger document
          const ledgerRef = db.doc(`restaurants/${restaurantId}/inventoryLedger/${ledgerId}`);
          const ledgerPayload = {
            _schemaVersion: '2.0.0',
            ledgerId,
            idempotencyKey: canonicalKey,
            restaurantId,
            outletId,
            ingredientId: item.ingredientId,
            movementType: MOVEMENT_TYPES.RESERVATION,
            quantityChange: item.convertedReqQty,
            unit: item.stockUnit,
            balanceBefore: item.currentStock,
            balanceAfter: item.currentStock,
            reservedBefore: item.reservedStock,
            reservedAfter: newReserved,
            availableBefore: item.currentStock - item.reservedStock,
            availableAfter: newAvailable,
            referenceType: 'ORDER',
            referenceId: orderId,
            reason: `Order ${orderId} placed — stock reserved`,
            actor: actorInfo,
            timestamp: now
          };

          transaction.set(ledgerRef, ledgerPayload);
          ledgerEntries.push(ledgerId);
        }

        return {
          success: true,
          reserved: true,
          requiredIngredients,
          ledgerEntries
        };
      });

      if (!result.success && result.insufficient) {
        logger.warn('Order stock reservation rejected: insufficient stock', {
          orderId,
          ingredientId: result.ingredientId,
          available: result.available,
          required: result.required
        });
        return {
          success: false,
          reason: 'INSUFFICIENT_STOCK',
          details: result
        };
      }

      logger.info('Stock successfully reserved for order', { orderId, ingredientsCount: requiredIngredients.length });
      return result;

    } catch (err) {
      logger.error('Failed to reserve stock for order', { orderId, error: err.message });
      throw err;
    }
  }

  /**
   * Converts reserved stock to consumed stock when cooking begins (PREPARING) or order accepted.
   * Idempotent: repeated calls do not double-deduct.
   * 
   * @param {string} restaurantId 
   * @param {string} outletId 
   * @param {Object} order 
   * @param {Object} [actor] 
   * @returns {Promise<Object>}
   */
  async consumeOrderStock(restaurantId, outletId, order, actor = null) {
    const db = getDb();
    const orderId = order.orderId || order.id;

    // 1. Resolve required ingredients
    const resolution = await recipeService.resolveOrderIngredients(restaurantId, outletId, order.items || []);
    if (!resolution.hasRecipes || resolution.requiredIngredients.length === 0) {
      return { success: true, consumed: false, reason: 'NO_RECIPE_CONFIGURED' };
    }

    const requiredIngredients = resolution.requiredIngredients;
    const now = new Date().toISOString();
    const actorInfo = actor || { uid: 'kitchen', role: 'kitchen', name: 'Kitchen Staff' };

    try {
      const result = await db.runTransaction(async (transaction) => {
        const ledgerEntries = [];

        for (const req of requiredIngredients) {
          const { canonicalKey, ledgerId } = this.generateLedgerKey(
            MOVEMENT_TYPES.CONSUMPTION,
            restaurantId,
            outletId,
            orderId,
            req.ingredientId
          );

          // Check idempotency: if consumption ledger entry already exists, skip
          const ledgerRef = db.doc(`restaurants/${restaurantId}/inventoryLedger/${ledgerId}`);
          const existingLedger = await transaction.get(ledgerRef);
          if (existingLedger.exists) {
            logger.info('Order stock consumption already recorded — idempotent skip', { orderId, ledgerId });
            continue;
          }

          const stockRef = db.doc(`restaurants/${restaurantId}/outlets/${outletId}/inventoryStock/${req.ingredientId}`);
          const stockSnap = await transaction.get(stockRef);

          let currentStock = 0;
          let reservedStock = 0;
          let stockUnit = req.unit;
          let minThreshold = 5;
          let name = req.name;

          if (stockSnap.exists) {
            const data = stockSnap.data();
            currentStock = Number(data.currentStock || 0);
            reservedStock = Number(data.reservedStock || 0);
            stockUnit = data.unit || req.unit;
            minThreshold = Number(data.minThreshold || 5);
            name = data.name || req.name;
          }

          let convertedReqQty = req.quantity;
          if (stockUnit !== req.unit) {
            if (areUnitsCompatible(req.unit, stockUnit)) {
              convertedReqQty = convertUnit(req.quantity, req.unit, stockUnit);
            }
          }

          // Decrement reserved and current stock
          const newReserved = Math.max(0, Number((reservedStock - convertedReqQty).toFixed(4)));
          const newCurrent = Number((currentStock - convertedReqQty).toFixed(4));
          const newAvailable = Number((newCurrent - newReserved).toFixed(4));

          const stockPayload = {
            ingredientId: req.ingredientId,
            restaurantId,
            outletId,
            compositeKey: `${restaurantId}#${outletId}`,
            name,
            unit: stockUnit,
            currentStock: newCurrent,
            reservedStock: newReserved,
            availableStock: newAvailable,
            minThreshold,
            isLowStock: newAvailable <= minThreshold,
            isOutOfStock: newAvailable <= 0,
            lastMovementType: MOVEMENT_TYPES.CONSUMPTION,
            lastMovementAt: now,
            updatedAt: now
          };

          transaction.set(stockRef, stockPayload, { merge: true });

          const ledgerPayload = {
            _schemaVersion: '2.0.0',
            ledgerId,
            idempotencyKey: canonicalKey,
            restaurantId,
            outletId,
            ingredientId: req.ingredientId,
            movementType: MOVEMENT_TYPES.CONSUMPTION,
            quantityChange: -convertedReqQty,
            unit: stockUnit,
            balanceBefore: currentStock,
            balanceAfter: newCurrent,
            reservedBefore: reservedStock,
            reservedAfter: newReserved,
            availableBefore: currentStock - reservedStock,
            availableAfter: newAvailable,
            referenceType: 'ORDER',
            referenceId: orderId,
            reason: `Order ${orderId} cooking started — stock consumed`,
            actor: actorInfo,
            timestamp: now
          };

          transaction.set(ledgerRef, ledgerPayload);
          ledgerEntries.push(ledgerId);
        }

        return {
          success: true,
          consumed: true,
          ledgerEntries
        };
      });

      logger.info('Stock consumed for order', { orderId });
      return result;
    } catch (err) {
      logger.error('Failed to consume stock for order', { orderId, error: err.message });
      throw err;
    }
  }

  /**
   * Releases reserved stock when an order is cancelled BEFORE preparation begins.
   * 
   * @param {string} restaurantId 
   * @param {string} outletId 
   * @param {Object} order 
   * @param {Object} [actor] 
   * @returns {Promise<Object>}
   */
  async releaseOrderReservation(restaurantId, outletId, order, actor = null) {
    const db = getDb();
    const orderId = order.orderId || order.id;

    const resolution = await recipeService.resolveOrderIngredients(restaurantId, outletId, order.items || []);
    if (!resolution.hasRecipes || resolution.requiredIngredients.length === 0) {
      return { success: true, released: false };
    }

    const now = new Date().toISOString();
    const actorInfo = actor || { uid: 'system', role: 'system', name: 'Order Cancellation' };

    try {
      const result = await db.runTransaction(async (transaction) => {
        const ledgerEntries = [];

        for (const req of resolution.requiredIngredients) {
          const { canonicalKey, ledgerId } = this.generateLedgerKey(
            MOVEMENT_TYPES.RESERVATION_RELEASE,
            restaurantId,
            outletId,
            orderId,
            req.ingredientId
          );

          const ledgerRef = db.doc(`restaurants/${restaurantId}/inventoryLedger/${ledgerId}`);
          const existingLedger = await transaction.get(ledgerRef);
          if (existingLedger.exists) {
            continue; // Already released
          }

          const stockRef = db.doc(`restaurants/${restaurantId}/outlets/${outletId}/inventoryStock/${req.ingredientId}`);
          const stockSnap = await transaction.get(stockRef);
          if (!stockSnap.exists) continue;

          const data = stockSnap.data();
          const currentStock = Number(data.currentStock || 0);
          const reservedStock = Number(data.reservedStock || 0);
          const stockUnit = data.unit || req.unit;
          const minThreshold = Number(data.minThreshold || 5);

          let convertedReqQty = req.quantity;
          if (stockUnit !== req.unit && areUnitsCompatible(req.unit, stockUnit)) {
            convertedReqQty = convertUnit(req.quantity, req.unit, stockUnit);
          }

          const newReserved = Math.max(0, Number((reservedStock - convertedReqQty).toFixed(4)));
          const newAvailable = Number((currentStock - newReserved).toFixed(4));

          transaction.set(stockRef, {
            reservedStock: newReserved,
            availableStock: newAvailable,
            isLowStock: newAvailable <= minThreshold,
            isOutOfStock: newAvailable <= 0,
            lastMovementType: MOVEMENT_TYPES.RESERVATION_RELEASE,
            lastMovementAt: now,
            updatedAt: now
          }, { merge: true });

          const ledgerPayload = {
            _schemaVersion: '2.0.0',
            ledgerId,
            idempotencyKey: canonicalKey,
            restaurantId,
            outletId,
            ingredientId: req.ingredientId,
            movementType: MOVEMENT_TYPES.RESERVATION_RELEASE,
            quantityChange: -convertedReqQty, // Released from reservation
            unit: stockUnit,
            balanceBefore: currentStock,
            balanceAfter: currentStock,
            reservedBefore: reservedStock,
            reservedAfter: newReserved,
            availableBefore: currentStock - reservedStock,
            availableAfter: newAvailable,
            referenceType: 'ORDER',
            referenceId: orderId,
            reason: `Order ${orderId} cancelled before prep — reservation released`,
            actor: actorInfo,
            timestamp: now
          };

          transaction.set(ledgerRef, ledgerPayload);
          ledgerEntries.push(ledgerId);
        }

        return { success: true, released: true, ledgerEntries };
      });

      logger.info('Stock reservation released for cancelled order', { orderId });
      return result;
    } catch (err) {
      logger.error('Failed to release stock reservation', { orderId, error: err.message });
      throw err;
    }
  }

  /**
   * Handles order cancellation based on lifecycle stage (Pre-prep vs Post-prep).
   */
  async handleOrderCancellation(restaurantId, outletId, order, actor = null) {
    const policy = await this.resolveInventoryPolicy(restaurantId, outletId);
    const orderStatus = order.orderStatus || 'PLACED';

    const wasCookingStarted = ['PREPARING', 'READY', 'DISPATCHED'].includes(orderStatus);

    if (!wasCookingStarted) {
      // Pre-cooking cancellation: release reservations
      return this.releaseOrderReservation(restaurantId, outletId, order, actor);
    } else {
      // Post-cooking cancellation: food was already cooked
      if (policy.postPrepCancellationAction === 'RESTOCK') {
        return this.restockOrderIngredients(restaurantId, outletId, order, actor, 'Cancelled post-cooking — policy restock');
      } else {
        // Record wastage: raw ingredients are not restocked
        return this.recordOrderWastage(restaurantId, outletId, order, actor, 'Cancelled after cooking began — recorded as wastage');
      }
    }
  }

  /**
   * Records wastage for an order.
   */
  async recordOrderWastage(restaurantId, outletId, order, actor = null, reason = 'Order cancelled after cooking') {
    const db = getDb();
    const orderId = order.orderId || order.id;

    const resolution = await recipeService.resolveOrderIngredients(restaurantId, outletId, order.items || []);
    if (!resolution.hasRecipes || resolution.requiredIngredients.length === 0) {
      return { success: true, wastageRecorded: false };
    }

    const now = new Date().toISOString();
    const actorInfo = actor || { uid: 'kitchen', role: 'kitchen', name: 'Kitchen Staff' };

    try {
      await db.runTransaction(async (transaction) => {
        for (const req of resolution.requiredIngredients) {
          const { canonicalKey, ledgerId } = this.generateLedgerKey(
            MOVEMENT_TYPES.WASTAGE,
            restaurantId,
            outletId,
            orderId,
            req.ingredientId
          );

          const ledgerRef = db.doc(`restaurants/${restaurantId}/inventoryLedger/${ledgerId}`);
          const existing = await transaction.get(ledgerRef);
          if (existing.exists) continue;

          const stockRef = db.doc(`restaurants/${restaurantId}/outlets/${outletId}/inventoryStock/${req.ingredientId}`);
          const stockSnap = await transaction.get(stockRef);
          const currentStock = stockSnap.exists ? Number(stockSnap.data().currentStock || 0) : 0;
          const reservedStock = stockSnap.exists ? Number(stockSnap.data().reservedStock || 0) : 0;
          const stockUnit = stockSnap.exists ? (stockSnap.data().unit || req.unit) : req.unit;

          const ledgerPayload = {
            _schemaVersion: '2.0.0',
            ledgerId,
            idempotencyKey: canonicalKey,
            restaurantId,
            outletId,
            ingredientId: req.ingredientId,
            movementType: MOVEMENT_TYPES.WASTAGE,
            quantityChange: -req.quantity,
            unit: stockUnit,
            balanceBefore: currentStock,
            balanceAfter: currentStock,
            reservedBefore: reservedStock,
            reservedAfter: reservedStock,
            availableBefore: currentStock - reservedStock,
            availableAfter: currentStock - reservedStock,
            referenceType: 'ORDER',
            referenceId: orderId,
            reason,
            actor: actorInfo,
            timestamp: now
          };

          transaction.set(ledgerRef, ledgerPayload);
        }
      });

      logger.info('Order cancellation wastage recorded', { orderId });
      return { success: true, wastageRecorded: true };
    } catch (err) {
      logger.error('Failed to record order wastage', { orderId, error: err.message });
      throw err;
    }
  }

  /**
   * Restocks order ingredients explicitly.
   */
  async restockOrderIngredients(restaurantId, outletId, order, actor = null, reason = 'Order restocked') {
    const db = getDb();
    const orderId = order.orderId || order.id;

    const resolution = await recipeService.resolveOrderIngredients(restaurantId, outletId, order.items || []);
    if (!resolution.hasRecipes || resolution.requiredIngredients.length === 0) {
      return { success: true, restocked: false };
    }

    const now = new Date().toISOString();
    const actorInfo = actor || { uid: 'kitchen', role: 'kitchen', name: 'Kitchen Staff' };

    try {
      await db.runTransaction(async (transaction) => {
        for (const req of resolution.requiredIngredients) {
          const { canonicalKey, ledgerId } = this.generateLedgerKey(
            MOVEMENT_TYPES.RESTOCK,
            restaurantId,
            outletId,
            orderId,
            req.ingredientId
          );

          const ledgerRef = db.doc(`restaurants/${restaurantId}/inventoryLedger/${ledgerId}`);
          const existing = await transaction.get(ledgerRef);
          if (existing.exists) continue;

          const stockRef = db.doc(`restaurants/${restaurantId}/outlets/${outletId}/inventoryStock/${req.ingredientId}`);
          const stockSnap = await transaction.get(stockRef);
          if (!stockSnap.exists) continue;

          const data = stockSnap.data();
          const currentStock = Number(data.currentStock || 0);
          const reservedStock = Number(data.reservedStock || 0);
          const stockUnit = data.unit || req.unit;
          const minThreshold = Number(data.minThreshold || 5);

          let convertedReqQty = req.quantity;
          if (stockUnit !== req.unit && areUnitsCompatible(req.unit, stockUnit)) {
            convertedReqQty = convertUnit(req.quantity, req.unit, stockUnit);
          }

          const newCurrent = Number((currentStock + convertedReqQty).toFixed(4));
          const newAvailable = Number((newCurrent - reservedStock).toFixed(4));

          transaction.set(stockRef, {
            currentStock: newCurrent,
            availableStock: newAvailable,
            isLowStock: newAvailable <= minThreshold,
            isOutOfStock: newAvailable <= 0,
            lastMovementType: MOVEMENT_TYPES.RESTOCK,
            lastMovementAt: now,
            updatedAt: now
          }, { merge: true });

          const ledgerPayload = {
            _schemaVersion: '2.0.0',
            ledgerId,
            idempotencyKey: canonicalKey,
            restaurantId,
            outletId,
            ingredientId: req.ingredientId,
            movementType: MOVEMENT_TYPES.RESTOCK,
            quantityChange: convertedReqQty,
            unit: stockUnit,
            balanceBefore: currentStock,
            balanceAfter: newCurrent,
            reservedBefore: reservedStock,
            reservedAfter: reservedStock,
            availableBefore: currentStock - reservedStock,
            availableAfter: newAvailable,
            referenceType: 'ORDER',
            referenceId: orderId,
            reason,
            actor: actorInfo,
            timestamp: now
          };

          transaction.set(ledgerRef, ledgerPayload);
        }
      });

      return { success: true, restocked: true };
    } catch (err) {
      logger.error('Failed to restock order ingredients', { orderId, error: err.message });
      throw err;
    }
  }

  /**
   * Manual physical stock adjustment.
   */
  async adjustStock(restaurantId, outletId, ingredientId, newQuantity, reason = 'Physical stock count', actor = null) {
    const db = getDb();
    const now = new Date().toISOString();
    const actorInfo = actor || { uid: 'manager', role: 'outlet_manager', name: 'Outlet Manager' };
    const adjId = `ADJ_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const { canonicalKey, ledgerId } = this.generateLedgerKey(
      MOVEMENT_TYPES.STOCK_ADJUSTMENT,
      restaurantId,
      outletId,
      adjId,
      ingredientId
    );

    return db.runTransaction(async (transaction) => {
      const stockRef = db.doc(`restaurants/${restaurantId}/outlets/${outletId}/inventoryStock/${ingredientId}`);
      const stockSnap = await transaction.get(stockRef);

      let currentStock = 0;
      let reservedStock = 0;
      let stockUnit = 'kg';
      let minThreshold = 5;
      let name = ingredientId;

      if (stockSnap.exists) {
        const data = stockSnap.data();
        currentStock = Number(data.currentStock || 0);
        reservedStock = Number(data.reservedStock || 0);
        stockUnit = data.unit || 'kg';
        minThreshold = Number(data.minThreshold || 5);
        name = data.name || ingredientId;
      }

      const parsedNewQty = Number(newQuantity);
      const diff = Number((parsedNewQty - currentStock).toFixed(4));
      const newAvailable = Number((parsedNewQty - reservedStock).toFixed(4));

      transaction.set(stockRef, {
        ingredientId,
        restaurantId,
        outletId,
        compositeKey: `${restaurantId}#${outletId}`,
        name,
        unit: stockUnit,
        currentStock: parsedNewQty,
        reservedStock,
        availableStock: newAvailable,
        minThreshold,
        isLowStock: newAvailable <= minThreshold,
        isOutOfStock: newAvailable <= 0,
        lastMovementType: MOVEMENT_TYPES.STOCK_ADJUSTMENT,
        lastMovementAt: now,
        updatedAt: now
      }, { merge: true });

      const ledgerRef = db.doc(`restaurants/${restaurantId}/inventoryLedger/${ledgerId}`);
      const ledgerPayload = {
        _schemaVersion: '2.0.0',
        ledgerId,
        idempotencyKey: canonicalKey,
        restaurantId,
        outletId,
        ingredientId,
        movementType: MOVEMENT_TYPES.STOCK_ADJUSTMENT,
        quantityChange: diff,
        unit: stockUnit,
        balanceBefore: currentStock,
        balanceAfter: parsedNewQty,
        reservedBefore: reservedStock,
        reservedAfter: reservedStock,
        availableBefore: currentStock - reservedStock,
        availableAfter: newAvailable,
        referenceType: 'ADJUSTMENT',
        referenceId: adjId,
        reason,
        actor: actorInfo,
        timestamp: now
      };

      transaction.set(ledgerRef, ledgerPayload);

      return {
        success: true,
        ingredientId,
        balanceBefore: currentStock,
        balanceAfter: parsedNewQty,
        diff,
        ledgerId
      };
    });
  }

  /**
   * Records inward goods receipt from a supplier purchase order.
   */
  async recordPurchaseInward(restaurantId, outletId, purchaseData, actor = null) {
    const db = getDb();
    const now = new Date().toISOString();
    const purchaseId = purchaseData.id || `PO_${Date.now()}`;
    const actorInfo = actor || { uid: 'manager', role: 'outlet_manager', name: 'Outlet Manager' };

    return db.runTransaction(async (transaction) => {
      const items = purchaseData.items || [];
      const ledgerIds = [];

      for (const item of items) {
        const { canonicalKey, ledgerId } = this.generateLedgerKey(
          MOVEMENT_TYPES.PURCHASE,
          restaurantId,
          outletId,
          purchaseId,
          item.ingredientId
        );

        const stockRef = db.doc(`restaurants/${restaurantId}/outlets/${outletId}/inventoryStock/${item.ingredientId}`);
        const stockSnap = await transaction.get(stockRef);

        let currentStock = 0;
        let reservedStock = 0;
        let stockUnit = item.unit || 'kg';
        let minThreshold = 5;
        let name = item.name || item.ingredientId;

        if (stockSnap.exists) {
          const data = stockSnap.data();
          currentStock = Number(data.currentStock || 0);
          reservedStock = Number(data.reservedStock || 0);
          stockUnit = data.unit || item.unit;
          minThreshold = Number(data.minThreshold || 5);
          name = data.name || name;
        }

        let purchaseQty = Number(item.quantity || 0);
        if (item.unit && item.unit !== stockUnit && areUnitsCompatible(item.unit, stockUnit)) {
          purchaseQty = convertUnit(purchaseQty, item.unit, stockUnit);
        }

        const newCurrent = Number((currentStock + purchaseQty).toFixed(4));
        const newAvailable = Number((newCurrent - reservedStock).toFixed(4));

        transaction.set(stockRef, {
          ingredientId: item.ingredientId,
          restaurantId,
          outletId,
          compositeKey: `${restaurantId}#${outletId}`,
          name,
          unit: stockUnit,
          currentStock: newCurrent,
          reservedStock,
          availableStock: newAvailable,
          minThreshold,
          isLowStock: newAvailable <= minThreshold,
          isOutOfStock: newAvailable <= 0,
          lastMovementType: MOVEMENT_TYPES.PURCHASE,
          lastMovementAt: now,
          updatedAt: now
        }, { merge: true });

        const ledgerRef = db.doc(`restaurants/${restaurantId}/inventoryLedger/${ledgerId}`);
        transaction.set(ledgerRef, {
          _schemaVersion: '2.0.0',
          ledgerId,
          idempotencyKey: canonicalKey,
          restaurantId,
          outletId,
          ingredientId: item.ingredientId,
          movementType: MOVEMENT_TYPES.PURCHASE,
          quantityChange: purchaseQty,
          unit: stockUnit,
          balanceBefore: currentStock,
          balanceAfter: newCurrent,
          reservedBefore: reservedStock,
          reservedAfter: reservedStock,
          availableBefore: currentStock - reservedStock,
          availableAfter: newAvailable,
          referenceType: 'PURCHASE',
          referenceId: purchaseId,
          reason: `Goods receipt from supplier ${purchaseData.supplierId || ''}`,
          actor: actorInfo,
          timestamp: now
        });

        ledgerIds.push(ledgerId);
      }

      // Save purchase document
      const purchaseRef = db.doc(`restaurants/${restaurantId}/outlets/${outletId}/purchases/${purchaseId}`);
      transaction.set(purchaseRef, {
        ...purchaseData,
        id: purchaseId,
        restaurantId,
        outletId,
        status: 'RECEIVED',
        receivedBy: actorInfo.uid,
        receivedAt: now
      }, { merge: true });

      return { success: true, purchaseId, ledgerIds };
    });
  }

  /**
   * Initiates an outlet-to-outlet stock transfer.
   */
  async transferStock(restaurantId, sourceOutletId, destinationOutletId, items, actor = null, notes = '') {
    const db = getDb();
    const now = new Date().toISOString();
    const transferId = `TRF_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const actorInfo = actor || { uid: 'manager', role: 'outlet_manager', name: 'Outlet Manager' };

    return db.runTransaction(async (transaction) => {
      // 1. Validate & Deduct from source outlet (TRANSFER_OUT)
      for (const item of items) {
        const sourceRef = db.doc(`restaurants/${restaurantId}/outlets/${sourceOutletId}/inventoryStock/${item.ingredientId}`);
        const sourceSnap = await transaction.get(sourceRef);

        if (!sourceSnap.exists) {
          throw new Error(`Ingredient ${item.ingredientId} does not exist in source outlet ${sourceOutletId}`);
        }

        const data = sourceSnap.data();
        const currentStock = Number(data.currentStock || 0);
        const reservedStock = Number(data.reservedStock || 0);
        const availableStock = currentStock - reservedStock;
        const transferQty = Number(item.quantity || 0);

        if (availableStock < transferQty) {
          throw new Error(`Insufficient stock in source outlet: available ${availableStock}, requested ${transferQty}`);
        }

        const newCurrent = Number((currentStock - transferQty).toFixed(4));
        const newAvailable = Number((newCurrent - reservedStock).toFixed(4));

        transaction.set(sourceRef, {
          currentStock: newCurrent,
          availableStock: newAvailable,
          lastMovementType: MOVEMENT_TYPES.TRANSFER_OUT,
          lastMovementAt: now,
          updatedAt: now
        }, { merge: true });

        const { canonicalKey, ledgerId } = this.generateLedgerKey(
          MOVEMENT_TYPES.TRANSFER_OUT,
          restaurantId,
          sourceOutletId,
          transferId,
          item.ingredientId
        );

        const ledgerRef = db.doc(`restaurants/${restaurantId}/inventoryLedger/${ledgerId}`);
        transaction.set(ledgerRef, {
          _schemaVersion: '2.0.0',
          ledgerId,
          idempotencyKey: canonicalKey,
          restaurantId,
          outletId: sourceOutletId,
          ingredientId: item.ingredientId,
          movementType: MOVEMENT_TYPES.TRANSFER_OUT,
          quantityChange: -transferQty,
          unit: data.unit || item.unit,
          balanceBefore: currentStock,
          balanceAfter: newCurrent,
          reservedBefore: reservedStock,
          reservedAfter: reservedStock,
          availableBefore: availableStock,
          availableAfter: newAvailable,
          referenceType: 'TRANSFER',
          referenceId: transferId,
          reason: `Stock transferred to outlet ${destinationOutletId}: ${notes}`,
          actor: actorInfo,
          timestamp: now
        });
      }

      // 2. Create Transfer Record
      const transferRef = db.doc(`restaurants/${restaurantId}/stockTransfers/${transferId}`);
      const transferDoc = {
        id: transferId,
        restaurantId,
        sourceOutletId,
        destinationOutletId,
        items,
        status: 'DISPATCHED',
        notes,
        dispatchedBy: actorInfo.uid,
        dispatchedAt: now,
        receivedBy: null,
        receivedAt: null
      };

      transaction.set(transferRef, transferDoc);

      return { success: true, transferId, transfer: transferDoc };
    });
  }

  /**
   * Receives a stock transfer at the destination outlet.
   */
  async receiveStockTransfer(restaurantId, transferId, actor = null) {
    const db = getDb();
    const now = new Date().toISOString();
    const actorInfo = actor || { uid: 'dest_manager', role: 'outlet_manager', name: 'Branch Manager' };

    return db.runTransaction(async (transaction) => {
      const transferRef = db.doc(`restaurants/${restaurantId}/stockTransfers/${transferId}`);
      const transferSnap = await transaction.get(transferRef);

      if (!transferSnap.exists) {
        throw new Error(`Transfer record ${transferId} not found`);
      }

      const transfer = transferSnap.data();
      if (transfer.status === 'RECEIVED') {
        return { success: true, alreadyReceived: true, transfer };
      }

      const destOutletId = transfer.destinationOutletId;

      // Increment destination outlet stock (TRANSFER_IN)
      for (const item of transfer.items) {
        const destRef = db.doc(`restaurants/${restaurantId}/outlets/${destOutletId}/inventoryStock/${item.ingredientId}`);
        const destSnap = await transaction.get(destRef);

        let currentStock = 0;
        let reservedStock = 0;
        let stockUnit = item.unit || 'kg';
        let minThreshold = 5;
        let name = item.name || item.ingredientId;

        if (destSnap.exists) {
          const data = destSnap.data();
          currentStock = Number(data.currentStock || 0);
          reservedStock = Number(data.reservedStock || 0);
          stockUnit = data.unit || item.unit;
          minThreshold = Number(data.minThreshold || 5);
          name = data.name || name;
        }

        const transferQty = Number(item.quantity || 0);
        const newCurrent = Number((currentStock + transferQty).toFixed(4));
        const newAvailable = Number((newCurrent - reservedStock).toFixed(4));

        transaction.set(destRef, {
          ingredientId: item.ingredientId,
          restaurantId,
          outletId: destOutletId,
          compositeKey: `${restaurantId}#${destOutletId}`,
          name,
          unit: stockUnit,
          currentStock: newCurrent,
          reservedStock,
          availableStock: newAvailable,
          minThreshold,
          isLowStock: newAvailable <= minThreshold,
          isOutOfStock: newAvailable <= 0,
          lastMovementType: MOVEMENT_TYPES.TRANSFER_IN,
          lastMovementAt: now,
          updatedAt: now
        }, { merge: true });

        const { canonicalKey, ledgerId } = this.generateLedgerKey(
          MOVEMENT_TYPES.TRANSFER_IN,
          restaurantId,
          destOutletId,
          transferId,
          item.ingredientId
        );

        const ledgerRef = db.doc(`restaurants/${restaurantId}/inventoryLedger/${ledgerId}`);
        transaction.set(ledgerRef, {
          _schemaVersion: '2.0.0',
          ledgerId,
          idempotencyKey: canonicalKey,
          restaurantId,
          outletId: destOutletId,
          ingredientId: item.ingredientId,
          movementType: MOVEMENT_TYPES.TRANSFER_IN,
          quantityChange: transferQty,
          unit: stockUnit,
          balanceBefore: currentStock,
          balanceAfter: newCurrent,
          reservedBefore: reservedStock,
          reservedAfter: reservedStock,
          availableBefore: currentStock - reservedStock,
          availableAfter: newAvailable,
          referenceType: 'TRANSFER',
          referenceId: transferId,
          reason: `Stock received from transfer ${transferId} (Source: ${transfer.sourceOutletId})`,
          actor: actorInfo,
          timestamp: now
        });
      }

      transaction.update(transferRef, {
        status: 'RECEIVED',
        receivedBy: actorInfo.uid,
        receivedAt: now
      });

      return { success: true, transferId, status: 'RECEIVED' };
    });
  }
}

export const inventoryLedgerService = new InventoryLedgerService();
