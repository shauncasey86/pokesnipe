import { useState, useEffect, useRef, useCallback } from "react";

// ─── Mock Data ───────────────────────────────────────────────────────────────

const DEALS = [
  {
    id: 1, name: "Gyarados δ", set: "Dragon Frontiers", number: "#8/101", year: 2006,
    condition: "LP", tier: "GRAIL", confidence: 90,
    ebayPrice: 42.30, shipping: 8.50, fees: 1.92, totalCost: 52.72, marketPrice: 94.83,
    profit: 47.43, profitPct: 100.1, timeAgo: "14h",
    matchScores: { name: 100, number: 100, denom: 85, expan: 70, variant: 95, extract: 0 },
    conditionComps: { DM: { low: 20, market: 45, spread: 12 }, HP: { low: 30, market: 55, spread: 8 }, LP: { low: 42, market: 94.83, spread: 47.43 }, MP: { low: 50, market: 72, spread: 18 }, NM: { low: 80, market: 140, spread: 52 } },
    trends: { d1: { change: 0.82, pct: 1.2 }, d7: { change: 5.40, pct: 8.3 }, d30: { change: 12.10, pct: 22.1 }, d90: { change: 18.50, pct: 38.7 } },
    img: "https://images.pokemontcg.io/ex11/8_hires.png",
  },
  {
    id: 2, name: "Canari", set: "151 (MEW)", number: "#170", year: 2023,
    condition: "NM", tier: "GRAIL", confidence: 71,
    ebayPrice: 15.08, shipping: 9.78, fees: 1.08, totalCost: 25.94, marketPrice: 65.80,
    profit: 46.86, profitPct: 247.5, timeAgo: "15h",
    matchScores: { name: 95, number: 100, denom: 0, expan: 75, variant: 90, extract: 0 },
    conditionComps: { DM: { low: 5, market: 18, spread: 4 }, HP: { low: 8, market: 25, spread: 6 }, LP: { low: 12, market: 38, spread: 14 }, MP: { low: 18, market: 48, spread: 22 }, NM: { low: 15.08, market: 65.80, spread: 46.86 } },
    trends: { d1: { change: 1.20, pct: 2.1 }, d7: { change: 8.30, pct: 15.2 }, d30: { change: 15.60, pct: 31.8 }, d90: { change: 22.40, pct: 51.2 } },
    img: "https://images.pokemontcg.io/sv3pt5/170_hires.png",
  },
  {
    id: 3, name: "Squirtle", set: "151 (MEW)", number: "#170", year: 2023,
    condition: "NM", tier: "GRAIL", confidence: 97,
    ebayPrice: 14.01, shipping: 9.78, fees: 1.08, totalCost: 24.87, marketPrice: 47.11,
    profit: 22.24, profitPct: 89.4, timeAgo: "15h",
    matchScores: { name: 100, number: 100, denom: 0, expan: 75, variant: 95, extract: 0 },
    conditionComps: { DM: { low: 999.99, market: 30.03, spread: 5.16 }, HP: { low: 0, market: 32.65, spread: 7.78 }, LP: { low: 56.24, market: 52, spread: 27.13 }, MP: { low: 56.87, market: 47.39, spread: 22.52 }, NM: { low: 62.29, market: 64.37, spread: 39.50 } },
    trends: { d1: { change: 0.48, pct: 1.0 }, d7: { change: 4.71, pct: 11.1 }, d30: { change: 11.31, pct: 31.6 }, d90: { change: 14.28, pct: 43.5 } },
    img: "https://images.pokemontcg.io/sv3pt5/170_hires.png",
  },
  {
    id: 4, name: "M Heracross-EX", set: "Furious Fists", number: "#112", year: 2014,
    condition: "LP", tier: "HIT", confidence: 82,
    ebayPrice: 20.96, shipping: 6.20, fees: 1.13, totalCost: 28.29, marketPrice: 28.29,
    profit: 4.92, profitPct: 21.1, timeAgo: "15h",
    matchScores: { name: 100, number: 95, denom: 80, expan: 60, variant: 85, extract: 10 },
    conditionComps: { DM: { low: 8, market: 15, spread: 2 }, HP: { low: 12, market: 20, spread: 4 }, LP: { low: 20.96, market: 28.29, spread: 4.92 }, MP: { low: 25, market: 32, spread: 6 }, NM: { low: 35, market: 48, spread: 10 } },
    trends: { d1: { change: 0.12, pct: 0.5 }, d7: { change: 0.80, pct: 3.2 }, d30: { change: 2.10, pct: 8.8 }, d90: { change: 3.50, pct: 15.2 } },
    img: "https://images.pokemontcg.io/xy2/112_hires.png",
  },
  {
    id: 5, name: "Zekrom", set: "Legendary Treasures", number: "#51", year: 2013,
    condition: "LP", tier: "GRAIL", confidence: 93,
    ebayPrice: 16.14, shipping: 7.80, fees: 1.22, totalCost: 25.16, marketPrice: 62.40,
    profit: 43.48, profitPct: 229.8, timeAgo: "16h",
    matchScores: { name: 100, number: 100, denom: 90, expan: 80, variant: 95, extract: 5 },
    conditionComps: { DM: { low: 5, market: 20, spread: 8 }, HP: { low: 10, market: 32, spread: 14 }, LP: { low: 16.14, market: 62.40, spread: 43.48 }, MP: { low: 30, market: 52, spread: 18 }, NM: { low: 45, market: 85, spread: 32 } },
    trends: { d1: { change: 0.95, pct: 1.8 }, d7: { change: 6.20, pct: 12.4 }, d30: { change: 14.80, pct: 32.5 }, d90: { change: 20.10, pct: 48.8 } },
    img: "https://images.pokemontcg.io/bw11/51_hires.png",
  },
  {
    id: 6, name: "Virizion", set: "Noble Victories", number: "#97", year: 2011,
    condition: "NM", tier: "HIT", confidence: 81,
    ebayPrice: 20.99, shipping: 5.50, fees: 1.04, totalCost: 27.53, marketPrice: 33.00,
    profit: 10.47, profitPct: 46.5, timeAgo: "16h",
    matchScores: { name: 100, number: 100, denom: 75, expan: 65, variant: 80, extract: 0 },
    conditionComps: { DM: { low: 8, market: 15, spread: 3 }, HP: { low: 12, market: 22, spread: 5 }, LP: { low: 18, market: 28, spread: 8 }, MP: { low: 22, market: 35, spread: 10 }, NM: { low: 20.99, market: 33, spread: 10.47 } },
    trends: { d1: { change: 0.30, pct: 0.9 }, d7: { change: 1.80, pct: 5.8 }, d30: { change: 4.20, pct: 14.6 }, d90: { change: 6.80, pct: 25.9 } },
    img: "https://images.pokemontcg.io/bw3/97_hires.png",
  },
  {
    id: 7, name: "Charizard VMAX", set: "Darkness Ablaze", number: "#20", year: 2020,
    condition: "NM", tier: "FLIP", confidence: 88,
    ebayPrice: 85.00, shipping: 12.00, fees: 3.80, totalCost: 100.80, marketPrice: 165.00,
    profit: 64.20, profitPct: 63.7, timeAgo: "12h",
    matchScores: { name: 100, number: 100, denom: 90, expan: 95, variant: 100, extract: 15 },
    conditionComps: { DM: { low: 40, market: 80, spread: 20 }, HP: { low: 55, market: 95, spread: 25 }, LP: { low: 70, market: 120, spread: 35 }, MP: { low: 90, market: 145, spread: 40 }, NM: { low: 85, market: 165, spread: 64.20 } },
    trends: { d1: { change: 2.50, pct: 1.5 }, d7: { change: 12.00, pct: 7.8 }, d30: { change: 28.00, pct: 20.4 }, d90: { change: 45.00, pct: 37.5 } },
    img: "https://images.pokemontcg.io/swsh3/20_hires.png",
  },
  {
    id: 8, name: "Pikachu VMAX", set: "Vivid Voltage", number: "#44", year: 2020,
    condition: "NM", tier: "HIT", confidence: 95,
    ebayPrice: 32.00, shipping: 8.00, fees: 1.60, totalCost: 41.60, marketPrice: 72.00,
    profit: 30.40, profitPct: 73.1, timeAgo: "13h",
    matchScores: { name: 100, number: 100, denom: 85, expan: 90, variant: 95, extract: 5 },
    conditionComps: { DM: { low: 15, market: 30, spread: 8 }, HP: { low: 22, market: 42, spread: 12 }, LP: { low: 28, market: 55, spread: 18 }, MP: { low: 35, market: 65, spread: 22 }, NM: { low: 32, market: 72, spread: 30.40 } },
    trends: { d1: { change: 0.60, pct: 0.8 }, d7: { change: 3.50, pct: 5.1 }, d30: { change: 8.20, pct: 12.8 }, d90: { change: 15.60, pct: 27.7 } },
    img: "https://images.pokemontcg.io/swsh4/44_hires.png",
  },
];

