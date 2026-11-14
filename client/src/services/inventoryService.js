/**
 * Abar Khabo: Enterprise Multi-Tenant SaaS
 * Client-Side Inventory, Recipe & Stock Service
 * 
 * Collections:
 * - Master Ingredients: restaurants/{restaurantId}/ingredients/{ingredientId}
 * - Outlet Stock Balances: restaurants/{restaurantId}/outlets/{outletId}/inventoryStock/{ingredientId}
 * - Master Recipes: restaurants/{restaurantId}/recipes/{itemId}
 * - Outlet Recipe Overrides: restaurants/{restaurantId}/outlets/{outletId}/recipeOverrides/{itemId}
 * - Suppliers: restaurants/{restaurantId}/suppliers/{supplierId}
 * - Purchases: restaurants/{restaurantId}/outlets/{outletId}/purchases/{purchaseId}
 * - Stock Transfers: restaurants/{restaurantId}/stockTransfers/{transferId}
 * - Inventory Ledger: restaurants/{restaurantId}/inventoryLedger/{ledgerId}
 * - Legacy Mirror: restaurants/{restaurantId}/inventory/{itemId} (Backward compatibility)
 */

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from '../firebase/config.js';
import { normalizeUnit } from '../utils/unitConverter.js';

/**
 * Fetches the master ingredient catalog for a restaurant.
 * @param {string} restaurantId 
 * @returns {Promise<Array<Object>>}
 */
export async function getIngredientCatalog(restaurantId) {
  try {
    if (!restaurantId) return [];
    const colRef = collection(db, 'restaurants', restaurantId, 'ingredients');
    const snap = await getDocs(colRef);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error(`getIngredientCatalog error (${restaurantId}):`, error);
    return [];
  }
}

/**
 * Creates or updates a master ingredient catalog item.
 * @param {string} restaurantId 
 * @param {Object} ingredientData 
 * @returns {Promise<Object>}
 */
