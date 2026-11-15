import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  collectionGroup,
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
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' ? process.env : {});

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyDemoKeyRestoPulseProject2026",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "restopulse-restaurant.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "restopulse-restaurant",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "restopulse-restaurant.appspot.com",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1029384756",
  appId: env.VITE_FIREBASE_APP_ID || "1:1029384756:web:abcd1234efgh5678"
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Initialize Firebase App Check with local dev/emulator debug token safety
let appCheck = null;
if (typeof window !== 'undefined') {
  if (env.VITE_APP_CHECK_DEBUG_TOKEN || env.DEV || !env.PROD) {
    try {
      window.FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APP_CHECK_DEBUG_TOKEN || true;
    } catch (e) {
      // Non-blocking
    }
  }
  if (env.VITE_RECAPTCHA_SITE_KEY) {
    try {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(env.VITE_RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
    } catch (e) {
      console.warn('Firebase App Check initialization skipped:', e.message);
    }
  }
}

export {
  firebaseConfig,
  app,
  auth,
  db,
  appCheck,
  // Auth methods
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  // Firestore methods
  collection,
  collectionGroup,
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
};
