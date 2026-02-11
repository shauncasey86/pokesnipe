import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import TierBadge from './ui/TierBadge';
import CondPill from './ui/CondPill';
import LiqPill from './ui/LiqPill';
import { BarRow } from './ui/Bar';
import GradBorder from './ui/GradBorder';
import { getDealDetail, reviewDeal, fetchVelocity } from '../api/deals';
import type { DealDetail, Tier, Condition, LiquidityGrade } from '../types/deals';

/* ─── Constants ─── */

const TIER_PILL: Record<string, { label: string; bg: string; border: string; color: string }> = {
  GRAIL: { label: 'Grail Territory', bg: 'rgba(255,107,53,0.12)', border: 'rgba(255,107,53,0.5)', color: '#ff6b35' },
  HIT:   { label: 'Solid Hit',      bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.4)', color: '#38bdf8' },
  FLIP:  { label: 'Quick Flip',     bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.3)', color: '#f97316' },
  SLEEP: { label: 'Sleeper',        bg: 'rgba(58,64,96,0.15)',   border: 'rgba(58,64,96,0.4)',   color: '#8290a8' },
};

const REVIEW_REASONS = [
  { key: 'wrong_card', label: 'Wrong card' },
  { key: 'wrong_set', label: 'Wrong set' },
  { key: 'wrong_condition', label: 'Wrong condition' },
  { key: 'wrong_price', label: 'Price outdated' },
  { key: 'bad_image', label: 'Bad image' },
];

/* ─── Helpers ─── */

function getEraClassification(series: string | null, releaseDate: string | null): string {
  if (!releaseDate && !series) return '';
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
  if (series) {
    const s = series.toLowerCase();
    if (s.includes('e-series') || s.includes('e-card')) return 'e-Series';
    if (s.includes('scarlet') || s.includes('sword') || s.includes('sun & moon')) return 'Modern';
    if (s.includes('xy') || s.includes('black') || s.includes('diamond')) return 'Classic';
    if (s.includes('ex') || s.includes('base') || s.includes('gym') || s.includes('neo') || s.includes('legendary')) return 'Vintage';
  }
  if (year) {
    if (year >= 2019) return 'Modern';
    if (year >= 2013) return 'Classic';
    if (year >= 2003) return 'Legacy';
    return 'Vintage';
  }
  return '';
}

function getActivityLevel(liqGrade: LiquidityGrade | null): { icon: string; label: string; color: string } {
  switch (liqGrade) {
    case 'high':     return { icon: '\u{1F525}', label: 'High activity',     color: 'var(--red)' };
    case 'medium':   return { icon: '\u{1F4A7}', label: 'Moderate activity', color: 'var(--blue)' };
    case 'low':      return { icon: '\u26AA',    label: 'Low activity',      color: 'var(--tMut)' };
    case 'illiquid': return { icon: '\u26AA',    label: 'Illiquid',          color: 'var(--tMut)' };
    default:         return { icon: '\u26AA',    label: 'Unknown',           color: 'var(--tMut)' };
  }
}

function confidenceIcon(value: number | null | undefined): { icon: string; color: string } {
  const v = value ?? 0;
  if (v >= 0.70) return { icon: '\u2713', color: 'var(--green)' };
  if (v > 0)     return { icon: '\u26A0', color: 'var(--amber)' };
  return { icon: '\u2014', color: 'var(--tMut)' };
}

