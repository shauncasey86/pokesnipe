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
| **Card image** | Instant visual identification — faster than reading text | 60×84px thumbnail (standard card ratio), left-aligned |
| **Card name + number** | Primary identifier | Bold, largest text in the row |
| **Expansion name + logo** | Context | Small expansion symbol inline with set name, muted |
| **eBay price (GBP)** | What it costs | Left of the profit indicator |
| **Market price (GBP)** | What it's worth (converted from USD) | Right of the profit indicator |
| **Profit (GBP + %)** | The reason to act | Color-coded: green gradient by magnitude. This is the visual anchor |
| **Confidence score** | Trust level | Compact horizontal bar or ring, color-coded by tier |
| **Liquidity** | Can you flip this card quickly? | Small pill: "High" (green) / "Med" (amber) / "Low" (red-orange) / "Illiquid" (red, dimmed). See §2.7 of architecture doc |
| **Condition** | NM / LP / MP / HP | Small pill badge, color-coded |
| **Time listed** | Urgency signal | Relative time ("3m ago"), turns red after threshold |
| **Price trend** | Is the card rising or falling? | Tiny sparkline or arrow with 7d % |

**What the deal card does NOT show by default:** expansion cross-validation details, signal extraction breakdown, candidate list, normalization metadata. These exist but are hidden behind a drill-down.

**Deal tiers as visual weight:**

| Tier | Criteria (configurable) | Visual Treatment |
|---|---|---|
| **S-tier** | >40% profit, high confidence, high liquidity | Highlighted row, subtle pulse on arrival, optional sound |
| **A-tier** | 25-40% profit, high confidence | Standard highlighted row |
| **B-tier** | 15-25% profit, medium+ confidence | Standard row |
| **C-tier** | 5-15% profit, any confidence | Dimmed row, collapsed by default |

**Liquidity affects tier assignment.** The backend adjusts tiers based on liquidity grade (see architecture doc §2.7): illiquid cards are capped at C-tier regardless of profit, low liquidity caps at B-tier, and medium liquidity downgrades S to A. This means S-tier always implies both high profit AND high liquidity — the user can trust that S-tier deals are quick flips.

**Real-time behavior:** New deals slide in at the top with a brief highlight animation. The feed does NOT auto-scroll — the user controls their scroll position. A "New deals" pill appears at the top if they've scrolled down and new items arrive.

**Data source:**
- **Initial load:** `GET /api/deals?limit=50&sort=-createdAt` populates the feed on page load (with any active filter params)
- **Real-time updates:** An SSE connection to `GET /api/deals/stream` pushes new deals as `event: deal` messages. The frontend appends incoming deals to the top of the in-memory list
- **Filtering is client-side.** The SSE stream sends all deals regardless of filters. The frontend applies tier/confidence/condition/profit filters locally — this avoids per-client filter state on the server and means filter changes are instant (no round-trip)
- **Reconnection:** The browser's native `EventSource` auto-reconnects on disconnect. The server uses `Last-Event-Id` to replay missed deals, so no data is lost during brief connection drops (e.g., Railway redeploys)

#### 2. Deal Detail Panel (Drill-Down)

Clicking a deal opens a **right-side panel** (not a modal, not a new page — the feed stays visible on the left). The SSE `deal` event contains enough data for the feed row, but the detail panel fetches the full record via `GET /api/deals/:dealId` — this returns the confidence breakdown per field, price table across all conditions, condition mapping detail, match internals, and review state. The detail panel shows:

**Top section — Action Zone:**
- Large card image (from Scrydex CDN)
- eBay listing image (from eBay) — side by side for visual match verification
- "Open on eBay" button (primary CTA, prominent)
- Profit calculation breakdown: `eBay price + shipping + Buyer Protection fee = total cost` vs `market value = profit`
- Confidence score with per-field breakdown (expandable)

