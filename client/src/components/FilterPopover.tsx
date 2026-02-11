import type { FC } from 'react';
import type { FilterState, Tier, Condition, LiquidityGrade } from '../types/deals';

interface FilterPopoverProps {
  show: boolean;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onSave?: () => void;
}

function toggleInArray<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

const FilterPopover: FC<FilterPopoverProps> = ({ show, filters, onChange, onSave }) => {
  if (!show) return null;

  const setFilter = (key: keyof FilterState, value: unknown) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="fpop" role="dialog" aria-label="Filter deals">
      <div className="fpop__g">
        <span className="fpop__l">Tier</span>
        <div className="fpop__c">
          {(['GRAIL', 'HIT', 'FLIP', 'SLEEP'] as Tier[]).map((v) => (
            <button
              key={v}
              className={`fc ${filters.tiers.includes(v) ? 'fc--on' : ''}`}
              onClick={() => setFilter('tiers', toggleInArray(filters.tiers, v))}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="fpop__g">
        <span className="fpop__l">Condition</span>
        <div className="fpop__c">
          {(['NM', 'LP', 'MP', 'HP'] as Condition[]).map((v) => (
            <button
              key={v}
              className={`fc ${filters.conditions.includes(v) ? 'fc--on' : ''}`}
              onClick={() => setFilter('conditions', toggleInArray(filters.conditions, v))}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="fpop__g">
        <span className="fpop__l">Liquidity</span>
        <div className="fpop__c">
          {(['high', 'medium', 'low'] as LiquidityGrade[]).map((v) => (
            <button
              key={v}
              className={`fc ${filters.liquidityGrades.includes(v) ? 'fc--on' : ''}`}
              onClick={() =>
                setFilter('liquidityGrades', toggleInArray(filters.liquidityGrades, v))
              }
            >
              {v === 'high' ? 'HI' : v === 'medium' ? 'MD' : 'LO'}
            </button>
          ))}
        </div>
      </div>
      <div className="fpop__g">
        <span className="fpop__l">Confidence</span>
        <div className="fpop__c">
          {['HI', 'MD'].map((v) => (
            <button
              key={v}
              className={`fc ${filters.confidenceLevels.includes(v) ? 'fc--on' : ''}`}
              onClick={() =>
                setFilter('confidenceLevels', toggleInArray(filters.confidenceLevels, v))
              }
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="fpop__g">
        <span className="fpop__l">Time</span>
        <div className="fpop__c">
          {['1H', '6H', '24H', 'ALL'].map((v) => (
            <button
              key={v}
              className={`fc ${filters.timeWindow === v ? 'fc--on' : ''}`}
              onClick={() => setFilter('timeWindow', v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {onSave && (
        <div className="fpop__g" style={{ borderTop: '1px solid var(--b1)', paddingTop: 8 }}>
          <button className="fc fc--on" onClick={onSave} style={{ width: '100%' }}>
            Save as default
          </button>
        </div>
      )}
    </div>
  );
};

export default FilterPopover;
