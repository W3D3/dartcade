-- Rematch is gone (the next-game card already repeats a game's settings and players, so
-- Start alone does what Rematch did): drop the column that recorded what it would replay.
ALTER TABLE lobbies DROP COLUMN last_game;
