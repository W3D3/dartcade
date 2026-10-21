-- Profile picture: none (initials), a built-in preset, or an uploaded photo (bytes in Postgres;
-- no blob storage exists). avatar_version bumps on every change to cache-bust GET /api/users/{id}/avatar.
ALTER TABLE "user" ADD COLUMN avatar_kind TEXT NOT NULL DEFAULT 'none' CHECK (avatar_kind IN ('none', 'preset', 'upload'));
ALTER TABLE "user" ADD COLUMN avatar_preset TEXT;
ALTER TABLE "user" ADD COLUMN avatar_image BYTEA;
ALTER TABLE "user" ADD COLUMN avatar_content_type TEXT;
ALTER TABLE "user" ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0;
