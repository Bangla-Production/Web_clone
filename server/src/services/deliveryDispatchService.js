/**
 * Abar Khabo: Enterprise Multi-Tenant SaaS
 * Multi-Tenant Delivery Management, Rider Dispatch & Fleet Logistics Engine
 * 
 * Collections:
 * - Delivery Partners: deliveryPartners/{riderId}
 * - Orders Authoritative: aggregatorOrders/{orderId}
 * - Delivery Tracking: deliveryTracking/{orderId}
 * - Operational Events: restaurants/{restaurantId}/deliveryEvents/{eventId}
 */

import { getDb } from '../config/firebaseAdmin.js';
import { logger } from '../utils/logger.js';
import { generateSha256 } from '../utils/cryptoUtils.js';
import { calculateDistanceKm, deliveryZoneService } from './deliveryZoneService.js';

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

export const ALLOWED_DELIVERY_TRANSITIONS = {
  DELIVERY_PENDING: ['RIDER_ASSIGNED', 'CANCELLED'],
  RIDER_ASSIGNED: ['RIDER_ACCEPTED', 'ARRIVED_AT_RESTAURANT', 'PICKED_UP', 'DELIVERY_PENDING', 'CANCELLED'],
  RIDER_ACCEPTED: ['ARRIVED_AT_RESTAURANT', 'PICKED_UP', 'DELIVERY_PENDING', 'CANCELLED'],
  ARRIVED_AT_RESTAURANT: ['PICKED_UP', 'DELIVERY_PENDING', 'CANCELLED'],
  PICKED_UP: ['OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER', 'DELIVERY_FAILED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['ARRIVED_AT_CUSTOMER', 'DELIVERED', 'DELIVERY_FAILED', 'CANCELLED'],
  ARRIVED_AT_CUSTOMER: ['DELIVERED', 'DELIVERY_FAILED', 'CANCELLED'],
  DELIVERED: [], // Terminal state
  DELIVERY_FAILED: ['RETURNED'],
  RETURNED: [], // Terminal state
  CANCELLED: [] // Terminal state
};

export const DELIVERY_FAIL_REASONS = {
  CUSTOMER_UNREACHABLE: 'CUSTOMER_UNREACHABLE',
  INCORRECT_ADDRESS: 'INCORRECT_ADDRESS',
  CUSTOMER_REJECTED: 'CUSTOMER_REJECTED',
  ACCIDENT_OR_BREAKDOWN: 'ACCIDENT_OR_BREAKDOWN',
  RESTAURANT_CLOSED: 'RESTAURANT_CLOSED',
  FORCE_MAJEURE: 'FORCE_MAJEURE'
};

export class DeliveryDispatchService {
  /**
   * Generates a deterministic event ID to prevent duplicate operational logs and alerts.
   */
  generateEventId(orderId, eventType, timestamp, actorUid) {
    const timeWindow = timestamp ? timestamp.slice(0, 16) : new Date().toISOString().slice(0, 16); // 1-minute window
    const seed = `${orderId}:${eventType}:${timeWindow}:${actorUid || 'system'}`;
    const hash = generateSha256(seed);
    return `EVT_${eventType}_${hash.substring(0, 16)}`;
  }

  /**
   * Registers a new delivery partner under a restaurant tenant and assigned outlets.
   * Uses Firebase Auth UID as primary key.
   */
  async registerRider(riderData, actor = null) {
    const db = getDb();
    const riderId = riderData.uid || riderData.riderId;
    if (!riderId) {
      throw new Error('Rider Firebase Auth UID (uid) is required for registration.');
    }

    const restaurantId = riderData.restaurantId;
    if (!restaurantId) {
      throw new Error('restaurantId is required to bind rider to tenant fleet.');
    }

    const now = new Date().toISOString();
    const assignedOutletIds = Array.isArray(riderData.assignedOutletIds)
      ? riderData.assignedOutletIds
      : [riderData.outletId || `${restaurantId}_main`];

    const riderProfile = {
      _schemaVersion: '2.0.0',
      id: riderId,
      uid: riderId,
      restaurantId,
      assignedOutletIds,
      allOutlets: Boolean(riderData.allOutlets),
      name: (riderData.name || 'Delivery Partner').trim(),
      phone: riderData.phone || '',
      email: riderData.email || '',
      vehicleType: riderData.vehicleType || 'BIKE', // 'BIKE' | 'SCOOTER' | 'CYCLE' | 'EV'
      vehicleNumber: riderData.vehicleNumber || '',
      licenseNumber: riderData.licenseNumber || '',
      isOnline: Boolean(riderData.isOnline ?? true),
      isAvailable: Boolean(riderData.isAvailable ?? true),
      maxActiveDeliveries: Number(riderData.maxActiveDeliveries || 1),
      currentActiveOrders: [],
      currentCoordinates: riderData.currentCoordinates || { lat: 22.5726, lng: 88.3639 },
      rating: 5.0,
      totalDeliveries: 0,
      // KYC Simulation clearly labelled
      isAadhaarVerified: false,
      aadhaarMasked: riderData.aadhaarMasked || '•••• •••• ' + (riderData.phone ? riderData.phone.slice(-4) : '1234'),
      kycStatus: 'SIMULATED_TEST_VERIFIED',
      status: 'APPROVED', // 'APPROVED' | 'SUSPENDED' | 'INACTIVE'
      createdAt: now,
      updatedAt: now
    };

    await db.doc(`deliveryPartners/${riderId}`).set(riderProfile, { merge: true });

    // Also mirror to user profile
    await db.doc(`users/${riderId}`).set({
      uid: riderId,
      role: 'delivery_partner',
      restaurantId,
      assignedOutletIds,
      allOutlets: Boolean(riderData.allOutlets),
      displayName: riderProfile.name,
      phone: riderProfile.phone,
      accountStatus: 'active',
      updatedAt: now
    }, { merge: true });

    logger.info('Delivery partner registered', { riderId, restaurantId, assignedOutletIds });
    return riderProfile;
  }

  /**
   * Manually assigns a rider to an order with strict tenant, outlet, and capacity checks.
   */
  async assignRiderToOrder(restaurantId, outletId, orderId, riderId, actor = null) {
    const db = getDb();
    const now = new Date().toISOString();
    const actorInfo = actor || { uid: 'system', role: 'system', name: 'Dispatch System' };

    return db.runTransaction(async (transaction) => {
      // 1. Fetch Order Document
      const orderRef = db.doc(`aggregatorOrders/${orderId}`);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        throw new Error(`Order ${orderId} does not exist`);
      }
      const order = orderSnap.data();

      // Enforce Tenant & Outlet Boundary
      if (order.restaurantId !== restaurantId) {
        throw new Error(`Cross-tenant assignment denied: Order belongs to ${order.restaurantId}, not ${restaurantId}`);
      }
      if (order.outletId !== outletId) {
        throw new Error(`Cross-outlet assignment denied: Order belongs to ${order.outletId}, not ${outletId}`);
      }

      // Check aggregator fleet isolation
      const partnerType = order.delivery?.partnerType || 'RESTAURANT_FLEET';
      if ((partnerType === 'SWIGGY_FLEET' || partnerType === 'ZOMATO_FLEET') && !order.delivery?.allowSelfDeliveryOverride) {
        throw new Error(`Order ${orderId} is managed by ${partnerType}. Cannot assign in-house restaurant rider.`);
      }

      // 2. Fetch Rider Profile
      const riderRef = db.doc(`deliveryPartners/${riderId}`);
      const riderSnap = await transaction.get(riderRef);
      if (!riderSnap.exists) {
        throw new Error(`Rider ${riderId} not found`);
      }
      const rider = riderSnap.data();

      // Enforce Rider Tenant & Outlet Membership
      if (rider.restaurantId !== restaurantId) {
        throw new Error(`Cross-tenant assignment denied: Rider belongs to ${rider.restaurantId}, not ${restaurantId}`);
      }
      if (!rider.allOutlets && Array.isArray(rider.assignedOutletIds) && !rider.assignedOutletIds.includes(outletId)) {
        throw new Error(`Cross-outlet assignment denied: Rider ${riderId} is not assigned to outlet ${outletId}`);
      }

      // Check Duty Status & Capacity
      if (rider.status === 'SUSPENDED') {
        throw new Error(`Rider ${riderId} is suspended.`);
      }
      if (!rider.isOnline) {
        throw new Error(`Rider ${riderId} is currently offline.`);
      }

      const activeOrders = Array.isArray(rider.currentActiveOrders) ? rider.currentActiveOrders : [];
      // Prevent duplicate assignment
      if (activeOrders.includes(orderId)) {
        return { success: true, duplicate: true, orderId, riderId };
      }

      const maxCapacity = Number(rider.maxActiveDeliveries || 1);
      if (activeOrders.length >= maxCapacity) {
        throw new Error(`Rider ${riderId} has reached maximum active delivery capacity (${activeOrders.length}/${maxCapacity}).`);
      }

      const prevRiderId = order.delivery?.riderId || null;

      // 3. Update Order Delivery State
      const updatedActiveOrders = [...activeOrders, orderId];
      const isAvailableNow = updatedActiveOrders.length < maxCapacity;

      const assignmentHistory = Array.isArray(order.delivery?.assignmentHistory)
        ? [...order.delivery.assignmentHistory]
        : [];
      assignmentHistory.push({
        assignedRiderId: riderId,
        previousRiderId: prevRiderId,
        assignedBy: actorInfo.uid,
        assignedAt: now,
        reason: 'Manual or Auto Dispatch'
      });

      const orderDeliveryUpdates = {
        'delivery.status': DELIVERY_STATUSES.RIDER_ASSIGNED,
        'delivery.riderId': riderId,
        'delivery.riderName': rider.name,
        'delivery.riderPhone': rider.phone,
        'delivery.riderVehicle': `${rider.vehicleType} (${rider.vehicleNumber || 'Standard'})`,
        'delivery.assignedAt': now,
        'delivery.assignmentHistory': assignmentHistory,
        updatedAt: now
      };

      transaction.update(orderRef, orderDeliveryUpdates);

      // 4. Update Rider Active Orders
      transaction.update(riderRef, {
        currentActiveOrders: updatedActiveOrders,
        isAvailable: isAvailableNow,
        updatedAt: now
      });

      // 5. Update/Init Delivery Tracking
      const trackingRef = db.doc(`deliveryTracking/${orderId}`);
      transaction.set(trackingRef, {
        orderId,
        restaurantId,
        outletId,
        status: DELIVERY_STATUSES.RIDER_ASSIGNED,
        riderId,
        riderName: rider.name,
        riderPhone: rider.phone,
        riderVehicle: `${rider.vehicleType} (${rider.vehicleNumber || 'Standard'})`,
        riderCoordinates: rider.currentCoordinates || null,
        lastUpdatedAt: now
      }, { merge: true });

      // 6. Record Operational Delivery Event
      const eventId = this.generateEventId(orderId, 'RIDER_ASSIGNED', now, actorInfo.uid);
      const eventRef = db.doc(`restaurants/${restaurantId}/deliveryEvents/${eventId}`);
      transaction.set(eventRef, {
        eventId,
        orderId,
        restaurantId,
        outletId,
        eventType: 'RIDER_ASSIGNED',
        riderId,
        previousRiderId: prevRiderId,
        actor: actorInfo,
        timestamp: now
      });

      return {
        success: true,
        orderId,
        riderId,
        status: DELIVERY_STATUSES.RIDER_ASSIGNED
      };
    });
  }

  /**
   * Reassigns an order to another rider with complete audit logging.
   */
  async reassignRider(restaurantId, outletId, orderId, newRiderId, reason = 'Rider reassignment', actor = null) {
    const db = getDb();
    const now = new Date().toISOString();
    const actorInfo = actor || { uid: 'system', role: 'system', name: 'Dispatch System' };

    // 1. Fetch current order to identify previous rider
    const orderSnap = await db.doc(`aggregatorOrders/${orderId}`).get();
    if (!orderSnap.exists) {
      throw new Error(`Order ${orderId} does not exist`);
    }
    const order = orderSnap.data();
    const previousRiderId = order.delivery?.riderId;

    // 2. Free up previous rider if assigned
    if (previousRiderId && previousRiderId !== newRiderId) {
      try {
        const prevRiderRef = db.doc(`deliveryPartners/${previousRiderId}`);
        const prevSnap = await prevRiderRef.get();
        if (prevSnap.exists) {
          const prevData = prevSnap.data();
          const filteredOrders = (prevData.currentActiveOrders || []).filter(id => id !== orderId);
          await prevRiderRef.update({
            currentActiveOrders: filteredOrders,
            isAvailable: true,
            updatedAt: now
          });
        }
      } catch (err) {
        logger.warn('Could not free previous rider on reassignment', { previousRiderId, error: err.message });
      }
    }

    // 3. Assign new rider
    const result = await this.assignRiderToOrder(restaurantId, outletId, orderId, newRiderId, {
      ...actorInfo,
      reason
    });

    // 4. Record REASSIGNMENT event
    const eventId = this.generateEventId(orderId, 'REASSIGNED', now, actorInfo.uid);
    await db.doc(`restaurants/${restaurantId}/deliveryEvents/${eventId}`).set({
      eventId,
      orderId,
      restaurantId,
      outletId,
      eventType: 'REASSIGNED',
      previousRiderId,
      newRiderId,
      reason,
      actor: actorInfo,
      timestamp: now
    });

    return result;
  }

  /**
   * Automatically assigns the best available rider using proximity distance,
   * active delivery workload, and outlet compatibility.
   */
  async autoAssignRider(restaurantId, outletId, orderId, actor = null) {
    const db = getDb();

    // 1. Fetch order details
    const orderSnap = await db.doc(`aggregatorOrders/${orderId}`).get();
    if (!orderSnap.exists) {
      throw new Error(`Order ${orderId} not found for auto-assignment`);
    }
    const order = orderSnap.data();

    // 2. Fetch outlet details for coordinate origin
    const outletSnap = await db.doc(`restaurants/${restaurantId}/outlets/${outletId}`).get();
    const outlet = outletSnap.exists ? outletSnap.data() : {};
    const outletLat = Number(outlet.address?.latitude ?? outlet.coordinates?.lat ?? 22.5726);
    const outletLng = Number(outlet.address?.longitude ?? outlet.coordinates?.lng ?? 88.3639);

    // 3. Fetch all riders for this restaurant
    const ridersSnap = await db.collection('deliveryPartners').get();
    const eligibleRiders = [];

    ridersSnap.forEach(d => {
      const r = d.data();
      if (r.restaurantId !== restaurantId) return;
      if (r.status === 'SUSPENDED' || !r.isOnline) return;

      // Outlet authorization check
      if (!r.allOutlets && Array.isArray(r.assignedOutletIds) && !r.assignedOutletIds.includes(outletId)) {
        return;
      }

      const activeList = Array.isArray(r.currentActiveOrders) ? r.currentActiveOrders : [];
      const capacity = Number(r.maxActiveDeliveries || 1);
      if (activeList.length >= capacity) return;

      // Calculate distance to outlet
      const rLat = r.currentCoordinates?.lat || outletLat;
      const rLng = r.currentCoordinates?.lng || outletLng;
      const distanceToOutlet = calculateDistanceKm(rLat, rLng, outletLat, outletLng);

      eligibleRiders.push({
        id: d.id,
        ...r,
        distanceToOutlet,
        activeCount: activeList.length
      });
    });

    if (eligibleRiders.length === 0) {
      logger.warn('No eligible online riders found for auto-assignment', { orderId, outletId });
      return { success: false, reason: 'NO_AVAILABLE_RIDERS' };
    }

    // Sort criteria: Lowest active count first, then closest distance
    eligibleRiders.sort((a, b) => {
      if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount;
      return a.distanceToOutlet - b.distanceToOutlet;
    });

    const chosenRider = eligibleRiders[0];
    logger.info('Auto-dispatching order to closest eligible rider', {
      orderId,
      riderId: chosenRider.id,
      distanceKm: chosenRider.distanceToOutlet
    });

    return this.assignRiderToOrder(restaurantId, outletId, orderId, chosenRider.id, actor);
  }

  /**
   * Rider accepts an assigned order.
   */
  async acceptAssignment(orderId, riderId) {
    return this.updateDeliveryStatus(orderId, DELIVERY_STATUSES.RIDER_ACCEPTED, {
      uid: riderId,
      role: 'delivery_partner',
      name: 'Rider'
    });
  }

  /**
   * Rider declines/rejects an assigned order.
   * Frees rider and transitions order back to DELIVERY_PENDING for reassignment.
   */
  async rejectAssignment(orderId, riderId, reason = 'Rider declined') {
    const db = getDb();
    const now = new Date().toISOString();

    const orderRef = db.doc(`aggregatorOrders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new Error(`Order ${orderId} not found`);
    const order = orderSnap.data();

    // Free rider
    const riderRef = db.doc(`deliveryPartners/${riderId}`);
    const riderSnap = await riderRef.get();
    if (riderSnap.exists) {
      const current = riderSnap.data().currentActiveOrders || [];
      await riderRef.update({
        currentActiveOrders: current.filter(id => id !== orderId),
        isAvailable: true,
        updatedAt: now
      });
    }

    // Set order back to pending
    await orderRef.update({
      'delivery.status': DELIVERY_STATUSES.DELIVERY_PENDING,
      'delivery.riderId': null,
      'delivery.riderName': null,
      'delivery.riderPhone': null,
      updatedAt: now
    });

    const eventId = this.generateEventId(orderId, 'ASSIGNMENT_REJECTED', now, riderId);
    await db.doc(`restaurants/${order.restaurantId}/deliveryEvents/${eventId}`).set({
      eventId,
      orderId,
      restaurantId: order.restaurantId,
      outletId: order.outletId,
      eventType: 'ASSIGNMENT_REJECTED',
      riderId,
      reason,
      timestamp: now
    });

    return { success: true, status: DELIVERY_STATUSES.DELIVERY_PENDING, rejectedBy: riderId };
  }

  /**
   * Advances the delivery lifecycle with strict state machine validation and proof verification.
   */
  async updateDeliveryStatus(orderId, nextStatus, actor = null, metadata = {}) {
    const db = getDb();
    const now = new Date().toISOString();
    const actorInfo = actor || { uid: 'system', role: 'system', name: 'Delivery Engine' };

    return db.runTransaction(async (transaction) => {
      const orderRef = db.doc(`aggregatorOrders/${orderId}`);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        throw new Error(`Order ${orderId} does not exist`);
      }
      const order = orderSnap.data();
      const currentDeliveryStatus = order.delivery?.status || DELIVERY_STATUSES.DELIVERY_PENDING;

      // 1. Validate State Transition
      const allowedNext = ALLOWED_DELIVERY_TRANSITIONS[currentDeliveryStatus] || [];
      if (!allowedNext.includes(nextStatus)) {
        throw new Error(
          `Illegal delivery transition from ${currentDeliveryStatus} to ${nextStatus}. Allowed: [${allowedNext.join(', ')}]`
        );
      }

      // 2. Validate OTPs if applicable
      if (nextStatus === DELIVERY_STATUSES.PICKED_UP) {
        if (order.delivery?.pickupOtp && metadata.pickupOtp) {
          if (String(order.delivery.pickupOtp).trim() !== String(metadata.pickupOtp).trim()) {
            throw new Error('Invalid Pickup OTP. Handover denied.');
          }
        }
      }

      if (nextStatus === DELIVERY_STATUSES.DELIVERED) {
        if (order.delivery?.deliveryOtp && metadata.deliveryOtp) {
          if (String(order.delivery.deliveryOtp).trim() !== String(metadata.deliveryOtp).trim()) {
            throw new Error('Invalid Delivery OTP. Delivery completion denied.');
          }
        }
      }

      // 3. Update Order Delivery Section (Separated from Kitchen Cooking Status & Payment!)
      const orderDeliveryUpdates = {
        'delivery.status': nextStatus,
        updatedAt: now
      };

      if (nextStatus === DELIVERY_STATUSES.PICKED_UP) {
        orderDeliveryUpdates['delivery.pickedUpAt'] = now;
      } else if (nextStatus === DELIVERY_STATUSES.OUT_FOR_DELIVERY) {
        orderDeliveryUpdates['delivery.outForDeliveryAt'] = now;
      } else if (nextStatus === DELIVERY_STATUSES.DELIVERED) {
        orderDeliveryUpdates['delivery.deliveredAt'] = now;
        orderDeliveryUpdates['delivery.deliveryProof'] = {
          verifiedByOtp: Boolean(metadata.deliveryOtp),
          signatureReceived: Boolean(metadata.signature),
          timestamp: now
        };
      } else if (nextStatus === DELIVERY_STATUSES.DELIVERY_FAILED) {
        orderDeliveryUpdates['delivery.failedAt'] = now;
        orderDeliveryUpdates['delivery.failureReason'] = metadata.failureReason || DELIVERY_FAIL_REASONS.CUSTOMER_UNREACHABLE;
      } else if (nextStatus === DELIVERY_STATUSES.RETURNED) {
        orderDeliveryUpdates['delivery.returnedAt'] = now;
      }

      transaction.update(orderRef, orderDeliveryUpdates);

      // 4. Update deliveryTracking document
      const trackingRef = db.doc(`deliveryTracking/${orderId}`);
      transaction.set(trackingRef, {
        status: nextStatus,
        lastUpdatedAt: now
      }, { merge: true });

      // 5. If terminal state (DELIVERED, RETURNED, CANCELLED), free rider capacity
      const assignedRiderId = order.delivery?.riderId;
      if (['DELIVERED', 'RETURNED', 'CANCELLED'].includes(nextStatus) && assignedRiderId) {
        const riderRef = db.doc(`deliveryPartners/${assignedRiderId}`);
        const riderSnap = await transaction.get(riderRef);
        if (riderSnap.exists) {
          const activeOrders = riderSnap.data().currentActiveOrders || [];
          const remainingOrders = activeOrders.filter(id => id !== orderId);
          const maxCapacity = Number(riderSnap.data().maxActiveDeliveries || 1);
          transaction.update(riderRef, {
            currentActiveOrders: remainingOrders,
            isAvailable: remainingOrders.length < maxCapacity,
            totalDeliveries: nextStatus === 'DELIVERED' ? (riderSnap.data().totalDeliveries || 0) + 1 : (riderSnap.data().totalDeliveries || 0),
            updatedAt: now
          });
        }
      }

      // 6. Record Operational Delivery Event
      const eventId = this.generateEventId(orderId, nextStatus, now, actorInfo.uid);
      const eventRef = db.doc(`restaurants/${order.restaurantId}/deliveryEvents/${eventId}`);
      transaction.set(eventRef, {
        eventId,
        orderId,
        restaurantId: order.restaurantId,
        outletId: order.outletId,
        eventType: nextStatus,
        previousStatus: currentDeliveryStatus,
        newStatus: nextStatus,
        riderId: assignedRiderId || null,
        metadata,
        actor: actorInfo,
        timestamp: now
      });

      return {
        success: true,
        orderId,
        previousStatus: currentDeliveryStatus,
        status: nextStatus
      };
    });
  }

  /**
   * Securely updates rider GPS coordinates.
   * Enforces that only the assigned rider can update their own coordinates.
   */
  async updateRiderGps(riderId, orderId, coords, actor = null) {
    const db = getDb();
    const now = new Date().toISOString();

    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
      throw new Error('Valid GPS coordinates { lat, lng } are required.');
    }

    if (coords.lat < -90 || coords.lat > 90 || coords.lng < -180 || coords.lng > 180) {
      throw new Error('Invalid coordinate boundaries.');
    }

    // Actor authorization: actor must be the rider or admin
    if (actor && actor.uid && actor.uid !== riderId && actor.role !== 'super_admin' && actor.role !== 'restaurant_admin') {
      throw new Error(`Unauthorized GPS write: Actor ${actor.uid} cannot update location for Rider ${riderId}.`);
    }

    // Fetch order to verify rider assignment
    if (orderId) {
      const orderSnap = await db.doc(`aggregatorOrders/${orderId}`).get();
      if (orderSnap.exists) {
        const order = orderSnap.data();
        if (order.delivery?.riderId !== riderId) {
          throw new Error(`Rider ${riderId} is not assigned to order ${orderId}. Location update rejected.`);
        }
      }
    }

    const payload = {
      lat: Number(coords.lat.toFixed(6)),
      lng: Number(coords.lng.toFixed(6)),
      heading: Number(coords.heading || 0),
      speedKmH: Number(coords.speedKmH || 0),
      timestamp: Date.now()
    };

    // Update rider document
    await db.doc(`deliveryPartners/${riderId}`).update({
      currentCoordinates: payload,
      updatedAt: now
    });

    // Update live tracking document for order
    if (orderId) {
      await db.doc(`deliveryTracking/${orderId}`).update({
        riderCoordinates: payload,
        lastUpdatedAt: now
      });
    }

    return { success: true, riderId, orderId, coordinates: payload };
  }
}

export const deliveryDispatchService = new DeliveryDispatchService();
