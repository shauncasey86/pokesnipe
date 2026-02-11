import { pool } from '../../db/pool.js';
import pino from 'pino';
import { sendAlert } from '../notifications/telegram.js';

const log = pino({ name: 'accuracy' });

export interface AccuracyStats {
  rolling7d: number | null;     // percentage, e.g. 91.2
  totalReviewed: number;
  totalCorrect: number;
  totalIncorrect: number;
  incorrectReasons: Record<string, number>;
}

/**
 * Get accuracy statistics from reviewed deals.
 */
export async function getAccuracyStats(): Promise<AccuracyStats> {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE reviewed_at > NOW() - INTERVAL '7 days') as reviewed_7d,
      COUNT(*) FILTER (WHERE reviewed_at > NOW() - INTERVAL '7 days' AND is_correct_match = true) as correct_7d,
      COUNT(*) FILTER (WHERE is_correct_match IS NOT NULL) as total_reviewed,
      COUNT(*) FILTER (WHERE is_correct_match = true) as total_correct,
      COUNT(*) FILTER (WHERE is_correct_match = false) as total_incorrect
    FROM deals
    WHERE status = 'reviewed'
  `);

  const row = rows[0];
  const reviewed7d = parseInt(row.reviewed_7d) || 0;
  const correct7d = parseInt(row.correct_7d) || 0;
  const rolling7d = reviewed7d > 0 ? Math.round((correct7d / reviewed7d) * 1000) / 10 : null;

  // Get incorrect reason breakdown
  const reasonResult = await pool.query(`
    SELECT incorrect_reason, COUNT(*) as count
    FROM deals
    WHERE status = 'reviewed' AND is_correct_match = false AND incorrect_reason IS NOT NULL
    GROUP BY incorrect_reason
  `);
  const incorrectReasons: Record<string, number> = {};
  for (const r of reasonResult.rows) {
    incorrectReasons[r.incorrect_reason] = parseInt(r.count);
  }

  return {
    rolling7d,
    totalReviewed: parseInt(row.total_reviewed) || 0,
    totalCorrect: parseInt(row.total_correct) || 0,
    totalIncorrect: parseInt(row.total_incorrect) || 0,
    incorrectReasons,
  };
}

/**
 * Check accuracy and alert if it drops below threshold.
 * Call this periodically (e.g. from the job scheduler).
 */
export async function checkAccuracyThreshold(): Promise<void> {
  const stats = await getAccuracyStats();

  if (stats.rolling7d !== null && stats.rolling7d < 80 && stats.totalReviewed >= 10) {
    log.warn({ rolling7d: stats.rolling7d }, 'Accuracy below threshold');
    await sendAlert(
      'critical',
      'Accuracy Drop',
      `7-day rolling accuracy: ${stats.rolling7d}% (threshold: 80%)\nReviewed: ${stats.totalReviewed}, Correct: ${stats.totalCorrect}`
    ).catch(() => {});
  }
}
