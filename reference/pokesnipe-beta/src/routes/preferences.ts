// src/routes/preferences.ts
// ═══════════════════════════════════════════════════════════════════════════
// User Preferences API Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { getPool } from '../services/database/postgres.js';
import { logger } from '../utils/logger.js';
import { scannerLoop } from '../services/scanner/index.js';
import type { ScannerMode, SearchType, CustomSearchTerm } from '../services/scanner/types.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UserPreferences {
  // Scanner mode: 'both', 'graded', 'raw'
  scannerMode: 'both' | 'graded' | 'raw';
  // Search type: 'dynamic' for built-in weighted queries, 'custom' for user-defined terms, 'recent' for newest listings
  searchType: 'dynamic' | 'custom' | 'recent';
  // Custom search terms (only used when searchType is 'custom')
  customSearchTerms: CustomSearchTerm[];
  // Deal filtering
  minProfitGBP: number;
  preferredGradingCompanies: string[];
  minGrade: number;
  maxGrade: number;
  ungradedConditions: string[];
  // Tier thresholds
  tierPremiumValue: number;
  tierPremiumDiscount: number;
  tierHighValue: number;
  tierHighDiscount: number;
  tierStandardValue: number;
  tierStandardDiscount: number;
  // Display
  currency: string;
  // Scanner
  dailyCreditBudget: number;
  operatingHoursStart: number;
  operatingHoursEnd: number;
  autoStartScanner: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  scannerMode: 'both',
  searchType: 'dynamic',
  customSearchTerms: [],
  minProfitGBP: 5,
  preferredGradingCompanies: ['PSA', 'CGC', 'BGS'],
  minGrade: 1,
  maxGrade: 10,
  ungradedConditions: ['NM', 'LP', 'MP'],
  tierPremiumValue: 1000,
  tierPremiumDiscount: 10,
  tierHighValue: 500,
  tierHighDiscount: 15,
  tierStandardValue: 0,
  tierStandardDiscount: 20,
  currency: 'GBP',
  dailyCreditBudget: 1500,
  operatingHoursStart: 6,
  operatingHoursEnd: 23,
  autoStartScanner: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/preferences - Get user preferences
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool();

    if (!pool) {
      // Return defaults if no database
      res.json(DEFAULT_PREFERENCES);
      return;
    }

    const result = await pool.query(`
      SELECT
        scanner_mode,
        search_type,
        custom_search_terms,
        min_profit_gbp,
        preferred_grading_companies,
        min_grade,
        max_grade,
        ungraded_conditions,
        tier_premium_value,
        tier_premium_discount,
        tier_high_value,
        tier_high_discount,
        tier_standard_value,
        tier_standard_discount,
        currency,
        daily_credit_budget,
        operating_hours_start,
        operating_hours_end,
        auto_start_scanner
      FROM user_preferences
      WHERE id = 1
    `);

    if (result.rows.length === 0) {
      res.json({ status: 'ok', data: DEFAULT_PREFERENCES });
      return;
    }

    const row = result.rows[0];
    const preferences: UserPreferences = {
      scannerMode: (['both', 'graded', 'raw'].includes(row.scanner_mode) ? row.scanner_mode : DEFAULT_PREFERENCES.scannerMode) as 'both' | 'graded' | 'raw',
      searchType: (['dynamic', 'custom', 'recent'].includes(row.search_type) ? row.search_type : DEFAULT_PREFERENCES.searchType) as 'dynamic' | 'custom' | 'recent',
      customSearchTerms: (Array.isArray(row.custom_search_terms) ? row.custom_search_terms : DEFAULT_PREFERENCES.customSearchTerms) as CustomSearchTerm[],
      minProfitGBP: parseFloat(row.min_profit_gbp) || DEFAULT_PREFERENCES.minProfitGBP,
      preferredGradingCompanies: row.preferred_grading_companies || DEFAULT_PREFERENCES.preferredGradingCompanies,
      minGrade: parseFloat(row.min_grade) ?? DEFAULT_PREFERENCES.minGrade,
      maxGrade: parseFloat(row.max_grade) || DEFAULT_PREFERENCES.maxGrade,
      ungradedConditions: row.ungraded_conditions || DEFAULT_PREFERENCES.ungradedConditions,
      tierPremiumValue: parseInt(row.tier_premium_value, 10) ?? DEFAULT_PREFERENCES.tierPremiumValue,
      tierPremiumDiscount: parseInt(row.tier_premium_discount, 10) ?? DEFAULT_PREFERENCES.tierPremiumDiscount,
      tierHighValue: parseInt(row.tier_high_value, 10) ?? DEFAULT_PREFERENCES.tierHighValue,
      tierHighDiscount: parseInt(row.tier_high_discount, 10) ?? DEFAULT_PREFERENCES.tierHighDiscount,
      tierStandardValue: parseInt(row.tier_standard_value, 10) ?? DEFAULT_PREFERENCES.tierStandardValue,
      tierStandardDiscount: parseInt(row.tier_standard_discount, 10) ?? DEFAULT_PREFERENCES.tierStandardDiscount,
      currency: row.currency || DEFAULT_PREFERENCES.currency,
      dailyCreditBudget: parseInt(row.daily_credit_budget, 10) || DEFAULT_PREFERENCES.dailyCreditBudget,
      operatingHoursStart: parseInt(row.operating_hours_start, 10) ?? DEFAULT_PREFERENCES.operatingHoursStart,
      operatingHoursEnd: parseInt(row.operating_hours_end, 10) ?? DEFAULT_PREFERENCES.operatingHoursEnd,
      autoStartScanner: row.auto_start_scanner ?? DEFAULT_PREFERENCES.autoStartScanner,
    };

    res.json({ status: 'ok', data: preferences });
  } catch (error) {
    logger.error('PREFERENCES_GET_ERROR', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/preferences - Update user preferences
// ─────────────────────────────────────────────────────────────────────────────

router.put('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool();

    if (!pool) {
      res.status(503).json({ error: 'Database not available' });
      return;
    }

    const prefs: Partial<UserPreferences> = req.body;

    // Validate and sanitize inputs
    const updates: string[] = [];
    const values: (string | number | boolean | string[])[] = [];
    let paramIndex = 1;

    if (prefs.scannerMode !== undefined) {
      const validModes = ['both', 'graded', 'raw'];
      const mode = validModes.includes(prefs.scannerMode) ? prefs.scannerMode : 'both';
      updates.push(`scanner_mode = $${paramIndex++}`);
      values.push(mode);
    }

    if (prefs.searchType !== undefined) {
      const validTypes = ['dynamic', 'custom', 'recent'];
      const searchType = validTypes.includes(prefs.searchType) ? prefs.searchType : 'dynamic';
      updates.push(`search_type = $${paramIndex++}`);
      values.push(searchType);
    }

    if (prefs.customSearchTerms !== undefined) {
      // Validate and sanitize custom search terms
      const validatedTerms: CustomSearchTerm[] = [];
      if (Array.isArray(prefs.customSearchTerms)) {
        for (const term of prefs.customSearchTerms) {
          if (term && typeof term.term === 'string' && term.term.trim().length > 0) {
            validatedTerms.push({
              term: term.term.trim().substring(0, 200), // Max 200 chars per term
              weight: Math.max(1, Math.min(5, Number(term.weight) || 2)),
              enabled: term.enabled !== false,
            });
          }
        }
      }
      // Limit to 50 custom terms max
      const finalTerms = validatedTerms.slice(0, 50);
      updates.push(`custom_search_terms = $${paramIndex++}`);
      values.push(JSON.stringify(finalTerms));
    }

    if (prefs.minProfitGBP !== undefined) {
      const value = Math.max(1, Math.min(1000, Number(prefs.minProfitGBP)));
      updates.push(`min_profit_gbp = $${paramIndex++}`);
      values.push(value);
    }

    if (prefs.preferredGradingCompanies !== undefined) {
      const validCompanies = ['PSA', 'CGC', 'BGS', 'SGC', 'ACE', 'TAG', 'AGS', 'GMA'];
      const companies = prefs.preferredGradingCompanies.filter(c => validCompanies.includes(c.toUpperCase()));
      updates.push(`preferred_grading_companies = $${paramIndex++}`);
      values.push(companies);
    }

    if (prefs.minGrade !== undefined) {
      const value = Math.max(1, Math.min(10, Number(prefs.minGrade)));
      updates.push(`min_grade = $${paramIndex++}`);
      values.push(value);
    }

    if (prefs.maxGrade !== undefined) {
      const value = Math.max(1, Math.min(10, Number(prefs.maxGrade)));
      updates.push(`max_grade = $${paramIndex++}`);
      values.push(value);
    }

    if (prefs.ungradedConditions !== undefined) {
      const validConditions = ['NM', 'LP', 'MP', 'HP'];
      const conditions = prefs.ungradedConditions.filter(c => validConditions.includes(c.toUpperCase()));
      updates.push(`ungraded_conditions = $${paramIndex++}`);
      values.push(conditions);
    }

    // Tier thresholds
    if (prefs.tierPremiumValue !== undefined) {
      const value = Math.max(0, Math.min(100000, Number(prefs.tierPremiumValue)));
      updates.push(`tier_premium_value = $${paramIndex++}`);
      values.push(value);
    }

    if (prefs.tierPremiumDiscount !== undefined) {
      const value = Math.max(1, Math.min(90, Number(prefs.tierPremiumDiscount)));
      updates.push(`tier_premium_discount = $${paramIndex++}`);
      values.push(value);
    }

    if (prefs.tierHighValue !== undefined) {
      const value = Math.max(0, Math.min(100000, Number(prefs.tierHighValue)));
      updates.push(`tier_high_value = $${paramIndex++}`);
      values.push(value);
    }

    if (prefs.tierHighDiscount !== undefined) {
      const value = Math.max(1, Math.min(90, Number(prefs.tierHighDiscount)));
      updates.push(`tier_high_discount = $${paramIndex++}`);
      values.push(value);
    }

    if (prefs.tierStandardValue !== undefined) {
      const value = Math.max(0, Math.min(100000, Number(prefs.tierStandardValue)));
      updates.push(`tier_standard_value = $${paramIndex++}`);
      values.push(value);
    }

    if (prefs.tierStandardDiscount !== undefined) {
      const value = Math.max(1, Math.min(90, Number(prefs.tierStandardDiscount)));
      updates.push(`tier_standard_discount = $${paramIndex++}`);
      values.push(value);
    }

    if (prefs.currency !== undefined) {
      const validCurrencies = ['GBP', 'USD', 'EUR'];
      const currency = validCurrencies.includes(prefs.currency.toUpperCase()) ? prefs.currency.toUpperCase() : 'GBP';
      updates.push(`currency = $${paramIndex++}`);
      values.push(currency);
    }

    if (prefs.dailyCreditBudget !== undefined) {
      const value = Math.max(100, Math.min(10000, Number(prefs.dailyCreditBudget)));
      updates.push(`daily_credit_budget = $${paramIndex++}`);
      values.push(value);
    }

    if (prefs.operatingHoursStart !== undefined) {
      const value = Math.max(0, Math.min(23, Number(prefs.operatingHoursStart)));
      updates.push(`operating_hours_start = $${paramIndex++}`);
      values.push(value);
    }

    if (prefs.operatingHoursEnd !== undefined) {
      const value = Math.max(0, Math.min(23, Number(prefs.operatingHoursEnd)));
      updates.push(`operating_hours_end = $${paramIndex++}`);
      values.push(value);
    }

    if (prefs.autoStartScanner !== undefined) {
      updates.push(`auto_start_scanner = $${paramIndex++}`);
      values.push(Boolean(prefs.autoStartScanner));
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No valid preferences to update' });
      return;
    }

    const query = `
      UPDATE user_preferences
      SET ${updates.join(', ')}
      WHERE id = 1
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      // Insert if not exists
      await pool.query('INSERT INTO user_preferences (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
      // Retry update
      await pool.query(query, values);
    }

    logger.info('PREFERENCES_UPDATED', { updates: updates.length });

    // If scanner mode was updated, notify the scanner
    if (prefs.scannerMode !== undefined) {
      const validModes = ['both', 'graded', 'raw'];
      const mode = validModes.includes(prefs.scannerMode) ? prefs.scannerMode : 'both';
      scannerLoop.setScannerMode(mode as ScannerMode);
    }

    // If search type was updated, notify the scanner
    if (prefs.searchType !== undefined) {
      const validTypes = ['dynamic', 'custom', 'recent'];
      const searchType = validTypes.includes(prefs.searchType) ? prefs.searchType : 'dynamic';
      scannerLoop.setSearchType(searchType as SearchType);
    }

    // If custom search terms were updated, notify the scanner
    if (prefs.customSearchTerms !== undefined) {
      // Re-validate for the scanner
      const validatedTerms: CustomSearchTerm[] = [];
      if (Array.isArray(prefs.customSearchTerms)) {
        for (const term of prefs.customSearchTerms) {
          if (term && typeof term.term === 'string' && term.term.trim().length > 0) {
            validatedTerms.push({
              term: term.term.trim().substring(0, 200),
              weight: Math.max(1, Math.min(5, Number(term.weight) || 2)),
              enabled: term.enabled !== false,
            });
          }
        }
      }
      scannerLoop.setCustomSearchTerms(validatedTerms.slice(0, 50));
    }

    // Re-fetch and return the updated preferences
    const updated = await pool.query(`
      SELECT * FROM user_preferences WHERE id = 1
    `);

    const row = updated.rows[0];
    const preferences: UserPreferences = {
      scannerMode: (['both', 'graded', 'raw'].includes(row.scanner_mode) ? row.scanner_mode : DEFAULT_PREFERENCES.scannerMode) as 'both' | 'graded' | 'raw',
      searchType: (['dynamic', 'custom', 'recent'].includes(row.search_type) ? row.search_type : DEFAULT_PREFERENCES.searchType) as 'dynamic' | 'custom' | 'recent',
      customSearchTerms: (Array.isArray(row.custom_search_terms) ? row.custom_search_terms : DEFAULT_PREFERENCES.customSearchTerms) as CustomSearchTerm[],
      minProfitGBP: parseFloat(row.min_profit_gbp) || DEFAULT_PREFERENCES.minProfitGBP,
      preferredGradingCompanies: row.preferred_grading_companies || DEFAULT_PREFERENCES.preferredGradingCompanies,
      minGrade: parseFloat(row.min_grade) ?? DEFAULT_PREFERENCES.minGrade,
      maxGrade: parseFloat(row.max_grade) || DEFAULT_PREFERENCES.maxGrade,
      ungradedConditions: row.ungraded_conditions || DEFAULT_PREFERENCES.ungradedConditions,
      tierPremiumValue: parseInt(row.tier_premium_value, 10) ?? DEFAULT_PREFERENCES.tierPremiumValue,
      tierPremiumDiscount: parseInt(row.tier_premium_discount, 10) ?? DEFAULT_PREFERENCES.tierPremiumDiscount,
      tierHighValue: parseInt(row.tier_high_value, 10) ?? DEFAULT_PREFERENCES.tierHighValue,
      tierHighDiscount: parseInt(row.tier_high_discount, 10) ?? DEFAULT_PREFERENCES.tierHighDiscount,
      tierStandardValue: parseInt(row.tier_standard_value, 10) ?? DEFAULT_PREFERENCES.tierStandardValue,
      tierStandardDiscount: parseInt(row.tier_standard_discount, 10) ?? DEFAULT_PREFERENCES.tierStandardDiscount,
      currency: row.currency || DEFAULT_PREFERENCES.currency,
      dailyCreditBudget: parseInt(row.daily_credit_budget, 10) || DEFAULT_PREFERENCES.dailyCreditBudget,
      operatingHoursStart: parseInt(row.operating_hours_start, 10) ?? DEFAULT_PREFERENCES.operatingHoursStart,
      operatingHoursEnd: parseInt(row.operating_hours_end, 10) ?? DEFAULT_PREFERENCES.operatingHoursEnd,
      autoStartScanner: row.auto_start_scanner ?? DEFAULT_PREFERENCES.autoStartScanner,
    };

    res.json({ status: 'ok', data: preferences });
  } catch (error) {
    logger.error('PREFERENCES_UPDATE_ERROR', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/preferences/reset - Reset to defaults
// ─────────────────────────────────────────────────────────────────────────────

router.post('/reset', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool();

    if (!pool) {
      res.json(DEFAULT_PREFERENCES);
      return;
    }

    await pool.query(`
      UPDATE user_preferences
      SET
        scanner_mode = 'both',
        search_type = 'dynamic',
        custom_search_terms = '[]'::jsonb,
        min_profit_gbp = 5,
        preferred_grading_companies = ARRAY['PSA', 'CGC', 'BGS'],
        min_grade = 1,
        max_grade = 10,
        ungraded_conditions = ARRAY['NM', 'LP', 'MP'],
        tier_premium_value = 1000,
        tier_premium_discount = 10,
        tier_high_value = 500,
        tier_high_discount = 15,
        tier_standard_value = 0,
        tier_standard_discount = 20,
        currency = 'GBP',
        daily_credit_budget = 1500,
        operating_hours_start = 6,
        operating_hours_end = 23,
        auto_start_scanner = FALSE
      WHERE id = 1
    `);

    // Reset scanner to defaults
    scannerLoop.setScannerMode('both');
    scannerLoop.setSearchType('dynamic');
    scannerLoop.setCustomSearchTerms([]);

    logger.info('PREFERENCES_RESET');
    res.json({ status: 'ok', data: DEFAULT_PREFERENCES });
  } catch (error) {
    logger.error('PREFERENCES_RESET_ERROR', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({ error: 'Failed to reset preferences' });
  }
});

export { router as preferencesRouter };
