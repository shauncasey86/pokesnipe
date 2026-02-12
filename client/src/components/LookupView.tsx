import { useState } from 'react';
import { I } from '../icons';
import { Ring, Tier } from './shared';

interface LookupResultData {
  card: string;
  set: string;
  num: string;
  cond: string;
  conf: number;
  confT: 'high' | 'medium' | 'low';
  tier: string;
  eP: number;
  ship: number;
  bp: number;
  tCost: number;
  mGBP: number;
  pGBP: number;
  pPct: number;
  liq: number;
  liqG: string;
  seller: string;
  fb: number;
  signals: Record<string, number>;
}

export default function LookupView() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doLookup = () => {
    if (!url.trim()) return;
    setLoading(true); setError(null); setResult(null);
    setTimeout(() => {
      if (!url.includes('ebay')) { setError('Invalid URL \u2014 must be an eBay listing (ebay.co.uk/itm/\u2026)'); setLoading(false); return; }
      setResult({
        card: 'Pikachu VMAX', set: 'Vivid Voltage', num: '044/185', cond: 'NM',
        conf: 0.87, confT: 'high', tier: 'FLIP',
        eP: 12.50, ship: 2.99, bp: 0.96, tCost: 16.45, mGBP: 22.30,
        pGBP: 5.85, pPct: 35.6, liq: 0.72, liqG: 'medium',
        seller: 'uk_pokemon_store', fb: 2104,
        signals: { nameMatch: 0.90, numberMatch: 1.0, setMatch: 0.85, imageMatch: 0.82 },
      });
      setLoading(false);
    }, 2200);
  };

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

        {/* Result */}
        {result && (
          <div className="space-y-4">
            <div className="bg-surface border border-border rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <Ring v={Math.round(result.conf * 100)} tier={result.confT} sz={44} />
                <div>
                  <h2 className="text-lg font-bold text-white">{result.card}</h2>
                  <p className="text-sm text-muted font-mono">{result.set} &middot; {result.num} &middot; {result.cond}</p>
                </div>
                <div className="ml-auto"><Tier t={result.tier} /></div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-obsidian rounded-lg p-3 text-center">
                  <div className="text-[9px] text-muted uppercase mb-1">Total Cost</div>
                  <div className="text-lg font-mono font-bold text-white">&pound;{result.tCost.toFixed(2)}</div>
                </div>
                <div className="bg-obsidian rounded-lg p-3 text-center">
                  <div className="text-[9px] text-muted uppercase mb-1">Market Value</div>
                  <div className="text-lg font-mono font-bold text-white">&pound;{result.mGBP.toFixed(2)}</div>
                </div>
                <div className="bg-obsidian rounded-lg p-3 text-center">
                  <div className="text-[9px] text-muted uppercase mb-1">Net Profit</div>
                  <div className="text-lg font-mono font-bold text-profit">+&pound;{result.pGBP.toFixed(2)}</div>
                  <div className="text-[10px] font-mono text-profit/70">+{result.pPct.toFixed(1)}%</div>
                </div>
              </div>

              {/* Cost breakdown */}
              <div className="space-y-1.5 font-mono text-[11px] bg-obsidian rounded-lg p-3">
                <div className="flex justify-between"><span className="text-muted">eBay Price</span><span className="text-white">&pound;{result.eP.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Shipping</span><span className="text-white">{result.ship > 0 ? `\u00a3${result.ship.toFixed(2)}` : 'Free'}</span></div>
                <div className="flex justify-between"><span className="text-muted">Buyer Protection</span><span className="text-white">&pound;{result.bp.toFixed(2)}</span></div>
              </div>

              {/* Match signals */}
              <div className="mt-4 pt-4 border-t border-border/50">
                <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Match Signals</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(result.signals).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between bg-obsidian rounded-lg px-3 py-2">
                      <span className="text-[11px] text-muted capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                          <div className={`h-1.5 rounded-full ${v >= 0.8 ? 'bg-profit' : v >= 0.6 ? 'bg-warn' : 'bg-risk'}`} style={{ width: `${v * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-white/70 w-8 text-right">{(v * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-3 text-[10px] text-muted">
                  <span>Seller:</span><span className="font-mono text-white/70">{result.seller} ({result.fb.toLocaleString()})</span>
                  <span className="mx-2 text-border">&middot;</span>
                  <span>Liquidity:</span>
                  <span className={`font-mono font-bold ${result.liqG === 'high' ? 'text-profit' : result.liqG === 'medium' ? 'text-warn' : 'text-risk'}`}>{result.liqG} ({Math.round(result.liq * 100)}%)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
