-- Named teams (Teams tab): a captain, its members, and the captain's invites. The limits (players,
-- teams per player, the name's length) are in shared/teams.ts.
CREATE TABLE teams (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  tag             TEXT NOT NULL CHECK (tag ~ '^[A-Z]{2,4}$'),
  color           TEXT NOT NULL CHECK (color ~ '^#[0-9a-f]{6}$'),
  captain_user_id TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX teams_name_key ON teams (lower(name));

CREATE TABLE team_members (
  team_id   TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX team_members_user_idx ON team_members (user_id);

-- The captain is always a member. Deferred, so a new team and its captain's row go in together; an
-- account deletion that didn't hand the captaincy over first fails rather than leave a team without one.
ALTER TABLE teams ADD CONSTRAINT teams_captain_is_member
  FOREIGN KEY (id, captain_user_id) REFERENCES team_members (team_id, user_id) DEFERRABLE INITIALLY DEFERRED;

-- A pending invite. Answering or cancelling it deletes the row; past expires_at it no longer counts,
-- and inviting the player again replaces it.
CREATE TABLE team_invites (
  id              TEXT PRIMARY KEY,
  team_id         TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  invitee_user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  inviter_user_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  UNIQUE (team_id, invitee_user_id)
);
CREATE INDEX team_invites_invitee_idx ON team_invites (invitee_user_id);

-- The named team a tournament entry plays as, for the team's record (W-L, tournaments, best place)
ALTER TABLE tournament_entries ADD COLUMN team_id TEXT REFERENCES teams (id) ON DELETE SET NULL;
CREATE INDEX tournament_entries_team_idx ON tournament_entries (team_id) WHERE team_id IS NOT NULL;
