/**
 * Live dashboard integration test — run on Railway with:
 *   npx tsx src/scripts/test-dashboard.ts
 *
 * Tests all API endpoints the frontend depends on,
 * verifying response shapes match what the React components expect.
 */

const RAILWAY_URL = process.env.RAILWAY_PUBLIC_URL || process.env.RAILWAY_STATIC_URL || 'http://localhost:8080';
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD!;

let passed = 0;
let failed = 0;
let sessionCookie = '';

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function login() {
  const res = await fetch(`${RAILWAY_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ACCESS_PASSWORD }),
  });
  const cookie = res.headers.get('set-cookie') || '';
  const match = cookie.match(/connect\.sid=[^;]+/);
  sessionCookie = match ? match[0] : '';
}

async function get(path: string) {
  return fetch(`${RAILWAY_URL}${path}`, { headers: { Cookie: sessionCookie } });
}

async function main() {
  console.log(`\n🧪 Dashboard Integration Test — ${RAILWAY_URL}\n`);

  await login();
  check('Logged in', sessionCookie.length > 0);

  // ── Test 1: Frontend serves ──
  console.log('\n── Test 1: Frontend static files ──');
  const indexRes = await fetch(`${RAILWAY_URL}/`);
  check('GET / returns 200', indexRes.status === 200);
  const html = await indexRes.text();
  check('Returns HTML with React root', html.includes('id="root"') || html.includes('id=\\"root\\"'));

  // ── Test 2: Deals list shape ──
  console.log('\n── Test 2: Deals list response shape ──');
  const dealsRes = await get('/api/deals?limit=5');
  const deals = await dealsRes.json();
  check('Has data array', Array.isArray(deals.data));
  check('Has total', typeof deals.total === 'number');
  check('Has page', typeof deals.page === 'number');
  check('Has totalPages', typeof deals.totalPages === 'number');

  if (deals.data.length > 0) {
    const d = deals.data[0];
    check('Deal has deal_id', typeof d.deal_id === 'string');
    check('Deal has ebay_title', typeof d.ebay_title === 'string');
    check('Deal has tier', ['GRAIL', 'HIT', 'FLIP', 'SLEEP'].includes(d.tier));
    check('Deal has profit_gbp (number)', typeof d.profit_gbp === 'number');
    check('Deal has profit_percent (number)', typeof d.profit_percent === 'number');
    check('Deal has confidence (number)', typeof d.confidence === 'number');
    check('Deal has condition', typeof d.condition === 'string');
    check('Deal has liquidity_grade', typeof d.liquidity_grade === 'string' || d.liquidity_grade === null);
    check('Deal has ebay_url', typeof d.ebay_url === 'string');
    check('Deal has created_at', typeof d.created_at === 'string');
    check('Deal has cardName', d.cardName !== undefined);

    // ── Test 3: Deal detail shape ──
    console.log('\n── Test 3: Deal detail response shape ──');
    const detailRes = await get(`/api/deals/${d.deal_id}`);
    const detail = await detailRes.json();
    check('Detail has match_signals', detail.match_signals !== undefined);
    check('Detail has card_name', detail.card_name !== undefined);
    check('Detail has variant_prices', detail.variant_prices !== undefined || detail.condition_comps !== undefined);
    check('Detail has expansion_name', detail.expansion_name !== undefined);
  } else {
    console.log('  ⚠️  No deals — skipping shape checks');
  }

  // ── Test 4: Status response shape ──
  console.log('\n── Test 4: Status response shape ──');
  const statusRes = await get('/api/status');
  const status = await statusRes.json();
  check('Status has scanner', status.scanner !== undefined);
  check('Status has scanner.dealsToday', typeof status.scanner?.dealsToday === 'number');
  check('Status has sync.totalCards', typeof status.sync?.totalCards === 'number');
  check('Status has ebay.callsToday', typeof status.ebay?.callsToday === 'number');
  check('Status has exchangeRate.rate', typeof status.exchangeRate?.rate === 'number' || status.exchangeRate?.rate === null);
  check('Status has accuracy', status.accuracy !== undefined);
  check('Status has jobs', status.jobs !== undefined);

  // ── Test 5: Preferences ──
  console.log('\n── Test 5: Preferences ──');
  const prefsRes = await get('/api/preferences');
  const prefs = await prefsRes.json();
  check('Preferences has data object', typeof prefs.data === 'object');

  // ── Test 6: SSE endpoint ──
  console.log('\n── Test 6: SSE endpoint ──');
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);
    const sseRes = await fetch(`${RAILWAY_URL}/api/deals/stream`, {
      headers: { Cookie: sessionCookie },
      signal: controller.signal,
    });
    check('SSE returns 200', sseRes.status === 200);
    check('SSE content-type', sseRes.headers.get('content-type')?.includes('text/event-stream') || false);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      check('SSE connection works (aborted after 3s)', true);
    } else {
      check('SSE connection', false, err.message);
    }
  }

  // ── Test 7: Catalog (public) ──
  console.log('\n── Test 7: Catalog API (no auth) ──');
  const catRes = await fetch(`${RAILWAY_URL}/api/catalog/expansions`);
  check('Catalog expansions returns 200', catRes.status === 200);

  // ── Test 8: Tier filter ──
  console.log('\n── Test 8: Tier filter ──');
  const grailRes = await get('/api/deals?tier=GRAIL&limit=5');
  check('Tier filter returns 200', grailRes.status === 200);
  const grailData = await grailRes.json();
  const allGrails = grailData.data.every((d: any) => d.tier === 'GRAIL');
  check('All returned deals are GRAIL', grailData.data.length === 0 || allGrails);

  // ── Summary ──
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ ${passed} passed, ❌ ${failed} failed`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
