import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '../components/Header';
import SSEBanner from '../components/ui/SSEBanner';
import FilterBar from '../components/FilterBar';
import DealFeed from '../components/DealFeed';
import DealDetailPanel from '../components/DealDetailPanel';
import StatusFooter from '../components/StatusFooter';
import LookupModal from '../components/LookupModal';
import ToastContainer, { showToast } from '../components/ui/Toast';
import { getDeals, getStatus, getPreferences, updatePreferences, toggleScanner } from '../api/deals';
import type { Deal, SystemStatus, FilterState, Tier, Condition, LiquidityGrade } from '../types/deals';

const DEFAULT_FILTERS: FilterState = {
  tiers: ['GRAIL', 'HIT', 'FLIP'],
  conditions: ['NM', 'LP', 'MP'],
  liquidityGrades: ['HIGH', 'MED'],
  confidenceLevels: ['HI', 'MD'],
  timeWindow: '6H',
  minProfitPercent: 10,
  gradedOnly: false,
};

function applyFilters(deals: Deal[], filters: FilterState): Deal[] {
  const now = Date.now();
  const timeMs: Record<string, number> = {
    '1H': 3600000,
    '6H': 21600000,
    '24H': 86400000,
    'ALL': Infinity,
  };
  const windowMs = timeMs[filters.timeWindow] || Infinity;

  return deals.filter(d => {
    if (!filters.tiers.includes(d.tier as Tier)) return false;
    if (!filters.conditions.includes(d.condition as Condition)) return false;
    if (d.liquidity_grade && !filters.liquidityGrades.includes(d.liquidity_grade as LiquidityGrade) && filters.liquidityGrades.length > 0) return false;

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

export default function Dashboard() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [sseState, setSseState] = useState<'connected' | 'reconnecting' | 'lost'>('reconnecting');
  const [showLookup, setShowLookup] = useState(false);
  const [newDealIds, setNewDealIds] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 920);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Responsive
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 920);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Load initial data
  useEffect(() => {
    getDeals({ limit: 50, sort: 'createdAt', order: 'desc' }).then(res => setDeals(res.data)).catch(() => {});
    getStatus().then(s => setStatus(s)).catch(() => {});
    getPreferences().then(p => {
      if (p.data?.defaultFilters) {
        setFilters(prev => ({ ...prev, ...(p.data.defaultFilters as Partial<FilterState>) }));
      }
    }).catch(() => {});
  }, []);

  // SSE connection
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource('/api/deals/stream');
    eventSourceRef.current = es;

    es.addEventListener('open', () => {
      setSseState('connected');
      if (sseTimerRef.current) clearTimeout(sseTimerRef.current);
    });

    es.addEventListener('deal', (e: MessageEvent) => {
      try {
        const deal = JSON.parse(e.data) as Deal;
        setDeals(prev => {
          if (prev.some(d => d.deal_id === deal.deal_id)) return prev;
          return [deal, ...prev];
        });
        setNewDealIds(prev => new Set(prev).add(deal.deal_id));
        setTimeout(() => {
          setNewDealIds(prev => {
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
      } catch { /* silent */ }
    });

    es.addEventListener('status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setStatus(prev => prev ? { ...prev, scanner: { ...prev.scanner, activeDeals: data.activeDeals } } : prev);
      } catch { /* silent */ }
    });

    es.addEventListener('error', () => {
      setSseState('reconnecting');
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
      getStatus().then(s => setStatus(s)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredDeals = applyFilters(deals, filters);

  const handleSaveFilters = async () => {
    try {
      await updatePreferences({ defaultFilters: filters });
    } catch { /* silent */ }
  };

  const handleRetrySSE = () => {
    connectSSE();
  };

  const handleToggleScanner = async () => {
    const currentStatus = status?.scanner?.status || 'running';
    const action = currentStatus === 'paused' ? 'start' : 'stop';
    try {
      const result = await toggleScanner(action);
      setStatus(prev => prev ? {
        ...prev,
        scanner: { ...prev.scanner, status: result.status },
      } : prev);
    } catch { /* silent */ }
  };

  const scannerStatus = status?.scanner?.status || 'running';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Header
        sseConnected={sseState === 'connected'}
        scannerStatus={scannerStatus}
        onOpenLookup={() => setShowLookup(true)}
        onToggleScanner={handleToggleScanner}
      />
      <SSEBanner state={sseState} onRetry={handleRetrySSE} />
      <FilterBar filters={filters} onChange={setFilters} onSave={handleSaveFilters} />

      <div style={{
        flex: 1,
        display: 'flex',
        minHeight: 0,
        position: 'relative',
      }}>
        {/* Deal Feed */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <DealFeed
            deals={filteredDeals}
            selectedDealId={selectedDealId}
            onSelectDeal={setSelectedDealId}
            newDealIds={newDealIds}
          />
        </div>

        {/* Detail Panel — desktop sidebar */}
        {!isMobile && (
          <DealDetailPanel
            dealId={selectedDealId}
            onClose={() => setSelectedDealId(null)}
          />
        )}

        {/* Detail Panel — mobile bottom sheet */}
        {isMobile && selectedDealId && (
          <div style={{
            position: 'fixed',
            bottom: 0, left: 0, right: 0,
            height: '75vh',
            background: 'var(--bg1)',
            borderTop: '1px solid var(--brd)',
            borderRadius: '14px 14px 0 0',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'slideUp 0.3s ease',
          }}>
            {/* Drag handle */}
            <div style={{
              display: 'flex', justifyContent: 'center', padding: '8px 0 4px',
            }}>
              <div style={{
                width: 32, height: 4, borderRadius: 2,
                background: 'var(--tMut)',
              }} />
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <DealDetailPanel
                dealId={selectedDealId}
                onClose={() => setSelectedDealId(null)}
              />
            </div>
          </div>
        )}
      </div>

      <StatusFooter status={status} />

      {/* Modals */}
      {showLookup && <LookupModal onClose={() => setShowLookup(false)} />}
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
        @media (max-width: 640px) {
          .deal-card-img { display: none !important; }
        }
      `}</style>
    </div>
  );
}
