import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getDealDetail, reviewDeal, fetchVelocity } from '../api/deals';
import type { DealDetail, LiquidityGrade } from '../types/deals';
import ConfidenceRing from './ui/ConfidenceRing';
import FlipCard from './ui/FlipCard';
import LiqPill from './ui/LiqPill';
import { BarRow } from './ui/Bar';

/* ═══════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════ */

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GRAIL: { bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc", border: "#7c3aed" },
  HIT:   { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa", border: "#2563eb" },
  FLIP:  { bg: "rgba(34, 197, 94, 0.15)",  text: "#4ade80", border: "#16a34a" },
  SLEEP: { bg: "rgba(58, 64, 96, 0.15)",   text: "#8290a8", border: "#3a4060" },
};

const CONDITION_ORDER = ["DM", "HP", "MP", "LP", "NM"];

const REVIEW_REASONS = [
  { key: 'wrong_card', label: 'Wrong card' },
  { key: 'wrong_set', label: 'Wrong set' },
  { key: 'wrong_condition', label: 'Wrong condition' },
  { key: 'wrong_price', label: 'Price outdated' },
  { key: 'bad_image', label: 'Bad image' },
];

const COND_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  NM: { bg: "rgba(34,197,94,0.15)", text: "#4ade80", border: "#16a34a" },
  LP: { bg: "rgba(250,204,21,0.15)", text: "#facc15", border: "#ca8a04" },
  MP: { bg: "rgba(251,146,60,0.15)", text: "#fb923c", border: "#ea580c" },
  HP: { bg: "rgba(239,68,68,0.15)", text: "#ef4444", border: "#dc2626" },
  DM: { bg: "rgba(239,68,68,0.2)", text: "#fca5a5", border: "#ef4444" },
};

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

function getEraClassification(series: string | null, releaseDate: string | null): string {
  if (!releaseDate && !series) return '';
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
  if (series) {
    const s = series.toLowerCase();
    if (s.includes('scarlet') || s.includes('sword') || s.includes('sun & moon')) return 'Modern';
    if (s.includes('xy') || s.includes('black') || s.includes('diamond')) return 'Classic';
    if (s.includes('ex') || s.includes('base') || s.includes('gym') || s.includes('neo')) return 'Vintage';
  }
  if (year) {
    if (year >= 2019) return 'Modern';
    if (year >= 2013) return 'Classic';
    return 'Vintage';
  }
  return '';
}

/* ═══════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════ */

function MiniBar({ value, max = 100, color = "#7c3aed" }: { value: number; max?: number; color?: string }) {
  return (
    <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
      <div style={{
        width: `${Math.min((value / max) * 100, 100)}%`, height: "100%",
        borderRadius: 2, background: color, transition: "width 0.4s ease",
      }} />
    </div>
  );
}

function PanelTierBadge({ tier }: { tier: string }) {
  const t = TIER_COLORS[tier] || TIER_COLORS.HIT;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 4,
      background: t.bg, color: t.text, border: `1px solid ${t.border}`,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
      fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase",
    }}>
      {tier}
    </span>
  );
}

function ConditionBadge({ condition }: { condition: string }) {
  const c = COND_COLORS[condition] || COND_COLORS.NM;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 4,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
      fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase",
    }}>
      {condition}
    </span>
  );
}

/* ─── Section Header ─── */

function SectionHeader({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)",
      letterSpacing: "0.1em", textTransform: "uppercase",
      fontFamily: "'JetBrains Mono', monospace",
      padding: "14px 0 6px", marginTop: 8,
    }}>
      {text}
    </div>
  );
}

/* ─── Overview Tab ─── */

