-- Official tournaments (kind 'official', made by admins): their tags (OFFICIAL is the kind, WEEKLY a
-- tag) and prizes, a list of {from, to, xp, title} by final place; shared/tournaments/prizes.ts.
-- Prizes are paid in the transaction that finishes the tournament.
ALTER TABLE tournaments
  ADD COLUMN tags   TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN prizes JSONB  NOT NULL DEFAULT '[]';
