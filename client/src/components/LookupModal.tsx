import { useState, useRef, useEffect } from 'react';
import TierBadge from './ui/TierBadge';
import CondPill from './ui/CondPill';
import LiqPill from './ui/LiqPill';
import GradBorder from './ui/GradBorder';
import { lookupEbayUrl } from '../api/deals';
import type { LookupResult, Tier, Condition, LiquidityGrade } from '../types/deals';

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
        className="glass-static"
        style={{
          width: 580, maxHeight: '85vh', overflowY: 'auto',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span className="section-header">MANUAL LOOKUP</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tMut)', fontSize: 18 }}>×</button>
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            ref={inputRef}
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="PASTE EBAY URL. NO BS."
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
              opacity: loading ? 0.5 : 1,
            }}
          >
            GO
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--amber)', fontFamily: "var(--font-mono)", fontSize: 12, animation: 'pulse 1.5s infinite' }}>
            {loadingStage}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '12px 0', color: 'var(--red)', fontSize: 13 }}>{error}</div>
        )}

        {/* Result */}
        {result && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Card info */}
            <div style={{ display: 'flex', gap: 12 }}>
              {result.listing.image && (
                <img src={result.listing.image} alt="" style={{ width: 80, height: 112, objectFit: 'cover', borderRadius: 6, background: 'var(--glass)' }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tMax)' }}>
                  {result.match?.cardName || result.listing.title}
                </div>
                {result.match && (
                  <div style={{ fontSize: 12, color: 'var(--tMut)', marginTop: 2 }}>
                    {result.match.variantName} · #{result.match.cardNumber}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {result.signals.condition != null && (
                    <CondPill condition={String((result.signals.condition as Record<string, string>)?.condition || 'LP').toUpperCase() as Condition} />
                  )}
                  {result.liquidity && (
                    <LiqPill grade={result.liquidity.grade as LiquidityGrade} />
                  )}
                </div>
              </div>
            </div>

            {/* Profit hero */}
            {result.profit && (
              <GradBorder>
                <div style={{ padding: '14px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <TierBadge tier={result.profit.tier as Tier} size="md" />
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 34, fontWeight: 800,
                      color: 'var(--greenB)',
                      textShadow: '0 0 16px rgba(110,231,183,0.5)',
                    }}>
                      +£{result.profit.profitGBP.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: 'var(--green)', marginTop: 4 }}>
                    +{result.profit.profitPercent.toFixed(1)}%
                  </div>
                </div>
              </GradBorder>
            )}

            {/* Confidence */}
            {result.match && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: 'var(--tSec)' }}>
                Confidence: <span style={{ color: result.match.confidence >= 0.85 ? 'var(--green)' : 'var(--amber)', fontWeight: 600 }}>
                  {(result.match.confidence * 100).toFixed(0)}%
                </span>
              </div>
            )}

            {/* Rejected signal */}
            {result.signals.rejected && (
              <div style={{
                padding: '10px 14px', borderRadius: 6,
                background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)',
                color: 'var(--red)', fontSize: 12,
              }}>
                Rejected: {result.signals.rejectReason}
              </div>
            )}

            {/* No match */}
            {!result.signals.rejected && !result.match && (
              <div style={{
                padding: '10px 14px', borderRadius: 6,
                background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
                color: 'var(--amber)', fontSize: 12,
              }}>
                No match found in card database
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => window.open(result.ebayUrl, '_blank')}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg, #34d399, #2dd4bf)',
                  color: '#000', fontWeight: 700, fontSize: 13,
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

            {/* Debug */}
            <button
              onClick={() => setShowDebug(!showDebug)}
              style={{
                background: 'none', border: 'none',
                color: 'var(--tMut)', fontSize: 10,
                fontFamily: "var(--font-mono)",
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              {showDebug ? '▾ Hide debug' : '▸ Show debug'}
            </button>
            {showDebug && (
              <pre style={{
                background: 'var(--glass)', borderRadius: 6,
                padding: 12, fontSize: 10,
                color: 'var(--tSec)', overflow: 'auto',
                maxHeight: 300,
                fontFamily: "var(--font-mono)",
              }}>
                {JSON.stringify({ signals: result.signals, match: result.match, listing: result.listing }, null, 2)}
              </pre>
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
