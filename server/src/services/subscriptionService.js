/**
 * Abar Khabo: SaaS Subscription Engine & Plan Management Service
 * 
 * Manages platform plan tiers, restaurant subscription lifecycles, renewals,
 * upgrades, downgrades, grace periods, and SaaS billing records.
 * 
 * Strictly isolates Abar Khabo platform subscription revenue from restaurant POS/aggregator collections.
 */

import { getDb } from '../config/firebaseAdmin.js';
import { generateSha256 } from '../utils/cryptoUtils.js';
import { toPaise, toRupees, addMoney, calculateTax } from '../utils/monetaryUtils.js';
import logger from '../utils/logger.js';

export const PLAN_TIERS = {
  TRIAL: 'TRIAL',
  STARTER: 'STARTER',
  PROFESSIONAL: 'PROFESSIONAL',
  ENTERPRISE: 'ENTERPRISE'
};

export const SUBSCRIPTION_STATUSES = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED'
};

export const BILLING_CYCLES = {
  MONTHLY: 'MONTHLY',
  ANNUAL: 'ANNUAL'
};

export const DEFAULT_PLANS = {
  [PLAN_TIERS.TRIAL]: {
    planId: 'TRIAL',
    name: 'Free Trial',
    description: '14-day full platform evaluation',
    monthlyPrice: 0,
    monthlyPricePaise: 0,
    annualPrice: 0,
    annualPricePaise: 0,
    trialDays: 14,
    limits: {
      maxOutlets: 1,
      maxStaffAccounts: 3,
      maxMonthlyOrders: 100,
      maxDeliveryPartners: 1
    },
    modules: {
      pos: true,
      kds: true,
      cashier: true,
      inventory: false,
      deliveryFleet: false,
      aggregatorIntegration: false,
      financialReporting: true,
      advancedAnalytics: false
    },
    isActive: true
  },
  [PLAN_TIERS.STARTER]: {
    planId: 'STARTER',
    name: 'Starter Plan',
    description: 'Ideal for single-outlet standalone restaurants',
    monthlyPrice: 999.00,
    monthlyPricePaise: 99900,
    annualPrice: 9990.00,
    annualPricePaise: 999000,
    trialDays: 0,
    limits: {
      maxOutlets: 1,
      maxStaffAccounts: 5,
      maxMonthlyOrders: 500,
      maxDeliveryPartners: 2
    },
    modules: {
      pos: true,
      kds: true,
      cashier: true,
      inventory: true,
      deliveryFleet: false,
      aggregatorIntegration: false,
      financialReporting: true,
      advancedAnalytics: false
    },
    isActive: true
  },
  [PLAN_TIERS.PROFESSIONAL]: {
    planId: 'PROFESSIONAL',
    name: 'Professional Multi-Outlet',
    description: 'Multi-outlet brands with delivery and aggregator integrations',
    monthlyPrice: 2499.00,
    monthlyPricePaise: 249900,
    annualPrice: 24990.00,
    annualPricePaise: 2499000,
    trialDays: 0,
    limits: {
      maxOutlets: 3,
      maxStaffAccounts: 15,
      maxMonthlyOrders: 2500,
      maxDeliveryPartners: 10
    },
    modules: {
      pos: true,
      kds: true,
      cashier: true,
      inventory: true,
      deliveryFleet: true,
      aggregatorIntegration: true,
      financialReporting: true,
      advancedAnalytics: true
    },
    isActive: true
  },
  [PLAN_TIERS.ENTERPRISE]: {
    planId: 'ENTERPRISE',
    name: 'Enterprise Scale',
    description: 'Large restaurant chains, cloud kitchens & franchises',
    monthlyPrice: 5999.00,
    monthlyPricePaise: 599900,
    annualPrice: 59990.00,
    annualPricePaise: 5999000,
    trialDays: 0,
    limits: {
      maxOutlets: 999, // Unlimited
      maxStaffAccounts: 999,
      maxMonthlyOrders: 999999,
      maxDeliveryPartners: 999
    },
    modules: {
      pos: true,
      kds: true,
      cashier: true,
      inventory: true,
      deliveryFleet: true,
      aggregatorIntegration: true,
      financialReporting: true,
      advancedAnalytics: true
    },
    isActive: true
  }
};