/** Tiny SVG sparkline from trend data points */
function MiniSparkline({ points, width = 40, height = 14, color }: {
  points: number[];
  width?: number;
  height?: number;
  color: string;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 1;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const d = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * w;
    const y = pad + h - ((p - min) / range) * h;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ verticalAlign: 'middle', marginLeft: 6 }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Full-width sparkline for price trends */
function TrendSparkline({ points, height = 50, color, annotations }: {
  points: { x: number; y: number }[];
  height?: number;
  color: string;
  annotations?: { label: string; value: string }[];
}) {
  if (points.length < 2) return null;
  const svgW = 380;
  const values = points.map(p => p.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 4;
  const w = svgW - pad * 2 - 60;
  const h = height - pad * 2;

  const d = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * w;
    const y = pad + h - ((p.y - min) / range) * h;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const lastX = pad + w;
  const firstX = pad;
  const areaD = `${d} L${lastX.toFixed(1)},${(pad + h).toFixed(1)} L${firstX.toFixed(1)},${(pad + h).toFixed(1)} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${svgW} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#trendFill)" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {annotations?.map((a, i) => (
        <text key={i} x={w + pad + 8} y={pad + 10 + i * 16} fill="var(--tMut)" fontSize="9" fontFamily="var(--font-mono)">
          {a.label} {a.value}
        </text>
      ))}
    </svg>
  );
}

/** Dot-plot strip chart for comps */
function CompsDotPlot({ prices, buyPrice, activeCondition }: {
  prices: Record<string, { low: number; market: number }>;
  buyPrice: number;
  activeCondition: string;
}) {
  const allValues = Object.values(prices).flatMap(p => [p.low, p.market]).filter(v => v > 0);
  allValues.push(buyPrice);
  const min = Math.min(...allValues) * 0.85;
  const max = Math.max(...allValues) * 1.15;
  const range = max - min || 1;
  const conditions = Object.entries(prices);
  const barH = 20;
  const labelW = 32;
  const chartW = 340;
  const totalH = conditions.length * barH + 8;

  const toX = (v: number) => labelW + ((v - min) / range) * (chartW - labelW);
  const buyX = toX(buyPrice);

  return (
    <svg width="100%" height={totalH} viewBox={`0 0 ${chartW} ${totalH}`} preserveAspectRatio="xMinYMin meet" style={{ display: 'block' }}>
      {/* Buy price vertical line */}
      <line x1={buyX} y1={0} x2={buyX} y2={totalH} stroke="var(--green)" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.7" />
      <text x={buyX} y={totalH} fill="var(--green)" fontSize="7" fontFamily="var(--font-mono)" textAnchor="middle" dy="-2">BUY</text>

      {conditions.map(([cond, p], i) => {
        const y = i * barH + barH / 2 + 2;
        const isActive = cond.toUpperCase() === activeCondition?.toUpperCase();
        const lowX = toX(p.low);
        const mktX = toX(p.market);

        return (
          <g key={cond}>
            {isActive && (
              <rect x={0} y={i * barH} width={chartW} height={barH} rx={3}
                fill="rgba(52,211,153,0.06)" />
            )}
            {isActive && (
              <rect x={0} y={i * barH + 2} width={2} height={barH - 4} rx={1} fill="var(--green)" />
            )}
            <text x={6} y={y + 3} fill={isActive ? 'var(--tMax)' : 'var(--tSec)'}
              fontSize="9" fontFamily="var(--font-mono)" fontWeight={isActive ? 700 : 400}>
              {cond.toUpperCase()}
            </text>
            <line x1={lowX} y1={y} x2={mktX} y2={y}
              stroke={isActive ? 'var(--green)' : 'var(--tMut)'} strokeWidth="1" opacity="0.4" />
            <circle cx={lowX} cy={y} r={3}
              fill={isActive ? 'var(--green)' : 'var(--tSec)'} opacity="0.7" />
            <circle cx={mktX} cy={y} r={4}
              fill={isActive ? 'var(--green)' : 'var(--tSec)'} opacity="0.9" />
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Sub-components ─── */

function SectionHeader({ text }: { text: string }) {
  return (
    <div className="section-header" style={{ padding: '14px 0 6px', marginTop: 8 }}>{text}</div>
  );
}

function PriceRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '2px 0',
      fontWeight: bold ? 600 : 400, color: bold ? 'var(--tMax)' : 'var(--tSec)',
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function PricingBreakdown({ deal, profitGbp }: { deal: DealDetail; profitGbp: number }) {
  const [showFx, setShowFx] = useState(false);

  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
      <PriceRow label="eBay price" value={`\u00A3${deal.ebay_price_gbp.toFixed(2)}`} />
      <PriceRow label="Shipping" value={`\u00A3${deal.ebay_shipping_gbp.toFixed(2)}`} />
      <PriceRow label="Fees (inc.)" value={`\u00A3${(deal.buyer_prot_fee ?? 0).toFixed(2)}`} />
      <div style={{ borderTop: '1px solid var(--brd)', margin: '4px 0' }} />
      <PriceRow label="Total cost" value={`\u00A3${deal.total_cost_gbp.toFixed(2)}`} bold />
      <div style={{ height: 8 }} />
      {deal.market_price_gbp != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: 600, color: 'var(--tMax)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Market price
            {deal.market_price_usd != null && (
              <button
                onClick={() => setShowFx(!showFx)}
                title="Show USD source + FX rate"
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: 'var(--tMut)', fontSize: 10, cursor: 'pointer',
                  fontFamily: "var(--font-mono)",
                }}
              >
                {showFx ? '\u25BE' : '\u24D8'}
              </button>
            )}
          </span>
          <span>{`\u00A3${deal.market_price_gbp.toFixed(2)}`}</span>
        </div>
      )}
      {showFx && deal.market_price_usd != null && (
        <div style={{ padding: '4px 12px', marginBottom: 2, fontSize: 10, color: 'var(--tMut)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>USD source</span>
            <span>${deal.market_price_usd.toFixed(2)}</span>
          </div>
          {deal.exchange_rate != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>FX rate</span>
              <span>{`\u00D7${deal.exchange_rate.toFixed(3)}`}</span>
            </div>
          )}
        </div>
      )}
      <div style={{
        marginTop: 6, padding: '6px 10px', borderRadius: 6,
        border: '1px solid rgba(110,231,183,0.2)',
        background: 'rgba(110,231,183,0.04)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span style={{ color: 'var(--tSec)' }}>Profit</span>
        <span style={{ color: 'var(--greenB)', fontWeight: 700 }}>{`+\u00A3${profitGbp.toFixed(2)}`}</span>
      </div>
    </div>
  );
}

/** Animated confidence bar row with status icon */
function AnimatedBarRow({ label, value, delay }: { label: string; value: number | null | undefined; delay: number }) {
  const v = value ?? 0;
  const [animated, setAnimated] = useState(0);
  const { icon, color: iconColor } = confidenceIcon(value);

  useEffect(() => {
    setAnimated(0);
    const timer = setTimeout(() => setAnimated(v), delay + 50);
    return () => clearTimeout(timer);
  }, [v, delay]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '66px 1fr 38px 16px', alignItems: 'center', gap: 8, padding: '3px 0' }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: 'var(--tSec)', textTransform: 'capitalize', fontWeight: 200 }}>{label}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 5, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.max(0, Math.min(1, animated)) * 100}%`,
          height: '100%', borderRadius: 5,
          background: v >= 0.85 ? 'var(--green)' : v >= 0.65 ? 'var(--amber)' : 'var(--red)',
          transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textAlign: 'right',
        color: v >= 0.85 ? 'var(--green)' : v >= 0.65 ? 'var(--amber)' : 'var(--red)',
        fontFeatureSettings: "'tnum' 1",
      }}>
        {(v * 100).toFixed(0)}%
      </span>
      <span style={{ fontSize: 10, color: iconColor, textAlign: 'center', lineHeight: 1 }}>{icon}</span>
    </div>
  );
}

