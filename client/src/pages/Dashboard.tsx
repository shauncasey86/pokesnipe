import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import SSEBanner from '../components/ui/SSEBanner';
import FilterBar from '../components/FilterBar';
import DealTable from '../components/DealTable';
import DealPanel from '../components/DealPanel';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import SystemStatusBar from '../components/SystemStatusBar';
import LookupModal from '../components/LookupModal';
import SettingsModal from '../components/SettingsModal';
import ToastContainer, { showToast } from '../components/ui/Toast';
import { getDeals, getStatus, getPreferences, updatePreferences, toggleScanner } from '../api/deals';
import type { Deal, SystemStatus, FilterState, Tier, Condition, LiquidityGrade } from '../types/deals';

/* ─── Font injection ─── */

const FONT_LINK = document.querySelector('link[data-pokesnipe-ibm]');
if (!FONT_LINK) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700;800&display=swap';
  link.setAttribute('data-pokesnipe-ibm', '1');
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

  // Empty tiers/conditions arrays mean "ALL"
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

    // Confidence filter
    const conf = d.confidence ?? 0;
    const confLevel = conf >= 0.85 ? 'HI' : conf >= 0.65 ? 'MD' : 'LO';
    if (!filters.confidenceLevels.includes(confLevel) && confLevel !== 'LO') return false;

    // Time filter
    if (windowMs < Infinity) {
      const age = now - new Date(d.created_at).getTime();
      if (age > windowMs) return false;
    }

    // Min profit
    if ((d.profit_percent ?? 0) < filters.minProfitPercent) return false;

    // Graded only
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
    case 'profitPct':
      return sorted.sort((a, b) => (b.profit_percent ?? 0) - (a.profit_percent ?? 0));
    case 'confidence':
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

/* ─── Dashboard Component ─── */

export default function Dashboard() {
  // Core state
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState<SystemStatus | null>(null);

  // SSE
  const [sseState, setSseState] = useState<'connected' | 'reconnecting' | 'lost' | 'restored'>(
    'reconnecting',
  );
  const wasDisconnectedRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // UI state
  const [showLookup, setShowLookup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newDealIds, setNewDealIds] = useState<Set<string>>(new Set());
  const [scannerPaused, setScannerPaused] = useState(false);
  const [activeView, setActiveView] = useState('dashboard');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 920);

  // Responsive
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 920);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Load initial data
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

  // SSE connection
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
        setNewDealIds((prev) => new Set(prev).add(deal.deal_id));
        setTimeout(() => {
          setNewDealIds((prev) => {
            const next = new Set(prev);
            next.delete(deal.deal_id);
            return next;
          });
        }, 1000);

        // Toast for GRAILs
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

  // Periodic status refresh
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

  // Derived data
  const filteredAndSorted = useMemo(() => {
    const filtered = applyFilters(deals, filters);
    const searched = searchDeals(filtered, searchQuery);
    return sortDeals(searched, sort);
  }, [deals, filters, sort, searchQuery]);

  // Summary stats for TopBar
  const stats = useMemo(() => {
    const totalProfit = filteredAndSorted.reduce((sum, d) => sum + (d.profit_gbp ?? 0), 0);
    const avgRoi =
      filteredAndSorted.length > 0
        ? filteredAndSorted.reduce((sum, d) => sum + (d.profit_percent ?? 0), 0) /
          filteredAndSorted.length
        : 0;
    return {
      count: filteredAndSorted.length,
      totalProfit: Math.round(totalProfit * 100) / 100,
      avgRoi: Math.round(avgRoi * 10) / 10,
    };
  }, [filteredAndSorted]);

  // Session stats for Sidebar
  const sessionStats = useMemo(
    () => ({
      scanned: status?.ebay?.callsToday ?? 0,
      dealsFound: status?.scanner?.dealsToday ?? 0,
      totalProfit: stats.totalProfit,
    }),
    [status, stats.totalProfit],
  );

  // Handlers
  const handleSaveFilters = async () => {
    try {
      await updatePreferences({ defaultFilters: filters });
    } catch {
      /* silent */
    }
  };

  const handleRetrySSE = () => {
    connectSSE();
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

  const isLive = sseState === 'connected' && !scannerPaused;

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1,
        background: 'linear-gradient(180deg, #08061a 0%, #0c0a1a 100%)',
        fontFamily: "'IBM Plex Sans', 'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* ═══ SIDEBAR ═══ */}
      {!isMobile && (
        <Sidebar
          activeView={activeView}
          onViewChange={setActiveView}
          sessionStats={sessionStats}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {/* TopBar */}
        <TopBar
          isLive={isLive}
          onToggleLive={handleToggleScanner}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          dealCount={stats.count}
          totalProfit={stats.totalProfit}
          avgRoi={stats.avgRoi}
          onOpenLookup={() => setShowLookup(true)}
        />

        {/* SSE Banner */}
        <SSEBanner state={sseState} onRetry={handleRetrySSE} />

        {/* FilterBar */}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          onSave={handleSaveFilters}
          sort={sort}
          onSortChange={setSort}
        />

        {/* Content area: table + panel */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            minHeight: 0,
            position: 'relative',
          }}
        >
          {/* Deal Table */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <DealTable
              deals={filteredAndSorted}
              selectedId={selectedDealId}
              onSelect={setSelectedDealId}
              newDealIds={newDealIds}
            />
          </div>

          {/* Detail Panel — desktop sidebar */}
          {!isMobile && (
            <div
              style={{
                width: 380,
                flexShrink: 0,
                borderLeft: '1px solid rgba(255,255,255,0.04)',
                background: 'rgba(0,0,0,0.15)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <DealPanel
                dealId={selectedDealId}
                onClose={() => setSelectedDealId(null)}
              />
            </div>
          )}

          {/* Detail Panel — mobile bottom sheet */}
          {isMobile && selectedDealId && (
            <div
              style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                height: '75vh',
                background: '#0c0a1a',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px 14px 0 0',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'slideUp 0.3s ease',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '8px 0 4px',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 4,
                    borderRadius: 2,
                    background: 'rgba(255,255,255,0.15)',
                  }}
                />
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                <DealPanel
                  dealId={selectedDealId}
                  onClose={() => setSelectedDealId(null)}
                />
              </div>
            </div>
          )}
        </div>

        {/* System Status Bar */}
        <SystemStatusBar status={status} isLive={isLive} sseState={sseState} />
      </div>

      {/* ═══ MODALS ═══ */}
      {showLookup && <LookupModal onClose={() => setShowLookup(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <ToastContainer />

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes panelSlide {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @media (max-width: 640px) {
          .deal-card-img { display: none !important; }
        }
      `}</style>
    </div>
  );
}
