import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getExpansionDetail, type ExpansionDetail as ExpType, type CardSummary } from '../../api/catalog';
import CardGrid from '../../components/CardGrid';
import Pagination from '../../components/Pagination';
import './ExpansionDetail.css';

export default function ExpansionDetail() {
  const { id } = useParams<{ id: string }>();
  const [expansion, setExpansion] = useState<ExpType | null>(null);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('number');
  const [rarity, setRarity] = useState('');
  const [loading, setLoading] = useState(true);
  const limit = 50;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getExpansionDetail(id, { sort, rarity: rarity || undefined, page, limit })
      .then((res) => {
        setExpansion(res.expansion);
        setCards(res.cards.data);
        setTotal(res.cards.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, sort, rarity, page]);

  if (loading) {
    return <div className="loading-state">Loading expansion...</div>;
  }

  if (!expansion) {
    return <div className="loading-state">Expansion not found.</div>;
  }

  return (
    <div className="expansion-detail">
      <div className="exp-header">
        {expansion.logo && (
          <img src={expansion.logo} alt={expansion.name} className="exp-header-logo" />
        )}
        <div className="exp-header-info">
          <h1>{expansion.name}</h1>
          <div className="exp-header-meta">
            <span className="mono">{expansion.code}</span>
            <span>{expansion.series}</span>
            <span>{total} cards</span>
            <span>
              {new Date(expansion.releaseDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>

      <div className="exp-controls">
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          <option value="number">By Number</option>
          <option value="name">By Name</option>
          <option value="price">By Price</option>
        </select>
        <select value={rarity} onChange={(e) => { setRarity(e.target.value); setPage(1); }}>
          <option value="">All Rarities</option>
          <option value="Common">Common</option>
          <option value="Uncommon">Uncommon</option>
          <option value="Rare">Rare</option>
          <option value="Double Rare">Double Rare</option>
          <option value="Ultra Rare">Ultra Rare</option>
          <option value="Illustration Rare">Illustration Rare</option>
          <option value="Special Illustration Rare">Special Illustration Rare</option>
          <option value="Hyper Rare">Hyper Rare</option>
        </select>
      </div>

      <CardGrid cards={cards} />
      <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
    </div>
  );
}
