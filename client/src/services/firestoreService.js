import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  writeBatch
} from '../firebase/config';
import { createAuthAccount, createStaffAuthAccount, resendVerification, checkVerified } from './authAccountService';

// ----------------------------------------------------------------------
// 1. RESTAURANTS (Multi-Tenant Platform)
// ----------------------------------------------------------------------

export async function getAllRestaurants() {
  try {
    const colRef = collection(db, 'restaurants');
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('getAllRestaurants error:', error);
    throw error;
  }
}

export async function getRestaurantById(restaurantId) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() };
  } catch (error) {
    console.error('getRestaurantById error:', error);
    throw error;
  }
}

export async function createRestaurant(restaurantData, customId = null) {
  try {
    const docRef = customId ? doc(db, 'restaurants', customId) : doc(collection(db, 'restaurants'));
    const payload = {
      ...restaurantData,
      status: restaurantData.status || 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(docRef, payload);
    return { id: docRef.id, ...payload };
  } catch (error) {
    console.error('createRestaurant error:', error);
    throw error;
  }
}

export async function updateRestaurant(restaurantId, updateData) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId);
    const payload = {
      ...updateData,
      updatedAt: serverTimestamp()
    };
    await updateDoc(docRef, payload);
    return { id: restaurantId, ...payload };
  } catch (error) {
    console.error('updateRestaurant error:', error);
    throw error;
  }
}

export async function deleteRestaurant(restaurantId) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('deleteRestaurant error:', error);
    throw error;
  }
}

// ----------------------------------------------------------------------
// 2. USERS & STAFF
// ----------------------------------------------------------------------

export async function getUserProfile(userId) {
  try {
    const docRef = doc(db, 'users', userId);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() };
  } catch (error) {
    console.error('getUserProfile error:', error);
    throw error;
  }
}

export async function saveUserProfile(userId, userData) {
  try {
    const docRef = doc(db, 'users', userId);
    const payload = {
      ...userData,
      updatedAt: serverTimestamp()
    };
    await setDoc(docRef, payload, { merge: true });
    return { id: userId, ...payload };
  } catch (error) {
    console.error('saveUserProfile error:', error);
    throw error;
  }
}

export async function getStaffByRestaurant(restaurantId) {
  try {
    const colRef = collection(db, 'users');
    const snapshot = await getDocs(colRef);
    const targetId = restaurantId || 'spice-haven';
    return snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => u.restaurantId === targetId || (!u.restaurantId && u.role !== 'super_admin'));
  } catch (error) {
    console.error('getStaffByRestaurant error:', error);
    return [];
  }
}

export async function getAllUsers() {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Creates a real Firebase Auth login + the matching users/{email} profile.
 * (Profiles are keyed by the lower-case email, so an account can be deleted and
 * the same email can be added again later.)
 * The profile starts as "pending" and becomes "active" once the email is confirmed.
 * Passwords are NOT stored anywhere in Firestore.
 *
 * Used by Super Admin (Restaurant Admins) and Restaurant Admin (staff).
 * Returns { account, emailResult }.
 */
export async function createAccountWithEmail(userData, createdByLabel) {
  const cleanEmail = (userData.email || '').toLowerCase().trim();

  // Throws if the login cannot be created (weak password, email in use, ...).
  const auth = await createAuthAccount({ email: cleanEmail, password: userData.password });

  const profile = {
    name: userData.name?.trim() || 'Staff Member',
    email: cleanEmail,
    username: cleanEmail,
    role: userData.role || 'restaurant_admin',
    restaurantId: userData.restaurantId || '',
    restaurantName: userData.restaurantName || '',
    status: 'pending',
    emailVerified: false,
    createdBy: createdByLabel || userData.createdBy || 'Admin',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'users', cleanEmail), profile);
  } catch (err) {
    if (err?.code === 'permission-denied') {
      throw new Error('This email is already used by another account.');
    }
    throw err;
  }

  const account = { id: cleanEmail, ...profile, status: 'pending' };

  if (auth.alreadyVerified) {
    try {
      await updateDoc(doc(db, 'users', cleanEmail), { status: 'active', emailVerified: true, updatedAt: serverTimestamp() });
      account.status = 'active';
    } catch (e) {
      console.warn('Could not activate already-verified account:', e);
    }
  }

  return {
    account,
    emailResult: {
      success: auth.alreadyVerified || auth.emailSent,
      alreadyVerified: auth.alreadyVerified,
      passwordReset: !!auth.passwordReset,
      error: auth.emailError
    }
  };
}

export async function updateProvisionedUser(userId, updateData) {
  await updateDoc(doc(db, 'users', userId), {
    ...updateData,
    updatedAt: serverTimestamp()
  });
  return { id: userId, ...updateData };
}

/**
 * Deletes the profile. (The Firebase Auth login itself cannot be deleted from the
 * browser without the user's password — but without a profile it can no longer
 * open the app.)
 */
export async function deleteProvisionedUser(userId) {
  await deleteDoc(doc(db, 'users', userId));
  return true;
}

/**
 * Re-sends the confirmation email. Passwords are not stored, so the caller
 * must supply the account's password.
 */
export async function resendAccountVerification(account, password) {
  const result = await resendVerification(account.email, password);
  if (result.alreadyVerified) {
    try { await updateProvisionedUser(account.id, { status: 'active', emailVerified: true }); } catch (e) { /* ignore */ }
  }
  return result;
}

/**
 * Checks with Firebase whether the account's email was confirmed and activates the
 * profile if so. Requires the account's password. Returns { verified, error }.
 */
export async function syncAccountVerification(account, password) {
  const { verified, error } = await checkVerified(account.email, password);
  if (verified && account.status === 'pending') {
    try {
      await updateProvisionedUser(account.id, { status: 'active', emailVerified: true });
    } catch (e) {
      console.warn('Could not persist activation:', e);
    }
  }
  return { verified, error };
}

/**
 * Generates a random 6-digit numeric Staff ID as a string, e.g. "482913".
 */
function generateNumericStaffId() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Restaurant Admin provisions login credentials for their own staff
 * (kitchen / waiter / cashier): a Name, Phone number, Role, an
 * auto-generated unique numeric Staff ID, and a password. No email is
 * collected and there is no confirmation step — the account is active
 * immediately.
 *
 * Under the hood a real Firebase Auth login is still created (so Firestore
 * security rules can identify the caller) using an internal synthetic email
 * derived from the Staff ID. Nobody needs to know that email exists; staff
 * always sign in with just their Staff ID + password.
 *
 * A top-level `staffLookup/{staffId}` document (publicly readable, admin-only
 * write) maps the numeric Staff ID to that internal email so the login
 * screen can resolve it before the person is authenticated.
 *
 * Returns { account, staffId, password }.
 */
/**
 * Checks whether a numeric Staff ID is already taken.
 */
