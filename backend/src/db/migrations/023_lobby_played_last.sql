-- Who played the lobby's last game, so a rematch brings back that line-up (whoever sat it out
-- sits out again) after the reset put everyone back in.
ALTER TABLE lobby_people ADD COLUMN played_last BOOLEAN NOT NULL DEFAULT false;
