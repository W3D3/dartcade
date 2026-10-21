-- A moderator can invalidate a finished game: it stays (an investigation may need it) but no
-- longer counts in history, stats or ratings. The reason is optional.
ALTER TABLE game_sessions
  ADD COLUMN invalidated_at TIMESTAMPTZ,
  ADD COLUMN invalidated_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  ADD COLUMN invalidation_reason TEXT;