export async function checkStaffIdAvailability(staffId) {
  const cleanId = String(staffId || '').trim();
  if (!cleanId || !/^\d+$/.test(cleanId)) {
    return { available: false, error: 'Staff ID must contain digits only.' };
  }
  try {
    const snap = await getDoc(doc(db, 'staffLookup', cleanId));
    return { available: !snap.exists(), exists: snap.exists() };
  } catch (err) {
    console.error('checkStaffIdAvailability error:', err);
    return { available: false, error: err.message };
  }
}

/**
 * Restaurant Admin provisions login credentials for their own staff
 * (kitchen / waiter / cashier): a Name, Phone number, Role, a
 * unique numeric Staff ID (custom or auto-generated), and a unique password.
 * No email is collected and there is no confirmation step — the account is active
 * immediately.
 *
 * Under the hood a real Firebase Auth login is still created (so Firestore
 * security rules can identify the caller) using an internal synthetic email
 * derived from the Staff ID. Nobody needs to know that email exists; staff
 * always sign in with just their Staff ID + password.
 *
 * A top-level `staffLookup/{staffId}` document (publicly readable, admin-only
 * write) maps the numeric Staff ID to that internal email so the login
 * screen can resolve it before the person is authenticated.
 *
 * Returns { account, staffId, password }.
 */
export async function createRestaurantStaff(restaurantId, restaurantName, staffData) {
  const allowedRoles = ['waiter', 'kitchen', 'cashier'];
  const role = allowedRoles.includes(staffData.role) ? staffData.role : 'waiter';
  const name = staffData.name?.trim() || 'Staff Member';
  const phone = staffData.phone?.trim() || '';
  const password = staffData.password;
  const createdBy = staffData.createdBy || 'Restaurant Admin';

  let staffId = String(staffData.staffId || '').trim();

  if (staffId) {
    if (!/^\d+$/.test(staffId)) {
      throw new Error('Staff ID must be purely numerical (digits only).');
    }
    if (staffId.length < 3 || staffId.length > 10) {
      throw new Error('Staff ID should be between 3 and 10 digits long.');
    }
    const lookupSnap = await getDoc(doc(db, 'staffLookup', staffId));
    if (lookupSnap.exists()) {
      throw new Error(`Staff ID "${staffId}" is already taken. Please choose another unique numerical ID.`);
    }
  } else {
    // Auto-generate a Staff ID that isn't already taken
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = generateNumericStaffId();
      const lookupSnap = await getDoc(doc(db, 'staffLookup', candidate));
      if (!lookupSnap.exists()) {
        staffId = candidate;
        break;
      }
    }
    if (!staffId) {
      throw new Error('Could not generate a unique Staff ID. Please try again.');
    }
  }

  const restId = restaurantId || 'spice-haven';
  const internalEmail = `staff${staffId}@${restId}.restopulse.local`;

  // Real Firebase Auth login, but nothing is ever emailed.
  await createStaffAuthAccount({ email: internalEmail, password });

  const profile = {
    name,
    phone,
    staffId,
    email: internalEmail,
    username: staffId,
    role,
    restaurantId: restId,
    restaurantName: restaurantName || 'Spice Haven Bistro',
    status: 'active',
    emailVerified: true,
    // Marks this as a Staff-ID account (no real inbox, so Firebase's own
    // email_verified token claim can never become true for it). Firestore
    // rules trust this Firestore-side flag instead for these accounts —
    // it can only ever be set by a Restaurant Admin, scoped to their own
    // restaurant, via the create rule below.
    authMethod: 'staffId',
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'users', internalEmail), profile);
  } catch (err) {
    if (err?.code === 'permission-denied') {
      throw new Error('Could not save the staff profile (permission denied).');
    }
    throw err;
  }

  await setDoc(doc(db, 'staffLookup', staffId), {
    email: internalEmail,
    restaurantId,
    role,
    name,
    active: true,
    createdAt: serverTimestamp()
  });

  return {
    account: { id: internalEmail, ...profile, status: 'active' },
    staffId,
    password
  };
}

/**
 * Looks up the internal login email for a numeric Staff ID. Used by the
 * Staff Login screen to resolve a Staff ID + password into a real Firebase
 * Auth sign-in. Returns the staffLookup doc data, or null if not found.
 */
export async function getStaffLookup(staffId) {
  try {
    const snap = await getDoc(doc(db, 'staffLookup', String(staffId).trim()));
    return snap.exists() ? snap.data() : null;
  } catch (error) {
    console.error('getStaffLookup error:', error);
    return null;
  }
}

/**
 * Removes a Staff-ID based account: deletes both the users/{email} profile
 * and the staffLookup/{staffId} mapping so the ID can be reissued later.
 * (The underlying Firebase Auth login itself cannot be deleted from the
 * browser, but without a profile or lookup entry it can no longer sign in
 * anywhere useful.)
 */
export async function deleteRestaurantStaff(member) {
  await deleteDoc(doc(db, 'users', member.id));
  if (member.staffId) {
    try {
      await deleteDoc(doc(db, 'staffLookup', member.staffId));
    } catch (e) { /* ignore */ }
  }
  return true;
}

// ----------------------------------------------------------------------
// 3. CATEGORIES
// ----------------------------------------------------------------------

export async function getCategories(restaurantId) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'categories');
    const q = query(colRef, orderBy('displayOrder', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('getCategories error:', error);
    return [];
  }
}

export async function createCategory(restaurantId, categoryData) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'categories');
    const docRef = await addDoc(colRef, {
      ...categoryData,
      isActive: true,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, ...categoryData };
  } catch (error) {
    console.error('createCategory error:', error);
    throw error;
  }
}

export async function updateCategory(restaurantId, categoryId, categoryData) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId, 'categories', categoryId);
    await updateDoc(docRef, { ...categoryData, updatedAt: serverTimestamp() });
    return { id: categoryId, ...categoryData };
  } catch (error) {
    console.error('updateCategory error:', error);
    throw error;
  }
}

export async function deleteCategory(restaurantId, categoryId) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId, 'categories', categoryId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('deleteCategory error:', error);
    throw error;
  }
}

// ----------------------------------------------------------------------
// 4. MENU ITEMS
// ----------------------------------------------------------------------

export async function getMenuItems(restaurantId) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'menuItems');
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('getMenuItems error:', error);
    return [];
  }
}

export function subscribeToMenuItems(restaurantId, callback, onError) {
  if (!restaurantId) return () => {};
  const colRef = collection(db, 'restaurants', restaurantId, 'menuItems');
  return onSnapshot(colRef, (snapshot) => {
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(items);
  }, (error) => {
    console.error('subscribeToMenuItems error:', error);
    if (onError) onError(error);
  });
}

export function subscribeToCategories(restaurantId, callback, onError) {
  if (!restaurantId) return () => {};
  const colRef = collection(db, 'restaurants', restaurantId, 'categories');
  return onSnapshot(colRef, (snapshot) => {
    const cats = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    cats.sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
    callback(cats);
  }, (error) => {
    console.error('subscribeToCategories error:', error);
    if (onError) onError(error);
  });
}

