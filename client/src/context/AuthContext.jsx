import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useToast } from './ToastContext';
import {
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from '../firebase/config';
import { friendlyAuthError } from '../services/authAccountService';

const AuthContext = createContext(null);

// The platform owner. Create this login once in Firebase Console →
// Authentication → Users → Add user. Firestore rules use the same email.
export const SUPER_ADMIN_EMAIL = 'altcafe2026@gmail.com';

const USER_CACHE_KEY = 'restopulse_firebase_user';

/**
 * Turns a signed-in Firebase user into an app user (profile from Firestore) or
 * a rejection reason. Never leaves a half-logged-in session behind: the caller
 * signs out on rejection.
 */
async function resolveProfile(fbUser) {
  const email = (fbUser.email || '').toLowerCase();

  // ---- Platform owner ----
  if (email === SUPER_ADMIN_EMAIL) {
    const ref = doc(db, 'users', email);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          name: 'Super Admin',
          email,
          username: email,
          role: 'super_admin',
          status: 'active',
          restaurantId: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.warn('Super admin profile sync:', e);
    }
    return {
      ok: true,
      user: { uid: fbUser.uid, email, username: email, name: 'Super Admin', role: 'super_admin', restaurantId: '' }
    };
  }

  // ---- Everyone else needs a profile created by an admin ----
  const ref = doc(db, 'users', email);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (e) {
    return { ok: false, error: `Could not load your account: ${e.message}` };
  }
  if (!snap.exists()) {
    return { ok: false, error: 'This account has been removed or was never provisioned. Please contact your administrator.' };
  }
  const profile = snap.data();

  if (profile.status === 'suspended' || profile.status === 'inactive') {
    return { ok: false, error: 'Your account has been suspended.' };
  }

  // Email confirmation gate
  if (profile.status === 'pending') {
    // Refresh the token so email_verified is up to date, then activate.
    try {
      await fbUser.reload();
      await fbUser.getIdToken(true);
    } catch (e) { /* ignore */ }

    if (!auth.currentUser?.emailVerified) {
      return {
        ok: false,
        pending: true,
        email,
        error:
          'Your email is not confirmed yet, so this account is still Pending. Open the confirmation email we sent you and click the link (check your Spam / Junk folder too), then log in again.'
      };
    }
    try {
      await updateDoc(ref, { status: 'active', emailVerified: true, updatedAt: serverTimestamp() });
      profile.status = 'active';
    } catch (e) {
      return { ok: false, error: `Could not activate your account: ${e.message}` };
    }
  }

  // A suspended restaurant blocks its admin and all of its staff.
  if (profile.restaurantId) {
    try {
      const rest = await getDoc(doc(db, 'restaurants', profile.restaurantId));
      if (rest.exists() && rest.data().status === 'suspended') {
        return { ok: false, error: 'This restaurant has been suspended by the platform owner.' };
      }
    } catch (e) { /* non-blocking */ }
  }

  return {
    ok: true,
    user: {
      uid: fbUser.uid,
      email: profile.email || email,
      username: profile.username || email,
      name: profile.name || 'Staff Member',
      role: profile.role || 'waiter',
      restaurantId: profile.restaurantId || '',
      restaurantName: profile.restaurantName || ''
    }
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [activeRestaurantId, setActiveRestaurantId] = useState(
    localStorage.getItem('restopulse_active_rest_id') || 'spice-haven'
  );
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const loginInFlight = useRef(false);

  const applyUser = (userObj) => {
    setUser(userObj);
    if (userObj) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(userObj));
      if (userObj.restaurantId) {
        localStorage.setItem('restopulse_active_rest_id', userObj.restaurantId);
        setActiveRestaurantId(userObj.restaurantId);
      }
    } else {
      localStorage.removeItem(USER_CACHE_KEY);
    }
  };

  // Restore the session on page load (Firebase keeps the login).
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (loginInFlight.current) return; // login() is handling this itself
      if (!fbUser) {
        applyUser(null);
        setLoading(false);
        return;
      }
      const result = await resolveProfile(fbUser);
      if (result.ok) {
        applyUser(result.user);
      } else {
        await signOut(auth);
        applyUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (identifier, password) => {
    if (!identifier || !password) {
      const errMsg = 'Please provide both email and password.';
      toast.error(errMsg);
      return { success: false, error: errMsg };
    }

    const email = identifier.toLowerCase().trim();
    loginInFlight.current = true;
    try {
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        const errMsg = friendlyAuthError(err);
        toast.error(errMsg);
        return { success: false, error: errMsg };
      }

      const result = await resolveProfile(cred.user);
      if (!result.ok) {
        await signOut(auth);
        applyUser(null);
        if (result.pending) {
          toast.warning('Email not confirmed yet — account is still pending.');
        } else {
          toast.error(result.error);
        }
        return {
          success: false,
          error: result.error,
          pending: !!result.pending,
          pendingEmail: result.email
        };
      }

      applyUser(result.user);
      toast.success(
        result.user.role === 'super_admin'
          ? 'Super Admin authenticated. Welcome to Platform Management.'
          : `Welcome, ${result.user.name}! Authenticated as ${result.user.role}.`
      );
      return { success: true, user: result.user, role: result.user.role };
    } finally {
      loginInFlight.current = false;
    }
  };

  const logout = async () => {
    try { await signOut(auth); } catch (e) { /* ignore */ }
    applyUser(null);
    toast.info('Signed out.');
  };

  const selectActiveRestaurant = (restId) => {
    setActiveRestaurantId(restId);
    localStorage.setItem('restopulse_active_rest_id', restId);
  };

  const isSuperAdmin = user?.role === 'super_admin';
  const isRestaurantAdmin = user?.role === 'restaurant_admin' || isSuperAdmin;
  const isCashier = user?.role === 'cashier' || isRestaurantAdmin;
  const isWaiter = user?.role === 'waiter' || user?.role === 'staff' || isRestaurantAdmin;
  const isKitchen = user?.role === 'kitchen' || isRestaurantAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        activeRestaurantId,
        selectActiveRestaurant,
        isAuthenticated: !!user,
        isSuperAdmin,
        isRestaurantAdmin,
        isAdmin: isRestaurantAdmin,
        isCashier,
        isWaiter,
        isKitchen,
        isStaff: isWaiter || isCashier
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
