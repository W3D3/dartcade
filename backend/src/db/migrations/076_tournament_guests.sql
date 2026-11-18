-- Guest teammates (#612): a team entry may hold players with no account, who play on the captain's
-- board. Such a row is kind 'guest', with the name the captain typed and no user; nothing else is
-- stored for it. The setting is null (guests off) on every tournament saved before it.
ALTER TABLE tournament_players DROP CONSTRAINT tournament_players_kind_check;
ALTER TABLE tournament_players
  ADD CONSTRAINT tournament_players_kind_check CHECK (kind IN ('player', 'spot', 'guest'));
UPDATE tournaments SET settings = settings || '{"guests": null}' WHERE NOT settings ? 'guests';
