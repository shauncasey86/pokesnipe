import './TrendDisplay.css';

interface Props {
  trends: Record<string, { price_change?: number; percent_change?: number }>;
}

const PERIODS = ['1d', '7d', '14d', '30d', '90d'];

export default function TrendDisplay({ trends }: Props) {
  const hasData = PERIODS.some((p) => trends[p]);

  if (!hasData) {
    return <p className="trend-empty">No trend data available.</p>;
  }

  return (
    <div className="trend-display">
      {PERIODS.map((period) => {
        const t = trends[period];
        if (!t) return null;
        const pct = t.percent_change ?? 0;
        const cls = Math.abs(pct) < 1 ? 'neutral' : pct > 0 ? 'up' : 'down';
        const arrow = pct > 0 ? '\u25B2' : pct < 0 ? '\u25BC' : '';
        return (
          <div key={period} className={`trend-item ${cls}`}>
            <span className="trend-period">{period}</span>
            <span className="trend-value mono">
              {arrow} {Math.abs(pct).toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
