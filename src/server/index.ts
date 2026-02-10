import "dotenv/config";
import express from "express";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import authRoutes from "./routes/auth.js";
import dealsRoutes from "./routes/deals.js";
import preferencesRoutes from "./routes/preferences.js";
import lookupRoutes from "./routes/lookup.js";
import statusRoutes from "./routes/status.js";
import settingsRoutes from "./routes/settings.js";
import notificationsRoutes from "./routes/notifications.js";
import testRoutes from "./routes/test.js";
import { config } from "./config.js";
import { requireAuth } from "./services/auth.js";
import { pool } from "./db/pool.js";
import { getStatus } from "./services/statusService.js";
import { runFullSync } from "./services/syncService.js";
import { scanEbay } from "./services/scannerService.js";

const logger = pino({ name: "server" });

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
// Skip pinoHttp for SSE endpoint (logs noisy "request failed" for long-lived connections)
const httpLogger = pinoHttp({ logger });
app.use((req, res, next) => {
  if (req.path === "/api/deals/stream") return next();
  httpLogger(req, res, next);
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// SSE must be registered BEFORE the deals router (which has /:id that catches "stream")
const clients = new Set<express.Response>();
let lastEventId = 0;

const sendEvent = (res: express.Response, event: string, data: any, id?: number) => {
  try {
    if (id != null) res.write(`id: ${id}\n`);
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(res);
  }
};

app.get("/api/deals/stream", requireAuth, async (req, res) => {
  try {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders();
    const lastIdHeader = req.headers["last-event-id"];
    const lastId = lastIdHeader ? Number(lastIdHeader) : 0;
    if (lastId) {
      const { rows } = await pool.query(
        `SELECT d.event_id, d.id, d.ebay_url, d.ebay_title, d.ebay_image, d.ebay_price_gbp, d.ebay_shipping_gbp,
                d.market_price_usd, d.fx_rate, d.profit_gbp, d.profit_pct, d.confidence, d.liquidity, d.condition, d.tier,
                d.match_details, d.comps_by_condition, d.liquidity_breakdown,
                d.created_at, c.name as card_name, c.card_number, e.name as expansion_name, e.code
         FROM deals d
         JOIN cards c ON d.card_id = c.id
         JOIN expansions e ON c.expansion_id = e.id
         WHERE d.event_id > $1
         ORDER BY d.event_id ASC`,
        [lastId]
      );
      rows.forEach((row) => sendEvent(res, "deal", row, row.event_id));
    }
    sendEvent(res, "ping", { time: Date.now() });
    clients.add(res);
    const pingTimer = setInterval(() => {
      sendEvent(res, "ping", { time: Date.now() });
    }, 15000);
    req.on("close", () => {
      clearInterval(pingTimer);
      clients.delete(res);
    });
  } catch (err) {
    logger.error({ err }, "SSE stream setup failed");
    if (!res.headersSent) res.status(500).json({ error: "stream_error" });
  }
});

app.use("/auth", authRoutes);
app.use("/api/deals", dealsRoutes);
app.use("/api/preferences", preferencesRoutes);
app.use("/api/lookup", lookupRoutes);
app.use("/api/status", statusRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/test", testRoutes);

// Scanner pause/resume state
let scannerPaused = false;
let scanRunning = false;
let syncRunning = false;

app.get("/api/scanner/status", requireAuth, (_req, res) => {
  res.json({ paused: scannerPaused, scanRunning, syncRunning });
});

app.post("/api/scanner/toggle", requireAuth, (_req, res) => {
  scannerPaused = !scannerPaused;
  logger.info({ paused: scannerPaused }, "scanner toggled");
  res.json({ ok: true, paused: scannerPaused });
});

// Manual trigger: POST /api/scan (runs one eBay scan cycle)
app.post("/api/scan", requireAuth, async (_req, res) => {
  if (scanRunning) return res.json({ ok: false, error: "scan already in progress" });
  scanRunning = true;
  try {
    const before = (await pool.query("SELECT COUNT(*)::int as c FROM deals")).rows[0].c;
    await pool.query("INSERT INTO scanner_runs (status) VALUES ('running')");
    await scanEbay();
    const after = (await pool.query("SELECT COUNT(*)::int as c FROM deals")).rows[0].c;
    await pool.query(
      "UPDATE scanner_runs SET status='completed', finished_at=now(), deals_found=$1 WHERE id=(SELECT MAX(id) FROM scanner_runs)",
      [after - before]
    );
    res.json({ ok: true, deals_found: after - before });
  } catch (error: any) {
    await pool.query(
      "UPDATE scanner_runs SET status='failed', finished_at=now(), error=$1 WHERE id=(SELECT MAX(id) FROM scanner_runs)",
      [error.message]
    ).catch(() => {});
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    scanRunning = false;
  }
});

// Manual trigger: POST /api/sync (runs full Scrydex sync)
app.post("/api/sync", requireAuth, async (_req, res) => {
  if (syncRunning) return res.json({ ok: false, error: "sync already in progress" });
  syncRunning = true;
  try {
    await runFullSync();
    const cards = (await pool.query("SELECT COUNT(*)::int as c FROM cards")).rows[0].c;
    const exps = (await pool.query("SELECT COUNT(*)::int as c FROM expansions")).rows[0].c;
    res.json({ ok: true, cards, expansions: exps });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    syncRunning = false;
  }
});

const pollDeals = async () => {
  const { rows } = await pool.query(
    `SELECT d.event_id, d.id, d.ebay_url, d.ebay_title, d.ebay_image, d.ebay_price_gbp, d.ebay_shipping_gbp,
            d.market_price_usd, d.fx_rate, d.profit_gbp, d.profit_pct, d.confidence, d.liquidity, d.condition, d.tier,
            d.match_details, d.comps_by_condition, d.liquidity_breakdown,
            d.created_at, c.name as card_name, c.card_number, e.name as expansion_name, e.code
     FROM deals d
     JOIN cards c ON d.card_id = c.id
     JOIN expansions e ON c.expansion_id = e.id
     WHERE d.event_id > $1
     ORDER BY d.event_id ASC`,
    [lastEventId]
  );
  if (rows.length > 0) {
    lastEventId = rows[rows.length - 1].event_id;
    clients.forEach((res) => {
      rows.forEach((row) => sendEvent(res, "deal", row, row.event_id));
    });
  }
};

const broadcastStatus = async () => {
  const status = await getStatus();
  (status as any).scannerPaused = scannerPaused;
  clients.forEach((res) => sendEvent(res, "status", status));
};

setInterval(() => {
  pollDeals().catch((error) => logger.error({ error }, "poll deals failed"));
}, 5000);

setInterval(() => {
  broadcastStatus().catch((error) => logger.error({ error }, "status broadcast failed"));
}, 30000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.join(__dirname, "../client");

app.use(express.static(clientDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDir, "index.html"));
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "request failed");
  res.status(500).json({ error: "internal_error" });
});

app.listen(config.PORT, () => {
  logger.info(`PokeSnipe server listening on ${config.PORT}`);

  // Integrated worker: initial sync then scan every 5 min, resync every 24h
  (async () => {
    try {
      logger.info("starting initial Scrydex sync...");
      await runFullSync();
      logger.info("initial sync completed");
    } catch (error) {
      logger.error({ error }, "initial sync failed (will retry in 24h)");
    }

    // Scan every 5 minutes (respects pause)
    setInterval(() => {
      if (scannerPaused || scanRunning) return;
      scanRunning = true;
      const doScan = async () => {
        const { rows } = await pool.query("INSERT INTO scanner_runs (status) VALUES ('running') RETURNING id");
        const runId = rows[0].id as number;
        try {
          const before = (await pool.query("SELECT COUNT(*)::int as c FROM deals")).rows[0].c;
          await scanEbay();
          const after = (await pool.query("SELECT COUNT(*)::int as c FROM deals")).rows[0].c;
          await pool.query("UPDATE scanner_runs SET status='completed', finished_at=now(), deals_found=$2 WHERE id=$1", [runId, after - before]);
          logger.info({ runId, dealsFound: after - before }, "scan completed");
        } catch (error) {
          await pool.query("UPDATE scanner_runs SET status='failed', finished_at=now(), error=$2 WHERE id=$1", [runId, error instanceof Error ? error.message : "unknown"]).catch(() => {});
          logger.error({ error }, "scan failed");
        } finally {
          scanRunning = false;
        }
      };
      doScan();
    }, 1000 * 60 * 5);

    // Re-sync every 24 hours
    setInterval(() => {
      if (syncRunning) return;
      syncRunning = true;
      runFullSync()
        .then(() => logger.info("scheduled sync completed"))
        .catch((error) => logger.error({ error }, "scheduled sync failed"))
        .finally(() => { syncRunning = false; });
    }, 1000 * 60 * 60 * 24);
  })();
});
