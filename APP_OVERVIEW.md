# PokeSnipe v2 — Feature List & App Overview

> **Purpose:** This document is a complete specification for generating an HTML/CSS mockup of the PokeSnipe v2 dashboard. It describes every page, component, interaction, and data display in enough detail that a frontend developer (or Claude) can produce a faithful, self-contained HTML prototype.

---

## 1. App Identity

- **Name:** PokeSnipe
- **Tagline:** "Pokemon Card Arbitrage Scanner"
- **Purpose:** Monitors eBay UK for underpriced Pokemon trading cards by cross-referencing against Scrydex market data. Surfaces profitable buy opportunities in real-time.
- **Users:** Solo operator / small team of Pokemon TCG resellers
- **Market:** UK-focused (eBay UK, prices in GBP, sellers filtered to GB)
- **Design tone:** Dark-mode-first, data-dense but clean. Think Bloomberg terminal meets a collectibles dashboard. Professional, not playful.

---

## 2. Design System

### Colors (Dark Theme — Primary)
| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0a0a0f` | Page background |
| `--surface` | `#13131a` | Card/panel backgrounds |
| `--surface-hover` | `#1a1a24` | Hover states |
| `--border` | `#1e1e2a` | Subtle borders |
| `--border-strong` | `#2a2a3a` | Emphasized borders |
| `--ink` | `#e8e8ed` | Primary text |
| `--ink-muted` | `#8888a0` | Secondary text |
| `--ink-faded` | `#55556a` | Tertiary text |
| `--accent` | `#6366f1` | Primary accent (indigo) |
| `--accent-hover` | `#818cf8` | Accent hover |
| `--green` | `#22c55e` | Profit / success |
| `--green-bg` | `rgba(34,197,94,0.1)` | Green background |
| `--red` | `#ef4444` | Loss / error / danger |
| `--amber` | `#f59e0b` | Warning / medium confidence |
| `--tier-premium` | `#f59e0b` | Premium tier badge (gold) |
| `--tier-high` | `#6366f1` | High tier badge (indigo) |
| `--tier-standard` | `#64748b` | Standard tier badge (slate) |

### Colors (Light Theme)
| Token | Value |
|---|---|
| `--bg` | `#f8f9fa` |
| `--surface` | `#ffffff` |
| `--border` | `#e2e8f0` |
| `--ink` | `#1a1a2e` |
| `--ink-muted` | `#64748b` |

### Typography
- **Display/Headings:** `DM Sans`, 600-700 weight
- **Body:** `DM Sans`, 400-500 weight
- **Monospace/Data:** `JetBrains Mono`, 400-500 weight (prices, numbers, codes)
- **Base size:** 14px
- **Scale:** 12px (caption) / 13px (small) / 14px (body) / 16px (h4) / 20px (h3) / 24px (h2) / 28px (h1)

### Spacing
- `--space-xs`: 4px
- `--space-sm`: 8px
- `--space-md`: 12px
- `--space-lg`: 16px
- `--space-xl`: 24px
- `--space-2xl`: 32px
- `--space-3xl`: 48px

### Borders & Radii
- `--radius-sm`: 6px
- `--radius`: 8px
- `--radius-lg`: 12px
- `--radius-xl`: 16px

---

## 3. Page Structure

The app has **4 pages**:

1. **Dashboard** (`/`) — Main deal grid + scanner controls
2. **Settings** (`/settings`) — User preferences for filtering and thresholds
3. **Accuracy** (`/accuracy`) — Match accuracy tracking, review queue, and corpus stats
4. **Catalog** (`/catalog`) — Browse synced Scrydex expansion catalog

---

## 4. Global Layout

### Header (sticky, top)

```
┌─────────────────────────────────────────────────────────────────────┐
│ PokeSnipe   Dashboard  Settings  Accuracy  Catalog    [Search] [▶] │
│                                                        [🌙]   [●]  │
└─────────────────────────────────────────────────────────────────────┘
```

- **Logo:** "PokeSnipe" in DM Sans 700, accent color
- **Navigation:** 4 text links, active state = accent underline
- **Search bar:** Input field + "Find" button — manual eBay search
- **Scanner toggle:** Button that reads "Start Scanner" (idle) or "Stop Scanner" (running), with accent/danger color respectively
- **Theme toggle:** Sun/moon icon button
- **Status indicator:** Small dot + text: "Idle" (gray), "Scanning..." (green pulse), "Rate Limited" (amber), "Error" (red)

