-- Online multiplayer: each seat has a controller account and its own input board.
-- Design: docs/superpowers/specs/2026-10-02-online-multiplayer-design.md

ALTER TABLE game_players ADD COLUMN controller_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE game_players ADD COLUMN board_db_id TEXT REFERENCES boards(id) ON DELETE SET NULL;
ALTER TABLE game_players ADD COLUMN forfeited BOOLEAN NOT NULL DEFAULT false;

-- Existing games: the owner controlled every seat, all on the game's board
UPDATE game_players gp SET controller_user_id = gs.owner_user_id, board_db_id = gs.board_db_id
FROM game_sessions gs WHERE gs.id = gp.session_id;

CREATE INDEX game_players_board ON game_players (board_db_id);

-- Which board a logged board event came from (audit; not read by replay)
ALTER TABLE game_session_events ADD COLUMN board_db_id TEXT;

-- One active game per *user* now spans every seat they control; the engine enforces it
DROP INDEX IF EXISTS game_sessions_one_active_per_owner;
