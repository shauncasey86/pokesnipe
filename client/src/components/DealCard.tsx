import TierBadge from './ui/TierBadge';
import CondPill from './ui/CondPill';
import LiqPill from './ui/LiqPill';
import Bar from './ui/Bar';
import TrendArrow from './ui/TrendArrow';
import type { Deal, Tier, Condition, LiquidityGrade } from '../types/deals';

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

const TIER_GLOW: Record<string, string> = {
  GRAIL: '0 0 12px rgba(255,107,53,0.25), inset 0 0 12px rgba(255,59,111,0.08)',
  HIT: '0 0 8px rgba(255,214,10,0.12)',
  FLIP: 'none',
  SLEEP: 'none',
};

const TIER_LEFT_BORDER: Record<string, string> = {
  GRAIL: '#ff6b35',
  HIT: '#ffd60a',
  FLIP: 'transparent',
  SLEEP: 'transparent',
};

export default function DealCard({
  deal,
  selected,
  isNew,
  onClick,
  style,
}: {
  deal: Deal;
  selected: boolean;
  isNew?: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  const time = timeAgo(deal.listed_at || deal.created_at);
  const isSleep = deal.tier === 'SLEEP';
  const isGrail = deal.tier === 'GRAIL';
  const profitGbp = deal.profit_gbp ?? 0;
  const profitPct = deal.profit_percent ?? 0;

  // Tier-specific sizing
  const imgSize = isGrail ? 64 : 48;
  const imgHeight = isGrail ? 89 : 67;
  const nameFontSize = isGrail ? 15 : 14;
  const profitFontSize = isGrail ? 22 : 20;
  const rowPadding = isSleep ? '6px 14px' : isGrail ? '12px 14px' : '10px 14px';

  const leftBorder = selected
    ? '2px solid var(--green)'
    : isNew && time.isFresh
      ? '2px solid var(--green)'
      : `2px solid ${TIER_LEFT_BORDER[deal.tier] || 'transparent'}`;

  return (
    <div
      onClick={onClick}
      className={isNew ? 'deal-card-new' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: `auto 1fr auto`,
        gap: 12,
        padding: rowPadding,
        background: selected ? 'var(--glass2)' : isNew && time.isFresh ? 'rgba(52,211,153,0.03)' : 'transparent',
        borderLeft: leftBorder,
        borderBottom: '1px solid var(--brd)',
        cursor: 'pointer',
        opacity: isSleep ? 0.35 : 1,
        boxShadow: !isSleep ? TIER_GLOW[deal.tier] : 'none',
        transition: 'all 0.15s',
        ...style,
      }}
    >
      {/* Left: Image + tier badge */}
      <div style={{ position: 'relative', width: imgSize, flexShrink: 0 }} className="deal-card-img">
        {deal.ebay_image_url ? (
          <img
            src={deal.ebay_image_url}
            alt=""
            style={{
              width: imgSize, height: imgHeight,
              objectFit: 'cover',
              borderRadius: 4,
              background: 'var(--glass)',
            }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: imgSize, height: imgHeight, borderRadius: 4,
            background: 'var(--glass)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--tMut)', fontSize: 10,
          }}>
            ?
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 2, left: 2 }}>
          <TierBadge tier={deal.tier as Tier} />
        </div>
      </div>

      {/* Center: Info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontSize: nameFontSize, fontWeight: isGrail ? 800 : 700,
            color: 'var(--tMax)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {deal.cardName || deal.ebay_title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--tSec)' }}>
            £{deal.ebay_price_gbp.toFixed(2)} → £{(deal.market_price_gbp ?? 0).toFixed(2)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {deal.confidence != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 72 }}>
              <Bar value={deal.confidence} height={3} />
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 9,
                color: deal.confidence >= 0.7 ? 'var(--green)' : deal.confidence >= 0.4 ? 'var(--amber)' : 'var(--red)',
              }}>
                {(deal.confidence * 100).toFixed(0)}%
              </span>
            </div>
          )}
          <CondPill condition={deal.condition as Condition} />
          <LiqPill grade={deal.liquidity_grade as LiquidityGrade} />
          {deal.is_graded && (
            <span style={{
              padding: '1px 5px', borderRadius: 4, fontSize: 10,
              border: '1px solid var(--blue)', color: 'var(--blue)',
              fontFamily: "'DM Mono', monospace", fontWeight: 500,
            }}>
              GRADED
            </span>
          )}
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10,
            color: time.isFresh ? 'var(--green)' : time.isOld ? 'var(--red)' : 'var(--tMut)',
            marginLeft: 'auto',
          }}>
            {time.text}
          </span>
        </div>
      </div>

      {/* Right: Profit */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{
          fontFamily: "'DM Mono', monospace", fontSize: profitFontSize, fontWeight: 800,
          color: 'var(--greenB)',
          textShadow: isGrail ? '0 0 16px rgba(110,231,183,0.5)' : '0 0 12px rgba(110,231,183,0.4)',
          lineHeight: 1,
        }}>
          +£{profitGbp.toFixed(2)}
        </span>
        <span style={{
          fontFamily: "'DM Mono', monospace", fontSize: 11,
          color: 'var(--green)', fontWeight: 500,
        }}>
          +{profitPct.toFixed(1)}%
        </span>
        {deal.trend_7d != null && (
          <TrendArrow value={deal.trend_7d / 100} />
        )}
      </div>
    </div>
  );
}
