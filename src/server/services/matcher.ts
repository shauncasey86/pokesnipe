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
  };
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9/ ]/g, " ").replace(/\s+/g, " ").trim();

const extractSignals = (title: string, specifics: Record<string, string>) => {
  const normalized = normalize(title);
  const numMatch = normalized.match(/(\d{1,3})\/(\d{1,3})/);
  const number = numMatch?.[1] ?? undefined;
  const printedTotal = numMatch?.[2] ?? undefined;
  const name = specifics["Card Name"] ?? specifics["Pokemon"] ?? title.split(" ").slice(0, 3).join(" ");
  const expansion = specifics["Set"] ?? specifics["Expansion"] ?? undefined;
  return { name: name?.trim(), number, printedTotal, expansion };
};

export const matchListing = async (title: string, specifics: Record<string, string>): Promise<MatchResult | null> => {
  const signals = extractSignals(title, specifics);
  const candidates: any[] = [];
  if (signals.number) {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.card_number, c.printed_total, e.name as expansion_name, similarity(c.name, $1) as name_sim
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
      `SELECT c.id, c.name, c.card_number, c.printed_total, e.name as expansion_name, similarity(c.name, $1) as name_sim
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
  const confidence = Math.max(0.01, (nameScore * 0.4 + numberScore * 0.2 + denomScore * 0.2 + expansionScore * 0.2));
  return {
    cardId: best.id,
    confidence,
    confidenceBreakdown: { name: nameScore, number: numberScore, denom: denomScore, expan: expansionScore },
    extracted: signals
  };
};
