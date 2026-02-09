import crypto from "crypto";
import { config } from "../config.js";

const COOKIE_NAME = "session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const sign = (payload: string) => {
  return crypto.createHmac("sha256", config.SESSION_SECRET).update(payload).digest("base64url");
};

export const createSessionToken = () => {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = JSON.stringify({ exp: expiresAt });
  const token = `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
  return { token, expiresAt };
};

export const verifySessionToken = (token?: string | null) => {
  if (!token) return { valid: false } as const;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return { valid: false } as const;
  const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  const expected = sign(payload);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { valid: false } as const;
  }
  const parsed = JSON.parse(payload) as { exp: number };
  if (Date.now() > parsed.exp) return { valid: false } as const;
  return { valid: true, exp: parsed.exp } as const;
};

export const sessionCookieName = COOKIE_NAME;
export const sessionTtlMs = SESSION_TTL_MS;