export async function createMenuItem(restaurantId, itemData) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'menuItems');
    const docRef = await addDoc(colRef, {
      ...itemData,
      price: parseFloat(itemData.price) || 0,
      printerDestination: itemData.printerDestination || 'KITCHEN',
      isAvailable: itemData.isAvailable !== undefined ? itemData.isAvailable : true,
      isActive: true,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, ...itemData };
  } catch (error) {
    console.error('createMenuItem error:', error);
    throw error;
  }
}

export async function updateMenuItem(restaurantId, itemId, itemData) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId, 'menuItems', itemId);
    const payload = {
      ...itemData,
      price: itemData.price !== undefined ? parseFloat(itemData.price) : undefined,
      updatedAt: serverTimestamp()
    };
    // remove undefined values
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
    await updateDoc(docRef, payload);
    return { id: itemId, ...itemData };
  } catch (error) {
    console.error('updateMenuItem error:', error);
    throw error;
  }
}

export async function toggleMenuItemAvailability(restaurantId, itemId, currentStatus) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId, 'menuItems', itemId);
    await updateDoc(docRef, { isAvailable: !currentStatus, updatedAt: serverTimestamp() });
    return !currentStatus;
  } catch (error) {
    console.error('toggleMenuItemAvailability error:', error);
    throw error;
  }
}

/**
 * Sets the tracked quantity of a menu item. `qty === null` means unlimited.
 * A quantity of 0 marks the dish Out of Stock; a quantity above 0 puts it
 * back In Stock.
 */
export async function updateMenuItemStock(restaurantId, itemId, qty) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId, 'menuItems', itemId);
    const payload = { stockQty: qty, updatedAt: serverTimestamp() };
    if (qty !== null) payload.isAvailable = qty > 0;
    await updateDoc(docRef, payload);
    return payload;
  } catch (error) {
    console.error('updateMenuItemStock error:', error);
    throw error;
  }
}

/**
 * Reduces stock for every ordered item that has a tracked quantity.
 * Best-effort: the order is already saved, so a failure here only logs.
 */
export async function deductMenuStock(restaurantId, items) {
  const wanted = {};
  (items || []).forEach((i) => {
    const id = i.menuItemId || i.id;
    if (!id) return;
    wanted[id] = (wanted[id] || 0) + (parseInt(i.quantity, 10) || 1);
  });
  const ids = Object.keys(wanted);
  if (ids.length === 0) return;

  try {
    await runTransaction(db, async (transaction) => {
      const refs = ids.map((id) => doc(db, 'restaurants', restaurantId, 'menuItems', id));
      const snaps = await Promise.all(refs.map((r) => transaction.get(r)));
      snaps.forEach((snap, idx) => {
        if (!snap.exists()) return;
        const current = snap.data().stockQty;
        if (typeof current !== 'number') return; // unlimited
        const next = Math.max(0, current - wanted[ids[idx]]);
        const update = { stockQty: next, updatedAt: serverTimestamp() };
        if (next === 0) update.isAvailable = false;
        transaction.update(refs[idx], update);
      });
    });
  } catch (error) {
    console.warn('deductMenuStock failed (the order was still saved):', error);
  }
}

export async function deleteMenuItem(restaurantId, itemId) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId, 'menuItems', itemId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('deleteMenuItem error:', error);
    throw error;
  }
}

// ----------------------------------------------------------------------
// 5. TABLES (Real-Time Synchronisation & Concurrency)
// ----------------------------------------------------------------------

// A table only counts as OCCUPIED / BILL_REQUESTED when it points at a real
// order. Older versions "claimed" a table the moment a waiter tapped it, which
// left empty placeholder claims (e.g. #PENDING-8305, 0 items) stuck on the
// floor. Such leftovers are shown as Available everywhere.
function normalizeTableDoc(d) {
  const data = d.data();
  const inUse = data.status === 'OCCUPIED' || data.status === 'BILL_REQUESTED';
  if (inUse && !data.activeOrder?.orderId) {
    return { id: d.id, ...data, status: 'AVAILABLE', activeOrder: null };
  }
  return { id: d.id, ...data };
}

export async function getTables(restaurantId) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'tables');
    const q = query(colRef, orderBy('tableNumber', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(normalizeTableDoc);
  } catch (error) {
    console.error('getTables error:', error);
    return [];
  }
}

/**
 * Real-time listener for all tables in a restaurant.
 * States: 'AVAILABLE', 'OCCUPIED', 'BILL_REQUESTED', 'PAYMENT_PENDING'
 */
export function subscribeToTables(restaurantId, callback) {
  if (!restaurantId) return () => {};
  const colRef = collection(db, 'restaurants', restaurantId, 'tables');
  const q = query(colRef, orderBy('tableNumber', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const tables = snapshot.docs.map(normalizeTableDoc);
    callback(tables);
  }, (error) => {
    console.error('subscribeToTables error:', error);
  });
}

export async function createTable(restaurantId, tableData) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'tables');
    const docRef = await addDoc(colRef, {
      ...tableData,
      tableNumber: tableData.tableNumber?.toString() || '1',
      capacity: parseInt(tableData.capacity, 10) || 4,
      status: 'AVAILABLE',
      activeOrder: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { id: docRef.id, ...tableData, status: 'AVAILABLE' };
  } catch (error) {
    console.error('createTable error:', error);
    throw error;
  }
}

export async function updateTableStatus(restaurantId, tableId, status, activeOrder = null) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId, 'tables', tableId);
    await updateDoc(docRef, {
      status,
      activeOrder: activeOrder || null,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('updateTableStatus error:', error);
    throw error;
  }
}

export async function deleteTable(restaurantId, tableId) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId, 'tables', tableId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error('deleteTable error:', error);
    throw error;
  }
}

/**
 * Atomically claim a table to prevent race conditions when two waiters select the same table.
 */
export async function claimTableAtomic(restaurantId, tableId, waiterData) {
  const tableRef = doc(db, 'restaurants', restaurantId, 'tables', tableId);

  return await runTransaction(db, async (transaction) => {
    const tableSnap = await transaction.get(tableRef);
    if (!tableSnap.exists()) {
      throw new Error('Table not found.');
    }

    const tableData = tableSnap.data();
    if (tableData.status !== 'AVAILABLE' && tableData.activeOrder?.orderId) {
      // Table is already occupied by an active order
      return {
        success: false,
        alreadyOccupied: true,
        table: { id: tableSnap.id, ...tableData },
        activeOrder: tableData.activeOrder
      };
    }

    // Mark table as OCCUPIED with waiter info
    const initialOrderInfo = {
      orderId: null,
      orderNumber: `PENDING-${Date.now().toString().slice(-4)}`,
      waiterId: waiterData?.uid || null,
      waiterName: waiterData?.name || 'Waiter',
      claimedAt: new Date().toISOString(),
      totalAmount: 0,
      itemCount: 0
    };

    transaction.update(tableRef, {
      status: 'OCCUPIED',
      activeOrder: initialOrderInfo,
      updatedAt: serverTimestamp()
    });

    return {
      success: true,
      alreadyOccupied: false,
      table: { id: tableSnap.id, ...tableData, status: 'OCCUPIED', activeOrder: initialOrderInfo }
    };
  });
}

