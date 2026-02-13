import { cleanTitle } from './title-cleaner.js';
import { detectJunk } from './junk-detector.js';
import { extractCardNumber } from './number-extractor.js';
import { detectVariant } from './variant-detector.js';
import { extractCondition } from './condition-mapper.js';
import { extractStructuredData } from './structured-extractor.js';
import { mergeSignals } from './signal-merger.js';
import type { NormalizedListing } from './signal-merger.js';

/**
 * Check whether the eBay-reported language value indicates English.
 * Handles values like "English", "English (EN)", etc.
 */
function isEnglish(language: string): boolean {
  return language.toLowerCase().startsWith('english');
}

export interface ExtractionResult {
  rejected: boolean;
  reason?: string;
  listing?: NormalizedListing;
}

export function extractSignals(listing: {
  itemId: string;
  title: string;
  conditionDescriptors?: Array<{ name: string; values: string[] }>;
  localizedAspects?: Array<{ name: string; value: string }> | null;
  conditionText?: string | null;
}): ExtractionResult {
  // 1. Clean the title
  const cleaned = cleanTitle(listing.title);

  // 2. Check for junk
  const junk = detectJunk(cleaned.cleaned);
  if (junk.isJunk) return { rejected: true, reason: junk.reason };

  // 3. Extract signals from title
  const cardNumber = extractCardNumber(cleaned.cleaned);
  const variant = detectVariant(cleaned.cleaned);

  // 4. Extract condition (uses descriptors if available)
  const condition = extractCondition(listing);

  // 5. Extract structured data (if enriched)
  const structured = listing.localizedAspects
    ? extractStructuredData(listing.localizedAspects)
    : null;

  // 6. Merge everything
  const normalized = mergeSignals(
    { cardNumber, variant },
    structured,
    condition,
    { itemId: listing.itemId, title: listing.title, cleanedTitle: cleaned.cleaned },
  );

  // 7. Reject non-English cards using structured language data from eBay
  if (normalized.language !== null && !isEnglish(normalized.language)) {
    return { rejected: true, reason: 'non_english' };
  }

  return { rejected: false, listing: normalized };
}

export { cleanTitle } from './title-cleaner.js';
export { detectJunk, detectDescriptionJunk } from './junk-detector.js';
export { extractCardNumber } from './number-extractor.js';
export type { CardNumber } from './number-extractor.js';
export { detectVariant } from './variant-detector.js';
export { extractCondition } from './condition-mapper.js';
export type { Condition, ConditionResult } from './condition-mapper.js';
export { extractStructuredData } from './structured-extractor.js';
export type { StructuredSignals } from './structured-extractor.js';
export { mergeSignals } from './signal-merger.js';
export type { NormalizedListing } from './signal-merger.js';
export { scoreJunkSignals, recordJunkReport, extractNovelTokens, refreshJunkCaches } from './junk-scorer.js';
export type { JunkScoreResult } from './junk-scorer.js';
