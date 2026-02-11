# Stage 13 Build Prompt — Observability, Testing & Production Hardening

> Paste this entire prompt into a fresh Claude Code session to build Stage 13 — the final stage.

---

## Your Railway Details

```
RAILWAY_PUBLIC_URL=<your Railway public URL, e.g. https://pokesnipe-production.up.railway.app>
```

All environment variables are already configured as Railway service variables. You do NOT need to create or modify any `.env` file.

The following Railway variables are relevant to this stage:
- `TELEGRAM_BOT_TOKEN` — (optional) Telegram Bot API token
- `TELEGRAM_CHAT_ID` — (optional) Telegram chat ID for alerts

If Telegram variables are not set, Telegram features should be silently skipped (not error).

---

## What you're building

**PokeSnipe** — a Pokemon card arbitrage scanner. **This is the final stage.**

- **Stage 1** (done): Express server, PostgreSQL, migrations, health endpoint
- **Stage 2** (done): Scrydex client, card sync — ~35,000+ cards with real pricing
- **Stage 3** (done): Card Catalog API + React frontend
- **Stage 4** (done): Exchange rate service + pricing engine + buyer protection + tier classifier
- **Stage 5** (done): eBay client — OAuth2 auth, searchItems, getItem, budget tracker
- **Stage 6** (done): Signal extraction pipeline
- **Stage 7** (done): Matching engine
- **Stage 8** (done): Scanner pipeline — end-to-end deal discovery
- **Stage 9** (done): Liquidity engine — real data scoring + tier adjustments
- **Stage 10** (done): Authentication & API — session auth, deals CRUD, lookup, status, preferences, SSE
- **Stage 11** (done): Deal lifecycle — expiry, pruning, cron job scheduler
- **Stage 12** (done): Frontend dashboard — login, deal feed, detail panel, filters, lookup, settings

This is **Stage 13 of 13**. You are adding observability (structured logging with correlation IDs, Telegram alerts), accuracy tracking, a matching accuracy test script, GitHub Actions CI, a production Dockerfile, and Railway config. After this stage, PokeSnipe is production-ready.

**Workflow:** You write the code, commit, and push to GitHub. Railway auto-deploys. Testing is live against the Railway deployment.

**IMPORTANT:** Build on top of the existing project. Do NOT re-initialize or overwrite existing files.

---

## Existing project structure (from Stages 1–12)

```
src/
├── config/index.ts                        ← Zod config (done)
├── db/pool.ts                             ← PostgreSQL pool (done)
├── middleware/
│   ├── auth.ts                            ← Session auth + requireAuth (done)
│   └── validation.ts                      ← Zod validation (done)
├── routes/
│   ├── health.ts                          ← GET /healthz (done)
│   ├── catalog.ts                         ← Card catalog API (done)
│   ├── deals.ts                           ← Deals CRUD (done)
│   ├── lookup.ts                          ← POST /api/lookup (done)
│   ├── status.ts                          ← GET /api/status (done)
│   ├── preferences.ts                     ← GET/PUT /api/preferences (done)
│   ├── velocity.ts                        ← GET /api/deals/:id/velocity (done)
│   └── sse.ts                             ← GET /api/deals/stream (done)
├── services/
│   ├── scrydex/                           ← Scrydex client (done)
│   ├── sync/                              ← Card sync (done)
│   ├── catalog/                           ← Catalog queries (done)
│   ├── exchange-rate/                     ← Exchange rate service (done)
│   ├── pricing/                           ← Pricing engine (done)
│   ├── ebay/                              ← eBay auth, client, budget (done)
│   ├── extraction/                        ← Signal extraction (done)
│   ├── matching/                          ← Matching engine (done)
│   ├── scanner/                           ← Scanner pipeline (done)
│   ├── liquidity/                         ← Liquidity engine (done)
│   ├── lifecycle/                         ← Deal expiry, pruning, status (done)
│   └── jobs/                              ← Cron job scheduler (done)
├── scripts/
│   ├── test-ebay.ts
│   ├── test-matching.ts
│   ├── test-liquidity.ts
│   ├── test-api.ts
│   ├── test-lifecycle.ts
│   └── test-dashboard.ts
├── app.ts                                 ← Express app (done)
└── server.ts                              ← Boot sequence (done)
client/                                    ← React frontend (done)
```

