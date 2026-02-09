// ═══════════════════════════════════════════════════════════════════════════
// Expansion Service - Matches set names to Scrydex expansion IDs
// ═══════════════════════════════════════════════════════════════════════════

import type { CachedExpansion, Expansion, ExpansionMatch, MatchResult, ExpansionStats } from './types.js';
import { scrydex } from '../scrydex/client.js';
import { logger } from '../../utils/logger.js';

// Re-export types for convenience
export type { CachedExpansion, Expansion, ExpansionMatch, MatchResult, ExpansionStats };
export * from './types.js';

class ExpansionService {
  private expansions: Map<string, CachedExpansion> = new Map();
  private aliases: Map<string, string> = new Map();
  private lastUpdated: Date | null = null;
  private logosFetched: boolean = false;

  // ═══════════════════════════════════════════════════════════════════════════
  // SCRYDEX ID MAPPING - Maps local expansion IDs to Scrydex's actual IDs
  // This fixes cases where our hardcoded IDs don't match Scrydex's IDs
  // ═══════════════════════════════════════════════════════════════════════════
  private scrydexIdMap: Map<string, string> = new Map(); // localId -> scrydexId
  private scrydexExpansions: Map<string, { id: string; name: string; code: string; printedTotal: number }> = new Map();
  private scrydexValidated: boolean = false;
  // Store validation details for diagnostics
  private validationDetails: {
    remappedIds: string[];
    invalidLocalIds: string[];
    missingScrydexIds: string[];
  } = { remappedIds: [], invalidLocalIds: [], missingScrydexIds: [] };

