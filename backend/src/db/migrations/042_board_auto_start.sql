-- Start a board's stopped Board Manager session when a lobby game that seats it starts.
ALTER TABLE boards ADD COLUMN auto_start BOOLEAN NOT NULL DEFAULT true;
