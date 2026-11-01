-- Reset the board (like its Reset button) when a player presses Next player.
ALTER TABLE boards ADD COLUMN reset_on_next BOOLEAN NOT NULL DEFAULT true;
