import { useEffect, useMemo, useState } from "react";

const TIERS = {
  grail: { label: "GRAIL", short: "G", gradient: "linear-gradient(135deg, #ff6b35, #ff3b6f)", color: "#ff5c5c" },
  hit: { label: "HIT", short: "H", gradient: "linear-gradient(135deg, #ffd60a, #ffaa00)", color: "#ffd60a" },
  flip: { label: "FLIP", short: "F", gradient: "linear-gradient(135deg, #6b7fa0, #4a5a78)", color: "#8896b0" },
  sleeper: { label: "SLEEP", short: "S", gradient: "linear-gradient(135deg, #3a4060, #2a3050)", color: "#4a5070" }
};
const LIQ = { high: { color: "#34d399", label: "HIGH", short: "HI" }, med: { color: "#fbbf24", label: "MED", short: "MD" }, low: { color: "#fb923c", label: "LOW", short: "LO" }, illiquid: { color: "#ef4444", label: "ILLIQ", short: "—" } };
const COND_C: Record<string, string> = { NM: "#34d399", LP: "#fbbf24", MP: "#fb923c", HP: "#ef4444" };
const CONF_C = (v: number) => v >= 0.85 ? "#34d399" : v >= 0.65 ? "#fbbf24" : "#ef4444";
const TYPE_C: Record<string, string> = { fire: "#ff6b6b", water: "#60a5fa", electric: "#fbbf24", psychic: "#c084fc", grass: "#4ade80", dark: "#8b7ec8", dragon: "#f59e0b", normal: "#94a3b8" };

const fG = (n: number) => `£${Math.abs(n).toFixed(2)}`;

const Bar = ({ value, height = 5 }: { value: number; height?: number }) => (
  <div style={{ height, background: "rgba(255,255,255,0.04)", borderRadius: height, overflow: "hidden", width: "100%" }}>
    <div style={{ width: `${value * 100}%`, height: "100%", background: CONF_C(value), borderRadius: height, transition: "width 0.4s var(--ease)", boxShadow: value > 0.8 ? `0 0 10px ${CONF_C(value)}30` : "none" }} />
  </div>
);

const TierBadge = ({ tier, size = "sm" }: { tier: keyof typeof TIERS; size?: "sm" | "lg" }) => {
  const t = TIERS[tier];
  const s = size === "sm" ? { height: 16, fontSize: 8, padding: "0 5px", letterSpacing: 1 } : { height: 20, fontSize: 9, padding: "0 8px", letterSpacing: 1.5 };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontFamily: "var(--fm)", fontWeight: 700, color: "#fff", background: t.gradient, borderRadius: "var(--r-pill)", textTransform: "uppercase", ...s }}>
      {size === "sm" ? t.short : t.label}
    </span>
  );
};

const LiqPill = ({ liq }: { liq: keyof typeof LIQ }) => (
  <span style={{ display: "inline-flex", alignItems: "center", height: 18, padding: "0 7px", fontFamily: "var(--fm)", fontSize: 9, fontWeight: 500, color: LIQ[liq].color, background: `${LIQ[liq].color}10`, borderRadius: "var(--r-pill)", letterSpacing: 0.5, opacity: liq === "illiquid" ? 0.45 : 1 }}>
    {LIQ[liq].label}
  </span>
);
const CondPill = ({ cond }: { cond: string }) => (
  <span style={{ display: "inline-flex", alignItems: "center", height: 18, padding: "0 7px", fontFamily: "var(--fm)", fontSize: 9, fontWeight: 500, color: COND_C[cond] || "#94a3b8", background: `${COND_C[cond] || "#94a3b8"}0c`, borderRadius: "var(--r-pill)", letterSpacing: 0.5 }}>
    {cond}
  </span>
);

