-- Big screen: a view-only game display that follows a board. The mode is the owner's setting; the
-- token (stored as a hash, like boards.token_hash) lets the bridge machine's kiosk window follow it.
ALTER TABLE boards
  ADD COLUMN big_screen_mode TEXT NOT NULL DEFAULT 'off' CHECK (big_screen_mode IN ('off', 'auto', 'manual')),
  ADD COLUMN big_screen_token_hash TEXT UNIQUE;
