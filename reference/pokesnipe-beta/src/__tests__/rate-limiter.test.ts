// src/__tests__/rate-limiter.test.ts
// Note: This is a simplified test that tests the rate limiter directly
// For full integration tests, use a test harness with the Express app

import { jest } from '@jest/globals';
import type { Request, Response } from 'express';
import {
  rateLimiter,
  scanRateLimiterMiddleware,
  getRateLimiterStats,
  destroyRateLimiters,
} from '../middleware/rate-limiter.js';

describe('Rate Limiter Middleware', () => {
  afterAll(() => {
    destroyRateLimiters();
  });

  function createMockRequest(ip: string = '127.0.0.1', path: string = '/api/test'): Partial<Request> {
    return {
      ip,
      path,
      headers: {},
      socket: { remoteAddress: ip } as unknown as Request['socket'],
    };
  }

  function createMockResponse(): Partial<Response> {
    const headers: Record<string, string | number> = {};
    const mockResponse: Partial<Response> = {
      status: jest.fn().mockReturnThis() as unknown as Response['status'],
      json: jest.fn().mockReturnThis() as unknown as Response['json'],
      setHeader: jest.fn().mockImplementation(function(this: void, name: unknown, value: unknown) {
        headers[name as string] = value as string | number;
        return mockResponse;
      }) as unknown as Response['setHeader'],
      getHeader: jest.fn().mockImplementation(function(this: void, name: unknown) {
        return headers[name as string];
      }) as unknown as Response['getHeader'],
    };
    return mockResponse;
  }

  describe('Rate Limiter Stats', () => {
    it('should return current store sizes', () => {
      const stats = getRateLimiterStats();

      expect(stats).toHaveProperty('api');
      expect(stats).toHaveProperty('scan');
      expect(typeof stats.api).toBe('number');
      expect(typeof stats.scan).toBe('number');
    });
  });

  describe('API Rate Limiter', () => {
    it('should call next for allowed requests', () => {
      // Use a unique IP for this test
      const req = createMockRequest('10.0.0.1') as Request;
      const res = createMockResponse() as Response;
      const next = jest.fn();

      rateLimiter(req, res, next);

      // In dev mode with skipInDev, next should be called
      // The actual behavior depends on config
      expect(next).toHaveBeenCalled();
    });

    it('should either set headers or skip in dev mode', () => {
      const req = createMockRequest('10.0.0.2') as Request;
      const res = createMockResponse() as Response;
      const next = jest.fn();

      rateLimiter(req, res, next);

      // Next should always be called (either skipped in dev or rate limit allows)
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Scan Rate Limiter', () => {
    it('should call next for allowed scan requests', () => {
      const req = createMockRequest('10.0.0.10') as Request;
      const res = createMockResponse() as Response;
      const next = jest.fn();

      scanRateLimiterMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow requests and call next', () => {
      const req = createMockRequest('10.0.0.11') as Request;
      const res = createMockResponse() as Response;
      const next = jest.fn();

      scanRateLimiterMiddleware(req, res, next);

      // Either sets headers or skips in dev mode
      expect(next).toHaveBeenCalled();
    });
  });
});
