-- New lobbies are private (invite only) unless the host opens them to friends; open lobbies keep
-- their setting. Design: docs/superpowers/specs/2026-10-08-visible-lobby-design.md
ALTER TABLE lobbies ALTER COLUMN access SET DEFAULT 'invite';
