import { Router, Request, Response } from 'express';
import { EventEmitter } from 'events';
import pino from 'pino';
import { pool } from '../db/pool.js';

const log = pino({ name: 'sse' });
const router = Router();

/**
 * Global event emitter for SSE.
 * The scanner emits 'deal' events when new deals are created.
 * All SSE connections listen and forward to clients.
 */
export const sseEmitter = new EventEmitter();
sseEmitter.setMaxListeners(100);

/**
 * GET /api/deals/stream — SSE endpoint for live deal updates.
 *
 * Events:
 *   deal    — New deal created (full deal JSON)
 *   status  — System status update (every 30s)
 *   :ping   — Keepalive comment (every 15s)
 *
 * Supports Last-Event-Id for replay on reconnect.
 */
router.get('/stream', async (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  log.info('SSE client connected');

  // Replay missed events if Last-Event-Id is provided
  const lastEventId = req.headers['last-event-id'];
  if (lastEventId) {
    try {
      const eventId = parseInt(lastEventId as string);
      if (!isNaN(eventId)) {
        const { rows } = await pool.query(
          `SELECT deal_id, event_id, ebay_title, tier, profit_gbp, profit_percent,
                  confidence, condition, ebay_image_url, ebay_url, created_at
           FROM deals
           WHERE event_id > $1
           ORDER BY event_id ASC`,
          [eventId],
        );
        for (const deal of rows) {
          res.write(`event: deal\nid: ${deal.event_id}\ndata: ${JSON.stringify(deal)}\n\n`);
        }
        log.info({ lastEventId: eventId, replayed: rows.length }, 'Replayed missed events');
      }
    } catch (err) {
      log.error({ err }, 'Failed to replay SSE events');
    }
  }

  // Listen for new deal events
  const onDeal = (deal: any) => {
    res.write(`event: deal\nid: ${deal.eventId}\ndata: ${JSON.stringify(deal)}\n\n`);
  };
  sseEmitter.on('deal', onDeal);

  // Keepalive ping every 15 seconds
  const pingInterval = setInterval(() => {
    res.write(':ping\n\n');
  }, 15_000);

  // Status update every 30 seconds
  const statusInterval = setInterval(async () => {
    try {
      const { rows } = await pool.query(
        "SELECT COUNT(*) as active FROM deals WHERE status = 'active'",
      );
      const statusData = {
        activeDeals: parseInt(rows[0].active),
        timestamp: new Date().toISOString(),
      };
      res.write(`event: status\ndata: ${JSON.stringify(statusData)}\n\n`);
    } catch {
      // Silently skip status on error
    }
  }, 30_000);

  // Cleanup on disconnect
  req.on('close', () => {
    sseEmitter.off('deal', onDeal);
    clearInterval(pingInterval);
    clearInterval(statusInterval);
    log.info('SSE client disconnected');
  });
});

export default router;
