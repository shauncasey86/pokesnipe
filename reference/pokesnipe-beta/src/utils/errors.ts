// src/utils/errors.ts
// ═══════════════════════════════════════════════════════════════════════════
// Standardized Error Handling - Consistent error types and handling
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from './logger.js';

/**
 * Base application error with structured data
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code?: string;
      statusCode?: number;
      isOperational?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'INTERNAL_ERROR';
    this.statusCode = options.statusCode || 500;
    this.isOperational = options.isOperational ?? true;
    this.context = options.context;

    if (options.cause) {
      this.cause = options.cause;
    }

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error for invalid input
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      isOperational: true,
      context,
    });
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    super(`${resource}${identifier ? ` '${identifier}'` : ''} not found`, {
      code: 'NOT_FOUND',
      statusCode: 404,
      isOperational: true,
      context: { resource, identifier },
    });
  }
}

/**
 * External API error (eBay, Scrydex, etc.)
 */
export class ExternalApiError extends AppError {
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(
    service: string,
    message: string,
    options: {
      statusCode?: number;
      originalError?: Error;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(`${service} API error: ${message}`, {
      code: 'EXTERNAL_API_ERROR',
      statusCode: options.statusCode || 502,
      isOperational: true,
      context: { service, ...options.context },
      cause: options.originalError,
    });
    this.service = service;
    this.originalError = options.originalError;
  }
}

/**
 * Database error
 */
export class DatabaseError extends AppError {
  constructor(operation: string, message: string, originalError?: Error) {
    super(`Database ${operation} failed: ${message}`, {
      code: 'DATABASE_ERROR',
      statusCode: 500,
      isOperational: false,
      context: { operation },
      cause: originalError,
    });
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(retryAfter: number = 60) {
    super('Rate limit exceeded', {
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429,
      isOperational: true,
      context: { retryAfter },
    });
    this.retryAfter = retryAfter;
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends AppError {
  constructor(message: string, missingFields?: string[]) {
    super(message, {
      code: 'CONFIGURATION_ERROR',
      statusCode: 500,
      isOperational: false,
      context: { missingFields },
    });
  }
}

/**
 * Safely extracts error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error occurred';
}

/**
 * Safely extracts error stack from unknown error type
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Creates a structured error object for logging
 */
export function toErrorObject(error: unknown): Record<string, unknown> {
  if (error instanceof AppError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      context: error.context,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: getErrorMessage(error),
    rawError: error,
  };
}

/**
 * Logs an error with appropriate level based on type
 */
export function logError(event: string, error: unknown, context?: Record<string, unknown>): void {
  const errorObj = toErrorObject(error);

  if (error instanceof AppError && error.isOperational) {
    logger.warn({
      event,
      ...errorObj,
      ...context,
    });
  } else {
    logger.error({
      event,
      ...errorObj,
      ...context,
    });
  }
}

/**
 * Wraps an async function with standardized error handling
 */
export function withErrorHandling<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  errorEvent: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(errorEvent, error);
      throw error;
    }
  }) as T;
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = AppError> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Creates a success result
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Creates a failure result
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Wraps a promise to return a Result type
 */
export async function tryAsync<T>(
  promise: Promise<T>,
  errorTransform?: (error: unknown) => AppError
): Promise<Result<T, AppError>> {
  try {
    const data = await promise;
    return ok(data);
  } catch (error) {
    if (error instanceof AppError) {
      return err(error);
    }
    if (errorTransform) {
      return err(errorTransform(error));
    }
    return err(
      new AppError(getErrorMessage(error), {
        cause: error instanceof Error ? error : undefined,
      })
    );
  }
}
