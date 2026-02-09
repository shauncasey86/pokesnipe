exports.up = (pgm) => {
  // Fix 1: Scanner run tracking
  pgm.createTable("scanner_runs", {
    id: "id",
    started_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    finished_at: { type: "timestamptz" },
    deals_found: { type: "integer", default: 0 },
    status: { type: "text", notNull: true, default: "'running'" },
    error: { type: "text" }
  });

  // Fix 3: API usage tracking
  pgm.createTable("api_usage", {
    id: "id",
    provider: { type: "text", notNull: true },
    date: { type: "date", notNull: true, default: pgm.func("CURRENT_DATE") },
    call_count: { type: "integer", notNull: true, default: 0 }
  });
  pgm.addConstraint("api_usage", "api_usage_provider_date_uniq", {
    unique: ["provider", "date"]
  });

  // Fix 4: Comps by condition on deals
  pgm.addColumn("deals", {
    comps_by_condition: { type: "jsonb" }
  });

  // Fix 5: Liquidity breakdown on deals
  pgm.addColumn("deals", {
    liquidity_breakdown: { type: "jsonb" }
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("deals", "liquidity_breakdown");
  pgm.dropColumn("deals", "comps_by_condition");
  pgm.dropTable("api_usage");
  pgm.dropTable("scanner_runs");
};
