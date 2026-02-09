// src/__tests__/config-validation.test.ts
import { validateConfig, formatValidationResults, ValidationResult } from '../config/validation.js';

describe('Configuration Validation', () => {
  // Store original env values
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env to original state
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('validateConfig', () => {
    it('should return errors for missing required Scrydex credentials', () => {
      delete process.env.SCRYDEX_API_KEY;
      delete process.env.SCRYDEX_TEAM_ID;

      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'SCRYDEX_API_KEY',
          required: true,
        })
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'SCRYDEX_TEAM_ID',
          required: true,
        })
      );
    });

    it('should return errors for missing required eBay credentials', () => {
      delete process.env.EBAY_CLIENT_ID;
      delete process.env.EBAY_CLIENT_SECRET;

      const result = validateConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'EBAY_CLIENT_ID',
          required: true,
        })
      );
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'EBAY_CLIENT_SECRET',
          required: true,
        })
      );
    });

    it('should return warning for missing EPN Campaign ID', () => {
      process.env.SCRYDEX_API_KEY = 'test-key';
      process.env.SCRYDEX_TEAM_ID = 'test-team';
      process.env.EBAY_CLIENT_ID = 'test-client';
      process.env.EBAY_CLIENT_SECRET = 'test-secret';
      delete process.env.EPN_CAMPAIGN_ID;

      const result = validateConfig();

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          field: 'EPN_CAMPAIGN_ID',
          required: false,
        })
      );
    });

    it('should return warning for missing database URL', () => {
      process.env.SCRYDEX_API_KEY = 'test-key';
      process.env.SCRYDEX_TEAM_ID = 'test-team';
      process.env.EBAY_CLIENT_ID = 'test-client';
      process.env.EBAY_CLIENT_SECRET = 'test-secret';
      delete process.env.DATABASE_URL;
      delete process.env.POSTGRES_URL;
      delete process.env.PGHOST;

      const result = validateConfig();

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          field: 'DATABASE_URL',
          required: false,
        })
      );
    });

    it('should return warning for missing Redis URL', () => {
      process.env.SCRYDEX_API_KEY = 'test-key';
      process.env.SCRYDEX_TEAM_ID = 'test-team';
      process.env.EBAY_CLIENT_ID = 'test-client';
      process.env.EBAY_CLIENT_SECRET = 'test-secret';
      delete process.env.REDIS_URL;

      const result = validateConfig();

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          field: 'REDIS_URL',
          required: false,
        })
      );
    });

    it('should validate successfully with all required fields', () => {
      process.env.SCRYDEX_API_KEY = 'test-key';
      process.env.SCRYDEX_TEAM_ID = 'test-team';
      process.env.EBAY_CLIENT_ID = 'test-client';
      process.env.EBAY_CLIENT_SECRET = 'test-secret';

      const result = validateConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for invalid PORT', () => {
      process.env.PORT = 'invalid';

      const result = validateConfig();

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'PORT',
        })
      );
    });

    it('should return error for PORT out of range', () => {
      process.env.PORT = '70000';

      const result = validateConfig();

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'PORT',
        })
      );
    });

    it('should return error for invalid PG_POOL_MAX', () => {
      process.env.PG_POOL_MAX = '-5';

      const result = validateConfig();

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'PG_POOL_MAX',
        })
      );
    });
  });

  describe('formatValidationResults', () => {
    it('should format errors correctly', () => {
      const result: ValidationResult = {
        valid: false,
        errors: [
          { field: 'TEST_FIELD', message: 'Test error', required: true },
        ],
        warnings: [],
      };

      const output = formatValidationResults(result);

      expect(output).toContain('CONFIGURATION ERRORS');
      expect(output).toContain('[ERROR] TEST_FIELD');
      expect(output).toContain('Test error');
    });

    it('should format warnings correctly', () => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [
          { field: 'OPTIONAL_FIELD', message: 'Test warning', required: false },
        ],
      };

      const output = formatValidationResults(result);

      expect(output).toContain('Configuration Warnings');
      expect(output).toContain('[WARN] OPTIONAL_FIELD');
      expect(output).toContain('Test warning');
    });

    it('should show success message when valid with no warnings', () => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
      };

      const output = formatValidationResults(result);

      expect(output).toContain('[OK]');
      expect(output).toContain('validated successfully');
    });

    it('should show partial success message when valid with warnings', () => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [
          { field: 'OPTIONAL', message: 'Warning', required: false },
        ],
      };

      const output = formatValidationResults(result);

      expect(output).toContain('[OK]');
      expect(output).toContain('see warnings above');
    });
  });
});
