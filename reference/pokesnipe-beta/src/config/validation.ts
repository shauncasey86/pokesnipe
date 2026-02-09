// src/config/validation.ts
// ═══════════════════════════════════════════════════════════════════════════
// Configuration Validation - Validates all required config on startup
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationError {
  field: string;
  message: string;
  required: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validates environment variables and configuration
 * Returns errors for required fields and warnings for optional but recommended fields
 */
export function validateConfig(): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Required: Scrydex API credentials
  if (!process.env.SCRYDEX_API_KEY) {
    errors.push({
      field: 'SCRYDEX_API_KEY',
      message: 'Scrydex API key is required for card price lookups',
      required: true,
    });
  }

  if (!process.env.SCRYDEX_TEAM_ID) {
    errors.push({
      field: 'SCRYDEX_TEAM_ID',
      message: 'Scrydex Team ID is required for API authentication',
      required: true,
    });
  }

  // Required: eBay API credentials
  if (!process.env.EBAY_CLIENT_ID) {
    errors.push({
      field: 'EBAY_CLIENT_ID',
      message: 'eBay Client ID is required for listing searches',
      required: true,
    });
  }

  if (!process.env.EBAY_CLIENT_SECRET) {
    errors.push({
      field: 'EBAY_CLIENT_SECRET',
      message: 'eBay Client Secret is required for API authentication',
      required: true,
    });
  }

  // Optional but recommended: EPN Campaign ID
  if (!process.env.EPN_CAMPAIGN_ID) {
    warnings.push({
      field: 'EPN_CAMPAIGN_ID',
      message: 'eBay Partner Network Campaign ID not set - affiliate links will not work',
      required: false,
    });
  }

  // Optional: Database configuration
  const hasDatabase = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PGHOST);
  if (!hasDatabase) {
    warnings.push({
      field: 'DATABASE_URL',
      message: 'No PostgreSQL configuration found - using in-memory storage (data will be lost on restart)',
      required: false,
    });
  }

  // Optional: Redis configuration
  if (!process.env.REDIS_URL) {
    warnings.push({
      field: 'REDIS_URL',
      message: 'No Redis URL configured - using in-memory cache',
      required: false,
    });
  }

  // Validate numeric environment variables
  const portValue = process.env.PORT;
  if (portValue && (isNaN(parseInt(portValue, 10)) || parseInt(portValue, 10) < 1 || parseInt(portValue, 10) > 65535)) {
    errors.push({
      field: 'PORT',
      message: `Invalid port number: ${portValue} (must be between 1 and 65535)`,
      required: true,
    });
  }

  const poolMax = process.env.PG_POOL_MAX;
  if (poolMax && (isNaN(parseInt(poolMax, 10)) || parseInt(poolMax, 10) < 1)) {
    errors.push({
      field: 'PG_POOL_MAX',
      message: `Invalid pool max: ${poolMax} (must be a positive integer)`,
      required: false,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Formats validation results for console output
 */
export function formatValidationResults(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push('\n╔═══════════════════════════════════════════════════════════════════════════╗');
    lines.push('║                     CONFIGURATION ERRORS                                   ║');
    lines.push('╚═══════════════════════════════════════════════════════════════════════════╝');
    for (const error of result.errors) {
      lines.push(`  [ERROR] ${error.field}: ${error.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('\n┌───────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                     Configuration Warnings                                 │');
    lines.push('└───────────────────────────────────────────────────────────────────────────┘');
    for (const warning of result.warnings) {
      lines.push(`  [WARN] ${warning.field}: ${warning.message}`);
    }
  }

  if (result.valid && result.warnings.length === 0) {
    lines.push('\n  [OK] All configuration validated successfully');
  } else if (result.valid) {
    lines.push('\n  [OK] Required configuration validated (see warnings above)');
  }

  return lines.join('\n');
}

/**
 * Validates configuration and exits if required fields are missing
 */
export function validateConfigOrExit(): void {
  const result = validateConfig();
  const output = formatValidationResults(result);

  if (output) {
    console.log(output);
  }

  if (!result.valid) {
    console.error('\n  [FATAL] Cannot start server with missing required configuration.');
    console.error('  Please set the required environment variables and try again.\n');
    process.exit(1);
  }
}
