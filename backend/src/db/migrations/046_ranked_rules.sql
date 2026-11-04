-- Ranked in-game rules, kept with the game so a restart brings them back: the visit time and
-- reserve it started with, whether darts may be entered by hand, and what each seat's side stands
-- to win or lose (null per seat while placing).
ALTER TABLE ranked_matches
  ADD COLUMN visit_seconds   INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN reserve_seconds INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN manual_entry    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN stakes          JSONB   NOT NULL DEFAULT '[]';
