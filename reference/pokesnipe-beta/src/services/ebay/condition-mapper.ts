// src/services/ebay/condition-mapper.ts
// ═══════════════════════════════════════════════════════════════════════════
// eBay to Scrydex Condition Mapping
// Maps eBay item specifics conditions to Scrydex price tiers
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from '../../utils/logger.js';

/**
 * Scrydex condition codes for raw card pricing
 * - NM: Near Mint - Card is in excellent condition with minimal to no wear
 * - LP: Lightly Played - Minor wear, may have light scratches or whitening
 * - MP: Moderately Played - Noticeable wear but still structurally sound
 * - HP: Heavily Played - Significant wear, creases, or damage
 */
export type ScrydexCondition = 'NM' | 'LP' | 'MP' | 'HP';

/**
 * Blocked conditions - cards with these conditions are not worth processing
 * Returns undefined from the mapper so they get skipped entirely
 */
export const BLOCKED_CONDITION_PATTERNS = [
  'damaged',
  'dmg',
  'creased',
  'crease',
  'water damage',
  'water damaged',
  'torn',
  'ripped',
  'destroyed',
];

/**
 * eBay Condition Descriptor IDs for ungraded trading cards (descriptor name: 40001)
 * These come from conditionDescriptors in the eBay Browse API response
 * Note: conditionId 4000 means "ungraded trading card"
 *
 * Reference: https://developer.ebay.com/api-docs/sell/static/metadata/condition-id-values.html
 * Category: 183454 (Pokemon CCG Individual Cards)
 *
 * Only these 4 condition codes apply to trading cards:
 */
export const EBAY_CONDITION_DESCRIPTOR_MAP: Record<string, ScrydexCondition> = {
  // Near Mint or Better → NM
  '400010': 'NM',

  // Lightly Played (Excellent) → LP
  '400015': 'LP',

  // Moderately Played (Very Good) → MP
  '400016': 'MP',

  // Heavily Played (Poor) → HP
  '400017': 'HP',
};

/**
 * eBay condition values from item specifics
 * These come from the "Card Condition" field in eBay listings
 */
export const EBAY_CONDITION_MAP: Record<string, ScrydexCondition> = {
  // Near Mint or Better → NM
  'near mint or better': 'NM',
  'near mint': 'NM',
  'nm': 'NM',
  'nm-mt': 'NM',
  'nm/m': 'NM',
  'mint': 'NM',
  'gem mint': 'NM',
  'pack fresh': 'NM',
  'factory sealed': 'NM',
  'unplayed': 'NM',
  'excellent': 'NM',
  'ex': 'NM',

  // Lightly Played (Excellent) → LP
  'lightly played (excellent)': 'LP',
  'lightly played': 'LP',
  'light play': 'LP',
  'lp': 'LP',
  'excellent-': 'LP',
  'ex-': 'LP',
  'very good': 'LP',
  'vg': 'LP',
  'slightly played': 'LP',
  'sp': 'LP',

  // Moderately Played (Very Good) → MP
  'moderately played (very good)': 'MP',
  'moderately played': 'MP',
  'moderate play': 'MP',
  'mp': 'MP',
  'good': 'MP',
  'gd': 'MP',
  'played': 'MP',
  'pl': 'MP',

  // Heavily Played (Poor) → HP
  // Note: "damaged", "dmg" are in BLOCKED_CONDITION_PATTERNS and return undefined
  'heavily played (poor)': 'HP',
  'heavily played': 'HP',
  'heavy play': 'HP',
  'hp': 'HP',
  'poor': 'HP',
  'pr': 'HP',
  'fair': 'HP',
  'fr': 'HP',
};

/**
 * Condition patterns to search for in listing titles
 * Used as fallback when item specifics don't have condition
 */
const TITLE_CONDITION_PATTERNS: Array<{ pattern: RegExp; condition: ScrydexCondition }> = [
  // Near Mint patterns
  { pattern: /\b(NM[\-\/]?M(?:INT)?|NEAR\s*MINT|GEM\s*MINT|PACK\s*FRESH|MINT)\b/i, condition: 'NM' },

  // Lightly Played patterns
  { pattern: /\b(LP|LIGHT(?:LY)?\s*PLAY(?:ED)?|EX(?:CELLENT)?[\-]?|VG|VERY\s*GOOD)\b/i, condition: 'LP' },

  // Moderately Played patterns
  { pattern: /\b(MP|MOD(?:ERATE(?:LY)?)\s*PLAY(?:ED)?|GOOD|GD|PLAYED)\b/i, condition: 'MP' },

  // Heavily Played patterns
  // Note: "damaged", "dmg" are blocked and handled separately
  { pattern: /\b(HP|HEAVY\s*PLAY(?:ED)?|POOR|PR|FAIR)\b/i, condition: 'HP' },
];

