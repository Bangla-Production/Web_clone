/**
 * Online Orders Service
 * Handles Takeaway & Delivery orders with dual-sync across:
 *   - Root collection: onlineOrders/{orderId} (queried by Riders & Dispatch)
 *   - Subcollection: restaurants/{restaurantId}/onlineOrders/{orderId} (queried by Restaurant Admin & Staff)
 *
 * Provides real-time synchronization, status transitions, and backward compatibility.
 */

import {
  db,
  collection,
  collectionGroup,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from '../firebase/config';

// ─── Order Placement ──────────────────────────────────────────────────────────

export async function placeOnlineOrder(restaurantId, orderData) {
  if (!restaurantId) {
    throw new Error('Restaurant ID is required to place an order.');
  }

  // Generate a new unique order reference at the root collection
  const rootColRef = collection(db, 'onlineOrders');
  const orderDocRef = doc(rootColRef);
  const orderId = orderDocRef.id;

  const payload = {
    ...orderData,
    id: orderId,
    restaurantId,
    status: 'PLACED',
    deliveryStatus: orderData.orderType === 'DELIVERY' ? 'PLACED' : null,
    orderType: orderData.orderType || 'TAKEAWAY', // 'TAKEAWAY' | 'DELIVERY'
    paymentStatus: orderData.paymentStatus || 'PENDING',
    paymentMethod: orderData.paymentMethod || 'COD',
    deliveryFee: Number(orderData.deliveryFee) || 0,
    deliveryAddress: orderData.deliveryAddress || null,
    notes: orderData.notes || '',
    partnerId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // 1. Write to root onlineOrders collection
  await setDoc(orderDocRef, payload);

  // 2. Mirror to restaurants/{restaurantId}/onlineOrders/{orderId} for staff KDS/POS
  try {
    const subDocRef = doc(db, 'restaurants', restaurantId, 'onlineOrders', orderId);
    await setDoc(subDocRef, payload);
  } catch (err) {
    console.warn('Subcollection mirror warning (root order saved successfully):', err);
  }

  return { id: orderId, ...payload };
}

// ─── Listeners & Queries ──────────────────────────────────────────────────────

export function subscribeToOnlineOrders(restaurantId, callback) {
  // Query root collection by restaurantId first for unified dispatch
  const rootQ = query(
    collection(db, 'onlineOrders'),
    where('restaurantId', '==', restaurantId)
  );

  return onSnapshot(
    rootQ,
    (snap) => {
      const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      orders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      callback(orders);
    },
    (err) => {
      console.warn('Root onlineOrders listen error, fallback to subcollection:', err);
      // Fallback to subcollection
      const subQ = query(collection(db, 'restaurants', restaurantId, 'onlineOrders'));
      return onSnapshot(subQ, (subSnap) => {
        const subOrders = subSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        subOrders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        callback(subOrders);
      });
    }
  );
}

export async function getOnlineOrders(restaurantId) {
  try {
    const q = query(collection(db, 'onlineOrders'), where('restaurantId', '==', restaurantId));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return list;
  } catch (err) {
    const subQ = query(collection(db, 'restaurants', restaurantId, 'onlineOrders'));
    const snap = await getDocs(subQ);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

/**
 * Flexible getOnlineOrderById: accepts (orderId) OR (restaurantId, orderId)
 */
export async function getOnlineOrderById(arg1, arg2) {
  const orderId = arg2 || arg1;
  const restaurantId = arg2 ? arg1 : null;

  // Try root onlineOrders first
  try {
    const rootSnap = await getDoc(doc(db, 'onlineOrders', orderId));
    if (rootSnap.exists()) {
      return { id: rootSnap.id, ...rootSnap.data() };
    }
  } catch (err) {
    // ignore
  }

  // Fallback to subcollection if restaurantId is known
  if (restaurantId) {
    const subSnap = await getDoc(doc(db, 'restaurants', restaurantId, 'onlineOrders', orderId));
    if (subSnap.exists()) {
      return { id: subSnap.id, ...subSnap.data() };
    }
  }

  return null;
}

/**
 * Flexible subscribeToOnlineOrderById: accepts (orderId, callback) OR (restaurantId, orderId, callback)
 */
export function subscribeToOnlineOrderById(arg1, arg2, arg3) {
  let orderId;
  let callback;
  let restaurantId = null;

  if (typeof arg2 === 'function') {
    // Called as (orderId, callback)
    orderId = arg1;
    callback = arg2;
  } else {
    // Called as (restaurantId, orderId, callback)
    restaurantId = arg1;
    orderId = arg2;
    callback = arg3;
  }

  if (!orderId || typeof callback !== 'function') {
    return () => {};
  }

  // Listen to root onlineOrders document
  const rootDocRef = doc(db, 'onlineOrders', orderId);
  return onSnapshot(
    rootDocRef,
    (snap) => {
      if (snap.exists()) {
        callback({ id: snap.id, ...snap.data() });
      } else if (restaurantId) {
        // Fallback to subcollection
        const subDocRef = doc(db, 'restaurants', restaurantId, 'onlineOrders', orderId);
        getDoc(subDocRef).then((subSnap) => {
          if (subSnap.exists()) {
            callback({ id: subSnap.id, ...subSnap.data() });
          } else {
            callback(null);
          }
        });
      } else {
        callback(null);
      }
    },
    (err) => {
      console.warn('subscribeToOnlineOrderById error:', err);
      callback(null);
    }
  );
}

/**
 * Updates status across both root and subcollections
 */
export async function updateOnlineOrderStatus(arg1, arg2, arg3, arg4) {
  let orderId;
  let status;
  let extra = {};
  let restaurantId = null;

  if (typeof arg2 === 'string' && ['PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DISPATCHED', 'COMPLETED', 'CANCELLED', 'DELIVERED'].includes(arg2)) {
    // Called as (orderId, status, extra)
    orderId = arg1;
    status = arg2;
    extra = arg3 || {};
  } else {
    // Called as (restaurantId, orderId, status, extra)
    restaurantId = arg1;
    orderId = arg2;
    status = arg3;
    extra = arg4 || {};
  }

  const updates = {
    status,
    ...extra,
    updatedAt: serverTimestamp(),
  };

  // 1. Update root
  try {
    const rootRef = doc(db, 'onlineOrders', orderId);
    await updateDoc(rootRef, updates);
  } catch (err) {
    console.warn('Update root onlineOrder error:', err);
  }

  // 2. Update subcollection if restaurantId is provided
  if (restaurantId) {
    try {
      const subRef = doc(db, 'restaurants', restaurantId, 'onlineOrders', orderId);
      await updateDoc(subRef, updates);
    } catch (err) {
      console.warn('Update subcollection onlineOrder error:', err);
    }
  }
}

// ─── Customer online-order history (by phone number) ──────────────────────────

export async function getOnlineOrdersAcrossRestaurants(phone) {
  try {
    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    // Query root collection
    const q = query(
      collection(db, 'onlineOrders'),
      where('customerPhone', 'in', [phone, cleanPhone, `+91${cleanPhone}`])
    );
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return list;
  } catch (err) {
    console.warn('getOnlineOrdersAcrossRestaurants fallback to collectionGroup:', err);
    try {
      const cg = collectionGroup(db, 'onlineOrders');
      const snap = await getDocs(cg);
      const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
      return snap.docs
        .map((d) => ({ id: d.id, restaurantId: d.ref.parent.parent?.id, ...d.data() }))
        .filter((o) => {
          const p = String(o.customerPhone || '').replace(/\D/g, '').slice(-10);
          return p === cleanPhone;
        });
    } catch (cgErr) {
      console.warn('collectionGroup error:', cgErr);
      return [];
    }
  }
}
