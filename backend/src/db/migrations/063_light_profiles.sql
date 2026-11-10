-- Light profiles a player makes by duplicating or importing one. The built-in profile stays in code;
-- a board with no light_profile_id uses it (with the board's own seat colours, migration 061).
-- Deleting a profile puts the boards using it back on the built-in one.
CREATE TABLE light_profiles (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seat_colors JSONB NOT NULL,
  rules JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, name)
);
ALTER TABLE boards ADD COLUMN light_profile_id TEXT REFERENCES light_profiles(id) ON DELETE SET NULL;
