import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { DELIVERY_STATUS } from './deliveryService';

/**
 * Listens to unassigned delivery orders awaiting a rider
 */
export function subscribeToAvailableOrders(callback) {
  const q = query(
    collection(db, 'onlineOrders'),
    where('orderType', '==', 'DELIVERY')
  );

  return onSnapshot(q, (snapshot) => {
    const orders = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Available orders: not yet assigned to a rider, confirmed or being prepared, and not cancelled/completed
      if (
        !data.riderId &&
        ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'].includes(data.status) &&
        data.status !== 'CANCELLED' &&
        data.status !== 'COMPLETED'
      ) {
        orders.push({ id: docSnap.id, ...data });
      }
    });
    // Sort recent first
    orders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(orders);
  }, (err) => {
    console.error('subscribeToAvailableOrders error:', err);
    callback([]);
  });
}

/**
 * Listens to the current active delivery order for a specific rider
 */
export function subscribeToRiderActiveOrder(riderId, callback) {
  if (!riderId) return () => {};

  const q = query(
    collection(db, 'onlineOrders'),
    where('orderType', '==', 'DELIVERY'),
    where('riderId', '==', riderId)
  );

  return onSnapshot(q, (snapshot) => {
    let activeOrder = null;
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.status !== 'COMPLETED' && data.status !== 'CANCELLED') {
        activeOrder = { id: docSnap.id, ...data };
      }
    });
    callback(activeOrder);
  }, (err) => {
    console.error('subscribeToRiderActiveOrder error:', err);
    callback(null);
  });
}

/**
 * Rider accepts an order
 */
export async function acceptDeliveryOrder(orderId, riderProfile) {
  const orderRef = doc(db, 'onlineOrders', orderId);
  const trackingRef = doc(db, 'deliveryTracking', orderId);
  const riderRef = doc(db, 'deliveryPartners', riderProfile.uid);

  const riderInfo = {
    riderId: riderProfile.uid,
    riderName: riderProfile.name,
    riderPhone: riderProfile.phone,
    riderVehicle: riderProfile.vehicleType || 'BIKE',
    riderVehicleNumber: riderProfile.vehicleNumber || '',
    deliveryStatus: DELIVERY_STATUS.RIDER_ASSIGNED,
    assignedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await updateDoc(orderRef, riderInfo);

  await updateDoc(trackingRef, {
    status: DELIVERY_STATUS.RIDER_ASSIGNED,
    riderId: riderProfile.uid,
    riderName: riderProfile.name,
    riderPhone: riderProfile.phone,
    riderVehicle: `${riderProfile.vehicleType || 'BIKE'} (${riderProfile.vehicleNumber || 'Standard'})`,
    lastUpdatedAt: serverTimestamp(),
  });

  await updateDoc(riderRef, {
    isAvailable: false,
    currentOrderId: orderId,
    updatedAt: serverTimestamp(),
  });

  return true;
}

/**
 * Updates step in delivery workflow
 */
export async function updateDeliveryStep(orderId, nextStatus, riderId) {
  const orderRef = doc(db, 'onlineOrders', orderId);
  const trackingRef = doc(db, 'deliveryTracking', orderId);

  const updates = {
    deliveryStatus: nextStatus,
    updatedAt: serverTimestamp(),
  };

  if (nextStatus === DELIVERY_STATUS.PICKED_UP) {
    updates.status = 'DISPATCHED';
    updates.pickedUpAt = serverTimestamp();
  } else if (nextStatus === DELIVERY_STATUS.DELIVERED) {
    updates.status = 'COMPLETED';
    updates.deliveredAt = serverTimestamp();
  }

  await updateDoc(orderRef, updates);

  try {
    await updateDoc(trackingRef, {
      status: nextStatus,
      lastUpdatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Could not update trackingRef status:', err);
  }

  // If completed or cancelled, free up the rider
  if (nextStatus === DELIVERY_STATUS.DELIVERED && riderId) {
    const riderRef = doc(db, 'deliveryPartners', riderId);
    await updateDoc(riderRef, {
      isAvailable: true,
      currentOrderId: null,
      updatedAt: serverTimestamp(),
    });
  }

  return true;
}
