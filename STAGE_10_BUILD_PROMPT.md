# Stage 10 Build Prompt — Authentication & API Endpoints

> Paste this entire prompt into a fresh Claude Code session to build Stage 10.

---

## Your Railway Details

```
RAILWAY_PUBLIC_URL=<your Railway public URL, e.g. https://pokesnipe-production.up.railway.app>
```

All environment variables are already configured as Railway service variables (`DATABASE_URL`, `ACCESS_PASSWORD`, `SESSION_SECRET`, `SCRYDEX_API_KEY`, `SCRYDEX_TEAM_ID`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EXCHANGE_RATE_API_KEY`). You do NOT need to create or modify any `.env` file.

---

## What you're building

**PokeSnipe** — a Pokemon card arbitrage scanner.

- **Stage 1** (done): Express server, PostgreSQL, migrations, health endpoint
- **Stage 2** (done): Scrydex client, card sync — ~35,000+ cards with real pricing
- **Stage 3** (done): Card Catalog API + React frontend
- **Stage 4** (done): Exchange rate service + pricing engine + buyer protection + tier classifier
- **Stage 5** (done): eBay client — OAuth2 auth, searchItems, getItem, budget tracker
- **Stage 6** (done): Signal extraction — title cleaner, junk detector, number extractor, variant detector, condition mapper, signal merger
- **Stage 7** (done): Matching engine — candidate lookup, name validator, variant resolver, confidence scorer, gates
- **Stage 8** (done): Scanner pipeline — deduplicator, enrichment gate, tier classifier, deal creator, scanner service, scan loop
- **Stage 9** (done): Liquidity engine — tier1/tier2/tier3 signals, composite scoring, tier adjustment, velocity endpoint

This is **Stage 10 of 13**. You are building the authentication layer and all API endpoints. After this stage, the backend is fully functional — the scanner finds deals, the API serves them, and everything is protected behind password auth with session cookies.

**Workflow:** You write the code, commit, and push to GitHub. Railway auto-deploys. All testing is live against the Railway deployment using curl.

**IMPORTANT:** Build on top of the existing project. Do NOT re-initialize or overwrite existing files.

---

## Existing project structure (from Stages 1–9)

```
src/
├── config/index.ts                        ← Zod config (done)
├── db/pool.ts                             ← PostgreSQL pool (done)
├── routes/
│   ├── health.ts                          ← GET /healthz (done)
│   ├── catalog.ts                         ← Card catalog API — public, no auth (done)
│   └── velocity.ts                        ← GET /api/deals/:id/velocity (done, Stage 9)
├── middleware/                             ← (empty — you'll create auth here)
├── services/
│   ├── scrydex/                           ← Scrydex client (done)
│   ├── sync/                              ← Card sync (done)
│   ├── catalog/                           ← Catalog queries (done)
│   ├── exchange-rate/                     ← Exchange rate service (done)
│   ├── pricing/                           ← Pricing engine + buyer protection + tier (done)
│   ├── ebay/                              ← eBay auth, client, budget, rate limiter (done)
│   ├── extraction/                        ← Signal extraction pipeline (done)
│   ├── matching/                          ← Matching engine (done)
│   ├── scanner/                           ← Scanner pipeline (done)
│   └── liquidity/                         ← Liquidity engine (done)
├── scripts/
│   ├── test-ebay.ts                       ← Live eBay test (done)
│   ├── test-matching.ts                   ← Live matching test (done)
│   └── test-liquidity.ts                  ← Live liquidity test (done)
├── app.ts                                 ← Express app (done)
└── server.ts                              ← Boot sequence (done)
client/                                    ← React frontend (done)
```

---

## Reference: Database tables (already exist from Stage 1 migrations)

**preferences table** (singleton — stores user preferences as JSONB):
```sql
CREATE TABLE preferences (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data            JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**deals table** columns relevant to API responses:
```
deal_id, event_id, ebay_item_id, ebay_title, card_id, variant_id, status,
ebay_price_gbp, ebay_shipping_gbp, buyer_prot_fee, total_cost_gbp,
market_price_usd, market_price_gbp, exchange_rate, profit_gbp, profit_percent,
tier, confidence, confidence_tier, condition, condition_source,
is_graded, grading_company, grade, liquidity_score, liquidity_grade,
trend_7d, trend_30d, match_signals, ebay_image_url, ebay_url,
seller_name, seller_feedback, listed_at, reviewed_at, is_correct_match,
incorrect_reason, condition_comps, created_at, expires_at
```

**session table**: `connect-pg-simple` creates its own `session` table automatically — you do NOT need to create it manually.

---

## Step 1: Install packages

```bash
npm install express-session connect-pg-simple helmet
npm install -D @types/express-session
```

- `express-session` — session middleware
- `connect-pg-simple` — stores sessions in PostgreSQL (no Redis needed)
- `helmet` — security headers (XSS, clickjacking, etc.)

---

## Step 2: Create `src/middleware/auth.ts`

Password authentication and session middleware.

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import crypto from 'crypto';
import pool from '../db/pool.js';
import { logger } from '../config/index.js'; // adjust to your actual logger/config

const log = logger.child({ module: 'auth' });
const PgSession = connectPgSimple(session);

/**
 * Session middleware — stores sessions in PostgreSQL via connect-pg-simple.
 * The library auto-creates its `session` table on first use.
 */
export const sessionMiddleware = session({
  store: new PgSession({
    pool: pool,               // reuse existing pool
    tableName: 'session',     // default table name
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET!,  // Railway service variable, ≥32 chars
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
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
    log.info('Login successful');
    return res.json({ success: true });
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
```

**Key security decisions:**
- `crypto.timingSafeEqual` prevents timing attacks on password comparison
- Buffer lengths are checked first (timingSafeEqual requires equal length buffers)
- Sessions stored in PostgreSQL — survives server restarts
- `createTableIfMissing: true` means connect-pg-simple handles its own DDL
- 7-day session expiry, httpOnly cookies, sameSite lax
- `GET /auth/check` lets the frontend check auth state without a login attempt

---

## Step 3: Create `src/middleware/validation.ts`

Zod validation middleware for request bodies.

```typescript
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Validate request body against a Zod schema.
 * Returns 400 with flattened errors if validation fails.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten(),
      });
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validate query parameters against a Zod schema.
 * Returns 400 with flattened errors if validation fails.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: result.error.flatten(),
      });
    }
    req.query = result.data;
    next();
  };
}
```

---

## Step 4: Create `src/routes/deals.ts`

All deal endpoints — paginated list, detail, review, velocity. Protected with `requireAuth`.

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool.js';
import { validate } from '../middleware/validation.js';
import { logger } from '../config/index.js';

const log = logger.child({ module: 'deals-api' });
const router = Router();

/**
 * GET /api/deals — Paginated deal list with filtering and sorting.
 *
 * Query params:
 *   page    — Page number (default 1)
 *   limit   — Items per page (default 50, max 100)
 *   tier    — Comma-separated tier filter: "GRAIL,HIT"
 *   status  — Deal status filter (default "active")
 *   sort    — Sort field: "createdAt" (default), "profitPercent", "profitGbp"
 *   order   — Sort order: "desc" (default) or "asc"
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const status = (req.query.status as string) || 'active';
    const tierFilter = req.query.tier as string;  // e.g. "GRAIL,HIT"
    const sortField = req.query.sort as string || 'createdAt';
    const sortOrder = (req.query.order as string)?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Map sort fields to SQL columns
    const sortMap: Record<string, string> = {
      createdAt: 'created_at',
      profitPercent: 'profit_percent',
      profitGbp: 'profit_gbp',
      confidence: 'confidence',
      tier: 'tier',
    };
    const sortColumn = sortMap[sortField] || 'created_at';

    // Build WHERE clause
    const conditions: string[] = ['status = $1'];
    const params: any[] = [status];
    let paramIndex = 2;

    if (tierFilter) {
      const tiers = tierFilter.split(',').map(t => t.trim().toUpperCase());
      conditions.push(`tier = ANY($${paramIndex})`);
      params.push(tiers);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM deals WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Fetch page
    const { rows } = await pool.query(
      `SELECT
        deal_id, event_id, ebay_item_id, ebay_title,
        card_id, variant_id, status,
        ebay_price_gbp, ebay_shipping_gbp, buyer_prot_fee, total_cost_gbp,
        market_price_usd, market_price_gbp, exchange_rate,
        profit_gbp, profit_percent, tier,
        confidence, confidence_tier, condition, condition_source,
        is_graded, grading_company, grade,
        liquidity_score, liquidity_grade,
        trend_7d, trend_30d,
        ebay_image_url, ebay_url,
        seller_name, seller_feedback, listed_at,
        reviewed_at, is_correct_match, incorrect_reason,
        created_at, expires_at
      FROM deals
      WHERE ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // Also fetch card names for display
    const cardIds = [...new Set(rows.map(r => r.card_id).filter(Boolean))];
    let cardNames: Record<string, string> = {};
    if (cardIds.length > 0) {
      const cardResult = await pool.query(
        'SELECT scrydex_card_id, name FROM cards WHERE scrydex_card_id = ANY($1)',
        [cardIds]
      );
      cardNames = Object.fromEntries(cardResult.rows.map(r => [r.scrydex_card_id, r.name]));
    }

    const data = rows.map(row => ({
      ...row,
      cardName: cardNames[row.card_id] || null,
      // Parse numeric strings to numbers for JSON
      ebay_price_gbp: parseFloat(row.ebay_price_gbp),
      ebay_shipping_gbp: parseFloat(row.ebay_shipping_gbp),
      buyer_prot_fee: parseFloat(row.buyer_prot_fee),
      total_cost_gbp: parseFloat(row.total_cost_gbp),
      market_price_usd: row.market_price_usd ? parseFloat(row.market_price_usd) : null,
      market_price_gbp: row.market_price_gbp ? parseFloat(row.market_price_gbp) : null,
      profit_gbp: row.profit_gbp ? parseFloat(row.profit_gbp) : null,
      profit_percent: row.profit_percent ? parseFloat(row.profit_percent) : null,
      confidence: row.confidence ? parseFloat(row.confidence) : null,
      liquidity_score: row.liquidity_score ? parseFloat(row.liquidity_score) : null,
    }));

    return res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    log.error({ err }, 'Failed to fetch deals');
    return res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

