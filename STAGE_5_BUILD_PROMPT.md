# Stage 5 Build Prompt — eBay Client & Search

> Paste this entire prompt into a fresh Claude Code session to build Stage 5.
> **Before pasting:** Fill in your Railway public URL below.

---

## Your Railway Details

```
RAILWAY_PUBLIC_URL=<your Railway public URL, e.g. https://pokesnipe-production.up.railway.app>
```

All environment variables (`DATABASE_URL`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, etc.) are already configured as Railway service variables. You do NOT need to create or modify any `.env` file.

---

## What you're building

**PokeSnipe** — a Pokemon card arbitrage scanner.

- **Stage 1** (done): Express server, PostgreSQL, migrations, health endpoint
- **Stage 2** (done): Scrydex client, card sync — ~35,000+ cards with real pricing
- **Stage 3** (done): Card Catalog API + React frontend
- **Stage 4** (done): Exchange rate service + pricing engine + buyer protection calc

This is **Stage 5 of 13**. You are building the eBay Browse API client — OAuth2 authentication, search for Pokemon card listings, and individual item enrichment via `getItem()`. After this stage, the app can search eBay for real listings and fetch full item details.

**Workflow:** You write the code, commit, and push to GitHub. Railway auto-deploys. You verify by running a test script on Railway that calls the live eBay API. There is no local development.

**IMPORTANT:** Build on top of the existing project. Do NOT re-initialize or overwrite existing files.

---

## Existing project structure (from Stages 1-4)

```
src/
├── config/index.ts                ← Zod config (done)
├── db/pool.ts                     ← PostgreSQL pool (done)
├── routes/
│   ├── health.ts                  ← GET /healthz (done)
│   └── catalog.ts                 ← Card catalog API (done)
├── services/
│   ├── scrydex/                   ← Scrydex client (done)
│   ├── sync/                      ← Card sync (done)
│   ├── catalog/                   ← Catalog queries (done)
│   ├── exchange-rate/             ← Exchange rate service (done)
│   └── pricing/                   ← Pricing engine, buyer protection, tier classifier (done)
├── app.ts                         ← Express app (done)
└── server.ts                      ← Boot sequence (done)
client/                            ← React frontend (done)
```

---

## Step 1: No new packages needed

The project already has `bottleneck` (from Stage 2) for rate limiting. Node.js 20 has built-in `fetch`.

---

## Step 2: Create `src/services/ebay/types.ts`

TypeScript interfaces for eBay API responses. Define these first — everything else depends on them.

```typescript
// --- Search response ---

export interface EbaySearchResponse {
  href: string;
  total: number;
  next?: string;
  limit: number;
  offset: number;
  itemSummaries?: EbayItemSummary[];
}

export interface EbayItemSummary {
  itemId: string;
  title: string;
  price: { value: string; currency: string };                // Note: value is a STRING from eBay
  shippingOptions?: Array<{
    shippingCostType: string;
    shippingCost?: { value: string; currency: string };
  }>;
  condition: string | null;                                    // "Used", "Like New", etc.
  conditionId: string | null;                                  // "2750", "4000", "1000", etc.
  image?: { imageUrl: string };
  itemWebUrl: string;
  seller: {
    username: string;
    feedbackScore: number;
    feedbackPercentage: string;                                // String like "99.5"
  };
  itemCreationDate?: string;                                   // ISO date
  buyingOptions: string[];                                     // ["FIXED_PRICE"]
  categories?: Array<{ categoryId: string; categoryName: string }>;
  itemGroupType?: string;                                      // "SELLER_DEFINED_VARIATIONS"
  quantitySold?: number;
}

// --- getItem response (enriched) ---

export interface EbayItemDetail extends EbayItemSummary {
  localizedAspects?: EbayLocalizedAspect[];                    // Only from getItem()
  conditionDescriptors?: EbayConditionDescriptor[];            // Only from getItem()
  description?: string;
  shortDescription?: string;
}

export interface EbayLocalizedAspect {
  type: string;
  name: string;                                                // "Card Name", "Set", "Card Number", etc.
  value: string;
}

export interface EbayConditionDescriptor {
  name: string;                                                // "40001", "27501", "27502", "27503"
  values: string[];                                            // ["400010"], ["275010"], ["275020"], etc.
}

// --- Budget ---

export interface BudgetStatus {
  dailyLimit: number;
  used: number;
  remaining: number;
  resetAt: Date;
  isLow: boolean;                                              // remaining < 500
}
```

---

## Step 3: Create `src/services/ebay/auth.ts`

