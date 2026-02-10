// Order matters: longer/more specific patterns must be checked first
const VARIANT_KEYWORDS: [string, string[]][] = [
  ['reverseHolofoil', ['reverse holo', 'reverse holographic', 'rev holo', 'reverse']],
  ['firstEditionHolofoil', ['1st edition holo', '1st ed holo', 'first edition holo']],
  ['firstEditionNormal', ['1st edition', '1st ed', 'first edition']],
  ['unlimitedHolofoil', ['unlimited holo']],
  ['unlimitedNormal', ['unlimited']],
  ['holofoil', ['holo', 'holographic', 'holo rare']],
];

const ADDITIONAL_VARIANTS = [
  'full art',
  'alt art',
  'alternate art',
  'special illustration rare',
  'special art rare',
  'illustration rare',
  'art rare',
  'character rare',
  'trainer gallery',
  'secret rare',
  'gold',
  'rainbow',
  'shadowless',
];

// Short abbreviations need word-boundary matching to avoid false positives
// (e.g. "sir" inside "desire", "ar" inside "card")
const VARIANT_ABBREVIATIONS: [RegExp, string][] = [
  [/\bsir\b/, 'special illustration rare'],
  [/\bsar\b/, 'special art rare'],
  [/\bchr\b/, 'character rare'],
  [/\btg\b|\btg\d/, 'trainer gallery'],  // "tg" standalone or "tg23/tg30" format
];

export function detectVariant(cleanedTitle: string): string | null {
  // Check mapped variant keywords first
  for (const [variant, keywords] of VARIANT_KEYWORDS) {
    for (const keyword of keywords) {
      if (cleanedTitle.includes(keyword)) {
        return variant;
      }
    }
  }

  // Check additional variant signals (multi-word, safe with includes)
  for (const signal of ADDITIONAL_VARIANTS) {
    if (cleanedTitle.includes(signal)) {
      return signal;
    }
  }

  // Check short abbreviations with word-boundary regex
  for (const [pattern, signal] of VARIANT_ABBREVIATIONS) {
    if (pattern.test(cleanedTitle)) {
      return signal;
    }
  }

  return null;
}
