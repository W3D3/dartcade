-- What admins and moderators did that changes other people's data: invalidating a game, impersonating a user.
-- The admin's account may go away; the row stays.
CREATE TABLE admin_audit (
  id            BIGSERIAL PRIMARY KEY,
  admin_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  -- What it was done to (a game id, a user id)
  target        TEXT NOT NULL,
  detail        JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_created ON admin_audit (created_at DESC);
