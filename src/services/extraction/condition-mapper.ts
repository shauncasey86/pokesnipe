import pino from 'pino';

const log = pino({ name: 'condition-mapper' });

export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DM';

export interface ConditionResult {
  condition: Condition;
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
const UNGRADED_CONDITION_MAP: Record<string, Condition> = {
  '400010': 'NM', // Near Mint or Better
  '400015': 'LP', // Lightly Played (Excellent)
  '400016': 'MP', // Moderately Played (Very Good)
  '400017': 'HP', // Heavily Played (Poor)
  '400018': 'DM', // Damaged
};

// --- Text-based descriptor name mapping ---
// The eBay Browse API returns human-readable text names in conditionDescriptors
// instead of numeric IDs. This maps text names to the equivalent numeric ID
// so the same downstream logic works for both formats.
const DESCRIPTOR_TEXT_NAME_MAP: Record<string, string> = {
  'card condition':        '40001',
  'condition':             '40001',
  'card quality':          '40001',
  'professional grader':   '27501',
  'grader':                '27501',
  'grading company':       '27501',
  'grade':                 '27502',
  'psa grade':             '27502',
  'cgc grade':             '27502',
  'bgs grade':             '27502',
  'certification number':  '27503',
  'cert number':           '27503',
  'cert #':                '27503',
  'cert no':               '27503',
};

// --- Text-based ungraded condition value mapping ---
// When eBay returns text values like "Moderately played (Very good)" instead
// of numeric value IDs like "400016", use this map to resolve the condition.
const UNGRADED_TEXT_CONDITION_MAP: Record<string, Condition> = {
  'near mint or better':            'NM',
  'near mint':                      'NM',
  'mint':                           'NM',
  'lightly played (excellent)':     'LP',
  'lightly played':                 'LP',
  'excellent':                      'LP',
  'moderately played (very good)':  'MP',
  'moderately played':              'MP',
  'very good':                      'MP',
  'heavily played (poor)':          'HP',
  'heavily played':                 'HP',
  'poor':                           'HP',
  'damaged':                        'DM',
};

// --- Text-based grade value mapping ---
// When eBay returns text values like "9.5" or "Authentic" instead of numeric
// value IDs like "275021" or "2750219", use this map to normalise the grade.
const TEXT_GRADE_MAP: Record<string, string> = {
  '10': '10',
  '9.5': '9.5',
  '9': '9',
  '8.5': '8.5',
  '8': '8',
  '7.5': '7.5',
  '7': '7',
  '6.5': '6.5',
  '6': '6',
  '5.5': '5.5',
  '5': '5',
  '4.5': '4.5',
  '4': '4',
  '3.5': '3.5',
  '3': '3',
  '2.5': '2.5',
  '2': '2',
  '1.5': '1.5',
  '1': '1',
  'authentic': 'Authentic',
  'authentic altered': 'Authentic Altered',
  'authentic - trimmed': 'Authentic - Trimmed',
  'authentic - coloured': 'Authentic - Coloured',
};

// --- Text-based grading company value mapping ---
const TEXT_GRADER_MAP: Record<string, string> = {
  'psa': 'PSA', 'bccg': 'BCCG', 'bvg': 'BVG', 'bgs': 'BGS',
  'csg': 'CSG', 'cgc': 'CGC', 'sgc': 'SGC', 'ksa': 'KSA',
  'gma': 'GMA', 'hga': 'HGA', 'isa': 'ISA', 'pca': 'PCA',
  'gsg': 'GSG', 'pgs': 'PGS', 'mnt': 'MNT', 'tag': 'TAG',
  'rare edition': 'Rare Edition', 'rcg': 'RCG', 'pcg': 'PCG',
  'ace grading': 'Ace Grading', 'cga': 'CGA', 'tcg': 'TCG',
  'ark': 'ARK', 'other': 'Other',
};

// --- localizedAspects text mapping ---
const LOCALIZED_CONDITION_MAP: Record<string, Condition> = {
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
  'damaged': 'DM',
};

// --- eBay top-level condition text mapping ---
const EBAY_CONDITION_TEXT_MAP: Record<string, Condition> = {
  'near mint or better': 'NM',
  'near mint': 'NM',
  'like new': 'NM',
  'lightly played (excellent)': 'LP',
  'lightly played': 'LP',
  'excellent': 'LP',
  'moderately played (very good)': 'MP',
  'moderately played': 'MP',
  'very good': 'MP',
  'heavily played (poor)': 'HP',
  'heavily played': 'HP',
  'poor': 'HP',
  'damaged': 'DM',
};

// --- Title grading patterns ---
// Matches "PSA 10", "CGC 9.5", "BGS 8", "ACE 10" etc. in titles
// so Phase 1 can use graded pricing before conditionDescriptors are available.
const TITLE_GRADING_PATTERN =
  /\b(psa|cgc|bgs|sgc|bvg|bccg|csg|ksa|gma|hga|isa|pca|gsg|pgs|mnt|tag|rcg|pcg|ace(?:\s+grading)?|cga|tcg|ark)\s+(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6|5\.5|5|4\.5|4|3\.5|3|2\.5|2|1\.5|1|authentic)\b/i;

// --- Title condition patterns ---
const TITLE_CONDITION_PATTERNS: [RegExp, Condition][] = [
  [/\bnear mint\b/, 'NM'],
  [/\bnm[\s/+\-]?m?\b/, 'NM'],
  [/\bnm\+?\b/, 'NM'],
  [/\bmint\b/, 'NM'],
  [/\blightly played\b/, 'LP'],
  [/\blp\b/, 'LP'],
  [/\bexcellent\b/, 'LP'],
  [/\bmoderately played\b/, 'MP'],
  [/\bmp\b/, 'MP'],
  [/\bheavily played\b/, 'HP'],
  [/\bhp\b/, 'HP'],
  [/\bpoor\b/, 'HP'],
  [/\bdamaged\b/, 'DM'],
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
  conditionDescriptors?: Array<{ name: string; values: string[]; additionalInfo?: string[] }>;
  localizedAspects?: Array<{ name: string; value: string }> | null;
  title?: string;
  conditionText?: string | null;
}): ConditionResult {
  const descriptors = listing.conditionDescriptors ?? [];
  const rawDescriptorIds: string[] = [];

  // Collect all descriptor IDs and additionalInfo for audit trail
  for (const d of descriptors) {
    rawDescriptorIds.push(d.name);
    for (const v of d.values) {
      rawDescriptorIds.push(v);
    }
    if (d.additionalInfo?.length) {
      for (const info of d.additionalInfo) {
        rawDescriptorIds.push(`info:${info}`);
      }
    }
  }

  // Priority 1: Condition Descriptors (numeric IDs or text names from eBay)
  if (descriptors.length > 0) {
    let isGraded = false;
    let gradingCompany: string | null = null;
    let grade: string | null = null;
    let certNumber: string | null = null;
    let detectedCondition: Condition | null = null;
    const knownDescriptorNames = new Set(['27501', '27502', '27503', '40001']);

    for (const descriptor of descriptors) {
      const value = descriptor.values[0];
      if (!value) continue;

      // Resolve text descriptor names to numeric IDs.
      // eBay Browse API returns text names like "Card Condition" instead of "40001".
      const resolvedName =
        DESCRIPTOR_TEXT_NAME_MAP[descriptor.name.toLowerCase()] ?? descriptor.name;
      const valueLower = value.toLowerCase().trim();

      // Grading company (descriptor name: '27501')
      if (resolvedName === '27501') {
        isGraded = true;
        gradingCompany = GRADER_MAP[value] ?? TEXT_GRADER_MAP[valueLower] ?? value;
      }

      // Grade (descriptor name: '27502')
      else if (resolvedName === '27502') {
        grade = GRADE_MAP[value] ?? TEXT_GRADE_MAP[valueLower] ?? value;
      }

      // Cert number (descriptor name: '27503') — free text
      else if (resolvedName === '27503') {
        certNumber = value;
      }

      // Ungraded condition (descriptor name: '40001')
      else if (resolvedName === '40001') {
        // Try numeric ID first, then text-based matching
        const mapped = UNGRADED_CONDITION_MAP[value] ?? UNGRADED_TEXT_CONDITION_MAP[valueLower];
        if (mapped) {
          detectedCondition = mapped;
        }
      }

      // Fix #5: Warn on unmapped descriptor names
      else if (!knownDescriptorNames.has(resolvedName)) {
        log.warn({ descriptorName: descriptor.name, resolvedName, value }, 'Unmapped condition descriptor — skipped');
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

  // Priority 3: eBay top-level condition text (from search/getItem)
  if (listing.conditionText) {
    const normalized = listing.conditionText.toLowerCase().trim();
    const mapped = EBAY_CONDITION_TEXT_MAP[normalized];
    if (mapped) {
      return {
        condition: mapped,
        source: 'localized_aspects' as const,
        isGraded: false,
        gradingCompany: null,
        grade: null,
        certNumber: null,
        rawDescriptorIds,
      };
    }
  }

  // Priority 4: Title parsing
  if (listing.title) {
    const lowerTitle = listing.title.toLowerCase();

    // 4a: Detect graded cards from title (e.g. "PSA 10", "CGC 9.5")
    const gradingMatch = TITLE_GRADING_PATTERN.exec(lowerTitle);
    if (gradingMatch) {
      const company = TEXT_GRADER_MAP[gradingMatch[1].toLowerCase()] ?? gradingMatch[1].toUpperCase();
      const grade = TEXT_GRADE_MAP[gradingMatch[2].toLowerCase()] ?? gradingMatch[2];
      return {
        condition: 'NM',
        source: 'title',
        isGraded: true,
        gradingCompany: company,
        grade,
        certNumber: null,
        rawDescriptorIds,
      };
    }

    // 4b: Detect raw condition from title
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

  // Priority 5: Default
  return { ...makeDefault(), rawDescriptorIds };
}