/**
 * GET /api/deals/:id — Full deal detail.
 * Includes match_signals, condition_comps, and joined card/variant data.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*,
              c.name as card_name, c.number as card_number,
              e.name as expansion_name, e.code as expansion_code,
              v.name as variant_name, v.prices as variant_prices, v.trends as variant_trends
       FROM deals d
       LEFT JOIN cards c ON c.scrydex_card_id = d.card_id
       LEFT JOIN expansions e ON e.scrydex_id = c.expansion_id
       LEFT JOIN variants v ON v.id = d.variant_id
       WHERE d.deal_id = $1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = rows[0];

    // Parse numeric fields
    const numericFields = [
      'ebay_price_gbp', 'ebay_shipping_gbp', 'buyer_prot_fee', 'total_cost_gbp',
      'market_price_usd', 'market_price_gbp', 'exchange_rate',
      'profit_gbp', 'profit_percent', 'confidence', 'liquidity_score',
      'trend_7d', 'trend_30d'
    ];
    for (const field of numericFields) {
      if (deal[field] != null) deal[field] = parseFloat(deal[field]);
    }

    return res.json(deal);
  } catch (err) {
    log.error({ err }, 'Failed to fetch deal detail');
    return res.status(500).json({ error: 'Failed to fetch deal' });
  }
});

/**
 * POST /api/deals/:id/review — Mark a deal as correctly or incorrectly matched.
 */
