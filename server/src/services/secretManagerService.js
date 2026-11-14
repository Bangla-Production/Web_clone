/**
 * Abar Khabo: Enterprise Secret Manager Service
 * Provides access to Google Cloud Secret Manager for backend-only credential retrieval.
 * Supports sandbox mock secret vault for local testing without real credentials.
 * NEVER exposes secrets to client bundles, browser storage, logs, or Firestore.
 */

import logger from '../utils/logger.js';

class SecretManagerService {
  constructor() {
    // In-memory mock secret store for sandbox/emulator/testing
    this.mockSecrets = new Map();
    this.client = null;
  }

  /**
   * Formats a canonical GCP Secret Manager resource reference name.
   */
  createSecretReference(restaurantId, outletId, provider, version = '1') {
    const proj = process.env.GCLOUD_PROJECT || 'demo-abar-khabo';
    const secretId = `sec_${String(provider).toLowerCase()}_${restaurantId}_${outletId}`;
    return `projects/${proj}/secrets/${secretId}/versions/${version}`;
  }

  /**
   * Registers a mock secret in memory for sandbox/testing purposes.
   */
  setMockSecret(secretReference, secretValue) {
    if (!secretReference || !secretValue) {
      throw new Error('secretReference and secretValue are required');
    }
    this.mockSecrets.set(secretReference, secretValue);
  }

  /**
   * Clears mock secrets (for test teardown).
   */
  clearMockSecrets() {
    this.mockSecrets.clear();
  }

  /**
   * Retrieves a secret by its GCP Secret Manager reference string.
   * If in local/emulator mode, resolves from mock secret vault.
   *
   * @param {string} secretReference - Canonical GCP resource string
   * @returns {Promise<string>} Plaintext secret value
   */
  async getSecret(secretReference) {
    if (!secretReference || typeof secretReference !== 'string') {
      throw new Error('Invalid secretReference provided');
    }

    // 1. Check in-memory mock vault (used during testing and sandbox development)
    if (this.mockSecrets.has(secretReference)) {
      return this.mockSecrets.get(secretReference);
    }

    // 2. Local fallback using environment mapping (never committing real secrets)
    const envKey = secretReference.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
    if (process.env[envKey]) {
      return process.env[envKey];
    }

    // 3. Production Google Cloud Secret Manager invocation
    const isProduction = process.env.NODE_ENV === 'production' && !process.env.FIRESTORE_EMULATOR_HOST;
    if (isProduction) {
      try {
        if (!this.client) {
          const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
          this.client = new SecretManagerServiceClient();
        }
        const [version] = await this.client.accessSecretVersion({ name: secretReference });
        const payload = version.payload?.data?.toString('utf8');
        if (!payload) throw new Error('Secret payload empty');
        return payload;
      } catch (err) {
        logger.error('Failed to retrieve secret from GCP Secret Manager', {
          secretReference,
          error: err.message
        });
        throw new Error(`SecretManager retrieval failed: ${err.message}`);
      }
    }

    // If in sandbox and not found, provide a deterministic fallback mock secret for testing
    // to allow offline test execution without blocking.
    const fallbackMock = `mock_secret_for_${secretReference.split('/').slice(-3, -2)[0] || 'default'}`;
    this.mockSecrets.set(secretReference, fallbackMock);
    return fallbackMock;
  }
}

export const secretManagerService = new SecretManagerService();
export default secretManagerService;
