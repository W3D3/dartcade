-- Flag overrides an admin sets at runtime (the admin API, api/adminFlags.ts), applied
-- in flags/definitions.ts on top of FLAGS_ON/FLAG_VALUES. No row for a key: today's default behaviour.
CREATE TABLE feature_flag_overrides (
  key         TEXT PRIMARY KEY,
  mode        TEXT CHECK (mode IN ('off', 'admins', 'users', 'on')),
  user_ids    TEXT[] NOT NULL DEFAULT '{}',
  number      DOUBLE PRECISION,
  updated_by  TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
