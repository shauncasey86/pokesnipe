# PokeSnipe Frontend Design Specification

## Part 1: Feature Definition

### Primary User Goals

The user has exactly three modes of operation, in order of frequency:

1. **Scan & Act** — Monitor incoming deals, evaluate in seconds, click through to buy on eBay. This is the primary loop. Speed is everything.
2. **Investigate** — Paste an eBay listing URL to manually evaluate it. Used when browsing eBay independently and wanting a quick price check.
3. **Monitor** — Glance at system health: is the scanner running, are syncs current, is the card index healthy? This should take <2 seconds.

A distant fourth is **Browse** — exploring the card catalog for price research, but this is a separate product surface (see section 2.10 of the architecture doc).

### Core Dashboard Components

#### 1. Deal Feed (Primary Surface — 70% of screen time)

The deal feed is a **live-updating vertical list** of arbitrage opportunities, newest first. Each deal is a compact card showing:

| Field | Purpose | Visual Treatment |
|---|---|---|
| **Card image + tier badge** | Instant visual identification + deal quality at a glance | 48×67px thumbnail with type-color stripe at top edge. Tier pill badge overlaid at bottom-left corner of image |
| **Card name + number** | Primary identifier | 14px/700 weight, `--tMax` color. Number in muted 12px |
| **Expansion name + code** | Context | 12px, `--tMut` color, separated by dot |
| **eBay price → Market price** | Cost vs value at a glance | DM Mono 11px, arrow separator, muted |
| **Profit (GBP + %)** | The reason to act | 22px/800 weight, `--greenB` color with text-shadow glow. Percentage in DM Mono 11px below. This is the visual anchor |
| **Confidence score** | Trust level | 3px tall bar, 64px wide, color-coded by value (green ≥0.85, amber ≥0.65, red below) |
| **Liquidity** | Can you flip this card quickly? | Pill badge: "HIGH" (green) / "MED" (amber) / "LOW" (orange) / "ILLIQ" (red, dimmed). Compact mode: HI/MD/LO/— |
| **Condition** | NM / LP / MP / HP | Pill badge, color-coded (NM green, LP amber, MP orange, HP red) |
| **Time listed** | Urgency signal | DM Mono 10px, turns red after 60 minutes |
| **Price trend** | Is the card rising or falling? | DM Mono 10px, arrow (↑/↓/→) with percentage, green/red/grey |

**What the deal card does NOT show by default:** expansion cross-validation details, signal extraction breakdown, candidate list, normalization metadata. These exist but are hidden behind a drill-down.

**Deal tiers as visual weight:**

| Tier | Label (Short) | Criteria (configurable) | Visual Treatment |
|---|---|---|---|
| **GRAIL** | G | >40% profit, high confidence, high liquidity | Gradient badge `#ff6b35 → #ff3b6f`, strong profit glow, row at full opacity |
| **HIT** | H | 25–40% profit, high confidence | Gradient badge `#ffd60a → #ffaa00`, standard glow |
| **FLIP** | F | 15–25% profit, medium+ confidence | Gradient badge `#6b7fa0 → #4a5a78`, subtle |
| **SLEEP** | S | 5–15% profit, any confidence | Gradient badge `#3a4060 → #2a3050`, row at 35% opacity |

**Liquidity affects tier assignment.** The backend adjusts tiers based on liquidity grade (see architecture doc §2.7): illiquid cards are capped at SLEEP regardless of profit, low liquidity caps at FLIP, and medium liquidity downgrades GRAIL to HIT. This means GRAIL always implies both high profit AND high liquidity — the user can trust that GRAIL deals are quick flips.

**Real-time behavior:** New deals slide in at the top with a `fadeSlide` animation (staggered 30ms per row, max 300ms). The feed does NOT auto-scroll — the user controls their scroll position. A "FRESH HEAT ↑" pill appears at the top (gradient background `#ff6b6b → #f59e0b`) if they've scrolled down and new items arrive. GRAIL deals trigger a toast notification (top-right, auto-dismiss 5s).

**Data source:**
- **Initial load:** `GET /api/deals?limit=50&sort=-createdAt` populates the feed on page load (with any active filter params)
- **Real-time updates:** An SSE connection to `GET /api/deals/stream` pushes new deals as `event: deal` messages. The frontend appends incoming deals to the top of the in-memory list
- **Filtering is client-side.** The SSE stream sends all deals regardless of filters. The frontend applies tier/confidence/condition/profit filters locally — this avoids per-client filter state on the server and means filter changes are instant (no round-trip)
- **Reconnection:** The browser's native `EventSource` auto-reconnects on disconnect. The server uses `Last-Event-Id` to replay missed deals, so no data is lost during brief connection drops (e.g., Railway redeploys)

#### 2. Deal Detail Panel (Drill-Down)

Clicking a deal opens a **right-side panel** (440px fixed width, not a modal, not a new page — the feed stays visible on the left). When no deal is selected, the panel shows an empty state: PokeBall icon + "SELECT A DEAL / TO INSPECT" in DM Mono. The SSE `deal` event contains enough data for the feed row, but the detail panel fetches the full record via `GET /api/deals/:dealId`. The detail panel shows:

**Top section — Header + Images:**
- Sticky header with tier badge (large pill), card name, and close button (glass pill with ✕)
- Side-by-side image placeholders: Scrydex reference image and eBay listing image (5:7 aspect ratio, glass background)
- Card info: name + number (20px/800), expansion with logo placeholder, condition pill, liquidity pill

