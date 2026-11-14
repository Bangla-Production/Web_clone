/**
 * Abar Khabo: Enterprise Rate Limiting & Abuse Prevention Middleware
 * 
 * Protects backend endpoints against brute-force attacks, DDoS, and runaway client polling.
 * Distinguishes between:
 *  - Standard user and staff API traffic (e.g. 60 requests / minute)
 *  - Aggregator webhook ingestion traffic (e.g. 300 requests / minute)
 */

class InMemoryRateLimiter {
  constructor() {
    this.buckets = new Map();
    // Periodically clean up expired bucket entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.buckets.entries()) {
        if (now > record.resetTime) {
          this.buckets.delete(key);
        }
      }
    }, 5 * 60 * 1000);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  isAllowed(key, maxRequests = 60, windowMs = 60 * 1000) {
    const now = Date.now();
    let record = this.buckets.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      this.buckets.set(key, record);
      return {
        allowed: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        resetTime: record.resetTime
      };
    }

    record.count++;
    const allowed = record.count <= maxRequests;
    return {
      allowed,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - record.count),
      resetTime: record.resetTime
    };
  }

  reset(key) {
    if (key) {
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
    }
  }
}

export const rateLimiterInstance = new InMemoryRateLimiter();

/**
 * Creates an Express rate-limiting middleware.
 * @param {Object} options
 * @param {number} options.maxRequests - Max requests per window (default: 60)
 * @param {number} options.windowMs - Time window in ms (default: 60000)
 * @param {string} options.bucketPrefix - Key prefix (e.g. 'api' or 'webhook')
 */
export function createRateLimiter(options = {}) {
  const maxRequests = options.maxRequests || 60;
  const windowMs = options.windowMs || 60 * 1000;
  const prefix = options.bucketPrefix || 'general';

  return (req, res, next) => {
    // Determine rate limiting key: prefer authenticated user UID, otherwise client IP
    const clientId = req.user?.uid || req.headers?.['x-forwarded-for'] || req.ip || '127.0.0.1';
    const key = `${prefix}:${clientId}`;

    const check = rateLimiterInstance.isAllowed(key, maxRequests, windowMs);

    res.setHeader('X-RateLimit-Limit', check.limit);
    res.setHeader('X-RateLimit-Remaining', check.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(check.resetTime / 1000));

    if (!check.allowed) {
      res.setHeader('Retry-After', Math.ceil((check.resetTime - Date.now()) / 1000));
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please slow down and retry shortly.'
        },
        retryAfterSeconds: Math.ceil((check.resetTime - Date.now()) / 1000),
        correlationId: req.correlationId
      });
    }

    next();
  };
}

export const apiRateLimiter = createRateLimiter({ maxRequests: 60, windowMs: 60 * 1000, bucketPrefix: 'api' });
export const webhookRateLimiter = createRateLimiter({ maxRequests: 300, windowMs: 60 * 1000, bucketPrefix: 'webhook' });
export const rateLimiter = createRateLimiter;

export default { createRateLimiter, rateLimiter, apiRateLimiter, webhookRateLimiter, rateLimiterInstance };
