/**
 * Abar Khabo: Firebase Admin SDK Configuration
 * Connects securely to Google Cloud Firestore in production or to
 * the official Firebase Emulator Suite (FIRESTORE_EMULATOR_HOST) in development.
 */

import admin from 'firebase-admin';

let app = null;
let db = null;

export function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    app = admin.apps[0];
    db = admin.firestore(app);
    return { app, db };
  }

  const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'demo-abar-khabo';

  if (isEmulator) {
    // When running with the emulator, no credentials file is required
    app = admin.initializeApp({ projectId });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE) {
    // Cloud Run automatically provides Application Default Credentials
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId
    });
  } else {
    // Development fallback using demo project
    app = admin.initializeApp({ projectId });
  }

  db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  return { app, db };
}

export function getDb() {
  if (!db) {
    initializeFirebaseAdmin();
  }
  return db;
}

export function setCustomDb(customDb) {
  db = customDb;
}

export { admin, db };
export default { admin, getDb, setCustomDb, initializeFirebaseAdmin };
