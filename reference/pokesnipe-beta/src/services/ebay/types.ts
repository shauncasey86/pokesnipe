// src/services/ebay/types.ts
// ═══════════════════════════════════════════════════════════════════════════
// eBay API Types - Complete type definitions for eBay Browse API responses
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Price & Currency Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EbayPrice {
  /** Price value as string (eBay API returns strings) */
  value: string;
  
  /** Currency code (e.g., "GBP", "USD") */
  currency: string;
}

export interface EbayConvertedPrice {
  /** Converted price value */
  value: string;
  
  /** Converted currency code */
  currency: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seller Information
// ─────────────────────────────────────────────────────────────────────────────

export interface EbaySeller {
  /** Seller's eBay username */
  username?: string;
  
  /** Seller's feedback score (total number of feedback) */
  feedbackScore?: number;
  
  /** Seller's positive feedback percentage as string (e.g., "99.8") */
  feedbackPercentage?: string;
  
  /** Seller's feedback star rating (enum from eBay) */
  feedbackStarRating?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Item Location
// ─────────────────────────────────────────────────────────────────────────────

export interface EbayItemLocation {
  /** City name */
  city?: string;
  
  /** State or province code */
  stateOrProvince?: string;
  
  /** Postal code */
  postalCode?: string;
  
  /** Country code (2-letter ISO, e.g., "GB", "US", "DE") */
  country?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shipping Information
// ─────────────────────────────────────────────────────────────────────────────

export interface EbayShippingOption {
  /** Shipping service code */
  shippingServiceCode?: string;
  
  /** Shipping carrier code */
  shippingCarrierCode?: string;
  
  /** Shipping cost */
  shippingCost?: EbayPrice;
  
  /** Minimum estimated delivery date */
  minEstimatedDeliveryDate?: string;
  
  /** Maximum estimated delivery date */
  maxEstimatedDeliveryDate?: string;
  
  /** Type of shipping (e.g., "ECONOMY", "STANDARD", "EXPEDITED") */
  type?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Image Information
// ─────────────────────────────────────────────────────────────────────────────

export interface EbayImage {
  /** Image URL */
  imageUrl?: string;
  
  /** Image height in pixels */
  height?: number;
  
  /** Image width in pixels */
  width?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main eBay Listing Interface (Normalized from API Response)
// ─────────────────────────────────────────────────────────────────────────────

export interface EbayListing {
  // ═══════════════════════════════════════════════════════════════════════════
  // Core Identifiers
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Unique eBay item ID */
  itemId: string;
  
  /** Legacy item ID (for compatibility) */
  legacyItemId?: string;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Listing Details
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Listing title (what we parse for card info) */
  title: string;
  
  /** Short description (if available) */
  shortDescription?: string;
  
  /** eBay category ID */
  categoryId?: string;
  
  /** eBay category path (e.g., "Collectibles/Trading Cards/Pokemon") */
  categoryPath?: string;
  
  /** Item condition (e.g., "New", "Used", "Unspecified") */
  condition?: string;
  
  /** Item condition ID (numeric) */
  conditionId?: string;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Pricing (Normalized to GBP numbers)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Item price in GBP (parsed from string) */
  price: number;
  
  /** Original price currency */
  priceCurrency: string;
  
  /** Shipping cost in GBP (0 if free shipping) */
  shippingCost: number;
  
  /** Total cost (price + shipping) in GBP */
  totalCost: number;
  
  /** Whether shipping is free */
  freeShipping?: boolean;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // URLs & Images
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Direct URL to eBay listing */
  url: string;
  
  /** Primary image URL (can be null if no image) */
  imageUrl: string | null;
  
  /** All image URLs */
  additionalImages?: string[];
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Seller Information
  // ═══════════════════════════════════════════════════════════════════════════
  