**Middle section — Match & Liquidity Details:**
- How the match was made: which signals fired, which candidate was chosen
- Confidence breakdown: horizontal stacked bar showing contribution of each field (name, number, denominator, expansion, variant, normalization)
- **Liquidity breakdown:** Composite score with per-signal detail (expandable):
  - Trend activity: how many price movement windows are active
  - Price completeness: how many conditions have market data
  - Price spread: low-to-market ratio (tight = liquid)
  - eBay supply: concurrent listings for this card
  - Sales velocity: recent sold count (if fetched from Scrydex `/listings`)
  - If sales velocity data hasn't been fetched, show "Sales data not fetched — [Fetch now]" button. Clicking calls `/cards/{id}/listings` (3 credits) and updates the liquidity assessment inline
- Condition mapping: what source provided the condition, raw value, mapped value
- Variant: which variant matched, how

**Bottom section — Card Info:**
- Full price table: all conditions (NM/LP/MP/HP) × variant prices
- Price trend chart: 7d/30d/90d price movement (data from synced trends)
- Expansion info: set logo, total cards, release date
- Card metadata: rarity, artist, supertype/subtypes

**Footer — Accuracy Actions:**
- "Correct match" / "Wrong match" buttons — feeds the accuracy regression corpus via `POST /api/deals/:dealId/review`
- "Wrong match" expands to: wrong card, wrong expansion, wrong variant, wrong price (sent as `incorrectReason` in the request body)
- These are always visible and one-click. Building the accuracy corpus should be frictionless
- If the deal has already been reviewed, show the existing verdict with an "Undo" option

#### 3. Filters & Search Bar

A persistent **top bar** with:

- **Search:** Free text search across deal card names, expansion names, eBay titles. Instant filter of the deal feed.
- **Confidence filter:** Dropdown or toggle — High only / High+Medium / All. Default: High+Medium.
- **Tier filter:** S / A / B / C toggles. Default: S+A+B visible.
- **Condition filter:** NM / LP / MP / HP toggles. Default: all.
- **Profit minimum:** Slider or input — minimum profit % to show. Default: 10%.
- **Time range:** Last hour / Last 6h / Last 24h / All. Default: Last 6h.
- **Liquidity filter:** High / Medium / Low / All. Default: High+Medium (hides illiquid and low-liquidity deals by default — the scanner is built for quick flips).
- **Graded toggle:** Show/hide graded card deals (separate pricing model).

Filters are **additive** (AND logic). Active filters show as removable pills below the search bar.

**Filter persistence:** Default filter state is loaded from server-side preferences on startup (`GET /api/preferences` → `defaultFilters`). When the user changes filters, the active state is held in local component state for instant responsiveness. A "Save as default" action persists the current filter set back to the server via `PUT /api/preferences`. This means defaults survive across devices/browsers (server-side), while in-session tweaks are instant and don't trigger API calls on every toggle.

**Filter application:** Filters run client-side against the in-memory deal list. The SSE stream and initial REST load provide unfiltered data. This means filter changes are instant — no network round-trip, no re-fetch. The `GET /api/deals` endpoint also accepts filter params (`tier`, `confidenceMin`, `condition`, `profitMin`, `since`, `q`) for initial load optimization, but real-time filtering is always local.

#### 4. System Status Bar (Persistent Footer)

A narrow persistent footer showing system health at a glance:

```
Scanner: ● Running (last scan: 2m ago) | eBay: 1,847/~5,000 daily | Scrydex: 2,340/50,000 monthly
Card Index: 34,892 cards | Last sync: 2h ago | Next sync: Sun 03:00
Deals today: 47 (12 S-tier, 18 A-tier) | Accuracy: 91% (7d rolling)
```

Color-coded status dots:
- **Green:** healthy, running normally
- **Yellow:** degraded (approaching limits, sync overdue)
- **Red:** stopped (rate limited, budget exhausted, sync failed)

Clicking any section expands to a detailed status panel (overlay, not navigation).

**Data source:** Initial status is fetched from `GET /api/status` on page load. Ongoing updates arrive via the same SSE connection used for deals — the `event: status` message fires every 30 seconds (or immediately on state change). The footer re-renders reactively from the latest status object. No polling needed.

#### 5. Manual Lookup Tool

Accessible via a **prominent button** in the top bar ("Lookup" or a search icon with a paste indicator). Opens as an overlay panel:

