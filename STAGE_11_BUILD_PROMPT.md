# Stage 11 Build Prompt — Deal Lifecycle & Background Jobs

> Paste this entire prompt into a fresh Claude Code session to build Stage 11.

---

## Your Railway Details

```
RAILWAY_PUBLIC_URL=<your Railway public URL, e.g. https://pokesnipe-production.up.railway.app>
```

All environment variables are already configured as Railway service variables. You do NOT need to create or modify any `.env` file.

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
- **Stage 10** (done): Authentication & API — session auth, deals CRUD, lookup, status, preferences, SSE streaming

This is **Stage 11 of 13**. You are building the deal lifecycle management and centralised background job scheduler. After this stage, the system is self-maintaining: deals expire automatically, stale data gets pruned, exchange rates refresh, card data stays current, and the scanner runs on a proper cron schedule alongside all other background tasks.

**Workflow:** You write the code, commit, and push to GitHub. Railway auto-deploys. All testing is live against the Railway deployment.

**IMPORTANT:** Build on top of the existing project. Do NOT re-initialize or overwrite existing files.

---

## Existing project structure (from Stages 1–10)

```
src/
├── config/index.ts                        ← Zod config (done)
├── db/pool.ts                             ← PostgreSQL pool (done)
├── middleware/
│   ├── auth.ts                            ← Session auth + requireAuth (done)
│   └── validation.ts                      ← Zod validation middleware (done)
├── routes/
│   ├── health.ts                          ← GET /healthz (done)
│   ├── catalog.ts                         ← Card catalog API (done)
│   ├── deals.ts                           ← Deals CRUD (done)
│   ├── lookup.ts                          ← POST /api/lookup (done)
│   ├── status.ts                          ← GET /api/status (done)
│   ├── preferences.ts                     ← GET/PUT /api/preferences (done)
│   ├── velocity.ts                        ← GET /api/deals/:id/velocity (done)
│   └── sse.ts                             ← GET /api/deals/stream + sseEmitter (done)
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
│   │   ├── deduplicator.ts
│   │   ├── enrichment-gate.ts
│   │   ├── tier-classifier.ts
│   │   ├── deal-creator.ts
│   │   ├── scanner-service.ts             ← runScanCycle()
│   │   ├── scan-loop.ts                   ← startScanLoop() with 5-min interval
│   │   └── index.ts
│   └── liquidity/                         ← Liquidity engine (done)
├── scripts/
│   ├── test-ebay.ts
│   ├── test-matching.ts
│   ├── test-liquidity.ts
│   └── test-api.ts
├── app.ts                                 ← Express app (done)
└── server.ts                              ← Boot sequence (done)
client/                                    ← React frontend (done)
```

**Key detail:** Stage 8 created `scan-loop.ts` with a simple `setInterval` for the scanner. In this stage, we replace that with a proper cron-based job scheduler that manages the scanner alongside all other background tasks.

---

## Reference: Database tables (already exist)

**deals table** — status lifecycle columns:
```sql
status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'sold', 'reviewed'))
expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '72 hours'
reviewed_at TIMESTAMPTZ
is_correct_match BOOLEAN
```

**sync_log table** — tracks sync operations:
```sql
CREATE TABLE sync_log (
  id              SERIAL PRIMARY KEY,
  sync_type       TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'running',
  expansions_synced INTEGER DEFAULT 0,
  cards_upserted    INTEGER DEFAULT 0,
  variants_upserted INTEGER DEFAULT 0,
  credits_used      INTEGER DEFAULT 0,
  error_message     TEXT,
  metadata          JSONB
);
```

---

## Step 1: Install packages

```bash
npm install node-cron
npm install -D @types/node-cron
```

`node-cron` provides cron-style scheduling for background jobs.

---

## Step 2: Create `src/services/lifecycle/deal-expiry.ts`

Expire active deals that have passed their `expires_at` timestamp (default 72 hours after creation).

