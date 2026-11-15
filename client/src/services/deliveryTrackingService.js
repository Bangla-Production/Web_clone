import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

let activeWatchId = null;
let lastPushTimestamp = 0;
let simulationInterval = null;

/**
 * Subscribes to live tracking data for an order (used by Customer and Admin)
 */
export function subscribeToDeliveryTracking(orderId, callback) {
  if (!orderId) return () => {};

  const getLocalTracking = () => {
    try {
      const raw = localStorage.getItem(`abar_khabo_tracking_${orderId}`);
      if (raw) return JSON.parse(raw);
      // Fallback from cached placed orders
      const orders = JSON.parse(localStorage.getItem('abar_khabo_placed_orders') || '[]');
      const ord = orders.find((o) => o.id === orderId);
      if (ord) {
        return {
          id: ord.id,
          orderId: ord.id,
          status: ord.deliveryStatus || ord.status || 'PLACED',
          restaurantCoordinates: ord.restaurantCoordinates || { lat: 22.5726, lng: 88.3639 },
          customerCoordinates: ord.customerCoordinates || { lat: 22.5850, lng: 88.3750 },
          deliveryAddress: ord.deliveryAddress,
          riderName: ord.riderName || null,
          riderPhone: ord.riderPhone || null,
          riderVehicle: ord.riderVehicle || null,
        };
      }
    } catch {}
    return null;
  };

  const initialLocal = getLocalTracking();
  if (initialLocal) {
    callback(initialLocal);
  }

  const docRef = doc(db, 'deliveryTracking', orderId);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const liveData = { id: snap.id, ...snap.data() };
        try {
          localStorage.setItem(`abar_khabo_tracking_${orderId}`, JSON.stringify(liveData));
        } catch {}
        callback(liveData);
      } else {
        callback(getLocalTracking());
      }
    },
    (err) => {
      console.warn('subscribeToDeliveryTracking error, using local fallback:', err);
      callback(getLocalTracking());
    }
  );
}

/**
 * Starts broadcasting the rider's real GPS position to Firestore
 * Uses throttle to update at most once every 3 seconds.
 */
export function startRiderLocationBroadcast(orderId, riderId, onCoordsUpdate) {
  stopRiderLocationBroadcast();

  if (!navigator.geolocation) {
    console.warn('Geolocation not supported by this browser.');
    return false;
  }

  const options = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 2000,
  };

  activeWatchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const now = Date.now();
      const coords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading || 0,
        speed: pos.coords.speed ? (pos.coords.speed * 3.6).toFixed(1) : 0, // km/h
        accuracy: pos.coords.accuracy || 10,
        timestamp: now,
      };

      if (onCoordsUpdate) onCoordsUpdate(coords);

      // Throttle write to Firestore every 3000ms
      if (now - lastPushTimestamp >= 3000 && orderId) {
        lastPushTimestamp = now;
        try {
          const trackingRef = doc(db, 'deliveryTracking', orderId);
          await updateDoc(trackingRef, {
            riderCoordinates: coords,
            lastUpdatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.warn('Failed to update rider location in Firestore:', err);
        }
      }
    },
    (err) => {
      console.warn('watchPosition error:', err.message);
    },
    options
  );

  return true;
}

/**
 * Stops GPS broadcast
 */
export function stopRiderLocationBroadcast() {
  if (activeWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(activeWatchId);
    activeWatchId = null;
  }
  if (simulationInterval !== null) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
}

/**
 * Development & Testing Helper: Simulates rider moving smoothly from start to destination
 */
export function startSimulatedRiderMovement(orderId, startCoords, endCoords, onCoordsUpdate) {
  stopRiderLocationBroadcast();

  const start = startCoords || { lat: 22.5726, lng: 88.3639 };
  const end = endCoords || { lat: 22.5850, lng: 88.3750 };
  const totalSteps = 60; // 60 updates over 2 minutes (every 2s)
  let currentStep = 0;

  simulationInterval = setInterval(async () => {
    currentStep++;
    const progress = Math.min(currentStep / totalSteps, 1);
    
    // Interpolate coordinates
    const currentLat = start.lat + (end.lat - start.lat) * progress;
    const currentLng = start.lng + (end.lng - start.lng) * progress;

    const coords = {
      lat: currentLat,
      lng: currentLng,
      heading: 45,
      speed: 28.5, // 28.5 km/h
      accuracy: 5,
      isSimulated: true,
      timestamp: Date.now(),
    };

    if (onCoordsUpdate) onCoordsUpdate(coords);

    if (orderId) {
      try {
        const trackingRef = doc(db, 'deliveryTracking', orderId);
        await updateDoc(trackingRef, {
          riderCoordinates: coords,
          lastUpdatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Simulation Firestore sync error:', err);
      }
    }

    if (progress >= 1) {
      clearInterval(simulationInterval);
      simulationInterval = null;
    }
  }, 2000);

  return true;
}
