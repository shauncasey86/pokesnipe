export type Tier = 'GRAIL' | 'HIT' | 'FLIP' | 'SLEEP';
export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DM';
export type LiquidityGrade = 'high' | 'medium' | 'low' | 'illiquid';

export interface Deal {
  deal_id: string;
  event_id: number;
  ebay_item_id: string;
  ebay_title: string;
  card_id: string | null;
  variant_id: number | null;
  status: string;
  ebay_price_gbp: number;
  ebay_shipping_gbp: number;
  buyer_prot_fee: number;
  total_cost_gbp: number;
  market_price_usd: number | null;
  market_price_gbp: number | null;
  exchange_rate: number | null;
  profit_gbp: number | null;
  profit_percent: number | null;
  tier: Tier;
  confidence: number | null;
  confidence_tier: string | null;
  condition: Condition;
  condition_source: string | null;
  is_graded: boolean;
  grading_company: string | null;
  grade: string | null;
  liquidity_score: number | null;
  liquidity_grade: LiquidityGrade | null;
  trend_7d: number | null;
  trend_30d: number | null;
  ebay_image_url: string | null;
  ebay_url: string;
  seller_name: string | null;
  seller_feedback: number | null;
  listed_at: string | null;
  reviewed_at: string | null;
  is_correct_match: boolean | null;
  incorrect_reason: string | null;
  created_at: string;
  expires_at: string | null;
  cardName: string | null;
}

export interface DealDetail extends Deal {
  card_name: string | null;
  card_number: string | null;
  expansion_name: string | null;
  expansion_code: string | null;
  variant_name: string | null;
  variant_prices: Record<string, { low: number; market: number }> | null;
  variant_trends: Record<string, Record<string, { price_change: number; percent_change: number }>> | null;
  match_signals: {
    confidence?: {
      composite: number;
      name?: number;
      number?: number;
      denom?: number;
      expansion?: number;
      variant?: number;
      extract?: number;
    };
    liquidity?: {
      composite: number;
      grade: LiquidityGrade;
      signals?: {
        trend?: number;
        prices?: number;
        spread?: number;
        supply?: number;
        sold?: number;
        velocity?: number | null;
      };
    };
  } | null;
}

export interface DealsResponse {
  data: Deal[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SystemStatus {
  scanner: {
    status: string;
    isRunning: boolean;
    lastRun: string | null;
    lastError: string | null;
    dealsToday: number;
    grailsToday: number;
    activeDeals: number;
    dedupMemorySize: number;
  };
  sync: {
    totalCards: number;
    totalExpansions: number;
    lastSync: string | null;
  };
  ebay: {
    callsToday: number;
    dailyLimit: number;
    remaining: number;
    status: string;
  };
  exchangeRate: {
    rate: number | null;
    fetchedAt: string | null;
    isStale: boolean;
  };
  accuracy: {
    rolling7d: number | null;
    totalReviewed: number;
    totalCorrect: number;
  };
  scrydex: {
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
    status: string;
  } | null;
  jobs: Record<string, unknown>;
}

export interface Preferences {
  data: Record<string, unknown>;
  updatedAt: string | null;
}

export interface FilterState {
  tiers: Tier[];
  conditions: Condition[];
  liquidityGrades: LiquidityGrade[];
  confidenceLevels: string[];
  timeWindow: string;
  minProfitPercent: number;
  gradedOnly: boolean;
}

export interface LookupResult {
  itemId: string;
  ebayUrl: string;
  listing: {
    title: string;
    price: { value: string; currency: string } | null;
    shipping: { value: string; currency: string } | null;
    condition: string | null;
    conditionDescriptors: Array<{ name: string; values: Array<{ content: string }> }> | null;
    image: string | null;
    seller: { username: string; feedbackPercentage: string; feedbackScore: number } | null;
    quantitySold: number | null;
  };
  signals: {
    rejected: boolean;
    rejectReason?: string;
    cardNumber?: unknown;
    condition?: unknown;
    variant?: unknown;
    expansion?: unknown;
    isGraded?: boolean;
  };
  match: {
    cardId: string;
    cardName: string;
    cardNumber: string;
    variantName: string;
    confidence: number;
  } | null;
  profit: {
    profitGBP: number;
    profitPercent: number;
    tier: Tier;
    totalCostGBP: number;
    marketPriceGBP: number;
  } | null;
  liquidity: {
    composite: number;
    grade: LiquidityGrade;
    signals: Record<string, number>;
  } | null;
}
