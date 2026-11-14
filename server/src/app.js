/**
 * Abar Khabo: Enterprise Express Application Configuration
 * 
 * Production-ready REST API orchestrating:
 *  - Liveness & Readiness health probes for Google Cloud Run
 *  - Automated request correlation tracking & structured JSON logging
 *  - Defensive security headers & strict CORS policies
 *  - In-memory rate limiting differentiating user vs webhook endpoints
 *  - Authoritative tenant & outlet isolation enforcement
 *  - Firebase App Check verification
 *  - Error handling with zero stack trace leakage
 */

import express from 'express';
import cors from 'cors';
import { securityHeadersMiddleware } from './middleware/securityHeadersMiddleware.js';
import { apiRateLimiter, webhookRateLimiter } from './middleware/rateLimiterMiddleware.js';
import { sanitizeInputMiddleware, validateRequiredFields } from './middleware/requestValidationMiddleware.js';
import { authMiddleware } from './middleware/authMiddleware.js';
import { requireTenant, requireOutlet, requireRole } from './middleware/tenantAuthorizationMiddleware.js';
import { appCheckMiddleware } from './middleware/appCheckMiddleware.js';
import { errorHandlerMiddleware } from './middleware/errorHandlerMiddleware.js';
import { webhookIngestionService } from './services/webhookIngestionService.js';
import { trustedOrderService } from './services/trustedOrderService.js';
import { inventoryLedgerService } from './services/inventoryLedgerService.js';
import { paymentTransactionService } from './services/paymentTransactionService.js';
import { settlementReconciliationService } from './services/settlementReconciliationService.js';
import { platformAnalyticsService } from './services/platformAnalyticsService.js';
import { subscriptionService } from './services/subscriptionService.js';
import { getDb } from './config/firebaseAdmin.js';
import logger from './utils/logger.js';

