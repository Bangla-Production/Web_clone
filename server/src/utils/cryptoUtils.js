/**
 * Abar Khabo: Enterprise Cryptographic & Idempotency Utilities
 * Provides deterministic hashing, HMAC SHA-256 signature verification with
 * timing-safe comparison, timestamp drift verification, and collision-resistant IDs.
 */

import crypto from 'crypto';

/**
 * Constructs a deterministic, collision-resistant order ID.
 * Uses canonical tuple (provider, restaurantId, outletId, externalOrderId)
 * hashed with SHA-256 to eliminate key concatenation ambiguities.
 */
export function generateDeterministicOrderId(provider, restaurantId, outletId, externalOrderId) {
  if (!provider || !restaurantId || !outletId || !externalOrderId) {
    throw new Error('All components (provider, restaurantId, outletId, externalOrderId) are required for order ID generation');
  }

  const p = String(provider).trim().toUpperCase();
  const r = String(restaurantId).trim();
  const o = String(outletId).trim();
  const e = String(externalOrderId).trim();

  // Canonical RFC-style colon-delimited string
  const canonicalKey = `${p}:${r}:${o}:${e}`;
  const sha256Hash = crypto.createHash('sha256').update(canonicalKey, 'utf8').digest('hex');
  
  // Format: PROVIDER_16charHex
  const orderId = `${p}_${sha256Hash.substring(0, 16)}`;

  return {
    orderId,
    canonicalKey,
    sha256Hash
  };
}

/**
 * Computes an HMAC SHA-256 signature over the raw payload body.
 */
export function computeHmacSha256(rawBody, secret) {
  if (!secret) throw new Error('Secret is required to compute HMAC');
  const bodyString = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
  return crypto.createHmac('sha256', secret).update(bodyString, 'utf8').digest('hex');
}

/**
 * Verifies an HMAC SHA-256 signature using timing-safe constant-time equality.
 * Protects against timing side-channel attacks.
 */
export function verifyHmacSha256(rawBody, secret, signature) {
  if (!secret || !signature) return false;
  try {
    const expected = computeHmacSha256(rawBody, secret);
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');

    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

/**
 * Validates timestamp drift to protect against webhook replay attacks.
 * Default max allowable drift is 300 seconds (5 minutes).
 */
export function validateTimestampDrift(timestamp, maxDriftSeconds = 300) {
  if (!timestamp) return { valid: false, reason: 'Timestamp missing' };

  let eventMillis;
  if (typeof timestamp === 'number') {
    // If timestamp in seconds, convert to ms
    eventMillis = timestamp < 1e11 ? timestamp * 1000 : timestamp;
  } else {
    eventMillis = new Date(timestamp).getTime();
  }

  if (isNaN(eventMillis)) {
    return { valid: false, reason: 'Invalid timestamp format' };
  }

  const nowMillis = Date.now();
  const driftSeconds = Math.abs(nowMillis - eventMillis) / 1000;

  if (driftSeconds > maxDriftSeconds) {
    return {
      valid: false,
      driftSeconds,
      reason: `Timestamp drift (${driftSeconds.toFixed(1)}s) exceeds max allowed (${maxDriftSeconds}s). Potential replay attack.`
    };
  }

  return { valid: true, driftSeconds };
}

/**
 * Computes a SHA-256 hash string for arbitrary data.
 */
export function generateSha256(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Generates a deterministic webhook event ID for deduplication.
 */
export function generateWebhookEventId(provider, eventId, rawBody) {
  const p = String(provider).trim().toUpperCase();
  const seed = eventId ? `${p}:${eventId}` : `${p}:${typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)}`;
  const hash = crypto.createHash('sha256').update(seed, 'utf8').digest('hex');
  return `WH_${p}_${hash.substring(0, 20)}`;
}
