import { useState, useEffect } from 'react';
import { I } from '../icons';
import { getPreferences, updatePreferences, testTelegram } from '../api/deals';

export default function SettingsView() {
  const [scanInterval, setScanInterval] = useState(5);
  const [profitThreshold, setProfitThreshold] = useState(15);
  const [telegramTest, setTelegramTest] = useState<null | 'loading' | 'ok' | 'error'>(null);
  const [saved, setSaved] = useState(false);
  const [notifToggles, setNotifToggles] = useState({
    grailDeals: true,
    hitDeals: true,
    systemWarnings: true,
    criticalAlerts: true,
  });

  // Load preferences from API
  useEffect(() => {
    let cancelled = false;
    getPreferences().then(prefs => {
      if (cancelled) return;
      const d = prefs.data;
      if (d.scanInterval != null) setScanInterval(d.scanInterval as number);
      if (d.profitThreshold != null) setProfitThreshold(d.profitThreshold as number);
      if (d.notifToggles != null) setNotifToggles(d.notifToggles as typeof notifToggles);
    }).catch(() => {
      // defaults are fine
    });
    return () => { cancelled = true; };
  }, []);

  const doSave = async () => {
    try {
      await updatePreferences({ scanInterval, profitThreshold, notifToggles });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
  };

  const doTelegramTest = async () => {
    setTelegramTest('loading');
    try {
      await testTelegram();
      setTelegramTest('ok');
    } catch {
      setTelegramTest('error');
    }
    setTimeout(() => setTelegramTest(null), 3000);
  };

  const toggles = [
    { key: 'grailDeals' as const, label: 'GRAIL deals', desc: 'Profit >40% + high liquidity' },
    { key: 'hitDeals' as const, label: 'HIT deals', desc: 'Profit 25\u201340%' },
    { key: 'systemWarnings' as const, label: 'System warnings', desc: 'API budget, rate limits, staleness' },
    { key: 'criticalAlerts' as const, label: 'Critical alerts', desc: 'Sync failures, accuracy drops' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-obsidian">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white mb-1">Settings</h1>
            <p className="text-sm text-muted">Scanner configuration and notification preferences.</p>
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
              <p className="text-[10px] text-muted mt-1">Lower = more API calls. Adjusts automatically when budget runs low</p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-2">Minimum Profit Threshold (%)</label>
              <div className="flex items-center gap-3">
                <input type="range" min={5} max={60} step={5} value={profitThreshold} onChange={e => setProfitThreshold(+e.target.value)} className="flex-1 accent-brand h-1.5" />
                <span className="font-mono text-white text-sm w-10 text-right">{profitThreshold}%</span>
              </div>
              <p className="text-[10px] text-muted mt-1">Tightens to &ge;25% when daily budget drops below 500</p>
            </div>
          </div>
        </div>

        {/* Telegram */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1"><I.Bell s={18} c="text-brand" /><h2 className="text-sm font-bold text-white">Telegram Notifications</h2></div>
          <p className="text-[10px] text-muted mb-4">Deal alerts and system warnings via Telegram. Configure bot token and chat ID as environment variables.</p>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {toggles.map(n => (
                <div key={n.key} className="flex items-center justify-between bg-obsidian rounded-lg px-4 py-3 border border-border/50">
                  <div><span className="text-xs font-bold text-white">{n.label}</span><p className="text-[10px] text-muted">{n.desc}</p></div>
                  <div
                    onClick={() => setNotifToggles(p => ({ ...p, [n.key]: !p[n.key] }))}
                    className={`w-10 h-5 rounded-full p-0.5 cursor-pointer transition-colors ${notifToggles[n.key] ? 'bg-profit' : 'bg-border'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${notifToggles[n.key] ? 'translate-x-5' : ''}`} />
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={doTelegramTest}
              disabled={telegramTest === 'loading'}
              className="px-4 py-2 bg-surface border border-border rounded-lg text-sm text-muted hover:text-white hover:border-brand transition-all flex items-center gap-2"
            >
              {telegramTest === 'loading' ? <I.Loader s={14} c="w-3.5 h-3.5" /> : telegramTest === 'ok' ? <I.Check s={14} c="w-3.5 h-3.5 text-profit" /> : telegramTest === 'error' ? <I.AlertTriangle s={14} c="w-3.5 h-3.5 text-risk" /> : <I.Send s={14} c="w-3.5 h-3.5" />}
              {telegramTest === 'loading' ? 'Sending\u2026' : telegramTest === 'ok' ? 'Test sent \u2713' : telegramTest === 'error' ? 'Failed \u2014 check config' : 'Send Test Message'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