---

## Step 1: Create `src/services/logger/correlation.ts`

Generate and manage correlation IDs that trace a single eBay listing through the entire pipeline.

```typescript
import { randomUUID } from 'crypto';

/**
 * Generate a short correlation ID for tracing a listing through the pipeline.
 * Uses first 8 chars of a UUID for brevity in logs.
 */
export function generateCorrelationId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Context object passed through the pipeline.
 * Every function in the chain receives this and includes it in log calls.
 */
export interface PipelineContext {
  correlationId: string;
  ebayItemId?: string;
  service: string;
}

/**
 * Create a new pipeline context for a listing entering the scanner.
 */
export function createPipelineContext(ebayItemId: string): PipelineContext {
  return {
    correlationId: generateCorrelationId(),
    ebayItemId,
    service: 'scanner',
  };
}
```

---

## Step 2: Wire correlation IDs into the scanner pipeline

Update `src/services/scanner/scanner-service.ts` to generate a correlation ID for each listing and pass it through the pipeline.

At the start of processing each listing (inside the `for` loop):

```typescript
import { createPipelineContext } from '../logger/correlation.js';

// Inside the for loop, after dedup check:
const ctx = createPipelineContext(listing.itemId);
log.info({ ...ctx }, 'Processing listing');
```

Then include `ctx` or `ctx.correlationId` in all subsequent log calls for that listing:

```typescript
// After extracting signals:
log.debug({ ...ctx, rejected: signals.rejected }, 'Signals extracted');

// After matching:
log.debug({ ...ctx, matched: !!match, confidence: match?.confidence?.composite }, 'Match result');

// After enrichment:
log.info({ ...ctx, enriched: true }, 'Enriched listing');

// After creating deal:
log.info({ ...ctx, dealId: deal.dealId, tier, profit: deal.profitGBP }, 'Deal created');
```

Also update the scan cycle summary log:

```typescript
log.info({
  service: 'scanner',
  ...stats,
  durationMs,
}, 'Scan cycle complete');
```

**Important:** You do NOT need to refactor every function signature to accept `PipelineContext`. The simplest approach is to include `correlationId` in the log calls within `scanner-service.ts` where you already have access to the listing context. The child services (extraction, matching, pricing) can remain as-is — their log lines will appear in the Railway log stream adjacent to the correlated scanner logs.

---

## Step 3: Create `src/services/notifications/telegram.ts`

Telegram Bot API integration for alerts and deal notifications.

```typescript
import { logger } from '../../config/index.js';

const log = logger.child({ module: 'telegram' });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Check if Telegram is configured.
 */
export function isTelegramConfigured(): boolean {
  return !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

/**
 * Send a message via Telegram Bot API.
 * Silently skips if Telegram is not configured.
 */
async function sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
  if (!isTelegramConfigured()) return false;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: parseMode,
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      log.warn({ status: res.status, body }, 'Telegram send failed');
      return false;
    }

    return true;
  } catch (err) {
    log.error({ err }, 'Telegram send error');
    return false;
  }
}

/**
 * Send a system alert (warning or critical).
 */
export async function sendAlert(
  severity: 'critical' | 'warning',
  title: string,
  details: string
): Promise<void> {
  const emoji = severity === 'critical' ? '🚨' : '⚠️';
  const text = `${emoji} <b>${title}</b>\n${details}`;
  await sendMessage(text);
}

/**
 * Send a test message to verify Telegram configuration.
 */
export async function sendTestMessage(): Promise<boolean> {
  return sendMessage('✅ <b>PokeSnipe</b> — Telegram integration working!');
}
```

---

## Step 4: Create `src/services/notifications/deal-alerts.ts`

Send Telegram notifications for GRAIL and HIT deals.

