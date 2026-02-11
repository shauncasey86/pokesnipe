import React from 'react';
import { Link } from 'react-router-dom';

interface SessionStats {
  scanned: number;
  dealsFound: number;
  totalProfit: number;
}

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  sessionStats?: SessionStats;
  onOpenSettings?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '\u229E' },
  { id: 'catalog', label: 'Catalog', icon: '\u229F' },
  { id: 'portfolio', label: 'Portfolio', icon: '\u25C8' },
  { id: 'alerts', label: 'Alerts', icon: '\u25C9', badge: 3 },
  { id: 'settings', label: 'Settings', icon: '\u229B' },
];

const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  sessionStats,
  onOpenSettings,
}) => {
  const containerStyle: React.CSSProperties = {
    width: 220,
    flexShrink: 0,
    background: 'rgba(0,0,0,0.25)',
    borderRight: '1px solid rgba(255,255,255,0.04)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: "'IBM Plex Sans', sans-serif",
    userSelect: 'none',
  };

  const logoSectionStyle: React.CSSProperties = {
    padding: '24px 20px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  };

  const logoIconStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    fontFamily: "'IBM Plex Sans', sans-serif",
    flexShrink: 0,
  };

  const logoTextContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  };

  const logoTextStyle: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    letterSpacing: '0.02em',
    lineHeight: 1.2,
  };

  const logoSubtitleStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    lineHeight: 1.2,
  };

  const navSectionStyle: React.CSSProperties = {
    padding: '8px 0',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  };

  const getNavItemStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 20px',
    cursor: 'pointer',
    position: 'relative',
    background: isActive ? 'rgba(124,58,237,0.12)' : 'transparent',
    color: isActive ? '#c084fc' : 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "'IBM Plex Sans', sans-serif",
    transition: 'background 0.15s ease, color 0.15s ease',
    textDecoration: 'none',
    border: 'none',
    width: '100%',
    textAlign: 'left' as const,
  });

  const getIndicatorStyle = (isActive: boolean): React.CSSProperties => ({
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 3,
    height: 20,
    borderRadius: '0 3px 3px 0',
    background: isActive ? '#7c3aed' : 'transparent',
    transition: 'background 0.15s ease',
  });

  const navIconStyle: React.CSSProperties = {
    fontSize: 16,
    width: 20,
    textAlign: 'center',
    flexShrink: 0,
    lineHeight: 1,
  };

  const badgeStyle: React.CSSProperties = {
    marginLeft: 'auto',
    background: '#7c3aed',
    color: '#fff',
    fontSize: 10,
    fontWeight: 600,
    borderRadius: 10,
    padding: '1px 7px',
    lineHeight: '16px',
    fontFamily: "'IBM Plex Sans', sans-serif",
  };

  const statsSectionStyle: React.CSSProperties = {
    padding: '16px 20px 20px',
    borderTop: '1px solid rgba(255,255,255,0.04)',
  };

  const statsHeaderStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    marginBottom: 12,
    fontFamily: "'IBM Plex Sans', sans-serif",
  };

  const statRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    fontFamily: "'IBM Plex Sans', sans-serif",
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
  };

  const statProfitStyle: React.CSSProperties = {
    ...statValueStyle,
    color: '#4ade80',
  };

  const stats = sessionStats ?? { scanned: 0, dealsFound: 0, totalProfit: 0 };

  const handleNavClick = (item: NavItem) => {
    if (item.id === 'settings') {
      onOpenSettings?.();
    } else if (item.id !== 'catalog') {
      onViewChange(item.id);
    }
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = activeView === item.id;
    const style = getNavItemStyle(isActive);

    const content = (
      <>
        <span style={getIndicatorStyle(isActive)} />
        <span style={navIconStyle}>{item.icon}</span>
        <span>{item.label}</span>
        {item.badge !== undefined && (
          <span style={badgeStyle}>{item.badge}</span>
        )}
      </>
    );

    if (item.id === 'catalog') {
      return (
        <Link
          key={item.id}
          to="/catalog"
          style={style}
          onClick={() => onViewChange(item.id)}
        >
          {content}
        </Link>
      );
    }

    return (
      <div
        key={item.id}
        style={style}
        onClick={() => handleNavClick(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleNavClick(item);
          }
        }}
      >
        {content}
      </div>
    );
  };

  return (
    <div style={containerStyle}>
      {/* Logo */}
      <div style={logoSectionStyle}>
        <div style={logoIconStyle}>P</div>
        <div style={logoTextContainerStyle}>
          <div style={logoTextStyle}>PokeSnipe</div>
          <div style={logoSubtitleStyle}>Arbitrage</div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={navSectionStyle}>
        {navItems.map(renderNavItem)}
      </nav>

      {/* Session Stats */}
      <div style={statsSectionStyle}>
        <div style={statsHeaderStyle}>Session Stats</div>
        <div style={statRowStyle}>
          <span style={statLabelStyle}>Scanned</span>
          <span style={statValueStyle}>
            {stats.scanned.toLocaleString()}
          </span>
        </div>
        <div style={statRowStyle}>
          <span style={statLabelStyle}>Deals found</span>
          <span style={statValueStyle}>
            {stats.dealsFound.toLocaleString()}
          </span>
        </div>
        <div style={{ ...statRowStyle, marginBottom: 0 }}>
          <span style={statLabelStyle}>Total profit</span>
          <span style={statProfitStyle}>
            ${stats.totalProfit.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
