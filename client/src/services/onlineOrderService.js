/**
 * Online Orders Service
 * Handles Takeaway & Delivery orders stored under:
 *   restaurants/{restaurantId}/onlineOrders/{orderId}
 *
 * Porter delivery integration is also here (quote + create shipment).
 */

import {
  db,
  collection,
  collectionGroup,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from '../firebase/config';

// ─── Firestore helpers ────────────────────────────────────────────────────────

export async function placeOnlineOrder(restaurantId, orderData) {
  const colRef = collection(db, 'restaurants', restaurantId, 'onlineOrders');
  const payload = {
    ...orderData,
    status: 'PLACED',           // PLACED → CONFIRMED → PREPARING → OUT_FOR_DELIVERY / READY → COMPLETED / CANCELLED
    orderType: orderData.orderType || 'TAKEAWAY',  // 'TAKEAWAY' | 'DELIVERY'
    paymentStatus: 'PENDING',
    porterShipmentId: null,
    porterTrackingUrl: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(colRef, payload);
  return { id: ref.id, ...payload };
}

export function subscribeToOnlineOrders(restaurantId, callback) {
  const colRef = collection(db, 'restaurants', restaurantId, 'onlineOrders');
  const q = query(colRef, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function getOnlineOrders(restaurantId) {
  const colRef = collection(db, 'restaurants', restaurantId, 'onlineOrders');
  const q = query(colRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateOnlineOrderStatus(restaurantId, orderId, status, extra = {}) {
  const ref = doc(db, 'restaurants', restaurantId, 'onlineOrders', orderId);
  await updateDoc(ref, { status, ...extra, updatedAt: serverTimestamp() });
}

// ─── Customer online-order history (by phone number) ──────────────────────────

export async function getOnlineOrdersByPhone(restaurantId, phone) {
  const colRef = collection(db, 'restaurants', restaurantId, 'onlineOrders');
  const q = query(colRef, where('customerPhone', '==', phone), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getOnlineOrdersAcrossRestaurants(phone) {
  try {
    const cg = collectionGroup(db, 'onlineOrders');
    const q = query(cg, where('customerPhone', '==', phone));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, restaurantId: d.ref.parent.parent?.id, ...d.data() }));
  } catch (err) {
    console.warn('collectionGroup query error fallback:', err);
    return [];
  }
}

// ─── Porter Delivery Integration ──────────────────────────────────────────────
//
// Porter is an on-demand logistics platform (porter.in).
// In a real production app you would call the Porter API from a secure
// backend / Cloud Function so the API key is never exposed.
//
// Here we provide:
//   1. A client-side stub that calls a simple proxy endpoint (or logs a
//      clear message if no proxy is configured).
//   2. Firebase helpers to persist the returned shipment details on the order.
//
// Set VITE_PORTER_API_KEY in your .env file and deploy a backend proxy at
// VITE_PORTER_PROXY_URL that forwards requests to https://api.porter.in/v1.
//

const PORTER_PROXY = import.meta.env.VITE_PORTER_PROXY_URL || '';
const PORTER_KEY   = import.meta.env.VITE_PORTER_API_KEY   || '';

function porterHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': PORTER_KEY,
  };
}

/**
 * Request a delivery quote from Porter.
 * pickup:  { lat, lng, address }
 * drop:    { lat, lng, address }
 * Returns the cheapest fare estimate in INR, or null if Porter is not configured.
 */
export async function getPorterQuote(pickup, drop) {
  if (!PORTER_PROXY || !PORTER_KEY) {
    console.info('[Porter] Not configured — returning mock quote. Set VITE_PORTER_PROXY_URL and VITE_PORTER_API_KEY.');
    return {
      isMock: true,
      vehicleType: '2-Wheeler',
      fareEstimateMin: 49,
      fareEstimateMax: 79,
      etaMinutes: 30,
      currency: 'INR',
    };
  }

  const body = {
    pickup_details:  { lat: pickup.lat, lng: pickup.lng },
    drop_details:    { lat: drop.lat,   lng: drop.lng   },
    customer:        { name: 'Customer', mobile: { country_code: '+91', number: '0000000000' } },
  };

  const res = await fetch(`${PORTER_PROXY}/orders/fare_estimate`, {
    method: 'POST',
    headers: porterHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Porter quote failed: ${res.status}`);
  const data = await res.json();

  const vehicle = data?.vehicles?.[0];
  return {
    isMock: false,
    vehicleType: vehicle?.type || '2-Wheeler',
    fareEstimateMin: vehicle?.fare?.minor_amount ? vehicle.fare.minor_amount / 100 : 0,
    fareEstimateMax: vehicle?.fare?.minor_amount ? vehicle.fare.minor_amount / 100 : 0,
    etaMinutes: vehicle?.eta?.pickup?.duration || 30,
    currency: 'INR',
  };
}

/**
 * Create a Porter delivery shipment and persist the tracking link on the order.
 */
export async function createPorterShipment(restaurantId, orderId, { pickup, drop, customer, items }) {
  if (!PORTER_PROXY || !PORTER_KEY) {
    console.info('[Porter] Not configured — skipping shipment creation.');
    const mockId = `MOCK-${Date.now()}`;
    await updateOnlineOrderStatus(restaurantId, orderId, 'OUT_FOR_DELIVERY', {
      porterShipmentId: mockId,
      porterTrackingUrl: `https://porter.in/track/${mockId}`,
    });
    return { porterShipmentId: mockId, trackingUrl: `https://porter.in/track/${mockId}` };
  }

  const body = {
    request_id: orderId,
    pickup_details: { lat: pickup.lat, lng: pickup.lng, address: { apartment_address: pickup.address } },
    drop_details:   { lat: drop.lat,   lng: drop.lng,   address: { apartment_address: drop.address  } },
    customer: {
      name: customer.name,
      mobile: { country_code: '+91', number: customer.phone },
    },
    order_items: items.map((it) => ({ name: it.name, quantity: it.qty })),
    is_prepaid: true,
  };

  const res = await fetch(`${PORTER_PROXY}/orders/create`, {
    method: 'POST',
    headers: porterHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Porter create order failed: ${res.status}`);
  const data = await res.json();

  const shipmentId = data?.order_id;
  const trackingUrl = data?.tracking_url || `https://porter.in/track/${shipmentId}`;

  await updateOnlineOrderStatus(restaurantId, orderId, 'OUT_FOR_DELIVERY', {
    porterShipmentId: shipmentId,
    porterTrackingUrl: trackingUrl,
  });

  return { porterShipmentId: shipmentId, trackingUrl };
}
