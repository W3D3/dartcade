-- Caller voice packs imported by users. Clips are stored once per content hash;
-- a user reaches a clip only through one of their own packs.
-- Design: docs/superpowers/specs/2026-10-04-caller-voice-packs-design.md
CREATE TABLE voice_clips (
  sha256 TEXT PRIMARY KEY,
  mime   TEXT NOT NULL,
  size   INTEGER NOT NULL,
  bytes  BYTEA NOT NULL
);

CREATE TABLE voice_packs (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  lang       TEXT,
  source     TEXT NOT NULL CHECK (source IN ('upload', 'url')),
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX voice_packs_owner ON voice_packs (owner_id);

-- Which clip plays for which key; a key with several variants has one row per variant.
CREATE TABLE voice_pack_clips (
  pack_id     TEXT NOT NULL REFERENCES voice_packs(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  variant     INTEGER NOT NULL,
  clip_sha256 TEXT NOT NULL REFERENCES voice_clips(sha256),
  PRIMARY KEY (pack_id, key, variant)
);
CREATE INDEX voice_pack_clips_clip ON voice_pack_clips (clip_sha256);
