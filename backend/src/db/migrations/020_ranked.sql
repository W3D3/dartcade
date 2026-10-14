-- Ranked matchmaking: a rating per player and mode, and what each ranked game did to it.
-- Design: docs/superpowers/specs/2026-10-14-matchmaking-design.md
CREATE TABLE ranked_ratings (
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  mode       TEXT NOT NULL CHECK (mode IN ('1v1', '2v2')),
  -- Hidden until placed; a new player starts from their X01 average (shared/ranked.ts seedRating).
  rating     INT NOT NULL DEFAULT 1200,
  -- The stage held (0 = Wood I … 29 = Elite V); null while still placing.
  rank_index INT CHECK (rank_index BETWEEN 0 AND 29),
  matches    INT NOT NULL DEFAULT 0,
  wins       INT NOT NULL DEFAULT 0,
  -- Positive: wins in a row; negative: losses in a row.
  streak     INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mode)
);

CREATE TABLE ranked_results (
  session_id    TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL CHECK (mode IN ('1v1', '2v2')),
  won           BOOLEAN NOT NULL,
  -- One of the player's placement matches: its ratings stay hidden.
  placement     BOOLEAN NOT NULL,
  rating_before INT NOT NULL,
  rating_after  INT NOT NULL,
  -- The player's 3-dart average in the game (the online average is over the last 20).
  average       REAL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX ranked_results_user ON ranked_results (user_id, created_at DESC);
