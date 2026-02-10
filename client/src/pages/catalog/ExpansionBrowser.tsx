import { useEffect, useState } from 'react';
import { getExpansions, type Expansion } from '../../api/catalog';
import ExpansionCard from '../../components/ExpansionCard';
import Pagination from '../../components/Pagination';
import './ExpansionBrowser.css';

export default function ExpansionBrowser() {
  const [expansions, setExpansions] = useState<Expansion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-release_date');
  const [series, setSeries] = useState('');
  const [allSeries, setAllSeries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const limit = 24;

  useEffect(() => {
    setLoading(true);
    getExpansions({ sort, series: series || undefined, page, limit })
      .then((res) => {
        setExpansions(res.data);
        setTotal(res.total);
        // Collect unique series from first load
        if (allSeries.length === 0 && res.data.length > 0) {
          const unique = [...new Set(res.data.map((e) => e.series))].sort();
          setAllSeries(unique);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sort, series, page]);

  // Load all series names on mount
  useEffect(() => {
    getExpansions({ limit: 100 })
      .then((res) => {
        const unique = [...new Set(res.data.map((e) => e.series))].sort();
        setAllSeries(unique);
      })
      .catch(console.error);
  }, []);

  return (
    <div className="expansion-browser">
      <div className="browser-header">
        <h1>Card Catalog</h1>
        <div className="browser-controls">
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            <option value="-release_date">Newest First</option>
            <option value="name">Name A-Z</option>
            <option value="-name">Name Z-A</option>
            <option value="card_count">Most Cards</option>
          </select>
          <select value={series} onChange={(e) => { setSeries(e.target.value); setPage(1); }}>
            <option value="">All Series</option>
            {allSeries.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      {loading ? (
        <div className="loading-state">Loading expansions...</div>
      ) : (
        <>
          <div className="expansion-grid">
            {expansions.map((exp) => (
              <ExpansionCard key={exp.id} expansion={exp} />
            ))}
          </div>
          <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