eBay OAuth2 client credentials flow.

```typescript
// Token endpoint: POST https://api.ebay.com/identity/v1/oauth2/token
//
// Headers:
//   Content-Type: application/x-www-form-urlencoded
//   Authorization: Basic <base64(EBAY_CLIENT_ID:EBAY_CLIENT_SECRET)>
//
// Body:
//   grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope
//
// Response:
//   { access_token: "v^1.1#i...", expires_in: 7200, token_type: "Application Access Token" }

// Cache the token in memory:
let cachedToken: { token: string; expiresAt: Date } | null = null;

// Before any API call, check if token is expired or expires within 5 minutes.
// If so, fetch a new one.
export async function getAccessToken(): Promise<string>
```

**Key details:**
- The `Authorization` header is `Basic` + base64-encoded `EBAY_CLIENT_ID:EBAY_CLIENT_SECRET`
- Tokens last 7200 seconds (2 hours)
- Refresh if <5 minutes remaining
- Use `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` from `process.env` (Railway variables)

---

## Step 4: Create `src/services/ebay/rate-limiter.ts`

eBay rate limiter using Bottleneck (already installed).

```typescript
import Bottleneck from 'bottleneck';

const ebayLimiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 200,          // 5 req/sec — conservative for eBay
});

export function scheduleEbayCall<T>(fn: () => Promise<T>): Promise<T> {
  return ebayLimiter.schedule(fn);
}
```

Also parse eBay rate limit headers from responses:
- `X-RateLimit-Limit` — total allowed
- `X-RateLimit-Remaining` — remaining calls
- `X-RateLimit-Reset` — when limit resets

If `X-RateLimit-Remaining` drops below 10, log a warning.

---

## Step 5: Create `src/services/ebay/budget.ts`

Daily API call budget tracker. In-memory counter, resets at midnight UTC.

```typescript
const budget = {
  dailyLimit: 5000,
  used: 0,
  resetAt: nextMidnightUTC(),
};

export function trackCall(): void
// Increment used. If past resetAt, reset counter first.

export function getRemainingBudget(): number
// dailyLimit - used

export function canMakeCall(): boolean
// used < dailyLimit

export function getBudgetStatus(): BudgetStatus
// Full status object for API/logging
```

**Rules:**
- Every eBay API call (search or getItem) calls `trackCall()` after executing
- `canMakeCall()` is checked BEFORE making any API call
- If budget exhausted, log a warning and skip — don't throw

---

## Step 6: Create `src/services/ebay/client.ts`

The eBay Browse API client. This is the main file.

**Base URL:** `https://api.ebay.com/buy/browse/v1`

**Headers on every request:**
```
Authorization: Bearer <token from auth.ts>
X-EBAY-C-MARKETPLACE-ID: EBAY_GB
Content-Type: application/json
```

### Method 1: `searchItems(query, limit, options)`

```typescript
// GET /item_summary/search
//
// Query params:
//   q: 'pokemon'
//   limit: 200                         (max results per call)
//   category_ids: '183454'             (Individual Trading Cards)
//   sort: 'newlyListed'                (freshest listings first)
//   filter: <see below>
//
// Filter string (comma-separated):
//   price:[10..],priceCurrency:GBP     ← Skip sub-£10 (margins negligible)
//   buyingOptions:{FIXED_PRICE}        ← Skip auctions
//   conditionIds:{2750|4000|1000|1500|2000|2500|3000}  ← Graded + Ungraded + New-Acceptable
//   deliveryCountry:GB                 ← UK delivery
//
// IMPORTANT: eBay returns price.value as a STRING (e.g. "12.50"), not a number.
// Parse to float when processing.
//
// Returns: EbaySearchResponse
// - itemSummaries may be undefined if no results
// - Each item has: itemId, title, price, shippingOptions, condition, conditionId,
//   image, itemWebUrl, seller, itemCreationDate, buyingOptions
// - Each item does NOT have: localizedAspects, conditionDescriptors (search doesn't return these)
```

### Method 2: `getItem(itemId)`

```typescript
// GET /item/{itemId}
//
// Returns: EbayItemDetail
// - Everything from search PLUS:
//   - localizedAspects: Array of { type, name, value }
//     Names include: "Card Name", "Set", "Card Number", "Rarity",
//     "Professional Grader", "Grade", "Language", "Year Manufactured"
//   - conditionDescriptors: Array of { name, values }
//     name "40001" = ungraded condition, name "27501" = grading company,
//     name "27502" = grade, name "27503" = cert number
//   - description: Full HTML description
//
// This is the ENRICHMENT call. Costs 1 API call from the daily budget.
// Only call this for listings that show profit potential after title-only matching.
```

