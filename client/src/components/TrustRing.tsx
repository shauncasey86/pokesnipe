import type { FC } from 'react';

interface TrustRingProps {
  match: number;
  size?: number;
}

function getTrust(m: number) {
  if (m >= 93) return { label: 'Strong', color: 'var(--emerald)', bg: 'var(--emerald-soft)' };
  if (m >= 80) return { label: 'Fair', color: 'var(--amber)', bg: 'var(--amber-soft)' };
  return { label: 'Risky', color: 'var(--coral)', bg: 'var(--coral-soft)' };
}

export { getTrust };

const TrustRing: FC<TrustRingProps> = ({ match, size = 64 }) => {
  const t = getTrust(match);
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const o = c - (match / 100) * c;

  return (
    <div
      className="tr"
      style={{ width: size, height: size }}
      aria-label={`${match}% match — ${t.label}`}
      role="img"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--s3)"
          strokeWidth="4"
          opacity=".35"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={t.color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={o}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.16,1,.3,1)' }}
        />
      </svg>
      <span className="tr__v" style={{ color: t.color }}>
        {match}
      </span>
    </div>
  );
};

export default TrustRing;
