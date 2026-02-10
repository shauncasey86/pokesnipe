const BULK_PATTERNS = [
  /\blot\b/,
  /\bbundle\b/,
  /\bbulk\b/,
  /\bcollection\b/,
  /\bx10\b/,
  /\bx20\b/,
  /\bx50\b/,
  /\bx100\b/,
  /\bset of\b/,
  /\bmystery\b/,
  /\brandom\b/,
  /\bgrab bag\b/,
  /\bjob lot\b/,
];

const FAKE_PATTERNS = [
  /\bcustom\b/,
  /\bproxy\b/,
  /\borica\b/,
  /\breplica\b/,
  /\bfake\b/,
  /\bunofficial\b/,
  /\bfan made\b/,
  /\baltered art\b/,
];

const NON_CARD_PATTERNS = [
  /\bbooster box\b/,
  /\bbooster\b/,
  /\betb\b/,
  /\belite trainer\b/,
  /\btin\b/,
  /\bbinder\b/,
  /\bsleeve\b/,
  /\bplaymat\b/,
  /\bdeck box\b/,
  /\bcode card\b/,
  /\bonline code\b/,
];

export function detectJunk(cleanedTitle: string): { isJunk: boolean; reason?: string } {
  for (const pattern of BULK_PATTERNS) {
    if (pattern.test(cleanedTitle)) {
      return { isJunk: true, reason: 'bulk_lot' };
    }
  }

  for (const pattern of FAKE_PATTERNS) {
    if (pattern.test(cleanedTitle)) {
      return { isJunk: true, reason: 'fake' };
    }
  }

  for (const pattern of NON_CARD_PATTERNS) {
    if (pattern.test(cleanedTitle)) {
      return { isJunk: true, reason: 'non_card' };
    }
  }

  return { isJunk: false };
}