export async function createIngredient(restaurantId, ingredientData) {
  try {
    if (!restaurantId || !ingredientData.name) {
      throw new Error('restaurantId and ingredient name are required.');
    }
    const ingredientId = ingredientData.id || `ing_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const docRef = doc(db, 'restaurants', restaurantId, 'ingredients', ingredientId);

    const payload = {
      _schemaVersion: '2.0.0',
      id: ingredientId,
      restaurantId,
      sku: ingredientData.sku || `SKU-${Date.now().toString().slice(-4)}`,
      name: ingredientData.name.trim(),
      category: ingredientData.category || 'General',
      baseUnit: normalizeUnit(ingredientData.baseUnit || 'kg'),
      supportedUnits: ingredientData.supportedUnits || [normalizeUnit(ingredientData.baseUnit || 'kg')],
      costPerBaseUnit: Number(ingredientData.costPerBaseUnit || 0),
      minThreshold: Number(ingredientData.minThreshold || 5),
      reorderQuantity: Number(ingredientData.reorderQuantity || 20),
      defaultSupplierId: ingredientData.defaultSupplierId || null,
      status: ingredientData.status || 'ACTIVE',
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, payload, { merge: true });
    return payload;
  } catch (error) {
    console.error(`createIngredient error (${restaurantId}):`, error);
    throw error;
  }
}

/**
 * Fetches stock balances for an outlet.
 * @param {string} restaurantId 
 * @param {string} outletId 
 * @returns {Promise<Array<Object>>}
 */
export async function getOutletStock(restaurantId, outletId) {
  try {
    if (!restaurantId || !outletId) return [];
    const colRef = collection(db, 'restaurants', restaurantId, 'outlets', outletId, 'inventoryStock');
    const snap = await getDocs(colRef);
    return snap.docs.map(d => {
      const data = d.data();
      const current = Number(data.currentStock || 0);
      const reserved = Number(data.reservedStock || 0);
      const available = Number(data.availableStock ?? (current - reserved));
      const minThreshold = Number(data.minThreshold || 5);
      return {
        id: d.id,
        ...data,
        currentStock: current,
        reservedStock: reserved,
        availableStock: available,
        isLowStock: available <= minThreshold,
        isOutOfStock: available <= 0
      };
    });
  } catch (error) {
    console.error(`getOutletStock error (${restaurantId}/${outletId}):`, error);
    return [];
  }
}

/**
 * Fetches inventory ledger entries for an outlet.
 * @param {string} restaurantId 
 * @param {string} outletId 
 * @param {number} [maxRecords=50] 
 * @returns {Promise<Array<Object>>}
 */
export async function getInventoryLedger(restaurantId, outletId, maxRecords = 50) {
  try {
    if (!restaurantId) return [];
    const colRef = collection(db, 'restaurants', restaurantId, 'inventoryLedger');
    let q;
    if (outletId) {
      q = query(colRef, where('outletId', '==', outletId), orderBy('timestamp', 'desc'), limit(maxRecords));
    } else {
      q = query(colRef, orderBy('timestamp', 'desc'), limit(maxRecords));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error(`getInventoryLedger error (${restaurantId}):`, error);
    return [];
  }
}

/**
 * Fetches suppliers for a restaurant.
 * @param {string} restaurantId 
 * @returns {Promise<Array<Object>>}
 */
export async function getSuppliers(restaurantId) {
  try {
    if (!restaurantId) return [];
    const colRef = collection(db, 'restaurants', restaurantId, 'suppliers');
    const snap = await getDocs(colRef);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error(`getSuppliers error (${restaurantId}):`, error);
    return [];
  }
}

/**
 * Creates or updates a supplier record.
 * @param {string} restaurantId 
 * @param {Object} supplierData 
 * @returns {Promise<Object>}
 */
export async function createSupplier(restaurantId, supplierData) {
  try {
    if (!restaurantId || !supplierData.name) {
      throw new Error('restaurantId and supplier name are required.');
    }
    const supplierId = supplierData.id || `sup_${Date.now()}`;
    const docRef = doc(db, 'restaurants', restaurantId, 'suppliers', supplierId);
    const payload = {
      id: supplierId,
      restaurantId,
      name: supplierData.name.trim(),
      contactPerson: supplierData.contactPerson || '',
      phone: supplierData.phone || '',
      email: supplierData.email || '',
      address: supplierData.address || '',
      gstin: supplierData.gstin || '',
      status: supplierData.status || 'ACTIVE',
      updatedAt: serverTimestamp()
    };
    await setDoc(docRef, payload, { merge: true });
    return payload;
  } catch (error) {
    console.error(`createSupplier error (${restaurantId}):`, error);
    throw error;
  }
}

/**
 * Fetches recipes for a restaurant.
 * @param {string} restaurantId 
 * @returns {Promise<Array<Object>>}
 */
export async function getRecipes(restaurantId) {
  try {
    if (!restaurantId) return [];
    const colRef = collection(db, 'restaurants', restaurantId, 'recipes');
    const snap = await getDocs(colRef);
    return snap.docs.map(d => ({ id: d.id, itemId: d.id, ...d.data() }));
  } catch (error) {
    console.error(`getRecipes error (${restaurantId}):`, error);
    return [];
  }
}

/**
 * Fetches a single recipe by item ID.
 * @param {string} restaurantId 
 * @param {string} itemId 
 * @returns {Promise<Object|null>}
 */
export async function getRecipe(restaurantId, itemId) {
  try {
    if (!restaurantId || !itemId) return null;
    const docRef = doc(db, 'restaurants', restaurantId, 'recipes', itemId);
    const snap = await getDoc(docRef);
    return snap.exists ? { id: snap.id, itemId: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.error(`getRecipe error (${restaurantId}/${itemId}):`, error);
    return null;
  }
}

/**
 * Saves a master recipe.
 * @param {string} restaurantId 
 * @param {string} itemId 
 * @param {Object} recipeData 
 * @returns {Promise<Object>}
 */
export async function setRecipe(restaurantId, itemId, recipeData) {
  try {
    if (!restaurantId || !itemId) throw new Error('restaurantId and itemId required');
    const docRef = doc(db, 'restaurants', restaurantId, 'recipes', itemId);
    const payload = {
      ...recipeData,
      itemId,
      restaurantId,
      ingredients: (recipeData.ingredients || []).map(ing => ({
        ingredientId: ing.ingredientId,
        name: ing.name || ing.ingredientId,
        quantity: Number(ing.quantity || 0),
        unit: normalizeUnit(ing.unit || 'kg')
      })),
      updatedAt: serverTimestamp()
    };
    await setDoc(docRef, payload, { merge: true });
    return payload;
  } catch (error) {
    console.error(`setRecipe error (${restaurantId}/${itemId}):`, error);
    throw error;
  }
}

/**
 * Synthesizes legacy inventory documents into modern outletStock format.
 * Enables zero-downtime backward compatibility with legacy `restaurants/{restaurantId}/inventory`.
 * 
 * @param {Object} legacyItem 
 * @param {string} restaurantId 
 * @param {string} [outletId] 
 * @returns {Object}
 */
export function synthesizeModernStockFromLegacy(legacyItem, restaurantId, outletId = null) {
  if (!legacyItem) return null;
  const targetOutlet = outletId || legacyItem.outletId || `${restaurantId}_main`;
  const current = Number(legacyItem.quantity || 0);
  const minThreshold = Number(legacyItem.minThreshold || 5);

  return {
    _schemaVersion: '2.0.0',
    ingredientId: legacyItem.id,
    restaurantId,
    outletId: targetOutlet,
    compositeKey: `${restaurantId}#${targetOutlet}`,
    name: legacyItem.name || 'Stock Item',
    unit: normalizeUnit(legacyItem.unit || 'kg'),
    currentStock: current,
    reservedStock: 0,
    availableStock: current,
    minThreshold,
    isLowStock: current <= minThreshold,
    isOutOfStock: current <= 0,
    isSynthesizedFromLegacy: true,
    lastMovementType: 'LEGACY_SYNTHESIS',
    updatedAt: legacyItem.updatedAt || new Date().toISOString()
  };
}
