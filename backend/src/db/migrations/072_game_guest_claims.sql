-- A host asks a friend to take over a guest seat of a finished game. Nothing about the game changes
-- until the friend accepts (then game_players.user_id is the friend's). A deleted account's claims go.
CREATE TABLE game_guest_claims (
  id              TEXT PRIMARY KEY,
  game_session_id TEXT NOT NULL REFERENCES game_sessions (id) ON DELETE CASCADE,
  seat            INT NOT NULL,
  invited_user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  invited_by      TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at     TIMESTAMPTZ
);
-- One pending invite per guest seat, and a friend is asked for one seat of a game at a time
CREATE UNIQUE INDEX game_guest_claims_seat_pending ON game_guest_claims (game_session_id, seat) WHERE status = 'pending';
CREATE UNIQUE INDEX game_guest_claims_friend_pending ON game_guest_claims (game_session_id, invited_user_id) WHERE status = 'pending';
CREATE INDEX game_guest_claims_invitee_idx ON game_guest_claims (invited_user_id) WHERE status = 'pending';
