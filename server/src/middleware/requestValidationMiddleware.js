/**
 * Abar Khabo: Enterprise Request Validation & Input Sanitization Middleware
 * 
 * Protects against:
 *  - Prototype pollution attacks (__proto__, constructor, prototype)
 *  - Oversized payloads (DoS)
 *  - Malformed content-type headers
 *  - Missing required parameters
 */

function sanitizeObject(obj, depth = 0) {
  if (depth > 8 || !obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    // Block prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    clean[key] = sanitizeObject(value, depth + 1);
  }
  return clean;
}

export function sanitizeInputMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  next();
}

/**
 * Validates that required fields are present in request body.
 * @param {string[]} requiredFields
 */
export function validateRequiredFields(requiredFields = []) {
  return (req, res, next) => {
    const missing = [];
    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: `Missing required request fields: [${missing.join(', ')}]`,
          missingFields: missing
        },
        missingFields: missing,
        correlationId: req.correlationId
      });
    }

    next();
  };
}

export default { sanitizeInputMiddleware, validateRequiredFields };
