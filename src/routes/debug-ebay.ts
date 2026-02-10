import { Router } from 'express';
import { getAccessToken, searchItems, getItem, getBudgetStatus } from '../services/ebay/index.js';

const debugEbayRouter = Router();

// Temporary debug endpoint — remove after verifying eBay integration
debugEbayRouter.get('/api/debug/test-ebay', async (_req, res) => {
  const log: string[] = [];

  try {
    // 1. OAuth token
    const token = await getAccessToken();
    log.push(`Token obtained: ${token.substring(0, 20)}...`);

    // 2. Search
    const results = await searchItems('pokemon', 10);
    if (!results || !results.itemSummaries?.length) {
      log.push('ERROR: Search returned no results');
      res.json({ ok: false, log });
      return;
    }
    log.push(`Search returned ${results.itemSummaries.length} items (total: ${results.total})`);

    // 3. Validate
    let allValid = true;
    for (const item of results.itemSummaries) {
      const isFixedPrice = item.buyingOptions.includes('FIXED_PRICE');
      const price = parseFloat(item.price.value);
      if (!isFixedPrice || price < 10) {
        log.push(`FAIL: Item ${item.itemId} buyingOptions=${item.buyingOptions} price=${price}`);
        allValid = false;
      }
    }
    if (allValid) {
      log.push(`All ${results.itemSummaries.length} items are Buy It Now, £10+`);
    }

    // 4. getItem enrichment
    const firstItem = results.itemSummaries[0];
    const detail = await getItem(firstItem.itemId);
    if (detail) {
      log.push(`getItem localizedAspects: ${!!detail.localizedAspects}`);
      log.push(`getItem conditionDescriptors: ${!!detail.conditionDescriptors}`);
      if (detail.localizedAspects?.length) {
        for (const aspect of detail.localizedAspects.slice(0, 5)) {
          log.push(`  ${aspect.name}: ${aspect.value}`);
        }
      }
    } else {
      log.push('getItem returned null');
    }

    // 5. Budget
    const budget = getBudgetStatus();
    log.push(`API calls used: ${budget.used}/${budget.dailyLimit} (remaining: ${budget.remaining})`);

    res.json({ ok: true, log });
  } catch (err) {
    log.push(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    res.status(500).json({ ok: false, log });
  }
});

export { debugEbayRouter };
