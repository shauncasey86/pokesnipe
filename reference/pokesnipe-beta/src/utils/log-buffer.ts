// src/utils/log-buffer.ts
// ═══════════════════════════════════════════════════════════════════════════
// In-Memory Log Buffer - Captures all logs for the web dashboard
// ═══════════════════════════════════════════════════════════════════════════

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  event: string;
  data: Record<string, unknown>;
}

class LogBuffer {
  private logs: LogEntry[] = [];
  private maxSize = 2000; // Keep last 2000 log entries

  add(level: LogEntry['level'], event: string, data: Record<string, unknown> = {}): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      data,
    };

    this.logs.push(entry);

    // Trim if over max size
    if (this.logs.length > this.maxSize) {
      this.logs = this.logs.slice(-this.maxSize);
    }
  }

  getAll(): LogEntry[] {
    return [...this.logs];
  }

  getRecent(count: number = 500): LogEntry[] {
    return this.logs.slice(-count);
  }

  getByLevel(level: LogEntry['level']): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  getByEvent(event: string): LogEntry[] {
    return this.logs.filter(log => log.event.includes(event));
  }

  getSince(timestamp: string): LogEntry[] {
    const since = new Date(timestamp).getTime();
    return this.logs.filter(log => new Date(log.timestamp).getTime() > since);
  }

  clear(): void {
    this.logs = [];
  }

  getStats(): { total: number; byLevel: Record<string, number> } {
    const byLevel: Record<string, number> = {
      DEBUG: 0,
      INFO: 0,
      WARN: 0,
      ERROR: 0,
    };

    for (const log of this.logs) {
      byLevel[log.level]++;
    }

    return {
      total: this.logs.length,
      byLevel,
    };
  }
}

export const logBuffer = new LogBuffer();