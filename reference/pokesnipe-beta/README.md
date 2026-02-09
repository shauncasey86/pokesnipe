# 🎯 PokeSnipe

**Find underpriced Pokemon cards before anyone else.**

PokeSnipe is an automated arbitrage detection system that monitors eBay UK for Pokemon TCG deals in real-time. It cross-references listings against market prices from Scrydex to surface cards selling below their true value — so you can snipe them first.

![License](https://img.shields.io/badge/license-private-red)
![Node](https://img.shields.io/badge/node-20%2B-green)
![TypeScript](https://img.shields.io/badge/typescript-5.0-blue)

---

## ⚡ How It Works

```
eBay Listings → Smart Parser → Set Matcher → Price Lookup → Deal Detection
      ↓              ↓              ↓              ↓              ↓
   40 newest     Extract card    Match from     Get market    Surface cards
   per search    attributes      500+ sets      prices        below value
```

1. **Scans** eBay UK continuously using weighted search queries
2. **Parses** listing titles to extract card name, set, number, condition & variants
3. **Matches** cards to the correct expansion from 500+ Pokemon sets
4. **Prices** against real-time Scrydex market data
5. **Alerts** you to deals with configurable profit thresholds

---

## 🔥 Features

### Smart Scanning
- **60+ targeted search queries** — PSA 10s, alt arts, vintage holos, chase cards
- **Dynamic recent releases** — Auto-generates queries for sets released in last 90 days
- **Three search modes** — Dynamic weighted, custom terms, or recent listings
- **Credit-aware scheduling** — Automatically adjusts scan frequency to stay within budget

### Intelligent Parsing
- **Graded card detection** — PSA, CGC, BGS, SGC, TAG, and more with grade extraction
- **Variant recognition** — 1st Edition, Shadowless, Reverse Holo, Full Art, Alt Art
- **Fake card filtering** — Automatically skips custom, proxy, and replica listings
- **Condition mapping** — Maps eBay condition descriptors to NM/LP/MP/HP

### Deal Classification
| Tier | Min Value | Min Discount | Example |
|------|-----------|--------------|---------|
| 🏆 Premium | £1,000+ | 10%+ | PSA 10 Charizard at £900 (worth £1,100) |
| 🥇 High | £500+ | 15%+ | Alt Art Umbreon at £400 (worth £500) |
| ✅ Standard | Any | 20%+ | Base Set Holo at £40 (worth £55) |

### Dashboard
- **Real-time deal grid** with profit margins and tier badges
- **Featured opportunity** highlighting the best current deal
- **Live activity feed** showing scan results as they happen
- **One-click eBay links** to purchase deals instantly

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js 20+, Express, TypeScript |
| Database | PostgreSQL (deals, training, preferences) |
| Cache | Redis (API responses, rate limiting) |
| APIs | eBay Browse API, Scrydex Pricing API |
| Frontend | Vanilla JS with warm dark/light theme |

---

## 🚀 Quick Start

```bash
# Clone and install
git clone https://github.com/yourusername/pokesnipe.git
cd pokesnipe
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run in development
npm run dev

# Open http://localhost:3000
```

### Required API Keys

```env
# eBay Browse API
EBAY_CLIENT_ID=your_client_id
EBAY_CLIENT_SECRET=your_client_secret

# Scrydex Pricing API
SCRYDEX_API_KEY=your_api_key
SCRYDEX_TEAM_ID=your_team_id
```

### Optional Configuration

```env
# PostgreSQL (falls back to in-memory)
DATABASE_URL=postgres://...

# Redis (falls back to in-memory)
REDIS_URL=redis://...

# eBay Partner Network affiliate tracking
EPN_CAMPAIGN_ID=your_campaign_id
```

---

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scanner/status` | GET | Scanner stats and current query |
| `/api/scanner/start` | POST | Start automated scanning |
| `/api/scanner/stop` | POST | Stop scanning |
| `/api/arbitrage/deals` | GET | Fetch current opportunities |
| `/api/preferences` | GET/PUT | User settings |
| `/api/training/stats` | GET | Parser accuracy metrics |
| `/health` | GET | Service health check |

---

## ⚙️ Settings

### Scanner Modes
- **Both** — Scan for graded and ungraded cards
- **Graded Only** — Focus on PSA, CGC, BGS slabs
- **Raw Only** — Focus on ungraded singles by condition

### Search Types
- **Dynamic** — 60+ built-in weighted queries with auto-generated recent release searches
- **Custom** — Define your own search terms with weights
- **Recent Listings** — Monitor the 40 newest Buy It Now listings

### Configurable Options
- Grading companies to include (PSA, BGS, CGC, SGC, TAG)
- Grade range filters (1-10)
- Ungraded condition filters (NM, LP, MP, HP)
- Deal tier thresholds (value and discount %)
- Daily credit budget
- Operating hours schedule
- Display currency (GBP, USD, EUR)

---

## 💰 Credit Management

PokeSnipe is designed to maximize value from your Scrydex API allocation:

- **Monthly budget**: 50,000 credits
- **Daily budget**: Configurable (default 1,500)
- **Smart caching**: Reduces redundant API calls
- **Dynamic intervals**: Spreads scans evenly across operating hours
- **Query deduplication**: Avoids pricing the same card twice

---

## 🧪 Training System

The built-in training page (`/training.html`) helps improve parser accuracy:

1. Review listings where the parser struggled
2. Approve correct matches or flag errors
3. Build a training corpus for continuous improvement
4. Track match rates and parser performance

---

## 📝 License

Private — All rights reserved.

---

<p align="center">
  <b>Stop overpaying. Start sniping.</b>
</p>
