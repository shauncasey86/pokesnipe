import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error' });
  }
});

export default router;
