/**
 * Abar Khabo: Enterprise Multi-Tenant SaaS
 * Staff Identity & Outlet Authorization Service
 * 
 * Manages UID-based staff identity under users/{uid} with 100% backward compatibility
 * for legacy email-keyed profiles under users/{email}.
 * 
 * Enforces explicit outlet-level authorization:
 * - Tenant isolation (staff only access own restaurantId)
 * - allOutlets: true allows brand-wide outlet access
 * - allOutlets: false restricts access strictly to assignedOutletIds
 * - Empty or missing assignedOutletIds NEVER grants universal access
 */

import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from '../firebase/config.js';
import { getDefaultOutletId } from './outletService.js';

// Recognized platform roles
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner',
  RESTAURANT_ADMIN: 'restaurant_admin',
  OUTLET_MANAGER: 'outlet_manager',
  CASHIER: 'cashier',
  KITCHEN: 'kitchen',
  WAITER: 'waiter',
  DELIVERY_PARTNER: 'delivery_partner',
  CUSTOMER: 'customer'
};

// Roles permitted to have brand-wide (all outlets) authority within their tenant
export const BRAND_ADMIN_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.OWNER,
  ROLES.RESTAURANT_ADMIN
];

/**
 * Validates whether a user profile is authorized to access a specific outlet.
 * 
 * @param {Object} userProfile 
 * @param {string} targetOutletId 
 * @returns {boolean}
 */
export function canAccessOutlet(userProfile, targetOutletId) {
  if (!userProfile || !targetOutletId) return false;
  
  // Super admin has global platform authority
  if (userProfile.role === ROLES.SUPER_ADMIN) return true;

  // Active status required
  if (userProfile.status === 'suspended' || userProfile.status === 'inactive') {
    return false;
  }

  // Brand-level administrators with explicit allOutlets flag
  if (userProfile.allOutlets === true) {
    return true;
  }

  // Explicit outlet assignment check
  if (Array.isArray(userProfile.assignedOutletIds) && userProfile.assignedOutletIds.length > 0) {
    return userProfile.assignedOutletIds.includes(targetOutletId);
  }

  // Missing or empty assignedOutletIds with allOutlets != true strictly DENIES access
  return false;
}

/**
 * Validates outlet selection for a user and provides a fallback authorized outlet if denied.
 * 
 * @param {Object} userProfile 
 * @param {string} targetOutletId 
 * @returns {{ allowed: boolean, reason?: string, fallbackOutletId?: string }}
 */
export function validateOutletSelection(userProfile, targetOutletId) {
  if (!userProfile) {
    return { allowed: false, reason: 'No active user session' };
  }

  if (canAccessOutlet(userProfile, targetOutletId)) {
    return { allowed: true };
  }

  // Determine fallback outlet
  let fallbackOutletId = null;
  if (Array.isArray(userProfile.assignedOutletIds) && userProfile.assignedOutletIds.length > 0) {
    fallbackOutletId = userProfile.assignedOutletIds[0];
  } else if (userProfile.allOutlets === true && userProfile.restaurantId) {
    fallbackOutletId = getDefaultOutletId(userProfile.restaurantId);
  }

  return {
    allowed: false,
    reason: `Access denied: Staff account (${userProfile.email || userProfile.uid}) is not authorized for outlet "${targetOutletId}".`,
    fallbackOutletId
  };
}

/**
 * Normalizes a staff profile ensuring standard schema integrity.
 * 
 * @param {Object} rawProfile 
 * @param {string} uid 
 * @returns {Object}
 */
export function normalizeStaffProfile(rawProfile = {}, uid) {
  const isBrandAdmin = BRAND_ADMIN_ROLES.includes(rawProfile.role);
  const defaultOutlet = rawProfile.restaurantId ? getDefaultOutletId(rawProfile.restaurantId) : '';
  
  // Explicit allOutlets boolean (never default to true for branch staff)
  const allOutlets = typeof rawProfile.allOutlets === 'boolean'
    ? rawProfile.allOutlets
    : isBrandAdmin;

  // Assigned outlets list
  let assignedOutlets = [];
  if (Array.isArray(rawProfile.assignedOutletIds)) {
    assignedOutlets = rawProfile.assignedOutletIds.filter(Boolean);
  } else if (defaultOutlet && !allOutlets) {
    assignedOutlets = [defaultOutlet];
  }

  return {
    uid,
    email: (rawProfile.email || '').toLowerCase().trim(),
    displayName: rawProfile.displayName || rawProfile.name || 'Staff Member',
    name: rawProfile.name || rawProfile.displayName || 'Staff Member',
    phone: rawProfile.phone || '',
    staffIdCode: rawProfile.staffIdCode || '',
    authMethod: rawProfile.authMethod || 'email',
    restaurantId: rawProfile.restaurantId || '',
    restaurantName: rawProfile.restaurantName || '',
    role: rawProfile.role || ROLES.WAITER,
    assignedOutletIds: assignedOutlets,
    allOutlets,
    status: rawProfile.status || 'active',
    emailVerified: Boolean(rawProfile.emailVerified),
    createdAt: rawProfile.createdAt || null,
    updatedAt: rawProfile.updatedAt || null
  };
}