```typescript
import { sendMessage, isTelegramConfigured } from './telegram.js';
import { logger } from '../../config/index.js';

const log = logger.child({ module: 'deal-alerts' });

interface DealAlertData {
  cardName: string;
  cardNumber?: string;
  expansionName?: string;
  ebayPriceGBP: number;
  marketPriceGBP: number;
  profitGBP: number;
  profitPercent: number;
  tier: string;
  condition: string;
  confidence: number;
  ebayUrl: string;
}

// Debounce: don't send more than 1 alert per 30 seconds
let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 30_000;

/**
 * Send a Telegram alert for a high-value deal.
 * Only sends for GRAIL and HIT tiers by default.
 */
export async function sendDealAlert(deal: DealAlertData): Promise<void> {
  if (!isTelegramConfigured()) return;

  // Only alert for GRAIL and HIT
  if (deal.tier !== 'GRAIL' && deal.tier !== 'HIT') return;

  // Cooldown — prevent spam during big scan batches
  const now = Date.now();
  if (now - lastAlertTime < ALERT_COOLDOWN_MS) {
    log.debug({ tier: deal.tier }, 'Deal alert skipped (cooldown)');
    return;
  }
  lastAlertTime = now;

  const tierEmoji = deal.tier === 'GRAIL' ? '💎' : '🔥';
  const tierLabel = deal.tier === 'GRAIL' ? 'GRAIL DEAL' : 'HIT DEAL';

  const text = [
    `${tierEmoji} <b>${tierLabel}</b>`,
    `<b>${deal.cardName}</b>${deal.cardNumber ? ` ${deal.cardNumber}` : ''}${deal.expansionName ? ` — ${deal.expansionName}` : ''}`,
    `eBay: £${deal.ebayPriceGBP.toFixed(2)} → Market: £${deal.marketPriceGBP.toFixed(2)}`,
    `Profit: <b>+£${deal.profitGBP.toFixed(2)} (+${deal.profitPercent.toFixed(0)}%)</b>`,
    `Condition: ${deal.condition} · Confidence: ${deal.confidence.toFixed(2)}`,
    `<a href="${deal.ebayUrl}">Open on eBay →</a>`,
  ].join('\n');

  const sent = await sendMessage(text);
  if (sent) {
    log.info({ tier: deal.tier, cardName: deal.cardName }, 'Deal alert sent');
  }
}
```

---

## Step 5: Wire deal alerts into the scanner

Update `src/services/scanner/scanner-service.ts` (or `deal-creator.ts`) to send deal alerts when GRAIL/HIT deals are created.

After a deal is successfully created (after the `createDeal()` call):

```typescript
import { sendDealAlert } from '../notifications/deal-alerts.js';

// After createDeal() succeeds:
if (deal) {
  // Fire and forget — don't block the scanner on Telegram
  sendDealAlert({
    cardName: enrichedMatch.card.name || data.ebayTitle,
    cardNumber: enrichedMatch.card.number,
    expansionName: enrichedMatch.card.expansionName,
    ebayPriceGBP: data.ebayPriceGBP,
    marketPriceGBP: realProfit.marketPriceGBP,
    profitGBP: realProfit.profitGBP,
    profitPercent: realProfit.profitPercent,
    tier: adjustedTier,
    condition: realCondition,
    confidence: enrichedMatch.confidence.composite,
    ebayUrl: data.ebayUrl,
  }).catch(err => log.warn({ err }, 'Deal alert failed'));
}
```

**Important:** Use `.catch()` — never let a Telegram failure crash the scanner.

---

## Step 6: Wire system alerts into existing services

Add alert triggers at the right places. Each alert is fire-and-forget with `.catch()`.

### 6a. Sync failures

In the sync service (wherever sync errors are caught):

```typescript
import { sendAlert } from '../notifications/telegram.js';

// In sync error handler:
catch (err) {
  log.error({ err }, 'Sync failed');
  sendAlert('critical', 'Sync Failed', `Error: ${err.message}`).catch(() => {});
}
```

### 6b. eBay rate limiting

In the eBay client (wherever 429 responses are handled):

```typescript
// Track consecutive 429s
let consecutive429s = 0;

// On 429 response:
consecutive429s++;
if (consecutive429s >= 3) {
  sendAlert('warning', 'eBay Rate Limited', `${consecutive429s} consecutive 429 responses`).catch(() => {});
}

// On successful response:
consecutive429s = 0;
```

