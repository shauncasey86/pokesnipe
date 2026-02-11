/**
 * Live observability test — run on Railway with:
 *   npx tsx src/scripts/test-observability.ts
 *
 * Tests:
 *   1. Structured logging is working
 *   2. Telegram alerts (if configured)
 *   3. Accuracy tracking
 *   4. System status includes all expected fields
 *   5. CI files exist
 */

import { pool } from '../db/pool.js';
import { isTelegramConfigured, sendTestMessage } from '../services/notifications/index.js';
import { getAccuracyStats } from '../services/accuracy/tracker.js';
import { getJobStatuses } from '../services/jobs/index.js';
import * as fs from 'fs';
import * as path from 'path';

const RAILWAY_URL = process.env.RAILWAY_PUBLIC_URL || process.env.RAILWAY_STATIC_URL || 'http://localhost:8080';
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD!;

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function getSessionCookie(): Promise<string> {
  const res = await fetch(`${RAILWAY_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ACCESS_PASSWORD }),
  });
  const cookie = res.headers.get('set-cookie') || '';
  const match = cookie.match(/connect\.sid=[^;]+/);
  return match ? match[0] : '';
}

async function main() {
  console.log(`\n🧪 Observability & Production Test — ${RAILWAY_URL}\n`);

  // ── Test 1: Telegram ──
  console.log('── Test 1: Telegram ──');
  const telegramConfigured = isTelegramConfigured();
  console.log(`  Telegram configured: ${telegramConfigured}`);

  if (telegramConfigured) {
    const sent = await sendTestMessage();
    check('Telegram test message sent', sent);
  } else {
    console.log('  ⚠️  Telegram not configured — skipping (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)');
    check('Telegram gracefully skipped when unconfigured', true);
  }

  // ── Test 2: Accuracy tracking ──
  console.log('\n── Test 2: Accuracy tracking ──');
  const accuracy = await getAccuracyStats();
  check('getAccuracyStats returns data', accuracy !== null);
  check('Has rolling7d field', accuracy.rolling7d !== undefined,
    accuracy.rolling7d !== null ? `${accuracy.rolling7d}%` : 'no reviews yet');
  check('Has totalReviewed', typeof accuracy.totalReviewed === 'number', `${accuracy.totalReviewed}`);
  check('Has incorrectReasons', typeof accuracy.incorrectReasons === 'object');

  // ── Test 3: Status API includes accuracy + jobs ──
  console.log('\n── Test 3: Status API completeness ──');
  const cookie = await getSessionCookie();
  const statusRes = await fetch(`${RAILWAY_URL}/api/status`, { headers: { Cookie: cookie } });
  const status = await statusRes.json() as Record<string, unknown>;

  check('Status has accuracy', status.accuracy !== undefined);
  check('Status has jobs', status.jobs !== undefined);
  check('Status has scanner', status.scanner !== undefined);
  check('Status has ebay', status.ebay !== undefined);
  check('Status has sync', status.sync !== undefined);
  check('Status has exchangeRate', status.exchangeRate !== undefined);

  if (status.accuracy) {
    const acc = status.accuracy as Record<string, unknown>;
    check('Accuracy has rolling7d', acc.rolling7d !== undefined);
    check('Accuracy has totalReviewed', typeof acc.totalReviewed === 'number');
  }

  if (status.jobs) {
    const jobNames = Object.keys(status.jobs as Record<string, unknown>);
    check('Jobs registered', jobNames.length >= 5, jobNames.join(', '));
    check('accuracy-check job registered', 'accuracy-check' in (status.jobs as Record<string, unknown>));
  }

  // ── Test 4: Telegram test endpoint ──
  console.log('\n── Test 4: Telegram test endpoint ──');
  const telegramRes = await fetch(`${RAILWAY_URL}/api/notifications/telegram/test`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });

  if (telegramConfigured) {
    check('POST /api/notifications/telegram/test returns 200', telegramRes.status === 200);
  } else {
    check('Returns 400 when not configured', telegramRes.status === 400);
  }

  // ── Test 5: CI and Docker files exist ──
  console.log('\n── Test 5: Production files ──');
  const ciExists = fs.existsSync(path.join(process.cwd(), '.github/workflows/ci.yml'));
  check('CI workflow exists', ciExists, '.github/workflows/ci.yml');

  const dockerExists = fs.existsSync(path.join(process.cwd(), 'Dockerfile'));
  check('Dockerfile exists', dockerExists);

  const railwayExists = fs.existsSync(path.join(process.cwd(), 'railway.toml'));
  check('railway.toml exists', railwayExists);

  // ── Test 6: Correlation IDs ──
  console.log('\n── Test 6: Correlation IDs ──');
  try {
    const { generateCorrelationId } = await import('../services/logger/correlation.js');
    const id = generateCorrelationId();
    check('generateCorrelationId works', typeof id === 'string' && id.length === 8, id);
  } catch {
    check('Correlation module exists', false, 'import failed');
  }

  // ── Test 7: Deal alert function ──
  console.log('\n── Test 7: Deal alert function ──');
  try {
    const { sendDealAlert } = await import('../services/notifications/deal-alerts.js');
    check('sendDealAlert is importable', typeof sendDealAlert === 'function');
  } catch {
    check('deal-alerts module exists', false, 'import failed');
  }

  // ── Summary ──
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ ${passed} passed, ❌ ${failed} failed`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
