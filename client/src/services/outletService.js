/**
 * Abar Khabo: Enterprise Multi-Tenant SaaS
 * Outlet Management Service & Schema Layer
 * 
 * Manages physical outlets (branches / cloud kitchens) under restaurants.
 * Document Path: restaurants/{restaurantId}/outlets/{outletId}
 * Deterministic default outlet: ${restaurantId}_main
 * Composite identity: (restaurantId, outletId)
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
  onSnapshot,
  serverTimestamp
} from '../firebase/config.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. PURE UTILITIES & IDENTITY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns canonical Firestore document path for an outlet.
 * @param {string} restaurantId 
 * @param {string} outletId 
 * @returns {string}
 */
export function getOutletDocPath(restaurantId, outletId) {
  if (!restaurantId || !outletId) {
    throw new Error('Both restaurantId and outletId are required to construct an outlet document path.');
  }
  return `restaurants/${restaurantId}/outlets/${outletId}`;
}

/**
 * Returns deterministic default outlet ID for a restaurant.
 * @param {string} restaurantId 
 * @returns {string} e.g. "spice-haven_main"
 */
export function getDefaultOutletId(restaurantId) {
  if (!restaurantId) return '';
  return `${restaurantId}_main`;
}

/**
 * Formats a composite business key for an outlet: "restaurantId#outletId"
 * @param {string} restaurantId 
 * @param {string} outletId 
 * @returns {string}
 */
export function formatCompositeOutletKey(restaurantId, outletId) {
  return `${restaurantId}#${outletId || getDefaultOutletId(restaurantId)}`;
}

/**
 * Parses a composite business key back into { restaurantId, outletId }
 * @param {string} compositeKey 
 * @returns {{ restaurantId: string, outletId: string }}
 */
export function parseCompositeOutletKey(compositeKey) {
  if (!compositeKey || typeof compositeKey !== 'string') {
    return { restaurantId: '', outletId: '' };
  }
  const parts = compositeKey.split('#');
  return {
    restaurantId: parts[0] || '',
    outletId: parts[1] || ''
  };
}

/**
 * Validates essential outlet data before persistence.
 * @param {Object} data 
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateOutletData(data) {
  const errors = [];
  if (!data) {
    return { valid: false, errors: ['Outlet data is required.'] };
  }
  if (!data.restaurantId || typeof data.restaurantId !== 'string' || !data.restaurantId.trim()) {
    errors.push('restaurantId is required and must be a non-empty string.');
  }
  if (!data.outletName || typeof data.outletName !== 'string' || !data.outletName.trim()) {
    errors.push('outletName is required and must be a non-empty string.');
  }
  if (data.status && !['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED_TEMPORARILY'].includes(data.status)) {
    errors.push(`Invalid status "${data.status}". Allowed values: ACTIVE, INACTIVE, SUSPENDED, CLOSED_TEMPORARILY.`);
  }
  if (data.operatingHours && typeof data.operatingHours !== 'object') {
    errors.push('operatingHours must be an object.');
  }
  if (data.deliveryConfig && typeof data.deliveryConfig !== 'object') {
    errors.push('deliveryConfig must be an object.');
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Normalizes outlet payload ensuring all standard enterprise fields exist.
 * @param {Object} rawData 
 * @param {string} restaurantId 
 * @param {string} [outletId] 
 * @returns {Object}
 */
export function normalizeOutletData(rawData = {}, restaurantId, outletId = null) {
  const finalOutletId = outletId || rawData.outletId || rawData.id || getDefaultOutletId(restaurantId);
  const isDefault = Boolean(rawData.isDefaultOutlet ?? (finalOutletId === getDefaultOutletId(restaurantId)));

  return {
    id: finalOutletId,
    outletId: finalOutletId,
    restaurantId,
    outletName: rawData.outletName || rawData.name || 'Main Branch',
    branchCode: rawData.branchCode || (isDefault ? 'MAIN-01' : 'BR-01'),
    isDefaultOutlet: isDefault,
    contact: {
      phone: rawData.contact?.phone || rawData.phone || '',
      email: rawData.contact?.email || rawData.email || '',
      managerName: rawData.contact?.managerName || rawData.managerName || ''
    },
    location: {
      address: rawData.location?.address || rawData.address || '',
      city: rawData.location?.city || rawData.city || 'Kolkata',
      state: rawData.location?.state || rawData.state || 'West Bengal',
      pincode: rawData.location?.pincode || rawData.pincode || '',
      coordinates: {
        lat: Number(rawData.location?.coordinates?.lat ?? rawData.coordinates?.lat ?? rawData.lat ?? 22.5726),
        lng: Number(rawData.location?.coordinates?.lng ?? rawData.coordinates?.lng ?? rawData.lng ?? 88.3639)
      }
    },
    deliveryConfig: {
      radiusKm: Number(rawData.deliveryConfig?.radiusKm ?? rawData.deliveryRadius ?? 7.5),
      minOrderAmount: Number(rawData.deliveryConfig?.minOrderAmount ?? rawData.minOrder ?? 150),
      baseDeliveryCharge: Number(rawData.deliveryConfig?.baseDeliveryCharge ?? rawData.deliveryFee ?? 35),
      freeDeliveryThreshold: Number(rawData.deliveryConfig?.freeDeliveryThreshold ?? 500)
    },
    operatingHours: rawData.operatingHours || {
      isOpen: true,
      monday: { open: '11:00', close: '23:00', isClosed: false },
      tuesday: { open: '11:00', close: '23:00', isClosed: false },
      wednesday: { open: '11:00', close: '23:00', isClosed: false },
      thursday: { open: '11:00', close: '23:00', isClosed: false },
      friday: { open: '11:00', close: '23:30', isClosed: false },
      saturday: { open: '11:00', close: '23:30', isClosed: false },
      sunday: { open: '11:00', close: '23:30', isClosed: false }
    },
    fssaiLicenseNumber: rawData.fssaiLicenseNumber || rawData.fssaiNumber || '',
    gstin: rawData.gstin || '',
    status: rawData.status || 'ACTIVE'
  };
}