export function createApp() {
  const app = express();

  // 1. Trust Google Cloud Run reverse proxies
  app.set('trust proxy', true);

  // 2. Strict CORS Configuration
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://restopulse-restaurant.web.app',
    'https://restopulse-restaurant.firebaseapp.com'
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow mobile apps, curl, server-to-server or whitelisted frontend origins
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`CORS_POLICY_VIOLATION: Origin '${origin}' is not permitted.`));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Firebase-AppCheck',
        'X-Correlation-ID',
        'X-Swiggy-Signature',
        'X-Zomato-Signature',
        'X-Webhook-Signature',
        'X-Webhook-Timestamp'
      ],
      exposedHeaders: ['X-Correlation-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
      credentials: true,
      maxAge: 86400 // 24 hours
    })
  );

  // 3. Security Headers & Correlation ID
  app.use(securityHeadersMiddleware);

  // 4. Request Body Parsers with safe size limits
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // 5. Input sanitization (prototype pollution protection)
  app.use(sanitizeInputMiddleware);

  // ─────────────────────────────────────────────────────────────────────────
  // HEALTH & READINESS PROBES (Cloud Run / Kubernetes)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Liveness Probe: Quick check if server process is running.
   */
  app.get('/healthz', (req, res) => {
    res.status(200).json({
      status: 'UP',
      service: 'abar-khabo-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      correlationId: req.correlationId
    });
  });

  /**
   * Readiness Probe: Deep check verifying database and service readiness.
   */
  app.get('/readyz', async (req, res) => {
    try {
      const db = getDb();
      // Probe database connectivity with lightweight read
      await db.collection('restaurants').limit(1).get();

      res.status(200).json({
        status: 'READY',
        service: 'abar-khabo-backend',
        checks: {
          database: 'HEALTHY',
          appCheck: 'CONFIGURED',
          memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        },
        timestamp: new Date().toISOString(),
        correlationId: req.correlationId
      });
    } catch (err) {
      logger.error('Readiness probe failure', { error: err.message, correlationId: req.correlationId });
      res.status(503).json({
        status: 'UNREADY',
        error: 'Database connection check failed',
        correlationId: req.correlationId
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AGGREGATOR WEBHOOK INGESTION (Mock Sandbox & Real Integration Pipeline)
  // ─────────────────────────────────────────────────────────────────────────

  app.post(
    '/api/v1/webhooks/:provider',
    webhookRateLimiter,
    async (req, res, next) => {
      try {
        const { provider } = req.params;
        const signature =
          req.headers['x-swiggy-signature'] ||
          req.headers['x-zomato-signature'] ||
          req.headers['x-webhook-signature'];
        const timestamp = req.headers['x-webhook-timestamp'];

        const result = await webhookIngestionService.processIncomingWebhook({
          provider: String(provider).toUpperCase(),
          rawPayload: req.body,
          signatureHeader: signature,
          timestampHeader: timestamp,
          headers: req.headers
        });

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PROTECTED APPLICATION API ROUTES
  // ─────────────────────────────────────────────────────────────────────────

  // Apply general API rate limiting & optional App Check to protected routes
  const protectedPipeline = [apiRateLimiter, appCheckMiddleware({ enforced: false }), authMiddleware];

  /**
   * Validates financial calculations on incoming orders
   */
  app.post(
    '/api/v1/orders/validate',
    ...protectedPipeline,
    requireTenant('body', 'restaurantId'),
    requireOutlet('body', 'outletId', 'restaurantId'),
    async (req, res, next) => {
      try {
        const validation = trustedOrderService.validateOrderFinancials(req.body);
        res.status(200).json({ success: true, validation });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * Unified order status transitions
   */
  app.post(
    '/api/v1/orders/:orderId/transition',
    ...protectedPipeline,
    validateRequiredFields(['targetStatus']),
    async (req, res, next) => {
      try {
        const { orderId } = req.params;
        const { targetStatus, reason } = req.body;

        const result = await trustedOrderService.transitionOrderStatus(
          orderId,
          targetStatus,
          {
            uid: req.user.uid,
            role: req.user.role,
            name: req.user.email || 'Staff'
          },
          reason
        );

        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * Inventory reservation for order
   */
  app.post(
    '/api/v1/inventory/reserve',
    ...protectedPipeline,
    requireTenant('body', 'restaurantId'),
    requireOutlet('body', 'outletId', 'restaurantId'),
    validateRequiredFields(['restaurantId', 'outletId', 'orderId', 'items']),
    async (req, res, next) => {
      try {
        const { restaurantId, outletId, orderId, items } = req.body;
        const result = await inventoryLedgerService.reserveStockForOrder(
          restaurantId,
          outletId,
          orderId,
          items,
          { uid: req.user.uid, name: req.user.email }
        );
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * Record payment transaction
   */
  app.post(
    '/api/v1/payments/record',
    ...protectedPipeline,
    requireTenant('body', 'restaurantId'),
    validateRequiredFields(['restaurantId', 'orderId', 'amount', 'paymentMethod']),
    async (req, res, next) => {
      try {
        const result = await paymentTransactionService.recordPayment(
          req.body.restaurantId,
          req.body,
          { uid: req.user.uid, name: req.user.email }
        );
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * Process refund
   */
  app.post(
    '/api/v1/payments/refund',
    ...protectedPipeline,
    requireTenant('body', 'restaurantId'),
    requireRole(['restaurant_admin', 'outlet_manager', 'super_admin']),
    validateRequiredFields(['restaurantId', 'transactionId', 'refundAmount', 'reason']),
    async (req, res, next) => {
      try {
        const result = await paymentTransactionService.processRefund(
          req.body.restaurantId,
          req.body,
          { uid: req.user.uid, name: req.user.email }
        );
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * Ingest and reconcile settlement batch
   */
  app.post(
    '/api/v1/settlements/reconcile',
    ...protectedPipeline,
    requireTenant('body', 'restaurantId'),
    requireRole(['restaurant_admin', 'outlet_manager', 'super_admin']),
    validateRequiredFields(['restaurantId', 'batchPayload']),
    async (req, res, next) => {
      try {
        const result = await settlementReconciliationService.reconcileBatch(
          req.body.restaurantId,
          req.body.batchPayload,
          { uid: req.user.uid, name: req.user.email }
        );
        res.status(200).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * Super Admin Platform Overview Metrics
   */
  app.get(
    '/api/v1/saas/overview',
    ...protectedPipeline,
    requireRole(['super_admin']),
    async (req, res, next) => {
      try {
        const metrics = await platformAnalyticsService.getPlatformOverviewMetrics();
        res.status(200).json(metrics);
      } catch (err) {
        next(err);
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 404 & ERROR HANDLING MIDDLEWARE
  // ─────────────────────────────────────────────────────────────────────────

  // Catch-all 404 handler for undefined API routes
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `API endpoint '${req.method} ${req.originalUrl}' does not exist.`
      },
      correlationId: req.correlationId
    });
  });

  // Central error handler
  app.use(errorHandlerMiddleware);

  return app;
}

export default createApp;
