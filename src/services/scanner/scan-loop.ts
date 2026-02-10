import pino from 'pino';
import { runScanCycle } from './scanner-service.js';
import { getDedupStats } from './deduplicator.js';

const log = pino({ name: 'scan-loop' });

let isRunning = false;
const SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start the scan loop. Runs immediately, then every 5 minutes.
 * Overlap protection ensures only one scan runs at a time.
 */
export function startScanLoop(): void {
  log.info({ intervalMs: SCAN_INTERVAL_MS }, 'Starting scan loop');

  // Run first scan immediately
  runOnce();

  // Then schedule recurring scans
  setInterval(runOnce, SCAN_INTERVAL_MS);
}

async function runOnce(): Promise<void> {
  if (isRunning) {
    log.warn('Previous scan still running, skipping this cycle');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const result = await runScanCycle();
    const durationMs = Date.now() - startTime;
    const dedupStats = getDedupStats();

    log.info(
      {
        ...result,
        durationMs,
        dedupMemorySize: dedupStats.memorySize,
      },
      'Scan cycle complete',
    );
  } catch (err) {
    log.error({ err }, 'Scan cycle failed unexpectedly');
  } finally {
    isRunning = false;
  }
}
