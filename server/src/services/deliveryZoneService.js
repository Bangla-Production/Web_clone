/**
 * Abar Khabo: Enterprise Multi-Tenant SaaS
 * Delivery Zones, Geofencing & Serviceability Engine
 * 
 * Computes geographic distances, validates delivery serviceability,
 * and calculates dynamic delivery charges per outlet.
 */

import { logger } from '../utils/logger.js';

const EARTH_RADIUS_KM = 6371.0;

/**
 * Calculates the great-circle distance between two GPS coordinates using the Haversine formula.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in kilometers
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const l1 = Number(lat1);
  const ln1 = Number(lon1);
  const l2 = Number(lat2);
  const ln2 = Number(lon2);

  if (isNaN(l1) || isNaN(ln1) || isNaN(l2) || isNaN(ln2)) {
    return 0;
  }

  const toRad = (deg) => (deg * Math.PI) / 180.0;
  const dLat = toRad(l2 - l1);
  const dLon = toRad(ln2 - ln1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(l1)) * Math.cos(toRad(l2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Number(distance.toFixed(2));
}

export class DeliveryZoneService {
  /**
   * Evaluates whether a customer location is serviceable by an outlet.
   * 
   * @param {Object} outlet - Outlet document with coordinates and delivery settings
   * @param {Object} customerLocation - { lat, lng, address }
   * @param {number} [orderSubtotal=0] - Order food subtotal in rupees
   * @returns {{ isServiceable: boolean, distanceKm: number, maxRadiusKm: number, reason?: string }}
   */
  checkServiceability(outlet, customerLocation, orderSubtotal = 0) {
    if (!outlet) {
      return { isServiceable: false, distanceKm: 0, maxRadiusKm: 0, reason: 'OUTLET_NOT_FOUND' };
    }

    if (outlet.status === 'INACTIVE' || outlet.status === 'SUSPENDED') {
      return { isServiceable: false, distanceKm: 0, maxRadiusKm: 0, reason: 'OUTLET_INACTIVE' };
    }

    if (!customerLocation || typeof customerLocation.lat !== 'number' || typeof customerLocation.lng !== 'number') {
      return { isServiceable: false, distanceKm: 0, maxRadiusKm: 0, reason: 'INVALID_CUSTOMER_COORDINATES' };
    }

    const outletLat = Number(outlet.address?.latitude ?? outlet.coordinates?.lat ?? outlet.lat ?? 22.5726);
    const outletLng = Number(outlet.address?.longitude ?? outlet.coordinates?.lng ?? outlet.lng ?? 88.3639);

    const distanceKm = calculateDistanceKm(outletLat, outletLng, customerLocation.lat, customerLocation.lng);
    const maxRadiusKm = Number(outlet.deliverySettings?.deliveryRadiusKm ?? outlet.deliveryRadiusKm ?? 10);

    // 1. Distance check
    if (distanceKm > maxRadiusKm) {
      return {
        isServiceable: false,
        distanceKm,
        maxRadiusKm,
        reason: `Location is ${distanceKm} km away, exceeding outlet maximum delivery radius of ${maxRadiusKm} km.`
      };
    }

    // 2. Minimum order amount check
    const minOrderAmount = Number(outlet.deliverySettings?.minOrderAmount ?? outlet.minOrderAmount ?? 0);
    if (minOrderAmount > 0 && orderSubtotal < minOrderAmount) {
      return {
        isServiceable: false,
        distanceKm,
        maxRadiusKm,
        reason: `Order subtotal ₹${orderSubtotal} is below outlet minimum order requirement of ₹${minOrderAmount}.`
      };
    }

    return {
      isServiceable: true,
      distanceKm,
      maxRadiusKm
    };
  }

  /**
   * Calculates delivery fee and estimated delivery duration for an order.
   * 
   * Modes:
   * - 'DISTANCE_BASED': baseDeliveryFee + max(0, distanceKm - baseDeliveryKm) * perKmDeliveryFee
   * - 'FIXED': fixedDeliveryFee
   * - 'FREE': 0
   * 
   * @param {Object} outlet 
   * @param {Object} customerLocation 
   * @param {number} [orderSubtotal=0] 
   * @returns {{ fee: number, isFree: boolean, distanceKm: number, estimatedTransitMins: number, estimatedTotalMins: number, mode: string }}
   */
  calculateDeliveryFee(outlet, customerLocation, orderSubtotal = 0) {
    const serviceability = this.checkServiceability(outlet, customerLocation, orderSubtotal);
    const distanceKm = serviceability.distanceKm;

    const settings = outlet?.deliverySettings || {};
    const mode = settings.deliveryFeeMode || outlet?.deliveryFeeMode || 'DISTANCE_BASED';
    const fixedFee = Number(settings.fixedDeliveryFee ?? outlet?.fixedDeliveryFee ?? 30);
    const baseFee = Number(settings.baseDeliveryFee ?? outlet?.baseDeliveryFee ?? 30);
    const baseKm = Number(settings.baseDeliveryKm ?? outlet?.baseDeliveryKm ?? 3);
    const perKmRate = Number(settings.perKmDeliveryFee ?? outlet?.perKmDeliveryFee ?? 10);
    const freeAbove = Number(settings.freeDeliveryAbove ?? outlet?.freeDeliveryAbove ?? 500);

    let calculatedFee = 0;

    if (mode === 'FREE') {
      calculatedFee = 0;
    } else if (mode === 'FIXED') {
      calculatedFee = fixedFee;
    } else {
      // DISTANCE_BASED
      calculatedFee = baseFee;
      if (distanceKm > baseKm) {
        calculatedFee += Math.ceil(distanceKm - baseKm) * perKmRate;
      }
    }

    // Free delivery check if subtotal exceeds threshold
    const isFree = mode === 'FREE' || (freeAbove > 0 && orderSubtotal >= freeAbove);
    if (isFree) {
      calculatedFee = 0;
    }

    // Estimated preparation + transit time
    // ~20 mins kitchen prep + ~4 mins per km travel (realistic urban Kolkata benchmark)
    const prepTimeMinutes = Number(settings.prepTimeMinutes ?? outlet?.prepTimeMinutes ?? 20);
    const estimatedTransitMins = Math.max(5, Math.ceil(distanceKm * 4));
    const estimatedTotalMins = prepTimeMinutes + estimatedTransitMins;

    return {
      fee: Math.round(calculatedFee),
      isFree,
      distanceKm,
      isServiceable: serviceability.isServiceable,
      reason: serviceability.reason,
      estimatedTransitMins,
      estimatedTotalMins,
      mode
    };
  }
}

export const deliveryZoneService = new DeliveryZoneService();
