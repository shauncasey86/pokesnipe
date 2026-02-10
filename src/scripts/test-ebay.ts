import { getAccessToken, searchItems, getItem, getBudgetStatus } from '../services/ebay/index.js';

async function main() {
  console.log('=== eBay API Integration Test ===\n');

  // 1. OAuth token
  console.log('1. Getting OAuth token...');
  const token = await getAccessToken();
  console.log(`   Token obtained: ${token.substring(0, 20)}...`);

  // 2. Search
  console.log('\n2. Searching eBay for "pokemon" (limit 10)...');
  const results = await searchItems('pokemon', 10);
  const items = results?.itemSummaries;
  if (!items?.length) {
    throw new Error('Search returned no results');
  }
  console.log(`   Search returned ${items.length} items (total: ${results!.total})`);

  // 3. Validate search results
  console.log('\n3. Validating search results...');
  let allValid = true;
  for (const item of items) {
    const isFixedPrice = item.buyingOptions.includes('FIXED_PRICE');
    const price = parseFloat(item.price.value);
    if (!isFixedPrice) {
      console.error(`   FAIL: Item ${item.itemId} is not FIXED_PRICE: ${item.buyingOptions}`);
      allValid = false;
    }
    if (price < 10) {
      console.error(`   FAIL: Item ${item.itemId} price ${price} is below £10`);
      allValid = false;
    }
  }
  if (allValid) {
    console.log(`   All ${items.length} items are Buy It Now, £10+`);
  }

  // 4. getItem enrichment
  const firstItem = items[0];
  console.log(`\n4. Fetching item detail for ${firstItem.itemId}...`);
  const detail = await getItem(firstItem.itemId);
  if (!detail) {
    throw new Error('getItem returned null');
  }
  console.log(`   getItem returned localizedAspects: ${!!detail.localizedAspects}`);
  console.log(`   getItem returned conditionDescriptors: ${!!detail.conditionDescriptors}`);

  if (detail.localizedAspects?.length) {
    console.log('   Sample aspects:');
    for (const aspect of detail.localizedAspects.slice(0, 5)) {
      console.log(`     ${aspect.name}: ${aspect.value}`);
    }
  }

  // 5. Budget status
  const budget = getBudgetStatus();
  console.log(`\n5. API calls used: ${budget.used}/${budget.dailyLimit} (remaining: ${budget.remaining})`);

  console.log('\n=== eBay API Test Complete ===');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
