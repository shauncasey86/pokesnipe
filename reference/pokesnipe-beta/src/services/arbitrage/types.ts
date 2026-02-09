// src/services/arbitrage/types.ts
// ═══════════════════════════════════════════════════════════════════════════
// Arbitrage Types
// ═══════════════════════════════════════════════════════════════════════════

// Deal tier levels
export type DealTier = 'PREMIUM' | 'HIGH' | 'STANDARD';

// A discovered arbitrage deal
export interface Deal {
  id: string;
  ebayItemId: string;
  ebayUrl: string;
  affiliateUrl: string;
  title: string;
  
  // Card information
  cardId: string;
  cardName: string;
  cardNumber: string;
  expansionId: string;
  expansionName: string;
  expansion: string;
  imageUrl: string | null;
  
  // Pricing (multiple naming conventions for compatibility)
  ebayPrice: number;
  ebayPriceGBP: number;
  shippingCost: number;
  shippingGBP: number;
  totalCost: number;
  totalCostGBP: number;
  marketValueUSD: number;
  marketValueGBP: number;
  exchangeRate: number;
  profitGBP: number;
  profitPercent: number;
  discountPercent: number;
  
  // Classification
  tier: DealTier;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  rawCondition: string | null;
  condition: string | null;
  variant: string | null;
  detectedVariant: string | null;

  // eBay condition from item specifics
  ebayCondition?: string | null;
  ebayConditionId?: string | null;
  conditionSource?: 'condition_descriptor' | 'item_specifics' | 'title' | 'default';

  // Seller info
  seller: string | null;
  sellerName: string | null;
  sellerFeedback: number | null;
  sellerFeedbackPercent: number | null;
  
  // Location info
  itemLocation: string | null;
  itemCountry: string | null;
  
  // Timestamps - allow both string and Date for flexibility
  foundAt: Date | string;
  discoveredAt: Date | string;
  expiresAt: Date | string;
  listingTime?: Date | string;
  
  // Matching confidence
  matchConfidence: number;
  matchType: string;
  
  // Match details for debugging
  matchDetails?: {
    isFirstEdition: boolean;
    isShadowless: boolean;
    isHolo: boolean;
    isReverseHolo: boolean;
    parsedSetName: string;
    parsedCardNumber: string;
    parsedName: string;
    expansionMatchType: string;
    expansionMatchScore: number;
  };
  
  // Scrydex data
  scrydexCard?: unknown;
  scrydexExpansion?: unknown;
  scrydexImageUrl?: string | null;
  expansionLogo?: string | null;
  expansionSymbol?: string | null;
  allPrices?: unknown[];
  cardDetails?: unknown;
  
  // Allow any additional properties
  [key: string]: unknown;
}

// Card details for price matching
export interface CardDetails {
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  condition: string;
}

// Threshold configuration
export interface ArbitrageThresholds {
  premium: { minDiscount: number; minValue: number };
  high: { minDiscount: number; minValue: number };
  standard: { minDiscount: number; minValue: number };
}

// Result from processing a listing
export interface ProcessResult {
  success: boolean;
  deal?: Deal;
  reason?: string;
}