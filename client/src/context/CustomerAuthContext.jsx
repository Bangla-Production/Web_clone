import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  customerRegister,
  customerLogin,
  customerSignOut,
  customerResetPassword,
  onCustomerAuthChange,
  updateCustomerProfile,
} from '../services/customerAuthService';

const CustomerAuthContext = createContext(null);

const CUSTOMER_STORAGE_KEY = 'abar_khabo_customer';

export function CustomerAuthProvider({ children }) {
  const [customer, setCustomer] = useState(() => {
    try {
      const saved = localStorage.getItem(CUSTOMER_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const unsub = onCustomerAuthChange((profile) => {
      setCustomer(profile);
      if (profile) {
        try {
          localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(profile));
        } catch {}
      } else {
        localStorage.removeItem(CUSTOMER_STORAGE_KEY);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const register = async (fields) => {
    const result = await customerRegister(fields);
    if (result?.profile) {
      setCustomer(result.profile);
      try {
        localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(result.profile));
      } catch {}
    }
    return result;
  };

  const login = async (email, password) => {
    const profile = await customerLogin(email, password);
    setCustomer(profile);
    if (profile) {
      try {
        localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(profile));
      } catch {}
    }
    return profile;
  };

  const logout = async () => {
    await customerSignOut();
    setCustomer(null);
    localStorage.removeItem(CUSTOMER_STORAGE_KEY);
  };

  const resetPassword = (email) => customerResetPassword(email);

  const updateProfile = async (data) => {
    if (!customer?.uid) return;
    await updateCustomerProfile(customer.uid, data);
    setCustomer((prev) => ({ ...prev, ...data }));
  };

  return (
    <CustomerAuthContext.Provider
      value={{ customer, loading, isCustomerAuth: !!(customer && !customer.isAnonymous), register, login, logout, resetPassword, updateProfile }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return ctx;
}