**Profit Hero — the dominant visual element:**
- Wrapped in a `GradBorder` component with gradient `rgba(52,211,153,0.5) → rgba(96,165,250,0.25) → rgba(192,132,252,0.15)`
- Radial glow background: `radial-gradient(ellipse at 20% 40%, var(--greenGlow) 0%, transparent 65%)`
- Profit at **42px/800 weight**, `--greenB` color, letter-spacing -2, text-shadow `0 0 40px rgba(52,211,153,0.25)`
- Percentage + tier context: "+XX% · GRAIL territory" / "Solid hit" / "Quick flip" / "Sleeper"
- Tagline: "No BS profit · Fees included" (DM Mono, 9px, uppercase, letter-spacing 2.5)

**CTA Button:**
- "SNAG ON EBAY →" — full width, gradient background `#34d399 → #2dd4bf`, dark text, 800 weight, letter-spacing 2.5, green glow shadow

**NO BS PRICING — Buyer Protection tiered breakdown:**
- Table layout: eBay price, shipping, Buyer Protection fee (with expandable sub-rows for flat fee + percentage bands), Market USD, FX rate
- Buyer Protection fee: eBay UK private seller fee. £0.10 flat + 7% on first £20 + 4% on £20–£300 + 2% on £300–£4,000
- Total row with summary, followed by a highlighted profit summary box (green tint background, green border)

**MATCH CONFIDENCE:**
- Large composite score (30px/800, colored by confidence value, text-shadow glow)
- "COMPOSITE CONFIDENCE" label
- Per-field bars (grid: 66px label | flex bar | 38px value): Name, Number, Denom, Expan, Variant, Extract
- Bars are 5px tall, glow when value > 0.8

**LIQUIDITY:**
- Composite badge (LiqPill + percentage + "COMPOSITE" label)
- Per-signal bars (same layout as confidence): Trend, Prices, Spread, Supply, Sold, Velocity
- If Velocity not fetched: "Fetch → 3cr" button (blue pill, DM Mono 9px). Clicking calls `/cards/{id}/listings` (3 credits) and updates inline

**COMPS BY CONDITION:**
- Table: NM / LP / MP / HP with prices. Active condition highlighted (700 weight, `--tMax` color, bullet indicator)

**EXPANSION:**
- Logo placeholder + set name + code
- Metadata rows: Total Cards, Release date, Series

**CARD DATA:**
- Metadata rows: Rarity, Supertype, Subtypes, Artist

**Footer — Accuracy Actions:**
- "✓ Correct" / "✗ Wrong" buttons — glass background, hover changes border/text to green/red
- "Wrong" expands to reason pills: "Wrong Card", "Wrong Set", "Wrong Variant", "Wrong Price"
- If already reviewed: shows verdict with "Undo" button
- Building the accuracy corpus should be frictionless

#### 3. Filter Bar

A dedicated **filter nav bar** below the header, always visible. Composed of grouped glass capsule containers (`FilterGroup` components) with segmented chip controls:

| Group | Label | Type | Options | Default |
|---|---|---|---|---|
| **Tier** | `TIER` | Multi-select with tooltips | GRAIL / HIT / FLIP / SLEEP | GRAIL + HIT + FLIP |
| **Condition** | `COND` | Multi-select | NM / LP / MP / HP | NM + LP + MP |
| **Liquidity** | `LIQ` | Multi-select | HI / MD / LO | HI + MD |
| **Confidence** | `CONF` | Multi-select | HI / MD | HI + MD |
| **Time** | `TIME` | Single-select | 1H / 6H / 24H / ALL | 6H |
| **Min Profit** | `MIN%` | Stepper (+/−) | 0–100% | 10% |
| **Graded** | `GRADED` | Toggle | ON / OFF | OFF |

Each FilterGroup is a glass capsule: pill radius, `backdrop-filter: blur(12px)`, glass background, 30px height, 1px border. Chips inside are 24px tall pills with color-coded active states and glow shadows.

Tier chips have hover tooltips showing criteria and description (e.g., GRAIL: ">40% profit · High confidence · High liquidity" / "Chase-tier. Heavy hitters.").

A **"SAVE"** button (right-aligned, DM Mono, uppercase) persists the current filter set as defaults via `PUT /api/preferences`. Shows "✓ SAVED" with green styling on success.

Filters are **additive** (AND logic). Active state is indicated by the chip's highlighted appearance within each group.

**Filter persistence:** Default filter state is loaded from server-side preferences on startup (`GET /api/preferences` → `defaultFilters`). When the user changes filters, the active state is held in local component state for instant responsiveness. "SAVE" persists back to the server. Defaults survive across devices/browsers (server-side), while in-session tweaks are instant.

**Filter application:** Filters run client-side against the in-memory deal list. The SSE stream and initial REST load provide unfiltered data. Filter changes are instant — no network round-trip.

#### 4. System Status Footer (Persistent)

A narrow persistent footer (42px) with a two-zone layout showing system health at a glance:

**Left zone — Operational stats** (separated by 1px dividers):
- Scanner status: green/amber/red dot with glow + "Hunting" label + "2m ago" relative time
- Deals today: count + GRAIL count in tier color + HIT count in tier color (e.g., "47 · 3G · 8H")
- Accuracy: percentage in green + "7d" rolling window label

**Right zone — API & Index status** (hidden on mobile):
- eBay: status dot (green/amber/red based on daily usage ratio) + usage count + capacity
- Scrydex: status dot + usage count + capacity
- Index: status dot + card count + last sync time

Color-coded status dots:
- **Green:** healthy, running normally
- **Amber:** degraded (approaching limits, sync overdue)
- **Red:** stopped (rate limited, budget exhausted, sync failed)

**Data source:** Initial status from `GET /api/status`. Ongoing updates via SSE `event: status` every 30 seconds. No polling needed.

#### 5. Manual Lookup Tool