/**
 * Extract card condition from eBay conditionDescriptors
 * These can be either numeric IDs (name: "40001") or text values (name: "Card Condition")
 * Note: conditionId 4000 = ungraded trading card
 *
 * @param conditionDescriptors Array of condition descriptors from eBay API
 * @returns The mapped Scrydex condition or undefined
 */
export function extractConditionFromDescriptors(
  conditionDescriptors?: Array<{
    name: string;
    values: Array<{ value?: string; content?: string }>;
  }>
): { condition: ScrydexCondition; descriptorId: string } | undefined {
  if (!conditionDescriptors || conditionDescriptors.length === 0) {
    return undefined;
  }

  for (const descriptor of conditionDescriptors) {
    const firstValue = descriptor.values?.[0];
    if (!firstValue) continue;

    // Get the value (could be in 'value' or 'content' field)
    const rawValue = firstValue.value || firstValue.content;
    if (!rawValue) continue;

    // Case 1: Numeric descriptor ID (name: "40001", value: "400010")
    if (descriptor.name === '40001') {
      const condition = EBAY_CONDITION_DESCRIPTOR_MAP[rawValue];
      if (condition) {
        logger.debug('CONDITION_DESCRIPTOR_FOUND', {
          descriptorName: descriptor.name,
          descriptorId: rawValue,
          mappedCondition: condition,
        });
        return { condition, descriptorId: rawValue };
      }
    }

    // Case 2: Text descriptor (name: "Card Condition", content: "Near mint or better")
    if (descriptor.name === 'Card Condition' || descriptor.name.toLowerCase() === 'card condition') {
      const normalizedValue = rawValue.toLowerCase().trim();

      // Map the text condition values
      let condition: ScrydexCondition | undefined;

      if (normalizedValue.includes('near mint') || normalizedValue.includes('nm')) {
        condition = 'NM';
      } else if (normalizedValue.includes('lightly played') || normalizedValue.includes('excellent')) {
        condition = 'LP';
      } else if (normalizedValue.includes('moderately played') || normalizedValue.includes('very good')) {
        condition = 'MP';
      } else if (normalizedValue.includes('heavily played') || normalizedValue.includes('poor')) {
        condition = 'HP';
      }

      if (condition) {
        logger.debug('CONDITION_DESCRIPTOR_TEXT_FOUND', {
          descriptorName: descriptor.name,
          rawValue,
          mappedCondition: condition,
        });
        return { condition, descriptorId: rawValue };
      } else {
        // Log unknown condition text so we can add it
        logger.warn('UNKNOWN_CONDITION_TEXT', {
          descriptorName: descriptor.name,
          rawValue,
        });
      }
    }
  }

  return undefined;
}

/**
 * Extract card condition from eBay item specifics (localizedAspects)
 * @param localizedAspects Array of item specifics from eBay API
 * @returns The condition value if found, or undefined
 */
export function extractConditionFromAspects(
  localizedAspects?: Array<{ name: string; value: string }>
): string | undefined {
  if (!localizedAspects || localizedAspects.length === 0) {
    return undefined;
  }

  // Look for condition-related aspects
  const conditionNames = [
    'card condition',
    'condition',
    'card grade',
    'grade',
  ];

  for (const aspect of localizedAspects) {
    const aspectName = aspect.name.toLowerCase().trim();
    if (conditionNames.includes(aspectName)) {
      return aspect.value;
    }
  }

  return undefined;
}

/**
 * Check if a condition string indicates a blocked/damaged condition
 * @param conditionText The condition string to check
 * @returns true if the condition is blocked
 */
export function isBlockedCondition(conditionText: string): boolean {
  const normalized = conditionText.toLowerCase().trim();
  return BLOCKED_CONDITION_PATTERNS.some(pattern => normalized.includes(pattern));
}

/**
 * Map eBay condition to Scrydex condition code
 * @param ebayCondition The condition string from eBay (item specifics or title)
 * @returns Scrydex condition code or undefined if not recognized or blocked
 */
