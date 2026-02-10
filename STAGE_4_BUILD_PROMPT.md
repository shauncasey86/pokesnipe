# Stage 4 Build Prompt — Exchange Rate & Pricing Engine

> Paste this entire prompt into a fresh Claude Code session to build Stage 4.
> **Before pasting:** Fill in your Railway public URL below.

---

## Your Railway Details

```
RAILWAY_PUBLIC_URL=<your Railway public URL, e.g. https://pokesnipe-production.up.railway.app>
```

All environment variables (`DATABASE_URL`, `EXCHANGE_RATE_API_KEY`, etc.) are already configured as Railway service variables. You do NOT need to create or modify any `.env` file. The code reads from `process.env` which Railway populates automatically on deploy.

---

## What you're building

**PokeSnipe** — a Pokemon card arbitrage scanner.

- **Stage 1** (done): Express server, PostgreSQL, migrations, health endpoint
- **Stage 2** (done): Scrydex client, card sync — database has ~35,000+ cards with real pricing/trends
- **Stage 3** (done): Card Catalog API + React frontend — browsable card database

This is **Stage 4 of 13**. You are building the exchange rate service and pricing engine. After this stage, the app can convert USD market prices to GBP, calculate eBay buyer protection fees, and compute profit for any card+condition+price combination.

**Workflow:** You write the code, commit, and push to GitHub. Railway auto-deploys. You verify against the live Railway URL. There is no local development.

**IMPORTANT:** The project already exists with Stages 1-3. Do NOT re-initialize or overwrite existing files. Build on top of what's there.

---

## Existing project structure (from Stages 1-3)

```
src/
├── config/index.ts           ← Zod config (done)
├── db/pool.ts                ← PostgreSQL pool (done)
├── routes/
│   ├── health.ts             ← GET /healthz (done)
│   └── catalog.ts            ← Card catalog API (done)
├── services/
│   ├── scrydex/              ← Scrydex client (done)
│   ├── sync/                 ← Card sync (done)
│   └── catalog/              ← Catalog queries (done)
├── utils/pagination.ts       ← Pagination helper (done)
├── app.ts                    ← Express app (done)
└── server.ts                 ← Boot sequence (done)
client/                       ← React frontend (done)
```

---

## Step 1: No new packages needed

Node.js 20 has built-in `fetch`. No additional packages required.

---

## Step 2: Create `src/services/exchange-rate/exchange-rate-service.ts`

Fetches the live USD→GBP exchange rate from an API using `EXCHANGE_RATE_API_KEY` (already set as a Railway variable).

The exchange rate API provider is whatever the `EXCHANGE_RATE_API_KEY` is configured for — commonly exchangerate-api.com. Check the existing config to see the env var name, and build the fetch URL accordingly.

**Functions to implement:**

```typescript
// Fetch live rate from the exchange rate API
async function fetchRate(): Promise<{ rate: number; fetchedAt: Date }>

// Save rate to the exchange_rates table
async function saveRate(rate: number): Promise<void>
// INSERT INTO exchange_rates (from_currency, to_currency, rate) VALUES ('USD', 'GBP', $1)

// Get the most recent rate from the database
async function getLatestRate(): Promise<{ rate: number; fetchedAt: Date } | null>
// SELECT rate, fetched_at FROM exchange_rates
//   WHERE from_currency='USD' AND to_currency='GBP'
//   ORDER BY fetched_at DESC LIMIT 1

// Check if the latest rate is older than 6 hours
function isStale(fetchedAt: Date): boolean

// HARD GATE — called by the pricing engine
// Returns the rate if fresh, throws ExchangeRateStaleError if >6 hours old
// Throws if NO rate exists in DB (first boot)
export async function getValidRate(): Promise<number>

// Fetch + save a fresh rate (called on boot and by scheduled job)
export async function refreshRate(): Promise<number>
```

**Key rules:**
- No hardcoded fallback. If there's no rate in the DB, throw — the system must fetch a real rate before creating deals.
- The 6-hour staleness gate prevents using yesterday's rate for today's deals.

---

## Step 3: Create `src/services/pricing/buyer-protection.ts`

Pure function, zero dependencies. Calculates eBay Buyer Protection fee using tiered bands.

```typescript
// eBay Buyer Protection fee tiers (UK):
//
// First £10.00 of item price: 3%
// £10.01 – £50.00:            5%
// £50.01 – £500.00:           4%
// £500.01+:                   2%
// Plus flat fee of £0.10 per transaction
//
// Example: £50 item
//   £10.00 × 3% = £0.30
//   £40.00 × 5% = £2.00
//   + £0.10 flat = £2.40
//   Total fee: £2.40
//
// Example: £500 item
//   £10.00 × 3%  = £0.30
//   £40.00 × 5%  = £2.00
//   £450.00 × 4% = £18.00
//   + £0.10 flat  = £20.40
//   Total fee: £20.40

export function calculateBuyerProtection(itemPriceGBP: number): number
```

