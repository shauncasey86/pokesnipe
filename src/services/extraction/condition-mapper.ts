export interface ConditionResult {
  condition: 'NM' | 'LP' | 'MP' | 'HP';
  source: 'condition_descriptor' | 'localized_aspects' | 'title' | 'default';
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  rawDescriptorIds: string[];
}

// --- Grading company (descriptor name: '27501') ---
const GRADER_MAP: Record<string, string> = {
  '275010': 'PSA',
  '275011': 'BCCG',
  '275012': 'BVG',
  '275013': 'BGS',
  '275014': 'CSG',
  '275015': 'CGC',
  '275016': 'SGC',
  '275017': 'KSA',
  '275018': 'GMA',
  '275019': 'HGA',
  '2750110': 'ISA',
  '2750111': 'PCA',
  '2750112': 'GSG',
  '2750113': 'PGS',
  '2750114': 'MNT',
  '2750115': 'TAG',
  '2750116': 'Rare Edition',
  '2750117': 'RCG',
  '2750118': 'PCG',
  '2750119': 'Ace Grading',
  '2750120': 'CGA',
  '2750121': 'TCG',
  '2750122': 'ARK',
  '2750123': 'Other',
};

// --- Grade (descriptor name: '27502') ---
const GRADE_MAP: Record<string, string> = {
  '275020': '10',
  '275021': '9.5',
  '275022': '9',
  '275023': '8.5',
  '275024': '8',
  '275025': '7.5',
  '275026': '7',
  '275027': '6.5',
  '275028': '6',
  '275029': '5.5',
  '2750210': '5',
  '2750211': '4.5',
  '2750212': '4',
  '2750213': '3.5',
  '2750214': '3',
  '2750215': '2.5',
  '2750216': '2',
  '2750217': '1.5',
  '2750218': '1',
  '2750219': 'Authentic',
  '2750220': 'Authentic Altered',
  '2750221': 'Authentic - Trimmed',
  '2750222': 'Authentic - Coloured',
};

// --- Ungraded condition (descriptor name: '40001') ---
const UNGRADED_CONDITION_MAP: Record<string, 'NM' | 'LP' | 'MP' | 'HP'> = {
  '400010': 'NM', // Near Mint or Better
  '400015': 'LP', // Lightly Played (Excellent)
  '400016': 'MP', // Moderately Played (Very Good)
  '400017': 'HP', // Heavily Played (Poor)
};

// --- localizedAspects text mapping ---
const LOCALIZED_CONDITION_MAP: Record<string, 'NM' | 'LP' | 'MP' | 'HP'> = {
  'near mint': 'NM',
  'mint': 'NM',
  'near mint or better': 'NM',
  'lightly played': 'LP',
  'excellent': 'LP',
  'lightly played (excellent)': 'LP',
  'moderately played': 'MP',
  'very good': 'MP',
  'moderately played (very good)': 'MP',
  'good': 'MP',
  'heavily played': 'HP',
  'poor': 'HP',
  'heavily played (poor)': 'HP',
};

// --- Title condition patterns ---
const TITLE_CONDITION_PATTERNS: [RegExp, 'NM' | 'LP' | 'MP' | 'HP'][] = [
  [/\bnear mint\b/, 'NM'],
  [/\bnm\b/, 'NM'],
  [/\blightly played\b/, 'LP'],
  [/\blp\b/, 'LP'],
  [/\bmoderately played\b/, 'MP'],
  [/\bmp\b/, 'MP'],
  [/\bheavily played\b/, 'HP'],
  [/\bhp\b/, 'HP'],
];

function makeDefault(): ConditionResult {
  return {
    condition: 'LP',
    source: 'default',
    isGraded: false,
    gradingCompany: null,
    grade: null,
    certNumber: null,
    rawDescriptorIds: [],
  };
}

export function extractCondition(listing: {
  conditionDescriptors?: Array<{ name: string; values: string[] }>;
  localizedAspects?: Array<{ name: string; value: string }> | null;
  title?: string;
}): ConditionResult {
  const descriptors = listing.conditionDescriptors ?? [];
  const rawDescriptorIds: string[] = [];

  // Collect all descriptor IDs for audit trail
  for (const d of descriptors) {
    rawDescriptorIds.push(d.name);
    for (const v of d.values) {
      rawDescriptorIds.push(v);
    }
  }

  // Priority 1: Condition Descriptors (numeric IDs from eBay)
  if (descriptors.length > 0) {
    let isGraded = false;
    let gradingCompany: string | null = null;
    let grade: string | null = null;
    let certNumber: string | null = null;
    let detectedCondition: 'NM' | 'LP' | 'MP' | 'HP' | null = null;

    for (const descriptor of descriptors) {
      const value = descriptor.values[0];
      if (!value) continue;

      // Grading company (descriptor name: '27501')
      if (descriptor.name === '27501') {
        isGraded = true;
        gradingCompany = GRADER_MAP[value] ?? value;
      }

      // Grade (descriptor name: '27502')
      if (descriptor.name === '27502') {
        grade = GRADE_MAP[value] ?? value;
      }

      // Cert number (descriptor name: '27503') — free text
      if (descriptor.name === '27503') {
        certNumber = value;
      }

      // Ungraded condition (descriptor name: '40001')
      if (descriptor.name === '40001') {
        const mapped = UNGRADED_CONDITION_MAP[value];
        if (mapped) {
          detectedCondition = mapped;
        }
      }
    }

    if (isGraded) {
      return {
        condition: 'NM',
        source: 'condition_descriptor',
        isGraded: true,
        gradingCompany,
        grade,
        certNumber,
        rawDescriptorIds,
      };
    }

    if (detectedCondition) {
      return {
        condition: detectedCondition,
        source: 'condition_descriptor',
        isGraded: false,
        gradingCompany: null,
        grade: null,
        certNumber: null,
        rawDescriptorIds,
      };
    }
  }

  // Priority 2: localizedAspects
  if (listing.localizedAspects) {
    const conditionAspect = listing.localizedAspects.find(
      (a) => a.name === 'Card Condition',
    );
    if (conditionAspect) {
      const condition = LOCALIZED_CONDITION_MAP[conditionAspect.value.toLowerCase()];
      if (condition) {
        return {
          condition,
          source: 'localized_aspects',
          isGraded: false,
          gradingCompany: null,
          grade: null,
          certNumber: null,
          rawDescriptorIds,
        };
      }
    }
  }

  // Priority 3: Title parsing
  if (listing.title) {
    const lowerTitle = listing.title.toLowerCase();
    for (const [pattern, condition] of TITLE_CONDITION_PATTERNS) {
      if (pattern.test(lowerTitle)) {
        return {
          condition,
          source: 'title',
          isGraded: false,
          gradingCompany: null,
          grade: null,
          certNumber: null,
          rawDescriptorIds,
        };
      }
    }
  }

  // Priority 4: Default
  return { ...makeDefault(), rawDescriptorIds };
}
