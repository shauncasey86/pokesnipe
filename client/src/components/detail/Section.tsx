import { useState, type ReactNode } from 'react';
import { I } from '../../icons';

export function Section({ id, title, defaultOpen = true, children }: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(`ps-section-${id}`);
      return v !== null ? v === '1' : defaultOpen;
    } catch { return defaultOpen; }
  });

  return (
    <div>
      <button
        onClick={() => setOpen(p => {
          try { localStorage.setItem(`ps-section-${id}`, p ? '0' : '1'); } catch {}
          return !p;
        })}
        className="flex items-center gap-2 w-full py-2 text-[10px] font-bold text-muted/60 uppercase tracking-widest hover:text-muted transition-colors"
        aria-expanded={open}
      >
        <I.ChevronDown s={12} c={'transition-transform duration-200 ' + (open ? '' : '-rotate-90')} />
        <span>{title}</span>
        <div className="flex-1 h-px bg-border/30 ml-2" />
      </button>
      <div
        className={'overflow-hidden transition-all duration-200 ' + (open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0')}
      >
        <div className="space-y-3 pb-2">{children}</div>
      </div>
    </div>
  );
}
