// src/services/parser/types.ts

// ─────────────────────────────────────────────────────────────────────────────
// Confidence Levels
// ─────────────────────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'PERFECT' | 'HIGH' | 'MEDIUM' | 'LOW';

// ─────────────────────────────────────────────────────────────────────────────
// Card Variant
// ─────────────────────────────────────────────────────────────────────────────

export interface CardVariant {
  isHolo: boolean;
  isReverseHolo: boolean;
  isFullArt: boolean;
  isAltArt: boolean;
  isPromo: boolean;
  isSecret: boolean;
  isRainbow: boolean;
  isGold: boolean;
  variantName: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Card Language
// ─────────────────────────────────────────────────────────────────────────────

export type CardLanguage = 'English' | 'Japanese' | 'Korean' | 'Chinese' | 'Unknown';

export const LANGUAGE_CODES: Record<CardLanguage, string> = {
  English: 'EN',
  Japanese: 'JA',
  Korean: 'KR',
  Chinese: 'CN',
  Unknown: 'EN', // Default to English for UK listings
};

// ─────────────────────────────────────────────────────────────────────────────
// Card Condition (for raw price matching)
// ─────────────────────────────────────────────────────────────────────────────

export type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DM' | null;

export const CONDITION_MAP: Record<string, CardCondition> = {
  // Near Mint
  NM: 'NM',
  'NEAR MINT': 'NM',
  'NEARMINT': 'NM',
  'NM-MINT': 'NM',
  'NM/M': 'NM',
  'NM-M': 'NM',
  MINT: 'NM',
  M: 'NM',
  'PACK FRESH': 'NM',
  EXCELLENT: 'NM',
  EX: 'NM',

  // Lightly Played
  LP: 'LP',
  'LIGHTLY PLAYED': 'LP',
  'LIGHT PLAY': 'LP',
  'LIGHT PLAYED': 'LP',
  'SLIGHTLY PLAYED': 'LP',
  SP: 'LP',
  'VERY GOOD': 'LP',
  VG: 'LP',
  'EX-NM': 'LP',

  // Moderately Played
  MP: 'MP',
  'MODERATELY PLAYED': 'MP',
  'MODERATE PLAY': 'MP',
  'MOD PLAYED': 'MP',
  PLAYED: 'MP',
  PL: 'MP',
  GOOD: 'MP',
  GD: 'MP',

  // Heavily Played
  HP: 'HP',
  'HEAVILY PLAYED': 'HP',
  'HEAVY PLAY': 'HP',
  'WELL PLAYED': 'HP',
  FAIR: 'HP',
  FR: 'HP',

  // Damaged
  DM: 'DM',
  DMG: 'DM',
  DAMAGED: 'DM',
  POOR: 'DM',
  PR: 'DM',
};

// ─────────────────────────────────────────────────────────────────────────────
// Card Type
// ─────────────────────────────────────────────────────────────────────────────

export type CardType =
  | 'V'
  | 'VMAX'
  | 'VSTAR'
  | 'EX'
  | 'GX'
  | 'ex'
  | 'MEGA'
  | 'BREAK'
  | 'Prime'
  | 'LV.X'
  | 'Gold Star'
  | 'Trainer'
  | 'Energy'
  | null;

// ─────────────────────────────────────────────────────────────────────────────
// Grading Companies
// ─────────────────────────────────────────────────────────────────────────────

export type GradingCompany =
  | 'PSA'
  | 'CGC'
  | 'BGS'
  | 'SGC'
  | 'ACE'
  | 'TAG'
  | 'AGS'
  | 'GMA'
  | 'MNT'
  | 'PCA'
  | 'Beckett';

export const GRADING_COMPANIES: string[] = [
  'PSA',
  'CGC',
  'BGS',
  'SGC',
  'ACE',
  'TAG',
  'AGS',
  'GMA',
  'MNT',
  'PCA',
  'Beckett',
];

// ─────────────────────────────────────────────────────────────────────────────
// Parsed Title Result
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedTitle {
  // Original input
  originalTitle: string;
  normalizedTitle: string;

  // Card identification
  cardName: string | null;
  cardNumber: string | null;
  printedNumber: string | null;

  // Set information
  setName: string | null;
  setCode: string | null;

  // Grading (for graded cards)
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  gradeModifier: string | null;

  // Condition (for raw cards)
  condition: CardCondition;

  // Variant information
  variant: CardVariant;

  // Language
  language: CardLanguage;
  languageCode: string;

  // Edition
  isFirstEdition: boolean;
  isShadowless: boolean;

  // Card type
  cardType: CardType;

  // Confidence
  confidence: ConfidenceLevel;
  confidenceScore: number;

  // Debug info
  matchedPatterns: string[];
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Set Pattern (for future expansion matching)
// ─────────────────────────────────────────────────────────────────────────────

export interface SetPattern {
  names: string[];
  code: string;
  scrydexId: string;
  series: string;
}