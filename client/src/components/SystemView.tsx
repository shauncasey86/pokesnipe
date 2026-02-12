import { I } from '../icons';
import { DEALS, SYNC_LOG, timeAgo, fmtTime } from '../data/mock';
import { MetricCard, Progress, StatusDot } from './shared';

const now = Date.now();
const scannerMetrics = { scansTotal: 1247, listingsProcessed: 14964, matched: 892, rejected: 14072, dealsCreated: DEALS.length, avgCycleSec: 14.2, lastScan: new Date(now - 12000), interval: 5 };
const apiMetrics = { ebay: { used: 1847, limit: 5000, search: 288, getItem: 1559, oauthValid: true, lastError: null }, scrydex: { credits: 47600, total: 75000, lastSync: new Date(now - 10 * 60000) }, fx: { rate: 0.789, lastFetch: new Date(now - 47 * 60000), stale: false } };
const catalogMetrics = { expansions: 347, cards: 18420, variants: 52800, lastFull: new Date(now - 48 * 3600000), lastDelta: new Date(now - 10 * 60000) };
const alerts = [
  { sev: 'warn' as const, msg: 'Exchange rate last fetched 47m ago \u2014 approaching staleness threshold (4h)', ts: new Date(now - 47 * 60000) },
  { sev: 'warn' as const, msg: 'eBay rate limit: 2 consecutive 429s detected this cycle', ts: new Date(now - 8 * 60000) },
];

