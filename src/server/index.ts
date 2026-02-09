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
import { config } from "./config.js";
import { requireAuth } from "./services/auth.js";
import { pool } from "./db/pool.js";
import { getStatus } from "./services/statusService.js";

const logger = pino({ name: "server" });

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp({ logger }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/api/deals", dealsRoutes);
app.use("/api/preferences", preferencesRoutes);
app.use("/api/lookup", lookupRoutes);
app.use("/api/status", statusRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/notifications", notificationsRoutes);

const clients = new Set<express.Response>();
let lastEventId = 0;

const sendEvent = (res: express.Response, event: string, data: any, id?: number) => {
  if (id != null) res.write(`id: ${id}\n`);
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

app.get("/api/deals/stream", requireAuth, async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
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
});
