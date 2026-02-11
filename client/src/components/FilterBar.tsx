import { useState, useRef } from 'react';
import type { FilterState, Tier, Condition, LiquidityGrade } from '../types/deals';

/* ─── Mockup-matching color tokens ─── */

const TIER_CHIP_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GRAIL: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', border: '#7c3aed' },
  HIT:   { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa', border: '#2563eb' },
  FLIP:  { bg: 'rgba(34,197,94,0.15)',   text: '#4ade80', border: '#16a34a' },
  SLEEP: { bg: 'rgba(58,64,96,0.15)',    text: '#8290a8', border: '#3a4060' },
};

const ALL_TIERS: Tier[] = ['GRAIL', 'HIT', 'FLIP', 'SLEEP'];
const ALL_CONDS: Condition[] = ['NM', 'LP', 'MP', 'HP', 'DM'];
const TIME_OPTIONS = ['1H', '6H', '24H', 'ALL'] as const;
const SORT_OPTIONS = [
  { value: 'profit', label: 'Profit £' },
  { value: 'profitPct', label: 'Profit %' },
  { value: 'confidence', label: 'Match %' },
  { value: 'recent', label: 'Recent' },
] as const;

/* ─── Sub-components ─── */

function Chip({
  label,
  active,
  activeColor,
  activeBg,
  activeBorder,
  onClick,
}: {
  label: string;
  active: boolean;
  activeColor?: string;
  activeBg?: string;
  activeBorder?: string;
  onClick: () => void;
}) {
  const color = active ? (activeColor || '#c084fc') : 'rgba(255,255,255,0.3)';
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: 6,
        border: active
          ? `1px solid ${activeBorder || 'rgba(124,58,237,0.4)'}`
          : '1px solid transparent',
        background: active
          ? (activeBg || 'rgba(124,58,237,0.12)')
          : 'transparent',
        color,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        transition: 'all 0.12s',
        lineHeight: '16px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </button>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'rgba(255,255,255,0.25)',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {label}
    </span>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <GroupLabel label={label} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {children}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 18,
        background: 'rgba(255,255,255,0.06)',
        margin: '0 8px',
        flexShrink: 0,
      }}
    />
  );
}

function Stepper({ value, onChange, min = 0, max = 100, step = 5 }: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const btnStyle: React.CSSProperties = {
    width: 18,
    height: 18,
    borderRadius: 3,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 200,
    transition: 'all 0.12s',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <button onClick={() => onChange(Math.max(min, value - step))} style={btnStyle}>
        −
      </button>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          fontWeight: 700,
          color: '#e2e8f0',
          minWidth: 30,
          textAlign: 'center',
          fontFeatureSettings: "'tnum' 1",
        }}
      >
        {value}%
      </span>
      <button onClick={() => onChange(Math.min(max, value + step))} style={btnStyle}>
        +
      </button>
    </div>
  );
}

/* ─── Helpers ─── */

function toggleInArray<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const sorted1 = [...a].sort();
  const sorted2 = [...b].sort();
  return sorted1.every((v, i) => v === sorted2[i]);
}

/* ─── Main Component ─── */

