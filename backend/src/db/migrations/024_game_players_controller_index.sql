-- usualBoards (db/lobbies.ts) looks up members' games by controller on every lobby load
CREATE INDEX game_players_controller ON game_players (controller_user_id, session_id);
