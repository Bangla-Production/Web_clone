/**
 * Abar Khabo: Enterprise Structured Logger
 * Provides Cloud Run / GCP Cloud Logging compatible JSON log output.
 * Automatically redacts sensitive fields (PII, tokens, secrets) before emission.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'secret',
  'token',
  'apikey',
  'clientsecret',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'x-swiggy-signature',
  'x-zomato-signature',
  'aadhaar',
  'pan'
]);

function maskSensitiveData(obj, depth = 0) {
  if (depth > 6 || obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // Mask potential phone numbers in strings
    return obj.replace(/(\+?91[\s-]?)?[6789]\d{9}/g, '•••••••');
  }
  if (Array.isArray(obj)) {
    return obj.map(item => maskSensitiveData(item, depth + 1));
  }
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      if (
        SENSITIVE_KEYS.has(lower) ||
        lower.includes('secret') ||
        lower.includes('token') ||
        lower.includes('password') ||
        lower.includes('apikey')
      ) {
        sanitized[key] = '[REDACTED]';
      } else if (lower.includes('phone') && typeof value === 'string') {
        sanitized[key] = value.length >= 4 ? `••••••${value.slice(-4)}` : '••••';
      } else {
        sanitized[key] = maskSensitiveData(value, depth + 1);
      }
    }
    return sanitized;
  }
  return obj;
}

class Logger {
  constructor(service = 'abar-khabo-backend') {
    this.service = service;
  }

  _format(level, message, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      severity: level,
      service: this.service,
      message,
      ...maskSensitiveData(metadata)
    };
    return JSON.stringify(entry);
  }

  info(message, metadata = {}) {
    console.log(this._format('INFO', message, metadata));
  }

  warn(message, metadata = {}) {
    console.warn(this._format('WARNING', message, metadata));
  }

  error(message, metadata = {}) {
    console.error(this._format('ERROR', message, metadata));
  }

  debug(message, metadata = {}) {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.log(this._format('DEBUG', message, metadata));
    }
  }
}

export const logger = new Logger('aggregator-webhook-service');
export default logger;
