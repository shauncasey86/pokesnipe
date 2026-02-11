import { useRef, useState, useEffect, useCallback } from 'react';
import DealCard from './DealCard';
import type { Deal } from '../types/deals';

const FONT_MONO = "var(--font-mono)";

// Tier-specific shimmer colors
const TIER_SHIMMER: Record<string, string> = {
  GRAIL: 'rgba(255,107,53,0.08)',
  HIT: 'rgba(56,189,248,0.07)',
  FLIP: 'rgba(249,115,22,0.06)',
  SLEEP: 'rgba(58,64,96,0.06)',
};

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
  const [initialLoad, setInitialLoad] = useState(true);

  // Mark initial load complete after first render with deals
  useEffect(() => {
    if (deals.length > 0 && initialLoad) {
      const timer = setTimeout(() => setInitialLoad(false), deals.length * 50 + 500);
      return () => clearTimeout(timer);
    }
  }, [deals.length, initialLoad]);

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
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            cursor: 'pointer',
            animation: 'fadeSlide 0.3s ease',
          }}
        >
          FRESH HEAT {'\u2191'}
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
            <span style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>{'\u26A1'}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: 1, fontWeight: 200 }}>NO DEALS YET</span>
            <span style={{ fontSize: 12, marginTop: 4, color: 'var(--tMut)', fontWeight: 200 }}>Waiting for the scanner...</span>
          </div>
        ) : (
          deals.map((deal, i) => {
            const isNew = newDealIds.has(deal.deal_id);
            const shimmerColor = TIER_SHIMMER[deal.tier] || TIER_SHIMMER.FLIP;

            return (
              <DealCard
                key={deal.deal_id}
                deal={deal}
                selected={deal.deal_id === selectedDealId}
                isNew={isNew}
                onClick={() => onSelectDeal(deal.deal_id)}
                style={{
                  // Staggered entry on initial load, shimmer on new deals
                  animation: isNew
                    ? `shimmerIn 0.5s ease both, shimmerSweep 0.4s ease-out 0.15s both`
                    : initialLoad
                      ? `staggerIn 0.35s ease ${Math.min(i * 50, 1000)}ms both`
                      : undefined,
                  // Tier-colored shimmer background for new deals
                  ...(isNew ? {
                    backgroundImage: `linear-gradient(90deg, transparent, ${shimmerColor}, transparent)`,
                    backgroundSize: '200px 100%',
                    backgroundRepeat: 'no-repeat',
                  } : {}),
                }}
              />
            );
          })
        )}
      </div>

      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        /* New deal entry animation */
        @keyframes shimmerIn {
          0% { opacity: 0; transform: translateY(-6px); }
          60% { opacity: 1; transform: translateY(0); }
          100% { opacity: 1; transform: translateY(0); }
        }

        /* Tier-colored horizontal light sweep (~400ms) */
        @keyframes shimmerSweep {
          0% { background-position: -200px 0; }
          100% { background-position: calc(100% + 200px) 0; }
        }

        /* Fresh deal left accent line that fades over 60s */
        .deal-card-new {
          position: relative;
        }
        .deal-card-new::after {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: var(--green);
          animation: accentFade 60s ease-out forwards;
          pointer-events: none;
        }
        @keyframes accentFade {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }

        /* Fresh deal subtle background glow that decays */
        .deal-card-new::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at left, rgba(52,211,153,0.04), transparent 60%);
          animation: glowDecay 30s ease-out forwards;
          pointer-events: none;
        }
        @keyframes glowDecay {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }

        /* Staggered entry on page load */
        @keyframes staggerIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
