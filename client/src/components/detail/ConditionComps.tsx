import type { Condition } from '../../types/deals';

interface ConditionCompsProps {
  compsGBP: Record<string, { market: number; low: number }>;
  activeCondition: Condition;
}

const CONDITIONS = ['NM', 'LP', 'MP', 'HP'] as const;

export function ConditionComps({ compsGBP, activeCondition }: ConditionCompsProps) {
  const nmMarket = compsGBP['NM']?.market ?? null;

  return (
    <div className="bg-obsidian border border-border rounded-xl p-5">
      <h3 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">Condition Comps (Scrydex)</h3>
      <div className="grid grid-cols-4 gap-2">
        {CONDITIONS.map(c => {
          const cp = compsGBP[c];
          const isActive = activeCondition === c;
          const delta = cp && nmMarket != null && c !== 'NM' ? cp.market - nmMarket : null;

          return (
            <div
              key={c}
              className={'rounded-lg text-center border relative overflow-hidden transition-all ' +
                (isActive ? 'bg-brand/10 border-brand/30' : 'bg-surface border-border')}
            >
              {/* Top accent bar for active condition */}
              {isActive && <div className="absolute top-0 left-0 right-0 h-0.5 bg-brand" />}

              <div className="p-3">
                <div className={'text-[10px] font-bold mb-1 ' + (isActive ? 'text-brand' : 'text-muted')}>{c}</div>
                {cp ? (
                  <>
                    <div className="text-sm font-mono font-bold text-white">&pound;{(cp.market ?? 0).toFixed(0)}</div>
                    <div className="text-[9px] font-mono text-muted">low &pound;{(cp.low ?? 0).toFixed(0)}</div>
                    {delta != null && (
                      <div className={'text-[8px] font-mono mt-1 ' + (delta >= 0 ? 'text-profit/70' : 'text-risk/70')}>
                        {delta >= 0 ? '+' : ''}&pound;{delta.toFixed(0)} vs NM
                      </div>
                    )}
                  </>
                ) : (
                  <div className="py-2">
                    <div className="w-8 h-px mx-auto border-t border-dashed border-muted/30" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
