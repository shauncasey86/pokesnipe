// src/services/ebay/auth.ts
// ═══════════════════════════════════════════════════════════════════════════
// eBay OAuth2 Authentication - Client Credentials Flow
// ═══════════════════════════════════════════════════════════════════════════

import axios from 'axios';
import type { EbayTokenCache, EbayTokenResponse } from './types.js';
import { logger } from '../../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';

// Token cache with buffer time (refresh 5 minutes before expiry)
const TOKEN_BUFFER_MS = 5 * 60 * 1000;

// In-memory token cache
let tokenCache: EbayTokenCache = {
  token: null,
  expiresAt: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Get Access Token (with caching)
// ─────────────────────────────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  // Check if we have a valid cached token
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - TOKEN_BUFFER_MS) {
    return tokenCache.token;
  }

  // Need to fetch a new token
  try {
    const token = await fetchNewToken();
    return token;
  } catch (error) {
    logger.error({
      event: 'EBAY_AUTH_FAILED',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch New Token from eBay
// ─────────────────────────────────────────────────────────────────────────────

async function fetchNewToken(): Promise<string> {
  // Support both naming conventions: EBAY_APP_ID/EBAY_CERT_ID and EBAY_CLIENT_ID/EBAY_CLIENT_SECRET
  const clientId = process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CERT_ID || process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('eBay credentials not configured (EBAY_APP_ID/EBAY_CLIENT_ID, EBAY_CERT_ID/EBAY_CLIENT_SECRET)');
  }

  // Create Base64 encoded credentials
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  logger.debug({ event: 'EBAY_AUTH_REQUESTING', message: 'Fetching new access token' });

  const response = await axios.post<EbayTokenResponse>(
    EBAY_OAUTH_URL,
    'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
    }
  );

  const { access_token, expires_in } = response.data;

  if (!access_token) {
    throw new Error('No access token in eBay response');
  }

  // Cache the token
  tokenCache = {
    token: access_token,
    expiresAt: Date.now() + (expires_in * 1000),
  };

  logger.info({
    event: 'EBAY_AUTH_SUCCESS',
    expiresIn: expires_in,
    expiresAt: new Date(tokenCache.expiresAt).toISOString(),
  });

  return access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clear Token Cache (for testing or forced refresh)
// ─────────────────────────────────────────────────────────────────────────────

export function clearTokenCache(): void {
  tokenCache = {
    token: null,
    expiresAt: 0,
  };
  logger.debug({ event: 'EBAY_TOKEN_CACHE_CLEARED' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Check if we have a valid token
// ─────────────────────────────────────────────────────────────────────────────

export function hasValidToken(): boolean {
  return tokenCache.token !== null && Date.now() < tokenCache.expiresAt - TOKEN_BUFFER_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get token expiry info (for debugging/monitoring)
// ─────────────────────────────────────────────────────────────────────────────

export function getTokenInfo(): { hasToken: boolean; expiresAt: Date | null; expiresIn: number } {
  if (!tokenCache.token) {
    return { hasToken: false, expiresAt: null, expiresIn: 0 };
  }

  const expiresIn = Math.max(0, tokenCache.expiresAt - Date.now());
  
  return {
    hasToken: true,
    expiresAt: new Date(tokenCache.expiresAt),
    expiresIn: Math.floor(expiresIn / 1000), // seconds
  };
}