/* ─── Keyframe styles injected once ─── */
const PANEL_STYLES = `
@keyframes grailPulse {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
@keyframes reviewFlash {
  0% { opacity: 0.8; }
  100% { opacity: 0; }
}
@media (max-width: 920px) {
  .swipe-hint { display: block !important; }
}
`;

/* ─── Main Component ─── */

export default function DealDetailPanel({
  dealId,
  onClose,
}: {
  dealId: string | null;
  onClose: () => void;
}) {
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [velocityLoading, setVelocityLoading] = useState(false);
  const [reviewState, setReviewState] = useState<'none' | 'correct' | 'wrong' | 'picking'>('none');
  const [reviewSaved, setReviewSaved] = useState(false);
  const [imageMode, setImageMode] = useState<'side' | 'overlay'>('side');
  const [zoomedImage, setZoomedImage] = useState<'none' | 'ebay' | 'ref'>('none');
  const [snagHover, setSnagHover] = useState(false);
  const [chipVisible, setChipVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [reviewFlash, setReviewFlash] = useState<'none' | 'correct' | 'wrong'>('none');

  useEffect(() => {
    if (!dealId) { setDeal(null); return; }
    setLoading(true);
    setReviewState('none');
    setReviewSaved(false);
    setImageMode('side');
    setZoomedImage('none');
    setChipVisible(false);
    setReviewFlash('none');
    getDealDetail(dealId).then(d => {
      setDeal(d);
      if (d.reviewed_at) {
        setReviewState(d.is_correct_match ? 'correct' : 'wrong');
        setReviewSaved(true);
      }
    }).finally(() => setLoading(false));
  }, [dealId]);

  const handleReview = async (correct: boolean, reason?: string) => {
    if (!deal) return;
    setReviewFlash(correct ? 'correct' : 'wrong');
    setTimeout(() => setReviewFlash('none'), 400);
    try {
      await reviewDeal(deal.deal_id, correct, reason);
      setReviewState(correct ? 'correct' : 'wrong');
      setReviewSaved(true);
    } catch { /* silent */ }
  };

  const handleWrongClick = useCallback(() => {
    setReviewState('picking');
    setTimeout(() => setChipVisible(true), 50);
  }, []);

  const handleVelocity = async () => {
    if (!deal) return;
    setVelocityLoading(true);
    try {
      const res = await fetchVelocity(deal.deal_id);
      setDeal(prev => prev ? {
        ...prev,
        liquidity_score: res.liquidity.composite,
        liquidity_grade: res.liquidity.grade as LiquidityGrade,
        match_signals: {
          ...prev.match_signals,
          liquidity: {
            composite: res.liquidity.composite,
            grade: res.liquidity.grade as LiquidityGrade,
            signals: res.liquidity.signals,
          },
        },
      } : null);
    } catch { /* silent */ }
    setVelocityLoading(false);
  };

  // Empty state
  if (!dealId) {
    return (
      <div className="detail-panel" style={{
        width: 440, borderLeft: '1px solid var(--brd)', background: 'var(--bg1)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: 'var(--tMut)', gap: 12, flexShrink: 0,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 48,
          border: '2px solid var(--tMut)', position: 'relative',
          background: 'linear-gradient(180deg, var(--red) 50%, var(--tMut) 50%)',
          opacity: 0.3,
        }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: 12, background: 'var(--bg1)', border: '2px solid var(--tMut)' }} />
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: 'var(--tMut)', transform: 'translateY(-50%)' }} />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 1, textAlign: 'center' }}>
          SELECT A DEAL<br />TO INSPECT
        </span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="detail-panel" style={{
        width: 440, borderLeft: '1px solid var(--brd)', background: 'var(--bg1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--tMut)', flexShrink: 0,
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, animation: 'pulse 1.5s infinite' }}>Loading...</span>
      </div>
    );
  }

  if (!deal) return null;

  const profitGbp = deal.profit_gbp ?? 0;
  const profitPct = deal.profit_percent ?? 0;
  const confidence = deal.match_signals?.confidence;
  const liquidity = deal.match_signals?.liquidity;
  const variantPrices = deal.variant_prices;
  const variantTrends = deal.variant_trends;
  const tier = deal.tier || 'FLIP';
  const tierPill = TIER_PILL[tier] || TIER_PILL.FLIP;

  // Era classification
  const era = getEraClassification(deal.expansion_series ?? null, deal.expansion_release_date ?? null);
  const releaseYear = deal.expansion_release_date ? new Date(deal.expansion_release_date).getFullYear() : null;

  // Build sparkline data from variant trends for the active condition
  const condTrends = variantTrends && deal.condition
    ? (variantTrends[deal.condition] || variantTrends[deal.condition?.toLowerCase()] || {})
    : {};
  const trendPeriods = ['1d', '7d', '30d', '90d'] as const;
  const trendPoints: number[] = [];
  for (const p of trendPeriods) {
    const entry = (condTrends as Record<string, { price_change: number; percent_change: number } | undefined>)[p];
    if (entry != null) trendPoints.push(entry.percent_change);
  }
  const trend7dPct = (condTrends as any)?.['7d']?.percent_change ?? null;
  const miniSparkColor = trend7dPct != null ? (trend7dPct >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--tMut)';

  // Price trend sparkline points
  const trendSparkPoints = trendPeriods
    .map((p, i) => {
      const entry = (condTrends as Record<string, { price_change: number; percent_change: number } | undefined>)[p];
      return entry ? { x: i, y: entry.price_change } : null;
    })
    .filter((p): p is { x: number; y: number } => p !== null);

  // Trend sparkline color based on most recent segment direction
  const latestTrendDir = trendSparkPoints.length >= 2
    ? trendSparkPoints[trendSparkPoints.length - 1].y - trendSparkPoints[trendSparkPoints.length - 2].y
    : 0;
  const trendLineColor = latestTrendDir >= 0 ? 'var(--green)' : 'var(--red)';

  // Liquidity composite for activity indicator
  const liqComposite = liquidity?.composite ?? deal.liquidity_score ?? null;
  const liqGrade = (liquidity?.grade ?? deal.liquidity_grade) as LiquidityGrade | null;

  // Grail-tier profit background
  const profitBg = tier === 'GRAIL'
    ? 'linear-gradient(135deg, rgba(255,107,53,0.08), rgba(52,211,153,0.08), rgba(255,59,111,0.06))'
    : tier === 'HIT'
      ? 'rgba(52,211,153,0.06)'
      : 'transparent';

  return (
    <div ref={panelRef} className="detail-panel" style={{
      width: 440, borderLeft: '1px solid var(--brd)', background: 'var(--bg1)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      overflowY: 'auto', overflowX: 'hidden',
    }}>
      <style>{PANEL_STYLES}</style>

      {/* Review flash overlay */}
      {reviewFlash !== 'none' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none',
          background: reviewFlash === 'correct' ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
          animation: 'reviewFlash 0.4s ease-out forwards',
        }} />
      )}

      {/* ═══ HEADER ═══ */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 2,
        padding: '12px 16px 10px',
        borderBottom: '1px solid var(--brd)',
        background: 'var(--bg1)',
      }}>
        {/* Row: tier pill + close button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: 20,
            background: tierPill.bg, border: `1px solid ${tierPill.border}`,
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
            color: tierPill.color, letterSpacing: 0.5,
          }}>
            <TierBadge tier={tier as Tier} size="sm" />
            {tierPill.label}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--tMut)', fontSize: 18, padding: 4, cursor: 'pointer',
          }}>{'\u00D7'}</button>
        </div>

        {/* Card name */}
        <div style={{
          fontSize: '1.5rem', fontWeight: 800, color: 'var(--tMax)',
          lineHeight: 1.15, marginBottom: 6,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {deal.card_name || deal.cardName || deal.ebay_title}
        </div>

        {/* Metadata line: logo + set name + code + number + condition */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {deal.expansion_logo && (
            <img src={deal.expansion_logo} alt="" style={{ height: 16, width: 'auto', maxWidth: 60, objectFit: 'contain', opacity: 0.85 }} />
          )}
          {deal.expansion_name && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: 'var(--tSec)' }}>
              {deal.expansion_name}
              {deal.expansion_code && <span style={{ color: 'var(--tMut)' }}> ({deal.expansion_code})</span>}
            </span>
          )}
          {deal.card_number && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: 'var(--tMut)' }}>
              {'\u00B7'} #{deal.card_number}
            </span>
          )}
          <CondPill condition={deal.condition as Condition} />
          {deal.is_graded && (
            <span style={{
              padding: '1px 5px', borderRadius: 4, fontSize: 10,
              border: '1px solid var(--blue)', color: 'var(--blue)',
              fontFamily: "var(--font-mono)", fontWeight: 500,
            }}>
              {deal.grading_company ? `${deal.grading_company} ${deal.grade}` : 'GRADED'}
            </span>
          )}
        </div>

        {/* Context line: release year + card count + era */}
        {(releaseYear || deal.expansion_card_count || era) && (
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, color: 'var(--tMut)',
            marginTop: 4, letterSpacing: 0.3,
          }}>
            {[
              releaseYear,
              deal.expansion_card_count ? `${deal.expansion_card_count} cards` : null,
              era,
            ].filter(Boolean).join(' \u00B7 ')}
          </div>
        )}
      </div>

      <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column' }}>

        {/* ═══ SIDE-BY-SIDE VISUAL COMPARISON ═══ */}
        <div style={{
          marginTop: 12, borderRadius: 8, padding: 8,
          border: '1px solid var(--brd)',
          background: `
            repeating-linear-gradient(0deg, transparent, transparent 7px, rgba(255,255,255,0.015) 7px, rgba(255,255,255,0.015) 8px),
            repeating-linear-gradient(90deg, transparent, transparent 7px, rgba(255,255,255,0.015) 7px, rgba(255,255,255,0.015) 8px),
            var(--bg0)
          `,
          position: 'relative',
        }}>
          {imageMode === 'side' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              {/* eBay listing image */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: 'var(--tMut)', letterSpacing: 1 }}>EBAY LISTING</span>
                {deal.ebay_image_url ? (
                  <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 4, cursor: 'zoom-in' }}
                    onClick={() => setZoomedImage(zoomedImage === 'ebay' ? 'none' : 'ebay')}>
                    <img src={deal.ebay_image_url} alt="eBay listing" style={{
                      width: '100%', height: 150, objectFit: 'contain',
                      background: 'var(--bg1)',
                      transform: zoomedImage === 'ebay' ? 'scale(1.8)' : 'scale(1)',
                      transformOrigin: 'center center',
                      transition: 'transform 0.3s ease',
                    }} />
                  </div>
                ) : (
                  <div style={{
                    width: '100%', height: 150, borderRadius: 4,
                    background: 'var(--bg1)', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 4,
                    color: 'var(--tMut)', fontSize: 10, fontFamily: "var(--font-mono)",
                  }}>
                    <span style={{
                      padding: '2px 6px', borderRadius: 4, fontSize: 9,
                      background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
                      color: 'var(--amber)',
                    }}>{'\u26A0'}</span>
                    No listing image
                  </div>
                )}
              </div>

              {/* Overlay toggle */}
              <button
                onClick={() => setImageMode('overlay')}
                title="Switch to overlay comparison"
                style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  zIndex: 5, width: 24, height: 24, borderRadius: 12,
                  background: 'var(--bg1)', border: '1px solid var(--brd)',
                  color: 'var(--tMut)', fontSize: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "var(--font-mono)",
                }}
              >
                {'\u2194'}
              </button>

              {/* Scrydex reference image */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: 'var(--tMut)', letterSpacing: 1 }}>SCRYDEX REF</span>
                {deal.card_image_url ? (
                  <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 4, cursor: 'zoom-in' }}
                    onClick={() => setZoomedImage(zoomedImage === 'ref' ? 'none' : 'ref')}>
                    <img src={deal.card_image_url} alt="Scrydex reference" style={{
                      width: '100%', height: 150, objectFit: 'contain',
                      background: 'var(--bg1)',
                      transform: zoomedImage === 'ref' ? 'scale(1.8)' : 'scale(1)',
                      transformOrigin: 'center center',
                      transition: 'transform 0.3s ease',
                    }} />
                  </div>
                ) : (
                  <div style={{
                    width: '100%', height: 150, borderRadius: 4,
                    background: 'var(--bg1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--tMut)', fontSize: 10, fontFamily: "var(--font-mono)",
                  }}>
                    No ref
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Overlay mode */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: 'var(--tMut)', letterSpacing: 1 }}>OVERLAY</span>
                <button
                  onClick={() => setImageMode('side')}
                  style={{
                    padding: '2px 8px', borderRadius: 4,
                    background: 'var(--glass)', border: '1px solid var(--brd)',
                    color: 'var(--tMut)', fontSize: 9, cursor: 'pointer',
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Side-by-side
                </button>
              </div>
              <div style={{ position: 'relative', width: '100%', height: 180 }}>
                {deal.ebay_image_url && (
                  <img src={deal.ebay_image_url} alt="eBay listing" style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'contain', borderRadius: 4,
                  }} />
                )}
                {deal.card_image_url && (
                  <img src={deal.card_image_url} alt="Scrydex reference" style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'contain', borderRadius: 4,
                    opacity: 0.5,
                    mixBlendMode: 'screen',
                  }} />
                )}
              </div>
            </div>
          )}

          {/* No-image confidence warning */}
          {!deal.ebay_image_url && (
            <div style={{
              marginTop: 6, padding: '4px 8px', borderRadius: 4,
              background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
              fontFamily: "var(--font-mono)", fontSize: 9, color: 'var(--amber)',
              textAlign: 'center',
            }}>
              {'\u26A0'} No seller photo — visual confidence reduced
            </div>
          )}
        </div>

        {/* ═══ PROFIT HERO ═══ */}
        <div style={{ marginTop: 14 }}>
          <GradBorder>
            <div style={{
              padding: '16px 18px', textAlign: 'center',
              background: profitBg,
              backgroundSize: tier === 'GRAIL' ? '200% 200%' : undefined,
              animation: tier === 'GRAIL' ? 'grailPulse 6s ease infinite' : undefined,
              borderRadius: 9,
            }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 42, fontWeight: 800,
                color: 'var(--greenB)',
                textShadow: tier === 'GRAIL'
                  ? '0 0 30px rgba(255,107,53,0.3), 0 0 20px rgba(110,231,183,0.5)'
                  : tier === 'HIT'
                    ? '0 0 24px rgba(52,211,153,0.5)'
                    : '0 0 20px rgba(110,231,183,0.5)',
                lineHeight: 1,
              }}>
                {`+\u00A3${profitGbp.toFixed(2)}`}
              </div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 14, marginTop: 4,
                color: 'var(--green)', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
                <span>+{profitPct.toFixed(1)}%</span>
                {trendPoints.length >= 2 && (
                  <MiniSparkline points={trendPoints} color={miniSparkColor} width={40} height={14} />
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--tMut)', marginTop: 4 }}>
                No BS profit {'\u00B7'} Fees included
              </div>
            </div>
          </GradBorder>
        </div>

        {/* ═══ CTA: SNAG ON EBAY ═══ */}
        <button
          onClick={() => window.open(deal.ebay_url, '_blank')}
          onMouseEnter={() => setSnagHover(true)}
          onMouseLeave={() => setSnagHover(false)}
          style={{
            marginTop: 12, width: '100%', padding: '12px 0',
            borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, #34d399, #2dd4bf)',
            color: '#000', fontSize: 14, fontWeight: 800,
            letterSpacing: 0.5, cursor: 'pointer',
            transform: snagHover ? 'translateY(-2px)' : 'translateY(0)',
            boxShadow: snagHover ? '0 4px 16px rgba(52,211,153,0.35)' : 'none',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          {`SNAG ON EBAY \u2192`}
        </button>

        {/* ═══ NO BS PRICING ═══ */}
        <SectionHeader text="NO BS PRICING" />
        <PricingBreakdown deal={deal} profitGbp={profitGbp} />

        {/* ═══ MATCH CONFIDENCE ═══ */}
        {confidence && (
          <>
            <SectionHeader text="MATCH CONFIDENCE" />
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 800,
              color: (confidence.composite ?? 0) >= 0.85 ? 'var(--green)' : (confidence.composite ?? 0) >= 0.65 ? 'var(--amber)' : 'var(--red)',
              textShadow: `0 0 12px ${(confidence.composite ?? 0) >= 0.85 ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}`,
              marginBottom: 6,
            }}>
              {((confidence.composite ?? 0) * 100).toFixed(0)}%
            </div>
            <AnimatedBarRow label="Name" value={confidence.name} delay={0} />
            <AnimatedBarRow label="Number" value={confidence.number} delay={60} />
            <AnimatedBarRow label="Denom" value={confidence.denom} delay={120} />
            <AnimatedBarRow label="Expan" value={confidence.expansion} delay={180} />
            <AnimatedBarRow label="Variant" value={confidence.variant} delay={240} />
            <AnimatedBarRow label="Extract" value={confidence.extract} delay={300} />
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 10, color: 'var(--tMut)',
              marginTop: 8, fontStyle: 'italic',
            }}>
              Tap images above to verify visually.
            </div>
          </>
        )}

        {/* ═══ LIQUIDITY ═══ */}
        {(liquidity || deal.liquidity_score != null) && (
          <>
            <SectionHeader text="LIQUIDITY" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800,
                color: (liqComposite ?? 0) >= 0.7 ? 'var(--green)' : (liqComposite ?? 0) >= 0.4 ? 'var(--amber)' : 'var(--red)',
              }}>
                {((liqComposite ?? 0) * 100).toFixed(0)}%
              </span>
              <LiqPill grade={liqGrade} />
            </div>
            {liquidity?.signals && (
              <>
                <BarRow label="Trend" value={liquidity.signals.trend} />
                <BarRow label="Prices" value={liquidity.signals.prices} />
                <BarRow label="Spread" value={liquidity.signals.spread} />
                <BarRow label="Supply" value={liquidity.signals.supply} />
                <BarRow label="Sold" value={liquidity.signals.sold} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <BarRow label="Velocity" value={liquidity.signals.velocity} />
                  </div>
                  {liquidity.signals.velocity == null && (
                    <button
                      onClick={handleVelocity}
                      disabled={velocityLoading}
                      style={{
                        padding: '2px 8px', borderRadius: 4,
                        background: 'var(--glass)', border: '1px solid var(--brd)',
                        color: 'var(--blue)',
                        fontFamily: "var(--font-mono)", fontSize: 9,
                        cursor: 'pointer', flexShrink: 0,
                        opacity: velocityLoading ? 0.5 : 1,
                      }}
                    >
                      {velocityLoading ? 'Fetching...' : 'Fetch \u2192 3cr'}
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ═══ COMPS BY CONDITION ═══ */}
        {variantPrices && Object.keys(variantPrices).length > 0 && (
          <>
            <SectionHeader text="COMPS BY CONDITION" />

            {/* Dot-plot strip chart */}
            <div style={{ marginBottom: 8 }}>
              <CompsDotPlot
                prices={variantPrices}
                buyPrice={deal.total_cost_gbp}
                activeCondition={deal.condition}
              />
            </div>

            {/* Table fallback with Spread column */}
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '20px 30px 1fr 1fr 1fr', gap: 4,
                padding: '3px 0', color: 'var(--tMut)',
              }}>
                <span />
                <span />
                <span>Low</span>
                <span>Market</span>
                <span>Spread</span>
              </div>
              {Object.entries(variantPrices).map(([cond, prices]) => {
                const isActive = cond.toUpperCase() === deal.condition?.toUpperCase();
                const spread = (prices as any).market - deal.total_cost_gbp;
                return (
                  <div key={cond} style={{
                    display: 'grid', gridTemplateColumns: '20px 30px 1fr 1fr 1fr', gap: 4, padding: '3px 0',
                    color: isActive ? 'var(--tMax)' : 'var(--tSec)',
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? 'rgba(52,211,153,0.04)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--green)' : '2px solid transparent',
                    paddingLeft: isActive ? 2 : 4,
                    borderRadius: 2,
                  }}>
                    <span style={{ color: isActive ? 'var(--green)' : 'transparent' }}>{'\u25CF'}</span>
                    <span>{cond.toUpperCase()}</span>
                    <span>{`\u00A3${((prices as any).low ?? 0).toFixed(2)}`}</span>
                    <span>{`\u00A3${((prices as any).market ?? 0).toFixed(2)}`}</span>
                    <span style={{
                      color: spread > 0 ? 'var(--green)' : spread < 0 ? 'var(--red)' : 'var(--tMut)',
                    }}>
                      {`${spread >= 0 ? '+' : ''}\u00A3${spread.toFixed(2)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ═══ PRICE TRENDS ═══ */}
        {Object.keys(condTrends).length > 0 && (
          <>
            <SectionHeader text="PRICE TRENDS" />
            {/* Sparkline chart */}
            {trendSparkPoints.length >= 2 && (
              <div style={{
                borderRadius: 6, padding: '6px 0',
                background: 'var(--glass)', border: '1px solid var(--brd)',
                marginBottom: 6,
              }}>
                <TrendSparkline
                  points={trendSparkPoints}
                  color={trendLineColor}
                  height={50}
                  annotations={[
                    ...((condTrends as any)?.['1d'] ? [{ label: '1d', value: `${((condTrends as any)['1d'].percent_change ?? 0) >= 0 ? '+' : ''}${((condTrends as any)['1d'].percent_change ?? 0).toFixed(1)}%` }] : []),
                    ...((condTrends as any)?.['7d'] ? [{ label: '7d', value: `${((condTrends as any)['7d'].percent_change ?? 0) >= 0 ? '+' : ''}${((condTrends as any)['7d'].percent_change ?? 0).toFixed(1)}%` }] : []),
                  ]}
                />
              </div>
            )}

            {/* Tabular fallback with GBP values */}
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {trendPeriods.map(period => {
                const entry = (condTrends as Record<string, { price_change: number; percent_change: number } | undefined>)[period];
                if (entry == null) return null;
                const priceChange = entry.price_change;
                const pctChange = entry.percent_change;
                const fxRate = deal.exchange_rate ?? 0.79;
                const gbpChange = priceChange * fxRate;
                const changeColor = pctChange >= 0 ? 'var(--green)' : 'var(--red)';
                return (
                  <div key={period} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                    <span style={{ width: 28, color: 'var(--tMut)' }}>{period}</span>
                    <span style={{ width: 70, color: changeColor }}>
                      {gbpChange >= 0 ? '+' : ''}{`\u00A3${Math.abs(gbpChange).toFixed(2)}`}
                    </span>
                    <span style={{ width: 50, color: changeColor, fontSize: 10 }}>
                      {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 10, color: changeColor }}>
                      {pctChange > 1 ? '\u2191' : pctChange < -1 ? '\u2193' : '\u2192'}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ═══ EXPANSION ═══ */}
        {deal.expansion_name && (
          <>
            <SectionHeader text="EXPANSION" />
            <div style={{
              padding: '10px', borderRadius: 8,
              background: 'var(--glass)', border: '1px solid var(--brd)',
            }}>
              {/* Expansion symbol + logo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                {deal.expansion_symbol && (
                  <img src={deal.expansion_symbol} alt="Set symbol" style={{
                    height: 28, width: 'auto', opacity: 0.9,
                  }} />
                )}
                {deal.expansion_logo ? (
                  <img src={deal.expansion_logo} alt={deal.expansion_name} style={{
                    height: 'auto', width: 'auto', maxWidth: 100, maxHeight: 32, objectFit: 'contain',
                  }} />
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tPri)' }}>
                    {deal.expansion_name}
                  </span>
                )}
              </div>

              {/* Set metadata */}
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: 'var(--tSec)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {deal.expansion_logo && (
                  <div>{deal.expansion_name}</div>
                )}
                <div style={{ color: 'var(--tMut)' }}>
                  {[
                    deal.expansion_code,
                    releaseYear ? `Released ${releaseYear}` : null,
                    deal.expansion_card_count ? `${deal.expansion_card_count} cards` : null,
                    era,
                  ].filter(Boolean).join(' \u00B7 ')}
                </div>

                {/* Activity indicator - TCG energy themed */}
                {liqGrade && (() => {
                  const activity = getActivityLevel(liqGrade);
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <span style={{ fontSize: 12 }}>{activity.icon}</span>
                      <span style={{ color: activity.color, fontSize: 10 }}>{activity.label}</span>
                    </div>
                  );
                })()}
              </div>

              {/* View in catalog link */}
              {deal.card_id && (
                <Link to={`/catalog/cards/${deal.card_id}`} style={{
                  fontSize: 11, marginTop: 8, display: 'inline-block',
                  fontFamily: "var(--font-mono)",
                }}>
                  {`View in Catalog \u2192`}
                </Link>
              )}
            </div>
          </>
        )}

        {/* ═══ REVIEW ═══ */}
        <SectionHeader text="REVIEW" />
        {reviewSaved ? (
          <div style={{
            padding: '8px 12px', borderRadius: 6,
            background: reviewState === 'correct' ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
            border: `1px solid ${reviewState === 'correct' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
            fontFamily: "var(--font-mono)", fontSize: 11,
            color: reviewState === 'correct' ? 'var(--green)' : 'var(--red)',
          }}>
            {reviewState === 'correct' ? '\u2713 Marked correct' : '\u2717 Marked wrong'}
            {deal.reviewed_at && (
              <span style={{ color: 'var(--tMut)', marginLeft: 8 }}>
                {new Date(deal.reviewed_at).toLocaleDateString()}
              </span>
            )}
          </div>
        ) : reviewState === 'picking' ? (
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: 'var(--tMut)', marginBottom: 6 }}>
              What was wrong?
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {REVIEW_REASONS.map((reason, i) => (
                <button key={reason.key} onClick={() => handleReview(false, reason.key)} style={{
                  padding: '5px 10px', borderRadius: 4,
                  background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
                  color: 'var(--red)', fontFamily: "var(--font-mono)", fontSize: 10,
                  cursor: 'pointer',
                  opacity: chipVisible ? 1 : 0,
                  transform: chipVisible ? 'translateY(0)' : 'translateY(6px)',
                  transition: `opacity 0.2s ease ${i * 40}ms, transform 0.2s ease ${i * 40}ms`,
                }}>
                  {reason.label}
                </button>
              ))}
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 9, color: 'var(--tMut)',
              marginTop: 8, fontStyle: 'italic',
            }}>
              Use the image comparison above to verify what went wrong.
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleReview(true)} style={{
                flex: 1, padding: '8px 0', borderRadius: 6,
                background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)',
                color: 'var(--green)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.06)')}
              >
                {'\u2713'} Correct
              </button>
              <button onClick={handleWrongClick} style={{
                flex: 1, padding: '8px 0', borderRadius: 6,
                background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
                color: 'var(--red)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.06)')}
              >
                {'\u2717'} Wrong
              </button>
            </div>
            {/* Mobile swipe hint */}
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 9, color: 'var(--tMut)',
              marginTop: 6, textAlign: 'center',
              display: 'none',
            }} className="swipe-hint">
              {`\u2190 swipe left = wrong \u00B7 swipe right = correct \u2192`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