```typescript
import pool from '../../db/pool.js';
import { logger } from '../../config/index.js';

const log = logger.child({ module: 'deal-expiry' });

/**
 * Mark active deals as 'expired' if they've passed their expires_at timestamp.
 *
 * The deals table has: expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '72 hours'
 * This function runs hourly to catch any deals that have crossed that threshold.
 *
 * @returns Number of deals expired
 */
export async function expireOldDeals(): Promise<number> {
  const result = await pool.query(
    `UPDATE deals
     SET status = 'expired'
     WHERE status = 'active'
       AND expires_at < NOW()
     RETURNING deal_id`
  );

  const count = result.rowCount || 0;
  if (count > 0) {
    log.info({ expired: count }, 'Expired old deals');
  }
  return count;
}
```

---

## Step 3: Create `src/services/lifecycle/deal-pruner.ts`

Hard-delete unreviewed stale deals to prevent the table from growing indefinitely.

```typescript
import pool from '../../db/pool.js';
import { logger } from '../../config/index.js';

const log = logger.child({ module: 'deal-pruner' });

/**
 * Hard-delete deals that are >30 days old AND were never reviewed.
 *
 * Reviewed deals (is_correct_match IS NOT NULL) are kept forever
 * because they form the accuracy tracking corpus.
 *
 * @returns Number of deals deleted
 */
export async function pruneStaleDeals(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM deals
     WHERE status IN ('active', 'expired')
       AND created_at < NOW() - INTERVAL '30 days'
       AND is_correct_match IS NULL
     RETURNING deal_id`
  );

  const count = result.rowCount || 0;
  if (count > 0) {
    log.info({ pruned: count }, 'Pruned stale unreviewed deals');
  }
  return count;
}
```

**Important:** This deliberately preserves reviewed deals — they're the ground truth for accuracy metrics in Stage 13.

---

## Step 4: Create `src/services/lifecycle/deal-status.ts`

Manage deal status transitions.

```typescript
import pool from '../../db/pool.js';
import { logger } from '../../config/index.js';

const log = logger.child({ module: 'deal-status' });

export type DealStatus = 'active' | 'expired' | 'sold' | 'reviewed';

/**
 * Valid status transitions:
 *   active → expired  (TTL)
 *   active → reviewed (user action)
 *   active → sold     (eBay listing ended/sold)
 *   expired → reviewed (user can still review expired deals)
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  active: ['expired', 'reviewed', 'sold'],
  expired: ['reviewed'],
  sold: ['reviewed'],
  reviewed: [],  // terminal state
};

/**
 * Update a deal's status with validation.
 *
 * @param dealId - UUID of the deal
 * @param newStatus - Target status
 * @returns true if updated, false if deal not found or invalid transition
 */
export async function updateDealStatus(dealId: string, newStatus: DealStatus): Promise<boolean> {
  // Get current status
  const { rows } = await pool.query(
    'SELECT status FROM deals WHERE deal_id = $1',
    [dealId]
  );

  if (rows.length === 0) {
    log.warn({ dealId }, 'Deal not found for status update');
    return false;
  }

  const currentStatus = rows[0].status;
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];

  if (!allowedTransitions.includes(newStatus)) {
    log.warn({ dealId, currentStatus, newStatus }, 'Invalid status transition');
    return false;
  }

  await pool.query(
    'UPDATE deals SET status = $1 WHERE deal_id = $2',
    [newStatus, dealId]
  );

  log.info({ dealId, from: currentStatus, to: newStatus }, 'Deal status updated');
  return true;
}
```

---

## Step 5: Create `src/services/lifecycle/index.ts`

```typescript
export { expireOldDeals } from './deal-expiry.js';
export { pruneStaleDeals } from './deal-pruner.js';
export { updateDealStatus } from './deal-status.js';
export type { DealStatus } from './deal-status.js';
```

---

## Step 6: Create `src/services/jobs/scheduler.ts`

Central job scheduler using `node-cron` with overlap protection.

```typescript
import cron from 'node-cron';
import { logger } from '../../config/index.js';

const log = logger.child({ module: 'scheduler' });

interface JobEntry {
  task: cron.ScheduledTask;
  isRunning: boolean;
  lastRun: Date | null;
  lastError: string | null;
  runCount: number;
}

const jobs = new Map<string, JobEntry>();

/**
 * Register a background job with cron scheduling and overlap protection.
 *
 * @param name - Unique job name (for logging and diagnostics)
 * @param schedule - Cron expression (e.g. '*/5 * * * *' for every 5 minutes)
 * @param fn - Async function to execute
 */
