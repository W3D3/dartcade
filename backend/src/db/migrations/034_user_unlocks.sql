-- Cosmetic perks an account has unlocked (shared/progression.ts PERKS), written when a level, a
-- streak milestone or a deed is first reached, so changing the curve later never takes one away.
-- The level 1 perks need no row. What's worn lives in user.preferences.equipped.
CREATE TABLE user_unlocks (
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  perk_id     TEXT NOT NULL,
  -- level, streak or event
  source      TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, perk_id)
);