/**
 * Synthesizes a virtual default outlet document from an existing single-tenant
 * restaurant document without writing to Firestore. Guarantees 100% backward
 * compatibility for existing restaurants that do not yet have an outlets subcollection.
 * @param {Object} restaurantDoc 
 * @returns {Object}
 */
export function synthesizeDefaultOutlet(restaurantDoc) {
  if (!restaurantDoc || !restaurantDoc.id) return null;
  const restId = restaurantDoc.id;
  const defaultId = getDefaultOutletId(restId);

  return normalizeOutletData(
    {
      outletName: restaurantDoc.name ? `${restaurantDoc.name} - Main Branch` : 'Main Branch',
      branchCode: 'MAIN-01',
      isDefaultOutlet: true,
      phone: restaurantDoc.phone || '',
      email: restaurantDoc.email || '',
      address: restaurantDoc.address || '',
      city: restaurantDoc.city || 'Kolkata',
      state: restaurantDoc.state || 'West Bengal',
      pincode: restaurantDoc.pincode || '',
      coordinates: restaurantDoc.coordinates || { lat: 22.5726, lng: 88.3639 },
      deliveryConfig: {
        radiusKm: restaurantDoc.deliveryRadius || 7.5,
        minOrderAmount: restaurantDoc.minOrder || 150,
        baseDeliveryCharge: restaurantDoc.deliveryFee || 35,
        freeDeliveryThreshold: 500
      },
      status: restaurantDoc.status === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
      fssaiLicenseNumber: restaurantDoc.fssaiNumber || '',
      gstin: restaurantDoc.gstin || ''
    },
    restId,
    defaultId
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FIRESTORE CRUD OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an outlet document under restaurants/{restaurantId}/outlets/{outletId}.
 * @param {string} restaurantId 
 * @param {Object} outletData 
 * @param {string} [customOutletId] 
 * @returns {Promise<Object>}
 */
export async function createOutlet(restaurantId, outletData, customOutletId = null) {
  try {
    if (!restaurantId) throw new Error('restaurantId is required.');
    
    const outletId = customOutletId || outletData.outletId || (outletData.isDefaultOutlet ? getDefaultOutletId(restaurantId) : doc(collection(db, 'restaurants', restaurantId, 'outlets')).id);
    const normalized = normalizeOutletData(outletData, restaurantId, outletId);
    
    const validation = validateOutletData(normalized);
    if (!validation.valid) {
      throw new Error(`Outlet validation failed: ${validation.errors.join(', ')}`);
    }

    const docRef = doc(db, 'restaurants', restaurantId, 'outlets', outletId);
    const payload = {
      ...normalized,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, payload);
    return { id: outletId, ...payload };
  } catch (error) {
    console.error(`createOutlet error (${restaurantId}):`, error);
    throw error;
  }
}

/**
 * Retrieves a single outlet by composite identity (restaurantId, outletId).
 * If the document does not exist in Firestore and outletId is the default outlet,
 * it safely falls back to synthesizing the outlet from the parent restaurant document.
 * @param {string} restaurantId 
 * @param {string} outletId 
 * @returns {Promise<Object|null>}
 */
export async function getOutlet(restaurantId, outletId) {
  try {
    if (!restaurantId) return null;
    const targetOutletId = outletId || getDefaultOutletId(restaurantId);
    
    const docRef = doc(db, 'restaurants', restaurantId, 'outlets', targetOutletId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }

    // Backward compatibility fallback for unmigrated single-restaurant data
    if (targetOutletId === getDefaultOutletId(restaurantId)) {
      const parentSnap = await getDoc(doc(db, 'restaurants', restaurantId));
      if (parentSnap.exists()) {
        return synthesizeDefaultOutlet({ id: parentSnap.id, ...parentSnap.data() });
      }
    }

    return null;
  } catch (error) {
    console.error(`getOutlet error (${restaurantId}/${outletId}):`, error);
    throw error;
  }
}

/**
 * Retrieves all outlets for a given restaurant.
 * If no outlet documents exist in the subcollection, automatically synthesizes
 * the default outlet from the parent restaurant document for zero-downtime compatibility.
 * @param {string} restaurantId 
 * @returns {Promise<Array<Object>>}
 */
export async function getOutletsByRestaurant(restaurantId) {
  try {
    if (!restaurantId) return [];

    const colRef = collection(db, 'restaurants', restaurantId, 'outlets');
    const q = query(colRef, orderBy('outletName', 'asc'));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // Subcollection empty: synthesize default outlet from parent restaurant
    const parentSnap = await getDoc(doc(db, 'restaurants', restaurantId));
    if (parentSnap.exists()) {
      const synthetic = synthesizeDefaultOutlet({ id: parentSnap.id, ...parentSnap.data() });
      return synthetic ? [synthetic] : [];
    }

    return [];
  } catch (error) {
    console.error(`getOutletsByRestaurant error (${restaurantId}):`, error);
    throw error;
  }
}

/**
 * Updates an existing outlet.
 * @param {string} restaurantId 
 * @param {string} outletId 
 * @param {Object} updates 
 * @returns {Promise<Object>}
 */
export async function updateOutlet(restaurantId, outletId, updates) {
  try {
    if (!restaurantId || !outletId) {
      throw new Error('Both restaurantId and outletId are required for updateOutlet.');
    }
    const docRef = doc(db, 'restaurants', restaurantId, 'outlets', outletId);
    const payload = {
      ...updates,
      updatedAt: serverTimestamp()
    };
    await updateDoc(docRef, payload);
    return { id: outletId, restaurantId, ...payload };
  } catch (error) {
    console.error(`updateOutlet error (${restaurantId}/${outletId}):`, error);
    throw error;
  }
}

/**
 * Soft deletes or deletes an outlet document.
 * @param {string} restaurantId 
 * @param {string} outletId 
 * @param {boolean} [softDelete=true] 
 * @returns {Promise<boolean>}
 */
export async function deleteOutlet(restaurantId, outletId, softDelete = true) {
  try {
    if (!restaurantId || !outletId) {
      throw new Error('Both restaurantId and outletId are required for deleteOutlet.');
    }
    const docRef = doc(db, 'restaurants', restaurantId, 'outlets', outletId);
    
    if (softDelete) {
      await updateDoc(docRef, {
        status: 'INACTIVE',
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await deleteDoc(docRef);
    }
    return true;
  } catch (error) {
    console.error(`deleteOutlet error (${restaurantId}/${outletId}):`, error);
    throw error;
  }
}

/**
 * Ensures the deterministic default outlet `${restaurantId}_main` exists in Firestore.
 * If it already exists, does nothing. If missing, provisions it using existing restaurant metadata.
 * Safe and idempotent.
 * @param {string} restaurantId 
 * @param {Object} [restaurantData] 
 * @returns {Promise<Object>}
 */
export async function ensureDefaultOutlet(restaurantId, restaurantData = null) {
  try {
    if (!restaurantId) throw new Error('restaurantId is required.');
    const defaultId = getDefaultOutletId(restaurantId);
    const docRef = doc(db, 'restaurants', restaurantId, 'outlets', defaultId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }

    let sourceData = restaurantData;
    if (!sourceData) {
      const restSnap = await getDoc(doc(db, 'restaurants', restaurantId));
      if (restSnap.exists()) {
        sourceData = { id: restSnap.id, ...restSnap.data() };
      }
    }

    const payload = sourceData
      ? synthesizeDefaultOutlet(sourceData)
      : normalizeOutletData({ outletName: 'Main Branch' }, restaurantId, defaultId);

    payload.createdAt = serverTimestamp();
    payload.updatedAt = serverTimestamp();

    await setDoc(docRef, payload);
    return { id: defaultId, ...payload };
  } catch (error) {
    console.error(`ensureDefaultOutlet error (${restaurantId}):`, error);
    throw error;
  }
}

/**
 * Real-time subscription to outlets of a restaurant.
 * @param {string} restaurantId 
 * @param {Function} onUpdate 
 * @param {Function} onError 
 * @returns {Function} Unsubscribe function
 */
export function subscribeOutlets(restaurantId, onUpdate, onError) {
  if (!restaurantId) {
    onUpdate([]);
    return () => {};
  }

  const colRef = collection(db, 'restaurants', restaurantId, 'outlets');
  const q = query(colRef, orderBy('outletName', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const outlets = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      onUpdate(outlets);
    },
    (err) => {
      console.warn(`subscribeOutlets snapshot error (${restaurantId}):`, err);
      if (onError) onError(err);
    }
  );
}
