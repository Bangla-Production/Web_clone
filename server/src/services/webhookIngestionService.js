/**
 * Abar Khabo: Enterprise Aggregator Webhook Ingestion Pipeline (Mock / Sandbox)
 * Processes inbound Swiggy and Zomato webhook events with HMAC SHA-256 signature
 * verification, replay attack mitigation (timestamp drift), deterministic deduplication,
 * and audit event recording in `integrationWebhooks/{webhookId}`.
 *
 * NOTICE: Mock signature verification and test payloads simulate the integration
 * pipeline for development and sandbox verification. They do not represent official
 * proprietary endpoints or endorsement of unreleased provider APIs.
 */

import { getDb } from '../config/firebaseAdmin.js';
import {
  verifyHmacSha256,
  validateTimestampDrift,
  generateWebhookEventId
} from '../utils/cryptoUtils.js';
import { secretManagerService } from './secretManagerService.js';
import { connectionService, CONNECTION_STATUSES } from './connectionService.js';
import { trustedOrderService } from './trustedOrderService.js';
import logger from '../utils/logger.js';

export const WEBHOOK_STATUSES = {
  PENDING: 'PENDING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
  DUPLICATE_IGNORED: 'DUPLICATE_IGNORED',
  DEAD_LETTER: 'DEAD_LETTER'
};

export const SIGNATURE_STATUSES = {
  VERIFIED: 'VERIFIED',
  FAILED: 'FAILED',
  SKIPPED_LOCAL: 'SKIPPED_LOCAL'
};

const MAX_WEBHOOK_RETRIES = 3;

class WebhookIngestionService {
  /**
   * Sanitizes payload metadata for webhook audit storage to ensure sensitive
   * customer PII (credit cards, exact addresses, complete phone numbers) is never retained.
   */
  sanitizePayloadForAudit(payload) {
    if (!payload || typeof payload !== 'object') return {};
    const sanitized = { ...payload };

    if (sanitized.customer) {
      sanitized.customer = {
        name: sanitized.customer.name ? `${sanitized.customer.name.slice(0, 1)}***` : 'Customer',
        phone: sanitized.customer.phone ? `••••••${String(sanitized.customer.phone).slice(-4)}` : '',
        masked: true
      };
    }

    delete sanitized.paymentDetails?.cardNumber;
    delete sanitized.paymentDetails?.cvv;
    return sanitized;
  }

  /**
   * Primary entry point for receiving an inbound webhook.
   *
   * @param {Object} options
   * @param {string} options.provider - 'SWIGGY' | 'ZOMATO'
   * @param {Object|string} options.rawBody - Raw request body as string or object
   * @param {Object} options.headers - HTTP headers (signatures, timestamps, client IDs)
   * @param {string} [options.restaurantId] - Known tenant ID if routed via parameterized URL
   * @param {string} [options.outletId] - Known outlet ID if routed via parameterized URL
   */
  async processInboundWebhook({ provider, rawBody, headers = {}, restaurantId = null, outletId = null }) {
    const db = getDb();
    const p = String(provider || '').toUpperCase();
    if (p !== 'SWIGGY' && p !== 'ZOMATO') {
      return { success: false, reason: `Unsupported provider: ${provider}`, status: WEBHOOK_STATUSES.FAILED };
    }

    const bodyObj = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    const rawBodyString = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);

    // 1. Extract metadata from mock headers or payload
    const eventId = headers['x-event-id'] || headers['x-swiggy-event-id'] || headers['x-zomato-event-id'] || bodyObj.eventId || `EV_${Date.now()}`;
    const timestamp = headers['x-timestamp'] || headers['x-swiggy-timestamp'] || headers['x-zomato-timestamp'] || bodyObj.timestamp || Date.now();
    const receivedSignature = headers['x-signature'] || headers['x-swiggy-signature'] || headers['x-zomato-signature'] || headers['signature'];
    const eventType = bodyObj.eventType || bodyObj.event || 'ORDER_PLACED';
    const externalOrderId = bodyObj.orderId || bodyObj.externalOrderId || bodyObj.order?.id;
    const externalRestaurantId = bodyObj.restaurantId || bodyObj.externalRestaurantId || headers['x-restaurant-id'];

