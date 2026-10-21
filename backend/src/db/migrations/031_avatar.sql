-- Profile picture: the Dartcade mark (default), a built-in preset, or an uploaded photo (bytes in
-- Postgres; no blob storage exists). A preset's icon (avatar_preset) and its background/foreground
-- (avatar_color/avatar_fg_color) are chosen independently, so any colour can go with any other.
-- New accounts start on the mark, grey on black, rather than bare initials; avatar_version bumps
-- on every change to cache-bust GET /api/users/{id}/avatar.
ALTER TABLE "user" ADD COLUMN avatar_kind TEXT NOT NULL DEFAULT 'preset' CHECK (avatar_kind IN ('none', 'preset', 'upload'));
ALTER TABLE "user" ADD COLUMN avatar_preset TEXT DEFAULT 'logo';
ALTER TABLE "user" ADD COLUMN avatar_color TEXT DEFAULT '#808080';
ALTER TABLE "user" ADD COLUMN avatar_fg_color TEXT DEFAULT '#000000';
ALTER TABLE "user" ADD COLUMN avatar_image BYTEA;
ALTER TABLE "user" ADD COLUMN avatar_content_type TEXT;
ALTER TABLE "user" ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0;
