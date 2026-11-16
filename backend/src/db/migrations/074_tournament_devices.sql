-- Venue devices in tournament mode: a scoped session bound to one tournament, not a login. The
-- organizer adds a device (a one-time pairing code, stored only as a hash, short lived); opening
-- it on the device exchanges it for a random token (also only a hash here) that the browser keeps
-- in an httpOnly cookie. The server limits that session to scorekeeping for this tournament.
CREATE TABLE tournament_devices (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT,
  pair_code_hash TEXT UNIQUE,
  pair_expires_at TIMESTAMPTZ NOT NULL,
  token_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paired_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);
CREATE INDEX tournament_devices_tournament ON tournament_devices (tournament_id);
