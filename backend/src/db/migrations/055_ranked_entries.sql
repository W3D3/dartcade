-- What each ranked player went into the game with, for the match screen: not just the rating they
-- were matched on (ranked_matches.ratings, a number per player) but also their rank, how many
-- placement matches they had played and what the game stood to win or lose them.
-- A game running while this ships reads as the player's first (no rank, no stakes).
ALTER TABLE ranked_matches RENAME COLUMN ratings TO entries;

UPDATE ranked_matches
SET entries = COALESCE(
  (SELECT jsonb_object_agg(e.key, jsonb_build_object('rating', e.value, 'rankIndex', NULL, 'matches', 0, 'stakes', NULL))
   FROM jsonb_each(entries) AS e
   WHERE jsonb_typeof(e.value) = 'number'),
  '{}'::jsonb
);