  constructor() {
    this.loadBuiltInExpansions();
    this.loadAliases();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public initialize method (for compatibility)
  // ─────────────────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    // Already initialized in constructor with built-in data
    // This method exists for compatibility with routes that call it
    this.lastUpdated = new Date();

    // Register expansion release dates with Scrydex client for tiered cache TTLs
    // This enables smarter caching: vintage sets = 7 days, modern = 72h, new = 48h
    const expansionsWithDates = Array.from(this.expansions.values()).map(exp => ({
      id: exp.id,
      releaseDate: exp.releaseDate,
    }));
    scrydex.registerExpansionReleaseDates(expansionsWithDates);

    // Fetch expansion logos from Scrydex API (background task)
    // This makes 2-3 API calls total (paginated at 100 per page)
    this.fetchExpansionLogos().catch(err => {
      logger.warn('Failed to fetch expansion logos from Scrydex:', err.message);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch Expansion Logos from Scrydex API
  // ─────────────────────────────────────────────────────────────────────────

  async fetchExpansionLogos(): Promise<void> {
    if (this.logosFetched) return;

    try {
      logger.info('EXPANSION_LOGOS', { message: 'Fetching expansion logos from Scrydex API...' });

      const expansions = await scrydex.getAllEnglishExpansions();
      let updated = 0;

      // ═══════════════════════════════════════════════════════════════════════
      // BUILD SCRYDEX ID MAP: Store all Scrydex expansions for ID lookup
      // This allows us to use Scrydex's actual IDs when querying
      // ═══════════════════════════════════════════════════════════════════════
      const scrydexByName = new Map<string, typeof expansions[0]>();
      const scrydexByCode = new Map<string, typeof expansions[0]>();

      for (const exp of expansions) {
        // Store Scrydex expansion data
        this.scrydexExpansions.set(exp.id, {
          id: exp.id,
          name: exp.name,
          code: exp.code,
          printedTotal: exp.printed_total,
        });

        // Build lookup maps by normalized name and code
        const normalizedName = exp.name.toLowerCase().trim();
        scrydexByName.set(normalizedName, exp);
        if (exp.code) {
          scrydexByCode.set(exp.code.toLowerCase(), exp);
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // VALIDATION: Track which Scrydex IDs we DON'T have locally
      // This helps debug scrydexNotFound failures
      // ═══════════════════════════════════════════════════════════════════════
      const missingScrydexIds: string[] = [];
      const scrydexIdSet = new Set<string>();

      for (const exp of expansions) {
        scrydexIdSet.add(exp.id);
        const cached = this.expansions.get(exp.id);
        if (cached) {
          // Direct ID match - ideal case
          this.scrydexIdMap.set(exp.id, exp.id);
          if (exp.logo || exp.symbol) {
            cached.logo = exp.logo || null;
            cached.symbol = exp.symbol || null;
            updated++;
          }
        } else {
          // We don't have this Scrydex expansion locally!
          missingScrydexIds.push(`${exp.id} (${exp.name})`);
        }
      }

      // Also check which of our local IDs don't exist in Scrydex
      // For mismatched IDs, try to find a Scrydex match by name/code
      const invalidLocalIds: string[] = [];
      const remappedIds: string[] = [];

      for (const [localId, localExp] of this.expansions.entries()) {
        if (!scrydexIdSet.has(localId)) {
          // Try to find matching Scrydex expansion by name
          const normalizedLocalName = localExp.name.toLowerCase().trim();
          let scrydexMatch = scrydexByName.get(normalizedLocalName);

          // Try by code if name didn't match
          if (!scrydexMatch && localExp.code) {
            scrydexMatch = scrydexByCode.get(localExp.code.toLowerCase());
          }

          if (scrydexMatch) {
            // Found a match by name/code - remap the ID
            this.scrydexIdMap.set(localId, scrydexMatch.id);
            remappedIds.push(`${localId} -> ${scrydexMatch.id} (${localExp.name})`);
          } else {
            invalidLocalIds.push(`${localId} (${localExp.name})`);
          }
        }
      }

      this.logosFetched = true;
      this.scrydexValidated = true;

      // Store validation details for diagnostics endpoint
      this.validationDetails = {
        remappedIds,
        invalidLocalIds,
        missingScrydexIds,
      };

      // Log validation results
      if (remappedIds.length > 0) {
        logger.info('EXPANSION_ID_REMAPPED', {
          message: 'Local expansion IDs remapped to Scrydex IDs',
          count: remappedIds.length,
          remappedIds: remappedIds.slice(0, 30),
        });
      }

      if (missingScrydexIds.length > 0 || invalidLocalIds.length > 0) {
        logger.warn('EXPANSION_ID_MISMATCH', {
          message: 'Expansion ID validation found mismatches',
          missingScrydexCount: missingScrydexIds.length,
          missingScrydexIds: missingScrydexIds.slice(0, 20), // Log first 20
          invalidLocalCount: invalidLocalIds.length,
          invalidLocalIds: invalidLocalIds.slice(0, 20), // Log first 20
        });
      }

      logger.info('EXPANSION_LOGOS', {
        message: 'Expansion logos fetched successfully',
        totalScrydexExpansions: expansions.length,
        totalLocalExpansions: this.expansions.size,
        updated,
        remappedCount: remappedIds.length,
        missingScrydexCount: missingScrydexIds.length,
        invalidLocalCount: invalidLocalIds.length,
      });
    } catch (error) {
      logger.warn('EXPANSION_LOGOS_FAILED', {
        message: 'Failed to fetch expansion logos',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Get Scrydex Expansion ID for a local ID
  // Returns the Scrydex ID to use when querying, or original ID if not mapped
  // ─────────────────────────────────────────────────────────────────────────

  getScrydexId(localId: string): string {
    // Return mapped ID if available, otherwise return original
    return this.scrydexIdMap.get(localId) || localId;
  }

  // Check if we have validated against Scrydex
  isValidated(): boolean {
    return this.scrydexValidated;
  }

  // Get validation stats for debugging
  getValidationStats(): {
    validated: boolean;
    mappedCount: number;
    scrydexCount: number;
    localCount: number;
    unmappedCount: number;
    details: {
      remappedIds: string[];
      invalidLocalIds: string[];
      missingScrydexIds: string[];
    };
  } {
    return {
      validated: this.scrydexValidated,
      mappedCount: this.scrydexIdMap.size,
      scrydexCount: this.scrydexExpansions.size,
      localCount: this.expansions.size,
      unmappedCount: this.validationDetails.invalidLocalIds.length,
      details: this.validationDetails,
    };
  }

  // Check if logos have been fetched
  hasLogos(): boolean {
    return this.logosFetched;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Get Stats
  // ─────────────────────────────────────────────────────────────────────────
  
  getStats(): ExpansionStats {
    let englishCount = 0;
    let japaneseCount = 0;
    
    for (const exp of this.expansions.values()) {
      if (exp.languageCode === 'EN') englishCount++;
      if (exp.languageCode === 'JA') japaneseCount++;
    }
    
    return {
      totalExpansions: this.expansions.size,
      englishExpansions: englishCount,
      japaneseExpansions: japaneseCount,
      lastUpdated: this.lastUpdated,
      aliasCount: this.aliases.size,
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Get All Expansions
  // ─────────────────────────────────────────────────────────────────────────
  
  getAllExpansions(): CachedExpansion[] {
    return Array.from(this.expansions.values());
  }
  
  // Alias for compatibility
  getAll(): CachedExpansion[] {
    return this.getAllExpansions();
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Get Expansion by ID
  // ─────────────────────────────────────────────────────────────────────────
  
  getExpansion(id: string): CachedExpansion | undefined {
    return this.expansions.get(id);
  }
  
  // Alias for compatibility with routes
  getById(id: string): CachedExpansion | undefined {
    return this.getExpansion(id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Subset Expansion Mapping
  // Maps main set + card number prefix (SV/TG/GG) to subset expansion ID
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the subset expansion ID for a card with a subset prefix (SV/TG/GG)
   * @param mainSetId The main expansion ID (e.g., 'sm115', 'swsh11', 'swsh125')
   * @param subsetPrefix The card number prefix ('SV', 'TG', or 'GG')
   * @returns The subset expansion ID if found, otherwise the original mainSetId
   */
  getSubsetExpansionId(mainSetId: string, subsetPrefix: string): string {
    const prefix = subsetPrefix.toUpperCase();

    // Mapping from main set ID + prefix to subset expansion ID
    const subsetMap: Record<string, Record<string, string>> = {
      // Hidden Fates → Shiny Vault
      'sm115': { 'SV': 'sm115sv' },
      // Shining Fates → Shiny Vault
      'swsh45': { 'SV': 'swsh45sv' },
      // Brilliant Stars → Trainer Gallery
      'swsh9': { 'TG': 'swsh9tg' },
      // Astral Radiance → Trainer Gallery
      'swsh10': { 'TG': 'swsh10tg' },
      // Lost Origin → Trainer Gallery
      'swsh11': { 'TG': 'swsh11tg' },
      // Silver Tempest → Trainer Gallery
      'swsh12': { 'TG': 'swsh12tg' },
      // Crown Zenith → Galarian Gallery
      'swsh125': { 'GG': 'swsh12pt5gg' },
    };

    // Check if this main set has a subset for this prefix
    const setSubsets = subsetMap[mainSetId];
    if (setSubsets && setSubsets[prefix]) {
      const subsetId = setSubsets[prefix];
      logger.debug('SUBSET_EXPANSION_MAPPED', {
        mainSetId,
        subsetPrefix: prefix,
        subsetExpansionId: subsetId,
      });
      return subsetId;
    }

    // No subset mapping found, return original ID
    return mainSetId;
  }

  /**
   * Check if a card number indicates a subset card (SV/TG/GG prefix)
   * @param cardNumber The card number (e.g., 'SV65', 'TG01', 'GG48')
   * @returns The subset prefix if found, otherwise null
   */
  getSubsetPrefix(cardNumber: string): string | null {
    const match = cardNumber.match(/^(SV|TG|GG)\d+$/i);
    return match ? match[1].toUpperCase() : null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Infer Expansion from Card Number Denominator
  // When no set name is parsed, use the denominator (e.g., /162) to find candidates
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get candidate expansion IDs based on card number denominator
   * @param denominator The total number from the card (e.g., 162 from "25/162")
   * @returns Array of expansion IDs that could match, ordered by recency
   */
  inferExpansionsFromDenominator(denominator: number): string[] {
    const candidates: Array<{ id: string; releaseDate: string }> = [];
    const tolerance = 5; // Allow ±5 card tolerance for variations

    for (const expansion of this.expansions.values()) {
      // Skip non-English expansions
      if (expansion.languageCode !== 'EN') continue;

      // Check if printedTotal is within tolerance of the denominator
      if (Math.abs(expansion.printedTotal - denominator) <= tolerance) {
        candidates.push({
          id: expansion.id,
          releaseDate: expansion.releaseDate || '1999/01/01',
        });
      }
    }

    // Sort by release date (newest first) to prefer recent sets
    candidates.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));

    return candidates.map(c => c.id);
  }

  /**
   * Get recent English expansion IDs for fallback queries
   * @param limit Max number of expansions to return
   * @returns Array of recent expansion IDs, newest first
   */
  getRecentExpansionIds(limit: number = 10): string[] {
    const candidates: Array<{ id: string; releaseDate: string }> = [];

    for (const expansion of this.expansions.values()) {
      // Skip non-English, promos, and subsets
      if (expansion.languageCode !== 'EN') continue;
      if (expansion.id.includes('sv') && expansion.id.length > 4) continue; // Skip svp, sv45sv, etc.
      if (expansion.id.includes('tg') || expansion.id.includes('gg')) continue;

      candidates.push({
        id: expansion.id,
        releaseDate: expansion.releaseDate || '1999/01/01',
      });
    }

    // Sort by release date (newest first)
    candidates.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));

    return candidates.slice(0, limit).map(c => c.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Match Set Name to Expansion
  // ─────────────────────────────────────────────────────────────────────────

  match(setName: string, options?: { cardNumber?: string; promoPrefix?: string }): MatchResult {
    const normalizedName = setName?.toLowerCase().trim() || '';
    const alternates: ExpansionMatch[] = [];
    
    // Handle promo prefix routing
    if (options?.promoPrefix) {
      const promoExpansionId = this.getPromoExpansionId(options.promoPrefix);
      if (promoExpansionId) {
        const expansion = this.expansions.get(promoExpansionId);
        if (expansion) {
          return {
            success: true,
            match: {
              expansion,
              matchType: 'promo_prefix',
              matchScore: 100,
              matchedOn: options.promoPrefix,
            },
            query: normalizedName,
            alternates: [],
          };
        }
      }
    }
    
    // Try direct alias match
    const aliasMatch = this.aliases.get(normalizedName);
    if (aliasMatch) {
      const expansion = this.expansions.get(aliasMatch);
      if (expansion) {
        return {
          success: true,
          match: {
            expansion,
            matchType: 'alias',
            matchScore: 95,
            matchedOn: normalizedName,
          },
          query: normalizedName,
          alternates: [],
        };
      }
    }
    
    // Try exact ID match
    const directMatch = this.expansions.get(normalizedName);
    if (directMatch) {
      return {
        success: true,
        match: {
          expansion: directMatch,
          matchType: 'id',
          matchScore: 100,
          matchedOn: normalizedName,
        },
        query: normalizedName,
        alternates: [],
      };
    }
    
    // Try fuzzy name match
    let bestMatch: ExpansionMatch | null = null;
    let bestScore = 0;
    
    for (const expansion of this.expansions.values()) {
      const expNameLower = expansion.name.toLowerCase();
      
      // Exact name match
      if (expNameLower === normalizedName) {
        return {
          success: true,
          match: {
            expansion,
            matchType: 'exact_name',
            matchScore: 100,
            matchedOn: expansion.name,
          },
          query: normalizedName,
          alternates: [],
        };
      }
      
      // Contains match
      if (expNameLower.includes(normalizedName) || normalizedName.includes(expNameLower)) {
        const score = Math.min(normalizedName.length, expNameLower.length) / 
                     Math.max(normalizedName.length, expNameLower.length) * 80;
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            expansion,
            matchType: 'partial',
            matchScore: Math.round(score),
            matchedOn: expansion.name,
          };
        }
        
        if (score > 50) {
          alternates.push({
            expansion,
            matchType: 'partial',
            matchScore: Math.round(score),
            matchedOn: expansion.name,
          });
        }
      }
    }
    
    if (bestMatch && bestScore >= 60) {
      return {
        success: true,
        match: bestMatch,
        query: normalizedName,
        alternates: alternates.filter(a => a.expansion.id !== bestMatch!.expansion.id),
      };
    }
    
    return {
      success: false,
      match: null,
      query: normalizedName,
      alternates,
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Promo Expansion ID Lookup
  // ─────────────────────────────────────────────────────────────────────────
  
  private getPromoExpansionId(prefix: string): string | null {
    const promoMap: Record<string, string> = {
      'SVP': 'svp',
      'SWSH': 'swshp',
      'SM': 'smp',
      'XY': 'xyp',
      'BW': 'bwp',
      'DP': 'dpp',
      'HGSS': 'hgssp',
      'MEP': 'mep',
    };
    return promoMap[prefix.toUpperCase()] || null;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Load Built-In Expansions
  // ─────────────────────────────────────────────────────────────────────────
  
  private loadBuiltInExpansions(): void {
    const expansions: CachedExpansion[] = [
      // ═══════════════════════════════════════════════════════════════════════
      // WOTC Era (Base through Neo)
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'base1', name: 'Base Set', series: 'Base', code: 'BS', total: 102, printedTotal: 102, language: 'English', languageCode: 'EN', releaseDate: '1999/01/09', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'base2', name: 'Jungle', series: 'Base', code: 'JU', total: 64, printedTotal: 64, language: 'English', languageCode: 'EN', releaseDate: '1999/06/16', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'base3', name: 'Fossil', series: 'Base', code: 'FO', total: 62, printedTotal: 62, language: 'English', languageCode: 'EN', releaseDate: '1999/10/10', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'base4', name: 'Base Set 2', series: 'Base', code: 'B2', total: 130, printedTotal: 130, language: 'English', languageCode: 'EN', releaseDate: '2000/02/24', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'base5', name: 'Team Rocket', series: 'Base', code: 'TR', total: 83, printedTotal: 82, language: 'English', languageCode: 'EN', releaseDate: '2000/04/24', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'gym1', name: 'Gym Heroes', series: 'Gym', code: 'G1', total: 132, printedTotal: 132, language: 'English', languageCode: 'EN', releaseDate: '2000/08/14', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'gym2', name: 'Gym Challenge', series: 'Gym', code: 'G2', total: 132, printedTotal: 132, language: 'English', languageCode: 'EN', releaseDate: '2000/10/16', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'neo1', name: 'Neo Genesis', series: 'Neo', code: 'N1', total: 111, printedTotal: 111, language: 'English', languageCode: 'EN', releaseDate: '2000/12/16', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'neo2', name: 'Neo Discovery', series: 'Neo', code: 'N2', total: 75, printedTotal: 75, language: 'English', languageCode: 'EN', releaseDate: '2001/06/01', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'neo3', name: 'Neo Revelation', series: 'Neo', code: 'N3', total: 66, printedTotal: 64, language: 'English', languageCode: 'EN', releaseDate: '2001/09/21', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'neo4', name: 'Neo Destiny', series: 'Neo', code: 'N4', total: 113, printedTotal: 105, language: 'English', languageCode: 'EN', releaseDate: '2002/02/28', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'si1', name: 'Southern Islands', series: 'Other', code: 'SI', total: 18, printedTotal: 18, language: 'English', languageCode: 'EN', releaseDate: '2001/07/31', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'base6', name: 'Legendary Collection', series: 'Other', code: 'LC', total: 110, printedTotal: 110, language: 'English', languageCode: 'EN', releaseDate: '2002/05/24', logo: null, symbol: null, isOnlineOnly: false },
      
      // ═══════════════════════════════════════════════════════════════════════
      // e-Card Era
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'ecard1', name: 'Expedition Base Set', series: 'E-Card', code: 'EX', total: 165, printedTotal: 165, language: 'English', languageCode: 'EN', releaseDate: '2002/09/15', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ecard2', name: 'Aquapolis', series: 'E-Card', code: 'AQ', total: 186, printedTotal: 147, language: 'English', languageCode: 'EN', releaseDate: '2003/01/15', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ecard3', name: 'Skyridge', series: 'E-Card', code: 'SK', total: 182, printedTotal: 144, language: 'English', languageCode: 'EN', releaseDate: '2003/05/12', logo: null, symbol: null, isOnlineOnly: false },
      
      // ═══════════════════════════════════════════════════════════════════════
      // EX Era
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'ex1', name: 'Ruby & Sapphire', series: 'EX', code: 'RS', total: 109, printedTotal: 109, language: 'English', languageCode: 'EN', releaseDate: '2003/07/18', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex2', name: 'Sandstorm', series: 'EX', code: 'SS', total: 100, printedTotal: 100, language: 'English', languageCode: 'EN', releaseDate: '2003/09/18', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex3', name: 'Dragon', series: 'EX', code: 'DR', total: 100, printedTotal: 97, language: 'English', languageCode: 'EN', releaseDate: '2003/11/24', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex4', name: 'Team Magma vs Team Aqua', series: 'EX', code: 'MA', total: 97, printedTotal: 95, language: 'English', languageCode: 'EN', releaseDate: '2004/03/01', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex5', name: 'Hidden Legends', series: 'EX', code: 'HL', total: 102, printedTotal: 101, language: 'English', languageCode: 'EN', releaseDate: '2004/06/14', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex6', name: 'FireRed & LeafGreen', series: 'EX', code: 'RG', total: 116, printedTotal: 112, language: 'English', languageCode: 'EN', releaseDate: '2004/09/01', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex7', name: 'Team Rocket Returns', series: 'EX', code: 'TRR', total: 111, printedTotal: 109, language: 'English', languageCode: 'EN', releaseDate: '2004/11/08', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex8', name: 'Deoxys', series: 'EX', code: 'DX', total: 108, printedTotal: 107, language: 'English', languageCode: 'EN', releaseDate: '2005/02/14', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex9', name: 'Emerald', series: 'EX', code: 'EM', total: 107, printedTotal: 106, language: 'English', languageCode: 'EN', releaseDate: '2005/05/09', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex10', name: 'Unseen Forces', series: 'EX', code: 'UF', total: 145, printedTotal: 115, language: 'English', languageCode: 'EN', releaseDate: '2005/08/22', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex11', name: 'Delta Species', series: 'EX', code: 'DS', total: 114, printedTotal: 113, language: 'English', languageCode: 'EN', releaseDate: '2005/10/31', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex12', name: 'Legend Maker', series: 'EX', code: 'LM', total: 93, printedTotal: 92, language: 'English', languageCode: 'EN', releaseDate: '2006/02/13', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex13', name: 'Holon Phantoms', series: 'EX', code: 'HP', total: 111, printedTotal: 110, language: 'English', languageCode: 'EN', releaseDate: '2006/05/03', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex14', name: 'Crystal Guardians', series: 'EX', code: 'CG', total: 100, printedTotal: 100, language: 'English', languageCode: 'EN', releaseDate: '2006/08/30', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex15', name: 'Dragon Frontiers', series: 'EX', code: 'DF', total: 101, printedTotal: 101, language: 'English', languageCode: 'EN', releaseDate: '2006/11/08', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'ex16', name: 'Power Keepers', series: 'EX', code: 'PK', total: 108, printedTotal: 108, language: 'English', languageCode: 'EN', releaseDate: '2007/02/14', logo: null, symbol: null, isOnlineOnly: false },
      
      // ═══════════════════════════════════════════════════════════════════════
      // Diamond & Pearl Era
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'dp1', name: 'Diamond & Pearl', series: 'Diamond & Pearl', code: 'DP', total: 130, printedTotal: 130, language: 'English', languageCode: 'EN', releaseDate: '2007/05/23', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'dp2', name: 'Mysterious Treasures', series: 'Diamond & Pearl', code: 'MT', total: 124, printedTotal: 123, language: 'English', languageCode: 'EN', releaseDate: '2007/08/22', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'dp3', name: 'Secret Wonders', series: 'Diamond & Pearl', code: 'SW', total: 132, printedTotal: 132, language: 'English', languageCode: 'EN', releaseDate: '2007/11/07', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'dp4', name: 'Great Encounters', series: 'Diamond & Pearl', code: 'GE', total: 106, printedTotal: 106, language: 'English', languageCode: 'EN', releaseDate: '2008/02/13', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'dp5', name: 'Majestic Dawn', series: 'Diamond & Pearl', code: 'MD', total: 100, printedTotal: 100, language: 'English', languageCode: 'EN', releaseDate: '2008/05/21', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'dp6', name: 'Legends Awakened', series: 'Diamond & Pearl', code: 'LA', total: 146, printedTotal: 146, language: 'English', languageCode: 'EN', releaseDate: '2008/08/20', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'dp7', name: 'Stormfront', series: 'Diamond & Pearl', code: 'SF', total: 106, printedTotal: 106, language: 'English', languageCode: 'EN', releaseDate: '2008/11/05', logo: null, symbol: null, isOnlineOnly: false },
      
      // ═══════════════════════════════════════════════════════════════════════
      // Platinum Era
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'pl1', name: 'Platinum', series: 'Platinum', code: 'PL', total: 133, printedTotal: 127, language: 'English', languageCode: 'EN', releaseDate: '2009/02/11', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'pl2', name: 'Rising Rivals', series: 'Platinum', code: 'RR', total: 120, printedTotal: 111, language: 'English', languageCode: 'EN', releaseDate: '2009/05/16', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'pl3', name: 'Supreme Victors', series: 'Platinum', code: 'SV', total: 153, printedTotal: 147, language: 'English', languageCode: 'EN', releaseDate: '2009/08/19', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'pl4', name: 'Arceus', series: 'Platinum', code: 'AR', total: 111, printedTotal: 99, language: 'English', languageCode: 'EN', releaseDate: '2009/11/04', logo: null, symbol: null, isOnlineOnly: false },
      
      // ═══════════════════════════════════════════════════════════════════════
      // HeartGold SoulSilver Era
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'hgss1', name: 'HeartGold & SoulSilver', series: 'HeartGold & SoulSilver', code: 'HS', total: 124, printedTotal: 123, language: 'English', languageCode: 'EN', releaseDate: '2010/02/10', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'hgss2', name: 'Unleashed', series: 'HeartGold & SoulSilver', code: 'UL', total: 96, printedTotal: 95, language: 'English', languageCode: 'EN', releaseDate: '2010/05/12', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'hgss3', name: 'Undaunted', series: 'HeartGold & SoulSilver', code: 'UD', total: 91, printedTotal: 90, language: 'English', languageCode: 'EN', releaseDate: '2010/08/18', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'hgss4', name: 'Triumphant', series: 'HeartGold & SoulSilver', code: 'TM', total: 103, printedTotal: 102, language: 'English', languageCode: 'EN', releaseDate: '2010/11/03', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'col1', name: 'Call of Legends', series: 'HeartGold & SoulSilver', code: 'CL', total: 106, printedTotal: 95, language: 'English', languageCode: 'EN', releaseDate: '2011/02/09', logo: null, symbol: null, isOnlineOnly: false },
      
      // ═══════════════════════════════════════════════════════════════════════
      // Black & White Era
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'bw1', name: 'Black & White', series: 'Black & White', code: 'BW', total: 115, printedTotal: 114, language: 'English', languageCode: 'EN', releaseDate: '2011/04/25', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'bw2', name: 'Emerging Powers', series: 'Black & White', code: 'EP', total: 98, printedTotal: 98, language: 'English', languageCode: 'EN', releaseDate: '2011/08/31', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'bw3', name: 'Noble Victories', series: 'Black & White', code: 'NV', total: 102, printedTotal: 101, language: 'English', languageCode: 'EN', releaseDate: '2011/11/16', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'bw4', name: 'Next Destinies', series: 'Black & White', code: 'ND', total: 103, printedTotal: 99, language: 'English', languageCode: 'EN', releaseDate: '2012/02/08', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'bw5', name: 'Dark Explorers', series: 'Black & White', code: 'DE', total: 111, printedTotal: 108, language: 'English', languageCode: 'EN', releaseDate: '2012/05/09', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'bw6', name: 'Dragons Exalted', series: 'Black & White', code: 'DRX', total: 128, printedTotal: 124, language: 'English', languageCode: 'EN', releaseDate: '2012/08/15', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'bw7', name: 'Boundaries Crossed', series: 'Black & White', code: 'BC', total: 153, printedTotal: 149, language: 'English', languageCode: 'EN', releaseDate: '2012/11/07', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'bw8', name: 'Plasma Storm', series: 'Black & White', code: 'PS', total: 138, printedTotal: 135, language: 'English', languageCode: 'EN', releaseDate: '2013/02/06', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'bw9', name: 'Plasma Freeze', series: 'Black & White', code: 'PF', total: 122, printedTotal: 116, language: 'English', languageCode: 'EN', releaseDate: '2013/05/08', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'bw10', name: 'Plasma Blast', series: 'Black & White', code: 'PB', total: 105, printedTotal: 101, language: 'English', languageCode: 'EN', releaseDate: '2013/08/14', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'bw11', name: 'Legendary Treasures', series: 'Black & White', code: 'LT', total: 140, printedTotal: 113, language: 'English', languageCode: 'EN', releaseDate: '2013/11/06', logo: null, symbol: null, isOnlineOnly: false },
      
      // ═══════════════════════════════════════════════════════════════════════
      // XY Era
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'xy1', name: 'XY', series: 'XY', code: 'XY', total: 146, printedTotal: 146, language: 'English', languageCode: 'EN', releaseDate: '2014/02/05', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'xy2', name: 'Flashfire', series: 'XY', code: 'FLF', total: 109, printedTotal: 106, language: 'English', languageCode: 'EN', releaseDate: '2014/05/07', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'xy3', name: 'Furious Fists', series: 'XY', code: 'FFI', total: 113, printedTotal: 111, language: 'English', languageCode: 'EN', releaseDate: '2014/08/13', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'xy4', name: 'Phantom Forces', series: 'XY', code: 'PHF', total: 122, printedTotal: 119, language: 'English', languageCode: 'EN', releaseDate: '2014/11/05', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'xy5', name: 'Primal Clash', series: 'XY', code: 'PRC', total: 164, printedTotal: 160, language: 'English', languageCode: 'EN', releaseDate: '2015/02/04', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'xy6', name: 'Roaring Skies', series: 'XY', code: 'ROS', total: 110, printedTotal: 108, language: 'English', languageCode: 'EN', releaseDate: '2015/05/06', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'xy7', name: 'Ancient Origins', series: 'XY', code: 'AOR', total: 100, printedTotal: 98, language: 'English', languageCode: 'EN', releaseDate: '2015/08/12', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'xy8', name: 'BREAKthrough', series: 'XY', code: 'BKT', total: 164, printedTotal: 162, language: 'English', languageCode: 'EN', releaseDate: '2015/11/04', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'xy9', name: 'BREAKpoint', series: 'XY', code: 'BKP', total: 123, printedTotal: 122, language: 'English', languageCode: 'EN', releaseDate: '2016/02/03', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'g1', name: 'Generations', series: 'XY', code: 'GEN', total: 115, printedTotal: 83, language: 'English', languageCode: 'EN', releaseDate: '2016/02/22', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'xy10', name: 'Fates Collide', series: 'XY', code: 'FCO', total: 129, printedTotal: 124, language: 'English', languageCode: 'EN', releaseDate: '2016/05/02', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'xy11', name: 'Steam Siege', series: 'XY', code: 'STS', total: 116, printedTotal: 114, language: 'English', languageCode: 'EN', releaseDate: '2016/08/03', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'xy12', name: 'Evolutions', series: 'XY', code: 'EVO', total: 113, printedTotal: 108, language: 'English', languageCode: 'EN', releaseDate: '2016/11/02', logo: null, symbol: null, isOnlineOnly: false },
      
      // ═══════════════════════════════════════════════════════════════════════
      // Sun & Moon Era
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'sm1', name: 'Sun & Moon', series: 'Sun & Moon', code: 'SUM', total: 163, printedTotal: 149, language: 'English', languageCode: 'EN', releaseDate: '2017/02/03', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm2', name: 'Guardians Rising', series: 'Sun & Moon', code: 'GRI', total: 180, printedTotal: 145, language: 'English', languageCode: 'EN', releaseDate: '2017/05/05', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm3', name: 'Burning Shadows', series: 'Sun & Moon', code: 'BUS', total: 177, printedTotal: 147, language: 'English', languageCode: 'EN', releaseDate: '2017/08/04', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm35', name: 'Shining Legends', series: 'Sun & Moon', code: 'SLG', total: 78, printedTotal: 73, language: 'English', languageCode: 'EN', releaseDate: '2017/10/06', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm4', name: 'Crimson Invasion', series: 'Sun & Moon', code: 'CIN', total: 124, printedTotal: 111, language: 'English', languageCode: 'EN', releaseDate: '2017/11/03', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm5', name: 'Ultra Prism', series: 'Sun & Moon', code: 'UPR', total: 173, printedTotal: 156, language: 'English', languageCode: 'EN', releaseDate: '2018/02/02', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm6', name: 'Forbidden Light', series: 'Sun & Moon', code: 'FLI', total: 146, printedTotal: 131, language: 'English', languageCode: 'EN', releaseDate: '2018/05/04', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm7', name: 'Celestial Storm', series: 'Sun & Moon', code: 'CES', total: 187, printedTotal: 168, language: 'English', languageCode: 'EN', releaseDate: '2018/08/03', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm75', name: 'Dragon Majesty', series: 'Sun & Moon', code: 'DRM', total: 78, printedTotal: 70, language: 'English', languageCode: 'EN', releaseDate: '2018/09/07', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm8', name: 'Lost Thunder', series: 'Sun & Moon', code: 'LOT', total: 236, printedTotal: 214, language: 'English', languageCode: 'EN', releaseDate: '2018/11/02', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm9', name: 'Team Up', series: 'Sun & Moon', code: 'TEU', total: 196, printedTotal: 181, language: 'English', languageCode: 'EN', releaseDate: '2019/02/01', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'det1', name: 'Detective Pikachu', series: 'Sun & Moon', code: 'DET', total: 18, printedTotal: 18, language: 'English', languageCode: 'EN', releaseDate: '2019/04/05', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm10', name: 'Unbroken Bonds', series: 'Sun & Moon', code: 'UNB', total: 234, printedTotal: 214, language: 'English', languageCode: 'EN', releaseDate: '2019/05/03', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm11', name: 'Unified Minds', series: 'Sun & Moon', code: 'UNM', total: 260, printedTotal: 236, language: 'English', languageCode: 'EN', releaseDate: '2019/08/02', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm115', name: 'Hidden Fates', series: 'Sun & Moon', code: 'HIF', total: 163, printedTotal: 68, language: 'English', languageCode: 'EN', releaseDate: '2019/08/23', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sm12', name: 'Cosmic Eclipse', series: 'Sun & Moon', code: 'CEC', total: 272, printedTotal: 236, language: 'English', languageCode: 'EN', releaseDate: '2019/11/01', logo: null, symbol: null, isOnlineOnly: false },
      
      // ═══════════════════════════════════════════════════════════════════════
      // Sword & Shield Era
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'swsh1', name: 'Sword & Shield', series: 'Sword & Shield', code: 'SSH', total: 216, printedTotal: 202, language: 'English', languageCode: 'EN', releaseDate: '2020/02/07', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh2', name: 'Rebel Clash', series: 'Sword & Shield', code: 'RCL', total: 209, printedTotal: 192, language: 'English', languageCode: 'EN', releaseDate: '2020/05/01', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh3', name: 'Darkness Ablaze', series: 'Sword & Shield', code: 'DAA', total: 201, printedTotal: 189, language: 'English', languageCode: 'EN', releaseDate: '2020/08/14', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh35', name: "Champion's Path", series: 'Sword & Shield', code: 'CPA', total: 80, printedTotal: 73, language: 'English', languageCode: 'EN', releaseDate: '2020/09/25', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh4', name: 'Vivid Voltage', series: 'Sword & Shield', code: 'VIV', total: 203, printedTotal: 185, language: 'English', languageCode: 'EN', releaseDate: '2020/11/13', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh45', name: 'Shining Fates', series: 'Sword & Shield', code: 'SHF', total: 195, printedTotal: 73, language: 'English', languageCode: 'EN', releaseDate: '2021/02/19', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh5', name: 'Battle Styles', series: 'Sword & Shield', code: 'BST', total: 183, printedTotal: 163, language: 'English', languageCode: 'EN', releaseDate: '2021/03/19', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh6', name: 'Chilling Reign', series: 'Sword & Shield', code: 'CRE', total: 233, printedTotal: 198, language: 'English', languageCode: 'EN', releaseDate: '2021/06/18', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh7', name: 'Evolving Skies', series: 'Sword & Shield', code: 'EVS', total: 237, printedTotal: 203, language: 'English', languageCode: 'EN', releaseDate: '2021/08/27', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'cel25', name: 'Celebrations', series: 'Sword & Shield', code: 'CEL', total: 50, printedTotal: 25, language: 'English', languageCode: 'EN', releaseDate: '2021/10/08', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh8', name: 'Fusion Strike', series: 'Sword & Shield', code: 'FST', total: 284, printedTotal: 264, language: 'English', languageCode: 'EN', releaseDate: '2021/11/12', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh9', name: 'Brilliant Stars', series: 'Sword & Shield', code: 'BRS', total: 186, printedTotal: 172, language: 'English', languageCode: 'EN', releaseDate: '2022/02/25', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh10', name: 'Astral Radiance', series: 'Sword & Shield', code: 'ASR', total: 216, printedTotal: 189, language: 'English', languageCode: 'EN', releaseDate: '2022/05/27', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'pgo', name: 'Pokemon GO', series: 'Sword & Shield', code: 'PGO', total: 88, printedTotal: 78, language: 'English', languageCode: 'EN', releaseDate: '2022/07/01', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh11', name: 'Lost Origin', series: 'Sword & Shield', code: 'LOR', total: 217, printedTotal: 196, language: 'English', languageCode: 'EN', releaseDate: '2022/09/09', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh12', name: 'Silver Tempest', series: 'Sword & Shield', code: 'SIT', total: 215, printedTotal: 195, language: 'English', languageCode: 'EN', releaseDate: '2022/11/11', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swsh125', name: 'Crown Zenith', series: 'Sword & Shield', code: 'CRZ', total: 160, printedTotal: 70, language: 'English', languageCode: 'EN', releaseDate: '2023/01/20', logo: null, symbol: null, isOnlineOnly: false },

      // ═══════════════════════════════════════════════════════════════════════
      // Subset Expansions (Shiny Vault, Trainer Gallery, Galarian Gallery)
      // These are sub-sets within main expansions with their own expansion IDs
      // ═══════════════════════════════════════════════════════════════════════
      // Hidden Fates Shiny Vault (SV cards)
      { id: 'sm115sv', name: 'Hidden Fates: Shiny Vault', series: 'Sun & Moon', code: 'SV', total: 94, printedTotal: 94, language: 'English', languageCode: 'EN', releaseDate: '2019/08/23', logo: null, symbol: null, isOnlineOnly: false },
      // Shining Fates Shiny Vault (SV cards)
      { id: 'swsh45sv', name: 'Shining Fates: Shiny Vault', series: 'Sword & Shield', code: 'SV', total: 122, printedTotal: 122, language: 'English', languageCode: 'EN', releaseDate: '2021/02/19', logo: null, symbol: null, isOnlineOnly: false },
      // Brilliant Stars Trainer Gallery (TG cards)
      { id: 'swsh9tg', name: 'Brilliant Stars: Trainer Gallery', series: 'Sword & Shield', code: 'TG', total: 30, printedTotal: 30, language: 'English', languageCode: 'EN', releaseDate: '2022/02/25', logo: null, symbol: null, isOnlineOnly: false },
      // Astral Radiance Trainer Gallery (TG cards)
      { id: 'swsh10tg', name: 'Astral Radiance: Trainer Gallery', series: 'Sword & Shield', code: 'TG', total: 30, printedTotal: 30, language: 'English', languageCode: 'EN', releaseDate: '2022/05/27', logo: null, symbol: null, isOnlineOnly: false },
      // Lost Origin Trainer Gallery (TG cards)
      { id: 'swsh11tg', name: 'Lost Origin: Trainer Gallery', series: 'Sword & Shield', code: 'TG', total: 30, printedTotal: 30, language: 'English', languageCode: 'EN', releaseDate: '2022/09/09', logo: null, symbol: null, isOnlineOnly: false },
      // Silver Tempest Trainer Gallery (TG cards)
      { id: 'swsh12tg', name: 'Silver Tempest: Trainer Gallery', series: 'Sword & Shield', code: 'TG', total: 30, printedTotal: 30, language: 'English', languageCode: 'EN', releaseDate: '2022/11/11', logo: null, symbol: null, isOnlineOnly: false },
      // Crown Zenith Galarian Gallery (GG cards)
      { id: 'swsh12pt5gg', name: 'Crown Zenith: Galarian Gallery', series: 'Sword & Shield', code: 'GG', total: 70, printedTotal: 70, language: 'English', languageCode: 'EN', releaseDate: '2023/01/20', logo: null, symbol: null, isOnlineOnly: false },
      
      // ═══════════════════════════════════════════════════════════════════════
      // Scarlet & Violet Era
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'sv1', name: 'Scarlet & Violet', series: 'Scarlet & Violet', code: 'SVI', total: 258, printedTotal: 198, language: 'English', languageCode: 'EN', releaseDate: '2023/03/31', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv2', name: 'Paldea Evolved', series: 'Scarlet & Violet', code: 'PAL', total: 279, printedTotal: 193, language: 'English', languageCode: 'EN', releaseDate: '2023/06/09', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv35', name: '151', series: 'Scarlet & Violet', code: 'MEW', total: 207, printedTotal: 165, language: 'English', languageCode: 'EN', releaseDate: '2023/09/22', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv3', name: 'Obsidian Flames', series: 'Scarlet & Violet', code: 'OBF', total: 230, printedTotal: 197, language: 'English', languageCode: 'EN', releaseDate: '2023/08/11', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv4', name: 'Paradox Rift', series: 'Scarlet & Violet', code: 'PAR', total: 266, printedTotal: 182, language: 'English', languageCode: 'EN', releaseDate: '2023/11/03', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv45', name: 'Paldean Fates', series: 'Scarlet & Violet', code: 'PAF', total: 245, printedTotal: 91, language: 'English', languageCode: 'EN', releaseDate: '2024/01/26', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv5', name: 'Temporal Forces', series: 'Scarlet & Violet', code: 'TEF', total: 218, printedTotal: 162, language: 'English', languageCode: 'EN', releaseDate: '2024/03/22', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv6', name: 'Twilight Masquerade', series: 'Scarlet & Violet', code: 'TWM', total: 226, printedTotal: 167, language: 'English', languageCode: 'EN', releaseDate: '2024/05/24', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv65', name: 'Shrouded Fable', series: 'Scarlet & Violet', code: 'SFA', total: 99, printedTotal: 64, language: 'English', languageCode: 'EN', releaseDate: '2024/08/02', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv7', name: 'Stellar Crown', series: 'Scarlet & Violet', code: 'SCR', total: 175, printedTotal: 142, language: 'English', languageCode: 'EN', releaseDate: '2024/09/13', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv8', name: 'Surging Sparks', series: 'Scarlet & Violet', code: 'SSP', total: 252, printedTotal: 191, language: 'English', languageCode: 'EN', releaseDate: '2024/11/08', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv85', name: 'Prismatic Evolutions', series: 'Scarlet & Violet', code: 'PRE', total: 186, printedTotal: 103, language: 'English', languageCode: 'EN', releaseDate: '2025/01/17', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv09', name: 'Journey Together', series: 'Scarlet & Violet', code: 'JTG', total: 220, printedTotal: 159, language: 'English', languageCode: 'EN', releaseDate: '2025/03/28', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'sv10', name: 'Destined Rivals', series: 'Scarlet & Violet', code: 'DRI', total: 250, printedTotal: 182, language: 'English', languageCode: 'EN', releaseDate: '2025/06/06', logo: null, symbol: null, isOnlineOnly: false },

      // ═══════════════════════════════════════════════════════════════════════════
      // Japanese SV10 Sets (Black Bolt / White Flare)
      // ═══════════════════════════════════════════════════════════════════════════
      { id: 'zsv10pt5', name: 'Black Bolt', series: 'Scarlet & Violet', code: 'BLK', total: 108, printedTotal: 86, language: 'English', languageCode: 'EN', releaseDate: '2025/04/25', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'rsv10pt5', name: 'White Flare', series: 'Scarlet & Violet', code: 'WHF', total: 108, printedTotal: 86, language: 'English', languageCode: 'EN', releaseDate: '2025/04/25', logo: null, symbol: null, isOnlineOnly: false },
      
      // ═══════════════════════════════════════════════════════════════════════
      // Mega Evolution Era (New 2025)
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'me1', name: 'Mega Evolution', series: 'Mega Evolution', code: 'MEG', total: 188, printedTotal: 132, language: 'English', languageCode: 'EN', releaseDate: '2025/09/26', logo: null, symbol: null, isOnlineOnly: false },
      
      // ═══════════════════════════════════════════════════════════════════════
      // Promo Sets
      // ═══════════════════════════════════════════════════════════════════════
      { id: 'svp', name: 'SV Black Star Promos', series: 'Scarlet & Violet', code: 'SVP', total: 200, printedTotal: 200, language: 'English', languageCode: 'EN', releaseDate: '2023/03/31', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'swshp', name: 'SWSH Black Star Promos', series: 'Sword & Shield', code: 'SWSH', total: 300, printedTotal: 300, language: 'English', languageCode: 'EN', releaseDate: '2020/02/07', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'smp', name: 'SM Black Star Promos', series: 'Sun & Moon', code: 'SM', total: 250, printedTotal: 250, language: 'English', languageCode: 'EN', releaseDate: '2017/02/03', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'xyp', name: 'XY Black Star Promos', series: 'XY', code: 'XY', total: 211, printedTotal: 211, language: 'English', languageCode: 'EN', releaseDate: '2014/02/05', logo: null, symbol: null, isOnlineOnly: false },
      { id: 'bwp', name: 'BW Black Star Promos', series: 'Black & White', code: 'BW', total: 101, printedTotal: 101, language: 'English', languageCode: 'EN', releaseDate: '2011/04/25', logo: null, symbol: null, isOnlineOnly: false },
    ];
    
    for (const exp of expansions) {
      this.expansions.set(exp.id, exp);
    }
    
    this.lastUpdated = new Date();
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // Load Aliases
  // ─────────────────────────────────────────────────────────────────────────
  
  private loadAliases(): void {
    const aliases: Record<string, string> = {
      // ═══════════════════════════════════════════════════════════════════════
      // CRITICAL: Base Set 2 MUST come before Base Set aliases
      // ═══════════════════════════════════════════════════════════════════════
      'base set 2': 'base4',
      'base 2': 'base4',
      'bs2': 'base4',
      'base set two': 'base4',
      
      // Base Set (AFTER Base Set 2)
      'base set': 'base1',
      'base': 'base1',
      'bs': 'base1',
      
      // ═══════════════════════════════════════════════════════════════════════
      // CRITICAL: Mega Evolution MUST come before Evolutions aliases
      // ═══════════════════════════════════════════════════════════════════════
      'mega evolution': 'me1',
      'mega evolutions': 'me1',
      'mega evo': 'me1',
      'meg': 'me1',
      
      // XY Evolutions (AFTER Mega Evolution)
      'evolutions': 'xy12',
      'xy evolutions': 'xy12',
      'evo': 'xy12',
      
      // WOTC Era
      'jungle': 'base2',
      'fossil': 'base3',
      'team rocket': 'base5',
      'rocket': 'base5',
      'tr': 'base5',
      'gym heroes': 'gym1',
      'gym challenge': 'gym2',
      'legendary collection': 'base6',
      'leg coll': 'base6',
      'lc': 'base6',
      
      // Neo Era
      'neo genesis': 'neo1',
      'genesis': 'neo1',
      'neo discovery': 'neo2',
      'discovery': 'neo2',
      'neo revelation': 'neo3',
      'revelation': 'neo3',
      'neo destiny': 'neo4',
      'destiny': 'neo4',
      
      // e-Card Era
      'expedition': 'ecard1',
      'expedition base set': 'ecard1',
      'aquapolis': 'ecard2',
      'skyridge': 'ecard3',
      
      // Modern sets - quick aliases
      'breakthrough': 'xy8',
      'breakpoint': 'xy9',
      'generations': 'g1',
      'fates collide': 'xy10',
      'steam siege': 'xy11',
      
      // Sun & Moon
      'sun and moon': 'sm1',
      'sun moon': 'sm1',
      'sm': 'sm1',
      'guardians rising': 'sm2',
      'burning shadows': 'sm3',
      'shining legends': 'sm35',
      'crimson invasion': 'sm4',
      'ultra prism': 'sm5',
      'forbidden light': 'sm6',
      'celestial storm': 'sm7',
      'dragon majesty': 'sm75',
      'lost thunder': 'sm8',
      'team up': 'sm9',
      'detective pikachu': 'det1',
      'unbroken bonds': 'sm10',
      'unified minds': 'sm11',
      'hidden fates': 'sm115',
      'cosmic eclipse': 'sm12',
      
      // Sword & Shield
      'sword and shield': 'swsh1',
      'sword shield': 'swsh1',
      'swsh': 'swsh1',
      'rebel clash': 'swsh2',
      'darkness ablaze': 'swsh3',
      'champions path': 'swsh35',
      "champion's path": 'swsh35',
      'vivid voltage': 'swsh4',
      'shining fates': 'swsh45',
      'battle styles': 'swsh5',
      'chilling reign': 'swsh6',
      'evolving skies': 'swsh7',
      'celebrations': 'cel25',
      'fusion strike': 'swsh8',
      'brilliant stars': 'swsh9',
      'astral radiance': 'swsh10',
      'pokemon go': 'pgo',
      'pogo': 'pgo',
      'lost origin': 'swsh11',
      'silver tempest': 'swsh12',
      'crown zenith': 'swsh125',
      
      // Scarlet & Violet
      'scarlet and violet': 'sv1',
      'scarlet violet': 'sv1',
      'sv': 'sv1',
      'paldea evolved': 'sv2',
      '151': 'sv35',
      'obsidian flames': 'sv3',
      'paradox rift': 'sv4',
      'paldean fates': 'sv45',
      'temporal forces': 'sv5',
      'twilight masquerade': 'sv6',
      'shrouded fable': 'sv65',
      'stellar crown': 'sv7',
      'surging sparks': 'sv8',
      'prismatic evolutions': 'sv85',
      'prismatic': 'sv85',
      'journey together': 'sv09',
      'destined rivals': 'sv10',
      'black bolt': 'zsv10pt5',
      'white flare': 'rsv10pt5',
      
      // Promos
      'sv promos': 'svp',
      'sv promo': 'svp',
      'swsh promos': 'swshp',
      'swsh promo': 'swshp',
      'sm promos': 'smp',
      'sm promo': 'smp',
      'xy promos': 'xyp',
      'xy promo': 'xyp',
      'bw promos': 'bwp',
      'bw promo': 'bwp',

      // ═══════════════════════════════════════════════════════════════════════
      // Additional common eBay title variations & abbreviations
      // ═══════════════════════════════════════════════════════════════════════

      // Scarlet & Violet variations
      'scarlet & violet': 'sv1',
      's&v': 'sv1',
      'snv': 'sv1',
      'pe': 'sv2',
      'paldea': 'sv2',
      'mew 151': 'sv35',
      'pokemon 151': 'sv35',
      '151 sv': 'sv35',
      'of': 'sv3',
      'obs flames': 'sv3',
      'pr': 'sv4',
      'para rift': 'sv4',
      'pf': 'sv45',
      'pal fates': 'sv45',
      'tf': 'sv5',
      'temp forces': 'sv5',
      'tm': 'sv6',
      'twi masq': 'sv6',
      'twilight masq': 'sv6',
      'sf': 'sv65',
      'sc': 'sv7',
      'stell crown': 'sv7',
      'ss': 'sv8',
      'surg sparks': 'sv8',
      'prism evo': 'sv85',
      'prism evolutions': 'sv85',
      'jt': 'sv09',
      'jour together': 'sv09',
      'sv09': 'sv09',
      'sv9': 'sv09',
      'dr': 'sv10',
      'dest rivals': 'sv10',
      'sv10': 'sv10',
      'blk': 'zsv10pt5',
      'sv11b': 'zsv10pt5',
      'sv11 black': 'zsv10pt5',
      'whf': 'rsv10pt5',
      'sv11w': 'rsv10pt5',
      'sv11 white': 'rsv10pt5',

      // Sword & Shield variations
      'sword & shield': 'swsh1',
      's&s': 'swsh1',
      'sns': 'swsh1',
      'rc': 'swsh2',
      'da': 'swsh3',
      'dark ablaze': 'swsh3',
      'cp': 'swsh35',
      'champ path': 'swsh35',
      'vv': 'swsh4',
      'shf': 'swsh45',
      'shin fates': 'swsh45',
      'bstyles': 'swsh5',
      'bat styles': 'swsh5',
      'cr': 'swsh6',
      'chill reign': 'swsh6',
      'es': 'swsh7',
      'evo skies': 'swsh7',
      'evol skies': 'swsh7',
      'cel': 'cel25',
      'cel25': 'cel25',
      '25th': 'cel25',
      '25th anniversary': 'cel25',
      'fs': 'swsh8',
      'fus strike': 'swsh8',
      'brs': 'swsh9',
      'brill stars': 'swsh9',
      'ar': 'swsh10',
      'astr rad': 'swsh10',
      'lo': 'swsh11',
      'lst origin': 'swsh11',
      'st': 'swsh12',
      'silv temp': 'swsh12',
      'cz': 'swsh125',
      'crwn zenith': 'swsh125',

      // Sun & Moon variations
      'sun & moon': 'sm1',
      's&m': 'sm1',
      'gr': 'sm2',
      'guard rising': 'sm2',
      'burn shadows': 'sm3',
      'sl': 'sm35',
      'shin leg': 'sm35',
      'ci': 'sm4',
      'crim invasion': 'sm4',
      'up': 'sm5',
      'ult prism': 'sm5',
      'fl': 'sm6',
      'forb light': 'sm6',
      'cs': 'sm7',
      'cel storm': 'sm7',
      'dm': 'sm75',
      'drag maj': 'sm75',
      'lt': 'sm8',
      'lst thunder': 'sm8',
      'tu': 'sm9',
      'ub': 'sm10',
      'unbr bonds': 'sm10',
      'um': 'sm11',
      'uni minds': 'sm11',
      'hf': 'sm115',
      'hidd fates': 'sm115',
      'ce': 'sm12',
      'cosm eclipse': 'sm12',

      // XY era variations
      'xy base': 'xy1',
      'flashfire': 'xy2',
      'flash fire': 'xy2',
      'ff': 'xy2',
      'furious fists': 'xy3',
      'fur fists': 'xy3',
      'phantom forces': 'xy4',
      'phant forces': 'xy4',
      'phantf': 'xy4',
      'primal clash': 'xy5',
      'prim clash': 'xy5',
      'roaring skies': 'xy6',
      'roar skies': 'xy6',
      'ancient origins': 'xy7',
      'anc origins': 'xy7',
      'ao': 'xy7',
      'bt': 'xy8',
      'bp': 'xy9',
      'fc': 'xy10',
      'steam': 'xy11',

      // BW era variations
      'black white': 'bw1',
      'black & white': 'bw1',
      'b&w': 'bw1',
      'bnw': 'bw1',
      'emerging powers': 'bw2',
      'emerg powers': 'bw2',
      'noble victories': 'bw3',
      'nob victories': 'bw3',
      'next destinies': 'bw4',
      'nxt destinies': 'bw4',
      'dark explorers': 'bw5',
      'drk explorers': 'bw5',
      'dragons exalted': 'bw6',
      'drag exalted': 'bw6',
      'dragon vault': 'dv1',
      'drag vault': 'dv1',
      'boundaries crossed': 'bw7',
      'bound crossed': 'bw7',
      'plasma storm': 'bw8',
      'plasm storm': 'bw8',
      'plasma freeze': 'bw9',
      'plasm freeze': 'bw9',
      'plasma blast': 'bw10',
      'plasm blast': 'bw10',
      'legendary treasures': 'bw11',
      'leg treasures': 'bw11',

      // Common typos
      'evoling skies': 'swsh7',
      'evovling skies': 'swsh7',
      'celebratoins': 'cel25',
      'celebrtions': 'cel25',
      'briliant stars': 'swsh9',
      'brillant stars': 'swsh9',
      'temporl forces': 'sv5',
      'temproal forces': 'sv5',
      'primsatic': 'sv85',
      'prismtic': 'sv85',

      // ═══════════════════════════════════════════════════════════════════════
      // Additional variations for WOTC vintage era
      // ═══════════════════════════════════════════════════════════════════════
      'neo gen': 'neo1',
      'genisis': 'neo1',  // Common typo
      'neo genisis': 'neo1',
      'neo disc': 'neo2',
      'neo rev': 'neo3',
      'neo dest': 'neo4',
      'gym 1': 'gym1',
      'gym 2': 'gym2',
      'gym hero': 'gym1',
      'gym chal': 'gym2',

      // Team Rocket variations
      'team rocket returns': 'ex7',
      'trr': 'ex7',
      'rocket returns': 'ex7',

      // EX era full names (avoid conflicts)
      'ex ruby sapphire': 'ex1',
      'ruby and sapphire': 'ex1',
      'ex sandstorm': 'ex2',
      'ex dragon': 'ex3',
      'ex team magma': 'ex4',
      'team magma team aqua': 'ex4',
      'ex hidden legends': 'ex5',
      'ex firered leafgreen': 'ex6',
      'firered leafgreen': 'ex6',
      'ex deoxys': 'ex8',
      'deoxys': 'ex8',
      'ex emerald': 'ex9',
      'ex unseen forces': 'ex10',
      'ex delta species': 'ex11',
      'delta species': 'ex11',
      'ex legend maker': 'ex12',
      'legend maker': 'ex12',
      'ex holon phantoms': 'ex13',
      'holon phantoms': 'ex13',
      'ex crystal guardians': 'ex14',
      'crystal guardians': 'ex14',
      'ex dragon frontiers': 'ex15',
      'dragon frontiers': 'ex15',
      'ex power keepers': 'ex16',
      'power keepers': 'ex16',

      // D&P era variations
      'dp': 'dp1',
      'diamond pearl': 'dp1',
      'd&p': 'dp1',
      'mysterious treasures': 'dp2',
      'secret wonders': 'dp3',
      'great encounters': 'dp4',
      'majestic dawn': 'dp5',
      'legends awakened': 'dp6',
      'stormfront': 'dp7',

      // Platinum era variations
      'pt': 'pl1',
      'platinum': 'pl1',
      'rising rivals': 'pl2',
      'supreme victors': 'pl3',
      'arceus': 'pl4',

      // HGSS era variations
      'hgss': 'hgss1',
      'heartgold soulsilver': 'hgss1',
      'heart gold soul silver': 'hgss1',
      'unleashed': 'hgss2',
      'undaunted': 'hgss3',
      'triumphant': 'hgss4',
      'call of legends': 'col1',

      // Southern Islands
      'southern islands': 'si1',
      'south islands': 'si1',
    };
    
    for (const [alias, id] of Object.entries(aliases)) {
      this.aliases.set(alias, id);
    }
  }
}

export const expansionService = new ExpansionService();