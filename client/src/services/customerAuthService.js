/**
 * Customer Auth Service
 * Thin wrapper around Firebase Authentication for public (customer) accounts.
 * Customers are stored in Firestore: customers/{uid}
 */

import {
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
} from '../firebase/config';

// ─── Register ─────────────────────────────────────────────────────────────────

export async function customerRegister({ name, email, phone, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(cred.user);

  const ref = doc(db, 'customers', cred.user.uid);
  await setDoc(ref, {
    name,
    email: email.toLowerCase(),
    phone: phone || '',
    role: 'customer',
    emailVerified: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return cred.user;
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function customerLogin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);

  const ref = doc(db, 'customers', cred.user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // Could be a staff member trying to use the customer portal – block them.
    await signOut(auth);
    throw new Error('No customer account found. Please register first.');
  }

  const profile = snap.data();
  if (profile.role !== 'customer') {
    await signOut(auth);
    throw new Error('Please use the staff login portal.');
  }

  // Update emailVerified flag lazily.
  if (!profile.emailVerified && cred.user.emailVerified) {
    await updateDoc(ref, { emailVerified: true, updatedAt: serverTimestamp() });
  }

  return { uid: cred.user.uid, ...profile };
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function customerSignOut() {
  await signOut(auth);
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function customerResetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// ─── Watch auth state ─────────────────────────────────────────────────────────

export function onCustomerAuthChange(callback) {
  return onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) { callback(null); return; }

    const ref = doc(db, 'customers', fbUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().role !== 'customer') { callback(null); return; }

    callback({ uid: fbUser.uid, ...snap.data() });
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getCustomerProfile(uid) {
  const snap = await getDoc(doc(db, 'customers', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function updateCustomerProfile(uid, data) {
  await updateDoc(doc(db, 'customers', uid), { ...data, updatedAt: serverTimestamp() });
}
