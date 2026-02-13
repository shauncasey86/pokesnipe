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

  const confValue = result?.match
    ? typeof result.match.confidence === 'number'
      ? result.match.confidence
      : result.match.confidence.composite
    : null;
  const confTier = confValue != null ? (confValue >= 0.75 ? 'high' : confValue >= 0.5 ? 'medium' : 'low') : 'low';

  const hasResult = result && !result.signals.rejected && result.match && result.profit;

  return (
    <div className="flex-1 overflow-y-auto bg-obsidian">
      <div className={`flex flex-col items-center justify-center px-6 ${hasResult ? 'pt-16 pb-10' : 'min-h-full'}`}>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Manual Override</h1>
          <p className="text-gray-500 font-mono text-sm">Direct database access &amp; single-item sniper</p>
        </div>

        {/* Search Input */}
        <div className="w-full max-w-2xl mb-8">
          <div className="relative">
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doLookup()}
              placeholder="Paste eBay URL or Enter Card Name..."
              className="w-full bg-charcoal border border-border rounded-xl px-5 py-4 pr-28 text-sm text-white font-mono placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-dexRed focus:border-transparent transition-all"
            />
            <button
              onClick={doLookup}
              disabled={loading || !url.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-dexRed hover:bg-dexRed/90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold px-5 py-2 rounded-lg flex items-center gap-2 transition-all text-sm"
            >
              {loading ? <I.Loader s={16} c="w-4 h-4" /> : <I.Search s={16} c="w-4 h-4" />}
              {loading ? 'SCANNING...' : 'SCAN'}
            </button>
          </div>
        </div>

        {/* Placeholder Cards (when no result) */}
        {!result && !error && (
          <div className="w-full max-w-2xl grid grid-cols-2 gap-4 mb-8">
            {/* Set Lookup Card */}
            <div className="bg-panel border border-border rounded-xl p-5 hover:border-dexRed/30 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-dexRed/10 flex items-center justify-center">
                  <I.Box s={18} c="text-dexRed" />
                </div>
                <h3 className="text-sm font-bold text-white">Set Lookup</h3>
              </div>
              <p className="text-xs text-gray-500 font-mono leading-relaxed">
                Cross-reference full expansion sets against live market data. Bulk price checking for sealed &amp; singles.
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-dexRed text-[10px] font-mono font-bold uppercase tracking-wider">
                <I.Database s={12} c="text-dexRed" />
                <span>Coming Soon</span>
              </div>
            </div>

            {/* Seller Search Card */}
            <div className="bg-panel border border-border rounded-xl p-5 hover:border-dexBlue/30 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-dexBlue/10 flex items-center justify-center">
                  <I.User s={18} c="text-dexBlue" />
                </div>
                <h3 className="text-sm font-bold text-white">Seller Search</h3>
              </div>
              <p className="text-xs text-gray-500 font-mono leading-relaxed">
                Deep-dive into seller inventory. Find underpriced listings from high-volume Pokemon card sellers.
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-dexBlue text-[10px] font-mono font-bold uppercase tracking-wider">
                <I.Search s={12} c="text-dexBlue" />
                <span>Coming Soon</span>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="w-full max-w-2xl mb-6">
            <div className="bg-risk/5 border border-risk/20 rounded-xl p-4 flex items-start gap-3">
              <I.AlertTriangle s={16} c="text-risk shrink-0 mt-0.5" />
              <p className="text-sm text-risk">{error}</p>
            </div>
          </div>
        )}

        {/* Rejected Listing */}
        {result && result.signals.rejected && (
          <div className="w-full max-w-2xl mb-6">
            <div className="bg-panel border border-dexYellow/20 rounded-xl p-4 flex items-start gap-3">
              <I.AlertTriangle s={16} c="text-dexYellow shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-dexYellow font-semibold">Listing Rejected</p>
                <p className="text-xs text-gray-500 font-mono mt-1">{result.signals.rejectReason || 'Did not pass signal extraction filters'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Result */}
        {hasResult && result.match && result.profit && (
          <div className="w-full max-w-2xl space-y-4">
            {/* Match Card */}
            <div className="bg-panel border border-border rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <Ring v={Math.round((confValue ?? 0) * 100)} tier={confTier} sz={44} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-white">{result.match.cardName}</h2>
                  <p className="text-sm text-gray-500 font-mono">{result.match.cardNumber} &middot; {result.match.variantName}</p>
                </div>
                <div className="ml-auto"><Tier t={result.profit.tier} /></div>
              </div>

              {/* Listing Preview */}
              {result.listing.image && (
                <div className="flex gap-4 mb-4">
                  <img src={result.listing.image} alt="" className="w-20 h-28 object-cover rounded-lg border border-border" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{result.listing.title}</p>
                    {result.listing.condition && (
                      <p className="text-[10px] text-gray-500 mt-1">
                        Condition: <span className="text-white/70">{result.listing.condition}</span>
                      </p>
                    )}
                    {result.listing.seller && (
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        Seller: <span className="text-white/70">{result.listing.seller.username} ({result.listing.seller.feedbackScore})</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Pricing Grid */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-charcoal rounded-lg p-3 text-center border border-border/50">
                  <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Total Cost</div>
                  <div className="text-lg font-mono font-bold text-white">&pound;{result.profit.totalCostGBP.toFixed(2)}</div>
                </div>
                <div className="bg-charcoal rounded-lg p-3 text-center border border-border/50">
                  <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Market Value</div>
                  <div className="text-lg font-mono font-bold text-dexBlue">&pound;{result.profit.marketPriceGBP.toFixed(2)}</div>
                </div>
                <div className="bg-charcoal rounded-lg p-3 text-center border border-border/50">
                  <div className="text-[9px] text-gray-500 uppercase font-mono mb-1">Net Profit</div>
                  <div className={'text-lg font-mono font-bold ' + (result.profit.profitGBP >= 0 ? 'text-dexGreen' : 'text-dexRed')}>
                    {result.profit.profitGBP >= 0 ? '+' : ''}&pound;{result.profit.profitGBP.toFixed(2)}
                  </div>
                  <div className={'text-[10px] font-mono ' + (result.profit.profitPercent >= 0 ? 'text-dexGreen/70' : 'text-dexRed/70')}>
                    {result.profit.profitPercent >= 0 ? '+' : ''}{result.profit.profitPercent.toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Cost Breakdown */}
              <div className="space-y-1.5 font-mono text-[11px] bg-charcoal rounded-lg p-3 border border-border/50">
                <div className="flex justify-between">
                  <span className="text-gray-500">eBay Price</span>
                  <span className="text-white">{result.listing.price ? '\u00a3' + parseFloat(result.listing.price.value).toFixed(2) : '\u2014'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Shipping</span>
                  <span className="text-white">{result.listing.shipping ? '\u00a3' + parseFloat(result.listing.shipping.value).toFixed(2) : 'Free'}</span>
                </div>
              </div>

              {/* Confidence Signals */}
              {typeof result.match.confidence === 'object' && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider font-mono mb-3">Confidence Signals</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(result.match.confidence).filter(([k]) => k !== 'composite').map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between bg-charcoal rounded-lg px-3 py-2 border border-border/30">
                        <span className="text-[11px] text-gray-500 capitalize">{k}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full ${(v as number) >= 0.8 ? 'bg-dexGreen' : (v as number) >= 0.6 ? 'bg-dexYellow' : 'bg-dexRed'}`}
                              style={{ width: `${(v as number) * 100}%` }}
                            />
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
                <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-500 font-mono">
                  <span>Liquidity:</span>
                  <span className={`font-bold ${result.liquidity.grade === 'high' ? 'text-dexGreen' : result.liquidity.grade === 'medium' ? 'text-dexYellow' : 'text-dexRed'}`}>
                    {result.liquidity.grade.toUpperCase()} ({Math.round(result.liquidity.composite * 100)}%)
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* No Match Found */}
        {result && !result.signals.rejected && !result.match && (
          <div className="w-full max-w-2xl">
            <div className="bg-panel border border-border rounded-xl p-8 text-center">
              <I.Search s={32} c="text-gray-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white mb-1">No Match Found</h3>
              <p className="text-xs text-gray-500 font-mono">The listing could not be matched to any card in the catalog.</p>
              {result.listing.title && (
                <p className="text-[11px] font-mono text-gray-600 mt-3 truncate">{result.listing.title}</p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
