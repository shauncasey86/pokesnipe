// src/utils/logger.ts
// ═══════════════════════════════════════════════════════════════════════════
// Logger Utility - Compatible with both styles:
//   logger.info('EVENT_NAME', { data })
//   logger.info({ event: 'EVENT_NAME', data })
//   logger.error('message', error)  // error can be unknown
// Also captures logs to the in-memory buffer for the web dashboard
// ═══════════════════════════════════════════════════════════════════════════

import { logBuffer } from './log-buffer.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogData {
  [key: string]: unknown;
}

class Logger {
  private minLevel: LogLevel = 'debug';
  
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };
  
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }
  
  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel];
  }
  
  private formatLog(level: LogLevel, eventOrData: string | LogData, data?: unknown): { json: string; event: string; data: Record<string, unknown> } {
    const timestamp = new Date().toISOString();

    // Handle object-style: logger.info({ event: 'NAME', ...data })
    if (typeof eventOrData === 'object') {
      const { event, ...rest } = eventOrData as { event?: string } & LogData;
      const logObj = {
        timestamp,
        level,
        ...eventOrData,
      };
      return {
        json: JSON.stringify(logObj),
        event: event || 'LOG',
        data: rest as Record<string, unknown>
      };
    }

    // Handle string-style: logger.info('EVENT_NAME', { data }) or logger.error('msg', error)
    let extraData: LogData = {};
    if (data !== undefined) {
      if (data instanceof Error) {
        extraData = { error: data.message, stack: data.stack };
      } else if (typeof data === 'object' && data !== null) {
        extraData = data as LogData;
      } else {
        extraData = { value: data };
      }
    }

    const logObj = {
      timestamp,
      level,
      event: eventOrData,
      ...extraData,
    };
    return {
      json: JSON.stringify(logObj),
      event: eventOrData,
      data: extraData as Record<string, unknown>
    };
  }
  
  debug(eventOrData: string | LogData, data?: unknown): void {
    const formatted = this.formatLog('debug', eventOrData, data);
    logBuffer.add('DEBUG', formatted.event, formatted.data);
    if (this.shouldLog('debug')) {
      console.log(formatted.json);
    }
  }

  info(eventOrData: string | LogData, data?: unknown): void {
    const formatted = this.formatLog('info', eventOrData, data);
    logBuffer.add('INFO', formatted.event, formatted.data);
    if (this.shouldLog('info')) {
      console.log(formatted.json);
    }
  }

  warn(eventOrData: string | LogData, data?: unknown): void {
    const formatted = this.formatLog('warn', eventOrData, data);
    logBuffer.add('WARN', formatted.event, formatted.data);
    if (this.shouldLog('warn')) {
      console.warn(formatted.json);
    }
  }

  error(eventOrData: string | LogData, data?: unknown): void {
    const formatted = this.formatLog('error', eventOrData, data);
    logBuffer.add('ERROR', formatted.event, formatted.data);
    if (this.shouldLog('error')) {
      console.error(formatted.json);
    }
  }
}

export const logger = new Logger();