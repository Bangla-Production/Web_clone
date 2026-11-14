/**
 * Abar Khabo: Enterprise Aggregator Connection Service
 * Manages connection state, environment metadata, and Secret Manager references
 * for Swiggy and Zomato integrations at the outlet level.
 * Path: restaurants/{restaurantId}/outlets/{outletId}/aggregatorConnections/{connectionId}
 */

import { getDb } from '../config/firebaseAdmin.js';
import logger from '../utils/logger.js';

export const CONNECTION_STATUSES = {
  NOT_CONNECTED: 'NOT_CONNECTED',
  PENDING_AUTHORIZATION: 'PENDING_AUTHORIZATION',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR',
  SUSPENDED: 'SUSPENDED'
};

export const PROVIDERS = {
  SWIGGY: 'SWIGGY',
  ZOMATO: 'ZOMATO'
};

export const ENVIRONMENTS = {
  MOCK: 'MOCK',
  SANDBOX: 'SANDBOX',
  PRODUCTION: 'PRODUCTION'
};

class ConnectionService {
  /**
   * Constructs the canonical Firestore document path for an aggregator connection.
   */
  getConnectionDocPath(restaurantId, outletId, connectionId) {
    if (!restaurantId || !outletId || !connectionId) {
      throw new Error('restaurantId, outletId, and connectionId are required');
    }
    return `restaurants/${restaurantId}/outlets/${outletId}/aggregatorConnections/${String(connectionId).toLowerCase()}`;
  }

  /**
   * Retrieves an aggregator connection document.
   */
  async getConnection(restaurantId, outletId, connectionId) {
    const db = getDb();
    const docPath = this.getConnectionDocPath(restaurantId, outletId, connectionId);
    const snap = await db.doc(docPath).get();
    if (!snap.exists) return null;
    return snap.data();
  }

  /**
   * Creates or updates an aggregator connection record.
   * Strictly enforces that NO plaintext secrets are stored in Firestore.
   */
  async createOrUpdateConnection(restaurantId, outletId, data) {
    const db = getDb();
    const provider = String(data.provider || '').toUpperCase();
    if (!PROVIDERS[provider]) {
      throw new Error(`Invalid provider: ${data.provider}. Must be SWIGGY or ZOMATO`);
    }

    const connectionId = String(data.connectionId || provider.toLowerCase()).toLowerCase();
    const docPath = this.getConnectionDocPath(restaurantId, outletId, connectionId);

    // Security check: Reject any attempt to save plaintext tokens or secrets
    const forbiddenKeys = ['apiKey', 'apiSecret', 'clientSecret', 'token', 'signingSecret', 'password'];
    for (const key of forbiddenKeys) {
      if (data[key] !== undefined) {
        throw new Error(`Security Violation: Plaintext secret field "${key}" cannot be stored in Firestore`);
      }
    }

    const now = new Date().toISOString();
    const existingSnap = await db.doc(docPath).get();
    const existing = existingSnap.exists ? existingSnap.data() : null;

    const connectionRecord = {
      connectionId,
      provider,
      restaurantId,
      outletId,
      externalRestaurantId: String(data.externalRestaurantId || existing?.externalRestaurantId || '').trim(),
      connectionStatus: data.connectionStatus || existing?.connectionStatus || CONNECTION_STATUSES.NOT_CONNECTED,
      environment: data.environment || existing?.environment || ENVIRONMENTS.MOCK,
      secretReference: data.secretReference || existing?.secretReference || '',
      financialConfig: {
        commissionRate: Number(data.financialConfig?.commissionRate ?? existing?.financialConfig?.commissionRate ?? 18.0),
        gstRate: Number(data.financialConfig?.gstRate ?? existing?.financialConfig?.gstRate ?? 5.0),
        isPackagingTaxable: Boolean(data.financialConfig?.isPackagingTaxable ?? existing?.financialConfig?.isPackagingTaxable ?? false)
      },
      webhookConfig: {
        webhookUrl: data.webhookConfig?.webhookUrl || existing?.webhookConfig?.webhookUrl || '',
        events: data.webhookConfig?.events || existing?.webhookConfig?.events || ['ORDER_PLACED', 'ORDER_CANCELLED', 'ORDER_STATUS_UPDATE']
      },
      connectedAt: data.connectionStatus === CONNECTION_STATUSES.CONNECTED 
        ? (existing?.connectedAt || now)
        : (data.connectionStatus === CONNECTION_STATUSES.DISCONNECTED ? null : (existing?.connectedAt || null)),
      lastWebhookAt: data.lastWebhookAt || existing?.lastWebhookAt || null,
      lastSuccessfulSyncAt: data.lastSuccessfulSyncAt || existing?.lastSuccessfulSyncAt || null,
      lastError: data.lastError ?? existing?.lastError ?? null,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    await db.doc(docPath).set(connectionRecord, { merge: true });

    logger.info('Aggregator connection updated', {
      restaurantId,
      outletId,
      connectionId,
      provider,
      status: connectionRecord.connectionStatus
    });

    return connectionRecord;
  }

  /**
   * Updates connection status (e.g. CONNECTED, ERROR, DISCONNECTED, SUSPENDED).
   */
  async updateConnectionStatus(restaurantId, outletId, connectionId, status, errorDetails = null) {
    if (!CONNECTION_STATUSES[status]) {
      throw new Error(`Invalid connection status: ${status}`);
    }

    const db = getDb();
    const docPath = this.getConnectionDocPath(restaurantId, outletId, connectionId);
    const now = new Date().toISOString();

    const updatePayload = {
      connectionStatus: status,
      updatedAt: now
    };

    if (status === CONNECTION_STATUSES.CONNECTED) {
      updatePayload.connectedAt = now;
      updatePayload.lastError = null;
    } else if (status === CONNECTION_STATUSES.ERROR && errorDetails) {
      updatePayload.lastError = {
        code: errorDetails.code || 'CONNECTION_ERROR',
        message: errorDetails.message || 'Unknown error occurred',
        timestamp: now
      };
    }

    await db.doc(docPath).update(updatePayload);
    return updatePayload;
  }

  /**
   * Resolves a connection by provider and external restaurant identifier.
   * Uses collection-group query or direct mapping.
   */
  async findConnectionByExternalId(provider, externalRestaurantId) {
    const db = getDb();
    const p = String(provider).toUpperCase();
    const extId = String(externalRestaurantId).trim();

    try {
      const snap = await db.collectionGroup('aggregatorConnections')
        .where('provider', '==', p)
        .where('externalRestaurantId', '==', extId)
        .limit(1)
        .get();

      if (snap.empty) return null;
      return snap.docs[0].data();
    } catch (err) {
      logger.warn('Collection group query fallback on aggregatorConnections', { error: err.message });
      return null;
    }
  }

  /**
   * Validates if a connection is active and authorized to process webhooks.
   */
  validateConnectionActive(connection) {
    if (!connection) {
      return { active: false, reason: 'Connection record not found' };
    }
    if (connection.connectionStatus !== CONNECTION_STATUSES.CONNECTED) {
      return {
        active: false,
        reason: `Connection is in ${connection.connectionStatus} state, not CONNECTED`
      };
    }
    if (!connection.secretReference) {
      return {
        active: false,
        reason: 'Missing secretReference for HMAC signature verification'
      };
    }
    return { active: true };
  }
}

export const connectionService = new ConnectionService();
export default connectionService;
