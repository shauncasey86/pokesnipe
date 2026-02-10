# Stage 6 Build Prompt — Signal Extraction & Condition Mapping

> Paste this entire prompt into a fresh Claude Code session to build Stage 6.

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

This is **Stage 6 of 13**. You are building the signal extraction pipeline — pure TypeScript functions that parse raw eBay listing data into structured, typed signals. This stage has **no external dependencies** — no DB calls, no API calls. Everything is pure functions: string in, data out.

**Workflow:** You write the code, commit, and push to GitHub. Railway auto-deploys. This stage is entirely pure functions tested with Vitest — no Railway-specific testing needed beyond ensuring `npm test` passes.

**IMPORTANT:** Build on top of the existing project. Do NOT re-initialize or overwrite existing files.

---

## Existing project structure (from Stages 1-5)

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
│   ├── pricing/                   ← Pricing engine + buyer protection + tier (done)
│   └── ebay/                      ← eBay auth, client, budget, rate limiter (done)
├── app.ts                         ← Express app (done)
└── server.ts                      ← Boot sequence (done)
client/                            ← React frontend (done)
```

---

## Step 1: No new packages needed

All signal extraction is pure TypeScript string processing and mapping. No external libraries.

---

## Step 2: Create `src/services/extraction/title-cleaner.ts`

Phase 1: Clean raw eBay titles for matching.

```typescript
export function cleanTitle(raw: string): { cleaned: string; original: string }
```

Processing steps:
1. Store `original` = raw input (for display later)
2. Strip emojis — regex: `/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{1FA00}-\u{1FAFF}\u{200D}\u{20E3}]/gu`
3. Decode HTML entities: `&amp;` → `&`, `&#39;` → `'`, `&lt;` → `<`, `&gt;` → `>`, `&quot;` → `"`
4. Collapse multiple spaces to single space
5. Trim whitespace
6. Lowercase the result (for matching)

---

## Step 3: Create `src/services/extraction/junk-detector.ts`

Phase 2: Early-exit for junk listings. Saves matching effort.

```typescript
export function detectJunk(cleanedTitle: string): { isJunk: boolean; reason?: string }
```

Check the cleaned lowercase title against these pattern groups:

**Bulk patterns** → `{ isJunk: true, reason: 'bulk_lot' }`:
```
lot, bundle, bulk, collection, x10, x20, x50, x100,
set of, mystery, random, grab bag, job lot
```

**Fake patterns** → `{ isJunk: true, reason: 'fake' }`:
```
custom, proxy, orica, replica, fake, unofficial, fan made, altered art
```

**Non-card patterns** → `{ isJunk: true, reason: 'non_card' }`:
```
booster, booster box, etb, elite trainer, tin, binder, sleeve,
playmat, deck box, code card, online code
```

If no pattern matches → `{ isJunk: false }`

**Word boundary handling:** Use word boundaries or careful matching to avoid false positives. For example, "collection" should reject "Pokemon Collection Box" but "lot" should not reject "Charlotte" — use `\blot\b` not just `.includes('lot')`.

---

## Step 4: Create `src/services/extraction/number-extractor.ts`

Phase 3: Extract card number from the title.

```typescript
interface CardNumber {
  number: number;          // Numeric card number (leading zeros stripped)
  prefix: string | null;   // "SV", "TG", "GG", "SWSH", etc. or null
  denominator: number | null; // Total cards in set (e.g., 197 from "006/197") or null
}

export function extractCardNumber(cleanedTitle: string): CardNumber | null
```

Try patterns in priority order (first match wins):

| Pattern | Example | Result |
|---------|---------|--------|
| Prefix + number / denominator | `"SV065/198"` | `{ number: 65, prefix: 'SV', denominator: 198 }` |
| Trainer gallery | `"TG15/TG30"` | `{ number: 15, prefix: 'TG', denominator: 30 }` |
| Standard fraction | `"123/456"` | `{ number: 123, prefix: null, denominator: 456 }` |
| Hash format | `"#123"` | `{ number: 123, prefix: null, denominator: null }` |
| "No." format | `"No. 123"` | `{ number: 123, prefix: null, denominator: null }` |

