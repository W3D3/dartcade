-- Game history: finished vs aborted, seats as rows, the input log and normalized darts.
-- Design: docs/superpowers/specs/2026-10-01-game-history-design.md

ALTER TABLE game_sessions ADD COLUMN finished_at TIMESTAMPTZ;
ALTER TABLE game_sessions ADD COLUMN game_version INT NOT NULL DEFAULT 1;
ALTER TABLE game_sessions ADD COLUMN rng_seed INT NOT NULL DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public'));

-- Kept games must not block deleting a board or an account
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_board_db_id_fkey;
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_board_db_id_fkey FOREIGN KEY (board_db_id) REFERENCES boards(id) ON DELETE SET NULL;
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_owner_user_id_fkey;
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES "user"(id) ON DELETE SET NULL;

CREATE TABLE game_players (
  session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  seat       INT  NOT NULL,
  name       TEXT NOT NULL,
  user_id    TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  placement  INT,
  stats      JSONB,
  PRIMARY KEY (session_id, seat)
);
CREATE INDEX game_players_user ON game_players (user_id);

-- Seats of existing games, in stored order; the creator holds seat 0
INSERT INTO game_players (session_id, seat, name, user_id)
SELECT gs.id, p.ord - 1, COALESCE(p.player->>'name', 'Player ' || p.ord), CASE WHEN p.ord = 1 THEN gs.owner_user_id END
FROM game_sessions gs, jsonb_array_elements(gs.players) WITH ORDINALITY AS p(player, ord);

ALTER TABLE game_sessions DROP COLUMN players;

-- Games running during this upgrade have no input log to restore them from
UPDATE game_sessions SET status = 'aborted', finished_at = now() WHERE status = 'active';

CREATE TABLE game_session_events (
  session_id      TEXT   NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  seq             INT    NOT NULL,
  source          TEXT   NOT NULL CHECK (source IN ('board', 'user')),
  kind            TEXT   NOT NULL,
  data            JSONB  NOT NULL,
  bridge_event_id BIGINT REFERENCES bridge_events(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE game_darts (
  session_id TEXT  NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  visit      INT   NOT NULL,
  dart_index INT   NOT NULL,
  seat       INT   NOT NULL,
  leg        INT   NOT NULL,
  phase      TEXT  NOT NULL CHECK (phase IN ('game', 'bulloff')),
  segment    JSONB NOT NULL,
  coords     JSONB,
  source     TEXT  NOT NULL CHECK (source IN ('camera', 'manual')),
  corrected  BOOLEAN NOT NULL,
  thrown_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (session_id, visit, dart_index)
);
