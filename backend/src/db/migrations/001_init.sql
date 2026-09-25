CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  board_id    TEXT NOT NULL,
  game_id     TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  players     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bridge_events (
  id          BIGSERIAL PRIMARY KEY,
  bridge_id   TEXT NOT NULL,
  boot_id     TEXT NOT NULL,
  seq         BIGINT NOT NULL,
  board_id    TEXT NOT NULL,
  recv_wall   TIMESTAMPTZ NOT NULL,
  kind        TEXT NOT NULL,
  data        JSONB NOT NULL,
  inserted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (bridge_id, boot_id, seq)
);

CREATE INDEX IF NOT EXISTS bridge_events_board_time
  ON bridge_events (board_id, inserted_at);
