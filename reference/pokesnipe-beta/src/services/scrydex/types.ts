// src/services/scrydex/types.ts
export interface ScrydexExpansion {
  id: string;
  name: string;
  series: string;
  code: string;
  total: number;
  printed_total: number;
  language: string;
  language_code: string;
  release_date: string;
  is_online_only: boolean;
  logo?: string;
  symbol?: string;
  translation?: {
    en?: {
      name: string;
    };
  };
}
export interface ScrydexPrice {
  condition?: string;
  is_perfect?: boolean;
  is_signed?: boolean;
  is_error?: boolean;
  type: 'raw' | 'graded';
  low?: number;
  mid?: number;
  high?: number;
  market?: number;
  currency: string;
  grade?: string;
  company?: string;
  trends?: Record<string, { price_change: number; percent_change: number }>;
}
export interface ScrydexVariant {
  name: string;
  images?: Array<{ type: string; small?: string; medium?: string; large?: string }>;
  prices?: ScrydexPrice[];
}
export interface ScrydexCard {
  id: string;
  name: string;
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  hp?: string;
  level?: string;
  evolves_from?: string[];
  rules?: string[];
  ancient_trait?: { name: string; text: string };
  abilities?: Array<{ type: string; name: string; text: string }>;
  attacks?: Array<{
    cost: string[];
    converted_energy_cost: number;
    name: string;
    text: string;
    damage: string;
  }>;
  weaknesses?: Array<{ type: string; value: string }>;
  resistances?: Array<{ type: string; value: string }>;
  retreat_cost?: string[];
  converted_retreat_cost?: number;
  number: string;
  printed_number?: string;
  rarity?: string;
  rarity_code?: string;
  artist?: string;
  national_pokedex_numbers?: number[];
  flavor_text?: string;
  regulation_mark?: string;
  images?: Array<{ type: string; small?: string; medium?: string; large?: string }>;
  expansion?: {
    id: string;
    name: string;
    series: string;
    total: number;
    printed_total: number;
    language: string;
    language_code: string;
    release_date: string;
    is_online_only: boolean;
    logo?: string;
    symbol?: string;
  };
  language?: string;
  language_code?: string;
  expansion_sort_order?: number;
  variants?: ScrydexVariant[];
}
export interface ScrydexPaginatedResponse<T> {
  status?: string;
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}
export interface ScrydexSingleResponse<T> {
  status?: string;
  data: T;
}
export interface ScrydexUsageResponse {
  // Actual API response fields
  total_credits_consumed: number;
  overage_credits_consumed: number;
  period_start: string;
  period_end: string;
  daily_usage?: Array<{ date: string; credits: number }>;
  // Legacy fields (for backwards compatibility)
  total_credits?: number;
  remaining_credits?: number;
  used_credits?: number;
  overage_credit_rate?: number;
}
export interface CardSearchParams {
  q?: string;
  page?: number;
  pageSize?: number;
  select?: string;
  include?: string;
  orderBy?: string;
}
export interface ExpansionSearchParams {
  q?: string;
  page?: number;
  pageSize?: number;
  select?: string;
  orderBy?: string;
}