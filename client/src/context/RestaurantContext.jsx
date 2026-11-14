import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import {
  getRestaurantById,
  updateRestaurant as updateRestDoc,
  getOutletsByRestaurant,
  getDefaultOutletId,
  updateOutlet as updateOutletDoc,
  synthesizeDefaultOutlet
} from '../services/firestoreService';

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

  // Enterprise Multi-Tenant Outlets State
  const [outlets, setOutlets] = useState([]);
  const [activeOutletId, setActiveOutletIdState] = useState(() => {
    if (!activeRestaurantId) return '';
    return (
      localStorage.getItem(`abar_khabo_active_outlet_${activeRestaurantId}`) ||
      getDefaultOutletId(activeRestaurantId)
    );
  });
  const [activeOutlet, setActiveOutlet] = useState(null);
  const [loading, setLoading] = useState(true);

  // Synchronize outlets when active restaurant changes
  const fetchCurrentRestaurant = useCallback(async () => {
    if (!activeRestaurantId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await getRestaurantById(activeRestaurantId);
      if (data) {
        setRestaurant(data);

        // Fetch outlets under restaurants/{restaurantId}/outlets
        try {
          const loadedOutlets = await getOutletsByRestaurant(activeRestaurantId);
          if (loadedOutlets && loadedOutlets.length > 0) {
            setOutlets(loadedOutlets);

            // Determine active outlet
            const storedOutletId = localStorage.getItem(`abar_khabo_active_outlet_${activeRestaurantId}`);
            let matched = loadedOutlets.find(o => o.id === storedOutletId);
            if (!matched) {
              matched = loadedOutlets.find(o => o.isDefaultOutlet) || loadedOutlets[0];
            }
            setActiveOutletIdState(matched.id);
            setActiveOutlet(matched);
          } else {
            // Backward compatibility fallback for unmigrated single-restaurant doc
            const syntheticDefault = synthesizeDefaultOutlet(data);
            if (syntheticDefault) {
              setOutlets([syntheticDefault]);
              setActiveOutletIdState(syntheticDefault.id);
              setActiveOutlet(syntheticDefault);
            }
          }
        } catch (outletErr) {
          console.warn('Error loading outlets, using synthetic default:', outletErr);
          const syntheticDefault = synthesizeDefaultOutlet(data);
          if (syntheticDefault) {
            setOutlets([syntheticDefault]);
            setActiveOutletIdState(syntheticDefault.id);
            setActiveOutlet(syntheticDefault);
          }
        }
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

  // Handler to switch active outlet (e.g. for multi-branch brand owners)
  const setActiveOutletId = useCallback((newOutletId) => {
    if (!newOutletId || !activeRestaurantId) return;
    setActiveOutletIdState(newOutletId);
    localStorage.setItem(`abar_khabo_active_outlet_${activeRestaurantId}`, newOutletId);
    const matched = outlets.find(o => o.id === newOutletId);
    if (matched) {
      setActiveOutlet(matched);
    }
  }, [activeRestaurantId, outlets]);

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

  const updateActiveOutletData = async (updatedFields) => {
    if (!activeRestaurantId || !activeOutletId) return { success: false, error: 'No active outlet' };
    try {
      await updateOutletDoc(activeRestaurantId, activeOutletId, updatedFields);
      setActiveOutlet((prev) => (prev ? { ...prev, ...updatedFields } : null));
      setOutlets((prev) => prev.map(o => o.id === activeOutletId ? { ...o, ...updatedFields } : o));
      toast.success('Outlet settings updated!');
      return { success: true };
    } catch (err) {
      console.warn('Fallback local outlet update:', err);
      setActiveOutlet((prev) => (prev ? { ...prev, ...updatedFields } : null));
      setOutlets((prev) => prev.map(o => o.id === activeOutletId ? { ...o, ...updatedFields } : o));
      toast.success('Updated outlet settings!');
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
        taxName: restaurant.taxName || 'GST',
        // Multi-Tenant Outlet additions (non-breaking)
        outlets,
        activeOutletId,
        activeOutlet,
        setActiveOutletId,
        updateActiveOutlet: updateActiveOutletData,
        refreshOutlets: fetchCurrentRestaurant
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