// ----------------------------------------------------------------------
// 6. ORDERS & REAL-TIME ORDER SUBSCRIPTIONS
// ----------------------------------------------------------------------

export async function getOrders(restaurantId) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'orders');
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(100));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        ...d,
        createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString()
      };
    });
  } catch (error) {
    console.error('getOrders error:', error);
    return [];
  }
}

/**
 * Real-time listener for active (unpaid) orders in the restaurant.
 */
export function subscribeToActiveOrders(restaurantId, callback, onError) {
  if (!restaurantId) return () => {};
  const colRef = collection(db, 'restaurants', restaurantId, 'orders');
  // No orderBy(): `where(==)` + `orderBy(other field)` needs a composite index
  // and fails silently when it is missing. Sorted on the client instead.
  const q = query(colRef, where('paymentStatus', '==', 'UNPAID'));

  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
      };
    });
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    callback(orders);
  }, (error) => {
    console.error('subscribeToActiveOrders error:', error);
    if (onError) onError(error);
  });
}

/**
 * Real-time listener for a single order by ID.
 */
export function subscribeToOrderById(restaurantId, orderId, callback) {
  if (!restaurantId || !orderId) return () => {};
  const docRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);
  return onSnapshot(docRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    const data = snapshot.data();
    callback({
      id: snapshot.id,
      ...data,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString())
    });
  }, (error) => {
    console.error('subscribeToOrderById error:', error);
  });
}

export async function updateOrderStatus(restaurantId, orderId, orderStatus, tableId = null) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);
    await updateDoc(docRef, { orderStatus, updatedAt: serverTimestamp() });

    if ((orderStatus === 'COMPLETED' || orderStatus === 'CANCELLED' || orderStatus === 'CLOSED') && tableId) {
      await updateTableStatus(restaurantId, tableId, 'AVAILABLE', null);
    }
    return true;
  } catch (error) {
    console.error('updateOrderStatus error:', error);
    throw error;
  }
}

export const settleOrderPayment = settleAndReleaseTableAtomic;

/**
 * Cancels an unpaid order in ONE atomic step:
 *  - order -> CANCELLED
 *  - its still-open kitchen tickets -> CANCELLED (so the kitchen screen clears)
 *  - the table is freed, but only if it still points at THIS order, and a
 *    missing table document no longer makes the whole cancel fail.
 */
export async function cancelOrderAtomic(restaurantId, orderId, userContext) {
  const orderRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);

  // Queries are not allowed inside transactions, so find the kitchen tickets first.
  const kotSnap = await getDocs(
    query(collection(db, 'restaurants', restaurantId, 'kots'), where('orderId', '==', orderId))
  );
  const openKotRefs = kotSnap.docs
    .filter((d) => !['SERVED', 'CANCELLED'].includes(d.data().status))
    .map((d) => d.ref);

  const result = await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error('This order no longer exists.');
    const order = orderSnap.data();
    if (order.paymentStatus === 'PAID') throw new Error('A paid order cannot be cancelled.');
    if (order.orderStatus === 'CANCELLED') return { orderNumber: order.orderNumber, already: true };

    // All reads first, then all writes.
    let tableRef = null;
    let tableSnap = null;
    if (order.tableId) {
      tableRef = doc(db, 'restaurants', restaurantId, 'tables', order.tableId);
      tableSnap = await transaction.get(tableRef);
    }

    transaction.update(orderRef, {
      orderStatus: 'CANCELLED',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    openKotRefs.forEach((ref) =>
      transaction.update(ref, { status: 'CANCELLED', updatedAt: serverTimestamp() })
    );
    if (tableSnap && tableSnap.exists()) {
      const active = tableSnap.data().activeOrder;
      if (!active || active.orderId === orderId) {
        transaction.update(tableRef, { status: 'AVAILABLE', activeOrder: null, updatedAt: serverTimestamp() });
      }
    }
    return { orderNumber: order.orderNumber, already: false };
  });

  if (!result.already) {
    await createAuditLog(restaurantId, {
      userId: userContext?.uid,
      userName: userContext?.name,
      role: userContext?.role,
      action: 'ORDER_CANCELLED',
      entityId: orderId,
      details: `Cancelled order #${result.orderNumber}.`
    }).catch(console.error);
  }
  return result;
}

// ----------------------------------------------------------------------
// 7. KOT (KITCHEN ORDER TICKETS) & RUNNING KOT WORKFLOW
// ----------------------------------------------------------------------

/**
 * Real-time listener for active KOT tickets on the Kitchen Display System (KDS).
 */
export function subscribeToKitchenKOTs(restaurantId, callback, onError) {
  if (!restaurantId) return () => {};
  const colRef = collection(db, 'restaurants', restaurantId, 'kots');
  // NOTE: deliberately no orderBy() here. `where(in)` + `orderBy(other field)`
  // needs a composite index; when that index is missing the listener dies
  // silently and the kitchen board stops updating. We sort on the client.
  const q = query(
    colRef,
    where('status', 'in', ['NEW', 'CONFIRMED', 'PREPARING', 'READY'])
  );

  return onSnapshot(q, (snapshot) => {
    const kots = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
      };
    });
    kots.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    callback(kots);
  }, (error) => {
    console.error('subscribeToKitchenKOTs error:', error);
    if (onError) onError(error);
  });
}

/**
 * Dispatches an initial Order and generates KOT #1.
 * Atomic transaction ensuring table binding, order creation, and separate KOT ticket creation.
 */
