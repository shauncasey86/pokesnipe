import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import './Header.css';

export default function Header({
  sseConnected,
  onOpenLookup,
  onOpenSettings,
}: {
  sseConnected?: boolean;
  onOpenLookup?: () => void;
  onOpenSettings?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState('');

  const isDashboard = location.pathname === '/' || location.pathname === '/dashboard';
  const isCatalog = location.pathname.startsWith('/catalog');

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      navigate(`/catalog/search?q=${encodeURIComponent(q)}`);
      setQuery('');
    }
  };

  return (
    <header className="header glass-static">
      <div className="header-inner">
        {/* Left zone: Logo + nav */}
        <Link to={isAuthenticated ? '/' : '/catalog'} className="header-logo">
          Poke<span style={{ color: 'var(--red)' }}>Snipe</span>
        </Link>

        <nav className="header-nav">
          {isAuthenticated && (
            <Link to="/" className={`nav-tab ${isDashboard ? 'active' : ''}`}>
              Dashboard
            </Link>
          )}
          <Link to="/catalog" className={`nav-tab ${isCatalog ? 'active' : ''}`}>
            Catalog
          </Link>
        </nav>

        {/* Center zone: Search */}
        <form className="header-search" onSubmit={handleSearch}>
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={isDashboard ? 'Search deals...' : 'Search cards...'}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </form>

        {/* Right zone: Actions */}
        {isAuthenticated && (
          <div className="header-actions">
            {onOpenLookup && (
              <button className="header-btn" onClick={onOpenLookup} title="Manual Lookup">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
            )}
            {onOpenSettings && (
              <button className="header-btn" onClick={onOpenSettings} title="Settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )}
            <div className="live-indicator" style={{ opacity: sseConnected ? 1 : 0.3 }}>
              <span className="live-dot" style={{ background: sseConnected ? 'var(--green)' : 'var(--tMut)' }} />
              <span className="live-text">LIVE</span>
            </div>
          </div>
        )}
      </div>
      <div className="header-accent" />
    </header>
  );
}
