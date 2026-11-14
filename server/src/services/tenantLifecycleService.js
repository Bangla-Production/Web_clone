/**
 * Abar Khabo: Restaurant Tenant Lifecycle & Onboarding Management Service
 * 
 * Manages the authoritative lifecycle of multi-tenant restaurant brands:
 *  - Registration (PENDING_APPROVAL)
 *  - Approval & Automatic Default Outlet Provisioning
 *  - Rejection with audited reason
 *  - Activation, Suspension, Reactivation, and Safe Archival
 * 
 * Strict Non-Destructive Invariant:
 *  Suspension or deactivation NEVER deletes historical orders, financial records,
 *  inventory logs, or delivery history.
 */

import { getDb } from '../config/firebaseAdmin.js';
import { subscriptionService, PLAN_TIERS, BILLING_CYCLES } from './subscriptionService.js';
import logger from '../utils/logger.js';

export const TENANT_STATUSES = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED',
  DEACTIVATED: 'DEACTIVATED'
};

export class TenantLifecycleService {
  constructor() {
    this.db = null;
  }

  _getDb() {
    if (!this.db) {
      this.db = getDb();
    }
    return this.db;
  }

  /**
   * Internal audit log generator writing to platformAuditLogs
   */
  async _logAudit(action, restaurantId, details = {}, actor = { uid: 'super_admin', name: 'Super Admin' }) {
    try {
      const db = this._getDb();
      const logId = `AUDIT_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.doc(`platformAuditLogs/${logId}`).set({
        logId,
        action,
        restaurantId,
        details,
        actor: {
          uid: typeof actor === 'object' ? (actor.uid || 'system') : actor,
          name: typeof actor === 'object' ? (actor.name || actor.email || 'Super Admin') : 'Super Admin',
          role: typeof actor === 'object' ? (actor.role || 'super_admin') : 'super_admin'
        },
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      // Non-blocking
    }
  }

  /**
   * Registers a new restaurant tenant in PENDING_APPROVAL state.
   */
  async registerRestaurant(restaurantPayload, actor = { uid: 'guest', name: 'Registrant' }) {
    const {
      name,
      fssaiNumber = null,
      contact = {},
      address = {},
      ownerEmail,
      ownerName,
      cuisine = [],
      requestedPlanId = PLAN_TIERS.TRIAL
    } = restaurantPayload;

    if (!name || !ownerEmail) {
      throw new Error('Restaurant name and owner email are required');
    }

    const db = this._getDb();
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);

    const restaurantId = `${slug}-${Math.floor(100 + Math.random() * 900)}`;
    const now = new Date().toISOString();

    const restaurantDoc = {
      id: restaurantId,
      restaurantId,
      name: name.trim(),
      fssaiNumber,
      status: TENANT_STATUSES.PENDING_APPROVAL,
      contact: {
        phone: contact.phone || '',
        email: ownerEmail.trim().toLowerCase()
      },
      address: {
        street: address.street || '',
        city: address.city || 'Kolkata',
        state: address.state || 'West Bengal',
        zipCode: address.zipCode || '700001'
      },
      owner: {
        name: ownerName || 'Restaurant Owner',
        email: ownerEmail.trim().toLowerCase()
      },
      cuisine: Array.isArray(cuisine) ? cuisine : [cuisine],
      requestedPlanId,
      createdAt: now,
      updatedAt: now
    };

    await db.doc(`restaurants/${restaurantId}`).set(restaurantDoc);

    logger.info('Restaurant registered for platform onboarding approval', {
      restaurantId,
      name,
      ownerEmail
    });

    return {
      success: true,
      restaurantId,
      restaurant: restaurantDoc
    };
  }

  /**
   * Approves a pending restaurant (Super Admin only).
   * Provisions default outlet and assigns initial subscription.
   */
  async approveRestaurant(
    restaurantId,
    approvalOptionsOrActor = {},
    maybeSuperAdmin = 'super_admin'
  ) {
    let options = {};
    let actor = maybeSuperAdmin;
    if (approvalOptionsOrActor && (approvalOptionsOrActor.role || approvalOptionsOrActor.uid || approvalOptionsOrActor.email)) {
      actor = approvalOptionsOrActor;
    } else {
      options = approvalOptionsOrActor || {};
    }

    const actorRole = typeof actor === 'object' ? actor.role : 'super_admin';
    const actorEmail = typeof actor === 'object' ? actor.email : 'altcafe2026@gmail.com';
    const actorUid = typeof actor === 'object' ? (actor.uid || actor.email) : actor;
    if (actorRole !== 'super_admin' && actorEmail !== 'altcafe2026@gmail.com') {
      throw new Error('FORBIDDEN: Only Super Admin can approve restaurant tenants');
    }

    const db = this._getDb();
    const restRef = db.doc(`restaurants/${restaurantId}`);
    const snap = await restRef.get();

    if (!snap.exists) {
      throw new Error(`Restaurant ${restaurantId} not found`);
    }

    const restData = snap.data();
    if (restData.status !== TENANT_STATUSES.PENDING_APPROVAL) {
      return { success: true, idempotent: true, restaurant: restData };
    }

    const now = new Date().toISOString();
    const planId = options.planId || restData.requestedPlanId || PLAN_TIERS.TRIAL;

    // 1. Update restaurant status to ACTIVE
    const updatePayload = {
      status: TENANT_STATUSES.ACTIVE,
      approvedBy: actorUid,
      approvedAt: now,
      updatedAt: now
    };
    await restRef.update(updatePayload);

    // 2. Ensure default outlet exists: ${restaurantId}_main
    const defaultOutletId = `${restaurantId}_main`;
    const defaultOutlet = {
      id: defaultOutletId,
      outletId: defaultOutletId,
      restaurantId,
      outletName: `${restData.name} (Main Branch)`,
      name: `${restData.name} (Main Branch)`,
      isDefaultOutlet: true,
      branchCode: 'MAIN',
      status: 'ACTIVE',
      contact: restData.contact || {},
      address: restData.address || {},
      operatingHours: {
        monday: { open: '10:00', close: '23:00', isOpen: true },
        tuesday: { open: '10:00', close: '23:00', isOpen: true },
        wednesday: { open: '10:00', close: '23:00', isOpen: true },
        thursday: { open: '10:00', close: '23:00', isOpen: true },
        friday: { open: '10:00', close: '23:00', isOpen: true },
        saturday: { open: '10:00', close: '23:00', isOpen: true },
        sunday: { open: '10:00', close: '23:00', isOpen: true }
      },
      createdAt: now,
      updatedAt: now
    };

    await db.doc(`restaurants/${restaurantId}/outlets/${defaultOutletId}`).set(defaultOutlet);
    await db.doc(`outlets/${defaultOutletId}`).set(defaultOutlet);

    // 3. Assign subscription
    const subResult = await subscriptionService.createRestaurantSubscription(
      restaurantId,
      planId,
      options.billingCycle || BILLING_CYCLES.MONTHLY,
      { uid: actorUid, role: 'super_admin', name: 'Super Admin' }
    );

    await this._logAudit('RESTAURANT_APPROVED', restaurantId, { defaultOutletId, planId }, actor);

    logger.info('Restaurant approved and provisioned', {
      restaurantId,
      defaultOutletId,
      planId
    });

    return {
      success: true,
      restaurantId,
      restaurant: { ...restData, ...updatePayload },
      defaultOutlet,
      subscription: subResult.subscription
    };
  }

  /**
   * Rejects a pending restaurant with audited reason (Super Admin only).
   */
  async rejectRestaurant(restaurantId, reason = 'Application criteria not met', superAdminOrActor = 'super_admin') {
    const actor = superAdminOrActor;
    const actorRole = typeof actor === 'object' ? actor.role : 'super_admin';
    const actorEmail = typeof actor === 'object' ? actor.email : 'altcafe2026@gmail.com';
    const actorUid = typeof actor === 'object' ? (actor.uid || actor.email) : actor;
    if (actorRole !== 'super_admin' && actorEmail !== 'altcafe2026@gmail.com') {
      throw new Error('FORBIDDEN: Only Super Admin can reject restaurant tenants');
    }

    const db = this._getDb();
    const restRef = db.doc(`restaurants/${restaurantId}`);
    const snap = await restRef.get();

    if (!snap.exists) {
      throw new Error(`Restaurant ${restaurantId} not found`);
    }

    const now = new Date().toISOString();
    const updatePayload = {
      status: TENANT_STATUSES.REJECTED,
      rejectionReason: reason,
      rejectedBy: actorUid,
      rejectedAt: now,
      updatedAt: now
    };

    await restRef.update(updatePayload);
    await this._logAudit('RESTAURANT_REJECTED', restaurantId, { reason }, actor);

    logger.info('Restaurant registration rejected', { restaurantId, reason, actorUid });
    return { success: true, restaurantId, status: TENANT_STATUSES.REJECTED };
  }

  /**
   * Suspends a restaurant (Super Admin only).
   * Historical data is NEVER deleted.
   */
  async suspendRestaurant(restaurantId, reason = 'Administrative suspension', superAdminOrActor = 'super_admin') {
    const actor = superAdminOrActor;
    const actorRole = typeof actor === 'object' ? actor.role : 'super_admin';
    const actorEmail = typeof actor === 'object' ? actor.email : 'altcafe2026@gmail.com';
    const actorUid = typeof actor === 'object' ? (actor.uid || actor.email) : actor;
    if (actorRole !== 'super_admin' && actorEmail !== 'altcafe2026@gmail.com') {
      throw new Error('FORBIDDEN: Only Super Admin can suspend restaurant tenants');
    }

    const db = this._getDb();
    const restRef = db.doc(`restaurants/${restaurantId}`);
    const snap = await restRef.get();

    if (!snap.exists) {
      throw new Error(`Restaurant ${restaurantId} not found`);
    }

    const restData = snap.data();
    const now = new Date().toISOString();
    const updatePayload = {
      status: TENANT_STATUSES.SUSPENDED,
      suspensionReason: reason,
      suspendedBy: actorUid,
      suspendedAt: now,
      updatedAt: now
    };

    await restRef.update(updatePayload);

    // Also update current subscription status to SUSPENDED
    try {
      await db.doc(`restaurants/${restaurantId}/subscription/current`).update({
        status: 'SUSPENDED',
        updatedAt: now
      });
    } catch (e) {
      // Non-blocking
    }

    await this._logAudit('RESTAURANT_SUSPENDED', restaurantId, { reason }, actor);

    logger.info('Restaurant suspended by Super Admin', { restaurantId, reason, actorUid });
    return {
      success: true,
      restaurantId,
      status: TENANT_STATUSES.SUSPENDED,
      suspensionReason: reason,
      restaurant: { ...restData, ...updatePayload }
    };
  }

  /**
   * Reactivates a suspended restaurant (Super Admin only).
   */
  async reactivateRestaurant(restaurantId, superAdminOrActor = 'super_admin') {
    let actor = superAdminOrActor;
    let note = 'Reactivated by Super Admin';
    if (typeof superAdminOrActor === 'string' && arguments.length >= 3) {
      note = arguments[1];
      actor = arguments[2];
    }

    const actorRole = typeof actor === 'object' ? actor.role : 'super_admin';
    const actorEmail = typeof actor === 'object' ? actor.email : 'altcafe2026@gmail.com';
    const actorUid = typeof actor === 'object' ? (actor.uid || actor.email) : actor;
    if (actorRole !== 'super_admin' && actorEmail !== 'altcafe2026@gmail.com') {
      throw new Error('FORBIDDEN: Only Super Admin can reactivate restaurant tenants');
    }

    const db = this._getDb();
    const restRef = db.doc(`restaurants/${restaurantId}`);
    const snap = await restRef.get();

    if (!snap.exists) {
      throw new Error(`Restaurant ${restaurantId} not found`);
    }

    const restData = snap.data();
    const now = new Date().toISOString();
    const updatePayload = {
      status: TENANT_STATUSES.ACTIVE,
      reactivatedBy: actorUid,
      reactivatedAt: now,
      reactivationNote: note,
      updatedAt: now
    };

    await restRef.update(updatePayload);

    try {
      await db.doc(`restaurants/${restaurantId}/subscription/current`).update({
        status: 'ACTIVE',
        updatedAt: now
      });
    } catch (e) {
      // Non-blocking
    }

    await this._logAudit('RESTAURANT_REACTIVATED', restaurantId, { note }, actor);

    logger.info('Restaurant reactivated by Super Admin', { restaurantId, actorUid });
    return {
      success: true,
      restaurantId,
      status: TENANT_STATUSES.ACTIVE,
      restaurant: { ...restData, ...updatePayload }
    };
  }

  /**
   * Safely deactivates / archives a restaurant without deleting historical records.
   */
  async deactivateRestaurant(restaurantId, reason = 'Tenant closed account', superAdminUid = 'super_admin') {
    const db = this._getDb();
    const restRef = db.doc(`restaurants/${restaurantId}`);
    const snap = await restRef.get();

    if (!snap.exists) {
      throw new Error(`Restaurant ${restaurantId} not found`);
    }

    const now = new Date().toISOString();
    const updatePayload = {
      status: TENANT_STATUSES.DEACTIVATED,
      deactivatedReason: reason,
      deactivatedBy: superAdminUid,
      deactivatedAt: now,
      updatedAt: now
    };

    await restRef.update(updatePayload);
    logger.info('Restaurant deactivated / archived', { restaurantId, reason });
    return { success: true, restaurantId, status: TENANT_STATUSES.DEACTIVATED };
  }
}

export const tenantLifecycleService = new TenantLifecycleService();
export default tenantLifecycleService;
