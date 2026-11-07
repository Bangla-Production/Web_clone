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

export function CustomerAuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const unsub = onCustomerAuthChange((profile) => {
      setCustomer(profile);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const register = async (fields) => {
    const user = await customerRegister(fields);
    return user;
  };

  const login = async (email, password) => {
    const profile = await customerLogin(email, password);
    setCustomer(profile);
    return profile;
  };

  const logout = async () => {
    await customerSignOut();
    setCustomer(null);
  };

  const resetPassword = (email) => customerResetPassword(email);

  const updateProfile = async (data) => {
    if (!customer?.uid) return;
    await updateCustomerProfile(customer.uid, data);
    setCustomer((prev) => ({ ...prev, ...data }));
  };

  return (
    <CustomerAuthContext.Provider
      value={{ customer, loading, isCustomerAuth: !!customer, register, login, logout, resetPassword, updateProfile }}
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
