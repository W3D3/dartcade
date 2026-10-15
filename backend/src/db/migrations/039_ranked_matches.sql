-- Ranked matchmaking: which games the queue started, and who played on which side, so the ratings
-- move when the game ends (also after a restart). Design: docs/superpowers/specs/2026-10-14-matchmaking-design.md
CREATE TABLE ranked_matches (
  session_id TEXT PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  mode       TEXT NOT NULL CHECK (mode IN ('1v1', '2v2')),
  -- Two arrays of user ids: the players of each side.
  sides      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
