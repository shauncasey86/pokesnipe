import type { IconComponent } from '../icons';
import { I } from '../icons';
import { TIER_CFG } from '../data/mock';

// Confidence / Liquidity Ring
export const Ring = ({ v, tier, sz = 36 }: { v: number; tier: string; sz?: number }) => {
  const r = sz / 2 - 4;
  const ci = 2 * Math.PI * r;
  const da = (v / 100) * ci;
  const co = tier === 'high' ? '#10B981' : tier === 'medium' ? '#F59E0B' : '#EF4444';
  return (
    <div className="relative shrink-0" style={{ width: sz, height: sz }} title={'Confidence: ' + v + '%'}>
      <svg className="conf-ring" width={sz} height={sz} viewBox={'0 0 ' + sz + ' ' + sz}>
        <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke="#23262F" strokeWidth="2.5" />
        <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke={co} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={da + ' ' + ci} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-bold text-white/80">{v}</span>
    </div>
  );
};

// Mini ring for signal breakdowns
export const MiniRing = ({ v, sz = 28 }: { v: number; sz?: number }) => {
  const r = sz / 2 - 3;
  const ci = 2 * Math.PI * r;
  const da = (v / 100) * ci;
  const co = v >= 80 ? '#10B981' : v >= 60 ? '#F59E0B' : '#EF4444';
  return (
    <div className="relative shrink-0" style={{ width: sz, height: sz }}>
      <svg className="conf-ring" width={sz} height={sz} viewBox={'0 0 ' + sz + ' ' + sz}>
        <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke="#23262F" strokeWidth="2" />
        <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke={co} strokeWidth="2" strokeLinecap="round" strokeDasharray={da + ' ' + ci} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[7px] font-bold text-white/80">{v}</span>
    </div>
  );
};

// Tier badge
export const Tier = ({ t }: { t: string }) => (
  <span className={'tier-' + t + ' text-[9px] font-mono font-bold px-2 py-0.5 rounded tracking-wider'} title={TIER_CFG[t]?.d}>{t}</span>
);

// Sidebar item
export const SideItem = ({ icon: Ic, label, active, badge, onClick }: {
  icon: IconComponent;
  label: string;
  active: boolean;
  badge?: number | null;
  onClick: () => void;
}) => (
  <button onClick={onClick} className={'w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ' + (active ? 'bg-brand/10 text-brand' : 'text-muted hover:text-white hover:bg-surfaceHover')}>
    <div className="flex items-center gap-3">
      <Ic s={20} c={active ? 'stroke-[2.5px]' : 'stroke-2'} />
      <span className="font-medium text-sm">{label}</span>
    </div>
    {badge != null && <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (active ? 'bg-brand text-white' : 'bg-surface border border-border text-muted')}>{badge}</span>}
  </button>
);

// Stat display in header
export const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex flex-col border-r border-border last:border-0 px-6">
    <span className="text-[9px] font-medium text-muted uppercase tracking-wider mb-1">{label}</span>
    <span className="text-lg font-bold text-white font-mono">{value}</span>
  </div>
);

// Empty state for feed
export const EmptyFeed = ({ hasFilter }: { hasFilter: boolean }) => (
  <div className="flex-1 flex items-center justify-center">
    <div className="text-center max-w-xs">
      {hasFilter ? (
        <>
          <I.Search s={40} c="text-muted/30 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">No matches</h3>
          <p className="text-xs text-muted">No deals match your current filters. Try broadening your search or enabling more tiers.</p>
        </>
      ) : (
        <>
          <div className="relative mx-auto mb-4 w-12 h-12">
            <I.Radar s={48} c="text-brand/40 scan-anim" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">Scanning eBay&hellip;</h3>
          <p className="text-xs text-muted">New deals will appear here as they&apos;re found.</p>
        </>
      )}
    </div>
  </div>
);

// Metric card for system view
export const MetricCard = ({ icon: Ic, label, value, sub, color = 'text-white', border = 'border-border' }: {
  icon: IconComponent;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  border?: string;
}) => (
  <div className={'bg-obsidian border ' + border + ' rounded-xl p-4'}>
    <div className="flex items-center gap-2 mb-2">
      <Ic s={14} c="text-muted" />
      <span className="text-[9px] font-bold text-muted uppercase tracking-wider">{label}</span>
    </div>
    <div className={'text-2xl font-mono font-bold ' + color}>{value}</div>
    {sub && <div className="text-[10px] text-muted mt-1">{sub}</div>}
  </div>
);

// Progress bar
export const Progress = ({ value, max, color = 'bg-profit', warn, label }: {
  value: number;
  max: number;
  color?: string;
  warn?: number;
  label?: string;
}) => {
  const pct = Math.min((value / max) * 100, 100);
  const isWarn = warn && pct > warn;
  return (
    <div>
      {label && (
        <div className="flex justify-between text-[10px] mb-1.5">
          <span className="text-muted">{label}</span>
          <span className="font-mono text-white/70">{value.toLocaleString()} / {max.toLocaleString()}</span>
        </div>
      )}
      <div className="w-full bg-obsidian rounded-full h-2 overflow-hidden">
        <div className={'h-2 rounded-full transition-all ' + (isWarn ? 'bg-warn' : color)} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
};

// Status dot
export const StatusDot = ({ ok }: { ok: boolean }) => (
  <div className={'w-2.5 h-2.5 rounded-full ' + (ok ? 'bg-profit pulse-dot' : 'bg-risk')} />
);

// Signal grid for confidence/liquidity breakdowns
export const SignalGrid = ({ signals, weights }: { signals: Record<string, number>; weights: Record<string, number> }) => (
  <div className="grid grid-cols-3 gap-2 mt-2">
    {Object.entries(signals).map(([k, v]) => (
      <div key={k} className="flex items-center gap-1.5">
        <MiniRing v={Math.round(v * 100)} />
        <div className="min-w-0">
          <div className="text-[9px] text-white/70 capitalize truncate">{k}</div>
          <div className="text-[8px] font-mono text-muted/50">{((weights[k] ?? 0) * 100).toFixed(0)}% wt</div>
        </div>
      </div>
    ))}
  </div>
);