const TIER_COLORS = {
  GRAIL: { bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc", border: "#7c3aed" },
  HIT:   { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa", border: "#2563eb" },
  FLIP:  { bg: "rgba(34, 197, 94, 0.15)",  text: "#4ade80", border: "#16a34a" },
};

const CONDITION_ORDER = ["DM", "HP", "LP", "MP", "NM"];

// ─── Utility Components ──────────────────────────────────────────────────────

function ConfidenceRing({ value, size = 44 }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 90 ? "#4ade80" : value >= 75 ? "#facc15" : value >= 50 ? "#fb923c" : "#ef4444";

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: "rotate(90deg)", transformOrigin: "center", fontSize: size * 0.28, fill: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
        {value}%
      </text>
    </svg>
  );
}

function TierBadge({ tier }) {
  const t = TIER_COLORS[tier] || TIER_COLORS.HIT;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 4,
      background: t.bg, color: t.text, border: `1px solid ${t.border}`,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', monospace",
      textTransform: "uppercase",
    }}>
      {tier}
    </span>
  );
}

function ConditionBadge({ condition }) {
  const colors = {
    NM: { bg: "rgba(34,197,94,0.15)", text: "#4ade80", border: "#16a34a" },
    LP: { bg: "rgba(250,204,21,0.15)", text: "#facc15", border: "#ca8a04" },
    MP: { bg: "rgba(251,146,60,0.15)", text: "#fb923c", border: "#ea580c" },
    HP: { bg: "rgba(239,68,68,0.15)", text: "#ef4444", border: "#dc2626" },
    DM: { bg: "rgba(239,68,68,0.2)", text: "#fca5a5", border: "#ef4444" },
  };
  const c = colors[condition] || colors.LP;
  return (
    <span style={{
      display: "inline-flex", padding: "1px 8px", borderRadius: 3,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
    }}>
      {condition}
    </span>
  );
}

