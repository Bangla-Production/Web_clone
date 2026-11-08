import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const DeliveryPartnerAuthContext = createContext(null);

export function DeliveryPartnerAuthProvider({ children }) {
  const [partner, setPartner] = useState(null);
  const [partnerProfile, setPartnerProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sync partner profile from Firestore
  const fetchPartnerProfile = async (uid) => {
    try {
      const docRef = doc(db, 'deliveryPartners', uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        setPartnerProfile({ id: snap.id, ...data });
        return data;
      }
      return null;
    } catch (err) {
      console.error('fetchPartnerProfile error:', err);
      return null;
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setPartner(user);
        await fetchPartnerProfile(user.uid);
      } else {
        setPartner(null);
        setPartnerProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const profile = await fetchPartnerProfile(cred.user.uid);
    if (!profile) {
      throw new Error('No delivery partner account found for this email.');
    }
    return cred.user;
  };

  const register = async ({ name, email, phone, vehicleType, vehicleNumber, password }) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const partnerDoc = {
      uid: cred.user.uid,
      name,
      email,
      phone,
      vehicleType: vehicleType || 'BIKE',
      vehicleNumber: vehicleNumber || '',
      status: 'APPROVED', // Pre-approved for instant demo/testability
      isOnline: false,
      isAvailable: true,
      currentOrderId: null,
      lastCoordinates: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'deliveryPartners', cred.user.uid), partnerDoc);
    setPartnerProfile({ id: cred.user.uid, ...partnerDoc });
    return cred.user;
  };

  const setOnlineStatus = async (isOnline) => {
    if (!partner) return;
    try {
      await updateDoc(doc(db, 'deliveryPartners', partner.uid), {
        isOnline,
        updatedAt: serverTimestamp(),
      });
      setPartnerProfile(prev => prev ? { ...prev, isOnline } : null);
    } catch (err) {
      console.error('setOnlineStatus error:', err);
    }
  };

  const logout = async () => {
    if (partner) {
      try {
        await updateDoc(doc(db, 'deliveryPartners', partner.uid), {
          isOnline: false,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        // ignore on logout
      }
    }
    await signOut(auth);
    setPartner(null);
    setPartnerProfile(null);
  };

  return (
    <DeliveryPartnerAuthContext.Provider
      value={{
        partner,
        partnerProfile,
        loading,
        login,
        register,
        logout,
        setOnlineStatus,
        refreshProfile: () => partner && fetchPartnerProfile(partner.uid),
      }}
    >
      {children}
    </DeliveryPartnerAuthContext.Provider>
  );
}

export function useDeliveryPartnerAuth() {
  const ctx = useContext(DeliveryPartnerAuthContext);
  if (!ctx) {
    throw new Error('useDeliveryPartnerAuth must be used within DeliveryPartnerAuthProvider');
  }
  return ctx;
}
