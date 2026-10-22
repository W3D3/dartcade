-- The Target, Star and Crown pictures left the rewards (shared/progression.ts PERKS): whoever wears
-- one goes back to the Dartcade mark, in the colours they picked. Their user_unlocks rows stay; the
-- read path ignores perk ids the catalogue no longer has.
UPDATE "user" SET avatar_preset = 'logo', avatar_version = avatar_version + 1
WHERE avatar_preset IN ('target', 'star', 'crown');
