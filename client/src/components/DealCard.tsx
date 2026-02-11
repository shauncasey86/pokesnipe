import { useState } from 'react';
import TierBadge from './ui/TierBadge';
import CondPill from './ui/CondPill';
import LiqPill from './ui/LiqPill';
import TrendArrow from './ui/TrendArrow';
import type { Deal, Tier, Condition, LiquidityGrade } from '../types/deals';

const FONT_MONO = "var(--font-mono)";
const FONT_DISPLAY = "var(--font-display)";

function timeAgo(dateStr: string): { text: string; isFresh: boolean; isOld: boolean } {
  const ms = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return { text: 'just now', isFresh: true, isOld: false };
  if (min < 5) return { text: `${min}m ago`, isFresh: true, isOld: false };
  if (min < 60) return { text: `${min}m ago`, isFresh: false, isOld: false };
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return { text: `${hrs}h ago`, isFresh: false, isOld: min > 60 };
  return { text: `${Math.floor(hrs / 24)}d ago`, isFresh: false, isOld: true };
}

const TIER_ACCENT: Record<string, string> = {
  GRAIL: 'var(--tier-grail)',
  HIT: 'var(--tier-hit)',
  FLIP: 'var(--tier-flip)',
  SLEEP: 'var(--tier-sleep)',
};

const TIER_GLOW: Record<string, string> = {
  GRAIL: '0 0 16px rgba(255,107,53,0.2), inset 0 0 16px rgba(255,59,111,0.06)',
  HIT: '0 0 10px rgba(56,189,248,0.1)',
  FLIP: 'none',
  SLEEP: 'none',
};

