import type { FC } from 'react';

interface RailProps {
  active: string;
  onNav: (id: string) => void;
  isPaused: boolean;
  onPause: () => void;
}

const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    d: 'M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z',
  },
  {
    id: 'catalog',
    label: 'Catalog',
    d: 'M4 4h12M4 8h12M4 12h8M4 16h5',
  },
  {
    id: 'alerts',
    label: 'Alerts',
    d: 'M10 2a6 6 0 016 6c0 3 1 5 1 5H3s1-2 1-5a6 6 0 016-6zM8 17a2 2 0 004 0',
  },
  {
    id: 'settings',
    label: 'Settings',
    d: 'M10 13a3 3 0 100-6 3 3 0 000 6z',
  },
];

const Rail: FC<RailProps> = ({ active, onNav, isPaused, onPause }) => {
  return (
    <nav className="rail" aria-label="Main navigation">
      <div className="rail__logo">P</div>
      <div className="rail__nav">
        {NAV_ITEMS.map((it) => (
          <button
            key={it.id}
            className={`rail__btn ${active === it.id ? 'rail__btn--on' : ''}`}
            onClick={() => onNav(it.id)}
            title={it.label}
            aria-label={it.label}
            aria-current={active === it.id ? 'page' : undefined}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path
                d={it.d}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ))}
      </div>
      <button
        className={`rail__pause ${isPaused ? 'off' : 'on'}`}
        onClick={onPause}
        title={isPaused ? 'Paused — click to resume' : 'Live — click to pause'}
        aria-label={isPaused ? 'Resume scanner' : 'Pause scanner'}
      >
        <span className="rail__dot" />
      </button>
    </nav>
  );
};

export default Rail;