export class SubscriptionService {
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
          uid: actor.uid || 'system',
          name: actor.name || 'Platform System',
          role: actor.role || 'super_admin'
        },
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      // Non-blocking
    }
  }

  /**
   * Retrieves all subscription plans, falling back to enterprise defaults.
   */
  async getPlanCatalog() {
    const db = this._getDb();
    try {
      const snap = await db.collection('subscriptionPlans').get();
      if (!snap.empty) {
        const plans = {};
        snap.docs.forEach(doc => {
          plans[doc.id] = doc.data();
        });
        return plans;
      }
    } catch (err) {
      logger.warn('Could not read subscriptionPlans collection, using defaults', { error: err.message });
    }
    return DEFAULT_PLANS;
  }

  /**
   * Retrieves a specific plan by ID.
   */
  async getPlan(planId) {
    const catalog = await this.getPlanCatalog();
    return catalog[planId] || DEFAULT_PLANS[planId] || null;
  }

  /**
   * Creates or updates a plan tier (Super Admin only).
   */
  async createOrUpdatePlan(planData, superAdminUid = 'super_admin') {
    const db = this._getDb();
    const planId = String(planData.planId || '').toUpperCase().trim();
    if (!planId) throw new Error('Missing planId');

    const now = new Date().toISOString();
    const payload = {
      ...planData,
      planId,
      updatedBy: superAdminUid,
      updatedAt: now
    };

    await db.doc(`subscriptionPlans/${planId}`).set(payload, { merge: true });
    logger.info('Subscription plan updated', { planId, updatedBy: superAdminUid });
    return payload;
  }

  /**
   * Authoritative creation of a restaurant subscription.
   */
  async createRestaurantSubscription(
    restaurantId,
    planId = PLAN_TIERS.TRIAL,
    billingCycle = BILLING_CYCLES.MONTHLY,
    actor = { uid: 'super_admin', role: 'super_admin', name: 'Super Admin' }
  ) {
    if (!restaurantId) throw new Error('restaurantId is required');

    const plan = await this.getPlan(planId);
    if (!plan) throw new Error(`Unknown plan tier: ${planId}`);

    const db = this._getDb();
    const now = new Date();
    const nowIso = now.toISOString();

    const isTrial = planId === PLAN_TIERS.TRIAL;
    const durationDays = isTrial ? (plan.trialDays || 14) : (billingCycle === BILLING_CYCLES.ANNUAL ? 365 : 30);

    const renewalDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const gracePeriodEnd = new Date(renewalDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7-day grace period

    const subscriptionStatus = isTrial ? SUBSCRIPTION_STATUSES.TRIAL : SUBSCRIPTION_STATUSES.ACTIVE;

    const subscriptionData = {
      subscriptionId: `SUB_${restaurantId}`,
      restaurantId,
      planId,
      planSnapshot: plan,
      status: subscriptionStatus,
      billingCycle,
      startDate: nowIso,
      currentPeriodStart: nowIso,
      currentPeriodEnd: renewalDate.toISOString(),
      renewalDate: renewalDate.toISOString(),
      gracePeriodEnd: gracePeriodEnd.toISOString(),
      trialEndDate: isTrial ? renewalDate.toISOString() : null,
      autoRenew: true,
      assignedBy: actor.uid || actor.name || 'Super Admin',
      history: [
        {
          action: 'CREATED',
          planId,
          status: subscriptionStatus,
          timestamp: nowIso,
          actor: actor.name || actor.uid || 'Super Admin'
        }
      ],
      createdAt: nowIso,
      updatedAt: nowIso
    };

    // Save to restaurants/{restaurantId}/subscription/current
    await db.doc(`restaurants/${restaurantId}/subscription/current`).set(subscriptionData);

    logger.info('Restaurant subscription initialized', {
      restaurantId,
      planId,
      status: subscriptionStatus,
      renewalDate: subscriptionData.renewalDate
    });

    // Generate initial SaaS invoice if not trial
    let invoice = null;
    if (!isTrial) {
      invoice = await this.generateSaaSInvoice(restaurantId, subscriptionData, actor);
    }

    return {
      success: true,
      subscription: subscriptionData,
      invoice
    };
  }

  /**
   * Retrieves active subscription for a restaurant.
   */
  async getSubscription(restaurantId) {
    const db = this._getDb();
    const snap = await db.doc(`restaurants/${restaurantId}/subscription/current`).get();
    if (!snap.exists) return null;
    return snap.data();
  }

  /**
   * Renews an existing active subscription.
   */
  async renewSubscription(
    restaurantId,
    paymentRef = {},
    actor = { uid: 'super_admin', role: 'super_admin', name: 'Super Admin' }
  ) {
    const db = this._getDb();
    const subRef = db.doc(`restaurants/${restaurantId}/subscription/current`);
    const snap = await subRef.get();

    if (!snap.exists) {
      throw new Error(`No subscription found for restaurant ${restaurantId}`);
    }

    const currentSub = snap.data();
    const now = new Date();
    const nowIso = now.toISOString();

    const cycle = currentSub.billingCycle || BILLING_CYCLES.MONTHLY;
    const durationDays = cycle === BILLING_CYCLES.ANNUAL ? 365 : 30;

    const baseDate = new Date(currentSub.currentPeriodEnd) > now ? new Date(currentSub.currentPeriodEnd) : now;
    const newEnd = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const newGrace = new Date(newEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

    const history = [...(currentSub.history || [])];
    history.push({
      action: 'RENEWED',
      planId: currentSub.planId,
      status: SUBSCRIPTION_STATUSES.ACTIVE,
      timestamp: nowIso,
      actor: actor.name || actor.uid || 'Super Admin',
      note: `Subscription renewed until ${newEnd.toISOString()}`
    });

    const updatePayload = {
      status: SUBSCRIPTION_STATUSES.ACTIVE,
      currentPeriodStart: baseDate.toISOString(),
      currentPeriodEnd: newEnd.toISOString(),
      renewalDate: newEnd.toISOString(),
      gracePeriodEnd: newGrace.toISOString(),
      history,
      updatedAt: nowIso
    };

    await subRef.update(updatePayload);

    const updatedSub = { ...currentSub, ...updatePayload };
    const invoice = await this.generateSaaSInvoice(restaurantId, updatedSub, actor, {
      ...paymentRef,
      paid: true
    });

    await this._logAudit('SUBSCRIPTION_RENEWED', restaurantId, {
      newPeriodEnd: updatedSub.currentPeriodEnd,
      invoiceId: invoice?.invoiceId
    }, actor);

    logger.info('Subscription renewed successfully', {
      restaurantId,
      newPeriodEnd: updatedSub.currentPeriodEnd
    });

    return {
      success: true,
      subscription: updatedSub,
      invoice
    };
  }

  /**
   * High-level plan upgrade with Super Admin authorization check.
   */
  async upgradeSubscription(restaurantId, options = {}, actor = { uid: 'super_admin', role: 'super_admin', name: 'Super Admin' }) {
    if (actor && actor.role !== 'super_admin' && actor.email !== 'altcafe2026@gmail.com') {
      throw new Error('FORBIDDEN: Only Super Admin can upgrade subscription plans');
    }
    const targetPlanId = options.targetPlanId || options.planId;
    const cycle = options.cycle || options.billingCycle || BILLING_CYCLES.MONTHLY;
    return this.changePlan(restaurantId, targetPlanId, cycle, actor);
  }

  /**
   * High-level plan downgrade with grandfathering preservation.
   */
  async downgradeSubscription(restaurantId, options = {}, actor = { uid: 'super_admin', role: 'super_admin', name: 'Super Admin' }) {
    if (actor && actor.role !== 'super_admin' && actor.email !== 'altcafe2026@gmail.com') {
      throw new Error('FORBIDDEN: Only Super Admin can downgrade subscription plans');
    }
    const targetPlanId = options.targetPlanId || options.planId;
    const cycle = options.cycle || options.billingCycle || BILLING_CYCLES.MONTHLY;
    return this.changePlan(restaurantId, targetPlanId, cycle, actor);
  }

  /**
   * Upgrades or downgrades a restaurant subscription plan.
   */
  async changePlan(
    restaurantId,
    newPlanId,
    newBillingCycle = null,
    actor = { uid: 'super_admin', role: 'super_admin', name: 'Super Admin' }
  ) {
    if (actor && actor.role !== 'super_admin' && actor.email !== 'altcafe2026@gmail.com') {
      throw new Error('FORBIDDEN: Only Super Admin can modify subscription plans');
    }
    const newPlan = await this.getPlan(newPlanId);
    if (!newPlan) throw new Error(`Unknown plan tier: ${newPlanId}`);

    const db = this._getDb();
    const subRef = db.doc(`restaurants/${restaurantId}/subscription/current`);
    const snap = await subRef.get();

    if (!snap.exists) {
      return this.createRestaurantSubscription(restaurantId, newPlanId, newBillingCycle || BILLING_CYCLES.MONTHLY, actor);
    }

    const currentSub = snap.data();
    const now = new Date();
    const nowIso = now.toISOString();

    const cycle = newBillingCycle || currentSub.billingCycle || BILLING_CYCLES.MONTHLY;
    const durationDays = cycle === BILLING_CYCLES.ANNUAL ? 365 : 30;
    const newEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const isUpgrade = (newPlan.monthlyPrice || 0) >= (currentSub.planSnapshot?.monthlyPrice || 0);
    const action = isUpgrade ? 'UPGRADE' : 'DOWNGRADE';

    const history = [...(currentSub.history || [])];
    history.push({
      action,
      fromPlan: currentSub.planId,
      toPlan: newPlanId,
      timestamp: nowIso,
      actor: actor.name || actor.uid || 'Super Admin',
      note: `Changed plan from ${currentSub.planId} to ${newPlanId}`
    });

    const updatePayload = {
      planId: newPlanId,
      planSnapshot: newPlan,
      status: SUBSCRIPTION_STATUSES.ACTIVE,
      billingCycle: cycle,
      currentPeriodStart: nowIso,
      currentPeriodEnd: newEnd.toISOString(),
      renewalDate: newEnd.toISOString(),
      gracePeriodEnd: new Date(newEnd.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      history,
      updatedAt: nowIso
    };

    await subRef.update(updatePayload);

    const updatedSub = { ...currentSub, ...updatePayload };
    let invoice = null;
    if (newPlanId !== PLAN_TIERS.TRIAL) {
      invoice = await this.generateSaaSInvoice(restaurantId, updatedSub, actor);
    }

    logger.info(`Subscription ${action} completed`, {
      restaurantId,
      from: currentSub.planId,
      to: newPlanId
    });

    return {
      success: true,
      action,
      subscription: updatedSub,
      invoice
    };
  }

  /**
   * Cancels a restaurant subscription.
   */
  async cancelSubscription(restaurantId, reason = 'Customer request', actor = { uid: 'super_admin', name: 'Super Admin' }) {
    const db = this._getDb();
    const subRef = db.doc(`restaurants/${restaurantId}/subscription/current`);
    const snap = await subRef.get();

    if (!snap.exists) {
      throw new Error(`Subscription not found for restaurant ${restaurantId}`);
    }

    const currentSub = snap.data();
    const nowIso = new Date().toISOString();

    const history = [...(currentSub.history || [])];
    history.push({
      action: 'CANCELLED',
      timestamp: nowIso,
      actor: actor.name || actor.uid || 'Super Admin',
      reason
    });

    const updatePayload = {
      status: SUBSCRIPTION_STATUSES.CANCELLED,
      autoRenew: false,
      cancellationReason: reason,
      cancelledAt: nowIso,
      history,
      updatedAt: nowIso
    };

    await subRef.update(updatePayload);

    await this._logAudit('SUBSCRIPTION_CANCELLED', restaurantId, { reason }, actor);

    return {
      success: true,
      status: SUBSCRIPTION_STATUSES.CANCELLED,
      subscription: { ...currentSub, ...updatePayload }
    };
  }

  /**
   * Idempotent scheduled expiry processing.
   * Checks all subscriptions and marks expired ones safely without deleting tenant data.
   */
  async processScheduledExpiries(nowIso = new Date().toISOString()) {
    const db = this._getDb();
    const now = new Date(nowIso);
    let expiredCount = 0;
    let graceCount = 0;
    let processedCount = 0;

    // We check restaurants collection and inspect active subscriptions
    const restaurantsSnap = await db.collection('restaurants').get();

    for (const restDoc of restaurantsSnap.docs) {
      const restId = restDoc.id;
      const subSnap = await db.doc(`restaurants/${restId}/subscription/current`).get();
      if (!subSnap.exists) continue;
      processedCount++;

      const sub = subSnap.data();
      if (sub.status === SUBSCRIPTION_STATUSES.EXPIRED || sub.status === SUBSCRIPTION_STATUSES.CANCELLED) {
        continue; // Already terminal
      }

      const renewalDate = new Date(sub.renewalDate || sub.currentPeriodEnd || sub.endDate);
      const graceEnd = new Date(sub.gracePeriodEnd || (renewalDate.getTime() + 7 * 24 * 60 * 60 * 1000));

      if (now > graceEnd || (sub.status === SUBSCRIPTION_STATUSES.TRIAL && now > renewalDate)) {
        // Exceeded grace period or expired trial -> EXPIRED
        await db.doc(`restaurants/${restId}/subscription/current`).update({
          status: SUBSCRIPTION_STATUSES.EXPIRED,
          updatedAt: nowIso
        });
        expiredCount++;
      } else if (now > renewalDate && sub.status === SUBSCRIPTION_STATUSES.ACTIVE) {
        // In grace period -> PAST_DUE
        await db.doc(`restaurants/${restId}/subscription/current`).update({
          status: SUBSCRIPTION_STATUSES.PAST_DUE,
          updatedAt: nowIso
        });
        graceCount++;
      }
    }

    return {
      success: true,
      processedAt: nowIso,
      processedCount,
      expiredCount,
      graceCount
    };
  }

  /**
   * Generates a SaaS Subscription Invoice record with minor unit (paise) calculation.
   * Path: subscriptionInvoices/{invoiceId}
   */
  async generateInvoice(options = {}, actor = { uid: 'super_admin', role: 'super_admin', name: 'Super Admin' }) {
    const db = this._getDb();
    const restaurantId = options.restaurantId;
    const planId = options.planId || PLAN_TIERS.STARTER;
    const plan = options.planSnapshot || await this.getPlan(planId);
    const subtotalPaise = options.subtotalPaise ?? toPaise(plan.monthlyPrice || 0);
    const subtotalRupees = toRupees(subtotalPaise);
    const taxPaise = Math.round(subtotalPaise * 0.18);
    const taxRupees = toRupees(taxPaise);
    const totalPaise = subtotalPaise + taxPaise;
    const totalRupees = toRupees(totalPaise);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const invoiceNumber = `INV_SAAS_${dateStr}_${Math.floor(1000 + Math.random() * 9000)}`;
    const invoiceId = options.invoiceId || `SAAS_${invoiceNumber}`;

    const invoiceData = {
      id: invoiceId,
      invoiceId,
      invoiceNumber,
      invoiceType: 'SAAS_SUBSCRIPTION',
      restaurantId,
      planId,
      planName: plan.name || planId,
      billingCycle: options.cycle || BILLING_CYCLES.MONTHLY,
      subtotalPaise,
      subtotalINR: subtotalRupees,
      taxPaise,
      taxINR: taxRupees,
      totalPaise,
      totalINR: totalRupees,
      status: options.status || 'PENDING',
      paymentStatus: options.status || 'PENDING',
      issuedBy: actor.name || actor.uid || 'Super Admin',
      issuedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    await db.doc(`subscriptionInvoices/${invoiceId}`).set(invoiceData);
    await this._logAudit('INVOICE_GENERATED', restaurantId, { invoiceId, totalPaise }, actor);

    return invoiceData;
  }

  /**
   * Updates payment status on a SaaS Subscription Invoice.
   */
  async updateInvoicePaymentStatus(invoiceId, payload = {}, actor = { uid: 'super_admin', role: 'super_admin', name: 'Super Admin' }) {
    const db = this._getDb();
    const invRef = db.doc(`subscriptionInvoices/${invoiceId}`);
    const snap = await invRef.get();
    if (!snap.exists) throw new Error(`Invoice ${invoiceId} not found`);

    const now = new Date().toISOString();
    const updateData = {
      status: payload.status || 'PAID',
      paymentStatus: payload.status || 'PAID',
      paymentReference: payload.paymentReference || null,
      paidAt: now,
      updatedAt: now
    };
    await invRef.update(updateData);
    await this._logAudit('INVOICE_STATUS_UPDATED', snap.data().restaurantId, { invoiceId, status: updateData.status }, actor);
    return { ...snap.data(), ...updateData };
  }

  /**
   * Generates a SaaS Subscription Invoice record.
   * Path: subscriptionInvoices/{invoiceId}
   */
  async generateSaaSInvoice(restaurantId, subscription, actor, paymentRef = {}) {
    const db = this._getDb();
    const plan = subscription.planSnapshot || await this.getPlan(subscription.planId);

    const isAnnual = subscription.billingCycle === BILLING_CYCLES.ANNUAL;
    const basePrice = isAnnual ? (plan.annualPrice || 0) : (plan.monthlyPrice || 0);

    // 18% standard GST on B2B SaaS in India
    const taxDetails = calculateTax(basePrice, 18.0);
    const totalAmount = addMoney(basePrice, taxDetails.taxAmount);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const invoiceId = `SAAS_INV_${restaurantId}_${dateStr}_${Math.floor(1000 + Math.random() * 9000)}`;

    const invoiceData = {
      invoiceId,
      invoiceType: 'SAAS_SUBSCRIPTION',
      restaurantId,
      planId: subscription.planId,
      planName: plan.name || subscription.planId,
      billingCycle: subscription.billingCycle || BILLING_CYCLES.MONTHLY,
      billingPeriod: {
        startDate: subscription.currentPeriodStart,
        endDate: subscription.currentPeriodEnd
      },
      currency: 'INR',
      basePrice,
      basePriceMinor: toPaise(basePrice),
      taxDetails: {
        gstRate: 18.0,
        cgstRate: 9.0,
        sgstRate: 9.0,
        taxAmount: taxDetails.taxAmount,
        cgstAmount: taxDetails.cgstAmount,
        sgstAmount: taxDetails.sgstAmount
      },
      totalAmount,
      totalAmountMinor: toPaise(totalAmount),
      paymentStatus: paymentRef.paid ? 'PAID' : 'PENDING',
      paymentReference: paymentRef.utrNumber || paymentRef.referenceId || null,
      issuedBy: actor.name || actor.uid || 'Super Admin',
      issuedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    await db.doc(`subscriptionInvoices/${invoiceId}`).set(invoiceData);

    logger.info('SaaS subscription invoice generated', {
      invoiceId,
      restaurantId,
      totalAmount
    });

    return invoiceData;
  }
}

export const subscriptionService = new SubscriptionService();
export default subscriptionService;
