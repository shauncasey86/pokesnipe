/**
 * Live API test — run on Railway with:
 *   npx tsx src/scripts/test-api.ts
 *
 * Tests:
 *   1. Health endpoint (public)
 *   2. Protected endpoint returns 401 without auth
 *   3. Login with ACCESS_PASSWORD
 *   4. Auth check
 *   5. Deals list (paginated)
 *   6. Deal detail
 *   7. Deal review
 *   8. System status
 *   9. Preferences GET/PUT
 *   10. SSE stream connection
 *   11. Zod validation rejects bad input
 *   12. Logout
 *   13. Confirm 401 after logout
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

function extractCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return '';
  const match = setCookie.match(/connect\.sid=[^;]+/);
  return match ? match[0] : '';
}

async function main() {
  console.log(`\n🧪 Live API Test — ${RAILWAY_URL}\n`);

  // ── Test 1: Health (public) ──
  console.log('── Test 1: Health endpoint ──');
  const healthRes = await fetch(`${RAILWAY_URL}/healthz`);
  check('GET /healthz returns 200', healthRes.status === 200);

  // ── Test 2: Protected without auth ──
  console.log('\n── Test 2: Protected endpoint without auth ──');
  const noAuthRes = await fetch(`${RAILWAY_URL}/api/deals`);
  check('GET /api/deals returns 401 without auth', noAuthRes.status === 401);

  // ── Test 3: Login ──
  console.log('\n── Test 3: Login ──');
  const loginRes = await fetch(`${RAILWAY_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ACCESS_PASSWORD }),
  });
  check('POST /auth/login returns 200', loginRes.status === 200);
  sessionCookie = extractCookie(loginRes);
  check('Session cookie received', sessionCookie.length > 0);

  // Wrong password
  const badLoginRes = await fetch(`${RAILWAY_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong-password-123' }),
  });
  check('Wrong password returns 401', badLoginRes.status === 401);

  // ── Test 4: Auth check ──
  console.log('\n── Test 4: Auth check ──');
  const authCheckRes = await fetch(`${RAILWAY_URL}/auth/check`, {
    headers: { Cookie: sessionCookie },
  });
  const authCheck = await authCheckRes.json() as any;
  check('GET /auth/check returns authenticated=true', authCheck.authenticated === true);

  // ── Test 5: Deals list ──
  console.log('\n── Test 5: Deals list ──');
  const dealsRes = await fetch(`${RAILWAY_URL}/api/deals?limit=5`, {
    headers: { Cookie: sessionCookie },
  });
  check('GET /api/deals returns 200', dealsRes.status === 200);
  const dealsData = await dealsRes.json() as any;
  check('Response has data array', Array.isArray(dealsData.data));
  check('Response has total count', typeof dealsData.total === 'number', `${dealsData.total} deals`);
  check('Response has pagination', dealsData.page !== undefined && dealsData.totalPages !== undefined);

  // Test tier filter
  const tierRes = await fetch(`${RAILWAY_URL}/api/deals?tier=GRAIL,HIT&limit=5`, {
    headers: { Cookie: sessionCookie },
  });
  check('Tier filter returns 200', tierRes.status === 200);

  // ── Test 6: Deal detail ──
  console.log('\n── Test 6: Deal detail ──');
  let dealId: string | null = null;
  if (dealsData.data.length > 0) {
    dealId = dealsData.data[0].deal_id;
    const detailRes = await fetch(`${RAILWAY_URL}/api/deals/${dealId}`, {
      headers: { Cookie: sessionCookie },
    });
    check('GET /api/deals/:id returns 200', detailRes.status === 200);
    const detail = await detailRes.json() as any;
    check('Detail has card_name', detail.card_name !== undefined, detail.card_name);
    check('Detail has match_signals', detail.match_signals !== undefined);
    check('Detail has variant_prices', detail.variant_prices !== undefined);
  } else {
    console.log('  ⚠️  No deals in DB — skipping detail test');
  }

  // Non-existent deal
  const missingRes = await fetch(`${RAILWAY_URL}/api/deals/00000000-0000-0000-0000-000000000000`, {
    headers: { Cookie: sessionCookie },
  });
  check('Non-existent deal returns 404', missingRes.status === 404);

  // ── Test 7: Deal review ──
  console.log('\n── Test 7: Deal review ──');
  if (dealId) {
    const reviewRes = await fetch(`${RAILWAY_URL}/api/deals/${dealId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ isCorrectMatch: true }),
    });
    check('POST /api/deals/:id/review returns 200', reviewRes.status === 200);
  } else {
    console.log('  ⚠️  No deals — skipping review test');
  }

  // ── Test 8: System status ──
  console.log('\n── Test 8: System status ──');
  const statusRes = await fetch(`${RAILWAY_URL}/api/status`, {
    headers: { Cookie: sessionCookie },
  });
  check('GET /api/status returns 200', statusRes.status === 200);
  const status = await statusRes.json() as any;
  check('Status has scanner', status.scanner !== undefined);
  check('Status has sync', status.sync !== undefined);
  check('Status has ebay', status.ebay !== undefined);
  check('Status has exchangeRate', status.exchangeRate !== undefined);
  check('Status has accuracy', status.accuracy !== undefined);
  console.log(`  Scanner: ${status.scanner?.dealsToday} deals today, ${status.scanner?.activeDeals} active`);
  console.log(`  eBay: ${status.ebay?.callsToday}/${status.ebay?.dailyLimit} calls`);
  console.log(`  Cards: ${status.sync?.totalCards}, Expansions: ${status.sync?.totalExpansions}`);

  // ── Test 9: Preferences ──
  console.log('\n── Test 9: Preferences ──');
  const prefsGetRes = await fetch(`${RAILWAY_URL}/api/preferences`, {
    headers: { Cookie: sessionCookie },
  });
  check('GET /api/preferences returns 200', prefsGetRes.status === 200);

  const prefsPutRes = await fetch(`${RAILWAY_URL}/api/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ testPref: true, theme: 'dark' }),
  });
  check('PUT /api/preferences returns 200', prefsPutRes.status === 200);
  const updatedPrefs = await prefsPutRes.json() as any;
  check('Updated prefs contain new data', updatedPrefs.data?.testPref === true);

  // ── Test 10: SSE stream ──
  console.log('\n── Test 10: SSE stream ──');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const sseRes = await fetch(`${RAILWAY_URL}/api/deals/stream`, {
      headers: { Cookie: sessionCookie },
      signal: controller.signal,
    });
    check('SSE endpoint returns 200', sseRes.status === 200);
    check('Content-Type is text/event-stream',
      sseRes.headers.get('content-type')?.includes('text/event-stream') || false);
    clearTimeout(timeout);
    controller.abort();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      check('SSE connection established (aborted after 5s)', true);
    } else {
      check('SSE connection', false, err.message);
    }
  }

  // ── Test 11: Zod validation ──
  console.log('\n── Test 11: Zod validation ──');
  const badLookupRes = await fetch(`${RAILWAY_URL}/api/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ notAUrl: 123 }),
  });
  check('Invalid lookup body returns 400', badLookupRes.status === 400);
  const badLookupData = await badLookupRes.json() as any;
  check('Error response has validation details', badLookupData.details !== undefined);

  const badReviewRes = await fetch(`${RAILWAY_URL}/api/deals/some-id/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ isCorrectMatch: 'not-a-boolean' }),
  });
  check('Invalid review body returns 400', badReviewRes.status === 400);

  // ── Test 12: Logout ──
  console.log('\n── Test 12: Logout ──');
  const logoutRes = await fetch(`${RAILWAY_URL}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
  });
  check('POST /auth/logout returns 200', logoutRes.status === 200);

  // ── Test 13: Confirm 401 after logout ──
  console.log('\n── Test 13: Confirm 401 after logout ──');
  const postLogoutRes = await fetch(`${RAILWAY_URL}/api/deals`, {
    headers: { Cookie: sessionCookie },
  });
  check('GET /api/deals returns 401 after logout', postLogoutRes.status === 401);

  // ── Summary ──
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ ${passed} passed, ❌ ${failed} failed`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
