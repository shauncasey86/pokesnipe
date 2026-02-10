export interface CardNumber {
  number: number;
  prefix: string | null;
  denominator: number | null;
}

// Fraction formats: optional prefix + number / optional prefix + denominator
const FRACTION_REGEX = /\b(SV|TG|GG|SWSH|SM|XY)?0*(\d{1,4})\s*\/\s*(?:(?:SV|TG|GG|SWSH|SM|XY))?0*(\d{1,4})\b/i;

// Hash format: #123
const HASH_REGEX = /#0*(\d{1,4})\b/;

// "No." format: No. 123 or No 123
const NO_REGEX = /\bNo\.?\s*0*(\d{1,4})\b/i;

export function extractCardNumber(cleanedTitle: string): CardNumber | null {
  // Priority 1: Fraction formats (with optional prefix)
  const fractionMatch = cleanedTitle.match(FRACTION_REGEX);
  if (fractionMatch) {
    return {
      number: parseInt(fractionMatch[2]!, 10),
      prefix: fractionMatch[1] ? fractionMatch[1].toUpperCase() : null,
      denominator: parseInt(fractionMatch[3]!, 10),
    };
  }

  // Priority 2: Hash format
  const hashMatch = cleanedTitle.match(HASH_REGEX);
  if (hashMatch) {
    return {
      number: parseInt(hashMatch[1]!, 10),
      prefix: null,
      denominator: null,
    };
  }

  // Priority 3: "No." format
  const noMatch = cleanedTitle.match(NO_REGEX);
  if (noMatch) {
    return {
      number: parseInt(noMatch[1]!, 10),
      prefix: null,
      denominator: null,
    };
  }

  return null;
}
