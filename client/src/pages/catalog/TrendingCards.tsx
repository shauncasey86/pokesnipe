import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTrending, type TrendingCard } from '../../api/catalog';
import './TrendingCards.css';

export default function TrendingCards() {
  const [data, setData] = useState<TrendingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');
  const [direction, setDirection] = useState('both');
  const [condition, setCondition] = useState('NM');
  const [minPrice, setMinPrice] = useState('5');

  useEffect(() => {
    setLoading(true);
    getTrending({
      period,
      direction,
      condition,
      minPrice: parseFloat(minPrice) || 0,
      limit: 50,
    })
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period, direction, condition, minPrice]);

  return (
    <div className="trending-page">
      <h1>Trending Cards</h1>
      <div className="trending-filters">
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="1d">1 Day</option>
          <option value="7d">7 Days</option>
          <option value="14d">14 Days</option>
          <option value="30d">30 Days</option>
          <option value="90d">90 Days</option>
        </select>
        <select value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="both">All</option>
          <option value="up">Gainers</option>
          <option value="down">Losers</option>
        </select>
        <select value={condition} onChange={(e) => setCondition(e.target.value)}>
          <option value="NM">NM</option>
          <option value="LP">LP</option>
          <option value="MP">MP</option>
          <option value="HP">HP</option>
        </select>
        <div className="min-price-input">
          <span>Min $</span>
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            min="0"
            step="1"
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading trends...</div>
      ) : data.length === 0 ? (
        <div className="empty-state">No trending data for this filter combination.</div>
      ) : (
        <div className="trending-list">
          {data.map((item, i) => {
            const isUp = item.percentChange > 0;
            const cls = Math.abs(item.percentChange) < 1 ? 'neutral' : isUp ? 'up' : 'down';
            return (
              <Link
                key={`${item.card.id}-${item.variant}-${i}`}
                to={`/catalog/cards/${item.card.id}`}
                className="trending-row glass"
              >
                <div className="trending-rank">{i + 1}</div>
                <div className="trending-img">
                  {item.card.image ? (
                    <img src={item.card.image} alt={item.card.name} />
                  ) : (
                    <div className="trending-img-placeholder" />
                  )}
                </div>
                <div className="trending-info">
                  <span className="trending-name">{item.card.name}</span>
                  <span className="trending-meta">
                    {item.card.expansion} &middot; {item.variant}
                  </span>
                </div>
                <div className="trending-price mono">
                  {item.currentPrice != null ? `$${item.currentPrice.toFixed(2)}` : '—'}
                </div>
                <div className={`trending-change ${cls}`}>
                  <span className="mono">
                    {isUp ? '+' : ''}{item.percentChange.toFixed(1)}%
                  </span>
                  <span className="trending-abs mono">
                    {isUp ? '+' : ''}{item.priceChange.toFixed(2)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