### Footer (sticky, bottom)

```
┌─────────────────────────────────────────────────────────────────────┐
│ eBay: ●OK  │  Rate: $1.27/£ ●  │  API: 1,240/50,000  │  Today: 312│
│ Next Scan: 8m 23s  │  Query: "PSA 10 Charizard"  │  [📊] [📋] [🗑]│
└─────────────────────────────────────────────────────────────────────┘
```

- **eBay status:** Green dot + "OK" or amber + "Rate Limited" with remaining time
- **Exchange rate:** Current USD/GBP rate with live/stale indicator dot
- **API usage:** Monthly Scrydex credits used / total
- **Today count:** Credits consumed today
- **Next scan:** Countdown timer to next scan
- **Next query:** Shows the search query that will be used next
- **Action buttons:** Diagnostics panel toggle, Activity log toggle, Clear all deals button

---

## 5. Dashboard Page (Main)

### 5.1 Stats Bar

Horizontal row of 4-5 key metrics, directly below the header:

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ 12       │ │ £847     │ │ 31%      │ │ 78%      │ │ 3 Premium    │
│ Active   │ │ Total    │ │ Avg      │ │ Match    │ │ 5 High       │
│ Deals    │ │ Profit   │ │ Discount │ │ Rate     │ │ 4 Standard   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘
```

- **Active Deals:** Count of currently displayed deals
- **Total Potential Profit:** Sum of all active deal profits (GBP)
- **Avg Discount:** Mean discount percentage across active deals
- **Match Rate:** Percentage of scanned listings that resulted in a Scrydex match (from diagnostics)
- **Tier Breakdown:** Count per tier (Premium/High/Standard), each with its tier color

### 5.2 Featured Deal (Optional — shown when a Premium tier deal exists)

Full-width card highlighting the best current opportunity:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ★ Best Opportunity                                                  │
│ ┌─────────┐                                                         │
│ │         │  Charizard ex                                           │
│ │  [IMG]  │  Obsidian Flames • #006/197 • PSA 10                   │
│ │         │                                                         │
│ │  -42%   │  eBay: £320.00 + £4.99 shipping                       │
│ └─────────┘  Market Value: £564.00                                 │
│              Profit: +£239.01    Margin: 42.4%                     │
│                                                                     │
│              [View on eBay →]                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Toolbar

Controls for filtering and viewing deals:

```
┌─────────────────────────────────────────────────────────────────────┐
│ [All] [Premium] [High] [Standard]  │  [All Cards] [Raw] [Graded]  │
│                                    │  12 opportunities    [⊞] [☰] │
└─────────────────────────────────────────────────────────────────────┘
```

- **Tier filter buttons:** All / Premium / High / Standard (toggle, one active)
- **Type filter buttons:** All Cards / Raw / Graded (toggle, one active)
- **Deal count:** "{n} opportunities"
- **View toggle:** Grid view / Table view icons

### 5.4 Deal Grid (Default View)

Responsive CSS grid of deal cards. 4 columns on desktop, 2 on tablet, 1 on mobile.

**Individual Deal Card:**

```
┌────────────────────────────┐
│ [Card Image]        -31%   │
│                   PREMIUM  │
│                            │
│ Umbreon VMAX               │
│ Evolving Skies • #215/203  │
│ PSA 10                     │
│ ┌────────────────────────┐ │
│ │ eBay     │    £420.00  │ │
│ │ Market   │    £612.00  │ │
│ │ Profit   │   +£192.00  │ │
│ └────────────────────────┘ │
│                            │
│ ● 92% confidence           │
│ Seller: card_king (99.8%)  │
│                            │
│ [View on eBay →]           │
└────────────────────────────┘
```

**Card component details:**
- **Image:** Card image from Scrydex (150-200px height), with lazy loading
- **Discount badge:** Top-right overlay, green background, white text, shows "-{discount}%"
- **Tier badge:** Below discount badge, colored per tier (Premium=gold, High=indigo, Standard=slate)
- **Card name:** Bold, 16px, DM Sans 600
- **Expansion + Number:** Muted text, with expansion logo icon if available
- **Condition:** "PSA 10" or "Raw NM" or "CGC 9.5" etc.
- **Price breakdown:** 3-row mini table with monospace values
  - eBay price (ink-muted)
  - Market value (ink)
  - Profit (green, bold)
- **Confidence indicator:** Small dot (green ≥0.85, amber 0.65-0.84, red <0.65) + percentage
- **Seller info:** Username + feedback percentage
- **CTA button:** "View on eBay →", accent colored, full-width at bottom of card
- **Click anywhere on card** → opens detail modal

### 5.5 Deal Table (Alternative View)

Compact table for scanning many deals quickly:

| Card | Expansion | # | Condition | Cost | Market | Profit | Margin | Confidence | |
|---|---|---|---|---|---|---|---|---|---|
| Charizard ex | Obsidian Flames | 006/197 | PSA 10 | £320 | £564 | +£244 | 43% | 94% | [eBay →] |
| Umbreon VMAX | Evolving Skies | 215/203 | Raw NM | £420 | £612 | +£192 | 31% | 87% | [eBay →] |

- Sortable columns (click header to sort)
- Row click → opens detail modal
- Profit column green-colored
- Confidence column color-coded (green/amber/red)

### 5.6 Deal Detail Modal

Opens when clicking a deal card. Two-column layout:

**Left column (sidebar):**
- Card reference image (large, from Scrydex)
- **Confidence gauge:** Circular SVG gauge showing composite confidence score
  - Ring color: green (≥85%), amber (65-84%), red (<65%)
  - Percentage text in center
  - Below gauge: confidence breakdown table:
    - Expansion: 95%
    - Card Number: 98%
    - Name Match: 87%
    - Variant: 80%
    - Overall: 89%
- **Seller info section:**
  - Username
  - Feedback score + percentage
  - Location / Country
- **Actions:**
  - "Report Wrong Match" button → reveals reason selection grid:
    - Card Name
    - Card Number
    - Set/Expansion
    - Condition
    - Wrong Card
    - Wrong Price
    - Incorrect Language
    - Price Discrepancy
  - "Mark as Sold" button → removes from dashboard

**Right column (main info):**
- **Card name** (h2, bold)
- **Meta line:** Expansion logo + expansion name + card number + release year
- **eBay listing title** (verbatim, muted, smaller text — shows what the seller actually wrote)
- **CTA button:** "View on eBay →" (large, prominent, accent color)
- **The Opportunity section:**
  - Total Cost card (eBay price + shipping breakdown)
  - Market Value card (with condition label)
  - Profit result (large green number)
  - Margin result (percentage)
- **Market Prices section:**
  - **Raw Prices:** Grid of condition tiers (NM / LP / MP / HP) with market price for each
  - **Graded Prices:** Tabbed by grading company (PSA / CGC / BGS). Shows grade → price table for selected company

### 5.7 Activity Log Panel (Slide-in sidebar)

Toggled from footer. Shows real-time scan activity:

```
┌────────────────────────────────────┐
│ Scan Activity        [Clear] [×]  │
│───────────────────────────────────│
│ 14:32:01 Scanning "PSA 10 Chari..│
│ 14:32:03 40 listings fetched      │
│ 14:32:04 Matched: Charizard #6    │
│ 14:32:04 Deal found! +£192 (High)│
│ 14:32:05 12 skipped (low conf.)   │
│ 14:31:12 Scanning "Alt Art Umbr..│
│ ...                               │
└────────────────────────────────────┘
```

- Newest entries at top
- Color-coded: deals = green, errors = red, info = muted
- Max 100 entries, auto-scrolling
- Clear button to reset

### 5.8 Diagnostics Panel (Slide-in sidebar)

Toggled from footer. Shows pipeline match diagnostics:

```
┌────────────────────────────────────┐
│ Match Diagnostics   [Copy] [↺] [×]│
│───────────────────────────────────│
│ [Session (24 scans)] [Last Scan]  │
│                                    │
│   42%        960      403     12   │
│   Match      Scanned  Matched Deals│
│   Rate                             │
│                                    │
│ Failure Breakdown:                 │
│ Low Confidence   ███████░░░  234   │
│ No Set Match     █████░░░░░  156   │
│ No Card Number   ████░░░░░░  102   │
│ Scrydex Not Found██░░░░░░░░   48   │
│ Name Mismatch    █░░░░░░░░░   17   │
│ No Price Data    ░░░░░░░░░░    0   │
│ Non-English      ██░░░░░░░░   45   │
│ Below Min Profit █░░░░░░░░░    8   │
└────────────────────────────────────┘
```

- Two tabs: "Session" (cumulative) and "Last Scan" (most recent only)
- Summary stats: Match Rate, Scanned, Matched, Deals
- Horizontal bar chart showing failure reasons
- Copy JSON button for export
- Reset button to clear session stats

### 5.9 Empty State

Shown when no deals exist:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                         📋                                          │
│                                                                     │
│              No opportunities yet                                   │
│     Start the scanner to find underpriced cards on eBay             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Settings Page

### 6.1 Card Condition Filters

```
Ungraded Condition Filters
Which conditions to include for raw (ungraded) cards

