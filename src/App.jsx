import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════
   POKÉSNIPE CRYPTO v2 — GLASS REFINEMENT
   Aligned rows. Committed gradients. No BS.
   ═══════════════════════════════════════════ */

const TIERS = {
  grail: { label: "GRAIL", short: "G", gradient: "linear-gradient(135deg, #ff6b35, #ff3b6f)", color: "#ff5c5c", bg: "rgba(255,92,92,0.12)", tip: ">40% profit · High confidence · High liquidity", desc: "Chase-tier. Heavy hitters." },
  hit: { label: "HIT", short: "H", gradient: "linear-gradient(135deg, #ffd60a, #ffaa00)", color: "#ffd60a", bg: "rgba(255,214,10,0.1)", tip: "25–40% profit · High confidence", desc: "Solid bangers." },
  flip: { label: "FLIP", short: "F", gradient: "linear-gradient(135deg, #6b7fa0, #4a5a78)", color: "#8896b0", bg: "rgba(136,150,176,0.08)", tip: "15–25% profit · Med+ confidence", desc: "Worth a scoop." },
  sleeper: { label: "SLEEP", short: "S", gradient: "linear-gradient(135deg, #3a4060, #2a3050)", color: "#4a5070", bg: "rgba(74,80,112,0.06)", tip: "5–15% profit · Any confidence", desc: "Binder flips." }
};
const LIQ = { high: { color: "#34d399", label: "HIGH", short: "HI" }, med: { color: "#fbbf24", label: "MED", short: "MD" }, low: { color: "#fb923c", label: "LOW", short: "LO" }, illiquid: { color: "#ef4444", label: "ILLIQ", short: "—" } };
const COND_C = { NM: "#34d399", LP: "#fbbf24", MP: "#fb923c", HP: "#ef4444" };
const CONF_C = v => v >= 0.85 ? "#34d399" : v >= 0.65 ? "#fbbf24" : "#ef4444";
const TYPE_C = { fire: "#ff6b6b", water: "#60a5fa", electric: "#fbbf24", psychic: "#c084fc", grass: "#4ade80", dark: "#8b7ec8", dragon: "#f59e0b", normal: "#94a3b8" };
const fG = n => `£${Math.abs(n).toFixed(2)}`;
const calcBPFee = (price) => {
  const flat = 0.10;
  const b1 = Math.min(price, 20) * 0.07;
  const b2 = Math.max(0, Math.min(price, 300) - 20) * 0.04;
  const b3 = Math.max(0, Math.min(price, 4000) - 300) * 0.02;
  return { flat, b1, b2, b3, total: flat + b1 + b2 + b3 };
};
const calc = d => { const c = d.ep + d.sh, bp = calcBPFee(c), t = c + bp.total, m = d.mu * d.fx, p = m - t; return { cost: t, market: m, profit: p, pct: (p / t) * 100, fees: bp.total, bp }; };
const ts = m => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;

const DEALS = [
  { id:1,name:"Zard ex",num:"006/197",set:"Obsidian Flames",sc:"sv3",ep:12.5,sh:1.99,mu:57,fx:.789,conf:.92,cond:"NM",liq:"high",liqS:.82,ta:3,tr:8.2,tier:"grail",type:"fire",cb:{Name:.95,Number:1,Denom:.92,Expan:.88,Variant:.85,Extract:.90},lb:{Trend:.75,Prices:.90,Spread:.80,Supply:.90,Sold:.67,Velocity:null},cp:{NM:45,LP:38.5,MP:28,HP:18},rev:null },
  { id:2,name:"Pika VMAX",num:"044/185",set:"Vivid Voltage",sc:"swsh4",ep:8.99,sh:1.5,mu:35.5,fx:.789,conf:.88,cond:"NM",liq:"high",liqS:.79,ta:7,tr:2.1,tier:"hit",type:"electric",cb:{Name:.92,Number:1,Denom:.88,Expan:.85,Variant:.82,Extract:.88},lb:{Trend:.80,Prices:.85,Spread:.75,Supply:.80,Sold:.72,Velocity:null},cp:{NM:28,LP:22.5,MP:16,HP:10},rev:null },
  { id:3,name:"Mew2 ex",num:"058/165",set:"SV 151",sc:"sv3pt5",ep:6.5,sh:1.25,mu:22.8,fx:.789,conf:.95,cond:"LP",liq:"med",liqS:.58,ta:12,tr:-3.4,tier:"hit",type:"psychic",cb:{Name:.98,Number:1,Denom:.95,Expan:.92,Variant:.90,Extract:.95},lb:{Trend:.60,Prices:.70,Spread:.55,Supply:.50,Sold:.45,Velocity:null},cp:{NM:22,LP:18,MP:12.5,HP:7},rev:null },
  { id:4,name:"Moonbreon VMAX",num:"095/203",set:"Evolving Skies",sc:"swsh7",ep:45,sh:3.99,mu:145,fx:.789,conf:.78,cond:"NM",liq:"high",liqS:.91,ta:18,tr:12.5,tier:"grail",type:"dark",cb:{Name:.85,Number:.90,Denom:.78,Expan:.72,Variant:.65,Extract:.80},lb:{Trend:.95,Prices:.95,Spread:.85,Supply:.92,Sold:.88,Velocity:.85},cp:{NM:114.4,LP:95,MP:70,HP:45},rev:null },
  { id:5,name:"Mew ex",num:"151/165",set:"SV 151",sc:"sv3pt5",ep:15,sh:2,mu:42,fx:.789,conf:.91,cond:"NM",liq:"high",liqS:.76,ta:22,tr:1.8,tier:"hit",type:"psychic",cb:{Name:.94,Number:1,Denom:.90,Expan:.88,Variant:.86,Extract:.92},lb:{Trend:.70,Prices:.80,Spread:.78,Supply:.75,Sold:.70,Velocity:null},cp:{NM:33.14,LP:27,MP:19,HP:12},rev:"correct" },
  { id:6,name:"Gar ex",num:"104/197",set:"Obsidian Flames",sc:"sv3",ep:4.5,sh:1.2,mu:14.5,fx:.789,conf:.85,cond:"NM",liq:"med",liqS:.52,ta:35,tr:-1.2,tier:"flip",type:"psychic",cb:{Name:.90,Number:.95,Denom:.85,Expan:.82,Variant:.78,Extract:.85},lb:{Trend:.55,Prices:.60,Spread:.50,Supply:.45,Sold:.40,Velocity:null},cp:{NM:11.44,LP:9,MP:6.5,HP:4},rev:null },
  { id:7,name:"Rayray VMAX",num:"218/203",set:"Evolving Skies",sc:"swsh7",ep:32,sh:2.5,mu:78,fx:.789,conf:.82,cond:"LP",liq:"high",liqS:.84,ta:40,tr:5.6,tier:"hit",type:"dragon",cb:{Name:.88,Number:.92,Denom:.80,Expan:.78,Variant:.75,Extract:.82},lb:{Trend:.85,Prices:.88,Spread:.82,Supply:.85,Sold:.78,Velocity:null},cp:{NM:61.54,LP:50,MP:35,HP:22},rev:null },
  { id:8,name:"Giratina V",num:"130/196",set:"Lost Origin",sc:"swsh11",ep:3.2,sh:.99,mu:9.8,fx:.789,conf:.93,cond:"NM",liq:"med",liqS:.55,ta:48,tr:.3,tier:"flip",type:"dragon",cb:{Name:.96,Number:1,Denom:.93,Expan:.90,Variant:.88,Extract:.93},lb:{Trend:.50,Prices:.65,Spread:.55,Supply:.50,Sold:.45,Velocity:null},cp:{NM:7.73,LP:6,MP:4.2,HP:2.5},rev:null },
  { id:9,name:"Eevee",num:"133/165",set:"SV 151",sc:"sv3pt5",ep:2,sh:.85,mu:6.2,fx:.789,conf:.97,cond:"NM",liq:"low",liqS:.32,ta:55,tr:-.5,tier:"flip",type:"normal",cb:{Name:.99,Number:1,Denom:.97,Expan:.95,Variant:.94,Extract:.97},lb:{Trend:.30,Prices:.40,Spread:.35,Supply:.25,Sold:.20,Velocity:null},cp:{NM:4.89,LP:3.8,MP:2.6,HP:1.5},rev:null },
  { id:10,name:"Lugia V",num:"186/195",set:"Silver Tempest",sc:"swsh12",ep:5.5,sh:1.3,mu:12.4,fx:.789,conf:.72,cond:"MP",liq:"low",liqS:.28,ta:67,tr:-4.8,tier:"sleeper",type:"water",cb:{Name:.80,Number:.85,Denom:.72,Expan:.68,Variant:.60,Extract:.70},lb:{Trend:.25,Prices:.35,Spread:.30,Supply:.20,Sold:.18,Velocity:null},cp:{NM:9.78,LP:7.8,MP:5.5,HP:3.2},rev:null },
  { id:11,name:"Arceus VSTAR",num:"123/172",set:"Brilliant Stars",sc:"swsh9",ep:7,sh:1.5,mu:19.5,fx:.789,conf:.89,cond:"NM",liq:"med",liqS:.61,ta:72,tr:3.2,tier:"flip",type:"normal",cb:{Name:.92,Number:.98,Denom:.88,Expan:.85,Variant:.82,Extract:.89},lb:{Trend:.65,Prices:.70,Spread:.58,Supply:.55,Sold:.50,Velocity:null},cp:{NM:15.39,LP:12,MP:8.5,HP:5},rev:"wrong" },
  { id:12,name:"Palkia VSTAR",num:"040/189",set:"Astral Radiance",sc:"swsh10",ep:2.8,sh:1,mu:5.9,fx:.789,conf:.94,cond:"NM",liq:"illiquid",liqS:.15,ta:85,tr:.8,tier:"sleeper",type:"water",cb:{Name:.97,Number:1,Denom:.94,Expan:.92,Variant:.90,Extract:.94},lb:{Trend:.10,Prices:.20,Spread:.15,Supply:.10,Sold:.08,Velocity:null},cp:{NM:4.65,LP:3.6,MP:2.5,HP:1.4},rev:null },
];