1. **Input:** Large text field accepting an eBay URL or item ID. Paste and press Enter
2. **API call:** `POST /api/lookup` with `{ ebayUrl }` or `{ ebayItemId }`. The backend fetches the listing, runs the full pipeline, and returns the `LookupResponse` (see architecture doc §2.9)
3. **Processing indicator:** Brief spinner with stage labels ("Fetching listing..." → "Extracting signals..." → "Matching..." → "Done"). Target response time: <2s (eBay API fetch dominates; local matching is <100ms)
4. **Result:** Same layout as the Deal Detail Panel, but with additional debug information:
   - Raw eBay API response fields (collapsible)
   - All candidates considered (not just the winner), with scores
   - Signal extraction detail: what each regex matched, what structured data was found, where conflicts occurred
   - If no match: explicit reason (no card number found, no candidates, all candidates below 0.60 name similarity, etc.)
5. **Actions:** "Open on eBay", "Add to corpus (correct)", "Add to corpus (incorrect)"

The lookup tool is also useful as a **diagnostic tool** — when a deal looks wrong, pasting its eBay URL into the lookup shows exactly why it was matched that way.

#### 6. Notifications

**Telegram integration** for high-value alerts:
- S-tier deals with high confidence: instant push
- Configurable: minimum profit, minimum confidence, specific expansions/cards to watch
- Configuration is part of the preferences object (`PUT /api/preferences` → `notifications.telegram`)
- "Test notification" button in preferences calls `POST /api/notifications/telegram/test` and shows success/failure inline
- Connection health shown via `GET /api/notifications/telegram/status` (last message sent, error state)

**In-app notifications:**
- New S-tier deal: brief toast notification (top-right, auto-dismiss 5s)
- System warnings: persistent banner (yellow) for sync failures, budget warnings
- System errors: persistent banner (red) for scanner stopped, API failures

#### 7. Preferences

Accessible from a gear icon. All preferences are persisted server-side via `GET/PUT /api/preferences` (stored in PostgreSQL on Railway) so they survive across browsers and devices. The full `UserPreferences` schema is defined in the architecture doc §2.12.

Key settings:

- **Profit thresholds:** Define what constitutes S/A/B/C tier (% and absolute GBP minimum)
- **Default filters:** Which tiers, conditions, confidence levels, and profit minimums to show by default
- **Notification settings:** Telegram bot token + chat ID, notification tier/confidence/profit thresholds, watched expansions and cards
- **Currency display:** Show prices in GBP, USD, or both
- **eBay Buyer Protection fee:** Toggle fee breakdown visibility in deal detail. The fee is calculated automatically using eBay UK's tiered Buyer Protection structure (£0.10 flat + 7%/4%/2% bands — see architecture doc §2.6) and always deducted in the profit calculation
- **Sound alerts:** Toggle on/off, choose which tier triggers sound on arrival
- **Dark/light mode:** Default to dark (see Part 3)

**Save behavior:** Each setting change is debounced (500ms) and sent as a partial `PUT /api/preferences` update. The UI shows a subtle "Saved" confirmation. No explicit save button needed — changes are live.

---

## Part 2: UX / Interaction Model

### Typical Session Flow

**Quick check (60% of sessions, <30 seconds):**
```
Open dashboard → Glance at deal feed → See "3 new S-tier deals"
→ Scan the top 3 → One looks good → Click → Detail panel opens
→ Visual match check (card images match) → Click "Open on eBay" → Done
```

**Investigation session (30% of sessions, 2-10 minutes):**
```
Open dashboard → Apply filters (NM only, >20% profit)
→ Scroll through deals → Click one that looks interesting
→ Read confidence breakdown → Notice variant confidence is low
→ Check card images — it's a reverse holo but listing says holo
→ Click "Wrong match: wrong variant" → Move to next deal
```

**Manual lookup (10% of sessions):**
```
Browsing eBay independently → See an interesting listing
→ Copy URL → Click "Lookup" in dashboard → Paste
→ System matches to a card → Shows 35% profit, high confidence
→ Open on eBay to buy, or bookmark for later
```

### How Users Identify High-Confidence Opportunities Quickly

The interface uses **four simultaneous channels** to communicate deal quality:

1. **Position:** S-tier deals are sorted to the top. Within tiers, sorted by profit descending. The best deals are always in the first 3-5 rows.