[✓] Near Mint (NM)
[✓] Lightly Played (LP)
[✓] Moderately Played (MP)
[ ] Heavily Played (HP)
[ ] Damaged (DM)
```

### 6.2 Grading Preferences

```
Preferred Grading Companies
Only show graded cards from these companies

[✓] PSA
[✓] CGC
[✓] BGS
[ ] SGC
[ ] TAG
[ ] Other

Grade Range
Minimum: [1] ——●———— Maximum: [10]
```

### 6.3 Profit & Tier Thresholds

```
Minimum Profit
Only show deals with at least this much profit

£ [5.00]

Deal Tier Thresholds

PREMIUM    Min Value: £[1000]    Min Discount: [10]%
HIGH       Min Value: £[500]     Min Discount: [15]%
STANDARD   Min Value: £[0]      Min Discount: [20]%
```

### 6.4 Scanner Settings

```
Daily Credit Budget: [1500]
Operating Hours: [06:00] to [23:00]
Listings Per Scan: [40]
Deal Expiration: [48] hours
```

### 6.5 Notifications

```
Telegram Notifications
[ ] Enable Telegram alerts for new deals
Bot Token: [________________]
Chat ID:   [________________]

Notify for:
[✓] Premium tier deals
[✓] High tier deals
[ ] Standard tier deals
```

All settings have a "Save" button and a "Reset to Defaults" button per section.

---

## 7. Accuracy Page (NEW — doesn't exist in beta)

This is the key new page that enables the accuracy measurement loop.

### 7.1 Accuracy Overview

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ 87.3%    │ │ 92.1%    │ │ 412      │ │ 23       │ │ 389          │
│ Overall  │ │ Auto     │ │ Total    │ │ Pending  │ │ Verified     │
│ Accuracy │ │ Accuracy │ │ Reviewed │ │ Review   │ │ Correct      │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘
```

