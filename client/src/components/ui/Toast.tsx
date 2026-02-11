import { useEffect, useState } from 'react';
import TierBadge from './TierBadge';
import type { Tier } from '../../types/deals';

interface ToastItem {
  id: string;
  tier: Tier;
  cardName: string;
  profit: string;
}

let addToastFn: ((t: ToastItem) => void) | null = null;

export function showToast(item: ToastItem) {
  addToastFn?.(item);
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    addToastFn = (t) => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id));
      }, 5000);
    };
    return () => { addToastFn = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} className="grad-border" style={{ animation: 'fadeSlide 0.3s ease' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: 'var(--bg1)', borderRadius: 9,
          }}>
            <TierBadge tier={t.tier} size="md" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tMax)' }}>{t.cardName}</div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: 'var(--greenB)' }}>{t.profit}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
