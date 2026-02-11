import { useState, useEffect, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════
   POKESNIPE v3 — Hero triage + full card intel
   
   The hero area handles the instant decision (snag/skip).
   Below the actions, a tabbed intel panel gives you the deep
   data: Overview (pricing + match), Comps (market position),
   Trends (price history + expansion).
   
   Layout: [Rail 56px] [Hero + Intel center] [Queue 340px]
   Fonts: Instrument Sans + JetBrains Mono
   ══════════════════════════════════════════════════════════════ */

const DEALS = [
  {
    id: 1, name: "Magikarp & Wailord-GX", set: "Team Up", number: "#161", emoji: "🌊",
    buyPrice: 260.70, sellPrice: 737.96, shipping: 3.42, fees: 11.13,
    tier: "HIT", condition: "NM", match: 96, ago: "4h",
    matchBreakdown: { name: 88, number: 100, denom: 0, expan: 75, variant: 95, extract: 0 },
    comps: {
      byCondition: [
        { grade: "DM", price: 460.23, low: 420.00, market: 460.23, spread: 184.98 },
        { grade: "MP", price: 567.83, low: 683.85, market: 567.83, spread: 292.58 },
        { grade: "LP", price: 816.36, low: 700.00, market: 816.36, spread: 541.11 },
        { grade: "NM", price: 1007.59, low: 845.99, market: 1007.59, spread: 732.34 },
      ],
      liquidity: { score: 59, level: "MED", metrics: { trend: 0, prices: 0, spread: 0, supply: 20, sold: 0, velocity: 100 } }
    },
    trends: {
      periods: [
        { label: "1d", change: 0.00, pct: 0.0 },
        { label: "7d", change: 0.00, pct: 0.0 },
        { label: "30d", change: 7.41, pct: 1.0 },
        { label: "90d", change: 119.54, pct: 19.3 },
      ],
      sparkline: [380, 385, 390, 400, 420, 450, 480, 520, 560, 600, 650, 700, 737],
      expansion: { name: "Team Up", year: 2019, era: "Modern", cardsInSet: 181, symbol: "🤝", color: "#60a5fa", color2: "#818cf8", setNum: "SM9" }
    }
  },
  {
    id: 2, name: "Zekrom", set: "Black & White", number: "#114", emoji: "⚡",
    buyPrice: 15.88, sellPrice: 112.93, shipping: 8.50, fees: 2.10,
    tier: "HIT", condition: "NM", match: 93, ago: "35m",
    matchBreakdown: { name: 88, number: 100, denom: 0, expan: 75, variant: 95, extract: 0 },
    comps: {
      byCondition: [
        { grade: "DM", price: 45.20, low: 32.00, market: 45.20, spread: 22.15 },
        { grade: "MP", price: 62.80, low: 48.50, market: 62.80, spread: 38.30 },
        { grade: "LP", price: 85.40, low: 60.00, market: 85.40, spread: 55.90 },
        { grade: "NM", price: 112.93, low: 88.00, market: 112.93, spread: 82.45 },
      ],
      liquidity: { score: 72, level: "HIGH", metrics: { trend: 40, prices: 60, spread: 30, supply: 50, sold: 80, velocity: 85 } }
    },
    trends: {
      periods: [
        { label: "1d", change: 2.30, pct: 2.1 },
        { label: "7d", change: 8.50, pct: 8.1 },
        { label: "30d", change: 15.20, pct: 15.6 },
        { label: "90d", change: 42.80, pct: 61.0 },
      ],
      sparkline: [70, 72, 68, 75, 78, 82, 88, 92, 95, 100, 105, 110, 113],
      expansion: { name: "Black & White", year: 2011, era: "Classic", cardsInSet: 115, symbol: "⚫", color: "#a1a1aa", color2: "#27272a", setNum: "BW1" }
    }
  },
  {
    id: 3, name: "M Charizard-EX", set: "Flashfire", number: "#107", emoji: "🔥",
    buyPrice: 52.58, sellPrice: 132.25, shipping: 16.26, fees: 2.80,
    tier: "HIT", condition: "LP", match: 87, ago: "15h",
    matchBreakdown: { name: 80, number: 100, denom: 0, expan: 50, variant: 95, extract: 0 },
    comps: {
      byCondition: [
        { grade: "DM", price: 58.40, low: 42.00, market: 58.40, spread: 18.50 },
        { grade: "MP", price: 84.60, low: 62.00, market: 84.60, spread: 42.70 },
        { grade: "LP", price: 132.25, low: 95.00, market: 132.25, spread: 88.35 },
        { grade: "NM", price: 195.80, low: 148.00, market: 195.80, spread: 145.90 },
      ],
      liquidity: { score: 81, level: "HIGH", metrics: { trend: 70, prices: 80, spread: 60, supply: 90, sold: 75, velocity: 95 } }
    },
    trends: {
      periods: [
        { label: "1d", change: -1.20, pct: -0.9 },
        { label: "7d", change: 5.80, pct: 4.6 },
        { label: "30d", change: 18.40, pct: 16.2 },
        { label: "90d", change: 55.90, pct: 73.2 },
      ],
      sparkline: [76, 78, 82, 88, 92, 98, 105, 110, 118, 122, 128, 130, 132],
      expansion: { name: "Flashfire", year: 2014, era: "XY", cardsInSet: 109, symbol: "🔥", color: "#f97316", color2: "#dc2626", setNum: "XY2" }
    }
  },
  {
    id: 4, name: "Mew", set: "Holon Phantoms", number: "#111", emoji: "✨",
    buyPrice: 34.99, sellPrice: 134.58, shipping: 12.30, fees: 2.40,
    tier: "HIT", condition: "LP", match: 96, ago: "15h",
    matchBreakdown: { name: 95, number: 100, denom: 0, expan: 90, variant: 98, extract: 0 },
    comps: {
      byCondition: [
        { grade: "DM", price: 52.30, low: 38.00, market: 52.30, spread: 14.10 },
        { grade: "MP", price: 78.90, low: 55.00, market: 78.90, spread: 38.70 },
        { grade: "LP", price: 134.58, low: 98.00, market: 134.58, spread: 92.38 },
        { grade: "NM", price: 210.40, low: 165.00, market: 210.40, spread: 165.20 },
      ],
      liquidity: { score: 45, level: "LOW", metrics: { trend: 10, prices: 20, spread: 15, supply: 5, sold: 30, velocity: 55 } }
    },
    trends: {
      periods: [
        { label: "1d", change: 0.00, pct: 0.0 },
        { label: "7d", change: 3.20, pct: 2.4 },
        { label: "30d", change: 12.80, pct: 10.5 },
        { label: "90d", change: 38.50, pct: 40.1 },
      ],
      sparkline: [96, 98, 100, 105, 108, 112, 118, 122, 125, 128, 130, 133, 135],
      expansion: { name: "Holon Phantoms", year: 2006, era: "EX", cardsInSet: 111, symbol: "👻", color: "#a78bfa", color2: "#6d28d9", setNum: "EX14" }
    }
  },
  {
    id: 5, name: "Gyarados δ", set: "Holon Phantoms", number: "#8", emoji: "🐉",
    buyPrice: 42.38, sellPrice: 94.83, shipping: 10.20, fees: 2.10,
    tier: "GRAIL", condition: "LP", match: 96, ago: "17h",
    matchBreakdown: { name: 90, number: 100, denom: 0, expan: 92, variant: 100, extract: 0 },
    comps: {
      byCondition: [
        { grade: "DM", price: 38.50, low: 28.00, market: 38.50, spread: 12.30 },
        { grade: "MP", price: 55.20, low: 40.00, market: 55.20, spread: 25.70 },
        { grade: "LP", price: 94.83, low: 68.00, market: 94.83, spread: 62.33 },
        { grade: "NM", price: 148.60, low: 110.00, market: 148.60, spread: 112.10 },
      ],
      liquidity: { score: 34, level: "LOW", metrics: { trend: 5, prices: 10, spread: 10, supply: 0, sold: 15, velocity: 40 } }
    },
    trends: {
      periods: [
        { label: "1d", change: 0.00, pct: 0.0 },
        { label: "7d", change: 1.50, pct: 1.6 },
        { label: "30d", change: 8.20, pct: 9.5 },
        { label: "90d", change: 22.40, pct: 31.0 },
      ],
      sparkline: [72, 74, 75, 78, 80, 82, 85, 88, 90, 92, 93, 94, 95],
      expansion: { name: "Holon Phantoms", year: 2006, era: "EX", cardsInSet: 111, symbol: "👻", color: "#a78bfa", color2: "#6d28d9", setNum: "EX14" }
    }
  },
  {
    id: 6, name: "Squirtle", set: "151", number: "#170", emoji: "🐢",
    buyPrice: 14.81, sellPrice: 47.11, shipping: 6.80, fees: 1.50,
    tier: "GRAIL", condition: "NM", match: 97, ago: "17h",
    matchBreakdown: { name: 98, number: 100, denom: 0, expan: 92, variant: 98, extract: 0 },
    comps: {
      byCondition: [
        { grade: "DM", price: 18.50, low: 12.00, market: 18.50, spread: 5.80 },
        { grade: "MP", price: 28.40, low: 20.00, market: 28.40, spread: 14.10 },
        { grade: "LP", price: 38.60, low: 28.00, market: 38.60, spread: 22.30 },
        { grade: "NM", price: 47.11, low: 35.00, market: 47.11, spread: 28.81 },
      ],
      liquidity: { score: 88, level: "HIGH", metrics: { trend: 80, prices: 90, spread: 75, supply: 95, sold: 85, velocity: 92 } }
    },
    trends: {
      periods: [
        { label: "1d", change: 0.50, pct: 1.1 },
        { label: "7d", change: 2.10, pct: 4.7 },
        { label: "30d", change: 5.80, pct: 14.0 },
        { label: "90d", change: 12.30, pct: 35.3 },
      ],
      sparkline: [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47],
      expansion: { name: "151", year: 2023, era: "Scarlet & Violet", cardsInSet: 207, symbol: "🔴", color: "#ef4444", color2: "#7c3aed", setNum: "SV3.5" }
    }
  },
  {
    id: 7, name: "M Heracross-EX", set: "Furious Fists", number: "#112", emoji: "🪲",
    buyPrice: 20.96, sellPrice: 28.29, shipping: 5.40, fees: 1.20,
    tier: "FLIP", condition: "LP", match: 93, ago: "17h",
    matchBreakdown: { name: 88, number: 100, denom: 0, expan: 82, variant: 90, extract: 0 },
    comps: {
      byCondition: [
        { grade: "DM", price: 12.40, low: 8.00, market: 12.40, spread: 2.80 },
        { grade: "MP", price: 18.80, low: 14.00, market: 18.80, spread: 8.20 },
        { grade: "LP", price: 28.29, low: 20.00, market: 28.29, spread: 16.69 },
        { grade: "NM", price: 42.50, low: 32.00, market: 42.50, spread: 28.90 },
      ],
      liquidity: { score: 65, level: "MED", metrics: { trend: 30, prices: 50, spread: 40, supply: 60, sold: 55, velocity: 70 } }
    },
    trends: {
      periods: [
        { label: "1d", change: 0.00, pct: 0.0 },
        { label: "7d", change: -0.80, pct: -2.7 },
        { label: "30d", change: 1.20, pct: 4.4 },
        { label: "90d", change: 4.50, pct: 18.9 },
      ],
      sparkline: [24, 25, 24, 26, 25, 27, 26, 28, 27, 28, 28, 28, 28],
      expansion: { name: "Furious Fists", year: 2014, era: "XY", cardsInSet: 113, symbol: "👊", color: "#f59e0b", color2: "#b45309", setNum: "XY3" }
    }
  },
  {
    id: 8, name: "Virizion", set: "Noble Victories", number: "#97", emoji: "🌿",
    buyPrice: 20.99, sellPrice: 33.88, shipping: 6.40, fees: 1.40,
    tier: "HIT", condition: "NM", match: 81, ago: "18h",
    matchBreakdown: { name: 75, number: 100, denom: 0, expan: 55, variant: 80, extract: 0 },
    comps: {
      byCondition: [
        { grade: "DM", price: 14.20, low: 9.00, market: 14.20, spread: 3.10 },
        { grade: "MP", price: 22.50, low: 16.00, market: 22.50, spread: 10.40 },
        { grade: "LP", price: 28.90, low: 22.00, market: 28.90, spread: 16.80 },
        { grade: "NM", price: 33.88, low: 26.00, market: 33.88, spread: 20.78 },
      ],
      liquidity: { score: 52, level: "MED", metrics: { trend: 20, prices: 35, spread: 25, supply: 40, sold: 45, velocity: 60 } }
    },
    trends: {
      periods: [
        { label: "1d", change: 0.00, pct: 0.0 },
        { label: "7d", change: 0.90, pct: 2.7 },
        { label: "30d", change: 3.40, pct: 11.2 },
        { label: "90d", change: 8.80, pct: 35.1 },
      ],
      sparkline: [25, 26, 26, 27, 28, 29, 30, 30, 31, 32, 33, 33, 34],
      expansion: { name: "Noble Victories", year: 2011, era: "Black & White", cardsInSet: 102, symbol: "⚔️", color: "#eab308", color2: "#854d0e", setNum: "BW3" }
    }
  },
];

function getProfit(d) { return d.sellPrice - d.buyPrice - d.shipping - d.fees; }
function getRoi(d) { const cost = d.buyPrice + d.shipping + d.fees; return cost > 0 ? ((getProfit(d) / cost) * 100) : 0; }
function getTrust(m) {
  if (m >= 93) return { label: "Strong", color: "var(--emerald)", bg: "var(--emerald-soft)" };
  if (m >= 80) return { label: "Fair", color: "var(--amber)", bg: "var(--amber-soft)" };
  return { label: "Risky", color: "var(--coral)", bg: "var(--coral-soft)" };
}
function metricColor(v) { return v >= 70 ? "var(--emerald)" : v >= 40 ? "var(--amber)" : "var(--coral)"; }
function liqColor(l) { return l === "HIGH" ? "var(--emerald)" : l === "MED" ? "var(--amber)" : "var(--coral)"; }

const TIER = {
  GRAIL: { c: "#c4b5fd", bg: "rgba(196,181,253,0.10)", b: "rgba(196,181,253,0.25)" },
  HIT:   { c: "#60a5fa", bg: "rgba(96,165,250,0.10)",  b: "rgba(96,165,250,0.25)" },
  FLIP:  { c: "#f472b6", bg: "rgba(244,114,182,0.10)", b: "rgba(244,114,182,0.25)" },
};

// ═══════════════════════════════════════════════
// CATALOG DATA
// ═══════════════════════════════════════════════
const EXPANSIONS = [
  { id: "asc", name: "Ascended Heroes", code: "ASC", series: "Mega Evolution", cards: 295, date: "Jan 30, 2026", symbol: "⚔️", c1: "#f59e0b", c2: "#b45309" },
  { id: "pfl", name: "Phantasmal Flames", code: "PFL", series: "Mega Evolution", cards: 130, date: "Nov 14, 2025", symbol: "👻", c1: "#f97316", c2: "#dc2626" },
  { id: "meg", name: "Mega Evolution", code: "MEG", series: "Mega Evolution", cards: 188, date: "Sep 26, 2025", symbol: "🧬", c1: "#8b5cf6", c2: "#6d28d9" },
  { id: "mep", name: "Mega Evolution Black Star Promos", code: "MEP", series: "Mega Evolution", cards: 28, date: "Sep 26, 2025", symbol: "⭐", c1: "#a78bfa", c2: "#7c3aed" },
  { id: "wht", name: "White Flare", code: "WHT", series: "Scarlet & Violet", cards: 173, date: "Jul 18, 2025", symbol: "🤍", c1: "#e2e8f0", c2: "#94a3b8" },
  { id: "blk", name: "Black Bolt", code: "BLK", series: "Scarlet & Violet", cards: 172, date: "Jul 18, 2025", symbol: "⚡", c1: "#475569", c2: "#1e293b" },
  { id: "dri", name: "Destined Rivals", code: "DRI", series: "Scarlet & Violet", cards: 244, date: "May 30, 2025", symbol: "🏆", c1: "#ef4444", c2: "#60a5fa" },
  { id: "jtg", name: "Journey Together", code: "JTG", series: "Scarlet & Violet", cards: 196, date: "Mar 28, 2025", symbol: "🤝", c1: "#34d399", c2: "#059669" },
  { id: "mc24", name: "McDonald's Collection 2024", code: "MC24", series: "Promos", cards: 15, date: "Jan 21, 2025", symbol: "🍟", c1: "#fbbf24", c2: "#dc2626" },
  { id: "pre", name: "Prismatic Evolutions", code: "PRE", series: "Scarlet & Violet", cards: 180, date: "Jan 17, 2025", symbol: "💎", c1: "#c084fc", c2: "#e879f9" },
  { id: "ssp", name: "Surging Sparks", code: "SSP", series: "Scarlet & Violet", cards: 252, date: "Nov 8, 2024", symbol: "⚡", c1: "#fbbf24", c2: "#f97316" },
  { id: "scr", name: "Stellar Crown", code: "SCR", series: "Scarlet & Violet", cards: 175, date: "Sep 13, 2024", symbol: "👑", c1: "#60a5fa", c2: "#3b82f6" },
  { id: "sfa", name: "Shrouded Fable", code: "SFA", series: "Scarlet & Violet", cards: 99, date: "Aug 2, 2024", symbol: "🌑", c1: "#8b5cf6", c2: "#4c1d95" },
  { id: "twm", name: "Twilight Masquerade", code: "TWM", series: "Scarlet & Violet", cards: 226, date: "May 24, 2024", symbol: "🎭", c1: "#a78bfa", c2: "#7c3aed" },
  { id: "tef", name: "Temporal Forces", code: "TEF", series: "Scarlet & Violet", cards: 218, date: "Mar 22, 2024", symbol: "⏳", c1: "#2dd4bf", c2: "#0d9488" },
  { id: "paf", name: "Paldean Fates", code: "PAF", series: "Scarlet & Violet", cards: 245, date: "Jan 26, 2024", symbol: "✨", c1: "#f472b6", c2: "#db2777" },
];

const MOCK_CARDS = {
  pfl: [
    { id: 1, name: "Oddish", num: "#1", rarity: "Common", type: "Grass", price: 0.12, emoji: "🌿" },
    { id: 2, name: "Gloom", num: "#2", rarity: "Uncommon", type: "Grass", price: 0.11, emoji: "🌸" },
    { id: 3, name: "Vileplume", num: "#3", rarity: "Rare", type: "Grass", price: 0.41, emoji: "🌺", stage: "Stage 2", illustrator: "Shibuzoh.", hp: 150 },
    { id: 4, name: "Mega Heracross ex", num: "#4", rarity: "Ultra Rare", type: "Grass", price: 0.51, emoji: "🪲" },
    { id: 5, name: "Lotad", num: "#5", rarity: "Common", type: "Water", price: 0.14, emoji: "🌊" },
    { id: 6, name: "Lombre", num: "#6", rarity: "Uncommon", type: "Water", price: 0.14, emoji: "💧" },
    { id: 7, name: "Ludicolo", num: "#7", rarity: "Rare", type: "Water", price: 0.09, emoji: "🎉" },
    { id: 8, name: "Genesect", num: "#8", rarity: "Rare", type: "Metal", price: 0.09, emoji: "🤖" },
    { id: 9, name: "Nymble", num: "#9", rarity: "Common", type: "Grass", price: 0.11, emoji: "🦗" },
    { id: 10, name: "Lokix", num: "#10", rarity: "Uncommon", type: "Grass", price: 0.12, emoji: "🦟" },
    { id: 11, name: "Charmander", num: "#11", rarity: "Common", type: "Fire", price: 0.19, emoji: "🔥" },
    { id: 12, name: "Charmeleon", num: "#12", rarity: "Uncommon", type: "Fire", price: 0.19, emoji: "🔥" },
    { id: 13, name: "Mega Charizard X ex", num: "#13", rarity: "Ultra Rare", type: "Fire", price: 3.89, emoji: "🐉" },
    { id: 14, name: "Moltres", num: "#14", rarity: "Rare", type: "Fire", price: 0.53, emoji: "🔥" },
    { id: 15, name: "Darumaka", num: "#15", rarity: "Common", type: "Fire", price: 0.11, emoji: "🔴" },
  ],
};

// Generate generic cards for other expansions
EXPANSIONS.forEach(exp => {
  if (!MOCK_CARDS[exp.id]) {
    const types = ["Grass","Fire","Water","Lightning","Psychic","Fighting","Dark","Metal","Dragon","Fairy"];
    const rarities = ["Common","Common","Common","Uncommon","Uncommon","Rare","Rare","Ultra Rare"];
    const names = ["Pikachu","Eevee","Snorlax","Gengar","Dragonite","Lucario","Gardevoir","Mewtwo","Rayquaza","Charizard","Blastoise","Venusaur","Jigglypuff","Machamp","Alakazam"];
    MOCK_CARDS[exp.id] = Array.from({ length: Math.min(exp.cards, 15) }, (_, i) => ({
      id: i + 1, name: names[i % names.length], num: `#${i + 1}`,
      rarity: rarities[i % rarities.length], type: types[i % types.length],
      price: +(Math.random() * 5).toFixed(2),
      emoji: ["⚡","🌿","🔥","💧","🔮","👊","🌑","⚙️","🐉","🧚"][i % 10],
    }));
  }
});

const SERIES_LIST = [...new Set(EXPANSIONS.map(e => e.series))];

// ═══════════════════════════════════════════════
// CATALOG COMPONENTS
// ═══════════════════════════════════════════════

// ─── Expansion Grid Card ─────────────────────────────
function ExpansionCard({ exp, index, onClick }) {
  return (
    <button className="ecard" onClick={onClick} style={{ animationDelay: `${index * 40}ms`, '--ec1': exp.c1, '--ec2': exp.c2 }}>
      <div className="ecard__glow" />
      <div className="ecard__symbol-wrap">
        <span className="ecard__symbol">{exp.symbol}</span>
      </div>
      <span className="ecard__name">{exp.name}</span>
      <div className="ecard__meta">
        <span className="ecard__code">{exp.code}</span>
        <span className="ecard__dot">·</span>
        <span>{exp.cards} cards</span>
      </div>
      <span className="ecard__date">{exp.date}</span>
      <div className="ecard__accent" />
    </button>
  );
}

// ─── Card Grid Item ──────────────────────────────────
function CardGridItem({ card, index, onClick }) {
  const rarityColor = card.rarity === "Ultra Rare" ? "var(--amber)" : card.rarity === "Rare" ? "var(--blue)" : "var(--t3)";
  return (
    <button className="cgi" onClick={onClick} style={{ animationDelay: `${index * 25}ms` }}>
      <div className="cgi__img">
        <span className="cgi__emoji">{card.emoji}</span>
      </div>
      <span className="cgi__name">{card.name}</span>
      <span className="cgi__num">{card.num}</span>
      <span className="cgi__price" style={{ color: card.price > 1 ? "var(--emerald)" : "var(--t3)" }}>
        ${card.price.toFixed(2)}
      </span>
    </button>
  );
}

// ─── Card Detail View ────────────────────────────────
function CardDetail({ card, expansion, onBack }) {
  const [variant, setVariant] = useState("normal");
  return (
    <div className="cd anim-in">
      <button className="cd__back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back to {expansion.name}
      </button>
      <div className="cd__layout">
        <div className="cd__img-col">
          <div className="cd__img-frame">
            <div className="cd__img-glow" />
            <span className="cd__emoji">{card.emoji}</span>
          </div>
          {card.illustrator && <span className="cd__illustrator">Illustrated by {card.illustrator}</span>}
        </div>
        <div className="cd__info-col">
          <h2 className="cd__name">{card.name}</h2>
          <div className="cd__tags">
            <span className="cd__tag">{card.num}</span>
            <span className="cd__tag">{card.rarity}</span>
            <span className="cd__tag">{card.type}</span>
            {card.stage && <span className="cd__tag">{card.stage}</span>}
          </div>
          <div className="cd__expansion-link" style={{ '--ec1': expansion.c1 }}>
            <span className="cd__exp-symbol">{expansion.symbol}</span>
            <div className="cd__exp-info">
              <span className="cd__exp-name">{expansion.name}</span>
              <span className="cd__exp-meta">{expansion.series} · {expansion.code}</span>
            </div>
          </div>
          <div className="cd__variants">
            {["normal", "reverseHolofoil"].map(v => (
              <button key={v} className={`cd__variant-btn ${variant === v ? "cd__variant-btn--on" : ""}`}
                onClick={() => setVariant(v)}>{v}</button>
            ))}
          </div>
          <div className="cd__section">
            <h3 className="cd__section-title">Raw Prices</h3>
            <div className="cd__price-table">
              <div className="cd__pt-header"><span>Condition</span><span>Low</span><span>Market</span></div>
              <div className="cd__pt-row">
                <span>NM</span>
                <span style={{ color: "var(--emerald)" }}>${(card.price * 1.2).toFixed(2)}</span>
                <span style={{ color: "var(--emerald)" }}>${card.price.toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="cd__section">
            <h3 className="cd__section-title">Graded Prices</h3>
            <div className="cd__price-table">
              <div className="cd__pt-header"><span>Grade</span><span>Low</span><span>Market</span></div>
              <div className="cd__pt-row">
                <span>PSA 9</span>
                <span style={{ color: "var(--emerald)" }}>${(card.price * 30).toFixed(2)}</span>
                <span style={{ color: "var(--emerald)" }}>${(card.price * 30).toFixed(2)}</span>
              </div>
            </div>
          </div>
          <div className="cd__section">
            <h3 className="cd__section-title">Price Trends (NM)</h3>
            <div className="cd__trends">
              {[{ p: "1D", v: 0 }, { p: "7D", v: 10.8 }, { p: "14D", v: 10.8 }, { p: "30D", v: 36.7 }].map(t => (
                <div className="cd__trend-cell" key={t.p}>
                  <span className="cd__trend-period">{t.p}</span>
                  <span className={`cd__trend-val ${t.v > 0 ? "is-up" : ""}`}>
                    {t.v > 0 ? "▲ " : ""}{t.v.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Expansion Detail View ───────────────────────────
function ExpansionDetail({ expansion, onBack, onCardSelect }) {
  const [sortBy, setSortBy] = useState("number");
  const [rarityFilter, setRarityFilter] = useState("All");
  const cards = MOCK_CARDS[expansion.id] || [];
  const rarities = ["All", ...new Set(cards.map(c => c.rarity))];

  const filtered = cards.filter(c => rarityFilter === "All" || c.rarity === rarityFilter)
    .sort((a, b) => sortBy === "number" ? a.id - b.id : sortBy === "price" ? b.price - a.price : a.name.localeCompare(b.name));

  return (
    <div className="expd anim-in">
      <div className="expd__banner" style={{ '--ec1': expansion.c1, '--ec2': expansion.c2 }}>
        <div className="expd__banner-glow" />
        <button className="expd__back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="expd__banner-symbol">
          <span>{expansion.symbol}</span>
        </div>
        <div className="expd__banner-info">
          <h2 className="expd__banner-name">{expansion.name}</h2>
          <div className="expd__banner-meta">
            <span>{expansion.code}</span><span>·</span>
            <span>{expansion.series}</span><span>·</span>
            <span>{expansion.cards} cards</span><span>·</span>
            <span>{expansion.date}</span>
          </div>
        </div>
      </div>
      <div className="expd__toolbar">
        <div className="sort-m">
          <label htmlFor="cs">Sort</label>
          <select id="cs" className="sort-m__sel" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="number">By Number</option><option value="name">By Name</option><option value="price">By Price</option>
          </select>
        </div>
        <div className="sort-m">
          <label htmlFor="cr">Rarity</label>
          <select id="cr" className="sort-m__sel" value={rarityFilter} onChange={e => setRarityFilter(e.target.value)}>
            {rarities.map(r => <option key={r} value={r}>{r === "All" ? "All Rarities" : r}</option>)}
          </select>
        </div>
      </div>
      <div className="expd__grid">
        {filtered.map((card, i) => (
          <CardGridItem key={card.id} card={card} index={i} onClick={() => onCardSelect(card)} />
        ))}
      </div>
    </div>
  );
}

// ─── Catalog Page ────────────────────────────────────
function CatalogPage() {
  const [view, setView] = useState("grid"); // grid | expansion | card
  const [selectedExp, setSelectedExp] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [seriesFilter, setSeriesFilter] = useState("All");

  const filtered = EXPANSIONS.filter(e => {
    if (seriesFilter !== "All" && e.series !== seriesFilter) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === "newest") return new Date(b.date) - new Date(a.date);
    if (sortBy === "oldest") return new Date(a.date) - new Date(b.date);
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "cards") return b.cards - a.cards;
    return 0;
  });

  if (view === "card" && selectedCard && selectedExp) {
    return <CardDetail card={selectedCard} expansion={selectedExp} onBack={() => { setView("expansion"); setSelectedCard(null); }} />;
  }

  if (view === "expansion" && selectedExp) {
    return (
      <ExpansionDetail
        expansion={selectedExp}
        onBack={() => { setView("grid"); setSelectedExp(null); }}
        onCardSelect={(card) => { setSelectedCard(card); setView("card"); }}
      />
    );
  }

  return (
    <div className="catg anim-in">
      <div className="catg__header">
        <h1 className="catg__title">Card Catalog</h1>
        <div className="catg__controls">
          <div className="catg__search">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            <input type="search" placeholder="Search expansions…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="catg__select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="newest">Newest First</option><option value="oldest">Oldest First</option>
            <option value="name">By Name</option><option value="cards">Most Cards</option>
          </select>
          <select className="catg__select" value={seriesFilter} onChange={e => setSeriesFilter(e.target.value)}>
            <option value="All">All Series</option>
            {SERIES_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="catg__grid">
        {filtered.map((exp, i) => (
          <ExpansionCard key={exp.id} exp={exp} index={i} onClick={() => { setSelectedExp(exp); setView("expansion"); }} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="hero-empty" style={{ padding: '80px 24px' }}>
          <span className="hero-empty__icon">📦</span>
          <p className="hero-empty__text">No expansions match your search</p>
        </div>
      )}
    </div>
  );
}

// ─── Trust Ring ──────────────────────────────────────
function TrustRing({ match, size = 64 }) {
  const t = getTrust(match);
  const r = (size - 8) / 2, c = 2 * Math.PI * r, o = c - (match / 100) * c;
  return (
    <div className="tr" style={{ width: size, height: size }} aria-label={`${match}% match`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--s3)" strokeWidth="4" opacity=".35" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={t.color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={o} transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.16,1,.3,1)" }} />
      </svg>
      <span className="tr__v" style={{ color: t.color }}>{match}</span>
    </div>
  );
}

// ─── Sparkline ───────────────────────────────────────
function Sparkline({ data, width = 280, height = 60, color = "var(--emerald)" }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pad = 4;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const areaPoints = points + ` ${width - pad},${height - pad} ${pad},${height - pad}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline" aria-hidden="true">
      <defs>
        <linearGradient id="sfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#sfill)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Intel Tabs (Overview / Comps / Trends) ──────────
function IntelPanel({ deal }) {
  const [tab, setTab] = useState("overview");
  const profit = getProfit(deal);
  const totalCost = deal.buyPrice + deal.shipping + deal.fees;
  const t = getTrust(deal.match);
  const tabs = ["overview", "comps", "trends"];

  return (
    <div className="intel">
      <nav className="intel__tabs" aria-label="Card intelligence">
        {tabs.map(tb => (
          <button key={tb} className={`intel__tab ${tab === tb ? "is-on" : ""}`} onClick={() => setTab(tb)}>
            {tb.charAt(0).toUpperCase() + tb.slice(1)}
          </button>
        ))}
      </nav>

      <div className="intel__body">
        {/* ─── OVERVIEW ─── */}
        {tab === "overview" && (
          <div className="intel__section anim-in">
            <div className="intel__group">
              <h3 className="intel__heading">No BS Pricing</h3>
              <dl className="pricing">
                <div className="pr"><dt>eBay price</dt><dd>£{deal.buyPrice.toFixed(2)}</dd></div>
                <div className="pr"><dt>Shipping</dt><dd>£{deal.shipping.toFixed(2)}</dd></div>
                <div className="pr"><dt>Fees (inc.)</dt><dd>£{deal.fees.toFixed(2)}</dd></div>
                <div className="pr pr--heavy"><dt>Total cost</dt><dd>£{totalCost.toFixed(2)}</dd></div>
                <div className="pr"><dt>Market price</dt><dd>£{deal.sellPrice.toFixed(2)}</dd></div>
                <div className="pr pr--profit"><dt>Profit</dt><dd style={{ color: "var(--emerald)" }}>+£{profit.toFixed(2)}</dd></div>
              </dl>
            </div>

            <div className="intel__group">
              <div className="mc-header">
                <h3 className="intel__heading">Match Confidence</h3>
                <TrustRing match={deal.match} size={40} />
              </div>
              {Object.entries(deal.matchBreakdown).map(([key, val]) => {
                const col = val >= 90 ? "var(--emerald)" : val >= 50 ? "var(--amber)" : "var(--coral)";
                const verified = val === 100 || val >= 95;
                return (
                  <div className="mb-row" key={key}>
                    <span className="mb-row__label">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                    <div className="mb-row__track"><div className="mb-row__fill" style={{ width: `${val}%`, background: col }} /></div>
                    <span className="mb-row__val" style={{ color: col }}>{val}%</span>
                    <span className={`mb-row__chk ${verified ? "is-yes" : ""}`}>{verified ? "✓" : "—"}</span>
                  </div>
                );
              })}
            </div>

            <div className="intel__group">
              <h3 className="intel__heading">Review</h3>
              <div className="review-btns">
                <button className="rbtn rbtn--yes">✓ Correct</button>
                <button className="rbtn rbtn--no">✗ Wrong</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── COMPS ─── */}
        {tab === "comps" && (
          <div className="intel__section anim-in">
            <div className="intel__group">
              <h3 className="intel__heading">Comps by Condition</h3>
              <div className="comps-bars">
                {deal.comps.byCondition.map(c => {
                  const maxP = Math.max(...deal.comps.byCondition.map(x => x.price));
                  const isCurrent = c.grade === deal.condition;
                  return (
                    <div className={`cb-row ${isCurrent ? "cb-row--current" : ""}`} key={c.grade}>
                      <span className="cb-row__grade">{c.grade}</span>
                      <div className="cb-row__track">
                        <div className="cb-row__fill" style={{ width: `${(c.price / maxP) * 100}%` }} />
                      </div>
                      <span className="cb-row__price">£{c.price.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="intel__group">
              <div className="comps-table" role="table" aria-label="Comparable sales">
                <div className="ct-header" role="row">
                  <span role="columnheader"></span>
                  <span role="columnheader">Low</span>
                  <span role="columnheader">Market</span>
                  <span role="columnheader">Spread</span>
                </div>
                {deal.comps.byCondition.map(c => {
                  const isCurrent = c.grade === deal.condition;
                  return (
                    <div className={`ct-row ${isCurrent ? "ct-row--current" : ""}`} key={c.grade} role="row">
                      <span className="ct-row__grade" role="cell">{c.grade}</span>
                      <span role="cell">£{c.low.toFixed(2)}</span>
                      <span role="cell" className="ct-row__market">£{c.market.toFixed(2)}</span>
                      <span role="cell" className="ct-row__spread">+£{c.spread.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="intel__group">
              <h3 className="intel__heading">Liquidity</h3>
              <div className="liq-hero">
                <span className="liq-hero__pct" style={{ color: liqColor(deal.comps.liquidity.level) }}>
                  {deal.comps.liquidity.score}%
                </span>
                <span className="liq-hero__badge" style={{
                  color: liqColor(deal.comps.liquidity.level),
                  background: deal.comps.liquidity.level === "HIGH" ? "var(--emerald-soft)" : deal.comps.liquidity.level === "MED" ? "var(--amber-soft)" : "var(--coral-soft)"
                }}>{deal.comps.liquidity.level}</span>
              </div>
              {Object.entries(deal.comps.liquidity.metrics).map(([key, val]) => (
                <div className="mb-row" key={key}>
                  <span className="mb-row__label">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                  <div className="mb-row__track"><div className="mb-row__fill" style={{ width: `${val}%`, background: metricColor(val) }} /></div>
                  <span className="mb-row__val" style={{ color: metricColor(val) }}>{val}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TRENDS ─── */}
        {tab === "trends" && (
          <div className="intel__section anim-in">
            <div className="intel__group">
              <h3 className="intel__heading">Price Trends</h3>
              <div className="sparkline-wrap">
                <Sparkline data={deal.trends.sparkline} width={320} height={72} />
              </div>
              <div className="trend-grid">
                {deal.trends.periods.map(p => (
                  <div className="trend-card" key={p.label}>
                    <span className="trend-card__period">{p.label}</span>
                    <span className={`trend-card__change ${p.change >= 0 ? "is-up" : "is-down"}`}>
                      {p.change >= 0 ? "+" : ""}£{p.change.toFixed(2)}
                    </span>
                    <span className={`trend-card__pct ${p.pct >= 0 ? "is-up" : "is-down"}`}>
                      {p.pct >= 0 ? "+" : ""}{p.pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="intel__group">
              <h3 className="intel__heading">Expansion</h3>
              <div className="xpn" style={{ '--xc1': deal.trends.expansion.color, '--xc2': deal.trends.expansion.color2 }}>
                <div className="xpn__glow" />
                <div className="xpn__top">
                  <div className="xpn__icon-ring">
                    <span className="xpn__symbol">{deal.trends.expansion.symbol}</span>
                  </div>
                  <div className="xpn__identity">
                    <span className="xpn__name">{deal.trends.expansion.name}</span>
                    <span className="xpn__code">{deal.trends.expansion.setNum}</span>
                  </div>
                  <span className="xpn__year">{deal.trends.expansion.year}</span>
                </div>
                <div className="xpn__stats">
                  <div className="xpn__stat">
                    <span className="xpn__stat-val">{deal.trends.expansion.cardsInSet}</span>
                    <span className="xpn__stat-label">Cards</span>
                  </div>
                  <div className="xpn__stat-divider" />
                  <div className="xpn__stat">
                    <span className="xpn__stat-val">{deal.trends.expansion.era}</span>
                    <span className="xpn__stat-label">Era</span>
                  </div>
                  <div className="xpn__stat-divider" />
                  <div className="xpn__stat">
                    <span className="xpn__stat-val" style={{ color: 'var(--xc1)' }}>{deal.number}</span>
                    <span className="xpn__stat-label">This card</span>
                  </div>
                </div>
                <button className="xpn__link">
                  <span>View in Catalog</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Hero Deal ───────────────────────────────────────
function HeroDeal({ deal, onSnag, onSkip }) {
  if (!deal) return null;
  const profit = getProfit(deal);
  const roi = getRoi(deal);
  const trust = getTrust(deal.match);
  const ts = TIER[deal.tier] || TIER.HIT;

  return (
    <article className="hero" aria-label={`Deal: ${deal.name}`}>
      <div className="hero__top">
        <div className="hero__card-frame">
          <div className="hero__glow" style={{ background: `radial-gradient(circle at 50% 35%, ${ts.c}18, transparent 70%)` }} />
          <span className="hero__emoji">{deal.emoji}</span>
          <span className="hero__flip-hint">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Flip
          </span>
        </div>

        <div className="hero__summary">
          <div className="hero__id">
            <h1 className="hero__name">{deal.name}</h1>
            <p className="hero__set">{deal.set} · {deal.number}</p>
            <div className="hero__tags">
              <span className="htag" style={{ color: ts.c, background: ts.bg, borderColor: ts.b }}>{deal.tier}</span>
              <span className={`htag htag--c-${deal.condition.toLowerCase()}`}>{deal.condition}</span>
            </div>
          </div>

          <div className="hero__numbers">
            <div className="hero__profit-col">
              <span className="hero__profit-val">+£{profit.toFixed(2)}</span>
              <span className="hero__profit-roi">+{roi.toFixed(0)}% ROI</span>
            </div>
            <div className="hero__trust-col">
              <TrustRing match={deal.match} size={56} />
              <span className="hero__trust-word" style={{ color: trust.color }}>{trust.label}</span>
            </div>
          </div>

          <div className="hero__buysell">
            <div className="bs-cell"><span className="bs-cell__label">Buy</span><span className="bs-cell__val">£{deal.buyPrice.toFixed(2)}</span></div>
            <span className="bs-arrow" aria-hidden="true">→</span>
            <div className="bs-cell"><span className="bs-cell__label">Sell</span><span className="bs-cell__val">£{deal.sellPrice.toFixed(2)}</span></div>
            <span className="hero__ago">{deal.ago} ago</span>
          </div>
        </div>
      </div>

      <div className="hero__actions">
        <button className="act act--skip" onClick={onSkip}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          Skip
        </button>
        <a href="#" className="act act--snag" onClick={e => { e.preventDefault(); onSnag(); }}>
          Snag on eBay
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </a>
      </div>

      <IntelPanel deal={deal} />
    </article>
  );
}

// ─── Queue Card ──────────────────────────────────────
function QueueCard({ deal, index, isCurrent, onClick }) {
  const profit = getProfit(deal);
  const roi = getRoi(deal);
  const trust = getTrust(deal.match);
  const ts = TIER[deal.tier] || TIER.HIT;
  return (
    <button className={`qc ${isCurrent ? "qc--on" : ""}`} onClick={onClick} style={{ animationDelay: `${index * 35}ms` }}
      aria-label={`${deal.name} — +£${profit.toFixed(2)}`}>
      <div className="qc__strip" style={{ background: ts.c }} />
      <span className="qc__emoji">{deal.emoji}</span>
      <div className="qc__info">
        <span className="qc__name">{deal.name}</span>
        <span className="qc__set">{deal.set}</span>
      </div>
      <div className="qc__nums">
        <span className="qc__profit">+£{profit.toFixed(2)}</span>
        <span className="qc__roi">+{roi.toFixed(0)}%</span>
      </div>
      <div className="qc__ring" style={{ borderColor: trust.color + "55" }}>
        <span style={{ color: trust.color }}>{deal.match}</span>
      </div>
    </button>
  );
}

// ─── Icon Rail ───────────────────────────────────────
function Rail({ active, onNav, isPaused, onPause }) {
  const items = [
    { id: "dashboard", d: "M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z" },
    { id: "catalog", d: "M4 4h12M4 8h12M4 12h8M4 16h5" },
    { id: "alerts", d: "M10 2a6 6 0 016 6c0 3 1 5 1 5H3s1-2 1-5a6 6 0 016-6zM8 17a2 2 0 004 0" },
    { id: "settings", d: "M10 13a3 3 0 100-6 3 3 0 000 6z" },
  ];
  return (
    <nav className="rail">
      <div className="rail__logo">P</div>
      <div className="rail__nav">
        {items.map(it => (
          <button key={it.id} className={`rail__btn ${active === it.id ? "rail__btn--on" : ""}`}
            onClick={() => onNav(it.id)} title={it.id.charAt(0).toUpperCase() + it.id.slice(1)} aria-label={it.id}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d={it.d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
      <button className={`rail__pause ${isPaused ? "off" : "on"}`} onClick={onPause}
        title={isPaused ? "Paused" : "Live"} aria-label={isPaused ? "Resume" : "Pause"}>
        <span className="rail__dot" />
      </button>
    </nav>
  );
}

// ─── Filter ──────────────────────────────────────────
function Filters({ show, filters, onChange }) {
  if (!show) return null;
  return (
    <div className="fpop">
      <div className="fpop__g"><span className="fpop__l">Tier</span><div className="fpop__c">
        {["ALL","GRAIL","HIT","FLIP"].map(v => <button key={v} className={`fc ${filters.tier===v?"fc--on":""}`} onClick={()=>onChange("tier",v)}>{v}</button>)}
      </div></div>
      <div className="fpop__g"><span className="fpop__l">Condition</span><div className="fpop__c">
        {["ALL","NM","LP"].map(v => <button key={v} className={`fc ${filters.cond===v?"fc--on":""}`} onClick={()=>onChange("cond",v)}>{v}</button>)}
      </div></div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════
export default function App() {
  const [deals] = useState(DEALS);
  const [curIdx, setCurIdx] = useState(0);
  const [nav, setNav] = useState("dashboard");
  const [paused, setPaused] = useState(true);
  const [showF, setShowF] = useState(false);
  const [filters, setFilters] = useState({ tier: "ALL", cond: "ALL" });
  const [skipped, setSkipped] = useState(new Set());
  const [snagged, setSnagged] = useState(new Set());
  const [sort, setSort] = useState("profit");

  const visible = deals.filter(d => {
    if (skipped.has(d.id) || snagged.has(d.id)) return false;
    if (filters.tier !== "ALL" && d.tier !== filters.tier) return false;
    if (filters.cond !== "ALL" && d.condition !== filters.cond) return false;
    return true;
  }).sort((a, b) => sort === "profit" ? getProfit(b) - getProfit(a) : sort === "match" ? b.match - a.match : getRoi(b) - getRoi(a));

  const cur = visible[curIdx] || visible[0] || null;

  const doSnag = useCallback(() => { if (cur) { setSnagged(p => new Set(p).add(cur.id)); setCurIdx(0); } }, [cur]);
  const doSkip = useCallback(() => { if (cur) { setSkipped(p => new Set(p).add(cur.id)); setCurIdx(0); } }, [cur]);

  useEffect(() => {
    if (nav !== "dashboard") return;
    const h = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "s" || e.key === "ArrowRight") doSnag();
      if (e.key === "x" || e.key === "ArrowLeft") doSkip();
      if (e.key === "ArrowDown") setCurIdx(i => Math.min(i + 1, visible.length - 1));
      if (e.key === "ArrowUp") setCurIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [doSnag, doSkip, visible.length, nav]);

  const snagTotal = deals.filter(d => snagged.has(d.id)).reduce((s, d) => s + getProfit(d), 0);
  const potential = visible.reduce((s, d) => s + getProfit(d), 0);
  const isDashboard = nav === "dashboard";

  return (
    <>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
:root {
  --bg0:#06080f; --bg1:#0a0e1a; --bg2:#111827; --bg3:#1a2236;
  --s1:#1e2940; --s2:#243150; --s3:#2d3b5e;
  --b1:rgba(96,165,250,.06); --b2:rgba(96,165,250,.12); --b3:rgba(96,165,250,.22);
  --t1:#f0f4fc; --t2:#94a3c4; --t3:#5b6d8e; --t4:#3a4a6b;
  --emerald:#34d399; --emerald-soft:rgba(52,211,153,.10);
  --coral:#f87171; --coral-soft:rgba(248,113,113,.10);
  --amber:#fbbf24; --amber-soft:rgba(251,191,36,.10);
  --blue:#60a5fa; --blue-soft:rgba(96,165,250,.10);
  --font:'Instrument Sans',system-ui,sans-serif;
  --mono:'JetBrains Mono',monospace;
  --r-s:8px; --r-m:12px; --r-l:18px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body,#root{background:var(--bg0);color:var(--t1);font-family:var(--font);-webkit-font-smoothing:antialiased;min-height:100vh;overflow:hidden}

/* SHELL */
.shell{display:grid;grid-template-columns:56px 1fr 320px;height:100vh;
  background:radial-gradient(ellipse 80% 50% at 30% 8%,rgba(96,165,250,.03) 0%,transparent 60%),
  radial-gradient(ellipse 50% 40% at 85% 95%,rgba(139,92,246,.02) 0%,transparent 50%),var(--bg0)}
.shell--wide{grid-template-columns:56px 1fr}

/* RAIL */
.rail{display:flex;flex-direction:column;align-items:center;padding:14px 0;background:var(--bg1);border-right:1px solid var(--b1);gap:4px;z-index:10}
.rail__logo{width:34px;height:34px;border-radius:var(--r-m);background:linear-gradient(135deg,var(--blue),#818cf8);display:flex;align-items:center;justify-content:center;font:700 16px var(--font);color:#fff;margin-bottom:18px}
.rail__nav{display:flex;flex-direction:column;gap:4px;flex:1}
.rail__btn{width:38px;height:38px;border:none;background:none;color:var(--t4);cursor:pointer;border-radius:var(--r-s);display:flex;align-items:center;justify-content:center;transition:.15s}
.rail__btn:hover{color:var(--t2);background:rgba(96,165,250,.05)}
.rail__btn--on{color:var(--blue);background:var(--blue-soft)}
.rail__pause{width:34px;height:34px;border:none;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;margin-top:auto;transition:.2s}
.rail__pause.off{background:var(--coral-soft)} .rail__pause.on{background:var(--emerald-soft)}
.rail__dot{width:9px;height:9px;border-radius:50%}
.rail__pause.off .rail__dot{background:var(--coral)} .rail__pause.on .rail__dot{background:var(--emerald);animation:pls 2s ease-in-out infinite}
@keyframes pls{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.8)}}

/* CENTER */
.center{display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--b1)}
.center__hdr{display:flex;align-items:center;gap:14px;padding:14px 24px;border-bottom:1px solid var(--b1);min-height:56px}
.center__title{font:700 18px/1 var(--font);letter-spacing:-.03em}
.center__stats{display:flex;gap:22px;margin-left:auto}
.cs{display:flex;flex-direction:column;gap:1px}
.cs__l{font:500 9px var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.1em}
.cs__v{font:600 14px var(--mono);color:var(--t1);letter-spacing:-.02em}
.cs__v--g{color:var(--emerald)}

.center__toolbar{display:flex;align-items:center;gap:10px;padding:8px 24px;border-bottom:1px solid var(--b1)}
.tb{display:flex;align-items:center;gap:5px;padding:5px 12px;border:1px solid var(--b2);border-radius:var(--r-s);background:none;color:var(--t2);font:500 11px var(--mono);cursor:pointer;transition:.15s}
.tb:hover{border-color:var(--b3);color:var(--t1)} .tb--on{border-color:var(--blue);color:var(--blue);background:var(--blue-soft)}
.tb__dot{width:5px;height:5px;border-radius:50%;background:var(--blue)}
.sort-m{margin-left:auto;display:flex;align-items:center;gap:6px}
.sort-m label{font:400 9px var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.08em}
.sort-m select{background:none;border:1px solid var(--b2);border-radius:var(--r-s);color:var(--t2);font:500 11px var(--mono);padding:4px 8px;cursor:pointer;outline:none}
.sort-m select option{background:var(--bg2)}

.kbd-bar{display:flex;gap:12px;padding:7px 24px;border-bottom:1px solid var(--b1)}
.kh{display:flex;align-items:center;gap:4px;font:400 9px var(--mono);color:var(--t4)}
.kk{background:var(--s1);border:1px solid var(--b2);border-radius:3px;padding:1px 5px;font:500 9px var(--mono);color:var(--t3)}

/* HERO */
.hero-scroll{flex:1;overflow-y:auto;padding:24px}
.hero-scroll::-webkit-scrollbar{width:5px} .hero-scroll::-webkit-scrollbar-thumb{background:var(--s3);border-radius:3px}
.hero{display:flex;flex-direction:column;gap:16px;animation:hin .4s cubic-bezier(.16,1,.3,1)}
@keyframes hin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

.hero__top{display:flex;gap:24px;align-items:flex-start}
.hero__card-frame{width:150px;height:200px;border-radius:var(--r-l);background:var(--bg2);border:1px solid var(--b2);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;flex-shrink:0}
.hero__glow{position:absolute;inset:0;pointer-events:none}
.hero__emoji{font-size:60px;position:relative;z-index:1;filter:drop-shadow(0 4px 10px rgba(0,0,0,.3))}
.hero__flip-hint{position:absolute;bottom:10px;display:flex;align-items:center;gap:3px;font:400 9px var(--mono);color:var(--t4)}

.hero__summary{flex:1;display:flex;flex-direction:column;gap:14px;min-width:0}
.hero__id{display:flex;flex-direction:column;gap:4px}
.hero__name{font:700 24px/1.1 var(--font);letter-spacing:-.03em;color:var(--t1)}
.hero__set{font:400 12px var(--mono);color:var(--t3)}
.hero__tags{display:flex;gap:6px;margin-top:2px}
.htag{font:600 10px var(--mono);padding:3px 9px;border-radius:99px;border:1px solid;letter-spacing:.04em}
.htag--c-nm{color:var(--emerald);background:var(--emerald-soft);border-color:rgba(52,211,153,.25)}
.htag--c-lp{color:var(--amber);background:var(--amber-soft);border-color:rgba(251,191,36,.25)}
.htag--c-hp{color:var(--coral);background:var(--coral-soft);border-color:rgba(248,113,113,.25)}

.hero__numbers{display:flex;align-items:center;gap:20px}
.hero__profit-col{display:flex;flex-direction:column;gap:1px}
.hero__profit-val{font:700 32px/1 var(--mono);color:var(--emerald);letter-spacing:-.04em;text-shadow:0 0 30px rgba(52,211,153,.12)}
.hero__profit-roi{font:500 12px var(--mono);color:var(--emerald);opacity:.65}
.hero__trust-col{display:flex;flex-direction:column;align-items:center;gap:4px;margin-left:auto}
.hero__trust-word{font:500 10px var(--mono);text-transform:uppercase;letter-spacing:.06em}

.hero__buysell{display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m)}
.bs-cell{display:flex;flex-direction:column;gap:0}
.bs-cell__label{font:400 8px var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.1em}
.bs-cell__val{font:500 14px var(--mono);color:var(--t2)}
.bs-arrow{font:300 16px var(--mono);color:var(--t4)}
.hero__ago{font:400 10px var(--mono);color:var(--t4);margin-left:auto}

/* ACTIONS */
.hero__actions{display:flex;gap:10px}
.act{display:flex;align-items:center;justify-content:center;gap:7px;padding:12px 24px;border-radius:var(--r-m);font:600 13px var(--font);cursor:pointer;transition:.2s;text-decoration:none;border:none}
.act--skip{background:var(--s1);color:var(--t2);border:1px solid var(--b2);flex:0 0 auto}
.act--skip:hover{background:var(--coral-soft);border-color:rgba(248,113,113,.3);color:var(--coral)}
.act--snag{flex:1;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;box-shadow:0 4px 18px rgba(99,102,241,.22)}
.act--snag:hover{transform:translateY(-1px);box-shadow:0 6px 26px rgba(99,102,241,.32);filter:brightness(1.07)}

/* TRUST RING */
.tr{position:relative;display:flex;align-items:center;justify-content:center}
.tr__v{position:absolute;font:700 18px var(--mono)}

/* INTEL PANEL (tabs) */
.intel{border-top:1px solid var(--b1);margin-top:4px}
.intel__tabs{display:flex;border-bottom:1px solid var(--b1)}
.intel__tab{flex:1;padding:10px 0;border:none;background:none;color:var(--t3);font:500 12px var(--mono);cursor:pointer;position:relative;transition:.15s}
.intel__tab:hover{color:var(--t2)}
.intel__tab.is-on{color:var(--t1)}
.intel__tab.is-on::after{content:'';position:absolute;bottom:-1px;left:20%;right:20%;height:2px;background:var(--blue);border-radius:2px 2px 0 0}

.intel__body{padding:0}
.intel__section{display:flex;flex-direction:column;gap:0}
.anim-in{animation:fin .25s ease}
@keyframes fin{from{opacity:0}to{opacity:1}}

.intel__group{padding:16px 0;border-bottom:1px solid var(--b1)}
.intel__group:last-child{border-bottom:none}
.intel__heading{font:500 9px var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.12em;margin-bottom:12px}

/* PRICING */
.pricing{display:flex;flex-direction:column;gap:4px}
.pr{display:flex;justify-content:space-between;font:400 12px var(--mono);color:var(--t3);padding:3px 0}
.pr dd{color:var(--t2);font-weight:500}
.pr--heavy{border-top:1px solid var(--b1);padding-top:8px;margin-top:4px}
.pr--heavy dt,.pr--heavy dd{font-weight:600;color:var(--t1)}
.pr--profit{background:var(--emerald-soft);border-radius:var(--r-s);padding:8px 12px;margin-top:4px}
.pr--profit dt{font-weight:600;color:var(--t1)}

/* MATCH BREAKDOWN */
.mc-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.mc-header .intel__heading{margin-bottom:0}
.mb-row{display:flex;align-items:center;gap:7px;padding:3px 0}
.mb-row__label{width:54px;font:400 11px var(--mono);color:var(--t3);flex-shrink:0}
.mb-row__track{flex:1;height:3px;background:var(--s1);border-radius:2px;overflow:hidden}
.mb-row__fill{height:100%;border-radius:2px;transition:width .5s ease}
.mb-row__val{width:32px;font:500 10px var(--mono);text-align:right;flex-shrink:0}
.mb-row__chk{width:14px;font-size:11px;text-align:center;color:var(--t4);flex-shrink:0}
.mb-row__chk.is-yes{color:var(--emerald)}

/* REVIEW */
.review-btns{display:flex;gap:10px}
.rbtn{flex:1;padding:10px;border:1px solid;border-radius:var(--r-m);font:600 12px var(--mono);cursor:pointer;transition:.15s}
.rbtn--yes{background:var(--emerald-soft);border-color:rgba(52,211,153,.28);color:var(--emerald)}
.rbtn--yes:hover{background:rgba(52,211,153,.18);border-color:var(--emerald)}
.rbtn--no{background:var(--coral-soft);border-color:rgba(248,113,113,.28);color:var(--coral)}
.rbtn--no:hover{background:rgba(248,113,113,.18);border-color:var(--coral)}

/* COMPS */
.comps-bars{display:flex;flex-direction:column;gap:6px}
.cb-row{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:var(--r-s);border:1px solid transparent}
.cb-row--current{border-color:var(--amber);background:var(--amber-soft)}
.cb-row__grade{width:24px;font:600 11px var(--mono);color:var(--t2)}
.cb-row__track{flex:1;height:6px;background:var(--s1);border-radius:3px;overflow:hidden}
.cb-row__fill{height:100%;border-radius:3px;background:var(--t3);transition:width .6s ease}
.cb-row--current .cb-row__fill{background:var(--amber)}
.cb-row__price{font:500 12px var(--mono);color:var(--t2);width:72px;text-align:right}

.comps-table{display:flex;flex-direction:column;gap:0}
.ct-header{display:grid;grid-template-columns:32px 1fr 1fr 1fr;gap:8px;padding:6px 8px;font:500 9px var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.08em}
.ct-row{display:grid;grid-template-columns:32px 1fr 1fr 1fr;gap:8px;padding:6px 8px;font:400 12px var(--mono);color:var(--t3);border-radius:var(--r-s);border:1px solid transparent}
.ct-row--current{border-color:var(--amber);background:var(--amber-soft)}
.ct-row__grade{font-weight:600;color:var(--t2)}
.ct-row__market{font-weight:600;color:var(--t1)}
.ct-row__spread{color:var(--emerald)}

/* LIQUIDITY */
.liq-hero{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.liq-hero__pct{font:700 28px var(--mono);letter-spacing:-.03em}
.liq-hero__badge{font:600 10px var(--mono);padding:3px 10px;border-radius:99px;letter-spacing:.04em}

/* TRENDS */
.sparkline-wrap{margin-bottom:14px;padding:8px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m)}
.sparkline{display:block;width:100%}
.trend-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.trend-card{padding:10px 12px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m);display:flex;flex-direction:column;gap:2px}
.trend-card__period{font:500 10px var(--mono);color:var(--t4)}
.trend-card__change{font:600 16px var(--mono);letter-spacing:-.02em}
.trend-card__change.is-up{color:var(--emerald)} .trend-card__change.is-down{color:var(--coral)}
.trend-card__pct{font:400 11px var(--mono)}
.trend-card__pct.is-up{color:var(--emerald);opacity:.7} .trend-card__pct.is-down{color:var(--coral);opacity:.7}

.xpn{position:relative;border-radius:var(--r-l);background:var(--bg2);border:1px solid color-mix(in srgb, var(--xc1) 25%, transparent);overflow:hidden;padding:0}
.xpn__glow{position:absolute;inset:0;background:
  radial-gradient(ellipse 80% 60% at 10% 0%, color-mix(in srgb, var(--xc1) 12%, transparent) 0%, transparent 60%),
  radial-gradient(ellipse 50% 50% at 90% 100%, color-mix(in srgb, var(--xc2) 8%, transparent) 0%, transparent 50%);
  pointer-events:none}
.xpn__top{display:flex;align-items:center;gap:12px;padding:16px 16px 12px;position:relative}
.xpn__icon-ring{width:44px;height:44px;border-radius:var(--r-m);background:linear-gradient(135deg, color-mix(in srgb, var(--xc1) 18%, transparent), color-mix(in srgb, var(--xc2) 12%, transparent));border:1px solid color-mix(in srgb, var(--xc1) 30%, transparent);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.xpn__symbol{font-size:22px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))}
.xpn__identity{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}
.xpn__name{font:700 15px/1.1 var(--font);color:var(--t1);letter-spacing:-.02em}
.xpn__code{font:500 10px var(--mono);color:var(--xc1);letter-spacing:.06em;opacity:.8}
.xpn__year{font:700 24px var(--mono);color:var(--t4);letter-spacing:-.04em;line-height:1;opacity:.4;flex-shrink:0}
.xpn__stats{display:flex;align-items:center;padding:12px 16px;border-top:1px solid color-mix(in srgb, var(--xc1) 8%, transparent);position:relative;gap:0}
.xpn__stat{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px}
.xpn__stat-val{font:600 14px var(--mono);color:var(--t1);letter-spacing:-.02em}
.xpn__stat-label{font:400 9px var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.08em}
.xpn__stat-divider{width:1px;height:28px;background:color-mix(in srgb, var(--xc1) 12%, transparent);flex-shrink:0}
.xpn__link{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px 16px;background:linear-gradient(135deg, color-mix(in srgb, var(--xc1) 10%, transparent), color-mix(in srgb, var(--xc2) 8%, transparent));border:none;border-top:1px solid color-mix(in srgb, var(--xc1) 10%, transparent);color:var(--xc1);font:500 12px var(--mono);cursor:pointer;transition:all .15s;letter-spacing:.02em}
.xpn__link:hover{background:linear-gradient(135deg, color-mix(in srgb, var(--xc1) 16%, transparent), color-mix(in srgb, var(--xc2) 14%, transparent));color:var(--t1)}

/* QUEUE */
.queue{display:flex;flex-direction:column;background:var(--bg1);overflow:hidden}
.queue__hdr{padding:14px 16px;border-bottom:1px solid var(--b1);display:flex;align-items:center;justify-content:space-between}
.queue__title{font:600 13px var(--font);color:var(--t2)}
.queue__count{font:500 10px var(--mono);color:var(--t4)}
.queue__list{flex:1;overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:3px}
.queue__list::-webkit-scrollbar{width:4px} .queue__list::-webkit-scrollbar-thumb{background:var(--s3);border-radius:2px}

@keyframes qin{from{opacity:0;transform:translateX(6px)}to{opacity:1;transform:translateX(0)}}
.qc{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg2);border:1px solid transparent;border-radius:var(--r-m);cursor:pointer;transition:.15s;width:100%;text-align:left;font-family:inherit;color:inherit;position:relative;overflow:hidden;animation:qin .3s ease backwards}
.qc:hover{border-color:var(--b2);background:var(--bg3)}
.qc--on{border-color:var(--blue);background:rgba(96,165,250,.04)}
.qc__strip{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0 2px 2px 0}
.qc__emoji{font-size:20px;flex-shrink:0;padding-left:4px}
.qc__info{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.qc__name{font:600 12px var(--font);color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qc__set{font:400 9px var(--mono);color:var(--t4)}
.qc__nums{display:flex;flex-direction:column;align-items:flex-end;gap:1px;flex-shrink:0}
.qc__profit{font:600 12px var(--mono);color:var(--emerald)}
.qc__roi{font:400 9px var(--mono);color:var(--t4)}
.qc__ring{width:28px;height:28px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;background:var(--bg1);flex-shrink:0}
.qc__ring span{font:600 10px var(--mono)}

.queue__session{padding:14px 16px;border-top:1px solid var(--b1);display:flex;flex-direction:column;gap:6px}
.qs__title{font:500 9px var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.1em}
.qs__row{display:flex;justify-content:space-between;font:400 11px var(--font);color:var(--t3)}
.qs__row span:last-child{font-family:var(--mono);font-weight:500;color:var(--t2)}
.qs__total{display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid var(--b1)}
.qs__total span:first-child{font:500 9px var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.08em}
.qs__total span:last-child{font:600 16px var(--mono);color:var(--emerald)}

/* FILTER POPOVER */
.fpop{position:absolute;top:100%;left:0;margin-top:6px;background:var(--bg2);border:1px solid var(--b2);border-radius:var(--r-m);padding:12px;box-shadow:0 10px 36px rgba(0,0,0,.4);z-index:100;display:flex;gap:14px;animation:popin .12s ease}
@keyframes popin{from{opacity:0;transform:translateY(-3px)}}
.fpop__g{display:flex;flex-direction:column;gap:5px}
.fpop__l{font:500 9px var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.1em}
.fpop__c{display:flex;gap:3px}
.fc{padding:4px 9px;border:1px solid var(--b2);border-radius:99px;background:none;color:var(--t3);font:500 10px var(--mono);cursor:pointer;transition:.12s}
.fc:hover{border-color:var(--b3);color:var(--t2)}
.fc--on{background:var(--blue-soft);border-color:rgba(96,165,250,.3);color:var(--blue)}

/* EMPTY */
.hero-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--t4);text-align:center;padding:48px}
.hero-empty__icon{font-size:44px;opacity:.25}
.hero-empty__text{font:400 14px var(--font)}
.hero-empty__sub{font:400 11px var(--mono);color:var(--t4)}

/* ═══════════════════════════════════════════
   CATALOG STYLES
   ═══════════════════════════════════════════ */
.anim-in{animation:catFade .3s ease}
@keyframes catFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

/* Catalog Grid Page */
.catg{padding:28px;overflow-y:auto;height:100vh}
.catg::-webkit-scrollbar{width:5px}.catg::-webkit-scrollbar-thumb{background:var(--s3);border-radius:3px}
.catg__header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px}
.catg__title{font:700 24px/1 var(--font);letter-spacing:-.03em}
.catg__controls{display:flex;align-items:center;gap:8px}
.catg__search{display:flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--b2);border-radius:var(--r-s);color:var(--t3);transition:.15s}
.catg__search:focus-within{border-color:var(--blue);color:var(--t2)}
.catg__search input{background:none;border:none;outline:none;color:var(--t1);font:400 12px var(--mono);width:160px}
.catg__search input::placeholder{color:var(--t4)}
.catg__select{background:var(--s1);border:1px solid var(--b2);border-radius:var(--r-s);color:var(--t2);font:500 11px var(--mono);padding:6px 10px;cursor:pointer;outline:none}
.catg__select option{background:var(--bg2)}

.catg__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
@keyframes ecardIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}

/* Expansion Card */
.ecard{display:flex;flex-direction:column;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-l);cursor:pointer;transition:all .2s;text-align:center;font-family:inherit;color:inherit;overflow:hidden;position:relative;animation:ecardIn .35s ease backwards;padding:0}
.ecard:hover{border-color:color-mix(in srgb,var(--ec1) 40%,transparent);transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,.3)}
.ecard__glow{position:absolute;inset:0;background:radial-gradient(ellipse 100% 80% at 50% -20%,color-mix(in srgb,var(--ec1) 10%,transparent) 0%,transparent 70%);pointer-events:none;transition:opacity .3s;opacity:.5}
.ecard:hover .ecard__glow{opacity:1}
.ecard__symbol-wrap{padding:28px 0 12px;display:flex;align-items:center;justify-content:center;position:relative}
.ecard__symbol{font-size:36px;filter:drop-shadow(0 2px 8px rgba(0,0,0,.3))}
.ecard__name{font:700 15px/1.2 var(--font);color:var(--t1);letter-spacing:-.02em;padding:0 16px;position:relative}
.ecard__meta{display:flex;align-items:center;justify-content:center;gap:4px;font:500 10px var(--mono);color:var(--t3);padding:4px 16px;position:relative}
.ecard__dot{color:var(--t4)}
.ecard__code{color:color-mix(in srgb,var(--ec1) 70%,var(--t2))}
.ecard__date{font:400 10px var(--mono);color:var(--t4);padding:2px 16px 16px;position:relative}
.ecard__accent{position:absolute;bottom:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--ec1),var(--ec2))}

/* Expansion Detail */
.expd{padding:0;overflow-y:auto;height:100vh}
.expd::-webkit-scrollbar{width:5px}.expd::-webkit-scrollbar-thumb{background:var(--s3);border-radius:3px}
.expd__banner{display:flex;align-items:center;gap:16px;padding:20px 28px;border-bottom:1px solid var(--b1);position:relative;overflow:hidden}
.expd__banner-glow{position:absolute;inset:0;background:radial-gradient(ellipse 60% 100% at 0% 50%,color-mix(in srgb,var(--ec1) 8%,transparent) 0%,transparent 60%);pointer-events:none}
.expd__back{width:36px;height:36px;border-radius:var(--r-s);border:1px solid var(--b2);background:none;color:var(--t2);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s;position:relative;flex-shrink:0}
.expd__back:hover{border-color:var(--b3);color:var(--t1);background:var(--s1)}
.expd__banner-symbol{width:56px;height:56px;border-radius:var(--r-m);background:linear-gradient(135deg,color-mix(in srgb,var(--ec1) 15%,transparent),color-mix(in srgb,var(--ec2) 10%,transparent));border:1px solid color-mix(in srgb,var(--ec1) 25%,transparent);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;position:relative}
.expd__banner-info{position:relative;flex:1}
.expd__banner-name{font:700 22px/1.1 var(--font);letter-spacing:-.03em;color:var(--t1)}
.expd__banner-meta{display:flex;align-items:center;gap:6px;font:400 11px var(--mono);color:var(--t3);margin-top:3px}
.expd__toolbar{display:flex;gap:10px;padding:12px 28px;border-bottom:1px solid var(--b1)}
.sort-m__sel{background:var(--s1);border:1px solid var(--b2);border-radius:var(--r-s);color:var(--t2);font:500 11px var(--mono);padding:5px 10px;cursor:pointer;outline:none}
.expd__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;padding:20px 28px}

/* Card Grid Item */
.cgi{display:flex;flex-direction:column;align-items:center;gap:5px;padding:14px 10px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-m);cursor:pointer;transition:all .2s;text-align:center;font-family:inherit;color:inherit;animation:ecardIn .3s ease backwards}
.cgi:hover{border-color:var(--b3);transform:translateY(-2px);box-shadow:0 6px 24px rgba(0,0,0,.25)}
.cgi__img{width:68px;height:90px;background:var(--bg3);border-radius:var(--r-s);border:1px solid var(--b2);display:flex;align-items:center;justify-content:center}
.cgi__emoji{font-size:32px}
.cgi__name{font:600 12px var(--font);color:var(--t1);line-height:1.2}
.cgi__num{font:400 10px var(--mono);color:var(--t4)}
.cgi__price{font:600 12px var(--mono);color:var(--emerald)}

/* Card Detail */
.cd{padding:0;overflow-y:auto;height:100vh}
.cd::-webkit-scrollbar{width:5px}.cd::-webkit-scrollbar-thumb{background:var(--s3);border-radius:3px}
.cd__back{display:flex;align-items:center;gap:6px;padding:14px 28px;border:none;border-bottom:1px solid var(--b1);background:none;color:var(--blue);font:500 13px var(--font);cursor:pointer;width:100%;text-align:left;transition:.15s}
.cd__back:hover{color:var(--t1);background:rgba(96,165,250,.03)}
.cd__layout{display:grid;grid-template-columns:320px 1fr;gap:32px;padding:28px}
.cd__img-col{display:flex;flex-direction:column;gap:8px}
.cd__img-frame{width:100%;aspect-ratio:5/7;border-radius:var(--r-l);background:var(--bg2);border:1px solid var(--b2);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.cd__img-glow{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,rgba(96,165,250,.06) 0%,transparent 70%);pointer-events:none}
.cd__emoji{font-size:88px;position:relative;z-index:1;filter:drop-shadow(0 6px 16px rgba(0,0,0,.3))}
.cd__illustrator{font:italic 400 11px var(--mono);color:var(--t4)}

.cd__info-col{display:flex;flex-direction:column;gap:16px}
.cd__name{font:700 30px/1.1 var(--font);letter-spacing:-.03em;color:var(--t1)}
.cd__tags{display:flex;gap:6px;flex-wrap:wrap}
.cd__tag{font:500 11px var(--mono);padding:3px 10px;border-radius:99px;border:1px solid var(--b2);color:var(--t2);letter-spacing:.02em}

.cd__expansion-link{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--bg2);border:1px solid color-mix(in srgb,var(--ec1) 15%,transparent);border-radius:var(--r-m);position:relative;overflow:hidden}
.cd__expansion-link::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 50% 100% at 0% 50%,color-mix(in srgb,var(--ec1) 5%,transparent),transparent);pointer-events:none}
.cd__exp-symbol{font-size:20px;flex-shrink:0;position:relative}
.cd__exp-info{position:relative;display:flex;flex-direction:column;gap:1px}
.cd__exp-name{font:600 13px var(--font);color:var(--t1)}
.cd__exp-meta{font:400 10px var(--mono);color:var(--t3)}

.cd__variants{display:flex;gap:6px}
.cd__variant-btn{padding:6px 14px;border:1px solid var(--b2);border-radius:var(--r-s);background:none;color:var(--t3);font:500 12px var(--mono);cursor:pointer;transition:.15s}
.cd__variant-btn:hover{border-color:var(--b3);color:var(--t2)}
.cd__variant-btn--on{border-color:var(--blue);color:var(--blue);background:var(--blue-soft)}

.cd__section{display:flex;flex-direction:column;gap:8px}
.cd__section-title{font:600 14px var(--font);color:var(--t1);letter-spacing:-.01em}

.cd__price-table{display:flex;flex-direction:column}
.cd__pt-header{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:6px 12px;font:500 9px var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.08em}
.cd__pt-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:8px 12px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-s);font:500 13px var(--mono);color:var(--t2)}

.cd__trends{display:flex;gap:8px}
.cd__trend-cell{padding:8px 16px;background:var(--bg2);border:1px solid var(--b1);border-radius:var(--r-s);display:flex;flex-direction:column;align-items:center;gap:2px;flex:1}
.cd__trend-period{font:500 10px var(--mono);color:var(--t4)}
.cd__trend-val{font:600 13px var(--mono);color:var(--t3)}
.cd__trend-val.is-up{color:var(--emerald)}
      `}</style>

      <div className={`shell ${isDashboard ? "" : "shell--wide"}`}>
        <Rail active={nav} onNav={setNav} isPaused={paused} onPause={() => setPaused(p => !p)} />

        {nav === "catalog" && <CatalogPage />}

        {nav !== "dashboard" && nav !== "catalog" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 44, opacity: 0.25 }}>{nav === "alerts" ? "🔔" : "⚙️"}</span>
            <p style={{ font: "400 14px var(--font)", color: "var(--t4)" }}>{nav[0].toUpperCase() + nav.slice(1)} — coming soon</p>
          </div>
        )}

        {isDashboard && <>
        <div className="center">
          <header className="center__hdr">
            <h1 className="center__title">Deals</h1>
            <div className="center__stats">
              <div className="cs"><span className="cs__l">Queue</span><span className="cs__v">{visible.length}</span></div>
              <div className="cs"><span className="cs__l">Snagged</span><span className="cs__v cs__v--g">{snagged.size}</span></div>
              <div className="cs"><span className="cs__l">Potential</span><span className="cs__v cs__v--g">£{potential.toFixed(0)}</span></div>
            </div>
          </header>

          <div className="center__toolbar">
            <div style={{ position: "relative" }}>
              <button className={`tb ${showF ? "tb--on" : ""}`} onClick={() => setShowF(f => !f)}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                Filter{(filters.tier !== "ALL" || filters.cond !== "ALL") && <span className="tb__dot" />}
              </button>
              <Filters show={showF} filters={filters} onChange={(k,v) => setFilters(f => ({...f,[k]:v}))} />
            </div>
            <div className="sort-m">
              <label htmlFor="ss">Sort</label>
              <select id="ss" value={sort} onChange={e => setSort(e.target.value)}>
                <option value="profit">Profit</option><option value="roi">ROI</option><option value="match">Match</option>
              </select>
            </div>
          </div>

          <div className="kbd-bar" aria-hidden="true">
            <span className="kh"><span className="kk">S</span> Snag</span>
            <span className="kh"><span className="kk">X</span> Skip</span>
            <span className="kh"><span className="kk">↑↓</span> Nav</span>
          </div>

          <div className="hero-scroll">
            {cur ? (
              <HeroDeal deal={cur} onSnag={doSnag} onSkip={doSkip} />
            ) : (
              <div className="hero-empty">
                <span className="hero-empty__icon">✓</span>
                <p className="hero-empty__text">Queue clear</p>
                <p className="hero-empty__sub">{snagged.size} snagged · {skipped.size} skipped</p>
              </div>
            )}
          </div>
        </div>

        <aside className="queue">
          <div className="queue__hdr"><span className="queue__title">Up Next</span><span className="queue__count">{visible.length}</span></div>
          <div className="queue__list" role="list">
            {visible.map((d, i) => (
              <QueueCard key={d.id} deal={d} index={i} isCurrent={cur?.id === d.id}
                onClick={() => { const idx = visible.findIndex(x => x.id === d.id); if (idx >= 0) setCurIdx(idx); }} />
            ))}
          </div>
          <div className="queue__session">
            <span className="qs__title">Session</span>
            <div className="qs__row"><span>Scanned</span><span>4</span></div>
            <div className="qs__row"><span>Deals found</span><span>19</span></div>
            <div className="qs__row"><span>Snagged</span><span>{snagged.size}</span></div>
            <div className="qs__row"><span>Skipped</span><span>{skipped.size}</span></div>
            <div className="qs__total"><span>Snagged value</span><span>£{snagTotal.toFixed(2)}</span></div>
          </div>
        </aside>
        </>}
      </div>
    </>
  );
}