- **Overall Accuracy:** Combined manual + automated accuracy rate
- **Auto Accuracy:** From automated cross-checks (item specifics validation)
- **Total Reviewed:** Number of deals that have been manually reviewed
- **Pending Review:** Deals waiting for human verification
- **Verified Correct:** Count of confirmed-correct matches

### 7.2 Confidence Calibration Chart

Visual showing whether confidence scores are well-calibrated:

```
Confidence vs Actual Accuracy

100% │                                    ●
     │                              ●
 80% │                        ●
     │                  ●
 60% │            ●
     │      ●
 40% │ ●
     │
 20% │
     └────────────────────────────────────
     20%  30%  40%  50%  60%  70%  80%  90%+
                 Confidence Bucket

     ─── Ideal (x=y)    ● Actual
```

- X-axis: confidence score buckets
- Y-axis: actual accuracy within that bucket (from reviewed deals)
- Diagonal line = perfect calibration
- Points above the line = under-confident, below = over-confident

### 7.3 Review Queue

Table of deals pending manual review:

| eBay Title | Matched Card | Expansion | Confidence | Found At | Action |
|---|---|---|---|---|---|
| "PSA 10 Charizard Base Set 4/102 Holo" | Charizard | Base Set | 91% | 2h ago | [✓ Correct] [✗ Wrong] |
| "Umbreon VMAX Alt Art 215/203 ES" | Umbreon VMAX | Evolving Skies | 72% | 4h ago | [✓ Correct] [✗ Wrong] |

- Clicking "Wrong" reveals a dropdown for the reason (same as modal: card name, number, set, condition, wrong card, wrong price)
- Clicking "Correct" marks the deal as verified correct
- Prioritized: lowest confidence deals shown first (most likely to be wrong)
- Filter: Show only deals below a confidence threshold

### 7.4 Failure Analysis

Table showing the most common failure patterns:

```
Top Failure Reasons (Last 7 Days)

1. No Set Match          1,245 listings (34%)
   Most common title patterns:
   - "Pokemon card 123/456" (no set name mentioned)
   - "PSA 10 Charizard (no number)"

2. Scrydex Not Found       892 listings (24%)
   Top failing expansions:
   - SV Black Star Promos (SVP) — 234 failures
   - McDonald's Collection — 156 failures

3. Low Confidence           567 listings (15%)
   Avg confidence of rejected: 22%
```

