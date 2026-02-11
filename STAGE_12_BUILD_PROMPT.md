# Stage 12 Build Prompt — Frontend Dashboard

> Paste this entire prompt into a fresh Claude Code session to build Stage 12.

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
- **Stage 3** (done): Card Catalog API + React frontend (catalog pages only)
- **Stage 4** (done): Exchange rate service + pricing engine + buyer protection + tier classifier
- **Stage 5** (done): eBay client — OAuth2 auth, searchItems, getItem, budget tracker
- **Stage 6** (done): Signal extraction pipeline
- **Stage 7** (done): Matching engine
- **Stage 8** (done): Scanner pipeline — end-to-end deal discovery
- **Stage 9** (done): Liquidity engine — real data scoring + tier adjustments
- **Stage 10** (done): Authentication & API — session auth, deals CRUD, lookup, status, preferences, SSE
- **Stage 11** (done): Deal lifecycle — expiry, pruning, cron job scheduler

This is **Stage 12 of 13**. You are building the arbitrage dashboard — the primary frontend. After this stage, the user has a complete working interface: login, live deal feed with SSE, deal detail panel with full analysis, client-side filtering, manual eBay lookup, system status, and settings. The backend is fully built — this stage is 100% frontend React work.

**Workflow:** You write the code, commit, and push to GitHub. Railway auto-deploys. Testing is manual in a real browser against the live Railway deployment.

**IMPORTANT:** Build on top of the existing project. The `client/` directory already has a React app from Stage 3 (catalog pages). Do NOT delete or break the existing catalog. Add dashboard pages alongside it.

---

## Existing project structure

