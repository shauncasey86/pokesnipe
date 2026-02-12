import { trendInfo } from '../../data/mock';
import type { DealDetail, Condition } from '../../types/deals';

interface PriceTrendProps {
  trend7d: number | null;
  trend30d: number | null;
  variantTrends: DealDetail['variant_trends'];
  condition: Condition;
}

const WINDOWS = ['7d', '30d', '90d'] as const;

export function PriceTrend({ trend7d, trend30d, variantTrends, condition }: PriceTrendProps) {
  return (
    <div className="bg-obsidian border border-border rounded-xl p-5">
      <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Price Trend</h3>
      <div className="grid grid-cols-3 gap-2">
        {WINDOWS.map(w => {
          const raw = w === '7d' ? trend7d
            : w === '30d' ? trend30d
            : (variantTrends && condition ? variantTrends[condition]?.['90d']?.percent_change : null) ?? null;
          const ti = trendInfo(raw);
          return (
            <div key={w} className="bg-surface rounded-lg p-3 text-center">
              <div className="text-[10px] font-bold text-muted uppercase mb-1">{w}</div>
              <div className={'text-sm font-mono font-bold ' + ti.c}>
                {raw != null ? (raw > 0 ? '+' : '') + raw.toFixed(1) + '%' : '\u2014'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