export default function FilterBar({
  filters,
  onChange,
  onSave,
  sort,
  onSortChange,
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onSave: () => void;
  sort?: string;
  onSortChange?: (s: string) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const sortRef = useRef<HTMLSelectElement>(null);

  const handleSave = () => {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const allTiersActive = arraysEqual(filters.tiers, ALL_TIERS) || filters.tiers.length === 0;
  const allCondsActive = arraysEqual(filters.conditions, ALL_CONDS) || filters.conditions.length === 0;

  const handleTierClick = (tier: Tier | 'ALL') => {
    if (tier === 'ALL') {
      onChange({ ...filters, tiers: [] });
    } else {
      const newTiers = toggleInArray(filters.tiers, tier);
      onChange({ ...filters, tiers: newTiers });
    }
  };

  const handleCondClick = (cond: Condition | 'ALL') => {
    if (cond === 'ALL') {
      onChange({ ...filters, conditions: [] });
    } else {
      const newConds = toggleInArray(filters.conditions, cond);
      onChange({ ...filters, conditions: newConds });
    }
  };

  return (
    <div
      className="filter-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 20px',
        flexWrap: 'wrap',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        flexShrink: 0,
        gap: 2,
      }}
    >
      {/* Tier */}
      <ChipGroup label="TIER">
        <Chip
          label="ALL"
          active={allTiersActive}
          onClick={() => handleTierClick('ALL')}
        />
        {ALL_TIERS.map((t) => {
          const c = TIER_CHIP_COLORS[t];
          return (
            <Chip
              key={t}
              label={t}
              active={filters.tiers.includes(t) && !allTiersActive}
              activeColor={c.text}
              activeBg={c.bg}
              activeBorder={c.border}
              onClick={() => handleTierClick(t)}
            />
          );
        })}
      </ChipGroup>

      <Divider />

      {/* Condition */}
      <ChipGroup label="COND">
        <Chip
          label="ALL"
          active={allCondsActive}
          onClick={() => handleCondClick('ALL')}
        />
        {(['NM', 'LP', 'MP', 'HP'] as Condition[]).map((c) => (
          <Chip
            key={c}
            label={c}
            active={filters.conditions.includes(c) && !allCondsActive}
            activeColor={c === 'NM' ? '#4ade80' : c === 'LP' ? '#facc15' : c === 'MP' ? '#fb923c' : '#ef4444'}
            activeBg={c === 'NM' ? 'rgba(34,197,94,0.12)' : c === 'LP' ? 'rgba(250,204,21,0.12)' : c === 'MP' ? 'rgba(251,146,60,0.12)' : 'rgba(239,68,68,0.12)'}
            activeBorder={c === 'NM' ? 'rgba(34,197,94,0.3)' : c === 'LP' ? 'rgba(250,204,21,0.3)' : c === 'MP' ? 'rgba(251,146,60,0.3)' : 'rgba(239,68,68,0.3)'}
            onClick={() => handleCondClick(c)}
          />
        ))}
      </ChipGroup>

      <Divider />

      {/* Time */}
      <ChipGroup label="TIME">
        {TIME_OPTIONS.map((t) => (
          <Chip
            key={t}
            label={t}
            active={filters.timeWindow === t}
            onClick={() => onChange({ ...filters, timeWindow: t })}
          />
        ))}
      </ChipGroup>

      {/* Extended filters toggle */}
      <Divider />
      <button
        onClick={() => setShowMore(!showMore)}
        style={{
          padding: '3px 8px',
          borderRadius: 4,
          background: showMore ? 'rgba(124,58,237,0.08)' : 'transparent',
          border: '1px solid rgba(255,255,255,0.06)',
          color: showMore ? '#c084fc' : 'rgba(255,255,255,0.3)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.12s',
        }}
      >
        {showMore ? '− Less' : '+ More'}
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Sort dropdown */}
      {onSortChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <GroupLabel label="SORT" />
          <select
            ref={sortRef}
            value={sort || 'recent'}
            onChange={(e) => onSortChange(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: '#e2e8f0',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              paddingRight: 20,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23666' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 6px center',
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        style={{
          padding: '4px 12px',
          borderRadius: 6,
          marginLeft: 8,
          background: saved ? 'rgba(34,197,94,0.12)' : 'transparent',
          border: `1px solid ${saved ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
          color: saved ? '#4ade80' : 'rgba(255,255,255,0.3)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          fontWeight: saved ? 700 : 500,
          letterSpacing: '0.1em',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s',
          textTransform: 'uppercase',
        }}
      >
        {saved ? 'SAVED' : 'SAVE'}
      </button>

      {/* Extended filters row */}
      {showMore && (
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            paddingTop: 6,
            marginTop: 2,
            borderTop: '1px solid rgba(255,255,255,0.03)',
          }}
        >
          {/* Liquidity */}
          <ChipGroup label="LIQ">
            {(['high', 'medium', 'low'] as LiquidityGrade[]).map((g) => (
              <Chip
                key={g}
                label={g === 'high' ? 'HI' : g === 'medium' ? 'MD' : 'LO'}
                active={filters.liquidityGrades.includes(g)}
                activeColor={g === 'high' ? '#4ade80' : g === 'medium' ? '#facc15' : '#fb923c'}
                activeBg={g === 'high' ? 'rgba(34,197,94,0.12)' : g === 'medium' ? 'rgba(250,204,21,0.12)' : 'rgba(251,146,60,0.12)'}
                activeBorder={g === 'high' ? 'rgba(34,197,94,0.3)' : g === 'medium' ? 'rgba(250,204,21,0.3)' : 'rgba(251,146,60,0.3)'}
                onClick={() =>
                  onChange({
                    ...filters,
                    liquidityGrades: toggleInArray(filters.liquidityGrades, g),
                  })
                }
              />
            ))}
          </ChipGroup>

          <Divider />

          {/* Confidence */}
          <ChipGroup label="CONF">
            {['HI', 'MD'].map((c) => (
              <Chip
                key={c}
                label={c}
                active={filters.confidenceLevels.includes(c)}
                activeColor="#60a5fa"
                activeBg="rgba(59,130,246,0.12)"
                activeBorder="rgba(59,130,246,0.3)"
                onClick={() =>
                  onChange({
                    ...filters,
                    confidenceLevels: toggleInArray(filters.confidenceLevels, c),
                  })
                }
              />
            ))}
          </ChipGroup>

          <Divider />

          {/* Graded */}
          <ChipGroup label="GRADED">
            <Chip
              label={filters.gradedOnly ? 'ON' : 'OFF'}
              active={filters.gradedOnly}
              activeColor="#60a5fa"
              activeBg="rgba(59,130,246,0.12)"
              activeBorder="rgba(59,130,246,0.3)"
              onClick={() => onChange({ ...filters, gradedOnly: !filters.gradedOnly })}
            />
          </ChipGroup>

          <Divider />

          {/* Min% */}
          <ChipGroup label="MIN%">
            <Stepper
              value={filters.minProfitPercent}
              onChange={(v) => onChange({ ...filters, minProfitPercent: v })}
            />
          </ChipGroup>
        </div>
      )}
    </div>
  );
}
