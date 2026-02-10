import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCardDetail, type CardDetail, type Variant } from '../../api/catalog';
import PriceTable from '../../components/PriceTable';
import TrendDisplay from '../../components/TrendDisplay';
import './CardDetailPage.css';

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [expansion, setExpansion] = useState<{
    id: string; name: string; code: string; series: string; logo: string | null;
  } | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [activeVariant, setActiveVariant] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getCardDetail(id)
      .then((res) => {
        setCard(res.card);
        setExpansion(res.expansion);
        setVariants(res.variants);
        setActiveVariant(0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="loading-state">Loading card...</div>;
  }

  if (!card) {
    return <div className="loading-state">Card not found.</div>;
  }

  const variant = variants[activeVariant];
  const displayImage = variant?.image || card.imageLarge || card.image;

  return (
    <div className="card-detail">
      <div className="card-detail-layout">
        <div className="card-detail-image">
          {displayImage ? (
            <img src={displayImage} alt={card.name} />
          ) : (
            <div className="card-detail-placeholder">No image</div>
          )}
        </div>

        <div className="card-detail-data">
          <h1>{card.name}</h1>
          <div className="card-meta-row">
            <span className="mono">#{card.number}</span>
            {card.rarity && <span className="badge">{card.rarity}</span>}
            {card.supertype && <span className="badge">{card.supertype}</span>}
            {card.subtypes.map((st) => (
              <span key={st} className="badge">{st}</span>
            ))}
          </div>
          {card.artist && <p className="card-artist">Illustrated by {card.artist}</p>}

          {expansion && (
            <Link to={`/catalog/expansions/${expansion.id}`} className="card-expansion glass-static">
              {expansion.logo && <img src={expansion.logo} alt={expansion.name} className="card-exp-logo" />}
              <div>
                <span className="card-exp-name">{expansion.name}</span>
                <span className="card-exp-series">{expansion.series} &middot; {expansion.code}</span>
              </div>
            </Link>
          )}

          {variants.length > 1 && (
            <div className="variant-tabs">
              {variants.map((v, i) => (
                <button
                  key={v.name}
                  className={`variant-tab ${i === activeVariant ? 'active' : ''}`}
                  onClick={() => setActiveVariant(i)}
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}
          {variants.length === 1 && (
            <div className="variant-label">Variant: {variants[0].name}</div>
          )}

          {variant && (
            <>
              <div className="detail-section">
                <h2>Raw Prices</h2>
                <PriceTable prices={variant.prices} />
              </div>

              {Object.keys(variant.gradedPrices).length > 0 && (
                <div className="detail-section">
                  <h2>Graded Prices</h2>
                  <table className="price-table">
                    <thead>
                      <tr>
                        <th>Grade</th>
                        <th>Low</th>
                        <th>Market</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(variant.gradedPrices).map(([grade, p]) => (
                        <tr key={grade}>
                          <td className="cond-label">{grade.replace('_', ' ')}</td>
                          <td className="mono">{p.low != null ? `$${p.low.toFixed(2)}` : '—'}</td>
                          <td className="mono">{p.market != null ? `$${p.market.toFixed(2)}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="detail-section">
                <h2>Price Trends (NM)</h2>
                <TrendDisplay trends={variant.trends['NM'] || {}} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