Accessible via a **Lookup button** in the header (wrapped in a gradient border for emphasis). Opens as a centered overlay:

- Width: 580px, `max-width: 94vw`, `max-height: calc(100vh - 120px)`
- Glass background with blur and border, `border-radius: 20px`
- Header: "Manual Lookup" in thin uppercase + close button

**Flow:**
1. **Input:** Auto-focused text field. Placeholder: "PASTE EBAY URL. NO BS." (DM Mono, 12px, letter-spacing 1)
2. **API call:** `POST /api/lookup` with `{ ebayUrl }` on Enter
3. **Processing indicator:** "Fetching... Extracting... Matching..." in amber text
4. **Result:** Card info + condition/liquidity pills + GradBorder profit hero block (34px profit text)
5. **Debug info (expandable):** Raw eBay data, all candidates with scores, signal extraction detail, conflict resolution log
6. **Actions:** "Open on eBay", "Add to corpus (correct)", "Add to corpus (incorrect)"

#### 6. Notifications

**Telegram integration** for high-value alerts:
- GRAIL and HIT deals: instant push (configurable)
- Configurable: minimum profit, minimum confidence, specific expansions/cards to watch
- Configuration in Settings → Notifications tab
- "Test Message" button validates the connection inline

**In-app notifications:**
- New GRAIL deal: toast notification (top-right, GradBorder wrapped, tier badge + name + profit, auto-dismiss 5s, slideIn animation)
- System warnings: persistent banner (amber) for sync failures, budget warnings
- System errors: persistent banner (red) for scanner stopped, API failures
- SSE reconnection: banner between filter bar and main content with pulsing dot, "Reconnecting..." / "Connection lost" + Retry button

#### 7. Settings

Accessible from a gear icon in the header. Opens as a centered modal overlay (520px wide, `max-height: 85vh`, glass background with blur). **Two tabs: General and Notifications.**

All preferences are persisted server-side via `GET/PUT /api/preferences` (stored in PostgreSQL on Railway).

**General tab:**
- **Tier Thresholds:** Display each tier with its criteria and tier color (GRAIL: >40% · High confidence · High liquidity, etc.)
- **Display:** Currency (GBP), Fee Breakdown visibility, Dark Mode (ON)
- **Sound:** Deal alert toggle, GRAIL-only toggle, All tiers toggle
- **Sign Out** button at bottom (glass background, red text, red hover border). Calls `POST /auth/logout`, clears session, returns to login page

**Notifications tab:**
- **Telegram:** Bot Token and Chat ID inputs (masked), Save + Test Message buttons with inline status feedback
- **Alert Rules:** Per-tier push settings (GRAIL: Instant push, HIT: Instant push, FLIP: OFF, System warnings: Push on error)
- **Thresholds:** Min profit %, Min confidence, Watched expansions

**Save behavior:** Each setting change is debounced (500ms) and sent as a partial `PUT /api/preferences` update. The UI shows a subtle confirmation. No explicit save button needed — changes are live.

---

## Part 2: UX / Interaction Model

### Typical Session Flow

**Quick check (60% of sessions, <30 seconds):**
```
Open dashboard → Glance at deal feed → See "3 new GRAIL deals"
→ Scan the top 3 → One looks good → Click → Detail panel opens
→ Visual match check (card images match) → Click "SNAG ON EBAY →" → Done
```

**Investigation session (30% of sessions, 2–10 minutes):**
```
Open dashboard → Apply filters (NM only, >20% profit)
→ Scroll through deals → Click one that looks interesting
→ Read confidence breakdown → Notice variant confidence is low
→ Check card images — it's a reverse holo but listing says holo
→ Click "✗ Wrong" → Select "Wrong Variant" → Move to next deal
```

**Manual lookup (10% of sessions):**
```
Browsing eBay independently → See an interesting listing
→ Copy URL → Click "Lookup" in header → Paste → Enter
→ System matches to a card → Shows 35% profit, high confidence
→ Open on eBay to buy, or bookmark for later
```

### How Users Identify High-Confidence Opportunities Quickly

The interface uses **four simultaneous channels** to communicate deal quality:

1. **Position:** GRAIL deals are sorted to the top. Within tiers, sorted by profit descending. The best deals are always in the first 3–5 rows.

