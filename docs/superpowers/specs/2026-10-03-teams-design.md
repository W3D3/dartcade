# Teams: design

Team games in lobbies, starting with X01 ("Teams 2v2" on the canvas: `Play-Teams-Expanded`,
`Match-Teams`). Teams are a shared building block, so other games can add them later by opting
in.

## Goal

Two teams play one game; each team shares a score. In X01, Christoph and his guest (Team A) play
against Lena and Max (Team B): every visit by a Team A player counts down Team A's 501, and the
first team to check out wins the leg. Players keep throwing from their own boards or phones, as
in any lobby game.

## Decisions

- **Two teams, A and B.** Uneven teams are fine ("the smaller team's players throw more often");
  a team can't be empty. More than two teams isn't in this change.
- **Format is a game setting:** `format: 'singles' | 'teams'`, set on New game and in the lobby's
  Settings (the same `GameSettings` component). Only games that opt in show it; X01 does now.
- **Teams live in the lobby, on the server.** Each person in the lobby has a team (A, B or none).
  They stay from game to game until changed.
  - When the next game becomes Teams, the server splits the people who play 50/50, alternating
    in lobby order (A, B, A, B…). Because teams alternate in the throwing order too, the lobby
    order stays the throw order.
  - Newcomers (a member who joins, a guest who's added, someone back from sitting out) go to the
    smaller team; Team A on a tie.
  - The host moves people between teams or shuffles them. Members see the teams; they can't
    change them.
- **Throwing order:** seats alternate across teams: A1 → B1 → A2 → B2 …; with uneven teams the
  smaller team's players come round more often. Lobby order: Team A starts. Random: a random
  team starts. Bull-off: the bull off decides which team starts. Later legs alternate the
  starting team.
- **Each player stays a seat.** A seat keeps its own controller, board, darts and personal stats,
  so remote play, manual entry, "not your turn", waiting and corrections work unchanged. Only the
  game's scoring is per team.
- **Results:** every player of a team gets the team's placement. Forfeit: the forfeiter's whole
  team is placed last (the engine already marks every seat the forfeiter controls; the team rule
  ranks their teammates with them) — a 2v2 forfeit places the two teams 1st and 2nd, not spread
  by seat count. Someone who controls seats in both teams can't forfeit: there'd be nobody left
  to lose to.
- **Not in this change:** teams for ATC (it can opt in later), more than two teams, members
  choosing their own team, team names other than "Team A"/"Team B".

## Shared building block

So the next game can add teams by opting in, the generic parts are shared:

- **Schema (`schema/common-v1.json`):**
  - `GameFormat`: `'singles' | 'teams'`.
  - `TeamId`: `'A' | 'B'`.
  - `TeamView`: `{ id: TeamId, name: string, seats: number[] }` plus game-specific fields in the
    game's own view (X01 adds `score`, `legs`, `next`). Snapshots of a team game carry `teams:
    TeamView[]`.
  - `TeamsConfig` (TypeScript only, `backend/src/games/teams.ts`, not in the JSON schema):
    `{ format?: 'singles' | 'teams', teams?: number[], teamStart?: 'first' | 'random' }`: the
    format, the team index of each seat once a game starts (index = seat; 0 = Team A, 1 = Team
    B), and which team starts. Games that opt in include these fields in their config. Inside a
    game, teams are always indices; `TeamId` (A/B) is only how the lobby and the screens name
    them.
- **Game module:** `teams?: true` in `GameModule` says a game supports teams. Everything outside
  the game (lobby, start plan, `GameSettings`, the Teams panel) only looks at this flag.
- **`backend/src/games/teams.ts`** (pure, tested), for the generic rules. Without teams, each
  seat is its own team (team index = seat), so a game has a single code path. Built as:
  - `teamOfSeats(cfg, seatCount)`: the team index of every seat, from the config; falls back to
    one-seat-one-team unless `format: 'teams'` and `teams` is a valid, dense team-index list.
  - `teamCount(teamOf)`, `seatsByTeam(teamOf)`: how many teams, and each team's seats.
  - `turnOrder(teamOf, startTeam)`: the turn rotation, teams alternating from `startTeam`; a
    smaller team's seats repeat.
  - `seatPlacements(teamOf, teamPlacements)`: per-team placements spread back to seats.
  - `teamForfeitPlacements(teamOf, placements, forfeited)`: placements once some seats forfeited,
    counted among teams.

  (The interleave that seats a lobby's two teams — A1 B1 A2 B2 — lives in
  `backend/src/lobby/startPlan.ts`, not here; `teamOf(cfg, seat)`, `teamSeats`, `nextLegStarter`
  and `teamPlacements` weren't built under those names. X01 keeps the turn order in its state
  [`order`] rather than rotating a leg starter function; a leg starts at
  `legsPlayed % order.length`.)
- **Frontend:** a generic team panel (`TeamPanel`) and the lobby's Teams panel are driven by the
  common `TeamView`; a game supplies only its score line.

## Lobby

- **Data:** `lobby_people.team` (`'A' | 'B' | null`), migration 011. Persists like the rest of the
  lobby.
- **Rules (server, `backend/src/lobby/rules.ts`):**
  - When `nextGame` changes to a game with `teams` and `format: 'teams'`, people who play and have
    no team are assigned, alternating in lobby order; if nobody had a team yet, everyone playing
    is split 50/50 the same way.
  - A person added later, or back in from sitting out, gets the smaller team (A on a tie).
  - Teams are kept while the format is singles (so switching back and forth doesn't lose them).
- **API:**
  - `PATCH /api/lobbies/{id}/people/{personId}` takes `team: 'A' | 'B'` (host only).
  - `POST /api/lobbies/{id}/teams/shuffle` (host only): a random 50/50 split of the people who
    play.
- **Lobby state:** each person carries `team`. The next-game card shows a **Teams** panel instead
  of the "Who plays" chips when the format is Teams: Team A and Team B with their players (the
  people who play), tap a player to move them (host), **Shuffle** (host). Sitting out stays on the
  people rows. Uneven teams show "Teams are uneven. The smaller team's players throw more often."
  An empty team shows a hint and Start is refused by the server.

## Starting a game

- `startPlan`: for a game with `teams` and `format: 'teams'`, the seats interleave the two teams
  in lobby order (A1 B1 A2 B2…), and the config gets `teams` (the team of each seat). Refused
  with `400` and "Both teams need a player" if a team is empty.
- Throw order (`lobby.throwOrder`):
  - `lobby`: seat order as built (Team A starts).
  - `random`: Team B starts in half the cases (swap which team takes the odd seats); within a team,
    lobby order stays.
  - `bulloff`: the bull off runs as today over all players; the winner's team starts, and the seat
    order is rotated so the winner's team leads.

## X01 with teams

- **Config:** `X01Config` gains `format` and `teams` (from `TeamsConfig`); `format` defaults to
  `'singles'`. `configMeta` lists `format` (Singles / Teams) for the setup form.
- **State:** per-team `scores`, `legs`, `opened` and `visitOpenedScores` (indexed by team
  index); `pointsScored`, `bestCheckout` and darts stay per seat for personal stats.
  In singles every seat is its own team, so these arrays have one entry per seat, exactly as
  today, and X01 has one code path.
- **Turns:** `order` is the seat order (`turnOrder(teamOf, startTeam)` for a team game); X01
  keeps it in state and starts each leg at `legsPlayed % order.length`, so the starting team
  alternates without a separate leg-starter function.
- **A visit** counts down the thrower's team's score; bust and the double-in/out rules apply to
  the team's score; a checkout wins the leg for the team; winning the match ends the game with
  the team as winner (`winner` becomes the winning team).
- **View:** `teams: TeamView[]` with each team's `score`, `legs` and `next` (that team's next
  thrower); the seat list keeps per-player averages. Team and match averages aren't in this view:
  the browser computes them from the seats' stats (`backend/frontend/src/lib/teams.ts`).
- **History:** `summarize` ranks teams and spreads the placement to their seats with
  `seatPlacements`; the X01 detail (`GET /api/games/{id}`) lists the teams with their players.
  The app has no game detail screen yet (the canvas's `X01-Details`); when it's built, it groups
  players by team.

## Match screen

- Two teams: the `Match-Teams` layout: two team panels (`TeamPanel`), each with the team name,
  its players ("Throwing", "Up next", board, personal average), the shared score, can-finish,
  team average, match average, darts and the visit list (each visit marked with the player's
  initial).
- Phone and narrow layouts stack the two team panels.
- The header says "Teams 2v2" before the rules line; for uneven teams the sizes in Team A v Team B order (e.g. "Teams 1v2", "Teams 2v1").

## Testing

- `teams.ts` unit tests: interleaving (even, uneven), team of a seat, leg starter rotation,
  placements with and without forfeit.
- X01 reducer tests: a team game scoring per team, a bust by the second player, a checkout by
  either player wins the leg for the team, legs and match, the leg starter rotation; singles
  unchanged (the existing tests pass untouched).
- Lobby service tests: the 50/50 split on switching to Teams, a newcomer to the smaller team,
  host move and shuffle (members refused), start refused with an empty team, seats and config at
  start for each throw order.
- Frontend: the Teams panel and the team match layout in the browser pass, with screenshots.
