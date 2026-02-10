import pino from 'pino';

const logger = pino({ name: 'ebay-auth' });

const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SCOPE = 'https://api.ebay.com/oauth/api_scope';
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

let cachedToken: { token: string; expiresAt: Date } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt.getTime() - Date.now() > REFRESH_BUFFER_MS) {
    return cachedToken.token;
  }

  const clientId = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  logger.info('Fetching new eBay OAuth token');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`eBay token request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  cachedToken = {
    token: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };

  logger.info('eBay OAuth token obtained, expires in %d seconds', data.expires_in);
  return cachedToken.token;
}

export function clearTokenCache(): void {
  cachedToken = null;
}
