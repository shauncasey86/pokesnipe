export interface ConditionResult {
  condition: 'NM' | 'LP' | 'MP' | 'HP';
  source: 'condition_descriptor' | 'localized_aspects' | 'title' | 'default';
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  rawDescriptors: unknown[];
}

// --- Grading company detection from descriptor content ---
const GRADING_COMPANIES = [
  'PSA', 'BCCG', 'BVG', 'BGS', 'CSG', 'CGC', 'SGC',
  'KSA', 'GMA', 'HGA', 'ISA', 'PCA', 'GSG', 'PGS',
  'MNT', 'TAG', 'RCG', 'PCG', 'CGA', 'TCG', 'ARK',
  'Ace Grading', 'Rare Edition',
];

// --- Condition text patterns (matched against descriptor content) ---
const DESCRIPTOR_CONDITION_PATTERNS: [RegExp, 'NM' | 'LP' | 'MP' | 'HP'][] = [
  [/\bnear mint\b/i, 'NM'],
  [/\bmint\b/i, 'NM'],
  [/\blightly played\b/i, 'LP'],
  [/\bexcellent\b/i, 'LP'],
  [/\bmoderately played\b/i, 'MP'],
  [/\bvery good\b/i, 'MP'],
  [/\bgood\b/i, 'MP'],
  [/\bheavily played\b/i, 'HP'],
  [/\bpoor\b/i, 'HP'],
];

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

interface DescriptorValue {
  content: string;
  additionalInfo?: string[];
}

function getContent(values: DescriptorValue[] | string[]): string | null {
  const first = values[0];
  if (!first) return null;
  return typeof first === 'string' ? first : first.content;
}

function makeDefault(): ConditionResult {
  return {
    condition: 'LP',
    source: 'default',
    isGraded: false,
    gradingCompany: null,
    grade: null,
    certNumber: null,
    rawDescriptors: [],
  };
}

function parseConditionFromText(text: string): 'NM' | 'LP' | 'MP' | 'HP' | null {
  const lower = text.toLowerCase();
  // Check exact match first (handles "Lightly played (Excellent)" etc.)
  const exact = LOCALIZED_CONDITION_MAP[lower];
  if (exact) return exact;
  // Fall back to pattern matching
  for (const [pattern, condition] of DESCRIPTOR_CONDITION_PATTERNS) {
    if (pattern.test(text)) return condition;
  }
  return null;
}

function detectGradingCompany(text: string): string | null {
  for (const company of GRADING_COMPANIES) {
    if (text.toLowerCase().includes(company.toLowerCase())) return company;
  }
  return null;
}

function extractGradeFromText(text: string): string | null {
  // Look for numeric grades like "10", "9.5", etc.
  const match = text.match(/\b(\d{1,2}(?:\.\d)?)\b/);
  if (match) return match[1]!;
  // Check for text grades
  if (/\bauthentic\b/i.test(text)) return 'Authentic';
  return null;
}

export function extractCondition(listing: {
  conditionDescriptors?: Array<{ name: string; values: DescriptorValue[] | string[] }>;
  localizedAspects?: Array<{ name: string; value: string }> | null;
  title?: string;
}): ConditionResult {
  const descriptors = listing.conditionDescriptors ?? [];
  const rawDescriptors = descriptors as unknown[];

  // Priority 1: Condition Descriptors
  if (descriptors.length > 0) {
    let isGraded = false;
    let gradingCompany: string | null = null;
    let grade: string | null = null;
    let certNumber: string | null = null;
    let detectedCondition: 'NM' | 'LP' | 'MP' | 'HP' | null = null;

    for (const descriptor of descriptors) {
      const content = getContent(descriptor.values);
      if (!content) continue;

      const nameLower = descriptor.name.toLowerCase();

      // Route by descriptor name first (most reliable)
      if (nameLower === 'professional grader') {
        isGraded = true;
        gradingCompany = detectGradingCompany(content) ?? content;
      } else if (nameLower === 'grade') {
        grade = content;
      } else if (nameLower === 'certification number') {
        certNumber = content;
      } else if (nameLower === 'card condition') {
        const cond = parseConditionFromText(content);
        if (cond) detectedCondition = cond;
      } else {
        // Fallback: scan content for grading company or condition
        const company = detectGradingCompany(content);
        if (company) {
          isGraded = true;
          gradingCompany = company;
        } else {
          const cond = parseConditionFromText(content);
          if (cond) detectedCondition = cond;
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
        rawDescriptors,
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
        rawDescriptors,
      };
    }
  }

  // Priority 2: localizedAspects
  if (listing.localizedAspects) {
    const conditionAspect = listing.localizedAspects.find(
      (a) => a.name === 'Card Condition',
    );
    if (conditionAspect) {
      const condition = parseConditionFromText(conditionAspect.value);
      if (condition) {
        return {
          condition,
          source: 'localized_aspects',
          isGraded: false,
          gradingCompany: null,
          grade: null,
          certNumber: null,
          rawDescriptors,
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
          rawDescriptors,
        };
      }
    }
  }

  // Priority 4: Default
  return { ...makeDefault(), rawDescriptors };
}