  seller: {
    /** Seller username */
    username: string;
    
    /** Feedback score (total count) */
    feedbackScore: number;
    
    /** Positive feedback percentage (0-100, e.g., 99.8) */
    feedbackPercentage?: number;
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Location Information
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Item location as display string (e.g., "London, United Kingdom") */
  location?: string;
  
  /** Item country code (2-letter ISO, e.g., "GB", "US") */
  country?: string;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Listing Type & Status
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Buying format (FIXED_PRICE, AUCTION, etc.) */
  buyingOptions?: string[];
  
  /** Whether this is a Buy It Now listing */
  isBuyItNow?: boolean;
  
  /** Whether this is an auction */
  isAuction?: boolean;
  
  /** Number of items available */
  quantityAvailable?: number;
  
  /** Number of items sold */
  quantitySold?: number;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Timestamps
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** When the listing was created */
  listingTime: Date | string;
  
  /** When the listing ends (ISO string) */
  endTime?: string;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Additional Metadata
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Item specifics (key-value pairs) */
  itemSpecifics?: Record<string, string>;

  /** Card condition from eBay item specifics (e.g., "Near Mint or Better") */
  cardCondition?: string;

  /** Mapped condition code for Scrydex (NM, LP, MP, HP) */
  mappedCondition?: 'NM' | 'LP' | 'MP' | 'HP';

  /** Source of the condition determination */
  conditionSource?: 'condition_descriptor' | 'item_specifics' | 'title' | 'default';

  /** True if the condition is blocked (damaged, creased, etc.) - skip these */
  conditionBlocked?: boolean;

  /** eBay condition descriptor ID if available (e.g., "400010" for Near Mint) */
  conditionDescriptorId?: string;

  /** Raw conditionDescriptors from eBay API (for debugging) */
  rawConditionDescriptors?: Array<{
    name: string;
    values: Array<{ value?: string; content?: string }>;
  }>;

  /** Whether item ships to UK */
  shipsToUK?: boolean;
  
  /** Available shipping service options */
  shippingOptions?: EbayShippingOption[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw eBay API Response Types (Before Normalization)
// ─────────────────────────────────────────────────────────────────────────────

// Item specifics / Localized aspects from eBay API
export interface EbayLocalizedAspect {
  type?: string;
  name: string;
  value: string;
}

export interface EbayBrowseApiItem {
  itemId: string;
  legacyItemId?: string;
  title: string;
  shortDescription?: string;

  price?: EbayPrice;
  currentBidPrice?: EbayPrice;

  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;

  image?: EbayImage;
  additionalImages?: EbayImage[];
  thumbnailImages?: EbayImage[];

  seller?: EbaySeller;

  itemLocation?: EbayItemLocation;

  shippingOptions?: EbayShippingOption[];

  condition?: string;
  conditionId?: string;
  conditionDescriptors?: Array<{
    name: string;
    values: Array<{
      value?: string;   // eBay may use 'value'
      content?: string; // or 'content' depending on endpoint
    }>;
  }>;

  categoryId?: string;
  categoryPath?: string;

  buyingOptions?: string[];

  itemCreationDate?: string;
  itemEndDate?: string;

  availableCoupons?: boolean;

  quantityLimitPerBuyer?: number;
  estimatedAvailabilities?: Array<{
    availabilityThreshold?: number;
    availabilityThresholdType?: string;
    deliveryOptions?: string[];
    estimatedAvailabilityStatus?: string;
  }>;

  // Item specifics (localized aspects) - contains card condition
  localizedAspects?: EbayLocalizedAspect[];
}

export interface EbayBrowseApiResponse {
  href?: string;
  total?: number;
  next?: string;
  prev?: string;
  limit?: number;
  offset?: number;
  itemSummaries?: EbayBrowseApiItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Search Parameters (matches existing client.ts usage)
// ─────────────────────────────────────────────────────────────────────────────

export interface EbaySearchParams {
  /** Search query string (eBay API parameter name) */
  q?: string;
  
  /** Search query string (preferred name used in codebase) */
  query?: string;
  
  /** Category IDs to filter by */
  categoryIds?: string;
  
  /** Filter string (eBay filter syntax) */
  filter?: string;
  
  /** Sort order (used in codebase) */
  sortOrder?: 'newlyListed' | 'endingSoonest' | 'price' | 'priceDesc';
  
  /** Sort order (eBay API format) */
  sort?: 'newlyListed' | 'endingSoonest' | 'price' | '-price' | 'distance';
  
  /** Number of results per page (max 200) */
  limit?: number;
  
  /** Offset for pagination */
  offset?: number;
  
  /** Field groups to include */
  fieldgroups?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Search Result (used by client.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface EbaySearchResult {
  /** Array of normalized listings */
  listings: EbayListing[];

  /** Total number of results available */
  total: number;

  /** Current offset */
  offset: number;

  /** Whether there are more results */
  hasMore: boolean;

  /** Next offset for pagination */
  nextOffset?: number;

  /** Whether the request was rate limited */
  rateLimited?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Token Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EbayOAuthToken {
  /** Access token */
  access_token: string;
  
  /** Token type (usually "Application Access Token") */
  token_type: string;
  
  /** Expiry time in seconds */
  expires_in: number;
  
  /** When this token was obtained */
  obtained_at?: number;
}

export interface EbayTokenResponse {
  /** Access token */
  access_token: string;
  
  /** Token type */
  token_type: string;
  
  /** Expiry time in seconds */
  expires_in: number;
  
  /** Refresh token (if applicable) */
  refresh_token?: string;
  
  /** Refresh token expiry (if applicable) */
  refresh_token_expires_in?: number;
}

export interface EbayTokenCache {
  /** Cached access token (named 'token' to match existing auth.ts) */
  token: string | null;

  /** When the token expires (timestamp) */
  expiresAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limit Types (from Analytics API)
// ─────────────────────────────────────────────────────────────────────────────

export interface EbayRateLimitRate {
  /** Number of calls made in current time window */
  count?: number;

  /** Maximum calls allowed in time window */
  limit?: number;

  /** Remaining calls before limit is reached */
  remaining?: number;

  /** ISO timestamp when the time window resets */
  reset?: string;

  /** Time window in seconds */
  timeWindow?: number;
}

export interface EbayRateLimitResource {
  /** Resource name (e.g., "item_summary", "item") */
  name?: string;

  /** Rate limit data for this resource */
  rates?: EbayRateLimitRate[];
}

export interface EbayRateLimit {
  /** API context (e.g., "buy", "sell") */
  apiContext?: string;

  /** API name (e.g., "browse") */
  apiName?: string;

  /** API version (e.g., "v1") */
  apiVersion?: string;

  /** Resources with their rate limits */
  resources?: EbayRateLimitResource[];
}

export interface EbayRateLimitsResponse {
  /** Array of rate limits per API */
  rateLimits?: EbayRateLimit[];
}

export interface EbayRateLimitStatus {
  /** Whether currently rate limited */
  isLimited: boolean;

  /** Milliseconds until limit resets (0 if not limited) */
  retryAfterMs: number;

  /** Consecutive rate limit hits */
  consecutiveHits: number;

  /** Calls remaining (from API if available) */
  remaining?: number;

  /** Total limit (from API if available) */
  limit?: number;

  /** Calls made in current window (from API if available) */
  count?: number;

  /** When the window resets (ISO string, from API if available) */
  resetAt?: string;

  /** Time window in seconds (from API if available) */
  timeWindowSeconds?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions for Type Conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an eBay price object to a number
 */
export function parseEbayPrice(price?: EbayPrice): number {
  if (!price?.value) return 0;
  return parseFloat(price.value) || 0;
}

/**
 * Parse seller feedback percentage from string to number
 */
export function parseSellerFeedbackPercent(percentage?: string): number | undefined {
  if (!percentage) return undefined;
  const parsed = parseFloat(percentage);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Normalize an eBay Browse API item to our EbayListing interface
 */
export function normalizeEbayItem(item: EbayBrowseApiItem): EbayListing {
  // Extract shipping cost (first shipping option or 0)
  let shippingCost = 0;
  let freeShipping = false;
  
  if (item.shippingOptions && item.shippingOptions.length > 0) {
    const firstOption = item.shippingOptions[0];
    if (firstOption.shippingCost) {
      shippingCost = parseEbayPrice(firstOption.shippingCost);
    }
    // Check for free shipping
    freeShipping = shippingCost === 0;
  }
  
  // Calculate price
  const price = parseEbayPrice(item.price);
  const totalCost = price + shippingCost;
  
  // Build location string
  let locationString = '';
  if (item.itemLocation) {
    const parts: string[] = [];
    if (item.itemLocation.city) parts.push(item.itemLocation.city);
    if (item.itemLocation.stateOrProvince) parts.push(item.itemLocation.stateOrProvince);
    if (item.itemLocation.country) {
      // Map country codes to names for display
      const countryNames: Record<string, string> = {
        'GB': 'United Kingdom',
        'US': 'United States',
        'DE': 'Germany',
        'FR': 'France',
        'IT': 'Italy',
        'ES': 'Spain',
        'NL': 'Netherlands',
        'JP': 'Japan',
        'CN': 'China',
        'AU': 'Australia',
        'CA': 'Canada',
      };
      parts.push(countryNames[item.itemLocation.country] || item.itemLocation.country);
    }
    locationString = parts.join(', ');
  }
  
  return {
    itemId: item.itemId,
    legacyItemId: item.legacyItemId,
    
    title: item.title,
    shortDescription: item.shortDescription,
    
    price,
    priceCurrency: item.price?.currency || 'GBP',
    shippingCost,
    totalCost,
    freeShipping,
    
    url: item.itemWebUrl || `https://www.ebay.co.uk/itm/${item.itemId}`,
    imageUrl: item.image?.imageUrl || null,
    additionalImages: item.additionalImages?.map(img => img.imageUrl).filter(Boolean) as string[],
    
    seller: {
      username: item.seller?.username || 'Unknown',
      feedbackScore: item.seller?.feedbackScore || 0,
      feedbackPercentage: parseSellerFeedbackPercent(item.seller?.feedbackPercentage),
    },
    
    location: locationString,
    country: item.itemLocation?.country,
    
    condition: item.condition,
    conditionId: item.conditionId,
    categoryId: item.categoryId,
    categoryPath: item.categoryPath,
    
    buyingOptions: item.buyingOptions,
    isBuyItNow: item.buyingOptions?.includes('FIXED_PRICE') || false,
    isAuction: item.buyingOptions?.includes('AUCTION') || false,
    
    listingTime: item.itemCreationDate || new Date().toISOString(),
    endTime: item.itemEndDate,
    
    shippingOptions: item.shippingOptions,
  };
}