    // 2. Deterministic webhook event ID for deduplication
    const webhookId = generateWebhookEventId(p, eventId, rawBodyString);
    const webhookDocRef = db.doc(`integrationWebhooks/${webhookId}`);
    const now = new Date().toISOString();

    // 3. Resolve connection: Try provided restaurantId/outletId or search by externalRestaurantId
    let connection = null;
    let targetRestaurantId = restaurantId;
    let targetOutletId = outletId;

    if (targetRestaurantId && targetOutletId) {
      connection = await connectionService.getConnection(targetRestaurantId, targetOutletId, p.toLowerCase());
    } else if (externalRestaurantId) {
      connection = await connectionService.findConnectionByExternalId(p, externalRestaurantId);
      if (connection) {
        targetRestaurantId = connection.restaurantId;
        targetOutletId = connection.outletId;
      }
    }

    if (!connection || !targetRestaurantId || !targetOutletId) {
      const errReason = `Could not resolve active connection for ${p} (externalId: ${externalRestaurantId || 'none'})`;
      logger.warn(errReason);

      await webhookDocRef.set({
        webhookId,
        eventId,
        provider: p,
        restaurantId: targetRestaurantId || 'UNKNOWN',
        outletId: targetOutletId || 'UNKNOWN',
        externalOrderId: externalOrderId || 'UNKNOWN',
        eventType,
        receivedAt: now,
        signatureVerificationStatus: SIGNATURE_STATUSES.FAILED,
        processingStatus: WEBHOOK_STATUSES.FAILED,
        retryCount: 0,
        errorDetails: { code: 'CONNECTION_NOT_FOUND', message: errReason },
        createdAt: now
      });

      return { success: false, reason: errReason, status: WEBHOOK_STATUSES.FAILED, webhookId };
    }

    // 4. Validate connection status
    const activeCheck = connectionService.validateConnectionActive(connection);
    if (!activeCheck.active) {
      logger.warn('Webhook received for non-active connection', { connectionStatus: connection.connectionStatus });
      await webhookDocRef.set({
        webhookId,
        eventId,
        provider: p,
        restaurantId: targetRestaurantId,
        outletId: targetOutletId,
        externalOrderId: externalOrderId || 'UNKNOWN',
        eventType,
        receivedAt: now,
        signatureVerificationStatus: SIGNATURE_STATUSES.FAILED,
        processingStatus: WEBHOOK_STATUSES.FAILED,
        retryCount: 0,
        errorDetails: { code: 'CONNECTION_INACTIVE', message: activeCheck.reason },
        createdAt: now
      });
      return { success: false, reason: activeCheck.reason, status: WEBHOOK_STATUSES.FAILED, webhookId };
    }

    // 5. Signature Verification (HMAC-SHA256)
    const secret = await secretManagerService.getSecret(connection.secretReference);
    const signatureValid = verifyHmacSha256(rawBodyString, secret, receivedSignature);

    if (!signatureValid) {
      const sigReason = 'Invalid HMAC-SHA256 signature';
      logger.error('Webhook signature verification failed', { webhookId, provider: p });

      await webhookDocRef.set({
        webhookId,
        eventId,
        provider: p,
        restaurantId: targetRestaurantId,
        outletId: targetOutletId,
        externalOrderId: externalOrderId || 'UNKNOWN',
        eventType,
        receivedAt: now,
        signatureVerificationStatus: SIGNATURE_STATUSES.FAILED,
        processingStatus: WEBHOOK_STATUSES.FAILED,
        retryCount: 0,
        errorDetails: { code: 'INVALID_SIGNATURE', message: sigReason },
        createdAt: now
      });

      return { success: false, reason: sigReason, status: WEBHOOK_STATUSES.FAILED, webhookId };
    }

