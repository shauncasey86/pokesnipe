import { useState } from 'react';
import { Ring, SignalGrid } from '../shared';
import { CONF_WEIGHTS, LIQ_WEIGHTS_V, LIQ_WEIGHTS_NV } from '../../data/mock';
import type { Deal, DealDetail } from '../../types/deals';

interface SignalCardsProps {
  d: Deal;
  confSignals: DealDetail['match_signals'] extends { confidence?: infer C } ? C | null : null;
  liqSignals: DealDetail['match_signals'] extends { liquidity?: infer L } ? L | null : null;
}

export function SignalCards({ d, confSignals, liqSignals }: SignalCardsProps) {
  const [confFlipped, setConfFlipped] = useState(false);
  const [liqFlipped, setLiqFlipped] = useState(false);

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Confidence */}
      <div
        className="bg-obsidian border border-border rounded-xl p-4 cursor-pointer transition-all hover:border-border/80"
        onClick={() => setConfFlipped(p => !p)}
        role="button"
        aria-label="Toggle confidence signal details"
      >
        {!confFlipped || !confSignals ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-bold text-muted uppercase tracking-wider">Confidence</span>
              {confSignals && <span className="text-[8px] text-muted/40">tap</span>}
            </div>
            <div className="flex items-center gap-3">
              <Ring v={Math.round((d.confidence ?? 0) * 100)} tier={d.confidence_tier ?? 'low'} sz={44} />
              <div>
                <div className="text-xl font-mono font-bold text-white">{Math.round((d.confidence ?? 0) * 100)}%</div>
                <div className="text-[10px] text-muted capitalize">{d.confidence_tier ?? '\u2014'}</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-muted uppercase tracking-wider">Signals</span>
              <span className="text-[8px] font-mono text-muted/50">geo. mean</span>
            </div>
            <SignalGrid signals={{
              name: confSignals.name ?? 0,
              denominator: confSignals.denom ?? 0,
              number: confSignals.number ?? 0,
              expansion: confSignals.expansion ?? 0,
              variant: confSignals.variant ?? 0,
              normalization: confSignals.extract ?? 0,
            }} weights={CONF_WEIGHTS} />
          </>
        )}
      </div>

      {/* Liquidity */}
      <div
        className="bg-obsidian border border-border rounded-xl p-4 cursor-pointer transition-all hover:border-border/80"
        onClick={() => setLiqFlipped(p => !p)}
        role="button"
        aria-label="Toggle liquidity signal details"
      >
        {!liqFlipped || !liqSignals?.signals ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-bold text-muted uppercase tracking-wider">Liquidity</span>
              {liqSignals?.signals && <span className="text-[8px] text-muted/40">tap</span>}
            </div>
            <div className="flex items-center gap-3">
              <Ring v={Math.round((d.liquidity_score ?? 0) * 100)} tier={d.liquidity_grade === 'high' ? 'high' : d.liquidity_grade === 'medium' ? 'medium' : 'low'} sz={44} />
              <div>
                <div className="text-xl font-mono font-bold text-white">{Math.round((d.liquidity_score ?? 0) * 100)}%</div>
                <div className="text-[10px] text-muted capitalize">{d.liquidity_grade ?? '\u2014'}</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-muted uppercase tracking-wider">Signals</span>
              <span className="text-[8px] font-mono text-muted/50">arith. mean</span>
            </div>
            <SignalGrid signals={liqSignals.signals as Record<string, number>} weights={liqSignals.signals.velocity != null ? LIQ_WEIGHTS_V : LIQ_WEIGHTS_NV} />
          </>
        )}
      </div>
    </div>
  );
}