/**
 * Resolves user profile by Firebase Authentication UID with dual-lookup backward compatibility:
 * 1. Checks users/{uid} (Primary UID-based document)
 * 2. If not found, checks users/{email} (Legacy document)
 * 3. If found at users/{email}, lazy-migrates to users/{uid} non-destructively and leaves a reference
 * 
 * @param {Object} fbUser - Firebase Auth currentUser object
 * @returns {Promise<{ ok: boolean, user?: Object, pending?: boolean, error?: string }>}
 */
export async function resolveStaffProfile(fbUser) {
  if (!fbUser || !fbUser.uid) {
    return { ok: false, error: 'Unauthenticated Firebase user' };
  }

  const email = (fbUser.email || '').toLowerCase().trim();
  const uid = fbUser.uid;

  // 1. Primary lookup: users/{uid}
  const uidRef = doc(db, 'users', uid);
  try {
    const uidSnap = await getDoc(uidRef);
    if (uidSnap.exists()) {
      const data = uidSnap.data();
      const normalized = normalizeStaffProfile({ ...data, email: data.email || email }, uid);

      // Status checks
      if (normalized.status === 'suspended' || normalized.status === 'inactive') {
        return { ok: false, error: 'Your account has been suspended.' };
      }

      // Check tenant suspension
      if (normalized.restaurantId) {
        try {
          const restSnap = await getDoc(doc(db, 'restaurants', normalized.restaurantId));
          if (restSnap.exists() && restSnap.data().status === 'suspended') {
            return { ok: false, error: 'This restaurant has been suspended by the platform owner.' };
          }
        } catch (e) { /* non-blocking */ }
      }

      return {
        ok: true,
        user: {
          ...normalized,
          canAccessOutlet: (outletId) => canAccessOutlet(normalized, outletId)
        }
      };
    }
  } catch (err) {
    console.warn(`users/${uid} lookup error:`, err);
  }

  // 2. Legacy fallback lookup: users/{email}
  if (email) {
    const emailRef = doc(db, 'users', email);
    try {
      const emailSnap = await getDoc(emailRef);
      if (emailSnap.exists()) {
        const legacyData = emailSnap.data();

        // Status checks
        if (legacyData.status === 'suspended' || legacyData.status === 'inactive') {
          return { ok: false, error: 'Your account has been suspended.' };
        }

        // Check pending activation
        if (legacyData.status === 'pending') {
          if (!fbUser.emailVerified) {
            return {
              ok: false,
              pending: true,
              email,
              error: 'Your email is not confirmed yet, so this account is still Pending. Please click the confirmation link in your email.'
            };
          }
        }

        // Check restaurant suspension
        if (legacyData.restaurantId) {
          try {
            const restSnap = await getDoc(doc(db, 'restaurants', legacyData.restaurantId));
            if (restSnap.exists() && restSnap.data().status === 'suspended') {
              return { ok: false, error: 'This restaurant has been suspended by the platform owner.' };
            }
          } catch (e) { /* non-blocking */ }
        }

        // 3. Lazy migration to users/{uid}
        const normalized = normalizeStaffProfile({
          ...legacyData,
          email,
          status: legacyData.status === 'pending' && fbUser.emailVerified ? 'active' : legacyData.status,
          emailVerified: fbUser.emailVerified || Boolean(legacyData.emailVerified)
        }, uid);

        const uidPayload = {
          ...normalized,
          migrationStatus: 'MIGRATED_FROM_EMAIL',
          migratedFrom: email,
          migratedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        try {
          // Persist UID document
          await setDoc(uidRef, uidPayload, { merge: true });

          // Update legacy document with forward pointer without deleting it
          await updateDoc(emailRef, {
            uid,
            migratedToUid: true,
            status: normalized.status,
            emailVerified: normalized.emailVerified,
            updatedAt: serverTimestamp()
          });
        } catch (migErr) {
          console.warn('Lazy migration persistence warning (proceeding with in-memory profile):', migErr);
        }

        return {
          ok: true,
          user: {
            ...normalized,
            canAccessOutlet: (outletId) => canAccessOutlet(normalized, outletId)
          }
        };
      }
    } catch (err) {
      return { ok: false, error: `Could not load your account: ${err.message}` };
    }
  }

  return {
    ok: false,
    error: 'This account has been removed or was never provisioned. Please contact your administrator.'
  };
}
