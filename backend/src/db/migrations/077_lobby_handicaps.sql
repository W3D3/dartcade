-- X01 handicaps in lobbies: the host gives a person their own start score, check-in or check-out
-- for the lobby's X01 singles games (schema common-v1.json Handicap). null: the game's own rules.
ALTER TABLE lobby_people ADD COLUMN handicap JSONB;
