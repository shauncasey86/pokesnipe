# Stage 7 Build Prompt — Matching Engine

> Paste this entire prompt into a fresh Claude Code session to build Stage 7.

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

This is **Stage 7 of 13**. You are building the matching engine — it takes the extracted signals from Stage 6 and matches them against the synced card database to identify exactly which Pokemon card an eBay listing is selling. This stage has a mix of **pure functions** (name validation, confidence scoring, gates) and **database queries** (candidate lookup, variant resolution).

**Workflow:** You write the code, commit, and push to GitHub. Railway auto-deploys. Pure functions are tested with Vitest. The full pipeline is tested with a live script on Railway that fetches real eBay listings and matches them against the real card database.

**IMPORTANT:** Build on top of the existing project. Do NOT re-initialize or overwrite existing files.

---

## Existing project structure (from Stages 1-6)

```
src/
├── config/index.ts                        ← Zod config (done)
├── db/pool.ts                             ← PostgreSQL pool (done)
├── routes/
│   ├── health.ts                          ← GET /healthz (done)
│   └── catalog.ts                         ← Card catalog API (done)
├── services/
│   ├── scrydex/                           ← Scrydex client (done)
│   ├── sync/                              ← Card sync (done)
│   ├── catalog/                           ← Catalog queries (done)
│   ├── exchange-rate/                     ← Exchange rate service (done)
│   ├── pricing/                           ← Pricing engine + buyer protection + tier (done)
│   ├── ebay/                              ← eBay auth, client, budget, rate limiter (done)
│   └── extraction/                        ← Signal extraction pipeline (done)
│       ├── title-cleaner.ts
│       ├── junk-detector.ts
│       ├── number-extractor.ts
│       ├── variant-detector.ts
│       ├── condition-mapper.ts
│       ├── structured-extractor.ts
│       ├── signal-merger.ts
│       └── index.ts                       ← extractSignals() pipeline
├── app.ts                                 ← Express app (done)
└── server.ts                              ← Boot sequence (done)
client/                                    ← React frontend (done)
```

---

## Step 1: Install new package

```bash
npm install jaro-winkler
```

(Or use `string-similarity` or `natural` — any library that provides Jaro-Winkler string similarity. The key requirement is a function that takes two strings and returns a score between 0 and 1.)

---

## Step 2: Create `src/services/matching/candidate-lookup.ts`

Find candidate cards from the synced database using extracted signals.

```typescript
export async function findCandidates(signals: NormalizedListing): Promise<CandidateCard[]>
```

**Four lookup strategies in priority order:**

### Strategy 1: Number + denominator (most specific)
If both `cardNumber.number` and `cardNumber.denominator` are extracted:
```sql
SELECT c.*, e.name as expansion_name, e.code as expansion_code
FROM cards c
JOIN expansions e ON e.scrydex_id = c.expansion_id
WHERE c.number_normalized = $1
  AND c.printed_total = $2
```
This typically returns 1-3 candidates (same number across very few sets with identical card counts).

### Strategy 2: Number + prefix
If `cardNumber.prefix` is extracted (SV, TG, GG, etc.):
```sql
SELECT c.*, e.name as expansion_name, e.code as expansion_code
FROM cards c
JOIN expansions e ON e.scrydex_id = c.expansion_id
WHERE c.number_normalized = $1
  AND c.number LIKE $2  -- prefix filter e.g. 'SV%'
```

