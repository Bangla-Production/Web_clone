/**
 * Online Orders Service
 * Handles Takeaway & Delivery orders stored under:
 *   restaurants/{restaurantId}/onlineOrders/{orderId}
 *
 * Provides real-time synchronization and status transitions.
 */

import {
  db,
  collection,
  collectionGroup,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from '../firebase/config';

// ─── Firestore helpers ────────────────────────────────────────────────────────

export async function placeOnlineOrder(restaurantId, orderData) {
  const colRef = collection(db, 'restaurants', restaurantId, 'onlineOrders');
  const payload = {
    ...orderData,
    status: 'PLACED', // PLACED → CONFIRMED → PREPARING → READY_FOR_PICKUP / RIDER_ASSIGNED → OUT_FOR_DELIVERY / PICKED_UP → DELIVERED / COMPLETED
    orderType: orderData.orderType || 'TAKEAWAY', // 'TAKEAWAY' | 'DELIVERY'
    paymentStatus: orderData.paymentStatus || 'PENDING',
    deliveryFee: orderData.deliveryFee || 0,
    deliveryAddress: orderData.deliveryAddress || null,
    partnerId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(colRef, payload);
  return { id: ref.id, ...payload };
}

export function subscribeToOnlineOrders(restaurantId, callback) {
  const colRef = collection(db, 'restaurants', restaurantId, 'onlineOrders');
  const q = query(colRef, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function getOnlineOrders(restaurantId) {
  const colRef = collection(db, 'restaurants', restaurantId, 'onlineOrders');
  const q = query(colRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getOnlineOrderById(restaurantId, orderId) {
  const ref = doc(db, 'restaurants', restaurantId, 'onlineOrders', orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export function subscribeToOnlineOrderById(restaurantId, orderId, callback) {
  const ref = doc(db, 'restaurants', restaurantId, 'onlineOrders', orderId);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() });
    } else {
      callback(null);
    }
  });
}

export async function updateOnlineOrderStatus(restaurantId, orderId, status, extra = {}) {
  const ref = doc(db, 'restaurants', restaurantId, 'onlineOrders', orderId);
  await updateDoc(ref, { status, ...extra, updatedAt: serverTimestamp() });
}

// ─── Customer online-order history (by phone number) ──────────────────────────

export async function getOnlineOrdersByPhone(restaurantId, phone) {
  const colRef = collection(db, 'restaurants', restaurantId, 'onlineOrders');
  const q = query(colRef, where('customerPhone', '==', phone), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getOnlineOrdersAcrossRestaurants(phone) {
  try {
    const cg = collectionGroup(db, 'onlineOrders');
    const q = query(cg, where('customerPhone', '==', phone));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, restaurantId: d.ref.parent.parent?.id, ...d.data() }));
  } catch (err) {
    console.warn('collectionGroup query error fallback:', err);
    return [];
  }
}
