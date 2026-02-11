# ── Stage 1: Build ──
FROM node:20-alpine AS builder

WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm ci

# Install frontend dependencies
COPY client/package*.json ./client/
RUN cd client && npm ci

# Copy source
COPY . .

# Build backend (TypeScript → JavaScript)
RUN npm run build

# ── Stage 2: Production ──
FROM node:20-alpine

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy migrations (run at boot)
COPY --from=builder /app/migrations ./migrations

EXPOSE 8080

CMD ["node", "dist/server.js"]
