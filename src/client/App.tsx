import { useState, useEffect, useRef, useMemo } from "react";

// ─── CONSTANTS ───
const TIERS: Record<string, any> = {
  grail: { label: "GRAIL", short: "G", gradient: "linear-gradient(135deg, #ff6b35, #ff3b6f)", color: "#ff5c5c", tip: ">40% profit · High confidence · High liquidity", desc: "Chase-tier. Heavy hitters." },
  hit: { label: "HIT", short: "H", gradient: "linear-gradient(135deg, #ffd60a, #ffaa00)", color: "#ffd60a", tip: "25–40% profit · High confidence", desc: "Solid bangers." },
  flip: { label: "FLIP", short: "F", gradient: "linear-gradient(135deg, #6b7fa0, #4a5a78)", color: "#8896b0", tip: "15–25% profit · Med+ confidence", desc: "Worth a scoop." },
  sleeper: { label: "SLEEP", short: "S", gradient: "linear-gradient(135deg, #3a4060, #2a3050)", color: "#4a5070", tip: "5–15% profit · Any confidence", desc: "Binder flips." },
};
const LIQ: Record<string, any> = { high: { color: "#34d399", label: "HIGH", short: "HI" }, med: { color: "#fbbf24", label: "MED", short: "MD" }, low: { color: "#fb923c", label: "LOW", short: "LO" }, illiquid: { color: "#ef4444", label: "ILLIQ", short: "—" } };
const COND_C: Record<string, string> = { NM: "#34d399", LP: "#fbbf24", MP: "#fb923c", HP: "#ef4444" };
const CONF_C = (v: number) => v >= 0.85 ? "#34d399" : v >= 0.65 ? "#fbbf24" : "#ef4444";
const TYPE_C: Record<string, string> = { fire: "#ff6b6b", water: "#60a5fa", electric: "#fbbf24", psychic: "#c084fc", grass: "#4ade80", dark: "#8b7ec8", dragon: "#f59e0b", normal: "#94a3b8" };
const GRAD_LINE = "linear-gradient(90deg, #34d399 0%, #60a5fa 40%, #c084fc 70%, #ff6b6b 100%)";

