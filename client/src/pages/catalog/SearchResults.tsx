import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchCards, type CardSummary } from '../../api/catalog';
import CardGrid from '../../components/CardGrid';
import Pagination from '../../components/Pagination';
import './SearchResults.css';

export default function SearchResults() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const limit = 24;

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    searchCards(query, { page, limit })
      .then((res) => {
        setCards(res.data);
        setTotal(res.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [query, page]);

  return (
    <div className="search-results">
      <h1>Search: &ldquo;{query}&rdquo;</h1>
      {!query ? (
        <p className="search-hint">Enter a search term to find cards.</p>
      ) : loading ? (
        <div className="loading-state">Searching...</div>
      ) : (
        <>
          <p className="search-count">{total} result{total !== 1 ? 's' : ''}</p>
          <CardGrid cards={cards} />
          <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
