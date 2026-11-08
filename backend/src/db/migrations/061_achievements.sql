-- Achievements: a count per account and achievement (shared/achievements.ts says which tier it
-- reaches), and the games already counted so counting a game twice changes nothing.
CREATE TABLE user_achievements (
  user_id        TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  count          INT NOT NULL CHECK (count >= 0),
  tier           INT NOT NULL CHECK (tier BETWEEN 0 AND 5),
  -- When tier 1 was reached, and the latest tier (with the game that gave it)
  earned_at      TIMESTAMPTZ,
  tier_at        TIMESTAMPTZ,
  game_id        TEXT REFERENCES game_sessions (id) ON DELETE SET NULL,
  -- The tier the player has looked at on the Achievements page: tier > seen_tier is "new"
  seen_tier      INT NOT NULL DEFAULT 0,
  -- Profile showcase position, 0-based; null when not shown
  showcase_slot  INT CHECK (showcase_slot BETWEEN 0 AND 4),
  PRIMARY KEY (user_id, achievement_id),
  UNIQUE (user_id, showcase_slot)
);
CREATE TABLE achievement_games (
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES game_sessions (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, game_id)
);
-- One row once the games from before achievements existed have been counted
CREATE TABLE achievement_backfill (done_at TIMESTAMPTZ NOT NULL DEFAULT now());
