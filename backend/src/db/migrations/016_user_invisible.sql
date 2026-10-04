-- Invisible: friends see you as offline (lobbies, invites and games are unaffected).
-- Design: docs/superpowers/specs/2026-10-04-friends-design.md ("Online status")
ALTER TABLE "user" ADD COLUMN invisible BOOLEAN NOT NULL DEFAULT false;
