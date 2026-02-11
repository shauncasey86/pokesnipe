import { useState, useEffect } from 'react';
import type { SystemStatus } from '../types/deals';

interface SystemStatusBarProps {
  status: SystemStatus | null;
  isLive: boolean;
  sseState?: 'connected' | 'reconnecting' | 'lost' | 'restored';
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function SystemStatusBar({ status, isLive }: SystemStatusBarProps) {
  const [dotGlow, setDotGlow] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setDotGlow((prev) => !prev);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const dealsToday = status?.scanner?.dealsToday ?? 0;
  const grails = status?.scanner?.grailsToday ?? 0;
  const hits = dealsToday - grails;

  const dotColor = isLive ? '#22c55e' : '#ef4444';
  const labelText = isLive ? 'HUNTING' : 'PAUSED';

  const ebayHealthy = status?.ebay?.status === 'healthy';
  const scrydexHealthy = status?.scrydex?.status === 'healthy' || status?.scrydex?.status === 'ok';

  const separatorStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.1)',
  };

  const greenDotStyle: React.CSSProperties = {
    display: 'inline-block',
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: '#22c55e',
    marginRight: 2,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        padding: '8px 24px',
        background: 'rgba(0,0,0,0.3)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        color: 'rgba(255,255,255,0.3)',
        flexShrink: 0,
      }}
    >
      {/* Live indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: dotColor,
            boxShadow: dotGlow && isLive
              ? `0 0 6px 2px ${dotColor}`
              : 'none',
            transition: 'box-shadow 0.4s ease',
          }}
        />
        <span style={{ fontWeight: 600, color: dotColor }}>
          {labelText}
        </span>
      </div>

      {/* Separator */}
      <span style={separatorStyle}>│</span>

      {/* Today stats */}
      <span>
        Today:{' '}
        <span style={{ color: '#e2e8f0' }}>{dealsToday}</span>
        {' '}
        <span>{grails}G</span>
        {' '}
        <span>{hits}H</span>
      </span>

      {/* Flex spacer */}
      <div style={{ flex: 1 }} />

      {/* eBay status */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        eBay{' '}
        <span
          style={{
            ...greenDotStyle,
            background: ebayHealthy ? '#22c55e' : '#ef4444',
          }}
        />
        {' '}
        {status?.ebay?.callsToday?.toLocaleString() ?? 0}/{((status?.ebay?.dailyLimit ?? 0) / 1000).toFixed(0)}K
      </span>

      {/* Separator */}
      <span style={separatorStyle}>│</span>

      {/* Scrydex status */}
      {status?.scrydex && (
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Scrydex{' '}
            <span
              style={{
                ...greenDotStyle,
                background: scrydexHealthy ? '#22c55e' : '#ef4444',
              }}
            />
            {' '}
            {formatCredits(status.scrydex.creditsConsumed)} used
          </span>

          {/* Separator */}
          <span style={separatorStyle}>│</span>
        </>
      )}

      {/* Index status */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        Index{' '}
        <span style={greenDotStyle} />
        {' '}
        {formatCredits(status?.sync?.totalCards ?? 0)}
      </span>

      {/* Separator */}
      <span style={separatorStyle}>│</span>

      {/* Last sync */}
      <span style={{ color: 'rgba(255,255,255,0.2)' }}>
        {timeAgo(status?.sync?.lastSync ?? null)}
      </span>
    </div>
  );
}
