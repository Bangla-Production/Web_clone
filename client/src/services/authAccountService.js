import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
  signOut
} from 'firebase/auth';
import { firebaseConfig } from '../firebase/config';

/**
 * Firebase Authentication helpers for provisioning accounts.
 *
 * Every RestoPulse login is a real Firebase Auth user (so Firestore security
 * rules can identify who is calling). New accounts are created on a SECONDARY
 * Firebase app instance, so the admin who is creating the account stays
 * signed in on the main app.
 *
 * Passwords are never stored in Firestore.
 *
 * Firebase Console setup (one time):
 *   Authentication -> Sign-in method -> enable "Email/Password".
 */

const SECONDARY_APP_NAME = 'restopulse-account-provisioning';

function getSecondaryAuth() {
  const existing = getApps().find((a) => a.name === SECONDARY_APP_NAME);
  const app = existing || initializeApp(firebaseConfig, SECONDARY_APP_NAME);
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
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'This email address is not valid.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error while contacting Firebase. Check your internet connection.';
    case 'auth/email-already-in-use':
    case 'EMAIL_IN_USE':
      return 'This email already has a login. Use a different email address.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Incorrect email or password.';
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'Firebase API key is invalid. Check client/.env (the file must be named ".env") and restart npm run dev.';
    default:
      return err?.message || 'Something went wrong.';
  }
}

function makeError(code, message) {
  const e = new Error(message || friendlyAuthError({ code }));
  e.code = code;
  return e;
}

async function sendVerification(fbUser) {
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
}

/**
 * Creates the Firebase Auth login and sends the confirmation email.
 *
 * If the email already has a login (e.g. the account was deleted from RestoPulse
 * earlier — the browser cannot delete a Firebase login), the login is reused:
 *  - same password  -> confirmation email is sent as usual
 *  - other password -> a password-reset email is sent so the person can choose
 *    a new password (the password typed by the admin will not work)
 *
 * Throws if the login cannot be created / reused.
 * Returns { alreadyVerified, emailSent, emailError, passwordReset }.
 */
export async function createAuthAccount({ email, password }) {
  const auth = getSecondaryAuth();
  const cleanEmail = (email || '').toLowerCase().trim();

  let fbUser;
  try {
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    fbUser = cred.user;
  } catch (err) {
    if (err?.code === 'auth/email-already-in-use') {
      // Re-adding an email that was provisioned before: only possible with the same password.
      try {
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        fbUser = cred.user;
      } catch (e2) {
        // Existing login with a different password -> let the person set a new one by email.
        try {
          try {
            await sendPasswordResetEmail(auth, cleanEmail, { url: `${window.location.origin}/login` });
          } catch (e3) {
            if (e3?.code === 'auth/unauthorized-continue-uri' || e3?.code === 'auth/invalid-continue-uri') {
              await sendPasswordResetEmail(auth, cleanEmail);
            } else {
              throw e3;
            }
          }
          return { alreadyVerified: false, emailSent: true, emailError: '', passwordReset: true };
        } catch (e4) {
          throw makeError('EMAIL_IN_USE', `This email already has a login and the password-reset email could not be sent: ${friendlyAuthError(e4)}`);
        }
      }
    } else {
      throw makeError(err?.code || 'unknown', friendlyAuthError(err));
    }
  }

  try {
    if (fbUser.emailVerified) {
      return { alreadyVerified: true, emailSent: false, emailError: '', passwordReset: false };
    }
    try {
      await sendVerification(fbUser);
      return { alreadyVerified: false, emailSent: true, emailError: '', passwordReset: false };
    } catch (err) {
      return { alreadyVerified: false, emailSent: false, emailError: friendlyAuthError(err), passwordReset: false };
    }
  } finally {
    try { await signOut(auth); } catch (e) { /* ignore */ }
  }
}

/**
 * Sends a password-reset email. The person chooses their own new password
 * from the link (always works, no current password needed).
 * Returns { success, error }.
 */
export async function sendPasswordReset(email) {
  const auth = getSecondaryAuth();
  const cleanEmail = (email || '').toLowerCase().trim();
  try {
    try {
      await sendPasswordResetEmail(auth, cleanEmail, { url: `${window.location.origin}/login` });
    } catch (err) {
      if (err?.code === 'auth/unauthorized-continue-uri' || err?.code === 'auth/invalid-continue-uri') {
        await sendPasswordResetEmail(auth, cleanEmail);
      } else {
        throw err;
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: friendlyAuthError(err) };
  }
}

/**
 * Sets a new password directly. Firebase only allows this from the browser when
 * the CURRENT password is known. Returns { success, error }.
 */
export async function changePasswordWithCurrent(email, currentPassword, newPassword) {
  const auth = getSecondaryAuth();
  try {
    const cred = await signInWithEmailAndPassword(auth, (email || '').toLowerCase().trim(), currentPassword);
    await updatePassword(cred.user, newPassword);
    return { success: true };
  } catch (err) {
    const wrong = ['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials', 'auth/user-not-found'].includes(err?.code);
    return { success: false, error: wrong ? 'The current password is incorrect.' : friendlyAuthError(err) };
  } finally {
    try { await signOut(auth); } catch (e) { /* ignore */ }
  }
}

/**
 * Re-sends the confirmation email. Needs the account's password
 * (passwords are not stored, so the caller has to provide it).
 * Returns { success, alreadyVerified, error }.
 */
export async function resendVerification(email, password) {
  const auth = getSecondaryAuth();
  try {
    const cred = await signInWithEmailAndPassword(auth, (email || '').toLowerCase().trim(), password);
    if (cred.user.emailVerified) {
      return { success: true, alreadyVerified: true };
    }
    await sendVerification(cred.user);
    return { success: true, alreadyVerified: false };
  } catch (err) {
    return { success: false, alreadyVerified: false, error: friendlyAuthError(err) };
  } finally {
    try { await signOut(auth); } catch (e) { /* ignore */ }
  }
}

/**
 * Checks whether the recipient has clicked the confirmation link.
 * Returns { verified, error }.
 */
export async function checkVerified(email, password) {
  const auth = getSecondaryAuth();
  try {
    const cred = await signInWithEmailAndPassword(auth, (email || '').toLowerCase().trim(), password);
    await cred.user.reload();
    return { verified: !!auth.currentUser?.emailVerified };
  } catch (err) {
    return { verified: false, error: friendlyAuthError(err) };
  } finally {
    try { await signOut(auth); } catch (e) { /* ignore */ }
  }
}
