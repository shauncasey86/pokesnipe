// src/services/expansion/types.ts

// ─────────────────────────────────────────────────────────────────────────────
// Cached Expansion Data
// ─────────────────────────────────────────────────────────────────────────────

export interface CachedExpansion {
  id: string;
  name: string;
  series: string;
  code: string;
  total: number;
  printedTotal: number;
  language: string;
  languageCode: string;
  releaseDate: string;
  isOnlineOnly: boolean;
  logo: string | null;
  symbol: string | null;
}

// Alias for backwards compatibility
export type Expansion = CachedExpansion;

// ─────────────────────────────────────────────────────────────────────────────
// Match Result
// ─────────────────────────────────────────────────────────────────────────────

export interface ExpansionMatch {
  expansion: CachedExpansion;
  matchScore: number;
  matchType: 'exact' | 'exact_name' | 'alias' | 'id' | 'code' | 'fuzzy' | 'partial' | 'promo_code' | 'promo_prefix' | string;
  matchedOn: string;
}

export interface MatchResult {
  success: boolean;
  query: string;
  match: ExpansionMatch | null;
  alternates: ExpansionMatch[];
}

// Alias for backwards compatibility  
export type ExpansionMatchResult = MatchResult;

// ─────────────────────────────────────────────────────────────────────────────
// Expansion Cache Stats
// ─────────────────────────────────────────────────────────────────────────────

export interface ExpansionStats {
  totalExpansions: number;
  englishExpansions: number;
  japaneseExpansions: number;
  lastUpdated: Date | null;
  aliasCount: number;
}

// Alias for backwards compatibility
export type ExpansionCacheStats = ExpansionStats;