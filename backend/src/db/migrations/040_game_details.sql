-- A finished game's details page (its per-mode detail and match stats), built once by replaying its
-- log instead of on every load. `version` is the code that built it (history/detail.ts): a detail
-- built by another version is rebuilt on the next load.
CREATE TABLE game_details (
  session_id TEXT PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  detail JSONB NOT NULL,
  stats JSONB NOT NULL
);
