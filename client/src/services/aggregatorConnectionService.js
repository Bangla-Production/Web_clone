/**
 * Abar Khabo: Aggregator Connection Client Service (Frontend / React)
 * Allows Restaurant Admins to view connection statuses, configure environment (MOCK/SANDBOX),
 * and manage aggregator operational states.
 *
 * SECURITY: Never handles or exposes plaintext credentials. All secret references
 * point to Google Cloud Secret Manager.
 */

import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config.js';

export const CONNECTION_STATUSES = {
  NOT_CONNECTED: 'NOT_CONNECTED',
  PENDING_AUTHORIZATION: 'PENDING_AUTHORIZATION',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR',
  SUSPENDED: 'SUSPENDED'
};

export const PROVIDERS = {
  SWIGGY: 'SWIGGY',
  ZOMATO: 'ZOMATO'
};

export const ENVIRONMENTS = {
  MOCK: 'MOCK',
  SANDBOX: 'SANDBOX',
  PRODUCTION: 'PRODUCTION'
};

/**
 * Returns canonical Firestore doc path for aggregator connection.
 */
export function getAggregatorConnectionDocPath(restaurantId, outletId, connectionId) {
  return `restaurants/${restaurantId}/outlets/${outletId}/aggregatorConnections/${String(connectionId).toLowerCase()}`;
}

/**
 * Fetches an aggregator connection by ID.
 */
export async function getAggregatorConnection(restaurantId, outletId, connectionId) {
  if (!restaurantId || !outletId || !connectionId) return null;
  try {
    const docRef = doc(db, getAggregatorConnectionDocPath(restaurantId, outletId, connectionId));
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (error) {
    console.error(`Error fetching aggregator connection ${connectionId}:`, error);
    throw error;
  }
}

/**
 * Lists all aggregator connections configured for an outlet.
 */
export async function listOutletAggregatorConnections(restaurantId, outletId) {
  if (!restaurantId || !outletId) return [];
  try {
    const colRef = collection(db, `restaurants/${restaurantId}/outlets/${outletId}/aggregatorConnections`);
    const snap = await getDocs(colRef);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error listing aggregator connections:', error);
    return [];
  }
}

/**
 * Updates connection status (e.g. CONNECTED, DISCONNECTED, ERROR).
 * Enforces that no secrets are passed from client.
 */
export async function updateAggregatorConnectionStatus(restaurantId, outletId, connectionId, status, errorDetails = null) {
  const docRef = doc(db, getAggregatorConnectionDocPath(restaurantId, outletId, connectionId));
  const now = new Date().toISOString();

  const updateData = {
    connectionStatus: status,
    updatedAt: now
  };

  if (status === CONNECTION_STATUSES.CONNECTED) {
    updateData.connectedAt = now;
    updateData.lastError = null;
  } else if (status === CONNECTION_STATUSES.DISCONNECTED) {
    updateData.connectedAt = null;
  } else if (status === CONNECTION_STATUSES.ERROR && errorDetails) {
    updateData.lastError = {
      code: errorDetails.code || 'UNKNOWN_ERROR',
      message: errorDetails.message || 'Connection error',
      timestamp: now
    };
  }

  await updateDoc(docRef, updateData);
  return updateData;
}