export default function SystemView() {

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
                <div className="flex-1">
                  <p className={`text-sm ${a.sev === 'warn' ? 'text-warn' : 'text-risk'}`}>{a.msg}</p>
                  <p className="text-[10px] text-muted mt-0.5">{timeAgo(a.ts)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Scanner */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><I.Radar s={18} c="text-brand" /><h2 className="text-sm font-bold text-white">Scanner</h2></div>
            <div className="flex items-center gap-2 text-xs">
              <StatusDot ok={true} />
              <span className="text-profit font-semibold">Running</span>
              <span className="text-muted">&middot; every {scannerMetrics.interval}min &middot; last {timeAgo(scannerMetrics.lastScan)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard icon={I.Activity} label="Scans Total" value={scannerMetrics.scansTotal.toLocaleString()} sub={`${scannerMetrics.avgCycleSec}s avg cycle`} />
            <MetricCard icon={I.Search} label="Listings Processed" value={scannerMetrics.listingsProcessed.toLocaleString()} sub={`${scannerMetrics.matched} matched \u00b7 ${scannerMetrics.rejected} rejected`} />
            <MetricCard icon={I.Zap} label="Deals Created" value={scannerMetrics.dealsCreated} color="text-profit" />
            <MetricCard icon={I.Check} label="Match Rate" value={`${((scannerMetrics.matched / scannerMetrics.listingsProcessed) * 100).toFixed(1)}%`} sub="matched / processed" />
          </div>
        </div>

        {/* API Budgets */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4"><I.Globe s={18} c="text-brand" /><h2 className="text-sm font-bold text-white">API Budgets</h2></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-obsidian rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-white">eBay Browse API</span>
                <div className="flex items-center gap-1.5"><StatusDot ok={apiMetrics.ebay.oauthValid} /><span className="text-[10px] text-muted">OAuth valid</span></div>
              </div>
              <Progress value={apiMetrics.ebay.used} max={apiMetrics.ebay.limit} warn={80} label="Daily calls" />
              <div className="flex gap-4 mt-3 text-[10px] text-muted">
                <span>search <span className="text-white/70 font-mono">{apiMetrics.ebay.search}</span></span>
                <span>getItem <span className="text-white/70 font-mono">{apiMetrics.ebay.getItem}</span></span>
              </div>
            </div>
            <div className="bg-obsidian rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-white">Scrydex</span>
                <span className="text-[10px] text-muted">Last sync {timeAgo(apiMetrics.scrydex.lastSync)}</span>
              </div>
              <Progress value={apiMetrics.scrydex.total - apiMetrics.scrydex.credits} max={apiMetrics.scrydex.total} color="bg-brand" warn={80} label="Credits used" />
              <div className="text-[10px] text-muted mt-2"><span className="text-white/70 font-mono">{apiMetrics.scrydex.credits.toLocaleString()}</span> credits remaining</div>
            </div>
            <div className="bg-obsidian rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-white">Exchange Rate</span>
                <StatusDot ok={!apiMetrics.fx.stale} />
              </div>
              <div className="text-3xl font-mono font-bold text-white mb-1">{apiMetrics.fx.rate}</div>
              <div className="text-[10px] text-muted">USD &rarr; GBP &middot; fetched {timeAgo(apiMetrics.fx.lastFetch)}</div>
              <div className="text-[10px] text-muted mt-1">Staleness threshold: 4 hours</div>
            </div>
          </div>
        </div>

        {/* Card Catalog */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4"><I.Database s={18} c="text-brand" /><h2 className="text-sm font-bold text-white">Card Catalog</h2></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard icon={I.Database} label="Expansions" value={catalogMetrics.expansions} />
            <MetricCard icon={I.Database} label="Cards" value={catalogMetrics.cards.toLocaleString()} />
            <MetricCard icon={I.Database} label="Variants" value={catalogMetrics.variants.toLocaleString()} />
            <MetricCard icon={I.Clock} label="Last Full Sync" value={timeAgo(catalogMetrics.lastFull)} sub={`Delta: ${timeAgo(catalogMetrics.lastDelta)}`} />
          </div>
          <div className="mt-4 pt-3 border-t border-border/50">
            <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Recent Syncs</h3>
            <div className="space-y-1.5">
              {SYNC_LOG.map(s => (
                <div key={s.id} className="flex items-center gap-3 text-[11px] font-mono py-1.5 px-3 rounded-lg bg-obsidian">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${s.type === 'full' ? 'bg-brand/10 text-brand' : 'bg-surfaceHover text-muted'}`}>{s.type.toUpperCase()}</span>
                  <span className="text-muted">{fmtTime(s.startedAt)}</span>
                  <span className={`${s.status === 'completed' ? 'text-profit' : 'text-risk'}`}>{s.status}</span>
                  <span className="text-muted/60">&middot;</span><span className="text-white/70">{s.cards.toLocaleString()} cards</span>
                  <span className="text-muted/60">&middot;</span><span className="text-white/70">{s.variants.toLocaleString()} variants</span>
                  <span className="text-muted/60">&middot;</span><span className="text-muted">{s.credits} cr</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Background Jobs */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4"><I.Clock s={18} c="text-brand" /><h2 className="text-sm font-bold text-white">Background Jobs (&sect;14.3)</h2></div>
          <div className="space-y-2">
            {[
              { name: 'eBay Scan', interval: '5 min', last: '12s ago', ok: true },
              { name: 'Deal Cleanup', interval: '1 hour', last: '18m ago', ok: true },
              { name: 'Exchange Rate', interval: '1 hour', last: '47m ago', ok: true },
              { name: 'Hot Refresh', interval: 'Daily 03:00', last: '21h ago', ok: true },
              { name: 'Expansion Check', interval: 'Daily 04:00', last: '22h ago', ok: true },
              { name: 'Full Sync', interval: 'Weekly Sun 03:00', last: '2d ago', ok: true },
              { name: 'Listings Pre-fetch', interval: 'Weekly Sun 05:00', last: '2d ago', ok: true },
            ].map(j => (
              <div key={j.name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-obsidian text-sm">
                <div className="flex items-center gap-3"><StatusDot ok={j.ok} /><span className="text-white font-medium">{j.name}</span></div>
                <div className="flex items-center gap-4 text-[11px] font-mono"><span className="text-muted">{j.interval}</span><span className="text-white/60">{j.last}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
