/**
 * Abar Khabo: Enterprise Multi-Tenant SaaS
 * Master Menu Catalog, Outlet Overrides & Multi-Channel Pricing Engine
 * 
 * Collections:
 * - Master Catalog: restaurants/{restaurantId}/menuCatalog/{itemId}
 * - Outlet Overrides: restaurants/{restaurantId}/outlets/{outletId}/menuOverrides/{itemId}
 * - Legacy Mirror: restaurants/{restaurantId}/menuItems/{itemId} (Zero-downtime backward compatibility)
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
  serverTimestamp
} from '../firebase/config.js';
import { convertUnit, areUnitsCompatible } from '../utils/unitConverter.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. CHANNELS, CONSTANTS & ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export const ORDER_CHANNELS = {
  DINE_IN: 'DINE_IN',
  DIRECT_ONLINE: 'DIRECT_ONLINE',
  SWIGGY: 'SWIGGY',
  ZOMATO: 'ZOMATO',
  TAKEAWAY: 'TAKEAWAY'
};

export const FOOD_TYPES = {
  VEG: 'VEG',
  NON_VEG: 'NON_VEG',
  EGG: 'EGG',
  VEGAN: 'VEGAN'
};

export const ITEM_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED'
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. PRICING & TAX CALCULATION UTILITIES (Pure Functions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rounds a monetary amount to standard rupee precision.
 * @param {number} amount 
 * @returns {number}
 */
export function roundToCurrency(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) return 0;
  return Math.round(amount);
}

/**
 * Calculates effective price and tax breakdown for an item on a specific channel.
 * 
 * Resolution Hierarchy:
 * 1. Outlet explicit channel override: override.priceOverrides[channel]
 * 2. Outlet base price override: override.basePrice
 * 3. Master explicit channel price: masterItem.channelPricing[channel]
 * 4. Aggregator multiplier fallback: masterItem.basePrice * defaultMultiplier
 * 5. Master base price: masterItem.basePrice
 * 
 * @param {Object} masterItem 
 * @param {Object} [outletOverride] 
 * @param {string} [channel='DINE_IN'] 
 * @param {number} [aggregatorMultiplier=1.0] 
 * @returns {{ channel: string, effectivePrice: number, basePrice: number, netPrice: number, taxAmount: number, taxRate: number, taxInclusive: boolean }}
 */
