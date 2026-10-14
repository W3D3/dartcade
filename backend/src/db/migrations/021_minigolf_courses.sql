-- Minigolf courses and holes the editor writes; a game copies the published course in at its start.
-- Design: docs/superpowers/specs/2026-10-14-minigolf-course-editor-design.md
-- IF NOT EXISTS: this ran as 020_minigolf_courses on dev and preview databases before ranked took 020
CREATE TABLE IF NOT EXISTS minigolf_holes (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  published JSONB,
  draft JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS minigolf_courses (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'official',
  published JSONB,
  draft JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
