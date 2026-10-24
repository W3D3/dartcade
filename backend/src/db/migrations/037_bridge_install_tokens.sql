-- A one-time token the user's install command carries: the bridge swaps it for its own board
-- token the first time it starts (the board then appears under the user's account), and it expires.
CREATE TABLE bridge_install_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
