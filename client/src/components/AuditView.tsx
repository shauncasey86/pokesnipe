import { I } from '../icons';

export default function AuditView() {
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-obsidian">
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-bold text-white mb-1">Audit Log</h1>
          <p className="text-sm text-muted">Pipeline trace for every listing processed. Powered by Pino structured logging.</p>
        </div>

        <div className="flex-1 flex items-center justify-center py-20">
          <div className="text-center max-w-sm">
            <I.ScrollText s={48} c="text-muted/20 mx-auto mb-4" />
            <h3 className="text-base font-bold text-white mb-2">No audit log endpoint</h3>
            <p className="text-xs text-muted leading-relaxed">
              Audit logs are written to Pino structured logging on the server.
              To view logs, check your deployment platform&apos;s log viewer (e.g. Railway logs)
              or configure a log drain to an external service.
            </p>
            <div className="mt-4 bg-surface border border-border rounded-lg px-4 py-3 text-left">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">Log locations</p>
              <div className="space-y-1 text-[11px] font-mono text-muted">
                <div><span className="text-white/70">scanner</span> &middot; Deal creation, listing enrichment</div>
                <div><span className="text-white/70">matcher</span> &middot; Card matching, confidence scoring</div>
                <div><span className="text-white/70">pricing</span> &middot; Fee calculation, tier classification</div>
                <div><span className="text-white/70">sync</span> &middot; Catalog delta/full syncs</div>
                <div><span className="text-white/70">ebay</span> &middot; API calls, rate limits, OAuth</div>
                <div><span className="text-white/70">exchange</span> &middot; FX rate fetches</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