This is a pure function — number in, number out. No DB calls, no side effects.

---

## Step 4: Create `src/services/pricing/pricing-engine.ts`

The core profit calculator.

```typescript
interface ProfitInput {
  ebayPriceGBP: number;        // eBay listing price in GBP
  shippingGBP: number;         // Shipping cost in GBP
  condition: 'NM' | 'LP' | 'MP' | 'HP';
  variantPrices: {             // From Scrydex variant.prices JSONB
    NM?: { low: number; market: number };
    LP?: { low: number; market: number };
    MP?: { low: number; market: number };
    HP?: { low: number; market: number };
  };
  exchangeRate: number;        // USD → GBP conversion rate
}

interface ProfitResult {
  totalCostGBP: number;        // eBay price + shipping + buyer protection fee
  buyerProtectionFee: number;  // Calculated fee
  marketValueUSD: number;      // Scrydex market price for this condition
  marketValueGBP: number;      // marketValueUSD × exchangeRate
  profitGBP: number;           // marketValueGBP - totalCostGBP
  profitPercent: number;       // (profitGBP / totalCostGBP) × 100
  breakdown: {
    ebayPrice: number;
    shipping: number;
    fee: number;
    totalCost: number;
    marketUSD: number;
    fxRate: number;
    marketGBP: number;
    profit: number;
  };
}

export function calculateProfit(input: ProfitInput): ProfitResult
```

