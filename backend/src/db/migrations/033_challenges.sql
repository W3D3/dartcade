-- Daily and weekly challenges: three slots a period, written when the period is first read or a
-- game ends in it (progression/challenges.ts generates them). Past periods stay for a history.
CREATE TABLE user_challenges (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  period       TEXT NOT NULL CHECK (period IN ('daily', 'weekly')),
  -- The day (daily) or its week's Monday (weekly), in the account's time zone
  period_key   DATE NOT NULL,
  slot         INT NOT NULL CHECK (slot BETWEEN 1 AND 3),
  template_id  TEXT NOT NULL,
  target       INT NOT NULL CHECK (target > 0),
  progress     INT NOT NULL DEFAULT 0,
  xp           INT NOT NULL,
  completed_at TIMESTAMPTZ,
  -- How often the slot was rerolled (it seeds the generator)
  reroll       INT NOT NULL DEFAULT 0,
  -- The games already counted, and what a template remembers between them
  state        JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period, period_key, slot)
);