export default function DealCard({
  deal,
  selected,
  isNew,
  onClick,
  onSnag,
  style,
}: {
  deal: Deal;
  selected: boolean;
  isNew?: boolean;
  onClick: () => void;
  onSnag?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}) {
  const [hovered, setHovered] = useState(false);
  const time = timeAgo(deal.listed_at || deal.created_at);
  const tier = deal.tier;
  const isGrail = tier === 'GRAIL';
  const isHit = tier === 'HIT';
  const isSleep = tier === 'SLEEP';
  const isFlip = tier === 'FLIP';
  const isCompact = isSleep || isFlip;
  const profitGbp = deal.profit_gbp ?? 0;
  const profitPct = deal.profit_percent ?? 0;
  const confidence = deal.confidence ?? 0;

  // Tier-based sizing: grail=hero, hit=standard, flip/sleep=compact
  const imgSize = isGrail ? 72 : isCompact ? 40 : 52;
  const imgHeight = isGrail ? 100 : isCompact ? 56 : 73;
  const nameFontSize = isGrail ? 16 : isCompact ? 12 : 14;
  const profitFontSize = isGrail ? 26 : isCompact ? 16 : 20;
  const rowPadding = isGrail ? '14px 16px' : isCompact ? '6px 16px' : '10px 16px';

  // Left border accent
  const accentColor = TIER_ACCENT[tier] || 'transparent';
  const leftBorder = selected
    ? '3px solid var(--green)'
    : isNew && time.isFresh
      ? '3px solid var(--green)'
      : isGrail
        ? `3px solid ${accentColor}`
        : isHit
          ? `2px solid ${accentColor}`
          : '2px solid transparent';

  // Confidence micro-bar color
  const confColor = confidence >= 0.7 ? 'var(--green)' : confidence >= 0.4 ? 'var(--amber)' : 'var(--red)';

  const handleSnag = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSnag) onSnag(e);
    else window.open(deal.ebay_url, '_blank', 'noopener');
  };

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={isNew ? 'deal-card-new' : undefined}
      data-tier={tier}
      style={{
        display: 'grid',
        gridTemplateColumns: isCompact
          ? 'auto 1fr auto auto'
          : 'auto 1fr auto auto auto',
        gap: isCompact ? 8 : 12,
        padding: rowPadding,
        background: selected
          ? 'var(--glass2)'
          : isNew && time.isFresh
            ? 'rgba(52,211,153,0.03)'
            : hovered
              ? 'var(--glass)'
              : 'transparent',
        borderLeft: leftBorder,
        borderBottom: '1px solid var(--brd)',
        cursor: 'pointer',
        opacity: isSleep ? 0.4 : 1,
        boxShadow: !isCompact ? TIER_GLOW[tier] : 'none',
        transition: 'all 0.15s',
        position: 'relative',
        ...style,
      }}
    >
      {/* Col 1: Image + tier badge */}
      <div style={{ position: 'relative', width: imgSize, flexShrink: 0 }} className="deal-card-img">
        {deal.ebay_image_url ? (
          <img
            src={deal.ebay_image_url}
            alt=""
            style={{
              width: imgSize, height: imgHeight,
              objectFit: 'cover',
              borderRadius: isGrail ? 6 : 4,
              background: 'var(--glass)',
            }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: imgSize, height: imgHeight, borderRadius: isGrail ? 6 : 4,
            background: 'var(--glass)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--tMut)', fontSize: 10, fontFamily: FONT_MONO,
          }}>
            ?
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 2, left: 2 }}>
          <TierBadge tier={tier as Tier} size={isGrail ? 'md' : 'sm'} />
        </div>
      </div>

      {/* Col 2: Card info (name + prices + condition) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: isCompact ? 2 : 3, minWidth: 0, justifyContent: 'center' }}>
        {/* Name */}
        <span style={{
          fontFamily: FONT_DISPLAY,
          fontSize: nameFontSize,
          fontWeight: isGrail ? 800 : isHit ? 700 : 500,
          color: 'var(--tMax)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.2,
        }}>
          {deal.cardName || deal.ebay_title}
        </span>

        {/* Price range + condition badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: FONT_MONO, fontSize: isCompact ? 10 : 11,
            color: 'var(--tSec)', fontWeight: 400,
            fontFeatureSettings: "'tnum' 1",
          }}>
            {'\u00A3'}{deal.ebay_price_gbp.toFixed(2)} {'\u2192'} {'\u00A3'}{(deal.market_price_gbp ?? 0).toFixed(2)}
          </span>
          <CondPill condition={deal.condition as Condition} />
          {!isCompact && <LiqPill grade={deal.liquidity_grade as LiquidityGrade} />}
          {deal.is_graded && !isCompact && (
            <span style={{
              padding: '1px 5px', borderRadius: 4, fontSize: 9,
              border: '1px solid var(--blue)', color: 'var(--blue)',
              fontFamily: FONT_MONO, fontWeight: 500,
            }}>
              GRADED
            </span>
          )}
        </div>
      </div>

      {/* Col 3: Confidence micro-bar (hidden on compact) */}
      {!isCompact && deal.confidence != null && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 2, width: 48,
        }}>
          <div style={{
            width: 40, height: 3, borderRadius: 3,
            background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.max(0, Math.min(1, confidence)) * 100}%`,
              height: '100%', borderRadius: 3,
              background: confColor, transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{
            fontFamily: FONT_MONO, fontSize: 9, fontWeight: 500,
            color: confColor,
            fontFeatureSettings: "'tnum' 1",
          }}>
            {(confidence * 100).toFixed(0)}%
          </span>
        </div>
      )}

      {/* Col 4: Profit column */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-end', justifyContent: 'center',
        flexShrink: 0,
        opacity: hovered ? 0 : 1,
        transition: 'opacity 0.15s',
      }}>
        <span style={{
          fontFamily: FONT_MONO, fontSize: profitFontSize, fontWeight: 800,
          color: 'var(--greenB)',
          textShadow: isGrail ? '0 0 20px rgba(110,231,183,0.5)' : '0 0 12px rgba(110,231,183,0.35)',
          lineHeight: 1,
          fontFeatureSettings: "'tnum' 1",
        }}>
          +{'\u00A3'}{profitGbp.toFixed(2)}
        </span>
        <span style={{
          fontFamily: FONT_MONO, fontSize: isCompact ? 10 : 11,
          color: 'var(--green)', fontWeight: 500,
          fontFeatureSettings: "'tnum' 1",
        }}>
          +{profitPct.toFixed(1)}%
        </span>
        {!isCompact && deal.trend_7d != null && (
          <TrendArrow value={deal.trend_7d / 100} />
        )}
      </div>

      {/* Col 5: Timestamp */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-end', justifyContent: 'center',
        minWidth: isCompact ? 40 : 48,
        opacity: hovered ? 0 : 1,
        transition: 'opacity 0.15s',
      }}>
        <span style={{
          fontFamily: FONT_MONO, fontSize: 10, fontWeight: 200,
          color: time.isFresh ? 'var(--green)' : time.isOld ? 'var(--red)' : 'var(--tMut)',
        }}>
          {time.text}
        </span>
      </div>

      {/* Snag button — appears on hover, overlays timestamp + profit */}
      {hovered && (
        <button
          onClick={handleSnag}
          style={{
            position: 'absolute',
            right: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            padding: isCompact ? '4px 12px' : '6px 18px',
            borderRadius: 6,
            background: 'var(--grad-cta)',
            border: 'none',
            color: '#fff',
            fontFamily: FONT_MONO,
            fontSize: isCompact ? 10 : 12,
            fontWeight: 800,
            letterSpacing: 1,
            cursor: 'pointer',
            boxShadow: '0 0 16px rgba(52,211,153,0.3)',
            zIndex: 2,
            animation: 'snagFadeIn 0.12s ease',
          }}
        >
          SNAG
        </button>
      )}

      <style>{`
        @keyframes snagFadeIn {
          from { opacity: 0; transform: translateY(-50%) scale(0.95); }
          to { opacity: 1; transform: translateY(-50%) scale(1); }
        }
      `}</style>
    </div>
  );
}
