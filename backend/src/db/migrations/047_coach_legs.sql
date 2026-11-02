-- The coach's review of each leg a player with an account threw in a coachable X01 game, built
-- when the game finishes (coach/store.ts). `version` is the coach code that built it: a game whose
-- rows are of another version is rebuilt.
CREATE TABLE coach_legs (
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  game_id        TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  leg            INT NOT NULL,
  seat           INT NOT NULL,
  finished_at    TIMESTAMPTZ NOT NULL,
  won            BOOLEAN NOT NULL,
  ranked         BOOLEAN NOT NULL,
  darts          INT NOT NULL,
  average        REAL,
  low_visits     INT NOT NULL,
  bad_setups     INT NOT NULL,
  missed_doubles INT NOT NULL,
  clean          BOOLEAN NOT NULL,
  opponents      JSONB NOT NULL,
  context        TEXT NOT NULL,
  review         JSONB NOT NULL,
  -- Who won the leg and their darts in it; null when the round limit cut the leg short (no winner).
  winner_name    TEXT,
  winner_darts   INT,
  version        INT NOT NULL,
  PRIMARY KEY (game_id, leg, seat)
);
CREATE INDEX coach_legs_user ON coach_legs (user_id, finished_at DESC);