Regex suggestions:
```
/(SV|TG|GG|SWSH|SM|XY)?0*(\d{1,4})\s*\/\s*(?:TG)?0*(\d{1,4})/i   ← fraction formats
/#0*(\d{1,4})/                                                       ← hash format
/\bNo\.?\s*0*(\d{1,4})\b/i                                          ← "No." format
```

Always strip leading zeros: `065` → `65`.

If no pattern matches → return `null`.

---

## Step 5: Create `src/services/extraction/variant-detector.ts`

Phase 3b: Detect which variant the listing is based on title keywords.

```typescript
export function detectVariant(cleanedTitle: string): string | null
```

**Keyword → Scrydex variant name mapping:**

```typescript
// IMPORTANT: Check longer patterns first (order matters!)
const VARIANT_KEYWORDS: [string, string[]][] = [
  ['reverseHolofoil',       ['reverse holo', 'reverse holographic', 'rev holo', 'reverse']],
  ['firstEditionHolofoil',  ['1st edition holo', '1st ed holo', 'first edition holo']],
  ['firstEditionNormal',    ['1st edition', '1st ed', 'first edition']],
  ['unlimitedHolofoil',     ['unlimited holo']],
  ['unlimitedNormal',       ['unlimited']],
  ['holofoil',              ['holo', 'holographic', 'holo rare']],
];
// Order matters: "reverse holo" must be checked BEFORE "holo"
// "1st edition holo" must be checked BEFORE "1st edition"
```

Also detect these additional variant signals (return as-is):
- `'full art'`, `'alt art'`, `'alternate art'`, `'secret rare'`, `'gold'`, `'rainbow'`, `'shadowless'`

If no keyword matches → return `null` (the variant resolver in Stage 7 will handle default logic).

---

## Step 6: Create `src/services/extraction/condition-mapper.ts`

Map eBay condition data to Scrydex conditions. This is the most complex extractor.

```typescript
export interface ConditionResult {
  condition: 'NM' | 'LP' | 'MP' | 'HP';
  source: 'condition_descriptor' | 'localized_aspects' | 'title' | 'default';
  isGraded: boolean;
  gradingCompany: string | null;   // "PSA", "CGC", "BGS", etc.
  grade: string | null;            // "10", "9.5", "9", etc.
  certNumber: string | null;       // Slab serial number
  rawDescriptorIds: string[];      // For audit trail
}

export function extractCondition(listing: {
  conditionDescriptors?: Array<{ name: string; values: string[] }>;
  localizedAspects?: Array<{ name: string; value: string }> | null;
  title?: string;
}): ConditionResult
```

**Priority chain (first match wins):**

### Priority 1: Condition Descriptors (most reliable — numeric IDs from eBay)

**Graded cards** — descriptor name `27501` present:

```typescript
// Grading company (descriptor name: '27501')
const GRADER_MAP: Record<string, string> = {
  '275010': 'PSA',   '275011': 'BCCG',  '275012': 'BVG',
  '275013': 'BGS',   '275014': 'CSG',   '275015': 'CGC',
  '275016': 'SGC',   '275017': 'KSA',   '275018': 'GMA',
  '275019': 'HGA',   '2750110': 'ISA',  '2750111': 'PCA',
  '2750112': 'GSG',  '2750113': 'PGS',  '2750114': 'MNT',
  '2750115': 'TAG',  '2750116': 'Rare Edition',
  '2750117': 'RCG',  '2750118': 'PCG',  '2750119': 'Ace Grading',
  '2750120': 'CGA',  '2750121': 'TCG',  '2750122': 'ARK',
  '2750123': 'Other',
};

// Grade (descriptor name: '27502')
const GRADE_MAP: Record<string, string> = {
  '275020': '10',   '275021': '9.5',  '275022': '9',
  '275023': '8.5',  '275024': '8',    '275025': '7.5',
  '275026': '7',    '275027': '6.5',  '275028': '6',
  '275029': '5.5',  '2750210': '5',   '2750211': '4.5',
  '2750212': '4',   '2750213': '3.5', '2750214': '3',
  '2750215': '2.5', '2750216': '2',   '2750217': '1.5',
  '2750218': '1',   '2750219': 'Authentic',
  '2750220': 'Authentic Altered',
  '2750221': 'Authentic - Trimmed',
  '2750222': 'Authentic - Coloured',
};

// Cert number (descriptor name: '27503') — free text, just grab values[0]
```

