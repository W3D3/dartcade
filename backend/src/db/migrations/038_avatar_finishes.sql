-- Profile pictures in two layers: the Dartcade mark in one finish (avatar_preset, now the
-- foreground) on a disc in another (avatar_background), each picked from the twenty finishes of
-- shared/avatarFinishes.ts. The ten old icons map one to one onto the first ten finishes, and so do
-- their picture.* rewards; whoever wore one now wears that finish on both layers. The colours go.
CREATE VIEW avatar_finish_map (old, new) AS VALUES
  ('logo', 'classic'), ('dart', 'chalk'), ('flight', 'arcade'), ('board', 'bronze'), ('trophy', 'chrome'),
  ('crossed-darts', 'neon'), ('burning-dart', 'inferno'), ('golden-dart', 'gold'), ('flame', 'hot-streak'),
  ('shield', 'crystal');

-- Where an account already holds the new id the rename would break the primary key: the old row goes
DELETE FROM user_unlocks u USING avatar_finish_map m
WHERE u.perk_id = 'picture.' || m.old
  AND EXISTS (SELECT 1 FROM user_unlocks n WHERE n.user_id = u.user_id AND n.perk_id = 'picture.' || m.new);
UPDATE user_unlocks u SET perk_id = 'picture.' || m.new FROM avatar_finish_map m WHERE u.perk_id = 'picture.' || m.old;

-- A preset whose icon isn't in the map (none should be: 035 retired the rest) becomes classic
UPDATE "user" SET avatar_preset = COALESCE((SELECT m.new FROM avatar_finish_map m WHERE m.old = avatar_preset), 'classic')
WHERE avatar_kind = 'preset';
ALTER TABLE "user" ALTER COLUMN avatar_preset SET DEFAULT 'classic';
ALTER TABLE "user" ADD COLUMN avatar_background TEXT DEFAULT 'classic';
UPDATE "user" SET avatar_background = CASE WHEN avatar_kind = 'preset' THEN avatar_preset END, avatar_version = avatar_version + 1;
ALTER TABLE "user" DROP COLUMN avatar_color;
ALTER TABLE "user" DROP COLUMN avatar_fg_color;
DROP VIEW avatar_finish_map;
