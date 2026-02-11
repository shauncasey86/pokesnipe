import { Router, Request, Response, NextFunction } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import crypto from 'crypto';
import pino from 'pino';
import { pool } from '../db/pool.js';

const log = pino({ name: 'auth' });
const PgSession = connectPgSimple(session);

/**
 * Session middleware — stores sessions in PostgreSQL via connect-pg-simple.
 * The library auto-creates its `session` table on first use.
 */
export const sessionMiddleware = session({
  store: new PgSession({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
  },
});

/**
 * Auth router — login/logout endpoints (no auth required on these).
 */
export const authRouter = Router();

// POST /auth/login — password → session cookie
authRouter.post('/login', (req: Request, res: Response) => {
  const { password } = req.body;

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password required' });
  }

  const accessPassword = process.env.ACCESS_PASSWORD!;

  // Constant-time comparison to prevent timing attacks
  const inputBuf = Buffer.from(password);
  const correctBuf = Buffer.from(accessPassword);

  // Lengths must match for timingSafeEqual — if not, always reject
  const isCorrectLength = inputBuf.length === correctBuf.length;
  const isMatch = isCorrectLength && crypto.timingSafeEqual(inputBuf, correctBuf);

  if (isMatch) {
    (req.session as any).authenticated = true;
    req.session.save((err) => {
      if (err) {
        log.error({ err }, 'Failed to save session');
        return res.status(500).json({ error: 'Session save failed' });
      }
      log.info('Login successful');
      return res.json({ success: true });
    });
    return;
  }

  log.warn('Login failed — invalid password');
  return res.status(401).json({ error: 'Invalid password' });
});

// POST /auth/logout — destroy session
authRouter.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      log.error({ err }, 'Failed to destroy session');
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

// GET /auth/check — check if currently authenticated
authRouter.get('/check', (req: Request, res: Response) => {
  return res.json({ authenticated: (req.session as any)?.authenticated === true });
});

/**
 * requireAuth middleware — protects routes that need authentication.
 * Returns 401 if not authenticated.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any)?.authenticated === true) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
}