### 6c. Exchange rate staleness

In the exchange rate refresh job or service:

```typescript
// After fetching rate, check if it's stale:
const lastFetched = await getLastFetchedAt();
if (lastFetched) {
  const hoursSinceFetch = (Date.now() - lastFetched.getTime()) / (1000 * 60 * 60);
  if (hoursSinceFetch > 4) {
    sendAlert('warning', 'Exchange Rate Stale', `Last fetch: ${hoursSinceFetch.toFixed(1)}h ago`).catch(() => {});
  }
}
```

### 6d. Card index staleness

In the job scheduler or a dedicated health check:

```typescript
// Check last sync time:
const lastSync = await pool.query("SELECT MAX(completed_at) as last FROM sync_log WHERE status = 'completed'");
if (lastSync.rows[0]?.last) {
  const hoursSinceSync = (Date.now() - new Date(lastSync.rows[0].last).getTime()) / (1000 * 60 * 60);
  if (hoursSinceSync > 48) {
    sendAlert('critical', 'Card Index Stale', `Last sync: ${hoursSinceSync.toFixed(0)}h ago`).catch(() => {});
  }
}
```

**Note:** These wiring steps modify existing files. Find the right place in each service to add the alert call. If the exact error handling patterns don't match your code, adapt — the key is to call `sendAlert()` at the appropriate failure/threshold points.

---

## Step 7: Create `src/services/notifications/index.ts`

```typescript
export { sendAlert, sendTestMessage, isTelegramConfigured } from './telegram.js';
export { sendDealAlert } from './deal-alerts.js';
```

---

## Step 8: Create Telegram test endpoint

Add a route for testing Telegram from the frontend settings panel.

In `src/routes/status.ts` (or create a new `src/routes/notifications.ts`):

```typescript
import { sendTestMessage, isTelegramConfigured } from '../services/notifications/index.js';

// POST /api/notifications/telegram/test
router.post('/notifications/telegram/test', async (req, res) => {
  if (!isTelegramConfigured()) {
    return res.status(400).json({
      error: 'Telegram not configured',
      detail: 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID as Railway service variables',
    });
  }

  const sent = await sendTestMessage();
  if (sent) {
    return res.json({ success: true, message: 'Test message sent' });
  }
  return res.status(500).json({ error: 'Failed to send test message' });
});
```

Mount this route with `requireAuth` in `src/app.ts`:

```typescript
app.use('/api', requireAuth, notificationsRouter);
// or add to existing statusRouter
```

---

## Step 9: Create accuracy tracking

### `src/services/accuracy/tracker.ts`

```typescript
import pool from '../../db/pool.js';
import { logger } from '../../config/index.js';
import { sendAlert } from '../notifications/telegram.js';

const log = logger.child({ module: 'accuracy' });

export interface AccuracyStats {
  rolling7d: number | null;     // percentage, e.g. 91.2
  totalReviewed: number;
  totalCorrect: number;
  totalIncorrect: number;
  incorrectReasons: Record<string, number>;
}

/**
 * Get accuracy statistics from reviewed deals.
 */
export async function getAccuracyStats(): Promise<AccuracyStats> {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE reviewed_at > NOW() - INTERVAL '7 days') as reviewed_7d,
      COUNT(*) FILTER (WHERE reviewed_at > NOW() - INTERVAL '7 days' AND is_correct_match = true) as correct_7d,
      COUNT(*) FILTER (WHERE is_correct_match IS NOT NULL) as total_reviewed,
      COUNT(*) FILTER (WHERE is_correct_match = true) as total_correct,
      COUNT(*) FILTER (WHERE is_correct_match = false) as total_incorrect
    FROM deals
    WHERE status = 'reviewed'
  `);

  const row = rows[0];
  const reviewed7d = parseInt(row.reviewed_7d) || 0;
  const correct7d = parseInt(row.correct_7d) || 0;
  const rolling7d = reviewed7d > 0 ? Math.round((correct7d / reviewed7d) * 1000) / 10 : null;

  // Get incorrect reason breakdown
  const reasonResult = await pool.query(`
    SELECT incorrect_reason, COUNT(*) as count
    FROM deals
    WHERE status = 'reviewed' AND is_correct_match = false AND incorrect_reason IS NOT NULL
    GROUP BY incorrect_reason
  `);
  const incorrectReasons: Record<string, number> = {};
  for (const r of reasonResult.rows) {
    incorrectReasons[r.incorrect_reason] = parseInt(r.count);
  }

  return {
    rolling7d,
    totalReviewed: parseInt(row.total_reviewed) || 0,
    totalCorrect: parseInt(row.total_correct) || 0,
    totalIncorrect: parseInt(row.total_incorrect) || 0,
    incorrectReasons,
  };
}

