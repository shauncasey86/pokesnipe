import React from "react";
import type { Deal } from "../types/deals";
import ConfidenceRing from "./ui/ConfidenceRing";

/* ── colour maps ─────────────────────────────────────────────────── */

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GRAIL: { bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc", border: "#7c3aed" },
  HIT:   { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa", border: "#2563eb" },
  FLIP:  { bg: "rgba(34, 197, 94, 0.15)",  text: "#4ade80", border: "#16a34a" },
  SLEEP: { bg: "rgba(58, 64, 96, 0.15)",   text: "#8290a8", border: "#3a4060" },
};

const COND_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  NM: { bg: "rgba(34,197,94,0.15)", text: "#4ade80", border: "#16a34a" },
  LP: { bg: "rgba(250,204,21,0.15)", text: "#facc15", border: "#ca8a04" },
  MP: { bg: "rgba(251,146,60,0.15)", text: "#fb923c", border: "#ea580c" },
  HP: { bg: "rgba(239,68,68,0.15)", text: "#ef4444", border: "#dc2626" },
  DM: { bg: "rgba(239,68,68,0.2)", text: "#fca5a5", border: "#ef4444" },
};

/* ── helpers ──────────────────────────────────────────────────────── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/* ── inline sub-components ───────────────────────────────────────── */

function TierBadge({ tier }: { tier: string }) {
  const c = TIER_COLORS[tier] ?? TIER_COLORS.SLEEP;
  return (
    <span
      style={{
        padding: "2px 10px",
        borderRadius: 4,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        fontSize: 10,
        fontWeight: 700,
        fontFamily: "'JetBrains Mono', monospace",
        textTransform: "uppercase",
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {tier}
    </span>
  );
}

function ConditionBadge({ condition }: { condition: string }) {
  const c = COND_COLORS[condition] ?? COND_COLORS.MP;
  return (
    <span
      style={{
        padding: "2px 10px",
        borderRadius: 4,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        fontSize: 10,
        fontWeight: 700,
        fontFamily: "'JetBrains Mono', monospace",
        textTransform: "uppercase",
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {condition}
    </span>
  );
}

/* ── keyframes (injected once) ───────────────────────────────────── */

const FADE_IN_KEYFRAMES = `
@keyframes dealRowFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

let styleInjected = false;
function injectKeyframes() {
  if (styleInjected) return;
  const style = document.createElement("style");
  style.textContent = FADE_IN_KEYFRAMES;
  document.head.appendChild(style);
  styleInjected = true;
}

/* ── props ────────────────────────────────────────────────────────── */

interface DealTableProps {
  deals: Deal[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  newDealIds: Set<string>;
}

/* ── column template ─────────────────────────────────────────────── */

const GRID_COLS = "48px 1.8fr 0.6fr 0.6fr 0.8fr 1fr 0.7fr 56px";

/* ── component ───────────────────────────────────────────────────── */

function DealTable({ deals, selectedId, onSelect, newDealIds }: DealTableProps) {
  React.useEffect(() => {
    injectKeyframes();
  }, []);

  return (
    <div style={{ width: "100%", overflow: "auto" }}>
      {/* ── header ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID_COLS,
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: "#0c0a1a",
          padding: "8px 12px",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          fontWeight: 600,
          color: "rgba(255,255,255,0.25)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <span />
        <span>Card</span>
        <span>Tier</span>
        <span>Cond</span>
        <span>Match</span>
        <span>Profit</span>
        <span>ROI</span>
        <span>Ago</span>
      </div>

      {/* ── rows ── */}
      {deals.map((deal, idx) => {
        const id = deal.deal_id;
        const isSelected = id === selectedId;
        const isNewDeal = newDealIds.has(id);

        const name = deal.cardName || deal.ebay_title;
        const ebayPrice = deal.ebay_price_gbp;
        const marketPrice = deal.market_price_gbp ?? 0;
        const profit = deal.profit_gbp ?? 0;
        const profitPct = deal.profit_percent ?? 0;
        const confidence = Math.round((deal.confidence ?? 0) * 100);
        const img = deal.ebay_image_url;
        const ago = timeAgo(deal.listed_at || deal.created_at);

        const tierColor = TIER_COLORS[deal.tier] ?? TIER_COLORS.SLEEP;

        const profitColor =
          profit >= 40 ? "#4ade80" : profit >= 15 ? "#a3e635" : "#facc15";

        return (
          <div
            key={id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(id);
              }
            }}
            style={{
              display: "grid",
              gridTemplateColumns: GRID_COLS,
              alignItems: "center",
              padding: "8px 12px",
              cursor: "pointer",
              borderLeft: isSelected
                ? "3px solid #7c3aed"
                : isNewDeal
                ? "3px solid #4ade80"
                : "3px solid transparent",
              background: isSelected
                ? "rgba(124,58,237,0.08)"
                : idx % 2 === 0
                ? "rgba(255,255,255,0.01)"
                : "transparent",
              transition: "background 0.15s ease",
              animation: `dealRowFadeIn 0.35s ease ${idx * 0.04}s both`,
              outline: "none",
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                (e.currentTarget as HTMLDivElement).style.background =
                  "rgba(255,255,255,0.03)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                (e.currentTarget as HTMLDivElement).style.background =
                  idx % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent";
              }
            }}
          >
            {/* thumbnail */}
            <div style={{ position: "relative", width: 36, height: 50 }}>
              {img ? (
                <img
                  src={img}
                  alt={name}
                  style={{
                    width: 36,
                    height: 50,
                    objectFit: "cover",
                    borderRadius: 4,
                    border: `2px solid ${tierColor.border}`,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 36,
                    height: 50,
                    borderRadius: 4,
                    border: `2px solid ${tierColor.border}`,
                    background: "rgba(255,255,255,0.04)",
                  }}
                />
              )}
              {/* tier dot */}
              <div
                style={{
                  position: "absolute",
                  bottom: -2,
                  left: -2,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: tierColor.text,
                  border: "2px solid #0c0a1a",
                }}
              />
            </div>

            {/* card name + price range */}
            <div style={{ minWidth: 0, paddingLeft: 4 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  color: "#f1f5f9",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "rgba(255,255,255,0.3)",
                  marginTop: 2,
                }}
              >
                £{ebayPrice.toFixed(2)} → £{marketPrice.toFixed(2)}
              </div>
            </div>

            {/* tier */}
            <div>
              <TierBadge tier={deal.tier} />
            </div>

            {/* condition */}
            <div>
              <ConditionBadge condition={deal.condition} />
            </div>

            {/* confidence ring */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <ConfidenceRing value={confidence} size={36} />
            </div>

            {/* profit */}
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                color: profitColor,
              }}
            >
              +£{profit.toFixed(2)}
            </div>

            {/* ROI */}
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                color: profitColor,
              }}
            >
              +{profitPct.toFixed(0)}%
            </div>

            {/* time ago */}
            <div
              style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: "rgba(255,255,255,0.25)",
              }}
            >
              {ago}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default DealTable;
