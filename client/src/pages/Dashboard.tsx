import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Rail from '../components/Rail';
import HeroDeal from '../components/HeroDeal';
import QueuePanel from '../components/QueuePanel';
import FilterPopover from '../components/FilterPopover';
import LookupModal from '../components/LookupModal';
import SettingsModal from '../components/SettingsModal';
import ToastContainer, { showToast } from '../components/ui/Toast';
import {
  getDeals,
  getDealDetail,
  getStatus,
  getPreferences,
  updatePreferences,
  toggleScanner,
  reviewDeal,
  fetchVelocity,
} from '../api/deals';
import type { Deal, DealDetail, SystemStatus, FilterState, Tier, Condition, LiquidityGrade } from '../types/deals';
import '../styles/dashboard-v3.css';

/* ─── Font injection ─── */

const FONT_LINK = document.querySelector('link[data-pokesnipe-fonts]');
if (!FONT_LINK) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap';
  link.setAttribute('data-pokesnipe-fonts', '1');
  document.head.appendChild(link);
}

/* ─── Constants ─── */

const DEFAULT_FILTERS: FilterState = {
  tiers: ['GRAIL', 'HIT', 'FLIP'],
  conditions: ['NM', 'LP', 'MP'],
  liquidityGrades: ['high', 'medium'],
  confidenceLevels: ['HI', 'MD'],
  timeWindow: '6H',
  minProfitPercent: 10,
  gradedOnly: false,
};

/* ─── Filter logic ─── */

function applyFilters(deals: Deal[], filters: FilterState): Deal[] {
  const now = Date.now();
  const timeMs: Record<string, number> = {
    '1H': 3600000,
    '6H': 21600000,
    '24H': 86400000,
    ALL: Infinity,
  };
  const windowMs = timeMs[filters.timeWindow] || Infinity;

  const hasTierFilter = filters.tiers.length > 0;
  const hasCondFilter = filters.conditions.length > 0;

  return deals.filter((d) => {
    if (hasTierFilter && !filters.tiers.includes(d.tier as Tier)) return false;
    if (hasCondFilter && !filters.conditions.includes(d.condition as Condition)) return false;
    if (
      d.liquidity_grade &&
      filters.liquidityGrades.length > 0 &&
      !filters.liquidityGrades.includes(d.liquidity_grade as LiquidityGrade)
    )
      return false;

    const conf = d.confidence ?? 0;
    const confLevel = conf >= 0.85 ? 'HI' : conf >= 0.65 ? 'MD' : 'LO';
    if (!filters.confidenceLevels.includes(confLevel) && confLevel !== 'LO') return false;

    if (windowMs < Infinity) {
      const age = now - new Date(d.created_at).getTime();
      if (age > windowMs) return false;
    }

    if ((d.profit_percent ?? 0) < filters.minProfitPercent) return false;
    if (filters.gradedOnly && !d.is_graded) return false;

    return true;
  });
}

/* ─── Sort logic ─── */

function sortDeals(deals: Deal[], sort: string): Deal[] {
  const sorted = [...deals];
  switch (sort) {
    case 'profit':
      return sorted.sort((a, b) => (b.profit_gbp ?? 0) - (a.profit_gbp ?? 0));
    case 'roi':
      return sorted.sort((a, b) => (b.profit_percent ?? 0) - (a.profit_percent ?? 0));
    case 'match':
      return sorted.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    case 'recent':
    default:
      return sorted.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }
}

/* ─── Search logic ─── */

function searchDeals(deals: Deal[], query: string): Deal[] {
  if (!query.trim()) return deals;
  const q = query.toLowerCase().trim();
  return deals.filter((d) => {
    const name = (d.cardName || d.ebay_title || '').toLowerCase();
    return name.includes(q);
  });
}

/* ─── SSE Banner (inline — lightweight) ─── */

