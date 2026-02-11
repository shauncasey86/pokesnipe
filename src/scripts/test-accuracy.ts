/**
 * Matching accuracy test — run on Railway with:
 *   npx tsx src/scripts/test-accuracy.ts
 *
 * Fetches real eBay listings, runs each through the extraction + matching
 * pipeline, and outputs results for manual review.
 *
 * This is NOT an automated pass/fail test — it produces a report that
 * you review manually to assess matching quality.
 */
import { pool } from '../db/pool.js';
import { searchItems } from '../services/ebay/client.js';
import { trackCall } from '../services/ebay/budget.js';
import { extractSignals } from '../services/extraction/index.js';
import { matchListing } from '../services/matching/index.js';
import pino from 'pino';

const log = pino({ name: 'test-accuracy' });

async function main() {
  console.log('\n🎯 Matching Accuracy Test — Live eBay Data\n');

  // Fetch real listings
  console.log('Fetching 50 eBay listings...');
  const listings = await searchItems('pokemon card', 50);
  trackCall();

  if (!listings?.itemSummaries?.length) {
    console.log('No listings returned from eBay');
    process.exit(1);
  }

  console.log(`Processing ${listings.itemSummaries.length} listings...\n`);

  let matched = 0;
  let rejected = 0;
  let noMatch = 0;
  const results: Array<{
    ebayTitle: string;
    status: string;
    cardName?: string;
    cardNumber?: string;
    expansion?: string;
    variant?: string;
    confidence?: string;
    confidenceTier?: string;
  }> = [];

  for (const listing of listings.itemSummaries) {
    const signals = extractSignals({
      itemId: listing.itemId,
      title: listing.title,
    });

    if (signals.rejected) {
      rejected++;
      continue;
    }

    const match = await matchListing(signals.listing!);

    if (!match) {
      noMatch++;
      results.push({
        ebayTitle: listing.title,
        status: 'NO MATCH',
        cardNumber: signals.listing?.cardNumber?.number != null
          ? String(signals.listing.cardNumber.number)
          : undefined,
      });
      continue;
    }

    matched++;
    results.push({
      ebayTitle: listing.title,
      status: 'MATCHED',
      cardName: match.card.name,
      cardNumber: match.card.number,
      variant: match.variant?.name,
      confidence: match.confidence.composite.toFixed(3),
      confidenceTier: match.confidence.composite >= 0.85 ? 'HIGH' :
                      match.confidence.composite >= 0.65 ? 'MED' : 'LOW',
    });
  }

  // Print results
  console.log('─'.repeat(100));
  console.log(
    'Status'.padEnd(10),
    'Conf'.padEnd(6),
    'eBay Title'.padEnd(50),
    'Matched Card'
  );
  console.log('─'.repeat(100));

  for (const r of results) {
    if (r.status === 'MATCHED') {
      const confColor = r.confidenceTier === 'HIGH' ? '🟢' : r.confidenceTier === 'MED' ? '🟡' : '🔴';
      console.log(
        `${confColor} MATCH`.padEnd(10),
        (r.confidence || '').padEnd(6),
        r.ebayTitle.slice(0, 48).padEnd(50),
        `${r.cardName} ${r.cardNumber || ''} · ${r.expansion || ''} · ${r.variant || ''}`
      );
    } else {
      console.log(
        '⬜ NONE'.padEnd(10),
        '—'.padEnd(6),
        r.ebayTitle.slice(0, 48).padEnd(50),
        `(number: ${r.cardNumber || 'none'})`
      );
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(100));
  console.log(`\n📊 Summary:`);
  console.log(`  Total listings: ${listings.itemSummaries.length}`);
  console.log(`  Rejected (junk): ${rejected}`);
  console.log(`  No match: ${noMatch}`);
  console.log(`  Matched: ${matched}`);
  if (matched + noMatch > 0) {
    console.log(`  Match rate: ${((matched / (matched + noMatch)) * 100).toFixed(1)}% (of non-junk)`);
  }

  const highConf = results.filter(r => r.confidenceTier === 'HIGH').length;
  const medConf = results.filter(r => r.confidenceTier === 'MED').length;
  const lowConf = results.filter(r => r.confidenceTier === 'LOW').length;
  console.log(`  High confidence: ${highConf}, Medium: ${medConf}, Low: ${lowConf}`);

  console.log(`\n📝 Review the matches above manually.`);
  console.log(`   Count how many are correct vs incorrect.`);
  console.log(`   Accuracy = correct / matched × 100%\n`);

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