const SIM_N = ["Alakazam ex","Dragonite V","Blast ex","Venu ex","TTar V","Gardevoir ex","Snorlax","Esp VMAX"];
const SIM_S = ["Obsidian Flames","Paldea Evolved","Temporal Forces","Shrouded Fable"];
const SIM_T = Object.keys(TYPE_C);

/* ─── STYLES ─── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg0:#070a12;--bg1:#0c1019;--bg2:rgba(14,19,32,0.75);--bg3:rgba(20,26,42,0.65);
  --glass:rgba(255,255,255,0.035);--glass2:rgba(255,255,255,0.055);--glass3:rgba(255,255,255,0.08);
  --brd:rgba(255,255,255,0.055);--brd2:rgba(255,255,255,0.09);--brd3:rgba(255,255,255,0.14);
  --tMax:#f4f6f9;--tPri:#dce1eb;--tSec:#8290a8;--tMut:#4d5a72;--tGho:#2d3650;
  --green:#34d399;--greenB:#6ee7b7;--greenGlow:rgba(52,211,153,0.15);
  --red:#f87171;--amber:#fbbf24;--blue:#60a5fa;--purple:#c084fc;
  --fd:'Plus Jakarta Sans',system-ui,sans-serif;--fm:'DM Mono',monospace;
  --r-sm:8px;--r-md:12px;--r-lg:16px;--r-xl:20px;--r-pill:999px;
  --ease:cubic-bezier(0.16,1,0.3,1);--snap:cubic-bezier(0.3,0,0,1);
}
body{font-family:var(--fd);background:var(--bg0);color:var(--tPri);overflow:hidden}
button{cursor:pointer;font-family:inherit;border:none;background:none;color:inherit}
input{font-family:inherit;border:none;outline:none}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
input[type=number]{-moz-appearance:textfield}
:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
::selection{background:var(--blue);color:white}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:5px}
`;

const GRAD_LINE = "linear-gradient(90deg, #34d399 0%, #60a5fa 40%, #c084fc 70%, #ff6b6b 100%)";

/* ─── HELPERS ─── */
const glass = (x = {}) => ({ background: "var(--glass)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid var(--brd)", ...x });

const GradBorder = ({ children, gradient = "linear-gradient(135deg, #34d399, #60a5fa, #c084fc)", radius = "var(--r-md)", pad = 1, style = {} }) => (
  <div style={{ background: gradient, borderRadius: radius, padding: pad, ...style }}>
    <div style={{ background: "var(--bg1)", borderRadius: `calc(${radius} - ${pad}px)`, overflow: "hidden" }}>{children}</div>
  </div>
);

/* PokéBall — minimal wireframe version */
const PokeBall = ({ size = 26 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.15)", position: "relative", overflow: "hidden", flexShrink: 0 }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "50%", background: "rgba(255,92,92,0.12)" }} />
    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: "1px", background: "rgba(255,255,255,0.15)", transform: "translateY(-0.5px)" }} />
    <div style={{ position: "absolute", top: "50%", left: "50%", width: size * 0.3, height: size * 0.3, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.2)", background: "var(--bg0)", transform: "translate(-50%,-50%)" }} />
  </div>
);

/* ─── PILLS ─── */
const LiqPill = ({ liq, compact }) => {
  const l = LIQ[liq]; if (!l) return null;
  return <span style={{ display: "inline-flex", alignItems: "center", height: compact ? 16 : 18, padding: compact ? "0 5px" : "0 7px", fontFamily: "var(--fm)", fontSize: compact ? 8 : 9, fontWeight: 500, color: l.color, background: `${l.color}10`, borderRadius: "var(--r-pill)", letterSpacing: 0.5, opacity: liq === "illiquid" ? 0.45 : 1 }}>{compact ? l.short : l.label}</span>;
};
const CondPill = ({ cond, compact }) => {
  const c = COND_C[cond] || "#94a3b8";
  return <span style={{ display: "inline-flex", alignItems: "center", height: compact ? 16 : 18, padding: compact ? "0 5px" : "0 7px", fontFamily: "var(--fm)", fontSize: compact ? 8 : 9, fontWeight: 500, color: c, background: `${c}0c`, borderRadius: "var(--r-pill)", letterSpacing: 0.5 }}>{cond}</span>;
};
const TierBadge = ({ tier, size = "sm" }) => {
  const t = TIERS[tier];
  const s = size === "sm" ? { height: 16, fontSize: 8, padding: "0 5px", letterSpacing: 1 } : { height: 20, fontSize: 9, padding: "0 8px", letterSpacing: 1.5 };
  return <span style={{ display: "inline-flex", alignItems: "center", fontFamily: "var(--fm)", fontWeight: 700, color: "#fff", background: t.gradient, borderRadius: "var(--r-pill)", textTransform: "uppercase", ...s }}>{size === "sm" ? t.short : t.label}</span>;
};

/* ─── BARS ─── */
const Bar = ({ value, height = 5, color, glow }) => (
  <div style={{ height, background: "rgba(255,255,255,0.04)", borderRadius: height, overflow: "hidden", width: "100%" }}>
    <div style={{ width: `${(value ?? 0) * 100}%`, height: "100%", background: color || CONF_C(value ?? 0), borderRadius: height, transition: "width 0.4s var(--ease)", boxShadow: glow ? `0 0 10px ${color || CONF_C(value)}30` : "none" }} />
  </div>
);
const BarRow = ({ label, value, showFetch, onFetch }) => (
  <div style={{ display: "grid", gridTemplateColumns: "66px 1fr 38px", alignItems: "center", gap: 10, padding: "4px 0" }}>
    <span style={{ fontSize: 11, color: "var(--tSec)", fontWeight: 500 }}>{label}</span>
    {showFetch ? (
      <button onClick={onFetch} style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--blue)", padding: "3px 10px", borderRadius: "var(--r-pill)", border: "1px solid rgba(96,165,250,0.25)", background: "rgba(96,165,250,0.05)", justifySelf: "start", fontWeight: 500, transition: "all 0.2s" }}>Fetch → 3cr</button>
    ) : <Bar value={value} glow={value > 0.8} />}
    <span style={{ fontFamily: "var(--fm)", fontSize: 11, fontWeight: 500, textAlign: "right", color: value != null ? CONF_C(value) : "var(--tGho)" }}>{value != null ? value.toFixed(2) : "—"}</span>
  </div>
);

/* ═══ DEAL ROW — REDESIGNED ═══
   Layout: [image w/ overlaid tier badge] [info block] [profit] [meta]
   All images align at the same x-position. Tier badge is inside the image. */
