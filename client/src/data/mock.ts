// ═══════════ MOCK DATA ═══════════

export interface Expansion {
  name: string;
  code: string;
  series: string;
  printedTotal: number;
  total: number;
  releaseDate: string;
  logo: string;
  symbol: string;
}

export interface DealData {
  id: string;
  ebayItemId: string;
  name: string;
  set: { name: string; code: string };
  num: string;
  variant: string;
  cond: string;
  condSrc: string;
  isGr: boolean;
  grader: string | null;
  grade: string | null;
  scrImg: string;
  ebImg: string;
  rarity: string;
  eP: number;
  ship: number;
  bp: number;
  tCost: number;
  mGBP: number;
  fx: number;
  pGBP: number;
  pPct: number;
  tier: 'GRAIL' | 'HIT' | 'FLIP' | 'SLEEP';
  conf: number;
  confT: 'high' | 'medium' | 'low';
  liq: number;
  liqG: 'high' | 'medium' | 'low';
  trends: Record<string, number>;
  seller: string;
  fb: number;
  comps: Record<string, { lo: number; mk: number } | null>;
  url: string;
  at: Date;
  status: string;
  reviewedAs: string | null;
  confSignals: Record<string, number>;
  liqSignals: Record<string, number>;
  hasVelocity: boolean;
}

export interface AuditEntry {
  id: number;
  ts: Date;
  level: 'info' | 'warn' | 'error';
  service: string;
  msg: string;
  ctx: Record<string, string | number>;
}

export interface SyncEntry {
  id: number;
  type: string;
  startedAt: Date;
  completedAt: Date;
  status: string;
  expansions: number;
  cards: number;
  variants: number;
  credits: number;
}

export const EXPANSIONS: Record<string, Expansion> = {
  EVS: { name: 'Evolving Skies', code: 'EVS', series: 'Sword & Shield', printedTotal: 203, total: 237, releaseDate: '2021-08-27', logo: 'https://images.pokemontcg.io/swsh7/logo.png', symbol: 'https://images.pokemontcg.io/swsh7/symbol.png' },
  CPA: { name: "Champion's Path", code: 'CPA', series: 'Sword & Shield', printedTotal: 73, total: 80, releaseDate: '2020-09-25', logo: 'https://images.pokemontcg.io/swsh35/logo.png', symbol: 'https://images.pokemontcg.io/swsh35/symbol.png' },
  SIT: { name: 'Silver Tempest', code: 'SIT', series: 'Sword & Shield', printedTotal: 195, total: 215, releaseDate: '2022-11-11', logo: 'https://images.pokemontcg.io/swsh12/logo.png', symbol: 'https://images.pokemontcg.io/swsh12/symbol.png' },
  LOR: { name: 'Lost Origin', code: 'LOR', series: 'Sword & Shield', printedTotal: 196, total: 217, releaseDate: '2022-09-09', logo: 'https://images.pokemontcg.io/swsh11/logo.png', symbol: 'https://images.pokemontcg.io/swsh11/symbol.png' },
};

