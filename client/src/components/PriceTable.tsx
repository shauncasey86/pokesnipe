import './PriceTable.css';

interface Props {
  prices: Record<string, { low?: number; market?: number }>;
}

const CONDITIONS = ['NM', 'LP', 'MP', 'HP'];

export default function PriceTable({ prices }: Props) {
  const hasData = CONDITIONS.some((c) => prices[c]);

  if (!hasData) {
    return <p className="price-table-empty">No pricing data available.</p>;
  }

  return (
    <table className="price-table">
      <thead>
        <tr>
          <th>Condition</th>
          <th>Low</th>
          <th>Market</th>
        </tr>
      </thead>
      <tbody>
        {CONDITIONS.map((cond) => {
          const p = prices[cond];
          if (!p) return null;
          return (
            <tr key={cond}>
              <td className="cond-label">{cond}</td>
              <td className="mono">{p.low != null ? `$${p.low.toFixed(2)}` : '—'}</td>
              <td className="mono">{p.market != null ? `$${p.market.toFixed(2)}` : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
