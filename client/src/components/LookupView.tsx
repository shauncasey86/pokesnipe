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
    <div className={`p-8 h-full overflow-y-auto animate-in flex flex-col items-center ${hasResult ? 'pt-16' : 'justify-center'}`}>
      <div className="w-full max-w-2xl text-center">

        {/* Header */}
        <h2 className="text-3xl font-bold text-white mb-2 font-sans">Manual Override</h2>
        <p className="text-gray-500 mb-8 font-mono text-sm">Direct database access &amp; single-item sniper</p>

        {/* Search Input */}
        <div className="relative mb-6">
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doLookup()}
            placeholder="Paste eBay URL or Enter Card Name..."
            className="w-full bg-panel border border-border rounded-xl px-6 py-4 text-lg text-white outline-none focus:border-dexRed focus:ring-1 focus:ring-dexRed/50 transition-all shadow-2xl"
          />
          <button
            onClick={doLookup}
            disabled={loading || !url.trim()}
            className="absolute right-2 top-2 bottom-2 bg-dexRed text-black font-bold px-6 rounded-lg hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'SCANNING...' : 'SCAN'}
          </button>
        </div>

        {/* Action Cards (when no result) */}
        {!result && !error && (
          <div className="grid grid-cols-2 gap-4 text-left">
            <div className="bg-panel border border-border p-4 rounded-xl cursor-pointer hover:border-gray-500 transition-colors">
              <div className="text-xs text-gray-500 uppercase font-bold mb-1">Set Lookup</div>
              <div className="text-white font-mono">Browse by Expansion</div>
            </div>
            <div className="bg-panel border border-border p-4 rounded-xl cursor-pointer hover:border-gray-500 transition-colors">
              <div className="text-xs text-gray-500 uppercase font-bold mb-1">Seller Search</div>
              <div className="text-white font-mono">Audit User History</div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-dexRed/5 border border-dexRed/20 rounded-xl p-4 flex items-start gap-3 text-left mb-6">
            <I.AlertTriangle s={16} c="text-dexRed shrink-0 mt-0.5" />
            <p className="text-sm text-dexRed">{error}</p>
          </div>
        )}

        {/* Rejected Listing */}
        {result && result.signals.rejected && (
          <div className="bg-panel border border-dexYellow/20 rounded-xl p-4 flex items-start gap-3 text-left mb-6">
            <I.AlertTriangle s={16} c="text-dexYellow shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-dexYellow font-semibold">Listing Rejected</p>
              <p className="text-xs text-gray-500 font-mono mt-1">{result.signals.rejectReason || 'Did not pass signal extraction filters'}</p>
            </div>
          </div>
        )}

        {/* Result */}
        {hasResult && result.match && result.profit && (
          <div className="space-y-4 text-left">
            <div className="bg-panel border border-border rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <Ring v={Math.round((confValue ?? 0) * 100)} tier={confTier} sz={44} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-white">{result.match.cardName}</h2>
                  <p className="text-sm text-gray-500 font-mono">{result.match.cardNumber} &middot; {result.match.variantName}</p>
                </div>
                <div className="ml-auto"><Tier t={result.profit.tier} /></div>
              </div>

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
          <div className="bg-panel border border-border rounded-xl p-8 text-center">
            <I.Search s={32} c="text-gray-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">No Match Found</h3>
            <p className="text-xs text-gray-500 font-mono">The listing could not be matched to any card in the catalog.</p>
            {result.listing.title && (
              <p className="text-[11px] font-mono text-gray-600 mt-3 truncate">{result.listing.title}</p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
