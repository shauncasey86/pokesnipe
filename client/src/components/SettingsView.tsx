import { useState, useEffect } from 'react';
import { I } from '../icons';
import { getPreferences, updatePreferences, testTelegram } from '../api/deals';

export default function SettingsView() {
  const [minProfitMargin, setMinProfitMargin] = useState(15);
  const [minConfidence, setMinConfidence] = useState(70);
  const [excludeZeroFeedback, setExcludeZeroFeedback] = useState(true);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [telegramStatus, setTelegramStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [saved, setSaved] = useState(false);

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
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const doSave = async () => {
    try {
      await updatePreferences({ minProfitMargin, minConfidence, excludeZeroFeedback });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
  };

  const handleTestMessage = async () => {
    setTelegramStatus('sending');
    try {
      await testTelegram();
      setTelegramStatus('success');
    } catch {
      setTelegramStatus('error');
    }
    setTimeout(() => setTelegramStatus('idle'), 4000);
  };

  return (
    <div className="p-8 h-full overflow-y-auto animate-in">
      <h2 className="text-2xl font-bold text-white mb-6 font-sans">Configuration</h2>
      <div className="grid grid-cols-2 gap-8 max-w-4xl">

        {/* Scanner Config */}
        <div className="bg-panel border border-border p-6 rounded-xl h-fit">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider border-b border-border/50 pb-2 flex items-center gap-2">
            <I.Sliders s={14} /> Scanner Logic
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400 font-mono text-sm">Min Profit Margin</span>
                <span className="text-dexGreen font-bold font-mono">{minProfitMargin}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={60}
                step={5}
                value={minProfitMargin}
                onChange={e => setMinProfitMargin(+e.target.value)}
                className="w-full accent-dexGreen h-1.5 bg-charcoal rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400 font-mono text-sm">Min Confidence Score</span>
                <span className="text-dexBlue font-bold font-mono">{minConfidence}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minConfidence}
                onChange={e => setMinConfidence(+e.target.value)}
                className="w-full accent-dexBlue h-1.5 bg-charcoal rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div className="pt-2 border-t border-border/30">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm text-gray-300 group-hover:text-white transition-colors">Exclude Zero-Feedback Sellers</span>
                <div
                  onClick={() => setExcludeZeroFeedback(p => !p)}
                  className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${excludeZeroFeedback ? 'bg-dexGreen' : 'bg-border'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${excludeZeroFeedback ? 'right-0.5' : 'left-0.5'}`} />
                </div>
              </label>
            </div>
            <div className="pt-2">
              <button
                onClick={doSave}
                className={`w-full py-2 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  saved ? 'bg-dexGreen text-black' : 'bg-charcoal border border-border text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                {saved ? <><I.Check s={14} /> Saved</> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Telegram Config */}
        <div className="bg-panel border border-border p-6 rounded-xl h-fit">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider border-b border-border/50 pb-2 flex items-center gap-2">
            <I.Send s={14} /> Telegram Integration
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bot Token</label>
              <input
                type="password"
                readOnly
                value={botToken}
                placeholder="Configured via environment variable"
                className="w-full bg-charcoal border border-border rounded p-2 text-xs font-mono text-gray-300 focus:border-dexBlue outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Chat ID</label>
              <input
                type="text"
                readOnly
                value={chatId}
                placeholder="Configured via environment variable"
                className="w-full bg-charcoal border border-border rounded p-2 text-xs font-mono text-gray-300 focus:border-dexBlue outline-none"
              />
            </div>
            <div className="pt-2">
              <button
                onClick={handleTestMessage}
                disabled={telegramStatus === 'sending'}
                className={`w-full py-2 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  telegramStatus === 'success'
                    ? 'bg-dexGreen text-black'
                    : telegramStatus === 'error'
                    ? 'bg-dexRed text-white'
                    : 'bg-dexBlue text-white hover:bg-blue-600'
                }`}
              >
                {telegramStatus === 'idle' && <>Send Test Message <I.Send s={12} /></>}
                {telegramStatus === 'sending' && <span className="animate-pulse">Sending...</span>}
                {telegramStatus === 'success' && <>Message Sent <I.Check s={14} /></>}
                {telegramStatus === 'error' && <>Failed &mdash; Check Config</>}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
