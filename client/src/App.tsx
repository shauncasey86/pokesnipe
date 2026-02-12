import { useState, useEffect, useMemo, useRef, useCallback, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { I } from './icons';
import {
  timeAgo, fmtListedTime, trendInfo,
} from './data/mock';
import { Ring, Tier, SideItem, Stat, EmptyFeed } from './components/shared';
import SystemView from './components/SystemView';
import AuditView from './components/AuditView';
import LookupView from './components/LookupView';
import SettingsView from './components/SettingsView';
import { DetailPanel } from './components/detail/DetailPanel';
import { getDeals, getStatus, toggleScanner, checkAuth, login, logout, deleteAllDeals } from './api/deals';
import type { Deal, SystemStatus } from './types/deals';

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
  const [mobileDetailId, setMobileDetailId] = useState<string | null>(null);
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

  // Close mobile drawer on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileDetailId) setMobileDetailId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mobileDetailId]);

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
                        onClick={() => { setSelId(d.deal_id); setMobileDetailId(d.deal_id); }}
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

            {/* RIGHT: Deal Detail — Desktop inline */}
            {selectedDeal && (
              <DetailErrorBoundary key={selectedDeal.deal_id} onReset={() => setSelId(null)}>
                <DetailPanel
                  dealSummary={selectedDeal}
                  onReviewDeal={(dealId, isCorrect) => {
                    if (isCorrect) {
                      setDeals(prev => prev.map(d => d.deal_id === dealId ? { ...d, is_correct_match: true } : d));
                    } else {
                      setDeals(prev => prev.filter(d => d.deal_id !== dealId));
                      setSelId(null);
                    }
                  }}
                />
              </DetailErrorBoundary>
            )}

            {/* Mobile Deal Detail — Slide-over drawer */}
            {mobileDetailId && (() => {
              const mobileDeal = deals.find(d => d.deal_id === mobileDetailId);
              if (!mobileDeal) return null;
              return (
                <DetailPanel
                  key={mobileDeal.deal_id}
                  dealSummary={mobileDeal}
                  mobile
                  onClose={() => setMobileDetailId(null)}
                  onReviewDeal={(dealId, isCorrect) => {
                    if (isCorrect) {
                      setDeals(prev => prev.map(d => d.deal_id === dealId ? { ...d, is_correct_match: true } : d));
                    } else {
                      setDeals(prev => prev.filter(d => d.deal_id !== dealId));
                      setMobileDetailId(null);
                      setSelId(null);
                    }
                  }}
                />
              );
            })()}
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
