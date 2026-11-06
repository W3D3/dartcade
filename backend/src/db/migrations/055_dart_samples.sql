-- Training data for the dart detection model (docs/superpowers/specs/2026-10-31-dart-detection-model-design.md):
-- one sample per camera dart, the before and after warped still of each camera. Its label is not
-- copied: the export joins it to the game's final dart through game_session_events.
CREATE TABLE dart_samples (
  id              BIGSERIAL PRIMARY KEY,
  board_id        TEXT   NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  -- the dart.detected the sample shows
  bridge_event_id BIGINT NOT NULL UNIQUE REFERENCES bridge_events(id) ON DELETE CASCADE,
  bm_version      TEXT,
  -- the six stills' size, for the storage cap
  bytes           INT    NOT NULL,
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dart_samples_board ON dart_samples (board_id);

CREATE TABLE dart_sample_stills (
  sample_id BIGINT   NOT NULL REFERENCES dart_samples(id) ON DELETE CASCADE,
  phase     TEXT     NOT NULL CHECK (phase IN ('before', 'after')),
  cam       SMALLINT NOT NULL CHECK (cam BETWEEN 0 AND 2),
  jpeg      BYTEA    NOT NULL,
  PRIMARY KEY (sample_id, phase, cam)
);

-- The board's owner can turn collection off (Settings → Boards); on by default
ALTER TABLE boards ADD COLUMN share_training_images BOOLEAN NOT NULL DEFAULT true;

-- The export finds a sample's game input by its bridge event
CREATE INDEX game_session_events_bridge_event ON game_session_events (bridge_event_id) WHERE bridge_event_id IS NOT NULL;
