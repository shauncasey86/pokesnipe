import type { FC } from 'react';
import { getTrust } from './TrustRing';
import type { Deal } from '../types/deals';

const TIER: Record<string, { c: string }> = {
  GRAIL: { c: '#c4b5fd' },
  HIT: { c: '#60a5fa' },
  FLIP: { c: '#f472b6' },
  SLEEP: { c: '#3a4060' },
};

interface QueueCardProps {
  deal: Deal;
  index: number;
  isCurrent: boolean;
  onClick: () => void;
}

const QueueCard: FC<QueueCardProps> = ({ deal, index, isCurrent, onClick }) => {
  const profit = deal.profit_gbp ?? 0;
  const roi = deal.profit_percent ?? 0;
  const confidence = Math.round((deal.confidence ?? 0) * 100);
  const trust = getTrust(confidence);
  const ts = TIER[deal.tier] || TIER.HIT;
  const name = deal.cardName || deal.ebay_title || 'Unknown';
  const set = deal.expansion_name || '';

  return (
    <button
      className={`qc ${isCurrent ? 'qc--on' : ''}`}
      onClick={onClick}
      style={{ animationDelay: `${index * 35}ms` }}
      aria-label={`${name} — +£${profit.toFixed(2)}`}
    >
      <div className="qc__strip" style={{ background: ts.c }} />
      {deal.ebay_image_url ? (
        <img
          src={deal.ebay_image_url}
          alt=""
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            objectFit: 'cover',
            flexShrink: 0,
            paddingLeft: 4,
          }}
        />
      ) : (
        <span className="qc__emoji">🃏</span>
      )}
      <div className="qc__info">
        <span className="qc__name">{name}</span>
        <span className="qc__set">{set}</span>
      </div>
      <div className="qc__nums">
        <span className="qc__profit">+£{profit.toFixed(2)}</span>
        <span className="qc__roi">+{roi.toFixed(0)}%</span>
      </div>
      <div className="qc__ring" style={{ borderColor: trust.color + '55' }}>
        <span style={{ color: trust.color }}>{confidence}</span>
      </div>
    </button>
  );
};

interface SessionStats {
  scanned: number;
  dealsFound: number;
  totalProfit: number;
  snagged: number;
  skipped: number;
  snagTotal: number;
}

interface QueuePanelProps {
  deals: Deal[];
  currentDealId: string | null;
  onSelectDeal: (id: string) => void;
  sessionStats: SessionStats;
}

const QueuePanel: FC<QueuePanelProps> = ({
  deals,
  currentDealId,
  onSelectDeal,
  sessionStats,
}) => {
  return (
    <aside className="queue">
      <div className="queue__hdr">
        <span className="queue__title">Up Next</span>
        <span className="queue__count">{deals.length}</span>
      </div>
      <div className="queue__list" role="list">
        {deals.map((d, i) => (
          <QueueCard
            key={d.deal_id}
            deal={d}
            index={i}
            isCurrent={d.deal_id === currentDealId}
            onClick={() => onSelectDeal(d.deal_id)}
          />
        ))}
        {deals.length === 0 && (
          <div className="hero-empty" style={{ padding: '40px 16px' }}>
            <span className="hero-empty__icon">📭</span>
            <p className="hero-empty__text">No deals yet</p>
          </div>
        )}
      </div>
      <div className="queue__session">
        <span className="qs__title">Session</span>
        <div className="qs__row">
          <span>Scanned</span>
          <span>{sessionStats.scanned}</span>
        </div>
        <div className="qs__row">
          <span>Deals found</span>
          <span>{sessionStats.dealsFound}</span>
        </div>
        <div className="qs__row">
          <span>Snagged</span>
          <span>{sessionStats.snagged}</span>
        </div>
        <div className="qs__row">
          <span>Skipped</span>
          <span>{sessionStats.skipped}</span>
        </div>
        <div className="qs__total">
          <span>Snagged value</span>
          <span>£{sessionStats.snagTotal.toFixed(2)}</span>
        </div>
      </div>
    </aside>
  );
};

export default QueuePanel;
