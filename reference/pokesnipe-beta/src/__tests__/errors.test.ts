// src/__tests__/errors.test.ts
import {
  AppError,
  ValidationError,
  NotFoundError,
  ExternalApiError,
  DatabaseError,
  RateLimitError,
  ConfigurationError,
  getErrorMessage,
  getErrorStack,
  toErrorObject,
  ok,
  err,
  tryAsync,
} from '../utils/errors.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    it('should create error with custom values', () => {
      const error = new AppError('Custom error', {
        code: 'CUSTOM_CODE',
        statusCode: 400,
        isOperational: false,
        context: { key: 'value' },
      });

      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(false);
      expect(error.context).toEqual({ key: 'value' });
    });

    it('should preserve cause error', () => {
      const cause = new Error('Original error');
      const error = new AppError('Wrapped error', { cause });

      expect(error.cause).toBe(cause);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with correct defaults', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    it('should include context', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });

      expect(error.context).toEqual({ field: 'email' });
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error for resource', () => {
      const error = new NotFoundError('Card');

      expect(error.message).toBe('Card not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });

    it('should include identifier in message', () => {
      const error = new NotFoundError('Card', '12345');

      expect(error.message).toBe("Card '12345' not found");
      expect(error.context).toEqual({ resource: 'Card', identifier: '12345' });
    });
  });

  describe('ExternalApiError', () => {
    it('should create external API error', () => {
      const error = new ExternalApiError('Scrydex', 'Rate limit exceeded');

      expect(error.message).toBe('Scrydex API error: Rate limit exceeded');
      expect(error.code).toBe('EXTERNAL_API_ERROR');
      expect(error.statusCode).toBe(502);
      expect(error.service).toBe('Scrydex');
    });

    it('should include original error', () => {
      const originalError = new Error('Network timeout');
      const error = new ExternalApiError('eBay', 'Connection failed', {
        originalError,
      });

      expect(error.originalError).toBe(originalError);
      expect(error.cause).toBe(originalError);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('INSERT', 'Constraint violation');

      expect(error.message).toBe('Database INSERT failed: Constraint violation');
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with default retry', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
    });

    it('should accept custom retry after', () => {
      const error = new RateLimitError(120);

      expect(error.retryAfter).toBe(120);
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new ConfigurationError('Missing required config', ['API_KEY']);

      expect(error.message).toBe('Missing required config');
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.isOperational).toBe(false);
      expect(error.context).toEqual({ missingFields: ['API_KEY'] });
    });
  });
});

describe('Error Utilities', () => {
  describe('getErrorMessage', () => {
    it('should extract message from Error', () => {
      const error = new Error('Test message');
      expect(getErrorMessage(error)).toBe('Test message');
    });

    it('should return string errors directly', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should extract message property from object', () => {
      const error = { message: 'Object error' };
      expect(getErrorMessage(error)).toBe('Object error');
    });

    it('should return default for unknown types', () => {
      expect(getErrorMessage(null)).toBe('Unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('Unknown error occurred');
      expect(getErrorMessage(42)).toBe('Unknown error occurred');
    });
  });

  describe('getErrorStack', () => {
    it('should extract stack from Error', () => {
      const error = new Error('Test');
      expect(getErrorStack(error)).toContain('Error: Test');
    });

    it('should return undefined for non-Error types', () => {
      expect(getErrorStack('string error')).toBeUndefined();
      expect(getErrorStack({ message: 'object' })).toBeUndefined();
    });
  });

  describe('toErrorObject', () => {
    it('should convert AppError to object', () => {
      const error = new AppError('Test', {
        code: 'TEST_CODE',
        statusCode: 400,
        context: { key: 'value' },
      });

      const obj = toErrorObject(error);

      expect(obj.name).toBe('AppError');
      expect(obj.message).toBe('Test');
      expect(obj.code).toBe('TEST_CODE');
      expect(obj.statusCode).toBe(400);
      expect(obj.context).toEqual({ key: 'value' });
    });

    it('should convert standard Error to object', () => {
      const error = new Error('Standard error');
      const obj = toErrorObject(error);

      expect(obj.name).toBe('Error');
      expect(obj.message).toBe('Standard error');
      expect(obj.stack).toBeDefined();
    });

    it('should handle unknown error types', () => {
      const obj = toErrorObject('string error');

      expect(obj.message).toBe('string error');
      expect(obj.rawError).toBe('string error');
    });
  });
});

describe('Result Type Utilities', () => {
  describe('ok', () => {
    it('should create success result', () => {
      const result = ok({ data: 'test' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ data: 'test' });
      }
    });
  });

  describe('err', () => {
    it('should create failure result', () => {
      const error = new AppError('Test error');
      const result = err(error);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe('tryAsync', () => {
    it('should return success for resolved promise', async () => {
      const result = await tryAsync(Promise.resolve('data'));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('data');
      }
    });

    it('should return error for rejected promise', async () => {
      const result = await tryAsync(Promise.reject(new Error('Failed')));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Failed');
      }
    });

    it('should preserve AppError on rejection', async () => {
      const appError = new ValidationError('Invalid');
      const result = await tryAsync(Promise.reject(appError));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(appError);
      }
    });

    it('should transform errors with custom function', async () => {
      const result = await tryAsync(
        Promise.reject(new Error('Original')),
        () => new ValidationError('Transformed')
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('Transformed');
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });
});
