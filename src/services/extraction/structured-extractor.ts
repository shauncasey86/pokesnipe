export interface StructuredSignals {
  cardName: string | null;
  cardNumber: string | null;
  setName: string | null;
  rarity: string | null;
  language: string | null;
  gradingCompany: string | null;
  grade: string | null;
  year: string | null;
}

const ASPECT_MAP: Record<string, keyof StructuredSignals> = {
  'Card Name': 'cardName',
  'Character': 'cardName',
  'Card Number': 'cardNumber',
  'Set': 'setName',
  'Expansion': 'setName',
  'Rarity': 'rarity',
  'Language': 'language',
  'Professional Grader': 'gradingCompany',
  'Grade': 'grade',
  'Year Manufactured': 'year',
};

// Primary fields take precedence over fallback fields
const PRIMARY_FIELDS: Record<string, string> = {
  'Character': 'Card Name',
  'Expansion': 'Set',
};

export function extractStructuredData(
  aspects: Array<{ name: string; value: string }>,
): StructuredSignals {
  const signals: StructuredSignals = {
    cardName: null,
    cardNumber: null,
    setName: null,
    rarity: null,
    language: null,
    gradingCompany: null,
    grade: null,
    year: null,
  };

  // First pass: collect all mapped values
  for (const aspect of aspects) {
    const field = ASPECT_MAP[aspect.name];
    if (!field) continue;

    // If this is a fallback field, only set if primary hasn't been set
    const primaryName = PRIMARY_FIELDS[aspect.name];
    if (primaryName) {
      // This is a fallback — only use if the signal is still null
      if (signals[field] === null) {
        signals[field] = aspect.value;
      }
    } else {
      // This is a primary field — always set (overrides fallback)
      signals[field] = aspect.value;
    }
  }

  return signals;
}
