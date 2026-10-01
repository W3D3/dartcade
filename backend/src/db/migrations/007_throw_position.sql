-- Where each seat threw in a finished game (a bull off can change it from the seat order).
-- Set together with placement; null for games finished before this column existed.
ALTER TABLE game_players ADD COLUMN throw_position INT;