const reviewSchema = z.object({
  isCorrectMatch: z.boolean(),
  reason: z.enum(['wrong_card', 'wrong_set', 'wrong_variant', 'wrong_price']).optional(),
});

router.post('/:id/review', validate(reviewSchema), async (req: Request, res: Response) => {
  try {
    const { isCorrectMatch, reason } = req.body;

    const { rowCount } = await pool.query(
      `UPDATE deals SET
        status = 'reviewed',
        reviewed_at = NOW(),
        is_correct_match = $1,
        incorrect_reason = $2
      WHERE deal_id = $3 AND status IN ('active', 'expired')`,
      [isCorrectMatch, isCorrectMatch ? null : (reason || null), req.params.id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Deal not found or already reviewed' });
    }

    log.info({ dealId: req.params.id, isCorrectMatch, reason }, 'Deal reviewed');
    return res.json({ success: true });
  } catch (err) {
    log.error({ err }, 'Failed to review deal');
    return res.status(500).json({ error: 'Failed to review deal' });
  }
});

export default router;
```

---

## Step 5: Create `src/routes/lookup.ts`

Manual lookup endpoint — paste an eBay URL, run it through the full pipeline.

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { logger } from '../config/index.js';

// Import from existing stages — adjust paths to match your actual exports:
import { getItem } from '../services/ebay/client.js';
import { trackCall, canMakeCall } from '../services/ebay/budget.js';
import { extractSignals } from '../services/extraction/index.js';
import { matchListing } from '../services/matching/index.js';
import { calculateProfit } from '../services/pricing/engine.js';
import { getValidRate } from '../services/exchange-rate/index.js';
import { calculateLiquidity, getVelocity } from '../services/liquidity/index.js';

const log = logger.child({ module: 'lookup' });
const router = Router();

const lookupSchema = z.object({
  ebayUrl: z.string().url().refine(
    (url) => /ebay\.(co\.uk|com)/.test(url),
    { message: 'Must be an eBay URL' }
  ),
});

/**
 * POST /api/lookup — Evaluate a single eBay listing through the full pipeline.
 *
 * Takes an eBay URL, extracts the item ID, fetches the listing,
 * and runs it through extraction → matching → pricing → liquidity.
 *
 * Returns the full analysis: matched card, variant, condition,
 * profit breakdown, confidence scores, liquidity, and debug data.
 */
router.post('/', validate(lookupSchema), async (req: Request, res: Response) => {
  try {
    const { ebayUrl } = req.body;

    // Extract item ID from URL
    // Handles: /itm/123456789, /itm/some-title/123456789, /itm/123456789?...
    const itemIdMatch = ebayUrl.match(/\/itm\/(?:.*\/)?(\d+)/);
    if (!itemIdMatch) {
      return res.status(400).json({ error: 'Could not extract item ID from URL' });
    }
    const itemId = itemIdMatch[1];

    // Check budget
    if (!canMakeCall()) {
      return res.status(429).json({ error: 'eBay API budget exhausted for today' });
    }

    // Fetch full listing from eBay
    log.info({ itemId, ebayUrl }, 'Manual lookup started');
    const listing = await getItem(itemId);
    trackCall();

    // Extract signals
    const signals = extractSignals(listing);

    // Match against card database
    const match = signals.rejected ? null : await matchListing(signals);

    // Calculate profit (if matched)
    let profit = null;
    let liquidity = null;

    if (match) {
      const ebayPriceGBP = parseFloat(listing.price?.value || '0');
      const ebayShippingGBP = parseFloat(listing.shippingOptions?.[0]?.shippingCost?.value || '0');
      const condition = signals.condition?.condition || 'LP';
      const exchangeRate = await getValidRate();

      profit = calculateProfit({
        ebayPriceGBP,
        shippingGBP: ebayShippingGBP,
        condition,
        variantPrices: match.variant.prices,
        exchangeRate,
      });

      // Calculate liquidity
      liquidity = calculateLiquidity(
        match.variant,
        condition,
        { concurrentSupply: 0, quantitySold: listing.quantitySold || 0 },
        null  // no velocity for manual lookup by default
      );
    }

    return res.json({
      itemId,
      ebayUrl,
      listing: {
        title: listing.title,
        price: listing.price,
        shipping: listing.shippingOptions?.[0]?.shippingCost,
        condition: listing.condition,
        conditionDescriptors: listing.conditionDescriptors,
        image: listing.image?.imageUrl,
        seller: listing.seller,
        quantitySold: listing.quantitySold,
      },
      signals: {
        rejected: signals.rejected,
        rejectReason: signals.rejectReason,
        cardNumber: signals.cardNumber,
        condition: signals.condition,
        variant: signals.variant,
        expansion: signals.expansion,
        isGraded: signals.isGraded,
      },
      match: match ? {
        cardId: match.card.scrydexCardId,
        cardName: match.card.name,
        cardNumber: match.card.number,
        expansionName: match.card.expansionName,
        variantName: match.variant.name,
        confidence: match.confidence,
      } : null,
      profit,
      liquidity: liquidity ? {
        composite: liquidity.composite,
        grade: liquidity.grade,
        signals: liquidity.signals,
      } : null,
    });
  } catch (err: any) {
    log.error({ err }, 'Lookup failed');

    // Handle eBay API errors gracefully
    if (err.status === 404 || err.message?.includes('not found')) {
      return res.status(404).json({ error: 'eBay listing not found' });
    }

    return res.status(500).json({ error: 'Lookup failed' });
  }
});

export default router;
```

---

## Step 6: Create `src/routes/status.ts`

System status endpoint — scanner health, API budgets, sync state, accuracy stats.

```typescript
import { Router, Request, Response } from 'express';
import pool from '../db/pool.js';
import { logger } from '../config/index.js';

// Import from existing stages — adjust paths to match your actual exports:
import { getBudgetStatus } from '../services/ebay/budget.js';
import { getDedupStats } from '../services/scanner/index.js';

const log = logger.child({ module: 'status' });
const router = Router();

/**
 * GET /api/status — System health and metrics.
 *
 * Returns scanner status, sync state, API budgets,
 * exchange rate health, and accuracy metrics.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Run all queries in parallel
    const [
      dealsToday,
      grailsToday,
      totalDeals,
      syncStats,
      exchangeRate,
      accuracyStats,
    ] = await Promise.all([
      // Deals created today
      pool.query("SELECT COUNT(*) FROM deals WHERE created_at > CURRENT_DATE"),

      // GRAILs today
      pool.query("SELECT COUNT(*) FROM deals WHERE created_at > CURRENT_DATE AND tier = 'GRAIL'"),

      // Total active deals
      pool.query("SELECT COUNT(*) FROM deals WHERE status = 'active'"),

      // Sync stats
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM cards) as total_cards,
          (SELECT COUNT(*) FROM expansions) as total_expansions,
          (SELECT MAX(updated_at) FROM cards) as last_sync
      `),

      // Exchange rate
      pool.query("SELECT rate, fetched_at FROM exchange_rates ORDER BY fetched_at DESC LIMIT 1"),

      // Accuracy (rolling 7d from reviewed deals)
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE reviewed_at > NOW() - INTERVAL '7 days') as reviewed_7d,
          COUNT(*) FILTER (WHERE reviewed_at > NOW() - INTERVAL '7 days' AND is_correct_match = true) as correct_7d,
          COUNT(*) FILTER (WHERE is_correct_match IS NOT NULL) as total_reviewed,
          COUNT(*) FILTER (WHERE is_correct_match = true) as total_correct
        FROM deals
        WHERE status = 'reviewed'
      `),
    ]);

    const ebayBudget = getBudgetStatus();
    const dedupStats = getDedupStats();

    const exchangeRateRow = exchangeRate.rows[0];
    const exchangeRateAge = exchangeRateRow
      ? (Date.now() - new Date(exchangeRateRow.fetched_at).getTime()) / (1000 * 60 * 60)
      : null;

    const accuracy = accuracyStats.rows[0];
    const reviewed7d = parseInt(accuracy.reviewed_7d) || 0;
    const correct7d = parseInt(accuracy.correct_7d) || 0;

    return res.json({
      scanner: {
        status: 'running',
        dealsToday: parseInt(dealsToday.rows[0].count),
        grailsToday: parseInt(grailsToday.rows[0].count),
        activeDeals: parseInt(totalDeals.rows[0].count),
        dedupMemorySize: dedupStats.memorySize,
      },
      sync: {
        totalCards: parseInt(syncStats.rows[0].total_cards),
        totalExpansions: parseInt(syncStats.rows[0].total_expansions),
        lastSync: syncStats.rows[0].last_sync,
      },
      ebay: {
        callsToday: ebayBudget.used || 0,
        dailyLimit: ebayBudget.limit || 5000,
        remaining: ebayBudget.remaining || 5000,
        status: (ebayBudget.remaining || 5000) > 500 ? 'healthy' : 'low',
      },
      exchangeRate: {
        rate: exchangeRateRow ? parseFloat(exchangeRateRow.rate) : null,
        fetchedAt: exchangeRateRow?.fetched_at || null,
        isStale: exchangeRateAge !== null ? exchangeRateAge > 4 : true,
      },
      accuracy: {
        rolling7d: reviewed7d > 0 ? Math.round((correct7d / reviewed7d) * 1000) / 10 : null,
        totalReviewed: parseInt(accuracy.total_reviewed) || 0,
        totalCorrect: parseInt(accuracy.total_correct) || 0,
      },
    });
  } catch (err) {
    log.error({ err }, 'Failed to fetch status');
    return res.status(500).json({ error: 'Failed to fetch status' });
  }
});

export default router;
```