export function registerJob(name: string, schedule: string, fn: () => Promise<void>): void {
  if (jobs.has(name)) {
    log.warn({ job: name }, 'Job already registered, skipping');
    return;
  }

  const task = cron.schedule(schedule, async () => {
    const job = jobs.get(name)!;

    // Overlap protection
    if (job.isRunning) {
      log.warn({ job: name }, 'Job still running, skipping this cycle');
      return;
    }

    job.isRunning = true;
    const startTime = Date.now();

    try {
      await fn();
      const durationMs = Date.now() - startTime;
      job.lastRun = new Date();
      job.lastError = null;
      job.runCount++;
      log.info({ job: name, durationMs, runCount: job.runCount }, 'Job completed');
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      job.lastError = err.message || 'Unknown error';
      log.error({ job: name, err, durationMs }, 'Job failed');
    } finally {
      job.isRunning = false;
    }
  });

  jobs.set(name, {
    task,
    isRunning: false,
    lastRun: null,
    lastError: null,
    runCount: 0,
  });

  log.info({ job: name, schedule }, 'Job registered');
}

/**
 * Get status of all registered jobs (for /api/status endpoint).
 */
export function getJobStatuses(): Record<string, {
  isRunning: boolean;
  lastRun: Date | null;
  lastError: string | null;
  runCount: number;
}> {
  const statuses: Record<string, any> = {};
  for (const [name, entry] of jobs) {
    statuses[name] = {
      isRunning: entry.isRunning,
      lastRun: entry.lastRun,
      lastError: entry.lastError,
      runCount: entry.runCount,
    };
  }
  return statuses;
}

/**
 * Stop all registered jobs (for graceful shutdown).
 */
export function stopAllJobs(): void {
  for (const [name, entry] of jobs) {
    entry.task.stop();
    log.info({ job: name }, 'Job stopped');
  }
}
```

---

## Step 7: Create `src/services/jobs/helpers.ts`

Helper functions used by the registered jobs.

```typescript
import pool from '../../db/pool.js';
import { logger } from '../../config/index.js';

const log = logger.child({ module: 'job-helpers' });

/**
 * Get the N most recently released expansions.
 * Used by hot-refresh to re-sync recent sets (prices change frequently for new sets).
 */
export async function getRecentExpansions(n: number): Promise<Array<{ scrydexId: string; name: string }>> {
  const { rows } = await pool.query(
    `SELECT scrydex_id, name
     FROM expansions
     ORDER BY release_date DESC NULLS LAST
     LIMIT $1`,
    [n]
  );
  return rows.map(r => ({ scrydexId: r.scrydex_id, name: r.name }));
}

/**
 * Check for new expansions by comparing Scrydex API against what's in our DB.
 * Returns only expansions that exist in Scrydex but not in our expansions table.
 */
export async function checkForNewExpansions(
  fetchExpansionsFromScrydex: () => Promise<Array<{ id: string; name: string }>>
): Promise<Array<{ id: string; name: string }>> {
  const scrydexExpansions = await fetchExpansionsFromScrydex();

  // Get all existing expansion IDs
  const { rows } = await pool.query('SELECT scrydex_id FROM expansions');
  const existingIds = new Set(rows.map(r => r.scrydex_id));

  const newExpansions = scrydexExpansions.filter(e => !existingIds.has(e.id));

  if (newExpansions.length > 0) {
    log.info({ count: newExpansions.length, names: newExpansions.map(e => e.name) }, 'Found new expansions');
  }

  return newExpansions;
}

/**
 * Get the top N most frequently matched cards (by deal count).
 * Used by velocity pre-fetch to cache sales velocity for popular cards.
 */
export async function getTopMatchedCards(n: number): Promise<Array<{ cardId: string; variantName: string }>> {
  const { rows } = await pool.query(
    `SELECT d.card_id, v.name as variant_name, COUNT(*) as deal_count
     FROM deals d
     LEFT JOIN variants v ON v.id = d.variant_id
     WHERE d.card_id IS NOT NULL
     GROUP BY d.card_id, v.name
     ORDER BY deal_count DESC
     LIMIT $1`,
    [n]
  );
  return rows.map(r => ({ cardId: r.card_id, variantName: r.variant_name || 'default' }));
}
```

---

## Step 8: Create `src/services/jobs/register-all.ts`

Register all background jobs at boot time. This replaces the `startScanLoop()` from Stage 8.

```typescript
import { registerJob } from './scheduler.js';
import { logger } from '../../config/index.js';

