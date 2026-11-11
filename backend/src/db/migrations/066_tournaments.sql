-- Tournaments: the event, its co-organizers, its entries (a player or a team), the people in each
-- entry, and the bracket's matches. The status lists match shared/tournaments/state.ts, whose
-- transition tables say how a status may change.
CREATE TABLE tournaments (
  id            TEXT PRIMARY KEY,
  -- Null once the owner's account is gone: the tournament and its results stay
  owner_user_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('official', 'community')),
  -- Who can see and join it: Browse, friends only, by link, or added in person by the organizers
  access        TEXT NOT NULL CHECK (access IN ('public', 'friends', 'invite', 'in_person')),
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'open', 'check_in', 'running', 'finished', 'cancelled')),
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  -- The game every match plays (a games/ module id) and its options
  game_id       TEXT NOT NULL,
  game_config   JSONB NOT NULL,
  format        TEXT NOT NULL CHECK (format IN ('single_elimination', 'double_elimination', 'round_robin', 'groups_knockout')),
  -- Players per entry: 1 is solo, 2-4 a team
  team_size     INT NOT NULL CHECK (team_size BETWEEN 1 AND 4),
  max_entries   INT NOT NULL CHECK (max_entries >= 2),
  -- Null: an organizer starts it
  starts_at     TIMESTAMPTZ,
  -- Everything else the organizer chose (seeding, match length, check-in, no-show wait, limits)
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  -- Finished or cancelled
  ended_at      TIMESTAMPTZ
);
CREATE INDEX tournaments_status_starts_idx ON tournaments (status, starts_at);
CREATE INDEX tournaments_owner_idx ON tournaments (owner_user_id);

-- Co-organizers; the owner is tournaments.owner_user_id
CREATE TABLE tournament_organizers (
  tournament_id TEXT NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);
CREATE INDEX tournament_organizers_user_idx ON tournament_organizers (user_id);

-- One spot in the bracket: a player, or a team of team_size players
CREATE TABLE tournament_entries (
  id                    TEXT PRIMARY KEY,
  tournament_id         TEXT NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  -- pending: a team waiting for its players to confirm (the spot is held)
  status                TEXT NOT NULL DEFAULT 'registered'
                        CHECK (status IN ('pending', 'registered', 'checked_in', 'withdrawn')),
  seed                  INT CHECK (seed >= 1),
  -- Set when the tournament finishes (or the entry is out of it)
  final_place           INT CHECK (final_place >= 1),
  registered_by_user_id TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, seed),
  -- For tournament_players' composite key
  UNIQUE (id, tournament_id)
);

-- The people in an entry. A guest (or a spot added in person) has no account until it is claimed;
-- a deleted account turns its spots back into guests under the stored name.
CREATE TABLE tournament_players (
  id            TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  entry_id      TEXT NOT NULL,
  user_id       TEXT REFERENCES "user" (id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  -- Order in the team (who throws first in alternate visits), 0-based
  position      INT NOT NULL CHECK (position >= 0),
  -- A team's player confirms the captain's request; guests and solo entrants need not
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (entry_id, tournament_id) REFERENCES tournament_entries (id, tournament_id) ON DELETE CASCADE,
  -- One spot per person per tournament
  UNIQUE (tournament_id, user_id),
  UNIQUE (entry_id, position)
);
CREATE INDEX tournament_players_user_idx ON tournament_players (user_id);

-- A match of the bracket. Its place: bracket (main, the double elimination's lower bracket and
-- grand final, or a group), the group's number, the round (1 = first) and the slot in that round.
CREATE TABLE tournament_matches (
  id              TEXT PRIMARY KEY,
  tournament_id   TEXT NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  bracket         TEXT NOT NULL CHECK (bracket IN ('main', 'lower', 'final', 'group')),
  group_no        INT CHECK (group_no >= 1),
  round           INT NOT NULL CHECK (round >= 1),
  slot            INT NOT NULL CHECK (slot >= 0),
  -- Null until known ("Winner of QF 2")
  entry_a_id      TEXT REFERENCES tournament_entries (id) ON DELETE SET NULL,
  entry_b_id      TEXT REFERENCES tournament_entries (id) ON DELETE SET NULL,
  first_to        INT NOT NULL CHECK (first_to >= 1),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'live', 'finished')),
  outcome         TEXT CHECK (outcome IN ('played', 'walkover', 'bye', 'organizer')),
  winner_entry_id TEXT REFERENCES tournament_entries (id) ON DELETE SET NULL,
  legs_a          INT NOT NULL DEFAULT 0 CHECK (legs_a >= 0),
  legs_b          INT NOT NULL DEFAULT 0 CHECK (legs_b >= 0),
  -- When both sides were known: the no-show wait counts from here
  ready_at        TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  UNIQUE NULLS NOT DISTINCT (tournament_id, bracket, group_no, round, slot),
  CHECK ((bracket = 'group') = (group_no IS NOT NULL)),
  CHECK ((status = 'finished') = (outcome IS NOT NULL)),
  -- A match is ready or live only with both sides known
  CHECK (status NOT IN ('ready', 'live') OR (entry_a_id IS NOT NULL AND entry_b_id IS NOT NULL)),
  CHECK (entry_a_id IS DISTINCT FROM entry_b_id OR entry_a_id IS NULL),
  CHECK (winner_entry_id IS NULL OR winner_entry_id = entry_a_id OR winner_entry_id = entry_b_id)
);

-- Every game played for a match (an aborted one is replayed in a new game), and the tournament
-- spot each seat played for, so claiming a spot moves its games to the account
ALTER TABLE game_sessions ADD COLUMN tournament_match_id TEXT REFERENCES tournament_matches (id) ON DELETE SET NULL;
CREATE INDEX game_sessions_tournament_match_idx ON game_sessions (tournament_match_id) WHERE tournament_match_id IS NOT NULL;
ALTER TABLE game_players ADD COLUMN tournament_player_id TEXT REFERENCES tournament_players (id) ON DELETE SET NULL;
CREATE INDEX game_players_tournament_player_idx ON game_players (tournament_player_id) WHERE tournament_player_id IS NOT NULL;
