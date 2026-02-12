import { useState } from 'react';
import { I } from '../../icons';
import type { Deal } from '../../types/deals';

interface PricingSectionProps {
  d: Deal;
}

export function PricingSection({ d }: PricingSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const profit = d.profit_gbp ?? 0;
  const profitPct = d.profit_percent ?? 0;
  const cost = d.total_cost_gbp ?? 0;
  const market = d.market_price_gbp ?? 0;
  const isProfit = profit >= 0;

  // Bar widths for the waterfall visualization
  const total = cost + Math.abs(profit);
  const costPct = total > 0 ? (cost / total) * 100 : 50;
  const profitPct2 = total > 0 ? (Math.abs(profit) / total) * 100 : 50;

  return (
    <div className="bg-obsidian border border-border rounded-xl relative overflow-hidden">
      <div className={'absolute left-0 top-0 bottom-0 w-1 ' + (isProfit ? 'bg-profit' : 'bg-risk')} />

      {/* Profit hero */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-baseline gap-3">
          <span className={'text-3xl font-mono font-bold ' + (isProfit ? 'text-profit' : 'text-risk')}>
            {isProfit ? '+' : ''}&pound;{profit.toFixed(2)}
          </span>
          <span className={'text-sm font-mono font-semibold ' + (isProfit ? 'text-profit/70' : 'text-risk/70')}>
            {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}% ROI
          </span>
        </div>

        {/* Waterfall bar */}
        <div className="mt-3 mb-1">
          <div className="flex rounded-md overflow-hidden h-2.5">
            <div className="bg-muted/30 transition-all" style={{ width: costPct + '%' }} />
            <div className={(isProfit ? 'bg-profit/60' : 'bg-risk/60') + ' transition-all'} style={{ width: profitPct2 + '%' }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[9px] font-mono">
            <span className="text-muted">Cost &pound;{cost.toFixed(2)}</span>
            <span className="text-white/70">Market &pound;{market.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Expandable cost breakdown */}
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-center gap-1.5 py-2 border-t border-border/50 text-[10px] text-muted/60 hover:text-muted hover:bg-white/[.02] transition-colors"
        aria-expanded={expanded}
        aria-label="Toggle cost breakdown"
      >
        <span>Cost breakdown</span>
        <I.ChevronDown s={12} c={'transition-transform duration-200 ' + (expanded ? 'rotate-180' : '')} />
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-2 font-mono text-sm border-t border-border/50 pt-3">
          <div className="flex justify-between text-white">
            <span className="text-muted font-sans text-xs">eBay Listing</span>
            <span>&pound;{(d.ebay_price_gbp ?? 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-white">
            <span className="text-muted font-sans text-xs">Shipping</span>
            <span>{(d.ebay_shipping_gbp ?? 0) > 0 ? '\u00a3' + (d.ebay_shipping_gbp ?? 0).toFixed(2) : 'Free'}</span>
          </div>
          <div className="flex justify-between text-white">
            <span className="text-muted font-sans text-xs">Buyer Protection</span>
            <span>&pound;{(d.buyer_prot_fee ?? 0).toFixed(2)}</span>
          </div>
          <div className="w-full h-px bg-border/50" />
          <div className="flex justify-between text-[10px] text-muted">
            <span className="font-sans">FX Rate</span>
            <span>USD/GBP {(d.exchange_rate ?? 0).toFixed(4)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
