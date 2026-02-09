exports.up = (pgm) => {
  pgm.createExtension("pg_trgm", { ifNotExists: true });

  pgm.createTable("expansions", {
    id: "id",
    scrydex_id: { type: "text", notNull: true, unique: true },
    name: { type: "text", notNull: true },
    code: { type: "text" },
    series: { type: "text" },
    release_date: { type: "date" },
    printed_total: { type: "integer" },
    logo_url: { type: "text" }
  });

  pgm.createTable("cards", {
    id: "id",
    scrydex_id: { type: "text", notNull: true, unique: true },
    name: { type: "text", notNull: true },
    card_number: { type: "text" },
    printed_total: { type: "integer" },
    rarity: { type: "text" },
    supertype: { type: "text" },
    subtypes: { type: "text[]" },
    image_url: { type: "text" },
    expansion_id: { type: "integer", references: "expansions", onDelete: "cascade" },
    market_price_usd: { type: "numeric" },
    prices: { type: "jsonb" }
  });

  pgm.createSequence("deal_event_id_seq", { start: 1 });

  pgm.createTable("deals", {
    id: { type: "uuid", primaryKey: true },
    event_id: { type: "bigint", notNull: true, default: pgm.func("nextval('deal_event_id_seq')") },
    card_id: { type: "integer", references: "cards", onDelete: "cascade" },
    ebay_item_id: { type: "text", notNull: true },
    ebay_url: { type: "text", notNull: true },
    ebay_title: { type: "text", notNull: true },
    ebay_image: { type: "text" },
    ebay_price_gbp: { type: "numeric", notNull: true },
    ebay_shipping_gbp: { type: "numeric", notNull: true },
    market_price_usd: { type: "numeric", notNull: true },
    fx_rate: { type: "numeric", notNull: true },
    profit_gbp: { type: "numeric", notNull: true },
    profit_pct: { type: "numeric", notNull: true },
    confidence: { type: "numeric", notNull: true },
    liquidity: { type: "text", notNull: true },
    condition: { type: "text", notNull: true },
    tier: { type: "text", notNull: true },
    pricing_breakdown: { type: "jsonb" },
    match_details: { type: "jsonb" },
    review_correct: { type: "boolean" },
    review_reason: { type: "text" },
    reviewed_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });

  pgm.createIndex("deals", "ebay_item_id", { unique: true });
  pgm.createIndex("deals", "created_at");


  pgm.createTable("user_preferences", {
    id: "id",
    data: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") }
  });

  pgm.createTable("api_credentials", {
    provider: { type: "text", primaryKey: true },
    encrypted_payload: { type: "text", notNull: true },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });

  pgm.createTable("sync_log", {
    id: "id",
    type: { type: "text", notNull: true },
    status: { type: "text", notNull: true },
    started_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    finished_at: { type: "timestamptz" },
    error: { type: "text" }
  });

  pgm.createTable("exchange_rates", {
    id: "id",
    base_currency: { type: "text", notNull: true },
    quote_currency: { type: "text", notNull: true },
    rate: { type: "numeric", notNull: true },
    fetched_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") }
  });

  pgm.createIndex("cards", "card_number");
  pgm.createIndex("cards", "name", { method: "gin", opclass: "gin_trgm_ops" });
};

exports.down = (pgm) => {
  pgm.dropTable("exchange_rates");
  pgm.dropTable("sync_log");
  pgm.dropTable("api_credentials");
  pgm.dropTable("user_preferences");
  pgm.dropTable("deals");
  pgm.dropTable("cards");
  pgm.dropTable("expansions");
  pgm.dropSequence("deal_event_id_seq");
};
