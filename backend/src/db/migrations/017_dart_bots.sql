-- Dart bots: a seat with no account, controlled by whoever added it, whose darts the server
-- throws itself. Design: docs/superpowers/specs/2026-10-06-dart-bots-design.md
ALTER TABLE lobby_people ADD COLUMN bot_level INT;
ALTER TABLE game_players ADD COLUMN bot_level INT;
