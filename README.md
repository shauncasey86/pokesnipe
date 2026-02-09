# PokeSnipe Arbitrage Scanner (Production)

Production-ready arbitrage scanner with Scrydex-first card indexing, eBay scanning, and a live dashboard. Built for Railway deployment as a single service (web server + integrated worker).

## Local Developer Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create your env file**
   ```bash
   cp .env.example .env
   ```
   Fill in all required values.

3. **Run migrations**
   ```bash
   npm run migrate:up
   ```

4. **Start dev servers**
   ```bash
   npm run dev
   ```
   - API: http://localhost:3000
   - UI: http://localhost:5173

The worker (Scrydex sync + eBay scan) is integrated into the main server and starts automatically.

## GitHub Setup

```bash
# Initialize and push

git init

git add .

git commit -m "Initial production implementation"

git branch -M main

git remote add origin https://github.com/<your-org>/<your-repo>.git

git push -u origin main
```

## Railway Deployment (Beginner-Friendly Guide)

### 1) Create a Railway Project
1. Go to https://railway.app
2. **New Project** → **Deploy from GitHub repo**
3. Select your PokeSnipe repo

### 2) Add Postgres Plugin
1. Inside the Railway project, click **+ New**
2. Add **PostgreSQL**
3. Copy the **DATABASE_URL** from the Postgres service

### 3) Configure Environment Variables
In the **web service** (default service), add the variables from `.env.example`:
- `DATABASE_URL`
- `ACCESS_PASSWORD`
- `SESSION_SECRET`
- `SCRYDEX_API_KEY`
- `SCRYDEX_TEAM_ID`
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EXCHANGE_RATE_API_KEY`
- Optional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

### 4) Set Build & Start Commands
Open your service settings and set:
- **Build Command:** `npm run build`
- **Start Command:** `npm run start`

Migrations run automatically on startup. The worker (Scrydex sync + eBay scan) is integrated into the main server — no separate worker service needed.

### 5) Confirm Deploy
1. Open the service URL (Railway provides a domain)
2. Log in with `ACCESS_PASSWORD`
3. Run the API test suite (see below)
4. Confirm:
   - Card index syncs (logs show "initial sync completed")
   - Deals appear in the feed (logs show "scan completed")

### 6) Redeploy After Updates
Push to GitHub → Railway auto-deploys. Migrations run automatically on each startup.

### 7) Troubleshooting
- **App fails to boot** → Check logs for missing env vars
- **500 errors** → Ensure `DATABASE_URL` is correct (use public Railway Postgres URL, not internal)
- **No deals** → Confirm eBay credentials are valid using `/api/test/ebay`
- **No sync** → Confirm Scrydex credentials are valid using `/api/test/scrydex`
- **SSE not live** → Check browser network tab for `/api/deals/stream`
- **ECONNREFUSED localhost:5432** → Railway's `PGHOST`/`PGPORT` env vars override connection strings; the app handles this automatically

## API Test & Diagnostic Endpoints

All test endpoints require authentication (must be logged in).

### Test Endpoints (GET)

| Endpoint | Description |
|---|---|
| `/api/test` | Runs all connectivity tests (DB, exchange rate, Scrydex, eBay) |
| `/api/test/ebay` | Tests eBay OAuth + Browse API search, returns 3 sample listings |
| `/api/test/scrydex` | Tests Scrydex API, fetches expansions + first page of cards |
| `/api/test/exchange` | Tests exchange rate API, returns current USD→GBP rate |
| `/api/test/db` | Shows all database tables with row counts |

### Manual Triggers (POST)

| Endpoint | Description |
|---|---|
| `/api/sync` | Triggers a full Scrydex card index sync (expansions + all cards) |
| `/api/scan` | Triggers one eBay scan cycle (searches 4 query sets, matches and scores deals) |

**From browser console (must be logged in):**
```js
// Run all API tests
fetch("/api/test").then(r => r.json()).then(console.log)

// Test eBay specifically
fetch("/api/test/ebay").then(r => r.json()).then(console.log)

// Trigger Scrydex sync
fetch("/api/sync", {method: "POST"}).then(r => r.json()).then(console.log)

// Trigger eBay scan
fetch("/api/scan", {method: "POST"}).then(r => r.json()).then(console.log)
```

### Automated Worker Schedule

The integrated worker runs automatically after startup:
1. **On boot:** Full Scrydex sync (downloads all expansions + cards)
2. **Every 5 minutes:** eBay scan (4 query sets × 25 listings each)
3. **Every 24 hours:** Full Scrydex re-sync

## Acceptance Checklist

### Ground-Up Redesign Requirements
- Scrydex-first local card index with nightly sync via worker. (`src/server/services/syncService.ts`, `src/server/worker.ts`)
- Local matching by card number/name, no per-listing Scrydex calls. (`src/server/services/matcher.ts`)
- Buyer Protection fee included in profit calculation. (`src/server/services/pricing.ts`)
- Live deal feed (SSE) + initial load from REST. (`src/server/index.ts`, `src/client/App.tsx`)
- Manual listing lookup (POST /api/lookup). (`src/server/routes/lookup.ts`)

### Architecture Requirements
- PostgreSQL persistence + pg_trgm indexing. (`migrations/001_init.js`)
- Auth via password-protected session cookie. (`src/server/routes/auth.ts`)
- Encrypted API key storage. (`src/server/services/crypto.ts`, `src/server/routes/settings.ts`)
- Integrated worker for sync + scan. (`src/server/index.ts`, `src/server/services/syncService.ts`)
- Health check. (`src/server/index.ts`)

### UI Fidelity to mock-up.jsx
- Deal feed rows with tier badge, profit glow, confidence bar. (`src/client/App.tsx`, `src/client/styles/app.css`)
- Detail panel with profit hero + CTA. (`src/client/App.tsx`)
- Glass layout, fonts, gradient header line. (`src/client/styles/app.css`)
