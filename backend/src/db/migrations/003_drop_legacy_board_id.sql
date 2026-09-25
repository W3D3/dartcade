-- board_id was the old hardware-id FK on sessions (now game_sessions).
-- board_db_id replaced it in 002_auth; drop the unused NOT NULL column.
ALTER TABLE game_sessions DROP COLUMN board_id;