export async function createOrderWithKOT(restaurantId, orderData, kotItems, waiterData) {
  const timestamp = new Date();
  const dateStr = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const orderNumber = `ORD-${dateStr}-${randomSuffix}`;
  const kotNumber = `KOT-${orderNumber}-1`;

  const orderRef = doc(collection(db, 'restaurants', restaurantId, 'orders'));
  const kotRef = doc(collection(db, 'restaurants', restaurantId, 'kots'));
  const tableRef = orderData.tableId ? doc(db, 'restaurants', restaurantId, 'tables', orderData.tableId) : null;

  const orderPayload = {
    orderNumber,
    restaurantId,
    tableId: orderData.tableId || null,
    tableNumber: orderData.tableNumber || null,
    orderType: orderData.orderType || 'DINE_IN',
    waiterId: waiterData?.uid || null,
    waiterName: waiterData?.name || 'Staff',
    customerName: orderData.customerName || null,
    customerPhone: orderData.customerPhone || null,
    orderNotes: orderData.orderNotes || '',
    items: kotItems.map(item => ({
      menuItemId: item.menuItemId || item.id,
      name: item.name,
      price: parseFloat(item.price) || 0,
      quantity: parseInt(item.quantity, 10) || 1,
      itemTotal: (parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 1),
      notes: item.notes || '',
      printerDestination: item.printerDestination || 'KITCHEN',
      kotNumber
    })),
    subtotal: parseFloat(orderData.subtotal) || 0,
    discountType: orderData.discountType || null,
    discountValue: parseFloat(orderData.discountValue) || 0,
    discountAmount: parseFloat(orderData.discountAmount) || 0,
    taxRate: parseFloat(orderData.taxRate) || 0,
    taxAmount: parseFloat(orderData.taxAmount) || 0,
    totalAmount: parseFloat(orderData.totalAmount) || 0,
    orderStatus: 'CONFIRMED', // OPEN, CONFIRMED, PREPARING, READY, SERVED, BILL_REQUESTED, PAID, CLOSED
    paymentStatus: 'UNPAID',  // UNPAID, PAID
    kotCount: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const kotPayload = {
    kotNumber,
    kotIndex: 1,
    orderId: orderRef.id,
    orderNumber,
    restaurantId,
    tableId: orderData.tableId || null,
    tableNumber: orderData.tableNumber || null,
    orderType: orderData.orderType || 'DINE_IN',
    waiterId: waiterData?.uid || null,
    waiterName: waiterData?.name || 'Staff',
    items: kotItems.map(item => ({
      name: item.name,
      quantity: parseInt(item.quantity, 10) || 1,
      notes: item.notes || '',
      printerDestination: item.printerDestination || 'KITCHEN'
    })),
    orderNotes: orderData.orderNotes || '',
    status: 'NEW', // NEW, CONFIRMED, PREPARING, READY, SERVED, CANCELLED
    isPrinted: false,
    printerDestination: 'KITCHEN',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await runTransaction(db, async (transaction) => {
    // Guard against two waiters opening the same table at the same time.
    if (tableRef) {
      const tableSnap = await transaction.get(tableRef);
      if (!tableSnap.exists()) {
        throw new Error('This table no longer exists.');
      }
      const existingOrderId = tableSnap.data().activeOrder?.orderId;
      if (existingOrderId) {
        const existingRef = doc(db, 'restaurants', restaurantId, 'orders', existingOrderId);
        const existingSnap = await transaction.get(existingRef);
        if (existingSnap.exists()) {
          const ex = existingSnap.data();
          const finished = ex.paymentStatus === 'PAID' || ['CLOSED', 'CANCELLED'].includes(ex.orderStatus);
          if (!finished) {
            throw new Error(`Table ${orderData.tableNumber || ''} already has an open order (#${ex.orderNumber}). Open that order to add items.`);
          }
        }
      }
    }

    transaction.set(orderRef, orderPayload);
    transaction.set(kotRef, kotPayload);

    if (tableRef) {
      transaction.update(tableRef, {
        status: 'OCCUPIED',
        activeOrder: {
          orderId: orderRef.id,
          orderNumber,
          tableNumber: orderData.tableNumber,
          totalAmount: orderPayload.totalAmount,
          itemCount: kotItems.reduce((sum, i) => sum + (parseInt(i.quantity, 10) || 1), 0),
          kotCount: 1,
          waiterName: waiterData?.name || 'Staff',
          status: 'CONFIRMED',
          createdAt: new Date().toISOString()
        },
        updatedAt: serverTimestamp()
      });
    }
  });
  await deductMenuStock(restaurantId, kotItems);

  // Create audit log
  await createAuditLog(restaurantId, {
    userId: waiterData?.uid,
    userName: waiterData?.name,
    role: waiterData?.role,
    action: 'ORDER_CREATED',
    entityId: orderRef.id,
    details: `Order #${orderNumber} created with KOT #${kotNumber} for Table ${orderData.tableNumber || 'N/A'}`
  });

  return {
    order: { id: orderRef.id, ...orderPayload },
    kot: { id: kotRef.id, ...kotPayload }
  };
}

/**
 * Appends new items to an existing running order and creates a separate Running KOT (e.g. KOT-ORD-1042-2).
 * Does NOT alter previously sent KOTs.
 */
export async function addRunningKOTToOrder(restaurantId, orderId, newItems, waiterData, runningNotes = '') {
  const orderRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);

  const runningResult = await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error(`Order ${orderId} not found.`);
    }

    const currentOrder = orderSnap.data();
    if (currentOrder.paymentStatus === 'PAID' || currentOrder.orderStatus === 'CLOSED') {
      throw new Error('Cannot add items to a paid or closed order.');
    }

    const nextKotIndex = (currentOrder.kotCount || 1) + 1;
    const kotNumber = `KOT-${currentOrder.orderNumber}-${nextKotIndex}`;

    // Map new items
    const formattedNewItems = newItems.map(item => ({
      menuItemId: item.menuItemId || item.id,
      name: item.name,
      price: parseFloat(item.price) || 0,
      quantity: parseInt(item.quantity, 10) || 1,
      itemTotal: (parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 1),
      notes: item.notes || '',
      printerDestination: item.printerDestination || 'KITCHEN',
      kotNumber
    }));

    // Recalculate order financial totals
    const mergedItems = [...(currentOrder.items || []), ...formattedNewItems];
    const newSubtotal = mergedItems.reduce((acc, i) => acc + (i.itemTotal || (i.price * i.quantity)), 0);
    
    let discountAmount = 0;
    if (currentOrder.discountType === 'PERCENT') {
      discountAmount = (newSubtotal * (currentOrder.discountValue || 0)) / 100;
    } else if (currentOrder.discountType === 'FLAT') {
      discountAmount = Math.min(newSubtotal, currentOrder.discountValue || 0);
    }

    const taxableAmount = Math.max(0, newSubtotal - discountAmount);
    const taxRate = currentOrder.taxRate || 5.0;
    const taxAmount = (taxableAmount * taxRate) / 100;
    const grandTotal = taxableAmount + taxAmount;

    // Create KOT record
    const kotRef = doc(collection(db, 'restaurants', restaurantId, 'kots'));
    const kotPayload = {
      kotNumber,
      kotIndex: nextKotIndex,
      orderId,
      orderNumber: currentOrder.orderNumber,
      restaurantId,
      tableId: currentOrder.tableId || null,
      tableNumber: currentOrder.tableNumber || null,
      orderType: currentOrder.orderType || 'DINE_IN',
      waiterId: waiterData?.uid || null,
      waiterName: waiterData?.name || 'Staff',
      items: newItems.map(item => ({
        name: item.name,
        quantity: parseInt(item.quantity, 10) || 1,
        notes: item.notes || '',
        printerDestination: item.printerDestination || 'KITCHEN'
      })),
      orderNotes: runningNotes || currentOrder.orderNotes || '',
      status: 'NEW',
      isPrinted: false,
      printerDestination: 'KITCHEN',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    transaction.set(kotRef, kotPayload);

    // Update order
    transaction.update(orderRef, {
      items: mergedItems,
      subtotal: newSubtotal,
      discountAmount,
      taxAmount,
      totalAmount: grandTotal,
      kotCount: nextKotIndex,
      orderStatus: 'CONFIRMED',
      updatedAt: serverTimestamp()
    });

    // Update table active order snapshot if dine-in
    if (currentOrder.tableId) {
      const tableRef = doc(db, 'restaurants', restaurantId, 'tables', currentOrder.tableId);
      transaction.update(tableRef, {
        status: 'OCCUPIED',
        activeOrder: {
          orderId,
          orderNumber: currentOrder.orderNumber,
          tableNumber: currentOrder.tableNumber,
          totalAmount: grandTotal,
          itemCount: mergedItems.reduce((sum, i) => sum + i.quantity, 0),
          kotCount: nextKotIndex,
          waiterName: waiterData?.name || currentOrder.waiterName || 'Staff',
          status: 'CONFIRMED',
          createdAt: currentOrder.createdAt?.toDate ? currentOrder.createdAt.toDate().toISOString() : new Date().toISOString()
        },
        updatedAt: serverTimestamp()
      });
    }

    return {
      kot: { id: kotRef.id, ...kotPayload },
      updatedOrder: {
        ...currentOrder,
        items: mergedItems,
        subtotal: newSubtotal,
        discountAmount,
        taxAmount,
        totalAmount: grandTotal,
        kotCount: nextKotIndex
      }
    };
  });

  await deductMenuStock(restaurantId, newItems);
  return runningResult;
}

