-- Lobbies: friends gather, pick boards and play games together.
-- Design: docs/superpowers/specs/2026-10-02-online-multiplayer-design.md
-- Only games keep an event log: lobbies are plain rows. Rows of lobby_people and
-- lobby_activity exist only while a lobby is open.

CREATE TABLE lobbies (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  host_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  code         TEXT NOT NULL,
  throw_order  TEXT NOT NULL DEFAULT 'lobby' CHECK (throw_order IN ('lobby', 'random', 'bulloff')),
  next_game    JSONB,
  last_game    JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ
);
-- A code names one open lobby. Closed lobbies keep theirs.
CREATE UNIQUE INDEX lobbies_open_code ON lobbies (code) WHERE closed_at IS NULL;

CREATE TABLE lobby_people (
  id               TEXT PRIMARY KEY,
  lobby_id         TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  user_id          TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  added_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  board_id         TEXT REFERENCES boards(id) ON DELETE SET NULL,
  position         INT NOT NULL,
  plays            BOOLEAN NOT NULL DEFAULT true,
  ready            BOOLEAN NOT NULL DEFAULT false,
  board_moved_by   TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NULL OR user_id = added_by_user_id)
);
-- One open lobby per user: rows only exist for open lobbies
CREATE UNIQUE INDEX lobby_people_one_open_lobby ON lobby_people (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX lobby_people_lobby ON lobby_people (lobby_id, position);
CREATE INDEX lobby_people_board ON lobby_people (board_id);

CREATE TABLE lobby_invites (
  id              TEXT PRIMARY KEY,
  lobby_id        TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  invitee_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  inviter_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lobby_invites_one_pending ON lobby_invites (lobby_id, invitee_user_id) WHERE status = 'pending';
CREATE INDEX lobby_invites_invitee ON lobby_invites (invitee_user_id) WHERE status = 'pending';

CREATE TABLE lobby_activity (
  id            BIGSERIAL PRIMARY KEY,
  lobby_id      TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind          TEXT NOT NULL,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  data          JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX lobby_activity_lobby ON lobby_activity (lobby_id, id DESC);

-- Games played in a lobby stay linked to it after it closes
ALTER TABLE game_sessions ADD COLUMN lobby_id TEXT REFERENCES lobbies(id) ON DELETE SET NULL;
ALTER TABLE game_sessions ADD COLUMN aborted_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
CREATE INDEX game_sessions_lobby ON game_sessions (lobby_id);
