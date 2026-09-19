import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
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
    const q = query(colRef, where('restaurantId', '==', restaurantId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('getStaffByRestaurant error:', error);
    return [];
  }
}

const LOCAL_USERS_KEY = 'restopulse_provisioned_users_cache';

function getLocalProvisionedUsers() {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalProvisionedUsers(list) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to save to local cache:', e);
  }
}

export async function getAllUsers() {
  let firestoreList = [];
  try {
    const colRef = collection(db, 'users');
    const snapshot = await getDocs(colRef);
    firestoreList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn('getAllUsers Firestore fetch warning (falling back to local cache):', error);
  }

  const localList = getLocalProvisionedUsers();
  // Merge unique by email or id
  const map = new Map();
  localList.forEach(u => map.set(u.id || u.email, u));
  firestoreList.forEach(u => map.set(u.id || u.email, u));

  const merged = Array.from(map.values());
  saveLocalProvisionedUsers(merged);
  return merged;
}

export async function createProvisionedUser(userData) {
  const cleanEmail = (userData.email || '').toLowerCase().trim();
  const rolePrefix = userData.role || 'user';
  const docId = `${rolePrefix}-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;

  const payload = {
    id: docId,
    name: userData.name?.trim() || 'Staff Member',
    email: cleanEmail,
    username: userData.username?.trim() || cleanEmail,
    password: userData.password || 'Staff123$',
    restaurantId: userData.restaurantId || 'spice-haven',
    restaurantName: userData.restaurantName || 'Spice Haven Bistro',
    role: userData.role || 'restaurant_admin',
    status: userData.status || 'active',
    createdBy: 'Super Admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Always update LocalStorage cache first so registration never fails
  const localList = getLocalProvisionedUsers().filter(u => u.id !== docId && u.email !== cleanEmail);
  localList.push(payload);
  saveLocalProvisionedUsers(localList);

  // Then try saving to Firestore
  try {
    const docRef = doc(db, 'users', docId);
    await setDoc(docRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.warn('createProvisionedUser Firestore warning (saved locally):', error);
  }

  return payload;
}

export async function updateProvisionedUser(userId, updateData) {
  const localList = getLocalProvisionedUsers();
  const index = localList.findIndex(u => u.id === userId);
  if (index !== -1) {
    localList[index] = { ...localList[index], ...updateData, updatedAt: new Date().toISOString() };
    saveLocalProvisionedUsers(localList);
  }

  try {
    const docRef = doc(db, 'users', userId);
    await updateDoc(docRef, {
      ...updateData,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.warn('updateProvisionedUser Firestore warning (updated locally):', error);
  }
  return { id: userId, ...updateData };
}

export async function deleteProvisionedUser(userId) {
  const localList = getLocalProvisionedUsers().filter(u => u.id !== userId);
  saveLocalProvisionedUsers(localList);

  try {
    const docRef = doc(db, 'users', userId);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn('deleteProvisionedUser Firestore warning (deleted locally):', error);
  }
  return true;
}

export async function getAllRestaurantAdmins() {
  const all = await getAllUsers();
  return all.filter(u => u.role === 'restaurant_admin');
}

export async function createRestaurantAdmin(adminData) {
  return createProvisionedUser({
    ...adminData,
    role: 'restaurant_admin'
  });
}

export async function updateRestaurantAdmin(userId, updateData) {
  return updateProvisionedUser(userId, updateData);
}

export async function deleteRestaurantAdmin(userId) {
  return deleteProvisionedUser(userId);
}

/**
 * Validates credentials for a user against Firestore users collection or local provisioned store.
 */
export async function authenticateUserFromFirestore(identifier, password) {
  const cleanId = (identifier || '').toLowerCase().trim();

  // First check local cache
  const localList = getLocalProvisionedUsers();
  const localMatch = localList.find(
    u => (u.email?.toLowerCase() === cleanId || u.username?.toLowerCase() === cleanId)
  );

  let userData = localMatch;

  // Also query Firestore if not in local cache or to sync
  if (!userData) {
    try {
      const colRef = collection(db, 'users');
      const qEmail = query(colRef, where('email', '==', cleanId));
      let snapshot = await getDocs(qEmail);

      if (snapshot.empty) {
        const qUsername = query(colRef, where('username', '==', cleanId));
        snapshot = await getDocs(qUsername);
      }

      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        userData = { id: userDoc.id, ...userDoc.data() };
      }
    } catch (error) {
      console.warn('authenticateUserFromFirestore error:', error);
    }
  }

  if (!userData) {
    return null;
  }

  // Verify status
  if (userData.status === 'suspended' || userData.status === 'inactive') {
    return { error: 'Your account has been suspended by the Super Admin.' };
  }

  // Verify password provisioned by Super Admin
  if (userData.password && userData.password !== password) {
    return { error: 'Incorrect password.' };
  }

  return {
    id: userData.id || userData.email,
    ...userData
  };
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

export function subscribeToMenuItems(restaurantId, callback) {
  if (!restaurantId) return () => {};
  const colRef = collection(db, 'restaurants', restaurantId, 'menuItems');
  return onSnapshot(colRef, (snapshot) => {
    const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(items);
  }, (error) => {
    console.error('subscribeToMenuItems error:', error);
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

export async function getTables(restaurantId) {
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'tables');
    const q = query(colRef, orderBy('tableNumber', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
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
    const tables = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
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
export function subscribeToActiveOrders(restaurantId, callback) {
  if (!restaurantId) return () => {};
  const colRef = collection(db, 'restaurants', restaurantId, 'orders');
  const q = query(
    colRef,
    where('paymentStatus', '==', 'UNPAID'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
      };
    });
    callback(orders);
  }, (error) => {
    console.error('subscribeToActiveOrders error:', error);
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
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
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

// ----------------------------------------------------------------------
// 7. KOT (KITCHEN ORDER TICKETS) & RUNNING KOT WORKFLOW
// ----------------------------------------------------------------------

/**
 * Real-time listener for active KOT tickets on the Kitchen Display System (KDS).
 */
export function subscribeToKitchenKOTs(restaurantId, callback) {
  if (!restaurantId) return () => {};
  const colRef = collection(db, 'restaurants', restaurantId, 'kots');
  const q = query(
    colRef,
    where('status', 'in', ['NEW', 'CONFIRMED', 'PREPARING', 'READY']),
    orderBy('createdAt', 'asc')
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
    callback(kots);
  }, (error) => {
    console.error('subscribeToKitchenKOTs error:', error);
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

  const batch = writeBatch(db);
  batch.set(orderRef, orderPayload);
  batch.set(kotRef, kotPayload);

  if (tableRef) {
    batch.update(tableRef, {
      status: 'OCCUPIED',
      activeOrder: {
        orderId: orderRef.id,
        orderNumber,
        tableNumber: orderData.tableNumber,
        totalAmount: orderPayload.totalAmount,
        itemCount: kotItems.reduce((sum, i) => sum + (parseInt(i.quantity, 10) || 1), 0),
        waiterName: waiterData?.name || 'Staff',
        status: 'CONFIRMED',
        createdAt: new Date().toISOString()
      },
      updatedAt: serverTimestamp()
    });
  }

  await batch.commit();

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

  return await runTransaction(db, async (transaction) => {
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

    return true;
  } catch (error) {
    console.error('updateKOTStatus error:', error);
    throw error;
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
      details: `Settled ${paymentData.paymentMethod} ₹${paymentData.totalAmount} for #${order.orderNumber}. Table ${paymentData.tableNumber || 'N/A'} released.`
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
