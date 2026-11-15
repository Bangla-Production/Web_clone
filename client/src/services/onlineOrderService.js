/**
 * Online Orders Service
 * Handles Takeaway & Delivery orders with dual-sync across:
 *   - Root collection: onlineOrders/{orderId} (queried by Riders & Dispatch)
 *   - Subcollection: restaurants/{restaurantId}/onlineOrders/{orderId} (queried by Restaurant Admin & Staff)
 *
 * Provides real-time synchronization, status transitions, and backward compatibility.
 */

import {
  auth,
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
import { ensureCustomerAuthSession } from './customerAuthService';

// Real-time instantaneous cross-tab broadcast channel
const orderSyncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('abar_khabo_order_sync')
  : null;

// ─── Order Placement ──────────────────────────────────────────────────────────

export async function placeOnlineOrder(restaurantId, orderData) {
  if (!restaurantId) {
    throw new Error('Restaurant ID is required to place an order.');
  }

  // Ensure an authenticated session exists (anonymous if guest) so customerId matches request.auth.uid
  let customerId = orderData.customerId || auth?.currentUser?.uid || null;
  if (!customerId) {
    try {
      const sessionUser = await ensureCustomerAuthSession();
      if (sessionUser?.uid) customerId = sessionUser.uid;
    } catch (e) {
      console.warn('ensureCustomerAuthSession fallback on placeOnlineOrder:', e);
    }
  }

  // Generate a new unique order reference at the root collection
  const rootColRef = collection(db, 'onlineOrders');
  const orderDocRef = doc(rootColRef);
  const orderId = orderDocRef.id;

  const payload = {
    ...orderData,
    id: orderId,
    customerId,
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

  // Cache locally right away for instant client-side retrieval & offline resilience
  try {
    const localOrder = {
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const saved = JSON.parse(localStorage.getItem('abar_khabo_placed_orders') || '[]');
    const nextList = [localOrder, ...saved.filter(o => o.id !== orderId)].slice(0, 50);
    localStorage.setItem('abar_khabo_placed_orders', JSON.stringify(nextList));
    localStorage.setItem(`abar_khabo_order_${orderId}`, JSON.stringify(localOrder));
    localStorage.setItem('abar_khabo_latest_order_id', orderId);
  } catch (e) {
    console.warn('Could not cache placed order to localStorage:', e);
  }

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

  // Local storage lookup for immediate initial rendering & offline resilience
  const getLocalOrder = () => {
    try {
      const single = localStorage.getItem(`abar_khabo_order_${orderId}`);
      if (single) return JSON.parse(single);
      const orders = JSON.parse(localStorage.getItem('abar_khabo_placed_orders') || '[]');
      return orders.find((o) => o.id === orderId) || null;
    } catch {
      return null;
    }
  };

  const initialLocal = getLocalOrder();
  if (initialLocal) {
    callback(initialLocal);
  }

  // Listen to root onlineOrders document
  const rootDocRef = doc(db, 'onlineOrders', orderId);
  const unsubSnapshot = onSnapshot(
    rootDocRef,
    (snap) => {
      if (snap.exists()) {
        const liveData = { id: snap.id, ...snap.data() };
        try {
          localStorage.setItem(`abar_khabo_order_${orderId}`, JSON.stringify(liveData));
          const orders = JSON.parse(localStorage.getItem('abar_khabo_placed_orders') || '[]');
          const idx = orders.findIndex((o) => o.id === orderId);
          if (idx >= 0) {
            orders[idx] = { ...orders[idx], ...liveData };
            localStorage.setItem('abar_khabo_placed_orders', JSON.stringify(orders));
          } else {
            orders.unshift(liveData);
            localStorage.setItem('abar_khabo_placed_orders', JSON.stringify(orders.slice(0, 50)));
          }
        } catch {}
        callback(liveData);
      } else if (restaurantId) {
        // Fallback to subcollection
        const subDocRef = doc(db, 'restaurants', restaurantId, 'onlineOrders', orderId);
        getDoc(subDocRef)
          .then((subSnap) => {
            if (subSnap.exists()) {
              const subData = { id: subSnap.id, ...subSnap.data() };
              callback(subData);
            } else {
              callback(getLocalOrder());
            }
          })
          .catch(() => {
            callback(getLocalOrder());
          });
      } else {
        callback(getLocalOrder());
      }
    },
    (err) => {
      console.warn('subscribeToOnlineOrderById error, using local fallback:', err);
      callback(getLocalOrder());
    }
  );

  // Real-time instantaneous cross-tab BroadcastChannel sync listener
  const handleBroadcast = (evt) => {
    if (evt?.data?.type === 'ORDER_UPDATED' && evt.data.orderId === orderId) {
      const current = getLocalOrder() || {};
      const merged = { ...current, ...evt.data.updates };
      callback(merged);
    }
  };
  if (orderSyncChannel) {
    orderSyncChannel.addEventListener('message', handleBroadcast);
  }

  // Cross-window localStorage sync listener
  const handleStorage = (evt) => {
    if (evt.key === `abar_khabo_order_${orderId}` || evt.key === 'abar_khabo_placed_orders') {
      const updated = getLocalOrder();
      if (updated) callback(updated);
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }

  return () => {
    if (typeof unsubSnapshot === 'function') unsubSnapshot();
    if (orderSyncChannel) {
      orderSyncChannel.removeEventListener('message', handleBroadcast);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
  };
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

  // Sync with local storage
  try {
    const single = localStorage.getItem(`abar_khabo_order_${orderId}`);
    if (single) {
      const parsed = JSON.parse(single);
      localStorage.setItem(`abar_khabo_order_${orderId}`, JSON.stringify({ ...parsed, ...updates, updatedAt: new Date().toISOString() }));
    }
    const orders = JSON.parse(localStorage.getItem('abar_khabo_placed_orders') || '[]');
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx >= 0) {
      orders[idx] = { ...orders[idx], ...updates, updatedAt: new Date().toISOString() };
      localStorage.setItem('abar_khabo_placed_orders', JSON.stringify(orders));
    }
  } catch {}

  // Broadcast instantly to all tabs (0ms latency cross-tab notification)
  if (orderSyncChannel) {
    try {
      orderSyncChannel.postMessage({
        type: 'ORDER_UPDATED',
        orderId,
        updates: { ...updates, updatedAt: new Date().toISOString() },
      });
    } catch {}
  }

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
  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
  const foundMap = new Map();

  // 1. Check local storage cache on this device
  try {
    const localOrders = JSON.parse(localStorage.getItem('abar_khabo_placed_orders') || '[]');
    for (const ord of localOrders) {
      const p = String(ord.customerPhone || '').replace(/\D/g, '').slice(-10);
      if (!cleanPhone || p === cleanPhone || p.endsWith(cleanPhone) || cleanPhone.endsWith(p)) {
        foundMap.set(ord.id, ord);
      }
    }
    // Also scan individual cached order documents
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('abar_khabo_order_')) {
        try {
          const item = JSON.parse(localStorage.getItem(key) || 'null');
          if (item && item.id) {
            const p = String(item.customerPhone || '').replace(/\D/g, '').slice(-10);
            if (!cleanPhone || p === cleanPhone || p.endsWith(cleanPhone) || cleanPhone.endsWith(p)) {
              foundMap.set(item.id, item);
            }
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn('localStorage read error in getOnlineOrdersAcrossRestaurants:', e);
  }

  // 2. Query Firestore by customerId if user is authenticated
  if (auth?.currentUser?.uid) {
    try {
      const q = query(
        collection(db, 'onlineOrders'),
        where('customerId', '==', auth.currentUser.uid)
      );
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const data = { id: d.id, ...d.data() };
        const p = String(data.customerPhone || '').replace(/\D/g, '').slice(-10);
        if (!cleanPhone || p === cleanPhone || p.endsWith(cleanPhone) || cleanPhone.endsWith(p)) {
          foundMap.set(data.id, data);
        }
      });
    } catch (authErr) {
      console.warn('Authenticated customer orders query error:', authErr);
    }
  }

  // 3. For any found order IDs, attempt fresh individual doc read to get latest live status
  const orderIds = Array.from(foundMap.keys());
  await Promise.all(
    orderIds.map(async (oid) => {
      try {
        const snap = await getDoc(doc(db, 'onlineOrders', oid));
        if (snap.exists()) {
          const fresh = { id: snap.id, ...snap.data() };
          foundMap.set(oid, fresh);
        }
      } catch (e) {}
    })
  );

  // 4. Try root phone query (if permitted by rules)
  try {
    const q = query(
      collection(db, 'onlineOrders'),
      where('customerPhone', 'in', [phone, cleanPhone, `+91${cleanPhone}`])
    );
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      foundMap.set(d.id, { id: d.id, ...d.data() });
    });
  } catch (err) {}

  // 5. Try collectionGroup fallback if still empty
  if (foundMap.size === 0) {
    try {
      const cg = collectionGroup(db, 'onlineOrders');
      const snap = await getDocs(cg);
      snap.docs.forEach((d) => {
        const data = d.data();
        const p = String(data.customerPhone || '').replace(/\D/g, '').slice(-10);
        if (p === cleanPhone) {
          foundMap.set(d.id, { id: d.id, restaurantId: d.ref.parent.parent?.id, ...data });
        }
      });
    } catch (cgErr) {}
  }

  const list = Array.from(foundMap.values());
  list.sort((a, b) => {
    const tA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (new Date(a.createdAt || 0).getTime() || 0);
    const tB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (new Date(b.createdAt || 0).getTime() || 0);
    return tB - tA;
  });

  return list;
}
