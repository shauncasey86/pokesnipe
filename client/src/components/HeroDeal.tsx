import { useState, type FC } from 'react';
import TrustRing, { getTrust } from './TrustRing';
import SparklineChart from './SparklineChart';
import type { Deal, DealDetail } from '../types/deals';

/* ─── Tier config ─── */
const TIER: Record<string, { c: string; bg: string; b: string }> = {
  GRAIL: { c: '#c4b5fd', bg: 'rgba(196,181,253,0.10)', b: 'rgba(196,181,253,0.25)' },
  HIT: { c: '#60a5fa', bg: 'rgba(96,165,250,0.10)', b: 'rgba(96,165,250,0.25)' },
  FLIP: { c: '#f472b6', bg: 'rgba(244,114,182,0.10)', b: 'rgba(244,114,182,0.25)' },
  SLEEP: { c: '#3a4060', bg: 'rgba(58,64,96,0.10)', b: 'rgba(58,64,96,0.25)' },
};

const COND_CLASS: Record<string, string> = {
  NM: 'htag--c-nm',
  LP: 'htag--c-lp',
  MP: 'htag--c-lp',
  HP: 'htag--c-hp',
  DM: 'htag--c-hp',
};

function metricColor(v: number) {
  return v >= 70 ? 'var(--emerald)' : v >= 40 ? 'var(--amber)' : 'var(--coral)';
}

function liqColor(l: string) {
  return l === 'HIGH' || l === 'high'
    ? 'var(--emerald)'
    : l === 'MED' || l === 'medium'
      ? 'var(--amber)'
      : 'var(--coral)';
}

function liqLabel(l: string) {
  if (l === 'high') return 'HIGH';
  if (l === 'medium') return 'MED';
  if (l === 'low') return 'LOW';
  if (l === 'illiquid') return 'ILLIQ';
  return l;
}

