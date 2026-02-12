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
    case 'expansion-check': return 'Expansion Check';
    default: return type;
  }
}

const STATUS_OPTIONS = ['', 'completed', 'failed', 'running'] as const;
const TYPE_OPTIONS = ['', 'full_sync', 'hot_refresh', 'expansion-check'] as const;

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
            <p className="text-sm text-muted">Sync operations and pipeline events. {total} total entries.</p>
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
              <option key={t} value={t}>{syncTypeLabel(t)}</option>
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
              <h3 className="text-base font-bold text-white mb-2">No sync log entries</h3>
              <p className="text-xs text-muted leading-relaxed">
                Sync operations will appear here once the first catalog sync completes.
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
                  <th className="px-4 py-2.5 font-medium">Started</th>
                  <th className="px-4 py-2.5 font-medium text-right">Duration</th>
                  <th className="px-4 py-2.5 font-medium text-right">Expansions</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cards</th>
                  <th className="px-4 py-2.5 font-medium text-right">Variants</th>
                  <th className="px-4 py-2.5 font-medium text-right">Credits</th>
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
                      <td className="px-4 py-2.5 text-right text-white/70">{entry.expansions_synced}</td>
                      <td className="px-4 py-2.5 text-right text-white/70">{entry.cards_upserted.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-white/70">{entry.variants_upserted.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-white/70">{entry.credits_used}</td>
                    </tr>
                    {expandedId === entry.id && (
                      <tr key={`${entry.id}-detail`} className="border-b border-border/50 bg-white/[0.01]">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="space-y-2 text-xs">
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
                            {entry.error_message && (
                              <div className="bg-red-900/20 border border-red-800/30 rounded px-3 py-2 text-red-300 font-mono text-[11px] break-all">
                                {entry.error_message}
                              </div>
                            )}
                            {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                              <div className="bg-black/20 rounded px-3 py-2 font-mono text-[11px] text-muted break-all">
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
