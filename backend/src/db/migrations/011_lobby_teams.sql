-- Teams: each person in a lobby is on Team A, Team B or none. Kept from game to game, and
-- while the next game is singles, until the host changes them.
ALTER TABLE lobby_people ADD COLUMN team TEXT CHECK (team IN ('A', 'B'));
