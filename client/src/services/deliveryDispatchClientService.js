/**
 * Abar Khabo: Enterprise Multi-Tenant SaaS
 * Client-Side Delivery Dispatch & Fleet Logistics Service
 * 
 * Collections:
 * - Delivery Partners: deliveryPartners/{riderId}
 * - Orders: aggregatorOrders/{orderId} & onlineOrders/{orderId}
 * - Live Tracking: deliveryTracking/{orderId}
 * - Events: restaurants/{restaurantId}/deliveryEvents/{eventId}
 */

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from '../firebase/config.js';
import { calculateDistanceKm } from './locationService.js';

export const DELIVERY_STATUSES = {
  DELIVERY_PENDING: 'DELIVERY_PENDING',
  RIDER_ASSIGNED: 'RIDER_ASSIGNED',
  RIDER_ACCEPTED: 'RIDER_ACCEPTED',
  ARRIVED_AT_RESTAURANT: 'ARRIVED_AT_RESTAURANT',
  PICKED_UP: 'PICKED_UP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  ARRIVED_AT_CUSTOMER: 'ARRIVED_AT_CUSTOMER',
  DELIVERED: 'DELIVERED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED'
};

export const DELIVERY_STATUS_LABELS = {
  DELIVERY_PENDING: 'Awaiting Rider Assignment',
  RIDER_ASSIGNED: 'Rider Assigned',
  RIDER_ACCEPTED: 'Rider Accepted Order',
  ARRIVED_AT_RESTAURANT: 'Rider at Restaurant',
  PICKED_UP: 'Order Picked Up',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  ARRIVED_AT_CUSTOMER: 'Rider at Doorstep',
  DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'Delivery Failed',
  RETURNED: 'Returned to Restaurant',
  CANCELLED: 'Delivery Cancelled'
};

/**
 * Fetches available active riders for a restaurant and outlet, sorted by proximity.
 */
export async function getAvailableRidersForOutlet(restaurantId, outletId, originCoords = null) {
  try {
    if (!restaurantId) return [];
    const colRef = collection(db, 'deliveryPartners');
    const snap = await getDocs(colRef);
    const riders = [];

    const defaultLat = originCoords?.lat || 22.5726;
    const defaultLng = originCoords?.lng || 88.3639;

    snap.forEach((d) => {
      const data = d.data();
      if (data.restaurantId === restaurantId && data.status !== 'SUSPENDED') {
        // Check outlet authorization if outlet-specific
        if (!data.allOutlets && Array.isArray(data.assignedOutletIds) && outletId) {
          if (!data.assignedOutletIds.includes(outletId)) return;
        }

        const rLat = data.currentCoordinates?.lat || defaultLat;
        const rLng = data.currentCoordinates?.lng || defaultLng;
        const distanceKm = calculateDistanceKm(rLat, rLng, defaultLat, defaultLng);

        const activeCount = Array.isArray(data.currentActiveOrders) ? data.currentActiveOrders.length : 0;
        const maxCapacity = Number(data.maxActiveDeliveries || 1);

        riders.push({
          id: d.id,
          ...data,
          distanceKm: Number(distanceKm.toFixed(1)),
          activeCount,
          maxCapacity,
          isAtCapacity: activeCount >= maxCapacity
        });
      }
    });

    // Sort: available and closest first
    riders.sort((a, b) => {
      if (a.isAtCapacity !== b.isAtCapacity) return a.isAtCapacity ? 1 : -1;
      return a.distanceKm - b.distanceKm;
    });

    return riders;
  } catch (error) {
    console.error(`getAvailableRidersForOutlet error (${restaurantId}/${outletId}):`, error);
    return [];
  }
}

/**
 * Subscribes to delivery operational audit events for an order.
 */
export function subscribeToDeliveryEvents(restaurantId, orderId, callback) {
  if (!restaurantId || !orderId) return () => {};
  const colRef = collection(db, 'restaurants', restaurantId, 'deliveryEvents');
  const q = query(colRef, where('orderId', '==', orderId), orderBy('timestamp', 'asc'));

  return onSnapshot(q, (snap) => {
    const events = [];
    snap.forEach(d => events.push({ id: d.id, ...d.data() }));
    callback(events);
  }, (err) => {
    console.error('subscribeToDeliveryEvents error:', err);
    callback([]);
  });
}
