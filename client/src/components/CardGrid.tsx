import { Link } from 'react-router-dom';
import type { CardSummary } from '../api/catalog';
import './CardGrid.css';

interface Props {
  cards: CardSummary[];
}

export default function CardGrid({ cards }: Props) {
  if (cards.length === 0) {
    return <div className="empty-state">No cards found.</div>;
  }

  return (
    <div className="card-grid">
      {cards.map((card) => (
        <Link key={card.id} to={`/catalog/cards/${card.id}`} className="card-tile">
          <div className="card-tile-img">
            {card.image ? (
              <img src={card.image} alt={card.name} loading="lazy" />
            ) : (
              <div className="card-tile-placeholder" />
            )}
          </div>
          <div className="card-tile-info">
            <span className="card-tile-name">{card.name}</span>
            <span className="card-tile-number">#{card.number}</span>
            {card.nmPrice != null && (
              <span className="card-tile-price mono">${card.nmPrice.toFixed(2)}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
