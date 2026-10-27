-- What friends see on Home: a 180, a ton-plus out, a rank-up. One row per user, game and kind,
-- written when the game finishes (or the ranked result is recorded), so a replay can't duplicate it.
-- Design: docs/superpowers/specs/2026-10-27-home-page-design.md
CREATE TABLE friend_activity (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  game_id    TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (game_id, user_id, kind)
);
CREATE INDEX friend_activity_created ON friend_activity (created_at DESC);
CREATE INDEX friend_activity_user ON friend_activity (user_id, created_at DESC);
