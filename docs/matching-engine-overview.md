# Matching Engine Overview

The matching engine takes an eBay listing title like `"Charizard 4/102 Base Set Holo Rare NM"` and figures out **exactly which card** it is in the database, then returns pricing data. It works in 6 stages.

## 1. Candidate Lookup

Start with the **card number** (most reliable signal). Query the database:

- **Best case:** Number + denominator (e.g. `4/102`) → usually 1 match
- **Fallback:** Number only (e.g. `4`) → up to 50 candidates across sets
- **Last resort:** Fuzzy name search (PostgreSQL trigram similarity) if no number was extracted

## 2. Candidate Disambiguation

If multiple candidates come back, score each one by:

- **Name similarity** (70% weight) — Jaro-Winkler fuzzy string match
- **Expansion/set match** (30% weight) — does "Base Set" match the candidate's set?

Pick the highest-scoring candidate. Past user feedback (confusion pairs) can boost (+0.10) or penalize (-0.15) specific candidates.

## 3. Variant Resolution

Determine *which version* of the card (holo, reverse holo, 1st edition, etc.) by trying these strategies in order:

1. **Single variant** — if only one variant has prices, use it (confidence: 0.95)
2. **Keyword match** — map title keywords like "reverse holo" to variant names (confidence: 0.85)
3. **Default cheapest** — fall back to the lowest-priced variant (confidence: 0.50)

## 4. Confidence Scoring

Compute a **weighted geometric mean** across 6 signals:

| Signal        | Weight | What it measures                    |
|---------------|--------|-------------------------------------|
| Name          | 0.30   | How well the extracted name matches |
| Number        | 0.15   | Was a card number extracted?        |
| Denominator   | 0.25   | Does the set total (e.g. /102) match? |
| Expansion     | 0.10   | Does the set name match?            |
| Variant       | 0.10   | How confident is variant resolution? |
| Normalization | 0.10   | How many signals were extracted overall? |

The geometric mean means **one bad signal drags everything down** — a great name match can't hide a missing card number.

## 5. Gate Validation

Reject the match if:

- Name similarity < **0.60** (hard gate — name is too different)
- Composite confidence < **0.45** (soft gate — not enough evidence overall)

## 6. Return Result

Output the matched card, variant, prices, and a full confidence breakdown for downstream use by the pricing and deal-creation services.

---

## Key Design Choices

- **Number-first** — card numbers are the most reliable identifier, so they're always tried first
- **Conservative** — the geometric mean + gates prevent false matches from slipping through
- **Self-improving** — when users flag wrong matches, the confusion checker learns to penalize those candidates next time
- **Two-pass** — the scanner runs matching twice: once on title-only (quick filter), then again after enriching with eBay's structured item data (accurate final match)

## Source Files

All matching logic lives in `src/services/matching/`:

| File                    | Purpose                                      |
|-------------------------|----------------------------------------------|
| `index.ts`              | Main orchestrator — runs the 6-stage pipeline |
| `candidate-lookup.ts`   | Database candidate search strategies          |
| `name-validator.ts`     | Jaro-Winkler string similarity scoring        |
| `expansion-validator.ts`| Set/expansion name validation                 |
| `variant-resolver.ts`   | Card variant selection logic                  |
| `confidence-scorer.ts`  | Weighted geometric mean calculation           |
| `gates.ts`              | Confidence thresholds and rejection gates     |
| `confusion-checker.ts`  | Feedback-driven learning from incorrect matches |
