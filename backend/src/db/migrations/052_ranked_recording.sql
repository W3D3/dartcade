-- Ranked recording that doesn't depend on when it runs:
--  * ranked_matches.ratings: the rating each player was matched on, so a newcomer is seeded from
--    that and not from an X01 average that by now includes the game being rated.
--  * ranked_matches.void_reason: a finished game deliberately not rated (and why), so it is not
--    retried at every start.
--  * ranked_results.forfeited / rank_before / rank_after: whether the player's seat forfeited
--    (a forfeited game is rated on the result alone) and the rank held going in and coming out
--    (null while placing; not derivable from the rating because of the demotion buffer).
ALTER TABLE ranked_matches
  ADD COLUMN ratings     JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN void_reason TEXT;

ALTER TABLE ranked_results
  ADD COLUMN forfeited   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN rank_before INT CHECK (rank_before BETWEEN 0 AND 29),
  ADD COLUMN rank_after  INT CHECK (rank_after BETWEEN 0 AND 29);