/**
 * Check accuracy and alert if it drops below threshold.
 * Call this periodically (e.g. from the job scheduler).
 */
export async function checkAccuracyThreshold(): Promise<void> {
  const stats = await getAccuracyStats();

  if (stats.rolling7d !== null && stats.rolling7d < 80 && stats.totalReviewed >= 10) {
    log.warn({ rolling7d: stats.rolling7d }, 'Accuracy below threshold');
    await sendAlert(
      'critical',
      'Accuracy Drop',
      `7-day rolling accuracy: ${stats.rolling7d}% (threshold: 80%)\nReviewed: ${stats.totalReviewed}, Correct: ${stats.totalCorrect}`
    ).catch(() => {});
  }
}
```

### Update `/api/status` to use the accuracy tracker

In `src/routes/status.ts`, replace the inline accuracy query with:

```typescript
import { getAccuracyStats } from '../services/accuracy/tracker.js';

// In the status handler, replace the accuracy query with:
const accuracyStats = await getAccuracyStats();

// In the response:
accuracy: {
  rolling7d: accuracyStats.rolling7d,
  totalReviewed: accuracyStats.totalReviewed,
  totalCorrect: accuracyStats.totalCorrect,
  totalIncorrect: accuracyStats.totalIncorrect,
  incorrectReasons: accuracyStats.incorrectReasons,
},
```

### Register accuracy check as a job

In `src/services/jobs/register-all.ts`, add:

```typescript
import { checkAccuracyThreshold } from '../accuracy/tracker.js';

// Add to registerAllJobs():
registerJob('accuracy-check', '0 */6 * * *', async () => {
  await checkAccuracyThreshold();
});
```

Runs every 6 hours — frequent enough to catch drops, infrequent enough to not spam.

---

## Step 10: Create `src/scripts/test-accuracy.ts`

A live script that tests matching accuracy against real eBay listings.

```typescript
/**
 * Matching accuracy test — run on Railway with:
 *   npx tsx src/scripts/test-accuracy.ts
 *
 * Fetches real eBay listings, runs each through the extraction + matching
 * pipeline, and outputs results for manual review.
 *
 * This is NOT an automated pass/fail test — it produces a report that
 * you review manually to assess matching quality.
 */
import pool from '../db/pool.js';
import { searchItems } from '../services/ebay/client.js';
import { trackCall } from '../services/ebay/budget.js';
import { extractSignals } from '../services/extraction/index.js';
import { matchListing } from '../services/matching/index.js';
import { logger } from '../config/index.js';

const log = logger.child({ module: 'test-accuracy' });

