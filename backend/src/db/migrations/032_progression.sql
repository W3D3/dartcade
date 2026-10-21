-- Progression: XP paid per account and reason (the ledger, the source of truth), and the totals
-- it adds up to (a cache, rebuildable from the ledger). Rules: shared/progression.ts, progression/.
CREATE TABLE xp_ledger (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  -- dart, game, win, ranked, highlight, daily, challenge, milestone
  kind        TEXT NOT NULL,
  -- What paid it ('game', 'game:180', …) and its id (a game session id, …)
  source_type TEXT NOT NULL,
  source_id   TEXT NOT NULL,
  amount      INT NOT NULL CHECK (amount >= 0),
  -- The day it counts for, in the account's time zone when it was paid
  local_date  DATE NOT NULL,
  meta        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Paying the same thing twice changes nothing
  UNIQUE (user_id, kind, source_type, source_id)
);
CREATE INDEX xp_ledger_day ON xp_ledger (user_id, local_date);
CREATE INDEX xp_ledger_source ON xp_ledger (source_id);

CREATE TABLE user_progress (
  user_id          TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  xp_total         INT NOT NULL DEFAULT 0,
  level            INT NOT NULL DEFAULT 1,
  streak_current   INT NOT NULL DEFAULT 0,
  streak_best      INT NOT NULL DEFAULT 0,
  streak_last_date DATE,
  freezes          INT NOT NULL DEFAULT 1,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Finished games from before progression were paid once (progression/backfill.ts)
CREATE TABLE progression_backfill (
  done_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
