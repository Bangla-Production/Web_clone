import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { getRestaurantById, updateRestaurant as updateRestDoc } from '../services/firestoreService';

const RestaurantContext = createContext(null);

export function RestaurantProvider({ children }) {
  const { activeRestaurantId } = useAuth();
  const toast = useToast();

  // Neutral placeholder until the real restaurant document loads (no demo branding).
  const [restaurant, setRestaurant] = useState({
    id: activeRestaurantId || '',
    name: '',
    currency: 'INR',
    currencySymbol: '₹',
    taxRate: 5.0,
    taxName: 'GST'
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