    // 6. Replay Attack Prevention (Timestamp drift check)
    const driftCheck = validateTimestampDrift(timestamp, 300);
    if (!driftCheck.valid) {
      logger.error('Webhook replay attack detected / timestamp expired', {
        webhookId,
        driftSeconds: driftCheck.driftSeconds
      });

      await webhookDocRef.set({
        webhookId,
        eventId,
        provider: p,
        restaurantId: targetRestaurantId,
        outletId: targetOutletId,
        externalOrderId: externalOrderId || 'UNKNOWN',
        eventType,
        receivedAt: now,
        signatureVerificationStatus: SIGNATURE_STATUSES.VERIFIED,
        processingStatus: WEBHOOK_STATUSES.FAILED,
        retryCount: 0,
        errorDetails: { code: 'TIMESTAMP_DRIFT_EXCEEDED', message: driftCheck.reason },
        createdAt: now
      });

      return { success: false, reason: driftCheck.reason, status: WEBHOOK_STATUSES.FAILED, webhookId };
    }

    // 7. Event Deduplication Check
    const existingSnap = await webhookDocRef.get();
    if (existingSnap.exists) {
      const existing = existingSnap.data();
      if (existing.processingStatus === WEBHOOK_STATUSES.PROCESSED) {
        logger.info('Duplicate webhook event received — returning previous result', { webhookId });
        return {
          success: true,
          status: WEBHOOK_STATUSES.DUPLICATE_IGNORED,
          webhookId,
          orderId: existing.orderRef,
          duplicate: true
        };
      }
    }

    // 8. Initial Audit Record
    await webhookDocRef.set({
      webhookId,
      eventId,
      provider: p,
      restaurantId: targetRestaurantId,
      outletId: targetOutletId,
      externalOrderId: externalOrderId || 'UNKNOWN',
      eventType,
      receivedAt: now,
      signatureVerificationStatus: SIGNATURE_STATUSES.VERIFIED,
      processingStatus: WEBHOOK_STATUSES.PENDING,
      retryCount: 0,
      payloadSummary: this.sanitizePayloadForAudit(bodyObj),
      createdAt: now
    }, { merge: true });

