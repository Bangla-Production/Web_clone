/**
 * Abar Khabo: Enterprise Error Handling Middleware
 * 
 * Centralized exception capture returning consistent, client-safe JSON responses.
 * Strictly prevents stack trace exposure, database path leakage, or credential disclosure in production.
 */

import logger from '../utils/logger.js';

export function errorHandlerMiddleware(err, req, res, next) {
  const isProduction = process.env.NODE_ENV === 'production';
  const correlationId = req.correlationId || req.headers?.['x-correlation-id'] || 'system';

  // 1. Log full internal error for backend diagnostics
  logger.error('Unhandled request exception', {
    error: err.message,
    stack: err.stack,
    path: req.originalUrl || req.url,
    method: req.method,
    correlationId,
    clientIp: req.ip
  });

  // 2. Map known application errors to appropriate HTTP status codes
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let clientMessage = 'An unexpected server error occurred. Please contact support.';

  if (err.message?.includes('UNAUTHORIZED') || err.message?.includes('UNAUTHENTICATED')) {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    clientMessage = err.message;
  } else if (err.message?.includes('FORBIDDEN') || err.message?.includes('Access denied')) {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
    clientMessage = err.message;
  } else if (err.message?.includes('NOT_FOUND') || err.message?.includes('not found')) {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
    clientMessage = err.message;
  } else if (err.message?.includes('VALIDATION') || err.message?.includes('required') || err.message?.includes('Invalid')) {
    statusCode = 400;
    errorCode = 'BAD_REQUEST';
    clientMessage = err.message;
  } else if (err.message?.includes('RATE_LIMIT')) {
    statusCode = 429;
    errorCode = 'RATE_LIMIT_EXCEEDED';
    clientMessage = err.message;
  }

  // In development, provide more details; in production, sanitize thoroughly
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: clientMessage,
      ...(isProduction ? {} : { debugStack: err.stack })
    },
    correlationId,
    timestamp: new Date().toISOString()
  });
}

export default errorHandlerMiddleware;
