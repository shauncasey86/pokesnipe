import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pino from 'pino';
import { pool } from '../db/pool.js';
import { validate } from '../middleware/validation.js';

const log = pino({ name: 'preferences' });
const router = Router();

/**
 * GET /api/preferences — Get current preferences.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT data, updated_at FROM preferences WHERE id = 1',
    );

    if (rows.length === 0) {
      // Initialize if not exists
      await pool.query(
        "INSERT INTO preferences (id, data) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING",
      );
      return res.json({ data: {}, updatedAt: null });
    }

    return res.json({ data: rows[0].data, updatedAt: rows[0].updated_at });
  } catch (err) {
    log.error({ err }, 'Failed to fetch preferences');
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/preferences — Partial update (merge incoming JSON with existing).
 */
const prefsSchema = z.object({}).passthrough();

router.put('/', validate(prefsSchema), async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO preferences (id, data, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         data = preferences.data || $1,
         updated_at = NOW()
       RETURNING data, updated_at`,
      [JSON.stringify(req.body)],
    );

    log.info('Preferences updated');
    return res.json({ data: rows[0].data, updatedAt: rows[0].updated_at });
  } catch (err) {
    log.error({ err }, 'Failed to update preferences');
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;