### Strategy 3: Number only
If just the number is extracted:
```sql
SELECT c.*, e.name as expansion_name, e.code as expansion_code
FROM cards c
JOIN expansions e ON e.scrydex_id = c.expansion_id
WHERE c.number_normalized = $1
LIMIT 50
```
Cap at 50 to prevent runaway queries on common numbers (e.g., card #1 exists in every set).

### Strategy 4: Name-based fallback (no number extracted)
If `cardNumber` is null, fall back to pg_trgm fuzzy search on the card name:
```sql
SELECT c.*, e.name as expansion_name, e.code as expansion_code,
       similarity(c.name, $1) as sim
FROM cards c
JOIN expansions e ON e.scrydex_id = c.expansion_id
WHERE c.name % $1
ORDER BY sim DESC
LIMIT 20
```

**Always use parameterized queries.** Never string interpolation.

---

## Step 3: Create `src/services/matching/name-validator.ts`

Compare the eBay listing's card name against each candidate using Jaro-Winkler.

```typescript
export interface ValidatedCandidate {
  card: CandidateCard;
  similarity: number;    // 0-1 Jaro-Winkler score
}

export function validateNames(
  listingName: string,
  candidates: CandidateCard[]
): ValidatedCandidate[]
```

**Logic:**
1. If `listingName` is null/empty, return all candidates with similarity 0.5 (can't validate)
2. For each candidate, compute Jaro-Winkler similarity between `listingName` and `candidate.name`
3. **Hard gate:** Filter out any candidate with similarity < 0.60
4. Sort remaining by similarity descending (best match first)
5. Return the filtered, sorted array (empty array = no match)

**This is a pure function** — takes strings and objects, returns objects. No DB calls.

---

## Step 4: Create `src/services/matching/expansion-validator.ts`

Cross-validate the expansion if the listing mentions a set name.

```typescript
export interface ExpansionScore {
  score: number;          // 0.0, 0.5, or 1.0
  method: string;         // 'code_match', 'name_match', 'not_checked', 'conflict'
}

export function validateExpansion(
  signals: NormalizedListing,
  candidate: CandidateCard
): ExpansionScore
```

**Logic:**
1. If the listing has no set name signal (`signals.setName` is null) → `{ score: 0.5, method: 'not_checked' }`
2. Check for exact code match: if `signals.setName` matches `candidate.expansion_code` (case-insensitive) → `{ score: 1.0, method: 'code_match' }`
3. Check for fuzzy name match: if Jaro-Winkler similarity between `signals.setName` and `candidate.expansion_name` > 0.80 → `{ score: 1.0, method: 'name_match' }`
4. If a set name was provided but doesn't match → `{ score: 0.0, method: 'conflict' }`

**This is a pure function.**

---

## Step 5: Create `src/services/matching/variant-resolver.ts`

Determine which variant of the matched card the listing is selling.

```typescript
export interface VariantMatch {
  variant: Variant;
  method: string;         // 'single_variant', 'keyword_match', 'default_cheapest'
  confidence: number;     // 0.95, 0.85, or 0.50
}

export async function resolveVariant(
  signals: NormalizedListing,
  cardVariants: Variant[]
): Promise<VariantMatch | null>
```

**Logic (3 steps):**

### Step 1: Filter to priced variants
Only consider variants where `prices` JSONB has at least one condition with a market price.

### Step 2: Single variant → auto-select
If only 1 priced variant exists → return it with confidence 0.95 and method `'single_variant'`.

### Step 3: Multiple variants — check keyword match
If `signals.variant` is not null, try to match it against variant names:

```typescript
const VARIANT_KEYWORDS: Record<string, string[]> = {
  'holofoil':              ['holo', 'holographic', 'holo rare'],
  'reverseHolofoil':       ['reverse holo', 'reverse', 'rev holo', 'reverse holographic'],
  'firstEditionHolofoil':  ['1st edition holo', '1st ed holo', 'first edition holo'],
  'firstEditionNormal':    ['1st edition', '1st ed', 'first edition'],
  'unlimitedHolofoil':     ['unlimited holo'],
  'unlimitedNormal':       ['unlimited'],
  'normal':                [],
};
```

If the detected variant keyword matches one of the card's available variants → return it with confidence 0.85 and method `'keyword_match'`.

### Step 4: No match → default to cheapest
Sort priced variants by NM market price ascending. Pick the cheapest. Return with confidence 0.50 and method `'default_cheapest'`.

**Why cheapest?** If we can't determine the variant, using the cheapest price underestimates profit (conservative). A deal that's profitable at the cheapest variant is safe. Guessing the expensive variant would create false positives.

If no priced variants at all → return `null`.

**This function takes an array of variant objects (plain data).** The DB query to fetch variants for a card should happen in the matching pipeline (`index.ts`), not here.

---

## Step 6: Create `src/services/matching/confidence-scorer.ts`

Calculate the composite confidence score from individual signal scores.

```typescript
export interface ScoreComponents {
  nameScore: number;         // 0-1, from Jaro-Winkler
  numberScore: number;       // 1.0 = match, 0.0 = conflict, 0.5 = not extracted
  denominatorScore: number;  // 1.0 = match, 0.0 = conflict, 0.5 = not extracted
  expansionScore: number;    // 1.0 = match, 0.0 = conflict, 0.5 = not checked
  variantScore: number;      // 0.95, 0.85, or 0.50 from variant resolver
  extractionScore: number;   // 1.0 = structured data, 0.5 = title only
}

export interface CompositeConfidence {
  composite: number;         // 0-1 weighted score
  tier: 'high' | 'medium' | 'low' | 'reject';
  components: ScoreComponents;
}

export function calculateConfidence(scores: ScoreComponents): CompositeConfidence
```

**Weighted geometric mean:**

| Signal | Weight |
|--------|--------|
| Name match | 0.30 |
| Denominator match | 0.25 |
| Number match | 0.15 |
| Expansion match | 0.10 |
| Variant | 0.10 |
| Extraction quality | 0.10 |

```typescript
// Weighted geometric mean:
// composite = (nameScore^0.30) × (denominatorScore^0.25) × (numberScore^0.15)
//           × (expansionScore^0.10) × (variantScore^0.10) × (extractionScore^0.10)
```

**Confidence tiers:**

| Composite | Tier | Action |
|-----------|------|--------|
| >= 0.85 | `high` | Display confidently |
| 0.65–0.84 | `medium` | Display with warning badge |
| 0.45–0.64 | `low` | Log only, don't display |
| < 0.45 | `reject` | Skip entirely |

**This is a pure function.**

---

## Step 7: Create `src/services/matching/gates.ts`

Validation gates that determine whether a match is accepted.

```typescript
export interface GatedResult {
  accepted: boolean;
  confidenceTier: 'high' | 'medium' | 'low' | 'reject';
  candidate: CandidateCard;
  variant: VariantMatch;
  confidence: CompositeConfidence;
}

export function applyGates(match: {
  candidate: CandidateCard;
  variant: VariantMatch | null;
  confidence: CompositeConfidence;
}): GatedResult
```

**Hard gates (instant reject):**
- `confidence.composite < 0.45` → rejected
- `variant` is null (no priced variant found) → rejected

**Soft gates (accept with tier):**
- Composite >= 0.85 → `high` (display confidently)
- Composite 0.65–0.84 → `medium` (display with warning badge)
- Composite 0.45–0.64 → `low` (log only, don't display to user)

**This is a pure function.**

---

## Step 8: Create `src/services/matching/index.ts`

The main matching pipeline that ties everything together.

```typescript
export async function matchListing(
  signals: NormalizedListing
): Promise<GatedResult | null> {
  // 1. Find candidate cards from DB
  const candidates = await findCandidates(signals);
  if (candidates.length === 0) return null;

  // 2. Validate names (Jaro-Winkler)
  const validated = validateNames(signals.cardName, candidates);
  if (validated.length === 0) return null;  // Hard gate: no name close enough

  // 3. Pick best candidate
  const bestCandidate = validated[0];

  // 4. Validate expansion
  const expansionScore = validateExpansion(signals, bestCandidate.card);

  // 5. Fetch variants for this card from DB
  const variants = await fetchVariantsForCard(bestCandidate.card.scrydex_card_id);

  // 6. Resolve variant
  const variantMatch = await resolveVariant(signals, variants);

  // 7. Calculate composite confidence
  const confidence = calculateConfidence({
    nameScore: bestCandidate.similarity,
    numberScore: signals.cardNumber ? 1.0 : 0.5,
    denominatorScore: getDenominatorScore(signals, bestCandidate.card),
    expansionScore: expansionScore.score,
    variantScore: variantMatch?.confidence ?? 0.3,
    extractionScore: signals.hasStructuredData ? 1.0 : 0.5,
  });

  // 8. Apply gates
  return applyGates({
    candidate: bestCandidate.card,
    variant: variantMatch,
    confidence,
  });
}
```

**Helper function needed:**
```typescript
async function fetchVariantsForCard(cardId: string): Promise<Variant[]>
// SELECT * FROM variants WHERE card_id = $1
```

```typescript
function getDenominatorScore(signals: NormalizedListing, candidate: CandidateCard): number
// 1.0 if signals.cardNumber.denominator === candidate.printed_total
// 0.0 if both exist but don't match
// 0.5 if denominator not extracted
```

---

## Database tables used (already exist)

**cards:** `scrydex_card_id` (PK), `name`, `number`, `number_normalized`, `expansion_id`, `expansion_name`, `expansion_code`, `printed_total`, `rarity`, `supertype`, `subtypes`, `market_price_usd`

**variants:** `id`, `card_id` (FK→cards), `name`, `prices` (JSONB), `graded_prices` (JSONB), `trends` (JSONB)

**Prices JSONB:** `{ "NM": { "low": 45.00, "market": 52.00 }, "LP": {...}, ... }`

---

## Verification — Vitest pure function tests + live Railway matching test

### Vitest tests (pure functions — `src/__tests__/stage7/`)

**`name-validator.test.ts`:**
```typescript
import { validateNames } from '../../services/matching/name-validator.js';

const candidates = [
  { name: 'Charizard ex', scrydex_card_id: 'charizard-ex-sv3-6' },
  { name: 'Charizard VMAX', scrydex_card_id: 'charizard-vmax-swsh4-100' },
  { name: 'Pikachu VMAX', scrydex_card_id: 'pikachu-vmax-swsh4-44' },
];

// Exact match → high score
const exact = validateNames('Charizard ex', candidates);
expect(exact[0].similarity).toBeGreaterThan(0.95);

// Misspelled → still matches
const fuzzy = validateNames('Charzard ex', candidates);
expect(fuzzy[0].similarity).toBeGreaterThan(0.60);
expect(fuzzy[0].card.name).toBe('Charizard ex');

// Completely wrong name → hard gate rejects all
const wrong = validateNames('Totally Different Card', candidates);
expect(wrong.length).toBe(0);
```

**`variant-resolver.test.ts`:**
```typescript
import { resolveVariant } from '../../services/matching/variant-resolver.js';

// Single variant → auto-select
const single = await resolveVariant(
  { variant: null },
  [{ name: 'normal', prices: { NM: { market: 5 } } }]
);
expect(single.variant.name).toBe('normal');
expect(single.confidence).toBe(0.95);

// Multi-variant + keyword → correct match
const holo = await resolveVariant(
  { variant: 'holofoil' },
  [{ name: 'holofoil', prices: { NM: { market: 350 } } }, { name: 'normal', prices: { NM: { market: 5 } } }]
);
expect(holo.variant.name).toBe('holofoil');
expect(holo.confidence).toBe(0.85);

// Multi-variant + no keyword → cheapest (conservative)
const noKeyword = await resolveVariant(
  { variant: null },
  [{ name: 'holofoil', prices: { NM: { market: 350 } } }, { name: 'normal', prices: { NM: { market: 5 } } }]
);
expect(noKeyword.variant.name).toBe('normal');
expect(noKeyword.confidence).toBe(0.50);
```

**`confidence-scorer.test.ts`:**
```typescript
import { calculateConfidence } from '../../services/matching/confidence-scorer.js';

// High confidence (all signals agree)
const high = calculateConfidence({
  nameScore: 0.95, numberScore: 1.0, denominatorScore: 1.0,
  expansionScore: 1.0, variantScore: 0.95, extractionScore: 1.0
});
expect(high.composite).toBeGreaterThan(0.90);
expect(high.tier).toBe('high');

// Low confidence (name fuzzy, no number)
const low = calculateConfidence({
  nameScore: 0.65, numberScore: 0.5, denominatorScore: 0.5,
  expansionScore: 0.5, variantScore: 0.50, extractionScore: 0.3
});
expect(low.composite).toBeLessThan(0.60);
expect(low.tier).toBe('low');
```

**`gates.test.ts`:**
```typescript
import { applyGates } from '../../services/matching/gates.js';

// High composite → accepted
expect(applyGates({
  confidence: { composite: 0.90, tier: 'high', components: {} },
  candidate: {},
  variant: { variant: {}, confidence: 0.95, method: 'single_variant' }
}).accepted).toBe(true);

// Low composite → rejected
expect(applyGates({
  confidence: { composite: 0.40, tier: 'reject', components: {} },
  candidate: {},
  variant: { variant: {}, confidence: 0.50, method: 'default_cheapest' }
}).accepted).toBe(false);

// No variant → rejected
expect(applyGates({
  confidence: { composite: 0.90, tier: 'high', components: {} },
  candidate: {},
  variant: null
}).accepted).toBe(false);
```

### Run pure function tests

```bash
npm test -- --run src/__tests__/stage7/
```

### Live matching test on Railway

Create `src/scripts/test-matching.ts` that runs on Railway with real data:

```typescript
// 1. Fetch 10 real eBay listings via searchItems('pokemon', 10, ...)
// 2. For each listing:
//    a. Run extractSignals(listing)
//    b. If not rejected, run matchListing(signals)
//    c. Print: eBay title → matched card name + variant + confidence (or "no match" / "REJECTED")
// 3. Print summary: "Matched: X/10, Rejected (junk): Y, No match: Z"

// Expected output:
// ✅ "Charizard ex 006/197 Obsidian Flames" → Charizard ex (sv3-6) holofoil [0.92] HIGH
// ✅ "Pokemon Card Lot x20 Bundle" → REJECTED (bulk_lot)
// ✅ "Pikachu VMAX 044/185" → Pikachu VMAX (swsh4-44) normal [0.88] HIGH
// ✅ "Random Energy Card" → No match
// ✅ No wrong matches (false positives)
```

**Keep `src/scripts/test-matching.ts` in the project** — useful for debugging matching issues later.

To run on Railway, either:
- Add a temporary route: `GET /api/debug/test-matching` (remove after testing)
- Or use Railway shell: `railway run npx tsx src/scripts/test-matching.ts`

### Also verify no regressions

```bash
RAILWAY_URL="<your Railway public URL>"

# All tests pass
npm test

# TypeScript compiles
npx tsc --noEmit

# Server healthy
curl "$RAILWAY_URL/healthz"

# Catalog still works
curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/api/catalog/expansions?limit=1"
```

---

## Deliverable

A matching engine that takes extracted signals from an eBay listing and correctly identifies which Pokemon card it is, which variant, and how confident the match is. Matches against the real synced database of ~35,000+ cards.

## What NOT to build yet

- No scanner loop or deal creation (Stage 8)
- No enrichment gate (Stage 8)
- No liquidity scoring (Stage 9)

Just the matching engine. Keep it clean.