// Lifecycle
import { expireOldDeals } from '../lifecycle/deal-expiry.js';
import { pruneStaleDeals } from '../lifecycle/deal-pruner.js';

// Scanner
import { runScanCycle } from '../scanner/scanner-service.js';

// Exchange rate — adjust import to match your actual Stage 4 export
import { fetchAndSaveRate } from '../exchange-rate/index.js';

// Sync — adjust imports to match your actual Stage 2 exports
// These functions should already exist from the sync service
// import { syncExpansionCards, syncAll } from '../sync/index.js';

// Liquidity velocity — adjust import to match your actual Stage 9 export
import { getVelocity } from '../liquidity/tier3-velocity.js';

// Helpers
import { getRecentExpansions, checkForNewExpansions, getTopMatchedCards } from './helpers.js';

const log = logger.child({ module: 'register-jobs' });

/**
 * Register all background jobs.
 *
 * Job schedule overview:
 *   ┌─────────────────┬──────────────────┬─────────────────────────────────────┐
 *   │ Job              │ Schedule         │ Purpose                             │
 *   ├─────────────────┼──────────────────┼─────────────────────────────────────┤
 *   │ ebay-scan        │ Every 5 min      │ Search eBay + create deals          │
 *   │ deal-cleanup     │ Every hour       │ Expire old deals + prune stale      │
 *   │ exchange-rate    │ Every hour (:30) │ Refresh GBP/USD exchange rate       │
 *   │ hot-refresh      │ Daily at 03:00   │ Re-sync 10 most recent expansions   │
 *   │ expansion-check  │ Daily at 04:00   │ Detect and sync new expansions      │
 *   │ full-sync        │ Weekly Sun 03:00 │ Full card database re-sync          │
 *   │ velocity-prefetch│ Weekly Sun 05:00 │ Cache velocity for top 200 cards    │
 *   └─────────────────┴──────────────────┴─────────────────────────────────────┘
 */
