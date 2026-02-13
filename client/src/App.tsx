import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { I } from './icons';
import {
  getDeals, getDealDetail, toggleScanner, checkAuth, login, logout,
} from './api/deals';
import type { Deal, DealDetail, DealsResponse } from './types/deals';
import SystemView from './components/SystemView';
import AuditView from './components/AuditView';
import LookupView from './components/LookupView';
import SettingsView from './components/SettingsView';
import CatalogueView from './components/CatalogueView';

// ── Micro Components ─────────────────────────────────────────────

const NavButton = ({ icon: Ic, label, active, onClick }: {
  icon: (props: { s?: number; c?: string }) => React.JSX.Element;
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    title={label}
    className={`relative p-3 rounded-xl transition-all duration-300 group overflow-hidden w-full flex justify-center
      ${active ? 'bg-panel text-dexRed ring-1 ring-dexRed/20' : 'text-gray-500 hover:text-gray-300 hover:bg-panel'}
    `}
  >
    {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-dexRed" />}
    <Ic s={22} c="relative z-10" />
    <span className="sr-only">{label}</span>
  </button>
);

const TypeBadge = ({ type }: { type: string }) => {
  const colors: Record<string, string> = {
    GRAIL: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    HIT: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    FLIP: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    SLEEP: 'text-gray-400 bg-gray-700/20 border-gray-600/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider border uppercase ${colors[type] || colors.SLEEP}`}>
      {type}
    </span>
  );
};

const Sparkline = ({ val }: { val: number | null }) => {
  if (val == null) return null;
  const isPos = val >= 0;
  return (
    <div className="flex items-center gap-1">
      <svg width="40" height="12" viewBox="0 0 40 12" className="opacity-80">
        <path
          d={isPos ? 'M0 12 L10 8 L20 10 L40 0' : 'M0 0 L10 4 L20 2 L40 12'}
          fill="none"
          stroke={isPos ? '#10B981' : '#EF4444'}
          strokeWidth="1.5"
        />
      </svg>
      <span className={`text-[9px] font-mono ${isPos ? 'text-dexGreen' : 'text-dexRed'}`}>
        {val > 0 ? '+' : ''}{val.toFixed(1)}%
      </span>
    </div>
  );
};

// FlipCardImage
const FlipCardImage = ({ imageUrl, className = 'w-64' }: { imageUrl: string | null; className?: string }) => {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={`${className} perspective-1000 cursor-pointer shrink-0`} onClick={() => setFlipped(!flipped)}>
      <div className={`relative preserve-3d transition-transform duration-700 ${flipped ? 'rotate-y-180' : ''}`} style={{ aspectRatio: '2.5/3.5' }}>
        <div className="absolute inset-0 backface-hidden rounded-xl overflow-hidden shadow-2xl image-glow holo-card">
          {imageUrl ? (
            <img src={imageUrl} alt="Card" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-charcoal flex items-center justify-center">
              <I.Box s={48} c="text-gray-700" />
            </div>
          )}
        </div>
        <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-xl overflow-hidden bg-gradient-to-br from-dexRed via-red-800 to-red-950 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3 backdrop-blur">
              <div className="w-8 h-8 rounded-full bg-white/20" />
            </div>
            <div className="text-white/60 font-mono text-[10px] uppercase tracking-widest">PokéSnipe</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// SilphScope AI reasoning
const SilphScope = ({ reason }: { reason: string | null }) => {
  if (!reason) return null;
  return (
    <div className="col-span-1 bg-panel border border-dexBlue/20 p-5 rounded-xl relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-dexBlue/50 to-transparent" />
      <h3 className="text-gray-400 font-mono text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
        <I.Microscope s={14} c="text-dexBlue" /> Silph Scope
      </h3>
      <p className="text-sm text-gray-300 leading-relaxed font-light italic">&quot;{reason}&quot;</p>
    </div>
  );
};

// Recent Comps
const RecentComps = ({ comps }: { comps: Record<string, { lowGBP: number; marketGBP: number }> | null }) => {
  if (!comps || Object.keys(comps).length === 0) return null;
  return (
    <div className="col-span-1 bg-panel border border-border p-5 rounded-xl">
      <h3 className="text-gray-500 font-mono text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
        <I.TrendingUp s={14} c="text-dexGreen" /> Recent Comps
      </h3>
      <div className="space-y-2">
        {Object.entries(comps).map(([cond, prices]) => (
          <div key={cond} className="flex justify-between items-center text-sm font-mono">
            <span className="text-gray-400 text-xs">{cond}</span>
            <div className="flex gap-4">
              <span className="text-gray-500 text-xs">Low: <span className="text-white">&pound;{prices.lowGBP.toFixed(0)}</span></span>
              <span className="text-gray-500 text-xs">Mkt: <span className="text-dexGreen">&pound;{prices.marketGBP.toFixed(0)}</span></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Market range card
const MarketRange = ({ costGBP, marketGBP }: { costGBP: number; marketGBP: number }) => {
  const low = marketGBP * 0.6;
  const mn = Math.min(low, costGBP) * 0.9;
  const mx = Math.max(marketGBP, costGBP) * 1.1;
  const range = mx - mn;
  const getPos = (val: number) => Math.max(0, Math.min(100, ((val - mn) / range) * 100));

  return (
    <div className="col-span-1 bg-panel border border-border p-5 rounded-xl relative overflow-hidden">
      <h3 className="text-gray-500 font-mono text-xs uppercase tracking-widest mb-4">Market Range</h3>
      <div className="flex flex-col gap-6 justify-center">
        <div className="w-full h-8 relative mt-2 select-none">
          <div className="absolute top-3 left-0 right-0 h-1.5 bg-border rounded-full overflow-hidden">
            <div className="absolute top-0 bottom-0 bg-gray-700" style={{ left: `${getPos(low)}%`, width: `${getPos(marketGBP) - getPos(low)}%` }} />
          </div>
          <div className="absolute top-0 flex flex-col items-center" style={{ left: `${getPos(low)}%`, transform: 'translateX(-50%)' }}>
            <span className="w-0.5 h-3 bg-gray-500 mb-1" /><span className="text-[8px] text-gray-500 font-mono">LO</span>
          </div>
          <div className="absolute top-0 flex flex-col items-center" style={{ left: `${getPos(marketGBP)}%`, transform: 'translateX(-50%)' }}>
            <span className="w-0.5 h-3 bg-gray-500 mb-1" /><span className="text-[8px] text-gray-500 font-mono">MKT</span>
          </div>
          <div className="absolute top-[0.4rem] flex flex-col items-center z-10" style={{ left: `${getPos(costGBP)}%`, transform: 'translateX(-50%)' }}>
            <div className="w-2.5 h-2.5 rounded-full bg-dexGreen border border-black shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
          </div>
        </div>
        <div className="flex justify-between items-baseline border-t border-border pt-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-dexGreen" />
            <span className="text-[9px] text-gray-400 font-mono uppercase">Your Cost</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-500 font-mono uppercase mr-2">Market</span>
            <span className="text-xl font-mono font-bold text-white tabular-nums">&pound;{marketGBP.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Login Screen ─────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-obsidian bg-hex-pattern">
      <form onSubmit={handleSubmit} className="w-80 space-y-4">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-lg bg-dexRed text-black font-bold flex items-center justify-center text-2xl mx-auto mb-3 shadow-[0_0_20px_rgba(255,62,62,0.4)]">P</div>
          <h1 className="text-xl font-bold text-white font-sans">Pok&eacute;Snipe <span className="text-dexRed">Pro</span></h1>
          <p className="text-xs text-gray-500 font-mono mt-1">Silph Co. Terminal Access</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="ACCESS CODE"
          autoFocus
          className="w-full bg-charcoal border border-border rounded-lg px-4 py-3 text-center text-sm font-mono text-white tracking-[0.3em] focus:border-dexRed outline-none placeholder:text-gray-600"
        />
        {error && <p className="text-dexRed text-xs font-mono text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-dexRed text-black font-bold py-3 rounded-lg text-sm hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'AUTHENTICATING...' : 'AUTHENTICATE'}
        </button>
      </form>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────

type View = 'dashboard' | 'catalogue' | 'lookup' | 'audit' | 'system' | 'settings';

export default function App() {
  // Auth state
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    checkAuth().then(ok => setAuthed(ok));
    const handler = () => setAuthed(false);
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  const handleLogin = () => setAuthed(true);
  const handleLogout = async () => {
    await logout();
    setAuthed(false);
  };

  // View state
  const [view, setView] = useState<View>('dashboard');

  // Dashboard state
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DealDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('ALL');
  const [isScanning, setIsScanning] = useState(true);
  const [scannerToggling, setScannerToggling] = useState(false);

  // SSE ref
  const sseRef = useRef<EventSource | null>(null);

  // Load deals
  const loadDeals = useCallback(async () => {
    try {
      const params: Parameters<typeof getDeals>[0] = { limit: 50, sort: 'created_at', order: 'desc' };
      if (filterTier !== 'ALL') params.tier = filterTier;
      const res: DealsResponse = await getDeals(params);
      setDeals(res.data);
    } catch {
      // silent fail
    } finally {
      setDealsLoading(false);
    }
  }, [filterTier]);

  useEffect(() => {
    if (authed) {
      setDealsLoading(true);
      loadDeals();
    }
  }, [authed, loadDeals]);

  // SSE for real-time updates
  useEffect(() => {
    if (!authed) return;
    const es = new EventSource('/api/deals/stream');
    sseRef.current = es;
    es.addEventListener('deal', (ev) => {
      try {
        const deal: Deal = JSON.parse(ev.data);
        setDeals(prev => {
          const idx = prev.findIndex(d => d.deal_id === deal.deal_id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = deal;
            return updated;
          }
          return [deal, ...prev];
        });
      } catch {
        // ignore
      }
    });
    es.onerror = () => {
      es.close();
      setTimeout(() => {
        if (sseRef.current === es) {
          sseRef.current = new EventSource('/api/deals/stream');
        }
      }, 5000);
    };
    return () => es.close();
  }, [authed]);

  // Load deal detail
  useEffect(() => {
    if (!selectedId) { setSelectedDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    getDealDetail(selectedId).then(d => {
      if (!cancelled) { setSelectedDetail(d); setDetailLoading(false); }
    }).catch(() => {
      if (!cancelled) setDetailLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedId]);

  // Scanner toggle
  const handleScannerToggle = async () => {
    setScannerToggling(true);
    try {
      const action = isScanning ? 'stop' : 'start';
      await toggleScanner(action);
      setIsScanning(!isScanning);
    } catch {
      // ignore
    }
    setScannerToggling(false);
  };

  // Filtered deals (client-side search)
  const filteredDeals = useMemo(() => {
    if (!search.trim()) return deals;
    const q = search.toLowerCase();
    return deals.filter(d =>
      (d.cardName ?? d.ebay_title).toLowerCase().includes(q) ||
      (d.expansion_name ?? '').toLowerCase().includes(q)
    );
  }, [deals, search]);

  // Auth loading / login
  if (authed === null) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-obsidian">
        <I.Loader s={32} c="text-dexRed" />
      </div>
    );
  }
  if (!authed) return <LoginScreen onLogin={handleLogin} />;

  const sd = selectedDetail;

  return (
    <div className="flex w-full h-screen bg-obsidian bg-hex-pattern font-sans text-gray-200">
      {/* SIDEBAR */}
      <aside className="w-16 flex flex-col items-center py-6 border-r border-border bg-charcoal z-20 shrink-0">
        <div className="w-10 h-10 rounded-lg bg-dexRed text-black font-bold flex items-center justify-center text-xl mb-8 shadow-[0_0_15px_rgba(255,62,62,0.4)]">P</div>
        <div className="space-y-4 w-full px-2">
          <NavButton icon={I.Grid} label="Dashboard" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
          <NavButton icon={I.Book} label="Catalogue" active={view === 'catalogue'} onClick={() => setView('catalogue')} />
          <NavButton icon={I.Box} label="Manual" active={view === 'lookup'} onClick={() => setView('lookup')} />
          <NavButton icon={I.Terminal} label="Audit" active={view === 'audit'} onClick={() => setView('audit')} />
          <NavButton icon={I.Cpu} label="System" active={view === 'system'} onClick={() => setView('system')} />
          <NavButton icon={I.Sliders} label="Settings" active={view === 'settings'} onClick={() => setView('settings')} />
        </div>
        <div className="mt-auto space-y-3 flex flex-col items-center">
          <button onClick={handleLogout} title="Logout" className="text-gray-600 hover:text-dexRed transition-colors">
            <I.Power s={16} />
          </button>
          <div className="w-2 h-2 rounded-full bg-dexGreen animate-pulse" />
        </div>
      </aside>

      {/* CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden">
        {view === 'dashboard' ? (
          <>
            {/* DEAL LIST COLUMN */}
            <section className="w-[420px] flex flex-col border-r border-border bg-obsidian/95 backdrop-blur-sm z-10 shrink-0">
              <header className="h-20 px-6 border-b border-border flex justify-between items-center">
                <h1 className="text-xl font-bold tracking-tight text-white font-sans">
                  Pok&eacute;Snipe <span className="text-dexRed">v1.3.2</span>
                </h1>
                <button
                  onClick={handleScannerToggle}
                  disabled={scannerToggling}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-mono uppercase tracking-wider transition-all
                    ${isScanning
                      ? 'bg-dexGreen/10 border-dexGreen/30 text-dexGreen hover:bg-dexGreen/20'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}
                  `}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${isScanning ? 'bg-dexGreen animate-blink' : 'bg-gray-500'}`} />
                  {isScanning ? 'Scanner Active' : 'Scanner Paused'}
                  <I.Power s={10} c="ml-1" />
                </button>
              </header>

              <div className="p-4 space-y-3 border-b border-border bg-panel/30">
                <div className="relative">
                  <input
                    type="text"
                    className="w-full bg-charcoal border border-border text-xs font-mono p-2.5 pl-9 rounded outline-none focus:border-dexRed/50 focus:ring-1 focus:ring-dexRed/20 transition-all text-white placeholder-gray-600"
                    placeholder="SEARCH DATABASE..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"><I.Search s={14} /></div>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {['ALL', 'GRAIL', 'HIT', 'FLIP'].map(tier => (
                    <button
                      key={tier}
                      onClick={() => setFilterTier(tier)}
                      className={`px-3 py-1 text-[10px] font-mono font-bold border rounded transition-colors ${filterTier === tier ? 'bg-gray-200 text-black border-white' : 'bg-transparent text-gray-500 border-border hover:border-gray-600'}`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {dealsLoading && filteredDeals.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <I.Loader s={24} c="text-dexRed mx-auto mb-3" />
                      <p className="text-xs text-gray-500 font-mono">Loading deals...</p>
                    </div>
                  </div>
                ) : filteredDeals.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center max-w-xs px-4">
                      <I.Radar s={40} c="text-dexRed/30 mx-auto mb-3 scan-anim" />
                      <h3 className="text-base font-bold text-white mb-1">
                        {search || filterTier !== 'ALL' ? 'No matches' : 'Scanning eBay\u2026'}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {search || filterTier !== 'ALL'
                          ? 'Try broadening your search or enabling more tiers.'
                          : 'New deals will appear here as they\'re found.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  filteredDeals.map((deal, i) => {
                    const name = deal.cardName ?? deal.ebay_title;
                    const setName = deal.expansion_name ?? '';
                    const isSelected = selectedId === deal.deal_id;
                    const isStale = deal.status === 'expired' || deal.status === 'sold';
                    return (
                      <div
                        key={deal.deal_id}
                        onClick={() => setSelectedId(deal.deal_id)}
                        className={`group relative p-4 border-b border-border cursor-pointer hover:bg-panel transition-all animate-reveal ${isSelected ? 'bg-panel/80' : ''} ${isStale ? 'deal-stale' : ''}`}
                        style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
                      >
                        {isSelected && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-dexRed shadow-[0_0_10px_#ff3e3e]" />}
                        <div className="flex justify-between items-start mb-1">
                          <span className={`font-mono font-bold text-xs ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                            {name.length > 35 ? name.substring(0, 35) + '\u2026' : name}
                          </span>
                          <TypeBadge type={deal.tier} />
                        </div>
                        <div className="flex justify-between items-end">
                          <div className="space-y-1">
                            <div className="text-[10px] text-gray-500 font-mono">{setName}</div>
                            <Sparkline val={deal.trend_7d} />
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-mono font-bold text-white tracking-tight tabular-nums group-hover:text-dexGreen transition-colors">
                              &pound;{(deal.profit_gbp ?? 0).toFixed(0)}
                            </div>
                            <div className="text-[9px] font-mono text-gray-500">ROI {(deal.profit_percent ?? 0).toFixed(0)}%</div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* DETAIL VIEW */}
            <main className="flex-1 bg-charcoal/50 relative overflow-hidden flex flex-col">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-dexRed/5 rounded-full blur-[120px] pointer-events-none" />
              {detailLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <I.Loader s={32} c="text-dexRed" />
                </div>
              ) : sd ? (
                <div className="h-full flex flex-col overflow-y-auto">
                  {/* Header area */}
                  <div className="p-8 pb-4 flex gap-8 items-start border-b border-border/50">
                    <FlipCardImage imageUrl={sd.card_image_url || sd.ebay_image_url} className="w-64" />
                    <div className="flex-1 pt-2">
                      <h2 className="text-4xl font-bold text-white mb-2 font-sans tracking-tight">
                        {sd.card_name ?? sd.cardName ?? sd.ebay_title}
                      </h2>
                      <p className="text-xl text-gray-400 font-light mb-6">
                        {sd.expansion_name ?? ''} <span className="text-gray-600">|</span> {sd.variant_name ?? sd.condition}
                      </p>
                      <div className="grid grid-cols-4 gap-3">
                        <a
                          href={sd.ebay_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="col-span-2 bg-white text-black rounded font-bold font-mono text-sm hover:bg-gray-200 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 chamfer-r py-3"
                        >
                          SNAG DEAL <I.ArrowUpRight s={14} />
                        </a>
                        <button
                          onClick={() => setView('catalogue')}
                          className="col-span-2 bg-charcoal border border-border text-gray-300 rounded font-bold font-mono text-sm hover:bg-panel hover:text-white transition-all flex items-center justify-center gap-2 chamfer-r py-3"
                        >
                          VIEW IN CATALOGUE <I.Book s={14} />
                        </button>
                        <div className="col-span-1 px-2 py-3 border border-border rounded text-sm font-mono text-gray-400 flex flex-col items-center justify-center chamfer-r bg-panel/50">
                          <span className="text-[9px] uppercase tracking-wider text-gray-600 mb-0.5">Confidence</span>
                          <span className={`font-bold ${(sd.confidence ?? 0) > 0.8 ? 'text-dexGreen' : 'text-dexYellow'}`}>
                            {((sd.confidence ?? 0) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="col-span-1 px-2 py-3 border border-border rounded text-sm font-mono text-gray-400 flex flex-col items-center justify-center chamfer-r bg-panel/50">
                          <span className="text-[9px] uppercase tracking-wider text-gray-600 mb-0.5">Liquidity</span>
                          <span className={`font-bold ${(sd.liquidity_score ?? 0) > 0.7 ? 'text-dexBlue' : 'text-gray-400'}`}>
                            {((sd.liquidity_score ?? 0) * 100).toFixed(0)}/100
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cards Grid */}
                  <div className="p-8 grid grid-cols-3 gap-6">
                    {sd.match_signals?.confidence && (
                      <SilphScope reason={
                        (sd.profit_percent ?? 0) > 30
                          ? `High-value arbitrage. ${(sd.profit_percent ?? 0).toFixed(0)}% ROI with ${sd.liquidity_grade ?? 'unknown'} liquidity.${sd.trend_7d != null && sd.trend_7d > 0 ? ` Upward trend (${sd.trend_7d.toFixed(1)}% / 7d).` : ''} Safe acquire.`
                          : `Moderate opportunity at ${(sd.profit_percent ?? 0).toFixed(0)}% ROI. ${sd.condition ?? 'Unknown'} condition. Verify before purchase.`
                      } />
                    )}

                    {/* Net Profit */}
                    <div className="col-span-1 bg-panel border border-border p-5 rounded-xl chamfer-br relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                        <I.Zap s={64} />
                      </div>
                      <h3 className="text-gray-500 font-mono text-xs uppercase tracking-widest mb-1">Net Profit</h3>
                      <div className={`text-4xl font-mono font-bold tabular-nums mb-2 ${(sd.profit_gbp ?? 0) >= 0 ? 'text-dexGreen' : 'text-dexRed'}`}>
                        &pound;{(sd.profit_gbp ?? 0).toFixed(2)}
                      </div>
                      <div className="flex gap-4 text-xs font-mono text-gray-400">
                        <span>Cost: &pound;{sd.total_cost_gbp.toFixed(0)}</span>
                        <span>Val: &pound;{(sd.market_price_gbp ?? 0).toFixed(0)}</span>
                      </div>
                    </div>

                    <RecentComps comps={sd.condition_comps} />
                    <MarketRange costGBP={sd.total_cost_gbp} marketGBP={sd.market_price_gbp ?? 0} />

                    {/* Seller Info */}
                    <div className="col-span-3 bg-panel border border-border p-4 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center font-bold text-gray-500 text-xs shrink-0">
                          {(sd.seller_name ?? 'UK').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white leading-none mb-1">{sd.seller_name ?? 'Unknown'}</div>
                          <div className="text-[10px] text-gray-500 font-mono">
                            <span className="text-gray-400 mr-2">ID: {sd.ebay_item_id}</span>
                            {sd.seller_feedback != null && <>{sd.seller_feedback.toLocaleString()} FEEDBACK</>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-500 font-mono uppercase">Status</div>
                        <div className={`text-sm font-bold flex items-center gap-2 justify-end ${sd.status === 'active' ? 'text-dexGreen' : sd.status === 'expired' ? 'text-dexYellow' : 'text-gray-400'}`}>
                          {sd.status === 'active' && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-dexGreen opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-dexGreen" />
                            </span>
                          )}
                          {sd.status.toUpperCase()} LISTING
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                  <I.Grid s={48} c="mb-4 opacity-20" />
                  <p className="font-mono text-sm">SELECT DATA NODE</p>
                </div>
              )}
            </main>
          </>
        ) : (
          <main className="flex-1 bg-obsidian relative overflow-hidden flex flex-col">
            {view === 'system' && <SystemView />}
            {view === 'audit' && <AuditView />}
            {view === 'catalogue' && <CatalogueView />}
            {view === 'lookup' && <LookupView />}
            {view === 'settings' && <SettingsView />}
          </main>
        )}
      </div>
    </div>
  );
}
