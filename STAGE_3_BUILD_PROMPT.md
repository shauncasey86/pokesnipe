# Stage 3 Build Prompt — Card Catalog API & Frontend

> Paste this entire prompt into a fresh Claude Code session to build Stage 3.
> **Before pasting:** Fill in your Railway public URL below.

---

## Your Railway Details

```
RAILWAY_PUBLIC_URL=<your Railway public URL, e.g. https://pokesnipe-production.up.railway.app>
```

All environment variables (`DATABASE_URL`, `SCRYDEX_API_KEY`, etc.) are already configured as Railway service variables. You do NOT need to create or modify any `.env` file. The code reads from `process.env` which Railway populates automatically on deploy.

---

## What you're building

**PokeSnipe** — a Pokemon card arbitrage scanner.

- **Stage 1** (done): Express server, PostgreSQL, migrations, health endpoint
- **Stage 2** (done): Scrydex client, card sync — database now has ~35,000+ cards, ~70,000+ variants with real pricing/trends

This is **Stage 3 of 13**. You are building the Card Catalog — a public, browsable card database with backend API endpoints and a React frontend. No authentication required for catalog routes.

**Workflow:** You write the code, commit, and push to GitHub. Railway auto-deploys. You then verify against the live Railway URL using `curl`. There is no local development — all testing happens against the deployed Railway service.

**IMPORTANT:** The project already exists with Stage 1 + 2 code. Do NOT re-initialize or overwrite existing files. Build on top of what's there.

---

## Existing project structure (from Stages 1-2)

```
src/
├── config/index.ts           ← Zod config (done)
├── db/
│   ├── pool.ts               ← PostgreSQL pool (done)
│   └── migrate.ts            ← Migration runner (done)
├── routes/health.ts          ← GET /healthz (done)
├── services/
│   ├── scrydex/client.ts     ← Scrydex API client (done)
│   └── sync/                 ← Sync service (done)
├── app.ts                    ← Express app (done — you'll add catalog route here)
└── server.ts                 ← Boot sequence (done)
migrations/                   ← All 10 migration files (done)
```

---

## Step 1: Install frontend packages

```bash
# Create Vite React project in client/ directory
mkdir -p client
cd client
npm create vite@latest . -- --template react-ts
npm install react-router-dom
npm install @fontsource/plus-jakarta-sans @fontsource/dm-mono
cd ..
```

No new backend packages needed — Express and pg are already installed.

---

## Step 2: Create backend catalog API

### 2a. Create `src/utils/pagination.ts`

Pagination helper used by all catalog endpoints:

```typescript
// Takes query params { page?, limit? }
// Returns { offset: number, limit: number, page: number }
// Validates: page >= 1, limit between 1-100
// Defaults: page=1, limit=24
```

### 2b. Create `src/services/catalog/queries.ts`

Database query functions. All queries use parameterized `$1, $2` syntax (never string interpolation).

```typescript
// Each function returns typed data ready for the API response

getExpansions({ sort, series, page, limit }): Promise<{ data: Expansion[], total: number }>
getExpansionDetail(id, { sort, rarity, page, limit }): Promise<{ expansion, cards: { data, total } }>
searchCards(query, { page, limit }): Promise<{ data: Card[], total: number, query: string }>
getCardDetail(id): Promise<{ card, expansion, variants: Variant[] }>
getTrending({ period, direction, minPrice, condition, limit }): Promise<{ data: TrendingCard[] }>
```

### 2c. Create `src/routes/catalog.ts`

Express router with these endpoints — **NO auth middleware** on any:

**`GET /api/catalog/expansions`** — List all expansions.
- Query params: `?sort=release_date|name|card_count` (default: `-release_date`), `?series=Scarlet & Violet`, `?page=1&limit=24`
- SQL: `SELECT *, (SELECT COUNT(*) FROM cards WHERE expansion_id = e.scrydex_id) as card_count FROM expansions e ORDER BY release_date DESC LIMIT $1 OFFSET $2`
- Response: `{ data: [...], total: 350, page: 1, limit: 24 }`
- Each expansion: `{ id, name, code, series, logo, symbol, cardCount, releaseDate }`

**`GET /api/catalog/expansions/:id`** — Expansion detail + card list.
- URL param: `scrydex_id`
- Query params: `?sort=number|name|price` (default: `number`), `?rarity=...`, `?page=1&limit=50`
- SQL: Fetch expansion, then JOIN cards + variants. For each card, include the best NM market price for list view.
- Response: `{ expansion: {...}, cards: { data: [...], total: 180, page: 1 } }`

