-- better-auth's admin plugin: roles, bans, impersonation. camelCase like 002_auth.sql.
-- Design: docs/superpowers/specs/2026-10-09-minigolf-core-bench-design.md ("Backend: admin role")
ALTER TABLE "user"
  ADD COLUMN role TEXT,
  ADD COLUMN banned BOOLEAN DEFAULT false,
  ADD COLUMN "banReason" TEXT,
  ADD COLUMN "banExpires" TIMESTAMPTZ;
ALTER TABLE "session" ADD COLUMN "impersonatedBy" TEXT;