---

## Step 7: Create `src/routes/preferences.ts`

User preferences — stored as a JSONB singleton.

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool.js';
import { validate } from '../middleware/validation.js';
import { logger } from '../config/index.js';

const log = logger.child({ module: 'preferences' });
const router = Router();

/**
 * GET /api/preferences — Get current preferences.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT data, updated_at FROM preferences WHERE id = 1'
    );

    if (rows.length === 0) {
      // Initialize if not exists
      await pool.query(
        "INSERT INTO preferences (id, data) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING"
      );
      return res.json({ data: {}, updatedAt: null });
    }

    return res.json({ data: rows[0].data, updatedAt: rows[0].updated_at });
  } catch (err) {
    log.error({ err }, 'Failed to fetch preferences');
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/preferences — Partial update (merge incoming JSON with existing).
 */
const prefsSchema = z.object({}).passthrough();  // Accept any JSON structure

router.put('/', validate(prefsSchema), async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO preferences (id, data, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         data = preferences.data || $1,
         updated_at = NOW()
       RETURNING data, updated_at`,
      [JSON.stringify(req.body)]
    );

    log.info('Preferences updated');
    return res.json({ data: rows[0].data, updatedAt: rows[0].updated_at });
  } catch (err) {
    log.error({ err }, 'Failed to update preferences');
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;
```

---

## Step 8: Create `src/routes/sse.ts`

Server-Sent Events for live deal streaming.

```typescript
import { Router, Request, Response } from 'express';
import { EventEmitter } from 'events';
import pool from '../db/pool.js';
import { logger } from '../config/index.js';

const log = logger.child({ module: 'sse' });
const router = Router();

/**
 * Global event emitter for SSE.
 * The scanner emits 'deal' events when new deals are created.
 * All SSE connections listen and forward to clients.
 */
export const sseEmitter = new EventEmitter();
sseEmitter.setMaxListeners(100);  // Allow up to 100 concurrent SSE connections

/**
 * GET /api/deals/stream — SSE endpoint for live deal updates.
 *
 * Events:
 *   deal    — New deal created (full deal JSON)
 *   status  — System status update (every 30s)
 *   :ping   — Keepalive comment (every 15s)
 *
 * Supports Last-Event-Id for replay on reconnect.
 */
router.get('/stream', async (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx buffering
  res.flushHeaders();

  log.info('SSE client connected');

  // Replay missed events if Last-Event-Id is provided
  const lastEventId = req.headers['last-event-id'];
  if (lastEventId) {
    try {
      const eventId = parseInt(lastEventId as string);
      if (!isNaN(eventId)) {
        const { rows } = await pool.query(
          `SELECT deal_id, event_id, ebay_title, tier, profit_gbp, profit_percent,
                  confidence, condition, ebay_image_url, ebay_url, created_at
           FROM deals
           WHERE event_id > $1
           ORDER BY event_id ASC`,
          [eventId]
        );
        for (const deal of rows) {
          res.write(`event: deal\nid: ${deal.event_id}\ndata: ${JSON.stringify(deal)}\n\n`);
        }
        log.info({ lastEventId: eventId, replayed: rows.length }, 'Replayed missed events');
      }
    } catch (err) {
      log.error({ err }, 'Failed to replay SSE events');
    }
  }

  // Listen for new deal events
  const onDeal = (deal: any) => {
    res.write(`event: deal\nid: ${deal.eventId}\ndata: ${JSON.stringify(deal)}\n\n`);
  };
  sseEmitter.on('deal', onDeal);

  // Keepalive ping every 15 seconds
  const pingInterval = setInterval(() => {
    res.write(':ping\n\n');
  }, 15_000);

  // Status update every 30 seconds
  const statusInterval = setInterval(async () => {
    try {
      const { rows } = await pool.query(
        "SELECT COUNT(*) as active FROM deals WHERE status = 'active'"
      );
      const statusData = {
        activeDeals: parseInt(rows[0].active),
        timestamp: new Date().toISOString(),
      };
      res.write(`event: status\ndata: ${JSON.stringify(statusData)}\n\n`);
    } catch {
      // Silently skip status on error
    }
  }, 30_000);

  // Cleanup on disconnect
  req.on('close', () => {
    sseEmitter.off('deal', onDeal);
    clearInterval(pingInterval);
    clearInterval(statusInterval);
    log.info('SSE client disconnected');
  });
});

export default router;
```

**Important: Wire the SSE emitter into deal-creator**

Update `src/services/scanner/deal-creator.ts` to emit SSE events when a deal is created. Add this import and emit call:

```typescript
// At the top of deal-creator.ts, add:
import { sseEmitter } from '../../routes/sse.js';

// After the successful INSERT (after the log.info), add:
sseEmitter.emit('deal', {
  dealId: deal.deal_id,
  eventId: deal.event_id,
  ebayTitle: data.ebayTitle,
  tier: data.tier,
  profitGBP: parseFloat(deal.profit_gbp),
  profitPercent: parseFloat(deal.profit_percent),
  confidence: data.confidence,
  condition: data.condition,
  ebayImageUrl: data.ebayImageUrl,
  ebayUrl: data.ebayUrl,
  createdAt: deal.created_at,
});
```

This ensures that every new deal is immediately pushed to all connected SSE clients.

---

## Step 9: Mount all routes in `src/app.ts`

Update `src/app.ts` to wire in session middleware, helmet, auth, and all new routes.

```typescript
import helmet from 'helmet';
import { sessionMiddleware, authRouter, requireAuth } from './middleware/auth.js';
import dealsRouter from './routes/deals.js';
import lookupRouter from './routes/lookup.js';
import statusRouter from './routes/status.js';
import preferencesRouter from './routes/preferences.js';
import sseRouter from './routes/sse.js';

// Add these BEFORE existing route mounts:

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,  // CSP handled separately if needed for React
}));

// JSON body parsing (if not already present)
app.use(express.json());

// Session middleware (must be before auth-protected routes)
app.use(sessionMiddleware);

// Auth routes (no auth required)
app.use('/auth', authRouter);

// Protected routes
app.use('/api/deals', requireAuth, sseRouter);     // SSE at /api/deals/stream (must be before deals CRUD)
app.use('/api/deals', requireAuth, dealsRouter);    // Deal CRUD at /api/deals/*
app.use('/api/lookup', requireAuth, lookupRouter);
app.use('/api/status', requireAuth, statusRouter);
app.use('/api/preferences', requireAuth, preferencesRouter);

// Move the existing velocity route behind auth too:
// If velocity.ts was previously mounted without auth, update it:
// app.use('/api', requireAuth, velocityRouter);  // was: app.use('/api', velocityRouter)

// Keep existing public routes as-is:
// app.use('/api/catalog', catalogRouter);  // Public — no auth
// app.use('/healthz', healthRouter);       // Public — health check
```

**Important notes on route ordering:**
- SSE route (`/api/deals/stream`) must be mounted BEFORE the deals CRUD router, otherwise `GET /api/deals/:id` would catch "stream" as an `:id` parameter
- The velocity endpoint from Stage 9 should now be protected with `requireAuth` — update its mount point
- Catalog routes remain public (no auth)
- Health check remains public (Railway needs it)
- `helmet()` adds security headers but CSP is disabled to avoid breaking the React frontend

---

## Step 10: Create `src/scripts/test-api.ts` — Live test script

This script tests all API endpoints against the live Railway deployment.

```typescript
/**
 * Live API test — run on Railway with:
 *   npx tsx src/scripts/test-api.ts
 *
 * Tests:
 *   1. Health endpoint (public)
 *   2. Protected endpoint returns 401 without auth
 *   3. Login with ACCESS_PASSWORD
 *   4. Auth check
 *   5. Deals list (paginated)
 *   6. Deal detail
 *   7. Deal review
 *   8. System status
 *   9. Preferences GET/PUT
 *   10. SSE stream connection
 *   11. Manual lookup (if eBay budget allows)
 *   12. Zod validation rejects bad input
 *   13. Logout
 *   14. Confirm 401 after logout
 */

const RAILWAY_URL = process.env.RAILWAY_PUBLIC_URL || process.env.RAILWAY_STATIC_URL || 'http://localhost:8080';
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD!;

let passed = 0;
let failed = 0;
let sessionCookie = '';

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// Helper to extract Set-Cookie header
function extractCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return '';
  const match = setCookie.match(/connect\.sid=[^;]+/);
  return match ? match[0] : '';
}

async function main() {
  console.log(`\n🧪 Live API Test — ${RAILWAY_URL}\n`);

  // ── Test 1: Health (public) ──
  console.log('── Test 1: Health endpoint ──');
  const healthRes = await fetch(`${RAILWAY_URL}/healthz`);
  check('GET /healthz returns 200', healthRes.status === 200);

  // ── Test 2: Protected without auth ──
  console.log('\n── Test 2: Protected endpoint without auth ──');
  const noAuthRes = await fetch(`${RAILWAY_URL}/api/deals`);
  check('GET /api/deals returns 401 without auth', noAuthRes.status === 401);

  // ── Test 3: Login ──
  console.log('\n── Test 3: Login ──');
  const loginRes = await fetch(`${RAILWAY_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ACCESS_PASSWORD }),
  });
  check('POST /auth/login returns 200', loginRes.status === 200);
  sessionCookie = extractCookie(loginRes);
  check('Session cookie received', sessionCookie.length > 0);

  // Wrong password
  const badLoginRes = await fetch(`${RAILWAY_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong-password-123' }),
  });
  check('Wrong password returns 401', badLoginRes.status === 401);

  // ── Test 4: Auth check ──
  console.log('\n── Test 4: Auth check ──');
  const authCheckRes = await fetch(`${RAILWAY_URL}/auth/check`, {
    headers: { Cookie: sessionCookie },
  });
  const authCheck = await authCheckRes.json();
  check('GET /auth/check returns authenticated=true', authCheck.authenticated === true);

  // ── Test 5: Deals list ──
  console.log('\n── Test 5: Deals list ──');
  const dealsRes = await fetch(`${RAILWAY_URL}/api/deals?limit=5`, {
    headers: { Cookie: sessionCookie },
  });
  check('GET /api/deals returns 200', dealsRes.status === 200);
  const dealsData = await dealsRes.json();
  check('Response has data array', Array.isArray(dealsData.data));
  check('Response has total count', typeof dealsData.total === 'number', `${dealsData.total} deals`);
  check('Response has pagination', dealsData.page !== undefined && dealsData.totalPages !== undefined);

  // Test tier filter
  const tierRes = await fetch(`${RAILWAY_URL}/api/deals?tier=GRAIL,HIT&limit=5`, {
    headers: { Cookie: sessionCookie },
  });
  check('Tier filter returns 200', tierRes.status === 200);

  // ── Test 6: Deal detail ──
  console.log('\n── Test 6: Deal detail ──');
  let dealId: string | null = null;
  if (dealsData.data.length > 0) {
    dealId = dealsData.data[0].deal_id;
    const detailRes = await fetch(`${RAILWAY_URL}/api/deals/${dealId}`, {
      headers: { Cookie: sessionCookie },
    });
    check('GET /api/deals/:id returns 200', detailRes.status === 200);
    const detail = await detailRes.json();
    check('Detail has card_name', detail.card_name !== undefined, detail.card_name);
    check('Detail has match_signals', detail.match_signals !== undefined);
    check('Detail has variant_prices', detail.variant_prices !== undefined);
  } else {
    console.log('  ⚠️  No deals in DB — skipping detail test');
  }

  // Non-existent deal
  const missingRes = await fetch(`${RAILWAY_URL}/api/deals/00000000-0000-0000-0000-000000000000`, {
    headers: { Cookie: sessionCookie },
  });
  check('Non-existent deal returns 404', missingRes.status === 404);

  // ── Test 7: Deal review ──
  console.log('\n── Test 7: Deal review ──');
  if (dealId) {
    const reviewRes = await fetch(`${RAILWAY_URL}/api/deals/${dealId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ isCorrectMatch: true }),
    });
    check('POST /api/deals/:id/review returns 200', reviewRes.status === 200);
  } else {
    console.log('  ⚠️  No deals — skipping review test');
  }

  // ── Test 8: System status ──
  console.log('\n── Test 8: System status ──');
  const statusRes = await fetch(`${RAILWAY_URL}/api/status`, {
    headers: { Cookie: sessionCookie },
  });
  check('GET /api/status returns 200', statusRes.status === 200);
  const status = await statusRes.json();
  check('Status has scanner', status.scanner !== undefined);
  check('Status has sync', status.sync !== undefined);
  check('Status has ebay', status.ebay !== undefined);
  check('Status has exchangeRate', status.exchangeRate !== undefined);
  check('Status has accuracy', status.accuracy !== undefined);
  console.log(`  Scanner: ${status.scanner?.dealsToday} deals today, ${status.scanner?.activeDeals} active`);
  console.log(`  eBay: ${status.ebay?.callsToday}/${status.ebay?.dailyLimit} calls`);
  console.log(`  Cards: ${status.sync?.totalCards}, Expansions: ${status.sync?.totalExpansions}`);

  // ── Test 9: Preferences ──
  console.log('\n── Test 9: Preferences ──');
  const prefsGetRes = await fetch(`${RAILWAY_URL}/api/preferences`, {
    headers: { Cookie: sessionCookie },
  });
  check('GET /api/preferences returns 200', prefsGetRes.status === 200);

  const prefsPutRes = await fetch(`${RAILWAY_URL}/api/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ testPref: true, theme: 'dark' }),
  });
  check('PUT /api/preferences returns 200', prefsPutRes.status === 200);
  const updatedPrefs = await prefsPutRes.json();
  check('Updated prefs contain new data', updatedPrefs.data?.testPref === true);

  // ── Test 10: SSE stream ──
  console.log('\n── Test 10: SSE stream ──');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);  // 5s max

    const sseRes = await fetch(`${RAILWAY_URL}/api/deals/stream`, {
      headers: { Cookie: sessionCookie },
      signal: controller.signal,
    });
    check('SSE endpoint returns 200', sseRes.status === 200);
    check('Content-Type is text/event-stream',
      sseRes.headers.get('content-type')?.includes('text/event-stream') || false);
    clearTimeout(timeout);
    controller.abort();  // Close connection
  } catch (err: any) {
    if (err.name === 'AbortError') {
      check('SSE connection established (aborted after 5s)', true);
    } else {
      check('SSE connection', false, err.message);
    }
  }

  // ── Test 11: Zod validation ──
  console.log('\n── Test 11: Zod validation ──');
  const badLookupRes = await fetch(`${RAILWAY_URL}/api/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ notAUrl: 123 }),
  });
  check('Invalid lookup body returns 400', badLookupRes.status === 400);
  const badLookupData = await badLookupRes.json();
  check('Error response has validation details', badLookupData.details !== undefined);

  const badReviewRes = await fetch(`${RAILWAY_URL}/api/deals/some-id/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ isCorrectMatch: 'not-a-boolean' }),
  });
  check('Invalid review body returns 400', badReviewRes.status === 400);

  // ── Test 12: Logout ──
  console.log('\n── Test 12: Logout ──');
  const logoutRes = await fetch(`${RAILWAY_URL}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
  });
  check('POST /auth/logout returns 200', logoutRes.status === 200);

  // ── Test 13: Confirm 401 after logout ──
  console.log('\n── Test 13: Confirm 401 after logout ──');
  const postLogoutRes = await fetch(`${RAILWAY_URL}/api/deals`, {
    headers: { Cookie: sessionCookie },
  });
  check('GET /api/deals returns 401 after logout', postLogoutRes.status === 401);

  // ── Summary ──
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ ${passed} passed, ❌ ${failed} failed`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

Run on Railway:

```bash
npx tsx src/scripts/test-api.ts
```

Expected output:
```
🧪 Live API Test — https://pokesnipe-production.up.railway.app