async function main() {
  console.log('\n🎯 Matching Accuracy Test — Live eBay Data\n');

  // Fetch real listings
  console.log('Fetching 50 eBay listings...');
  const listings = await searchItems({
    q: 'pokemon card',
    limit: 50,
    filter: [
      'buyingOptions:{FIXED_PRICE}',
      'deliveryCountry:GB',
      'price:[0.50..500]',
      'priceCurrency:GBP',
    ],
    sort: 'newlyListed',
  });
  trackCall();

  if (!listings?.itemSummaries?.length) {
    console.log('No listings returned from eBay');
    process.exit(1);
  }

  console.log(`Processing ${listings.itemSummaries.length} listings...\n`);

  let matched = 0;
  let rejected = 0;
  let noMatch = 0;
  const results: any[] = [];

  for (const listing of listings.itemSummaries) {
    const signals = extractSignals(listing);

    if (signals.rejected) {
      rejected++;
      continue;
    }

    const match = await matchListing(signals);

    if (!match) {
      noMatch++;
      results.push({
        ebayTitle: listing.title,
        status: 'NO MATCH',
        cardNumber: signals.cardNumber,
      });
      continue;
    }

    matched++;
    results.push({
      ebayTitle: listing.title,
      status: 'MATCHED',
      cardName: match.card.name,
      cardNumber: match.card.number,
      expansion: match.card.expansionName,
      variant: match.variant?.name,
      confidence: match.confidence.composite.toFixed(3),
      confidenceTier: match.confidence.composite >= 0.85 ? 'HIGH' :
                      match.confidence.composite >= 0.65 ? 'MED' : 'LOW',
    });
  }

  // Print results
  console.log('─'.repeat(100));
  console.log(
    'Status'.padEnd(10),
    'Conf'.padEnd(6),
    'eBay Title'.padEnd(50),
    'Matched Card'
  );
  console.log('─'.repeat(100));

  for (const r of results) {
    if (r.status === 'MATCHED') {
      const confColor = r.confidenceTier === 'HIGH' ? '🟢' : r.confidenceTier === 'MED' ? '🟡' : '🔴';
      console.log(
        `${confColor} MATCH`.padEnd(10),
        r.confidence.padEnd(6),
        r.ebayTitle.slice(0, 48).padEnd(50),
        `${r.cardName} ${r.cardNumber || ''} · ${r.expansion || ''} · ${r.variant || ''}`
      );
    } else {
      console.log(
        '⬜ NONE'.padEnd(10),
        '—'.padEnd(6),
        r.ebayTitle.slice(0, 48).padEnd(50),
        `(number: ${r.cardNumber?.number || 'none'})`
      );
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(100));
  console.log(`\n📊 Summary:`);
  console.log(`  Total listings: ${listings.itemSummaries.length}`);
  console.log(`  Rejected (junk): ${rejected}`);
  console.log(`  No match: ${noMatch}`);
  console.log(`  Matched: ${matched}`);
  console.log(`  Match rate: ${((matched / (matched + noMatch)) * 100).toFixed(1)}% (of non-junk)`);

  const highConf = results.filter(r => r.confidenceTier === 'HIGH').length;
  const medConf = results.filter(r => r.confidenceTier === 'MED').length;
  const lowConf = results.filter(r => r.confidenceTier === 'LOW').length;
  console.log(`  High confidence: ${highConf}, Medium: ${medConf}, Low: ${lowConf}`);

  console.log(`\n📝 Review the matches above manually.`);
  console.log(`   Count how many are correct vs incorrect.`);
  console.log(`   Accuracy = correct / matched × 100%\n`);

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

Run on Railway:

```bash
npx tsx src/scripts/test-accuracy.ts
```

This produces a human-readable report. You manually review the matches and count correct/incorrect to assess accuracy.

---

## Step 11: Create GitHub Actions CI

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Run pure function tests
        run: npm test
        # Pure function tests only — no DB, no API keys needed
        # Tests from stages: 4, 6, 7, 8, 9

      - name: Build backend
        run: npm run build

      - name: Install frontend dependencies
        run: cd client && npm ci

      - name: Build frontend
        run: cd client && npm run build
```

This CI pipeline runs on every push/PR to main. It only runs pure function tests (Vitest) — no database or API credentials needed.

---

## Step 12: Create Dockerfile

### `Dockerfile`

```dockerfile
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

# Build frontend (Vite → static files)
RUN cd client && npm run build

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
```

**Notes:**
- Multi-stage build: build stage has all dev dependencies, production stage is minimal
- Port 8080 matches Railway's default (adjust if your server uses a different port)
- Migrations directory is included so the server can run migrations at boot

---

## Step 13: Create Railway config

### `railway.toml`

```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/healthz"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

This tells Railway to:
- Use the Dockerfile for builds (instead of Nixpacks)
- Health check against `/healthz`
- Auto-restart on failure (up to 3 retries)

---

## Step 14: Ensure npm scripts are complete

Verify `package.json` has all the necessary scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "sync": "tsx src/scripts/run-sync.ts",
    "migrate": "tsx src/db/migrate.ts"
  }
}
```

If any of these are missing, add them. If the project uses different script names, that's fine — ensure `build`, `start`, and `test` exist as they're used by CI and the Dockerfile.

---

## Step 15: Create `src/scripts/test-observability.ts` — Live test script

```typescript
/**
 * Live observability test — run on Railway with:
 *   npx tsx src/scripts/test-observability.ts
 *
 * Tests:
 *   1. Structured logging is working
 *   2. Telegram alerts (if configured)
 *   3. Accuracy tracking
 *   4. System status includes all expected fields
 *   5. CI files exist
 */

