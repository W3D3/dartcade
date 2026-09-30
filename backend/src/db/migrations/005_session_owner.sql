-- Sessions belong to the user who started them; a user has one active session at a time.
ALTER TABLE game_sessions ADD COLUMN owner_user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;

-- Existing board sessions belong to the board's owner
UPDATE game_sessions gs SET owner_user_id = b.owner_user_id FROM boards b WHERE gs.board_db_id = b.id;

-- Boardless sessions have no known owner and can't be restored after a restart
UPDATE game_sessions SET status = 'finished' WHERE status = 'active' AND owner_user_id IS NULL;

-- Keep only the newest active session per user
UPDATE game_sessions gs SET status = 'finished'
WHERE gs.status = 'active' AND EXISTS (
  SELECT 1 FROM game_sessions newer
  WHERE newer.owner_user_id = gs.owner_user_id AND newer.status = 'active' AND newer.created_at > gs.created_at
);

CREATE UNIQUE INDEX game_sessions_one_active_per_owner ON game_sessions (owner_user_id) WHERE status = 'active';
