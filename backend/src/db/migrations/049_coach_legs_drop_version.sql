-- Which coach code built a game's legs is its coach_games marker (048); the per-row version from 047
-- only repeated it. Dropped here rather than edited out of 047, which databases have already run.
ALTER TABLE coach_legs DROP COLUMN version;