── Test 1: Health endpoint ──
  ✅ GET /healthz returns 200

── Test 2: Protected endpoint without auth ──
  ✅ GET /api/deals returns 401 without auth

── Test 3: Login ──
  ✅ POST /auth/login returns 200
  ✅ Session cookie received
  ✅ Wrong password returns 401

── Test 4: Auth check ──
  ✅ GET /auth/check returns authenticated=true

── Test 5: Deals list ──
  ✅ GET /api/deals returns 200
  ✅ Response has data array
  ✅ Response has total count — 47 deals
  ✅ Response has pagination
  ✅ Tier filter returns 200

── Test 6: Deal detail ──
  ✅ GET /api/deals/:id returns 200
  ✅ Detail has card_name — Charizard ex
  ✅ Detail has match_signals
  ✅ Detail has variant_prices
  ✅ Non-existent deal returns 404

── Test 7: Deal review ──
  ✅ POST /api/deals/:id/review returns 200

── Test 8: System status ──
  ✅ GET /api/status returns 200
  ✅ Status has scanner
  ✅ Status has sync
  ✅ Status has ebay
  ✅ Status has exchangeRate
  ✅ Status has accuracy
  Scanner: 12 deals today, 47 active
  eBay: 1847/5000 calls
  Cards: 35892, Expansions: 354