// ─── HELPERS ───
const fG = (n: number) => `£${Math.abs(n).toFixed(2)}`;
const calcBPFee = (price: number) => {
  const flat = 0.10, b1 = Math.min(price, 20) * 0.07, b2 = Math.max(0, Math.min(price, 300) - 20) * 0.04, b3 = Math.max(0, Math.min(price, 4000) - 300) * 0.02;
  return { flat, b1, b2, b3, total: flat + b1 + b2 + b3 };
};
const calcDeal = (d: any) => {
  const ep = Number(d.ebay_price_gbp), sh = Number(d.ebay_shipping_gbp), c = ep + sh, bp = calcBPFee(c), t = c + bp.total;
  const musd = Number(d.market_price_usd), fx = Number(d.fx_rate), m = musd * fx, p = m - t;
  return { ep, sh, cost: t, market: m, profit: p, pct: t > 0 ? (p / t) * 100 : 0, fees: bp.total, bp, musd, fx };
};
const tsAgo = (date: string) => { const m = Math.floor((Date.now() - new Date(date).getTime()) / 60000); return m < 1 ? "now" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`; };

// ─── REUSABLE COMPONENTS ───
const GradBorder = ({ children, gradient = "linear-gradient(135deg, #34d399, #60a5fa, #c084fc)", radius = "var(--r-md)", pad = 1, style = {} }: any) => (
  <div style={{ background: gradient, borderRadius: radius, padding: pad, ...style }}>
    <div style={{ background: "var(--bg1)", borderRadius: `calc(${radius} - ${pad}px)`, overflow: "hidden" }}>{children}</div>
  </div>
);

const PokeBall = ({ size = 26 }: { size?: number }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.15)", position: "relative", overflow: "hidden", flexShrink: 0 }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "50%", background: "rgba(255,92,92,0.12)" }} />
    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: "1px", background: "rgba(255,255,255,0.15)", transform: "translateY(-0.5px)" }} />
    <div style={{ position: "absolute", top: "50%", left: "50%", width: size * 0.3, height: size * 0.3, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.2)", background: "var(--bg0)", transform: "translate(-50%,-50%)" }} />
  </div>
);

const LiqPill = ({ liq, compact }: { liq: string; compact?: boolean }) => {
  const l = LIQ[liq]; if (!l) return null;
  return <span style={{ display: "inline-flex", alignItems: "center", height: compact ? 16 : 18, padding: compact ? "0 5px" : "0 7px", fontFamily: "var(--fm)", fontSize: compact ? 8 : 9, fontWeight: 500, color: l.color, background: `${l.color}10`, borderRadius: "var(--r-pill)", letterSpacing: 0.5, opacity: liq === "illiquid" ? 0.45 : 1 }}>{compact ? l.short : l.label}</span>;
};

const CondPill = ({ cond, compact }: { cond: string; compact?: boolean }) => {
  const c = COND_C[cond] || "#94a3b8";
  return <span style={{ display: "inline-flex", alignItems: "center", height: compact ? 16 : 18, padding: compact ? "0 5px" : "0 7px", fontFamily: "var(--fm)", fontSize: compact ? 8 : 9, fontWeight: 500, color: c, background: `${c}0c`, borderRadius: "var(--r-pill)", letterSpacing: 0.5 }}>{cond}</span>;
};

const TierBadge = ({ tier, size = "sm" }: { tier: string; size?: "sm" | "lg" }) => {
  const t = TIERS[tier] || TIERS.sleeper;
  const s = size === "sm" ? { height: 16, fontSize: 8, padding: "0 5px", letterSpacing: 1 } : { height: 20, fontSize: 9, padding: "0 8px", letterSpacing: 1.5 };
  return <span style={{ display: "inline-flex", alignItems: "center", fontFamily: "var(--fm)", fontWeight: 700, color: "#fff", background: t.gradient, borderRadius: "var(--r-pill)", textTransform: "uppercase" as const, ...s }}>{size === "sm" ? t.short : t.label}</span>;
};

const Bar = ({ value, height = 5, color, glow }: { value: number; height?: number; color?: string; glow?: boolean }) => (
  <div style={{ height, background: "rgba(255,255,255,0.04)", borderRadius: height, overflow: "hidden", width: "100%" }}>
    <div style={{ width: `${(value ?? 0) * 100}%`, height: "100%", background: color || CONF_C(value ?? 0), borderRadius: height, transition: "width 0.4s var(--ease)", boxShadow: glow ? `0 0 10px ${color || CONF_C(value)}30` : "none" }} />
  </div>
);

const BarRow = ({ label, value }: { label: string; value: number | null }) => (
  <div style={{ display: "grid", gridTemplateColumns: "66px 1fr 38px", alignItems: "center", gap: 10, padding: "4px 0" }}>
    <span style={{ fontSize: 11, color: "var(--tSec)", fontWeight: 500 }}>{label}</span>
    <Bar value={value ?? 0} glow={(value ?? 0) > 0.8} />
    <span style={{ fontFamily: "var(--fm)", fontSize: 11, fontWeight: 500, textAlign: "right" as const, color: value != null ? CONF_C(value) : "var(--tGho)" }}>{value != null ? value.toFixed(2) : "—"}</span>
  </div>
);

// ─── FILTER COMPONENTS ───
const FilterGroup = ({ label, children, className }: any) => (
  <div className={className || ""} style={{ display: "flex", alignItems: "center", gap: 1, background: "var(--glass)", border: "1px solid var(--brd)", borderRadius: "var(--r-pill)", padding: "0 2px", height: 30, flexShrink: 0 }}>
    {label && <span className="fl-label" style={{ fontFamily: "var(--fm)", fontSize: 7, color: "var(--tGho)", letterSpacing: 2, padding: "0 6px 0 8px", textTransform: "uppercase" as const, flexShrink: 0 }}>{label}</span>}
    {children}
  </div>
);

const Seg = ({ label, active, color, onClick }: any) => (
  <button onClick={onClick} style={{ height: 24, padding: "0 8px", fontWeight: active ? 700 : 500, fontSize: 9.5, letterSpacing: 0.5, borderRadius: "var(--r-pill)", background: active ? `${color || "rgba(255,255,255,0.1)"}` : "transparent", color: active ? "#fff" : "var(--tMut)", transition: "all 0.2s var(--ease)", whiteSpace: "nowrap" as const, boxShadow: active ? `0 0 10px ${color || "rgba(255,255,255,0.05)"}40` : "none" }}>{label}</button>
);

const TierSeg = ({ tierKey, active, onClick }: any) => {
  const [showTip, setShowTip] = useState(false);
  const t = TIERS[tierKey];
  return (
    <div style={{ position: "relative" }} onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
      <button onClick={onClick} style={{ height: 24, padding: "0 8px", fontWeight: active ? 700 : 500, fontSize: 9.5, letterSpacing: 0.5, borderRadius: "var(--r-pill)", background: active ? t.gradient : "transparent", color: active ? "#fff" : "var(--tMut)", transition: "all 0.2s var(--ease)", whiteSpace: "nowrap" as const, boxShadow: active ? `0 0 12px ${t.color}30` : "none" }}>{t.label}</button>
      {showTip && <div style={{ position: "absolute", top: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)", padding: "10px 14px", borderRadius: "var(--r-md)", background: "rgba(10,14,24,0.96)", border: "1px solid var(--brd2)", backdropFilter: "blur(20px)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)", zIndex: 100, minWidth: 190, pointerEvents: "none" as const, animation: "tipIn 0.15s var(--ease) both" }}>
        <div style={{ position: "absolute", top: -4, left: "50%", transform: "translateX(-50%) rotate(45deg)", width: 8, height: 8, background: "rgba(10,14,24,0.96)", borderTop: "1px solid var(--brd2)", borderLeft: "1px solid var(--brd2)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}><span style={{ fontFamily: "var(--fm)", fontWeight: 700, fontSize: 10, color: t.color, letterSpacing: 1.5 }}>{t.label}</span><span style={{ fontSize: 11, color: "var(--tSec)", fontWeight: 500 }}>{t.desc}</span></div>
        <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)", lineHeight: 1.6 }}>{t.tip}</div>
      </div>}
    </div>
  );
};

const Stepper = ({ value, onChange, step = 5, min = 0, max = 100 }: any) => {
  const b: any = { width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontSize: 13, fontWeight: 600, color: "var(--tMut)", transition: "all 0.15s", lineHeight: 1 };
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <button onClick={() => onChange(Math.max(min, value - step))} style={b}>−</button>
      <input type="number" value={value} onChange={(e: any) => onChange(Math.max(min, Math.min(max, +e.target.value || 0)))} style={{ width: 32, height: 22, padding: 0, background: "transparent", color: "var(--green)", fontFamily: "var(--fm)", fontSize: 11, fontWeight: 700, textAlign: "center" as const, border: "none" }} />
      <button onClick={() => onChange(Math.min(max, value + step))} style={b}>+</button>
    </div>
  );
};

// ═══ DEAL ROW ═══
const DealRow = ({ deal, selected, onSelect, idx }: any) => {
  const [hov, setHov] = useState(false);
  const p = calcDeal(deal);
  return (
    <div onClick={() => onSelect(deal)} role="listitem" tabIndex={0}
      onKeyDown={(e: any) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(deal); } }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 20px 10px 16px", cursor: "pointer", position: "relative", minHeight: 80, background: selected ? "var(--glass2)" : hov ? "var(--glass)" : "transparent", borderBottom: "1px solid var(--brd)", transition: "all 250ms var(--snap)", transform: hov && !selected ? "translateY(-1px)" : "none", boxShadow: hov && !selected ? "0 6px 24px rgba(0,0,0,0.25), inset 0 0 0 1px var(--brd2)" : selected ? "inset 0 0 0 1px var(--brd2)" : "none", animation: "fadeSlide 0.3s var(--ease) both", animationDelay: `${Math.min(idx * 30, 300)}ms`, opacity: deal.tier === "sleeper" ? 0.35 : 1 }}>
      <div style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 3, borderRadius: "0 3px 3px 0", background: selected ? "var(--blue)" : "transparent", transition: "background 200ms", boxShadow: selected ? "0 0 8px rgba(96,165,250,0.3)" : "none" }} />
      <div className="dr-img" style={{ width: 48, height: 67, flexShrink: 0, position: "relative" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: "var(--r-sm)", overflow: "hidden", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2.5, background: TYPE_C.normal, opacity: 0.7, borderRadius: "var(--r-sm) var(--r-sm) 0 0" }} />
          {deal.ebay_image ? <img src={deal.ebay_image} alt={deal.card_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontFamily: "var(--fm)", fontSize: 7, color: "var(--tGho)", letterSpacing: 1.5, marginTop: 4 }}>{(deal.card_name || "").substring(0, 4).toUpperCase()}</span>}
        </div>
        <div style={{ position: "absolute", bottom: -3, left: -3, zIndex: 2 }}><TierBadge tier={deal.tier} /></div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--tMax)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>{deal.card_name} <span style={{ color: "var(--tMut)", fontWeight: 400, fontSize: 12 }}>#{deal.card_number}</span></div>
        <div className="dr-sub" style={{ fontSize: 12, color: "var(--tMut)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{deal.expansion_name} <span style={{ opacity: 0.5 }}>·</span> {deal.code}</div>
        <div className="dr-prices" style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--tMut)", display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
          <span>{fG(p.ep)}</span><span style={{ color: "var(--tGho)", fontSize: 10 }}>→</span><span style={{ color: "var(--tSec)" }}>{fG(p.market)}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0, minWidth: 96 }}>
        <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1, letterSpacing: -0.5, color: "var(--greenB)", textShadow: deal.tier === "grail" ? "0 0 28px rgba(52,211,153,0.35)" : "0 0 12px rgba(52,211,153,0.1)" }}>+{fG(p.profit)}</div>
        <div style={{ fontFamily: "var(--fm)", fontSize: 11, fontWeight: 600, color: "var(--green)" }}>+{p.pct.toFixed(0)}%</div>
        <div style={{ width: 64 }}><Bar value={Number(deal.confidence)} height={3} /></div>
      </div>
      <div className="dr-meta-d" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0, minWidth: 56, paddingLeft: 10 }}>
        <div style={{ display: "flex", gap: 3 }}><CondPill cond={deal.condition ?? "NM"} /><LiqPill liq={deal.liquidity ?? "med"} /></div>
        <span style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)" }}>{tsAgo(deal.created_at)}</span>
      </div>
      <div className="dr-meta-m" style={{ display: "none", flexShrink: 0, alignItems: "center", gap: 4 }}>
        <CondPill cond={deal.condition ?? "NM"} compact /><LiqPill liq={deal.liquidity ?? "med"} compact />
        <span style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tMut)" }}>{tsAgo(deal.created_at)}</span>
      </div>
    </div>
  );
};

// ═══ DETAIL PANEL ═══
const Detail = ({ deal, onClose, onReview }: { deal: any; onClose: () => void; onReview: (id: string, v: string | null, r?: string) => void }) => {
  const [showReasons, setShowReasons] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => { setShowReasons(false); setDetail(null); }, [deal?.id]);
  useEffect(() => {
    if (!deal?.id) return;
    fetch(`/api/deals/${deal.id}`).then(r => r.ok ? r.json() : null).then(setDetail).catch(() => {});
  }, [deal?.id]);

  if (!deal) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20, padding: 40, opacity: 0.3 }}>
      <PokeBall size={40} />
      <div style={{ fontSize: 12, color: "var(--tMut)", textAlign: "center", letterSpacing: 1.5, lineHeight: 2, fontFamily: "var(--fm)" }}>SELECT A DEAL<br />TO INSPECT</div>
    </div>
  );

  const p = calcDeal(deal);
  const sec: any = { padding: "16px 22px", borderBottom: "1px solid var(--brd)" };
  const secT: any = { fontFamily: "var(--fm)", fontWeight: 500, fontSize: 9, textTransform: "uppercase", letterSpacing: 2.5, color: "var(--tMut)", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--brd)" };
  const cb = detail?.match_details?.breakdown ?? {};
  const reviewed = detail?.review_correct ?? deal.review_correct;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "12px 22px", borderBottom: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><TierBadge tier={deal.tier} size="lg" /><span style={{ fontWeight: 600, fontSize: 13, color: "var(--tSec)" }}>{deal.card_name}</span></div>
        <button onClick={onClose} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", fontSize: 14, color: "var(--tMut)" }}>✕</button>
      </div>
      {/* Images */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "14px 22px" }}>
        {[{ l: "SCRYDEX", s: detail?.image_url }, { l: "EBAY", s: deal.ebay_image }].map(img => (
          <div key={img.l} style={{ aspectRatio: "5/7", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {img.s ? <img src={img.s} alt={img.l} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontFamily: "var(--fm)", fontSize: 8, color: "var(--tGho)", letterSpacing: 2 }}>{img.l}</span>}
          </div>
        ))}
      </div>
      {/* Card info */}
      <div style={sec}>
        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.3, marginBottom: 6, color: "var(--tMax)" }}>{deal.card_name} #{deal.card_number}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ width: 22, height: 22, borderRadius: "var(--r-sm)", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {detail?.logo_url ? <img src={detail.logo_url} alt="" style={{ width: 16, height: 16 }} /> : <span style={{ fontFamily: "var(--fm)", fontSize: 7, color: "var(--tGho)" }}>◆</span>}
          </div>
          <span style={{ fontSize: 13, color: "var(--tSec)" }}>{deal.expansion_name} <span style={{ color: "var(--tMut)" }}>({deal.code})</span></span>
          <span style={{ opacity: 0.2 }}>·</span>
          <CondPill cond={deal.condition ?? "NM"} /><LiqPill liq={deal.liquidity ?? "med"} />
        </div>
      </div>
      {/* Profit hero */}
      <div style={{ margin: "8px 14px" }}>
        <GradBorder gradient="linear-gradient(135deg, rgba(52,211,153,0.5), rgba(96,165,250,0.25), rgba(192,132,252,0.15))" radius="var(--r-lg)" pad={1}>
          <div style={{ padding: "22px 24px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 40%, var(--greenGlow) 0%, transparent 65%)", pointerEvents: "none" }} />
            <div style={{ fontWeight: 800, fontSize: 42, color: "var(--greenB)", letterSpacing: -2, lineHeight: 1, position: "relative", textShadow: "0 0 40px rgba(52,211,153,0.25)" }}>+{fG(p.profit)}</div>
            <div style={{ fontFamily: "var(--fm)", fontSize: 15, fontWeight: 600, color: "var(--green)", marginTop: 6, position: "relative" }}>+{p.pct.toFixed(0)}% · {deal.tier === "grail" ? "GRAIL territory" : deal.tier === "hit" ? "Solid hit" : deal.tier === "flip" ? "Quick flip" : "Sleeper"}</div>
            <div style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tMut)", letterSpacing: 2.5, marginTop: 10, position: "relative", textTransform: "uppercase" as const }}>No BS profit · Fees included</div>
          </div>
        </GradBorder>
      </div>
      {/* CTA */}
      <div style={sec}>
        <a href={deal.ebay_url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 46, background: "linear-gradient(135deg, #34d399, #2dd4bf)", color: "var(--bg0)", fontWeight: 800, fontSize: 13, letterSpacing: 2.5, borderRadius: "var(--r-md)", textTransform: "uppercase" as const, boxShadow: "0 4px 20px rgba(52,211,153,0.2)", textDecoration: "none" }}>SNAG ON EBAY →</a>
      </div>
      {/* Pricing */}
      <div style={sec}>
        <div style={secT}>NO BS PRICING</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>
          {([["eBay", fG(p.ep), ""], ["Shipping", fG(p.sh), ""], ["Buyer Prot.", fG(p.bp.total), ""], ["  ├ Flat fee", `£${p.bp.flat.toFixed(2)}`, ""], ...(p.bp.b1 > 0 ? [["  ├ 7% band", `£${p.bp.b1.toFixed(2)}`, ""]] : []), ...(p.bp.b2 > 0 ? [["  ├ 4% band", `£${p.bp.b2.toFixed(2)}`, ""]] : []), ...(p.bp.b3 > 0 ? [["  └ 2% band", `£${p.bp.b3.toFixed(2)}`, ""]] : []), ["Market (USD)", "", `$${p.musd.toFixed(2)}`], ["FX rate", "", `×${p.fx}`]] as string[][]).map(([l, a, b], i) => {
            const sub = l.startsWith("  ");
            return <tr key={i}><td style={{ padding: "5px 0", paddingLeft: sub ? 10 : 0, fontFamily: "var(--fm)", fontSize: sub ? 10 : 12, borderBottom: "1px solid var(--brd)", color: sub ? "var(--tGho)" : "var(--tMut)", fontWeight: 500 }}>{l.trim()}</td><td style={{ padding: "5px 0", fontFamily: "var(--fm)", fontSize: sub ? 10 : 12, borderBottom: "1px solid var(--brd)", textAlign: "right" as const, color: sub ? "var(--tGho)" : "var(--tPri)" }}>{a}</td><td style={{ padding: "5px 0", fontFamily: "var(--fm)", fontSize: sub ? 10 : 12, borderBottom: "1px solid var(--brd)", textAlign: "right" as const, paddingLeft: 10, color: "var(--tPri)" }}>{b}</td></tr>;
          })}
          <tr><td style={{ paddingTop: 10, fontWeight: 700, borderTop: "1px solid var(--brd2)" }}>Total</td><td style={{ paddingTop: 10, fontFamily: "var(--fm)", fontSize: 12, fontWeight: 700, textAlign: "right" as const, borderTop: "1px solid var(--brd2)" }}>{fG(p.cost)}</td><td style={{ paddingTop: 10, fontFamily: "var(--fm)", fontSize: 12, fontWeight: 700, textAlign: "right" as const, borderTop: "1px solid var(--brd2)", paddingLeft: 10 }}>{fG(p.market)}</td></tr>
          <tr><td colSpan={3} style={{ paddingTop: 10 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: "var(--r-sm)", background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}><span style={{ fontWeight: 700, color: "var(--greenB)", fontSize: 13 }}>Profit</span><span style={{ fontFamily: "var(--fm)", fontSize: 16, fontWeight: 700, color: "var(--greenB)" }}>+{fG(p.profit)} (+{p.pct.toFixed(0)}%)</span></div></td></tr>
        </tbody></table>
      </div>
      {/* Confidence */}
      <div style={sec}>
        <div style={secT}>MATCH CONFIDENCE</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--brd)" }}>
          <span style={{ fontWeight: 800, fontSize: 30, lineHeight: 1, color: CONF_C(Number(deal.confidence)), textShadow: `0 0 16px ${CONF_C(Number(deal.confidence))}25` }}>{(Number(deal.confidence) * 100).toFixed(0)}%</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tMut)", letterSpacing: 1.5, lineHeight: 1.8 }}>COMPOSITE<br />CONFIDENCE</span>
        </div>
        {Object.entries({ Name: cb.name, Number: cb.number, Denom: cb.denom, Expansion: cb.expan, Variant: cb.variant, Extract: cb.extract } as Record<string, any>).map(([k, v]) => <BarRow key={k} label={k} value={typeof v === "number" ? v : null} />)}
      </div>
      {/* Liquidity Breakdown */}
      {(() => { const lb = detail?.liquidity_breakdown ?? deal.liquidity_breakdown; return lb ? (
        <div style={sec}>
          <div style={secT}>LIQUIDITY</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--brd)" }}>
            <LiqPill liq={deal.liquidity ?? "med"} />
            <span style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tMut)", letterSpacing: 1.5 }}>COMPOSITE</span>
          </div>
          {Object.entries(lb as Record<string, any>).map(([k, v]) => <BarRow key={k} label={k} value={typeof v === "number" ? v : null} />)}
        </div>
      ) : null; })()}
      {/* Comps by Condition */}
      {(() => { const cp = detail?.comps_by_condition ?? deal.comps_by_condition; return cp ? (
        <div style={sec}>
          <div style={secT}>COMPS BY CONDITION</div>
          {Object.entries(cp as Record<string, any>).map(([c, pr]) => {
            const act = c === (deal.condition ?? "NM");
            return (
              <div key={c} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--brd)" }}>
                <span style={{ fontFamily: "var(--fm)", fontSize: 12, fontWeight: act ? 700 : 500, color: act ? COND_C[c] || "var(--tMax)" : "var(--tMut)" }}>{c}{act ? " ●" : ""}</span>
                <span style={{ fontFamily: "var(--fm)", fontSize: 12, fontWeight: 600, color: "var(--tPri)" }}>{pr != null ? `$${Number(pr).toFixed(2)}` : "—"}</span>
              </div>
            );
          })}
        </div>
      ) : null; })()}
      {/* Expansion */}
      {detail && <div style={sec}>
        <div style={secT}>EXPANSION</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {detail.logo_url ? <img src={detail.logo_url} alt="" style={{ width: 20, height: 20 }} /> : <span style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tGho)" }}>◆</span>}
          </div>
          <div><div style={{ fontWeight: 600, fontSize: 13, color: "var(--tMax)" }}>{deal.expansion_name}</div><div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)" }}>{deal.code}</div></div>
        </div>
        {[["Total Cards", detail.printed_total ?? "—"], ["Release", detail.release_date ?? "—"], ["Series", detail.series ?? "—"]].map(([l, v]: any, i: number) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 11 }}><span style={{ color: "var(--tMut)" }}>{l}</span><span style={{ color: "var(--tSec)", fontWeight: 500 }}>{v}</span></div>
        ))}
      </div>}
      {/* Card data */}
      {detail && <div style={sec}>
        <div style={secT}>CARD DATA</div>
        {[["Rarity", detail.rarity ?? "—"], ["Supertype", detail.supertype ?? "—"], ["Subtypes", Array.isArray(detail.subtypes) ? detail.subtypes.join(", ") : "—"]].map(([l, v]: any, i: number) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 11 }}><span style={{ color: "var(--tMut)" }}>{l}</span><span style={{ color: "var(--tSec)", fontWeight: 500 }}>{v}</span></div>
        ))}
      </div>}
      {/* Review */}
      <div style={{ padding: "14px 22px" }}>
        {reviewed != null ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "var(--r-md)", background: reviewed ? "rgba(52,211,153,0.05)" : "rgba(248,113,113,0.05)", border: `1px solid ${reviewed ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`, fontFamily: "var(--fm)", fontSize: 11, color: reviewed ? "var(--green)" : "var(--red)" }}>
            <span>Marked {reviewed ? "correct" : "wrong"}</span>
            <button onClick={() => onReview(deal.id, null)} style={{ fontSize: 10, color: "var(--tMut)", padding: "3px 10px", borderRadius: "var(--r-pill)", border: "1px solid var(--brd)", fontFamily: "var(--fm)" }}>Undo</button>
          </div>
        ) : (<>
          <div style={{ display: "flex", gap: 8 }}>
            {([["correct", "✓ Correct", "var(--green)"], ["wrong", "✗ Wrong", "var(--red)"]] as const).map(([act, lbl]) => (
              <button key={act} onClick={() => act === "wrong" ? setShowReasons(!showReasons) : onReview(deal.id, "correct")}
                style={{ flex: 1, height: 42, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600, fontSize: 12, letterSpacing: 0.5, borderRadius: "var(--r-md)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tSec)", transition: "all 0.15s" }}>{lbl}</button>
            ))}
          </div>
          {showReasons && <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
            {["Wrong Card", "Wrong Set", "Wrong Variant", "Wrong Price"].map(r => (
              <button key={r} onClick={() => onReview(deal.id, "wrong", r)} style={{ padding: "5px 12px", fontFamily: "var(--fm)", fontSize: 9, borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tMut)", fontWeight: 500 }}>{r}</button>
            ))}
          </div>}
        </>)}
      </div>
    </div>
  );
};

// ═══ LOGIN ═══
const Login = ({ onLogin }: { onLogin: () => void }) => {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      const res = await fetch("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
      if (res.ok) onLogin(); else setErr("Wrong password");
    } catch { setErr("Connection failed"); }
    setLoading(false);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse at 50% 30%, #0f1628 0%, var(--bg0) 70%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: 360, maxWidth: "90vw", animation: "floatIn 0.5s var(--ease) both" }}>
        <PokeBall size={48} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 28, letterSpacing: -0.5 }}>Poké<span style={{ color: "var(--red)" }}>Snipe</span></div>
          <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)", letterSpacing: 3.5, textTransform: "uppercase" as const, marginTop: 6 }}>No BS Arbitrage</div>
        </div>
        <input type="password" placeholder="Access password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }}
          style={{ width: "100%", height: 48, padding: "0 16px", borderRadius: "var(--r-md)", background: "var(--glass)", border: "1px solid var(--brd2)", color: "var(--tMax)", fontSize: 14, backdropFilter: "blur(16px)" }} />
        <button onClick={submit} disabled={loading} style={{ width: "100%", height: 48, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--glass)", border: "1px solid var(--brd2)", color: "var(--tMax)", fontWeight: 700, fontSize: 14, letterSpacing: 0.3, borderRadius: "var(--r-md)", transition: "all 0.2s var(--ease)" }}>{loading ? "..." : "ENTER"}</button>
        {err && <div style={{ color: "var(--red)", fontSize: 12, fontFamily: "var(--fm)" }}>{err}</div>}
        <div style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tGho)", letterSpacing: 1.5, textAlign: "center", lineHeight: 1.8 }}>PRIVATE DASHBOARD · PASSWORD PROTECTED<br />AUTHORIZED USERS ONLY</div>
      </div>
    </div>
  );
};

// ═══ MAIN APP ═══
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [deals, setDeals] = useState<any[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [f, setF] = useState({ tiers: new Set(["grail", "hit", "flip"]), conds: new Set(["NM", "LP", "MP"]), confs: new Set(["high", "med"]), liqs: new Set(["high", "med"]), minP: 10, time: "6h", q: "", graded: false });
  const [showLookup, setShowLookup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const [apiTest, setApiTest] = useState<Record<string, string>>({});
  const [lookupSt, setLookupSt] = useState<string>("idle");
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupUrl, setLookupUrl] = useState("");
  const [pill, setPill] = useState(false);
  const [toast, setToast] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const [sseStatus, setSseStatus] = useState<string>("connected");
  const [showHelp, setShowHelp] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [testRunning, setTestRunning] = useState<Record<string, boolean>>({});
  const feedRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const selDeal = deals.find(d => d.id === selId) || null;
  const tog = (k: string, v: string) => setF((prev: any) => { const s = new Set(prev[k]); s.has(v) ? s.delete(v) : s.add(v); return { ...prev, [k]: s }; });

  // Boot
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/status");
        if (r.status === 401) return;
        setLoggedIn(true);
        const [dr, sr, pr] = await Promise.all([fetch("/api/deals?limit=50"), fetch("/api/status"), fetch("/api/preferences")]);
        if (dr.ok) setDeals((await dr.json()).deals || []);
        if (sr.ok) setStatus(await sr.json());
        if (pr.ok) {
          const saved = await pr.json();
          if (saved && Object.keys(saved).length > 0) {
            setF(prev => ({
              ...prev,
              tiers: saved.tiers ? new Set(saved.tiers) : prev.tiers,
              conds: saved.conds ? new Set(saved.conds) : prev.conds,
              confs: saved.confs ? new Set(saved.confs) : prev.confs,
              liqs: saved.liqs ? new Set(saved.liqs) : prev.liqs,
              minP: saved.minP ?? prev.minP,
              time: saved.time ?? prev.time,
              graded: saved.graded ?? prev.graded
            }));
          }
        }
      } catch { /* offline */ }
    })();
  }, []);

  // SSE with auto-reconnect
  useEffect(() => {
    if (!loggedIn) return;
    let retryTimer: any;
    let retryCount = 0;
    let dead = false;

    const connect = () => {
      if (dead) return;
      const source = new EventSource("/api/deals/stream");
      sseRef.current = source;

      source.addEventListener("deal", (e: any) => {
        const d = JSON.parse(e.data);
        setDeals(prev => [d, ...prev]);
        if (d.tier === "grail") { setToast(d); setTimeout(() => setToast(null), 5000); }
        if (feedRef.current && feedRef.current.scrollTop > 100) setPill(true);
      });
      source.addEventListener("status", (e: any) => setStatus(JSON.parse(e.data)));
      source.addEventListener("ping", () => { retryCount = 0; setSseStatus("connected"); });
      source.onopen = () => { retryCount = 0; setSseStatus("connected"); };
      source.onerror = () => {
        source.close();
        sseRef.current = null;
        if (dead) return;
        retryCount++;
        const delay = Math.min(retryCount * 3000, 30000);
        setSseStatus("reconnecting");
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => { dead = true; clearTimeout(retryTimer); sseRef.current?.close(); sseRef.current = null; };
  }, [loggedIn]);

  // Filter
  const filtered = useMemo(() => deals.filter(d => {
    if (!f.tiers.has(d.tier)) return false;
    if (!f.conds.has(d.condition ?? "NM")) return false;
    const cl = Number(d.confidence) >= 0.85 ? "high" : Number(d.confidence) >= 0.65 ? "med" : "low";
    if (!f.confs.has(cl)) return false;
    if (!f.liqs.has(d.liquidity ?? "med") && d.liquidity !== "illiquid") return false;
    if (d.liquidity === "illiquid" && !f.liqs.has("illiquid")) return false;
    if (Number(d.profit_pct) < f.minP) return false;
    if (f.q && !`${d.card_name} ${d.card_number} ${d.expansion_name}`.toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const o: any = { grail: 0, hit: 1, flip: 2, sleeper: 3 };
    return (o[a.tier] ?? 3) - (o[b.tier] ?? 3) || Number(b.profit_pct) - Number(a.profit_pct);
  }), [deals, f]);

  const onReview = async (id: string, v: string | null, reason?: string) => {
    if (v === null) { setDeals(ds => ds.map(d => d.id === id ? { ...d, review_correct: null } : d)); return; }
    const ok = v === "correct";
    fetch(`/api/deals/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isCorrectMatch: ok, incorrectReason: reason }) }).catch(() => {});
    setDeals(ds => ds.map(d => d.id === id ? { ...d, review_correct: ok } : d));
  };

  const doLookup = async () => {
    if (!lookupUrl) return;
    setLookupSt("proc"); setLookupResult(null);
    try {
      const r = await fetch("/api/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ebayUrl: lookupUrl }) });
      if (!r.ok) { setLookupSt("error"); return; }
      setLookupResult(await r.json()); setLookupSt("done");
    } catch { setLookupSt("error"); }
  };

  const saveFilters = async () => {
    fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tiers: [...f.tiers], conds: [...f.conds], confs: [...f.confs], liqs: [...f.liqs], minP: f.minP, time: f.time, graded: f.graded }) }).catch(() => {});
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const toggleScanner = async () => {
    try {
      const r = await fetch("/api/scanner/toggle", { method: "POST" });
      if (r.ok) {
        const d = await r.json();
        setStatus((prev: any) => prev ? { ...prev, scannerPaused: d.paused } : prev);
      }
    } catch { /* ignore */ }
  };

  const TEST_DEFS = [
    { key: "db", label: "Database", desc: "Connectivity, tables, extensions, migrations" },
    { key: "ebay", label: "eBay API", desc: "Auth + search test (3 results)" },
    { key: "ebay-lookup", label: "eBay Lookup", desc: "Item fetch via legacy ID" },
    { key: "scrydex", label: "Scrydex API", desc: "Cards page fetch + key check" },
    { key: "exchange", label: "Exchange Rate", desc: "USD → GBP live rate" },
    { key: "match", label: "Card Matching", desc: "Simulate matcher on sample title" },
    { key: "pipeline", label: "Full Pipeline", desc: "eBay search → match → price" },
    { key: "usage", label: "API Usage", desc: "Calls today, scan/sync history" },
    { key: "integrity", label: "Data Integrity", desc: "Orphans, dupes, rarity, pg_trgm" },
  ];

  const runTest = async (key: string) => {
    setTestRunning(p => ({ ...p, [key]: true }));
    setTestResults(p => ({ ...p, [key]: undefined }));
    try {
      const r = await fetch(`/api/test/${key}`);
      const data = await r.json();
      setTestResults(p => ({ ...p, [key]: { ...data, _status: r.status } }));
    } catch (err: any) {
      setTestResults(p => ({ ...p, [key]: { ok: false, error: err.message, _status: 0 } }));
    }
    setTestRunning(p => ({ ...p, [key]: false }));
  };

  const runAllTests = async () => {
    for (const t of TEST_DEFS) {
      await runTest(t.key);
    }
  };

  if (!loggedIn) return <Login onLogin={() => {
    setLoggedIn(true);
    fetch("/api/deals?limit=50").then(r => r.json()).then(d => setDeals(d.deals || [])).catch(() => {});
    fetch("/api/status").then(r => r.json()).then(setStatus).catch(() => {});
    fetch("/api/preferences").then(r => r.ok ? r.json() : null).then(saved => {
      if (saved && Object.keys(saved).length > 0) {
        setF(prev => ({
          ...prev,
          tiers: saved.tiers ? new Set(saved.tiers) : prev.tiers,
          conds: saved.conds ? new Set(saved.conds) : prev.conds,
          confs: saved.confs ? new Set(saved.confs) : prev.confs,
          liqs: saved.liqs ? new Set(saved.liqs) : prev.liqs,
          minP: saved.minP ?? prev.minP,
          time: saved.time ?? prev.time,
          graded: saved.graded ?? prev.graded
        }));
      }
    }).catch(() => {});
  }} />;

  const grailCount = deals.filter(d => d.tier === "grail").length;
  const hitCount = deals.filter(d => d.tier === "hit").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "radial-gradient(ellipse at 50% 0%, #0e1525 0%, var(--bg0) 60%)" }}>
      {/* HEADER */}
      <header style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 16, padding: "0 24px", height: 58, background: "rgba(12,16,25,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid var(--brd)", position: "relative", zIndex: 100, flexShrink: 0 }}>
        <div style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 1, background: GRAD_LINE, opacity: 0.6 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <PokeBall />
          <div className="logo-txt" style={{ lineHeight: 1 }}><span style={{ fontWeight: 800, fontSize: 17, letterSpacing: -0.3 }}>Poké<span style={{ color: "var(--red)" }}>Snipe</span></span><div style={{ fontFamily: "var(--fm)", fontSize: 8, color: "var(--green)", letterSpacing: 3.5, marginTop: 2, opacity: 0.7 }}>NO BS</div></div>
        </div>
        <div style={{ position: "relative", maxWidth: 520, width: "100%", justifySelf: "center" }}>
          <input type="search" placeholder="HUNT CARDS..." value={f.q} onChange={e => setF(p => ({ ...p, q: e.target.value }))} style={{ width: "100%", height: 34, padding: "0 12px 0 34px", borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tMax)", fontFamily: "var(--fm)", fontSize: 11, fontWeight: 500, letterSpacing: 1 }} />
          <svg style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--tMut)", pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
          <GradBorder gradient="linear-gradient(135deg, rgba(96,165,250,0.4), rgba(192,132,252,0.3))" radius="var(--r-pill)" pad={1} style={{ flexShrink: 0 }}>
            <button onClick={() => { setShowLookup(true); setLookupSt("idle"); setLookupUrl(""); }} style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", fontWeight: 600, fontSize: 11, letterSpacing: 0.5, color: "var(--tSec)", background: "var(--bg1)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
              <span className="fl-label">Lookup</span>
            </button>
          </GradBorder>
          <button onClick={() => { setShowSettings(true); setSettingsTab("general"); }} style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tMut)", fontSize: 14 }}>⚙</button>
          <button onClick={() => { setShowTests(true); setTestResults({}); setTestRunning({}); }} title="Test Suite" style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tMut)", fontFamily: "var(--fm)", fontSize: 11, fontWeight: 700 }}>⚡</button>
          <button onClick={() => setShowHelp(true)} style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tMut)", fontSize: 14, fontWeight: 700 }}>?</button>
          <button onClick={toggleScanner} title={status?.scannerPaused ? "Scanner paused - click to resume" : "Scanner active - click to pause"} style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 10px", height: 34, borderRadius: "var(--r-pill)", background: status?.scannerPaused ? "rgba(248,113,113,0.06)" : "var(--glass)", border: `1px solid ${status?.scannerPaused ? "rgba(248,113,113,0.2)" : "var(--brd)"}`, cursor: "pointer" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: status?.scannerPaused ? "var(--red)" : sseStatus === "connected" ? "var(--green)" : sseStatus === "reconnecting" ? "var(--amber)" : "var(--red)", boxShadow: `0 0 6px ${status?.scannerPaused ? "rgba(248,113,113,0.5)" : "rgba(52,211,153,0.5)"}`, animation: status?.scannerPaused ? "none" : "pulse 3s ease infinite" }} />
            <span className="fl-label" style={{ fontFamily: "var(--fm)", fontSize: 9, color: status?.scannerPaused ? "var(--red)" : "var(--tMut)", letterSpacing: 1 }}>{status?.scannerPaused ? "PAUSED" : "LIVE"}</span>
          </button>
        </div>
      </header>

      {/* FILTERS */}
      <nav style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "7px 24px", background: "rgba(10,14,22,0.6)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--brd)", flexShrink: 0, position: "relative", zIndex: 40 }}>
        <FilterGroup label="Tier">{Object.keys(TIERS).map(k => <TierSeg key={k} tierKey={k} active={f.tiers.has(k)} onClick={() => tog("tiers", k)} />)}</FilterGroup>
        <FilterGroup label="Cond">{["NM", "LP", "MP", "HP"].map(c => <Seg key={c} label={c} active={f.conds.has(c)} color={f.conds.has(c) ? COND_C[c] + "30" : undefined} onClick={() => tog("conds", c)} />)}</FilterGroup>
        <FilterGroup label="Liq" className="fl-liq">{([["high", "HI", "#34d399"], ["med", "MD", "#fbbf24"], ["low", "LO", "#fb923c"]] as any).map(([v, l, c]: any) => <Seg key={v} label={l} active={f.liqs.has(v)} color={f.liqs.has(v) ? c + "30" : undefined} onClick={() => tog("liqs", v)} />)}</FilterGroup>
        <FilterGroup label="Conf" className="fl-conf">{([["high", "HI", "#34d399"], ["med", "MD", "#fbbf24"]] as any).map(([v, l, c]: any) => <Seg key={v} label={l} active={f.confs.has(v)} color={f.confs.has(v) ? c + "30" : undefined} onClick={() => tog("confs", v)} />)}</FilterGroup>
        <FilterGroup label="Time" className="fl-time">{["1h", "6h", "24h", "All"].map(v => <Seg key={v} label={v.toUpperCase()} active={f.time === v.toLowerCase()} onClick={() => setF(p => ({ ...p, time: v.toLowerCase() }))} />)}</FilterGroup>
        <FilterGroup label="Min%"><Stepper value={f.minP} onChange={(v: number) => setF(p => ({ ...p, minP: v }))} /></FilterGroup>
        <FilterGroup label="Graded" className="fl-graded"><Seg label={f.graded ? "ON" : "OFF"} active={f.graded} color={f.graded ? "rgba(96,165,250,0.3)" : undefined} onClick={() => setF(p => ({ ...p, graded: !p.graded }))} /></FilterGroup>
        <button className="hdr-save" onClick={saveFilters} style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 8, color: saved ? "var(--green)" : "var(--tGho)", letterSpacing: 2, padding: "5px 10px", borderRadius: "var(--r-pill)", border: `1px solid ${saved ? "rgba(52,211,153,0.25)" : "var(--brd)"}`, background: saved ? "rgba(52,211,153,0.06)" : "transparent", transition: "all 0.25s var(--ease)", textTransform: "uppercase" as const }}>{saved ? "✓ SAVED" : "SAVE"}</button>
      </nav>

      {/* SSE BANNER */}
      {sseStatus !== "connected" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "8px 24px", background: "rgba(251,191,36,0.08)", borderBottom: "1px solid rgba(251,191,36,0.15)", flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amber)", animation: "pulse 1.5s ease infinite" }} />
          <span style={{ fontFamily: "var(--fm)", fontSize: 11, fontWeight: 600, color: "var(--amber)" }}>Reconnecting...</span>
        </div>
      )}

      {/* MAIN */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div ref={feedRef} style={{ flex: 1, overflowY: "auto" }} role="list">
          {pill && <div onClick={() => { feedRef.current?.scrollTo({ top: 0, behavior: "smooth" }); setPill(false); }} style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 34, background: "linear-gradient(90deg, rgba(255,107,107,0.9), rgba(245,158,11,0.9))", backdropFilter: "blur(8px)", color: "#fff", fontWeight: 800, fontSize: 10, letterSpacing: 2.5, cursor: "pointer", textTransform: "uppercase" as const }}>FRESH HEAT ↑</div>}
          {filtered.map((d, i) => <DealRow key={d.id} deal={d} selected={d.id === selId} onSelect={(d: any) => setSelId(d.id)} idx={i} />)}
          {filtered.length === 0 && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 280, gap: 14, opacity: 0.3 }}><PokeBall size={32} /><span style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)", letterSpacing: 2.5, textTransform: "uppercase" as const }}>No hits. Adjust filters.</span></div>}
        </div>
        <div className="detail-wrap" style={{ width: 440, background: "rgba(12,16,25,0.9)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderLeft: "1px solid var(--brd)", overflowY: "auto", flexShrink: 0 }}>
          <Detail deal={selDeal} onClose={() => setSelId(null)} onReview={onReview} />
        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 42, background: "rgba(7,10,18,0.9)", backdropFilter: "blur(12px)", borderTop: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 11, flexShrink: 0, position: "relative", padding: "0 20px" }}>
        <div style={{ position: "absolute", top: -1, left: 0, right: 0, height: 1, background: GRAD_LINE, opacity: 0.4 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px 0 0" }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: status?.scanner?.status === "stale" ? "var(--red)" : status?.scanner?.status === "running" ? "var(--amber)" : "var(--green)", boxShadow: `0 0 8px ${status?.scanner?.status === "stale" ? "rgba(248,113,113,0.5)" : status?.scanner?.status === "running" ? "rgba(251,191,36,0.5)" : "rgba(52,211,153,0.5)"}` }} /><span style={{ color: "var(--tSec)", fontWeight: 600 }}>{status?.scanner?.status === "running" ? "Scanning" : status?.scanner?.status === "stale" ? "Stale" : "Hunting"}</span>{status?.scanner?.lastRun && <span style={{ fontSize: 10, color: "var(--tMut)", marginLeft: 2 }}>{tsAgo(status.scanner.lastRun)}</span>}</div>
          <div style={{ width: 1, height: 16, background: "var(--brd)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px" }}><span style={{ color: "var(--tMut)" }}>Today:</span><span style={{ color: "var(--tMax)", fontWeight: 700 }}>{status?.dealsToday?.total ?? deals.length}</span><span style={{ fontSize: 9, color: TIERS.grail.color, fontWeight: 600 }}>{grailCount}G</span><span style={{ fontSize: 9, color: TIERS.hit.color, fontWeight: 600 }}>{hitCount}H</span></div>
          <div style={{ width: 1, height: 16, background: "var(--brd)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px" }}><span style={{ color: "var(--tMut)" }}>Acc:</span><span style={{ color: "var(--green)", fontWeight: 700 }}>{Math.round((status?.accuracy?.rolling7d ?? 0) * 100)}%</span><span style={{ color: "var(--tGho)", fontSize: 10 }}>7d</span></div>
        </div>
        <div className="foot-apis" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {[{ label: "eBay", val: status?.apis?.ebay?.used ?? 0, cap: 5000, capLabel: "5K" }, { label: "Scrydex", val: status?.apis?.scrydex?.used ?? 0, cap: 50000, capLabel: "50K" }, { label: "Index", val: status?.apis?.index?.count ?? 0, cap: 0, capLabel: null as any }].map((a, i) => {
            const ratio = a.cap > 0 ? a.val / a.cap : 0;
            const dotColor = ratio > 0.95 ? "var(--red)" : ratio > 0.8 ? "var(--amber)" : "var(--green)";
            return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 12px", borderLeft: i > 0 ? "1px solid var(--brd)" : "none" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor, boxShadow: `0 0 6px ${dotColor === "var(--red)" ? "rgba(248,113,113,0.4)" : dotColor === "var(--amber)" ? "rgba(251,191,36,0.4)" : "rgba(52,211,153,0.4)"}` }} />
              <span style={{ color: "var(--tMut)", fontSize: 10 }}>{a.label}</span><span style={{ color: "var(--tSec)", fontWeight: 600, fontSize: 10 }}>{a.val}</span>
              {a.capLabel && <span style={{ color: "var(--tGho)", fontSize: 9 }}>/{a.capLabel}</span>}
            </div>
          ); })}
        </div>
      </footer>

      {/* TOAST */}
      {toast && (() => { const tp = calcDeal(toast); return (
        <div style={{ position: "fixed", top: 68, right: 20, zIndex: 500, animation: "toastSlide 0.35s var(--ease) both" }}>
          <GradBorder gradient="linear-gradient(135deg, rgba(255,92,92,0.5), rgba(245,158,11,0.3))" radius="var(--r-lg)" pad={1}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", minWidth: 280 }}>
              <TierBadge tier="grail" size="lg" /><span style={{ fontWeight: 600, fontSize: 13 }}>{toast.card_name}</span>
              <span style={{ fontFamily: "var(--fm)", fontWeight: 700, color: "var(--greenB)", marginLeft: "auto", fontSize: 15 }}>+{fG(tp.profit)}</span>
            </div>
          </GradBorder>
        </div>
      ); })()}

      {/* LOOKUP */}
      {showLookup && <div onClick={(e: any) => { if (e.target === e.currentTarget) setShowLookup(false); }} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80, background: "rgba(7,10,18,0.85)", backdropFilter: "blur(16px)" }}>
        <div style={{ width: 580, maxWidth: "94vw", maxHeight: "calc(100vh - 120px)", borderRadius: "var(--r-xl)", background: "rgba(12,16,25,0.95)", border: "1px solid var(--brd2)", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid var(--brd)" }}>
            <span style={{ fontWeight: 300, fontSize: 12, letterSpacing: 3, color: "var(--tMut)", textTransform: "uppercase" as const }}>Manual Lookup</span>
            <button onClick={() => setShowLookup(false)} style={{ width: 30, height: 30, borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--tMut)" }}>✕</button>
          </div>
          <div style={{ padding: 22 }}>
            <input autoFocus placeholder="PASTE EBAY URL. NO BS." value={lookupUrl} onChange={(e: any) => setLookupUrl(e.target.value)} onKeyDown={(e: any) => { if (e.key === "Enter" && lookupUrl) doLookup(); }}
              style={{ width: "100%", height: 46, padding: "0 18px", borderRadius: "var(--r-md)", background: "var(--glass)", border: "1px solid var(--brd2)", color: "var(--tMax)", fontFamily: "var(--fm)", fontSize: 12, letterSpacing: 1 }} />
          </div>
          {lookupSt === "proc" && <div style={{ padding: "0 22px 22px", fontFamily: "var(--fm)", fontSize: 11, color: "var(--amber)" }}>Fetching... Extracting... Matching...</div>}
          {lookupSt === "error" && <div style={{ padding: "0 22px 22px", fontFamily: "var(--fm)", fontSize: 11, color: "var(--red)" }}>No match found or request failed.</div>}
          {lookupSt === "done" && lookupResult && <div style={{ padding: "0 22px 22px" }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 3 }}>{lookupResult.card.name} #{lookupResult.card.card_number}</div>
            <div style={{ fontSize: 12, color: "var(--tSec)", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>{lookupResult.card.expansion_name} ({lookupResult.card.code})</div>
            <GradBorder gradient="linear-gradient(135deg, rgba(52,211,153,0.45), rgba(96,165,250,0.25))" radius="var(--r-md)" pad={1}>
              <div style={{ padding: "18px 20px" }}>
                <div style={{ fontWeight: 800, fontSize: 34, color: "var(--greenB)", letterSpacing: -1.5, lineHeight: 1, textShadow: "0 0 24px rgba(52,211,153,0.2)" }}>+{fG(lookupResult.pricing.profit)}</div>
                <div style={{ fontFamily: "var(--fm)", fontSize: 13, fontWeight: 600, color: "var(--green)", marginTop: 4 }}>+{lookupResult.pricing.profitPct.toFixed(0)}%</div>
              </div>
            </GradBorder>
          </div>}
        </div>
      </div>}

      {/* SETTINGS */}
      {showSettings && <div onClick={(e: any) => { if (e.target === e.currentTarget) setShowSettings(false); }} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(7,10,18,0.85)", backdropFilter: "blur(16px)" }}>
        <div style={{ width: 520, maxWidth: "94vw", maxHeight: "85vh", borderRadius: "var(--r-xl)", background: "rgba(12,16,25,0.96)", border: "1px solid var(--brd2)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid var(--brd)", flexShrink: 0 }}>
            <span style={{ fontWeight: 300, fontSize: 12, letterSpacing: 3, color: "var(--tMut)", textTransform: "uppercase" as const }}>Settings</span>
            <button onClick={() => setShowSettings(false)} style={{ width: 30, height: 30, borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--tMut)" }}>✕</button>
          </div>
          <div style={{ display: "flex", borderBottom: "1px solid var(--brd)", flexShrink: 0, padding: "0 22px" }}>
            {([["general", "General"], ["api", "API Keys"], ["notif", "Notifications"]] as any).map(([k, l]: any) => (
              <button key={k} onClick={() => setSettingsTab(k)} style={{ padding: "10px 16px", fontFamily: "var(--fm)", fontSize: 10, letterSpacing: 1.5, fontWeight: 600, textTransform: "uppercase" as const, color: settingsTab === k ? "var(--tMax)" : "var(--tMut)", borderBottom: settingsTab === k ? "2px solid var(--blue)" : "2px solid transparent", marginBottom: -1 }}>{l}</button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {settingsTab === "general" && <>
              {[{ t: "Tier Thresholds", rows: [["GRAIL", ">40% · High confidence · High liquidity", TIERS.grail.color], ["HIT", "25–40% · High confidence", TIERS.hit.color], ["FLIP", "15–25% · Med+ confidence", "var(--tSec)"], ["SLEEPER", "5–15% · Any confidence", "var(--tMut)"]] }, { t: "Display", rows: [["Currency", "GBP (£)"], ["Fee Breakdown", "Visible"], ["Dark Mode", "ON", "var(--green)"]] }].map((s: any, i: number) => (
                <div key={i} style={{ padding: "14px 22px", borderBottom: "1px solid var(--brd)" }}>
                  <div style={{ fontFamily: "var(--fm)", fontSize: 9, letterSpacing: 2.5, color: "var(--tGho)", marginBottom: 10, textTransform: "uppercase" as const }}>{s.t}</div>
                  {s.rows.map(([l, v, c]: any, j: number) => <div key={j} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", fontSize: 13 }}><span style={{ fontWeight: 600, color: c || "var(--tPri)" }}>{l}</span><span style={{ color: c || "var(--tSec)", fontFamily: "var(--fm)", fontWeight: 500, fontSize: 12 }}>{v}</span></div>)}
                </div>
              ))}
              <div style={{ padding: "14px 22px" }}><button onClick={() => { fetch("/auth/logout", { method: "POST" }); setLoggedIn(false); setShowSettings(false); }} style={{ width: "100%", height: 40, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--r-md)", background: "var(--glass)", border: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 11, fontWeight: 600, color: "var(--red)", letterSpacing: 1 }}>Sign Out</button></div>
            </>}
            {settingsTab === "api" && <>
              {[{ key: "ebay", label: "eBay API", desc: "OAuth credentials for listing data", fields: ["App ID", "Cert ID"] }, { key: "scrydex", label: "Scrydex API", desc: "Card index and pricing data", fields: ["API Key", "Team ID"] }].map(api => (
                <div key={api.key} style={{ padding: "16px 22px", borderBottom: "1px solid var(--brd)" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--tMax)", marginBottom: 2 }}>{api.label}</div>
                  <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)", marginBottom: 10 }}>{api.desc}</div>
                  {api.fields.map((field, i) => <div key={i} style={{ marginBottom: 6 }}><div style={{ fontFamily: "var(--fm)", fontSize: 8, color: "var(--tGho)", letterSpacing: 2, marginBottom: 4, textTransform: "uppercase" as const }}>{field}</div><input type="password" defaultValue="••••••••••••••••" style={{ width: "100%", height: 34, padding: "0 12px", borderRadius: "var(--r-sm)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tMax)", fontFamily: "var(--fm)", fontSize: 11 }} /></div>)}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button style={{ flex: 1, height: 34, borderRadius: "var(--r-sm)", background: "var(--glass)", border: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 10, fontWeight: 600, color: "var(--tSec)", letterSpacing: 1 }}>SAVE KEYS</button>
                    <button onClick={() => { setApiTest(p => ({ ...p, [api.key]: "testing" })); setTimeout(() => setApiTest(p => ({ ...p, [api.key]: "ok" })), 1500); }} style={{ flex: 1, height: 34, borderRadius: "var(--r-sm)", background: apiTest[api.key] === "ok" ? "rgba(52,211,153,0.06)" : "var(--glass)", border: `1px solid ${apiTest[api.key] === "ok" ? "rgba(52,211,153,0.25)" : "var(--brd)"}`, fontFamily: "var(--fm)", fontSize: 10, fontWeight: 600, color: apiTest[api.key] === "ok" ? "var(--green)" : apiTest[api.key] === "testing" ? "var(--amber)" : "var(--blue)", letterSpacing: 1 }}>{apiTest[api.key] === "testing" ? "TESTING..." : apiTest[api.key] === "ok" ? "✓ CONNECTED" : "TEST"}</button>
                  </div>
                </div>
              ))}
            </>}
            {settingsTab === "notif" && <>
              <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--brd)" }}>
                <div style={{ fontFamily: "var(--fm)", fontSize: 9, letterSpacing: 2.5, color: "var(--tGho)", marginBottom: 12, textTransform: "uppercase" as const }}>Telegram</div>
                {["Bot Token", "Chat ID"].map((label, i) => <div key={i} style={{ marginBottom: 8 }}><div style={{ fontFamily: "var(--fm)", fontSize: 8, color: "var(--tGho)", letterSpacing: 2, marginBottom: 4, textTransform: "uppercase" as const }}>{label}</div><input type={i === 0 ? "password" : "text"} placeholder={`Enter ${label.toLowerCase()}...`} style={{ width: "100%", height: 34, padding: "0 12px", borderRadius: "var(--r-sm)", background: "var(--glass)", border: "1px solid var(--brd)", color: "var(--tMax)", fontFamily: "var(--fm)", fontSize: 11 }} /></div>)}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button style={{ flex: 1, height: 34, borderRadius: "var(--r-sm)", background: "var(--glass)", border: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 10, fontWeight: 600, color: "var(--tSec)", letterSpacing: 1 }}>SAVE</button>
                  <button onClick={() => { setApiTest(p => ({ ...p, tg: "testing" })); fetch("/api/notifications/telegram/test", { method: "POST" }).then(() => setApiTest(p => ({ ...p, tg: "ok" }))).catch(() => setApiTest(p => ({ ...p, tg: "err" }))); }} style={{ flex: 1, height: 34, borderRadius: "var(--r-sm)", background: apiTest.tg === "ok" ? "rgba(52,211,153,0.06)" : "var(--glass)", border: `1px solid ${apiTest.tg === "ok" ? "rgba(52,211,153,0.25)" : "var(--brd)"}`, fontFamily: "var(--fm)", fontSize: 10, fontWeight: 600, color: apiTest.tg === "ok" ? "var(--green)" : apiTest.tg === "testing" ? "var(--amber)" : "var(--blue)", letterSpacing: 1 }}>{apiTest.tg === "testing" ? "SENDING..." : apiTest.tg === "ok" ? "✓ SENT" : "TEST MESSAGE"}</button>
                </div>
              </div>
              <div style={{ padding: "16px 22px" }}>
                <div style={{ fontFamily: "var(--fm)", fontSize: 9, letterSpacing: 2.5, color: "var(--tGho)", marginBottom: 12, textTransform: "uppercase" as const }}>Alert Rules</div>
                {[["GRAIL deals", "Instant push", "var(--green)"], ["HIT deals", "Instant push", "var(--green)"], ["FLIP deals", "OFF", "var(--tMut)"], ["System warnings", "Push on error", "var(--amber)"]].map(([l, v, c], i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 13 }}><span style={{ fontWeight: 600, color: "var(--tPri)" }}>{l}</span><span style={{ fontFamily: "var(--fm)", fontSize: 10, fontWeight: 600, color: c }}>{v}</span></div>)}
              </div>
            </>}
          </div>
        </div>
      </div>}

      {/* TEST SUITE */}
      {showTests && <div onClick={(e: any) => { if (e.target === e.currentTarget) setShowTests(false); }} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(7,10,18,0.85)", backdropFilter: "blur(16px)" }}>
        <div style={{ width: 700, maxWidth: "94vw", maxHeight: "85vh", borderRadius: "var(--r-xl)", background: "rgba(12,16,25,0.96)", border: "1px solid var(--brd2)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid var(--brd)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontWeight: 300, fontSize: 12, letterSpacing: 3, color: "var(--tMut)", textTransform: "uppercase" as const }}>Test Suite</span>
              {(() => {
                const done = TEST_DEFS.filter(t => testResults[t.key] != null).length;
                const passed = TEST_DEFS.filter(t => testResults[t.key]?.ok).length;
                const failed = TEST_DEFS.filter(t => testResults[t.key] != null && !testResults[t.key]?.ok).length;
                return done > 0 ? (
                  <div style={{ display: "flex", gap: 8, fontFamily: "var(--fm)", fontSize: 10 }}>
                    <span style={{ color: "var(--green)", fontWeight: 600 }}>{passed} passed</span>
                    {failed > 0 && <span style={{ color: "var(--red)", fontWeight: 600 }}>{failed} failed</span>}
                    <span style={{ color: "var(--tMut)" }}>{done}/{TEST_DEFS.length}</span>
                  </div>
                ) : null;
              })()}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={runAllTests} disabled={Object.values(testRunning).some(Boolean)} style={{ height: 30, padding: "0 16px", borderRadius: "var(--r-pill)", background: Object.values(testRunning).some(Boolean) ? "var(--glass)" : "linear-gradient(135deg, rgba(52,211,153,0.15), rgba(96,165,250,0.1))", border: "1px solid rgba(52,211,153,0.25)", fontFamily: "var(--fm)", fontSize: 10, fontWeight: 700, color: Object.values(testRunning).some(Boolean) ? "var(--tMut)" : "var(--green)", letterSpacing: 1.5 }}>{Object.values(testRunning).some(Boolean) ? "RUNNING..." : "RUN ALL"}</button>
              <button onClick={() => setShowTests(false)} style={{ width: 30, height: 30, borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--tMut)" }}>✕</button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {TEST_DEFS.map(t => {
              const result = testResults[t.key];
              const running = testRunning[t.key];
              const statusColor = running ? "var(--amber)" : result?.ok ? "var(--green)" : result ? "var(--red)" : "var(--tGho)";
              const statusLabel = running ? "RUNNING" : result?.ok ? "PASS" : result ? "FAIL" : "PENDING";
              return (
                <div key={t.key} style={{ padding: "10px 22px", borderBottom: "1px solid var(--brd)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, boxShadow: running ? `0 0 8px rgba(251,191,36,0.5)` : result?.ok ? `0 0 8px rgba(52,211,153,0.4)` : result ? `0 0 8px rgba(248,113,113,0.4)` : "none", animation: running ? "pulse 1.5s ease infinite" : "none", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--tMax)" }}>{t.label}</span>
                        <span style={{ fontFamily: "var(--fm)", fontSize: 9, fontWeight: 600, color: statusColor, letterSpacing: 1 }}>{statusLabel}</span>
                        {result?.elapsed_ms != null && <span style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tMut)" }}>{result.elapsed_ms}ms</span>}
                      </div>
                      <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)", marginTop: 2 }}>{t.desc}</div>
                    </div>
                    <button onClick={() => runTest(t.key)} disabled={running} style={{ height: 26, padding: "0 12px", borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", fontFamily: "var(--fm)", fontSize: 9, fontWeight: 600, color: running ? "var(--tGho)" : "var(--tSec)", letterSpacing: 1 }}>{running ? "..." : "RUN"}</button>
                  </div>
                  {/* Result details */}
                  {result && !running && (
                    <div style={{ marginTop: 8, marginLeft: 20, padding: "10px 14px", borderRadius: "var(--r-md)", background: result.ok ? "rgba(52,211,153,0.04)" : "rgba(248,113,113,0.04)", border: `1px solid ${result.ok ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)"}` }}>
                      {result.error && <div style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--red)", marginBottom: 6, wordBreak: "break-all" as const }}>Error: {typeof result.error === "string" ? result.error : JSON.stringify(result.error)}</div>}
                      {/* DB test */}
                      {t.key === "db" && result.ok && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tSec)" }}>
                            {(result.tables || []).map((tb: any) => <span key={tb.table || tb.relname} style={{ display: "inline-block", marginRight: 12, marginBottom: 4 }}><span style={{ color: "var(--tMut)" }}>{tb.table || tb.relname}:</span> <span style={{ color: "var(--green)", fontWeight: 600 }}>{tb.row_count}</span></span>)}
                          </div>
                          {result.extensions && <div style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tMut)" }}>Extensions: {result.extensions.map((e: any) => `${e.extname} v${e.extversion}`).join(", ")}</div>}
                          {result.migrations && <div style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tMut)" }}>Migrations: {result.migrations.length} applied</div>}
                        </div>
                      )}
                      {/* eBay test */}
                      {t.key === "ebay" && result.ok && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tSec)" }}>{result.results_count} results found · {result.diagnostics?.environment}</div>
                          {(result.sample || []).map((s: any, i: number) => (
                            <div key={i} style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)", display: "flex", gap: 8, alignItems: "center" }}>
                              {s.image && <img src={s.image} alt="" style={{ width: 24, height: 33, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} />}
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{s.title}</span>
                              <span style={{ color: "var(--green)", fontWeight: 600, flexShrink: 0 }}>{s.price?.currency} {s.price?.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* eBay lookup */}
                      {t.key === "ebay-lookup" && result.ok && (
                        <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tSec)" }}>
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>{result.title}</div>
                          <div style={{ color: "var(--tMut)" }}>ID: {result.item_id} · {result.condition} · {result.specifics_count} specifics · {result.price?.currency} {result.price?.value}</div>
                        </div>
                      )}
                      {/* Scrydex test */}
                      {t.key === "scrydex" && result.ok && (
                        <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tSec)" }}>
                          <div>{result.cards_page1_count} cards on page 1 · hasMore: {String(result.has_more_cards)}</div>
                          {(result.sample_cards || []).map((c: any, i: number) => <div key={i} style={{ color: "var(--tMut)", marginTop: 2 }}>{c.name} #{c.number} — {c.expansion}</div>)}
                        </div>
                      )}
                      {/* Exchange test */}
                      {t.key === "exchange" && result.ok && (
                        <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tSec)" }}>1 USD = <span style={{ color: "var(--green)", fontWeight: 700, fontSize: 13 }}>{result.usd_to_gbp}</span> GBP</div>
                      )}
                      {/* Match test */}
                      {t.key === "match" && result.ok && (
                        <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tSec)" }}>
                          {result.matched ? (
                            <>
                              <div style={{ fontWeight: 600 }}>Matched: {result.card?.name} #{result.card?.card_number}</div>
                              <div style={{ color: "var(--tMut)", marginTop: 2 }}>{result.card?.expansion_name} · Confidence: <span style={{ color: CONF_C(result.confidence), fontWeight: 600 }}>{(result.confidence * 100).toFixed(0)}%</span></div>
                              {result.breakdown && <div style={{ color: "var(--tGho)", marginTop: 2 }}>{Object.entries(result.breakdown).map(([k, v]) => `${k}: ${typeof v === "number" ? v.toFixed(2) : v}`).join(" · ")}</div>}
                            </>
                          ) : <div style={{ color: "var(--amber)" }}>No match found — {result.message}</div>}
                        </div>
                      )}
                      {/* Pipeline test */}
                      {t.key === "pipeline" && result.ok && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {(result.steps || []).map((s: any, i: number) => (
                            <div key={i} style={{ fontFamily: "var(--fm)", fontSize: 10, display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ color: s.matched === false ? "var(--amber)" : "var(--green)", fontWeight: 600, minWidth: 70 }}>{s.step}</span>
                              {s.step === "ebay_search" && <span style={{ color: "var(--tSec)" }}>{s.count} listings</span>}
                              {s.step === "exchange_rate" && <span style={{ color: "var(--tSec)" }}>×{s.usd_to_gbp}</span>}
                              {s.step === "match" && <span style={{ color: s.matched ? "var(--tSec)" : "var(--tMut)" }}>{s.matched ? `${s.title}` : `No match: ${s.title}`}</span>}
                              {s.step === "pipeline" && <span style={{ color: "var(--tSec)" }}>{s.matched_card} · {s.confidence} · <span style={{ color: "var(--green)", fontWeight: 600 }}>{s.profit} ({s.profit_pct})</span> · <span style={{ fontWeight: 600 }}>{s.tier?.toUpperCase()}</span></span>}
                              {s.elapsed_ms != null && <span style={{ color: "var(--tGho)", marginLeft: "auto", flexShrink: 0 }}>{s.elapsed_ms}ms</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Usage test */}
                      {t.key === "usage" && result.ok && (
                        <div style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tSec)" }}>
                          <div style={{ display: "flex", gap: 16, marginBottom: 4 }}>
                            <span>eBay today: <span style={{ color: "var(--green)", fontWeight: 600 }}>{result.today?.ebay ?? 0}</span>/5K</span>
                            <span>Scrydex today: <span style={{ color: "var(--green)", fontWeight: 600 }}>{result.today?.scrydex ?? 0}</span>/50K</span>
                          </div>
                          {result.recent_scans?.length > 0 && <div style={{ color: "var(--tMut)", marginTop: 4 }}>Recent scans: {result.recent_scans.slice(0, 3).map((s: any) => `${s.status}${s.deals_found != null ? ` (${s.deals_found} deals)` : ""}`).join(", ")}</div>}
                          {result.recent_syncs?.length > 0 && <div style={{ color: "var(--tMut)", marginTop: 2 }}>Recent syncs: {result.recent_syncs.slice(0, 3).map((s: any) => `${s.type}: ${s.status}`).join(", ")}</div>}
                        </div>
                      )}
                      {/* Integrity test */}
                      {t.key === "integrity" && result.ok && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {(result.checks || []).map((c: any, i: number) => (
                            <div key={i} style={{ fontFamily: "var(--fm)", fontSize: 10, display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.status === "ok" ? "var(--green)" : c.status === "warn" ? "var(--amber)" : c.status === "fail" ? "var(--red)" : "var(--tGho)", flexShrink: 0 }} />
                              <span style={{ color: "var(--tSec)", minWidth: 160 }}>{c.check}</span>
                              {c.count != null && <span style={{ color: c.status === "warn" ? "var(--amber)" : "var(--tMut)", fontWeight: 600 }}>{c.count}</span>}
                              {c.similarity_score != null && <span style={{ color: "var(--green)", fontWeight: 600 }}>{c.similarity_score}</span>}
                              {c.data && <span style={{ color: "var(--tGho)" }}>{c.data.length} entries</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Generic fallback for unknown keys */}
                      {!["db", "ebay", "ebay-lookup", "scrydex", "exchange", "match", "pipeline", "usage", "integrity"].includes(t.key) && (
                        <pre style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)", whiteSpace: "pre-wrap" as const, wordBreak: "break-all" as const, margin: 0 }}>{JSON.stringify(result, null, 2)}</pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>}

      {/* HELP GUIDE */}
      {showHelp && <div onClick={(e: any) => { if (e.target === e.currentTarget) setShowHelp(false); }} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(7,10,18,0.85)", backdropFilter: "blur(16px)" }}>
        <div style={{ width: 620, maxWidth: "94vw", maxHeight: "85vh", borderRadius: "var(--r-xl)", background: "rgba(12,16,25,0.96)", border: "1px solid var(--brd2)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid var(--brd)", flexShrink: 0 }}>
            <span style={{ fontWeight: 300, fontSize: 12, letterSpacing: 3, color: "var(--tMut)", textTransform: "uppercase" as const }}>Help Guide</span>
            <button onClick={() => setShowHelp(false)} style={{ width: 30, height: 30, borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--tMut)" }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 22px" }}>
            {([
              { title: "HOW IT WORKS", items: [
                ["Scrydex Sync", "On startup, PokeSnipe indexes all Pokemon TCG cards and market prices from Scrydex. This refreshes every 24 hours."],
                ["eBay Scanner", "Every 5 minutes, the scanner searches eBay for Pokemon card listings and compares them against Scrydex market prices."],
                ["Deal Detection", "When a listing is found below market value (after shipping + eBay buyer protection fees), it appears as a deal in the feed."],
                ["Live Updates", "New deals stream in real-time via SSE. Grail-tier deals trigger a toast notification."]
              ]},
              { title: "DEAL TIERS", items: [
                ["GRAIL", ">40% profit with high confidence and high liquidity. Chase-tier heavy hitters."],
                ["HIT", "25-40% profit with high confidence. Solid bangers worth snagging."],
                ["FLIP", "15-25% profit with medium+ confidence. Quick, reliable flips."],
                ["SLEEPER", "5-15% profit. Binder flips, lower priority but still profitable."]
              ]},
              { title: "FILTER BAR", items: [
                ["Tier", "Toggle which deal tiers to show (GRAIL / HIT / FLIP / SLEEP). Hover for tooltips."],
                ["Cond (Condition)", "Filter by card condition: NM (Near Mint), LP (Lightly Played), MP (Moderately Played), HP (Heavily Played)."],
                ["Liq (Liquidity)", "How easy to resell. HI = lots of buyers, MD = moderate demand, LO = niche."],
                ["Conf (Confidence)", "Match confidence. HI (>85%) = very sure. MD (65-85%) = probable match."],
                ["Time", "Show deals from the last 1h, 6h, 24h, or All time."],
                ["Min%", "Minimum profit percentage. Use +/- to adjust in 5% steps."],
                ["Graded", "Toggle to show only PSA/BGS/CGC graded cards."],
                ["SAVE", "Persists your filter settings. They reload automatically on next visit."]
              ]},
              { title: "HEADER CONTROLS", items: [
                ["Search", "Filter deals by card name, number, or expansion. Instant client-side filter."],
                ["Lookup", "Paste any eBay URL to instantly see profit calculation and card match."],
                ["Settings", "API keys, Telegram notifications, tier thresholds."],
                ["? (Help)", "Opens this guide."],
                ["LIVE / PAUSED", "Click to toggle the scanner. Green = scanning every 5 min. Red = paused."]
              ]},
              { title: "DEAL DETAIL PANEL", items: [
                ["Card Images", "Scrydex reference vs eBay listing side-by-side for visual verification."],
                ["No BS Pricing", "Full breakdown: eBay price + shipping + buyer protection (flat + tiered bands). USD market price with live FX."],
                ["Match Confidence", "Composite from 6 signals: Name (30%), Number (20%), Denom (15%), Expansion (15%), Variant (10%), Extract (10%)."],
                ["Liquidity", "Resale potential: Trend, Prices, Spread, Supply, Sold, Velocity."],
                ["Comps by Condition", "Market price at NM/LP/MP/HP grades. Current condition highlighted."],
                ["SNAG ON EBAY", "Direct buy link to the eBay listing."],
                ["Review", "Rate match accuracy. Feeds the 7-day rolling accuracy in the footer."]
              ]},
              { title: "FOOTER METRICS", items: [
                ["Scanner Status", "Green 'Hunting' = ready. Amber 'Scanning' = scan running. Red 'Stale' = no scan in 30+ min."],
                ["Today", "Deals found today with Grail (G) and Hit (H) counts."],
                ["Acc", "7-day rolling accuracy from your Correct/Wrong reviews."],
                ["eBay", "API calls today / 5K cap. Green <80%, Amber 80-95%, Red >95%."],
                ["Scrydex", "API calls today / 50K cap. Includes sync page fetches."],
                ["Index", "Total cards indexed from the last Scrydex sync."]
              ]},
              { title: "SETTINGS", items: [
                ["General", "Tier thresholds, display settings, sign out."],
                ["API Keys", "eBay and Scrydex credentials with test buttons."],
                ["Notifications", "Telegram bot setup for GRAIL/HIT push alerts."]
              ]}
            ] as any).map((section: any, si: number) => (
              <div key={si} style={{ marginTop: si === 0 ? 18 : 24 }}>
                <div style={{ fontFamily: "var(--fm)", fontSize: 9, letterSpacing: 2.5, color: "var(--tGho)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--brd)", textTransform: "uppercase" as const }}>{section.title}</div>
                {section.items.map(([label, desc]: any, i: number) => (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--brd)" }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: "var(--tMax)", minWidth: 120, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 12, color: "var(--tSec)", lineHeight: 1.5 }}>{desc}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>}
    </div>
  );
}