const DealRow = ({ deal, selected, onSelect, idx }: { deal: any; selected: boolean; onSelect: (deal: any) => void; idx: number }) => {
  return (
    <div
      onClick={() => onSelect(deal)}
      role="listitem"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(deal);
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 20px 10px 16px",
        cursor: "pointer",
        position: "relative",
        minHeight: 80,
        background: selected ? "var(--glass2)" : "transparent",
        borderBottom: "1px solid var(--brd)",
        transition: "all 250ms var(--snap)",
        animation: "fadeSlide 0.3s var(--ease) both",
        animationDelay: `${Math.min(idx * 30, 300)}ms`,
        opacity: deal.tier === "sleeper" ? 0.35 : 1
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 3, borderRadius: "0 3px 3px 0", background: selected ? "var(--blue)" : "transparent", transition: "background 200ms", boxShadow: selected ? "0 0 8px rgba(96,165,250,0.3)" : "none" }} />
      <div style={{ width: 48, height: 67, flexShrink: 0, position: "relative" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: "var(--r-sm)", overflow: "hidden", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2.5, background: TYPE_C[deal.type ?? "normal"] ?? TYPE_C.normal, opacity: 0.7, borderRadius: "var(--r-sm) var(--r-sm) 0 0" }} />
          {deal.ebay_image ? (
            <img src={deal.ebay_image} alt={deal.card_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontFamily: "var(--fm)", fontSize: 7, color: "var(--tGho)", letterSpacing: 1.5, marginTop: 4 }}>{deal.card_name?.substring(0, 4).toUpperCase()}</span>
          )}
        </div>
        <div style={{ position: "absolute", bottom: -3, left: -3, zIndex: 2 }}>
          <TierBadge tier={deal.tier} />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--tMax)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>
          {deal.card_name} <span style={{ color: "var(--tMut)", fontWeight: 400, fontSize: 12 }}>#{deal.card_number}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--tMut)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {deal.expansion_name} <span style={{ opacity: 0.5 }}>·</span> {deal.code}
        </div>
        <div style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--tMut)", display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
          <span>{fG(Number(deal.ebay_price_gbp))}</span>
          <span style={{ color: "var(--tGho)", fontSize: 10 }}>→</span>
          <span style={{ color: "var(--tSec)" }}>{fG(Number(deal.market_price_usd) * Number(deal.fx_rate))}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0, minWidth: 96 }}>
        <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1, letterSpacing: -0.5, color: "var(--greenB)", textShadow: deal.tier === "grail" ? "0 0 28px rgba(52,211,153,0.35)" : "0 0 12px rgba(52,211,153,0.1)" }}>+{fG(Number(deal.profit_gbp))}</div>
        <div style={{ fontFamily: "var(--fm)", fontSize: 11, fontWeight: 600, color: "var(--green)" }}>+{Number(deal.profit_pct).toFixed(0)}%</div>
        <div style={{ width: 64 }}><Bar value={Number(deal.confidence)} height={3} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0, minWidth: 56, paddingLeft: 10 }}>
        <div style={{ display: "flex", gap: 3 }}><CondPill cond={deal.condition ?? "NM"} /><LiqPill liq={deal.liquidity ?? "med"} /></div>
        <span style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--tMut)" }}>{new Date(deal.created_at).toLocaleTimeString()}</span>
      </div>
    </div>
  );
};

const Detail = ({ deal, onClose }: { deal: any; onClose: () => void }) => {
  if (!deal) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20, padding: 40, opacity: 0.3 }}>
        <div style={{ fontSize: 12, color: "var(--tMut)", textAlign: "center", letterSpacing: 1.5, lineHeight: 2, fontFamily: "var(--fm)" }}>SELECT A DEAL<br />TO INSPECT</div>
      </div>
    );
  }
  const pricing = deal.pricing_breakdown ?? {};
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 22px", borderBottom: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "var(--bg1)", zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TierBadge tier={deal.tier} size="lg" />
          <span style={{ fontWeight: 700, fontSize: 16 }}>{deal.card_name}</span>
        </div>
        <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "var(--r-pill)", background: "var(--glass)", border: "1px solid var(--brd)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--tMut)" }}>✕</button>
      </div>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--brd)" }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ width: 110, height: 154, borderRadius: "var(--r-md)", background: "var(--glass)", border: "1px solid var(--brd)", overflow: "hidden" }}>
            {deal.image_url && <img src={deal.image_url} alt={deal.card_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <div style={{ width: 110, height: 154, borderRadius: "var(--r-md)", background: "var(--glass)", border: "1px solid var(--brd)", overflow: "hidden" }}>
            {deal.ebay_image && <img src={deal.ebay_image} alt={deal.card_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20 }}>{deal.card_name} <span style={{ color: "var(--tMut)", fontSize: 12 }}>#{deal.card_number}</span></div>
            <div style={{ fontSize: 12, color: "var(--tSec)", marginTop: 4 }}>{deal.expansion_name} · {deal.code}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}><CondPill cond={deal.condition} /><LiqPill liq={deal.liquidity} /></div>
          </div>
        </div>
      </div>
      <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--brd)" }}>
        <div style={{ fontFamily: "var(--fm)", fontWeight: 500, fontSize: 9, textTransform: "uppercase", letterSpacing: 2.5, color: "var(--tMut)", marginBottom: 12 }}>NO BS PROFIT</div>
        <div style={{ fontWeight: 800, fontSize: 42, letterSpacing: -2, color: "var(--greenB)", textShadow: "0 0 40px rgba(52,211,153,0.25)" }}>+{fG(Number(deal.profit_gbp))}</div>
        <div style={{ fontFamily: "var(--fm)", fontSize: 11, fontWeight: 600, color: "var(--green)", marginTop: 4 }}>+{Number(deal.profit_pct).toFixed(0)}% · {TIERS[deal.tier].label} territory</div>
        <a href={deal.ebay_url} target="_blank" rel="noreferrer" style={{ marginTop: 12, display: "inline-flex", width: "100%", justifyContent: "center", alignItems: "center", height: 40, borderRadius: "var(--r-md)", background: "linear-gradient(135deg, #34d399, #2dd4bf)", color: "#0c1019", fontWeight: 800, letterSpacing: 2.5, textDecoration: "none" }}>SNAG ON EBAY →</a>
      </div>
      <div style={{ padding: "16px 22px" }}>
        <div style={{ fontFamily: "var(--fm)", fontWeight: 500, fontSize: 9, textTransform: "uppercase", letterSpacing: 2.5, color: "var(--tMut)", marginBottom: 12 }}>PRICING BREAKDOWN</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}><span>eBay</span><span>{fG(Number(deal.ebay_price_gbp))}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}><span>Shipping</span><span>{fG(Number(deal.ebay_shipping_gbp))}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}><span>Buyer Prot.</span><span>{fG(Number(pricing.buyerProtection?.total ?? 0))}</span></div>
      </div>
    </div>
  );
};

