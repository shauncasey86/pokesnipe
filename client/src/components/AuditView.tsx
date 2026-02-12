import { useState } from 'react';
import { AUDIT_LOG, fmtTime } from '../data/mock';

const levelCfg: Record<string, { bg: string; text: string }> = {
  info: { bg: 'bg-brand/10', text: 'text-brand' },
  warn: { bg: 'bg-warn/10', text: 'text-warn' },
  error: { bg: 'bg-risk/10', text: 'text-risk' },
};

export default function AuditView() {
  const [filter, setFilter] = useState('all');
  const [svcFilter, setSvcFilter] = useState('all');
  const services = [...new Set(AUDIT_LOG.map(l => l.service))];
  const filtered = AUDIT_LOG.filter(l => (filter === 'all' || l.level === filter) && (svcFilter === 'all' || l.service === svcFilter));

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-obsidian">
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Audit Log</h1>
          <p className="text-sm text-muted">Pipeline trace for every listing processed. Powered by Pino structured logging (&sect;12.1).</p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
            {['all', 'info', 'warn', 'error'].map(l => (
              <button key={l} onClick={() => setFilter(l)} className={`px-3 py-1.5 text-[10px] font-bold rounded tracking-wider transition-all ${filter === l ? 'bg-border text-white shadow-sm' : 'text-muted/50 hover:text-muted'}`}>{l.toUpperCase()}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
            <button onClick={() => setSvcFilter('all')} className={`px-3 py-1.5 text-[10px] font-bold rounded tracking-wider transition-all ${svcFilter === 'all' ? 'bg-border text-white shadow-sm' : 'text-muted/50 hover:text-muted'}`}>ALL</button>
            {services.map(s => (
              <button key={s} onClick={() => setSvcFilter(s)} className={`px-3 py-1.5 text-[10px] font-bold rounded tracking-wider transition-all ${svcFilter === s ? 'bg-border text-white shadow-sm' : 'text-muted/50 hover:text-muted'}`}>{s}</button>
            ))}
          </div>
          <span className="text-[10px] text-muted ml-auto font-mono">{filtered.length} entries</span>
        </div>

        {/* Log entries */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[80px_70px_90px_1fr] text-[9px] font-bold text-muted uppercase tracking-wider px-4 py-2.5 border-b border-border bg-surface">
            <span>Time</span><span>Level</span><span>Service</span><span>Message</span>
          </div>
          <div className="divide-y divide-border/50 max-h-[calc(100vh-280px)] overflow-y-auto">
            {filtered.map(l => {
              const lc = levelCfg[l.level] ?? levelCfg.info;
              return (
                <div key={l.id} className="grid grid-cols-[80px_70px_90px_1fr] px-4 py-3 text-sm hover:bg-surfaceHover transition-colors items-start">
                  <span className="font-mono text-[11px] text-muted">{fmtTime(l.ts)}</span>
                  <span><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${lc.bg} ${lc.text}`}>{l.level.toUpperCase()}</span></span>
                  <span className="font-mono text-[11px] text-white/60">{l.service}</span>
                  <div>
                    <span className="text-white text-[12px]">{l.msg}</span>
                    {l.ctx && (
                      <div className="mt-1 font-mono text-[10px] text-muted bg-obsidian rounded px-2.5 py-1.5 inline-flex flex-wrap gap-x-3 gap-y-0.5">
                        {Object.entries(l.ctx).map(([k, v]) => (
                          <span key={k}><span className="text-muted/60">{k}:</span> <span className="text-white/70">{String(v)}</span></span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
