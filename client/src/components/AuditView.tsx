import { useEffect, useState, useCallback } from 'react';
import { I } from '../icons';
import { getSyncLog } from '../api/deals';
import type { SyncLogEntry } from '../types/deals';

function terminalTs(ts: string | null): string {
  if (!ts) return '--:--:--';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function logLevel(entry: SyncLogEntry): { tag: string; color: string } {
  if (entry.status === 'failed') return { tag: 'ERR', color: 'text-dexRed' };
  if (entry.status === 'running') return { tag: 'WARN', color: 'text-dexYellow' };
  if (entry.sync_type === 'ebay_scan' || entry.sync_type === 'deal_cleanup') return { tag: 'HIT', color: 'text-dexGreen' };
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

function summaryLine(entry: SyncLogEntry): string {
  const m = entry.metadata as Record<string, number> | null;
  const label = syncTypeLabel(entry.sync_type);

  if (entry.error_message) return `${label}: ${entry.error_message}`;

  if (entry.sync_type === 'ebay_scan') {
    const deals = m?.deals_created ?? 0;
    const listings = m?.listings_processed ?? 0;
    if (listings === 0) return `${label}: No listings processed`;
    return `${label}: ${deals} deal${deals !== 1 ? 's' : ''} from ${listings} listings`;
  }

  if (entry.sync_type === 'deal_cleanup') {
    const expired = m?.expired ?? 0;
    const pruned = m?.pruned ?? 0;
    const parts: string[] = [];
    if (expired > 0) parts.push(`${expired} expired`);
    if (pruned > 0) parts.push(`${pruned} pruned`);
    return `${label}: ${parts.join(', ') || 'No changes'}`;
  }

  if (entry.sync_type === 'weight_calibration') {
    const meta = entry.metadata as Record<string, unknown> | null;
    const applied = meta?.applied;
    if (!applied) return `${label}: ${(meta?.reason as string) || 'No change'}`;
    const before = meta?.accuracy_before as number;
    const after = meta?.accuracy_after as number;
    return `${label}: Applied ${before?.toFixed(1)}% \u2192 ${after?.toFixed(1)}%`;
  }

  // Sync events
  const parts: string[] = [];
  if (entry.expansions_synced) parts.push(`${entry.expansions_synced} exp`);
  if (entry.cards_upserted) parts.push(`${entry.cards_upserted.toLocaleString()} cards`);
  if (entry.variants_upserted) parts.push(`${entry.variants_upserted.toLocaleString()} variants`);
  return `${label}: ${parts.join(', ') || entry.status}`;
}

export default function AuditView() {
  const [entries, setEntries] = useState<SyncLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSyncLog({
        page,
        limit: 50,
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
  useEffect(() => { setPage(1); }, [filterStatus, filterType]);

  return (
    <div className="p-8 h-full overflow-y-auto animate-in flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white font-sans">Audit Log</h2>
        <div className="flex items-center gap-3">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono rounded bg-black/40 border border-border text-white focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-xs font-mono rounded bg-black/40 border border-border text-white focus:outline-none"
          >
            <option value="">All types</option>
            <option value="ebay_scan">eBay Scan</option>
            <option value="deal_cleanup">Deal Cleanup</option>
            <option value="weight_calibration">Weight Calibration</option>
            <option value="full_sync">Full Sync</option>
            <option value="hot_refresh">Hot Refresh</option>
          </select>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 text-xs font-mono rounded bg-black/40 border border-border text-gray-400 hover:text-dexGreen hover:border-dexGreen/30 transition-colors"
          >
            refresh
          </button>
        </div>
      </div>

      <div className="bg-black/40 border border-border rounded-xl p-4 font-mono text-xs flex-1 overflow-auto">
        {loading && entries.length === 0 && (
          <div className="flex items-center gap-3 text-gray-400 py-4">
            <I.Loader s={14} c="text-dexGreen" />
            <span>Loading audit stream...</span>
            <span className="animate-pulse text-dexGreen">_</span>
          </div>
        )}

        {error && (
          <div className="mb-2 flex gap-4 p-1 text-dexRed">
            <span className="shrink-0">[ERR]</span>
            <span>{error}</span>
          </div>
        )}

        {!loading && entries.length === 0 && !error && (
          <div className="text-center py-8">
            <I.ScrollText s={32} c="text-gray-700 mx-auto mb-3" />
            <div className="text-gray-500">No log entries found</div>
            <span className="inline-block mt-3 animate-pulse text-dexGreen">_</span>
          </div>
        )}

        {entries.map((entry) => {
          const level = logLevel(entry);
          return (
            <div key={entry.id} className="mb-2 flex gap-4 hover:bg-white/5 p-1 rounded">
              <span className="text-gray-500 shrink-0">{terminalTs(entry.started_at)}</span>
              <span className={`font-bold w-10 shrink-0 ${level.color}`}>{level.tag}</span>
              <span className="text-gray-300">{summaryLine(entry)}</span>
            </div>
          );
        })}

        {entries.length > 0 && <div className="mt-2 animate-pulse text-dexGreen">_</div>}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs font-mono text-gray-400 mt-4">
          <span className="text-gray-500">page {page}/{totalPages} &middot; {total} events</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded bg-black/40 border border-border text-gray-400 disabled:opacity-30 hover:text-dexGreen hover:border-dexGreen/30 transition-colors"
            >
              prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded bg-black/40 border border-border text-gray-400 disabled:opacity-30 hover:text-dexGreen hover:border-dexGreen/30 transition-colors"
            >
              next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
