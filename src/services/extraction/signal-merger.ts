import type { CardNumber } from './number-extractor.js';
import type { ConditionResult } from './condition-mapper.js';
import type { StructuredSignals } from './structured-extractor.js';

export interface NormalizedListing {
  ebayItemId: string;
  ebayTitle: string;
  cleanedTitle: string;

  cardName: string | null;
  cardNumber: CardNumber | null;
  variant: string | null;
  setName: string | null;

  condition: ConditionResult;

  hasStructuredData: boolean;
  signalSources: Record<string, string>;
}

export function mergeSignals(
  titleSignals: { cardNumber: CardNumber | null; variant: string | null },
  structured: StructuredSignals | null,
  condition: ConditionResult,
  listing: { itemId: string; title: string; cleanedTitle: string },
): NormalizedListing {
  const signalSources: Record<string, string> = {};
  const hasStructuredData = structured !== null;

  // Card name: structured wins
  let cardName: string | null = null;
  if (structured?.cardName) {
    cardName = structured.cardName;
    signalSources['cardName'] = 'structured';
  }

  // Card number: structured wins over title
  let cardNumber = titleSignals.cardNumber;
  if (cardNumber) {
    signalSources['cardNumber'] = 'title';
  }
  if (structured?.cardNumber) {
    // Parse structured card number into a CardNumber if possible
    const parsed = parseInt(structured.cardNumber, 10);
    if (!isNaN(parsed)) {
      cardNumber = { number: parsed, prefix: null, denominator: null };
      signalSources['cardNumber'] = 'structured';
    }
  }

  // Set name: structured wins
  let setName: string | null = null;
  if (structured?.setName) {
    setName = structured.setName;
    signalSources['setName'] = 'structured';
  }

  // Variant: title only (structured doesn't provide variant)
  const variant = titleSignals.variant;
  if (variant) {
    signalSources['variant'] = 'title';
  }

  // Condition source tracking
  signalSources['condition'] = condition.source;

  return {
    ebayItemId: listing.itemId,
    ebayTitle: listing.title,
    cleanedTitle: listing.cleanedTitle,
    cardName,
    cardNumber,
    variant,
    setName,
    condition,
    hasStructuredData,
    signalSources,
  };
}
