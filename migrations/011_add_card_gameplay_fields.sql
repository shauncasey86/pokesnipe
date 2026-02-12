-- Add card gameplay and metadata fields from Scrydex API that were previously not stored.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS hp                       TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS level                    TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS types                    TEXT[] DEFAULT '{}';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS evolves_from             TEXT[] DEFAULT '{}';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS rules                    TEXT[] DEFAULT '{}';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ancient_trait            JSONB;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS abilities                JSONB DEFAULT '[]';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS attacks                  JSONB DEFAULT '[]';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS weaknesses               JSONB DEFAULT '[]';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS resistances              JSONB DEFAULT '[]';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS retreat_cost             TEXT[] DEFAULT '{}';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS converted_retreat_cost   INTEGER;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS printed_number           TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS rarity_code              TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS national_pokedex_numbers INTEGER[] DEFAULT '{}';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS flavor_text              TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS regulation_mark          TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS expansion_sort_order     INTEGER;

-- Useful indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_cards_types ON cards USING GIN (types);
CREATE INDEX IF NOT EXISTS idx_cards_regulation_mark ON cards (regulation_mark);
CREATE INDEX IF NOT EXISTS idx_cards_pokedex ON cards USING GIN (national_pokedex_numbers);
CREATE INDEX IF NOT EXISTS idx_cards_hp ON cards (hp);
