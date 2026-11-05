-- Ranked in-game rules, kept with the game so a restart brings them back and a later flag change
-- never alters a running game: the visit time, the reserve and whether darts may be entered by
-- hand, as the flags said when the game started. Null for a game from before (no clock).
ALTER TABLE ranked_matches ADD COLUMN rules JSONB;

-- The server's own inputs (a ranked clock running out, a player away too long) are logged like
-- the others, from a source no client can send.
ALTER TABLE game_session_events DROP CONSTRAINT game_session_events_source_check;
ALTER TABLE game_session_events ADD CONSTRAINT game_session_events_source_check CHECK (source IN ('board', 'user', 'system'));
