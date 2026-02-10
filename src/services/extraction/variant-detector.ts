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
  'secret rare',
  'gold',
  'rainbow',
  'shadowless',
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

  // Check additional variant signals
  for (const signal of ADDITIONAL_VARIANTS) {
    if (cleanedTitle.includes(signal)) {
      return signal;
    }
  }

  return null;
}