function OverviewTab({
  deal,
  reviewState,
  reviewSaved,
  chipVisible,
  onReview,
  onWrongClick,
}: {
  deal: DealDetail;
  reviewState: 'none' | 'correct' | 'wrong' | 'picking';
  reviewSaved: boolean;
  chipVisible: boolean;
  onReview: (correct: boolean, reason?: string) => void;
  onWrongClick: () => void;
}) {
  const [showFx, setShowFx] = useState(false);
  const profitGbp = deal.profit_gbp ?? 0;
  const confidence = deal.match_signals?.confidence;

  return (
    <div>
      {/* ═══ NO BS PRICING ═══ */}
      <SectionHeader text="NO BS PRICING" />
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
        {/* eBay price */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "rgba(255,255,255,0.6)" }}>
          <span>eBay price</span>
          <span>{`\u00A3${deal.ebay_price_gbp.toFixed(2)}`}</span>
        </div>
        {/* Shipping */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "rgba(255,255,255,0.6)" }}>
          <span>Shipping</span>
          <span>{`\u00A3${deal.ebay_shipping_gbp.toFixed(2)}`}</span>
        </div>
        {/* Fees */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "rgba(255,255,255,0.6)" }}>
          <span>Fees (inc.)</span>
          <span>{`\u00A3${(deal.buyer_prot_fee ?? 0).toFixed(2)}`}</span>
        </div>
        {/* Total cost */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "4px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontWeight: 600, color: "#e2e8f0" }}>
          <span>Total cost</span>
          <span>{`\u00A3${deal.total_cost_gbp.toFixed(2)}`}</span>
        </div>
        <div style={{ height: 8 }} />
        {/* Market price */}
        {deal.market_price_gbp != null && (
          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontWeight: 600, color: "#e2e8f0" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              Market price
              {deal.market_price_usd != null && (
                <button
                  onClick={() => setShowFx(!showFx)}
                  title="Show USD source + FX rate"
                  style={{
                    background: "none", border: "none", padding: 0,
                    color: "rgba(255,255,255,0.3)", fontSize: 10, cursor: "pointer",
                    fontFamily: "'JetBrains Mono', monospace",
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
          <div style={{ padding: "4px 12px", marginBottom: 2, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>USD source</span>
              <span>${deal.market_price_usd.toFixed(2)}</span>
            </div>
            {deal.exchange_rate != null && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>FX rate</span>
                <span>{`\u00D7${deal.exchange_rate.toFixed(3)}`}</span>
              </div>
            )}
          </div>
        )}
        {/* Profit summary */}
        <div style={{
          marginTop: 6, padding: "6px 10px", borderRadius: 6,
          border: "1px solid rgba(124,58,237,0.2)",
          background: "rgba(124,58,237,0.1)",
          display: "flex", justifyContent: "space-between",
        }}>
          <span style={{ color: "rgba(255,255,255,0.6)" }}>Profit</span>
          <span style={{ color: "#4ade80", fontWeight: 700 }}>{`+\u00A3${profitGbp.toFixed(2)}`}</span>
        </div>
      </div>

      {/* ═══ MATCH CONFIDENCE ═══ */}
      {confidence && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <SectionHeader text="MATCH CONFIDENCE" />
            <ConfidenceRing value={Math.round((confidence.composite ?? 0) * 100)} size={38} />
          </div>
          {(["name", "number", "denom", "expansion", "variant", "extract"] as const).map((signal) => {
            const raw = confidence[signal === "expansion" ? "expansion" : signal as keyof typeof confidence] as number | undefined;
            const pct = Math.round((raw ?? 0) * 100);
            const color = pct >= 90 ? "#4ade80" : pct >= 50 ? "#facc15" : "#ef4444";
            const icon = pct >= 90 ? "\u2713" : "\u2014";
            const labelMap: Record<string, string> = {
              name: "name", number: "number", denom: "denom",
              expansion: "expan", variant: "variant", extract: "extract",
            };
            return (
              <div key={signal} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "3px 0",
              }}>
                <span style={{
                  width: 60, fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "capitalize",
                }}>
                  {labelMap[signal]}
                </span>
                <div style={{ flex: 1 }}>
                  <MiniBar value={pct} max={100} color={color} />
                </div>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  fontWeight: 700, color, width: 32, textAlign: "right",
                  fontFeatureSettings: "'tnum' 1",
                }}>
                  {pct}%
                </span>
                <span style={{ fontSize: 10, color, width: 14, textAlign: "center" }}>{icon}</span>
              </div>
            );
          })}
        </>
      )}

      {/* ═══ REVIEW ═══ */}
      <SectionHeader text="REVIEW" />
      {reviewSaved ? (
        <div style={{
          padding: "8px 12px", borderRadius: 6,
          background: reviewState === "correct" ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)",
          border: `1px solid ${reviewState === "correct" ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: reviewState === "correct" ? "#4ade80" : "#ef4444",
        }}>
          {reviewState === "correct" ? "\u2713 Marked correct" : "\u2717 Marked wrong"}
          {deal.reviewed_at && (
            <span style={{ color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>
              {new Date(deal.reviewed_at).toLocaleDateString()}
            </span>
          )}
        </div>
      ) : reviewState === "picking" ? (
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: "rgba(255,255,255,0.3)", marginBottom: 6,
          }}>
            What was wrong?
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {REVIEW_REASONS.map((reason, i) => (
              <button key={reason.key} onClick={() => onReview(false, reason.key)} style={{
                padding: "5px 10px", borderRadius: 4,
                background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)",
                color: "#ef4444", fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                cursor: "pointer",
                opacity: chipVisible ? 1 : 0,
                transform: chipVisible ? "translateY(0)" : "translateY(6px)",
                transition: `opacity 0.2s ease ${i * 40}ms, transform 0.2s ease ${i * 40}ms`,
              }}>
                {reason.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => onReview(true)} style={{
            flex: 1, padding: "8px 0", borderRadius: 6,
            background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)",
            color: "#4ade80", fontWeight: 600, fontSize: 13, cursor: "pointer",
            transition: "background 0.15s ease",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(52,211,153,0.12)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(52,211,153,0.06)")}
          >
            {"\u2713"} Correct
          </button>
          <button onClick={onWrongClick} style={{
            flex: 1, padding: "8px 0", borderRadius: 6,
            background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)",
            color: "#ef4444", fontWeight: 600, fontSize: 13, cursor: "pointer",
            transition: "background 0.15s ease",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(248,113,113,0.12)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(248,113,113,0.06)")}
          >
            {"\u2717"} Wrong
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Comps Tab ─── */

function CompsTab({
  deal,
  velocityLoading,
  onVelocity,
}: {
  deal: DealDetail;
  velocityLoading: boolean;
  onVelocity: () => void;
}) {
  const variantPrices = deal.variant_prices;
  const liquidity = deal.match_signals?.liquidity;
  const liqComposite = liquidity?.composite ?? deal.liquidity_score ?? null;
  const liqGrade = (liquidity?.grade ?? deal.liquidity_grade) as LiquidityGrade | null;

  // Determine max market price for bar scaling
  const allMarketPrices = variantPrices
    ? Object.values(variantPrices).map(p => p.market).filter(v => v > 0)
    : [];
  const maxMarket = allMarketPrices.length > 0 ? Math.max(...allMarketPrices) : 1;

  return (
    <div>
      {/* ═══ COMPS BY CONDITION ═══ */}
      {variantPrices && Object.keys(variantPrices).length > 0 && (
        <>
          <SectionHeader text="COMPS BY CONDITION" />

          {/* Horizontal bar chart */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {CONDITION_ORDER.map(cond => {
              const prices = variantPrices[cond] || variantPrices[cond.toLowerCase()];
              if (!prices) return null;
              const isActive = cond.toUpperCase() === deal.condition?.toUpperCase();
              const barWidth = maxMarket > 0 ? (prices.market / maxMarket) * 100 : 0;
              return (
                <div key={cond} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "3px 0",
                  background: isActive ? "rgba(124,58,237,0.08)" : "transparent",
                  borderRadius: 4,
                  borderLeft: isActive ? "2px solid #7c3aed" : "2px solid transparent",
                  paddingLeft: 6,
                }}>
                  <span style={{
                    width: 28, fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10, fontWeight: isActive ? 700 : 400,
                    color: isActive ? "#c084fc" : "rgba(255,255,255,0.5)",
                  }}>
                    {cond}
                  </span>
                  <div style={{
                    flex: 1, height: 6, borderRadius: 3,
                    background: "rgba(255,255,255,0.06)",
                  }}>
                    <div style={{
                      width: `${Math.min(barWidth, 100)}%`, height: "100%",
                      borderRadius: 3,
                      background: isActive ? "#7c3aed" : "rgba(255,255,255,0.15)",
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    fontWeight: isActive ? 700 : 400, width: 52, textAlign: "right",
                    color: isActive ? "#c084fc" : "rgba(255,255,255,0.5)",
                  }}>
                    {`\u00A3${prices.market.toFixed(2)}`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Comp table */}
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
            <div style={{
              display: "grid", gridTemplateColumns: "40px 1fr 1fr 1fr", gap: 4,
              padding: "3px 0", color: "rgba(255,255,255,0.3)",
            }}>
              <span />
              <span>Low</span>
              <span>Market</span>
              <span>Spread</span>
            </div>
            {CONDITION_ORDER.map(cond => {
              const prices = variantPrices[cond] || variantPrices[cond.toLowerCase()];
              if (!prices) return null;
              const isActive = cond.toUpperCase() === deal.condition?.toUpperCase();
              const spread = prices.market - deal.total_cost_gbp;
              return (
                <div key={cond} style={{
                  display: "grid", gridTemplateColumns: "40px 1fr 1fr 1fr", gap: 4,
                  padding: "3px 0",
                  color: isActive ? "#e2e8f0" : "rgba(255,255,255,0.5)",
                  fontWeight: isActive ? 600 : 400,
                  background: isActive ? "rgba(124,58,237,0.06)" : "transparent",
                  borderLeft: isActive ? "2px solid #7c3aed" : "2px solid transparent",
                  paddingLeft: isActive ? 4 : 6,
                  borderRadius: 2,
                }}>
                  <span>{cond}</span>
                  <span>{`\u00A3${(prices.low ?? 0).toFixed(2)}`}</span>
                  <span>{`\u00A3${(prices.market ?? 0).toFixed(2)}`}</span>
                  <span style={{
                    color: spread > 0 ? "#4ade80" : spread < 0 ? "#ef4444" : "rgba(255,255,255,0.3)",
                  }}>
                    {`${spread >= 0 ? "+" : ""}\u00A3${spread.toFixed(2)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ LIQUIDITY ═══ */}
      {(liquidity || deal.liquidity_score != null) && (
        <>
          <SectionHeader text="LIQUIDITY" />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 800,
              color: (liqComposite ?? 0) >= 0.7 ? "#4ade80" : (liqComposite ?? 0) >= 0.4 ? "#facc15" : "#ef4444",
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
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <BarRow label="Velocity" value={liquidity.signals.velocity} />
                </div>
                {liquidity.signals.velocity == null && (
                  <button
                    onClick={onVelocity}
                    disabled={velocityLoading}
                    style={{
                      padding: "2px 8px", borderRadius: 4,
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                      color: "#60a5fa",
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                      cursor: "pointer", flexShrink: 0,
                      opacity: velocityLoading ? 0.5 : 1,
                    }}
                  >
                    {velocityLoading ? "Fetching..." : "Fetch \u2192 3cr"}
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Trends Tab ─── */

function TrendsTab({ deal }: { deal: DealDetail }) {
  const variantTrends = deal.variant_trends;
  const condTrends = variantTrends && deal.condition
    ? (variantTrends[deal.condition] || variantTrends[deal.condition?.toLowerCase()] || {})
    : {};
  const trendPeriods = ["1d", "7d", "30d", "90d"] as const;

  // Build sparkline points
  const sparkPoints: { x: number; y: number }[] = [];
  trendPeriods.forEach((p, i) => {
    const entry = (condTrends as Record<string, { price_change: number; percent_change: number } | undefined>)[p];
    if (entry) sparkPoints.push({ x: i, y: entry.price_change });
  });

  const latestDir = sparkPoints.length >= 2
    ? sparkPoints[sparkPoints.length - 1].y - sparkPoints[sparkPoints.length - 2].y
    : 0;
  const sparkColor = latestDir >= 0 ? "#4ade80" : "#ef4444";

  // Era
  const era = getEraClassification(deal.expansion_series ?? null, deal.expansion_release_date ?? null);
  const releaseYear = deal.expansion_release_date ? new Date(deal.expansion_release_date).getFullYear() : null;

  // Mini sparkline SVG
  function renderSparkline() {
    if (sparkPoints.length < 2) return null;
    const values = sparkPoints.map(p => p.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const svgW = 260;
    const svgH = 50;
    const pad = 4;
    const w = svgW - pad * 2;
    const h = svgH - pad * 2;

    const d = sparkPoints.map((p, i) => {
      const x = pad + (i / (sparkPoints.length - 1)) * w;
      const y = pad + h - ((p.y - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

    const lastX = pad + w;
    const firstX = pad;
    const areaD = `${d} L${lastX.toFixed(1)},${(pad + h).toFixed(1)} L${firstX.toFixed(1)},${(pad + h).toFixed(1)} Z`;

    return (
      <div style={{
        borderRadius: 6, padding: "6px 0", marginBottom: 8,
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" style={{ display: "block" }}>
          <defs>
            <linearGradient id="trendAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={sparkColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={sparkColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#trendAreaFill)" />
          <path d={d} fill="none" stroke={sparkColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  return (
    <div>
      {/* ═══ PRICE TRENDS ═══ */}
      <SectionHeader text="PRICE TRENDS" />

      {/* Mini sparkline */}
      {renderSparkline()}

      {/* Period grid 2x2 */}
      {Object.keys(condTrends).length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16,
        }}>
          {trendPeriods.map(period => {
            const entry = (condTrends as Record<string, { price_change: number; percent_change: number } | undefined>)[period];
            if (!entry) return (
              <div key={period} style={{
                padding: "8px 10px", borderRadius: 6,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: "rgba(255,255,255,0.3)", marginBottom: 2,
                }}>
                  {period}
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: "rgba(255,255,255,0.2)",
                }}>
                  --
                </div>
              </div>
            );
            const fxRate = deal.exchange_rate ?? 0.79;
            const gbpChange = entry.price_change * fxRate;
            const pctChange = entry.percent_change;
            const changeColor = "#4ade80";
            return (
              <div key={period} style={{
                padding: "8px 10px", borderRadius: 6,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: "rgba(255,255,255,0.3)", marginBottom: 2,
                }}>
                  {period}
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
                  color: changeColor,
                }}>
                  {gbpChange >= 0 ? "+" : ""}{`\u00A3${Math.abs(gbpChange).toFixed(2)}`}
                </div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: changeColor, marginTop: 1,
                }}>
                  {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ EXPANSION ═══ */}
      {deal.expansion_name && (
        <>
          <SectionHeader text="EXPANSION" />
          <div style={{
            padding: "10px", borderRadius: 8,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{
              fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 14, fontWeight: 700,
              color: "#e2e8f0", marginBottom: 4,
            }}>
              {deal.expansion_name}
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: "rgba(255,255,255,0.4)", display: "flex", flexDirection: "column", gap: 2,
            }}>
              {releaseYear && <div>Released {releaseYear}</div>}
              {era && <div>Era: {era}</div>}
              {deal.expansion_card_count && <div>{deal.expansion_card_count} cards in set</div>}
            </div>
            {deal.card_id && (
              <Link to={`/catalog/cards/${deal.card_id}`} style={{
                fontSize: 11, marginTop: 8, display: "inline-block",
                fontFamily: "'JetBrains Mono', monospace",
                color: "#7c3aed", textDecoration: "none",
              }}>
                {`View in Catalog \u2192`}
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

interface DealPanelProps {
  dealId: string | null;
  onClose: () => void;
}

export default function DealPanel({ dealId, onClose }: DealPanelProps) {
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'overview' | 'comps' | 'trends'>('overview');
  const [reviewState, setReviewState] = useState<'none' | 'correct' | 'wrong' | 'picking'>('none');
  const [reviewSaved, setReviewSaved] = useState(false);
  const [velocityLoading, setVelocityLoading] = useState(false);
  const [reviewFlash, setReviewFlash] = useState<'none' | 'correct' | 'wrong'>('none');
  const [chipVisible, setChipVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /* ─── Lifecycle: fetch deal on dealId change ─── */
  useEffect(() => {
    if (!dealId) {
      setDeal(null); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setDeal(null); // eslint-disable-line react-hooks/set-state-in-effect
    setTab('overview'); // eslint-disable-line react-hooks/set-state-in-effect
    setReviewState('none'); // eslint-disable-line react-hooks/set-state-in-effect
    setReviewSaved(false); // eslint-disable-line react-hooks/set-state-in-effect
    setChipVisible(false); // eslint-disable-line react-hooks/set-state-in-effect
    setReviewFlash('none'); // eslint-disable-line react-hooks/set-state-in-effect
    let cancelled = false;
    getDealDetail(dealId).then(d => {
      if (cancelled) return;
      setDeal(d);
      if (d.reviewed_at) {
        setReviewState(d.is_correct_match ? 'correct' : 'wrong');
        setReviewSaved(true);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dealId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Handlers ─── */
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

  /* ─── Empty State ─── */
  if (!dealId) {
    return (
      <div style={{
        width: 280, borderLeft: "1px solid rgba(255,255,255,0.06)",
        background: "#0d0f1a",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        color: "rgba(255,255,255,0.3)", gap: 12, flexShrink: 0, height: "100%",
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: "rgba(255,255,255,0.03)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36, color: "rgba(255,255,255,0.15)",
        }}>
          {"\u25CE"}
        </div>
        <span style={{
          fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 14,
          fontWeight: 600, color: "rgba(255,255,255,0.4)", textAlign: "center",
        }}>
          Select a deal to inspect
        </span>
        <span style={{
          fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 12,
          color: "rgba(255,255,255,0.2)", textAlign: "center",
        }}>
          Click any row to view full analysis
        </span>
      </div>
    );
  }

  /* ─── Loading State ─── */
  if (loading) {
    return (
      <div style={{
        width: 280, borderLeft: "1px solid rgba(255,255,255,0.06)",
        background: "#0d0f1a",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "rgba(255,255,255,0.3)", flexShrink: 0, height: "100%",
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          animation: "pulse 1.5s infinite",
        }}>
          Loading...
        </span>
      </div>
    );
  }

  if (!deal) return null;

  /* ─── Derived data ─── */
  const tier = deal.tier || "FLIP";
  const tierColor = TIER_COLORS[tier] || TIER_COLORS.FLIP;
  const profitGbp = deal.profit_gbp ?? 0;
  const cardName = deal.card_name || deal.cardName || deal.ebay_title;
  const releaseYear = deal.expansion_release_date ? new Date(deal.expansion_release_date).getFullYear() : null;

  const tabItems: { key: 'overview' | 'comps' | 'trends'; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'comps', label: 'Comps' },
    { key: 'trends', label: 'Trends' },
  ];

  /* ─── Main Render ─── */
  return (
    <div
      ref={panelRef}
      style={{
        display: "flex", flexDirection: "column", height: "100%",
        animation: "panelSlide 0.3s ease",
        width: 280, borderLeft: "1px solid rgba(255,255,255,0.06)",
        background: "#0d0f1a", flexShrink: 0, overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes panelSlide {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes reviewFlash {
          0% { opacity: 0.8; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* Review flash overlay */}
      {reviewFlash !== "none" && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100, pointerEvents: "none",
          background: reviewFlash === "correct" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
          animation: "reviewFlash 0.4s ease-out forwards",
        }} />
      )}

      {/* ═══ HEADER ═══ */}
      <div style={{ padding: 20, flexShrink: 0 }}>
        {/* Row: badges + close */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PanelTierBadge tier={tier} />
            <ConditionBadge condition={deal.condition} />
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.3)",
            fontSize: 18, padding: 4, cursor: "pointer", lineHeight: 1,
          }}>
            {"\u2715"}
          </button>
        </div>

        {/* FlipCard */}
        <FlipCard
          ebayImage={deal.ebay_image_url}
          refImage={deal.card_image_url}
          name={cardName || ""}
          tierBorder={tierColor.border}
        />

        {/* Card name */}
        <h2 style={{
          fontSize: 22, fontWeight: 800, color: "#e2e8f0",
          textAlign: "center", margin: "8px 0 4px",
          fontFamily: "'IBM Plex Sans', sans-serif",
          lineHeight: 1.15,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {cardName}
        </h2>

        {/* Metadata line */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: "rgba(255,255,255,0.4)", textAlign: "center",
        }}>
          {[
            deal.expansion_name,
            deal.card_number ? `#${deal.card_number}` : null,
            releaseYear,
          ].filter(Boolean).join(" \u00B7 ")}
        </div>
      </div>

      {/* ═══ PROFIT HERO ═══ */}
      <div style={{
        margin: "16px 20px", padding: 20, borderRadius: 14,
        background: `linear-gradient(135deg, ${tierColor.bg}, rgba(124,58,237,0.08))`,
        border: `1px solid ${tierColor.border}22`,
        textAlign: "center",
      }}>
        <div style={{
          fontSize: 36, fontWeight: 900, color: tierColor.text,
          fontFamily: "'JetBrains Mono', monospace", lineHeight: 1,
        }}>
          {`+\u00A3${profitGbp.toFixed(2)}`}
        </div>
        <div style={{
          fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          No BS profit {"\u00B7"} Fees included
        </div>
      </div>

      {/* ═══ SNAG BUTTON ═══ */}
      <div style={{ padding: "0 20px" }}>
        <a
          href={deal.ebay_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block", width: "100%", padding: "10px 0",
            borderRadius: 8, border: "none",
            background: "#7c3aed", color: "#ffffff",
            fontSize: 13, fontWeight: 700, textAlign: "center",
            letterSpacing: "0.04em", cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
            textTransform: "uppercase", textDecoration: "none",
            transition: "background 0.15s ease",
          }}
        >
          SNAG ON EBAY {"\u2192"}
        </a>
      </div>

      {/* ═══ TABS ═══ */}
      <div style={{
        padding: "16px 20px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", gap: 0,
      }}>
        {tabItems.map(t => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: "8px 0", background: "none", border: "none",
                borderBottom: isActive ? "2px solid #7c3aed" : "2px solid transparent",
                color: isActive ? "#c084fc" : "rgba(255,255,255,0.3)",
                fontSize: 12, fontWeight: isActive ? 700 : 500, cursor: "pointer",
                fontFamily: "'IBM Plex Sans', sans-serif",
                transition: "color 0.15s ease, border-color 0.15s ease",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ═══ TAB CONTENT ═══ */}
      <div style={{
        flex: 1, overflow: "auto", padding: "16px 20px 20px",
      }}>
        {tab === "overview" && (
          <OverviewTab
            deal={deal}
            reviewState={reviewState}
            reviewSaved={reviewSaved}
            chipVisible={chipVisible}
            onReview={handleReview}
            onWrongClick={handleWrongClick}
          />
        )}
        {tab === "comps" && (
          <CompsTab
            deal={deal}
            velocityLoading={velocityLoading}
            onVelocity={handleVelocity}
          />
        )}
        {tab === "trends" && (
          <TrendsTab deal={deal} />
        )}
      </div>
    </div>
  );
}
