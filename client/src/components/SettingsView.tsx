import { useState, useEffect } from 'react';
import { I } from '../icons';
import { getPreferences, updatePreferences, testTelegram } from '../api/deals';

export default function SettingsView() {
  const [minProfitMargin, setMinProfitMargin] = useState(15);
  const [minConfidence, setMinConfidence] = useState(70);
  const [excludeZeroFeedback, setExcludeZeroFeedback] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [telegramTest, setTelegramTest] = useState<null | 'loading' | 'ok' | 'error'>(null);
  const [saved, setSaved] = useState(false);

  // Load preferences from API
  useEffect(() => {
    let cancelled = false;
    getPreferences().then(prefs => {
      if (cancelled) return;
      const d = prefs.data;
      if (d.minProfitMargin != null) setMinProfitMargin(d.minProfitMargin as number);
      if (d.minConfidence != null) setMinConfidence(d.minConfidence as number);
      if (d.excludeZeroFeedback != null) setExcludeZeroFeedback(d.excludeZeroFeedback as boolean);
      if (d.botToken != null) setBotToken(d.botToken as string);
      if (d.chatId != null) setChatId(d.chatId as string);
    }).catch(() => {
      // defaults are fine
    });
    return () => { cancelled = true; };
  }, []);

  const doSave = async () => {
    try {
      await updatePreferences({ minProfitMargin, minConfidence, excludeZeroFeedback });
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

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-obsidian">
      <div className="max-w-4xl mx-auto">
        {/* Page Title */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Configuration</h1>
          <button
            onClick={doSave}
            className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${
              saved
                ? 'bg-dexGreen text-white'
                : 'bg-dexRed hover:bg-dexRed/90 text-white'
            }`}
          >
            {saved ? (
              <span className="flex items-center gap-1.5"><I.Check s={16} />Saved</span>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-2 gap-8">

          {/* Left Column: Scanner Logic */}
          <div className="bg-panel border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <I.Sliders s={16} c="text-dexGreen" />
              <h2 className="text-[11px] font-bold text-muted uppercase tracking-wider">Scanner Logic</h2>
            </div>

            <div className="space-y-6">
              {/* Min Profit Margin */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-white">Min Profit Margin</label>
                  <span className="font-mono text-sm font-bold text-dexGreen">{minProfitMargin}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={5}
                  value={minProfitMargin}
                  onChange={e => setMinProfitMargin(+e.target.value)}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-dexGreen bg-charcoal"
                />
                <div className="flex justify-between text-[10px] text-muted mt-1">
                  <span>5%</span>
                  <span>60%</span>
                </div>
              </div>

              {/* Min Confidence Score */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-white">Min Confidence Score</label>
                  <span className="font-mono text-sm font-bold text-dexBlue">{minConfidence}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={minConfidence}
                  onChange={e => setMinConfidence(+e.target.value)}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-dexBlue bg-charcoal"
                />
                <div className="flex justify-between text-[10px] text-muted mt-1">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Exclude Zero-Feedback Toggle */}
              <div className="flex items-center justify-between bg-charcoal rounded-lg px-4 py-3 border border-border/50">
                <div>
                  <span className="text-sm font-medium text-white">Exclude Zero-Feedback Sellers</span>
                  <p className="text-[10px] text-muted mt-0.5">Skip listings from sellers with no feedback history</p>
                </div>
                <div
                  onClick={() => setExcludeZeroFeedback(p => !p)}
                  className={`w-10 h-5 rounded-full p-0.5 cursor-pointer transition-colors shrink-0 ml-4 ${
                    excludeZeroFeedback ? 'bg-dexGreen' : 'bg-border'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    excludeZeroFeedback ? 'translate-x-5' : ''
                  }`} />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Telegram Integration */}
          <div className="bg-panel border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <I.Send s={16} c="text-dexBlue" />
              <h2 className="text-[11px] font-bold text-muted uppercase tracking-wider">Telegram Integration</h2>
            </div>

            <div className="space-y-6">
              {/* Bot Token */}
              <div>
                <label className="text-sm font-medium text-white block mb-2">Bot Token</label>
                <input
                  type="password"
                  readOnly
                  value={botToken}
                  placeholder="Configured via environment variable"
                  className="w-full bg-charcoal border border-border rounded-lg px-3 py-2.5 text-sm text-muted font-mono placeholder:text-muted/50 focus:outline-none focus:border-dexBlue/50"
                />
                <p className="text-[10px] text-muted mt-1">Set via TELEGRAM_BOT_TOKEN env var</p>
              </div>

              {/* Chat ID */}
              <div>
                <label className="text-sm font-medium text-white block mb-2">Chat ID</label>
                <input
                  type="text"
                  readOnly
                  value={chatId}
                  placeholder="Configured via environment variable"
                  className="w-full bg-charcoal border border-border rounded-lg px-3 py-2.5 text-sm text-muted font-mono placeholder:text-muted/50 focus:outline-none focus:border-dexBlue/50"
                />
                <p className="text-[10px] text-muted mt-1">Set via TELEGRAM_CHAT_ID env var</p>
              </div>

              {/* Send Test Message */}
              <button
                onClick={doTelegramTest}
                disabled={telegramTest === 'loading'}
                className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  telegramTest === 'ok'
                    ? 'bg-dexGreen/10 border border-dexGreen/30 text-dexGreen'
                    : telegramTest === 'error'
                    ? 'bg-dexRed/10 border border-dexRed/30 text-dexRed'
                    : 'bg-charcoal border border-border text-muted hover:text-white hover:border-dexBlue/50'
                }`}
              >
                {telegramTest === 'loading' ? (
                  <I.Loader s={14} c="w-3.5 h-3.5" />
                ) : telegramTest === 'ok' ? (
                  <I.Check s={14} c="w-3.5 h-3.5" />
                ) : telegramTest === 'error' ? (
                  <I.AlertTriangle s={14} c="w-3.5 h-3.5" />
                ) : (
                  <I.Send s={14} c="w-3.5 h-3.5" />
                )}
                {telegramTest === 'loading'
                  ? 'Sending\u2026'
                  : telegramTest === 'ok'
                  ? 'Test Sent Successfully'
                  : telegramTest === 'error'
                  ? 'Failed \u2014 Check Config'
                  : 'Send Test Message'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
