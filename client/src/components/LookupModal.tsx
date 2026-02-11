import { useState, useRef, useEffect } from 'react';
import TierBadge from './ui/TierBadge';
import CondPill from './ui/CondPill';
import LiqPill from './ui/LiqPill';
import GradBorder from './ui/GradBorder';
import { BarRow } from './ui/Bar';
import { lookupEbayUrl } from '../api/deals';
import type { LookupResult, Tier, Condition, LiquidityGrade } from '../types/deals';

/* ─── Helpers ─── */

function getCompositeConfidence(c: LookupResult['match']): number {
  if (!c) return 0;
  if (typeof c.confidence === 'number') return c.confidence;
  return c.confidence?.composite ?? 0;
}

function getConfidenceBreakdown(c: LookupResult['match']): Record<string, number> | null {
  if (!c) return null;
  if (typeof c.confidence === 'number') return null;
  const { composite: _, ...rest } = c.confidence;
  return rest as Record<string, number>;
}

function SectionHeader({ text }: { text: string }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
      color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em',
      textTransform: 'uppercase', padding: '10px 0 4px', marginTop: 4,
    }}>{text}</div>
  );
}

function PriceRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '2px 0',
      fontFamily: "var(--font-mono)", fontSize: 11,
      fontWeight: bold ? 600 : 400, color: color ?? (bold ? 'var(--tMax)' : 'var(--tSec)'),
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ConfidenceBar({ label, value, delay }: { label: string; value: number; delay: number }) {
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    setAnimated(0);
    const timer = setTimeout(() => setAnimated(value), delay + 50);
    return () => clearTimeout(timer);
  }, [value, delay]);

  const pct = Math.round(animated * 100);
  const barColor = animated >= 0.85 ? 'var(--green)' : animated >= 0.65 ? 'var(--amber)' : 'var(--red)';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 32px', alignItems: 'center', gap: 8, padding: '2px 0' }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: 'var(--tSec)', textTransform: 'capitalize' }}>
        {label}
      </span>
      <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.max(0, Math.min(1, animated)) * 100}%`,
          height: '100%', borderRadius: 4, background: barColor,
          transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
        textAlign: 'right', color: barColor,
      }}>{pct}%</span>
    </div>
  );
}

/* ─── Main Component ─── */

export default function LookupModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!url.trim() || loading) return;
    setError('');
    setResult(null);
    setLoading(true);
    setLoadingStage('Fetching...');
    setTimeout(() => setLoadingStage('Extracting...'), 1200);
    setTimeout(() => setLoadingStage('Matching...'), 2500);
    try {
      const res = await lookupEbayUrl(url.trim());
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Lookup failed');
    } finally {
      setLoading(false);
      setLoadingStage('');
    }
  };

  const confidence = result?.match ? getCompositeConfidence(result.match) : 0;
  const confidenceBreakdown = result?.match ? getConfidenceBreakdown(result.match) : null;
  const condSignal = result?.signals?.condition;
  const condStr = (typeof condSignal === 'object' && condSignal?.condition) ? condSignal.condition : 'LP';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 600, maxHeight: '90vh', overflowY: 'auto',
          padding: '24px',
          background: 'var(--bg1)',
          border: '1px solid var(--brd)',
          borderRadius: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
            color: 'var(--tMut)', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>MANUAL LOOKUP</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--tMut)',
            fontSize: 18, cursor: 'pointer',
          }}>{'\u00D7'}</button>
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            ref={inputRef}
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="PASTE EBAY URL"
            style={{
              flex: 1, height: 44,
              background: 'var(--glass)', border: '1px solid var(--brd)',
              borderRadius: 8, padding: '0 14px',
              color: 'var(--tMax)', fontSize: 13,
              fontFamily: "var(--font-mono)",
              outline: 'none',
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '0 18px', height: 44, borderRadius: 8,
              background: 'var(--glass)', border: '1px solid var(--brd)',
              color: 'var(--tMax)', fontWeight: 600, fontSize: 13,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            GO
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{
            textAlign: 'center', padding: '20px 0', color: 'var(--amber)',
            fontFamily: "var(--font-mono)", fontSize: 12, animation: 'pulse 1.5s infinite',
          }}>
            {loadingStage}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '12px 0', color: 'var(--red)', fontSize: 13 }}>{error}</div>
        )}

        {/* Result */}
        {result && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* ═══ LISTING IMAGE + CARD INFO ═══ */}
            <div style={{ display: 'flex', gap: 14 }}>
              {result.listing.image && (
                <img src={result.listing.image} alt="" style={{
                  width: 90, height: 125, objectFit: 'cover',
                  borderRadius: 6, background: 'var(--glass)',
                  flexShrink: 0,
                }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tMax)', lineHeight: 1.2 }}>
                  {result.match?.cardName || result.listing.title}
                </div>
                {result.match && (
                  <div style={{
                    fontSize: 11, color: 'var(--tMut)', marginTop: 3,
                    fontFamily: "var(--font-mono)",
                  }}>
                    {result.match.variantName} {'\u00B7'} #{result.match.cardNumber}
                  </div>
                )}
                {result.signals.expansion && (
                  <div style={{
                    fontSize: 11, color: 'var(--tSec)', marginTop: 2,
                    fontFamily: "var(--font-mono)",
                  }}>
                    {String(result.signals.expansion)}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <CondPill condition={condStr.toUpperCase() as Condition} />
                  {result.liquidity && (
                    <LiqPill grade={result.liquidity.grade as LiquidityGrade} />
                  )}
                  {result.signals.isGraded && (
                    <span style={{
                      padding: '1px 5px', borderRadius: 4, fontSize: 10,
                      border: '1px solid var(--blue)', color: 'var(--blue)',
                      fontFamily: "var(--font-mono)", fontWeight: 500,
                    }}>
                      {condSignal?.gradingCompany
                        ? `${condSignal.gradingCompany} ${condSignal.grade}`
                        : 'GRADED'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ═══ REJECTED / NO MATCH ═══ */}
            {result.signals.rejected && (
              <div style={{
                marginTop: 10, padding: '10px 14px', borderRadius: 6,
                background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)',
                color: 'var(--red)', fontSize: 12, fontFamily: "var(--font-mono)",
              }}>
                Rejected: {result.signals.rejectReason}
              </div>
            )}
            {!result.signals.rejected && !result.match && (
              <div style={{
                marginTop: 10, padding: '10px 14px', borderRadius: 6,
                background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
                color: 'var(--amber)', fontSize: 12, fontFamily: "var(--font-mono)",
              }}>
                No match found in card database
              </div>
            )}

            {/* ═══ PROFIT HERO ═══ */}
            {result.profit && (
              <div style={{ marginTop: 12 }}>
                <GradBorder>
                  <div style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                      <TierBadge tier={result.profit.tier as Tier} size="md" />
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 800,
                        color: 'var(--greenB)',
                        textShadow: '0 0 16px rgba(110,231,183,0.5)',
                      }}>
                        +{'\u00A3'}{result.profit.profitGBP.toFixed(2)}
                      </span>
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 13, color: 'var(--green)',
                      marginTop: 4, fontWeight: 600,
                    }}>
                      +{result.profit.profitPercent.toFixed(1)}%
                    </div>
                  </div>
                </GradBorder>
              </div>
            )}

            {/* ═══ PRICING BREAKDOWN ═══ */}
            {result.profit && (
              <>
                <SectionHeader text="PRICING" />
                <div>
                  <PriceRow
                    label="eBay price"
                    value={`${'\u00A3'}${parseFloat(result.listing.price?.value ?? '0').toFixed(2)}`}
                  />
                  <PriceRow
                    label="Shipping"
                    value={`${'\u00A3'}${parseFloat(result.listing.shipping?.value ?? '0').toFixed(2)}`}
                  />
                  <div style={{ borderTop: '1px solid var(--brd)', margin: '4px 0' }} />
                  <PriceRow
                    label="Total cost"
                    value={`${'\u00A3'}${result.profit.totalCostGBP.toFixed(2)}`}
                    bold
                  />
                  <div style={{ height: 4 }} />
                  <PriceRow
                    label="Market price"
                    value={`${'\u00A3'}${result.profit.marketPriceGBP.toFixed(2)}`}
                    bold
                  />
                  <div style={{
                    marginTop: 6, padding: '6px 10px', borderRadius: 6,
                    border: '1px solid rgba(110,231,183,0.2)',
                    background: 'rgba(110,231,183,0.04)',
                    display: 'flex', justifyContent: 'space-between',
                    fontFamily: "var(--font-mono)", fontSize: 11,
                  }}>
                    <span style={{ color: 'var(--tSec)' }}>Profit</span>
                    <span style={{ color: 'var(--greenB)', fontWeight: 700 }}>
                      +{'\u00A3'}{result.profit.profitGBP.toFixed(2)}
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* ═══ CONDITION DETAILS ═══ */}
            {condSignal && typeof condSignal === 'object' && (
              <>
                <SectionHeader text="CONDITION" />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: 'var(--tSec)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>Resolved</span>
                    <span style={{ fontWeight: 600, color: 'var(--tMax)' }}>{condSignal.condition}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>Source</span>
                    <span>{condSignal.source}</span>
                  </div>
                  {result.listing.conditionDescriptors && result.listing.conditionDescriptors.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <span style={{ color: 'var(--tMut)', fontSize: 10 }}>eBay descriptors:</span>
                      {result.listing.conditionDescriptors.map((d, i) => (
                        <div key={i} style={{
                          marginTop: 4, padding: '6px 8px', borderRadius: 4,
                          background: 'rgba(255,255,255,0.02)', border: '1px solid var(--brd)',
                        }}>
                          <div style={{ fontWeight: 600, fontSize: 10, color: 'var(--tMax)' }}>{d.name}</div>
                          {d.values.map((v, j) => (
                            <div key={j} style={{ marginTop: 2 }}>
                              <div style={{ color: 'var(--tSec)' }}>{v.content}</div>
                              {v.additionalInfo && v.additionalInfo.length > 0 && (
                                <div style={{ color: 'var(--tMut)', fontSize: 10, marginTop: 2, paddingLeft: 8 }}>
                                  {v.additionalInfo.map((info, k) => (
                                    <div key={k}>{'\u2022'} {info}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ═══ MATCH CONFIDENCE ═══ */}
            {result.match && (
              <>
                <SectionHeader text="MATCH CONFIDENCE" />
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 800,
                  color: confidence >= 0.85 ? 'var(--green)' : confidence >= 0.65 ? 'var(--amber)' : 'var(--red)',
                  marginBottom: 6,
                }}>
                  {Math.round(confidence * 100)}%
                </div>
                {confidenceBreakdown && Object.entries(confidenceBreakdown).map(([key, val], i) => (
                  <ConfidenceBar key={key} label={key} value={val ?? 0} delay={i * 60} />
                ))}
              </>
            )}

            {/* ═══ LIQUIDITY ═══ */}
            {result.liquidity && (
              <>
                <SectionHeader text="LIQUIDITY" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800,
                    color: result.liquidity.composite >= 0.7 ? 'var(--green)'
                      : result.liquidity.composite >= 0.4 ? 'var(--amber)' : 'var(--red)',
                  }}>
                    {Math.round(result.liquidity.composite * 100)}%
                  </span>
                  <LiqPill grade={result.liquidity.grade as LiquidityGrade} />
                </div>
                {result.liquidity.signals && Object.entries(result.liquidity.signals).map(([key, val]) => (
                  <BarRow key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} value={val} />
                ))}
              </>
            )}

            {/* ═══ SELLER INFO ═══ */}
            {result.listing.seller && (
              <>
                <SectionHeader text="SELLER" />
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: 'var(--tSec)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>Username</span>
                    <span style={{ color: 'var(--tMax)' }}>{result.listing.seller.username}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>Feedback</span>
                    <span style={{
                      color: parseFloat(result.listing.seller.feedbackPercentage) >= 98 ? 'var(--green)' : 'var(--amber)',
                    }}>
                      {result.listing.seller.feedbackPercentage}% ({result.listing.seller.feedbackScore})
                    </span>
                  </div>
                  {result.listing.seller.sellerAccountType && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>Account type</span>
                      <span>{result.listing.seller.sellerAccountType}</span>
                    </div>
                  )}
                  {result.listing.quantitySold != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>Qty sold</span>
                      <span>{result.listing.quantitySold}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ═══ ACTIONS ═══ */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                onClick={() => window.open(result.ebayUrl, '_blank')}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg, #34d399, #2dd4bf)',
                  color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}
              >
                Open on eBay
              </button>
              {result.match?.cardId && (
                <a
                  href={`/catalog/cards/${result.match.cardId}`}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 8,
                    background: 'var(--glass)', border: '1px solid var(--brd)',
                    color: 'var(--tMax)', fontWeight: 600, fontSize: 13,
                    textDecoration: 'none', textAlign: 'center', display: 'block',
                  }}
                >
                  View in Catalog
                </a>
              )}
            </div>

            {/* ═══ DEBUG ═══ */}
            <button
              onClick={() => setShowDebug(!showDebug)}
              style={{
                background: 'none', border: 'none', marginTop: 10,
                color: 'var(--tMut)', fontSize: 10,
                fontFamily: "var(--font-mono)",
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              {showDebug ? '\u25BE Hide debug' : '\u25B8 Show debug'}
            </button>
            {showDebug && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: 'var(--tMut)', fontWeight: 600, marginTop: 4,
                }}>PIPELINE OUTPUT</div>
                <pre style={{
                  background: 'var(--glass)', borderRadius: 6,
                  padding: 12, fontSize: 10,
                  color: 'var(--tSec)', overflow: 'auto',
                  maxHeight: 300,
                  fontFamily: "var(--font-mono)",
                  border: '1px solid var(--brd)',
                }}>
                  {JSON.stringify({ signals: result.signals, match: result.match, listing: result.listing }, null, 2)}
                </pre>
                {result.rawEbayResponse && (
                  <>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 10,
                      color: 'var(--tMut)', fontWeight: 600,
                    }}>RAW EBAY API RESPONSE</div>
                    <pre style={{
                      background: 'var(--glass)', borderRadius: 6,
                      padding: 12, fontSize: 10,
                      color: 'var(--tSec)', overflow: 'auto',
                      maxHeight: 400,
                      fontFamily: "var(--font-mono)",
                      border: '1px solid var(--brd)',
                    }}>
                      {JSON.stringify(result.rawEbayResponse, null, 2)}
                    </pre>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