export const DEALS: DealData[] = [
  { id: 'd1', ebayItemId: '384729105', name: 'Umbreon VMAX (Alternate Art)', set: { name: 'Evolving Skies', code: 'EVS' }, num: '215/203', variant: 'holofoil', cond: 'NM', condSrc: 'conditionDescriptors', isGr: true, grader: 'PSA', grade: '10', scrImg: 'https://images.pokemontcg.io/swsh7/215_hires.png', ebImg: 'https://i.ebayimg.com/images/g/U~4AAOSwVENm2Xqx/s-l1600.jpg', rarity: 'Secret Rare', eP: 142.00, ship: 4.99, bp: 6.34, tCost: 153.33, mGBP: 209.09, fx: 0.789, pGBP: 55.76, pPct: 36.4, tier: 'HIT', conf: 0.92, confT: 'high', liq: 0.81, liqG: 'high', trends: { '1d': 0.8, '7d': 2.4, '30d': 5.1, '90d': 12.3 }, seller: 'poke_vault_99', fb: 12847, comps: { NM: { lo: 189, mk: 209 }, LP: { lo: 142, mk: 166 }, MP: { lo: 95, mk: 122 }, HP: null }, url: 'https://www.ebay.co.uk/itm/384729105', at: new Date(Date.now() - 2 * 60000), status: 'active', reviewedAs: null, confSignals: { name: 0.95, denominator: 0.92, number: 1.0, expansion: 0.88, variant: 0.85, normalization: 0.90 }, liqSignals: { trend: 0.75, prices: 1.0, spread: 0.88, supply: 0.80, sold: 0.67, velocity: 0.85 }, hasVelocity: true },
  { id: 'd2', ebayItemId: '293847165', name: 'Charizard V', set: { name: "Champion's Path", code: 'CPA' }, num: '079/073', variant: 'normal', cond: 'NM', condSrc: 'title', isGr: false, grader: null, grade: null, scrImg: 'https://images.pokemontcg.io/swsh35/79_hires.png', ebImg: 'https://i.ebayimg.com/images/g/iMQAAOSwITdm4Rfk/s-l1600.jpg', rarity: 'Ultra Rare', eP: 18.50, ship: 2.99, bp: 1.50, tCost: 22.99, mGBP: 33.14, fx: 0.789, pGBP: 10.15, pPct: 44.1, tier: 'GRAIL', conf: 0.88, confT: 'high', liq: 0.83, liqG: 'high', trends: { '1d': -0.3, '7d': 1.2, '30d': 3.8, '90d': 8.7 }, seller: 'tcg_king_uk', fb: 3421, comps: { NM: { lo: 30, mk: 33 }, LP: { lo: 22, mk: 27 }, MP: { lo: 14, mk: 19 }, HP: { lo: 8, mk: 11 } }, url: 'https://www.ebay.co.uk/itm/293847165', at: new Date(Date.now() - 5 * 60000), status: 'active', reviewedAs: null, confSignals: { name: 0.88, denominator: 1.0, number: 1.0, expansion: 0.92, variant: 0.78, normalization: 0.82 }, liqSignals: { trend: 0.50, prices: 1.0, spread: 0.91, supply: 1.0, sold: 1.0, velocity: 0.70 }, hasVelocity: true },
  { id: 'd3', ebayItemId: '401928374', name: 'Lugia V (Alternate Art)', set: { name: 'Silver Tempest', code: 'SIT' }, num: '186/195', variant: 'holofoil', cond: 'LP', condSrc: 'conditionDescriptors', isGr: false, grader: null, grade: null, scrImg: 'https://images.pokemontcg.io/swsh12/186_hires.png', ebImg: 'https://i.ebayimg.com/images/g/mSIAAOSwA~Fm5Yrd/s-l1600.jpg', rarity: 'Ultra Rare', eP: 22.00, ship: 3.50, bp: 1.58, tCost: 27.08, mGBP: 35.11, fx: 0.789, pGBP: 8.03, pPct: 29.7, tier: 'HIT', conf: 0.78, confT: 'medium', liq: 0.62, liqG: 'medium', trends: { '1d': 0.0, '7d': 1.5, '30d': 4.2, '90d': 9.1 }, seller: 'card_baron_uk', fb: 856, comps: { NM: { lo: 32, mk: 38 }, LP: { lo: 25, mk: 35 }, MP: { lo: 17, mk: 24 }, HP: null }, url: 'https://www.ebay.co.uk/itm/401928374', at: new Date(Date.now() - 12 * 60000), status: 'active', reviewedAs: 'correct', confSignals: { name: 0.75, denominator: 0.82, number: 1.0, expansion: 0.78, variant: 0.68, normalization: 0.72 }, liqSignals: { trend: 0.50, prices: 0.75, spread: 0.72, supply: 0.40, sold: 0.33, velocity: 0.50 }, hasVelocity: false },
  { id: 'd4', ebayItemId: '510293847', name: 'Giratina V (Alternate Art)', set: { name: 'Lost Origin', code: 'LOR' }, num: '186/196', variant: 'holofoil', cond: 'NM', condSrc: 'conditionDescriptors', isGr: true, grader: 'CGC', grade: '9.5', scrImg: 'https://images.pokemontcg.io/swsh11/186_hires.png', ebImg: 'https://i.ebayimg.com/images/g/fakAAOSwxxxxfake1/s-l1600.jpg', rarity: 'Ultra Rare', eP: 68.00, ship: 0, bp: 3.32, tCost: 71.32, mGBP: 90.74, fx: 0.789, pGBP: 19.42, pPct: 27.2, tier: 'HIT', conf: 0.91, confT: 'high', liq: 0.74, liqG: 'medium', trends: { '1d': 0.5, '7d': 2.1, '30d': 6.8, '90d': 15.2 }, seller: 'japan_imports_uk', fb: 5612, comps: { NM: { lo: 83, mk: 91 }, LP: { lo: 63, mk: 75 }, MP: { lo: 43, mk: 55 }, HP: null }, url: 'https://www.ebay.co.uk/itm/510293847', at: new Date(Date.now() - 18 * 60000), status: 'expired', reviewedAs: null, confSignals: { name: 0.93, denominator: 0.90, number: 1.0, expansion: 0.90, variant: 0.82, normalization: 0.88 }, liqSignals: { trend: 0.75, prices: 0.75, spread: 0.78, supply: 0.60, sold: 0.67, velocity: 0.85 }, hasVelocity: true },
  { id: 'd5', ebayItemId: '620384756', name: 'Rayquaza VMAX (Alt Art)', set: { name: 'Evolving Skies', code: 'EVS' }, num: '218/203', variant: 'holofoil', cond: 'MP', condSrc: 'title', isGr: false, grader: null, grade: null, scrImg: 'https://images.pokemontcg.io/swsh7/218_hires.png', ebImg: 'https://i.ebayimg.com/images/g/fakAAOSwxxxxfake2/s-l1600.jpg', rarity: 'Secret Rare', eP: 45.00, ship: 5.99, bp: 2.48, tCost: 53.47, mGBP: 64.70, fx: 0.789, pGBP: 11.23, pPct: 21.0, tier: 'FLIP', conf: 0.71, confT: 'medium', liq: 0.55, liqG: 'medium', trends: { '1d': -1.2, '7d': -0.8, '30d': 3.4, '90d': 11.0 }, seller: 'elite_collectors_gb', fb: 421, comps: { NM: { lo: 87, mk: 103 }, LP: { lo: 67, mk: 83 }, MP: { lo: 49, mk: 65 }, HP: { lo: 32, mk: 43 } }, url: 'https://www.ebay.co.uk/itm/620384756', at: new Date(Date.now() - 65 * 60000), status: 'sold', reviewedAs: 'incorrect', confSignals: { name: 0.68, denominator: 0.75, number: 1.0, expansion: 0.72, variant: 0.55, normalization: 0.62 }, liqSignals: { trend: 0.25, prices: 1.0, spread: 0.65, supply: 0.40, sold: 0.33, velocity: 0.50 }, hasVelocity: false },
];

