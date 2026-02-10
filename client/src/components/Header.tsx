import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import './Header.css';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      navigate(`/catalog/search?q=${encodeURIComponent(q)}`);
      setQuery('');
    }
  };

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <header className="header glass-static">
      <div className="header-inner">
        <Link to="/catalog" className="header-logo">PokeSnipe</Link>
        <nav className="header-nav">
          <Link to="/catalog" className={`nav-tab ${isActive('/catalog') && !isActive('/catalog/trending') ? 'active' : ''}`}>
            Catalog
          </Link>
          <Link to="/catalog/trending" className={`nav-tab ${isActive('/catalog/trending') ? 'active' : ''}`}>
            Trending
          </Link>
        </nav>
        <form className="header-search" onSubmit={handleSearch}>
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search cards..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
      </div>
      <div className="header-accent" />
    </header>
  );
}
