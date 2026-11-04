-- Which games the coach has built, and by which COACH_VERSION (coach/store.ts): a game counts as
-- built even when it gave no coach_legs rows, so it isn't replayed again until the version changes.
CREATE TABLE coach_games (
  game_id  TEXT PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  version  INT NOT NULL,
  built_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
