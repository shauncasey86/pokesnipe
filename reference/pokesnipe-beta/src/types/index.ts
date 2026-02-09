// src/types/index.ts

// ─────────────────────────────────────────────────────────────────────────────
// Core Application Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AppConfig {
  nodeEnv: string;
  port: number;
  ebay: {
    clientId: string;
    clientSecret: string;
    environment: 'SANDBOX' | 'PRODUCTION';
  };
  scrydex: {
    apiKey: string;
    teamId: string;
    baseUrl: string;
  };
  epn: {
    campaignId: string;
  };
}

export interface ApiResponse<T> {
  status: 'ok' | 'error';
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  status: 'ok' | 'error';
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}