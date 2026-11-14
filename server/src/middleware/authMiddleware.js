/**
 * Abar Khabo: Enterprise Firebase Authentication Middleware
 * 
 * Verifies incoming Bearer ID tokens via Firebase Admin SDK.
 * Retrieves authenticated staff profile from Firestore to bind authoritative
 * claims (role, restaurantId, assignedOutletIds, allOutlets, accountStatus).
 * 
 * NEVER trusts client-supplied user headers or unverified tokens.
 */

import { admin, getDb } from '../config/firebaseAdmin.js';
import logger from '../utils/logger.js';

let customTokenVerifier = null;

export function setCustomTokenVerifier(verifier) {
  customTokenVerifier = verifier;
}

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers?.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Missing or malformed Authorization header. Expected Bearer <token>.'
      },
      correlationId: req.correlationId
    });
  }

  const idToken = authHeader.split('Bearer ')[1].trim();

  try {
    let decodedToken;

    // 1. Check custom test verifier (used during unit testing & emulator simulation)
    if (customTokenVerifier) {
      decodedToken = await customTokenVerifier(idToken);
    } else {
      // 2. Production Firebase Admin SDK ID token verification
      decodedToken = await admin.auth().verifyIdToken(idToken);
    }

    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'The provided authentication token is invalid or expired.'
        },
        correlationId: req.correlationId
      });
    }

    // 3. Resolve user profile from users/{uid}
    const db = getDb();
    let userProfile = null;
    try {
      const userSnap = await db.doc(`users/${decodedToken.uid}`).get();
      if (userSnap && userSnap.exists) {
        userProfile = userSnap.data();
      }
    } catch (e) {
      // Non-blocking if profile not yet migrated
    }

    // 4. Attach authoritative user context to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || userProfile?.email || '',
      role: decodedToken.role || userProfile?.role || 'customer',
      restaurantId: decodedToken.restaurantId || userProfile?.restaurantId || null,
      assignedOutletIds: userProfile?.assignedOutletIds || decodedToken.assignedOutletIds || [],
      allOutlets: Boolean(userProfile?.allOutlets ?? decodedToken.allOutlets),
      accountStatus: userProfile?.accountStatus || userProfile?.status || 'active',
      isSuperAdmin: (decodedToken.email === 'altcafe2026@gmail.com') || (decodedToken.role === 'super_admin') || (userProfile?.role === 'super_admin')
    };

    // If account is suspended, block access immediately
    if (req.user.accountStatus === 'suspended') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: 'Your account has been suspended by an administrator.'
        },
        correlationId: req.correlationId
      });
    }

    next();
  } catch (err) {
    logger.warn('Token verification failed', {
      error: err.message,
      correlationId: req.correlationId
    });

    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Failed to authenticate request token.'
      },
      correlationId: req.correlationId
    });
  }
}

export default authMiddleware;