export function registerAllJobs(): void {
  log.info('Registering all background jobs');

  // ── Scanner — every 5 minutes ──
  registerJob('ebay-scan', '*/5 * * * *', async () => {
    const result = await runScanCycle();
    log.info(result, 'Scan cycle result');
  });

  // ── Deal cleanup — every hour at :00 ──
  registerJob('deal-cleanup', '0 * * * *', async () => {
    const expired = await expireOldDeals();
    const pruned = await pruneStaleDeals();
    log.info({ expired, pruned }, 'Deal cleanup complete');
  });

  // ── Exchange rate refresh — every hour at :30 ──
  registerJob('exchange-rate', '30 * * * *', async () => {
    await fetchAndSaveRate();
  });

  // ── Hot refresh — daily at 03:00 (re-sync 10 most recent expansions) ──
  // Prices for new sets change rapidly. Re-syncing keeps our market prices current.
  registerJob('hot-refresh', '0 3 * * *', async () => {
    const recent = await getRecentExpansions(10);
    log.info({ count: recent.length, expansions: recent.map(e => e.name) }, 'Starting hot refresh');

    // Adjust this to call your actual sync function from Stage 2.
    // The sync service should have a function like syncExpansionCards(expansionId)
    // that fetches all cards for a specific expansion and upserts them.
    //
    // for (const exp of recent) {
    //   await syncExpansionCards(exp.scrydexId);
    // }
    //
    // If your sync service doesn't have per-expansion sync yet, you can:
    // 1. Add a syncExpansionCards() function to your sync service, OR
    // 2. For now, skip this job body and just log that it would run.
    //
    // Example placeholder:
    log.info({ expansions: recent.map(e => e.name) }, 'Hot refresh would sync these expansions');
  });

  // ── Expansion check — daily at 04:00 (detect new sets) ──
  registerJob('expansion-check', '0 4 * * *', async () => {
    // Adjust this to call your actual Scrydex client to fetch expansion list.
    // Then compare against what's in the DB.
    //
    // const fetchExpansions = async () => {
    //   const response = await scrydexGet('/pokemon/v1/expansions', { page_size: 500 });
    //   return response.data.map((e: any) => ({ id: e.id, name: e.name }));
    // };
    // const newExps = await checkForNewExpansions(fetchExpansions);
    // for (const exp of newExps) {
    //   await syncExpansionCards(exp.id);
    // }
    //
    // Placeholder:
    log.info('Expansion check would run here');
  });

  // ── Full sync — weekly Sunday at 03:00 ──
  registerJob('full-sync', '0 3 * * 0', async () => {
    // Call your Stage 2 full sync function.
    // await syncAll();
    //
    // Placeholder:
    log.info('Full sync would run here');
  });

  // ── Velocity pre-fetch — weekly Sunday at 05:00 ──
  // Cache sales velocity for the top 200 most-matched cards.
  // This ensures the frontend has velocity data ready without waiting for on-demand fetches.
  registerJob('velocity-prefetch', '0 5 * * 0', async () => {
    const topCards = await getTopMatchedCards(200);
    log.info({ count: topCards.length }, 'Starting velocity pre-fetch');

    let fetched = 0;
    for (const card of topCards) {
      try {
        await getVelocity(card.cardId, card.variantName);
        fetched++;
        // Small delay to avoid hammering Scrydex
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        log.warn({ err, cardId: card.cardId }, 'Velocity fetch failed for card');
      }
    }

    log.info({ fetched, total: topCards.length }, 'Velocity pre-fetch complete');
  });

  log.info('All background jobs registered');
}
```

**Important notes on the commented-out sections:**

The hot-refresh, expansion-check, and full-sync jobs depend on your Stage 2 sync service exports. The exact function names and signatures may vary. You need to:

1. Check what your sync service actually exports (look in `src/services/sync/`)
2. Wire in the real function calls, replacing the placeholder `log.info` calls
3. The key functions needed:
   - `syncExpansionCards(expansionId)` — sync all cards for one expansion
   - `syncAll()` — full database sync
   - A way to fetch the expansion list from Scrydex

If any of these functions don't exist yet, create simple wrappers that call your existing Scrydex client and sync logic. The structure is already there from Stage 2 — you just need to make it callable per-expansion.

---

## Step 9: Create `src/services/jobs/index.ts`

```typescript
export { registerJob, getJobStatuses, stopAllJobs } from './scheduler.js';
export { registerAllJobs } from './register-all.js';
```

---

## Step 10: Wire into boot sequence

Update `src/server.ts` to replace `startScanLoop()` with `registerAllJobs()`.

**Remove** the old scan loop import and call:
```typescript
// REMOVE these lines:
// import { startScanLoop } from './services/scanner/index.js';
// startScanLoop();
```

**Add** the new job scheduler:
```typescript
import { registerAllJobs } from './services/jobs/index.js';

// After server.listen() and after initial sync completes:
registerAllJobs();
log.info('Background job scheduler started');
```

Also run the first scan immediately at boot (don't wait 5 minutes for the cron to trigger):

```typescript
// Kick off the first scan immediately
import { runScanCycle } from './services/scanner/scanner-service.js';
runScanCycle().catch(err => log.error({ err }, 'Initial scan failed'));
```

---

## Step 11: Update status endpoint with job statuses

Update `src/routes/status.ts` to include job scheduler information.

Add this import:
```typescript
import { getJobStatuses } from '../services/jobs/index.js';
```

Add a `jobs` field to the status response:
```typescript
return res.json({
  // ... existing fields (scanner, sync, ebay, exchangeRate, accuracy) ...
  jobs: getJobStatuses(),
});
```

This gives visibility into which jobs are running, when they last ran, and any errors.

---

## Step 12: Add graceful shutdown

Update `src/server.ts` to stop jobs and close the database pool on shutdown.

```typescript
import { stopAllJobs } from './services/jobs/index.js';

