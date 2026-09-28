CREATE TABLE pairing_codes (
  code        TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  claimed_at  TIMESTAMPTZ,
  raw_token   TEXT,
  board_id    TEXT REFERENCES boards(id) ON DELETE CASCADE
);
CREATE INDEX pairing_codes_expires ON pairing_codes (expires_at);
