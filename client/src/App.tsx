import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { I } from './icons';
import {
  DEALS, EXPANSIONS, CONF_WEIGHTS, LIQ_WEIGHTS_V, LIQ_WEIGHTS_NV,
  timeAgo, fmtListedTime, trendInfo, bestImg, hasEbImg,
  type DealData,
} from './data/mock';
import { Ring, Tier, SideItem, Stat, EmptyFeed, SignalGrid } from './components/shared';
import SystemView from './components/SystemView';
import AuditView from './components/AuditView';
import LookupView from './components/LookupView';
import SettingsView from './components/SettingsView';

type ViewName = 'opportunities' | 'system' | 'audit' | 'lookup' | 'settings';
type TierFilter = Record<string, boolean>;

export default function App() {
  const [selId, setSelId] = useState(DEALS[0].id);
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const [imgFlip, setImgFlip] = useState<Record<string, boolean>>({});
  const [activeView, setActiveView] = useState<ViewName>('opportunities');
  const [tierFilter, setTierFilter] = useState<TierFilter>({ GRAIL: true, HIT: true, FLIP: true, SLEEP: false });
  const [searchQ, setSearchQ] = useState('');
  const [reviews, setReviews] = useState<Record<string, string | null>>(() => {
    const r: Record<string, string | null> = {};
    DEALS.forEach(d => { if (d.reviewedAs) r[d.id] = d.reviewedAs; });
    return r;
  });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  const deal = useMemo(() => DEALS.find(d => d.id === selId), [selId]);

  const filtered = useMemo(() => {
    let r = DEALS.filter(d => tierFilter[d.tier]);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      r = r.filter(d => d.name.toLowerCase().includes(q) || d.set.name.toLowerCase().includes(q) || d.num.includes(q));
    }
    return r;
  }, [tierFilter, searchQ]);

  const grails = DEALS.filter(d => d.tier === 'GRAIL').length;
  const hits = DEALS.filter(d => d.tier === 'HIT').length;

  const handleListKey = useCallback((e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
    e.preventDefault();
    const idx = filtered.findIndex(d => d.id === selId);
    if (e.key === 'ArrowDown' && idx < filtered.length - 1) {
      setSelId(filtered[idx + 1].id);
      listRef.current?.children[idx + 1]?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'ArrowUp' && idx > 0) {
      setSelId(filtered[idx - 1].id);
      listRef.current?.children[idx - 1]?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter' && deal) window.open(deal.url, '_blank');
  }, [filtered, selId, deal]);

  const isStale = useCallback((d: DealData) => d.status === 'expired' || d.status === 'sold' || (Date.now() - d.at.getTime() > 60 * 60000), []);

  return (
    <div className="h-screen w-screen flex flex-col font-sans text-sm selection:bg-brand/30">
      {/* ═══════════ HEADER ═══════════ */}
      <header className="h-16 glass-panel flex items-center justify-between px-6 z-20 shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-brand to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.4)]">
              <I.Crosshair c="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">
              Pok&eacute;Snipe <span className="text-brand font-mono text-xs ml-1 bg-brand/10 px-1.5 py-0.5 rounded">PRO</span>
            </span>
          </div>
          <div className="hidden lg:flex items-center h-8 ml-8">
            <Stat label="Today" value={DEALS.length} />
            <Stat label="Grails" value={grails} />
            <Stat label="Hits" value={hits} />
            <Stat label="Accuracy" value="91.2%" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-profit/10 text-profit border border-profit/20">
            <div className="w-2 h-2 rounded-full bg-profit pulse-dot" />
            <span className="text-xs font-bold tracking-wide">SCANNING</span>
          </div>
          <div className="text-xs font-mono text-muted">{time}</div>
          <div className="w-px h-6 bg-border mx-2" />
          <button className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-surfaceHover transition-colors">
            <I.Bell c="text-muted w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ═══════════ SIDEBAR ═══════════ */}
        <aside className="w-64 glass-panel border-r border-border flex flex-col justify-between py-6 z-10 shrink-0">
          <div className="px-3 space-y-1">
            <SideItem icon={I.Radar} label="Opportunities" active={activeView === 'opportunities'} badge={filtered.length} onClick={() => setActiveView('opportunities')} />
            <SideItem icon={I.Server} label="System" active={activeView === 'system'} onClick={() => setActiveView('system')} />
            <SideItem icon={I.ScrollText} label="Audit Log" active={activeView === 'audit'} onClick={() => setActiveView('audit')} />
            <SideItem icon={I.FileSearch} label="Manual Lookup" active={activeView === 'lookup'} onClick={() => setActiveView('lookup')} />
            <SideItem icon={I.Settings} label="Settings" active={activeView === 'settings'} onClick={() => setActiveView('settings')} />
          </div>
          <div className="px-6 mb-4">
            <div className="bg-surface rounded-xl p-4 border border-border relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-brand opacity-10 rounded-bl-full" />
              <p className="text-[9px] text-muted mb-2 font-bold uppercase tracking-wider">eBay API Budget</p>
              <div className="flex justify-between items-end mb-2">
                <span className="text-xl font-mono font-bold text-white">1,847</span>
                <span className="text-[10px] font-mono text-muted">/ 5,000</span>
              </div>
              <div className="w-full bg-obsidian rounded-full h-1.5 mb-2 overflow-hidden">
                <div className="bg-profit h-1.5 rounded-full" style={{ width: '37%' }} />
              </div>
              <p className="text-[10px] text-muted">288 search &middot; 1,559 getItem</p>
            </div>
          </div>
        </aside>

        {/* ═══════════ VIEWS ═══════════ */}
        {activeView === 'system' && <SystemView />}
        {activeView === 'audit' && <AuditView />}
        {activeView === 'lookup' && <LookupView />}
        {activeView === 'settings' && <SettingsView />}

        {activeView === 'opportunities' && (
          <main className="flex-1 flex overflow-hidden">
            {/* LEFT: Deal List */}
            <div className="w-full lg:w-[55%] xl:w-[60%] flex flex-col bg-obsidian border-r border-border relative z-0">
              <div className="p-4 border-b border-border bg-surface/50 backdrop-blur-sm flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
                  {(['GRAIL', 'HIT', 'FLIP', 'SLEEP'] as const).map(t => (
                    <button key={t} onClick={() => setTierFilter(p => ({ ...p, [t]: !p[t] }))} className={'px-3 py-1.5 text-[10px] font-bold rounded tracking-wider transition-all ' + (tierFilter[t] ? 'bg-border text-white shadow-sm' : 'text-muted/40 hover:text-muted')}>{t}</button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <I.Search c="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search cards, sets..." className="bg-surface border border-border rounded-lg pl-9 pr-4 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-brand placeholder:text-muted/50 w-56" />
                  </div>
                </div>
              </div>

              {filtered.length === 0 ? (
                <EmptyFeed hasFilter={!!searchQ || Object.values(tierFilter).some(v => !v)} />
              ) : (
                <div className="flex-1 overflow-y-auto p-2 space-y-1 relative" ref={listRef} onKeyDown={handleListKey} tabIndex={0} role="listbox" aria-label="Deal feed">
                  {filtered.map(d => {
                    const t7 = trendInfo(d.trends['7d']);
                    const stale = isStale(d);
                    const reviewed = reviews[d.id];
                    const exp = EXPANSIONS[d.set.code];
                    return (
                      <div
                        key={d.id}
                        role="option"
                        aria-selected={selId === d.id}
                        tabIndex={-1}
                        onClick={() => setSelId(d.id)}
                        className={
                          'deal-row group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ' +
                          (selId === d.id ? 'bg-surface border-brand/50 shadow-[0_0_20px_rgba(99,102,241,0.05)]' : 'bg-surface/30 border-transparent hover:bg-surface hover:border-border') + ' ' +
                          (d.tier === 'GRAIL' && !stale ? 'border-l-[3px] border-l-grail bg-linear-to-r from-grail/[.03] to-transparent' : '') + ' ' +
                          (stale ? 'deal-stale' : '')
                        }
                      >
                        {/* Thumbnail */}
                        <div
                          className="w-14 h-[78px] rounded-md bg-obsidian overflow-hidden shrink-0 border border-white/5 shadow-md relative"
                          onClick={(e) => { if (hasEbImg(d)) { e.stopPropagation(); setImgFlip(p => ({ ...p, [d.id]: !p[d.id] })); } }}
                          style={{ cursor: hasEbImg(d) ? 'pointer' : 'default' }}
                        >
                          <img src={bestImg(d, !!imgFlip[d.id])} alt={d.name} className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" onError={(e) => { (e.target as HTMLImageElement).src = d.scrImg; }} />
                          {hasEbImg(d) && <div className={'absolute bottom-0.5 left-0.5 text-[7px] font-mono font-bold px-1 rounded ' + (imgFlip[d.id] ? 'bg-brand/80 text-white' : 'bg-white/70 text-obsidian')}>{imgFlip[d.id] ? 'SCR' : 'eBay'}</div>}
                          {exp && <img src={exp.symbol} alt="" className="absolute top-0.5 right-0.5 w-3.5 h-3.5 opacity-60" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                        </div>
                        <Ring v={Math.round(d.conf * 100)} tier={d.confT} />
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <Tier t={d.tier} />
                            <span className="font-bold text-white text-sm truncate">{d.name}</span>
                            {reviewed && <span className={'text-[8px] font-bold px-1 rounded ' + (reviewed === 'correct' ? 'bg-profit/10 text-profit' : 'bg-risk/10 text-risk')}>{reviewed === 'correct' ? '\u2713' : '\u2717'}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted truncate">
                            {exp && <img src={exp.symbol} alt="" className="w-3 h-3 opacity-50 shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                            <span>{d.set.name}</span><span className="text-border">&middot;</span><span className="font-mono text-[10px]">{d.num}</span>
                            {d.isGr && <><span className="text-border">&middot;</span><span className="text-info font-semibold">{d.grader} {d.grade}</span></>}
                            <span className="text-border">&middot;</span><span className="text-[10px] font-semibold text-white/70">{d.cond}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={'text-[9px] font-medium ' + t7.c}>{t7.t}</span>
                            <span className="text-[9px] text-muted/40 ml-auto shrink-0" title={fmtListedTime(d.at)}>{timeAgo(d.at)}</span>
                          </div>
                        </div>
                        {/* Pricing column */}
                        <div className="flex flex-col items-end shrink-0 pl-3 min-w-[86px]">
                          <span className={'text-lg font-bold font-mono leading-none ' + (d.pGBP >= 0 ? 'text-profit' : 'text-risk')}>{d.pGBP >= 0 ? '+' : ''}&pound;{d.pGBP.toFixed(2)}</span>
                          <span className={'text-[10px] font-mono mt-0.5 ' + (d.pGBP >= 0 ? 'text-profit/60' : 'text-risk/60')}>{d.pPct >= 0 ? '+' : ''}{d.pPct.toFixed(0)}% ROI</span>
                          <div className="text-[9px] font-mono text-muted/40 mt-1">&pound;{d.tCost.toFixed(0)} &rarr; &pound;{d.mGBP.toFixed(0)}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="sticky bottom-0 left-0 right-0 h-12 bg-linear-to-t from-obsidian to-transparent pointer-events-none" />
                </div>
              )}
            </div>

            {/* RIGHT: Deal Detail */}
            {deal && <DealDetail key={deal.id} deal={deal} reviews={reviews} setReviews={setReviews} isStale={isStale} />}
          </main>
        )}
      </div>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="h-10 border-t border-border bg-surface/80 flex items-center px-4 text-[10px] font-mono shrink-0 gap-6">
        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-profit pulse-dot" /><span className="font-semibold text-white/80">Scanning</span><span className="text-muted">12s ago</span></div>
        <div className="border-l border-border h-5" /><div className="flex items-center gap-1.5"><span className="text-muted">Deals</span><span className="text-white font-semibold">{filtered.length}/{DEALS.length}</span></div>
        <div className="border-l border-border h-5" /><div className="flex items-center gap-1.5"><span className="text-muted">Accuracy</span><span className="text-white font-semibold">91.2%</span></div>
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-muted">
          <span>eBay <span className="text-white/70">1,847/5k</span></span>
          <span>Scrydex <span className="text-white/70">47.6k cr</span></span>
          <span>FX <span className="text-white/70">0.789</span></span>
        </div>
      </footer>
    </div>
  );
}

// ═══════════ DEAL DETAIL PANEL ═══════════
function DealDetail({
  deal, reviews, setReviews, isStale,
}: {
  deal: DealData;
  reviews: Record<string, string | null>;
  setReviews: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  isStale: (d: DealData) => boolean;
}) {
  const [detailScr, setDetailScr] = useState(false);
  const [costExpanded, setCostExpanded] = useState(false);
  const [confFlipped, setConfFlipped] = useState(false);
  const [liqFlipped, setLiqFlipped] = useState(false);
  const exp = EXPANSIONS[deal.set.code];
  const rv = reviews[deal.id];

  return (
    <div className="hidden lg:flex w-[45%] xl:w-[40%] bg-surface flex-col shadow-[-20px_0_40px_rgba(0,0,0,.3)] z-10">
      <div className="p-6 border-b border-border flex gap-6 items-start shrink-0 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand rounded-full blur-[100px] opacity-10 pointer-events-none" />
        <div
          className="w-28 h-40 rounded-xl overflow-hidden shadow-2xl shrink-0 border border-white/10 bg-obsidian relative image-glow"
          onClick={() => { if (hasEbImg(deal)) setDetailScr(p => !p); }}
          style={{ cursor: hasEbImg(deal) ? 'pointer' : 'default' }}
        >
          <img src={bestImg(deal, detailScr)} alt={deal.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = deal.scrImg; }} />
          <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/10 to-transparent opacity-50 mix-blend-overlay" />
          {hasEbImg(deal) && <div className={'absolute bottom-1 left-1 text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ' + (detailScr ? 'bg-brand/90 text-white' : 'bg-white/80 text-obsidian')}>{detailScr ? 'Scrydex' : 'eBay'}</div>}
        </div>
        <div className="flex-1 pt-2">
          <div className="flex flex-wrap gap-2 mb-3">
            <Tier t={deal.tier} />
            <span className="text-[10px] font-mono text-muted bg-surfaceHover px-2 py-0.5 rounded border border-border">{deal.cond}{deal.isGr ? ' \u00b7 ' + deal.grader + ' ' + deal.grade : ''}</span>
          </div>
          <h2 className="text-2xl font-bold text-white leading-tight mb-1">{deal.name}</h2>
          <p className="text-sm text-muted font-mono mb-3">{deal.num} &middot; {deal.variant} &middot; {deal.rarity}</p>
          {exp && (
            <div className="flex items-center gap-2 mb-3 bg-obsidian rounded-lg px-3 py-2 border border-border/50">
              <img src={exp.logo} alt={exp.name} className="h-5 object-contain opacity-80" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-white truncate">{exp.name}</div>
                <div className="text-[9px] text-muted font-mono">{exp.series} &middot; {exp.printedTotal}/{exp.total} cards &middot; {exp.releaseDate}</div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-muted"><I.User s={16} c="w-4 h-4" />{deal.seller} <span className="text-white">({deal.fb.toLocaleString()})</span></div>
            <div className="flex items-center gap-1.5 text-muted"><I.Clock s={16} c="w-4 h-4" /><span title={fmtListedTime(deal.at)}>{timeAgo(deal.at)}</span></div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Profit hero */}
        <div className="text-center py-3">
          <span className={'text-4xl font-mono font-bold ' + (deal.pGBP >= 0 ? 'text-profit' : 'text-risk')}>{deal.pGBP >= 0 ? '+' : ''}&pound;{deal.pGBP.toFixed(2)}</span>
          <div className={'text-sm font-mono mt-1 ' + (deal.pGBP >= 0 ? 'text-profit/70' : 'text-risk/70')}>{deal.pPct >= 0 ? '+' : ''}{deal.pPct.toFixed(1)}% return on &pound;{deal.tCost.toFixed(2)} cost</div>
        </div>

        {/* Collapsible pricing */}
        <div className="bg-obsidian border border-border rounded-xl relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand" />
          <button onClick={() => setCostExpanded(p => !p)} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[.02] transition-colors">
            <div className="flex items-center gap-6 font-mono text-sm">
              <div><span className="text-[9px] font-sans text-muted uppercase tracking-wider block mb-0.5">Cost</span><span className="text-white font-bold">&pound;{deal.tCost.toFixed(2)}</span></div>
              <span className="text-muted/40">&rarr;</span>
              <div><span className="text-[9px] font-sans text-muted uppercase tracking-wider block mb-0.5">Market</span><span className="text-white font-bold">&pound;{deal.mGBP.toFixed(2)}</span></div>
              <span className="text-muted/40">=</span>
              <div><span className="text-[9px] font-sans text-muted uppercase tracking-wider block mb-0.5">Profit</span><span className="text-profit font-bold">+&pound;{deal.pGBP.toFixed(2)}</span></div>
            </div>
            <I.ChevronDown s={16} c={'text-muted transition-transform ' + (costExpanded ? 'rotate-180' : '')} />
          </button>
          {costExpanded && (
            <div className="px-5 pb-4 space-y-2 font-mono text-sm border-t border-border/50 pt-3">
              <div className="flex justify-between text-white"><span className="text-muted font-sans text-xs">eBay Listing</span><span>&pound;{deal.eP.toFixed(2)}</span></div>
              <div className="flex justify-between text-white"><span className="text-muted font-sans text-xs">Shipping</span><span>{deal.ship > 0 ? '\u00a3' + deal.ship.toFixed(2) : 'Free'}</span></div>
              <div className="flex justify-between text-white"><span className="text-muted font-sans text-xs">Buyer Protection</span><span>&pound;{deal.bp.toFixed(2)}</span></div>
              <div className="w-full h-px bg-border/50" />
              <div className="flex justify-between text-[10px] text-muted"><span className="font-sans">FX Rate</span><span>USD/GBP {deal.fx.toFixed(4)}</span></div>
            </div>
          )}
        </div>

        {/* Confidence + Liquidity side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-obsidian border border-border rounded-xl p-4 cursor-pointer transition-all hover:border-border/80" onClick={() => setConfFlipped(p => !p)}>
            {!confFlipped ? (
              <>
                <div className="flex items-center justify-between mb-3"><span className="text-[9px] font-bold text-muted uppercase tracking-wider">Confidence</span><span className="text-[8px] text-muted/40">tap</span></div>
                <div className="flex items-center gap-3">
                  <Ring v={Math.round(deal.conf * 100)} tier={deal.confT} sz={44} />
                  <div><div className="text-xl font-mono font-bold text-white">{Math.round(deal.conf * 100)}%</div><div className="text-[10px] text-muted capitalize">{deal.confT}</div></div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1"><span className="text-[9px] font-bold text-muted uppercase tracking-wider">Signals</span><span className="text-[8px] font-mono text-muted/50">geo. mean</span></div>
                <SignalGrid signals={deal.confSignals} weights={CONF_WEIGHTS} />
              </>
            )}
          </div>
          <div className="bg-obsidian border border-border rounded-xl p-4 cursor-pointer transition-all hover:border-border/80" onClick={() => setLiqFlipped(p => !p)}>
            {!liqFlipped ? (
              <>
                <div className="flex items-center justify-between mb-3"><span className="text-[9px] font-bold text-muted uppercase tracking-wider">Liquidity</span><span className="text-[8px] text-muted/40">tap</span></div>
                <div className="flex items-center gap-3">
                  <Ring v={Math.round(deal.liq * 100)} tier={deal.liqG === 'high' ? 'high' : deal.liqG === 'medium' ? 'medium' : 'low'} sz={44} />
                  <div><div className="text-xl font-mono font-bold text-white">{Math.round(deal.liq * 100)}%</div><div className="text-[10px] text-muted capitalize">{deal.liqG}</div></div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1"><span className="text-[9px] font-bold text-muted uppercase tracking-wider">Signals</span><span className="text-[8px] font-mono text-muted/50">arith. mean</span></div>
                <SignalGrid signals={deal.liqSignals} weights={deal.hasVelocity ? LIQ_WEIGHTS_V : LIQ_WEIGHTS_NV} />
              </>
            )}
          </div>
        </div>

        {/* Condition Comps */}
        <div className="bg-obsidian border border-border rounded-xl p-5">
          <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Condition Comps (Scrydex)</h3>
          <div className="grid grid-cols-4 gap-2">
            {(['NM', 'LP', 'MP', 'HP'] as const).map(c => {
              const cp = deal.comps[c];
              const ac = deal.cond === c;
              return (
                <div key={c} className={'rounded-lg p-3 text-center border ' + (ac ? 'bg-brand/10 border-brand/30' : 'bg-surface border-border')}>
                  <div className={'text-[10px] font-bold mb-1 ' + (ac ? 'text-brand' : 'text-muted')}>{c}</div>
                  {cp ? (
                    <><div className="text-sm font-mono font-bold text-white">&pound;{cp.mk.toFixed(0)}</div><div className="text-[9px] font-mono text-muted">low &pound;{cp.lo.toFixed(0)}</div></>
                  ) : (
                    <div className="text-[10px] text-muted/50">&mdash;</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Price Trend */}
        <div className="bg-obsidian border border-border rounded-xl p-5">
          <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Price Trend</h3>
          <div className="grid grid-cols-4 gap-2">
            {(['1d', '7d', '30d', '90d'] as const).map(w => {
              const v = deal.trends[w];
              const ti = trendInfo(v);
              return (
                <div key={w} className="bg-surface rounded-lg p-3 text-center">
                  <div className="text-[10px] font-bold text-muted uppercase mb-1">{w}</div>
                  <div className={'text-sm font-mono font-bold ' + ti.c}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Match Review */}
        <div className={'bg-obsidian border rounded-xl p-4 flex items-center justify-between ' + (rv === 'correct' ? 'border-profit/30' : rv === 'incorrect' ? 'border-risk/30' : 'border-border')}>
          <div>
            <div className="text-[10px] font-bold text-muted uppercase tracking-wider">Match Review</div>
            {rv ? (
              <div className={'text-[11px] mt-1 font-semibold ' + (rv === 'correct' ? 'text-profit' : 'text-risk')}>Marked as {rv}</div>
            ) : (
              <div className="text-[11px] text-muted mt-1">Was this card match correct?</div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setReviews(p => ({ ...p, [deal.id]: p[deal.id] === 'correct' ? null : 'correct' }))}
              className={'p-2 rounded-lg border transition-all ' + (rv === 'correct' ? 'bg-profit/20 border-profit/40 text-profit' : 'border-border bg-surface hover:bg-profit/10 hover:border-profit/30 hover:text-profit text-muted')}
              title="Correct match"
            >
              {rv === 'correct' ? <I.Check s={16} c="w-4 h-4" /> : <I.Up s={16} c="w-4 h-4" />}
            </button>
            <button
              onClick={() => setReviews(p => ({ ...p, [deal.id]: p[deal.id] === 'incorrect' ? null : 'incorrect' }))}
              className={'p-2 rounded-lg border transition-all ' + (rv === 'incorrect' ? 'bg-risk/20 border-risk/40 text-risk' : 'border-border bg-surface hover:bg-risk/10 hover:border-risk/30 hover:text-risk text-muted')}
              title="Incorrect match"
            >
              {rv === 'incorrect' ? <I.X s={16} c="w-4 h-4" /> : <I.Down s={16} c="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="p-6 border-t border-border bg-surface shrink-0">
        {isStale(deal) && <div className="text-center text-[10px] text-warn bg-warn/10 border border-warn/20 rounded-lg py-1.5 mb-3">This listing may no longer be available</div>}
        <a href={deal.url} target="_blank" rel="noopener noreferrer" className="w-full bg-brand hover:bg-brand/90 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] hover:-translate-y-0.5">
          <I.ExtLink c="w-5 h-5" />SNAG ON EBAY &rarr;
        </a>
        <div className="text-center text-[10px] text-muted mt-2">{deal.seller} &middot; {deal.fb.toLocaleString()} feedback &middot; Enter &#8629; to open</div>
      </div>
    </div>
  );
}
