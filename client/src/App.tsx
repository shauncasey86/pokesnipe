import { useState, useEffect, useMemo, useRef, useCallback, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { I } from './icons';
import {
  CONF_WEIGHTS, LIQ_WEIGHTS_V, LIQ_WEIGHTS_NV,
  timeAgo, fmtListedTime, trendInfo,
} from './data/mock';
import { Ring, Tier, SideItem, Stat, EmptyFeed, SignalGrid } from './components/shared';
import SystemView from './components/SystemView';
import AuditView from './components/AuditView';
import LookupView from './components/LookupView';
import SettingsView from './components/SettingsView';
import { getDeals, getDealDetail, reviewDeal, getStatus, toggleScanner, checkAuth, login, logout, deleteAllDeals, searchCards } from './api/deals';
import type { CardSearchResult } from './api/deals';
import type { Deal, DealDetail as DealDetailType, SystemStatus } from './types/deals';

type ViewName = 'opportunities' | 'system' | 'audit' | 'lookup' | 'settings';
type TierFilter = Record<string, boolean>;

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const [activeView, setActiveView] = useState<ViewName>('opportunities');
  const [tierFilter, setTierFilter] = useState<TierFilter>({ GRAIL: true, HIT: true, FLIP: true, SLEEP: false });
  const [searchQ, setSearchQ] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Check auth on mount
  useEffect(() => {
    checkAuth().then(ok => setAuthed(ok));
  }, []);

  // Listen for 401s and redirect to login
  useEffect(() => {
    const handler = () => setAuthed(false);
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  const handleLogin = async (password: string) => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      await login(password);
      setAuthed(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setAuthed(false);
    setDeals([]);
    setStatus(null);
  };

  const [scannerToggling, setScannerToggling] = useState(false);
  const handleToggleScanner = async () => {
    if (!status || scannerToggling) return;
    const action = status.scanner.status === 'paused' ? 'start' : 'stop';
    setScannerToggling(true);
    try {
      await toggleScanner(action);
      const s = await getStatus();
      setStatus(s);
    } catch { /* ignore */ }
    setScannerToggling(false);
  };

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const handleDeleteAll = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleteLoading(true);
    try {
      await deleteAllDeals();
      setDeals([]);
      setSelId(null);
      setDeleteConfirm(false);
    } catch { /* ignore */ }
    setDeleteLoading(false);
  };

  // Fetch deals
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    async function load() {
      try {
        setDealsLoading(true);
        const res = await getDeals({ limit: 100, status: 'active' });
        if (!cancelled) {
          setDeals(res.data);
          if (res.data.length > 0) setSelId(prev => prev ?? res.data[0].deal_id);
          setDealsError(null);
        }
      } catch (err) {
        if (!cancelled) setDealsError(err instanceof Error ? err.message : 'Failed to load deals');
      } finally {
        if (!cancelled) setDealsLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [authed]);

  // Fetch system status
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    async function load() {
      try {
        const s = await getStatus();
        if (!cancelled) setStatus(s);
      } catch {
        // non-critical, silently retry
      }
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [authed]);

  // SSE for real-time deal updates
  useEffect(() => {
    if (!authed) return;
    const es = new EventSource('/api/deals/stream', { withCredentials: true });
    es.addEventListener('deal', (e) => {
      try {
        const newDeal = JSON.parse(e.data) as Deal;
        setDeals(prev => {
          const exists = prev.some(d => d.deal_id === newDeal.deal_id);
          if (exists) return prev.map(d => d.deal_id === newDeal.deal_id ? newDeal : d);
          return [newDeal, ...prev];
        });
      } catch { /* ignore parse errors */ }
    });
    es.onerror = () => { /* EventSource auto-reconnects */ };
    return () => es.close();
  }, [authed]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    let r = deals.filter(d => tierFilter[d.tier]);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      r = r.filter(d =>
        (d.cardName || d.ebay_title || '').toLowerCase().includes(q) ||
        (d.expansion_name || '').toLowerCase().includes(q) ||
        (d.card_number || '').includes(q)
      );
    }
    return r;
  }, [deals, tierFilter, searchQ]);

  const selectedDeal = useMemo(() => deals.find(d => d.deal_id === selId) ?? null, [deals, selId]);

  const grails = deals.filter(d => d.tier === 'GRAIL').length;
  const hits = deals.filter(d => d.tier === 'HIT').length;

  const handleListKey = useCallback((e: React.KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
    e.preventDefault();
    const idx = filtered.findIndex(d => d.deal_id === selId);
    if (e.key === 'ArrowDown' && idx < filtered.length - 1) {
      setSelId(filtered[idx + 1].deal_id);
      listRef.current?.children[idx + 1]?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'ArrowUp' && idx > 0) {
      setSelId(filtered[idx - 1].deal_id);
      listRef.current?.children[idx - 1]?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter' && selectedDeal) window.open(selectedDeal.ebay_url, '_blank');
  }, [filtered, selId, selectedDeal]);

  const isStale = useCallback((d: Deal) => d.status === 'expired' || d.status === 'sold' || (Date.now() - new Date(d.created_at).getTime() > 60 * 60000), []);

  // Header stats from status API
  const dealsToday = status?.scanner.dealsToday ?? deals.length;
  const accuracy = status?.accuracy.rolling7d != null ? (status.accuracy.rolling7d * 100).toFixed(1) + '%' : '\u2014';

  // Auth checking / login screen
  if (authed === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-obsidian">
        <div className="text-center">
          <I.Loader s={32} c="text-brand mx-auto mb-3" />
          <p className="text-sm text-muted">Checking authentication&hellip;</p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen onLogin={handleLogin} error={loginError} loading={loginLoading} />;
  }

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
            <Stat label="Today" value={dealsToday} />
            <Stat label="Grails" value={status?.scanner.grailsToday ?? grails} />
            <Stat label="Hits" value={hits} />
            <Stat label="Accuracy" value={accuracy} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleToggleScanner}
            disabled={scannerToggling || !status}
            title={status?.scanner.status === 'paused' ? 'Click to resume scanner' : 'Click to pause scanner'}
            className={'flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-all hover:opacity-80 disabled:opacity-50 ' + (status?.scanner.isRunning !== false && status?.scanner.status !== 'paused' ? 'bg-profit/10 text-profit border-profit/20' : 'bg-warn/10 text-warn border-warn/20')}
          >
            <div className={'w-2 h-2 rounded-full ' + (status?.scanner.isRunning !== false && status?.scanner.status !== 'paused' ? 'bg-profit pulse-dot' : 'bg-warn')} />
            <span className="text-xs font-bold tracking-wide">{scannerToggling ? 'TOGGLING\u2026' : status?.scanner.status === 'paused' ? 'PAUSED' : 'SCANNING'}</span>
          </button>
          <div className="text-xs font-mono text-muted">{time}</div>
          <div className="w-px h-6 bg-border mx-2" />
          <button className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-surfaceHover transition-colors" title="Notifications">
            <I.Bell c="text-muted w-4 h-4" />
          </button>
          <button onClick={handleLogout} className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-risk/20 hover:border-risk/30 transition-colors" title="Logout">
            <I.X c="text-muted w-4 h-4" />
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
                <span className="text-xl font-mono font-bold text-white">{status ? status.ebay.callsToday.toLocaleString() : '\u2014'}</span>
                <span className="text-[10px] font-mono text-muted">/ {status ? status.ebay.dailyLimit.toLocaleString() : '\u2014'}</span>
              </div>
              <div className="w-full bg-obsidian rounded-full h-1.5 mb-2 overflow-hidden">
                <div className={'h-1.5 rounded-full ' + (status && status.ebay.status === 'low' ? 'bg-warn' : 'bg-profit')} style={{ width: status ? `${(status.ebay.callsToday / status.ebay.dailyLimit * 100).toFixed(0)}%` : '0%' }} />
              </div>
              <p className="text-[10px] text-muted">{status ? `${status.ebay.remaining.toLocaleString()} remaining` : 'Loading\u2026'}</p>
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
                  <button
                    onClick={handleDeleteAll}
                    onBlur={() => setDeleteConfirm(false)}
                    disabled={deleteLoading || deals.length === 0}
                    className={'px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all disabled:opacity-30 ' + (deleteConfirm ? 'bg-risk/20 border-risk/40 text-risk' : 'bg-surface border-border text-muted hover:text-risk hover:border-risk/30')}
                  >
                    {deleteLoading ? 'Deleting\u2026' : deleteConfirm ? 'Confirm Delete All' : 'Delete All'}
                  </button>
                </div>
              </div>

              {dealsLoading && deals.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <I.Loader s={32} c="text-brand mx-auto mb-3" />
                    <p className="text-sm text-muted">Loading deals&hellip;</p>
                  </div>
                </div>
              ) : dealsError && deals.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-xs">
                    <I.AlertTriangle s={32} c="text-risk mx-auto mb-3" />
                    <h3 className="text-base font-bold text-white mb-1">Failed to load</h3>
                    <p className="text-xs text-muted">{dealsError}</p>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <EmptyFeed hasFilter={!!searchQ || Object.values(tierFilter).some(v => !v)} />
              ) : (
                <div className="flex-1 overflow-y-auto p-2 space-y-1 relative" ref={listRef} onKeyDown={handleListKey} tabIndex={0} role="listbox" aria-label="Deal feed">
                  {filtered.map(d => {
                    const t7 = trendInfo(d.trend_7d);
                    const stale = isStale(d);
                    const reviewed = d.is_correct_match;
                    return (
                      <div
                        key={d.deal_id}
                        role="option"
                        aria-selected={selId === d.deal_id}
                        tabIndex={-1}
                        onClick={() => setSelId(d.deal_id)}
                        className={
                          'deal-row group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ' +
                          (selId === d.deal_id ? 'bg-surface border-brand/50 shadow-[0_0_20px_rgba(99,102,241,0.05)]' : 'bg-surface/30 border-transparent hover:bg-surface hover:border-border') + ' ' +
                          (d.tier === 'GRAIL' && !stale ? 'border-l-[3px] border-l-grail bg-linear-to-r from-grail/[.03] to-transparent' : '') + ' ' +
                          (stale ? 'deal-stale' : '')
                        }
                      >
                        {/* Thumbnail */}
                        <div className="w-14 h-[78px] rounded-md bg-obsidian overflow-hidden shrink-0 border border-white/5 shadow-md relative">
                          {d.ebay_image_url ? (
                            <img src={d.ebay_image_url} alt={d.cardName || d.ebay_title} className="h-full w-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center"><I.Search s={16} c="text-muted/30" /></div>
                          )}
                          {d.expansion_logo && <img src={d.expansion_logo} alt="" className="absolute top-0.5 right-0.5 w-3.5 h-3.5 opacity-60" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                        </div>
                        <Ring v={Math.round((d.confidence ?? 0) * 100)} tier={d.confidence_tier ?? 'low'} />
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <Tier t={d.tier} />
                            <span className="font-bold text-white text-sm truncate">{d.cardName || d.ebay_title}</span>
                            {reviewed != null && <span className={'text-[8px] font-bold px-1 rounded ' + (reviewed ? 'bg-profit/10 text-profit' : 'bg-risk/10 text-risk')}>{reviewed ? '\u2713' : '\u2717'}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted truncate">
                            <span>{d.expansion_name || 'Unknown set'}</span><span className="text-border">&middot;</span><span className="font-mono text-[10px]">{d.card_number || '?'}</span>
                            {d.is_graded && <><span className="text-border">&middot;</span><span className="text-info font-semibold">{d.grading_company} {d.grade}</span></>}
                            <span className="text-border">&middot;</span><span className="text-[10px] font-semibold text-white/70">{d.condition}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={'text-[9px] font-medium ' + t7.c}>{t7.t}</span>
                            <span className="text-[9px] text-muted/40 ml-auto shrink-0" title={fmtListedTime(d.created_at)}>{timeAgo(d.created_at)}</span>
                          </div>
                        </div>
                        {/* Pricing column */}
                        <div className="flex flex-col items-end shrink-0 pl-3 min-w-[86px]">
                          <span className={'text-lg font-bold font-mono leading-none ' + ((d.profit_gbp ?? 0) >= 0 ? 'text-profit' : 'text-risk')}>{(d.profit_gbp ?? 0) >= 0 ? '+' : ''}&pound;{(d.profit_gbp ?? 0).toFixed(2)}</span>
                          <span className={'text-[10px] font-mono mt-0.5 ' + ((d.profit_gbp ?? 0) >= 0 ? 'text-profit/60' : 'text-risk/60')}>{(d.profit_percent ?? 0) >= 0 ? '+' : ''}{(d.profit_percent ?? 0).toFixed(0)}% ROI</span>
                          <div className="text-[9px] font-mono text-muted/40 mt-1">&pound;{(d.total_cost_gbp ?? 0).toFixed(0)} &rarr; &pound;{(d.market_price_gbp ?? 0).toFixed(0)}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="sticky bottom-0 left-0 right-0 h-12 bg-linear-to-t from-obsidian to-transparent pointer-events-none" />
                </div>
              )}
            </div>

            {/* RIGHT: Deal Detail */}
            {selectedDeal && <DetailErrorBoundary key={selectedDeal.deal_id} onReset={() => setSelId(null)}><DealDetailPanel dealSummary={selectedDeal} onReviewDeal={(dealId, isCorrect) => {
                if (isCorrect) {
                  setDeals(prev => prev.map(d => d.deal_id === dealId ? { ...d, is_correct_match: true } : d));
                } else {
                  setDeals(prev => prev.filter(d => d.deal_id !== dealId));
                  setSelId(null);
                }
              }} /></DetailErrorBoundary>}
          </main>
        )}
      </div>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="h-10 border-t border-border bg-surface/80 flex items-center px-4 text-[10px] font-mono shrink-0 gap-6">
        <div className="flex items-center gap-2">
          <div className={'w-2 h-2 rounded-full ' + (status?.scanner.isRunning !== false ? 'bg-profit pulse-dot' : 'bg-warn')} />
          <span className="font-semibold text-white/80">{status?.scanner.status === 'paused' ? 'Paused' : 'Scanning'}</span>
          <span className="text-muted">{status?.scanner.lastRun ? timeAgo(status.scanner.lastRun) : ''}</span>
        </div>
        <div className="border-l border-border h-5" /><div className="flex items-center gap-1.5"><span className="text-muted">Deals</span><span className="text-white font-semibold">{filtered.length}/{deals.length}</span></div>
        <div className="border-l border-border h-5" /><div className="flex items-center gap-1.5"><span className="text-muted">Accuracy</span><span className="text-white font-semibold">{accuracy}</span></div>
        <div className="flex-1" />
        <div className="flex items-center gap-4 text-muted">
          <span>eBay <span className="text-white/70">{status ? `${status.ebay.callsToday.toLocaleString()}/${(status.ebay.dailyLimit / 1000).toFixed(0)}k` : '\u2014'}</span></span>
          {status?.scrydex && <span>Scrydex <span className="text-white/70">{(status.scrydex.creditsConsumed / 1000).toFixed(1)}k cr</span></span>}
          <span>FX <span className="text-white/70">{status?.exchangeRate.rate?.toFixed(3) ?? '\u2014'}</span></span>
        </div>
      </footer>
    </div>
  );
}

// ═══════════ ERROR BOUNDARY ═══════════
class DetailErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) { return { error: err.message }; }
  componentDidCatch(_: Error, info: ErrorInfo) { console.error('DealDetail crash:', info); }
  render() {
    if (this.state.error) {
      return (
        <div className="hidden lg:flex w-[45%] xl:w-[40%] bg-surface flex-col items-center justify-center">
          <I.AlertTriangle s={32} c="text-warn mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">Failed to render deal</h3>
          <p className="text-xs text-muted mb-3 max-w-xs text-center">{this.state.error}</p>
          <button onClick={() => { this.setState({ error: null }); this.props.onReset(); }} className="text-xs text-brand hover:underline">Select another deal</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═══════════ DEAL DETAIL PANEL ═══════════
function DealDetailPanel({ dealSummary, onReviewDeal }: { dealSummary: Deal; onReviewDeal: (dealId: string, isCorrect: boolean) => void }) {
  const [detail, setDetail] = useState<DealDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailScr, setDetailScr] = useState(false);
  const [costExpanded, setCostExpanded] = useState(false);
  const [confFlipped, setConfFlipped] = useState(false);
  const [liqFlipped, setLiqFlipped] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const [pendingReason, setPendingReason] = useState<string | null>(null);
  const [cardSearchQuery, setCardSearchQuery] = useState('');
  const [cardSearchResults, setCardSearchResults] = useState<CardSearchResult[]>([]);
  const [cardSearchLoading, setCardSearchLoading] = useState(false);
  const [selectedCorrectCard, setSelectedCorrectCard] = useState<CardSearchResult | null>(null);
  const cardSearchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    let cancelled = false;
    getDealDetail(dealSummary.deal_id).then(d => {
      if (!cancelled) { setDetail(d); setLoading(false); }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [dealSummary.deal_id]);

  const d = detail ?? dealSummary;

  const handleReview = async (isCorrect: boolean, reason?: string, correctCardId?: string) => {
    setReviewLoading(true);
    try {
      await reviewDeal(dealSummary.deal_id, isCorrect, reason, correctCardId);
      if (detail) {
        setDetail({ ...detail, is_correct_match: isCorrect, reviewed_at: new Date().toISOString(), incorrect_reason: reason || null });
      }
      onReviewDeal(dealSummary.deal_id, isCorrect);
      setShowReasonPicker(false);
      setPendingReason(null);
      setSelectedCorrectCard(null);
      setCardSearchQuery('');
      setCardSearchResults([]);
    } catch { /* ignore */ }
    setReviewLoading(false);
  };

  const handleCardSearch = (query: string) => {
    setCardSearchQuery(query);
    if (cardSearchTimer.current) clearTimeout(cardSearchTimer.current);
    if (query.trim().length < 2) { setCardSearchResults([]); return; }
    setCardSearchLoading(true);
    cardSearchTimer.current = setTimeout(async () => {
      try {
        const res = await searchCards(query.trim(), 8);
        setCardSearchResults(res.data);
      } catch { setCardSearchResults([]); }
      setCardSearchLoading(false);
    }, 300);
  };

  const cardImg = detail?.card_image_url ?? null;
  const ebayImg = d.ebay_image_url;
  const displayImg = detailScr && cardImg ? cardImg : ebayImg;
  const canFlipImg = !!cardImg && !!ebayImg;
  const [mountTime] = useState(Date.now);
  const stale = d.status === 'expired' || d.status === 'sold' || (mountTime - new Date(d.created_at).getTime() > 60 * 60000);
  const rv = d.is_correct_match;

  // Signals from detail
  const confSignals = detail?.match_signals?.confidence ?? null;
  const liqSignals = detail?.match_signals?.liquidity ?? null;

  // Condition comps — prefer deal's condition_comps (GBP-converted), fall back to variant_prices (USD)
  const condComps = detail?.condition_comps;
  const rawComps = detail?.variant_prices;
  const compsGBP: Record<string, { market: number; low: number }> | null =
    condComps ? Object.fromEntries(
      Object.entries(condComps).map(([k, v]) => [k, { market: v.marketGBP, low: v.lowGBP }])
    ) : rawComps ?? null;

  // Trends from variant_trends
  const variantTrends = detail?.variant_trends ?? null;
  const trendWindows = ['7d', '30d', '90d'] as const;

  return (
    <div className="hidden lg:flex w-[45%] xl:w-[40%] bg-surface flex-col shadow-[-20px_0_40px_rgba(0,0,0,.3)] z-10">
      <div className="p-6 border-b border-border flex gap-6 items-start shrink-0 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand rounded-full blur-[100px] opacity-10 pointer-events-none" />
        <div
          className="w-28 h-40 rounded-xl overflow-hidden shadow-2xl shrink-0 border border-white/10 bg-obsidian relative image-glow"
          onClick={() => { if (canFlipImg) setDetailScr(p => !p); }}
          style={{ cursor: canFlipImg ? 'pointer' : 'default' }}
        >
          {displayImg ? (
            <img src={displayImg} alt={d.cardName || d.ebay_title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><I.Search s={24} c="text-muted/30" /></div>
          )}
          <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/10 to-transparent opacity-50 mix-blend-overlay" />
          {canFlipImg && <div className={'absolute bottom-1 left-1 text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ' + (detailScr ? 'bg-brand/90 text-white' : 'bg-white/80 text-obsidian')}>{detailScr ? 'Scrydex' : 'eBay'}</div>}
        </div>
        <div className="flex-1 min-w-0 pt-2">
          <div className="flex flex-wrap gap-2 mb-3">
            <Tier t={d.tier} />
            <span className="text-[10px] font-mono text-muted bg-surfaceHover px-2 py-0.5 rounded border border-border">{d.condition}{d.is_graded ? ' \u00b7 ' + d.grading_company + ' ' + d.grade : ''}</span>
          </div>
          <h2 className="text-2xl font-bold text-white leading-tight mb-1">{d.cardName || d.ebay_title}</h2>
          <p className="text-sm text-muted font-mono mb-3">{d.card_number ?? '?'}{detail?.variant_name ? ' \u00b7 ' + detail.variant_name : ''}</p>
          {detail?.expansion_name && (
            <div className="flex items-center gap-2.5 mb-3 bg-obsidian rounded-lg px-3 py-2 border border-border/50">
              {detail.expansion_logo && <img src={detail.expansion_logo} alt={detail.expansion_name} className="w-5 h-5 object-contain shrink-0 opacity-80" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-white truncate">{detail.expansion_name}</div>
                <div className="text-[9px] text-muted font-mono truncate">{detail.expansion_series}{detail.expansion_card_count ? ' \u00b7 ' + detail.expansion_card_count + ' cards' : ''}{detail.expansion_release_date ? ' \u00b7 ' + new Date(detail.expansion_release_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''}</div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-4 text-sm">
            {d.seller_name && <div className="flex items-center gap-1.5 text-muted"><I.User s={16} c="w-4 h-4" />{d.seller_name} {d.seller_feedback != null && <span className="text-white">({d.seller_feedback.toLocaleString()})</span>}</div>}
            <div className="flex items-center gap-1.5 text-muted"><I.Clock s={16} c="w-4 h-4" /><span title={fmtListedTime(d.created_at)}>{timeAgo(d.created_at)}</span></div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {loading && <div className="text-center py-4"><I.Loader s={20} c="text-brand mx-auto" /><p className="text-xs text-muted mt-2">Loading details&hellip;</p></div>}

        {/* Profit hero */}
        <div className="text-center py-3">
          <span className={'text-4xl font-mono font-bold ' + ((d.profit_gbp ?? 0) >= 0 ? 'text-profit' : 'text-risk')}>{(d.profit_gbp ?? 0) >= 0 ? '+' : ''}&pound;{(d.profit_gbp ?? 0).toFixed(2)}</span>
          <div className={'text-sm font-mono mt-1 ' + ((d.profit_gbp ?? 0) >= 0 ? 'text-profit/70' : 'text-risk/70')}>{(d.profit_percent ?? 0) >= 0 ? '+' : ''}{(d.profit_percent ?? 0).toFixed(1)}% return on &pound;{(d.total_cost_gbp ?? 0).toFixed(2)} cost</div>
        </div>

        {/* Collapsible pricing */}
        <div className="bg-obsidian border border-border rounded-xl relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand" />
          <button onClick={() => setCostExpanded(p => !p)} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/[.02] transition-colors">
            <div className="flex items-center gap-6 font-mono text-sm">
              <div><span className="text-[9px] font-sans text-muted uppercase tracking-wider block mb-0.5">Cost</span><span className="text-white font-bold">&pound;{(d.total_cost_gbp ?? 0).toFixed(2)}</span></div>
              <span className="text-muted/40">&rarr;</span>
              <div><span className="text-[9px] font-sans text-muted uppercase tracking-wider block mb-0.5">Market</span><span className="text-white font-bold">&pound;{(d.market_price_gbp ?? 0).toFixed(2)}</span></div>
              <span className="text-muted/40">=</span>
              <div><span className="text-[9px] font-sans text-muted uppercase tracking-wider block mb-0.5">Profit</span><span className="text-profit font-bold">+&pound;{(d.profit_gbp ?? 0).toFixed(2)}</span></div>
            </div>
            <I.ChevronDown s={16} c={'text-muted transition-transform ' + (costExpanded ? 'rotate-180' : '')} />
          </button>
          {costExpanded && (
            <div className="px-5 pb-4 space-y-2 font-mono text-sm border-t border-border/50 pt-3">
              <div className="flex justify-between text-white"><span className="text-muted font-sans text-xs">eBay Listing</span><span>&pound;{(d.ebay_price_gbp ?? 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-white"><span className="text-muted font-sans text-xs">Shipping</span><span>{(d.ebay_shipping_gbp ?? 0) > 0 ? '\u00a3' + (d.ebay_shipping_gbp ?? 0).toFixed(2) : 'Free'}</span></div>
              <div className="flex justify-between text-white"><span className="text-muted font-sans text-xs">Buyer Protection</span><span>&pound;{(d.buyer_prot_fee ?? 0).toFixed(2)}</span></div>
              <div className="w-full h-px bg-border/50" />
              <div className="flex justify-between text-[10px] text-muted"><span className="font-sans">FX Rate</span><span>USD/GBP {(d.exchange_rate ?? 0).toFixed(4)}</span></div>
            </div>
          )}
        </div>

        {/* Confidence + Liquidity side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-obsidian border border-border rounded-xl p-4 cursor-pointer transition-all hover:border-border/80" onClick={() => setConfFlipped(p => !p)}>
            {!confFlipped || !confSignals ? (
              <>
                <div className="flex items-center justify-between mb-3"><span className="text-[9px] font-bold text-muted uppercase tracking-wider">Confidence</span>{confSignals && <span className="text-[8px] text-muted/40">tap</span>}</div>
                <div className="flex items-center gap-3">
                  <Ring v={Math.round((d.confidence ?? 0) * 100)} tier={d.confidence_tier ?? 'low'} sz={44} />
                  <div><div className="text-xl font-mono font-bold text-white">{Math.round((d.confidence ?? 0) * 100)}%</div><div className="text-[10px] text-muted capitalize">{d.confidence_tier ?? '\u2014'}</div></div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1"><span className="text-[9px] font-bold text-muted uppercase tracking-wider">Signals</span><span className="text-[8px] font-mono text-muted/50">geo. mean</span></div>
                <SignalGrid signals={{
                  name: confSignals.name ?? 0,
                  denominator: confSignals.denom ?? 0,
                  number: confSignals.number ?? 0,
                  expansion: confSignals.expansion ?? 0,
                  variant: confSignals.variant ?? 0,
                  normalization: confSignals.extract ?? 0,
                }} weights={CONF_WEIGHTS} />
              </>
            )}
          </div>
          <div className="bg-obsidian border border-border rounded-xl p-4 cursor-pointer transition-all hover:border-border/80" onClick={() => setLiqFlipped(p => !p)}>
            {!liqFlipped || !liqSignals?.signals ? (
              <>
                <div className="flex items-center justify-between mb-3"><span className="text-[9px] font-bold text-muted uppercase tracking-wider">Liquidity</span>{liqSignals?.signals && <span className="text-[8px] text-muted/40">tap</span>}</div>
                <div className="flex items-center gap-3">
                  <Ring v={Math.round((d.liquidity_score ?? 0) * 100)} tier={d.liquidity_grade === 'high' ? 'high' : d.liquidity_grade === 'medium' ? 'medium' : 'low'} sz={44} />
                  <div><div className="text-xl font-mono font-bold text-white">{Math.round((d.liquidity_score ?? 0) * 100)}%</div><div className="text-[10px] text-muted capitalize">{d.liquidity_grade ?? '\u2014'}</div></div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1"><span className="text-[9px] font-bold text-muted uppercase tracking-wider">Signals</span><span className="text-[8px] font-mono text-muted/50">arith. mean</span></div>
                <SignalGrid signals={liqSignals.signals as Record<string, number>} weights={liqSignals.signals.velocity != null ? LIQ_WEIGHTS_V : LIQ_WEIGHTS_NV} />
              </>
            )}
          </div>
        </div>

        {/* Condition Comps */}
        {compsGBP && (
          <div className="bg-obsidian border border-border rounded-xl p-5">
            <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Condition Comps (Scrydex)</h3>
            <div className="grid grid-cols-4 gap-2">
              {(['NM', 'LP', 'MP', 'HP'] as const).map(c => {
                const cp = compsGBP[c];
                const ac = d.condition === c;
                return (
                  <div key={c} className={'rounded-lg p-3 text-center border ' + (ac ? 'bg-brand/10 border-brand/30' : 'bg-surface border-border')}>
                    <div className={'text-[10px] font-bold mb-1 ' + (ac ? 'text-brand' : 'text-muted')}>{c}</div>
                    {cp ? (
                      <><div className="text-sm font-mono font-bold text-white">&pound;{(cp.market ?? 0).toFixed(0)}</div><div className="text-[9px] font-mono text-muted">low &pound;{(cp.low ?? 0).toFixed(0)}</div></>
                    ) : (
                      <div className="text-[10px] text-muted/50">&mdash;</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Price Trend */}
        <div className="bg-obsidian border border-border rounded-xl p-5">
          <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Price Trend</h3>
          <div className="grid grid-cols-3 gap-2">
            {trendWindows.map(w => {
              const raw = w === '7d' ? d.trend_7d : w === '30d' ? d.trend_30d : (variantTrends && d.condition ? variantTrends[d.condition]?.['90d']?.percent_change : null) ?? null;
              const ti = trendInfo(raw);
              return (
                <div key={w} className="bg-surface rounded-lg p-3 text-center">
                  <div className="text-[10px] font-bold text-muted uppercase mb-1">{w}</div>
                  <div className={'text-sm font-mono font-bold ' + ti.c}>{raw != null ? (raw > 0 ? '+' : '') + raw.toFixed(1) + '%' : '\u2014'}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Match Review */}
        <div className={'bg-obsidian border rounded-xl p-4 ' + (rv === true ? 'border-profit/30' : rv === false ? 'border-risk/30' : 'border-border')}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider">Match Review</div>
              {rv != null ? (
                <div className={'text-[11px] mt-1 font-semibold ' + (rv ? 'text-profit' : 'text-risk')}>
                  Marked as {rv ? 'correct' : 'incorrect'}{d.incorrect_reason ? ` — ${({ wrong_card: 'Wrong card', wrong_set: 'Wrong set', wrong_condition: 'Wrong condition', wrong_variant: 'Wrong variant', wrong_price: 'Wrong price', bad_image: 'Bad image', junk_listing: 'Junk listing' } as Record<string, string>)[d.incorrect_reason] || d.incorrect_reason}` : ''}
                </div>
              ) : showReasonPicker ? (
                <div className="text-[11px] text-muted mt-1">What was wrong?</div>
              ) : (
                <div className="text-[11px] text-muted mt-1">Was this card match correct?</div>
              )}
            </div>
            {!showReasonPicker && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleReview(true)}
                  disabled={reviewLoading}
                  className={'p-2 rounded-lg border transition-all ' + (rv === true ? 'bg-profit/20 border-profit/40 text-profit' : 'border-border bg-surface hover:bg-profit/10 hover:border-profit/30 hover:text-profit text-muted')}
                  title="Correct match"
                >
                  {rv === true ? <I.Check s={16} c="w-4 h-4" /> : <I.Up s={16} c="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { if (rv == null) setShowReasonPicker(true); else handleReview(false); }}
                  disabled={reviewLoading}
                  className={'p-2 rounded-lg border transition-all ' + (rv === false ? 'bg-risk/20 border-risk/40 text-risk' : 'border-border bg-surface hover:bg-risk/10 hover:border-risk/30 hover:text-risk text-muted')}
                  title="Incorrect match"
                >
                  {rv === false ? <I.X s={16} c="w-4 h-4" /> : <I.Down s={16} c="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
          {showReasonPicker && rv == null && !pendingReason && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ['wrong_card', 'Wrong Card', 'Matched a completely different card'],
                  ['wrong_set', 'Wrong Set', 'Right card, wrong expansion'],
                  ['wrong_variant', 'Wrong Variant', 'Right card, wrong variant (holo/reverse/etc)'],
                  ['wrong_condition', 'Wrong Condition', 'Condition was misidentified'],
                  ['wrong_price', 'Wrong Price', 'Market price was inaccurate'],
                  ['bad_image', 'Bad Image', 'Image doesn\'t match listing'],
                ] as const).map(([value, label, desc]) => (
                  <button
                    key={value}
                    onClick={() => {
                      if (['wrong_card', 'wrong_set', 'wrong_variant'].includes(value)) {
                        setPendingReason(value);
                      } else {
                        handleReview(false, value);
                      }
                    }}
                    disabled={reviewLoading}
                    className="text-left p-2.5 rounded-lg border border-border bg-surface hover:bg-risk/10 hover:border-risk/30 transition-all group"
                  >
                    <div className="text-[11px] font-semibold text-white/80 group-hover:text-risk">{label}</div>
                    <div className="text-[9px] text-muted mt-0.5 leading-tight">{desc}</div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowReasonPicker(false)}
                className="w-full text-[10px] text-muted hover:text-white/60 py-1 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
          {pendingReason && rv == null && (
            <div className="mt-3 space-y-2">
              <div className="text-[10px] text-muted mb-1">Know the correct card? Search below, or skip to submit.</div>
              <div className="relative">
                <I.Search c="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input
                  type="text"
                  value={cardSearchQuery}
                  onChange={e => handleCardSearch(e.target.value)}
                  placeholder="Search card name or number..."
                  autoFocus
                  className="w-full bg-obsidian border border-border rounded-lg pl-8 pr-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-brand placeholder:text-muted/50"
                />
                {cardSearchLoading && <I.Loader s={14} c="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand" />}
              </div>
              {selectedCorrectCard && (
                <div className="flex items-center gap-2 p-2 rounded-lg border border-profit/30 bg-profit/5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-profit truncate">{selectedCorrectCard.name}</div>
                    <div className="text-[9px] text-muted font-mono">{selectedCorrectCard.number} &middot; {selectedCorrectCard.expansion_name}</div>
                  </div>
                  <button onClick={() => setSelectedCorrectCard(null)} className="text-muted hover:text-white shrink-0"><I.X s={14} c="w-3.5 h-3.5" /></button>
                </div>
              )}
              {!selectedCorrectCard && cardSearchResults.length > 0 && (
                <div className="max-h-36 overflow-y-auto space-y-0.5 border border-border rounded-lg">
                  {cardSearchResults.map(card => (
                    <button
                      key={card.scrydex_card_id}
                      onClick={() => { setSelectedCorrectCard(card); setCardSearchResults([]); setCardSearchQuery(''); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-surface/80 transition-colors flex items-center gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-white truncate">{card.name}</div>
                        <div className="text-[9px] text-muted font-mono">{card.number} &middot; {card.expansion_name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => handleReview(false, pendingReason, selectedCorrectCard?.scrydex_card_id)}
                  disabled={reviewLoading}
                  className="flex-1 py-2 text-[11px] font-semibold rounded-lg bg-risk/20 border border-risk/40 text-risk hover:bg-risk/30 transition-all disabled:opacity-50"
                >
                  {reviewLoading ? 'Submitting...' : selectedCorrectCard ? 'Submit with correction' : 'Submit without correction'}
                </button>
                <button
                  onClick={() => { setPendingReason(null); setSelectedCorrectCard(null); setCardSearchQuery(''); setCardSearchResults([]); }}
                  className="px-3 py-2 text-[10px] text-muted hover:text-white/60 border border-border rounded-lg transition-colors"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Report Junk — separate from match review */}
        {rv == null && !showReasonPicker && (
          <button
            onClick={() => handleReview(false, 'junk_listing')}
            disabled={reviewLoading}
            className="w-full flex items-center gap-2.5 p-3 rounded-xl border border-warn/20 bg-warn/5 hover:bg-warn/10 hover:border-warn/40 transition-all group disabled:opacity-50"
          >
            <I.ShieldOff s={14} c="text-warn shrink-0" />
            <div className="text-left flex-1">
              <div className="text-[11px] font-semibold text-warn/80 group-hover:text-warn">Report Junk</div>
              <div className="text-[9px] text-muted leading-tight">Fake, fan art, proxy, or not a real card</div>
            </div>
          </button>
        )}
        {d.incorrect_reason === 'junk_listing' && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl border border-warn/30 bg-warn/5">
            <I.ShieldOff s={14} c="text-warn shrink-0" />
            <div className="text-[11px] font-semibold text-warn">Reported as junk listing</div>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="p-6 border-t border-border bg-surface shrink-0">
        {stale && <div className="text-center text-[10px] text-warn bg-warn/10 border border-warn/20 rounded-lg py-1.5 mb-3">This listing may no longer be available</div>}
        <a href={d.ebay_url} target="_blank" rel="noopener noreferrer" className="w-full bg-brand hover:bg-brand/90 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] hover:-translate-y-0.5">
          <I.ExtLink c="w-5 h-5" />SNAG ON EBAY &rarr;
        </a>
        <div className="text-center text-[10px] text-muted mt-2">{d.seller_name}{d.seller_feedback != null ? ' \u00b7 ' + d.seller_feedback.toLocaleString() + ' feedback' : ''} &middot; Enter &#8629; to open</div>
      </div>
    </div>
  );
}

// ═══════════ LOGIN SCREEN ═══════════
function LoginScreen({ onLogin, error, loading }: { onLogin: (pw: string) => void; error: string | null; loading: boolean }) {
  const [pw, setPw] = useState('');
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.trim()) onLogin(pw);
  };
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-obsidian">
      <form onSubmit={handleSubmit} className="w-full max-w-sm mx-auto p-8">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-lg bg-linear-to-br from-brand to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.4)]">
            <I.Crosshair c="text-white w-6 h-6" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">
            Pok&eacute;Snipe <span className="text-brand font-mono text-xs ml-1 bg-brand/10 px-1.5 py-0.5 rounded">PRO</span>
          </span>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <div>
            <label htmlFor="password" className="text-xs font-bold text-muted uppercase tracking-wider block mb-2">Password</label>
            <input
              id="password"
              type="password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="Enter access password"
              autoFocus
              className="w-full bg-obsidian border border-border rounded-lg px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brand placeholder:text-muted/50"
            />
          </div>
          {error && <div className="text-xs text-risk bg-risk/10 border border-risk/20 rounded-lg px-3 py-2">{error}</div>}
          <button
            type="submit"
            disabled={loading || !pw.trim()}
            className="w-full bg-brand hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)]"
          >
            {loading ? 'Signing in\u2026' : 'Sign In'}
          </button>
        </div>
      </form>
    </div>
  );
}
