/**
 * Abar Khabo: Central SaaS Entitlement & Usage Enforcement Service
 * 
 * Authoritatively validates restaurant plan entitlements across:
 *  - Maximum allowed outlets (e.g., Starter: 1, Pro: 3, Enterprise: Unlimited).
 *  - Staff account caps.
 *  - Monthly order quotas.
 *  - Module feature gates (inventory, deliveryFleet, aggregatorIntegration, advancedAnalytics).
 * 
 * Grandfathering Policy:
 *  If a plan is downgraded, existing resources are NEVER deleted; existing outlets remain
 *  accessible, but creating NEW outlets or accounts is strictly blocked until upgraded.
 */

import { getDb } from '../config/firebaseAdmin.js';
import { subscriptionService, DEFAULT_PLANS, PLAN_TIERS, SUBSCRIPTION_STATUSES } from './subscriptionService.js';
import logger from '../utils/logger.js';

export const MODULE_NAMES = {
  POS: 'pos',
  KDS: 'kds',
  CASHIER: 'cashier',
  INVENTORY: 'inventory',
  DELIVERY_FLEET: 'deliveryFleet',
  AGGREGATOR_INTEGRATION: 'aggregatorIntegration',
  FINANCIAL_REPORTING: 'financialReporting',
  ADVANCED_ANALYTICS: 'advancedAnalytics'
};

export class EntitlementService {
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
   * Resolves effective entitlements for a restaurant by merging active subscription
   * plan limits with explicit Super Admin overrides.
   */
  async getEffectiveEntitlements(restaurantId) {
    if (!restaurantId) throw new Error('restaurantId is required');

    const sub = await subscriptionService.getSubscription(restaurantId);
    let plan = sub?.planSnapshot;

    if (!plan && sub?.planId) {
      plan = await subscriptionService.getPlan(sub.planId);
    }
    if (!plan) {
      plan = DEFAULT_PLANS[PLAN_TIERS.TRIAL];
    }

    const db = this._getDb();
    let overrides = null;
    try {
      const overrideSnap = await db.doc(`restaurants/${restaurantId}/subscription/overrides`).get();
      if (overrideSnap.exists) {
        overrides = overrideSnap.data();
      }
    } catch (err) {
      // Overrides not present or unreadable, non-blocking
    }

    const isSuspendedOrExpired =
      sub?.status === SUBSCRIPTION_STATUSES.EXPIRED ||
      sub?.status === SUBSCRIPTION_STATUSES.SUSPENDED ||
      sub?.status === SUBSCRIPTION_STATUSES.CANCELLED;

    const baseLimits = plan.limits || DEFAULT_PLANS[PLAN_TIERS.TRIAL].limits;
    const baseModules = plan.modules || DEFAULT_PLANS[PLAN_TIERS.TRIAL].modules;

    const effectiveLimits = {
      maxOutlets: overrides?.limits?.maxOutlets ?? baseLimits.maxOutlets,
      maxStaffAccounts: overrides?.limits?.maxStaffAccounts ?? baseLimits.maxStaffAccounts,
      maxMonthlyOrders: overrides?.limits?.maxMonthlyOrders ?? baseLimits.maxMonthlyOrders,
      maxDeliveryPartners: overrides?.limits?.maxDeliveryPartners ?? baseLimits.maxDeliveryPartners
    };

    const effectiveModules = {
      ...baseModules,
      ...(overrides?.modules || {})
    };

    // If subscription is expired or suspended, restrict to read-only/cashier access
    if (isSuspendedOrExpired) {
      effectiveModules.inventory = false;
      effectiveModules.deliveryFleet = false;
      effectiveModules.aggregatorIntegration = false;
      effectiveModules.advancedAnalytics = false;
    }

    return {
      restaurantId,
      planId: sub?.planId || PLAN_TIERS.TRIAL,
      subscriptionStatus: sub?.status || SUBSCRIPTION_STATUSES.TRIAL,
      isSuspendedOrExpired,
      limits: effectiveLimits,
      modules: effectiveModules,
      hasOverrides: Boolean(overrides)
    };
  }