```
client/
├── src/
│   ├── App.tsx                            ← Router (has catalog routes from Stage 3)
│   ├── main.tsx                           ← Entry point
│   ├── pages/                             ← Stage 3 catalog pages
│   │   ├── CatalogExpansions.tsx
│   │   ├── CatalogExpansionDetail.tsx
│   │   ├── CatalogCardDetail.tsx
│   │   ├── CatalogSearch.tsx
│   │   └── CatalogTrending.tsx
│   └── components/                        ← Stage 3 catalog components
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

The backend serves the built frontend as static files. All API routes are same-origin (no CORS needed).

---

## Install packages

```bash
cd client
npm install @fontsource/plus-jakarta-sans @fontsource/dm-mono
```

These are the two fonts from the design system.

---

## Design System Reference

This is a Bloomberg-terminal-meets-fintech aesthetic. Dark, dense, professional. **Not playful** despite Pokemon subject matter.

### Color Palette (CSS custom properties)

```css
:root {
  /* Backgrounds */
  --bg0: #070a12;                          /* Deepest background */
  --bg1: #0c1019;                          /* Level 1 */
  --bg2: rgba(14,19,32,0.75);             /* Level 2 */

  /* Glass morphism */
  --glass: rgba(255,255,255,0.035);        /* Glass surface */
  --glass2: rgba(255,255,255,0.055);       /* Glass hover */
  --brd: rgba(255,255,255,0.055);          /* Border */

  /* Text */
  --tMax: #f4f6f9;                         /* Maximum contrast */
  --tPri: #dce1eb;                         /* Primary text */
  --tSec: #8290a8;                         /* Secondary text */
  --tMut: #4d5a72;                         /* Muted text */

  /* Accents */
  --green: #34d399;
  --greenB: #6ee7b7;                       /* Bright green (profit) */
  --red: #f87171;
  --amber: #fbbf24;
  --blue: #60a5fa;
  --purple: #c084fc;

  /* Gradients */
  --grad-accent: linear-gradient(90deg, #34d399, #60a5fa, #c084fc, #ff6b6b);
  --grad-grail: linear-gradient(135deg, #ff6b35, #ff3b6f);
  --grad-hit: linear-gradient(135deg, #ffd60a, #ffaa00);
  --grad-flip: linear-gradient(135deg, #6b7fa0, #4a5a78);
  --grad-sleep: linear-gradient(135deg, #3a4060, #2a3050);
  --grad-cta: linear-gradient(135deg, #34d399, #2dd4bf);
}
```

### Typography

- **Display/body:** `'Plus Jakarta Sans', system-ui, sans-serif` — weights 300-800
- **Monospace (prices/numbers):** `'DM Mono', monospace` — weights 400, 500
- **Section headers:** DM Mono 9px uppercase, letter-spacing 2.5px
- **Card name:** 14px/700
- **Profit (feed):** 22px/800 with text-shadow glow
- **Profit (detail):** 42px/800 with text-shadow glow

### Glass Morphism

```css
.glass {
  background: var(--glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--brd);
  border-radius: 8px;
}

.glass:hover {
  background: var(--glass2);
}
```

### Gradient Border Component

```css
/* GradBorder — 1px padding trick */
.grad-border {
  background: var(--grad-accent);
  padding: 1px;
  border-radius: 10px;
}
.grad-border > * {
  background: var(--bg1);
  border-radius: 9px;
}
```

---

## Step 1: Set up design system styles

Create `client/src/styles/`:

### `client/src/styles/variables.css`

All the CSS custom properties from the design system reference above.

### `client/src/styles/global.css`

```css
@import './variables.css';

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  background: var(--bg0);
  color: var(--tPri);
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}

/* Scrollbar styling */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--brd); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--tMut); }

/* Monospace for all prices/numbers */
.mono { font-family: 'DM Mono', monospace; }

/* Section headers */
.section-header {
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 2.5px;
  color: var(--tMut);
}
```

### `client/src/styles/glass.css`

Glass morphism utility classes.

### Update `client/src/main.tsx`

Import the fonts and global styles:

```typescript
import '@fontsource/plus-jakarta-sans/300.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import './styles/global.css';
import './styles/glass.css';
```

---

## Step 2: Create shared UI components

Create reusable components in `client/src/components/ui/`:

### `TierBadge.tsx`
Gradient pill with tier letter. Uses the tier gradient colors:
- GRAIL: `#ff6b35 → #ff3b6f`, strong glow, letter "G"
- HIT: `#ffd60a → #ffaa00`, letter "H"
- FLIP: `#6b7fa0 → #4a5a78`, letter "F"
- SLEEP: `#3a4060 → #2a3050`, letter "S"

### `CondPill.tsx`
Condition-colored text pill: NM (green), LP (amber), MP (orange), HP (red).

### `LiqPill.tsx`
Liquidity-colored text pill: HIGH (green), MED (amber), LOW (orange), ILLIQ (red, dimmed).

### `Bar.tsx` / `BarRow.tsx`
Horizontal fill bar for confidence and liquidity signals. 3-5px tall, color by value: green ≥0.85, amber ≥0.65, red <0.65. Label left, bar middle, value right.

### `GradBorder.tsx`
Gradient border wrapper using the 1px padding trick.

### `TrendArrow.tsx`
Arrow + percentage: ↑ green (positive), ↓ red (negative), → grey (<1% change). DM Mono 10px.

### `Toast.tsx`
Fixed top-right notification. GradBorder wrapped. Tier badge + card name + profit. Auto-dismiss 5s. Used for GRAIL deal alerts.

### `SSEBanner.tsx`
Connection status banner at top of page:
- Reconnecting: amber, pulsing dot
- Lost (>30s): red, "Connection lost" + Retry button
- Connected: hidden

### `SystemBanner.tsx`
Persistent banner for system warnings (amber) and errors (red). Shows when sync fails, budget low, etc.

---

## Step 3: Create auth context

### `client/src/context/AuthContext.tsx`

```typescript
// On app load: GET /auth/check
//   → { authenticated: true }  → show dashboard
//   → { authenticated: false } → show login
//
// Export:
//   useAuth() → { isAuthenticated, isLoading, login, logout }
//
// login(password) → POST /auth/login → set isAuthenticated
// logout() → POST /auth/logout → set isAuthenticated = false
//
// Wrap the app in <AuthProvider>
```

Key implementation details:
- Check auth state on mount via `GET /auth/check`
- Show loading spinner while checking
- `login()` calls `POST /auth/login` with password, sets `isAuthenticated = true` on success
- `logout()` calls `POST /auth/logout`, sets `isAuthenticated = false`
- If any API call returns 401, auto-set `isAuthenticated = false` (redirect to login)

---

## Step 4: Create Login page

### `client/src/pages/Login.tsx`

Design from §10 of the frontend spec:

- Background: `var(--bg0)` with subtle radial gradient
- Centered card (360px wide, glass surface)
- Logo area: PokeBall icon (48px SVG/CSS circle), "PokeSnipe" (28px/800 weight, "Snipe" in `var(--red)`)
- Tagline: "No BS Arbitrage" (DM Mono 10px, `var(--tMut)`)
- Password input: glass surface, 48px height, auto-focus
- Submit button: glass surface, 48px, 700 weight, "ENTER" text
- On submit: call `login(password)` from auth context
- On error: shake animation + "Invalid password" in `var(--red)`
- Footer: "PRIVATE DASHBOARD · PASSWORD PROTECTED" (DM Mono 9px, `var(--tMut)`)

---

## Step 5: Create the Header

### `client/src/components/Header.tsx`

58px fixed header with three-zone grid layout:

**Left zone:**
- PokeBall icon (small) + "PokeSnipe" brand text ("Snipe" in red)
- Nav tabs: "Dashboard" | "Catalog" — active tab has underline accent

**Center zone:**
- Search bar (glass input) — contextual: catalog search on catalog pages, deal search on dashboard

**Right zone:**
- Lookup button (magnifying glass icon) — opens LookupModal
- Settings gear icon — opens SettingsModal
- Live indicator: pulsing green dot + "LIVE" text when SSE connected

Bottom border: 1px gradient line using `var(--grad-accent)`.

---

## Step 6: Create the Dashboard page

### `client/src/pages/Dashboard.tsx`

The main layout container for the deal-hunting interface:

```
┌─────────────────────────────────────────────────────────┐
│  HEADER (58px)                                           │
├─────────────────────────────────────────────────────────┤
│  FILTER BAR (44px)                                       │
├──────────────────────────────┬──────────────────────────┤
│  DEAL FEED (scrollable)      │  DETAIL PANEL (440px)     │
│                              │                           │
├──────────────────────────────┴──────────────────────────┤
│  FOOTER (42px)                                           │
└─────────────────────────────────────────────────────────┘
```

On mount:
1. `GET /api/deals?limit=50&sort=-createdAt` → initial deals
2. `GET /api/status` → initial system status
3. `GET /api/preferences` → saved filter defaults
4. Open SSE: `new EventSource('/api/deals/stream')`

SSE event handling:
- `event: deal` → prepend new deal to state array
- `event: status` → update status footer data
- Reconnection: browser EventSource auto-reconnects. Pass `Last-Event-Id` for replay.

State:
- `deals: Deal[]` — all deals loaded (initial + SSE)
- `filteredDeals: Deal[]` — deals after client-side filters applied
- `selectedDealId: string | null` — currently selected deal for detail panel
- `filters: FilterState` — current filter selections
- `status: SystemStatus` — latest system status
- `sseConnected: boolean` — SSE connection state

---

## Step 7: Create the Deal Feed

### `client/src/components/DealFeed.tsx`

A scrollable list of deal cards, newest first.

### `client/src/components/DealCard.tsx`

Each deal card shows (from §2 of frontend spec):

| Field | Visual Treatment |
|-------|-----------------|
| Card image + tier badge | 48x67px thumbnail, tier gradient pill at bottom-left |
| Card name + number | 14px/700 `--tMax`. Number in 12px muted |
| Expansion name | 12px `--tMut` |
| eBay price → Market price | DM Mono 11px, arrow separator |
| **Profit (GBP + %)** | 22px/800 `--greenB` with text-shadow glow. % in DM Mono 11px below |
| Confidence bar | 3px tall, 64px wide, green/amber/red |
| Liquidity pill | HIGH/MED/LOW/ILLIQ colored |
| Condition pill | NM/LP/MP/HP colored |
| Graded badge | Blue pill, only if `is_graded: true` |
| Time listed | DM Mono 10px, red after 60 min |
| Price trend | DM Mono 10px, arrow + %, green/red/grey |

**Tier visual treatment:**
- GRAIL: gradient glow border, full opacity
- HIT: standard glow
- FLIP: subtle
- SLEEP: row at 35% opacity

**Real-time behavior:**
- New deals slide in at top with `fadeSlide` animation (stagger 30ms/row, max 300ms)
- Feed does NOT auto-scroll — user controls position
- If scrolled down and new deals arrive: show "FRESH HEAT ↑" pill (glass, `var(--amber)`)
- Clicking "FRESH HEAT" scrolls to top
- GRAIL deals trigger a `Toast` notification

**Click behavior:**
- Click a deal card → set `selectedDealId` → detail panel opens/updates
- Selected card gets subtle highlight border

---

## Step 8: Create the Deal Detail Panel

### `client/src/components/DealDetailPanel.tsx`

Right-side panel, 440px fixed width. Independent scroll from feed. Fetches full deal via `GET /api/deals/:id`.

**Empty state:** PokeBall icon + "SELECT A DEAL / TO INSPECT" centered text.

**Sections (each can be a sub-component):**

### 8.1 Header + Images
- Sticky header: large tier badge, card name (20px/800), close button
- Side-by-side images: Scrydex reference image + eBay listing image (5:7 ratio, glass background)
- Card info: name + number, expansion, condition pill, liquidity pill
- Graded badge if applicable (e.g. "PSA 10 GEM MINT")

### 8.2 Profit Hero
- `GradBorder` wrapper
- Profit at 42px/800 `--greenB` with text-shadow glow
- Percentage + tier context: "+XX% · GRAIL territory" / "Solid hit" / "Quick flip" / "Sleeper"
- Tagline: "No BS profit · Fees included"

### 8.3 CTA Button
- "SNAG ON EBAY →" — full width, gradient `#34d399 → #2dd4bf`, 800 weight
- `onClick: window.open(deal.ebay_url, '_blank')`

### 8.4 No BS Pricing
Simple breakdown table:
```
eBay price     £12.50
Shipping       £1.99
Fees (inc.)    £0.98
───────────────────────
Total cost     £15.47

Market (USD)   $57.00
FX rate        ×0.789
Market (GBP)   £44.97
┌─────────────────────┐
│ Profit  +£29.50     │
└─────────────────────┘
```
All values from the deal's frozen pricing snapshot. DM Mono for numbers.

### 8.5 Match Confidence
- Composite score: 30px/800, colored by value, text-shadow glow
- Per-field bars using `BarRow` component (grid: 66px label | flex bar | 38px value):
  - Name, Number, Denom, Expan, Variant, Extract
- Bars: 5px tall, green ≥0.85, amber ≥0.65, red <0.65
- Data from `deal.match_signals.confidence`

### 8.6 Liquidity
- Composite score + grade pill
- Per-signal bars:
  - Trend, Prices, Spread, Supply, Sold, Velocity
- If velocity not fetched: show `[Fetch → 3cr]` button next to velocity bar
  - On click: `GET /api/deals/:id/velocity` → bar fills with animation, grade may update
- Data from `deal.match_signals.liquidity`

### 8.7 Comps by Condition
Table showing real Scrydex prices per condition:
```
       Low       Market
● NM   £36.00    £41.02     ← active condition highlighted
  LP   £24.00    £29.97
  MP   £14.40    £18.93
  HP   £6.40     £9.46
```
Data from `deal.condition_comps` or `deal.variant_prices`.

### 8.8 Price Trends
Real Scrydex trend data for the matched condition:
```
1d   +£0.39  (+1.2%)   →   grey
7d   +£1.58  (+4.8%)   ↑   green
30d  +£3.95  (+12.1%)  ↑   green
90d  +£6.32  (+20.0%)  ↑   green
```
Use `TrendArrow` component. Data from `deal.variant_trends`.

### 8.9 Expansion
- Set name + code
- Release date
- "View all cards →" link to `/catalog/expansions/:id`

### 8.10 Card Data
- Rarity, supertype, subtypes, artist
- "View in Catalog →" link to `/catalog/cards/:id`

### 8.11 Footer — Review Actions
- Two buttons: "✓ Correct" (green) / "✗ Wrong" (red)
- "Wrong" expands to reason pills: "Wrong Card", "Wrong Set", "Wrong Variant", "Wrong Price"
- On click: `POST /api/deals/:id/review { isCorrectMatch, reason }`
- If already reviewed: show verdict with timestamp

---

## Step 9: Create the Filter Bar

### `client/src/components/FilterBar.tsx`

44px horizontal bar below header. Always visible on dashboard.

| Group | Label | Type | Options | Default |
|-------|-------|------|---------|---------|
| Tier | `TIER` | Multi-select | GRAIL / HIT / FLIP / SLEEP | GRAIL + HIT + FLIP |
| Condition | `COND` | Multi-select | NM / LP / MP / HP | NM + LP + MP |
| Liquidity | `LIQ` | Multi-select | HI / MD / LO | HI + MD |
| Confidence | `CONF` | Multi-select | HI / MD | HI + MD |
| Time | `TIME` | Single-select | 1H / 6H / 24H / ALL | 6H |
| Min Profit | `MIN%` | Stepper (+/-) | 0-100% | 10% |
| Graded | `GRADED` | Toggle | ON / OFF | OFF |

### `client/src/components/FilterGroup.tsx`
Glass capsule container. Label on left (DM Mono 9px uppercase), chips inside.

### `client/src/components/Seg.tsx`
Individual filter chip. Toggleable. Active state uses tier/type-appropriate color.

### `client/src/components/Stepper.tsx`
−/+ buttons flanking a numeric value. For Min Profit %.

**Key behavior:**
- **Filtering is 100% client-side** — no API calls. Filter the in-memory deals array instantly.
- Apply filters: `deals.filter(d => selectedTiers.includes(d.tier) && selectedConditions.includes(d.condition) && ...)`
- Time filter: compare `deal.created_at` against current time
- "SAVE" button: `PUT /api/preferences { defaultFilters: currentFilters }` to persist
- On load: restore saved filters from preferences

---

## Step 10: Create the Status Footer

### `client/src/components/StatusFooter.tsx`

42px persistent footer, two-zone layout:

**Left zone — Operational stats:**
```
● Hunting · 2m ago  |  Today: 47 · 3G · 8H  |  Acc: 91% · 7d
```
- Green dot = scanner running, amber = degraded, red = stopped
- "2m ago" = time since last scan cycle
- Deal counts for today: total, GRAILs, HITs
- Accuracy: rolling 7-day percentage

**Right zone — API & Index status (hidden ≤640px):**
```
eBay [●] 1,847/5K  |  Scrydex [●] 2,340/50K  |  Index [●] 34,892 · 2h ago
```
- Status dots: green (healthy), amber (degraded), red (critical)
- eBay budget: calls today / daily limit
- Card index: total cards synced + time since last sync

**Data source:** Initial `GET /api/status` + SSE `event: status` updates every 30s.

---

## Step 11: Create the Manual Lookup Modal

### `client/src/components/LookupModal.tsx`

Triggered by header lookup button. Centered overlay (580px, glass background).

1. **Input:** Auto-focused text field. Placeholder: "PASTE EBAY URL. NO BS."
2. **On Enter:** `POST /api/lookup { ebayUrl }`
3. **Loading states:** "Fetching..." → "Extracting..." → "Matching..." in amber text
4. **Result display:**
   - Card image + name + expansion
   - Condition pill + liquidity pill
   - Profit hero (34px, same style as detail panel)
   - Confidence composite score
   - "Open on eBay" button
5. **Debug section (expandable):**
   - Raw eBay data
   - Extraction signals
   - Candidate cards with scores
   - Matching pipeline output
6. **Actions:** "Open on eBay", "Add to corpus (correct)", "Add to corpus (incorrect)", "View in Catalog"
7. **Close:** Escape key or click backdrop

---

## Step 12: Create the Settings Modal

### `client/src/components/SettingsModal.tsx`

Triggered by gear icon in header. Centered overlay (520px, glass background).

**Two tabs: General | Notifications**

**General tab:**
- Tier thresholds display (read-only info: GRAIL >40%, HIT 25-40%, etc.)
- Display settings: Currency (GBP), fee breakdown visibility
- Sound: Deal alert toggle, GRAIL-only / all tiers
- Sign Out button (red text, calls `POST /auth/logout`)

**Notifications tab:**
- Telegram config: Bot Token + Chat ID inputs (masked with bullets)
- Save + "Test Message" button (calls `POST /api/notifications/telegram/test` if implemented, otherwise placeholder)
- Alert rules: per-tier push toggle
- Thresholds: min profit %, min confidence, watched expansions

**Behavior:**
- Changes debounced (500ms), sent as `PUT /api/preferences`
- Close: Escape key or click backdrop

---

## Step 13: Update App routing

Update `client/src/App.tsx`:

```typescript
// Routes:
// /           → Dashboard (requires auth)
// /catalog    → CatalogExpansions (public, from Stage 3)
// /catalog/*  → Other catalog pages (public, from Stage 3)

// Wrap app in AuthProvider
// Dashboard route: if not authenticated → redirect to /login
// Catalog routes: no auth needed
// /login route: Login page
```

Protected route component:
```typescript
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <>{children}</>;
}
```

---

## Step 14: Responsive layout

### ≤920px breakpoint:
- Detail panel → fixed bottom sheet (75vh height, rounded top corners, drag handle)
- Deal card rows → more compact, single-line pills
- Catalog grid → 2 columns

### ≤640px breakpoint:
- Card images in deal feed hide
- Expansion subtitle hides
- Filter groups collapse: hide LIQ, TIME, CONF, GRADED (keep TIER, COND, MIN%)
- Footer right zone (API section) hides
- Catalog grid → 1-2 columns

Use CSS media queries or `window.matchMedia` hooks.

---

## Step 15: Ensure static file serving

Verify `src/app.ts` (backend) serves the built frontend. It should already have something like:

```typescript
import path from 'path';
import express from 'express';

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../client/dist')));

// SPA catch-all — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/auth') && req.path !== '/healthz') {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  }
});
```

If this doesn't exist yet, add it. The catch-all must be AFTER all API routes so it doesn't intercept API calls.

---

## Step 16: Create `client/src/scripts/test-dashboard.ts` — Live test script

This script tests the dashboard API integration from the server side (verifying the API responses that the frontend depends on).

```typescript
/**
 * Live dashboard integration test — run on Railway with:
 *   npx tsx src/scripts/test-dashboard.ts
 *
 * Tests all API endpoints the frontend depends on,
 * verifying response shapes match what the React components expect.
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

async function login() {
  const res = await fetch(`${RAILWAY_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ACCESS_PASSWORD }),
  });
  const cookie = res.headers.get('set-cookie') || '';
  const match = cookie.match(/connect\.sid=[^;]+/);
  sessionCookie = match ? match[0] : '';
}

