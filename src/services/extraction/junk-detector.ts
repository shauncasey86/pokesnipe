const BULK_PATTERNS = [
  /\blot\b/,
  /\bbundle\b/,
  /\bbulk\b/,
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
  /\bfan art\b/,
  /\baltered art\b/,
];

const NON_ENGLISH_PATTERNS = [
  /[\u3040-\u309F]/, // Hiragana
  /[\u30A0-\u30FF]/, // Katakana
  /[\u4E00-\u9FFF]/, // CJK Unified Ideographs (Chinese/Japanese)
  /[\uAC00-\uD7AF]/, // Korean Hangul
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
  /\bplaying card\b/,
  /\bpoker card\b/,
  /\btopps\b/,
  /\bcoin\b/,
];

// Language words indicating non-English cards (our pricing data is English-only)
const LANGUAGE_WORD_PATTERNS = [
  /\bjapanese\b/,
  /\bkorean\b/,
  /\bchinese\b/,
  /\bthai\b/,
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

  for (const pattern of NON_ENGLISH_PATTERNS) {
    if (pattern.test(cleanedTitle)) {
      return { isJunk: true, reason: 'non_english' };
    }
  }

  for (const pattern of LANGUAGE_WORD_PATTERNS) {
    if (pattern.test(cleanedTitle)) {
      return { isJunk: true, reason: 'non_english' };
    }
  }

  return { isJunk: false };
}