/**
 * Updates status of a KOT on KDS: 'NEW' -> 'CONFIRMED' -> 'PREPARING' -> 'READY' -> 'SERVED' -> 'CANCELLED'
 */
export async function updateKOTStatus(restaurantId, kotId, newStatus, orderId = null) {
  try {
    const kotDocRef = doc(db, 'restaurants', restaurantId, 'kots', kotId);
    await updateDoc(kotDocRef, {
      status: newStatus,
      updatedAt: serverTimestamp()
    });

    // If orderId is provided, also sync parent order status if appropriate
    if (orderId && ['PREPARING', 'READY'].includes(newStatus)) {
      const orderDocRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);
      await updateDoc(orderDocRef, {
        orderStatus: newStatus,
        updatedAt: serverTimestamp()
      });
    }

    // Kitchen tapped "Dismiss / Served": tell the waiter who took this order.
    if (newStatus === 'SERVED') {
      await raiseServeAlert(restaurantId, kotDocRef);
    }

    return true;
  } catch (error) {
    console.error('updateKOTStatus error:', error);
    throw error;
  }
}

/**
 * Puts a "kitchen served" alert on the table document. The waiter's app already
 * listens to tables in real time, so no extra collection, index or rule is needed.
 * A failure here must never block the kitchen, so errors are only logged.
 */
async function raiseServeAlert(restaurantId, kotDocRef) {
  try {
    const kotSnap = await getDoc(kotDocRef);
    const kot = kotSnap.exists() ? kotSnap.data() : null;
    if (!kot || !kot.tableId) return; // takeaway / no table -> nothing to show

    const tableRef = doc(db, 'restaurants', restaurantId, 'tables', kot.tableId);
    const tableSnap = await getDoc(tableRef);
    const table = tableSnap.exists() ? tableSnap.data() : {};
    const sameOrder = (o) => o && o.orderNumber === (kot.orderNumber || null);

    // Waiter has not tapped the previous alert yet -> the badge counts up (1, 2, 3 ...)
    const pending = sameOrder(table.serveAlert) ? (table.serveAlert.count || 1) + 1 : 1;

    // Running list of every KOT of this order the kitchen has served (kept after the waiter taps).
    const prevKots = sameOrder(table.servedInfo) ? table.servedInfo.kots || [] : [];
    const kotKey = kot.kotNumber || kotDocRef.id;
    const kots = prevKots.includes(kotKey) ? prevKots : [...prevKots, kotKey];

    await updateDoc(tableRef, {
      serveAlert: {
        alertId: kotDocRef.id,
        kotNumber: kot.kotNumber || null,
        orderNumber: kot.orderNumber || null,
        tableNumber: kot.tableNumber || null,
        waiterId: kot.waiterId || null,
        waiterName: kot.waiterName || null,
        count: pending,
        at: serverTimestamp()
      },
      servedInfo: { orderNumber: kot.orderNumber || null, kots }
    });
  } catch (error) {
    console.warn('raiseServeAlert failed (kitchen action still saved):', error);
  }
}

/** Waiter acknowledged the alert on a table. */
export async function clearServeAlert(restaurantId, tableId) {
  try {
    await updateDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId), { serveAlert: null });
    return true;
  } catch (error) {
    console.error('clearServeAlert error:', error);
    return false;
  }
}

/**
 * Mark KOT as printed
 */
export async function markKOTPrinted(restaurantId, kotId) {
  try {
    const kotDocRef = doc(db, 'restaurants', restaurantId, 'kots', kotId);
    await updateDoc(kotDocRef, { isPrinted: true, printedAt: serverTimestamp() });
    return true;
  } catch (error) {
    console.error('markKOTPrinted error:', error);
    return false;
  }
}

// ----------------------------------------------------------------------
// 8. BILLING, INVOICES & ATOMIC TABLE RELEASE
// ----------------------------------------------------------------------

export async function requestBillForTable(restaurantId, tableId, orderId, waiterData) {
  try {
    const batch = writeBatch(db);

    if (tableId) {
      const tableRef = doc(db, 'restaurants', restaurantId, 'tables', tableId);
      batch.update(tableRef, {
        status: 'BILL_REQUESTED',
        updatedAt: serverTimestamp()
      });
    }

    if (orderId) {
      const orderRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);
      batch.update(orderRef, {
        orderStatus: 'BILL_REQUESTED',
        updatedAt: serverTimestamp()
      });
    }

    await batch.commit();

    await createAuditLog(restaurantId, {
      userId: waiterData?.uid,
      userName: waiterData?.name,
      role: waiterData?.role,
      action: 'BILL_REQUESTED',
      entityId: orderId,
      details: `Bill requested for Table ${tableId}`
    });

    return true;
  } catch (error) {
    console.error('requestBillForTable error:', error);
    throw error;
  }
}

/**
 * Atomically completes payment, generates invoice, closes order, and releases table to 'AVAILABLE'.
 */
