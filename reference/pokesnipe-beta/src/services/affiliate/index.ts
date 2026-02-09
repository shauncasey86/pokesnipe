// src/services/affiliate/index.ts

import { config } from '../../config/index.js';

class EpnGenerator {
  private campaignId: string;

  constructor() {
    this.campaignId = config.epn?.campaignId || process.env.EPN_CAMPAIGN_ID || '';
  }

  generateAffiliateUrl(ebayUrl: string): string {
    if (!this.campaignId || !ebayUrl) {
      return ebayUrl;
    }

    const encodedUrl = encodeURIComponent(ebayUrl);
    return `https://www.ebay.co.uk/rover/1/710-53481-19255-0/1?mpre=${encodedUrl}&campid=${this.campaignId}&toolid=10001`;
  }
}

export const epnGenerator = new EpnGenerator();