const DealRow = ({ deal, selected, onSelect, idx }) => {
  const [hov, setHov] = useState(false);
  const p = calc(deal);
  const tc = deal.tr > 0.5 ? "up" : deal.tr < -0.5 ? "dn" : "fl";

  return (
    <div onClick={() => onSelect(deal)} role="listitem" tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(deal); } }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14, padding: "10px 20px 10px 16px",
        cursor: "pointer", position: "relative", minHeight: 80,
        background: selected ? "var(--glass2)" : hov ? "var(--glass)" : "transparent",
        borderBottom: "1px solid var(--brd)",
        transition: "all 250ms var(--snap)",
        transform: hov && !selected ? "translateY(-1px)" : "none",
        boxShadow: hov && !selected ? "0 6px 24px rgba(0,0,0,0.25), inset 0 0 0 1px var(--brd2)" : selected ? "inset 0 0 0 1px var(--brd2)" : "none",
        animation: "fadeSlide 0.3s var(--ease) both",
        animationDelay: `${Math.min(idx * 30, 300)}ms`,
        opacity: deal.tier === "sleeper" ? 0.35 : 1,
      }}>
      {/* Selected indicator — thin left line, no layout shift */}
      <div style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 3, borderRadius: "0 3px 3px 0", background: selected ? "var(--blue)" : "transparent", transition: "background 200ms", boxShadow: selected ? "0 0 8px rgba(96,165,250,0.3)" : "none" }} />

      {/* Card image + overlaid tier badge — fixed 48×67 always at same position */}
      <div className="dr-img" style={{ width: 48, height: 67, flexShrink: 0, position: "relative" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: "var(--r-sm)", overflow: "hidden", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          {/* Type color top edge */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2.5, background: TYPE_C[deal.type], opacity: 0.7, borderRadius: "var(--r-sm) var(--r-sm) 0 0" }} />
          {/* Placeholder text */}
          <span style={{ fontFamily: "var(--fm)", fontSize: 7, color: "var(--tGho)", letterSpacing: 1.5, marginTop: 4 }}>{deal.name.substring(0, 4).toUpperCase()}</span>
        </div>
        {/* Tier badge overlaid at bottom-left */}
        <div style={{ position: "absolute", bottom: -3, left: -3, zIndex: 2 }}>
          <TierBadge tier={deal.tier} />
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--tMax)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>
          {deal.name} <span style={{ color: "var(--tMut)", fontWeight: 400, fontSize: 12 }}>#{deal.num}</span>
        </div>
        <div className="dr-sub" style={{ fontSize: 12, color: "var(--tMut)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {deal.set} <span style={{ opacity: 0.5 }}>·</span> <span className="dr-sc">{deal.sc}</span>
        </div>
        <div className="dr-prices" style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--tMut)", display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
          <span>{fG(deal.ep)}</span>
          <span style={{ color: "var(--tGho)", fontSize: 10 }}>→</span>
          <span style={{ color: "var(--tSec)" }}>{fG(p.market)}</span>
        </div>
      </div>

      {/* PROFIT — dominant right column */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0, minWidth: 96 }}>
        <div style={{
          fontWeight: 800, fontSize: 22, lineHeight: 1, letterSpacing: -0.5, color: "var(--greenB)",
          textShadow: deal.tier === "grail" ? "0 0 28px rgba(52,211,153,0.35)" : "0 0 12px rgba(52,211,153,0.1)"
        }}>+{fG(p.profit)}</div>
        <div style={{ fontFamily: "var(--fm)", fontSize: 11, fontWeight: 600, color: "var(--green)" }}>+{p.pct.toFixed(0)}%</div>
        <div style={{ width: 64 }}><Bar value={deal.conf} height={3} /></div>
      </div>

      {/* Meta — desktop: stacked pills+time. Mobile: inline compact */}
      <div className="dr-meta-d" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0, minWidth: 56, paddingLeft: 10 }}>
        <div style={{ display: "flex", gap: 3 }}><CondPill cond={deal.cond} /><LiqPill liq={deal.liq} /></div>
        <span style={{ fontFamily: "var(--fm)", fontSize: 10, color: deal.ta > 60 ? "var(--red)" : "var(--tMut)", fontWeight: deal.ta > 60 ? 600 : 400 }}>{ts(deal.ta)}</span>
        <span style={{ fontFamily: "var(--fm)", fontSize: 10, color: tc === "up" ? "var(--green)" : tc === "dn" ? "var(--red)" : "var(--tGho)" }}>
          {tc === "up" ? "↑" : tc === "dn" ? "↓" : "→"}{Math.abs(deal.tr).toFixed(1)}%
        </span>
      </div>
      {/* Mobile meta — compact single line, visible only on small screens */}
      <div className="dr-meta-m" style={{ display: "none", flexShrink: 0, alignItems: "center", gap: 4 }}>
        <CondPill cond={deal.cond} compact /><LiqPill liq={deal.liq} compact />
        <span style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tMut)" }}>{ts(deal.ta)}</span>
      </div>
    </div>
  );
};