function SSEBannerInline({
  state,
  onRetry,
}: {
  state: 'connected' | 'reconnecting' | 'lost' | 'restored';
  onRetry: () => void;
}) {
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    if (state === 'restored') {
      setShowRestored(true);
      const t = setTimeout(() => setShowRestored(false), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (state === 'connected' && !showRestored) return null;

  if (showRestored) {
    return (
      <div className="sse-banner sse-banner--restored">Connection restored</div>
    );
  }

  if (state === 'reconnecting') {
    return (
      <div className="sse-banner sse-banner--reconnecting">Reconnecting…</div>
    );
  }

  if (state === 'lost') {
    return (
      <div className="sse-banner sse-banner--lost">
        Connection lost
        <button className="sse-banner__retry" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  return null;
}

/* ─── Status Bar (inline — lightweight) ─── */

function StatusBar({
  status,
  isLive,
  sseState,
}: {
  status: SystemStatus | null;
  isLive: boolean;
  sseState: string;
}) {
  return (
    <div className="status-bar">
      <span
        className={`status-bar__dot ${isLive ? 'status-bar__dot--live' : 'status-bar__dot--paused'}`}
      />
      <span>{isLive ? 'Live' : 'Paused'}</span>
      <span className="status-bar__sep" />
      <span className="status-bar__item">
        <span className="status-bar__label">Deals today</span>
        <span className="status-bar__value">{status?.scanner?.dealsToday ?? 0}</span>
      </span>
      <span className="status-bar__sep" />
      <span className="status-bar__item">
        <span className="status-bar__label">eBay API</span>
        <span className="status-bar__value">
          {status?.ebay?.callsToday ?? 0}/{status?.ebay?.dailyLimit ?? '—'}
        </span>
      </span>
      <span className="status-bar__sep" />
      <span className="status-bar__item">
        <span className="status-bar__label">Cards indexed</span>
        <span className="status-bar__value">
          {status?.sync?.totalCards?.toLocaleString() ?? '—'}
        </span>
      </span>
      <span className="status-bar__sep" />
      <span className="status-bar__item">
        <span className="status-bar__label">SSE</span>
        <span className="status-bar__value">{sseState}</span>
      </span>
    </div>
  );
}

/* ─── Catalog Placeholder ─── */

function CatalogPlaceholder() {
  return (
    <div className="placeholder-page">
      <span className="placeholder-page__icon">📚</span>
      <p className="placeholder-page__text">
        Catalog — use <code>/catalog</code> route for full experience
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DASHBOARD COMPONENT
   ═══════════════════════════════════════════════ */

export default function Dashboard() {
  // ─── Core state ───
  const [deals, setDeals] = useState<Deal[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState('profit');
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState<SystemStatus | null>(null);

  // ─── Hero triage state ───
  const [curIdx, setCurIdx] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [snagged, setSnagged] = useState<Set<string>>(new Set());
  const [heroDetail, setHeroDetail] = useState<DealDetail | null>(null);
  const [reviewState, setReviewState] = useState<'none' | 'correct' | 'wrong'>('none');
  const [velocityLoading, setVelocityLoading] = useState(false);

  // ─── SSE ───
  const [sseState, setSseState] = useState<'connected' | 'reconnecting' | 'lost' | 'restored'>(
    'reconnecting',
  );
  const wasDisconnectedRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ─── UI state ───
  const [showLookup, setShowLookup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [scannerPaused, setScannerPaused] = useState(false);
  const [nav, setNav] = useState('dashboard');

  // ─── Load initial data ───
  useEffect(() => {
    getDeals({ limit: 50, sort: 'createdAt', order: 'desc' })
      .then((res) => setDeals(res.data))
      .catch(() => {});
    getStatus()
      .then((s) => {
        setStatus(s);
        setScannerPaused(s.scanner?.status === 'paused');
      })
      .catch(() => {});
    getPreferences()
      .then((p) => {
        if (p.data?.defaultFilters) {
          setFilters((prev) => ({ ...prev, ...(p.data.defaultFilters as Partial<FilterState>) }));
        }
      })
      .catch(() => {});
  }, []);

  // ─── SSE connection (unchanged logic) ───
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource('/api/deals/stream');
    eventSourceRef.current = es;

    es.addEventListener('open', () => {
      if (sseTimerRef.current) clearTimeout(sseTimerRef.current);
      if (wasDisconnectedRef.current) {
        setSseState('restored');
        setTimeout(() => setSseState('connected'), 3000);
      } else {
        setSseState('connected');
      }
      wasDisconnectedRef.current = false;
    });

    es.addEventListener('deal', (e: MessageEvent) => {
      try {
        const deal = JSON.parse(e.data) as Deal;
        setDeals((prev) => {
          if (prev.some((d) => d.deal_id === deal.deal_id)) return prev;
          return [deal, ...prev];
        });

        if (deal.tier === 'GRAIL') {
          showToast({
            id: deal.deal_id,
            tier: 'GRAIL',
            cardName: deal.cardName || deal.ebay_title,
            profit: `+£${(deal.profit_gbp ?? 0).toFixed(2)}`,
          });
        }
      } catch {
        /* silent */
      }
    });

    es.addEventListener('status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setStatus((prev) =>
          prev
            ? { ...prev, scanner: { ...prev.scanner, activeDeals: data.activeDeals } }
            : prev,
        );
      } catch {
        /* silent */
      }
    });

    es.addEventListener('error', () => {
      wasDisconnectedRef.current = true;
      setSseState('reconnecting');
      if (sseTimerRef.current) clearTimeout(sseTimerRef.current);
      sseTimerRef.current = setTimeout(() => {
        setSseState('lost');
      }, 30000);
    });

    return es;
  }, []);

  useEffect(() => {
    const es = connectSSE();
    return () => {
      es.close();
      if (sseTimerRef.current) clearTimeout(sseTimerRef.current);
    };
  }, [connectSSE]);

  // ─── Periodic status refresh ───
  useEffect(() => {
    const interval = setInterval(() => {
      getStatus()
        .then((s) => {
          setStatus(s);
          setScannerPaused(s.scanner?.status === 'paused');
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ─── Derived: filtered + sorted visible deals (excluding skipped/snagged) ───
  const visible = useMemo(() => {
    const filtered = applyFilters(deals, filters);
    const searched = searchDeals(filtered, searchQuery);
    const sorted = sortDeals(searched, sort);
    return sorted.filter((d) => !skipped.has(d.deal_id) && !snagged.has(d.deal_id));
  }, [deals, filters, sort, searchQuery, skipped, snagged]);

  // ─── Current hero deal ───
  const cur = visible[curIdx] || visible[0] || null;

  // ─── Fetch detail for current hero deal ───
  useEffect(() => {
    if (!cur) {
      setHeroDetail(null);
      return;
    }
    setReviewState('none');
    getDealDetail(cur.deal_id)
      .then((d) => setHeroDetail(d))
      .catch(() => setHeroDetail(null));
  }, [cur?.deal_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Summary stats ───
  const stats = useMemo(() => {
    const totalProfit = visible.reduce((sum, d) => sum + (d.profit_gbp ?? 0), 0);
    return {
      count: visible.length,
      snagged: snagged.size,
      potential: Math.round(totalProfit * 100) / 100,
    };
  }, [visible, snagged]);

  const snagTotal = useMemo(
    () =>
      deals
        .filter((d) => snagged.has(d.deal_id))
        .reduce((s, d) => s + (d.profit_gbp ?? 0), 0),
    [deals, snagged],
  );

  // ─── Session stats for Queue panel ───
  const sessionStats = useMemo(
    () => ({
      scanned: status?.ebay?.callsToday ?? 0,
      dealsFound: deals.length,
      totalProfit: deals.reduce((sum, d) => sum + (d.profit_gbp ?? 0), 0),
      snagged: snagged.size,
      skipped: skipped.size,
      snagTotal,
    }),
    [status, deals, snagged, skipped, snagTotal],
  );

  // ─── Handlers ───
  const doSnag = useCallback(() => {
    if (cur) {
      setSnagged((p) => new Set(p).add(cur.deal_id));
      setCurIdx(0);
    }
  }, [cur]);

  const doSkip = useCallback(() => {
    if (cur) {
      setSkipped((p) => new Set(p).add(cur.deal_id));
      setCurIdx(0);
    }
  }, [cur]);

  const handleReview = useCallback(
    async (correct: boolean) => {
      if (!cur) return;
      setReviewState(correct ? 'correct' : 'wrong');
      try {
        await reviewDeal(cur.deal_id, correct);
      } catch {
        /* silent */
      }
    },
    [cur],
  );

  const handleFetchVelocity = useCallback(async () => {
    if (!cur) return;
    setVelocityLoading(true);
    try {
      await fetchVelocity(cur.deal_id);
      // Refetch detail to get updated liquidity data
      const d = await getDealDetail(cur.deal_id);
      setHeroDetail(d);
    } catch {
      /* silent */
    } finally {
      setVelocityLoading(false);
    }
  }, [cur]);

  const handleSaveFilters = async () => {
    try {
      await updatePreferences({ defaultFilters: filters });
    } catch {
      /* silent */
    }
  };

  const handleToggleScanner = async () => {
    const action = scannerPaused ? 'start' : 'stop';
    setScannerPaused(!scannerPaused);
    try {
      await toggleScanner(action);
    } catch {
      setScannerPaused(scannerPaused);
    }
  };

  const handleRetrySSE = () => {
    connectSSE();
  };

  const handleNav = (id: string) => {
    if (id === 'settings') {
      setShowSettings(true);
      return;
    }
    setNav(id);
  };

  const handleSelectQueueDeal = (dealId: string) => {
    const idx = visible.findIndex((d) => d.deal_id === dealId);
    if (idx >= 0) setCurIdx(idx);
  };

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    if (nav !== 'dashboard') return;
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === 's' || e.key === 'ArrowRight') {
        e.preventDefault();
        doSnag();
      }
      if (e.key === 'x' || e.key === 'ArrowLeft') {
        e.preventDefault();
        doSkip();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCurIdx((i) => Math.min(i + 1, visible.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCurIdx((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doSnag, doSkip, visible.length, nav]);

  // Close filter popover on outside click
  useEffect(() => {
    if (!showFilters) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.fpop') && !target.closest('.tb')) {
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilters]);

  const isLive = sseState === 'connected' && !scannerPaused;
  const isDashboard = nav === 'dashboard';
  const hasActiveFilters =
    filters.tiers.length !== DEFAULT_FILTERS.tiers.length ||
    filters.conditions.length !== DEFAULT_FILTERS.conditions.length ||
    filters.timeWindow !== DEFAULT_FILTERS.timeWindow;

  return (
    <>
      <div className={`shell ${isDashboard ? '' : 'shell--wide'}`}>
        {/* ═══ RAIL ═══ */}
        <Rail
          active={nav}
          onNav={handleNav}
          isPaused={scannerPaused}
          onPause={handleToggleScanner}
        />

        {/* ═══ CATALOG (or other nav) ═══ */}
        {nav === 'catalog' && <CatalogPlaceholder />}
        {nav === 'alerts' && (
          <div className="placeholder-page">
            <span className="placeholder-page__icon">🔔</span>
            <p className="placeholder-page__text">Alerts — coming soon</p>
          </div>
        )}

        {/* ═══ DASHBOARD CENTER ═══ */}
        {isDashboard && (
          <>
            <div className="center">
              {/* Header */}
              <header className="center__hdr">
                <h1 className="center__title">Deals</h1>
                <div className="center__stats">
                  <div className="cs">
                    <span className="cs__l">Queue</span>
                    <span className="cs__v">{stats.count}</span>
                  </div>
                  <div className="cs">
                    <span className="cs__l">Snagged</span>
                    <span className="cs__v cs__v--g">{stats.snagged}</span>
                  </div>
                  <div className="cs">
                    <span className="cs__l">Potential</span>
                    <span className="cs__v cs__v--g">£{stats.potential.toFixed(0)}</span>
                  </div>
                </div>
              </header>

              {/* Toolbar */}
              <div className="center__toolbar">
                <div style={{ position: 'relative' }}>
                  <button
                    className={`tb ${showFilters ? 'tb--on' : ''}`}
                    onClick={() => setShowFilters((f) => !f)}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M1 3h12M3 7h8M5 11h4"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                      />
                    </svg>
                    Filter
                    {hasActiveFilters && <span className="tb__dot" />}
                  </button>
                  <FilterPopover
                    show={showFilters}
                    filters={filters}
                    onChange={setFilters}
                    onSave={handleSaveFilters}
                  />
                </div>
                <button
                  className="tb"
                  onClick={() => setShowLookup(true)}
                  title="Manual eBay lookup"
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <circle
                      cx="6"
                      cy="6"
                      r="4.5"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d="M9.5 9.5L13 13"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                  Lookup
                </button>
                <div className="sort-m">
                  <label htmlFor="ss">Sort</label>
                  <select
                    id="ss"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="profit">Profit</option>
                    <option value="roi">ROI</option>
                    <option value="match">Match</option>
                    <option value="recent">Recent</option>
                  </select>
                </div>
              </div>

              {/* Keyboard hints */}
              <div className="kbd-bar" aria-hidden="true">
                <span className="kh">
                  <span className="kk">S</span> Snag
                </span>
                <span className="kh">
                  <span className="kk">X</span> Skip
                </span>
                <span className="kh">
                  <span className="kk">↑↓</span> Nav
                </span>
              </div>

              {/* SSE Banner */}
              <SSEBannerInline state={sseState} onRetry={handleRetrySSE} />

              {/* Hero scroll area */}
              <div className="hero-scroll">
                {cur ? (
                  <HeroDeal
                    key={cur.deal_id}
                    deal={cur}
                    detail={heroDetail}
                    onSnag={doSnag}
                    onSkip={doSkip}
                    onReview={handleReview}
                    reviewState={reviewState}
                    onFetchVelocity={handleFetchVelocity}
                    velocityLoading={velocityLoading}
                  />
                ) : (
                  <div className="hero-empty">
                    <span className="hero-empty__icon">✓</span>
                    <p className="hero-empty__text">Queue clear</p>
                    <p className="hero-empty__sub">
                      {snagged.size} snagged · {skipped.size} skipped
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ═══ QUEUE PANEL ═══ */}
            <QueuePanel
              deals={visible}
              currentDealId={cur?.deal_id ?? null}
              onSelectDeal={handleSelectQueueDeal}
              sessionStats={sessionStats}
            />
          </>
        )}

        {/* ═══ STATUS BAR (spans all columns) ═══ */}
        <StatusBar status={status} isLive={isLive} sseState={sseState} />
      </div>

      {/* ═══ MODALS ═══ */}
      {showLookup && <LookupModal onClose={() => setShowLookup(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <ToastContainer />
    </>
  );
}