async function get(path: string) {
  return fetch(`${RAILWAY_URL}${path}`, { headers: { Cookie: sessionCookie } });
}

async function main() {
  console.log(`\n🧪 Dashboard Integration Test — ${RAILWAY_URL}\n`);

  await login();
  check('Logged in', sessionCookie.length > 0);

  // ── Test 1: Frontend serves ──
  console.log('\n── Test 1: Frontend static files ──');
  const indexRes = await fetch(`${RAILWAY_URL}/`);
  check('GET / returns 200', indexRes.status === 200);
  const html = await indexRes.text();
  check('Returns HTML with React root', html.includes('id="root"') || html.includes('id=\\"root\\"'));

  // ── Test 2: Deals list shape ──
  console.log('\n── Test 2: Deals list response shape ──');
  const dealsRes = await get('/api/deals?limit=5');
  const deals = await dealsRes.json();
  check('Has data array', Array.isArray(deals.data));
  check('Has total', typeof deals.total === 'number');
  check('Has page', typeof deals.page === 'number');
  check('Has totalPages', typeof deals.totalPages === 'number');

  if (deals.data.length > 0) {
    const d = deals.data[0];
    check('Deal has deal_id', typeof d.deal_id === 'string');
    check('Deal has ebay_title', typeof d.ebay_title === 'string');
    check('Deal has tier', ['GRAIL', 'HIT', 'FLIP', 'SLEEP'].includes(d.tier));
    check('Deal has profit_gbp (number)', typeof d.profit_gbp === 'number');
    check('Deal has profit_percent (number)', typeof d.profit_percent === 'number');
    check('Deal has confidence (number)', typeof d.confidence === 'number');
    check('Deal has condition', typeof d.condition === 'string');
    check('Deal has liquidity_grade', typeof d.liquidity_grade === 'string' || d.liquidity_grade === null);
    check('Deal has ebay_url', typeof d.ebay_url === 'string');
    check('Deal has created_at', typeof d.created_at === 'string');
    check('Deal has cardName', d.cardName !== undefined);

    // ── Test 3: Deal detail shape ──
    console.log('\n── Test 3: Deal detail response shape ──');
    const detailRes = await get(`/api/deals/${d.deal_id}`);
    const detail = await detailRes.json();
    check('Detail has match_signals', detail.match_signals !== undefined);
    check('Detail has card_name', detail.card_name !== undefined);
    check('Detail has variant_prices', detail.variant_prices !== undefined || detail.condition_comps !== undefined);
    check('Detail has expansion_name', detail.expansion_name !== undefined);
  } else {
    console.log('  ⚠️  No deals — skipping shape checks');
  }

  // ── Test 4: Status response shape ──
  console.log('\n── Test 4: Status response shape ──');
  const statusRes = await get('/api/status');
  const status = await statusRes.json();
  check('Status has scanner', status.scanner !== undefined);
  check('Status has scanner.dealsToday', typeof status.scanner?.dealsToday === 'number');
  check('Status has sync.totalCards', typeof status.sync?.totalCards === 'number');
  check('Status has ebay.callsToday', typeof status.ebay?.callsToday === 'number');
  check('Status has exchangeRate.rate', typeof status.exchangeRate?.rate === 'number' || status.exchangeRate?.rate === null);
  check('Status has accuracy', status.accuracy !== undefined);
  check('Status has jobs', status.jobs !== undefined);

  // ── Test 5: Preferences ──
  console.log('\n── Test 5: Preferences ──');
  const prefsRes = await get('/api/preferences');
  const prefs = await prefsRes.json();
  check('Preferences has data object', typeof prefs.data === 'object');

  // ── Test 6: SSE endpoint ──
  console.log('\n── Test 6: SSE endpoint ──');
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);
    const sseRes = await fetch(`${RAILWAY_URL}/api/deals/stream`, {
      headers: { Cookie: sessionCookie },
      signal: controller.signal,
    });
    check('SSE returns 200', sseRes.status === 200);
    check('SSE content-type', sseRes.headers.get('content-type')?.includes('text/event-stream') || false);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      check('SSE connection works (aborted after 3s)', true);
    } else {
      check('SSE connection', false, err.message);
    }
  }

  // ── Test 7: Catalog (public) ──
  console.log('\n── Test 7: Catalog API (no auth) ──');
  const catRes = await fetch(`${RAILWAY_URL}/api/catalog/expansions`);
  check('Catalog expansions returns 200', catRes.status === 200);

  // ── Test 8: Tier filter ──
  console.log('\n── Test 8: Tier filter ──');
  const grailRes = await get('/api/deals?tier=GRAIL&limit=5');
  check('Tier filter returns 200', grailRes.status === 200);
  const grailData = await grailRes.json();
  const allGrails = grailData.data.every((d: any) => d.tier === 'GRAIL');
  check('All returned deals are GRAIL', grailData.data.length === 0 || allGrails);

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
npx tsx src/scripts/test-dashboard.ts
```

---

## Manual Browser Testing Checklist

After deploying to Railway, open `https://<RAILWAY_URL>/` in a browser:

