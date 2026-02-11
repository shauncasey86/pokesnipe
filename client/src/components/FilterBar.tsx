import { useState } from 'react';
import type { FilterState, Tier, Condition, LiquidityGrade } from '../types/deals';

const FONT_MONO = "var(--font-mono)";

function Seg({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 9px',
        borderRadius: 4,
        border: active ? `1px solid ${color || 'var(--tSec)'}` : '1px solid transparent',
        background: active ? `${color || 'var(--tSec)'}18` : 'transparent',
        color: active ? (color || 'var(--tMax)') : 'var(--tMut)',
        fontFamily: FONT_MONO,
        fontSize: 10,
        fontWeight: active ? 700 : 400,
        cursor: 'pointer',
        transition: 'all 0.12s',
        lineHeight: '16px',
        letterSpacing: 0.5,
      }}
    >
      {label}
    </button>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <span style={{
      fontFamily: FONT_MONO, fontSize: 8, fontWeight: 200,
      textTransform: 'uppercase', letterSpacing: 2,
      color: 'var(--tMut)', flexShrink: 0, userSelect: 'none',
    }}>
      {label}
    </span>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
    }}>
      <GroupLabel label={label} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {children}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      width: 1, height: 18, background: 'var(--brd)',
      margin: '0 6px', flexShrink: 0,
    }} />
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
          width: 18, height: 18, borderRadius: 3,
          background: 'transparent', border: '1px solid var(--brd)',
          color: 'var(--tSec)', fontSize: 11, display: 'flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          fontFamily: FONT_MONO, fontWeight: 200,
          transition: 'all 0.12s',
        }}
      >{'\u2212'}</button>
      <span style={{
        fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700,
        color: 'var(--tMax)', minWidth: 30, textAlign: 'center',
        fontFeatureSettings: "'tnum' 1",
      }}>{value}%</span>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        style={{
          width: 18, height: 18, borderRadius: 3,
          background: 'transparent', border: '1px solid var(--brd)',
          color: 'var(--tSec)', fontSize: 11, display: 'flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          fontFamily: FONT_MONO, fontWeight: 200,
          transition: 'all 0.12s',
        }}
      >+</button>
    </div>
  );
}

const TIER_COLORS: Record<Tier, string> = {
  GRAIL: 'var(--tier-grail)', HIT: 'var(--tier-hit)', FLIP: 'var(--tier-flip)', SLEEP: 'var(--tier-sleep)',
};
const COND_COLORS: Record<Condition, string> = {
  NM: 'var(--green)', LP: 'var(--amber)', MP: '#f97316', HP: 'var(--red)', DM: '#991b1b',
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
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div
      className="filter-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '5px 16px',
        flexWrap: 'wrap',
        borderBottom: '1px solid var(--brd)',
        flexShrink: 0,
        gap: 0,
      }}
    >
      {/* Tier */}
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

      <Divider />

      {/* Condition */}
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

      <div className="filter-extended" style={{ display: 'contents' }}>
        <Divider />

        {/* Liquidity */}
        <FilterGroup label="LIQ">
          {(['high', 'medium', 'low'] as LiquidityGrade[]).map(g => (
            <Seg
              key={g}
              label={g === 'high' ? 'HI' : g === 'medium' ? 'MD' : 'LO'}
              active={filters.liquidityGrades.includes(g)}
              color={g === 'high' ? 'var(--green)' : g === 'medium' ? 'var(--amber)' : '#f97316'}
              onClick={() => onChange({ ...filters, liquidityGrades: toggleInArray(filters.liquidityGrades, g) })}
            />
          ))}
        </FilterGroup>

        <Divider />

        {/* Confidence */}
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

        <Divider />

        {/* Time */}
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

        <Divider />

        {/* Graded toggle */}
        <FilterGroup label="GRADED">
          <Seg
            label={filters.gradedOnly ? 'ON' : 'OFF'}
            active={filters.gradedOnly}
            color="var(--blue)"
            onClick={() => onChange({ ...filters, gradedOnly: !filters.gradedOnly })}
          />
        </FilterGroup>
      </div>

      <Divider />

      {/* Min% */}
      <FilterGroup label="MIN%">
        <Stepper
          value={filters.minProfitPercent}
          onChange={v => onChange({ ...filters, minProfitPercent: v })}
        />
      </FilterGroup>

      <div style={{ marginLeft: 'auto' }} />

      {/* Save button */}
      <button
        onClick={handleSave}
        style={{
          padding: '3px 10px',
          borderRadius: 4,
          background: saved ? 'rgba(52,211,153,0.15)' : 'transparent',
          border: `1px solid ${saved ? 'var(--green)' : 'var(--brd)'}`,
          color: saved ? 'var(--green)' : 'var(--tMut)',
          fontFamily: FONT_MONO,
          fontSize: 9,
          fontWeight: saved ? 700 : 200,
          letterSpacing: 1.5,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        {saved ? 'SAVED' : 'SAVE'}
      </button>

      <style>{`
        @media (max-width: 640px) {
          .filter-extended { display: none !important; }
        }
      `}</style>
    </div>
  );
}
