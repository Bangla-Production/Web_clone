# ==============================================================================
# ABAR KHABO: PRODUCTION DOCKERFILE (GOOGLE CLOUD RUN COMPLIANT)
# Multi-stage, minimal attack surface, non-root execution (OWASP Compliant)
# ==============================================================================

# STAGE 1: Dependency Installation
FROM node:20-alpine AS dependencies
WORKDIR /app

# Install build dependencies if needed
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --omit=dev --ignore-scripts

# ==============================================================================
# STAGE 2: Production Runtime
# ==============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Security: Never run containers as root
USER node

# Copy dependencies from previous stage
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node package.json ./

# Copy server code
COPY --chown=node:node server ./server
COPY --chown=node:node firestore.rules ./

# Expose standard Cloud Run port
EXPOSE 8080

# Container Healthcheck (Liveness Probe)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/healthz').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the application
CMD ["node", "server/src/server.js"]
