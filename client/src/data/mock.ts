// ═══════════ DISPLAY CONSTANTS ═══════════

export const TIER_CFG: Record<string, { l: string; d: string }> = {
  GRAIL: { l: 'Chase-tier', d: 'Profit >40% + high liquidity' },
  HIT: { l: 'Solid hit', d: 'Profit 25\u201340%' },
  FLIP: { l: 'Quick flip', d: 'Profit 15\u201325%' },
  SLEEP: { l: 'Sleeper', d: '<15% or low liquidity' },
};

export const CONF_WEIGHTS: Record<string, number> = { name: 0.30, denominator: 0.25, number: 0.15, expansion: 0.10, variant: 0.10, normalization: 0.10 };
export const LIQ_WEIGHTS_V: Record<string, number> = { trend: 0.15, prices: 0.10, spread: 0.10, supply: 0.15, sold: 0.10, velocity: 0.40 };
export const LIQ_WEIGHTS_NV: Record<string, number> = { trend: 0.25, prices: 0.15, spread: 0.15, supply: 0.25, sold: 0.20, velocity: 0.00 };

// ═══════════ UTILITY FUNCTIONS ═══════════

export function timeAgo(d: Date | string | null): string {
  if (!d) return 'never';
  const date = typeof d === 'string' ? new Date(d) : d;
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export function fmtTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtListedTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 60) return fmtTime(date);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + fmtTime(date);
}

export function trendInfo(v: number | null): { t: string; c: string } {
  if (v == null) return { t: '\u2014', c: 'text-muted' };
  if (v > .5) return { t: '\u25b2 +' + v.toFixed(1) + '%', c: 'text-profit' };
  if (v < -.5) return { t: '\u25bc ' + v.toFixed(1) + '%', c: 'text-risk' };
  return { t: '\u2014 ' + v.toFixed(1) + '%', c: 'text-muted' };
}
