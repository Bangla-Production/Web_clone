import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { calculateDistanceKm } from './locationService';

export const DELIVERY_STATUS = {
  PLACED: 'PLACED',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  RIDER_ASSIGNED: 'RIDER_ASSIGNED',
  ARRIVED_AT_RESTAURANT: 'ARRIVED_AT_RESTAURANT',
  PICKED_UP: 'PICKED_UP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  ARRIVED_AT_CUSTOMER: 'ARRIVED_AT_CUSTOMER',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

export const DELIVERY_STATUS_LABELS = {
  PLACED: 'Order Placed',
  CONFIRMED: 'Confirmed by Restaurant',
  PREPARING: 'Food Being Prepared',
  READY_FOR_PICKUP: 'Food Packed & Ready',
  RIDER_ASSIGNED: 'Delivery Partner Assigned',
  ARRIVED_AT_RESTAURANT: 'Rider Reached Restaurant',
  PICKED_UP: 'Order Picked Up',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  ARRIVED_AT_CUSTOMER: 'Rider Arrived at Doorstep',
  DELIVERED: 'Delivered',
  CANCELLED: 'Order Cancelled',
};

/**
 * Computes delivery fee, estimated time, and eligibility.
 * @param {Object} restaurant - Restaurant object with coordinates / deliveryRadiusKm / fee settings
 * @param {Object} customerLoc - { lat, lng, formattedAddress }
 * @param {number} subtotal - Cart subtotal in INR
 */
export function calculateDeliveryEstimate(restaurant, customerLoc, subtotal = 0) {
  const rLat = restaurant?.coordinates?.lat ?? restaurant?.lat ?? 22.5726;
  const rLng = restaurant?.coordinates?.lng ?? restaurant?.lng ?? 88.3639;

  let distanceKm = 2.0; // default estimate if coords missing
  if (customerLoc?.lat && customerLoc?.lng && rLat && rLng) {
    distanceKm = calculateDistanceKm(customerLoc.lat, customerLoc.lng, rLat, rLng);
  }

  const maxRadius = Number(restaurant?.deliveryRadiusKm) || 12;
  const isServiceable = distanceKm <= maxRadius;

  // Pricing rules configurable by restaurant admin:
  // Modes: 'DISTANCE_BASED' | 'FIXED' | 'FREE'
  const mode = restaurant?.deliveryFeeMode || 'DISTANCE_BASED';
  const fixedFee = Number(restaurant?.fixedDeliveryFee !== undefined ? restaurant.fixedDeliveryFee : 30);
  const baseFee = Number(restaurant?.baseDeliveryFee !== undefined ? restaurant.baseDeliveryFee : 30);
  const baseKm = Number(restaurant?.baseDeliveryKm) || 3;
  const perKmRate = Number(restaurant?.perKmDeliveryFee !== undefined ? restaurant.perKmDeliveryFee : 10);
  const freeAbove = Number(restaurant?.freeDeliveryAbove) || 500;

  let fee = 0;
  if (mode === 'FREE') {
    fee = 0;
  } else if (mode === 'FIXED') {
    fee = fixedFee;
  } else {
    // DISTANCE_BASED (Default auto per-km calculation)
    fee = baseFee;
    if (distanceKm > baseKm) {
      fee += Math.ceil(distanceKm - baseKm) * perKmRate;
    }
  }

  // Free delivery threshold check
  const isFree = mode === 'FREE' || (freeAbove > 0 && subtotal >= freeAbove);
  if (isFree) {
    fee = 0;
  }

  // Estimated preparation + transit time
  // ~20 mins preparation + ~4 mins per km travel
  const prepTime = Number(restaurant?.prepTimeMinutes) || 20;
  const transitTime = Math.ceil(distanceKm * 4);
  const estimatedTimeMins = prepTime + transitTime;

  return {
    distanceKm: Number(distanceKm.toFixed(1)),
    fee: Math.round(fee),
    isFree,
    freeAbove,
    isServiceable,
    maxRadius,
    estimatedTimeMins,
    mode,
  };
}

/**
 * Initializes delivery tracking document in Firestore
 */
export async function initDeliveryTracking(orderId, trackingData) {
  try {
    const trackingRef = doc(db, 'deliveryTracking', orderId);
    await setDoc(trackingRef, {
      orderId,
      status: trackingData.status || DELIVERY_STATUS.PLACED,
      restaurantId: trackingData.restaurantId,
      restaurantName: trackingData.restaurantName || '',
      restaurantCoordinates: trackingData.restaurantCoordinates || null,
      customerCoordinates: trackingData.customerCoordinates || null,
      deliveryAddress: trackingData.deliveryAddress || '',
      riderId: null,
      riderName: null,
      riderPhone: null,
      riderVehicle: null,
      riderCoordinates: null,
      lastUpdatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (err) {
    console.error('initDeliveryTracking error:', err);
    return false;
  }
}