export function calculateEffectivePrice(
  masterItem,
  outletOverride = null,
  channel = ORDER_CHANNELS.DINE_IN,
  aggregatorMultiplier = 1.0
) {
  if (!masterItem) {
    return {
      channel,
      effectivePrice: 0,
      basePrice: 0,
      netPrice: 0,
      taxAmount: 0,
      taxRate: 5.0,
      taxInclusive: true
    };
  }

  const masterBasePrice = Number(masterItem.basePrice ?? masterItem.price ?? 0);
  let resolvedRawPrice = masterBasePrice;

  // Level 1: Outlet explicit channel override
  if (outletOverride?.priceOverrides?.[channel] !== undefined && outletOverride.priceOverrides[channel] !== null) {
    resolvedRawPrice = Number(outletOverride.priceOverrides[channel]);
  }
  // Level 2: Outlet base price override
  else if (outletOverride?.basePrice !== undefined && outletOverride.basePrice !== null) {
    resolvedRawPrice = Number(outletOverride.basePrice);
  }
  // Level 3: Master explicit channel price
  else if (masterItem.channelPricing?.[channel] !== undefined && masterItem.channelPricing[channel] !== null) {
    resolvedRawPrice = Number(masterItem.channelPricing[channel]);
  }
  // Level 4: Channel multiplier fallback for aggregators
  else if ([ORDER_CHANNELS.SWIGGY, ORDER_CHANNELS.ZOMATO].includes(channel) && aggregatorMultiplier > 1.0) {
    resolvedRawPrice = masterBasePrice * aggregatorMultiplier;
  }
  // Level 5: Master base price
  else {
    resolvedRawPrice = masterBasePrice;
  }

  const effectivePrice = roundToCurrency(resolvedRawPrice);
  const taxRate = Number(masterItem.taxRate ?? 5.0);
  const taxInclusive = masterItem.taxInclusive !== false; // Default: tax inclusive in Indian restaurant menus

  let netPrice = effectivePrice;
  let taxAmount = 0;

  if (taxInclusive) {
    // gross = effectivePrice; net = gross / (1 + r); tax = gross - net
    netPrice = Number((effectivePrice / (1 + taxRate / 100)).toFixed(2));
    taxAmount = Number((effectivePrice - netPrice).toFixed(2));
  } else {
    // net = effectivePrice; tax = net * (r / 100); gross = net + tax
    taxAmount = Number((effectivePrice * (taxRate / 100)).toFixed(2));
    // For exclusive, effective customer price includes tax
    netPrice = effectivePrice;
  }

  return {
    channel,
    effectivePrice,
    basePrice: masterBasePrice,
    netPrice,
    taxAmount,
    taxRate,
    taxInclusive
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AVAILABILITY EVALUATION UTILITIES (Pure Functions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates whether an item is available for ordering on a specific channel.
 * 
 * @param {Object} masterItem 
 * @param {Object} [outletOverride] 
 * @param {string} [channel='DINE_IN'] 
 * @param {Date|number|string} [currentTime=new Date()] 
 * @returns {{ available: boolean, reason?: string }}
 */
export function evaluateItemAvailability(
  masterItem,
  outletOverride = null,
  channel = ORDER_CHANNELS.DINE_IN,
  currentTime = new Date()
) {
  if (!masterItem) {
    return { available: false, reason: 'ITEM_NOT_FOUND' };
  }

  // 1. Restaurant-wide master item status
  if (masterItem.status === ITEM_STATUS.INACTIVE || masterItem.status === ITEM_STATUS.ARCHIVED) {
    return { available: false, reason: 'MASTER_ITEM_INACTIVE' };
  }
  if (masterItem.isAvailable === false) {
    return { available: false, reason: 'MASTER_ITEM_UNAVAILABLE' };
  }

  // 2. Outlet-specific override checks
  if (outletOverride) {
    if (outletOverride.status === ITEM_STATUS.INACTIVE) {
      return { available: false, reason: 'OUTLET_ITEM_INACTIVE' };
    }
    if (outletOverride.isAvailable === false) {
      return { available: false, reason: 'OUTLET_ITEM_UNAVAILABLE' };
    }

    // Temporary out-of-stock window (86 item until timestamp)
    if (outletOverride.outOfStockUntil) {
      const untilDate = new Date(outletOverride.outOfStockUntil);
      const now = new Date(currentTime);
      if (untilDate > now) {
        return {
          available: false,
          reason: 'TEMPORARILY_OUT_OF_STOCK',
          outOfStockUntil: outletOverride.outOfStockUntil
        };
      }
    }

    // Channel-specific availability toggle
    if (outletOverride.channelAvailability?.[channel] === false) {
      return { available: false, reason: `UNAVAILABLE_ON_CHANNEL_${channel}` };
    }
  }

  return { available: true };
}

/**
 * Resolves a unified effective menu item combining master catalog and outlet overrides.
 * 
 * @param {Object} masterItem 
 * @param {Object} [outletOverride] 
 * @param {string} [channel='DINE_IN'] 
 * @param {number} [aggregatorMultiplier=1.0] 
 * @returns {Object}
 */
export function resolveEffectiveMenuItem(
  masterItem,
  outletOverride = null,
  channel = ORDER_CHANNELS.DINE_IN,
  aggregatorMultiplier = 1.0
) {
  if (!masterItem) return null;

  const pricing = calculateEffectivePrice(masterItem, outletOverride, channel, aggregatorMultiplier);
  const availability = evaluateItemAvailability(masterItem, outletOverride, channel);

  return {
    id: masterItem.id || masterItem.itemId,
    itemId: masterItem.id || masterItem.itemId,
    restaurantId: masterItem.restaurantId,
    outletId: outletOverride?.outletId || null,
    name: masterItem.name,
    description: outletOverride?.customDescription || masterItem.description || '',
    category: masterItem.category || 'General',
    subCategory: masterItem.subCategory || '',
    images: outletOverride?.customImage ? [outletOverride.customImage] : (masterItem.images || []),
    image: outletOverride?.customImage || masterItem.images?.[0] || masterItem.image || '',
    sku: masterItem.sku || '',
    internalCode: masterItem.internalCode || '',
    foodType: masterItem.foodType || FOOD_TYPES.NON_VEG,
    variants: masterItem.variants || [],
    addonGroups: masterItem.addonGroups || masterItem.modifierGroups || [],
    preparationTimeMinutes: Number(outletOverride?.preparationTimeMinutes ?? masterItem.preparationTimeMinutes ?? 20),
    // Multi-channel price details
    price: pricing.effectivePrice,
    pricing,
    // Channel availability
    isAvailable: availability.available,
    availability,
    hasOverride: Boolean(outletOverride),
    updatedAt: outletOverride?.updatedAt || masterItem.updatedAt || null
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. FIRESTORE MASTER CATALOG OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieves the Master Menu Catalog for a restaurant.
 * If master catalog is empty, automatically falls back to legacy menuItems collection
 * for zero-downtime backward compatibility.
 * 
 * @param {string} restaurantId 
 * @returns {Promise<Array<Object>>}
 */
export async function getMasterMenuCatalog(restaurantId) {
  try {
    if (!restaurantId) return [];

    const colRef = collection(db, 'restaurants', restaurantId, 'menuCatalog');
    const snapshot = await getDocs(colRef);

    if (!snapshot.empty) {
      return snapshot.docs.map(d => ({ id: d.id, itemId: d.id, ...d.data() }));
    }

    // Backward compatibility fallback: read from legacy menuItems collection
    const legacyCol = collection(db, 'restaurants', restaurantId, 'menuItems');
    const legacySnap = await getDocs(legacyCol);
    return legacySnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        itemId: d.id,
        restaurantId,
        name: data.name || '',
        description: data.description || '',
        category: data.category || 'General',
        subCategory: data.subCategory || '',
        basePrice: Number(data.price || 0),
        taxRate: Number(data.taxRate || 5.0),
        taxInclusive: true,
        foodType: data.foodType || (data.isVeg ? FOOD_TYPES.VEG : FOOD_TYPES.NON_VEG),
        images: data.image ? [data.image] : [],
        isAvailable: data.isAvailable !== false,
        status: ITEM_STATUS.ACTIVE,
        isLegacyFallback: true
      };
    });
  } catch (error) {
    console.error(`getMasterMenuCatalog error (${restaurantId}):`, error);
    throw error;
  }
}

/**
 * Creates or updates an item in the Master Menu Catalog.
 * Non-destructively mirrors to legacy menuItems subcollection so un-migrated
 * components continue displaying items without code breakage.
 * 
 * @param {string} restaurantId 
 * @param {Object} itemData 
 * @param {string} [customItemId] 
 * @returns {Promise<Object>}
 */
export async function saveMasterMenuItem(restaurantId, itemData, customItemId = null) {
  try {
    if (!restaurantId) throw new Error('restaurantId is required.');

    const itemId = customItemId || itemData.itemId || itemData.id || doc(collection(db, 'restaurants', restaurantId, 'menuCatalog')).id;
    const docRef = doc(db, 'restaurants', restaurantId, 'menuCatalog', itemId);

    const payload = {
      id: itemId,
      itemId,
      restaurantId,
      name: itemData.name?.trim() || 'Untitled Item',
      description: itemData.description?.trim() || '',
      category: itemData.category || 'Main Course',
      subCategory: itemData.subCategory || '',
      images: Array.isArray(itemData.images) ? itemData.images : (itemData.image ? [itemData.image] : []),
      sku: itemData.sku || '',
      internalCode: itemData.internalCode || '',
      basePrice: Number(itemData.basePrice ?? itemData.price ?? 0),
      taxRate: Number(itemData.taxRate ?? 5.0),
      taxInclusive: itemData.taxInclusive !== false,
      foodType: itemData.foodType || FOOD_TYPES.NON_VEG,
      variants: Array.isArray(itemData.variants) ? itemData.variants : [],
      addonGroups: Array.isArray(itemData.addonGroups) ? itemData.addonGroups : [],
      preparationTimeMinutes: Number(itemData.preparationTimeMinutes ?? 20),
      channelPricing: itemData.channelPricing || {},
      status: itemData.status || ITEM_STATUS.ACTIVE,
      isAvailable: itemData.isAvailable !== false,
      updatedAt: serverTimestamp()
    };

    if (!itemData.createdAt) {
      payload.createdAt = serverTimestamp();
    }

    await setDoc(docRef, payload, { merge: true });

    // Non-destructive mirror to legacy menuItems collection for zero-downtime compatibility
    try {
      const legacyRef = doc(db, 'restaurants', restaurantId, 'menuItems', itemId);
      await setDoc(legacyRef, {
        name: payload.name,
        price: payload.basePrice,
        category: payload.category,
        description: payload.description,
        image: payload.images[0] || '',
        isVeg: payload.foodType === FOOD_TYPES.VEG,
        foodType: payload.foodType,
        isAvailable: payload.isAvailable,
        taxRate: payload.taxRate,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (legErr) {
      console.warn('Legacy menuItems mirror notice:', legErr);
    }

    return { id: itemId, ...payload };
  } catch (error) {
    console.error(`saveMasterMenuItem error (${restaurantId}):`, error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. FIRESTORE OUTLET MENU OVERRIDES OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieves all outlet-specific menu overrides for an outlet.
 * Path: restaurants/{restaurantId}/outlets/{outletId}/menuOverrides
 * 
 * @param {string} restaurantId 
 * @param {string} outletId 
 * @returns {Promise<Map<string, Object>>} Map of itemId -> overrideData
 */
export async function getOutletMenuOverrides(restaurantId, outletId) {
  try {
    if (!restaurantId || !outletId) return new Map();

    const colRef = collection(db, 'restaurants', restaurantId, 'outlets', outletId, 'menuOverrides');
    const snapshot = await getDocs(colRef);
    const overridesMap = new Map();

    snapshot.docs.forEach(d => {
      overridesMap.set(d.id, { id: d.id, itemId: d.id, ...d.data() });
    });

    return overridesMap;
  } catch (error) {
    console.error(`getOutletMenuOverrides error (${restaurantId}/${outletId}):`, error);
    return new Map();
  }
}

/**
 * Sets or updates an outlet-specific menu override.
 * 
 * @param {string} restaurantId 
 * @param {string} outletId 
 * @param {string} itemId 
 * @param {Object} overrideData 
 * @returns {Promise<Object>}
 */
export async function saveOutletMenuOverride(restaurantId, outletId, itemId, overrideData) {
  try {
    if (!restaurantId || !outletId || !itemId) {
      throw new Error('restaurantId, outletId, and itemId are required.');
    }

    const docRef = doc(db, 'restaurants', restaurantId, 'outlets', outletId, 'menuOverrides', itemId);
    const payload = {
      id: itemId,
      itemId,
      restaurantId,
      outletId,
      ...overrideData,
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, payload, { merge: true });
    return { id: itemId, ...payload };
  } catch (error) {
    console.error(`saveOutletMenuOverride error (${restaurantId}/${outletId}/${itemId}):`, error);
    throw error;
  }
}

/**
 * Deletes an outlet-specific menu override, restoring master inheritance.
 * 
 * @param {string} restaurantId 
 * @param {string} outletId 
 * @param {string} itemId 
 * @returns {Promise<boolean>}
 */
export async function deleteOutletMenuOverride(restaurantId, outletId, itemId) {
  try {
    if (!restaurantId || !outletId || !itemId) {
      throw new Error('restaurantId, outletId, and itemId are required.');
    }
    const docRef = doc(db, 'restaurants', restaurantId, 'outlets', outletId, 'menuOverrides', itemId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error(`deleteOutletMenuOverride error (${restaurantId}/${outletId}/${itemId}):`, error);
    throw error;
  }
}

/**
 * Resolves the full effective menu catalog for an outlet and channel.
 * Seamlessly merges Master Catalog and Outlet Overrides.
 * 
 * @param {string} restaurantId 
 * @param {string} outletId 
 * @param {string} [channel=ORDER_CHANNELS.DINE_IN] 
 * @param {number} [aggregatorMultiplier=1.0] 
 * @returns {Promise<Array<Object>>}
 */
export async function getEffectiveOutletCatalog(
  restaurantId,
  outletId,
  channel = ORDER_CHANNELS.DINE_IN,
  aggregatorMultiplier = 1.0
) {
  try {
    if (!restaurantId) return [];

    const [masterItems, overridesMap] = await Promise.all([
      getMasterMenuCatalog(restaurantId),
      outletId ? getOutletMenuOverrides(restaurantId, outletId) : Promise.resolve(new Map())
    ]);

    return masterItems.map(masterItem => {
      const override = overridesMap.get(masterItem.id || masterItem.itemId);
      return resolveEffectiveMenuItem(masterItem, override, channel, aggregatorMultiplier);
    });
  } catch (error) {
    console.error(`getEffectiveOutletCatalog error (${restaurantId}/${outletId}):`, error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. INVENTORY & RECIPE-BASED STOCK AVAILABILITY ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates stock-based availability for a menu item given outlet stock balances and recipe.
 * 
 * @param {Object} masterItem 
 * @param {Object} [outletStockMap={}] - Map of ingredientId -> stock document
 * @param {Object} [recipe=null] - Recipe object with ingredients array
 * @returns {{ status: 'AVAILABLE'|'LOW_STOCK'|'OUT_OF_STOCK'|'DISABLED', available: boolean, maxPortions: number, reason?: string, limitingIngredient?: string }}
 */
export function calculateItemStockAvailability(masterItem, outletStockMap = {}, recipe = null) {
  if (!masterItem) {
    return { status: 'DISABLED', available: false, maxPortions: 0, reason: 'ITEM_NOT_FOUND' };
  }

  // 1. Master item status checks
  if (masterItem.status === ITEM_STATUS.INACTIVE || masterItem.status === ITEM_STATUS.ARCHIVED || masterItem.isAvailable === false) {
    return { status: 'DISABLED', available: false, maxPortions: 0, reason: 'MASTER_ITEM_DISABLED' };
  }

  // 2. If no recipe configured, availability is governed by manual availability toggle
  if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
    return { status: 'AVAILABLE', available: true, maxPortions: 999 };
  }

  // 3. Calculate maximum portions possible from limiting ingredient
  let minPortions = Infinity;
  let limitingIngredient = null;

  for (const ing of recipe.ingredients) {
    const stock = outletStockMap[ing.ingredientId];
    if (!stock) {
      minPortions = 0;
      limitingIngredient = ing.name || ing.ingredientId;
      break;
    }

    const availableQty = Number(stock.availableStock ?? (Number(stock.currentStock || 0) - Number(stock.reservedStock || 0)));
    const reqQty = Number(ing.quantity || 0);

    let convertedReq = reqQty;
    if (stock.unit && ing.unit && stock.unit !== ing.unit) {
      if (areUnitsCompatible(ing.unit, stock.unit)) {
        convertedReq = convertUnit(reqQty, ing.unit, stock.unit);
      }
    }

    if (convertedReq <= 0) continue;

    const portions = Math.floor(availableQty / convertedReq);
    if (portions < minPortions) {
      minPortions = portions;
      limitingIngredient = ing.name || ing.ingredientId;
    }
  }

  if (minPortions === Infinity) minPortions = 0;

  if (minPortions <= 0) {
    return {
      status: 'OUT_OF_STOCK',
      available: false,
      maxPortions: 0,
      limitingIngredient
    };
  }

  const lowStockThreshold = Number(masterItem.lowStockThreshold || 5);
  if (minPortions <= lowStockThreshold) {
    return {
      status: 'LOW_STOCK',
      available: true,
      maxPortions: minPortions,
      limitingIngredient
    };
  }

  return {
    status: 'AVAILABLE',
    available: true,
    maxPortions: minPortions
  };
}

/**
 * Sanitizes a menu item for public customer-facing displays.
 * Completely strips internal ingredient recipes, costPerBaseUnit, raw stock quantities, and supplier details.
 * 
 * @param {Object} menuItem 
 * @returns {Object} Clean public-facing item
 */
export function sanitizeMenuForCustomer(menuItem) {
  if (!menuItem) return null;

  return {
    id: menuItem.id || menuItem.itemId,
    name: menuItem.name,
    category: menuItem.category || 'Main Course',
    description: menuItem.description || '',
    imageUrl: menuItem.imageUrl || '',
    foodType: menuItem.foodType || 'NON_VEG',
    effectivePrice: menuItem.effectivePrice ?? menuItem.basePrice ?? menuItem.price ?? 0,
    basePrice: menuItem.basePrice ?? menuItem.price ?? 0,
    taxInclusive: menuItem.taxInclusive ?? true,
    isAvailable: menuItem.isAvailable !== false && menuItem.stockStatus !== 'OUT_OF_STOCK',
    stockStatus: menuItem.stockStatus || 'AVAILABLE',
    variants: Array.isArray(menuItem.variants) ? menuItem.variants : [],
    addons: Array.isArray(menuItem.addons) ? menuItem.addons : []
  };
}