    // 9. Process Event Handlers
    try {
      let orderResult = null;

      if (eventType === 'ORDER_PLACED' || eventType === 'ORDER_CREATED') {
        const normalizedInput = this.normalizeProviderOrderPayload(p, bodyObj, targetRestaurantId, targetOutletId);
        orderResult = await trustedOrderService.ingestOrder(normalizedInput, connection);
      } else if (eventType === 'ORDER_CANCELLED') {
        const orderId = bodyObj.orderId;
        const reason = bodyObj.cancellationReason || 'Cancelled via aggregator';
        orderResult = await trustedOrderService.transitionOrderStatus(orderId, 'CANCELLED', p, reason);
      } else if (eventType === 'ORDER_STATUS_UPDATE') {
        const orderId = bodyObj.orderId;
        const targetStatus = bodyObj.status || bodyObj.orderStatus;
        orderResult = await trustedOrderService.transitionOrderStatus(orderId, targetStatus, p);
      } else {
        logger.info(`Unhandled webhook event type: ${eventType}`);
        orderResult = { success: true, status: 'SKIPPED_UNHANDLED_EVENT' };
      }

      // 10. Record Success Audit
      await webhookDocRef.update({
        processingStatus: WEBHOOK_STATUSES.PROCESSED,
        processedAt: new Date().toISOString(),
        orderRef: orderResult?.orderId || null,
        errorDetails: null
      });

      // Update connection lastWebhookAt
      await db.doc(connectionService.getConnectionDocPath(targetRestaurantId, targetOutletId, p.toLowerCase())).update({
        lastWebhookAt: now,
        lastSuccessfulSyncAt: now,
        updatedAt: now
      });

      return {
        success: true,
        status: WEBHOOK_STATUSES.PROCESSED,
        webhookId,
        orderId: orderResult?.orderId,
        orderResult
      };

    } catch (err) {
      logger.error('Error processing webhook event body', { webhookId, error: err.message });

      const currentRetries = (existingSnap.exists ? existingSnap.data().retryCount || 0 : 0) + 1;
      const finalStatus = currentRetries >= MAX_WEBHOOK_RETRIES ? WEBHOOK_STATUSES.DEAD_LETTER : WEBHOOK_STATUSES.FAILED;

      await webhookDocRef.update({
        processingStatus: finalStatus,
        retryCount: currentRetries,
        errorDetails: { code: 'PROCESSING_ERROR', message: err.message, stack: err.stack },
        updatedAt: new Date().toISOString()
      });

      return {
        success: false,
        status: finalStatus,
        webhookId,
        reason: err.message,
        retryCount: currentRetries
      };
    }
  }

  /**
   * Normalizes provider-specific payload schemas into the canonical format for trustedOrderService.
   */
  normalizeProviderOrderPayload(provider, rawPayload, restaurantId, outletId) {
    const p = provider.toUpperCase();

    // Standardized fields
    const externalOrderId = String(rawPayload.orderId || rawPayload.id || `EXT_${Date.now()}`);
    const items = (rawPayload.items || rawPayload.order_items || []).map((it, idx) => ({
      id: it.id || it.item_id || `item_${idx + 1}`,
      name: it.name || it.item_name || 'Item',
      category: it.category || 'Main Course',
      variant: it.variant ? (typeof it.variant === 'object' ? it.variant : { name: String(it.variant), price: 0 }) : null,
      addons: Array.isArray(it.addons) ? it.addons : [],
      unitPrice: Number(it.price || it.unitPrice || 0),
      quantity: Number(it.quantity || 1),
      subtotal: Number(it.subtotal || ((it.price || it.unitPrice || 0) * (it.quantity || 1))),
      instructions: it.instructions || it.notes || ''
    }));

    const charges = {
      discountAmount: Number(rawPayload.discountAmount || rawPayload.discount || 0),
      couponCode: rawPayload.couponCode || rawPayload.coupon || null,
      deliveryCharge: Number(rawPayload.deliveryCharge || rawPayload.deliveryFee || 0),
      packagingCharge: Number(rawPayload.packagingCharge || rawPayload.packagingFee || 0),
      tipAmount: Number(rawPayload.tipAmount || rawPayload.tip || 0)
    };

    const customer = {
      name: rawPayload.customer?.name || rawPayload.customer_name || 'Customer',
      phone: rawPayload.customer?.phone || rawPayload.customer_phone || '',
      email: rawPayload.customer?.email || '',
      deliveryAddress: rawPayload.customer?.deliveryAddress || rawPayload.delivery_address || null
    };

    const delivery = {
      partnerType: `${p}_FLEET`,
      riderId: rawPayload.delivery?.riderId || rawPayload.rider_id || null,
      riderName: rawPayload.delivery?.riderName || rawPayload.rider_name || null,
      riderPhone: rawPayload.delivery?.riderPhone || rawPayload.rider_phone || null,
      riderCoordinates: rawPayload.delivery?.riderCoordinates || null,
      pickupOtp: rawPayload.delivery?.pickupOtp || rawPayload.otp || String(Math.floor(1000 + Math.random() * 9000)),
      estimatedPrepTimeMinutes: Number(rawPayload.estimatedPrepTimeMinutes || 25),
      estimatedDeliveryTimeMinutes: Number(rawPayload.estimatedDeliveryTimeMinutes || 45)
    };

    const payment = {
      status: 'PAID',
      method: 'ONLINE',
      provider: p,
      transactionId: rawPayload.transactionId || `TXN_${p}_${Date.now()}`
    };

    return {
      orderSource: p,
      orderType: 'DELIVERY',
      restaurantId,
      outletId,
      externalOrderId,
      customer,
      items,
      charges,
      payment,
      delivery
    };
  }
}

export const webhookIngestionService = new WebhookIngestionService();
export default webhookIngestionService;
