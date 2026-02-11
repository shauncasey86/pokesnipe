import type { SystemStatus } from '../types/deals';

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

function StatusDot({ status }: { status: string }) {
  const color = status === 'healthy' || status === 'running' || status === 'idle'
    ? 'var(--green)'
    : status === 'degraded' || status === 'low' || status === 'scanning'
      ? 'var(--amber)'
      : status === 'paused'
        ? 'var(--tMut)'
        : 'var(--red)';
  return <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: 5, background: color }} />;
}

function scanStateLabel(status: string, lastRun: string | null, lastError: string | null): string {
  if (status === 'scanning') return 'Scanning';
  if (status === 'paused') return 'Paused';
  if (lastError) return 'Error';
  if (status === 'idle') return `Hunting · ${timeAgo(lastRun)}`;
  return 'Hunting';
}

function formatCredits(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function StatusFooter({ status }: { status: SystemStatus | null }) {
  if (!status) return null;

  const scanStatus = status.scanner?.status || 'stopped';
  const grails = status.scanner?.grailsToday ?? 0;
  const accuracy = status.accuracy?.rolling7d;
  const scrydex = status.scrydex;

  return (
    <div
      style={{
        height: 42,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        borderTop: '1px solid var(--brd)',
        background: 'var(--bg1)',
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: 'var(--tSec)',
        flexShrink: 0,
        gap: 12,
        overflow: 'hidden',
      }}
    >
      {/* Left zone: scanner state */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <StatusDot status={scanStatus} />
        <span>
          {scanStateLabel(scanStatus, status.scanner?.lastRun, status.scanner?.lastError)}
        </span>
        <span style={{ color: 'var(--tMut)' }}>|</span>
        <span>
          Today: {status.scanner?.dealsToday ?? 0} · {grails}G · {(status.scanner?.dealsToday ?? 0) - grails}H
        </span>
        {accuracy != null && (
          <>
            <span style={{ color: 'var(--tMut)' }}>|</span>
            <span>Acc: {accuracy}% · 7d</span>
          </>
        )}
      </div>

      {/* Right zone: API stats */}
      <div className="footer-api" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span>
          eBay <StatusDot status={status.ebay?.status || 'healthy'} /> {status.ebay?.callsToday?.toLocaleString()}/{(status.ebay?.dailyLimit / 1000).toFixed(0)}K
        </span>
        <span style={{ color: 'var(--tMut)' }}>|</span>
        {scrydex && (
          <>
            <span>
              Scrydex <StatusDot status={scrydex.status} /> {formatCredits(scrydex.usedCredits)}/{formatCredits(scrydex.totalCredits)}
            </span>
            <span style={{ color: 'var(--tMut)' }}>|</span>
          </>
        )}
        <span>
          Index <StatusDot status="healthy" /> {status.sync?.totalCards?.toLocaleString()} · {timeAgo(status.sync?.lastSync)}
        </span>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .footer-api { display: none !important; }
        }
      `}</style>
    </div>
  );
}