  /**
   * Validates whether a restaurant is entitled to add another outlet.
   */
  async checkOutletLimit(restaurantId, currentOutletCount = null) {
    const entitlements = await this.getEffectiveEntitlements(restaurantId);
    const maxOutlets = entitlements.limits.maxOutlets;

    if (maxOutlets === -1 || maxOutlets >= 999) {
      return { allowed: true, limit: maxOutlets, maxOutlets: 'Unlimited', currentCount: currentOutletCount || 0 };
    }

    let count = currentOutletCount;
    if (count === null) {
      const db = this._getDb();
      const rootSnap = await db.collection('outlets').where('restaurantId', '==', restaurantId).get();
      if (rootSnap && rootSnap.size > 0) {
        count = rootSnap.size;
      } else {
        const outletsSnap = await db.collection(`restaurants/${restaurantId}/outlets`).get();
        count = outletsSnap ? outletsSnap.size : 0;
      }
    }

    const allowed = count < maxOutlets;
    return {
      allowed,
      limit: maxOutlets,
      maxOutlets,
      currentCount: count,
      message: allowed
        ? `Within plan limit (${count}/${maxOutlets})`
        : `Outlet limit reached (${count}/${maxOutlets}). Upgrade to Professional or Enterprise to add more branches.`
    };
  }

  /**
   * Validates whether a restaurant is entitled to register another staff account.
   */
  async checkStaffLimit(restaurantId, currentStaffCount = null) {
    const entitlements = await this.getEffectiveEntitlements(restaurantId);
    const maxStaff = entitlements.limits.maxStaffAccounts;

    if (maxStaff === -1 || maxStaff >= 999) {
      return { allowed: true, limit: maxStaff, maxStaff: 'Unlimited', currentCount: currentStaffCount || 0 };
    }

    let count = currentStaffCount;
    if (count === null) {
      const db = this._getDb();
      const staffSnap = await db
        .collection('users')
        .where('restaurantId', '==', restaurantId)
        .get();
      count = staffSnap ? staffSnap.size : 0;
    }

    const allowed = count < maxStaff;
    return {
      allowed,
      limit: maxStaff,
      maxStaff,
      currentCount: count,
      message: allowed
        ? `Within staff limit (${count}/${maxStaff})`
        : `Staff account limit reached (${count}/${maxStaff}). Upgrade your subscription to provision additional staff.`
    };
  }

  /**
   * Validates monthly order quota.
   */
  async checkMonthlyOrderLimit(restaurantId, currentMonthOrderCount = 0) {
    const entitlements = await this.getEffectiveEntitlements(restaurantId);
    const maxOrders = entitlements.limits.maxMonthlyOrders;

    if (maxOrders === -1 || maxOrders >= 999999) {
      return { allowed: true, limit: maxOrders, maxOrders: 'Unlimited', currentCount: currentMonthOrderCount };
    }

    const allowed = currentMonthOrderCount < maxOrders;
    return {
      allowed,
      limit: maxOrders,
      maxOrders,
      currentCount: currentMonthOrderCount,
      message: allowed
        ? `Within monthly order quota (${currentMonthOrderCount}/${maxOrders})`
        : `Monthly order limit reached (${currentMonthOrderCount}/${maxOrders}). Upgrade your plan to accept additional online and POS orders.`
    };
  }

  /**
   * Validates whether a restaurant is entitled to access a specific module.
   */
  async checkModuleAccess(restaurantId, moduleName) {
    const entitlements = await this.getEffectiveEntitlements(restaurantId);
    const isAllowed = Boolean(entitlements.modules[moduleName]);

    return {
      allowed: isAllowed,
      module: moduleName,
      planId: entitlements.planId,
      subscriptionStatus: entitlements.subscriptionStatus,
      message: isAllowed
        ? `Module ${moduleName} is enabled on plan ${entitlements.planId}`
        : `Module ${moduleName} requires upgrading from ${entitlements.planId} to Professional or Enterprise.`
    };
  }

  /**
   * Convenience alias for checkModuleAccess.
   */
  async canAccessFeature(restaurantId, featureName) {
    return this.checkModuleAccess(restaurantId, featureName);
  }

  /**
   * Sets explicit Super Admin entitlement overrides.
   */
  async setSuperAdminOverride(restaurantId, overrides, actor = { uid: 'super_admin', name: 'Super Admin' }) {
    const db = this._getDb();
    const now = new Date().toISOString();

    const overridePayload = {
      restaurantId,
      limits: overrides.limits || {},
      modules: overrides.modules || {},
      reason: overrides.reason || 'Super Admin promotional override',
      assignedBy: actor.name || actor.uid || 'Super Admin',
      updatedAt: now
    };

    await db.doc(`restaurants/${restaurantId}/subscription/overrides`).set(overridePayload);

    logger.info('Super Admin entitlement overrides applied', {
      restaurantId,
      assignedBy: actor.uid,
      limits: overridePayload.limits,
      modules: overridePayload.modules
    });

    return overridePayload;
  }
}

export const entitlementService = new EntitlementService();
export default entitlementService;