### 7.5 Regression Corpus Stats

```
Match Corpus: 247 entries
Coverage:
  WOTC era:     34 entries
  EX era:       18 entries
  Modern (SV):  89 entries
  Graded:       62 entries
  Promos:       23 entries
  Subset (TG):  21 entries

Last run: 2 minutes ago
Result: 214/247 correct (86.6%) ✓ PASSING
```

---

## 8. Catalog Page (NEW — doesn't exist in beta)

Browse the synced expansion catalog to verify coverage.

### 8.1 Expansion Browser

```
┌──────────────────────────────────────────────────────┐
│ Search expansions...                                  │
│                                                       │
│ Series: [All] [Scarlet & Violet ▾] [Sword & Shield ▾]│
│ Language: [English] [Japanese]                        │
└──────────────────────────────────────────────────────┘

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ [Logo]   │ │ [Logo]   │ │ [Logo]   │ │ [Logo]   │
│ Surging  │ │ Stellar  │ │ Shrouded │ │ Twilight │
│ Sparks   │ │ Crown    │ │ Fable    │ │ Masquerade│
│ SV08     │ │ SV07     │ │ SV6.5    │ │ SV06     │
│ 191 cards│ │ 175 cards│ │ 99 cards │ │ 167 cards│
│ 2024     │ │ 2024     │ │ 2024     │ │ 2024     │
│ Synced ✓ │ │ Synced ✓ │ │ Synced ✓ │ │ Synced ✓ │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

- Grid of expansion cards with logo, name, code, card count, release date
- "Synced" indicator shows if expansion is in local database
- Click expansion → shows card list within that expansion (from Scrydex)
- Search bar filters by name
- Series filter dropdown
- "Last synced: 3 hours ago" + "Sync Now" button

### 8.2 Sync Status

```
Catalog Sync Status
Last sync: 2024-01-15 06:00:00
Expansions: 312 (English) / 298 (Japanese)
New since last sync: 2 (Journey Together, Destined Rivals)
Aliases: 45 custom mappings
Next auto-sync: in 18 hours

[Sync Now]
```

---

## 9. Responsive Behavior

| Breakpoint | Layout |
|---|---|
| ≥1200px (desktop) | 4-column deal grid, full sidebar panels |
| 900-1199px (tablet landscape) | 3-column deal grid, overlay panels |
| 600-899px (tablet portrait) | 2-column deal grid, full-width modal |
| <600px (mobile) | 1-column deal grid, stacked modal, hamburger nav |

- Stats bar wraps to 2 rows on tablet, stacks vertically on mobile
- Footer stats collapse to essential-only (eBay status + next scan) on mobile
- Modal switches from 2-column to stacked layout below 768px
- Table view hidden on mobile (only grid available)

---

## 10. Interaction Patterns

### Scanner Control
- Click "Start Scanner" → button turns red, text changes to "Stop Scanner"
- Status dot pulses green while scanning
- Footer countdown shows time until next scan
- After each scan, deal grid updates with any new deals (animated entry)

### Deal Cards
- Hover → subtle border highlight + slight lift (translateY -2px)
- Click → opens detail modal with slide-in animation
- New deals animate in with a fade + scale-up effect
- Expiring deals (>24h old) show a subtle amber border

### Filtering
- Tier filter buttons are pill-shaped toggles
- Active filter has accent background
- Changing filter immediately hides/shows deals with a fade transition
- Deal count updates in toolbar

### Theme Toggle
- Click moon icon → switches to light theme
- Persisted to localStorage
- Smooth transition on all color properties (200ms)

### Toast Notifications
- Appear bottom-right
- Auto-dismiss after 5 seconds
- Types: success (green), error (red), info (accent), warning (amber)
- Used for: "Deal found!", "Scanner started", "Settings saved", "Match reported"

---

## 11. Data Flow Summary

```
Scanner Start → eBay API Poll → Title Parse + Structured Extract →
Signal Merge → Expansion Resolve → Card Resolve → Name Validate →
Variant Resolve → Confidence Score → Price Calc → Tier Classify →
Deal Store → Dashboard Update → [User clicks] → eBay Purchase
                                              → [Report Wrong] → Accuracy DB
