/**
 * Abar Khabo: Frontend Payment & Settlement Client Service
 * 
 * Provides client-side helpers to query and subscribe to payment transactions,
 * financial summaries, and aggregator settlement records.
 */

import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Subscribes to real-time payment transactions for an outlet.
 */
export function subscribePaymentTransactions(restaurantId, outletId, callback, filters = {}) {
  if (!restaurantId || !outletId) return () => {};

  const colRef = collection(db, 'restaurants', restaurantId, 'paymentTransactions');
  let q = query(colRef, where('outletId', '==', outletId));

  if (filters.paymentMethod) {
    q = query(colRef, where('outletId', '==', outletId), where('paymentMethod', '==', filters.paymentMethod));
  }
  if (filters.collectionType) {
    q = query(colRef, where('outletId', '==', outletId), where('collectionType', '==', filters.collectionType));
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const txns = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(txns);
    },
    (error) => {
      console.error('Error subscribing to payment transactions:', error);
      callback([]);
    }
  );
}

/**
 * Subscribes to real-time settlement records for an outlet.
 */
export function subscribeSettlementBatches(restaurantId, outletId, callback) {
  if (!restaurantId || !outletId) return () => {};

  const colRef = collection(db, 'restaurants', restaurantId, 'settlementRecords');
  const q = query(colRef, where('outletId', '==', outletId));

  return onSnapshot(
    q,
    (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      callback(records);
    },
    (error) => {
      console.error('Error subscribing to settlement records:', error);
      callback([]);
    }
  );
}

/**
 * Fetches settlement records for an outlet.
 */
export async function getSettlementBatches(restaurantId, outletId) {
  if (!restaurantId || !outletId) return [];
  const colRef = collection(db, 'restaurants', restaurantId, 'settlementRecords');
  const q = query(colRef, where('outletId', '==', outletId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}