**`GET /api/catalog/cards/search`** — Full-text card search using pg_trgm.
- Query params: `?q=charizard` (required, return 400 if missing), `?page=1&limit=24`
- SQL: `SELECT *, similarity(name, $1) as sim FROM cards WHERE name % $1 ORDER BY sim DESC LIMIT $2 OFFSET $3`
- Handles misspellings automatically (pg_trgm fuzzy matching)
- Response: `{ data: [...], total: 42, page: 1, query: "charizard" }`

**`GET /api/catalog/cards/:id`** — Full card detail with all variants.
- URL param: `scrydex_card_id`
- SQL: Fetch card + JOIN all variants + expansion info
- Response:
```json
{
  "card": { "id": "sv3-6", "name": "Charizard ex", "number": "006", "rarity": "Double Rare", "supertype": "Pokemon", "subtypes": ["Stage 2", "ex"], "artist": "PLANETA Mochizuki", "image": "..." },
  "expansion": { "id": "sv3", "name": "Obsidian Flames", "code": "SV3", "series": "Scarlet & Violet", "logo": "..." },
  "variants": [
    {
      "name": "holofoil",
      "image": "...",
      "prices": { "NM": { "low": 45, "market": 52 }, "LP": { "low": 30, "market": 38 }, "MP": { "low": 18, "market": 24 }, "HP": { "low": 8, "market": 12 } },
      "gradedPrices": { "PSA_10": { "low": 200, "market": 280 } },
      "trends": { "NM": { "1d": { "price_change": 0.5, "percent_change": 1.2 }, "7d": { ... } } }
    }
  ]
}
```

**`GET /api/catalog/trending`** — Biggest price movers.
- Query params: `?period=1d|7d|14d|30d|90d` (default: `7d`), `?direction=up|down|both` (default: `both`), `?minPrice=5`, `?condition=NM|LP|MP|HP` (default: `NM`), `?limit=50`
- SQL: Query variants JSONB trends column, extract percent_change for requested period/condition, sort by absolute change descending. Filter out cards below minPrice.
- Response: `{ data: [{ card, variant, currentPrice, priceChange, percentChange, period }] }`

### 2d. Mount in `src/app.ts`

Add to the existing app setup:
```typescript
import { catalogRouter } from './routes/catalog.js';
app.use('/api/catalog', catalogRouter);  // No auth middleware
```

---

## Step 3: Build the React frontend

### 3a. Design system — `client/src/styles/`

Create these CSS files implementing the PokeSnipe design language:

**`variables.css`** — CSS custom properties:
```css
:root {
  --bg0: #070a12;
  --bg1: #0c1019;
  --bg2: rgba(14,19,32,0.75);
  --glass: rgba(255,255,255,0.035);
  --glass2: rgba(255,255,255,0.055);
  --brd: rgba(255,255,255,0.055);
  --tMax: #f4f6f9;
  --tPri: #dce1eb;
  --tSec: #8290a8;
  --tMut: #4d5a72;
  --green: #34d399;
  --greenB: #6ee7b7;
  --red: #f87171;
  --amber: #fbbf24;
  --blue: #60a5fa;
  --purple: #c084fc;
}
```

**`global.css`** — Base styles:
- Body: `background: var(--bg0)`, `color: var(--tPri)`, `font-family: 'Plus Jakarta Sans', system-ui, sans-serif`
- `box-sizing: border-box` on everything
- Scrollbar styling (thin, dark)

**`glass.css`** — Glass morphism utilities:
- `.glass` — `backdrop-filter: blur(16px)`, `background: var(--glass)`, `border: 1px solid var(--brd)`
- `.glass:hover` — `background: var(--glass2)`

### 3b. Main entry — `client/src/main.tsx`

Import fonts and styles:
```typescript
import '@fontsource/plus-jakarta-sans/300.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import './styles/variables.css';
import './styles/global.css';
import './styles/glass.css';
```

