# PokeSnipe Arbitrage Scanner (Production)

Production-ready arbitrage scanner with Scrydex-first card indexing, eBay scanning, and a live dashboard. Built for Railway deployment with a single web service and a worker service.

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

5. **Start the worker (separate terminal)**
   ```bash
   npm run build
   npm run start:worker
   ```

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
- `EBAY_REFRESH_TOKEN`
- `EXCHANGE_RATE_API_KEY`
- Optional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

Repeat the same environment variables for the **worker service** in step 5.

### 4) Set Build & Start Commands (Web)
Open your **web service** settings and set:
- **Build Command:** `npm run build`
- **Start Command:** `npm run start`

### 5) Add a Worker Service
1. Click **+ New** → **Service** → **Deploy from GitHub repo**
2. Select the same repo
3. Set:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm run start:worker`
4. Add the same environment variables as the web service

### 6) Run Migrations on Railway
In Railway **web service** → **Deployments** → **Run Command**:
```bash
npm run migrate:up
```

### 7) Confirm Deploy
1. Open the web service URL (Railway provides a domain)
2. Log in with `ACCESS_PASSWORD`
3. Confirm:
   - Card index syncs (worker logs show sync)
   - Deals appear in the feed (worker logs show eBay scan)

### 8) Redeploy After Updates
1. Push to GitHub: `git push`
2. Railway auto-deploys
3. If DB changes were made, rerun migrations:
   ```bash
   npm run migrate:up
   ```

### 9) Troubleshooting
- **App fails to boot** → Check logs for missing env vars
- **500 errors** → Ensure migrations ran and `DATABASE_URL` is correct
- **No deals** → Confirm worker service running and eBay credentials valid
- **No sync** → Confirm Scrydex credentials valid and worker logs show sync progress
- **SSE not live** → Browser must allow EventSource on same origin; check network tab

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
- Worker service for sync + scan. (`src/server/worker.ts`)
- Health check. (`src/server/index.ts`)

### UI Fidelity to mock-up.jsx
- Deal feed rows with tier badge, profit glow, confidence bar. (`src/client/App.tsx`, `src/client/styles/app.css`)
- Detail panel with profit hero + CTA. (`src/client/App.tsx`)
- Glass layout, fonts, gradient header line. (`src/client/styles/app.css`)