2. **Color intensity:** Profit figures use `--greenB` (#6ee7b7) with text-shadow glow — higher-tier deals get stronger glow (`0 0 28px` for GRAIL vs `0 0 12px` for others). The user's eye is drawn to the most intense green.

3. **Confidence visualization:** A 3px bar next to each deal's profit shows confidence as a filled proportion. High confidence = fully filled, green. Medium = partially filled, amber. Low = barely filled, red. This is peripheral information — the user absorbs it without actively reading a number.

4. **Liquidity indicator:** A pill badge on each deal row shows whether the card can be flipped quickly. "HIGH" (green, blends in — no friction), "MED" (amber — proceed with awareness), "LOW" (orange — visible warning), "ILLIQ" (red, dimmed at 45% opacity — only shown if enabled in filters).

**What the user does NOT need to do:**
- Read numerical confidence scores to make a decision (the color does it)
- Expand details to evaluate most deals (the summary row has enough)
- Mentally calculate profit (it's pre-computed, fees included, and displayed)
- Wonder if a card will actually sell (the liquidity badge tells them)
- Check system health manually (the footer tells them if something's wrong)

### Progressive Disclosure of Complexity

| Layer | What's Shown | When |
|---|---|---|
| **L1: Feed row** | Card image w/ tier badge, name, profit + glow, confidence bar, liquidity pill, condition, time, trend | Always visible |
| **L2: Detail panel** | Full images, profit hero, NO BS pricing breakdown, confidence per-field, liquidity breakdown, CTA | On click |
| **L3: Match internals** | Candidate list, signal extraction, regex matches, raw eBay data | Expandable sections within detail panel |
| **L4: System diagnostics** | API credit usage, sync logs, error traces | Status footer or separate admin view |

90% of user actions happen at L1 and L2. L3 is for investigating suspicious matches. L4 is for occasional health checks.

---

## Part 3: Mockup Guidance

### Layout Structure

```
┌───────────────────────────────────────────────────────────────────────┐
│  HEADER (58px)                                          gradient line │
│  [🔴 PokéSnipe NO BS] [═══ HUNT CARDS... ═══] [Lookup][⚙][● LIVE]  │
├───────────────────────────────────────────────────────────────────────┤
│  FILTER BAR                                                           │
│  [Tier: G H F S] [Cond: NM LP MP HP] [Liq: HI MD LO] [Conf: HI MD] │
│  [Time: 1H 6H 24H ALL] [Min%: −10+] [Graded: OFF]           [SAVE] │
├─────────────────────────────────────────┬─────────────────────────────┤
│                                         │                             │
│  DEAL FEED (flex, scrollable)           │  DETAIL PANEL (440px)       │
│                                         │                             │
│  ┌───────────────────────────────────┐  │  ┌───────────────────────┐  │
│  │ [img]  Zard ex #006/197          │  │  │ [GRAIL] Zard ex   [✕] │  │
│  │  [G]   Obsidian Flames · sv3     │  │  │                       │  │
│  │        £12.50 → £44.97           │  │  │ [Scrydex] [eBay img]  │  │
│  │              +£32.50  NM HI  3m  │  │  │                       │  │
│  │              +225%    ↑8.2%      │  │  │ ╔═══════════════════╗  │  │
│  │              ████████            │  │  │ ║  +£32.50          ║  │  │
│  ├───────────────────────────────────┤  │  │ ║  +225% · GRAIL   ║  │  │
│  │ [img]  Pika VMAX #044/185        │  │  │ ║  No BS · Fees in  ║  │  │
│  │  [H]   Vivid Voltage · swsh4    │  │  │ ╚═══════════════════╝  │  │
│  │        £8.99 → £28.00           │  │  │                       │  │
│  │              +£17.39  NM HI  7m  │  │  │ [SNAG ON EBAY →]     │  │
│  │              +166%    →2.1%      │  │  │                       │  │
│  │              ███████             │  │  │ ── NO BS PRICING ──   │  │
│  ├───────────────────────────────────┤  │  │ ── MATCH CONFIDENCE ─│  │
│  │ [img]  Mew2 ex #058/165         │  │  │ ── LIQUIDITY ────────│  │
│  │  [H]   SV 151 · sv3pt5          │  │  │ ── COMPS ────────────│  │
│  │        £6.50 → £17.99           │  │  │ ── EXPANSION ────────│  │
│  │              +£10.42  LP MD 12m  │  │  │ ── CARD DATA ────────│  │
│  │              +138%    ↓3.4%      │  │  │                       │  │
│  │              ██████              │  │  │ [✓ Correct] [✗ Wrong] │  │
│  └───────────────────────────────────┘  │  └───────────────────────┘  │
│                                         │                             │
├─────────────────────────────────────────┴─────────────────────────────┤
│  FOOTER (42px)                                          gradient line │
│  ● Hunting 2m │ Today: 47 3G 8H │ Acc: 91% 7d  eBay 1,847/5K ● ... │
└───────────────────────────────────────────────────────────────────────┘
```

**Dimensions:**
- Header: 58px fixed, three-zone grid (`auto 1fr auto`), glass background with gradient line at bottom
- Filter bar: auto height (~44px), always visible, glass background
- Deal feed: `flex: 1`, full remaining height, scrollable
- Detail panel: 440px fixed width, glass background, left border, scrollable independently
- Footer: 42px fixed, two-zone layout (left: ops stats, right: API status), gradient line at top

**Responsive behavior:**
- **≤920px:** Detail panel becomes a fixed bottom sheet (75vh height, rounded top corners, top border). Desktop meta columns in deal rows hide; mobile compact meta (single-line pills) shows instead.
- **≤640px:** Card images hide, expansion subtitle hides, price line hides, filter group labels hide, several filter groups hide (Liq, Time, Conf, Graded), logo text hides, Save button hides, footer API section hides. Profit and tier badge remain prominent.

### Visual Priorities (What Draws Attention First)

Ordered by visual weight, heaviest first:

1. **Profit figures** — The green numbers with glow. 22px/800 weight in feed rows, 42px/800 in detail panel. These are the largest, most saturated elements. The eye goes here first.
2. **Tier badge** — The GRAIL/HIT/FLIP/SLEEP pill overlaid on the card image at bottom-left. Uses gradient backgrounds: GRAIL = hot orange-to-pink (`#ff6b35 → #ff3b6f`), HIT = gold (`#ffd60a → #ffaa00`), FLIP = cool steel (`#6b7fa0 → #4a5a78`), SLEEP = near-invisible dark (`#3a4060 → #2a3050`).
3. **Card image** — The 48×67px thumbnail with type-color stripe. Humans process images faster than text. It confirms "yes, this is the card I think it is" instantly.
4. **Card name** — 14px/700, but secondary to profit. The user often recognizes the card from the image before reading the name.
5. **Confidence bar** — Peripheral. 3px tall, 64px wide, color-coded. You absorb it without focusing on it.
6. **Liquidity pill** — Same visual weight as confidence. A green "HIGH" pill blends in (no friction). Amber or red draws the eye only when liquidity is a concern.
7. **Everything else** — Condition, time, trend, expansion. Small, muted, scannable.

**The anti-pattern to avoid:** dashboards that give equal visual weight to every data point. If confidence, condition, expansion, profit, and card name are all the same size and color, the user has to actively read every field. Instead, profit screams, confidence whispers, and metadata is quiet.

### Theme Direction

**Tone:** Professional, dense, but not clinical. Think Bloomberg terminal meets modern fintech — information-rich but with clear hierarchy. Not playful or gamified, despite the Pokemon subject matter.

**Design language — Glass morphism with gradient accents:**
- **Glass surfaces:** `backdrop-filter: blur(16–20px)` with translucent rgba backgrounds (`--glass: rgba(255,255,255,0.035)`)
- **Gradient borders:** `GradBorder` component wraps high-importance elements using a 1px padding trick with gradient background
- **Gradient accents:** Header and footer share a rainbow gradient line (`#34d399 → #60a5fa → #c084fc → #ff6b6b`)
- **Rounded corners:** `--r-sm: 8px`, `--r-md: 12px`, `--r-lg: 16px`, `--r-xl: 20px`, `--r-pill: 999px`
- **Glow effects:** High-value elements (profit text, tier badges, status dots) use box-shadow and text-shadow glows
- **Borders:** Subtle, using rgba transparency (`--brd: rgba(255,255,255,0.055)`) — structure without noise
- **Animations:** `cubic-bezier(0.16,1,0.3,1)` for ease, `cubic-bezier(0.3,0,0,1)` for snap. FadeSlide on deal rows with staggered delays

**Color palette (CSS custom properties):**

| Element | Variable | Value |
|---|---|---|
| Background (deepest) | `--bg0` | `#070a12` |
| Background (level 1) | `--bg1` | `#0c1019` |
| Background (level 2) | `--bg2` | `rgba(14,19,32,0.75)` |
| Background (level 3) | `--bg3` | `rgba(20,26,42,0.65)` |
| Glass surface | `--glass` | `rgba(255,255,255,0.035)` |
| Glass (hover) | `--glass2` | `rgba(255,255,255,0.055)` |
| Glass (active) | `--glass3` | `rgba(255,255,255,0.08)` |
| Border (default) | `--brd` | `rgba(255,255,255,0.055)` |
| Border (medium) | `--brd2` | `rgba(255,255,255,0.09)` |
| Border (strong) | `--brd3` | `rgba(255,255,255,0.14)` |
| Text (maximum) | `--tMax` | `#f4f6f9` |
| Text (primary) | `--tPri` | `#dce1eb` |
| Text (secondary) | `--tSec` | `#8290a8` |
| Text (muted) | `--tMut` | `#4d5a72` |
| Text (ghost) | `--tGho` | `#2d3650` |
| Green | `--green` | `#34d399` |
| Green (bright) | `--greenB` | `#6ee7b7` |
| Green (glow) | `--greenGlow` | `rgba(52,211,153,0.15)` |
| Red | `--red` | `#f87171` |
| Amber | `--amber` | `#fbbf24` |
| Blue | `--blue` | `#60a5fa` |
| Purple | `--purple` | `#c084fc` |

**Card type colors** (used for image accent stripes):
```
fire: #ff6b6b, water: #60a5fa, electric: #fbbf24, psychic: #c084fc,
grass: #4ade80, dark: #8b7ec8, dragon: #f59e0b, normal: #94a3b8
```

**Confidence/liquidity color coding:**
- High (≥0.85): `--green` (#34d399)
- Medium (≥0.65): `--amber` (#fbbf24)
- Low (<0.65): `--red` (#f87171)

**Density:** High information density, achieved through typography hierarchy and spacing — not cramming. Each deal row has min-height 80px (padding 10px 20px 10px 16px). The feed should show 8–10 deals without scrolling on a standard 1080p display.

**Typography:**
- Display/body font (`--fd`): `'Plus Jakarta Sans', system-ui, sans-serif` — weights 300, 400, 500, 600, 700, 800
- Monospace font (`--fm`): `'DM Mono', monospace` — weights 400, 500
- Card name: 14px / weight 700
- Profit (feed): 22px / weight 800, letter-spacing -0.5, text-shadow glow
- Profit (detail hero): 42px / weight 800, letter-spacing -2, text-shadow glow
- Section headers (detail): DM Mono, 9px, uppercase, letter-spacing 2.5
- Metadata/labels: DM Mono, 9–12px, various letter-spacing
- Monospace for all prices and numbers (tabular alignment)

### Component Specifications

#### Deal Feed Row
```
Min-height: 80px
Padding: 10px 20px 10px 16px
Layout: horizontal flex, gap 14, align center

[Card Image + Tier Badge]  [Info Block]  [Profit Block]  [Meta Block]
      48px fixed              flex-grow     min-w 96px     min-w 56px

Selected indicator: 3px absolute left bar, blue with glow
Hover: translateY(-1px), box-shadow: 0 6px 24px rgba(0,0,0,0.25)
Selected: background var(--glass2), left bar visible
SLEEP: opacity 0.35
Entry: fadeSlide 0.3s, staggered 30ms/row (max 300ms)

Card Image: 48×67px, border-radius 8px, glass bg, 1px border
  Type-color stripe at top edge (2.5px)
  Tier pill badge overlaid at bottom-left (-3px offset)

Info Block:
  Line 1: Name (14px/700 --tMax) + #number (12px/400 --tMut)
  Line 2: Set name · set code (12px --tMut)
  Line 3: £price → £market (DM Mono 11px --tMut)

Profit Block (right-aligned):
  Line 1: +£XX.XX (22px/800 --greenB, glow)
  Line 2: +XX% (DM Mono 11px/600 --green)
  Line 3: Confidence bar (3px tall, 64px wide)

Meta Block — Desktop (right-aligned column):
  Line 1: [CondPill 18px] [LiqPill 18px]
  Line 2: Time (DM Mono 10px, red if >60m)
  Line 3: Trend arrow + % (DM Mono 10px)

Meta Block — Mobile (≤920px, replaces desktop):
  Single line: [CondPill 16px] [LiqPill 16px] [time]
```

#### Detail Panel — Confidence Breakdown
```
Section header: "MATCH CONFIDENCE" (DM Mono 9px uppercase, 2.5 letter-spacing)
Composite: 30px/800 weight, colored by value, text-shadow glow
Label: "COMPOSITE CONFIDENCE" alongside

Per-field bars (grid: 66px label | flex bar | 38px value):
  Name:        ████████████░░░  0.95
  Number:      ███████████████  1.00
  Denom:       ████████████░░░  0.92
  Expan:       ██████████░░░░░  0.88
  Variant:     █████████░░░░░░  0.85
  Extract:     ████████████░░░  0.90

Bars: 5px tall, 4px border-radius, glass track background
Fill color: green (≥0.85), amber (≥0.65), red (<0.65)
Glow: box-shadow when value > 0.8
```

#### Detail Panel — Liquidity Breakdown
```
Section header: "LIQUIDITY"
Composite: LiqPill badge + percentage (13px/700, liquidity color) + "COMPOSITE" label

Per-signal bars (same grid as confidence):
  Trend:     ████████████░░░  0.75
  Prices:    ██████████░░░░░  0.50
  Spread:    ████████████░░░  0.80
  Supply:    ██████████████░  0.90
  Sold:      █████████░░░░░░  0.67
  Velocity:  ░░░░░░░░░░░░░░░  —      [Fetch → 3cr]

After fetch: bar fills with animation, grade may update
"Fetch → 3cr" button: DM Mono 9px, blue, pill border, blue tint bg
```

#### Detail Panel — Price Comparison
```
Section header: "NO BS PRICING"

Table layout:
  eBay         £12.50
  Shipping     £1.99
  Buyer Prot.  £0.98
    ├ Flat fee   £0.10
    ├ 7% band    £0.88
    (├ 4% band   if applicable)
    (└ 2% band   if applicable)
  Market (USD)          $57.00
  FX rate               ×0.789
  ─────────────────────────────
  Total        £15.47   £44.97
  ┌─────────────────────────────┐
  │ Profit    +£29.50 (+190%)   │
  └─────────────────────────────┘

Sub-lines indented 10px, smaller (10px), ghost color
Total row: 700 weight, top border
Profit summary: green tint bg, green border, 13px/700
```

#### Status Footer
```
Height: 42px
Background: rgba(7,10,18,0.9), backdrop-filter blur(12px)
Top accent: gradient line at 0.4 opacity
Layout: flex, justify space-between

Left zone (flex, dividers):
  [● green] Hunting · 2m ago  |  Today: 47 · 3G · 8H  |  Acc: 91% · 7d

Right zone (hidden ≤640px):
  eBay [●] 1,847/5K  |  Scrydex [●] 2,340/50K  |  Index [●] 34,892 · 2h ago

Dot: 5-6px, border-radius 50%, colored glow shadow
Labels: DM Mono 10-11px, --tMut for labels, --tSec/--tMax for values
```

#### Lookup Tool Overlay
```
Width: 580px, max-width 94vw
Background: rgba(12,16,25,0.95), backdrop-filter blur(20px)
Border: 1px solid var(--brd2), border-radius 20px
Backdrop: rgba(7,10,18,0.85) with blur(16px)

Header: "Manual Lookup" (thin uppercase 12px) + close button (glass pill)
Input: full width, 46px, glass bg, DM Mono 12px
  Placeholder: "PASTE EBAY URL. NO BS."
Processing: amber text, DM Mono 11px
Result: card info + pills + GradBorder profit hero (34px text)
```

#### Settings Overlay
```
Width: 520px, max-width 94vw, max-height 85vh
Background: rgba(12,16,25,0.96), backdrop-filter blur(20px)
Border: 1px solid var(--brd2), border-radius 20px

Header: "Settings" (thin uppercase) + close button
Tabs: [General] [Notifications]
  Active tab: --tMax color, 2px blue bottom border
  Inactive: --tMut color, transparent border
  Style: DM Mono, 10px, uppercase, letter-spacing 1.5

Tab content: scrollable, full width
```

#### Reusable Components
```
FilterGroup: glass capsule (pill radius, glass bg, 30px height, 1px border)
  Contains label (DM Mono 7px, ghost, uppercase) + child chips

Seg (chip): 24px tall pill, color-coded active state + glow shadow
TierSeg: Seg variant with tier gradient bg + hover tooltip
Stepper: −/+ buttons (22px circles) flanking numeric input (32px wide)

GradBorder: gradient border wrapper (1px padding trick)
  Outer: gradient bg, target radius
  Inner: solid bg, radius - 1px, overflow hidden

PokeBall: minimal wireframe icon (configurable size)
  Circle with top-half tint, center line, center dot

Bar: horizontal fill bar (configurable height, color by value)
BarRow: grid layout (label | bar | value) for confidence/liquidity rows

TierBadge: gradient pill with tier letter/label
CondPill: condition-colored text pill (compact variant for mobile)
LiqPill: liquidity-colored text pill (compact variant for mobile)

Toast: fixed top-right, GradBorder wrapped, auto-dismiss animation
SSE Banner: conditional banner between filters and content
```

### What NOT to Include in v1

- Collection tracking / portfolio features
- Historical deal analytics or "deals I've bought" tracking
- Multi-user dashboards (password authentication provides single-user access, controlled via the `ACCESS_PASSWORD` environment variable)
- Mobile app (responsive web is sufficient)
- Card price alerts / watchlists (future: catalog feature)
- Social features, sharing, community
- Onboarding / tutorial (the interface should be self-evident)

---

## Part 4: Backend Integration

This section maps the frontend to the backend API contract defined in `ARBITRAGE_SCANNER_REVIEW.md` §2.12. It covers authentication, data flow, SSE lifecycle, and deployment.

### Authentication: Password Access

The dashboard is a private interface — it requires a valid session to access all non-public endpoints. The public card catalog (§2.10) does not require authentication.

Authentication uses a simple password checked against the `ACCESS_PASSWORD` Railway environment variable. There is no OAuth flow, no third-party identity provider — just a shared secret for a single-user tool.

**First-visit flow:**
```
1. User opens the dashboard URL
2. Frontend makes a test request (GET /api/status) — the httpOnly session
   cookie is sent automatically by the browser
3. If 401 (no session or expired): show the login page
4. User enters password → frontend sends POST /auth/login with { password }
5. Server compares against ACCESS_PASSWORD env var (constant-time comparison)
6. If match: server issues session cookie (httpOnly, 7-day expiry)
7. Redirect to dashboard → session cookie is now set
8. Dashboard loads normally — all API requests include the cookie automatically
```

**Subsequent visits:** The httpOnly session cookie (7-day expiry) is sent automatically by the browser on every request to the same origin. No localStorage token management needed. If any request returns 401 (session expired), redirect to the login page for re-authentication.

**SSE auth:** The `EventSource` API doesn't support custom headers, but it **does** send cookies automatically for same-origin requests. Since the session is a httpOnly cookie on the same origin, SSE authentication works out of the box: `GET /api/deals/stream` — no query parameter token needed.

**Login screen:**
- Background: `radial-gradient(ellipse at 50% 30%, #0f1628 0%, var(--bg0) 70%)`
- Centered card (360px, `max-width: 90vw`) with float-in animation
- PokeBall icon (48px)
- Brand: "PokeSnipe" (28px/800) with "Snipe" in `--red`
- Tagline: "No BS Arbitrage" (DM Mono, 10px, letter-spacing 3.5, uppercase)
- Password input (glass background, border, full width, 48px height)
- Submit button (glass background, full width, 48px height, 700 weight)
- Footer text: "PRIVATE DASHBOARD · PASSWORD PROTECTED" (DM Mono, 9px, ghost color)

**Logout:** "Sign Out" in Settings → General tab calls `POST /auth/logout`, which clears the session cookie and returns to the login page.

### Data Flow on Page Load

```
Page load
  │
  ├─ 1. Test session: GET /api/status
  │     ├── 200: session valid, continue
  │     └── 401: show login page (password form)
  │
  ├─ 2. Parallel fetch (session cookie sent automatically):
  │     ├── GET /api/deals?limit=50         → Populate deal feed
  │     ├── GET /api/status                 → Populate status bar
  │     └── GET /api/preferences            → Apply default filters + settings
  │
  ├─ 3. Open SSE connection:
  │     GET /api/deals/stream  (session cookie sent automatically)
  │     ├── event: deal    → Append to deal feed (top), apply local filters
  │     ├── event: status  → Update status bar
  │     └── event: ping    → (keepalive, no UI action)
  │
  └─ 4. Dashboard is live
```

### SSE Connection Lifecycle

```
┌──────────┐     connect      ┌───────────────┐
│  Initial  │ ──────────────▶ │  Connected     │
│  load     │                 │  (streaming)   │
└──────────┘                 └───────┬───────┘
                                      │
                              disconnect (network,
                              Railway redeploy)
                                      │
                                      ▼
                             ┌───────────────┐
                             │  Reconnecting  │──▶ auto-retry with
                             │  (EventSource) │    Last-Event-Id
                             └───────┬───────┘
                                      │
                              reconnect success
                              (missed deals replayed)
                                      │
                                      ▼
                             ┌───────────────┐
                             │  Connected     │
                             │  (streaming)   │
                             └───────────────┘
```

**Key behaviors:**
- `EventSource` reconnects automatically — no custom retry logic needed
- The `Last-Event-Id` header ensures the server replays any deals missed during disconnect
- During Railway redeploys (typically <10s), the user sees a brief amber "Reconnecting..." banner below the filter bar. Deals resume automatically once the new instance is up
- If the SSE connection fails for >30 seconds, the banner turns red: "Connection lost" with a "Retry" button

**Header SSE indicator:** A persistent pill in the header right zone shows live connection status — pulsing green dot + "LIVE" label when connected.

### User Action → API Mapping

| User Action | API Call | Notes |
|---|---|---|
| Sign in | `POST /auth/login` `{ password }` | Sets httpOnly session cookie on success; returns 401 on wrong password |
| Sign out | `POST /auth/logout` | Clears session cookie, returns to login page |
| Open dashboard | `GET /api/status`, `GET /api/deals`, `GET /api/preferences` | Parallel on load; 401 → show login page |
| Deal feed streaming | `GET /api/deals/stream` (SSE) | Long-lived connection, cookie auth |
| Click a deal | `GET /api/deals/:dealId` | Full detail + audit data |
| Mark deal correct | `POST /api/deals/:dealId/review` `{ isCorrectMatch: true }` | |
| Mark deal wrong | `POST /api/deals/:dealId/review` `{ isCorrectMatch: false, incorrectReason: "..." }` | |
| Paste eBay URL for lookup | `POST /api/lookup` `{ ebayUrl: "..." }` | |
| Fetch sales velocity (detail panel) | `GET /api/deals/:dealId/liquidity` | Triggers Scrydex `/listings` call (3 credits). Updates liquidity breakdown inline |
| Change filter | None — client-side | Applied to in-memory deal list |
| Save filter as default | `PUT /api/preferences` `{ defaultFilters: {...} }` | Debounced 500ms |
| Change any preference | `PUT /api/preferences` `{ ... }` | Partial update, debounced |
| Test Telegram config | `POST /api/notifications/telegram/test` | Show success/fail inline |
| Load more deals (scroll) | `GET /api/deals?page=2&limit=50` | Append to feed |
| Search deals | `GET /api/deals?q=charizard` | Re-fetch with search param |
| Expand status bar section | No API call — data already in latest `status` event | |

### Deployment

The frontend is a **static SPA** (single-page application) served by the same Railway Node.js service that runs the backend. There is no separate frontend deployment.

```
pokesnipe (Railway service)
├── Backend: Express/Fastify API on PORT (Railway-injected)
│   ├── /auth/*          → Password login/logout (POST /auth/login, POST /auth/logout)
│   ├── /api/*           → REST + SSE endpoints (session cookie auth)
│   └── /catalog/*       → Public card catalog (SSR for SEO)
└── Frontend: Static files served from /public or /dist
    ├── index.html       → SPA shell (dashboard)
    ├── assets/          → JS bundles, CSS, fonts
    └── Catch-all route  → index.html (client-side routing)
```

**Build pipeline:**
1. GitHub push to `main` triggers Railway auto-deploy
2. `Dockerfile` builds both backend (TypeScript → JS) and frontend (bundler → static assets) in a single multi-stage build
3. The production image serves the frontend as static files and the API from the same process
4. No CORS configuration needed — frontend and API share the same origin

**Required Railway environment variables:**
```
DATABASE_URL              # PostgreSQL connection
ACCESS_PASSWORD           # Dashboard access password
SESSION_SECRET            # Min 32 chars for session tokens
SCRYDEX_API_KEY           # Scrydex API authentication
SCRYDEX_TEAM_ID           # Scrydex team identifier
EBAY_CLIENT_ID            # eBay API OAuth app ID
EBAY_CLIENT_SECRET        # eBay API OAuth secret
EBAY_REFRESH_TOKEN        # eBay API long-lived refresh token
EXCHANGE_RATE_API_KEY     # For USD→GBP conversion
NODE_ENV                  # production|development|test
PORT                      # Default: 3000 (Railway-injected)
```

**Optional Railway environment variables:**
```
TELEGRAM_BOT_TOKEN        # For deal notifications
TELEGRAM_CHAT_ID          # Telegram chat to send alerts to
```

**Environment-specific behavior:**
- **Production (Railway):** `NODE_ENV=production`, static files served with cache headers, SSE keepalive enabled
- **Development (local):** Frontend dev server (Vite) proxies API requests to `localhost:3000`. `.env` file for secrets. Hot reload for UI changes

### Frontend Testing

Frontend testing is lightweight for v1 — the dashboard is a single-user tool, not a complex multi-page app with form wizards. The backend API is the primary contract, tested thoroughly in the architecture doc (§2.17). Frontend tests focus on the areas where bugs would silently break the user experience.

#### Component Tests (Vitest + Testing Library)

Test critical UI components in isolation. These run in CI alongside backend tests.

```typescript
// test/frontend/components/deal-feed.test.tsx
describe('DealFeed', () => {
  it('renders deal rows sorted by tier then profit', () => { ... });
  it('applies client-side filters without API call', () => { ... });
  it('shows "FRESH HEAT" pill when scrolled down and new deals arrive', () => { ... });
  it('highlights GRAIL deals with gradient accent and glow', () => { ... });
  it('renders SLEEP deals at 35% opacity', () => { ... });
});

// test/frontend/components/price-breakdown.test.tsx
describe('PriceBreakdown', () => {
  it('renders buyer protection fee with tiered breakdown', () => {
    render(<PriceBreakdown pricing={mockPricing} />);
    expect(screen.getByText('Buyer Prot.')).toBeInTheDocument();
    expect(screen.getByText('£0.98')).toBeInTheDocument();
    expect(screen.getByText('Flat fee')).toBeInTheDocument();
  });

  it('collapses fee breakdown when showBuyerProtectionFee is false', () => {
    render(<PriceBreakdown pricing={mockPricing} showBreakdown={false} />);
    expect(screen.getByText('£0.98')).toBeInTheDocument();
    expect(screen.queryByText('Flat fee')).not.toBeInTheDocument();
  });

  it('shows correct profit after fee deduction', () => { ... });
});

// test/frontend/components/login.test.tsx
describe('LoginPage', () => {
  it('shows password input field and submit button', () => { ... });
  it('sends POST /auth/login with password on submit', () => { ... });
  it('shows error message on wrong password', () => { ... });
  it('redirects to dashboard on successful login', () => { ... });
});
```

#### SSE Integration Tests

The SSE connection is the most fragile part of the frontend — test its lifecycle:

```typescript
// test/frontend/hooks/use-deal-stream.test.ts
describe('useDealStream hook', () => {
  it('appends new deals to feed on SSE deal event', () => { ... });
  it('updates status bar on SSE status event', () => { ... });
  it('shows reconnecting banner after 30s disconnect', () => { ... });
  it('resumes normally after reconnection', () => { ... });
});
```

#### What NOT to Test in Frontend

- **API response shapes** — the backend tests cover this with supertest
- **CSS styling / visual regression** — too fragile for v1, manual review is sufficient
- **Full E2E browser tests (Playwright/Cypress)** — deferred to v2; the backend API tests + component tests provide enough coverage for a single-user tool
- **Filter permutations** — filters are simple array/comparison operations; one test per filter type is enough