### 3c. Routing — `client/src/App.tsx`

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Routes:
// /catalog                 → ExpansionBrowser
// /catalog/expansions/:id  → ExpansionDetail
// /catalog/cards/:id       → CardDetail
// /catalog/search          → SearchResults
// /catalog/trending        → TrendingCards
```

### 3d. API layer — `client/src/api/catalog.ts`

Typed fetch functions. All use relative URLs (same origin, no CORS):

```typescript
export async function getExpansions(params?): Promise<ExpansionListResponse>
// GET /api/catalog/expansions?...

export async function getExpansionDetail(id, params?): Promise<ExpansionDetailResponse>
// GET /api/catalog/expansions/:id?...

export async function getCardDetail(id): Promise<CardDetailResponse>
// GET /api/catalog/cards/:id

export async function searchCards(query, params?): Promise<SearchResponse>
// GET /api/catalog/cards/search?q=...

export async function getTrending(params?): Promise<TrendingResponse>
// GET /api/catalog/trending?...
```

### 3e. Shared components — `client/src/components/`

- **`Header.tsx`** — Top nav bar with logo "PokeSnipe", nav tabs (Dashboard, Catalog), search bar. Glass surface, gradient accent line at bottom (`#34d399 → #60a5fa → #c084fc → #ff6b6b`).
- **`CardGrid.tsx`** — Responsive grid for card thumbnails. Props: cards array. 4 columns desktop, 3 tablet, 2 mobile. Each card: image (68x95px), name, number, NM price. Glass card surface with hover lift.
- **`PriceTable.tsx`** — Tabular display of per-condition prices (NM/LP/MP/HP rows, Low/Market columns). DM Mono font for number alignment.
- **`TrendDisplay.tsx`** — Trend arrows and percentages for each time window. Green for positive, red for negative, grey for <1%.
- **`Pagination.tsx`** — Page controls (prev/next buttons, page numbers).
- **`SearchBar.tsx`** — Text input with search icon. On submit, navigates to `/catalog/search?q=...`.
- **`ExpansionCard.tsx`** — Glass card with expansion logo, name, code, card count, release date. Click navigates to expansion detail.

### 3f. Page components — `client/src/pages/catalog/`

- **`ExpansionBrowser.tsx`** — Fetches `getExpansions()`, renders grid of `ExpansionCard` components grouped by series. Sort dropdown (release date, name, card count). Series filter.
- **`ExpansionDetail.tsx`** — Fetches `getExpansionDetail(id)`, shows expansion header (large logo, name, stats) + `CardGrid`. Sort and rarity filter controls. Pagination.
- **`CardDetail.tsx`** — Fetches `getCardDetail(id)`. Two-column layout: large card image (left), data (right). Variant selector tabs. `PriceTable` for raw prices. Graded prices table (if available). `TrendDisplay` for all time windows. Expansion info with link. This is the most complex page.
- **`SearchResults.tsx`** — Reads `?q=` from URL, fetches `searchCards(query)`. Renders `CardGrid` with results. Shows "No results" state.
- **`TrendingCards.tsx`** — Fetches `getTrending()`. Filter bar: period selector, direction, min price, condition. Results list with card info + price change data.

### 3g. Configure Vite — `client/vite.config.ts`

For production, there's no proxy needed (same origin). But add it for local Vite dev if ever used:
```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:3000' }
  }
});
```

---

## Step 4: Serve frontend from Express

Update `src/app.ts` to serve the built frontend static files in production:

```typescript
import path from 'path';

// After all API routes:
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
// Catch-all: serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});
```

This means:
- `/api/*` routes are handled by Express routers
- `/catalog`, `/catalog/expansions/sv3`, etc. serve `index.html` (React Router handles the route)
- Static assets (JS bundles, CSS, fonts) served from `client/dist/assets/`

---

## Step 5: Update build pipeline

