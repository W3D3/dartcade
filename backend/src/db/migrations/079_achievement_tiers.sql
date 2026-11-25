-- Achievements: one row per tier reached, with the game and the visit that reached it, so a badge
-- can link to the dart that earned each tier. Replaces user_achievements' earned_at, tier_at and
-- game_id (the first tier, the latest tier and its game).
CREATE TABLE achievement_tiers (
  user_id        TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  tier           INT NOT NULL CHECK (tier BETWEEN 1 AND 5),
  reached_at     TIMESTAMPTZ NOT NULL,
  -- Null once the game is deleted (the source stays, so the badge can say the game is gone)
  game_id        TEXT REFERENCES game_sessions (id) ON DELETE SET NULL,
  -- Where in the game: { visit, leg, legVisit, darts, dart } (AchievementVisit in api-v1.yaml);
  -- null where it is not known
  source         JSONB,
  PRIMARY KEY (user_id, achievement_id, tier)
);

-- What was kept so far: tier 1's time, the latest tier's time and game. Tiers in between take the
-- latest tier's time; the startup backfill replays the counted games to place every tier.
INSERT INTO achievement_tiers (user_id, achievement_id, tier, reached_at, game_id)
SELECT a.user_id, a.achievement_id, t,
       CASE WHEN t = 1 THEN coalesce(a.earned_at, a.tier_at, now()) ELSE coalesce(a.tier_at, now()) END,
       CASE WHEN t = a.tier THEN a.game_id END
FROM user_achievements a, generate_series(1, a.tier) AS t
WHERE a.tier > 0;

ALTER TABLE user_achievements DROP COLUMN earned_at, DROP COLUMN tier_at, DROP COLUMN game_id;

-- One row once the backfill has looked for the visit of every tier above
CREATE TABLE achievement_source_backfill (done_at TIMESTAMPTZ NOT NULL DEFAULT now());