export const AUDIT_LOG: AuditEntry[] = [
  { id: 1, ts: new Date(Date.now() - 1 * 60000), level: 'info', service: 'scanner', msg: 'Deal created', ctx: { dealId: 'd1', card: 'Umbreon VMAX', tier: 'HIT', profit: '\u00a355.76', conf: '92%' } },
  { id: 2, ts: new Date(Date.now() - 1.5 * 60000), level: 'info', service: 'matcher', msg: 'Card matched \u2014 number_first', ctx: { ebayTitle: 'PSA 10 Umbreon VMAX 215/203 Alt Art', candidate: 'Umbreon VMAX (Alternate Art)', conf: 0.92 } },
  { id: 3, ts: new Date(Date.now() - 2 * 60000), level: 'info', service: 'scanner', msg: 'Listing enriched via getItem', ctx: { ebayItemId: '384729105', seller: 'poke_vault_99', condition: 'NM' } },
  { id: 4, ts: new Date(Date.now() - 3 * 60000), level: 'warn', service: 'scanner', msg: 'Low confidence \u2014 logged for training only', ctx: { ebayTitle: 'Pokemon card bundle lot 50x', conf: 0.31, reason: 'Below 0.45 threshold' } },
  { id: 5, ts: new Date(Date.now() - 4 * 60000), level: 'info', service: 'scanner', msg: 'Deal created', ctx: { dealId: 'd2', card: 'Charizard V', tier: 'GRAIL', profit: '\u00a310.15', conf: '88%' } },
  { id: 6, ts: new Date(Date.now() - 5 * 60000), level: 'info', service: 'pricing', msg: 'Buyer protection fee calculated', ctx: { subtotal: '\u00a321.49', fee: '\u00a31.50', formula: '\u00a30.10 + 7%\u00d720 + 4%\u00d7\u00a31.49' } },
  { id: 7, ts: new Date(Date.now() - 8 * 60000), level: 'warn', service: 'ebay', msg: 'Rate limit approaching \u2014 429 count: 2', ctx: { callsRemain: 312, dailyBudget: 5000 } },
  { id: 8, ts: new Date(Date.now() - 10 * 60000), level: 'info', service: 'sync', msg: 'Delta sync completed', ctx: { expansions: 3, cardsUpserted: 847, variantsUpserted: 2104, credits: 420 } },
  { id: 9, ts: new Date(Date.now() - 15 * 60000), level: 'error', service: 'exchange', msg: 'Exchange rate fetch failed \u2014 using cached', ctx: { lastFetch: '47m ago', cachedRate: 0.789, error: 'ETIMEDOUT' } },
  { id: 10, ts: new Date(Date.now() - 20 * 60000), level: 'info', service: 'scanner', msg: 'Scan cycle completed', ctx: { searched: 48, processed: 12, matched: 5, rejected: 7, deals: 2, elapsed: '14.2s' } },
  { id: 11, ts: new Date(Date.now() - 30 * 60000), level: 'info', service: 'matcher', msg: 'Card matched \u2014 number_first', ctx: { ebayTitle: 'Lugia V Alt Art 186/195 Silver Tempest', candidate: 'Lugia V (Alternate Art)', conf: 0.78 } },
  { id: 12, ts: new Date(Date.now() - 45 * 60000), level: 'info', service: 'cleanup', msg: 'Deal expired', ctx: { dealId: 'd4', reason: '72h TTL exceeded', originalTier: 'HIT' } },
  { id: 13, ts: new Date(Date.now() - 50 * 60000), level: 'warn', service: 'scanner', msg: 'eBay listing ended \u2014 marking deal as sold', ctx: { dealId: 'd5', ebayItemId: '620384756', ebayStatus: 'EndedWithSales' } },
  { id: 14, ts: new Date(Date.now() - 90 * 60000), level: 'info', service: 'review', msg: 'Match marked incorrect by user', ctx: { dealId: 'd5', card: 'Rayquaza VMAX', reason: 'Wrong variant' } },
  { id: 15, ts: new Date(Date.now() - 120 * 60000), level: 'info', service: 'sync', msg: 'Full sync started', ctx: { type: 'weekly', trigger: 'cron' } },
];

