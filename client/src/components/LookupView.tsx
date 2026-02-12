import { useState } from 'react';
import { I } from '../icons';
import { Ring, Tier } from './shared';
import { lookupEbayUrl } from '../api/deals';
import type { LookupResult } from '../types/deals';

export default function LookupView() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doLookup = async () => {
    if (!url.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await lookupEbayUrl(url.trim());
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  // Extract display values from the API response
  const confValue = result?.match
    ? typeof result.match.confidence === 'number'
      ? result.match.confidence
      : result.match.confidence.composite
    : null;
  const confTier = confValue != null ? (confValue >= 0.75 ? 'high' : confValue >= 0.5 ? 'medium' : 'low') : 'low';

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-obsidian">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Manual Lookup</h1>
          <p className="text-sm text-muted">Paste an eBay listing URL to run it through the full matching and pricing pipeline. Uses <span className="font-mono text-white/70">POST /api/lookup</span></p>
        </div>

        {/* URL Input */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <label className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-2">eBay Listing URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doLookup()}
              placeholder="https://www.ebay.co.uk/itm/&hellip;"
              className="flex-1 bg-obsidian border border-border rounded-lg px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-brand placeholder:text-muted/40"
            />
            <button onClick={doLookup} disabled={loading || !url.trim()} className="bg-brand hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-3 rounded-lg flex items-center gap-2 transition-all text-sm">
              {loading ? <I.Loader s={16} c="w-4 h-4" /> : <I.Send s={16} c="w-4 h-4" />}
              {loading ? 'Evaluating\u2026' : 'Evaluate'}
            </button>
          </div>
          <p className="text-[10px] text-muted mt-2">Runs the listing through: title parsing &rarr; number extraction &rarr; candidate lookup &rarr; confidence scoring &rarr; pricing &rarr; tier classification</p>
        </div>

        {error && (
          <div className="bg-risk/5 border border-risk/20 rounded-xl p-4 flex items-start gap-3">
            <I.AlertTriangle s={16} c="text-risk shrink-0 mt-0.5" />
            <p className="text-sm text-risk">{error}</p>
          </div>
        )}

        {/* Rejected listing */}
        {result && result.signals.rejected && (
          <div className="bg-warn/5 border border-warn/20 rounded-xl p-4 flex items-start gap-3">
            <I.AlertTriangle s={16} c="text-warn shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-warn font-semibold">Listing rejected</p>
              <p className="text-xs text-muted mt-1">{result.signals.rejectReason || 'Did not pass signal extraction filters'}</p>
            </div>
          </div>
        )}

        {/* Result */}
        {result && !result.signals.rejected && result.match && result.profit && (
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <Ring v={Math.round((confValue ?? 0) * 100)} tier={confTier} sz={44} />
                <div>
                  <h2 className="text-lg font-bold text-white">{result.match.cardName}</h2>
                  <p className="text-sm text-muted font-mono">{result.match.cardNumber} &middot; {result.match.variantName}</p>
                </div>
                <div className="ml-auto"><Tier t={result.profit.tier} /></div>
              </div>

              {/* Listing info */}
              {result.listing.image && (
                <div className="flex gap-4 mb-4">
                  <img src={result.listing.image} alt="" className="w-20 h-28 object-cover rounded-lg border border-border" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{result.listing.title}</p>
                    {result.listing.condition && <p className="text-[10px] text-muted mt-1">Condition: <span className="text-white/70">{result.listing.condition}</span></p>}
                    {result.listing.seller && <p className="text-[10px] text-muted mt-0.5">Seller: <span className="text-white/70">{result.listing.seller.username} ({result.listing.seller.feedbackScore})</span></p>}
                  </div>
                </div>
              )}

              {/* Pricing */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-obsidian rounded-lg p-3 text-center">
                  <div className="text-[9px] text-muted uppercase mb-1">Total Cost</div>
                  <div className="text-lg font-mono font-bold text-white">&pound;{result.profit.totalCostGBP.toFixed(2)}</div>
                </div>
                <div className="bg-obsidian rounded-lg p-3 text-center">
                  <div className="text-[9px] text-muted uppercase mb-1">Market Value</div>
                  <div className="text-lg font-mono font-bold text-white">&pound;{result.profit.marketPriceGBP.toFixed(2)}</div>
                </div>
                <div className="bg-obsidian rounded-lg p-3 text-center">
                  <div className="text-[9px] text-muted uppercase mb-1">Net Profit</div>
                  <div className={'text-lg font-mono font-bold ' + (result.profit.profitGBP >= 0 ? 'text-profit' : 'text-risk')}>{result.profit.profitGBP >= 0 ? '+' : ''}&pound;{result.profit.profitGBP.toFixed(2)}</div>
                  <div className={'text-[10px] font-mono ' + (result.profit.profitPercent >= 0 ? 'text-profit/70' : 'text-risk/70')}>{result.profit.profitPercent >= 0 ? '+' : ''}{result.profit.profitPercent.toFixed(1)}%</div>
                </div>
              </div>

              {/* Cost breakdown */}
              <div className="space-y-1.5 font-mono text-[11px] bg-obsidian rounded-lg p-3">
                <div className="flex justify-between"><span className="text-muted">eBay Price</span><span className="text-white">{result.listing.price ? '\u00a3' + parseFloat(result.listing.price.value).toFixed(2) : '\u2014'}</span></div>
                <div className="flex justify-between"><span className="text-muted">Shipping</span><span className="text-white">{result.listing.shipping ? '\u00a3' + parseFloat(result.listing.shipping.value).toFixed(2) : 'Free'}</span></div>
              </div>

              {/* Match signals */}
              {typeof result.match.confidence === 'object' && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Confidence Signals</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(result.match.confidence).filter(([k]) => k !== 'composite').map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between bg-obsidian rounded-lg px-3 py-2">
                        <span className="text-[11px] text-muted capitalize">{k}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                            <div className={`h-1.5 rounded-full ${(v as number) >= 0.8 ? 'bg-profit' : (v as number) >= 0.6 ? 'bg-warn' : 'bg-risk'}`} style={{ width: `${(v as number) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-white/70 w-8 text-right">{((v as number) * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Liquidity */}
              {result.liquidity && (
                <div className="flex items-center gap-2 mt-3 text-[10px] text-muted">
                  <span>Liquidity:</span>
                  <span className={`font-mono font-bold ${result.liquidity.grade === 'high' ? 'text-profit' : result.liquidity.grade === 'medium' ? 'text-warn' : 'text-risk'}`}>{result.liquidity.grade} ({Math.round(result.liquidity.composite * 100)}%)</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* No match found */}
        {result && !result.signals.rejected && !result.match && (
          <div className="bg-surface border border-border rounded-xl p-5 text-center">
            <I.Search s={32} c="text-muted/30 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">No match found</h3>
            <p className="text-xs text-muted">The listing could not be matched to any card in the catalog.</p>
            {result.listing.title && <p className="text-[11px] font-mono text-muted/70 mt-2 truncate">{result.listing.title}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
