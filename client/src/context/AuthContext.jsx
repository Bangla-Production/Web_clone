import React, { createContext, useContext, useState, useEffect } from 'react';
import { useToast } from './ToastContext';
import { authenticateUserFromFirestore } from '../services/firestoreService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [activeRestaurantId, setActiveRestaurantId] = useState('spice-haven');
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    const savedUser = localStorage.getItem('restopulse_firebase_user');
    const savedRestId = localStorage.getItem('restopulse_active_rest_id');

    if (savedRestId) {
      setActiveRestaurantId(savedRestId);
    }

    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        if (parsed.restaurantId) {
          setActiveRestaurantId(parsed.restaurantId);
        }
      } catch (e) {
        logout();
      }
    }
    setLoading(false);
  }, []);

  const login = async (identifier, password) => {
    if (!identifier || !password) {
      const errMsg = 'Please provide both username/email and password.';
      toast.error(errMsg);
      return { success: false, error: errMsg };
    }

    const cleanId = identifier.toLowerCase().trim();

    // 1. MASTER SUPER ADMIN AUTHENTICATION (Master Platform Owner)
    if (cleanId === 'altcafe2026@gmail.com' || cleanId === 'altcafe' || cleanId === 'altcafe2026') {
      if (password !== 'Alt1234$') {
        const errMsg = 'Incorrect password for Super Admin account. Access Denied.';
        toast.error(errMsg);
        return { success: false, error: errMsg };
      }

      const superUser = {
        uid: 'superadmin-master-id',
        email: 'altcafe2026@gmail.com',
        username: 'altcafe2026',
        name: 'Super Admin (AltCafe Owner)',
        role: 'super_admin',
        restaurantId: 'spice-haven'
      };

      localStorage.setItem('restopulse_firebase_user', JSON.stringify(superUser));
      localStorage.setItem('restopulse_active_rest_id', 'spice-haven');
      setUser(superUser);
      setActiveRestaurantId('spice-haven');
      toast.success('Super Admin Authenticated. Welcome to Platform Management.');
      return { success: true, user: superUser, role: 'super_admin' };
    }

    // 2. CHECK SUPER-ADMIN PROVISIONED USERS (Restaurant Admins, Waiters, Kitchen, Cashiers)
    try {
      const firestoreUser = await authenticateUserFromFirestore(cleanId, password);
      if (firestoreUser) {
        if (firestoreUser.error) {
          toast.error(firestoreUser.error);
          return { success: false, error: firestoreUser.error };
        }

        const userObj = {
          uid: firestoreUser.id,
          email: firestoreUser.email,
          username: firestoreUser.username || firestoreUser.email,
          name: firestoreUser.name || 'Staff Member',
          role: firestoreUser.role || 'waiter',
          restaurantId: firestoreUser.restaurantId || 'spice-haven',
          restaurantName: firestoreUser.restaurantName
        };

        localStorage.setItem('restopulse_firebase_user', JSON.stringify(userObj));
        if (userObj.restaurantId) {
          localStorage.setItem('restopulse_active_rest_id', userObj.restaurantId);
          setActiveRestaurantId(userObj.restaurantId);
        }
        setUser(userObj);
        toast.success(`Welcome, ${userObj.name}! Authenticated as ${userObj.role}.`);
        return { success: true, user: userObj, role: userObj.role };
      }
    } catch (err) {
      console.warn('Firestore user lookup error:', err);
    }

    // 3. BUILT-IN DEMO STAFF FALLBACKS (FOR CONVENIENT TESTING)
    // Waiter / Captain
    if (cleanId === 'waiter@restopulse.com' || cleanId === 'waiter') {
      if (password !== 'password123' && password !== 'Alt1234$') {
        const errMsg = 'Incorrect password for Waiter account.';
        toast.error(errMsg);
        return { success: false, error: errMsg };
      }

      const waiterUser = {
        uid: 'waiter-spice-haven-id',
        email: 'waiter@restopulse.com',
        name: 'Rahul Sen (Waiter)',
        role: 'waiter',
        restaurantId: 'spice-haven'
      };
      localStorage.setItem('restopulse_firebase_user', JSON.stringify(waiterUser));
      localStorage.setItem('restopulse_active_rest_id', 'spice-haven');
      setUser(waiterUser);
      setActiveRestaurantId('spice-haven');
      toast.success('Logged in as Waiter.');
      return { success: true, user: waiterUser, role: 'waiter' };
    }

    // Cashier
    if (cleanId === 'cashier@restopulse.com' || cleanId === 'cashier') {
      if (password !== 'password123' && password !== 'Alt1234$') {
        const errMsg = 'Incorrect password for Cashier account.';
        toast.error(errMsg);
        return { success: false, error: errMsg };
      }

      const cashierUser = {
        uid: 'cashier-spice-haven-id',
        email: 'cashier@restopulse.com',
        name: 'Anita Roy (Cashier)',
        role: 'cashier',
        restaurantId: 'spice-haven'
      };
      localStorage.setItem('restopulse_firebase_user', JSON.stringify(cashierUser));
      localStorage.setItem('restopulse_active_rest_id', 'spice-haven');
      setUser(cashierUser);
      setActiveRestaurantId('spice-haven');
      toast.success('Logged in as Cashier.');
      return { success: true, user: cashierUser, role: 'cashier' };
    }

    // Kitchen KDS
    if (cleanId === 'kitchen@restopulse.com' || cleanId === 'kitchen') {
      if (password !== 'password123' && password !== 'Alt1234$') {
        const errMsg = 'Incorrect password for Kitchen account.';
        toast.error(errMsg);
        return { success: false, error: errMsg };
      }

      const kitchenUser = {
        uid: 'kitchen-spice-haven-id',
        email: 'kitchen@restopulse.com',
        name: 'Chef Anand (Kitchen KDS)',
        role: 'kitchen',
        restaurantId: 'spice-haven'
      };
      localStorage.setItem('restopulse_firebase_user', JSON.stringify(kitchenUser));
      localStorage.setItem('restopulse_active_rest_id', 'spice-haven');
      setUser(kitchenUser);
      setActiveRestaurantId('spice-haven');
      toast.success('Kitchen Terminal Active.');
      return { success: true, user: kitchenUser, role: 'kitchen' };
    }

    // STRICT DENIAL FOR ANY UNPROVISIONED OR INVALID CREDENTIALS
    const failMsg = 'Authentication Failed: Invalid username/email or password. Accounts must be registered and provisioned by the Super Admin.';
    toast.error(failMsg);
    return { success: false, error: failMsg };
  };

  const logout = () => {
    localStorage.removeItem('restopulse_firebase_user');
    setUser(null);
    toast.info('Signed out.');
  };

  const selectActiveRestaurant = (restId) => {
    setActiveRestaurantId(restId);
    localStorage.setItem('restopulse_active_rest_id', restId);
    toast.info(`Switched active restaurant view to: ${restId}`);
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
