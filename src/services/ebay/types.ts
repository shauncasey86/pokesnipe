// --- Search response ---

export interface EbaySearchResponse {
  href: string;
  total: number;
  next?: string;
  limit: number;
  offset: number;
  itemSummaries?: EbayItemSummary[];
}

export interface EbayItemSummary {
  itemId: string;
  title: string;
  price: { value: string; currency: string };
  shippingOptions?: Array<{
    shippingCostType: string;
    shippingCost?: { value: string; currency: string };
  }>;
  condition: string | null;
  conditionId: string | null;
  image?: { imageUrl: string };
  itemWebUrl: string;
  seller: {
    username: string;
    feedbackScore: number;
    feedbackPercentage: string;
  };
  itemCreationDate?: string;
  buyingOptions: string[];
  categories?: Array<{ categoryId: string; categoryName: string }>;
  itemGroupType?: string;
  quantitySold?: number;
}

// --- getItem response (enriched) ---

export interface EbayItemDetail extends EbayItemSummary {
  localizedAspects?: EbayLocalizedAspect[];
  conditionDescriptors?: EbayConditionDescriptor[];
  description?: string;
  shortDescription?: string;
}

export interface EbayLocalizedAspect {
  type: string;
  name: string;
  value: string;
}

export interface EbayConditionDescriptor {
  name: string;
  values: string[];
}

// --- Budget ---

export interface BudgetStatus {
  dailyLimit: number;
  used: number;
  remaining: number;
  resetAt: Date;
  isLow: boolean;
}
