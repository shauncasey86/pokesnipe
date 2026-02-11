import React from "react";

interface TopBarProps {
  isLive: boolean;
  onToggleLive: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  dealCount: number;
  totalProfit: number;
  avgRoi: number;
  onOpenLookup?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({
  isLive,
  onToggleLive,
  searchQuery,
  onSearchChange,
  dealCount,
  totalProfit,
  avgRoi,
  onOpenLookup,
}) => {
  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.25)",
    textTransform: "uppercase",
    margin: 0,
    lineHeight: 1,
  };

  const valueBase: React.CSSProperties = {
    fontSize: 18,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 800,
    margin: 0,
    lineHeight: 1,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "12px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* Search input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10,
          padding: "8px 12px",
          maxWidth: 360,
          flex: 1,
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 14,
            color: "rgba(255,255,255,0.3)",
            flexShrink: 0,
          }}
        >
          ⌕
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search deals..."
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#e2e8f0",
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            flex: 1,
            minWidth: 0,
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            color: "rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.06)",
            borderRadius: 5,
            padding: "2px 6px",
            flexShrink: 0,
          }}
        >
          ⌘K
        </span>
      </div>

      {/* Lookup button */}
      {onOpenLookup && (
        <button
          onClick={onOpenLookup}
          title="Manual eBay lookup"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.4)",
            fontSize: 16,
            cursor: "pointer",
            flexShrink: 0,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#c084fc";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(124,58,237,0.3)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.06)";
          }}
        >
          🔗
        </button>
      )}

      {/* Flexible spacer */}
      <div style={{ flex: 1 }} />

      {/* Summary stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {/* Deals */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 4,
          }}
        >
          <p style={labelStyle}>DEALS</p>
          <p style={{ ...valueBase, color: "#e2e8f0" }}>{dealCount}</p>
        </div>

        {/* Total Profit */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 4,
          }}
        >
          <p style={labelStyle}>TOTAL PROFIT</p>
          <p style={{ ...valueBase, color: "#4ade80" }}>
            £{totalProfit}
          </p>
        </div>

        {/* Avg ROI */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 4,
          }}
        >
          <p style={labelStyle}>AVG ROI</p>
          <p style={{ ...valueBase, color: "#c084fc" }}>{avgRoi}%</p>
        </div>
      </div>

      {/* Vertical divider */}
      <div
        style={{
          width: 1,
          height: 32,
          background: "rgba(255,255,255,0.06)",
        }}
      />

      {/* Live toggle button */}
      <button
        onClick={onToggleLive}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          borderRadius: 8,
          border: isLive
            ? "1px solid rgba(34,197,94,0.25)"
            : "1px solid rgba(239,68,68,0.25)",
          background: isLive
            ? "rgba(34,197,94,0.1)"
            : "rgba(239,68,68,0.1)",
          color: isLive ? "#4ade80" : "#ef4444",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          letterSpacing: "0.05em",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isLive ? "#4ade80" : "#ef4444",
            display: "inline-block",
            animation: isLive ? "pulse 1.5s ease-in-out infinite" : "none",
            boxShadow: isLive
              ? "0 0 6px rgba(74,222,128,0.6)"
              : "0 0 6px rgba(239,68,68,0.4)",
          }}
        />
        {isLive ? "LIVE" : "PAUSED"}
      </button>

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
};

export default TopBar;
