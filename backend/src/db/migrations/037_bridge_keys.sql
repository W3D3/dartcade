-- A user's own bridge key: a bridge signs in with it instead of a pairing code, and its board
-- appears under the user's account the first time it connects (one board per bridge_id).
CREATE TABLE bridge_keys (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE boards ADD COLUMN bridge_id TEXT;
CREATE UNIQUE INDEX boards_owner_bridge_id ON boards (owner_user_id, bridge_id) WHERE bridge_id IS NOT NULL;
