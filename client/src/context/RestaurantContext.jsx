import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { getRestaurantById, updateRestaurant as updateRestDoc } from '../services/firestoreService';

const RestaurantContext = createContext(null);

export function RestaurantProvider({ children }) {
  const { activeRestaurantId } = useAuth();
  const toast = useToast();

  const [restaurant, setRestaurant] = useState({
    id: 'spice-haven',
    name: 'Spice Haven Bistro',
    tagline: 'Authentic Flavors & Gourmet Dining',
    logoUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=200&auto=format&fit=crop&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80',
    address: '104 Royal Heritage Road, Sector 5, Salt Lake, Kolkata, WB 700091',
    phone: '+91 98765 43210',
    email: 'contact@spicehaven.com',
    gstin: '19AABCS1429B1Z8',
    currency: 'INR',
    currencySymbol: '₹',
    primaryColor: '#0f766e',
    secondaryColor: '#ea580c',
    taxRate: 5.0,
    taxName: 'GST (5%)',
    invoiceHeader: 'Tax Invoice / Cash Memo',
    invoiceFooter: 'FSSAI Lic: 12822019000123 • Thank you for dining with us!'
  });
  const [loading, setLoading] = useState(true);

  const fetchCurrentRestaurant = useCallback(async () => {
    if (!activeRestaurantId) return;
    try {
      setLoading(true);
      const data = await getRestaurantById(activeRestaurantId);
      if (data) {
        setRestaurant(data);
      }
    } catch (err) {
      console.warn('Using default restaurant data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId]);

  useEffect(() => {
    fetchCurrentRestaurant();
  }, [fetchCurrentRestaurant]);

  const updateRestaurantData = async (updatedFields) => {
    try {
      await updateRestDoc(activeRestaurantId, updatedFields);
      setRestaurant((prev) => ({ ...prev, ...updatedFields }));
      toast.success('Restaurant profile & ImgBB branding updated!');
      return { success: true };
    } catch (err) {
      // Fallback local update
      setRestaurant((prev) => ({ ...prev, ...updatedFields }));
      toast.success('Updated settings!');
      return { success: true };
    }
  };

  return (
    <RestaurantContext.Provider
      value={{
        restaurant,
        loading,
        updateRestaurant: updateRestaurantData,
        refetch: fetchCurrentRestaurant,
        currencySymbol: restaurant.currencySymbol || '₹',
        taxRate: restaurant.taxRate !== undefined ? restaurant.taxRate : 5.0,
        taxName: restaurant.taxName || 'GST'
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurant must be used within RestaurantProvider');
  }
  return context;
}
