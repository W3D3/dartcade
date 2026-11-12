-- In-person tournaments: the organizers add the players (spots) themselves. A spot starts as a guest
-- and is claimed through its claim link (#/tournaments/claim/<code>); a player who registered online
-- is a 'player'. In-person teams carry their own tag and colour (they aren't Dartcade teams), and
-- entries keep the organizer's order on the list.
ALTER TABLE tournament_players
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'player' CHECK (kind IN ('player', 'spot')),
  ADD COLUMN claim_code TEXT UNIQUE,
  ADD CONSTRAINT tournament_players_spot_code CHECK ((kind = 'spot') = (claim_code IS NOT NULL));
ALTER TABLE tournament_entries
  ADD COLUMN tag TEXT,
  ADD COLUMN color TEXT,
  ADD COLUMN list_position INT CHECK (list_position >= 0);