export const SYNC_LOG: SyncEntry[] = [
  { id: 1, type: 'delta', startedAt: new Date(Date.now() - 10 * 60000), completedAt: new Date(Date.now() - 9.5 * 60000), status: 'completed', expansions: 3, cards: 847, variants: 2104, credits: 420 },
  { id: 2, type: 'delta', startedAt: new Date(Date.now() - 130 * 60000), completedAt: new Date(Date.now() - 129 * 60000), status: 'completed', expansions: 2, cards: 312, variants: 801, credits: 180 },
  { id: 3, type: 'full', startedAt: new Date(Date.now() - 48 * 3600000), completedAt: new Date(Date.now() - 47.2 * 3600000), status: 'completed', expansions: 347, cards: 18420, variants: 52800, credits: 14200 },
];

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

export function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtListedTime(d: Date): string {
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 60) return fmtTime(d);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + fmtTime(d);
}

export function trendInfo(v: number): { t: string; c: string } {
  if (v > .5) return { t: '\u25b2 +' + v.toFixed(1) + '%', c: 'text-profit' };
  if (v < -.5) return { t: '\u25bc ' + v.toFixed(1) + '%', c: 'text-risk' };
  return { t: '\u2014 ' + v.toFixed(1) + '%', c: 'text-muted' };
}

export function bestImg(d: DealData, wantScr: boolean): string {
  if (wantScr) return d.scrImg;
  return d.ebImg.includes('fake') ? d.scrImg : d.ebImg;
}

export function hasEbImg(d: DealData): boolean {
  return !d.ebImg.includes('fake');
}
