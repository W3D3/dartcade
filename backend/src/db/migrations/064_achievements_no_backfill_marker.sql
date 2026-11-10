-- Old games are now counted by what is missing (a finished game of a counting mode with no
-- achievement_games row), so a mode added later backfills too; the one-off marker is not needed.
DROP TABLE achievement_backfill;
