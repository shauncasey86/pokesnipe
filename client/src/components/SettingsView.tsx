import { useState } from 'react';
import { I } from '../icons';
import { timeAgo } from '../data/mock';

const settingsNow = Date.now();
const credentials = [
  { key: 'EBAY_CLIENT_ID', label: 'eBay Client ID', value: 'PokeSni-PokeSn-PRD-a1b2c3d4e', masked: 'PokeSn\u2026d4e', valid: true, tested: new Date(settingsNow - 2 * 3600000) },
  { key: 'EBAY_CLIENT_SECRET', label: 'eBay Client Secret', value: 'PRD-a1b2c3d4e5f6g7h8', masked: 'PRD-a1\u20267h8', valid: true, tested: new Date(settingsNow - 2 * 3600000) },
  { key: 'SCRYDEX_API_KEY', label: 'Scrydex API Key', value: 'sk_live_abc123def456', masked: 'sk_liv\u2026456', valid: true, tested: new Date(settingsNow - 10 * 60000) },
  { key: 'SCRYDEX_TEAM_ID', label: 'Scrydex Team ID', value: 'team_pokesnipe', masked: 'team_\u2026nipe', valid: true, tested: null as Date | null },
  { key: 'EXCHANGE_RATE_API_KEY', label: 'Exchange Rate API Key', value: 'er_live_xyz789', masked: 'er_liv\u2026789', valid: true, tested: new Date(settingsNow - 47 * 60000) },
  { key: 'TELEGRAM_BOT_TOKEN', label: 'Telegram Bot Token', value: '7123456789:AAH...', masked: '7123\u2026AAH', valid: true, tested: null as Date | null },
  { key: 'TELEGRAM_CHAT_ID', label: 'Telegram Chat ID', value: '-1001234567890', masked: '-100\u2026890', valid: true, tested: null as Date | null },
];

export default function SettingsView() {
  const [scanInterval, setScanInterval] = useState(5);
  const [profitThreshold, setProfitThreshold] = useState(15);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [telegramTest, setTelegramTest] = useState<null | 'loading' | 'ok' | 'error'>(null);
  const [saved, setSaved] = useState(false);

  const doSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const toggles = [
    { label: 'GRAIL deals', desc: 'Profit >40% + high liquidity', on: true },
    { label: 'HIT deals', desc: 'Profit 25\u201340%', on: true },
    { label: 'System warnings', desc: 'API budget, rate limits, staleness', on: true },
    { label: 'Critical alerts', desc: 'Sync failures, accuracy drops', on: true },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-obsidian">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">Settings</h1>
            <p className="text-sm text-muted">Scanner configuration, API credentials, and notification preferences.</p>
          </div>
          <button onClick={doSave} className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${saved ? 'bg-profit text-white' : 'bg-brand hover:bg-brand/90 text-white'}`}>
            {saved ? <span className="flex items-center gap-1.5"><I.Check s={16} />Saved</span> : 'Save Changes'}
          </button>
        </div>

        {/* Scanner Config */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4"><I.Radar s={18} c="text-brand" /><h2 className="text-sm font-bold text-white">Scanner Configuration</h2></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-2">Scan Interval (minutes)</label>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={30} value={scanInterval} onChange={e => setScanInterval(+e.target.value)} className="flex-1 accent-brand h-1.5" />
                <span className="font-mono text-white text-sm w-10 text-right">{scanInterval}m</span>
              </div>
              <p className="text-[10px] text-muted mt-1">Lower = more API calls. Adjusts automatically when budget runs low (&sect;3.3)</p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-2">Minimum Profit Threshold (%)</label>
              <div className="flex items-center gap-3">
                <input type="range" min={5} max={60} step={5} value={profitThreshold} onChange={e => setProfitThreshold(+e.target.value)} className="flex-1 accent-brand h-1.5" />
                <span className="font-mono text-white text-sm w-10 text-right">{profitThreshold}%</span>
              </div>
              <p className="text-[10px] text-muted mt-1">Tightens to &ge;25% when daily budget drops below 500 (&sect;3.3)</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/50">
            <div><label className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">Deal TTL</label><span className="font-mono text-sm text-white">72 hours</span></div>
            <div><label className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">Confidence Floor</label><span className="font-mono text-sm text-white">0.65</span></div>
            <div><label className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">Budget Reserve</label><span className="font-mono text-sm text-white">500 calls</span></div>
            <div><label className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">Max Enrichment</label><span className="font-mono text-sm text-white">50/cycle</span></div>
          </div>
        </div>

        {/* API Credentials */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1"><I.Key s={18} c="text-brand" /><h2 className="text-sm font-bold text-white">API Credentials</h2></div>
          <p className="text-[10px] text-muted mb-4">Encrypted at rest (AES-256-GCM). Keys are never exposed via the API &mdash; only status and masked previews.</p>
          <div className="space-y-2">
            {credentials.map(c => (
              <div key={c.key} className="flex items-center gap-3 bg-obsidian rounded-lg px-4 py-3 border border-border/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{c.label}</span>
                    {c.valid && <span className="text-[8px] text-profit bg-profit/10 px-1.5 py-0.5 rounded font-bold">VALID</span>}
                  </div>
                  <span className="text-[11px] font-mono text-muted">{showKeys[c.key] ? c.value : c.masked}</span>
                </div>
                <button onClick={() => setShowKeys(p => ({ ...p, [c.key]: !p[c.key] }))} className="p-1.5 rounded-lg text-muted hover:text-white transition-colors" title={showKeys[c.key] ? 'Hide' : 'Reveal'}>
                  {showKeys[c.key] ? <I.EyeOff s={14} /> : <I.Eye s={14} />}
                </button>
                {c.tested && <span className="text-[9px] text-muted shrink-0">tested {timeAgo(c.tested)}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Telegram */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1"><I.Bell s={18} c="text-brand" /><h2 className="text-sm font-bold text-white">Telegram Notifications</h2></div>
          <p className="text-[10px] text-muted mb-4">Deal alerts and system warnings via Telegram (&sect;12.3).</p>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {toggles.map(n => (
                <div key={n.label} className="flex items-center justify-between bg-obsidian rounded-lg px-4 py-3 border border-border/50">
                  <div><span className="text-xs font-bold text-white">{n.label}</span><p className="text-[10px] text-muted">{n.desc}</p></div>
                  <div className={`w-10 h-5 rounded-full p-0.5 cursor-pointer transition-colors ${n.on ? 'bg-profit' : 'bg-border'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${n.on ? 'translate-x-5' : ''}`} />
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setTelegramTest('loading'); setTimeout(() => setTelegramTest('ok'), 1500); }}
              disabled={telegramTest === 'loading'}
              className="px-4 py-2 bg-surface border border-border rounded-lg text-sm text-muted hover:text-white hover:border-brand transition-all flex items-center gap-2"
            >
              {telegramTest === 'loading' ? <I.Loader s={14} c="w-3.5 h-3.5" /> : telegramTest === 'ok' ? <I.Check s={14} c="w-3.5 h-3.5 text-profit" /> : <I.Send s={14} c="w-3.5 h-3.5" />}
              {telegramTest === 'loading' ? 'Sending\u2026' : telegramTest === 'ok' ? 'Test sent \u2713' : 'Send Test Message'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
