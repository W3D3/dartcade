# Missions

Missions are practice goals made of steps. Players build them, share them and race each other on
them. The design is the Missions, Mission-Builder and Mission-Play artboards of the Dartcade Platform
Design canvas. This spec covers part 1, the backend. Part 2 builds the Missions list and the play
screen. Part 3 builds the builder.

Missions are played alone or by several players taking turns. Everything is behind the flag `missions.enabled`, which is on for admins by default.

## Model

A mission (`backend/src/shared/missions/types.ts`, `MissionSchema`) has:

- a name (at most 40 characters) and a description (at most 280)
- a difficulty: easy, medium, hard or expert. The builder suggests one with `suggestDifficulty`
  (`difficulty.ts`).
- a step order: `any` (the player picks the step and can switch between visits) or `in_order`
- an optional time limit in seconds (30 to 3600)
- a failed-step policy: `retry` (only that step starts again) or `restart` (every step starts over
  from the first, and the clock keeps running)
- `pause`: whether the player may stop the clock between visits
- `rankBy`: highscores rank by time, or by darts for a one-step race like Around the Clock Sprint
- 1 to 8 steps

Visibility is stored with the mission, not in its definition: `private` (only me), `friends` or
`public` (everyone). An official mission ("by Dartcade") has no owner and is always public.

## Step types

Each type is one rule in `backend/src/shared/missions/steps.ts`. A rule gets the darts and the visit
ends of one attempt, and answers `go`, `done`, `fail` or `visit_over`.

| Type       | Parameters                                                                                                 | Fails when                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `checkout` | start score, max darts, finish double, single or master                                                    | a bust, or the darts run out                                         |
| `hit`      | targets (`20`, `S20`, `D20`, `T20`, `B`, `DB`), hits per target, in a row, any order or in order, a window | in a row: a dart that adds nothing. The window: N darts or one visit |
| `marks`    | numbers (25 is the bull), marks needed on each or in total, an optional dart window                        | the darts run out                                                    |
| `visits`   | every visit at least, at most, exactly or never X points, N visits, in a row or any                        | in a row: a visit that misses the mark                               |
| `score`    | X points within N darts                                                                                    | the darts run out                                                    |
| `average`  | a 3-dart average of X over N visits                                                                        | the average is short after N visits                                  |
| `leg`      | 301, 501 or 701 within N darts, finish double or single                                                    | the darts run out (a bust only ends the visit, as in X01)            |

Marks: a single is 1, a double 2, a treble 3, the outer bull 1 and the inner bull 2.

`stepTitle` and `stepDetail` (`describe.ts`) put a step in words as the artboards do, for example
"Hit S20 9 times in a row", "D11 → Bull → D6 within 9 darts" or "1–20 + Bull within 40 darts".

## Rules of a run

`backend/src/shared/missions/run.ts` is the run as a pure reducer.

- Steps that count whole visits (checkout, leg, visits, average, and a hit step with a one-visit
  window) start an attempt only at a visit's first dart. When such a step comes up mid-visit, the
  rest of that visit doesn't count (`visit.locked`). The other steps take the next dart.
- Switching steps (any order) and pausing happen between visits. A step that is switched away from
  starts its attempt again when it comes back.
- Darts thrown while paused don't count.
- The clock runs only during the player's own turn (see below) and stops while paused. A step's time
  is the clock when it was done.
- Give up ends the player's run as failed.

## The game mode

`mission` is a game mode (`backend/src/games/mission.ts`) for one or more players taking turns, one
visit each, as in the other multiplayer modes (`nextTurn` in `games/turns.ts`; no teams, no bull
off). Its config is a snapshot taken at the start, shared by every player: the mission id, whether it
is a test run, the mission's definition and its highscores. An edit of the mission never changes a
running game. The board and the keypad both work, as in every mode.

Every player has their own run through the steps: their step, attempts, best streak, darts, done
times and clock. The time limit, the failed-step policy and pause apply to each player on their own.

- **Time.** A player's clock runs only while it is their turn: from the takeout that hands them the
  turn to their own takeout (their first turn of the game starts with their first input if they
  throw first). Waiting for the others doesn't count. Alone, the turn never leaves the player, so the
  clock runs from the first input to the end: solo and multiplayer times compare, and both go into
  the highscores.
- **Out.** A player who fails (the time is up, or they give up) is out: the turn skips them and the
  others play on. A completed player is done and skipped too.
- **The end.** The game ends when every player is done or out.
- **Ranking.** More steps done first; between players who completed every step, the faster time.
  Other ties share a place. The view shows each player's place once the game is over.

