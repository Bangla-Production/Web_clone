/**
 * Abar Khabo: Enterprise Server Entrypoint & Cloud Run Lifecycle Manager
 * 
 * Manages HTTP server lifecycle with graceful termination handling on SIGTERM/SIGINT.
 * Conforms to Google Cloud Run execution environment standards.
 */

import { createApp } from './app.js';
import logger from './utils/logger.js';

const PORT = process.env.PORT || 8080;
const app = createApp();

const server = app.listen(PORT, () => {
  logger.info('Abar Khabo Backend Service started successfully', {
    port: PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    cloudRunService: process.env.K_SERVICE || 'local-standalone'
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN (Google Cloud Run SIGTERM / Docker Stop Handling)
// ─────────────────────────────────────────────────────────────────────────────

function handleShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`, { signal });

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      logger.error('Error during HTTP server close', { error: err.message });
      process.exit(1);
    }
    logger.info('HTTP server closed cleanly. Exiting process.', { signal });
    process.exit(0);
  });

  // Force close if connections fail to drain within 10 seconds
  setTimeout(() => {
    logger.warn('Forcing process shutdown after timeout', { timeoutMs: 10000 });
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export { server, app };