If graded: return `{ condition: 'NM', source: 'condition_descriptor', isGraded: true, gradingCompany, grade, certNumber, rawDescriptorIds: [...] }`

**Ungraded cards** — descriptor name `40001`:

```typescript
const UNGRADED_CONDITION_MAP: Record<string, 'NM' | 'LP' | 'MP' | 'HP'> = {
  '400010': 'NM',   // Near Mint or Better
  '400015': 'LP',   // Lightly Played (Excellent)
  '400016': 'MP',   // Moderately Played (Very Good)
  '400017': 'HP',   // Heavily Played (Poor)
};
```

### Priority 2: localizedAspects

Look for an aspect with `name === 'Card Condition'`. Map text values:
- "Near Mint", "Mint" → `NM`
- "Lightly Played", "Excellent" → `LP`
- "Moderately Played", "Very Good", "Good" → `MP`
- "Heavily Played", "Poor" → `HP`

### Priority 3: Title parsing

Search the cleaned title for condition keywords:
- `near mint`, `nm` → `NM`
- `lightly played`, `lp` → `LP`
- `moderately played`, `mp` → `MP`
- `heavily played`, `hp` → `HP`

Use word boundaries to avoid false matches (e.g., "hp" shouldn't match inside "shipping").

### Priority 4: Default

If nothing matches → `{ condition: 'LP', source: 'default', isGraded: false, ... }`

LP is conservative — slightly undervalues, which means fewer false positives.

---

## Step 7: Create `src/services/extraction/structured-extractor.ts`

Extract signals from `localizedAspects` (only available after `getItem()` enrichment).

```typescript
export interface StructuredSignals {
  cardName: string | null;
  cardNumber: string | null;
  setName: string | null;
  rarity: string | null;
  language: string | null;
  gradingCompany: string | null;
  grade: string | null;
  year: string | null;
}

export function extractStructuredData(
  aspects: Array<{ name: string; value: string }>
): StructuredSignals
```

Map these aspect names:
```
'Card Name'           → cardName
'Character'           → cardName (fallback)
'Card Number'         → cardNumber
'Set'                 → setName
'Expansion'           → setName (fallback)
'Rarity'              → rarity
'Language'            → language
'Professional Grader' → gradingCompany
'Grade'               → grade
'Year Manufactured'   → year
```

---

## Step 8: Create `src/services/extraction/signal-merger.ts`

Phase 5: Merge all signals into a unified `NormalizedListing`.

```typescript
export interface NormalizedListing {
  // Original data
  ebayItemId: string;
  ebayTitle: string;         // Original uncleaned title
  cleanedTitle: string;

  // Card identification signals
  cardName: string | null;   // Best available card name
  cardNumber: CardNumber | null;
  variant: string | null;    // Scrydex variant name
  setName: string | null;

  // Condition
  condition: ConditionResult;

  // Data quality
  hasStructuredData: boolean; // True if localizedAspects were available
  signalSources: Record<string, string>; // Which source each signal came from
}

export function mergeSignals(
  titleSignals: { cardNumber: CardNumber | null; variant: string | null },
  structured: StructuredSignals | null,
  condition: ConditionResult,
  listing: { itemId: string; title: string; cleanedTitle: string }
): NormalizedListing
```

**Merge rules:**
- **Structured data wins over title data when both exist.** Structured `cardName` overrides title-inferred name. Structured `cardNumber` overrides title-extracted number.
- **Condition descriptors win over everything** for condition (already handled by extractCondition priority chain).
- Track which source each signal came from in `signalSources` (for debugging).

---

## Step 9: Create `src/services/extraction/index.ts`

The main extraction pipeline that ties it all together:

```typescript
export interface ExtractionResult {
  rejected: boolean;
  reason?: string;        // 'bulk_lot' | 'fake' | 'non_card'
  listing?: NormalizedListing;
}

export function extractSignals(listing: {
  itemId: string;
  title: string;
  conditionDescriptors?: Array<{ name: string; values: string[] }>;
  localizedAspects?: Array<{ name: string; value: string }> | null;
}): ExtractionResult {
  // 1. Clean the title
  const cleaned = cleanTitle(listing.title);

  // 2. Check for junk
  const junk = detectJunk(cleaned.cleaned);
  if (junk.isJunk) return { rejected: true, reason: junk.reason };

  // 3. Extract signals from title
  const cardNumber = extractCardNumber(cleaned.cleaned);
  const variant = detectVariant(cleaned.cleaned);

  // 4. Extract condition (uses descriptors if available)
  const condition = extractCondition(listing);

  // 5. Extract structured data (if enriched)
  const structured = listing.localizedAspects
    ? extractStructuredData(listing.localizedAspects)
    : null;

  // 6. Merge everything
  const normalized = mergeSignals(
    { cardNumber, variant },
    structured,
    condition,
    { itemId: listing.itemId, title: listing.title, cleanedTitle: cleaned.cleaned }
  );

  return { rejected: false, listing: normalized };
}
```

---

## Verification — Vitest pure function tests

This entire stage is pure functions with zero external dependencies. All testing is via Vitest.

### Create `src/__tests__/stage6/` with these test files:

**`title-cleaner.test.ts`:**
```typescript
import { cleanTitle } from '../../services/extraction/title-cleaner.js';

// Strips emojis
expect(cleanTitle('🔥 Charizard ex 🔥').cleaned).toBe('charizard ex');
// Decodes HTML entities
expect(cleanTitle('Charizard &amp; Friends').cleaned).toBe('charizard & friends');
// Collapses spaces
expect(cleanTitle('   lots   of   spaces   ').cleaned).toBe('lots of spaces');
// Preserves original
expect(cleanTitle('🔥 Charizard ex 🔥').original).toBe('🔥 Charizard ex 🔥');
// Lowercases
expect(cleanTitle('CHARIZARD EX').cleaned).toBe('charizard ex');
```

**`junk-detector.test.ts`:**
```typescript
import { detectJunk } from '../../services/extraction/junk-detector.js';

// Bulk → rejected
expect(detectJunk('pokemon card lot bundle x50')).toEqual({ isJunk: true, reason: 'bulk_lot' });
expect(detectJunk('mystery grab bag 10 random cards')).toEqual({ isJunk: true, reason: 'bulk_lot' });
// Fake → rejected
expect(detectJunk('custom proxy charizard orica')).toEqual({ isJunk: true, reason: 'fake' });
// Non-card → rejected
expect(detectJunk('pokemon booster box scarlet violet')).toEqual({ isJunk: true, reason: 'non_card' });
// Real cards → NOT rejected
expect(detectJunk('charizard ex 006/197 obsidian flames')).toEqual({ isJunk: false });
expect(detectJunk('pikachu vmax 044/185 vivid voltage')).toEqual({ isJunk: false });
```

**`number-extractor.test.ts`:**
```typescript
import { extractCardNumber } from '../../services/extraction/number-extractor.js';

// Standard format
expect(extractCardNumber('charizard 006/197')).toEqual({ number: 6, prefix: null, denominator: 197 });
// Prefix format
expect(extractCardNumber('sv065/198 iono sar')).toEqual({ number: 65, prefix: 'SV', denominator: 198 });
// Trainer gallery
expect(extractCardNumber('tg15/tg30 pikachu')).toEqual({ number: 15, prefix: 'TG', denominator: 30 });
// Hash format
expect(extractCardNumber('mewtwo #150')).toEqual({ number: 150, prefix: null, denominator: null });
// No number
expect(extractCardNumber('pokemon card holo rare')).toBeNull();
```

**`variant-detector.test.ts`:**
```typescript
import { detectVariant } from '../../services/extraction/variant-detector.js';

expect(detectVariant('reverse holo charizard')).toBe('reverseHolofoil');
expect(detectVariant('holo rare pikachu')).toBe('holofoil');
expect(detectVariant('1st edition holo charizard')).toBe('firstEditionHolofoil');
expect(detectVariant('1st edition dark blastoise')).toBe('firstEditionNormal');
expect(detectVariant('charizard ex 006/197')).toBeNull();  // No variant keyword
```

**`condition-mapper.test.ts`:**
```typescript
import { extractCondition } from '../../services/extraction/condition-mapper.js';

// Ungraded from condition descriptors (highest priority)
expect(extractCondition({
  conditionDescriptors: [{ name: '40001', values: ['400010'] }]
}).condition).toBe('NM');

expect(extractCondition({
  conditionDescriptors: [{ name: '40001', values: ['400015'] }]
}).condition).toBe('LP');

expect(extractCondition({
  conditionDescriptors: [{ name: '40001', values: ['400016'] }]
}).condition).toBe('MP');

// Graded card
const graded = extractCondition({
  conditionDescriptors: [
    { name: '27501', values: ['275010'] },  // PSA
    { name: '27502', values: ['275020'] },  // Grade 10
    { name: '27503', values: ['cert-123'] } // Cert number
  ]
});
expect(graded.isGraded).toBe(true);
expect(graded.gradingCompany).toBe('PSA');
expect(graded.grade).toBe('10');
expect(graded.certNumber).toBe('cert-123');

// No descriptors → fall back to title
expect(extractCondition({
  conditionDescriptors: [], title: 'near mint charizard'
}).condition).toBe('NM');
expect(extractCondition({
  conditionDescriptors: [], title: 'near mint charizard'
}).source).toBe('title');

// Nothing at all → default LP
const fallback = extractCondition({
  conditionDescriptors: [], title: 'charizard ex', localizedAspects: null
});
expect(fallback.condition).toBe('LP');
expect(fallback.source).toBe('default');
```

**`signal-merger.test.ts`:**
```typescript
import { mergeSignals } from '../../services/extraction/signal-merger.js';

// Structured data overrides title data
const result = mergeSignals(
  { cardNumber: { number: 6, prefix: null, denominator: 197 }, variant: 'holofoil' },
  { cardName: 'Charizard ex', setName: 'Obsidian Flames', cardNumber: '006', rarity: null, language: null, gradingCompany: null, grade: null, year: null },
  { condition: 'NM', source: 'condition_descriptor', isGraded: false, gradingCompany: null, grade: null, certNumber: null, rawDescriptorIds: ['400010'] },
  { itemId: '123', title: 'Charizard ex 006/197', cleanedTitle: 'charizard ex 006/197' }
);
expect(result.cardName).toBe('Charizard ex');   // From structured
expect(result.condition.condition).toBe('NM');  // From descriptor
expect(result.hasStructuredData).toBe(true);
```

### Run all tests

```bash
npm test -- --run src/__tests__/stage6/
```

### Also verify no regressions

```bash
# All existing tests still pass
npm test

# TypeScript compiles cleanly
npx tsc --noEmit

# Server still healthy on Railway after deploy
curl "$RAILWAY_URL/healthz"
```

---

## Deliverable

A signal extraction pipeline that converts raw eBay listings into structured, typed `NormalizedListing` objects. Pure functions — no DB, no API, no side effects. Fully tested with Vitest.

## What NOT to build yet

- No matching against the card database (Stage 7)
- No scanner loop (Stage 8)
- No enrichment gate (Stage 8)

Just the extraction pipeline. Keep it clean.
