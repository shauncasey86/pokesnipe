import { useState, useEffect } from 'react';
import { I } from '../icons';
import { timeAgo } from '../data/mock';
import { MetricCard, Progress, StatusDot } from './shared';
import { getStatus } from '../api/deals';
import type { SystemStatus } from '../types/deals';

export default function SystemView() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const s = await getStatus();
        if (!cancelled) { setStatus(s); setError(null); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (loading && !status) {
    return (
      <div className="flex-1 flex items-center justify-center bg-obsidian">
        <div className="text-center">
          <I.Loader s={32} c="text-brand mx-auto mb-3" />
          <p className="text-sm text-muted">Loading system status&hellip;</p>
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex-1 flex items-center justify-center bg-obsidian">
        <div className="text-center max-w-xs">
          <I.AlertTriangle s={32} c="text-risk mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">Failed to load</h3>
          <p className="text-xs text-muted">{error}</p>
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

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-obsidian">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">System Health</h1>
          <p className="text-sm text-muted">Real-time status of all Pok&eacute;Snipe services. Data from <span className="font-mono text-white/70">GET /api/status</span></p>
        </div>

        {/* Active alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${a.sev === 'warn' ? 'bg-warn/5 border-warn/20' : 'bg-risk/5 border-risk/20'}`}>
                <I.AlertTriangle s={16} c={`shrink-0 mt-0.5 ${a.sev === 'warn' ? 'text-warn' : 'text-risk'}`} />
                <p className={`text-sm ${a.sev === 'warn' ? 'text-warn' : 'text-risk'}`}>{a.msg}</p>
              </div>
            ))}
          </div>
        )}

        {/* Scanner */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><I.Radar s={18} c="text-brand" /><h2 className="text-sm font-bold text-white">Scanner</h2></div>
            <div className="flex items-center gap-2 text-xs">
              <StatusDot ok={status.scanner.isRunning} />
              <span className={status.scanner.isRunning ? 'text-profit font-semibold' : 'text-warn font-semibold'}>{status.scanner.status === 'paused' ? 'Paused' : status.scanner.isRunning ? 'Running' : 'Idle'}</span>
              {status.scanner.lastRun && <span className="text-muted">&middot; last {timeAgo(status.scanner.lastRun)}</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard icon={I.Activity} label="Deals Today" value={status.scanner.dealsToday} />
            <MetricCard icon={I.Zap} label="Grails Today" value={status.scanner.grailsToday} color="text-grail" />
            <MetricCard icon={I.Database} label="Active Deals" value={status.scanner.activeDeals} />
            <MetricCard icon={I.Check} label="Accuracy (7d)" value={status.accuracy.rolling7d != null ? (status.accuracy.rolling7d * 100).toFixed(1) + '%' : '\u2014'} sub={`${status.accuracy.totalReviewed} reviewed`} />
          </div>
        </div>

        {/* API Budgets */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4"><I.Globe s={18} c="text-brand" /><h2 className="text-sm font-bold text-white">API Budgets</h2></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-obsidian rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-white">eBay Browse API</span>
                <div className="flex items-center gap-1.5"><StatusDot ok={status.ebay.status === 'healthy'} /><span className="text-[10px] text-muted">{status.ebay.status}</span></div>
              </div>
              <Progress value={status.ebay.callsToday} max={status.ebay.dailyLimit} warn={80} label="Daily calls" />
              <div className="text-[10px] text-muted mt-2"><span className="text-white/70 font-mono">{status.ebay.remaining.toLocaleString()}</span> remaining</div>
            </div>
            {status.scrydex && (
              <div className="bg-obsidian rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-white">Scrydex</span>
                  <StatusDot ok={status.scrydex.status === 'healthy'} />
                </div>
                <Progress value={status.scrydex.creditsConsumed} max={status.scrydex.creditsConsumed + 10000} color="bg-brand" warn={80} label="Credits used" />
                <div className="text-[10px] text-muted mt-2">Period ends <span className="text-white/70 font-mono">{new Date(status.scrydex.periodEnd).toLocaleDateString()}</span></div>
              </div>
            )}
            <div className="bg-obsidian rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-white">Exchange Rate</span>
                <StatusDot ok={!status.exchangeRate.isStale} />
              </div>
              <div className="text-3xl font-mono font-bold text-white mb-1">{status.exchangeRate.rate?.toFixed(4) ?? '\u2014'}</div>
              <div className="text-[10px] text-muted">USD &rarr; GBP{status.exchangeRate.fetchedAt ? ' \u00b7 fetched ' + timeAgo(status.exchangeRate.fetchedAt) : ''}</div>
              <div className="text-[10px] text-muted mt-1">Staleness threshold: 4 hours</div>
            </div>
          </div>
        </div>

        {/* Card Catalog */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4"><I.Database s={18} c="text-brand" /><h2 className="text-sm font-bold text-white">Card Catalog</h2></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard icon={I.Database} label="Expansions" value={status.sync.totalExpansions.toLocaleString()} />
            <MetricCard icon={I.Database} label="Cards" value={status.sync.totalCards.toLocaleString()} />
            <MetricCard icon={I.Clock} label="Last Sync" value={status.sync.lastSync ? timeAgo(status.sync.lastSync) : 'Never'} />
            <MetricCard icon={I.Check} label="Dedup Memory" value={status.scanner.dedupMemorySize.toLocaleString()} sub="listings tracked" />
          </div>
        </div>

        {/* Background Jobs */}
        {status.jobs && Object.keys(status.jobs).length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4"><I.Clock s={18} c="text-brand" /><h2 className="text-sm font-bold text-white">Background Jobs</h2></div>
            <div className="space-y-2">
              {Object.entries(status.jobs).map(([name, job]) => {
                const j = job as Record<string, unknown>;
                return (
                  <div key={name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-obsidian text-sm">
                    <div className="flex items-center gap-3">
                      <StatusDot ok={j.isRunning as boolean || !(j.isPaused as boolean)} />
                      <span className="text-white font-medium">{name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] font-mono">
                      {j.isPaused && <span className="text-warn">paused</span>}
                      {j.lastRun && <span className="text-muted">{timeAgo(j.lastRun as string)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
