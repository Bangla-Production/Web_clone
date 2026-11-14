/**
 * Abar Khabo: Frontend Super Admin Client Service
 * 
 * Provides client-side helpers to communicate with backend Super Admin,
 * subscription management, and platform analytics services.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import { db } from '../firebase/config';

export const SUPER_ADMIN_EMAIL = 'altcafe2026@gmail.com';

/**
 * Fetches all platform restaurants.
 */
export async function getPlatformRestaurants() {
  const colRef = collection(db, 'restaurants');
  const snap = await getDocs(colRef);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribes to real-time platform restaurants.
 */
export function subscribePlatformRestaurants(callback) {
  const colRef = collection(db, 'restaurants');
  return onSnapshot(
    colRef,
    (snap) => {
      const rests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(rests);
    },
    (err) => {
      console.error('Error subscribing to platform restaurants:', err);
      callback([]);
    }
  );
}

/**
 * Fetches restaurant subscription details.
 */
export async function getRestaurantSubscription(restaurantId) {
  if (!restaurantId) return null;
  const docRef = doc(db, 'restaurants', restaurantId, 'subscription', 'current');
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return snap.data();
}

/**
 * Fetches standard plan catalog.
 */
export async function getSubscriptionPlans() {
  const colRef = collection(db, 'subscriptionPlans');
  const snap = await getDocs(colRef);
  if (snap.empty) {
    return [
      {
        planId: 'TRIAL',
        name: 'Free Trial',
        monthlyPrice: 0,
        limits: { maxOutlets: 1, maxStaffAccounts: 3, maxMonthlyOrders: 100 }
      },
      {
        planId: 'STARTER',
        name: 'Starter Plan',
        monthlyPrice: 999,
        limits: { maxOutlets: 1, maxStaffAccounts: 5, maxMonthlyOrders: 500 }
      },
      {
        planId: 'PROFESSIONAL',
        name: 'Professional Multi-Outlet',
        monthlyPrice: 2499,
        limits: { maxOutlets: 3, maxStaffAccounts: 15, maxMonthlyOrders: 2500 }
      },
      {
        planId: 'ENTERPRISE',
        name: 'Enterprise Scale',
        monthlyPrice: 5999,
        limits: { maxOutlets: -1, maxStaffAccounts: -1, maxMonthlyOrders: -1 }
      }
    ];
  }
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Fetches SaaS subscription invoices.
 */
export async function getSubscriptionInvoices(restaurantId = null) {
  const colRef = collection(db, 'subscriptionInvoices');
  let q = colRef;
  if (restaurantId) {
    q = query(colRef, where('restaurantId', '==', restaurantId));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Fetches platform audit logs.
 */
export async function getPlatformAuditLogs() {
  const colRef = collection(db, 'platformAuditLogs');
  const snap = await getDocs(colRef);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Fetches all outlets across all restaurants.
 */
export async function getAllPlatformOutlets(restaurants = []) {
  const allOutlets = [];
  for (const r of restaurants) {
    try {
      const colRef = collection(db, 'restaurants', r.id, 'outlets');
      const snap = await getDocs(colRef);
      snap.docs.forEach(doc => {
        allOutlets.push({
          id: doc.id,
          restaurantId: r.id,
          restaurantName: r.name || r.id,
          ...doc.data()
        });
      });
    } catch (e) {
      // Non-blocking
    }
  }
  return allOutlets;
}

/**
 * Approves a restaurant tenant.
 */
export async function approveRestaurantTenant(restaurantId) {
  const restRef = doc(db, 'restaurants', restaurantId);
  await updateDoc(restRef, {
    status: 'ACTIVE',
    approvedAt: new Date().toISOString()
  });
  return true;
}

/**
 * Suspends a restaurant tenant.
 */
export async function suspendRestaurantTenant(restaurantId, reason = 'Administrative suspension') {
  const restRef = doc(db, 'restaurants', restaurantId);
  await updateDoc(restRef, {
    status: 'SUSPENDED',
    suspensionReason: reason,
    suspendedAt: new Date().toISOString()
  });
  return true;
}

/**
 * Reactivates a suspended restaurant tenant.
 */
export async function reactivateRestaurantTenant(restaurantId) {
  const restRef = doc(db, 'restaurants', restaurantId);
  await updateDoc(restRef, {
    status: 'ACTIVE',
    reactivatedAt: new Date().toISOString()
  });
  return true;
}

/**
 * Updates a restaurant subscription plan.
 */
export async function updateRestaurantSubscriptionPlan(restaurantId, planId, billingCycle = 'MONTHLY') {
  const subRef = doc(db, 'restaurants', restaurantId, 'subscription', 'current');
  const now = new Date();
  const durationDays = billingCycle === 'ANNUAL' ? 365 : 30;
  const renewalDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  const payload = {
    planId,
    status: 'ACTIVE',
    billingCycle,
    renewalDate: renewalDate.toISOString(),
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: renewalDate.toISOString(),
    updatedAt: now.toISOString()
  };

  await setDoc(subRef, payload, { merge: true });
  return payload;
}