import pool from '../db/pool.js';
import { isTelegramConfigured, sendTestMessage } from '../services/notifications/index.js';
import { getAccuracyStats } from '../services/accuracy/tracker.js';
import { getJobStatuses } from '../services/jobs/index.js';
import * as fs from 'fs';
import * as path from 'path';

const RAILWAY_URL = process.env.RAILWAY_PUBLIC_URL || process.env.RAILWAY_STATIC_URL || 'http://localhost:8080';
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD!;

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function getSessionCookie(): Promise<string> {
  const res = await fetch(`${RAILWAY_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ACCESS_PASSWORD }),
  });
  const cookie = res.headers.get('set-cookie') || '';
  const match = cookie.match(/connect\.sid=[^;]+/);
  return match ? match[0] : '';
}

async function main() {
  console.log(`\n🧪 Observability & Production Test — ${RAILWAY_URL}\n`);

  // ── Test 1: Telegram ──
  console.log('── Test 1: Telegram ──');
  const telegramConfigured = isTelegramConfigured();
  console.log(`  Telegram configured: ${telegramConfigured}`);

  if (telegramConfigured) {
    const sent = await sendTestMessage();
    check('Telegram test message sent', sent);
  } else {
    console.log('  ⚠️  Telegram not configured — skipping (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)');
    check('Telegram gracefully skipped when unconfigured', true);
  }

  // ── Test 2: Accuracy tracking ──
  console.log('\n── Test 2: Accuracy tracking ──');
  const accuracy = await getAccuracyStats();
  check('getAccuracyStats returns data', accuracy !== null);
  check('Has rolling7d field', accuracy.rolling7d !== undefined,
    accuracy.rolling7d !== null ? `${accuracy.rolling7d}%` : 'no reviews yet');
  check('Has totalReviewed', typeof accuracy.totalReviewed === 'number', `${accuracy.totalReviewed}`);
  check('Has incorrectReasons', typeof accuracy.incorrectReasons === 'object');

  // ── Test 3: Status API includes accuracy + jobs ──
  console.log('\n── Test 3: Status API completeness ──');
  const cookie = await getSessionCookie();
  const statusRes = await fetch(`${RAILWAY_URL}/api/status`, { headers: { Cookie: cookie } });
  const status = await statusRes.json();

  check('Status has accuracy', status.accuracy !== undefined);
  check('Status has jobs', status.jobs !== undefined);
  check('Status has scanner', status.scanner !== undefined);
  check('Status has ebay', status.ebay !== undefined);
  check('Status has sync', status.sync !== undefined);
  check('Status has exchangeRate', status.exchangeRate !== undefined);

  if (status.accuracy) {
    check('Accuracy has rolling7d', status.accuracy.rolling7d !== undefined);
    check('Accuracy has totalReviewed', typeof status.accuracy.totalReviewed === 'number');
  }

  if (status.jobs) {
    const jobNames = Object.keys(status.jobs);
    check('Jobs registered', jobNames.length >= 5, jobNames.join(', '));
    check('accuracy-check job registered', 'accuracy-check' in status.jobs);
  }

  // ── Test 4: Telegram test endpoint ──
  console.log('\n── Test 4: Telegram test endpoint ──');
  const telegramRes = await fetch(`${RAILWAY_URL}/api/notifications/telegram/test`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });

  if (telegramConfigured) {
    check('POST /api/notifications/telegram/test returns 200', telegramRes.status === 200);
  } else {
    check('Returns 400 when not configured', telegramRes.status === 400);
  }

  // ── Test 5: CI and Docker files exist ──
  console.log('\n── Test 5: Production files ──');
  const ciExists = fs.existsSync(path.join(process.cwd(), '.github/workflows/ci.yml'));
  check('CI workflow exists', ciExists, '.github/workflows/ci.yml');

  const dockerExists = fs.existsSync(path.join(process.cwd(), 'Dockerfile'));
  check('Dockerfile exists', dockerExists);

  const railwayExists = fs.existsSync(path.join(process.cwd(), 'railway.toml'));
  check('railway.toml exists', railwayExists);

  // ── Test 6: Correlation IDs in logs ──
  console.log('\n── Test 6: Correlation IDs ──');
  // We can't easily check Railway logs from here, but we can verify the module exists
  try {
    const { generateCorrelationId } = await import('../services/logger/correlation.js');
    const id = generateCorrelationId();
    check('generateCorrelationId works', typeof id === 'string' && id.length === 8, id);
  } catch (err) {
    check('Correlation module exists', false, 'import failed');
  }

  // ── Test 7: Deal alert function ──
  console.log('\n── Test 7: Deal alert function ──');
  try {
    const { sendDealAlert } = await import('../services/notifications/deal-alerts.js');
    check('sendDealAlert is importable', typeof sendDealAlert === 'function');
  } catch (err) {
    check('deal-alerts module exists', false, 'import failed');
  }

  // ── Summary ──
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ ${passed} passed, ❌ ${failed} failed`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

Run on Railway:

```bash
npx tsx src/scripts/test-observability.ts
```

---

## Step 16: 24-hour soak test verification

After deploying, let the system run for 24 hours, then verify:

```bash
# Deals accumulating
psql $DATABASE_URL -c "SELECT COUNT(*) FROM deals WHERE created_at > NOW() - INTERVAL '24 hours';"
# ✅ Should have deals

# Deal status mix
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM deals GROUP BY status;"
# ✅ Mix of active, expired, reviewed

# Exchange rates refreshing hourly
psql $DATABASE_URL -c "SELECT fetched_at FROM exchange_rates ORDER BY fetched_at DESC LIMIT 5;"
# ✅ Hourly entries

# Sync log — hot refresh running
psql $DATABASE_URL -c "SELECT sync_type, started_at, status FROM sync_log ORDER BY started_at DESC LIMIT 5;"
# ✅ Entries present, no failures

# eBay budget within limits
curl -b cookies.txt "$RAILWAY_URL/api/status" | jq '.ebay'
# ✅ callsToday < 5000

# Accuracy stats
curl -b cookies.txt "$RAILWAY_URL/api/status" | jq '.accuracy'
# ✅ Shows reviewed/correct counts

# Jobs all running
curl -b cookies.txt "$RAILWAY_URL/api/status" | jq '.jobs'
# ✅ All jobs have runCount > 0
```

---

## Deliverable

Production-ready PokeSnipe:

1. **Correlation IDs** — trace any listing through the full pipeline in Railway logs
2. **Telegram alerts** — GRAIL/HIT deal notifications + system alerts (sync failure, credits low, rate limited, stale data, accuracy drop)
3. **Accuracy tracking** — rolling 7-day accuracy from user reviews, incorrect reason breakdown, alert on drops below 80%
4. **Matching accuracy script** — `test-accuracy.ts` for manual accuracy assessment against live eBay data
5. **GitHub Actions CI** — type check + pure function tests + build on every push/PR
6. **Dockerfile** — multi-stage production build (backend + frontend)
7. **Railway config** — health check, restart policy
8. **Complete npm scripts** — dev, build, start, test, sync, migrate

---

## What's complete

**All 13 stages are now built.** PokeSnipe is a fully functional Pokemon card arbitrage scanner that:

- Syncs 35,000+ cards from Scrydex with real pricing
- Searches eBay every 5 minutes for new listings
- Extracts signals, matches against cards, calculates real profit
- Creates deals with full audit trails and liquidity assessment
- Serves a live dashboard with SSE real-time updates
- Protects everything behind password authentication
- Self-maintains: deals expire, data refreshes, new sets appear automatically
- Monitors itself: Telegram alerts, accuracy tracking, structured logging
- Deploys cleanly: Dockerfile, CI pipeline, Railway config
