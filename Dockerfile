# Multi-stage build for WebSocket server
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (Omitting --only=production because npm 10+ uses --omit=production)
RUN npm ci --omit=production

# Final stage
FROM node:24-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy node modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY index.js .
COPY package.json .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose port
EXPOSE 3001

# Health check (Fixed for ES Modules syntax)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node --eval "import('http').then(http => http.get('http://localhost:3001', r => { if (r.statusCode !== 200) throw new Error(r.statusCode); }))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start server
CMD ["node", "index.js"]