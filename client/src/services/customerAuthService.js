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
  signInAnonymously,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
} from '../firebase/config';

// ─── Anonymous Session Helper ─────────────────────────────────────────────────

export async function ensureCustomerAuthSession() {
  if (auth?.currentUser) return auth.currentUser;
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (err) {
    console.warn('ensureCustomerAuthSession warning:', err);
    return null;
  }
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function customerRegister({ name, email, phone, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPhone = (phone || '').trim();
  const cleanName = (name || '').trim();

  let cred;
  let isExistingAuthUser = false;

  try {
    cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  } catch (err) {
    if (err?.code === 'auth/email-already-in-use') {
      // The email already exists in Firebase Authentication.
      // Attempt to sign in with the provided password:
      try {
        cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        isExistingAuthUser = true;
      } catch (signInErr) {
        // Password did not match or account disabled
        const customErr = new Error(
          'This email is already registered. If you already have an account, please log in with your password or use "Forgot password?" to reset it.'
        );
        customErr.code = 'auth/email-already-in-use';
        throw customErr;
      }
    } else {
      throw err;
    }
  }

  // 1. Create or update customer profile in Firestore FIRST
  const ref = doc(db, 'customers', cred.user.uid);
  let existingData = {};
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      existingData = snap.data();
    }
  } catch (readErr) {
    console.warn('Could not read existing customer doc, proceeding with merge:', readErr);
  }

  await setDoc(
    ref,
    {
      name: cleanName || existingData.name || cleanEmail.split('@')[0],
      email: cleanEmail,
      phone: cleanPhone || existingData.phone || '',
      role: 'customer',
      emailVerified: Boolean(cred.user.emailVerified),
      createdAt: existingData.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // 2. Non-blocking verification email attempt (only for newly created accounts)
  if (!isExistingAuthUser && !cred.user.emailVerified) {
    try {
      await sendEmailVerification(cred.user);
    } catch (emailErr) {
      console.warn('Non-blocking: could not send email verification:', emailErr);
    }
  }

  const profile = {
    uid: cred.user.uid,
    name: cleanName || existingData.name || cleanEmail.split('@')[0],
    email: cleanEmail,
    phone: cleanPhone || existingData.phone || '',
    role: 'customer',
    emailVerified: Boolean(cred.user.emailVerified),
  };

  return { user: cred.user, profile, isExistingAuthUser };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function customerLogin(email, password) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);

  const ref = doc(db, 'customers', cred.user.uid);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    console.warn('Error reading customer document on login:', err);
  }

  if (!snap || !snap.exists()) {
    // Check if user has a profile in users collection (e.g. staff/admin using Customer Portal)
    let extraName = '';
    let extraPhone = '';
    try {
      const userRef = doc(db, 'users', cred.user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        extraName = userSnap.data()?.name || '';
        extraPhone = userSnap.data()?.phone || '';
      }
    } catch (checkErr) {}

    // Auto-heal / provision customer profile document so user can seamlessly access Customer Portal
    const newProfile = {
      name: extraName || cred.user.displayName || cleanEmail.split('@')[0],
      email: cleanEmail,
      phone: extraPhone || cred.user.phoneNumber || '',
      role: 'customer',
      emailVerified: Boolean(cred.user.emailVerified),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(ref, newProfile, { merge: true });
    } catch (e) {
      console.warn('Could not auto-provision customer profile:', e);
    }

    return { uid: cred.user.uid, ...newProfile };
  }

  const profile = snap.data();

  // Update emailVerified flag lazily if needed
  if (!profile.emailVerified && cred.user.emailVerified) {
    try {
      await updateDoc(ref, { emailVerified: true, updatedAt: serverTimestamp() });
    } catch (e) {
      // Non-blocking
    }
  }

  return { uid: cred.user.uid, ...profile };
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function customerSignOut() {
  await signOut(auth);
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function customerResetPassword(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  await sendPasswordResetEmail(auth, cleanEmail);
}

// ─── Watch auth state ─────────────────────────────────────────────────────────

export function onCustomerAuthChange(callback) {
  return onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser) {
      callback(null);
      return;
    }

    // Anonymous guest session (for frictionless tracking and ordering)
    if (fbUser.isAnonymous) {
      callback({
        uid: fbUser.uid,
        name: 'Guest Customer',
        email: '',
        phone: '',
        role: 'customer',
        isAnonymous: true,
      });
      return;
    }

    try {
      const ref = doc(db, 'customers', fbUser.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        callback({ uid: fbUser.uid, ...snap.data(), role: 'customer' });
        return;
      }

      // Check if this is an existing staff/admin user
      const userRef = doc(db, 'users', fbUser.uid);
      const userSnap = await getDoc(userRef);
      const staffData = userSnap.exists() ? userSnap.data() : null;

      // Synthesize customer profile
      callback({
        uid: fbUser.uid,
        name: staffData?.name || fbUser.displayName || (fbUser.email || '').split('@')[0],
        email: (fbUser.email || '').toLowerCase(),
        phone: staffData?.phone || fbUser.phoneNumber || '',
        role: 'customer',
        emailVerified: Boolean(fbUser.emailVerified),
      });
    } catch (e) {
      console.warn('onCustomerAuthChange error, falling back to basic auth synthesis:', e);
      callback({
        uid: fbUser.uid,
        name: fbUser.displayName || (fbUser.email || '').split('@')[0],
        email: (fbUser.email || '').toLowerCase(),
        phone: fbUser.phoneNumber || '',
        role: 'customer',
        emailVerified: Boolean(fbUser.emailVerified),
      });
    }
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