/* ═══ DETAIL PANEL ═══ */
const Detail = ({ deal, onClose, onReview }) => {
  const [showReasons, setShowReasons] = useState(false);
  const [velFetched, setVelFetched] = useState(deal?.lb?.Velocity != null);
  const [velVal, setVelVal] = useState(deal?.lb?.Velocity);
  useEffect(() => { setShowReasons(false); setVelFetched(deal?.lb?.Velocity != null); setVelVal(deal?.lb?.Velocity); }, [deal?.id]);

  if (!deal) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20, padding: 40, opacity: 0.3 }}>
      <PokeBall size={40} />
      <div style={{ fontSize: 12, color: "var(--tMut)", textAlign: "center", letterSpacing: 1.5, lineHeight: 2, fontFamily: "var(--fm)" }}>SELECT A DEAL<br />TO INSPECT</div>
    </div>
  );

  const p = calc(deal);
  const sec = { padding: "16px 22px", borderBottom: "1px solid var(--brd)" };
  const secT = { fontFamily: "var(--fm)", fontWeight: 500, fontSize: 9, textTransform: "uppercase", letterSpacing: 2.5, color: "var(--tMut)", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--brd)" };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "12px 22px", borderBottom: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TierBadge tier={deal.tier} size="lg" />
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--tSec)" }}>{deal.name}</span>
        </div>
        <button onClick={onClose} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", fontSize: 14, color: "var(--tMut)", transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brd3)"; e.currentTarget.style.color = "var(--tPri)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--brd)"; e.currentTarget.style.color = "var(--tMut)"; }}>✕</button>
      </div>
      {/* Images */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "14px 22px" }}>
        {["SCRYDEX", "EBAY"].map(l => (
          <div key={l} style={{ aspectRatio: "5/7", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <span style={{ fontFamily: "var(--fm)", fontSize: 8, color: "var(--tGho)", letterSpacing: 2 }}>{l}</span>
          </div>
        ))}
      </div>
      {/* Card info + expansion logo */}
      <div style={sec}>
        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.3, marginBottom: 6, color: "var(--tMax)" }}>{deal.name} #{deal.num}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Expansion logo placeholder — loaded from Scrydex CDN in production */}
          <div style={{ width: 22, height: 22, borderRadius: "var(--r-sm)", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--fm)", fontSize: 7, color: "var(--tGho)" }}>◆</span>
          </div>
          <span style={{ fontSize: 13, color: "var(--tSec)" }}>{deal.set} <span style={{ color: "var(--tMut)" }}>({deal.sc})</span></span>
          <span style={{ opacity: 0.2 }}>·</span>
          <CondPill cond={deal.cond} />
          <LiqPill liq={deal.liq} />
        </div>
      </div>
      {/* PROFIT HERO */}
      <div style={{ margin: "8px 14px" }}>
        <GradBorder gradient="linear-gradient(135deg, rgba(52,211,153,0.5), rgba(96,165,250,0.25), rgba(192,132,252,0.15))" radius="var(--r-lg)" pad={1}>
          <div style={{ padding: "22px 24px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 40%, var(--greenGlow) 0%, transparent 65%)", pointerEvents: "none" }} />
            <div style={{ fontWeight: 800, fontSize: 42, color: "var(--greenB)", letterSpacing: -2, lineHeight: 1, position: "relative", textShadow: "0 0 40px rgba(52,211,153,0.25)" }}>+{fG(p.profit)}</div>
            <div style={{ fontFamily: "var(--fm)", fontSize: 15, fontWeight: 600, color: "var(--green)", marginTop: 6, position: "relative" }}>+{p.pct.toFixed(0)}% · {deal.tier === "grail" ? "GRAIL territory" : deal.tier === "hit" ? "Solid hit" : deal.tier === "flip" ? "Quick flip" : "Sleeper"}</div>
            <div style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tMut)", letterSpacing: 2.5, marginTop: 10, position: "relative", textTransform: "uppercase" }}>No BS profit · Fees included</div>
          </div>
        </GradBorder>
      </div>
      {/* CTA */}
      <div style={sec}>
        <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 46, background: "linear-gradient(135deg, #34d399, #2dd4bf)", color: "var(--bg0)", fontWeight: 800, fontSize: 13, letterSpacing: 2.5, borderRadius: "var(--r-md)", textTransform: "uppercase", boxShadow: "0 4px 20px rgba(52,211,153,0.2)", transition: "all 0.2s var(--ease)" }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = "0 6px 28px rgba(52,211,153,0.35)"}
          onMouseLeave={e => e.currentTarget.style.boxShadow = "0 4px 20px rgba(52,211,153,0.2)"}>SNAG ON EBAY →</button>
      </div>
      {/* Pricing — Buyer Protection tiered breakdown */}
      <div style={sec}>
        <div style={secT}>NO BS PRICING</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
          {[
            ["eBay", fG(deal.ep), ""],
            ["Shipping", fG(deal.sh), ""],
            ["Buyer Prot.", fG(p.bp.total), ""],
            ["  ├ Flat fee", `£${p.bp.flat.toFixed(2)}`, ""],
            ...(p.bp.b1 > 0 ? [["  ├ 7% band", `£${p.bp.b1.toFixed(2)}`, ""]] : []),
            ...(p.bp.b2 > 0 ? [["  ├ 4% band", `£${p.bp.b2.toFixed(2)}`, ""]] : []),
            ...(p.bp.b3 > 0 ? [["  └ 2% band", `£${p.bp.b3.toFixed(2)}`, ""]] : []),
            ["Market (USD)", "", `$${deal.mu.toFixed(2)}`],
            ["FX rate", "", `×${deal.fx}`],
          ].map(([l, a, b], i) => {
            const isSub = l.startsWith("  ");
            return <tr key={i}><td style={{ padding: "5px 0", paddingLeft: isSub ? 10 : 0, fontFamily: "var(--fm)", fontSize: isSub ? 10 : 12, borderBottom: "1px solid var(--brd)", color: isSub ? "var(--tGho)" : "var(--tMut)", fontWeight: 500 }}>{l.trim()}</td><td style={{ padding: "5px 0", fontFamily: "var(--fm)", fontSize: isSub ? 10 : 12, borderBottom: "1px solid var(--brd)", textAlign: "right", color: isSub ? "var(--tGho)" : "var(--tPri)" }}>{a}</td><td style={{ padding: "5px 0", fontFamily: "var(--fm)", fontSize: isSub ? 10 : 12, borderBottom: "1px solid var(--brd)", textAlign: "right", paddingLeft: 10, color: "var(--tPri)" }}>{b}</td></tr>;
          })}
          <tr><td style={{ paddingTop: 10, fontWeight: 700, borderTop: "1px solid var(--brd2)" }}>Total</td><td style={{ paddingTop: 10, fontFamily: "var(--fm)", fontSize: 12, fontWeight: 700, textAlign: "right", borderTop: "1px solid var(--brd2)" }}>{fG(p.cost)}</td><td style={{ paddingTop: 10, fontFamily: "var(--fm)", fontSize: 12, fontWeight: 700, textAlign: "right", borderTop: "1px solid var(--brd2)", paddingLeft: 10 }}>{fG(p.market)}</td></tr>
          <tr><td colSpan={3} style={{ paddingTop: 10 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: "var(--r-sm)", background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}><span style={{ fontWeight: 700, color: "var(--greenB)", fontSize: 13 }}>Profit</span><span style={{ fontFamily: "var(--fm)", fontSize: 16, fontWeight: 700, color: "var(--greenB)" }}>+{fG(p.profit)} (+{p.pct.toFixed(0)}%)</span></div></td></tr>
        </tbody></table>
      </div>
      {/* Confidence */}
      <div style={sec}>
        <div style={secT}>MATCH CONFIDENCE</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--brd)" }}>
          <span style={{ fontWeight: 800, fontSize: 30, lineHeight: 1, color: CONF_C(deal.conf), textShadow: `0 0 16px ${CONF_C(deal.conf)}25` }}>{(deal.conf * 100).toFixed(0)}%</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tMut)", letterSpacing: 1.5, lineHeight: 1.8 }}>COMPOSITE<br />CONFIDENCE</span>
        </div>
        {Object.entries(deal.cb).map(([k, v]) => <BarRow key={k} label={k} value={v} />)}
      </div>
      {/* Liquidity */}
      <div style={sec}>
        <div style={secT}>LIQUIDITY</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--brd)" }}>
          <LiqPill liq={deal.liq} />
          <span style={{ fontFamily: "var(--fm)", fontSize: 13, fontWeight: 700, color: LIQ[deal.liq]?.color }}>{(deal.liqS * 100).toFixed(0)}%</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tMut)", letterSpacing: 1.5 }}>COMPOSITE</span>
        </div>
        {Object.entries(deal.lb).map(([k, v]) => (
          <BarRow key={k} label={k} value={k === "Velocity" && !velFetched ? null : (k === "Velocity" ? velVal : v)}
            showFetch={k === "Velocity" && !velFetched} onFetch={() => { setTimeout(() => { setVelFetched(true); setVelVal(0.85); }, 800); }} />
        ))}
      </div>
      {/* Comps */}
      <div style={sec}>
        <div style={secT}>COMPS BY CONDITION</div>
        {Object.entries(deal.cp).map(([c, pr]) => {
          const act = c === deal.cond;
          return <div key={c} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 12, color: act ? "var(--tMax)" : "var(--tMut)", fontWeight: act ? 700 : 400 }}><span>{c}{act ? " ●" : ""}</span><span>{fG(pr)}</span></div>;
        })}
      </div>
      {/* Expansion Info */}
      <div style={sec}>
        <div style={secT}>EXPANSION</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tGho)" }}>◆</span>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--tMax)" }}>{deal.set}</div>
            <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)" }}>{deal.sc}</div>
          </div>
        </div>
        {[["Total Cards", deal.sc.startsWith("sv") ? "197" : "203"], ["Release", deal.sc.startsWith("sv3pt5") ? "Sep 2023" : deal.sc.startsWith("sv3") ? "Aug 2023" : deal.sc.startsWith("swsh7") ? "Aug 2022" : "2022"], ["Series", deal.sc.startsWith("sv") ? "Scarlet & Violet" : "Sword & Shield"]].map(([l, v], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 11 }}>
            <span style={{ color: "var(--tMut)" }}>{l}</span>
            <span style={{ color: "var(--tSec)", fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>
      {/* Card Metadata */}
      <div style={sec}>
        <div style={secT}>CARD DATA</div>
        {[["Rarity", deal.tier === "grail" || deal.tier === "hit" ? "Ultra Rare" : "Rare"], ["Supertype", "Pokémon"], ["Subtypes", "ex, Stage 2"], ["Artist", "5ban Graphics"]].map(([l, v], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 11 }}>
            <span style={{ color: "var(--tMut)" }}>{l}</span>
            <span style={{ color: "var(--tSec)", fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>
      {/* Review */}
      <div style={{ padding: "14px 22px" }}>
        {deal.rev ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "var(--r-md)", background: deal.rev === "correct" ? "rgba(52,211,153,0.05)" : "rgba(248,113,113,0.05)", border: `1px solid ${deal.rev === "correct" ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`, fontFamily: "var(--fm)", fontSize: 11, color: deal.rev === "correct" ? "var(--green)" : "var(--red)" }}>
            <span>Marked {deal.rev}</span>
            <button onClick={() => onReview(deal.id, null)} style={{ fontSize: 10, color: "var(--tMut)", padding: "3px 10px", borderRadius: "var(--r-pill)", border: "1px solid var(--brd)", fontFamily: "var(--fm)" }}>Undo</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              {[["correct", "✓ Correct", "var(--green)"], ["wrong", "✗ Wrong", "var(--red)"]].map(([act, lbl, clr]) => (
                <button key={act} onClick={() => act === "wrong" ? setShowReasons(!showReasons) : onReview(deal.id, "correct")}
                  style={{ flex: 1, height: 42, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600, fontSize: 12, letterSpacing: 0.5, borderRadius: "var(--r-md)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tSec)", transition: "all 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${clr}40`; e.currentTarget.style.color = clr; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--brd)"; e.currentTarget.style.color = "var(--tSec)"; }}>{lbl}</button>
              ))}
            </div>
            {showReasons && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                {["Wrong Card", "Wrong Set", "Wrong Variant", "Wrong Price"].map(r => (
                  <button key={r} onClick={() => onReview(deal.id, "wrong")} style={{ padding: "5px 12px", fontFamily: "var(--fm)", fontSize: 9, borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tMut)", fontWeight: 500, transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.3)"; e.currentTarget.style.color = "var(--red)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--brd)"; e.currentTarget.style.color = "var(--tMut)"; }}>{r}</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/* ─── FILTER GROUP — contained glass capsule with label ─── */
const FilterGroup = ({ label, children, className }) => (
  <div className={className || ""} style={{ display: "flex", alignItems: "center", gap: 1, background: "var(--glass)", border: "1px solid var(--brd)", borderRadius: "var(--r-pill)", padding: "0 2px", height: 30, flexShrink: 0 }}>
    {label && <span className="fl-label" style={{ fontFamily: "var(--fm)", fontSize: 7, color: "var(--tGho)", letterSpacing: 2, padding: "0 6px 0 8px", textTransform: "uppercase", flexShrink: 0 }}>{label}</span>}
    {children}
  </div>
);

/* ─── SEGMENTED CHIP — sits inside a FilterGroup ─── */
const Seg = ({ label, active, color, onClick }) => (
  <button onClick={onClick} style={{
    height: 24, padding: "0 8px", fontWeight: active ? 700 : 500, fontSize: 9.5, letterSpacing: 0.5,
    borderRadius: "var(--r-pill)",
    background: active ? `${color || "rgba(255,255,255,0.1)"}` : "transparent",
    color: active ? "#fff" : "var(--tMut)",
    transition: "all 0.2s var(--ease)", whiteSpace: "nowrap",
    boxShadow: active ? `0 0 10px ${color || "rgba(255,255,255,0.05)"}40` : "none",
  }}>{label}</button>
);

/* ─── TIER SEGMENT — with hover tooltip ─── */
const TierSeg = ({ tierKey, active, onClick }) => {
  const [showTip, setShowTip] = useState(false);
  const t = TIERS[tierKey];
  return (
    <div style={{ position: "relative" }}
      onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
      <button onClick={onClick} style={{
        height: 24, padding: "0 8px", fontWeight: active ? 700 : 500, fontSize: 9.5, letterSpacing: 0.5,
        borderRadius: "var(--r-pill)",
        background: active ? t.gradient : "transparent",
        color: active ? "#fff" : "var(--tMut)",
        transition: "all 0.2s var(--ease)", whiteSpace: "nowrap",
        boxShadow: active ? `0 0 12px ${t.color}30` : "none",
      }}>{t.label}</button>
      {showTip && (
        <div style={{
          position: "absolute", top: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)",
          padding: "10px 14px", borderRadius: "var(--r-md)",
          background: "rgba(10,14,24,0.96)", border: "1px solid var(--brd2)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)", zIndex: 100,
          minWidth: 190, pointerEvents: "none",
          animation: "tipIn 0.15s var(--ease) both",
        }}>
          <div style={{ position: "absolute", top: -4, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 8, height: 8, background: "rgba(10,14,24,0.96)", borderTop: "1px solid var(--brd2)", borderLeft: "1px solid var(--brd2)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <span style={{ fontFamily: "var(--fm)", fontWeight: 700, fontSize: 10, color: t.color, letterSpacing: 1.5 }}>{t.label}</span>
            <span style={{ fontSize: 11, color: "var(--tSec)", fontWeight: 500 }}>{t.desc}</span>
          </div>
          <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)", lineHeight: 1.6 }}>{t.tip}</div>
        </div>
      )}
    </div>
  );
};

/* ─── STEPPER — custom +/- for MIN% ─── */
const Stepper = ({ value, onChange, step = 5, min = 0, max = 100 }) => {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  const btnStyle = {
    width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: "50%", fontSize: 13, fontWeight: 600, color: "var(--tMut)",
    transition: "all 0.15s", lineHeight: 1,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      <button onClick={dec} style={btnStyle}
        onMouseEnter={e => e.currentTarget.style.color = "var(--tPri)"}
        onMouseLeave={e => e.currentTarget.style.color = "var(--tMut)"}>−</button>
      <input type="number" value={value} onChange={e => onChange(Math.max(min, Math.min(max, +e.target.value || 0)))}
        style={{ width: 32, height: 22, padding: 0, background: "transparent", color: "var(--green)", fontFamily: "var(--fm)", fontSize: 11, fontWeight: 700, textAlign: "center", border: "none" }} />
      <button onClick={inc} style={btnStyle}
        onMouseEnter={e => e.currentTarget.style.color = "var(--tPri)"}
        onMouseLeave={e => e.currentTarget.style.color = "var(--tMut)"}>+</button>
    </div>
  );
};

/* ═══ MAIN APP ═══ */
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [deals, setDeals] = useState(DEALS);
  const [selId, setSelId] = useState(null);
  const [f, setF] = useState({ tiers: new Set(["grail", "hit", "flip"]), conds: new Set(["NM", "LP", "MP"]), confs: new Set(["high", "med"]), liqs: new Set(["high", "med"]), minP: 10, time: "6h", q: "", graded: false });
  const [showLookup, setShowLookup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const [apiTest, setApiTest] = useState({});
  const [lookupSt, setLookupSt] = useState("idle");
  const [pill, setPill] = useState(false);
  const [toast, setToast] = useState(null);
  const [saved, setSaved] = useState(false);
  const [sseStatus, setSseStatus] = useState("connected"); // connected | reconnecting | lost
  const feedRef = useRef(null);
  const selDeal = deals.find(d => d.id === selId) || null;

  const tog = (k, v) => setF(prev => { const s = new Set(prev[k]); s.has(v) ? s.delete(v) : s.add(v); return { ...prev, [k]: s }; });

  const filtered = deals.filter(d => {
    if (!f.tiers.has(d.tier)) return false;
    if (!f.conds.has(d.cond)) return false;
    const cl = d.conf >= 0.85 ? "high" : d.conf >= 0.65 ? "med" : "low";
    if (!f.confs.has(cl)) return false;
    if (!f.liqs.has(d.liq) && d.liq !== "illiquid") return false;
    if (d.liq === "illiquid" && !f.liqs.has("illiquid")) return false;
    if (calc(d).pct < f.minP) return false;
    if (f.q && !(d.name + " " + d.num + " " + d.set).toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
  });

  const onReview = (id, v) => setDeals(ds => ds.map(d => d.id === id ? { ...d, rev: v } : d));

  useEffect(() => {
    if (!loggedIn) return;
    const iv = setInterval(() => {
      const tier = ["grail", "hit", "flip"][~~(Math.random() * 3)];
      const liq = ["high", "high", "med", "low"][~~(Math.random() * 4)];
      const nd = { id: Date.now(), name: SIM_N[~~(Math.random() * SIM_N.length)], num: `${String(~~(Math.random() * 200) + 1).padStart(3, "0")}/197`, set: SIM_S[~~(Math.random() * SIM_S.length)], sc: `sv${~~(Math.random() * 6) + 1}`, ep: +(Math.random() * 30 + 2).toFixed(2), sh: +(Math.random() * 3 + 0.5).toFixed(2), mu: +(Math.random() * 100 + 20).toFixed(2), fx: 0.789, conf: +(0.65 + Math.random() * 0.3).toFixed(2), cond: ["NM", "LP"][~~(Math.random() * 2)], liq, liqS: +(0.3 + Math.random() * 0.6).toFixed(2), ta: 1, tr: +(Math.random() * 20 - 5).toFixed(1), tier, type: SIM_T[~~(Math.random() * SIM_T.length)], cb: { Name: .92, Number: 1, Denom: .88, Expan: .85, Variant: .80, Extract: .88 }, lb: { Trend: .70, Prices: .65, Spread: .60, Supply: .55, Sold: .50, Velocity: null }, cp: { NM: 30, LP: 24, MP: 17, HP: 10 }, rev: null };
      setDeals(ds => [nd, ...ds]);
      if (tier === "grail") { setToast(nd); setTimeout(() => setToast(null), 5000); }
      if (feedRef.current?.scrollTop > 100) setPill(true);
    }, 11000);
    return () => clearInterval(iv);
  }, [loggedIn]);

  const saveFilters = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  // Login — GitHub OAuth
  if (!loggedIn) return (
    <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse at 50% 30%, #0f1628 0%, var(--bg0) 70%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}{`@keyframes fadeSlide{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:translateX(0)}}@keyframes floatIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: 360, maxWidth: "90vw", animation: "floatIn 0.5s var(--ease) both" }}>
        <PokeBall size={48} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 28, letterSpacing: -0.5 }}>Poké<span style={{ color: "var(--red)" }}>Snipe</span></div>
          <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)", letterSpacing: 3.5, textTransform: "uppercase", marginTop: 6 }}>No BS Arbitrage</div>
        </div>
        <button onClick={() => setLoggedIn(true)} style={{
          width: "100%", height: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          background: "var(--glass)", border: "1px solid var(--brd2)", color: "var(--tMax)",
          fontWeight: 700, fontSize: 14, letterSpacing: 0.3, borderRadius: "var(--r-md)",
          transition: "all 0.2s var(--ease)", cursor: "pointer",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brd3)"; e.currentTarget.style.background = "var(--glass2)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--brd2)"; e.currentTarget.style.background = "var(--glass)"; }}>
          {/* GitHub mark */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
          Sign in with GitHub
        </button>
        <div style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tGho)", letterSpacing: 1.5, textAlign: "center", lineHeight: 1.8 }}>
          PRIVATE DASHBOARD · GITHUB SSO<br />AUTHORIZED USERS ONLY
        </div>
      </div>
    </div>
  );

  const grailCount = deals.filter(d => d.tier === "grail").length;
  const hitCount = deals.filter(d => d.tier === "hit").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "radial-gradient(ellipse at 50% 0%, #0e1525 0%, var(--bg0) 60%)" }}>
      <style>{CSS}{`
@keyframes fadeSlide{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:translateX(0)}}
@keyframes toastSlide{from{opacity:0;transform:translateY(-8px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
@keyframes tipIn{from{opacity:0;transform:translateX(-50%) translateY(-4px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@media(max-width:920px){.detail-wrap{position:fixed!important;bottom:0!important;left:0!important;right:0!important;width:100%!important;height:75vh!important;border-left:none!important;border-top:1px solid var(--brd2)!important;border-radius:var(--r-xl) var(--r-xl) 0 0!important;z-index:200!important}.dr-meta-d{display:none!important}.dr-meta-m{display:flex!important}}
@media(max-width:640px){.dr-img{display:none!important}.dr-sub{display:none!important}.dr-prices{display:none!important}.fl-label{display:none!important}.fl-liq{display:none!important}.fl-time{display:none!important}.fl-conf{display:none!important}.fl-graded{display:none!important}.logo-txt{display:none!important}.hdr-save{display:none!important}.foot-apis{display:none!important}}
      `}</style>

      {/* ═══ HEADER — three-zone: logo | search (stretches) | actions + live status ═══ */}
      <header style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 16, padding: "0 24px", height: 58, background: "rgba(12,16,25,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid var(--brd)", position: "relative", zIndex: 100, flexShrink: 0 }}>
        <div style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 1, background: GRAD_LINE, opacity: 0.6 }} />

        {/* Left — Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <PokeBall />
          <div className="logo-txt" style={{ lineHeight: 1 }}>
            <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.3 }}>Poké<span style={{ color: "var(--red)" }}>Snipe</span></span>
            <div style={{ fontFamily: "var(--fm)", fontSize: 8, color: "var(--green)", letterSpacing: 3.5, marginTop: 2, opacity: 0.7 }}>NO BS</div>
          </div>
        </div>

        {/* Center — Search (stretches to fill) */}
        <div style={{ position: "relative", maxWidth: 520, width: "100%", justifySelf: "center" }}>
          <input type="search" placeholder="HUNT CARDS..." value={f.q} aria-label="Search deals" onChange={e => setF(prev => ({ ...prev, q: e.target.value }))}
            style={{ width: "100%", height: 34, padding: "0 12px 0 34px", borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tMax)", fontFamily: "var(--fm)", fontSize: 11, fontWeight: 500, letterSpacing: 1 }} />
          <svg style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--tMut)", pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>
        </div>

        {/* Right — Actions + SSE status */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
          <GradBorder gradient="linear-gradient(135deg, rgba(96,165,250,0.4), rgba(192,132,252,0.3))" radius="var(--r-pill)" pad={1} style={{ flexShrink: 0 }}>
            <button onClick={() => setShowLookup(true)} style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", fontWeight: 600, fontSize: 11, letterSpacing: 0.5, color: "var(--tSec)", background: "var(--bg1)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
              <span className="fl-label">Lookup</span>
            </button>
          </GradBorder>
          <button onClick={() => { setShowSettings(true); setSettingsTab("general"); }} style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tMut)", fontSize: 14, transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brd3)"; e.currentTarget.style.color = "var(--tSec)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--brd)"; e.currentTarget.style.color = "var(--tMut)"; }}>⚙</button>
          {/* User avatar */}
          <div className="fl-label" style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 2px 0 4px", height: 34, borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", cursor: "default" }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg, #6b7fa0, #4a5a78)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>PS</div>
            <span style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tSec)", letterSpacing: 0.5, paddingRight: 8 }}>pokesniper</span>
          </div>
          {/* SSE connection indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 10px", height: 34, borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 6px rgba(52,211,153,0.5)", animation: "pulse 3s ease infinite" }} />
            <span className="fl-label" style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tMut)", letterSpacing: 1 }}>LIVE</span>
          </div>
        </div>
      </header>

      {/* ═══ FILTERS — grouped glass capsules ═══ */}
      <nav style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "7px 24px", background: "rgba(10,14,22,0.6)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--brd)", flexShrink: 0, position: "relative", zIndex: 40 }}>
        {/* Tier — multi-select with tooltips */}
        <FilterGroup label="Tier">
          {Object.keys(TIERS).map(k => <TierSeg key={k} tierKey={k} active={f.tiers.has(k)} onClick={() => tog("tiers", k)} />)}
        </FilterGroup>

        {/* Condition — multi-select */}
        <FilterGroup label="Cond">
          {["NM", "LP", "MP", "HP"].map(c => <Seg key={c} label={c} active={f.conds.has(c)} color={f.conds.has(c) ? (COND_C[c] + "30") : undefined} onClick={() => tog("conds", c)} />)}
        </FilterGroup>

        {/* Liquidity — multi-select */}
        <FilterGroup label="Liq" className="fl-liq">
          {[["high", "HI", "#34d399"], ["med", "MD", "#fbbf24"], ["low", "LO", "#fb923c"]].map(([v, l, c]) => <Seg key={v} label={l} active={f.liqs.has(v)} color={f.liqs.has(v) ? (c + "30") : undefined} onClick={() => tog("liqs", v)} />)}
        </FilterGroup>

        {/* Confidence — multi-select */}
        <FilterGroup label="Conf" className="fl-conf">
          {[["high", "HI", "#34d399"], ["med", "MD", "#fbbf24"]].map(([v, l, c]) => <Seg key={v} label={l} active={f.confs.has(v)} color={f.confs.has(v) ? (c + "30") : undefined} onClick={() => tog("confs", v)} />)}
        </FilterGroup>

        {/* Time — single select (segmented control) */}
        <FilterGroup label="Time" className="fl-time">
          {["1h", "6h", "24h", "All"].map(v => <Seg key={v} label={v.toUpperCase()} active={f.time === v.toLowerCase()} onClick={() => setF(prev => ({ ...prev, time: v.toLowerCase() }))} />)}
        </FilterGroup>

        {/* Min% — custom stepper */}
        <FilterGroup label="Min%">
          <Stepper value={f.minP} onChange={v => setF(prev => ({ ...prev, minP: v }))} />
        </FilterGroup>

        {/* Graded toggle */}
        <FilterGroup label="Graded" className="fl-graded">
          <Seg label={f.graded ? "ON" : "OFF"} active={f.graded} color={f.graded ? "rgba(96,165,250,0.3)" : undefined}
            onClick={() => setF(prev => ({ ...prev, graded: !prev.graded }))} />
        </FilterGroup>

        {/* Save defaults */}
        <button className="hdr-save" onClick={saveFilters} style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 8, color: saved ? "var(--green)" : "var(--tGho)", letterSpacing: 2, padding: "5px 10px", borderRadius: "var(--r-pill)", border: `1px solid ${saved ? "rgba(52,211,153,0.25)" : "var(--brd)"}`, background: saved ? "rgba(52,211,153,0.06)" : "transparent", transition: "all 0.25s var(--ease)", textTransform: "uppercase" }}>{saved ? "✓ SAVED" : "SAVE"}</button>
      </nav>

      {/* ═══ SSE RECONNECTION BANNER ═══ */}
      {sseStatus !== "connected" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "8px 24px", background: sseStatus === "lost" ? "rgba(248,113,113,0.1)" : "rgba(251,191,36,0.08)", borderBottom: `1px solid ${sseStatus === "lost" ? "rgba(248,113,113,0.2)" : "rgba(251,191,36,0.15)"}`, flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: sseStatus === "lost" ? "var(--red)" : "var(--amber)", animation: "pulse 1.5s ease infinite" }} />
          <span style={{ fontFamily: "var(--fm)", fontSize: 11, fontWeight: 600, color: sseStatus === "lost" ? "var(--red)" : "var(--amber)", letterSpacing: 0.5 }}>
            {sseStatus === "lost" ? "Connection lost" : "Reconnecting..."}
          </span>
          {sseStatus === "lost" && (
            <button onClick={() => setSseStatus("reconnecting")} style={{ fontFamily: "var(--fm)", fontSize: 10, fontWeight: 600, color: "var(--blue)", padding: "3px 12px", borderRadius: "var(--r-pill)", border: "1px solid rgba(96,165,250,0.3)", background: "rgba(96,165,250,0.06)", letterSpacing: 0.5, transition: "all 0.15s" }}>Retry</button>
          )}
        </div>
      )}

      {/* ═══ MAIN ═══ */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div ref={feedRef} style={{ flex: 1, overflowY: "auto" }} role="list">
          {pill && (
            <div onClick={() => { feedRef.current?.scrollTo({ top: 0, behavior: "smooth" }); setPill(false); }}
              style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, background: "linear-gradient(90deg, rgba(255,107,107,0.9), rgba(245,158,11,0.9))", backdropFilter: "blur(8px)", color: "#fff", fontWeight: 800, fontSize: 10, letterSpacing: 2.5, cursor: "pointer", textTransform: "uppercase" }}>FRESH HEAT ↑</div>
          )}
          {filtered.map((d, i) => <DealRow key={d.id} deal={d} selected={d.id === selId} onSelect={d => setSelId(d.id)} idx={i} />)}
          {filtered.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 280, gap: 14, opacity: 0.3 }}>
              <PokeBall size={32} /><span style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)", letterSpacing: 2.5, textTransform: "uppercase" }}>No hits. Adjust filters.</span>
            </div>
          )}
        </div>
        <div className="detail-wrap" style={{ width: 440, background: "rgba(12,16,25,0.9)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderLeft: "1px solid var(--brd)", overflowY: "auto", flexShrink: 0 }}>
          <Detail deal={selDeal} onClose={() => setSelId(null)} onReview={onReview} />
        </div>
      </div>

      {/* ═══ FOOTER — split: primary left, API status right ═══ */}
      <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 42, background: "rgba(7,10,18,0.9)", backdropFilter: "blur(12px)", borderTop: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 11, flexShrink: 0, position: "relative", padding: "0 20px" }}>
        <div style={{ position: "absolute", top: -1, left: 0, right: 0, height: 1, background: GRAD_LINE, opacity: 0.4 }} />

        {/* Left — primary operational stats */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px 0 0", flexShrink: 0 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 8px rgba(52,211,153,0.5)" }} />
            <span style={{ color: "var(--tSec)", fontWeight: 600 }}>Hunting</span>
            <span style={{ color: "var(--tMut)", fontSize: 10 }}>2m ago</span>
          </div>
          <div style={{ width: 1, height: 16, background: "var(--brd)", flexShrink: 0 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px", flexShrink: 0 }}>
            <span style={{ color: "var(--tMut)" }}>Today:</span>
            <span style={{ color: "var(--tMax)", fontWeight: 700 }}>{deals.length}</span>
            <span style={{ fontSize: 9, color: TIERS.grail.color, fontWeight: 600 }}>{grailCount}G</span>
            <span style={{ fontSize: 9, color: TIERS.hit.color, fontWeight: 600 }}>{hitCount}H</span>
          </div>
          <div style={{ width: 1, height: 16, background: "var(--brd)", flexShrink: 0 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px", flexShrink: 0 }}>
            <span style={{ color: "var(--tMut)" }}>Acc:</span>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>91%</span>
            <span style={{ color: "var(--tGho)", fontSize: 10 }}>7d</span>
          </div>
        </div>

        {/* Right — API status indicators with dots + sync info */}
        <div className="foot-apis" style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
          {[
            { label: "eBay", val: "1,847", cap: "5K", extra: null, dot: 1847/5000 < 0.8 ? "var(--green)" : 1847/5000 < 0.95 ? "var(--amber)" : "var(--red)" },
            { label: "Scrydex", val: "2,340", cap: "50K", extra: null, dot: "var(--green)" },
            { label: "Index", val: "34,892", cap: null, extra: "2h ago", dot: "var(--green)" },
          ].map((api, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 12px", flexShrink: 0, borderLeft: i > 0 ? "1px solid var(--brd)" : "none" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: api.dot, boxShadow: `0 0 6px ${api.dot === "var(--green)" ? "rgba(52,211,153,0.4)" : api.dot === "var(--amber)" ? "rgba(251,191,36,0.4)" : "rgba(248,113,113,0.4)"}`, flexShrink: 0 }} />
              <span style={{ color: "var(--tMut)", fontSize: 10 }}>{api.label}</span>
              <span style={{ color: "var(--tSec)", fontWeight: 600, fontSize: 10 }}>{api.val}</span>
              {api.cap && <span style={{ color: "var(--tGho)", fontSize: 9 }}>/{api.cap}</span>}
              {api.extra && <span style={{ color: "var(--tGho)", fontSize: 9 }}>· {api.extra}</span>}
            </div>
          ))}
        </div>
      </footer>

      {/* Toast */}
      {toast && (() => { const p = calc(toast); return (
        <div style={{ position: "fixed", top: 68, right: 20, zIndex: 500, animation: "toastSlide 0.35s var(--ease) both" }}>
          <GradBorder gradient="linear-gradient(135deg, rgba(255,92,92,0.5), rgba(245,158,11,0.3))" radius="var(--r-lg)" pad={1}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", minWidth: 280 }}>
              <TierBadge tier="grail" size="lg" /><span style={{ fontWeight: 600, fontSize: 13 }}>{toast.name}</span>
              <span style={{ fontFamily: "var(--fm)", fontWeight: 700, color: "var(--greenB)", marginLeft: "auto", fontSize: 15 }}>+{fG(p.profit)}</span>
            </div>
          </GradBorder>
        </div>
      ); })()}

      {/* Lookup overlay */}
      {showLookup && (
        <div onClick={e => { if (e.target === e.currentTarget) { setShowLookup(false); setLookupSt("idle"); } }} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80, background: "rgba(7,10,18,0.85)", backdropFilter: "blur(16px)" }}>
          <div style={{ width: 580, maxWidth: "94vw", maxHeight: "calc(100vh - 120px)", borderRadius: "var(--r-xl)", background: "rgba(12,16,25,0.95)", border: "1px solid var(--brd2)", overflowY: "auto", backdropFilter: "blur(20px)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid var(--brd)" }}>
              <span style={{ fontWeight: 300, fontSize: 12, letterSpacing: 3, color: "var(--tMut)", textTransform: "uppercase" }}>Manual Lookup</span>
              <button onClick={() => { setShowLookup(false); setLookupSt("idle"); }} style={{ width: 30, height: 30, borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--tMut)" }}>✕</button>
            </div>
            <div style={{ padding: 22 }}>
              <input autoFocus placeholder="PASTE EBAY URL. NO BS." onKeyDown={e => { if (e.key === "Enter" && e.target.value) { setLookupSt("proc"); setTimeout(() => setLookupSt("done"), 2000); } }}
                style={{ width: "100%", height: 46, padding: "0 18px", borderRadius: "var(--r-md)", background: "var(--glass)", border: "1px solid var(--brd2)", color: "var(--tMax)", fontFamily: "var(--fm)", fontSize: 12, letterSpacing: 1 }} />
            </div>
            {lookupSt === "proc" && <div style={{ padding: "0 22px 22px", fontFamily: "var(--fm)", fontSize: 11, color: "var(--amber)", letterSpacing: 0.5 }}>Fetching... Extracting... Matching...</div>}
            {lookupSt === "done" && (
              <div style={{ padding: "0 22px 22px" }}>
                <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 3 }}>Zard ex #006/197</div>
                <div style={{ fontSize: 12, color: "var(--tSec)", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>Obsidian Flames (sv3) <CondPill cond="NM" /> <LiqPill liq="high" /></div>
                <GradBorder gradient="linear-gradient(135deg, rgba(52,211,153,0.45), rgba(96,165,250,0.25))" radius="var(--r-md)" pad={1}>
                  <div style={{ padding: "18px 20px" }}>
                    <div style={{ fontWeight: 800, fontSize: 34, color: "var(--greenB)", letterSpacing: -1.5, lineHeight: 1, textShadow: "0 0 24px rgba(52,211,153,0.2)" }}>+£34.82</div>
                    <div style={{ fontFamily: "var(--fm)", fontSize: 13, fontWeight: 600, color: "var(--green)", marginTop: 4 }}>+199% · GRAIL territory</div>
                  </div>
                </GradBorder>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings overlay — tabbed */}
      {showSettings && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(7,10,18,0.85)", backdropFilter: "blur(16px)" }}>
          <div style={{ width: 520, maxWidth: "94vw", maxHeight: "85vh", borderRadius: "var(--r-xl)", background: "rgba(12,16,25,0.96)", border: "1px solid var(--brd2)", display: "flex", flexDirection: "column", overflow: "hidden", backdropFilter: "blur(20px)" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid var(--brd)", flexShrink: 0 }}>
              <span style={{ fontWeight: 300, fontSize: 12, letterSpacing: 3, color: "var(--tMut)", textTransform: "uppercase" }}>Settings</span>
              <button onClick={() => setShowSettings(false)} style={{ width: 30, height: 30, borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--tMut)" }}>✕</button>
            </div>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--brd)", flexShrink: 0, padding: "0 22px" }}>
              {[["general", "General"], ["api", "API Keys"], ["notif", "Notifications"]].map(([k, l]) => (
                <button key={k} onClick={() => setSettingsTab(k)} style={{
                  padding: "10px 16px", fontFamily: "var(--fm)", fontSize: 10, letterSpacing: 1.5, fontWeight: 600, textTransform: "uppercase",
                  color: settingsTab === k ? "var(--tMax)" : "var(--tMut)",
                  borderBottom: settingsTab === k ? "2px solid var(--blue)" : "2px solid transparent",
                  transition: "all 0.15s", marginBottom: -1,
                }}>{l}</button>
              ))}
            </div>
            {/* Tab content */}
            <div style={{ flex: 1, overflowY: "auto", padding: 0 }}>

              {/* ─── GENERAL TAB ─── */}
              {settingsTab === "general" && <>
                {[
                  { t: "Tier Thresholds", rows: [["GRAIL", ">40% · High confidence · High liquidity", TIERS.grail.color], ["HIT", "25–40% · High confidence", TIERS.hit.color], ["FLIP", "15–25% · Med+ confidence", "var(--tSec)"], ["SLEEPER", "5–15% · Any confidence", "var(--tMut)"]], },
                  { t: "Display", rows: [["Currency", "GBP (£)"], ["Fee Breakdown", "Visible"], ["Dark Mode", "ON", "var(--green)"]] },
                  { t: "Sound", rows: [["Deal alerts", "ON", "var(--green)"], ["GRAIL only", "OFF", "var(--tMut)"], ["All tiers", "ON", "var(--green)"]] },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "14px 22px", borderBottom: "1px solid var(--brd)" }}>
                    <div style={{ fontFamily: "var(--fm)", fontSize: 9, letterSpacing: 2.5, color: "var(--tGho)", marginBottom: 10, textTransform: "uppercase" }}>{s.t}</div>
                    {s.rows.map(([l, v, c], j) => (
                      <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", fontSize: 13 }}>
                        <span style={{ fontWeight: 600, color: c || "var(--tPri)" }}>{l}</span>
                        <span style={{ color: c || "var(--tSec)", fontFamily: "var(--fm)", fontWeight: 500, fontSize: 12 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {/* Logout */}
                <div style={{ padding: "14px 22px" }}>
                  <button onClick={() => { setLoggedIn(false); setShowSettings(false); }} style={{
                    width: "100%", height: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    borderRadius: "var(--r-md)", background: "var(--glass)", border: "1px solid var(--brd)",
                    fontFamily: "var(--fm)", fontSize: 11, fontWeight: 600, color: "var(--red)", letterSpacing: 1,
                    transition: "all 0.15s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(248,113,113,0.3)"; e.currentTarget.style.background = "rgba(248,113,113,0.05)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--brd)"; e.currentTarget.style.background = "var(--glass)"; }}>
                    Sign Out
                  </button>
                </div>
              </>}

              {/* ─── API KEYS TAB ─── */}
              {settingsTab === "api" && <>
                {[
                  { key: "ebay", label: "eBay API", desc: "OAuth credentials for listing data and search", connected: true, fields: ["App ID", "Cert ID", "Dev ID"] },
                  { key: "scrydex", label: "Scrydex API", desc: "Card index, pricing, and sales velocity data", connected: true, fields: ["API Key", "API Secret"] },
                ].map((api) => (
                  <div key={api.key} style={{ padding: "16px 22px", borderBottom: "1px solid var(--brd)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--tMax)", marginBottom: 2 }}>{api.label}</div>
                        <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)" }}>{api.desc}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: api.connected ? "var(--green)" : "var(--red)", boxShadow: api.connected ? "0 0 6px rgba(52,211,153,0.4)" : "0 0 6px rgba(248,113,113,0.4)" }} />
                        <span style={{ fontFamily: "var(--fm)", fontSize: 10, color: api.connected ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{api.connected ? "CONNECTED" : "NOT SET"}</span>
                      </div>
                    </div>
                    {/* Key fields — masked */}
                    {api.fields.map((field, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <div style={{ fontFamily: "var(--fm)", fontSize: 8, color: "var(--tGho)", letterSpacing: 2, marginBottom: 4, textTransform: "uppercase" }}>{field}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="password" defaultValue={api.connected ? "••••••••••••••••" : ""} placeholder={`Enter ${field.toLowerCase()}...`}
                            style={{ flex: 1, height: 34, padding: "0 12px", borderRadius: "var(--r-sm)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tMax)", fontFamily: "var(--fm)", fontSize: 11 }} />
                        </div>
                      </div>
                    ))}
                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button style={{ flex: 1, height: 34, borderRadius: "var(--r-sm)", background: "var(--glass)", border: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 10, fontWeight: 600, color: "var(--tSec)", letterSpacing: 1, transition: "all 0.15s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brd3)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--brd)"; }}>SAVE KEYS</button>
                      <button onClick={() => { setApiTest(p => ({ ...p, [api.key]: "testing" })); setTimeout(() => setApiTest(p => ({ ...p, [api.key]: "ok" })), 1500); }}
                        style={{ flex: 1, height: 34, borderRadius: "var(--r-sm)", background: apiTest[api.key] === "ok" ? "rgba(52,211,153,0.06)" : "var(--glass)", border: `1px solid ${apiTest[api.key] === "ok" ? "rgba(52,211,153,0.25)" : "var(--brd)"}`, fontFamily: "var(--fm)", fontSize: 10, fontWeight: 600, color: apiTest[api.key] === "ok" ? "var(--green)" : apiTest[api.key] === "testing" ? "var(--amber)" : "var(--blue)", letterSpacing: 1, transition: "all 0.25s" }}>
                        {apiTest[api.key] === "testing" ? "TESTING..." : apiTest[api.key] === "ok" ? "✓ CONNECTED" : "TEST CONNECTION"}
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "14px 22px" }}>
                  <div style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tGho)", lineHeight: 1.8, letterSpacing: 0.5 }}>
                    API keys are encrypted at rest. Keys are never exposed after saving — only connection status is shown. Contact Anthropic support if you need to rotate keys.
                  </div>
                </div>
              </>}

              {/* ─── NOTIFICATIONS TAB ─── */}
              {settingsTab === "notif" && <>
                <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--brd)" }}>
                  <div style={{ fontFamily: "var(--fm)", fontSize: 9, letterSpacing: 2.5, color: "var(--tGho)", marginBottom: 12, textTransform: "uppercase" }}>Telegram</div>
                  {[["Bot Token", "••••••••:AAF..."], ["Chat ID", "-100..."]].map(([label, val], i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ fontFamily: "var(--fm)", fontSize: 8, color: "var(--tGho)", letterSpacing: 2, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
                      <input type={i === 0 ? "password" : "text"} defaultValue={val} style={{ width: "100%", height: 34, padding: "0 12px", borderRadius: "var(--r-sm)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tMax)", fontFamily: "var(--fm)", fontSize: 11 }} />
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button style={{ flex: 1, height: 34, borderRadius: "var(--r-sm)", background: "var(--glass)", border: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 10, fontWeight: 600, color: "var(--tSec)", letterSpacing: 1 }}>SAVE</button>
                    <button onClick={() => { setApiTest(p => ({ ...p, tg: "testing" })); setTimeout(() => setApiTest(p => ({ ...p, tg: "ok" })), 1200); }}
                      style={{ flex: 1, height: 34, borderRadius: "var(--r-sm)", background: apiTest.tg === "ok" ? "rgba(52,211,153,0.06)" : "var(--glass)", border: `1px solid ${apiTest.tg === "ok" ? "rgba(52,211,153,0.25)" : "var(--brd)"}`, fontFamily: "var(--fm)", fontSize: 10, fontWeight: 600, color: apiTest.tg === "ok" ? "var(--green)" : apiTest.tg === "testing" ? "var(--amber)" : "var(--blue)", letterSpacing: 1, transition: "all 0.25s" }}>
                      {apiTest.tg === "testing" ? "SENDING..." : apiTest.tg === "ok" ? "✓ SENT" : "TEST MESSAGE"}
                    </button>
                  </div>
                </div>
                <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--brd)" }}>
                  <div style={{ fontFamily: "var(--fm)", fontSize: 9, letterSpacing: 2.5, color: "var(--tGho)", marginBottom: 12, textTransform: "uppercase" }}>Alert Rules</div>
                  {[["GRAIL deals", "Instant push", "var(--green)"], ["HIT deals", "Instant push", "var(--green)"], ["FLIP deals", "OFF", "var(--tMut)"], ["System warnings", "Push on error", "var(--amber)"]].map(([l, v, c], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: "var(--tPri)" }}>{l}</span>
                      <span style={{ fontFamily: "var(--fm)", fontSize: 10, fontWeight: 600, color: c }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "16px 22px" }}>
                  <div style={{ fontFamily: "var(--fm)", fontSize: 9, letterSpacing: 2.5, color: "var(--tGho)", marginBottom: 12, textTransform: "uppercase" }}>Thresholds</div>
                  {[["Min profit %", "25"], ["Min confidence", "0.80"], ["Watched expansions", "All"]].map(([l, v], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", fontSize: 13 }}>
                      <span style={{ fontWeight: 500, color: "var(--tSec)" }}>{l}</span>
                      <span style={{ fontFamily: "var(--fm)", fontSize: 11, fontWeight: 600, color: "var(--tMax)" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
