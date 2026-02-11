import { useRef, useState, useEffect, useCallback } from 'react';
import DealCard from './DealCard';
import type { Deal } from '../types/deals';

export default function DealFeed({
  deals,
  selectedDealId,
  onSelectDeal,
  newDealIds,
}: {
  deals: Deal[];
  selectedDealId: string | null;
  onSelectDeal: (id: string) => void;
  newDealIds: Set<string>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFreshHeat, setShowFreshHeat] = useState(false);
  const isNearTopRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearTopRef.current = el.scrollTop < 80;
    if (isNearTopRef.current) {
      setShowFreshHeat(false);
    }
  }, []);

  // Show FRESH HEAT when new deals arrive and user is scrolled down
  useEffect(() => {
    if (newDealIds.size > 0 && !isNearTopRef.current) {
      setShowFreshHeat(true);
    }
  }, [newDealIds]);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setShowFreshHeat(false);
  };

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* FRESH HEAT pill */}
      {showFreshHeat && (
        <button
          onClick={scrollToTop}
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            padding: '4px 14px',
            borderRadius: 20,
            background: 'var(--glass)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(251,191,36,0.3)',
            color: 'var(--amber)',
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1,
            cursor: 'pointer',
            animation: 'fadeSlide 0.3s ease',
          }}
        >
          FRESH HEAT ↑
        </button>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {deals.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '60px 20px', color: 'var(--tMut)',
          }}>
            <span style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>⚡</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 1 }}>NO DEALS YET</span>
            <span style={{ fontSize: 12, marginTop: 4, color: 'var(--tMut)' }}>Waiting for the scanner...</span>
          </div>
        ) : (
          deals.map((deal, i) => (
            <DealCard
              key={deal.deal_id}
              deal={deal}
              selected={deal.deal_id === selectedDealId}
              onClick={() => onSelectDeal(deal.deal_id)}
              style={{
                animation: newDealIds.has(deal.deal_id)
                  ? `fadeSlide 0.3s ease ${Math.min(i * 30, 300)}ms both`
                  : undefined,
              }}
            />
          ))
        )}
      </div>

      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
