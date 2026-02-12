type Condition = 'NM' | 'LP' | 'MP' | 'HP';

interface ConditionPrice {
  low: number;
  market: number;
}

export interface GradedPrice {
  low: number;
  market: number;
  mid?: number;
  high?: number;
}

export interface VariantCandidate {
  id: number;
  name: string;
  prices: Record<string, Partial<Record<Condition, ConditionPrice>>>;
  gradedPrices?: Record<string, GradedPrice> | null;
}

export interface VariantResolution {
  variant: VariantCandidate;
  method: 'single_variant' | 'keyword_match' | 'default_cheapest';
  confidence: number;
}

/**
 * Variant keyword mapping (Scrydex variant name → title keywords).
 */
const VARIANT_KEYWORDS: Record<string, string[]> = {
  reverseHolofoil: ['reverse holo', 'reverse holographic', 'rev holo', 'reverse'],
  firstEditionHolofoil: ['1st edition holo', '1st ed holo', 'first edition holo'],
  firstEditionNormal: ['1st edition', '1st ed', 'first edition'],
  unlimitedHolofoil: ['unlimited holo'],
  unlimitedNormal: ['unlimited'],
  holofoil: ['holo', 'holographic', 'holo rare'],
  // Modern rarity variants (Scrydex may use various naming conventions)
  specialIllustrationRare: ['special illustration rare', 'sir'],
  specialArtRare: ['special art rare', 'sar'],
  illustrationRare: ['illustration rare'],
  artRare: ['art rare'],
  characterRare: ['character rare', 'chr'],
  trainerGallery: ['trainer gallery', 'tg'],
};

/**
 * Check if a variant has any priced condition (market value available).
 */
function hasPricing(variant: VariantCandidate): boolean {
  const raw = variant.prices['raw'] || variant.prices;
  if (!raw) return false;
  return Object.values(raw).some(
    (c) => c && typeof c === 'object' && 'market' in c && (c as ConditionPrice).market != null,
  );
}

/**
 * Get the cheapest NM market price for a variant (for sorting).
 */
function getCheapestPrice(variant: VariantCandidate): number {
  const raw = variant.prices['raw'] || variant.prices;
  if (!raw) return Infinity;

  for (const condition of ['NM', 'LP', 'MP', 'HP'] as Condition[]) {
    const price = (raw as Partial<Record<Condition, ConditionPrice>>)[condition];
    if (price?.market != null) return price.market;
  }
  return Infinity;
}

/**
 * Resolve the correct variant for a matched card.
 *
 * Strategy:
 * 1. If only one variant has prices → use it (single_variant, 0.95 confidence)
 * 2. Match variant keywords from listing against available variants (keyword_match, 0.85)
 * 3. Default to cheapest variant — conservative (default_cheapest, 0.50)
 */
export function resolveVariant(
  detectedVariant: string | null,
  cardVariants: VariantCandidate[],
): VariantResolution | null {
  if (cardVariants.length === 0) return null;

  const pricedVariants = cardVariants.filter(hasPricing);
  if (pricedVariants.length === 0) return null;

  // Strategy 1: Single priced variant → auto-select
  if (pricedVariants.length === 1) {
    return { variant: pricedVariants[0]!, method: 'single_variant', confidence: 0.95 };
  }

  // Strategy 2: Keyword match from detected variant signal
  if (detectedVariant) {
    const lowerDetected = detectedVariant.toLowerCase();

    // Try direct name match first
    const directMatch = pricedVariants.find(
      (v) => v.name.toLowerCase() === lowerDetected,
    );
    if (directMatch) {
      return { variant: directMatch, method: 'keyword_match', confidence: 0.85 };
    }

    // Try keyword-to-variant mapping — pick longest matching keyword (most specific)
    let bestKeywordMatch: VariantCandidate | null = null;
    let bestKeywordLength = 0;
    for (const v of pricedVariants) {
      const keywords = VARIANT_KEYWORDS[v.name];
      if (!keywords) continue;
      for (const kw of keywords) {
        if ((lowerDetected.includes(kw) || kw.includes(lowerDetected)) && kw.length > bestKeywordLength) {
          bestKeywordMatch = v;
          bestKeywordLength = kw.length;
        }
      }
    }
    if (bestKeywordMatch) {
      return { variant: bestKeywordMatch, method: 'keyword_match', confidence: 0.85 };
    }
  }

  // Strategy 3: Default to cheapest variant (conservative — underestimates profit)
  const sorted = [...pricedVariants].sort(
    (a, b) => getCheapestPrice(a) - getCheapestPrice(b),
  );
  return { variant: sorted[0]!, method: 'default_cheapest', confidence: 0.50 };
}
