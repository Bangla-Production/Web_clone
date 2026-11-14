/**
 * Abar Khabo: Enterprise Tenant & Outlet Authorization Middleware
 * 
 * Independently verifies that authenticated requests have explicit permission
 * to access target tenant restaurant and outlet resources.
 * 
 * Crucial Protection:
 *  Admin SDK operations bypass Firestore rules; therefore, this middleware guarantees
 *  that backend services strictly enforce tenant isolation and explicit outlet permissions.
 */

import logger from '../utils/logger.js';

/**
 * Enforces that the authenticated user belongs to the target restaurant tenant,
 * or possesses platform-wide Super Admin privileges.
 * 
 * @param {string} source - Where to find restaurantId: 'params', 'body', or 'query' (default: 'params')
 * @param {string} fieldName - Key name (default: 'restaurantId')
 */
export function requireTenant(source = 'params', fieldName = 'restaurantId') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
        correlationId: req.correlationId
      });
    }

    if (req.user.isSuperAdmin) {
      return next(); // Platform owner has universal access
    }

    const targetRestaurantId = req[source]?.[fieldName] || req.params?.[fieldName] || req.body?.[fieldName];

    if (!targetRestaurantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT_ID', message: `Target ${fieldName} must be specified.` },
        correlationId: req.correlationId
      });
    }

    if (req.user.restaurantId !== targetRestaurantId) {
      logger.warn('Cross-tenant access attempt blocked', {
        userUid: req.user.uid,
        userTenant: req.user.restaurantId,
        targetTenant: targetRestaurantId,
        correlationId: req.correlationId
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_CROSS_TENANT',
          message: 'Access denied: You are not authorized to access resources belonging to another restaurant tenant.'
        },
        correlationId: req.correlationId
      });
    }

    next();
  };
}

/**
 * Enforces explicit outlet authorization within a restaurant tenant.
 * Validates that user either:
 *  1. Is Super Admin.
 *  2. Has allOutlets: true on their profile.
 *  3. Has target outletId in their assignedOutletIds array.
 */
export function requireOutlet(source = 'params', outletFieldName = 'outletId', restFieldName = 'restaurantId') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
        correlationId: req.correlationId
      });
    }

    if (req.user.isSuperAdmin) {
      return next();
    }

    const targetRestId = req[source]?.[restFieldName] || req.params?.[restFieldName] || req.body?.[restFieldName] || req.user.restaurantId;
    const targetOutletId = req[source]?.[outletFieldName] || req.params?.[outletFieldName] || req.body?.[outletFieldName];

    // 1. Verify tenant match first
    if (req.user.restaurantId !== targetRestId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN_CROSS_TENANT', message: 'Access denied: Cross-tenant operation blocked.' },
        correlationId: req.correlationId
      });
    }

    // If no specific outlet is requested, proceed
    if (!targetOutletId) {
      return next();
    }

    // 2. Check explicit outlet permission
    const hasAccess =
      req.user.allOutlets === true ||
      (Array.isArray(req.user.assignedOutletIds) && req.user.assignedOutletIds.includes(targetOutletId));

    if (!hasAccess) {
      logger.warn('Cross-outlet access attempt blocked', {
        userUid: req.user.uid,
        restaurantId: req.user.restaurantId,
        assignedOutlets: req.user.assignedOutletIds,
        allOutlets: req.user.allOutlets,
        targetOutletId,
        correlationId: req.correlationId
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_CROSS_OUTLET',
          message: `Access denied: You do not have authorization for outlet '${targetOutletId}'.`
        },
        correlationId: req.correlationId
      });
    }

    next();
  };
}

/**
 * Role-based access control middleware.
 * @param {string[]} allowedRoles
 */
export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
        correlationId: req.correlationId
      });
    }

    if (req.user.isSuperAdmin) {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_ROLE',
          message: `Access denied: Required role not met. Allowed: [${allowedRoles.join(', ')}].`
        },
        correlationId: req.correlationId
      });
    }

    next();
  };
}

export default { requireTenant, requireOutlet, requireRole };
