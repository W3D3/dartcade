-- Who can join a lobby without its code: friends (of the host) or nobody (invite only).
-- Design: docs/superpowers/specs/2026-10-04-friends-design.md ("Lobby access")
ALTER TABLE lobbies ADD COLUMN access TEXT NOT NULL DEFAULT 'friends' CHECK (access IN ('friends', 'invite'));
