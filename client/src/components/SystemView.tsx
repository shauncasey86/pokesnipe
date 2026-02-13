import { useState, useEffect } from 'react';
import { I } from '../icons';
import { timeAgo } from '../data/mock';

import { getStatus, toggleScanner } from '../api/deals';
import type { SystemStatus } from '../types/deals';

export default function SystemView() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const refreshStatus = async () => {
    try {
      const s = await getStatus();
      setStatus(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await refreshStatus();
      if (!cancelled) setLoading(false);
    }
    load();
    const interval = setInterval(refreshStatus, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const handleToggleScanner = async () => {
    if (!status || toggling) return;
    const action = status.scanner.status === 'paused' ? 'start' : 'stop';
    setToggling(true);
    try {
      await toggleScanner(action);
      await refreshStatus();
    } catch { /* ignore */ }
    setToggling(false);
  };

  if (loading && !status) {
    return (
      <div className="flex-1 flex items-center justify-center bg-obsidian">
        <div className="text-center">
          <I.Loader s={32} c="text-dexRed mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading system status&hellip;</p>
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex-1 flex items-center justify-center bg-obsidian">
        <div className="text-center max-w-xs">
          <I.AlertTriangle s={32} c="text-dexRed mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">Failed to load</h3>
          <p className="text-xs text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!status) return null;

  const fxStaleWarning = status.exchangeRate.isStale;
  const ebayLow = status.ebay.status === 'low';
  const alerts: { sev: 'warn' | 'error'; msg: string }[] = [];
  if (fxStaleWarning) alerts.push({ sev: 'warn', msg: `Exchange rate is stale${status.exchangeRate.fetchedAt ? ' \u2014 last fetched ' + timeAgo(status.exchangeRate.fetchedAt) : ''}` });
  if (ebayLow) alerts.push({ sev: 'warn', msg: `eBay API budget running low \u2014 ${status.ebay.remaining} calls remaining` });
  if (status.scanner.lastError) alerts.push({ sev: 'error', msg: `Scanner error: ${status.scanner.lastError}` });

  const ebayPct = Math.min((status.ebay.callsToday / status.ebay.dailyLimit) * 100, 100);
  const ebayStatusLabel = status.ebay.status === 'healthy' ? 'HEALTHY' : status.ebay.status === 'low' ? 'LOW' : status.ebay.status.toUpperCase();
  const ebayStatusColor = status.ebay.status === 'healthy' ? 'text-dexBlue bg-dexBlue/10 border-dexBlue/20' : 'text-dexRed bg-dexRed/10 border-dexRed/20';

  return (
    <div className="p-8 h-full overflow-y-auto animate-in bg-obsidian">
      <h2 className="text-2xl font-bold text-white mb-6 font-sans">System Status</h2>

      {/* Active alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${a.sev === 'warn' ? 'bg-dexYellow/5 border-dexYellow/20' : 'bg-dexRed/5 border-dexRed/20'}`}>
              <I.AlertTriangle s={16} c={`shrink-0 mt-0.5 ${a.sev === 'warn' ? 'text-dexYellow' : 'text-dexRed'}`} />
              <p className={`text-sm ${a.sev === 'warn' ? 'text-dexYellow' : 'text-dexRed'}`}>{a.msg}</p>
            </div>
          ))}
        </div>
      )}

      {/* Scanner Details */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-panel border border-border p-4 rounded-xl flex flex-col justify-between h-28">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <I.Radar s={14} c="text-gray-500" />
            Scanner Status
          </div>
          <div className={'text-2xl font-mono font-bold flex items-center gap-2 ' + (status.scanner.isRunning ? 'text-dexGreen' : status.scanner.status === 'paused' ? 'text-dexYellow' : 'text-gray-500')}>
            <div className={'w-2 h-2 rounded-full ' + (status.scanner.isRunning ? 'bg-dexGreen animate-blink' : status.scanner.status === 'paused' ? 'bg-dexYellow' : 'bg-gray-500')} />
            {status.scanner.status === 'paused' ? 'Paused' : status.scanner.isRunning ? 'Active' : 'Idle'}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-gray-400 font-mono">
              {status.scanner.lastRun ? 'Last: ' + timeAgo(status.scanner.lastRun) : 'No runs yet'}
            </div>
            <button
              onClick={handleToggleScanner}
              disabled={toggling}
              className={'px-2.5 py-1 rounded text-[10px] font-bold font-mono border transition-all disabled:opacity-50 ' + (status.scanner.status === 'paused' ? 'bg-dexGreen/10 border-dexGreen/30 text-dexGreen hover:bg-dexGreen/20' : 'bg-dexYellow/10 border-dexYellow/30 text-dexYellow hover:bg-dexYellow/20')}
            >
              {toggling ? 'Toggling\u2026' : status.scanner.status === 'paused' ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>

        <div className="bg-panel border border-border p-4 rounded-xl flex flex-col justify-between h-28">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <I.Activity s={14} c="text-gray-500" />
            Items Scanned
          </div>
          <div className="text-2xl font-mono font-bold text-white">{status.scanner.dedupMemorySize.toLocaleString()}</div>
          <div className="text-[10px] text-gray-400 font-mono">Dedup memory tracked</div>
        </div>

        <div className="bg-panel border border-border p-4 rounded-xl flex flex-col justify-between h-28">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <I.Zap s={14} c="text-gray-500" />
            Deals Found
          </div>
          <div className="text-2xl font-mono font-bold text-dexBlue">{status.scanner.dealsToday}</div>
          <div className="text-[10px] text-gray-400 font-mono">Today &middot; {status.scanner.grailsToday} grails</div>
        </div>

        <div className="bg-panel border border-border p-4 rounded-xl flex flex-col justify-between h-28">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <I.Globe s={14} c="text-gray-500" />
            Exchange Rate
          </div>
          <div className="text-2xl font-mono font-bold text-white">{status.exchangeRate.rate?.toFixed(4) ?? '\u2014'}</div>
          <div className="text-[10px] text-gray-400 font-mono">
            USD &rarr; GBP{status.exchangeRate.fetchedAt ? ' \u00b7 ' + timeAgo(status.exchangeRate.fetchedAt) : ''}
          </div>
        </div>
      </div>

      {/* API & Budgets */}
      <h3 className="text-lg font-bold text-white mb-4 font-sans">API &amp; Budgets</h3>
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="bg-panel border border-border rounded-xl p-5">
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-sm font-bold text-gray-300">eBay Browse API</h4>
            <span className={'text-[10px] px-2 py-0.5 rounded font-mono border ' + ebayStatusColor}>{ebayStatusLabel}</span>
          </div>
          <div className="text-2xl font-bold text-white mb-1 font-mono">
            {status.ebay.callsToday.toLocaleString()} <span className="text-sm text-gray-500 font-normal">/ {status.ebay.dailyLimit.toLocaleString()}</span>
          </div>
          <div className="w-full h-1.5 bg-charcoal rounded-full overflow-hidden mt-2">
            <div className={'h-full rounded-full transition-all ' + (ebayPct > 80 ? 'bg-dexRed' : 'bg-dexBlue')} style={{ width: ebayPct + '%' }} />
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-2">{status.ebay.remaining.toLocaleString()} remaining</div>
        </div>

        {status.scrydex && (
          <div className="bg-panel border border-border rounded-xl p-5">
            <div className="flex justify-between items-start mb-4">
              <h4 className="text-sm font-bold text-gray-300">Scrydex</h4>
              <span className={'text-[10px] px-2 py-0.5 rounded font-mono border ' + (status.scrydex.status === 'healthy' ? 'text-dexGreen bg-dexGreen/10 border-dexGreen/20' : 'text-dexRed bg-dexRed/10 border-dexRed/20')}>
                {status.scrydex.status === 'healthy' ? 'OPTIMAL' : status.scrydex.status.toUpperCase()}
              </span>
            </div>
            <div className="text-2xl font-bold text-white mb-1 font-mono">
              {status.scrydex.creditsConsumed.toLocaleString()} <span className="text-sm text-gray-500 font-normal">credits</span>
            </div>
            <div className="w-full h-1.5 bg-charcoal rounded-full overflow-hidden mt-2">
              <div className="h-full bg-dexGreen rounded-full" style={{ width: Math.min((status.scrydex.creditsConsumed / (status.scrydex.creditsConsumed + 10000)) * 100, 100) + '%' }} />
            </div>
            <div className="text-[10px] text-gray-400 font-mono mt-2">Period ends {new Date(status.scrydex.periodEnd).toLocaleDateString()}</div>
          </div>
        )}

        <div className="bg-panel border border-border rounded-xl p-5">
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-sm font-bold text-gray-300">Exchange Rate</h4>
            <span className={'text-[10px] px-2 py-0.5 rounded font-mono border ' + (status.exchangeRate.isStale ? 'text-dexRed bg-dexRed/10 border-dexRed/20' : 'bg-gray-700 text-gray-300 border-gray-600')}>
              {status.exchangeRate.isStale ? 'STALE' : 'LIVE'}
            </span>
          </div>
          <div className="text-2xl font-bold text-white mb-1 font-mono">
            {status.exchangeRate.rate?.toFixed(4) ?? '\u2014'} <span className="text-sm text-gray-500 font-normal">GBP/USD</span>
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-2">
            {status.exchangeRate.fetchedAt ? 'Last update: ' + timeAgo(status.exchangeRate.fetchedAt) : 'No data'}
          </div>
        </div>
      </div>

      {/* Catalogue Integrity */}
      <h3 className="text-lg font-bold text-white mb-4 font-sans">Catalogue Integrity</h3>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-charcoal border border-border p-3 rounded flex justify-between items-center">
          <span className="text-xs text-gray-500 font-mono flex items-center gap-1.5"><I.Database s={12} c="text-gray-500" />Expansions</span>
          <span className="text-sm font-bold text-white">{status.sync.totalExpansions.toLocaleString()}</span>
        </div>
        <div className="bg-charcoal border border-border p-3 rounded flex justify-between items-center">
          <span className="text-xs text-gray-500 font-mono flex items-center gap-1.5"><I.Database s={12} c="text-gray-500" />Total Cards</span>
          <span className="text-sm font-bold text-white">{status.sync.totalCards.toLocaleString()}</span>
        </div>
        <div className="bg-charcoal border border-border p-3 rounded flex justify-between items-center">
          <span className="text-xs text-gray-500 font-mono flex items-center gap-1.5"><I.Clock s={12} c="text-gray-500" />Last Sync</span>
          <span className="text-sm font-bold text-dexGreen">{status.sync.lastSync ? timeAgo(status.sync.lastSync) : 'Never'}</span>
        </div>
        <div className="bg-charcoal border border-border p-3 rounded flex justify-between items-center">
          <span className="text-xs text-gray-500 font-mono flex items-center gap-1.5"><I.Check s={12} c="text-gray-500" />Accuracy (7d)</span>
          <span className="text-sm font-bold text-dexBlue">
            {status.accuracy.rolling7d != null ? (status.accuracy.rolling7d * 100).toFixed(1) + '%' : '\u2014'}
          </span>
        </div>
      </div>

      {/* Background Workers */}
      {status.jobs && Object.keys(status.jobs).length > 0 && (
        <>
          <h3 className="text-lg font-bold text-white mb-4 font-sans">Background Workers</h3>
          <div className="bg-panel border border-border rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm font-mono">
              <thead className="bg-charcoal text-gray-500 text-[10px] uppercase">
                <tr>
                  <th className="px-6 py-3 font-medium">Job Name</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Last Run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-gray-300">
                {Object.entries(status.jobs).map(([name, job]) => {
                  const j = job as Record<string, unknown>;
                  const isRunning = j.isRunning as boolean;
                  const isPaused = j.isPaused as boolean;
                  return (
                    <tr key={name} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-3">{name}</td>
                      <td className="px-6 py-3">
                        {isPaused ? (
                          <span className="text-dexYellow flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-dexYellow" />
                            Paused
                          </span>
                        ) : isRunning ? (
                          <span className="text-dexGreen flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-dexGreen animate-pulse" />
                            Running
                          </span>
                        ) : (
                          <span className="text-gray-500">Idle</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right text-gray-500">
                        {j.lastRun ? timeAgo(j.lastRun as string) : '\u2014'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
