# PokéSnipe Arbitrage Scanner (Prototype)

A front-end prototype for the PokéSnipe Arbitrage Scanner, built to mirror the ground-up redesign and the provided mock-up. The UI is a single-page React app with mocked data and simulated live updates.

## Local Development (Quick Start)

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

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

## 4) Set Environment Variables (if needed)
1. Click the **Variables** tab in the service.
2. Click **“New Variable”**.
3. Add any needed key/value pairs (example placeholders):
   - `NODE_ENV=production`
   - `PORT` is provided by Railway automatically (do not hardcode it).

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
- This is a **frontend prototype** with mocked data to demonstrate the UI/UX flows.
- It’s designed for a **single-service Railway deploy** and runs in any Node 18 environment.
