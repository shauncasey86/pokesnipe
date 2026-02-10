/**
 * Jaro-Winkler string similarity for card name validation.
 * Pure function — no I/O.
 */

/**
 * Jaro similarity between two strings.
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matchDistance = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0);

  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3
  );
}

/**
 * Jaro-Winkler similarity (boosts score for common prefixes).
 */
export function jaroWinkler(s1: string, s2: string): number {
  const jaro = jaroSimilarity(s1, s2);

  // Common prefix length (up to 4 characters)
  let prefixLength = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) prefixLength++;
    else break;
  }

  const p = 0.1; // Winkler scaling factor
  return jaro + prefixLength * p * (1 - jaro);
}

/**
 * Validate a candidate card name against the extracted name signal.
 * Both inputs should be lowercased.
 *
 * Returns a similarity score 0-1. Hard gate: < 0.60 = reject.
 */
export function validateName(extracted: string, candidate: string): number {
  const a = extracted.toLowerCase().trim();
  const b = candidate.toLowerCase().trim();

  // Exact match
  if (a === b) return 1.0;

  // One contains the other (e.g., "charizard" matches "charizard vmax")
  if (b.includes(a) || a.includes(b)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return Math.max(0.80, ratio);
  }

  return jaroWinkler(a, b);
}

export const NAME_HARD_GATE = 0.60;