**Key rules:**
- Use the condition-specific price from Scrydex. If the listing is LP condition, use the LP market price, NOT NM.
- If the exact condition price is missing, fall back to LP price (conservative). If LP is also missing, fall back through MP → HP. If nothing is priced, return null (can't evaluate).
- Buyer protection fee is calculated on the eBay item price only (not including shipping).
- `totalCostGBP = ebayPriceGBP + shippingGBP + buyerProtectionFee`
- `profitGBP = marketValueGBP - totalCostGBP`
- `profitPercent = (profitGBP / totalCostGBP) × 100`

---

## Step 5: Create `src/services/pricing/tier-classifier.ts`

Pure function that assigns a tier based on profit percentage:

```typescript
// | Tier    | Profit %  |
// |---------|-----------|
// | GRAIL   | >40%      |
// | HIT     | 25–40%    |
// | FLIP    | 15–25%    |
// | SLEEP   | 5–15%     |
// | (null)  | <5%       |  ← Not a deal, don't create

export function classifyTier(profitPercent: number): 'GRAIL' | 'HIT' | 'FLIP' | 'SLEEP' | null
```

---

## Step 6: Wire exchange rate into the boot sequence

Update `src/server.ts` to fetch the initial exchange rate on startup:

```
Existing boot sequence:
  1. Validate config (Zod)
  2. Connect DB pool
  3. Run migrations
  4. Start Express

Updated boot sequence:
  1. Validate config (Zod)
  2. Connect DB pool
  3. Run migrations
  4. Fetch exchange rate ← NEW
  5. Start Express
```

**Important:** If the exchange rate fetch fails on boot, log a WARNING but don't crash. The server can still serve the catalog. The scanner won't work until a rate exists, but that's handled by `getValidRate()` throwing at deal-creation time.

---

## Database table used (already exists from Stage 1 migrations)

**exchange_rates:**
```sql
id              SERIAL PRIMARY KEY
from_currency   TEXT NOT NULL DEFAULT 'USD'
to_currency     TEXT NOT NULL DEFAULT 'GBP'
rate            NUMERIC(10,6) NOT NULL
fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Index: `idx_exchange_rates_latest ON exchange_rates (from_currency, to_currency, fetched_at DESC)`

---

## Verification — Vitest pure function tests + live Railway checks

### Vitest tests (pure functions — `src/__tests__/stage4/`)

These run as part of `npm test` — they're pure math with no external dependencies.

**`buyer-protection.test.ts`:**
```typescript
import { calculateBuyerProtection } from '../../services/pricing/buyer-protection.js';

// Zero
expect(calculateBuyerProtection(0)).toBe(0);

// Within first band only: £10 × 3% + £0.10 = £0.40
expect(calculateBuyerProtection(10)).toBeCloseTo(0.40);

// Two bands: (£10 × 3%) + (£40 × 5%) + £0.10 = £2.40
expect(calculateBuyerProtection(50)).toBeCloseTo(2.40);

// Three bands: (£10 × 3%) + (£40 × 5%) + (£450 × 4%) + £0.10 = £20.40
expect(calculateBuyerProtection(500)).toBeCloseTo(20.40);

// All four bands: (£10 × 3%) + (£40 × 5%) + (£450 × 4%) + (£500 × 2%) + £0.10 = £30.40
expect(calculateBuyerProtection(1000)).toBeCloseTo(30.40);

// Small item: £5 × 3% + £0.10 = £0.25
expect(calculateBuyerProtection(5)).toBeCloseTo(0.25);
```

**`pricing-engine.test.ts`:**
```typescript
import { calculateProfit } from '../../services/pricing/pricing-engine.js';

// Profitable deal
const result = calculateProfit({
  ebayPriceGBP: 12.50,
  shippingGBP: 1.99,
  condition: 'NM',
  variantPrices: { NM: { low: 45, market: 52 } },
  exchangeRate: 0.789,
});
expect(result.totalCostGBP).toBeGreaterThan(14);  // 12.50 + 1.99 + fee
expect(result.marketValueUSD).toBe(52);
expect(result.profitGBP).toBeGreaterThan(0);
expect(result.profitPercent).toBeGreaterThan(0);

// Loss — eBay price much higher than market
const loss = calculateProfit({
  ebayPriceGBP: 100,
  shippingGBP: 5,
  condition: 'NM',
  variantPrices: { NM: { low: 45, market: 52 } },
  exchangeRate: 0.789,
});
expect(loss.profitGBP).toBeLessThan(0);
expect(loss.profitPercent).toBeLessThan(0);

// Condition-specific: LP listing uses LP price, not NM
const lpResult = calculateProfit({
  ebayPriceGBP: 12.50,
  shippingGBP: 1.99,
  condition: 'LP',
  variantPrices: {
    NM: { low: 45, market: 52 },
    LP: { low: 30, market: 38 },
  },
  exchangeRate: 0.789,
});
expect(lpResult.marketValueUSD).toBe(38);  // Used LP, not NM

// Missing condition price: falls back to next available
const fallback = calculateProfit({
  ebayPriceGBP: 10,
  shippingGBP: 1,
  condition: 'MP',
  variantPrices: { NM: { low: 45, market: 52 }, LP: { low: 30, market: 38 } },
  exchangeRate: 0.789,
});
expect(fallback.marketValueUSD).toBe(38);  // MP missing, fell back to LP
```

**`tier-classifier.test.ts`:**
```typescript
import { classifyTier } from '../../services/pricing/tier-classifier.js';

expect(classifyTier(50)).toBe('GRAIL');    // >40%
expect(classifyTier(41)).toBe('GRAIL');
expect(classifyTier(40)).toBe('HIT');      // 25-40%
expect(classifyTier(30)).toBe('HIT');
expect(classifyTier(25)).toBe('FLIP');     // 15-25%
expect(classifyTier(20)).toBe('FLIP');
expect(classifyTier(15)).toBe('SLEEP');    // 5-15%
expect(classifyTier(10)).toBe('SLEEP');
expect(classifyTier(4)).toBeNull();        // <5% — not a deal
expect(classifyTier(0)).toBeNull();
expect(classifyTier(-10)).toBeNull();
```

### Run pure function tests

```bash
npm test -- --run src/__tests__/stage4/
```

### Live checks on Railway

After pushing and Railway deploys:

```bash
RAILWAY_URL="<your Railway public URL>"

# 1. Verify exchange rate was fetched on boot
# (Query the Railway PostgreSQL database directly)
psql $DATABASE_URL -c "SELECT rate, fetched_at FROM exchange_rates ORDER BY fetched_at DESC LIMIT 1;"
# Expected: a real USD→GBP rate (around 0.78-0.82) with a recent timestamp

# 2. Verify server is still healthy after exchange rate integration
curl "$RAILWAY_URL/healthz"
# Expected: {"status":"ok","timestamp":"..."}

# 3. Verify catalog still works (no regressions)
curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/api/catalog/expansions?limit=1"
# Expected: 200

# 4. TypeScript compiles cleanly
npx tsc --noEmit
# Expected: no errors
```

---

## Deliverable

A pricing engine that produces correct profit calculations for any card + condition + eBay price combination. Exchange rate is live from a real API and stored in the database. Pure function tests validate the math.

## What NOT to build yet

- No eBay client (Stage 5)
- No signal extraction (Stage 6)
- No matching engine (Stage 7)
- No scanner loop (Stage 8)
- No scheduled exchange rate refresh (Stage 11) — just the one-time fetch on boot for now

Just the pricing engine. Keep it clean.