const Login = ({ onLogin }: { onLogin: () => void }) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    const res = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (res.ok) {
      onLogin();
    } else {
      setError("Wrong password");
    }
  };
  return (
    <div className="login">
      <div className="login-card">
        <div style={{ fontWeight: 800, fontSize: 28 }}>Poke<span style={{ color: "var(--red)" }}>Snipe</span></div>
        <div style={{ fontFamily: "var(--fm)", fontSize: 10, letterSpacing: 3.5, textTransform: "uppercase", color: "var(--tMut)" }}>No BS Arbitrage</div>
        <input type="password" placeholder="Access password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={submit}>ENTER</button>
        {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
        <div style={{ fontFamily: "var(--fm)", fontSize: 9, color: "var(--tGho)" }}>PRIVATE DASHBOARD · PASSWORD PROTECTED</div>
      </div>
    </div>
  );
};

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [deals, setDeals] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [status, setStatus] = useState<any | null>(null);

  useEffect(() => {
    const boot = async () => {
      const res = await fetch("/api/status");
      if (res.status === 401) {
        setLoggedIn(false);
        return;
      }
      setLoggedIn(true);
      const [dealRes, statusRes] = await Promise.all([fetch("/api/deals?limit=50"), fetch("/api/status")]);
      if (dealRes.ok) {
        const data = await dealRes.json();
        setDeals(data.deals);
      }
      if (statusRes.ok) {
        setStatus(await statusRes.json());
      }
    };
    boot();
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    const source = new EventSource("/api/deals/stream");
    source.addEventListener("deal", (event) => {
      const data = JSON.parse((event as MessageEvent).data);
      setDeals((prev) => [data, ...prev]);
    });
    source.addEventListener("status", (event) => {
      setStatus(JSON.parse((event as MessageEvent).data));
    });
    return () => source.close();
  }, [loggedIn]);

  const sortedDeals = useMemo(() => {
    return [...deals].sort((a, b) => {
      const tierOrder = { grail: 0, hit: 1, flip: 2, sleeper: 3 } as Record<string, number>;
      return tierOrder[a.tier] - tierOrder[b.tier] || Number(b.profit_pct) - Number(a.profit_pct);
    });
  }, [deals]);

  if (!loggedIn) {
    return <Login onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <div className="app-root">
      <div className="header">
        <div className="brand">PokéSnipe <span>NO BS</span></div>
        <div className="actions">
          <div className="live-pill"><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 8px rgba(52,211,153,0.5)" }} />LIVE</div>
        </div>
      </div>
      <div className="filter-bar">
        <div className="filter-group"><span>TIER</span><button className="filter-chip active">G</button><button className="filter-chip active">H</button><button className="filter-chip active">F</button></div>
        <div className="filter-group"><span>COND</span><button className="filter-chip active">NM</button><button className="filter-chip active">LP</button><button className="filter-chip active">MP</button></div>
      </div>
      <div className="content">
        <div className="feed" role="list">
          {sortedDeals.map((deal, idx) => (
            <DealRow key={deal.id} deal={deal} selected={selected?.id === deal.id} onSelect={setSelected} idx={idx} />
          ))}
        </div>
        <div className="detail">
          <Detail deal={selected} onClose={() => setSelected(null)} />
        </div>
      </div>
      <div className="footer">
        <div className="zone">
          <div><span style={{ color: "var(--tMut)" }}>Deals:</span><span style={{ color: "var(--tMax)", fontWeight: 700 }}>{status?.dealsToday?.total ?? 0}</span></div>
          <div><span style={{ color: "var(--tMut)" }}>Acc:</span><span style={{ color: "var(--green)", fontWeight: 700 }}>{Math.round((status?.accuracy?.rolling7d ?? 0) * 100)}%</span><span style={{ color: "var(--tGho)" }}>7d</span></div>
        </div>
        <div className="zone">
          <div><span style={{ color: "var(--tMut)" }}>Index</span><span style={{ color: "var(--tSec)", fontWeight: 600 }}>{status?.apis?.index?.count ?? 0}</span></div>
        </div>
      </div>
    </div>
  );
}