The backend build needs to also build the frontend. Update `package.json` scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc && cd client && npm ci && npm run build",
    "start": "node dist/server.js",
    "test": "vitest run",
    "sync": "tsx src/scripts/run-sync.ts",
    "migrate": "tsx src/db/migrate.ts"
  }
}
```

The `build` script compiles TypeScript AND builds the Vite frontend, so Railway's auto-deploy gets both.

---

## Database tables used (already exist from Stage 1)

**expansions:** `scrydex_id` (PK), `name`, `code`, `series`, `printed_total`, `total`, `release_date`, `language_code`, `logo_url`, `symbol_url`

**cards:** `scrydex_card_id` (PK), `name`, `number`, `number_normalized`, `expansion_id` (FK), `expansion_name`, `expansion_code`, `printed_total`, `rarity`, `supertype`, `subtypes` (TEXT[]), `artist`, `image_small`, `image_medium`, `image_large`, `market_price_usd`

**variants:** `id` (SERIAL PK), `card_id` (FK), `name`, `image_small/medium/large`, `prices` (JSONB), `graded_prices` (JSONB), `trends` (JSONB), UNIQUE(`card_id`, `name`)

**Prices JSONB:** `{ "NM": { "low": 45.00, "market": 52.00 }, "LP": {...}, ... }`
**Graded JSONB:** `{ "PSA_10": { "low": 200, "market": 280 }, ... }`
**Trends JSONB:** `{ "NM": { "1d": { "price_change": 0.5, "percent_change": 1.2 }, "7d": {...}, ... }, "LP": {...} }`

---

## Verification — all against live Railway deployment

After writing the code, commit and push to GitHub. Wait for Railway to deploy. Then verify using the Railway public URL:

```bash
RAILWAY_URL="<your Railway public URL from above>"

# 1. Test expansion list
curl "$RAILWAY_URL/api/catalog/expansions?limit=5" | jq '.data | length'
# Expected: 5

curl "$RAILWAY_URL/api/catalog/expansions" | jq '.total'
# Expected: ~350+

# 2. Test sorting
curl "$RAILWAY_URL/api/catalog/expansions?sort=name&limit=3" | jq '[.data[].name]'
# Expected: alphabetical order

# 3. Test pagination (no overlap)
curl -s "$RAILWAY_URL/api/catalog/expansions?page=1&limit=5" | jq '[.data[].id]'
curl -s "$RAILWAY_URL/api/catalog/expansions?page=2&limit=5" | jq '[.data[].id]'
# Expected: different IDs on each page

# 4. Test expansion detail
EXPANSION_ID=$(curl -s "$RAILWAY_URL/api/catalog/expansions?limit=1" | jq -r '.data[0].id')
curl "$RAILWAY_URL/api/catalog/expansions/$EXPANSION_ID" | jq '.cards.data | length'
# Expected: > 0

# 5. Test card search
curl "$RAILWAY_URL/api/catalog/cards/search?q=charizard" | jq '.data[0].name'
# Expected: "Charizard" or "Charizard ex"

# 6. Test misspelled search (pg_trgm fuzzy)
curl "$RAILWAY_URL/api/catalog/cards/search?q=charzard" | jq '.data | length'
# Expected: > 0

# 7. Test card detail with variants and prices
CARD_ID=$(curl -s "$RAILWAY_URL/api/catalog/cards/search?q=charizard&limit=1" | jq -r '.data[0].id')
curl "$RAILWAY_URL/api/catalog/cards/$CARD_ID" | jq '.variants[0].prices'
# Expected: JSONB with NM, LP, MP, HP keys

curl "$RAILWAY_URL/api/catalog/cards/$CARD_ID" | jq '.variants[0].trends'
# Expected: JSONB with condition keys, each having 1d/7d/30d etc.

# 8. Test trending
curl "$RAILWAY_URL/api/catalog/trending?period=7d&limit=10" | jq '.data | length'
# Expected: up to 10

# 9. Verify no auth required
curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/api/catalog/expansions"
# Expected: 200 (not 401)

# 10. Verify frontend loads
curl -s "$RAILWAY_URL/catalog" | head -1
# Expected: <!DOCTYPE html> or similar HTML

# 11. TypeScript compiles cleanly
npx tsc --noEmit
# Expected: no errors
```

**Manual browser testing** — open the Railway URL in a browser:
- `https://your-app.railway.app/catalog` — expansion grid loads with logos and card counts
- Click an expansion — card grid with images and NM prices
- Click a card — full detail: large image, variant tabs, condition price table, graded prices, trends
- Type "charizard" in search — results appear. Try "charzard" (misspelled) — still works
- Click Trending — price movers with real data, filter controls work
- Resize browser to mobile width — grid reflows to fewer columns

---

## Deliverable

A working, browsable card catalog — useful as a standalone product before any arbitrage scanning exists. ~35,000+ cards searchable with real pricing, trends, graded prices, and images.

## What NOT to build yet

- No authentication (Stage 10)
- No deal feed / dashboard (Stage 12)
- No eBay integration (Stage 5)
- No SSE live updates (Stage 10)

Just the catalog. Keep it clean.