function MiniBar({ value, max = 100, color = "#7c3aed" }) {
  return (
    <div style={{ width: "100%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
      <div style={{
        width: `${Math.min((value / max) * 100, 100)}%`, height: "100%",
        borderRadius: 2, background: color,
        transition: "width 0.4s ease",
      }} />
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      padding: "14px 18px", borderRadius: 12,
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column", gap: 2, minWidth: 0,
    }}>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: accent || "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em" }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'IBM Plex Sans', sans-serif" }}>{sub}</span>}
    </div>
  );
}

// ─── Flip Card ───────────────────────────────────────────────────────────────

function FlipCard({ deal }) {
  const [flipped, setFlipped] = useState(false);
  const t = TIER_COLORS[deal.tier] || TIER_COLORS.HIT;

  // Reset flip state when deal changes
  useEffect(() => { setFlipped(false); }, [deal.id]);

  const labelStyle = {
    fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: "uppercase", textAlign: "center",
    padding: "3px 10px", borderRadius: 4,
  };

  return (
    <div style={{ width: "100%", margin: "14px 0 8px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Active label */}
      <div style={{
        ...labelStyle,
        color: flipped ? "#60a5fa" : "#facc15",
        background: flipped ? "rgba(59,130,246,0.12)" : "rgba(250,204,21,0.12)",
        border: `1px solid ${flipped ? "rgba(59,130,246,0.25)" : "rgba(250,204,21,0.25)"}`,
        marginBottom: 8,
        transition: "all 0.3s ease",
      }}>
        {flipped ? "SCRYDEX REF" : "EBAY LISTING"}
      </div>

      {/* Flip container */}
      <div
        onClick={() => setFlipped(f => !f)}
        role="button"
        tabIndex={0}
        aria-label={`Viewing ${flipped ? "Scrydex reference" : "eBay listing"} image. Click to flip.`}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFlipped(f => !f); } }}
        style={{
          width: 160, aspectRatio: "5 / 7",
          perspective: "800px",
          cursor: "pointer",
          position: "relative",
        }}
      >
        <div style={{
          width: "100%", height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          transition: "transform 0.5s cubic-bezier(0.4, 0.0, 0.2, 1)",
        }}>
          {/* Front — eBay listing */}
          <div style={{
            position: "absolute", inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            borderRadius: 10, overflow: "hidden",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${t.border}22`,
          }}>
            <img
              src={deal.img}
              alt={`${deal.name} eBay listing`}
              style={{
                width: "100%", height: "100%", objectFit: "cover",
                filter: "brightness(0.95) contrast(1.05)",
              }}
              onError={e => { e.target.style.display = "none"; }}
            />
            {/* Photo-style vignette to differentiate from clean reference */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.2) 100%)",
              pointerEvents: "none",
            }} />
          </div>

          {/* Back — Scrydex reference */}
          <div style={{
            position: "absolute", inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            borderRadius: 10, overflow: "hidden",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(59,130,246,0.2)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(59,130,246,0.15)",
          }}>
            <img
              src={deal.refImg || deal.img}
              alt={`${deal.name} Scrydex reference`}
              style={{
                width: "100%", height: "100%", objectFit: "cover",
              }}
              onError={e => { e.target.style.display = "none"; }}
            />
          </div>
        </div>

        {/* Glow */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "120%", height: "120%", borderRadius: 24,
          background: `radial-gradient(ellipse, ${flipped ? "rgba(59,130,246,0.08)" : `${t.border}12`}, transparent 70%)`,
          zIndex: -1, filter: "blur(12px)", pointerEvents: "none",
          transition: "background 0.5s ease",
        }} />
      </div>

      {/* Hint */}
      <div style={{
        fontSize: 10, color: "rgba(255,255,255,0.18)", textAlign: "center",
        fontFamily: "'IBM Plex Sans', sans-serif", fontStyle: "italic",
        marginTop: 10, display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ fontSize: 13, opacity: 0.5 }}>↻</span>
        Tap to flip · verify visually
      </div>
    </div>
  );
}

// ─── Deal Panel (Right Side) ─────────────────────────────────────────────────

function DealPanel({ deal, onClose }) {
  const [tab, setTab] = useState("overview");

  if (!deal) return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", color: "rgba(255,255,255,0.2)", gap: 16, padding: 40, textAlign: "center",
    }}>
      <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
        ◎
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Sans', sans-serif" }}>Select a deal to inspect</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.15)", marginTop: 4, fontFamily: "'IBM Plex Sans', sans-serif" }}>Click any row to view full analysis</div>
      </div>
    </div>
  );

  const t = TIER_COLORS[deal.tier] || TIER_COLORS.HIT;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "comps", label: "Comps" },
    { key: "trends", label: "Trends" },
  ];

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      animation: "panelSlide 0.3s ease",
    }}>
      {/* Header */}
      <div style={{ padding: "20px 20px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <TierBadge tier={deal.tier} />
            <ConditionBadge condition={deal.condition} />
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer",
            fontSize: 18, padding: 4, lineHeight: 1,
          }} aria-label="Close panel">✕</button>
        </div>
        {/* Flip Card Comparison */}
        <FlipCard deal={deal} />

        <h2 style={{
          fontSize: 22, fontWeight: 800, color: "#f1f5f9", margin: "0 0 4px",
          fontFamily: "'IBM Plex Sans', sans-serif", letterSpacing: "-0.02em",
          textAlign: "center",
        }}>{deal.name}</h2>
        <div style={{
          fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace",
          textAlign: "center",
        }}>
          {deal.set} · {deal.number} · {deal.year}
        </div>
      </div>

      {/* Profit Hero */}
      <div style={{
        margin: "16px 20px", padding: "20px", borderRadius: 14,
        background: `linear-gradient(135deg, ${t.border}33, ${t.border}11)`,
        border: `1px solid ${t.border}44`,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 36, fontWeight: 900, color: t.text, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.03em" }}>
          +£{deal.profit.toFixed(2)}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          No BS profit · Fees included
        </div>
      </div>

      {/* Snag Button */}
      <div style={{ padding: "0 20px", flexShrink: 0 }}>
        <a href="#" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "14px", borderRadius: 10, textDecoration: "none",
          background: "#7c3aed", color: "#fff",
          fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
          fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase",
          transition: "all 0.15s ease",
          boxShadow: "0 4px 20px rgba(124, 58, 237, 0.3)",
        }}>
          SNAG ON EBAY →
        </a>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 0, padding: "16px 20px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "8px 16px", fontSize: 11, fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: tab === t.key ? "#c084fc" : "rgba(255,255,255,0.3)",
            borderBottom: tab === t.key ? "2px solid #7c3aed" : "2px solid transparent",
            transition: "all 0.15s ease", marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 20px" }}>
        {tab === "overview" && <OverviewTab deal={deal} />}
        {tab === "comps" && <CompsTab deal={deal} />}
        {tab === "trends" && <TrendsTab deal={deal} />}
      </div>
    </div>
  );
}

function OverviewTab({ deal }) {
  const rows = [
    ["eBay price", `£${deal.ebayPrice.toFixed(2)}`],
    ["Shipping", `£${deal.shipping.toFixed(2)}`],
    ["Fees (inc.)", `£${deal.fees.toFixed(2)}`],
  ];

  const matchKeys = ["name", "number", "denom", "expan", "variant", "extract"];
  const matchLabels = { name: "Name", number: "Number", denom: "Denom", expan: "Expansion", variant: "Variant", extract: "Extract" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Pricing Breakdown */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>
          NO BS PRICING
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {rows.map(([label, val]) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between", padding: "8px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              fontSize: 13, fontFamily: "'IBM Plex Sans', sans-serif",
            }}>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
              <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{val}</span>
            </div>
          ))}
          <div style={{
            display: "flex", justifyContent: "space-between", padding: "10px 0",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            fontSize: 13, fontWeight: 700,
          }}>
            <span style={{ color: "#e2e8f0", fontFamily: "'IBM Plex Sans', sans-serif" }}>Total cost</span>
            <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace" }}>£{deal.totalCost.toFixed(2)}</span>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", padding: "10px 0",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            fontSize: 13,
          }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'IBM Plex Sans', sans-serif" }}>Market price</span>
            <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>£{deal.marketPrice.toFixed(2)}</span>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", padding: "12px 14px", marginTop: 8,
            borderRadius: 8, background: "rgba(124, 58, 237, 0.1)", border: "1px solid rgba(124, 58, 237, 0.2)",
            fontSize: 14, fontWeight: 700,
          }}>
            <span style={{ color: "#c084fc", fontFamily: "'IBM Plex Sans', sans-serif" }}>Profit</span>
            <span style={{ color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>+£{deal.profit.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Match Confidence */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>
            MATCH CONFIDENCE
          </span>
          <ConfidenceRing value={deal.confidence} size={38} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {matchKeys.map(k => {
            const v = deal.matchScores[k];
            const color = v >= 90 ? "#4ade80" : v >= 50 ? "#facc15" : "#ef4444";
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace", width: 60, flexShrink: 0 }}>
                  {matchLabels[k]}
                </span>
                <div style={{ flex: 1 }}>
                  <MiniBar value={v} color={color} />
                </div>
                <span style={{ fontSize: 11, color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, width: 36, textAlign: "right" }}>
                  {v}%
                </span>
                <span style={{ fontSize: 12, color: v >= 50 ? "#4ade80" : "rgba(255,255,255,0.2)" }}>
                  {v >= 50 ? "✓" : "–"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CompsTab({ deal }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
        COMPS BY CONDITION
      </div>

      {/* Condition Chart - Horizontal Bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {CONDITION_ORDER.map(cond => {
          const data = deal.conditionComps[cond];
          if (!data) return null;
          const isActive = cond === deal.condition;
          const maxMarket = Math.max(...CONDITION_ORDER.map(c => deal.conditionComps[c]?.market || 0));
          const barWidth = maxMarket > 0 ? (data.market / maxMarket) * 100 : 0;
          return (
            <div key={cond} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: isActive ? "8px 10px" : "4px 10px",
              borderRadius: 6,
              background: isActive ? "rgba(124, 58, 237, 0.1)" : "transparent",
              border: isActive ? "1px solid rgba(124, 58, 237, 0.25)" : "1px solid transparent",
            }}>
              <span style={{
                fontSize: 11, fontWeight: isActive ? 700 : 500, width: 26,
                color: isActive ? "#c084fc" : "rgba(255,255,255,0.4)",
                fontFamily: "'JetBrains Mono', monospace",
              }}>{cond}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
                <div style={{
                  width: `${barWidth}%`, height: "100%", borderRadius: 3,
                  background: isActive ? "#7c3aed" : "rgba(255,255,255,0.12)",
                  transition: "width 0.4s ease",
                }} />
              </div>
              <span style={{ fontSize: 11, color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", width: 50, textAlign: "right" }}>
                £{data.market.toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Comp Table */}
      <div style={{
        borderRadius: 8, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "40px 1fr 1fr 1fr",
          padding: "8px 12px", background: "rgba(255,255,255,0.03)",
          fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)",
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em",
        }}>
          <span></span>
          <span>Low</span>
          <span>Market</span>
          <span style={{ textAlign: "right" }}>Spread</span>
        </div>
        {CONDITION_ORDER.map(cond => {
          const data = deal.conditionComps[cond];
          if (!data) return null;
          const isActive = cond === deal.condition;
          return (
            <div key={cond} style={{
              display: "grid", gridTemplateColumns: "40px 1fr 1fr 1fr",
              padding: "8px 12px",
              borderTop: "1px solid rgba(255,255,255,0.04)",
              fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
              background: isActive ? "rgba(124, 58, 237, 0.08)" : "transparent",
            }}>
              <span style={{ fontWeight: isActive ? 700 : 500, color: isActive ? "#c084fc" : "rgba(255,255,255,0.4)" }}>{cond}</span>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>£{data.low.toFixed(2)}</span>
              <span style={{ color: "#e2e8f0" }}>£{data.market.toFixed(2)}</span>
              <span style={{ textAlign: "right", color: "#4ade80", fontWeight: 600 }}>+£{data.spread.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendsTab({ deal }) {
  const periods = [
    { key: "d1", label: "1d" },
    { key: "d7", label: "7d" },
    { key: "d30", label: "30d" },
    { key: "d90", label: "90d" },
  ];

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
        PRICE TRENDS
      </div>

      {/* Mini Sparkline Area */}
      <div style={{
        padding: "16px", borderRadius: 10,
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        marginBottom: 16,
      }}>
        <svg viewBox="0 0 200 60" style={{ width: "100%", height: 60 }}>
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,50 Q30,48 60,42 T120,28 T200,10 L200,60 L0,60 Z" fill="url(#trendGrad)" />
          <path d="M0,50 Q30,48 60,42 T120,28 T200,10" fill="none" stroke="#7c3aed" strokeWidth="2" />
          <circle cx="200" cy="10" r="3" fill="#c084fc" />
        </svg>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 6 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace" }}>
            1d +{deal.trends.d1.pct}%
          </span>
          <span style={{ fontSize: 11, color: "#c084fc", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            7d +{deal.trends.d7.pct}%
          </span>
        </div>
      </div>

      {/* Period Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {periods.map(p => {
          const d = deal.trends[p.key];
          return (
            <div key={p.key} style={{
              padding: "12px 14px", borderRadius: 8,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, marginBottom: 6 }}>{p.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>+£{d.change.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace", opacity: 0.7 }}>+{d.pct}% ↑</div>
            </div>
          );
        })}
      </div>

      {/* Expansion */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace", marginBottom: 10 }}>
          EXPANSION
        </div>
        <div style={{
          padding: "14px", borderRadius: 8,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", fontFamily: "'IBM Plex Sans', sans-serif" }}>{deal.set}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
            Released {deal.year} · Modern
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Filter Bar ──────────────────────────────────────────────────────────────

function FilterBar({ filters, setFilters }) {
  const tierOptions = ["ALL", "GRAIL", "HIT", "FLIP"];
  const condOptions = ["ALL", "NM", "LP", "MP", "HP"];
  const timeOptions = ["1H", "6H", "24H", "ALL"];
  const sortOptions = [
    { key: "profit", label: "Profit £" },
    { key: "profitPct", label: "Profit %" },
    { key: "confidence", label: "Match %" },
    { key: "timeAgo", label: "Recent" },
  ];

  const ChipGroup = ({ options, value, onChange, colorMap }) => (
    <div style={{ display: "flex", gap: 4 }}>
      {options.map(opt => {
        const active = value === opt;
        const chipColor = colorMap?.[opt];
        return (
          <button key={opt} onClick={() => onChange(opt)} style={{
            padding: "4px 12px", borderRadius: 6,
            fontSize: 10, fontWeight: 600, letterSpacing: "0.05em",
            fontFamily: "'JetBrains Mono', monospace",
            cursor: "pointer", transition: "all 0.15s ease",
            background: active ? (chipColor?.bg || "rgba(124,58,237,0.2)") : "rgba(255,255,255,0.03)",
            color: active ? (chipColor?.text || "#c084fc") : "rgba(255,255,255,0.3)",
            border: active ? `1px solid ${chipColor?.border || "#7c3aed"}` : "1px solid rgba(255,255,255,0.06)",
          }}>
            {opt}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 20, padding: "10px 0",
      flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.08em" }}>TIER</span>
        <ChipGroup options={tierOptions} value={filters.tier} onChange={v => setFilters(f => ({...f, tier: v}))} colorMap={TIER_COLORS} />
      </div>
      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.08em" }}>COND</span>
        <ChipGroup options={condOptions} value={filters.condition} onChange={v => setFilters(f => ({...f, condition: v}))} />
      </div>
      <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.08em" }}>TIME</span>
        <ChipGroup options={timeOptions} value={filters.time} onChange={v => setFilters(f => ({...f, time: v}))} />
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.08em" }}>SORT</span>
        <select value={filters.sort} onChange={e => setFilters(f => ({...f, sort: e.target.value}))} style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 6, padding: "5px 10px", fontSize: 11,
          color: "#c084fc", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
          cursor: "pointer", outline: "none",
        }}>
          {sortOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );
}

// ─── Deal Table ──────────────────────────────────────────────────────────────

function DealTable({ deals, selectedId, onSelect }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Table Header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "48px 1.8fr 0.6fr 0.6fr 0.8fr 1fr 0.7fr 56px",
        padding: "8px 16px",
        fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.25)",
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "sticky", top: 0, zIndex: 2,
        background: "#0c0a1a",
      }}>
        <span></span>
        <span>CARD</span>
        <span>TIER</span>
        <span>COND</span>
        <span style={{ textAlign: "right" }}>MATCH</span>
        <span style={{ textAlign: "right" }}>PROFIT</span>
        <span style={{ textAlign: "right" }}>ROI</span>
        <span style={{ textAlign: "right" }}>AGO</span>
      </div>

      {/* Rows */}
      {deals.map((deal, i) => {
        const isSelected = selectedId === deal.id;
        const profitColor = deal.profit >= 40 ? "#4ade80" : deal.profit >= 15 ? "#a3e635" : "#facc15";

        return (
          <div
            key={deal.id}
            onClick={() => onSelect(deal.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelect(deal.id); }}
            style={{
              display: "grid",
              gridTemplateColumns: "48px 1.8fr 0.6fr 0.6fr 0.8fr 1fr 0.7fr 56px",
              padding: "10px 16px",
              alignItems: "center",
              cursor: "pointer",
              transition: "all 0.15s ease",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
              borderLeft: isSelected ? "3px solid #7c3aed" : "3px solid transparent",
              background: isSelected ? "rgba(124, 58, 237, 0.08)" : i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
              animation: `rowFadeIn 0.3s ease ${i * 0.04}s both`,
            }}
            onMouseEnter={e => {
              if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            }}
            onMouseLeave={e => {
              if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent";
            }}
          >
            {/* Card Thumbnail */}
            <div style={{
              width: 36, height: 50, borderRadius: 4, overflow: "hidden",
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${TIER_COLORS[deal.tier]?.border || "#333"}44`,
              flexShrink: 0, position: "relative",
            }}>
              <img
                src={deal.img}
                alt={deal.name}
                loading="lazy"
                style={{
                  width: "100%", height: "100%", objectFit: "cover",
                  transition: "transform 0.3s ease",
                }}
                onError={e => { e.target.style.display = "none"; }}
              />
              {/* Tier pip */}
              <div style={{
                position: "absolute", bottom: 2, left: 2,
                width: 10, height: 10, borderRadius: "50%",
                background: TIER_COLORS[deal.tier]?.border || "#333",
                border: "1.5px solid #0c0a1a",
              }} />
            </div>

            {/* Card Name + Set */}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: "#f1f5f9",
                fontFamily: "'IBM Plex Sans', sans-serif",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{deal.name}</div>
              <div style={{
                fontSize: 10, color: "rgba(255,255,255,0.3)",
                fontFamily: "'JetBrains Mono', monospace",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                £{deal.ebayPrice.toFixed(2)} → £{deal.marketPrice.toFixed(2)}
              </div>
            </div>

            {/* Tier */}
            <div><TierBadge tier={deal.tier} /></div>

            {/* Condition */}
            <div><ConditionBadge condition={deal.condition} /></div>

            {/* Match Confidence */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <ConfidenceRing value={deal.confidence} size={36} />
            </div>

            {/* Profit */}
            <div style={{ textAlign: "right" }}>
              <div style={{
                fontSize: 16, fontWeight: 800, color: profitColor,
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em",
              }}>+£{deal.profit.toFixed(2)}</div>
            </div>

            {/* ROI */}
            <div style={{
              textAlign: "right", fontSize: 12, fontWeight: 600,
              color: profitColor, fontFamily: "'JetBrains Mono', monospace",
              opacity: 0.8,
            }}>
              +{deal.profitPct.toFixed(1)}%
            </div>

            {/* Time Ago */}
            <div style={{
              textAlign: "right", fontSize: 11,
              color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace",
            }}>{deal.timeAgo}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── System Status Bar ───────────────────────────────────────────────────────

function SystemStatusBar({ isLive }) {
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => setPulse(p => !p), 1500);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 20, padding: "8px 24px",
      background: "rgba(0,0,0,0.3)", borderTop: "1px solid rgba(255,255,255,0.04)",
      fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
      color: "rgba(255,255,255,0.3)",
      flexShrink: 0,
    }}>
      {/* Live Indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%",
          background: isLive ? "#4ade80" : "#ef4444",
          boxShadow: isLive && pulse ? "0 0 8px #4ade80" : "none",
          transition: "box-shadow 0.3s ease",
        }} />
        <span style={{ color: isLive ? "#4ade80" : "#ef4444", fontWeight: 600 }}>
          {isLive ? "HUNTING" : "PAUSED"}
        </span>
      </div>

      <span style={{ color: "rgba(255,255,255,0.1)" }}>│</span>

      <span>Today: <span style={{ color: "#e2e8f0" }}>5</span></span>
      <span>8G</span>
      <span>5H</span>

      <div style={{ flex: 1 }} />

      <span>eBay <span style={{ color: "#4ade80" }}>●</span> 1/5K</span>
      <span style={{ color: "rgba(255,255,255,0.1)" }}>│</span>
      <span>Scrydex <span style={{ color: "#4ade80" }}>●</span> OK</span>
      <span style={{ color: "rgba(255,255,255,0.1)" }}>│</span>
      <span>Index <span style={{ color: "#4ade80" }}>●</span> 20,302</span>
      <span style={{ color: "rgba(255,255,255,0.1)" }}>│</span>
      <span style={{ color: "rgba(255,255,255,0.2)" }}>21h ago</span>
    </div>
  );
}

// ─── Sidebar Navigation ──────────────────────────────────────────────────────

function Sidebar({ activeView, setActiveView }) {
  const navItems = [
    { id: "dashboard", icon: "⊞", label: "Dashboard" },
    { id: "catalog", icon: "⊟", label: "Catalog" },
    { id: "portfolio", icon: "◈", label: "Portfolio" },
    { id: "alerts", icon: "◉", label: "Alerts", badge: 3 },
    { id: "settings", icon: "⊛", label: "Settings" },
  ];

  return (
    <div style={{
      width: 220, flexShrink: 0,
      display: "flex", flexDirection: "column",
      background: "rgba(0,0,0,0.25)",
      borderRight: "1px solid rgba(255,255,255,0.04)",
    }}>
      {/* Logo */}
      <div style={{
        padding: "20px 20px 24px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: "linear-gradient(135deg, #7c3aed, #a855f7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, color: "#fff", fontWeight: 900,
          boxShadow: "0 4px 16px rgba(124, 58, 237, 0.35)",
        }}>
          P
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", fontFamily: "'IBM Plex Sans', sans-serif", letterSpacing: "-0.02em" }}>PokeSnipe</div>
          <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase" }}>ARBITRAGE</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "0 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map(item => {
          const active = activeView === item.id;
          return (
            <button key={item.id} onClick={() => setActiveView(item.id)} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 14px", borderRadius: 10,
              background: active ? "rgba(124, 58, 237, 0.12)" : "transparent",
              border: "none", cursor: "pointer",
              color: active ? "#c084fc" : "rgba(255,255,255,0.35)",
              transition: "all 0.15s ease",
              position: "relative",
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
            >
              {active && <div style={{
                position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                width: 3, height: 20, borderRadius: 2, background: "#7c3aed",
              }} />}
              <span style={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</span>
              <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, fontFamily: "'IBM Plex Sans', sans-serif" }}>{item.label}</span>
              {item.badge && (
                <span style={{
                  marginLeft: "auto", background: "#ef4444",
                  color: "#fff", fontSize: 9, fontWeight: 700,
                  padding: "2px 6px", borderRadius: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Session Stats */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", marginBottom: 10 }}>
          SESSION
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Sans', sans-serif" }}>Scanned</span>
            <span style={{ fontSize: 11, color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>1,247</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Sans', sans-serif" }}>Deals found</span>
            <span style={{ fontSize: 11, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>8</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Sans', sans-serif" }}>Total profit</span>
            <span style={{ fontSize: 11, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>£270.02</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────

function TopBar({ isLive, setIsLive, searchQuery, setSearchQuery }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "12px 24px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      flexShrink: 0,
    }}>
      {/* Search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        flex: 1, maxWidth: 360,
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10, padding: "8px 14px",
      }}>
        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 14 }}>⌕</span>
        <input
          type="text" placeholder="Search deals..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          style={{
            flex: 1, background: "none", border: "none", outline: "none",
            color: "#e2e8f0", fontSize: 13,
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        />
        <kbd style={{
          fontSize: 9, color: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 4, padding: "2px 6px", fontFamily: "'JetBrains Mono', monospace",
        }}>⌘K</kbd>
      </div>

      <div style={{ flex: 1 }} />

      {/* Summary Stats */}
      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.08em" }}>DEALS</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace" }}>8</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.08em" }}>TOTAL PROFIT</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>£270</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.08em" }}>AVG ROI</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#c084fc", fontFamily: "'JetBrains Mono', monospace" }}>109%</div>
        </div>
      </div>

      <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.06)" }} />

      {/* Live Toggle */}
      <button onClick={() => setIsLive(!isLive)} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 16px", borderRadius: 10,
        background: isLive ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
        border: `1px solid ${isLive ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
        color: isLive ? "#4ade80" : "#ef4444",
        fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
        fontFamily: "'JetBrains Mono', monospace",
        cursor: "pointer", transition: "all 0.15s ease",
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: isLive ? "#4ade80" : "#ef4444",
          boxShadow: isLive ? "0 0 8px #4ade80" : "none",
        }} />
        {isLive ? "LIVE" : "PAUSED"}
      </button>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function PokeSnipeDashboard() {
  const [selectedDealId, setSelectedDealId] = useState(null);
  const [isLive, setIsLive] = useState(true);
  const [activeView, setActiveView] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    tier: "ALL",
    condition: "ALL",
    time: "24H",
    sort: "profit",
  });

  const selectedDeal = DEALS.find(d => d.id === selectedDealId) || null;

  // Filter + Sort
  const filteredDeals = DEALS
    .filter(d => {
      if (filters.tier !== "ALL" && d.tier !== filters.tier) return false;
      if (filters.condition !== "ALL" && d.condition !== filters.condition) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!d.name.toLowerCase().includes(q) && !d.set.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === "profit") return b.profit - a.profit;
      if (filters.sort === "profitPct") return b.profitPct - a.profitPct;
      if (filters.sort === "confidence") return b.confidence - a.confidence;
      return 0;
    });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'IBM Plex Sans', sans-serif;
          background: #08061a;
          color: #e2e8f0;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

        ::selection { background: rgba(124,58,237,0.3); }

        @keyframes rowFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes panelSlide {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }

        input::placeholder { color: rgba(255,255,255,0.2); }

        select option { background: #1a1432; color: #e2e8f0; }
      `}</style>

      <div style={{
        display: "flex", height: "100vh", width: "100vw",
        background: "linear-gradient(180deg, #0c0a1a 0%, #08061a 40%, #0a0818 100%)",
        overflow: "hidden",
      }}>
        {/* Sidebar */}
        <Sidebar activeView={activeView} setActiveView={setActiveView} />

        {/* Main Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <TopBar isLive={isLive} setIsLive={setIsLive} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* Deal List */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
              {/* Filters */}
              <div style={{ padding: "0 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", flexShrink: 0 }}>
                <FilterBar filters={filters} setFilters={setFilters} />
              </div>

              {/* Table */}
              <div style={{ flex: 1, overflow: "auto" }}>
                <DealTable deals={filteredDeals} selectedId={selectedDealId} onSelect={setSelectedDealId} />

                {filteredDeals.length === 0 && (
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: 60, color: "rgba(255,255,255,0.2)", gap: 8,
                  }}>
                    <span style={{ fontSize: 28 }}>∅</span>
                    <span style={{ fontSize: 13, fontFamily: "'IBM Plex Sans', sans-serif" }}>No deals match your filters</span>
                  </div>
                )}
              </div>
            </div>

            {/* Detail Panel */}
            <div style={{
              width: selectedDeal ? 380 : 280,
              flexShrink: 0,
              borderLeft: "1px solid rgba(255,255,255,0.04)",
              background: "rgba(0,0,0,0.15)",
              overflow: "hidden auto",
              transition: "width 0.3s ease",
            }}>
              <DealPanel deal={selectedDeal} onClose={() => setSelectedDealId(null)} />
            </div>
          </div>

          {/* Status Bar */}
          <SystemStatusBar isLive={isLive} />
        </div>
      </div>
    </>
  );
}
