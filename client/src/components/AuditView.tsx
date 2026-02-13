import { useEffect, useState, useCallback, Fragment } from 'react';
import { I } from '../icons';
import { getSyncLog } from '../api/deals';
import type { SyncLogEntry } from '../types/deals';

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return '--';
  const d = new Date(ts);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Terminal-style short timestamp: HH:MM:SS */
function terminalTs(ts: string | null): string {
  if (!ts) return '--:--:--';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Terminal-style date prefix: DD MMM */
function terminalDate(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
}

/** Map entry to a log-level style */
function logLevel(entry: SyncLogEntry): { tag: string; color: string } {
  if (entry.status === 'failed') return { tag: 'ERR', color: 'text-dexRed' };
  if (entry.status === 'running') return { tag: 'WARN', color: 'text-dexYellow' };
  if (isScanEvent(entry.sync_type) || isCleanupEvent(entry.sync_type)) return { tag: 'HIT', color: 'text-dexGreen' };
  return { tag: 'INFO', color: 'text-dexBlue' };
}

function syncTypeLabel(type: string): string {
  switch (type) {
    case 'full_sync': return 'Full Sync';
    case 'hot_refresh': return 'Hot Refresh';
    case 'expansion-check':
    case 'expansion_check': return 'Expansion Check';
    case 'ebay_scan': return 'eBay Scan';
    case 'deal_cleanup': return 'Deal Cleanup';
    case 'weight_calibration': return 'Weight Calibration';
    default: return type;
  }
}

function isScanEvent(type: string): boolean {
  return type === 'ebay_scan';
}

function isCleanupEvent(type: string): boolean {
  return type === 'deal_cleanup';
}

function isCalibrationEvent(type: string): boolean {
  return type === 'weight_calibration';
}

function isSyncEvent(type: string): boolean {
  return !isScanEvent(type) && !isCleanupEvent(type) && !isCalibrationEvent(type);
}

/** Build a concise summary string for the table row */
function summaryText(entry: SyncLogEntry): string {
  const m = entry.metadata as Record<string, number> | null;
  if (isScanEvent(entry.sync_type)) {
    const deals = m?.deals_created ?? 0;
    const listings = m?.listings_processed ?? 0;
    if (listings === 0) return 'No listings';
    return `${deals} deal${deals !== 1 ? 's' : ''} from ${listings} listings`;
  }
  if (isCleanupEvent(entry.sync_type)) {
    const expired = m?.expired ?? 0;
    const pruned = m?.pruned ?? 0;
    const parts: string[] = [];
    if (expired > 0) parts.push(`${expired} expired`);
    if (pruned > 0) parts.push(`${pruned} pruned`);
    return parts.join(', ') || 'No changes';
  }
  if (isCalibrationEvent(entry.sync_type)) {
    const meta = entry.metadata as Record<string, unknown> | null;
    const applied = meta?.applied;
    if (!applied) return meta?.reason as string || 'No change';
    const before = meta?.accuracy_before as number;
    const after = meta?.accuracy_after as number;
    return `Applied: ${before?.toFixed(1)}% -> ${after?.toFixed(1)}%`;
  }
  // Sync events
  const parts: string[] = [];
  if (entry.expansions_synced) parts.push(`${entry.expansions_synced} exp`);
  if (entry.cards_upserted) parts.push(`${entry.cards_upserted.toLocaleString()} cards`);
  if (entry.variants_upserted) parts.push(`${entry.variants_upserted.toLocaleString()} variants`);
  return parts.join(', ') || '--';
}

const STATUS_OPTIONS = ['', 'completed', 'failed', 'running'] as const;
const TYPE_OPTIONS = ['', 'ebay_scan', 'deal_cleanup', 'weight_calibration', 'full_sync', 'hot_refresh', 'expansion_check', 'expansion-check'] as const;
const TYPE_LABELS: Record<string, string> = {
  'ebay_scan': 'eBay Scan',
  'deal_cleanup': 'Deal Cleanup',
  'weight_calibration': 'Weight Calibration',
  'full_sync': 'Full Sync',
  'hot_refresh': 'Hot Refresh',
  'expansion_check': 'Expansion Check',
  'expansion-check': 'Expansion Check',
};

export default function AuditView() {
  const [entries, setEntries] = useState<SyncLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSyncLog({
        page,
        limit: 25,
        status: filterStatus || undefined,
        sync_type: filterType || undefined,
      });
      setEntries(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [filterStatus, filterType]);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-obsidian">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <I.Terminal s={20} c="text-dexGreen" />
            <div>
              <h1 className="text-2xl font-bold text-white">Audit Log</h1>
              <p className="text-xs font-mono text-muted mt-0.5">
                {total} events recorded &middot; pipeline telemetry
              </p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 text-xs font-mono font-medium rounded-md bg-black/40 border border-border text-muted hover:text-dexGreen hover:border-dexGreen/30 transition-colors"
          >
            refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono rounded-md bg-black/40 border border-border text-white focus:outline-none focus:border-dexGreen/40"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono rounded-md bg-black/40 border border-border text-white focus:outline-none focus:border-dexGreen/40"
          >
            <option value="">All types</option>
            {TYPE_OPTIONS.filter(Boolean).map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-dexRed/10 border border-dexRed/30 rounded-xl px-4 py-3 text-sm font-mono text-dexRed">
            <span className="text-dexRed/60">[ERR]</span> {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-black/40 border border-border rounded-xl p-8 flex justify-center">
            <div className="flex items-center gap-3 font-mono text-sm text-muted">
              <I.Loader s={18} c="text-dexGreen" />
              <span>Loading audit stream...</span>
              <span className="animate-pulse text-dexGreen">_</span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div className="bg-black/40 border border-border rounded-xl p-12">
            <div className="text-center font-mono">
              <I.ScrollText s={40} c="text-muted/20 mx-auto mb-4" />
              <p className="text-sm text-muted mb-1">no log entries found</p>
              <p className="text-xs text-muted/60">
                pipeline events will stream here once the scanner runs
              </p>
              <span className="inline-block mt-3 animate-pulse text-dexGreen">_</span>
            </div>
          </div>
        )}

        {/* Terminal Log Table */}
        {!loading && entries.length > 0 && (
          <div className="bg-black/40 border border-border rounded-xl overflow-hidden">
            {/* Terminal header bar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-panel/50">
              <div className="w-2.5 h-2.5 rounded-full bg-dexRed/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-dexYellow/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-dexGreen/60" />
              <span className="ml-2 text-[10px] font-mono text-muted/60 uppercase tracking-widest">
                audit &mdash; {total} entries
              </span>
            </div>

            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border/60 text-muted/70 text-left">
                  <th className="px-4 py-2 font-normal w-14">LVL</th>
                  <th className="px-4 py-2 font-normal">TYPE</th>
                  <th className="px-4 py-2 font-normal">STATUS</th>
                  <th className="px-4 py-2 font-normal">TIME</th>
                  <th className="px-4 py-2 font-normal text-right">DUR</th>
                  <th className="px-4 py-2 font-normal">SUMMARY</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => {
                  const level = logLevel(entry);
                  const isExpanded = expandedId === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        className={
                          'border-b border-border/30 cursor-pointer transition-colors hover:bg-white/[0.03]'
                          + (isExpanded ? ' bg-white/[0.02]' : '')
                        }
                      >
                        <td className="px-4 py-2">
                          <span className={`font-bold ${level.color}`}>[{level.tag}]</span>
                        </td>
                        <td className="px-4 py-2 text-white/80">{syncTypeLabel(entry.sync_type)}</td>
                        <td className="px-4 py-2">
                          <span className={
                            entry.status === 'completed' ? 'text-dexGreen' :
                            entry.status === 'failed' ? 'text-dexRed' :
                            entry.status === 'running' ? 'text-dexYellow' :
                            'text-muted'
                          }>
                            {entry.status === 'running' && <I.Loader s={10} c="inline mr-1" />}
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-muted/80">
                          <span className="text-muted/50">{terminalDate(entry.started_at)}</span>{' '}
                          {terminalTs(entry.started_at)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted/80">{formatDuration(entry.duration_seconds)}</td>
                        <td className="px-4 py-2 text-white/60">{summaryText(entry)}</td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr className="border-b border-border/30 bg-panel/30">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="space-y-3 text-xs font-mono">
                              {/* Timestamps */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-muted/60">started_at:</span>{' '}
                                  <span className="text-dexBlue">{formatTimestamp(entry.started_at)}</span>
                                </div>
                                <div>
                                  <span className="text-muted/60">completed_at:</span>{' '}
                                  <span className="text-dexBlue">{formatTimestamp(entry.completed_at)}</span>
                                </div>
                              </div>

                              {/* Scan-specific stats */}
                              {isScanEvent(entry.sync_type) && entry.metadata && (
                                <div className="grid grid-cols-4 gap-2">
                                  {([
                                    ['Listings', 'listings_processed'],
                                    ['Deals', 'deals_created'],
                                    ['Enrichments', 'enrichment_calls'],
                                    ['Errors', 'errors'],
                                    ['Dupes', 'skipped_duplicate'],
                                    ['Junk', 'skipped_junk'],
                                    ['No Match', 'skipped_no_match'],
                                    ['Gated', 'skipped_gate'],
                                  ] as const).map(([label, key]) => {
                                    const val = (entry.metadata as Record<string, number>)?.[key] ?? 0;
                                    return (
                                      <div key={key} className="bg-black/30 border border-border/40 rounded-lg px-3 py-2 text-center">
                                        <div className="text-[9px] text-muted/50 uppercase tracking-wider">{label}</div>
                                        <div className={'text-sm font-bold ' + (key === 'errors' && val > 0 ? 'text-dexRed' : key === 'deals_created' && val > 0 ? 'text-dexGreen' : 'text-white/80')}>{val}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Cleanup-specific stats */}
                              {isCleanupEvent(entry.sync_type) && entry.metadata && (
                                <div className="grid grid-cols-2 gap-2">
                                  {([
                                    ['Expired', 'expired'],
                                    ['Pruned', 'pruned'],
                                  ] as const).map(([label, key]) => {
                                    const val = (entry.metadata as Record<string, number>)?.[key] ?? 0;
                                    return (
                                      <div key={key} className="bg-black/30 border border-border/40 rounded-lg px-3 py-2 text-center">
                                        <div className="text-[9px] text-muted/50 uppercase tracking-wider">{label}</div>
                                        <div className="text-sm font-bold text-white/80">{val}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Calibration-specific stats */}
                              {isCalibrationEvent(entry.sync_type) && entry.metadata && (() => {
                                const meta = entry.metadata as Record<string, unknown>;
                                const applied = !!meta.applied;
                                const sampleSize = Number(meta.sample_size ?? 0);
                                const accBefore = Number(meta.accuracy_before ?? 0);
                                const accAfter = Number(meta.accuracy_after ?? 0);
                                const reasonText = String(meta.reason ?? '');
                                const signalStats = meta.signal_stats as Record<string, { correctMean: number; incorrectMean: number; separation: number }> | undefined;
                                const oldW = meta.old_weights as Record<string, number> | undefined;
                                const newW = meta.new_weights as Record<string, number> | undefined;
                                return (
                                  <div className="space-y-2">
                                    <div className="grid grid-cols-3 gap-2">
                                      <div className="bg-black/30 border border-border/40 rounded-lg px-3 py-2 text-center">
                                        <div className="text-[9px] text-muted/50 uppercase tracking-wider">Applied</div>
                                        <div className={'text-sm font-bold ' + (applied ? 'text-dexGreen' : 'text-muted')}>{applied ? 'Yes' : 'No'}</div>
                                      </div>
                                      <div className="bg-black/30 border border-border/40 rounded-lg px-3 py-2 text-center">
                                        <div className="text-[9px] text-muted/50 uppercase tracking-wider">Sample</div>
                                        <div className="text-sm font-bold text-white/80">{sampleSize}</div>
                                      </div>
                                      <div className="bg-black/30 border border-border/40 rounded-lg px-3 py-2 text-center">
                                        <div className="text-[9px] text-muted/50 uppercase tracking-wider">Accuracy</div>
                                        <div className="text-sm font-bold text-white/80">{accBefore.toFixed(1)}% &rarr; {accAfter.toFixed(1)}%</div>
                                      </div>
                                    </div>
                                    {signalStats && (
                                      <div>
                                        <div className="text-[9px] text-muted/50 uppercase tracking-wider mb-1">Signal Discrimination</div>
                                        <div className="grid grid-cols-3 gap-1">
                                          {Object.entries(signalStats).map(([key, s]) => (
                                            <div key={key} className="bg-black/30 border border-border/40 rounded-lg px-2 py-1.5 text-center">
                                              <div className="text-[9px] text-muted/60">{key}</div>
                                              <div className={'text-[11px] ' + (s.separation > 0.1 ? 'text-dexGreen' : s.separation < -0.05 ? 'text-dexRed' : 'text-white/60')}>
                                                {s.separation > 0 ? '+' : ''}{s.separation.toFixed(3)}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {oldW && newW && (
                                      <div>
                                        <div className="text-[9px] text-muted/50 uppercase tracking-wider mb-1">Weight Changes</div>
                                        <div className="grid grid-cols-3 gap-1">
                                          {Object.keys(newW).map(key => {
                                            const delta = (newW[key] - (oldW[key] ?? 0));
                                            return (
                                              <div key={key} className="bg-black/30 border border-border/40 rounded-lg px-2 py-1.5 text-center">
                                                <div className="text-[9px] text-muted/60">{key}</div>
                                                <div className="text-[11px] text-white/80">{newW[key].toFixed(3)}</div>
                                                {delta !== 0 && <div className={'text-[9px] ' + (delta > 0 ? 'text-dexGreen' : 'text-dexRed')}>{delta > 0 ? '+' : ''}{delta.toFixed(3)}</div>}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                    {!applied && reasonText && (
                                      <div className="bg-dexYellow/10 border border-dexYellow/20 rounded-lg px-3 py-2 text-dexYellow text-[11px]">
                                        <span className="text-dexYellow/60">[WARN]</span> {reasonText}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Sync-specific stats */}
                              {isSyncEvent(entry.sync_type) && (
                                <div className="grid grid-cols-3 gap-2">
                                  {([
                                    ['Expansions', entry.expansions_synced],
                                    ['Cards', entry.cards_upserted],
                                    ['Variants', entry.variants_upserted],
                                  ] as const).map(([label, val]) => (
                                    <div key={label} className="bg-black/30 border border-border/40 rounded-lg px-3 py-2 text-center">
                                      <div className="text-[9px] text-muted/50 uppercase tracking-wider">{label}</div>
                                      <div className="text-sm font-bold text-white/80">{(val ?? 0).toLocaleString()}</div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Error message */}
                              {entry.error_message && (
                                <div className="bg-dexRed/10 border border-dexRed/20 rounded-lg px-3 py-2 text-dexRed text-[11px] break-all">
                                  <span className="text-dexRed/60">[ERR]</span> {entry.error_message}
                                </div>
                              )}

                              {/* Raw metadata for non-specialized types */}
                              {entry.metadata && Object.keys(entry.metadata).length > 0 && !isScanEvent(entry.sync_type) && !isCleanupEvent(entry.sync_type) && !isCalibrationEvent(entry.sync_type) && (
                                <div className="bg-black/30 border border-border/40 rounded-lg px-3 py-2 text-[11px] text-muted/70 break-all whitespace-pre-wrap">
                                  {JSON.stringify(entry.metadata, null, 2)}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Blinking cursor at the bottom of the terminal */}
            <div className="px-4 py-2 border-t border-border/30">
              <span className="font-mono text-xs text-muted/40">$</span>
              <span className="ml-1 animate-pulse text-dexGreen font-mono">_</span>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs font-mono text-muted">
            <span className="text-muted/60">page {page}/{totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded-md bg-black/40 border border-border text-muted disabled:opacity-30 hover:text-dexGreen hover:border-dexGreen/30 transition-colors"
              >
                prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded-md bg-black/40 border border-border text-muted disabled:opacity-30 hover:text-dexGreen hover:border-dexGreen/30 transition-colors"
              >
                next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
