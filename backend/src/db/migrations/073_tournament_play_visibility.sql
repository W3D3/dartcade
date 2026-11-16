-- Splits tournaments.access (public | friends | invite | in_person) into three properties: where it
-- is played (online or in person), whether the organizers add the players themselves (preselected,
-- in person only), and who sees it (public, friends, invite link, private: organizers and the
-- players in it). An in_person tournament was public, so it stays visible to everyone.
ALTER TABLE tournaments
  ADD COLUMN play TEXT NOT NULL DEFAULT 'online' CHECK (play IN ('online', 'in_person')),
  ADD COLUMN preselected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'friends', 'invite', 'private'));
UPDATE tournaments SET play = 'in_person', preselected = true, visibility = 'public' WHERE access = 'in_person';
UPDATE tournaments SET visibility = access WHERE access <> 'in_person';
ALTER TABLE tournaments
  DROP COLUMN access,
  ALTER COLUMN play DROP DEFAULT,
  ALTER COLUMN visibility DROP DEFAULT,
  -- Online, the players register themselves
  ADD CONSTRAINT tournaments_preselected_in_person CHECK (NOT preselected OR play = 'in_person'),
  -- Nobody could find a private tournament to register for it
  ADD CONSTRAINT tournaments_private_preselected CHECK (visibility <> 'private' OR preselected);