export function mapConditionToScrydex(ebayCondition: string): ScrydexCondition | undefined {
  const normalized = ebayCondition.toLowerCase().trim();

  // Check if this is a blocked condition (damaged, etc.)
  if (isBlockedCondition(normalized)) {
    logger.debug('CONDITION_BLOCKED', {
      condition: ebayCondition,
      reason: 'Matches blocked condition pattern',
    });
    return undefined;
  }

  // Direct lookup
  if (normalized in EBAY_CONDITION_MAP) {
    return EBAY_CONDITION_MAP[normalized];
  }

  // Partial match (for variations like "Near Mint or Better - Pack Fresh")
  for (const [key, value] of Object.entries(EBAY_CONDITION_MAP)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return undefined;
}

/**
 * Extract condition from listing title
 * @param title The eBay listing title
 * @returns Scrydex condition code, undefined if not found, or 'BLOCKED' if damaged
 */
export function extractConditionFromTitle(title: string): ScrydexCondition | 'BLOCKED' | undefined {
  // First check for blocked conditions in title
  if (isBlockedCondition(title)) {
    logger.debug('TITLE_CONDITION_BLOCKED', {
      title: title.substring(0, 80),
      reason: 'Title contains blocked condition keyword',
    });
    return 'BLOCKED';
  }

  for (const { pattern, condition } of TITLE_CONDITION_PATTERNS) {
    if (pattern.test(title)) {
      return condition;
    }
  }
  return undefined;
}

/**
 * Get the best condition estimate for an eBay listing
 * Priority: Condition Descriptors → Item specifics → Title → Default to LP
 *
 * @param options Configuration object
 * @param options.conditionDescriptors Condition descriptors from eBay API (highest priority)
 * @param options.localizedAspects Item specifics from eBay API
 * @param options.title Listing title
 * @param options.logItemId Optional item ID for logging
 * @returns The mapped Scrydex condition, or blocked: true if damaged
 */
export function getListingCondition(
  options: {
    conditionDescriptors?: Array<{ name: string; values: Array<{ value?: string; content?: string }> }>;
    localizedAspects?: Array<{ name: string; value: string }>;
    title?: string;
    logItemId?: string;
  }
): { condition: ScrydexCondition; source: 'condition_descriptor' | 'item_specifics' | 'title' | 'default'; rawValue?: string; descriptorId?: string; blocked?: boolean } {
  const { conditionDescriptors, localizedAspects, title, logItemId } = options;

  // 0. Check title for blocked conditions first (damaged, creased, etc.)
  if (title && isBlockedCondition(title)) {
    logger.debug('CONDITION_BLOCKED_TITLE', {
      itemId: logItemId,
      title: title.substring(0, 80),
      reason: 'Title contains blocked condition keyword',
    });
    return { condition: 'HP', source: 'title', blocked: true };
  }

  // 1. Try condition descriptors first (most reliable - direct from eBay API)
  const descriptorResult = extractConditionFromDescriptors(conditionDescriptors);
  if (descriptorResult) {
    logger.debug('CONDITION_FROM_DESCRIPTOR', {
      itemId: logItemId,
      descriptorId: descriptorResult.descriptorId,
      mapped: descriptorResult.condition,
    });
    return {
      condition: descriptorResult.condition,
      source: 'condition_descriptor',
      rawValue: descriptorResult.descriptorId,
      descriptorId: descriptorResult.descriptorId,
    };
  }

  // 2. Try item specifics (localizedAspects)
  const aspectCondition = extractConditionFromAspects(localizedAspects);
  if (aspectCondition) {
    // Check if item specifics indicate blocked condition
    if (isBlockedCondition(aspectCondition)) {
      logger.debug('CONDITION_BLOCKED_SPECIFICS', {
        itemId: logItemId,
        condition: aspectCondition,
        reason: 'Item specifics contain blocked condition',
      });
      return { condition: 'HP', source: 'item_specifics', rawValue: aspectCondition, blocked: true };
    }

    const mapped = mapConditionToScrydex(aspectCondition);
    if (mapped) {
      logger.debug('CONDITION_FROM_SPECIFICS', {
        itemId: logItemId,
        raw: aspectCondition,
        mapped,
      });
      return { condition: mapped, source: 'item_specifics', rawValue: aspectCondition };
    }
  }

  // 3. Try title extraction (blocked already checked above)
  if (title) {
    const titleCondition = extractConditionFromTitle(title);
    if (titleCondition && titleCondition !== 'BLOCKED') {
      logger.debug('CONDITION_FROM_TITLE', {
        itemId: logItemId,
        title: title.substring(0, 60),
        mapped: titleCondition,
      });
      return { condition: titleCondition, source: 'title' };
    }
  }

  // 4. Default to LP (conservative estimate per user requirement)
  logger.debug('CONDITION_DEFAULT_LP', {
    itemId: logItemId,
    reason: 'No condition found in descriptors, specifics, or title',
  });
  return { condition: 'LP', source: 'default' };
}

/**
 * Get condition display name for UI
 */
export function getConditionDisplayName(condition: ScrydexCondition): string {
  switch (condition) {
    case 'NM': return 'Near Mint';
    case 'LP': return 'Lightly Played';
    case 'MP': return 'Moderately Played';
    case 'HP': return 'Heavily Played';
    default: return condition;
  }
}
