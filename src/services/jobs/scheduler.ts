import cron from 'node-cron';
import pino from 'pino';

const log = pino({ name: 'scheduler' });

interface JobEntry {
  task: cron.ScheduledTask;
  isRunning: boolean;
  isPaused: boolean;
  lastRun: Date | null;
  lastError: string | null;
  runCount: number;
}

const jobs = new Map<string, JobEntry>();

/**
 * Register a background job with cron scheduling and overlap protection.
 *
 * @param name - Unique job name (for logging and diagnostics)
 * @param schedule - Cron expression (e.g. '*​/5 * * * *' for every 5 minutes)
 * @param fn - Async function to execute
 */
export function registerJob(name: string, schedule: string, fn: () => Promise<void>): void {
  if (jobs.has(name)) {
    log.warn({ job: name }, 'Job already registered, skipping');
    return;
  }

  const task = cron.schedule(schedule, async () => {
    const job = jobs.get(name)!;

    // Overlap protection
    if (job.isRunning) {
      log.warn({ job: name }, 'Job still running, skipping this cycle');
      return;
    }

    job.isRunning = true;
    const startTime = Date.now();

    try {
      await fn();
      const durationMs = Date.now() - startTime;
      job.lastRun = new Date();
      job.lastError = null;
      job.runCount++;
      log.info({ job: name, durationMs, runCount: job.runCount }, 'Job completed');
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      job.lastError = err.message || 'Unknown error';
      log.error({ job: name, err, durationMs }, 'Job failed');
    } finally {
      job.isRunning = false;
    }
  });

  jobs.set(name, {
    task,
    isRunning: false,
    isPaused: false,
    lastRun: null,
    lastError: null,
    runCount: 0,
  });

  log.info({ job: name, schedule }, 'Job registered');
}

/**
 * Get status of all registered jobs (for /api/status endpoint).
 */
export function getJobStatuses(): Record<string, {
  isRunning: boolean;
  isPaused: boolean;
  lastRun: Date | null;
  lastError: string | null;
  runCount: number;
}> {
  const statuses: Record<string, any> = {};
  for (const [name, entry] of jobs) {
    statuses[name] = {
      isRunning: entry.isRunning,
      isPaused: entry.isPaused,
      lastRun: entry.lastRun,
      lastError: entry.lastError,
      runCount: entry.runCount,
    };
  }
  return statuses;
}

/**
 * Pause a single job (stop its cron schedule).
 */
export function pauseJob(name: string): boolean {
  const job = jobs.get(name);
  if (!job) return false;
  job.task.stop();
  job.isPaused = true;
  log.info({ job: name }, 'Job paused');
  return true;
}

/**
 * Resume a paused job (restart its cron schedule).
 */
export function resumeJob(name: string): boolean {
  const job = jobs.get(name);
  if (!job) return false;
  job.task.start();
  job.isPaused = false;
  log.info({ job: name }, 'Job resumed');
  return true;
}

/**
 * Stop all registered jobs (for graceful shutdown).
 */
export function stopAllJobs(): void {
  for (const [name, entry] of jobs) {
    entry.task.stop();
    log.info({ job: name }, 'Job stopped');
  }
}
