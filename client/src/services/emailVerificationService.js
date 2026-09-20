import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  deleteUser
} from 'firebase/auth';
import { firebaseConfig, db, collection, addDoc, serverTimestamp } from '../firebase/config';

/**
 * Real email confirmation for provisioned accounts (Restaurant Admin / Staff).
 *
 * Uses Firebase Authentication's built-in verification email. A dedicated,
 * secondary Firebase app instance is used so this never touches the main app.
 *
 * Firebase Console setup (one time):
 *   Authentication -> Sign-in method -> enable "Email/Password".
 */

const VERIFY_APP_NAME = 'restopulse-email-verification';

function getVerifyAuth() {
  const existing = getApps().find((a) => a.name === VERIFY_APP_NAME);
  const app = existing || initializeApp(firebaseConfig, VERIFY_APP_NAME);
  return getAuth(app);
}

export const SPAM_NOTICE =
  'The confirmation email may land in the Spam / Junk / Promotions folder. Ask the recipient to check there, and to mark it "Not spam".';

export function friendlyAuthError(err) {
  const code = err?.code || '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is disabled in Firebase. Enable it under Firebase Console → Authentication → Sign-in method.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters for email confirmation.';
    case 'auth/invalid-email':
      return 'This email address is not valid.';
    case 'auth/too-many-requests':
      return 'Too many email requests. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error while contacting Firebase. Check your internet connection.';
    case 'PASSWORD_MISMATCH':
      return 'This email already has a Firebase login with a different password, so a confirmation email could not be sent.';
    default:
      return err?.message || 'Could not send the confirmation email.';
  }
}

/**
 * Signs in (or creates) the Firebase Auth user for this email on the
 * secondary auth instance. Returns the Firebase user.
 */
async function getOrCreateAuthUser(auth, email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (err) {
    if (err?.code !== 'auth/email-already-in-use') throw err;
  }
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (err) {
    const mismatch = new Error('password mismatch');
    mismatch.code = 'PASSWORD_MISMATCH';
    throw mismatch;
  }
}

async function logEmailEvent(payload) {
  try {
    await addDoc(collection(db, 'email_notifications'), {
      ...payload,
      sentAt: serverTimestamp()
    });
  } catch (e) {
    // Logging is best-effort only.
  }
}

/**
 * Sends (or re-sends) the real confirmation email.
 * Never throws — returns { success, alreadyVerified, error }.
 */
export async function sendAccountVerificationEmail({
  email,
  password,
  name = '',
  role = '',
  restaurantId = '',
  restaurantName = '',
  createdBy = ''
}) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const auth = getVerifyAuth();

  try {
    const fbUser = await getOrCreateAuthUser(auth, cleanEmail, password);

    if (fbUser.emailVerified) {
      await signOut(auth);
      return { success: true, alreadyVerified: true };
    }

    const continueUrl = `${window.location.origin}/login`;
    try {
      await sendEmailVerification(fbUser, { url: continueUrl });
    } catch (err) {
      // Domain not whitelisted in Firebase -> send the default email instead.
      if (err?.code === 'auth/unauthorized-continue-uri' || err?.code === 'auth/invalid-continue-uri') {
        await sendEmailVerification(fbUser);
      } else {
        throw err;
      }
    }
    await signOut(auth);

    await logEmailEvent({
      recipientEmail: cleanEmail,
      recipientName: name,
      role,
      restaurantId,
      restaurantName,
      subject: 'Firebase email verification',
      status: 'SENT',
      provider: 'Firebase Authentication',
      createdBy
    });

    return { success: true, alreadyVerified: false };
  } catch (err) {
    console.warn('sendAccountVerificationEmail error:', err);
    try { await signOut(auth); } catch (e) { /* ignore */ }
    await logEmailEvent({
      recipientEmail: cleanEmail,
      recipientName: name,
      role,
      restaurantId,
      restaurantName,
      subject: 'Firebase email verification',
      status: 'FAILED',
      provider: 'Firebase Authentication',
      error: err?.code || String(err),
      createdBy
    });
    return { success: false, alreadyVerified: false, error: friendlyAuthError(err) };
  }
}

/**
 * Asks Firebase whether the recipient has clicked the confirmation link.
 * Returns { verified, error }.
 */
export async function checkEmailVerified(email, password) {
  const auth = getVerifyAuth();
  try {
    const cred = await signInWithEmailAndPassword(
      auth,
      (email || '').toLowerCase().trim(),
      password
    );
    await cred.user.reload();
    const verified = !!auth.currentUser?.emailVerified;
    await signOut(auth);
    return { verified };
  } catch (err) {
    console.warn('checkEmailVerified error:', err);
    try { await signOut(auth); } catch (e) { /* ignore */ }
    // No Firebase user yet = the confirmation email was never sent.
    return { verified: false, error: friendlyAuthError(err), neverSent: true };
  }
}

/**
 * Best-effort cleanup of the Firebase Auth user when an account is deleted,
 * so the same email can be provisioned again later.
 */
export async function removeVerificationUser(email, password) {
  const auth = getVerifyAuth();
  try {
    const cred = await signInWithEmailAndPassword(
      auth,
      (email || '').toLowerCase().trim(),
      password
    );
    await deleteUser(cred.user);
  } catch (err) {
    try { await signOut(auth); } catch (e) { /* ignore */ }
  }
}
