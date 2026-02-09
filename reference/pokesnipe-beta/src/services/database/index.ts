// src/services/database/index.ts
// ═══════════════════════════════════════════════════════════════════════════
// Database Service Exports
// ═══════════════════════════════════════════════════════════════════════════

export {
  initializePool,
  initializeSchema,
  getPool,
  isConnected,
  query,
  getClient,
  transaction,
  closePool,
} from './postgres.js';

export * as pgDealStore from './pg-deal-store.js';
