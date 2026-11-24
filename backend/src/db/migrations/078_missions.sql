-- Missions: practice goals made of steps (docs/superpowers/specs/2026-11-24-missions-design.md).
-- A mission's definition is JSON checked by backend/src/shared/missions/types.ts; a game copies it
-- into its config at the start. owner_user_id null: an official mission, written by admins.
CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES "user" (id) ON DELETE CASCADE,
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'friends', 'public')),
  definition JSONB NOT NULL,
  -- A moderator took it out of sight (only moderators and its author still see it, with the reason)
  hidden_at TIMESTAMPTZ,
  hidden_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (owner_user_id IS NOT NULL OR visibility = 'public')
);
CREATE INDEX missions_owner_idx ON missions (owner_user_id);

-- Each player's best completed run of a mission (never a test run): the highscores
CREATE TABLE mission_bests (
  mission_id TEXT NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  time_ms INTEGER NOT NULL,
  darts INTEGER NOT NULL,
  session_id TEXT REFERENCES game_sessions (id) ON DELETE SET NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, user_id)
);
CREATE INDEX mission_bests_user_idx ON mission_bests (user_id);

-- Reports on missions everyone can see, one open report per person per mission (like minigolf_course_reports)
CREATE TABLE mission_reports (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
  reporter_user_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX mission_reports_once_idx ON mission_reports (mission_id, reporter_user_id) WHERE dismissed_at IS NULL;
CREATE INDEX mission_reports_open_idx ON mission_reports (mission_id) WHERE dismissed_at IS NULL;

-- A mission's plays are its games (test runs left out)
CREATE INDEX game_sessions_mission_idx ON game_sessions ((config ->> 'missionId')) WHERE game_id = 'mission';
