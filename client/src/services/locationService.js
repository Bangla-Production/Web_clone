/**
 * Location Service
 * Handles browser Geolocation API, reverse geocoding, distance calculations,
 * and customer address management in Firestore.
 */

import {
  db,
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from '../firebase/config';

const SAVED_LOCATION_KEY = 'restopulse_customer_location';

/**
 * Calculates straight-line distance in kilometers between two GPS coordinates using Haversine formula.
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Round to 1 decimal place
}

/**
 * Checks if a restaurant is within the customer's delivery radius.
 * Default max radius: 15 km.
 */
export function isRestaurantServiceable(customerCoords, restaurantCoords, maxRadiusKm = 15) {
  if (!customerCoords || !restaurantCoords) return true; // Default available if no coordinates set
  const distance = calculateDistanceKm(
    customerCoords.lat,
    customerCoords.lng,
    restaurantCoords.lat,
    restaurantCoords.lng
  );
  if (distance === null) return true;
  return distance <= maxRadiusKm;
}

/**
 * Reverse geocode latitude and longitude into a readable address string.
 * Uses OpenStreetMap Nominatim reverse geocoding with graceful fallback.
 */
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) throw new Error('Geocoding service unavailable');
    const data = await res.json();
    const displayName = data.display_name || '';
    const parts = displayName.split(',').map((p) => p.trim());
    // Format a concise clean label: e.g. "Salt Lake Sector V, Kolkata"
    const concise = parts.slice(0, 3).join(', ') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    return {
      formattedAddress: displayName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      shortAddress: concise,
      city: data.address?.city || data.address?.town || data.address?.state_district || '',
      state: data.address?.state || '',
      postcode: data.address?.postcode || '',
    };
  } catch (err) {
    console.warn('reverseGeocode fallback:', err);
    return {
      formattedAddress: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`,
      shortAddress: `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      city: '',
      state: '',
      postcode: '',
    };
  }
}

/**
 * Request browser location with timeout and permission detection.
 */
export function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  });
}

/**
 * Local storage cache for the customer's selected location.
 */
export function getSavedCustomerLocation() {
  try {
    const raw = localStorage.getItem(SAVED_LOCATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveCustomerLocation(locObj) {
  try {
    localStorage.setItem(SAVED_LOCATION_KEY, JSON.stringify(locObj));
  } catch (e) {
    // Ignore storage quota
  }
}

// ─── Firestore Customer Addresses ─────────────────────────────────────────────

export async function getCustomerSavedAddresses(customerId) {
  if (!customerId) return [];
  try {
    const colRef = collection(db, 'customers', customerId, 'addresses');
    const snap = await getDocs(colRef);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('getCustomerSavedAddresses error:', err);
    return [];
  }
}

export async function addCustomerSavedAddress(customerId, addressData) {
  if (!customerId) return null;
  const colRef = collection(db, 'customers', customerId, 'addresses');
  const payload = {
    ...addressData,
    label: addressData.label || 'Home', // 'Home' | 'Work' | 'Other'
    formattedAddress: addressData.formattedAddress || '',
    lat: addressData.lat || null,
    lng: addressData.lng || null,
    deliveryInstructions: addressData.deliveryInstructions || '',
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(colRef, payload);
  return { id: ref.id, ...payload };
}
