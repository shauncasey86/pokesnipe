# PokéSnipe Arbitrage Scanner (Frontend)

A production-ready frontend for the PokéSnipe Arbitrage Scanner, built to mirror the ground-up redesign and the provided mock-up. The UI is a single-page React app that connects to the live backend (SSE + REST) for deals, lookup, and settings.

## Local Development (Quick Start)

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

> This frontend expects the backend to be running on the same origin (or proxied) with the API contract from `ARBITRAGE_SCANNER_REVIEW.md` (SSE + REST + OAuth).

## Build + Production (Local)

```bash
npm run build
npm run start
```

The production server will serve the built `dist/` bundle and bind to `process.env.PORT`.

---

# GitHub Setup (Repo Init + Push)

> Run these commands **from the project root**.

```bash
git init
git add .
git commit -m "Initial PokéSnipe Arbitrage Scanner prototype"
```

Create a GitHub repo (empty) and then:

```bash
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

---

# Railway Deployment (Beginner Step-by-Step)

## 1) Create a Railway Account + Project
1. Go to https://railway.app and sign in.
2. Click **“New Project”**.
3. Choose **“Deploy from GitHub Repo”**.

## 2) Connect Your GitHub Repo
1. Authorize Railway to access your GitHub account (if prompted).
2. Select the repo you just pushed.
3. Railway will create a new service automatically.

## 3) Configure Build + Start Commands
1. In your Railway project, click your **service**.
2. Open the **Settings** tab.
3. Under **Build Command**, enter:
   ```bash
   npm run build
   ```
4. Under **Start Command**, enter:
   ```bash
   npm run start
   ```

## 4) Set Environment Variables
1. Click the **Variables** tab in the service.
2. Click **“New Variable”**.
3. Add the required backend + auth variables (examples):
   - `NODE_ENV=production`
   - `SESSION_SECRET=<min-32-char-secret>`
   - `GITHUB_CLIENT_ID=<your-github-oauth-client-id>`
   - `GITHUB_CLIENT_SECRET=<your-github-oauth-client-secret>`
   - `ALLOWED_GITHUB_IDS=<comma-separated-github-user-ids>`
4. `PORT` is provided by Railway automatically (do not hardcode it).

## 5) Deploy + Find Your Public URL
1. Railway will auto-deploy on first connect.
2. Click the **Deployments** tab to watch build logs.
3. When the deployment finishes, click the **Domain** shown in the service to open the app.

---

# Redeploy After Updates

## Automatic (recommended)
Just push to `main`:

```bash
git add .
git commit -m "Update UI"
git push
```

Railway will detect the push and redeploy.

## Manual (if needed)
1. Open your Railway project.
2. Go to the **Deployments** tab.
3. Click **“Redeploy”**.

---

# GitHub OAuth Setup (Required)

You must configure a GitHub OAuth App so the login screen can authenticate.

1. Go to https://github.com/settings/developers and click **New OAuth App**.
2. Set **Application name** (e.g., “PokéSnipe Scanner”).
3. Set **Homepage URL** to your Railway domain (or `http://localhost:5173` for local).
4. Set **Authorization callback URL** to:
   ```
   https://<your-railway-domain>/auth/github/callback
   ```
   For local dev:
   ```
   http://localhost:5173/auth/github/callback
   ```
5. Save the app and copy the **Client ID** and **Client Secret**.
6. Add them to Railway variables (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) and to your local `.env` if you run the backend locally.

> If the login screen shows “Checking session…” with a JSON parse error, it usually means the backend is redirecting to GitHub OAuth or returning HTML instead of JSON. Confirm your OAuth app + env vars are set and the backend is running.

# Troubleshooting

## Build fails
- Open **Deployments → View Logs** in Railway and check the error output.
- Confirm you ran `npm install` locally and that `package.json` has the right scripts.

## App not reachable
- Ensure the server binds to `process.env.PORT` (this project does).
- Railway provides the port dynamically; do not hardcode it.

## Static assets not loading
- Ensure the build output is `dist/` and the server is serving it.
- This project uses an Express server that serves `dist/` for all routes.

---

# Notes
- This frontend expects a live backend implementing the API contract (SSE + REST + OAuth).
- It’s designed for a **single-service Railway deploy** and runs in any Node 18 environment.
