-- WLED devices paired to a board, and the board's lights master switch (#135)
CREATE TABLE wled_devices (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  mac TEXT NOT NULL,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  leds INTEGER NOT NULL CHECK (leds >= 0),
  version TEXT NOT NULL,
  segments INTEGER NOT NULL DEFAULT 1 CHECK (segments >= 0),
  segment_mode TEXT NOT NULL CHECK (segment_mode IN ('whole', 'perSeat', 'wled')),
  max_bri INTEGER NOT NULL DEFAULT 178 CHECK (max_bri BETWEEN 1 AND 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_id, mac)
);
ALTER TABLE boards ADD COLUMN lights_enabled BOOLEAN NOT NULL DEFAULT true;
