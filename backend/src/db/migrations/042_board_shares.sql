-- Board sharing: an owner invites a friend to use their board; the friend accepts or declines.
-- Design: docs/superpowers/specs/2026-10-26-board-sharing-design.md
CREATE TABLE board_shares (
  id             TEXT PRIMARY KEY,
  board_id       TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  friend_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX board_shares_board_friend ON board_shares (board_id, friend_user_id);
CREATE INDEX board_shares_friend ON board_shares (friend_user_id);