- [ ] **Login:** Enter password → dashboard loads. Wrong password → error shake.
- [ ] **Deal feed:** Deals appear. GRAIL deals have gradient glow. SLEEP deals are dimmed (35% opacity).
- [ ] **Live updates:** Leave open 5+ min. New deals slide in at top without refresh.
- [ ] **FRESH HEAT:** Scroll down, wait for new deals → "FRESH HEAT ↑" pill appears. Click → scrolls to top.
- [ ] **Deal detail:** Click a deal → right panel opens. Check:
  - Profit number, percentage, tier context
  - "SNAG ON EBAY" opens correct eBay listing
  - No BS Pricing breakdown adds up correctly
  - Confidence per-field bars with real scores
  - Liquidity per-signal bars
  - Comps by condition with real Scrydex prices
  - Price trends with arrows and percentages
  - Expansion info + "View in Catalog" link works
- [ ] **Fetch velocity:** In liquidity section, click "Fetch → 3cr" → bar fills in
- [ ] **Review:** Click "✓ Correct" or "✗ Wrong" → saves
- [ ] **Filters:** Toggle tiers → deals filter instantly. Toggle conditions. Try all groups. Filters are instant (client-side).
- [ ] **Save filters:** Change filters, click SAVE. Refresh → filters persist.
- [ ] **Manual lookup:** Click lookup button → paste real eBay URL → see result
- [ ] **Status footer:** Bottom bar shows scanner status, deal counts, API budgets. Updates every 30s.
- [ ] **Responsive (920px):** Detail panel → bottom sheet
- [ ] **Responsive (640px):** Images hide, filters collapse, footer API section hides
- [ ] **SSE reconnect:** Disconnect WiFi briefly → "Reconnecting..." banner → reconnect → banner gone, missed deals appear
- [ ] **Catalog still works:** Navigate to /catalog → expansion browser, card detail, search all work
- [ ] **GRAIL toast:** If a GRAIL deal arrives, toast notification appears top-right

---

## Deliverable

A working arbitrage dashboard: scan, evaluate, buy.

- Login with password authentication
- Live deal feed with SSE real-time updates
- Deal detail panel with full pricing, confidence, liquidity, trends, and comps
- Client-side filtering (tier, condition, liquidity, confidence, time, min profit, graded)
- Manual eBay URL lookup with full pipeline analysis
- System status footer with live metrics
- Settings modal with preferences
- Responsive layout (desktop, tablet, mobile)
- Glass morphism design system with professional fintech aesthetic
- Catalog pages still fully functional

---

## What NOT to build yet

- **Stage 13**: Observability — Telegram notifications, correlation IDs, accuracy tracking, CI pipeline
