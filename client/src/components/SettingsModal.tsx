import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getPreferences, updatePreferences } from '../api/deals';

async function testTelegram(): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/notifications/telegram/test', { method: 'POST' });
  return res.json();
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth();
  const [tab, setTab] = useState<'general' | 'notifications'>('general');
  const [prefs, setPrefs] = useState<Record<string, unknown>>({});
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    getPreferences().then(p => {
      setPrefs(p.data || {});
      setTelegramToken((p.data?.telegramToken as string) || '');
      setTelegramChatId((p.data?.telegramChatId as string) || '');
    });
  }, []);

  const savePrefs = (update: Record<string, unknown>) => {
    const merged = { ...prefs, ...update };
    setPrefs(merged);
    setSaved(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await updatePreferences(update);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 500);
  };

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const handleTestTelegram = async () => {
    setTestResult('sending');
    try {
      const result = await testTelegram();
      setTestResult(result.success ? 'success' : 'error');
    } catch {
      setTestResult('error');
    }
    setTimeout(() => setTestResult('idle'), 3000);
  };

  const inputStyle = {
    height: 38, background: 'var(--glass)', border: '1px solid var(--brd)',
    borderRadius: 6, padding: '0 12px', color: 'var(--tMax)',
    fontSize: 12, outline: 'none', width: '100%',
  } as const;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-static"
        style={{
          width: 520, maxHeight: '80vh', overflowY: 'auto',
          padding: '24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span className="section-header">SETTINGS</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saved && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--green)' }}>Saved</span>}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tMut)', fontSize: 18 }}>×</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {(['general', 'notifications'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 14px', borderRadius: 6,
                background: tab === t ? 'var(--glass2)' : 'transparent',
                border: tab === t ? '1px solid var(--brd)' : '1px solid transparent',
                color: tab === t ? 'var(--tMax)' : 'var(--tSec)',
                fontWeight: 500, fontSize: 13, textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Tier thresholds (read-only reference) */}
            <div>
              <span className="section-header">TIER THRESHOLDS</span>
              <div style={{ marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--tSec)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>GRAIL — &gt;40% profit</span>
                <span>HIT — 25-40% profit</span>
                <span>FLIP — 15-25% profit</span>
                <span>SLEEP — 10-15% profit</span>
              </div>
            </div>

            {/* Display settings */}
            <div>
              <span className="section-header">DISPLAY</span>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--tPri)' }}>Currency</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--tSec)' }}>GBP (£)</span>
                </div>
              </div>
            </div>

            {/* Sound settings */}
            <div>
              <span className="section-header">SOUND</span>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ToggleRow
                  label="Deal alerts"
                  checked={prefs.soundEnabled as boolean ?? false}
                  onChange={v => savePrefs({ soundEnabled: v })}
                />
                <ToggleRow
                  label="GRAIL only"
                  checked={prefs.soundGrailOnly as boolean ?? true}
                  onChange={v => savePrefs({ soundGrailOnly: v })}
                />
              </div>
            </div>

            {/* Default filter settings */}
            <div>
              <span className="section-header">DEFAULT FILTERS</span>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--tPri)' }}>Min profit %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={prefs.defaultMinProfit as number ?? 10}
                    onChange={e => {
                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      savePrefs({ defaultMinProfit: val });
                    }}
                    style={{
                      width: 56, height: 28, textAlign: 'right',
                      background: 'var(--glass)', border: '1px solid var(--brd)',
                      borderRadius: 4, padding: '0 6px', color: 'var(--tMax)',
                      fontFamily: "'DM Mono', monospace", fontSize: 12, outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--tPri)' }}>Min confidence %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round((prefs.defaultMinConfidence as number ?? 0.65) * 100)}
                    onChange={e => {
                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      savePrefs({ defaultMinConfidence: val / 100 });
                    }}
                    style={{
                      width: 56, height: 28, textAlign: 'right',
                      background: 'var(--glass)', border: '1px solid var(--brd)',
                      borderRadius: 4, padding: '0 6px', color: 'var(--tMax)',
                      fontFamily: "'DM Mono', monospace", fontSize: 12, outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Sign out */}
            <button
              onClick={handleLogout}
              style={{
                marginTop: 8, padding: '10px 0', borderRadius: 6,
                background: 'transparent', border: '1px solid rgba(248,113,113,0.3)',
                color: 'var(--red)', fontWeight: 600, fontSize: 13,
              }}
            >
              Sign Out
            </button>
          </div>
        )}

        {tab === 'notifications' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Telegram */}
            <div>
              <span className="section-header">TELEGRAM</span>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="password"
                  placeholder="Bot Token"
                  value={telegramToken}
                  onChange={e => { setTelegramToken(e.target.value); savePrefs({ telegramToken: e.target.value }); }}
                  style={inputStyle}
                />
                <input
                  type="password"
                  placeholder="Chat ID"
                  value={telegramChatId}
                  onChange={e => { setTelegramChatId(e.target.value); savePrefs({ telegramChatId: e.target.value }); }}
                  style={inputStyle}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={handleTestTelegram}
                    disabled={testResult === 'sending' || !telegramToken || !telegramChatId}
                    style={{
                      padding: '8px 16px', borderRadius: 6,
                      background: 'var(--glass)', border: '1px solid var(--brd)',
                      color: !telegramToken || !telegramChatId ? 'var(--tMut)' : 'var(--tSec)',
                      fontWeight: 500, fontSize: 12,
                      opacity: testResult === 'sending' ? 0.6 : 1,
                      cursor: !telegramToken || !telegramChatId ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {testResult === 'sending' ? 'Sending...' : 'Test Message'}
                  </button>
                  {testResult === 'success' && (
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--green)' }}>Sent</span>
                  )}
                  {testResult === 'error' && (
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--red)' }}>Failed</span>
                  )}
                </div>
                {!telegramToken && !telegramChatId && (
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--tMut)' }}>
                    Configure bot token and chat ID to enable Telegram alerts
                  </span>
                )}
              </div>
            </div>

            {/* Alert rules */}
            <div>
              <span className="section-header">ALERT RULES</span>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ToggleRow
                  label="GRAIL alerts"
                  checked={prefs.alertGrail as boolean ?? true}
                  onChange={v => savePrefs({ alertGrail: v })}
                />
                <ToggleRow
                  label="HIT alerts"
                  checked={prefs.alertHit as boolean ?? false}
                  onChange={v => savePrefs({ alertHit: v })}
                />
                <ToggleRow
                  label="FLIP alerts"
                  checked={prefs.alertFlip as boolean ?? false}
                  onChange={v => savePrefs({ alertFlip: v })}
                />
              </div>
            </div>

            {/* Notification thresholds */}
            <div>
              <span className="section-header">NOTIFICATION THRESHOLDS</span>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--tPri)' }}>Min profit %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={prefs.minNotifyProfit as number ?? 20}
                    onChange={e => {
                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      savePrefs({ minNotifyProfit: val });
                    }}
                    style={{
                      width: 56, height: 28, textAlign: 'right',
                      background: 'var(--glass)', border: '1px solid var(--brd)',
                      borderRadius: 4, padding: '0 6px', color: 'var(--tMax)',
                      fontFamily: "'DM Mono', monospace", fontSize: 12, outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--tPri)' }}>Min confidence %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Math.round((prefs.minNotifyConfidence as number ?? 0.7) * 100)}
                    onChange={e => {
                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      savePrefs({ minNotifyConfidence: val / 100 });
                    }}
                    style={{
                      width: 56, height: 28, textAlign: 'right',
                      background: 'var(--glass)', border: '1px solid var(--brd)',
                      borderRadius: 4, padding: '0 6px', color: 'var(--tMax)',
                      fontFamily: "'DM Mono', monospace", fontSize: 12, outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 13, color: 'var(--tPri)' }}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: checked ? 'var(--green)' : 'var(--glass)',
          border: `1px solid ${checked ? 'var(--green)' : 'var(--brd)'}`,
          position: 'relative', transition: 'all 0.2s',
          padding: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 2,
          left: checked ? 18 : 2,
          width: 14, height: 14, borderRadius: 14,
          background: checked ? '#fff' : 'var(--tMut)',
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  );
}
