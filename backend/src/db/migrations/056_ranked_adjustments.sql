-- An admin setting a player's rating or sending them back to placement. The rating replay
-- (recalculateRatings) applies these in time order between the games they fall between, so an
-- adjustment survives the next invalidation instead of being replayed away.
CREATE TABLE ranked_adjustments (
  id            BIGSERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL CHECK (mode IN ('1v1', '2v2')),
  kind          TEXT NOT NULL CHECK (kind IN ('set', 'reset')),
  -- The rating a 'set' puts them on; null for a 'reset', which keeps the rating they have
  rating        INT CHECK (rating >= 0),
  reason        TEXT NOT NULL,
  admin_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'set') = (rating IS NOT NULL))
);
CREATE INDEX ranked_adjustments_mode ON ranked_adjustments (mode, created_at, id);