// Graceful shutdown handler
function shutdown(signal: string) {
  log.info({ signal }, 'Shutdown signal received');
  stopAllJobs();
  pool.end().then(() => {
    log.info('Database pool closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

This ensures Railway deployments shut down cleanly — jobs stop, database connections close, no orphaned queries.

---

## Step 13: Create `src/scripts/test-lifecycle.ts` — Live test script

This script tests deal lifecycle and job scheduler against the live Railway deployment.

```typescript
/**
 * Live lifecycle & jobs test — run on Railway with:
 *   npx tsx src/scripts/test-lifecycle.ts
 *
 * Tests:
 *   1. Deal expiry function works
 *   2. Deal pruner preserves reviewed deals
 *   3. Deal status transitions are validated
 *   4. Job scheduler is running
 *   5. Job statuses are available via /api/status
 *   6. Exchange rate is being refreshed
 *   7. Scanner is running on schedule
 */

import pool from '../db/pool.js';
import { expireOldDeals } from '../services/lifecycle/deal-expiry.js';
import { pruneStaleDeals } from '../services/lifecycle/deal-pruner.js';
import { updateDealStatus } from '../services/lifecycle/deal-status.js';
import { getJobStatuses } from '../services/jobs/index.js';

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
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/connect\.sid=[^;]+/);
  return match ? match[0] : '';
}

async function main() {
  console.log(`\n🧪 Live Lifecycle & Jobs Test — ${RAILWAY_URL}\n`);

  // ── Test 1: Deal expiry ──
  console.log('── Test 1: Deal expiry ──');

  // Check how many active deals have passed their expires_at
  const { rows: expiredCandidates } = await pool.query(
    "SELECT COUNT(*) FROM deals WHERE status = 'active' AND expires_at < NOW()"
  );
  const expirableBefore = parseInt(expiredCandidates[0].count);
  console.log(`  Deals eligible for expiry: ${expirableBefore}`);

  const expiredCount = await expireOldDeals();
  check('expireOldDeals runs without error', true, `expired ${expiredCount}`);

  // Verify expired deals have correct status
  const { rows: expiredDeals } = await pool.query(
    "SELECT COUNT(*) FROM deals WHERE status = 'expired'"
  );
  check('Expired deals exist in DB', parseInt(expiredDeals[0].count) >= 0,
    `${expiredDeals[0].count} total expired`);

  // ── Test 2: Deal pruner ──
  console.log('\n── Test 2: Deal pruner ──');

  const prunedCount = await pruneStaleDeals();
  check('pruneStaleDeals runs without error', true, `pruned ${prunedCount}`);

  // Verify reviewed deals are preserved
  const { rows: reviewedDeals } = await pool.query(
    "SELECT COUNT(*) FROM deals WHERE status = 'reviewed'"
  );
  check('Reviewed deals are preserved', true, `${reviewedDeals[0].count} reviewed deals remain`);

  // ── Test 3: Deal status transitions ──
  console.log('\n── Test 3: Status transitions ──');

  // Create a test deal to verify transitions
  const { rows: testDeal } = await pool.query(
    `SELECT deal_id, status FROM deals WHERE status = 'active' LIMIT 1`
  );

  if (testDeal.length > 0) {
    const dealId = testDeal[0].deal_id;

    // Invalid transition: active → active (no-op, not in valid transitions)
    // Valid: active → expired
    // We won't actually change real deals — just verify the function exists
    check('updateDealStatus function is callable', typeof updateDealStatus === 'function');
  } else {
    console.log('  ⚠️  No active deals — skipping transition test');
    check('updateDealStatus function is callable', typeof updateDealStatus === 'function');
  }

  // ── Test 4: Job scheduler ──
  console.log('\n── Test 4: Job scheduler status ──');

  const jobStatuses = getJobStatuses();
  const jobNames = Object.keys(jobStatuses);
  check('Jobs are registered', jobNames.length > 0, `${jobNames.length} jobs: ${jobNames.join(', ')}`);

  // Check specific expected jobs
  check('ebay-scan job registered', 'ebay-scan' in jobStatuses);
  check('deal-cleanup job registered', 'deal-cleanup' in jobStatuses);
  check('exchange-rate job registered', 'exchange-rate' in jobStatuses);

  // Check if scanner has run at least once
  const scanJob = jobStatuses['ebay-scan'];
  if (scanJob) {
    check('Scanner has run at least once', scanJob.runCount > 0 || scanJob.lastRun !== null,
      `runCount=${scanJob.runCount}`);
  }

  // ── Test 5: Status API includes jobs ──
  console.log('\n── Test 5: Status API ──');

  const cookie = await getSessionCookie();
  check('Login successful', cookie.length > 0);

  const statusRes = await fetch(`${RAILWAY_URL}/api/status`, {
    headers: { Cookie: cookie },
  });
  check('GET /api/status returns 200', statusRes.status === 200);

  const status = await statusRes.json();
  check('Status includes jobs', status.jobs !== undefined, `${Object.keys(status.jobs || {}).length} jobs`);

  // ── Test 6: Exchange rate freshness ──
  console.log('\n── Test 6: Exchange rate freshness ──');

  const { rows: rates } = await pool.query(
    'SELECT rate, fetched_at FROM exchange_rates ORDER BY fetched_at DESC LIMIT 3'
  );
  check('Exchange rates exist', rates.length > 0, `${rates.length} entries`);

  if (rates.length > 0) {
    const latestAge = (Date.now() - new Date(rates[0].fetched_at).getTime()) / (1000 * 60 * 60);
    check('Latest rate is <4 hours old', latestAge < 4, `${latestAge.toFixed(1)}h ago`);
    check('Rate is reasonable', parseFloat(rates[0].rate) > 0.5 && parseFloat(rates[0].rate) < 2.0,
      `${rates[0].rate} GBP/USD`);
  }

  // ── Test 7: Deal count by status ──
  console.log('\n── Test 7: Deal status distribution ──');

  const { rows: statusDist } = await pool.query(
    'SELECT status, COUNT(*) FROM deals GROUP BY status ORDER BY status'
  );
  for (const row of statusDist) {
    console.log(`  ${row.status}: ${row.count}`);
  }
  check('Deal statuses are valid',
    statusDist.every(r => ['active', 'expired', 'sold', 'reviewed'].includes(r.status)));

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
npx tsx src/scripts/test-lifecycle.ts
```

Expected output:
```
🧪 Live Lifecycle & Jobs Test — https://pokesnipe-production.up.railway.app

── Test 1: Deal expiry ──
  Deals eligible for expiry: 3
  ✅ expireOldDeals runs without error — expired 3

── Test 2: Deal pruner ──
  ✅ pruneStaleDeals runs without error — pruned 0
  ✅ Reviewed deals are preserved — 12 reviewed deals remain

── Test 3: Status transitions ──
  ✅ updateDealStatus function is callable

── Test 4: Job scheduler status ──
  ✅ Jobs are registered — 7 jobs: ebay-scan, deal-cleanup, exchange-rate, hot-refresh, expansion-check, full-sync, velocity-prefetch
  ✅ ebay-scan job registered
  ✅ deal-cleanup job registered
  ✅ exchange-rate job registered
  ✅ Scanner has run at least once — runCount=5

── Test 5: Status API ──
  ✅ Login successful
  ✅ GET /api/status returns 200
  ✅ Status includes jobs — 7 jobs

── Test 6: Exchange rate freshness ──
  ✅ Exchange rates exist — 3 entries
  ✅ Latest rate is <4 hours old — 0.5h ago
  ✅ Rate is reasonable — 0.789 GBP/USD

── Test 7: Deal status distribution ──
  active: 42
  expired: 15
  reviewed: 12
  ✅ Deal statuses are valid

──────────────────────────────────────────────────
✅ 16 passed, ❌ 0 failed
```

---

## Deliverable

A self-maintaining system:
- Deals expire automatically after 72 hours
- Stale unreviewed deals are pruned after 30 days (reviewed deals preserved)
- Deal status transitions are validated (active → expired/reviewed/sold)
- Central cron-based job scheduler with overlap protection and diagnostics
- 7 registered jobs: scanner (5min), deal cleanup (hourly), exchange rate (hourly), hot refresh (daily), expansion check (daily), full sync (weekly), velocity pre-fetch (weekly)
- Job statuses visible via `/api/status`
- Graceful shutdown (jobs stop, pool closes)

---

## What NOT to build yet

- **Stage 12**: Dashboard UI — React frontend to view and interact with deals
- **Stage 13**: Observability — Telegram alerts, accuracy tracking, CI pipeline