A mission game can't be picked in a lobby, on the Play page or by `POST /api/sessions`
(`OWN_START` in `shared/gameNames.ts`). `POST /api/missions/{id}/start` starts one: alone, or with
`lobbyId` for a lobby the user hosts, where everyone who plays takes part (`LobbyService.startGame`,
the lobby's own start path with its seats, boards and start problems). Test runs are played alone.

The time needs the server's time in a pure reducer. The engine passes every input's logged time to
the module's `onClock` before applying the input (`session/apply.ts`), with the state of the open
visit so a clock the deciding dart already stopped stays put. A replay passes the same times, so it
reaches the same state. The player up runs out of time at the first input after their deadline: the
rest of their visit doesn't count. Nothing fires at the deadline itself: the play screen sends
`mission_clock` when the countdown reaches 0, which also hands the turn on. When the last player
still playing runs out, the game ends.

The view (`MissionGame` in `schema/game-ws-v1.json`) carries every player's run (`runs`), the open
visit's chips, who is up and who is next, so the play screen can show the active player's steps and a
compact row for each other player. The mission actions (`mission_switch`, `mission_pause`,
`mission_resume`, `mission_give_up`, `mission_clock`) are the player up's, like their darts.

## Counting

Missions are practice. `gameCounts` (`db/counts.ts`) leaves them out, so they never count for stats,
averages, records, form, ranked, challenges, game XP or the game-based achievements. They still show
in history, apart from test runs.

When a mission game ends (`missions/service.ts`):

- Each player counts on their own, in a game of one or of several. A run that completed every step
  and is not a test run is kept as the player's best (`mission_bests`), if it beats their previous
  one. Its time is the player's own clock. An edit of the mission's rules (anything but its name and
  description) clears its highscores, and a run of the rules from before the edit is not kept.
- XP is paid by the rules in `missions/rewards.ts`. A run pays `MISSION_XP` (50, 100, 150 or 250)
  for the mission's difficulty as the game played it (the config's snapshot), but never above what
  `suggestDifficulty` makes of its steps: the label is the author's, so a one-dart mission labelled
  expert pays as easy. It pays only when all of these hold: it was completed, it was not a test
  run, someone else made the mission, and the mission is not private. The ledger key
  (`xp_ledger` kind `mission`, keyed by the mission id) pays each mission once per player: the first
  paid completion. At most `MISSION_REWARDS_PER_DAY` (3) missions pay per local day. A completion
  over the cap is paid on a later day's completion of that mission. The XP can unlock level rewards
  like any other XP.
- A test run of your own mission counts for no times, XP, stats or history.

A missions achievement needs badge art the canvas doesn't have yet, so it comes with part 2.

## API

All routes need a signed-in user, and answer 404 while `missions.enabled` is off for them.

| Route                                           | Who                          | What                                                                                                  |
| ----------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /api/missions?filter=&difficulty=`         | anyone                       | cards: all, mine, friends, popular (by plays), completed                                              |
| `POST /api/missions`                            | anyone                       | make a mission, at most 50 per player                                                                 |
| `GET /api/missions/{id}`                        | who may see it               | one card                                                                                              |
| `PUT /api/missions/{id}`                        | the author; official: admins | change the definition and the visibility                                                              |
| `DELETE /api/missions/{id}`                     | the author; official: admins | delete it with its bests and reports                                                                  |
| `GET /api/missions/{id}/highscores`             | who may see it               | the top 10 best runs                                                                                  |
| `POST /api/missions/{id}/report`                | who may see it               | a public player mission, once per person                                                              |
| `POST /api/missions/{id}/start`                 | who may see it               | start a game alone or, with `lobbyId`, for a lobby the user hosts; `test` (alone) only for the author |
| `POST /api/admin/missions`                      | admins                       | make an official mission                                                                              |
| `GET /api/admin/missions/reports`               | moderators                   | reported and hidden missions                                                                          |
| `POST /api/admin/missions/{id}/hide`            | moderators                   | hide a player's mission, with a reason its author sees                                                |
| `POST /api/admin/missions/{id}/restore`         | moderators                   | show it again                                                                                         |
| `POST /api/admin/missions/{id}/dismiss-reports` | moderators                   | close its reports                                                                                     |

A card carries the mission, its visibility, whether it is official, its author, its plays (test runs
left out), the user's best and their friends' best, the hidden reason (for the author and moderators)
and whether the user may edit it.

Who sees a mission is one rule, `canSee` in `db/missions.ts`, with its SQL twin `visibleTo` for the
lists. The author always sees it. Otherwise a hidden mission is seen only by moderators (admins
included), an official or public one by everyone, a friends one by the author's accepted friends,
and a private one by nobody else. The lists leave hidden missions out, except for the author's own.

## Storage

Migration `078_missions.sql`:

- `missions`: the definition as JSON, the owner (null for official missions), the visibility and the
  hidden mark
- `mission_bests`: one row per player and mission
- `mission_reports`: like `minigolf_course_reports`
- an index on the games' `config ->> 'missionId'`, for the plays

The official missions from the artboards are `OFFICIAL_MISSIONS` in `shared/missions/official.ts`.
Startup seeds the ones that are missing, so an admin's edits stay.

## What parts 2 and 3 need

- Part 2 (the list and the play screen): `MissionScreen.svelte` is a stand-in to replace. The
  snapshot's `MissionGame` carries what the Mission-Play artboard shows. The play screen sends
  `mission_switch`, `mission_pause`, `mission_resume`, `mission_give_up` and `mission_clock`. It also
  needs a nav entry behind the flag, a result screen (`winView` returns null for missions, as for 121) and the missions achievement with its badge.
- Part 3 (the builder): `POST`/`PUT /api/missions`, `suggestDifficulty`, `stepTitle`/`stepDetail`,
  and the presets on the artboard, built from the step types above. A test run is
  `POST /api/missions/{id}/start` with `test: true`.
