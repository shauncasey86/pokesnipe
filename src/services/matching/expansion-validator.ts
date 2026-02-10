import { jaroWinkler } from './name-validator.js';

/**
 * Cross-validate an extracted set/expansion name against a candidate expansion.
 * Returns a confidence score 0-1.
 *
 * If no set name was extracted, returns a neutral score (0.50) so it
 * doesn't penalize or reward the match.
 */
export function validateExpansion(
  extractedSetName: string | null,
  candidateExpansionName: string,
  candidateExpansionCode: string,
): number {
  if (!extractedSetName) return 0.50; // neutral — no signal

  const extracted = extractedSetName.toLowerCase().trim();
  const name = candidateExpansionName.toLowerCase().trim();
  const code = candidateExpansionCode.toLowerCase().trim();

  // Exact match on name
  if (extracted === name) return 1.0;

  // Exact match on code (e.g., "sv1" or "swsh12pt5")
  if (extracted === code) return 0.95;

  // Extracted is contained in expansion name or vice versa
  if (name.includes(extracted) || extracted.includes(name)) {
    const ratio = Math.min(extracted.length, name.length) / Math.max(extracted.length, name.length);
    return Math.max(0.75, ratio);
  }

  // Fuzzy match
  return jaroWinkler(extracted, name);
}
