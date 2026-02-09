import { pool } from "../db/pool";

export type MatchResult = {
  cardId: number;
  confidence: number;
  confidenceBreakdown: Record<string, number>;
  extracted: {
    name?: string;
    number?: string;
    printedTotal?: string;
    expansion?: string;
    variant?: string | null;
  };
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9/ ]/g, " ").replace(/\s+/g, " ").trim();

const VARIANT_KEYWORDS = [
  "reverse holo", "reverse", "holo", "full art", "alt art", "alternate art",
  "secret rare", "illustration rare", "special art", "v", "vmax", "vstar",
  "ex", "gx", "rainbow", "gold", "trainer gallery", "promo"
];

const extractVariant = (title: string, specifics: Record<string, string>) => {
  const norm = normalize(title);
  const specVariant = specifics["Variant"] ?? specifics["Finish"] ?? specifics["Card Type"] ?? "";
  const combined = `${norm} ${normalize(specVariant)}`;
  return VARIANT_KEYWORDS.find(kw => combined.includes(kw)) ?? null;
};

const extractSignals = (title: string, specifics: Record<string, string>) => {
  const normalized = normalize(title);
  const numMatch = normalized.match(/(\d{1,3})\/(\d{1,3})/);
  const number = numMatch?.[1] ?? undefined;
  const printedTotal = numMatch?.[2] ?? undefined;
  const name = specifics["Card Name"] ?? specifics["Pokemon"] ?? title.split(" ").slice(0, 3).join(" ");
  const expansion = specifics["Set"] ?? specifics["Expansion"] ?? undefined;
  const variant = extractVariant(title, specifics);
  return { name: name?.trim(), number, printedTotal, expansion, variant };
};

export const matchListing = async (title: string, specifics: Record<string, string>): Promise<MatchResult | null> => {
  const signals = extractSignals(title, specifics);
  const candidates: any[] = [];
  if (signals.number) {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.card_number, c.printed_total, e.name as expansion_name, c.subtypes, similarity(c.name, $1) as name_sim
       FROM cards c
       JOIN expansions e ON c.expansion_id = e.id
       WHERE c.card_number = $2
       ORDER BY name_sim DESC
       LIMIT 10`,
      [signals.name ?? "", signals.number]
    );
    candidates.push(...rows);
  } else if (signals.name) {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.card_number, c.printed_total, e.name as expansion_name, c.subtypes, similarity(c.name, $1) as name_sim
       FROM cards c
       JOIN expansions e ON c.expansion_id = e.id
       WHERE similarity(c.name, $1) > 0.4
       ORDER BY name_sim DESC
       LIMIT 10`,
      [signals.name]
    );
    candidates.push(...rows);
  }

  if (candidates.length === 0) return null;
  const best = candidates[0];
  const nameScore = Math.min(1, best.name_sim || 0);
  const numberScore = signals.number ? 1 : 0.5;
  const denomScore = signals.printedTotal && best.printed_total && signals.printedTotal === String(best.printed_total) ? 1 : 0.5;
  const expansionScore = signals.expansion && best.expansion_name ? 0.8 : 0.5;

  // Variant score: check if extracted variant aligns with card subtypes
  const cardSubtypes = (best.subtypes ?? []).map((s: string) => s.toLowerCase());
  const variantScore = signals.variant
    ? cardSubtypes.some((st: string) => signals.variant!.includes(st) || st.includes(signals.variant!)) ? 0.9 : 0.6
    : 0.5;

  // Extract score: how many signals were successfully extracted (0–1)
  const signalPresence = [signals.name, signals.number, signals.printedTotal, signals.expansion, signals.variant];
  const extractScore = signalPresence.filter(Boolean).length / signalPresence.length;

  const confidence = Math.max(0.01, (
    nameScore * 0.30 +
    numberScore * 0.20 +
    denomScore * 0.15 +
    expansionScore * 0.15 +
    variantScore * 0.10 +
    extractScore * 0.10
  ));

  return {
    cardId: best.id,
    confidence,
    confidenceBreakdown: {
      name: nameScore,
      number: numberScore,
      denom: denomScore,
      expan: expansionScore,
      variant: variantScore,
      extract: extractScore
    },
    extracted: signals
  };
};
