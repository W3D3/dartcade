-- Set on every sign-in (databaseHooks.session.create.after, auth/index.ts). No backfill: null until next sign-in.
ALTER TABLE "user" ADD COLUMN last_login_at TIMESTAMPTZ;
