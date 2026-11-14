/**
 * Abar Khabo: Enterprise Firebase App Check Verification Middleware
 * 
 * Protects backend API endpoints against unauthorized clients, scrapers, and bot abuse.
 * Validates the X-Firebase-AppCheck token header via Firebase Admin SDK.
 * 
 * Safety Rules:
 *  - In local development, testing, and emulator environments, permits requests with debug tokens or bypasses gracefully.
 *  - In production, enforces valid attestation tokens before executing backend mutations.
 */

import logger from '../utils/logger.js';

let customAppCheckVerifier = null;

export function setCustomAppCheckVerifier(verifier) {
  customAppCheckVerifier = verifier;
}

export function appCheckMiddleware(options = { enforced: false }) {
  return async (req, res, next) => {
    const appCheckToken = req.headers['x-firebase-appcheck'];

    const isProduction = process.env.NODE_ENV === 'production' && !process.env.FIRESTORE_EMULATOR_HOST;
    const isEnforced = options.enforced || isProduction;

    // 1. If not enforced and token missing, log and permit (graceful transition period)
    if (!appCheckToken) {
      if (!isEnforced) {
        req.appCheck = { verified: false, reason: 'TOKEN_ABSENT_DEV_MODE' };
        return next();
      }

      return res.status(401).json({
        success: false,
        error: {
          code: 'APP_CHECK_MISSING',
          message: 'Firebase App Check attestation token missing. Request rejected.'
        },
        correlationId: req.correlationId
      });
    }

    // 2. Validate token
    try {
      if (customAppCheckVerifier) {
        const result = await customAppCheckVerifier(appCheckToken);
        if (!result || !result.appId) {
          throw new Error('Custom verifier rejected App Check token');
        }
        req.appCheck = { verified: true, appId: result.appId };
        return next();
      }

      // Check debug token in non-production
      if (!isProduction && appCheckToken === 'DEV_DEBUG_TOKEN') {
        req.appCheck = { verified: true, appId: 'dev-client-app' };
        return next();
      }

      // In production Firebase Admin SDK verification
      // Dynamically import getAppCheck to prevent issues if modular package is configured
      const { getAppCheck } = await import('firebase-admin/app-check');
      const appCheckClaims = await getAppCheck().verifyToken(appCheckToken);
      req.appCheck = { verified: true, appId: appCheckClaims.app_id };

      next();
    } catch (err) {
      logger.warn('App Check verification failed', {
        error: err.message,
        correlationId: req.correlationId
      });

      if (isEnforced) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'APP_CHECK_INVALID',
            message: 'Firebase App Check attestation failed. Unauthorized client.'
          },
          correlationId: req.correlationId
        });
      }

      // In non-enforced development mode, continue with warning
      req.appCheck = { verified: false, error: err.message };
      next();
    }
  };
}

export default appCheckMiddleware;