function liqSoftBg(l: string) {
  if (l === 'HIGH' || l === 'high') return 'var(--emerald-soft)';
  if (l === 'MED' || l === 'medium') return 'var(--amber-soft)';
  return 'var(--coral-soft)';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/* ─── Intel Panel ─── */

interface IntelPanelProps {
  deal: Deal;
  detail: DealDetail | null;
  onReview?: (correct: boolean, reason?: string) => void;
  reviewState?: 'none' | 'correct' | 'wrong';
  onFetchVelocity?: () => void;
  velocityLoading?: boolean;
}

const IntelPanel: FC<IntelPanelProps> = ({
  deal,
  detail,
  onReview,
  reviewState = 'none',
  onFetchVelocity,
  velocityLoading,
}) => {
  const [tab, setTab] = useState<'overview' | 'comps' | 'trends'>('overview');
  const tabs = ['overview', 'comps', 'trends'] as const;

  const totalCost = deal.total_cost_gbp ?? deal.ebay_price_gbp + deal.ebay_shipping_gbp + deal.buyer_prot_fee;
  const profit = deal.profit_gbp ?? 0;
  const marketPrice = deal.market_price_gbp ?? 0;
  const confidence = Math.round((deal.confidence ?? 0) * 100);

  // Extract match signals from detail
  const matchSignals = detail?.match_signals?.confidence;
  const liqSignals = detail?.match_signals?.liquidity;

  // Build condition comps from variant_prices
  const condComps = detail?.variant_prices
    ? Object.entries(detail.variant_prices).map(([cond, prices]) => ({
        grade: cond,
        low: prices.low,
        market: prices.market,
        spread: prices.market - totalCost,
      }))
    : null;

  // Build trend periods from variant_trends
  const trendPeriods = detail?.variant_trends
    ? Object.entries(
        Object.values(detail.variant_trends)[0] || {}
      ).map(([period, data]) => ({
        label: period,
        change: data.price_change,
        pct: data.percent_change,
      }))
    : null;

  return (
    <div className="intel">
      <nav className="intel__tabs" aria-label="Card intelligence">
        {tabs.map((tb) => (
          <button
            key={tb}
            className={`intel__tab ${tab === tb ? 'is-on' : ''}`}
            onClick={() => setTab(tb)}
          >
            {tb.charAt(0).toUpperCase() + tb.slice(1)}
          </button>
        ))}
      </nav>

      <div className="intel__body">
        {/* ─── OVERVIEW ─── */}
        {tab === 'overview' && (
          <div className="intel__section anim-in">
            <div className="intel__group">
              <h3 className="intel__heading">No BS Pricing</h3>
              <dl className="pricing">
                <div className="pr">
                  <dt>eBay price</dt>
                  <dd>£{deal.ebay_price_gbp.toFixed(2)}</dd>
                </div>
                <div className="pr">
                  <dt>Shipping</dt>
                  <dd>£{deal.ebay_shipping_gbp.toFixed(2)}</dd>
                </div>
                <div className="pr">
                  <dt>Fees (inc.)</dt>
                  <dd>£{deal.buyer_prot_fee.toFixed(2)}</dd>
                </div>
                <div className="pr pr--heavy">
                  <dt>Total cost</dt>
                  <dd>£{totalCost.toFixed(2)}</dd>
                </div>
                <div className="pr">
                  <dt>Market price</dt>
                  <dd>£{marketPrice.toFixed(2)}</dd>
                </div>
                <div className="pr pr--profit">
                  <dt>Profit</dt>
                  <dd style={{ color: 'var(--emerald)' }}>+£{profit.toFixed(2)}</dd>
                </div>
              </dl>
            </div>

            <div className="intel__group">
              <div className="mc-header">
                <h3 className="intel__heading">Match Confidence</h3>
                <TrustRing match={confidence} size={40} />
              </div>
              {matchSignals &&
                Object.entries(matchSignals)
                  .filter(([key]) => key !== 'composite')
                  .map(([key, val]) => {
                    const v = typeof val === 'number' ? Math.round(val * 100) : 0;
                    const col = v >= 90 ? 'var(--emerald)' : v >= 50 ? 'var(--amber)' : 'var(--coral)';
                    const verified = v >= 95;
                    return (
                      <div className="mb-row" key={key}>
                        <span className="mb-row__label">
                          {key.charAt(0).toUpperCase() + key.slice(1)}
                        </span>
                        <div className="mb-row__track">
                          <div
                            className="mb-row__fill"
                            style={{ width: `${v}%`, background: col }}
                          />
                        </div>
                        <span className="mb-row__val" style={{ color: col }}>
                          {v}%
                        </span>
                        <span className={`mb-row__chk ${verified ? 'is-yes' : ''}`}>
                          {verified ? '✓' : '—'}
                        </span>
                      </div>
                    );
                  })}
              {!matchSignals && (
                <div style={{ font: '400 12px var(--mono)', color: 'var(--t3)', padding: '8px 0' }}>
                  Select a deal to see match breakdown
                </div>
              )}
            </div>

            <div className="intel__group">
              <h3 className="intel__heading">Review</h3>
              {reviewState === 'none' ? (
                <div className="review-btns">
                  <button className="rbtn rbtn--yes" onClick={() => onReview?.(true)}>
                    ✓ Correct
                  </button>
                  <button className="rbtn rbtn--no" onClick={() => onReview?.(false)}>
                    ✗ Wrong
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    font: '500 12px var(--mono)',
                    color: reviewState === 'correct' ? 'var(--emerald)' : 'var(--coral)',
                    padding: '10px',
                    background:
                      reviewState === 'correct' ? 'var(--emerald-soft)' : 'var(--coral-soft)',
                    borderRadius: 'var(--r-s)',
                    textAlign: 'center',
                  }}
                >
                  {reviewState === 'correct' ? '✓ Marked correct' : '✗ Marked incorrect'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── COMPS ─── */}
        {tab === 'comps' && (
          <div className="intel__section anim-in">
            {condComps && condComps.length > 0 && (
              <>
                <div className="intel__group">
                  <h3 className="intel__heading">Comps by Condition</h3>
                  <div className="comps-bars">
                    {condComps.map((c) => {
                      const maxP = Math.max(...condComps.map((x) => x.market));
                      const isCurrent =
                        c.grade.toLowerCase() === deal.condition.toLowerCase();
                      return (
                        <div
                          className={`cb-row ${isCurrent ? 'cb-row--current' : ''}`}
                          key={c.grade}
                        >
                          <span className="cb-row__grade">{c.grade}</span>
                          <div className="cb-row__track">
                            <div
                              className="cb-row__fill"
                              style={{ width: `${(c.market / maxP) * 100}%` }}
                            />
                          </div>
                          <span className="cb-row__price">£{c.market.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="intel__group">
                  <div className="comps-table" role="table" aria-label="Comparable sales">
                    <div className="ct-header" role="row">
                      <span role="columnheader"></span>
                      <span role="columnheader">Low</span>
                      <span role="columnheader">Market</span>
                      <span role="columnheader">Spread</span>
                    </div>
                    {condComps.map((c) => {
                      const isCurrent =
                        c.grade.toLowerCase() === deal.condition.toLowerCase();
                      return (
                        <div
                          className={`ct-row ${isCurrent ? 'ct-row--current' : ''}`}
                          key={c.grade}
                          role="row"
                        >
                          <span className="ct-row__grade" role="cell">
                            {c.grade}
                          </span>
                          <span role="cell">£{c.low.toFixed(2)}</span>
                          <span role="cell" className="ct-row__market">
                            £{c.market.toFixed(2)}
                          </span>
                          <span role="cell" className="ct-row__spread">
                            +£{c.spread.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="intel__group">
              <h3 className="intel__heading">Liquidity</h3>
              {deal.liquidity_grade ? (
                <>
                  <div className="liq-hero">
                    <span
                      className="liq-hero__pct"
                      style={{ color: liqColor(deal.liquidity_grade) }}
                    >
                      {deal.liquidity_score ?? 0}%
                    </span>
                    <span
                      className="liq-hero__badge"
                      style={{
                        color: liqColor(deal.liquidity_grade),
                        background: liqSoftBg(deal.liquidity_grade),
                      }}
                    >
                      {liqLabel(deal.liquidity_grade)}
                    </span>
                  </div>
                  {liqSignals?.signals &&
                    Object.entries(liqSignals.signals).map(([key, val]) => {
                      const v = typeof val === 'number' ? Math.round(val * 100) : 0;
                      return (
                        <div className="mb-row" key={key}>
                          <span className="mb-row__label">
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                          </span>
                          <div className="mb-row__track">
                            <div
                              className="mb-row__fill"
                              style={{ width: `${v}%`, background: metricColor(v) }}
                            />
                          </div>
                          <span className="mb-row__val" style={{ color: metricColor(v) }}>
                            {v}%
                          </span>
                        </div>
                      );
                    })}
                </>
              ) : (
                <div style={{ font: '400 12px var(--mono)', color: 'var(--t3)' }}>
                  No liquidity data available
                </div>
              )}
              {onFetchVelocity && (
                <button
                  className="act act--skip"
                  style={{ marginTop: 10, padding: '8px 16px', fontSize: 11 }}
                  onClick={onFetchVelocity}
                  disabled={velocityLoading}
                >
                  {velocityLoading ? 'Calculating…' : 'Fetch Velocity'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ─── TRENDS ─── */}
        {tab === 'trends' && (
          <div className="intel__section anim-in">
            <div className="intel__group">
              <h3 className="intel__heading">Price Trends</h3>
              {trendPeriods && trendPeriods.length > 0 ? (
                <>
                  <div className="sparkline-wrap">
                    <SparklineChart
                      data={trendPeriods.map((p) => Math.abs(p.change) + 100)}
                      width={320}
                      height={72}
                    />
                  </div>
                  <div className="trend-grid">
                    {trendPeriods.map((p) => (
                      <div className="trend-card" key={p.label}>
                        <span className="trend-card__period">{p.label}</span>
                        <span
                          className={`trend-card__change ${p.change >= 0 ? 'is-up' : 'is-down'}`}
                        >
                          {p.change >= 0 ? '+' : ''}£{p.change.toFixed(2)}
                        </span>
                        <span
                          className={`trend-card__pct ${p.pct >= 0 ? 'is-up' : 'is-down'}`}
                        >
                          {p.pct >= 0 ? '+' : ''}
                          {p.pct.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ font: '400 12px var(--mono)', color: 'var(--t3)', padding: '8px 0' }}>
                  {deal.trend_7d != null || deal.trend_30d != null ? (
                    <div className="trend-grid">
                      <div className="trend-card">
                        <span className="trend-card__period">7d</span>
                        <span
                          className={`trend-card__change ${(deal.trend_7d ?? 0) >= 0 ? 'is-up' : 'is-down'}`}
                        >
                          {(deal.trend_7d ?? 0) >= 0 ? '+' : ''}
                          {(deal.trend_7d ?? 0).toFixed(1)}%
                        </span>
                      </div>
                      <div className="trend-card">
                        <span className="trend-card__period">30d</span>
                        <span
                          className={`trend-card__change ${(deal.trend_30d ?? 0) >= 0 ? 'is-up' : 'is-down'}`}
                        >
                          {(deal.trend_30d ?? 0) >= 0 ? '+' : ''}
                          {(deal.trend_30d ?? 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ) : (
                    'No trend data available'
                  )}
                </div>
              )}
            </div>

            {detail?.expansion_name && (
              <div className="intel__group">
                <h3 className="intel__heading">Expansion</h3>
                <div
                  className="xpn"
                  style={{
                    '--xc1': 'var(--blue)',
                    '--xc2': '#818cf8',
                  } as React.CSSProperties}
                >
                  <div className="xpn__glow" />
                  <div className="xpn__top">
                    <div className="xpn__icon-ring">
                      {detail.expansion_symbol ? (
                        <img
                          src={detail.expansion_symbol}
                          alt=""
                          style={{ width: 22, height: 22 }}
                        />
                      ) : (
                        <span className="xpn__symbol">📦</span>
                      )}
                    </div>
                    <div className="xpn__identity">
                      <span className="xpn__name">{detail.expansion_name}</span>
                      {detail.expansion_series && (
                        <span className="xpn__code">{detail.expansion_series}</span>
                      )}
                    </div>
                    {detail.expansion_release_date && (
                      <span className="xpn__year">
                        {new Date(detail.expansion_release_date).getFullYear()}
                      </span>
                    )}
                  </div>
                  <div className="xpn__stats">
                    {detail.expansion_card_count && (
                      <>
                        <div className="xpn__stat">
                          <span className="xpn__stat-val">{detail.expansion_card_count}</span>
                          <span className="xpn__stat-label">Cards</span>
                        </div>
                        <div className="xpn__stat-divider" />
                      </>
                    )}
                    {detail.expansion_series && (
                      <>
                        <div className="xpn__stat">
                          <span className="xpn__stat-val">{detail.expansion_series}</span>
                          <span className="xpn__stat-label">Series</span>
                        </div>
                        <div className="xpn__stat-divider" />
                      </>
                    )}
                    {deal.card_number && (
                      <div className="xpn__stat">
                        <span className="xpn__stat-val" style={{ color: 'var(--blue)' }}>
                          #{deal.card_number}
                        </span>
                        <span className="xpn__stat-label">This card</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Hero Deal ─── */

interface HeroDealProps {
  deal: Deal;
  detail: DealDetail | null;
  onSnag: () => void;
  onSkip: () => void;
  onReview?: (correct: boolean, reason?: string) => void;
  reviewState?: 'none' | 'correct' | 'wrong';
  onFetchVelocity?: () => void;
  velocityLoading?: boolean;
}

const HeroDeal: FC<HeroDealProps> = ({
  deal,
  detail,
  onSnag,
  onSkip,
  onReview,
  reviewState = 'none',
  onFetchVelocity,
  velocityLoading,
}) => {
  const profit = deal.profit_gbp ?? 0;
  const roi = deal.profit_percent ?? 0;
  const confidence = Math.round((deal.confidence ?? 0) * 100);
  const trust = getTrust(confidence);
  const ts = TIER[deal.tier] || TIER.HIT;
  const name = deal.cardName || deal.ebay_title || 'Unknown';
  const set = deal.expansion_name || '';
  const number = deal.card_number ? `#${deal.card_number}` : '';
  const ago = timeAgo(deal.created_at);
  const imageUrl = detail?.card_image_url || deal.ebay_image_url;

  return (
    <article className="hero" aria-label={`Deal: ${name}`}>
      <div className="hero__top">
        <div className="hero__card-frame">
          <div
            className="hero__glow"
            style={{
              background: `radial-gradient(circle at 50% 35%, ${ts.c}18, transparent 70%)`,
            }}
          />
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              style={{
                maxWidth: '90%',
                maxHeight: '90%',
                objectFit: 'contain',
                position: 'relative',
                zIndex: 1,
                borderRadius: 6,
              }}
            />
          ) : (
            <span className="hero__emoji">🃏</span>
          )}
          <span className="hero__flip-hint">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Flip
          </span>
        </div>

        <div className="hero__summary">
          <div className="hero__id">
            <h1 className="hero__name">{name}</h1>
            <p className="hero__set">
              {set}
              {set && number ? ' · ' : ''}
              {number}
            </p>
            <div className="hero__tags">
              <span
                className="htag"
                style={{ color: ts.c, background: ts.bg, borderColor: ts.b }}
              >
                {deal.tier}
              </span>
              <span className={`htag ${COND_CLASS[deal.condition] || ''}`}>
                {deal.condition}
              </span>
              {deal.is_graded && deal.grading_company && (
                <span
                  className="htag"
                  style={{
                    color: 'var(--blue)',
                    background: 'var(--blue-soft)',
                    borderColor: 'rgba(96,165,250,0.25)',
                  }}
                >
                  {deal.grading_company} {deal.grade}
                </span>
              )}
            </div>
          </div>

          <div className="hero__numbers">
            <div className="hero__profit-col">
              <span className="hero__profit-val">+£{profit.toFixed(2)}</span>
              <span className="hero__profit-roi">+{roi.toFixed(0)}% ROI</span>
            </div>
            <div className="hero__trust-col">
              <TrustRing match={confidence} size={56} />
              <span className="hero__trust-word" style={{ color: trust.color }}>
                {trust.label}
              </span>
            </div>
          </div>

          <div className="hero__buysell">
            <div className="bs-cell">
              <span className="bs-cell__label">Buy</span>
              <span className="bs-cell__val">£{deal.ebay_price_gbp.toFixed(2)}</span>
            </div>
            <span className="bs-arrow" aria-hidden="true">
              →
            </span>
            <div className="bs-cell">
              <span className="bs-cell__label">Sell</span>
              <span className="bs-cell__val">£{(deal.market_price_gbp ?? 0).toFixed(2)}</span>
            </div>
            <span className="hero__ago">{ago} ago</span>
          </div>
        </div>
      </div>

      <div className="hero__actions">
        <button className="act act--skip" onClick={onSkip}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M12 4L4 12M4 4l8 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Skip
        </button>
        <a
          href={deal.ebay_url}
          className="act act--snag"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            onSnag();
            window.open(deal.ebay_url, '_blank');
          }}
        >
          Snag on eBay
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 7h8M8 4l3 3-3 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </div>

      <IntelPanel
        deal={deal}
        detail={detail}
        onReview={onReview}
        reviewState={reviewState}
        onFetchVelocity={onFetchVelocity}
        velocityLoading={velocityLoading}
      />
    </article>
  );
};

export default HeroDeal;
