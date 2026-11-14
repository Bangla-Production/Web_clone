/**
 * Abar Khabo: Enterprise Security Headers & Correlation ID Middleware
 * 
 * Enforces defensive HTTP response headers to protect against clickjacking,
 * MIME-type sniffing, cross-site scripting, and unauthorized caching.
 * Injects a unique correlation ID into every request for distributed tracing.
 */

import crypto from 'crypto';

export function securityHeadersMiddleware(req, res, next) {
  // 1. Correlation ID for end-to-end distributed tracing & structured logging
  const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  // 2. Strict defensive security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0'); // Modern best practice: disable legacy buggy XSS auditor
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self';");
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // 3. Cache control for API responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  next();
}

export default securityHeadersMiddleware;
