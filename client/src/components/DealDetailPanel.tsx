import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TierBadge from './ui/TierBadge';
import CondPill from './ui/CondPill';
import LiqPill from './ui/LiqPill';
import { BarRow } from './ui/Bar';
import GradBorder from './ui/GradBorder';
import TrendArrow from './ui/TrendArrow';
import { getDealDetail, reviewDeal, fetchVelocity } from '../api/deals';
import type { DealDetail, Tier, Condition, LiquidityGrade } from '../types/deals';

const TIER_CONTEXT: Record<string, string> = {
  GRAIL: 'GRAIL territory',
  HIT: 'Solid hit',
  FLIP: 'Quick flip',
  SLEEP: 'Sleeper',
};

function SectionHeader({ text }: { text: string }) {
  return (
    <div className="section-header" style={{ padding: '14px 0 6px', marginTop: 8 }}>{text}</div>
  );
}

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

  useEffect(() => {
    if (!dealId) { setDeal(null); return; }
    setLoading(true);
    setReviewState('none');
    setReviewSaved(false);
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
    try {
      await reviewDeal(deal.deal_id, correct, reason);
      setReviewState(correct ? 'correct' : 'wrong');
      setReviewSaved(true);
    } catch { /* silent */ }
  };

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
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 1, textAlign: 'center' }}>
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
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, animation: 'pulse 1.5s infinite' }}>Loading...</span>
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

  return (
    <div className="detail-panel" style={{
      width: 440, borderLeft: '1px solid var(--brd)', background: 'var(--bg1)',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      overflowY: 'auto', overflowX: 'hidden',
    }}>
      {/* 8.1 Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 2,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderBottom: '1px solid var(--brd)',
        background: 'var(--bg1)',
      }}>
        <TierBadge tier={deal.tier as Tier} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--tMax)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {deal.card_name || deal.cardName || deal.ebay_title}
          </div>
          {deal.card_number && (
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--tMut)' }}>#{deal.card_number}</span>
          )}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--tMut)', fontSize: 18, padding: 4,
        }}>×</button>
      </div>

      <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column' }}>
        {/* Images */}
        {deal.ebay_image_url && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <img src={deal.ebay_image_url} alt="eBay" style={{
              flex: 1, height: 180, objectFit: 'contain', borderRadius: 6,
              background: 'var(--glass)',
            }} />
          </div>
        )}

        {/* Card info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {deal.expansion_name && (
            <span style={{ fontSize: 12, color: 'var(--tMut)' }}>{deal.expansion_name}</span>
          )}
          <CondPill condition={deal.condition as Condition} />
          <LiqPill grade={deal.liquidity_grade as LiquidityGrade} />
          {deal.is_graded && (
            <span style={{
              padding: '1px 5px', borderRadius: 4, fontSize: 10,
              border: '1px solid var(--blue)', color: 'var(--blue)',
              fontFamily: "'DM Mono', monospace", fontWeight: 500,
            }}>
              {deal.grading_company ? `${deal.grading_company} ${deal.grade}` : 'GRADED'}
            </span>
          )}
        </div>

        {/* 8.2 Profit Hero */}
        <div style={{ marginTop: 14 }}>
          <GradBorder>
            <div style={{ padding: '16px 18px', textAlign: 'center' }}>
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: 42, fontWeight: 800,
                color: 'var(--greenB)',
                textShadow: '0 0 20px rgba(110,231,183,0.5)',
                lineHeight: 1,
              }}>
                +£{profitGbp.toFixed(2)}
              </div>
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: 14, marginTop: 4,
                color: 'var(--green)', fontWeight: 600,
              }}>
                +{profitPct.toFixed(1)}% · {TIER_CONTEXT[deal.tier] || deal.tier}
              </div>
              <div style={{ fontSize: 10, color: 'var(--tMut)', marginTop: 4 }}>
                No BS profit · Fees included
              </div>
            </div>
          </GradBorder>
        </div>

        {/* 8.3 CTA */}
        <button
          onClick={() => window.open(deal.ebay_url, '_blank')}
          style={{
            marginTop: 12, width: '100%', padding: '12px 0',
            borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, #34d399, #2dd4bf)',
            color: '#000', fontSize: 14, fontWeight: 800,
            letterSpacing: 0.5,
          }}
        >
          SNAG ON EBAY →
        </button>

        {/* 8.4 No BS Pricing */}
        <SectionHeader text="NO BS PRICING" />
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
          <PriceRow label="eBay price" value={`£${deal.ebay_price_gbp.toFixed(2)}`} />
          <PriceRow label="Shipping" value={`£${deal.ebay_shipping_gbp.toFixed(2)}`} />
          <PriceRow label="Fees (inc.)" value={`£${(deal.buyer_prot_fee ?? 0).toFixed(2)}`} />
          <div style={{ borderTop: '1px solid var(--brd)', margin: '4px 0' }} />
          <PriceRow label="Total cost" value={`£${deal.total_cost_gbp.toFixed(2)}`} bold />
          <div style={{ height: 8 }} />
          {deal.market_price_usd != null && (
            <PriceRow label="Market (USD)" value={`$${deal.market_price_usd.toFixed(2)}`} />
          )}
          {deal.exchange_rate != null && (
            <PriceRow label="FX rate" value={`×${deal.exchange_rate.toFixed(3)}`} />
          )}
          {deal.market_price_gbp != null && (
            <PriceRow label="Market (GBP)" value={`£${deal.market_price_gbp.toFixed(2)}`} bold />
          )}
          <div style={{
            marginTop: 6, padding: '6px 10px', borderRadius: 6,
            border: '1px solid rgba(110,231,183,0.2)',
            background: 'rgba(110,231,183,0.04)',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span style={{ color: 'var(--tSec)' }}>Profit</span>
            <span style={{ color: 'var(--greenB)', fontWeight: 700 }}>+£{profitGbp.toFixed(2)}</span>
          </div>
        </div>

        {/* 8.5 Match Confidence */}
        {confidence && (
          <>
            <SectionHeader text="MATCH CONFIDENCE" />
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 800,
              color: (confidence.composite ?? 0) >= 0.85 ? 'var(--green)' : (confidence.composite ?? 0) >= 0.65 ? 'var(--amber)' : 'var(--red)',
              textShadow: `0 0 12px ${(confidence.composite ?? 0) >= 0.85 ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}`,
              marginBottom: 6,
            }}>
              {((confidence.composite ?? 0) * 100).toFixed(0)}%
            </div>
            <BarRow label="Name" value={confidence.name} />
            <BarRow label="Number" value={confidence.number} />
            <BarRow label="Denom" value={confidence.denom} />
            <BarRow label="Expan" value={confidence.expansion} />
            <BarRow label="Variant" value={confidence.variant} />
            <BarRow label="Extract" value={confidence.extract} />
          </>
        )}

        {/* 8.6 Liquidity */}
        {(liquidity || deal.liquidity_score != null) && (
          <>
            <SectionHeader text="LIQUIDITY" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 22, fontWeight: 800,
                color: (liquidity?.composite ?? deal.liquidity_score ?? 0) >= 0.7 ? 'var(--green)' : 'var(--amber)',
              }}>
                {((liquidity?.composite ?? deal.liquidity_score ?? 0) * 100).toFixed(0)}%
              </span>
              <LiqPill grade={(liquidity?.grade ?? deal.liquidity_grade) as LiquidityGrade} />
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
                        fontFamily: "'DM Mono', monospace", fontSize: 9,
                        cursor: 'pointer', flexShrink: 0,
                        opacity: velocityLoading ? 0.5 : 1,
                      }}
                    >
                      {velocityLoading ? 'Fetching...' : 'Fetch → 3cr'}
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* 8.7 Comps by Condition */}
        {variantPrices && Object.keys(variantPrices).length > 0 && (
          <>
            <SectionHeader text="COMPS BY CONDITION" />
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '20px 30px 1fr 1fr', gap: 4, padding: '3px 0', color: 'var(--tMut)' }}>
                <span />
                <span />
                <span>Low</span>
                <span>Market</span>
              </div>
              {Object.entries(variantPrices).map(([cond, prices]) => {
                const isActive = cond.toUpperCase() === deal.condition?.toUpperCase();
                return (
                  <div key={cond} style={{
                    display: 'grid', gridTemplateColumns: '20px 30px 1fr 1fr', gap: 4, padding: '3px 0',
                    color: isActive ? 'var(--tMax)' : 'var(--tSec)',
                    fontWeight: isActive ? 600 : 400,
                  }}>
                    <span style={{ color: isActive ? 'var(--green)' : 'transparent' }}>●</span>
                    <span>{cond.toUpperCase()}</span>
                    <span>£{((prices as any).low ?? 0).toFixed(2)}</span>
                    <span>£{((prices as any).market ?? 0).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 8.8 Price Trends */}
        {variantTrends && deal.condition && (
          (() => {
            const condTrends = variantTrends[deal.condition] || variantTrends[deal.condition?.toLowerCase()] || {};
            if (Object.keys(condTrends).length === 0) return null;
            return (
              <>
                <SectionHeader text="PRICE TRENDS" />
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {(['1d', '7d', '30d', '90d'] as const).map(period => {
                    const val = (condTrends as Record<string, number | undefined>)[period];
                    if (val == null) return null;
                    return (
                      <div key={period} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                        <span style={{ width: 28, color: 'var(--tMut)' }}>{period}</span>
                        <span style={{ width: 70, color: val >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {val >= 0 ? '+' : ''}£{Math.abs(val).toFixed(2)}
                        </span>
                        <TrendArrow value={val / 100} />
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()
        )}

        {/* 8.9 Expansion */}
        {deal.expansion_name && (
          <>
            <SectionHeader text="EXPANSION" />
            <div style={{ fontSize: 13, color: 'var(--tPri)' }}>
              {deal.expansion_name}
              {deal.expansion_code && <span style={{ color: 'var(--tMut)', fontSize: 11 }}> ({deal.expansion_code})</span>}
            </div>
            {deal.card_id && (
              <Link to={`/catalog/cards/${deal.card_id}`} style={{ fontSize: 11, marginTop: 4, display: 'inline-block' }}>
                View in Catalog →
              </Link>
            )}
          </>
        )}

        {/* 8.11 Review Actions */}
        <SectionHeader text="REVIEW" />
        {reviewSaved ? (
          <div style={{
            padding: '8px 12px', borderRadius: 6,
            background: reviewState === 'correct' ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
            border: `1px solid ${reviewState === 'correct' ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
            fontFamily: "'DM Mono', monospace", fontSize: 11,
            color: reviewState === 'correct' ? 'var(--green)' : 'var(--red)',
          }}>
            {reviewState === 'correct' ? '✓ Marked correct' : '✗ Marked wrong'}
            {deal.reviewed_at && (
              <span style={{ color: 'var(--tMut)', marginLeft: 8 }}>
                {new Date(deal.reviewed_at).toLocaleDateString()}
              </span>
            )}
          </div>
        ) : reviewState === 'picking' ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['wrong_card', 'wrong_set', 'wrong_variant', 'wrong_price'].map(reason => (
              <button key={reason} onClick={() => handleReview(false, reason)} style={{
                padding: '4px 10px', borderRadius: 4,
                background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
                color: 'var(--red)', fontFamily: "'DM Mono', monospace", fontSize: 10,
                cursor: 'pointer',
              }}>
                {reason.replace('wrong_', 'Wrong ').replace(/^\w/, c => c.toUpperCase())}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleReview(true)} style={{
              flex: 1, padding: '8px 0', borderRadius: 6,
              background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)',
              color: 'var(--green)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
              ✓ Correct
            </button>
            <button onClick={() => setReviewState('picking')} style={{
              flex: 1, padding: '8px 0', borderRadius: 6,
              background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
              color: 'var(--red)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
              ✗ Wrong
            </button>
          </div>
        )}
      </div>
    </div>
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