2. **Color intensity:** Profit figures use a green gradient — higher profit = more saturated green. A 50% profit deal is visually brighter than a 15% profit deal. The user's eye is drawn to the most intense green.

3. **Confidence visualization:** A small segmented bar next to each deal shows confidence as a filled proportion. High confidence = fully filled, green. Medium = partially filled, amber. Low = barely filled, faded. This is peripheral information — the user absorbs it without actively reading a number.

4. **Liquidity indicator:** A small pill badge on each deal row shows whether the card can be flipped quickly. "High" (green, blends in — no friction), "Med" (amber — proceed with awareness), "Low" (red-orange — visible warning), "Illiquid" (red, dimmed — only shown if the user has enabled the low-liquidity filter). This answers the critical question: "even if the price is right, will anyone buy it?"

**What the user does NOT need to do:**
- Read numerical confidence scores to make a decision (the color does it)
- Expand details to evaluate most deals (the summary row has enough)
- Mentally calculate profit (it's pre-computed and displayed)
- Wonder if a card will actually sell (the liquidity badge tells them)
- Check system health manually (the footer tells them if something's wrong)

### Progressive Disclosure of Complexity

| Layer | What's Shown | When |
|---|---|---|
| **L1: Feed row** | Card image, name, profit, confidence bar, liquidity pill, condition, time | Always visible |
| **L2: Detail panel** | Full images, profit breakdown, confidence per-field, liquidity breakdown, CTA | On click |
| **L3: Match internals** | Candidate list, signal extraction, regex matches, raw eBay data | Expandable sections within detail panel |
| **L4: System diagnostics** | API credit usage, sync logs, error traces | Status bar expansion or separate admin view |

90% of user actions happen at L1 and L2. L3 is for investigating suspicious matches. L4 is for occasional health checks.

---

## Part 3: Mockup Guidance

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOP BAR                                                            │
│  [Logo/Name]  [Search............]  [Filters ▾]  [Lookup]  [👤⚙]   │
│  Active filters: [NM ×] [>20% ×] [High+Med confidence ×]           │
├───────────────────────────────────┬─────────────────────────────────┤
│                                   │                                 │
│  DEAL FEED (scrollable)           │  DETAIL PANEL (contextual)      │
│                                   │                                 │
│  ┌─────────────────────────────┐  │  ┌─────────────────────────┐    │
│  │ S  [img] Charizard ex #6   │  │  │  [Scrydex img] [eBay img]│   │
│  │    Obsidian Flames ◈       │  │  │                           │   │
│  │    £12.50 → £45.00         │  │  │  Charizard ex #006/197    │   │
│  │    +£32.50 (+260%) ██████  │  │  │  Obsidian Flames (sv3)    │   │
│  │    NM · High · 3m ago ↑7d │  │  │                           │   │
│  ├─────────────────────────────┤  │  │  eBay: £12.50 + £1.99    │   │
│  │ A  [img] Pikachu VMAX #44  │  │  │  Market: £45.00 (NM)     │   │
│  │    Vivid Voltage ◈         │  │  │  Profit: +£30.51 (210%)  │   │
│  │    £8.99 → £28.00          │  │  │                           │   │
│  │    +£19.01 (+211%) █████   │  │  │  Confidence: 0.92        │   │
│  │    NM · High · 7m ago →7d │  │  │  ████████████░░ 92%       │   │
│  ├─────────────────────────────┤  │  │  Name:   0.95 ████████░  │   │
│  │ B  [img] Mewtwo ex #58     │  │  │  Number: 1.00 █████████  │   │
│  │    Scarlet & Violet 151 ◈  │  │  │  Denom:  0.92 ████████░  │   │
│  │    £6.50 → £18.00          │  │  │  Expan:  0.88 ███████░░  │   │
│  │    +£11.50 (+176%) ████    │  │  │  Variant: 0.85 ██████░░  │   │
│  │    LP · Med · 12m ago ↓7d │  │  │                           │   │
│  ├─────────────────────────────┤  │  │  Liquidity: 0.78 High    │   │
│  │ C  [img] ...               │  │  │  Trend:  0.75 ███████░░  │   │
│  │    ...                     │  │  │  Supply: 0.90 ████████░  │   │
│  └─────────────────────────────┘  │  │  Sold:   0.67 ██████░░░  │   │
│                                   │  │                           │   │
│                                   │  │  [Open on eBay ▸]        │   │
│                                   │  │                           │   │
│                                   │  │  ── Match Details ──      │   │
│                                   │  │  ── Price Table ──       │   │
│                                   │  │  ── Trend Chart ──       │   │
│                                   │  │                           │   │
│                                   │  │  [✓ Correct] [✗ Wrong ▾] │   │
│                                   │  └─────────────────────────┘    │
├───────────────────────────────────┴─────────────────────────────────┤
│  FOOTER STATUS BAR                                                  │
│  ● Scanner: Running (2m) │ eBay: 1847/5000 │ Scrydex: 2340/50000  │
│  Index: 34,892 cards (2h) │ Deals: 47 today │ Accuracy: 91%        │
└─────────────────────────────────────────────────────────────────────┘
```

**Proportions:**
- Top bar: 48px fixed height
- Filter pills: 32px (collapses if none active)
- Deal feed: 60% width, full remaining height, scrollable
- Detail panel: 40% width, full remaining height, scrollable independently
- Footer: 36px fixed height
- When no deal is selected, the feed expands to full width

**Responsive behavior:**
- At narrow widths (<1024px): detail panel becomes a bottom sheet (slides up from bottom)
- At mobile widths (<768px): detail panel becomes a full-screen overlay with back button
- The deal feed rows compact further: image shrinks, expansion name hides, profit stays prominent

### Visual Priorities (What Draws Attention First)

Ordered by visual weight, heaviest first:

1. **Profit figures** — The green numbers. These are the largest, most saturated elements in each deal row. The eye goes here first.
2. **Tier badge** — The S/A/B/C letter in the left gutter. Uses size and color (S = gold, A = white, B = grey, C = faded).
3. **Card image** — The thumbnail. Humans process images faster than text. It confirms "yes, this is the card I think it is" instantly.
4. **Card name** — Bold, but secondary to profit. The user often recognizes the card from the image before reading the name.
5. **Confidence bar** — Peripheral. Small, horizontal, color-coded. You absorb it without focusing on it.
6. **Liquidity pill** — Same visual weight as confidence. A green "High" pill blends in (no friction). Amber or red draws the eye only when liquidity is a concern — you notice it when it matters.
7. **Everything else** — Condition, time, trend, expansion. Small, muted, scannable.

**The anti-pattern to avoid:** dashboards that give equal visual weight to every data point. If confidence, condition, expansion, profit, and card name are all the same size and color, the user has to actively read every field. Instead, profit screams, confidence whispers, and metadata is quiet.

### Theme Direction

**Tone:** Professional, dense, but not clinical. Think Bloomberg terminal meets modern fintech — information-rich but with clear hierarchy. Not playful or gamified, despite the Pokemon subject matter.

**Color philosophy:**

| Element | Color | Reasoning |
|---|---|---|
| Background | Dark grey (#0f1117) | Reduces eye strain for extended sessions, makes colored elements pop |
| Surface (cards, panels) | Slightly lighter grey (#1a1d27) | Creates depth without borders |
| Primary text | Near-white (#e0e0e6) | High contrast on dark |
| Secondary text | Mid-grey (#8b8fa3) | Expansion names, metadata |
| Profit (positive) | Green gradient (#22c55e → #16a34a) | Universal "good" signal, intensity scales with magnitude |
| Profit (negative/loss) | Muted red (#ef4444 at 70% opacity) | Visible but not alarming — losses aren't errors |
| S-tier accent | Warm gold (#f59e0b) | Premium, scarce, attention-grabbing |
| High confidence | Green (#22c55e) | Trust |
| Medium confidence | Amber (#f59e0b) | Caution |
| Low confidence | Red-orange (#ef4444) | Warning |
| High liquidity | Green (#22c55e) | Flips fast — same green as "trust" |
| Medium liquidity | Amber (#f59e0b) | Moderate flip time — same amber as "caution" |
| Low liquidity | Red-orange (#ef4444 at 80% opacity) | Slow flip — visible warning |
| Illiquid | Muted red (#ef4444 at 50% opacity) | May not sell — dimmed, de-emphasized |
| Interactive elements | Blue (#3b82f6) | Buttons, links, active states |
| Borders | Barely visible (#1f2937) | Structure without noise |

**Density:** High information density, but achieved through typography hierarchy and spacing — not cramming. Each deal row should be ~72px tall (image height + padding). The feed should show 8-10 deals without scrolling on a standard 1080p display.

**Typography:**
- System font stack (Inter if available, otherwise -apple-system, etc.)
- Deal card name: 14px semibold
- Profit: 16px bold (largest in row)
- Metadata: 12px regular, muted color
- Monospace for prices and numbers (tabular figures for alignment)

**No decorative elements.** No gradients on surfaces, no shadows deeper than 1px, no rounded corners beyond 6px, no card borders (use background color difference instead). The only visual flourishes are:
- The subtle highlight animation when a new deal arrives
- The confidence bars (thin, horizontal, segmented)
- The tier badge coloring

### Component Specifications for Mockup

#### Deal Feed Row
```
Height: 72px
Padding: 12px horizontal, 8px vertical
Layout: horizontal flex

[Tier Badge]  [Card Image]  [Text Block]  [Profit Block]  [Meta Block]
   32px           60px        flex-grow       120px            80px

Tier Badge: 24×24px circle or rounded square, centered letter
Card Image: 60×84px, rounded 4px, object-fit: cover, with 1px border (#1f2937)
Text Block:
  Line 1: Card name + " #" + number (14px semibold, primary color)
  Line 2: Expansion name with inline symbol icon (12px regular, muted)
Profit Block:
  Line 1: Absolute profit "£32.50" (16px bold, green gradient)
  Line 2: Percentage "+260%" (12px, same green but lighter)
  Line 3: Confidence bar (4px tall, 80px wide, segmented fill)
Meta Block:
  Line 1: Condition pill "NM" + Liquidity pill "High" (10px, pill backgrounds, side by side)
  Line 2: Time "3m ago" (12px, muted, red if >1h)
  Line 3: 7d trend arrow + % (12px, green up / red down / grey flat)
```

#### Detail Panel — Confidence Breakdown
```
Section: "Match Confidence"
Overall: Large ring or arc showing composite (e.g., 92%)

Per-field bars (stacked vertically):
  Name:        ████████████░░░  0.95
  Number:      ███████████████  1.00
  Denominator: ████████████░░░  0.92
  Expansion:   ██████████░░░░░  0.88
  Variant:     █████████░░░░░░  0.85
  Extraction:  ████████████░░░  0.90

Each bar: 200px wide, 8px tall, background #1f2937, fill color based on value
Label left-aligned (80px), bar center, value right-aligned
```

#### Detail Panel — Liquidity Breakdown
```
Section: "Liquidity"
Overall: Pill badge showing grade ("High" / "Med" / "Low" / "Illiquid") + score (e.g., 0.78)

Per-signal bars (stacked vertically, same layout as confidence):
  Trend:     ████████████░░░  0.75    (price movement activity)
  Prices:    ██████████░░░░░  0.50    (condition coverage)
  Spread:    ████████████░░░  0.80    (low/market ratio)
  Supply:    ██████████████░  0.90    (concurrent eBay listings)
  Sold:      █████████░░░░░░  0.67    (quantitySold from eBay)
  Velocity:  ░░░░░░░░░░░░░░░  —       (not fetched)
                                       [Fetch sales data ▸] (3 credits)

If velocity has been fetched:
  Velocity:  ███████████░░░░  0.85    (5 sales in 7d)

Bar styling: same as confidence bars (200px wide, 8px tall)
"Fetch sales data" button: small, inline, blue (#3b82f6), right-aligned
After fetch: bar fills in with animation, grade may update
```

#### Detail Panel — Price Comparison Table
```
┌──────────────────────────────────────────┐
│  Pricing Breakdown                       │
├──────────────┬──────────┬───────────────┤
│              │ eBay     │ Market Value  │
├──────────────┼──────────┼───────────────┤
│ Price        │ £12.50   │ $57.00 USD    │
│ Shipping     │ £1.99    │               │
│ Buyer Prot.  │ £0.98    │               │
│  ├ Flat fee  │  £0.10   │               │
│  └ 7% band   │  £0.88   │               │
│ FX Rate      │          │ ×0.789 GBP    │
├──────────────┼──────────┼───────────────┤
│ Total        │ £15.47   │ £44.97 GBP    │
├──────────────┴──────────┴───────────────┤
│ PROFIT       │ +£29.50 (+190%)          │
└──────────────────────────────────────────┘

Buyer Protection fee: eBay UK private seller fee.
£0.10 flat + 7% on first £20 + 4% on £20-£300 + 2% on £300-£4,000.
For a £12.50 item: £0.10 + (£12.50 × 7%) = £0.10 + £0.88 = £0.98
```

**Fee breakdown visibility:** The tiered sub-lines (flat fee, band breakdown) are shown by default but can be collapsed to a single "Buyer Prot." line via the `showBuyerProtectionFee` preference. The fee is **always** deducted in the profit calculation regardless of display preference.

#### Status Bar Segments
```
Height: 36px
Background: #0a0c10 (darker than main background)
Font: 12px monospace
Segments separated by thin vertical dividers

Each segment:
  [Status dot 6px ●] [Label: value]

Dot colors: green (#22c55e), amber (#f59e0b), red (#ef4444)
Text color: muted (#8b8fa3) for labels, primary (#e0e0e6) for values
```

#### Lookup Tool Overlay
```
Width: 640px centered, or 100% on mobile
Background: #1a1d27 with slight backdrop blur on the underlying feed

Top: Large input field with paste icon and placeholder "Paste eBay URL or Item ID..."
     Font size: 16px
     Height: 48px
     Auto-focus on open

Below input (after submission):
  Same layout as Deal Detail Panel, but wider (no side-by-side with feed)
  Additional expandable sections:
    ▸ Raw eBay Data
    ▸ All Candidates (10) — sortable table of scored candidates
    ▸ Signal Extraction Detail — what each regex matched
    ▸ Conflict Resolution Log — where title and structured data disagreed
```

### What NOT to Include in v1

- Collection tracking / portfolio features
- Historical deal analytics or "deals I've bought" tracking
- Multi-user dashboards (GitHub OAuth supports multiple users via allowlist, but v1 is single-user)
- Mobile app (responsive web is sufficient)
- Card price alerts / watchlists (future: catalog feature)
- Social features, sharing, community
- Onboarding / tutorial (the interface should be self-evident)

---

## Part 4: Backend Integration

This section maps the frontend to the backend API contract defined in `ARBITRAGE_SCANNER_REVIEW.md` §2.12. It covers authentication, data flow, SSE lifecycle, and deployment.

### Authentication: GitHub OAuth

The dashboard is a private interface — it requires a valid GitHub OAuth session to access all non-public endpoints. The public card catalog (§2.10) does not require authentication. See architecture doc §2.13 for the full backend implementation.

**First-visit flow:**
```
1. User opens the dashboard URL
2. Frontend makes a test request (GET /api/status) — the httpOnly session
   cookie is sent automatically by the browser
3. If 401 (no session or expired): redirect to /auth/github
4. GitHub OAuth flow: user approves → server issues JWT session cookie
5. Redirect back to dashboard → session cookie is now set
6. Dashboard loads normally — all API requests include the cookie automatically
```

**Subsequent visits:** The httpOnly session cookie (7-day expiry) is sent automatically by the browser on every request to the same origin. No localStorage token management needed. If any request returns 401 (session expired), redirect to `/auth/github` for re-authentication.

**SSE auth:** The `EventSource` API doesn't support custom headers, but it **does** send cookies automatically for same-origin requests. Since the session is a httpOnly cookie on the same origin, SSE authentication works out of the box: `GET /api/deals/stream` — no query parameter token needed.

**Login screen:** Instead of a password field, the login page shows a single "Sign in with GitHub" button. Clean, minimal, consistent with the dashboard's dark theme. The GitHub avatar and username are displayed in the top bar after login.

**Logout:** A "Sign out" option in the settings/gear menu calls `POST /auth/logout`, which clears the session cookie and redirects to the login page.

### Data Flow on Page Load

```
Page load
  │
  ├─ 1. Test session: GET /api/status
  │     ├── 200: session valid, continue
  │     └── 401: redirect to /auth/github (login page)
  │
  ├─ 2. Parallel fetch (session cookie sent automatically):
  │     ├── GET /api/deals?limit=50         → Populate deal feed
  │     ├── GET /api/status                 → Populate status bar
  │     ├── GET /api/preferences            → Apply default filters + settings
  │     └── GET /api/settings/api-keys      → Check API key status (setup mode?)
  │
  ├─ 3. If API keys not configured:
  │     └── Show setup wizard (Settings > API Keys) instead of deal feed
  │
  ├─ 4. Open SSE connection:
  │     GET /api/deals/stream  (session cookie sent automatically)
  │     ├── event: deal    → Append to deal feed (top), apply local filters
  │     ├── event: status  → Update status bar
  │     └── event: ping    → (keepalive, no UI action)
  │
  └─ 5. Dashboard is live
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
- During Railway redeploys (typically <10s), the user sees the status bar briefly show a yellow "Reconnecting..." indicator. Deals resume automatically once the new instance is up
- If the SSE connection fails for >30 seconds, show a persistent yellow banner: "Connection lost — reconnecting..." with a manual "Retry" button

### User Action → API Mapping

| User Action | API Call | Notes |
|---|---|---|
| Sign in | `GET /auth/github` → GitHub OAuth → `/auth/github/callback` | Redirects; sets httpOnly session cookie |
| Sign out | `POST /auth/logout` | Clears session cookie, redirects to login |
| Open dashboard | `GET /api/status`, `GET /api/deals`, `GET /api/preferences`, `GET /api/settings/api-keys` | Parallel on load; 401 → redirect to login |
| Deal feed streaming | `GET /api/deals/stream` (SSE) | Long-lived connection, cookie auth |
| Click a deal | `GET /api/deals/:dealId` | Full detail + audit data |
| Mark deal correct | `POST /api/deals/:dealId/review` `{ isCorrectMatch: true }` | |
| Mark deal wrong | `POST /api/deals/:dealId/review` `{ isCorrectMatch: false, incorrectReason: "..." }` | |
| Paste eBay URL for lookup | `POST /api/lookup` `{ ebayUrl: "..." }` | |
| Fetch sales velocity (detail panel) | `GET /api/deals/:dealId/liquidity` | Triggers Scrydex `/listings` call (3 credits). Updates liquidity breakdown inline |
| Change filter | None — client-side | Applied to in-memory deal list |
| Save filter as default | `PUT /api/preferences` `{ defaultFilters: {...} }` | Debounced 500ms |
| Change any preference | `PUT /api/preferences` `{ ... }` | Partial update, debounced |
| View API key status | `GET /api/settings/api-keys` | Shows connection status, never raw keys |
| Set/update Scrydex keys | `PUT /api/settings/api-keys/scrydex` | Encrypted storage in DB |
| Set/update eBay keys | `PUT /api/settings/api-keys/ebay` | Encrypted storage in DB |
| Test Scrydex connection | `POST /api/settings/api-keys/scrydex/test` | Validates with live API call |
| Test eBay connection | `POST /api/settings/api-keys/ebay/test` | Validates with OAuth token request |
| Test Telegram config | `POST /api/notifications/telegram/test` | Show success/fail inline |
| Load more deals (scroll) | `GET /api/deals?page=2&limit=50` | Append to feed |
| Search deals | `GET /api/deals?q=charizard` | Re-fetch with search param |
| Expand status bar section | No API call — data already in latest `status` event | |

### Deployment

The frontend is a **static SPA** (single-page application) served by the same Railway Node.js service that runs the backend. There is no separate frontend deployment.

```
pokesnipe (Railway service)
├── Backend: Express/Fastify API on PORT (Railway-injected)
│   ├── /auth/*          → GitHub OAuth login/callback/logout
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

**Environment-specific behavior:**
- **Production (Railway):** `NODE_ENV=production`, static files served with cache headers, SSE keepalive enabled
- **Development (local):** Frontend dev server (Vite/Next) proxies API requests to `localhost:3000`. `.env` file for secrets. Hot reload for UI changes
