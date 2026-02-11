import { Link } from 'react-router-dom';
import type { Expansion } from '../api/catalog';
import './ExpansionCard.css';

interface Props {
  expansion: Expansion;
}

export default function ExpansionCard({ expansion }: Props) {
  return (
    <Link to={`/catalog/expansions/${expansion.id}`} className="expansion-card">
      <div className="expansion-card-logo">
        {expansion.logo ? (
          <img src={expansion.logo} alt={expansion.name} />
        ) : (
          <span className="expansion-card-code">{expansion.code}</span>
        )}
      </div>
      <div className="expansion-card-info">
        <span className="expansion-card-name">{expansion.name}</span>
        <div className="expansion-card-meta">
          <span className="mono">{expansion.code}</span>
          <span>{expansion.cardCount} cards</span>
        </div>
        <span className="expansion-card-date">
          {new Date(expansion.releaseDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>
    </Link>
  );
}