**Both methods must:**
1. Check `canMakeCall()` before executing — return null if budget exhausted
2. Get a valid token via `getAccessToken()`
3. Execute through the rate limiter (`scheduleEbayCall`)
4. Call `trackCall()` after the request completes
5. Parse rate limit headers and log warnings if low
6. On 429: back off and retry (the rate limiter should mostly prevent this)
7. On 401: token may be expired — clear cache and retry once with a fresh token

---

## Step 7: Create `src/scripts/test-ebay.ts`

A test script that calls the live eBay API to verify everything works. This runs on Railway after deployment.

```typescript
// 1. Get a real OAuth token
//    → Print: "Token obtained: v^1.1#i..." (first 20 chars)

// 2. Call searchItems('pokemon', 10, ...) (limit 10 to conserve budget)
//    → Print: "Search returned N items"

// 3. Validate search results:
//    → All items are FIXED_PRICE (buyingOptions check)
//    → All items are £10+ (price check)
//    → Print: "All N items are Buy It Now, £10+"

// 4. Pick the first item, call getItem(itemId)
//    → Print: "getItem returned localizedAspects: true/false"
//    → Print: "getItem returned conditionDescriptors: true/false"
//    → If localizedAspects present, print a few aspect names/values

// 5. Print budget status:
//    → "API calls used: 2/5000 (remaining: 4998)"

// 6. Close DB pool (if used) and exit
```

**Keep `src/scripts/test-ebay.ts` in the project** — it's useful for diagnosing eBay API issues later.

---

## eBay API context — why this design matters

**Two-phase evaluation pipeline** (built in later stages, but the client supports it):

```
Phase 1: BROAD SEARCH (1 API call, 200 results)
  → Get: title, price, shipping, condition text, images
  → Do NOT get: localizedAspects, conditionDescriptors (not in search results)
  → Title-only matching against local card database
  → Quick profit estimate using title-parsed condition

Phase 2: TARGETED ENRICHMENT (selective getItem calls)
  → Only for listings showing profit potential (≥15% after Phase 1)
  → getItem() returns localizedAspects + conditionDescriptors
  → Re-calculate profit with real condition-specific Scrydex price
```

**Daily budget math:**
```
Search: 1 call/cycle × 288 cycles/day = 288 calls
Enrichment: ~10 getItem calls/cycle × 288 = 2,880 calls
Total: ~3,168/day out of 5,000 limit (37% headroom)
```

This is why the budget tracker exists — to ensure we never exceed the daily limit.

---

## Verification — live eBay API on Railway

After pushing and Railway deploys:

```bash
RAILWAY_URL="<your Railway public URL>"

# 1. Run the eBay test script on Railway
# (You can trigger this via Railway's CLI or by adding a temporary route)
# The test script must run where EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are available.

# Expected output from test-ebay.ts:
# ✅ "Token obtained: v^1.1#i..." (OAuth works with real credentials)
# ✅ "Search returned N items" (N > 0, real search works)
# ✅ "All N items are Buy It Now, £10+" (filters applied correctly)
# ✅ "getItem returned localizedAspects: true" (enrichment data available)
# ✅ "getItem returned conditionDescriptors: true" (condition data available)
# ✅ "API calls used: 2/5000" (budget tracking works)

# 2. Verify server is still healthy
curl "$RAILWAY_URL/healthz"
# Expected: {"status":"ok","timestamp":"..."}

# 3. Verify catalog still works (no regressions)
curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/api/catalog/expansions?limit=1"
# Expected: 200

# 4. TypeScript compiles cleanly
npx tsc --noEmit
# Expected: no errors
```

**To run the test script on Railway**, either:
- Add a temporary API endpoint that triggers it: `GET /api/debug/test-ebay` (remove after testing)
- Or use Railway's shell: `railway run npx tsx src/scripts/test-ebay.ts`

---

## Deliverable

A working eBay API client that can authenticate, search for Pokemon card listings (200 results per call, filtered for Buy It Now, £10+, UK delivery), and fetch full item details including `localizedAspects` and `conditionDescriptors`. Daily budget tracking prevents exceeding 5,000 calls/day.

## What NOT to build yet

- No signal extraction from titles (Stage 6)
- No matching against the card database (Stage 7)
- No scanner loop (Stage 8)
- No enrichment gate logic (Stage 8)

Just the eBay client. Keep it clean.
