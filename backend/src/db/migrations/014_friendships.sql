-- Friends: a request (pending) becomes a friendship (accepted). One row per pair of users.
-- Design: docs/superpowers/specs/2026-10-04-friends-design.md
CREATE TABLE friendships (
  id           TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX friendships_pair ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX friendships_requester ON friendships (requester_id);
CREATE INDEX friendships_addressee ON friendships (addressee_id);
