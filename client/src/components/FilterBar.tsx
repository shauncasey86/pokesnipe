import type { FilterState, Tier, Condition, LiquidityGrade } from '../types/deals';

function Seg({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 8px',
        borderRadius: 4,
        border: `1px solid ${active ? (color || 'var(--tSec)') : 'var(--brd)'}`,
        background: active ? `${color || 'var(--tSec)'}15` : 'transparent',
        color: active ? (color || 'var(--tMax)') : 'var(--tMut)',
        fontFamily: "'DM Mono', monospace",
        fontSize: 10,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.12s',
        lineHeight: '16px',
      }}
    >
      {label}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '3px 8px',
      background: 'var(--glass)',
      borderRadius: 6,
      border: '1px solid var(--brd)',
    }}>
      <span style={{
        fontFamily: "'DM Mono', monospace", fontSize: 9,
        textTransform: 'uppercase', letterSpacing: 1.5,
        color: 'var(--tMut)', marginRight: 2, flexShrink: 0,
      }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function Stepper({ value, onChange, min = 0, max = 100, step = 5 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        style={{
          width: 20, height: 20, borderRadius: 3,
          background: 'transparent', border: '1px solid var(--brd)',
          color: 'var(--tSec)', fontSize: 12, display: 'flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >−</button>
      <span style={{
        fontFamily: "'DM Mono', monospace", fontSize: 10,
        color: 'var(--tMax)', minWidth: 28, textAlign: 'center',
      }}>{value}%</span>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        style={{
          width: 20, height: 20, borderRadius: 3,
          background: 'transparent', border: '1px solid var(--brd)',
          color: 'var(--tSec)', fontSize: 12, display: 'flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >+</button>
    </div>
  );
}

const TIER_COLORS: Record<Tier, string> = {
  GRAIL: '#ff6b35', HIT: '#ffd60a', FLIP: '#6b7fa0', SLEEP: '#3a4060',
};
const COND_COLORS: Record<Condition, string> = {
  NM: 'var(--green)', LP: 'var(--amber)', MP: '#f97316', HP: 'var(--red)',
};

function toggleInArray<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
}

export default function FilterBar({
  filters,
  onChange,
  onSave,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onSave: () => void;
}) {
  return (
    <div
      className="filter-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 16px',
        height: 44,
        borderBottom: '1px solid var(--brd)',
        overflowX: 'auto',
        overflowY: 'hidden',
        flexShrink: 0,
      }}
    >
      <FilterGroup label="TIER">
        {(['GRAIL', 'HIT', 'FLIP', 'SLEEP'] as Tier[]).map(t => (
          <Seg
            key={t}
            label={t}
            active={filters.tiers.includes(t)}
            color={TIER_COLORS[t]}
            onClick={() => onChange({ ...filters, tiers: toggleInArray(filters.tiers, t) })}
          />
        ))}
      </FilterGroup>

      <FilterGroup label="COND">
        {(['NM', 'LP', 'MP', 'HP'] as Condition[]).map(c => (
          <Seg
            key={c}
            label={c}
            active={filters.conditions.includes(c)}
            color={COND_COLORS[c]}
            onClick={() => onChange({ ...filters, conditions: toggleInArray(filters.conditions, c) })}
          />
        ))}
      </FilterGroup>

      <div className="filter-extended">
        <FilterGroup label="LIQ">
          {(['HIGH', 'MED', 'LOW'] as LiquidityGrade[]).map(g => (
            <Seg
              key={g}
              label={g === 'HIGH' ? 'HI' : g === 'MED' ? 'MD' : 'LO'}
              active={filters.liquidityGrades.includes(g)}
              color={g === 'HIGH' ? 'var(--green)' : g === 'MED' ? 'var(--amber)' : '#f97316'}
              onClick={() => onChange({ ...filters, liquidityGrades: toggleInArray(filters.liquidityGrades, g) })}
            />
          ))}
        </FilterGroup>

        <FilterGroup label="CONF">
          {['HI', 'MD'].map(c => (
            <Seg
              key={c}
              label={c}
              active={filters.confidenceLevels.includes(c)}
              color="var(--blue)"
              onClick={() => onChange({ ...filters, confidenceLevels: toggleInArray(filters.confidenceLevels, c) })}
            />
          ))}
        </FilterGroup>

        <FilterGroup label="TIME">
          {['1H', '6H', '24H', 'ALL'].map(t => (
            <Seg
              key={t}
              label={t}
              active={filters.timeWindow === t}
              onClick={() => onChange({ ...filters, timeWindow: t })}
            />
          ))}
        </FilterGroup>

        <FilterGroup label="GRADED">
          <Seg
            label={filters.gradedOnly ? 'ON' : 'OFF'}
            active={filters.gradedOnly}
            color="var(--blue)"
            onClick={() => onChange({ ...filters, gradedOnly: !filters.gradedOnly })}
          />
        </FilterGroup>
      </div>

      <FilterGroup label="MIN%">
        <Stepper
          value={filters.minProfitPercent}
          onChange={v => onChange({ ...filters, minProfitPercent: v })}
        />
      </FilterGroup>

      <button
        onClick={onSave}
        style={{
          padding: '4px 10px',
          borderRadius: 4,
          background: 'var(--glass)',
          border: '1px solid var(--brd)',
          color: 'var(--tSec)',
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 1,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        SAVE
      </button>

      <style>{`
        @media (max-width: 640px) {
          .filter-extended { display: none !important; }
        }
      `}</style>
    </div>
  );
}