export async function settleAndReleaseTableAtomic(restaurantId, orderId, paymentData, userContext) {
  const orderRef = doc(db, 'restaurants', restaurantId, 'orders', orderId);
  const invColRef = collection(db, 'restaurants', restaurantId, 'invoices');
  const invDocRef = doc(invColRef);

  const timestamp = new Date();
  const dateStr = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
  const invoiceNumber = `INV-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

  return await runTransaction(db, async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) {
      throw new Error(`Order ${orderId} not found.`);
    }

    const order = orderSnap.data();
    if (order.paymentStatus === 'PAID') {
      throw new Error(`Order ${order.orderNumber} is already paid.`);
    }

    const invoicePayload = {
      invoiceNumber,
      orderId,
      orderNumber: order.orderNumber,
      orderType: order.orderType || 'DINE_IN',
      tableId: paymentData.tableId || order.tableId || null,
      tableNumber: paymentData.tableNumber || order.tableNumber || null,
      waiterName: order.waiterName || userContext?.name || 'Staff',
      customerName: paymentData.customerName || order.customerName || null,
      customerPhone: paymentData.customerPhone || order.customerPhone || null,
      subtotal: parseFloat(paymentData.subtotal) || order.subtotal || 0,
      discountAmount: parseFloat(paymentData.discountAmount) || 0,
      taxAmount: parseFloat(paymentData.taxAmount) || 0,
      totalAmount: parseFloat(paymentData.totalAmount) || order.totalAmount || 0,
      paymentMethod: paymentData.paymentMethod || 'CASH', // CASH, CARD, UPI
      paymentStatus: 'PAID',
      items: order.items || [],
      issuedAt: new Date().toISOString(),
      billedBy: userContext?.name || 'Cashier',
      createdAt: serverTimestamp()
    };

    // Save invoice
    transaction.set(invDocRef, invoicePayload);

    // Update order to PAID and CLOSED
    transaction.update(orderRef, {
      paymentStatus: 'PAID',
      paymentMethod: paymentData.paymentMethod || 'CASH',
      orderStatus: 'CLOSED',
      invoiceId: invDocRef.id,
      invoiceNumber,
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Release table back to AVAILABLE
    const tableIdToRelease = paymentData.tableId || order.tableId;
    if (tableIdToRelease) {
      const tableRef = doc(db, 'restaurants', restaurantId, 'tables', tableIdToRelease);
      transaction.update(tableRef, {
        status: 'AVAILABLE',
        activeOrder: null,
        updatedAt: serverTimestamp()
      });
    }

    return { id: invDocRef.id, ...invoicePayload };
  }).then(async (result) => {
    // Log audit
    await createAuditLog(restaurantId, {
      userId: userContext?.uid,
      userName: userContext?.name,
      role: userContext?.role,
      action: 'PAYMENT_COMPLETED',
      entityId: orderId,
      details: `Settled ${paymentData.paymentMethod} ₹${paymentData.totalAmount} for #${result.orderNumber}. Table ${paymentData.tableNumber || 'N/A'} released.`
    }).catch(console.error);

    return result;
  });
}

export async function getInvoices(restaurantId) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'invoices');
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(100));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('getInvoices error:', error);
    return [];
  }
}

// ----------------------------------------------------------------------
// 9. AUDIT TRAIL LOGGING
// ----------------------------------------------------------------------

export async function createAuditLog(restaurantId, logData) {
  try {
    if (!restaurantId) return null;
    const colRef = collection(db, 'restaurants', restaurantId, 'auditLogs');
    const docRef = await addDoc(colRef, {
      ...logData,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    console.error('createAuditLog error:', error);
    return null;
  }
}

export async function getAuditLogs(restaurantId) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'auditLogs');
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('getAuditLogs error:', error);
    return [];
  }
}

// ----------------------------------------------------------------------
// 9b. DATA RETENTION (manual cleanup of old, finished records)
// ----------------------------------------------------------------------

// Max documents handled per collection per run. Keeps one click far inside the
// free-tier daily quotas (50k reads / 20k deletes) - just run it again for more.
export const CLEANUP_CAP_PER_COLLECTION = 5000;

// Only FINISHED records are ever deleted. Open / unpaid orders and live
// kitchen tickets are never touched, whatever their age.
const isFinishedOrder = (d) => d.paymentStatus === 'PAID' || ['CLOSED', 'CANCELLED'].includes(d.orderStatus);
const isFinishedKot = (d) => ['SERVED', 'CANCELLED'].includes(d.status);

// Best-effort creation date of a document (Timestamp, Date, ISO string or number).
const docDate = (data) => {
  const c = data.createdAt;
  if (c && typeof c.toDate === 'function') return c.toDate();
  if (c instanceof Date) return c;
  const v = c ?? data.issuedAt;
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/**
 * Reads the OLDEST documents of one collection straight from the Firebase
 * SERVER (never a local cache), using the same orderBy('createdAt') read that
 * the Orders / Reports pages already use. The date filter is applied here, so
 * it does not depend on a server-side range query.
 * cutoff = null means "everything".
 */
async function readOldDocs(restaurantId, kind, cutoff) {
  const colRef = collection(db, 'restaurants', restaurantId, kind);
  const snap = await getDocsFromServer(
    query(colRef, orderBy('createdAt', 'asc'), limit(CLEANUP_CAP_PER_COLLECTION))
  );
  const docs = snap.docs.filter((d) => {
    if (!cutoff) return true;
    const when = docDate(d.data());
    return !!when && when < cutoff;
  });
  const lastWhen = snap.docs.length ? docDate(snap.docs[snap.docs.length - 1].data()) : null;
  const capped = snap.size >= CLEANUP_CAP_PER_COLLECTION && (!cutoff || (lastWhen && lastWhen < cutoff));
  return { docs, capped };
}

/**
 * Finds orders / kitchen tickets / invoices created BEFORE `cutoff` (a Date),
 * or ALL of them when cutoff is null. Nothing is deleted here.
 *
 *  - orders / kots / invoices : what a cleanup would delete (finished only)
 *  - allOrders / allKots      : everything found, used for the Excel backup
 */
export async function previewOldRecords(restaurantId, cutoff = null) {
  const result = { cutoff, capped: false, orders: [], kots: [], invoices: [], allOrders: [], allKots: [] };

  const [orderRes, kotRes, invoiceRes] = await Promise.all([
    readOldDocs(restaurantId, 'orders', cutoff),
    readOldDocs(restaurantId, 'kots', cutoff),
    readOldDocs(restaurantId, 'invoices', cutoff)
  ]);
  result.capped = orderRes.capped || kotRes.capped || invoiceRes.capped;

  const toRecord = (d) => ({ ref: d.ref, id: d.id, data: d.data() });

  result.allOrders = orderRes.docs.map(toRecord);
  result.allKots = kotRes.docs.map(toRecord);
  result.orders = result.allOrders.filter((o) => isFinishedOrder(o.data));

  // A kitchen ticket goes if it is finished itself, or if its order is being
  // removed (so a ticket stuck on READY can't linger forever).
  const removedOrderIds = new Set(result.orders.map((o) => o.id));
  result.kots = result.allKots.filter((k) => isFinishedKot(k.data) || removedOrderIds.has(k.data.orderId));

  result.invoices = invoiceRes.docs.map(toRecord);
  return result;
}

/**
 * Deletes exactly the records found by previewOldRecords(), then re-reads the
 * Firebase server to PROVE they are gone (so nothing is left only in a cache).
 * onProgress(deletedSoFar, total) is called after every batch.
 * Returns { deleted, remaining }.
 */
export async function deleteOldRecords(restaurantId, preview, userContext, onProgress) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You are offline. Connect to the internet, then try again.');
  }

  const groups = { orders: preview.orders, kots: preview.kots, invoices: preview.invoices };
  const refs = [...preview.orders, ...preview.kots, ...preview.invoices].map((r) => r.ref);
  const BATCH_SIZE = 400;
  let deleted = 0;

  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const chunk = refs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit(); // resolves only after the Firebase server accepted it
    deleted += chunk.length;
    if (onProgress) onProgress(deleted, refs.length);
  }

  // Verify against the server.
  let remaining = 0;
  for (const [kind, records] of Object.entries(groups)) {
    if (records.length === 0) continue;
    const ids = new Set(records.map((r) => r.id));
    const { docs } = await readOldDocs(restaurantId, kind, preview.cutoff);
    remaining += docs.filter((d) => ids.has(d.id)).length;
  }
  if (remaining > 0) {
    throw new Error(`${remaining} records are still on the server. Scan again and retry.`);
  }

  const upTo = preview.cutoff ? new Date(preview.cutoff.getTime() - 1) : new Date();
  await createAuditLog(restaurantId, {
    userId: userContext?.uid,
    userName: userContext?.name,
    role: userContext?.role,
    action: 'DATA_CLEANUP',
    entityId: restaurantId,
    details: `Deleted ${preview.orders.length} orders, ${preview.kots.length} kitchen tickets, ${preview.invoices.length} invoices up to ${upTo.toLocaleDateString('en-CA')} (Excel backup downloaded first).`
  });
  await saveCleanupMeta(restaurantId, ['lastCleanupAt']);

  return { deleted, remaining: 0 };
}

