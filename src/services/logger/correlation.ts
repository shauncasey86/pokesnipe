import { randomUUID } from 'crypto';

/**
 * Generate a short correlation ID for tracing a listing through the pipeline.
 * Uses first 8 chars of a UUID for brevity in logs.
 */
export function generateCorrelationId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Context object passed through the pipeline.
 * Every function in the chain receives this and includes it in log calls.
 */
export interface PipelineContext {
  correlationId: string;
  ebayItemId?: string;
  service: string;
}

/**
 * Create a new pipeline context for a listing entering the scanner.
 */
export function createPipelineContext(ebayItemId: string): PipelineContext {
  return {
    correlationId: generateCorrelationId(),
    ebayItemId,
    service: 'scanner',
  };
}