```

---

## 12. Key Differences from Beta Dashboard

| Feature | Beta | v2 |
|---|---|---|
| Confidence display | Single parse confidence % | Composite score with breakdown gauge |
| Confidence badges on cards | None | Color-coded dot + percentage |
| Accuracy page | None | Full review queue + calibration chart |
| Catalog page | None | Browsable expansion catalog with sync status |
| Tier filters | "High Value" / "Moderate" | Premium / High / Standard (matching backend tiers) |
| Stats bar | None (only in footer) | Dedicated stats row with match rate |
| Seller info on cards | None (only in modal) | Username + feedback on card face |
| Wrong match reporting | Basic button in modal | Categorized reasons with accuracy tracking |
| Deal confidence gating | All deals shown equally | Low-confidence deals flagged with warning badge |
| Activity log | Basic text log | Color-coded, timestamped entries |
| Diagnostics | Basic bar chart | Session/scan tabs with failure breakdown |
| Empty state | Static message | Animated illustration + CTA |
| Table view | Basic table | Sortable columns with inline confidence |

---

## 13. Component Inventory

For the HTML mockup, these are all the distinct components needed:

### Global
- [ ] Header with nav, search, scanner toggle, theme toggle, status indicator
- [ ] Footer with stats bar and action buttons
- [ ] Toast notification container
- [ ] Theme toggle (dark/light CSS variables)

### Dashboard
- [ ] Stats bar (5 metric cards)
- [ ] Featured deal card (full-width)
- [ ] Toolbar (filter buttons, view toggle, count)
- [ ] Deal card (grid item)
- [ ] Deal table row
- [ ] Deal detail modal (two-column with confidence gauge)
- [ ] Activity log panel (slide-in)
- [ ] Diagnostics panel (slide-in)
- [ ] Empty state

### Settings
- [ ] Section card with title
- [ ] Checkbox group (conditions, grading companies)
- [ ] Range slider (grade range)
- [ ] Number input (profit, thresholds)
- [ ] Time input (operating hours)
- [ ] Toggle switch (notifications)
- [ ] Save / Reset buttons

### Accuracy
- [ ] Stats overview (5 metric cards)
- [ ] Confidence calibration chart (SVG or CSS)
- [ ] Review queue table with action buttons
- [ ] Failure analysis breakdown
- [ ] Corpus stats panel

### Catalog
- [ ] Search + filter bar
- [ ] Expansion card (grid item with logo)
- [ ] Sync status panel

---

## 14. Sample Data for Mockup

Use these example deals to populate the mockup:

### Deal 1 (Premium)
- Card: Charizard ex
- Expansion: Obsidian Flames
- Number: 006/197
- Condition: PSA 10
- eBay Price: £320.00
- Shipping: £4.99
- Market Value: £564.00
- Profit: +£239.01
- Discount: 42%
- Confidence: 94%
- Seller: pokemon_grails_uk (99.8%)

### Deal 2 (High)
- Card: Umbreon VMAX
- Expansion: Evolving Skies
- Number: 215/203
- Condition: Raw NM
- eBay Price: £185.00
- Shipping: Free
- Market Value: £295.00
- Profit: +£110.00
- Discount: 37%
- Confidence: 89%
- Seller: tcg_deals (99.2%)

### Deal 3 (High)
- Card: Lugia V Alt Art
- Expansion: Silver Tempest
- Number: 186/195
- Condition: CGC 9.5
- eBay Price: £210.00
- Shipping: £3.50
- Market Value: £340.00
- Profit: +£126.50
- Discount: 37%
- Confidence: 91%
- Seller: card_castle (98.5%)

### Deal 4 (Standard)
- Card: Pikachu VMAX
- Expansion: Vivid Voltage
- Number: 044/185
- Condition: Raw NM
- eBay Price: £28.00
- Shipping: £1.50
- Market Value: £42.00
- Profit: +£12.50
- Discount: 30%
- Confidence: 86%
- Seller: quick_cards (97.1%)

### Deal 5 (Standard, Low Confidence)
- Card: Mew ex
- Expansion: Pokemon 151
- Number: 151/165
- Condition: Raw LP
- eBay Price: £18.50
- Shipping: £2.00
- Market Value: £31.00
- Profit: +£10.50
- Discount: 34%
- Confidence: 68% (medium — flagged)
- Seller: hobby_finds (96.3%)

### Deal 6 (Premium)
- Card: Base Set Charizard
- Expansion: Base Set
- Number: 4/102
- Condition: PSA 9
- eBay Price: £480.00
- Shipping: Free
- Market Value: £820.00
- Profit: +£340.00
- Discount: 41%
- Confidence: 96%
- Seller: vintage_pokemon_uk (99.9%)
