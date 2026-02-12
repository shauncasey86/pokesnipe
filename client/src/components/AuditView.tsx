import { useEffect, useState, useCallback } from 'react';
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

function statusColor(status: string): string {
  switch (status) {
    case 'completed': return 'text-emerald-400';
    case 'failed': return 'text-red-400';
    case 'running': return 'text-amber-400';
    default: return 'text-muted';
  }
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
          <div>
            <h1 className="text-xl font-bold text-white mb-1">Audit Log</h1>
            <p className="text-sm text-muted">Pipeline events: scans, syncs, and cleanup. {total} total entries.</p>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-surface border border-border text-muted hover:text-white hover:border-white/20 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-md bg-surface border border-border text-white focus:outline-none focus:border-white/30"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-md bg-surface border border-border text-white focus:outline-none focus:border-white/30"
          >
            <option value="">All types</option>
            {TYPE_OPTIONS.filter(Boolean).map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <I.Loader s={24} c="text-muted animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center max-w-sm">
              <I.ScrollText s={48} c="text-muted/20 mx-auto mb-4" />
              <h3 className="text-base font-bold text-white mb-2">No audit log entries</h3>
              <p className="text-xs text-muted leading-relaxed">
                Pipeline events will appear here once the scanner runs or a sync completes.
              </p>
            </div>
          </div>
        )}

        {/* Table */}
        {!loading && entries.length > 0 && (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted text-left">
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium text-right">Duration</th>
                  <th className="px-4 py-2.5 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <>
                    <tr
                      key={entry.id}
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      className="border-b border-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono text-white/80">{syncTypeLabel(entry.sync_type)}</td>
                      <td className={`px-4 py-2.5 font-semibold ${statusColor(entry.status)}`}>
                        {entry.status === 'running' && <I.Loader s={12} c="inline mr-1 animate-spin" />}
                        {entry.status}
                      </td>
                      <td className="px-4 py-2.5 text-muted">{formatTimestamp(entry.started_at)}</td>
                      <td className="px-4 py-2.5 text-right text-muted">{formatDuration(entry.duration_seconds)}</td>
                      <td className="px-4 py-2.5 text-white/70">{summaryText(entry)}</td>
                    </tr>
                    {expandedId === entry.id && (
                      <tr key={`${entry.id}-detail`} className="border-b border-border/50 bg-white/[0.01]">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="space-y-3 text-xs">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="text-muted">Started:</span>{' '}
                                <span className="text-white/80">{formatTimestamp(entry.started_at)}</span>
                              </div>
                              <div>
                                <span className="text-muted">Completed:</span>{' '}
                                <span className="text-white/80">{formatTimestamp(entry.completed_at)}</span>
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
                                    <div key={key} className="bg-obsidian rounded px-3 py-2 text-center">
                                      <div className="text-[9px] text-muted uppercase tracking-wider">{label}</div>
                                      <div className={'text-sm font-mono font-bold ' + (key === 'errors' && val > 0 ? 'text-red-400' : key === 'deals_created' && val > 0 ? 'text-emerald-400' : 'text-white/80')}>{val}</div>
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
                                    <div key={key} className="bg-obsidian rounded px-3 py-2 text-center">
                                      <div className="text-[9px] text-muted uppercase tracking-wider">{label}</div>
                                      <div className="text-sm font-mono font-bold text-white/80">{val}</div>
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
                                    <div className="bg-obsidian rounded px-3 py-2 text-center">
                                      <div className="text-[9px] text-muted uppercase tracking-wider">Applied</div>
                                      <div className={'text-sm font-mono font-bold ' + (applied ? 'text-emerald-400' : 'text-muted')}>{applied ? 'Yes' : 'No'}</div>
                                    </div>
                                    <div className="bg-obsidian rounded px-3 py-2 text-center">
                                      <div className="text-[9px] text-muted uppercase tracking-wider">Sample</div>
                                      <div className="text-sm font-mono font-bold text-white/80">{sampleSize}</div>
                                    </div>
                                    <div className="bg-obsidian rounded px-3 py-2 text-center">
                                      <div className="text-[9px] text-muted uppercase tracking-wider">Accuracy</div>
                                      <div className="text-sm font-mono font-bold text-white/80">{accBefore.toFixed(1)}% &rarr; {accAfter.toFixed(1)}%</div>
                                    </div>
                                  </div>
                                  {signalStats && (
                                    <div>
                                      <div className="text-[9px] text-muted uppercase tracking-wider mb-1">Signal Discrimination</div>
                                      <div className="grid grid-cols-3 gap-1">
                                        {Object.entries(signalStats).map(([key, s]) => (
                                          <div key={key} className="bg-obsidian rounded px-2 py-1.5 text-center">
                                            <div className="text-[9px] text-muted">{key}</div>
                                            <div className={'text-[11px] font-mono ' + (s.separation > 0.1 ? 'text-emerald-400' : s.separation < -0.05 ? 'text-red-400' : 'text-white/60')}>
                                              {s.separation > 0 ? '+' : ''}{s.separation.toFixed(3)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {oldW && newW && (
                                    <div>
                                      <div className="text-[9px] text-muted uppercase tracking-wider mb-1">Weight Changes</div>
                                      <div className="grid grid-cols-3 gap-1">
                                        {Object.keys(newW).map(key => {
                                          const delta = (newW[key] - (oldW[key] ?? 0));
                                          return (
                                            <div key={key} className="bg-obsidian rounded px-2 py-1.5 text-center">
                                              <div className="text-[9px] text-muted">{key}</div>
                                              <div className="text-[11px] font-mono text-white/80">{newW[key].toFixed(3)}</div>
                                              {delta !== 0 && <div className={'text-[9px] font-mono ' + (delta > 0 ? 'text-emerald-400' : 'text-red-400')}>{delta > 0 ? '+' : ''}{delta.toFixed(3)}</div>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                  {!applied && reasonText && (
                                    <div className="bg-amber-900/20 border border-amber-800/30 rounded px-3 py-2 text-amber-300 text-[11px]">
                                      {reasonText}
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
                                  <div key={label} className="bg-obsidian rounded px-3 py-2 text-center">
                                    <div className="text-[9px] text-muted uppercase tracking-wider">{label}</div>
                                    <div className="text-sm font-mono font-bold text-white/80">{(val ?? 0).toLocaleString()}</div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {entry.error_message && (
                              <div className="bg-red-900/20 border border-red-800/30 rounded px-3 py-2 text-red-300 font-mono text-[11px] break-all">
                                {entry.error_message}
                              </div>
                            )}
                            {entry.metadata && Object.keys(entry.metadata).length > 0 && !isScanEvent(entry.sync_type) && !isCleanupEvent(entry.sync_type) && !isCalibrationEvent(entry.sync_type) && (
                              <div className="bg-black/20 rounded px-3 py-2 font-mono text-[11px] text-muted break-all whitespace-pre-wrap">
                                {JSON.stringify(entry.metadata, null, 2)}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded bg-surface border border-border disabled:opacity-30 hover:border-white/20 transition-colors"
              >
                Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded bg-surface border border-border disabled:opacity-30 hover:border-white/20 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