── Test 9: Preferences ──
  ✅ GET /api/preferences returns 200
  ✅ PUT /api/preferences returns 200
  ✅ Updated prefs contain new data

── Test 10: SSE stream ──
  ✅ SSE endpoint returns 200
  ✅ Content-Type is text/event-stream

── Test 11: Zod validation ──
  ✅ Invalid lookup body returns 400
  ✅ Error response has validation details
  ✅ Invalid review body returns 400

── Test 12: Logout ──
  ✅ POST /auth/logout returns 200

── Test 13: Confirm 401 after logout ──
  ✅ GET /api/deals returns 401 after logout

──────────────────────────────────────────────────
✅ 30 passed, ❌ 0 failed
```

This tests the full auth flow + every API endpoint with real data on Railway. 30 checks covering auth, CRUD, filtering, validation, SSE, and logout.

---

## Deliverable

A complete backend API:
- Password authentication with secure session cookies (7-day expiry, PostgreSQL-backed)
- `GET /api/deals` — paginated, filterable by tier/status, sortable
- `GET /api/deals/:id` — full deal detail with card name, match signals, variant prices
- `POST /api/deals/:id/review` — mark deals correct/incorrect for accuracy tracking
- `POST /api/lookup` — paste an eBay URL, get full pipeline analysis
- `GET /api/status` — scanner health, API budgets, sync state, accuracy
- `GET/PUT /api/preferences` — user preferences (singleton JSONB)
- `GET /api/deals/stream` — SSE for live deal updates with reconnect replay
- Zod validation on all request bodies
- Helmet security headers

---

## What NOT to build yet

- **Stage 11**: Deal lifecycle (expiry, pruning, background jobs with node-cron)
- **Stage 12**: Dashboard UI to view and interact with deals
- **Stage 13**: Observability, Telegram notifications, accuracy tracking
