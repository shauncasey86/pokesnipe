interface ConfidenceRingProps {
  /** 0–100 */
  value: number;
  size?: number;
}

export default function ConfidenceRing({ value, size = 44 }: ConfidenceRingProps) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color =
    value >= 90 ? '#4ade80' : value >= 75 ? '#facc15' : value >= 50 ? '#fb923c' : '#ef4444';

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="3"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          transform: 'rotate(90deg)',
          transformOrigin: 'center',
          fontSize: size * 0.28,
          fill: '#e2e8f0',
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
        }}
      >
        {value}%
      </text>
    </svg>
  );
}