// "Last backup / last cleanup" dates, used for the every-7-days reminder.
const cleanupMetaRef = (restaurantId) => doc(db, 'restaurants', restaurantId, 'settings', 'dataCleanup');

export async function getCleanupMeta(restaurantId) {
  try {
    const snap = await getDoc(cleanupMetaRef(restaurantId));
    if (!snap.exists()) return {};
    const d = snap.data();
    return {
      lastBackupAt: d.lastBackupAt?.toDate ? d.lastBackupAt.toDate() : null,
      lastCleanupAt: d.lastCleanupAt?.toDate ? d.lastCleanupAt.toDate() : null
    };
  } catch (error) {
    console.error('getCleanupMeta error:', error);
    return {};
  }
}

/** keys: any of 'lastBackupAt' | 'lastCleanupAt' - each is stamped with the server time. */
export async function saveCleanupMeta(restaurantId, keys) {
  try {
    const patch = {};
    keys.forEach((k) => { patch[k] = serverTimestamp(); });
    await setDoc(cleanupMetaRef(restaurantId), patch, { merge: true });
  } catch (error) {
    console.error('saveCleanupMeta error:', error);
  }
}

// ----------------------------------------------------------------------
// 10. PRINTER CONFIGURATIONS
// ----------------------------------------------------------------------

export async function getPrinterConfigs(restaurantId) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId, 'settings', 'printers');
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) {
      return {
        kitchenPrinter: { paperSize: '80mm', autoPrint: true, bridgeUrl: '' },
        barPrinter: { paperSize: '80mm', autoPrint: false, bridgeUrl: '' },
        billingPrinter: { paperSize: '80mm', autoPrint: true, bridgeUrl: '' }
      };
    }
    return snapshot.data();
  } catch (error) {
    console.error('getPrinterConfigs error:', error);
    return {
      kitchenPrinter: { paperSize: '80mm', autoPrint: true, bridgeUrl: '' },
      barPrinter: { paperSize: '80mm', autoPrint: false, bridgeUrl: '' },
      billingPrinter: { paperSize: '80mm', autoPrint: true, bridgeUrl: '' }
    };
  }
}

export async function savePrinterConfigs(restaurantId, configs) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId, 'settings', 'printers');
    await setDoc(docRef, { ...configs, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch (error) {
    console.error('savePrinterConfigs error:', error);
    throw error;
  }
}

// ----------------------------------------------------------------------
// 11. INVENTORY & RESERVATIONS (Existing working functions maintained)
// ----------------------------------------------------------------------

export async function getInventory(restaurantId) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'inventory');
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        ...d,
        isLowStock: d.quantity < d.minThreshold
      };
    });
  } catch (error) {
    console.error('getInventory error:', error);
    return [];
  }
}

export async function createInventoryItem(restaurantId, itemData) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'inventory');
    const docRef = await addDoc(colRef, {
      ...itemData,
      quantity: parseFloat(itemData.quantity) || 0,
      minThreshold: parseFloat(itemData.minThreshold) || 5,
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, ...itemData };
  } catch (error) {
    console.error('createInventoryItem error:', error);
    throw error;
  }
}

export async function adjustInventoryStock(restaurantId, itemId, currentQty, type, changeQty, reason = '') {
  try {
    let newQty = currentQty;
    const change = parseFloat(changeQty);
    if (type === 'IN') newQty += change;
    else if (type === 'OUT') newQty = Math.max(0, newQty - change);
    else if (type === 'ADJUSTMENT') newQty = change;

    const docRef = doc(db, 'restaurants', restaurantId, 'inventory', itemId);
    await updateDoc(docRef, { quantity: newQty, updatedAt: serverTimestamp() });

    const txnColRef = collection(db, 'restaurants', restaurantId, 'inventory', itemId, 'transactions');
    await addDoc(txnColRef, {
      type,
      quantity: change,
      newQuantity: newQty,
      reason,
      createdAt: serverTimestamp()
    });

    return newQty;
  } catch (error) {
    console.error('adjustInventoryStock error:', error);
    throw error;
  }
}

export async function getReservations(restaurantId) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'reservations');
    const q = query(colRef, orderBy('reservationDate', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('getReservations error:', error);
    return [];
  }
}

export async function createReservation(restaurantId, resData) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'reservations');
    const docRef = await addDoc(colRef, {
      ...resData,
      status: 'CONFIRMED',
      createdAt: serverTimestamp()
    });
    return { id: docRef.id, ...resData, status: 'CONFIRMED' };
  } catch (error) {
    console.error('createReservation error:', error);
    throw error;
  }
}

export async function updateReservationStatus(restaurantId, resId, status) {
  try {
    const docRef = doc(db, 'restaurants', restaurantId, 'reservations', resId);
    await updateDoc(docRef, { status, updatedAt: serverTimestamp() });
    return true;
  } catch (error) {
    console.error('updateReservationStatus error:', error);
    throw error;
  }
}
