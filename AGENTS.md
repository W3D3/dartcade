# Agent notes

## What this is

dartcade runs custom dart minigames (Around the Clock, X01, more planned) on
physical boards that use Autodarts. It talks to the board's local Autodarts
**Board Manager** directly, not to the Autodarts cloud.

```
Board Manager ──WS──▶ bridge (Go) ──WSS adbridge/v1──▶ backend (Fastify) ◀──▶ Postgres (event log)
                                                            │
                                                            └──WS snapshots──▶ frontend (Svelte 5)
```

- **bridge** runs next to the board. It turns Board Manager's raw state
  snapshots into typed events (`dart.detected`, `takeout.finished`, …) and
  streams them to the backend with seq/ack delivery.
- **backend** stores those events, runs the games as pure reducers over them,
  and pushes a snapshot of the game to the browser after every change. It also
  serves the SPA.
- **frontend** is the SPA: sign in, pair boards, set up games, play.

Every game is a reducer over the event log, so sessions survive restarts and a
corrected dart replays the open visit cleanly.

## Where to look

| Area | Path |
|---|---|
| Event schema shared by bridge and backend | `schema/adbridge-v1.json` (source of truth), `schema/diff-rules.md` |
| Generated TS types for the schema | `backend/src/schema/types.ts` (regenerate with `npm run gen:types`; don't edit by hand); Go types in `bridge/internal/schema/schema_gen.go` (`go generate ./internal/schema` in `bridge/`) |
| Generated zod schemas for incoming data (bridge events, browser messages, snapshots) | `backend/src/schema/zod.ts` (and `lobby-ws.ts` for the lobby sockets), copied to `backend/frontend/src/lib/api/` (regenerate with `npm run gen:api` at the repo root; don't edit by hand) |
| Bridge: Board Manager client, snapshot differ, transport | `bridge/internal/{bm,differ,transport}`, CLI in `bridge/cmd/bridge` |
| Camera view: stills from the bridge, kept in memory, shown under the board | `bridge/internal/camera` (fetch; `combined.go`/`compositor.go`: the Combined still, camera 3), `backend/src/camera/store.ts`, `GET /api/boards/{id}/camera/{i}` in `backend/src/api/boards.ts` (plus the owner-only live preview `/camera/{i}/live`, fetched from the Board Manager, off with `BOARD_LIVE_CAMERA=off`), `backend/frontend/src/lib/camera.ts` (which still the match screen shows); `DartBoard.svelte`'s `cameraSrc` |
| Recorded Board Manager sessions for differ tests | `bridge/internal/differ/testdata`, `fixtures/` |
| Backend entry point, plugin wiring | `backend/src/index.ts` |
| Session engine: visits, manual darts, corrections, rebuild on restart | `backend/src/session/engine.ts`, `refold.ts` |
| Game module interface, events and user actions | `backend/src/session/types.ts` |
| Bull off (wraps any game via `withBullOff`) | `backend/src/session/bullOff.ts`, `withBullOff.ts` |
| Who may act for a seat, who may watch a game | `backend/src/session/access.ts` |
| Game modules (register new ones in `index.ts`) | `backend/src/games/` |
| REST API | `backend/src/api/` |
| WebSocket gateways | `backend/src/bridge-gw/` (bridge), `backend/src/browser-gw/` (browser) |
| Auth, DB (Kysely + Postgres, migrations) | `backend/src/auth/`, `backend/src/db/` |
| Code shared by backend and frontend (`$shared/...`) | `backend/src/shared/` (dependency-free) |
| Frontend pages (svelte-spa-router, hash routes) | `backend/frontend/src/routes/`; the match screen is `GameDisplay.svelte`; the Play page (picks the game, not the players) is `CreateSession.svelte` |
| Per-game UI (stats, board highlights) | `backend/frontend/src/lib/gameViews/` |
| Match screen in remote games (seat boards, live/offline/waiting centre, not-your-turn toast) | `backend/frontend/src/lib/remote.ts`, `lib/toast.ts`; components `SeatBoardLine`, `BoardCaption`, `TurnStatusBar`, `OfflineNotice`, `WaitingCard`, `NotTurnToast` |
| Lobbies: rules, start and rematch, resets after games, pushes | `backend/src/lobby/` (`service.ts` is the entry point; pure rules in `rules.ts`, `startPlan.ts`, `view.ts`), queries in `backend/src/db/lobbies.ts` |
| Lobby socket and per-user socket (`/ws/lobby`, `/ws/me`) | `backend/src/browser-gw/lobby.ts`, messages in `schema/lobby-ws-v1.json` |
| Lobby screens (lobby, join, invites, indicator) | `backend/frontend/src/routes/{Lobby,Join,Invites}.svelte`; pieces in `lib/components/lobby/`; logic in `lib/lobby/` (`rules.ts` mirrors the server's rules, `sockets.ts` has `/ws/lobby` and the app-wide `/ws/me`, `start.ts` the soft ready gate, `play.ts` the Play page's Create/Continue/Open lobby button) |
| Friends: requests, presence (/ws/me sockets, 30 s grace), statuses, Invisible | `backend/src/friends/` (`service.ts`, `presence.ts`, `status.ts`), `db/friends.ts`, `api/friends.ts`, `api/me.ts`; names in `backend/src/users/`; frontend `routes/Friends.svelte`, `lib/friends/`, `lib/components/friends/` |
| Components (dartboard, bull off, correction, entry) | `backend/frontend/src/lib/components/`; shadcn-style primitives in `ui/` |
| Settings page and the caller | `backend/frontend/src/routes/Settings.svelte`, its cards in `lib/components/settings/` (`CallerVoices`, `VoiceSelect`); what the caller says, its voices and the player in `lib/caller/` (`calls.ts`, `voices.ts`, `player.ts`); voice packs on the server in `backend/src/caller/`, their API in `backend/src/api/voices.ts` |
| Dart helpers (labels, checkout hints) | `backend/frontend/src/lib/dartUtils.ts` |
| Game history: input log, replay, results | `backend/src/session/{apply,replay}.ts`, `backend/src/history/`, `backend/src/db/history.ts`, `backend/src/api/games.ts` |
| Match details page (a finished game's result, match stats, leg/target sections) | `backend/frontend/src/routes/GameDetails.svelte`, helpers in `lib/details/`, components in `lib/components/details/`; stats from each module's `matchStats()` (`backend/src/games/matchStats.ts`, `x01Stats.ts`, `atcProgress.ts`) |
| Architecture overview | `ARCHITECTURE.md`; the original research and Board Manager API findings in `docs/architecture.md` |
| Feature specs and implementation plans | `docs/superpowers/specs/`, `docs/superpowers/plans/` |
| Setup, tests, builds | `DEVELOPMENT.md`, `mise.toml` |
| Early experiments (not shipped) | `spike/` |

## Adding a game

1. Write a `GameModule` in `backend/src/games/<id>.ts`: `init` (use the `rng` it gets for
   anything random), `onBoardEvent`, `onUserAction`, `view`, `defaultConfig`/`configMeta`
   for the setup form, and for the history `version`, `summarize` (placement and stats per
   seat), `detail` (its per-mode detail; add the schema to `schema/api-v1.yaml` and the
   `GameDetail.detail` union), `matchStats` (rows and values for the details page; see
   `backend/src/games/matchStats.ts`) and `getLeg` if it has legs. Keep it a pure reducer: games
   are rebuilt by replaying their input log. Wrap it with `withBullOff` if it needs a
   throwing order. `summarize` must also work on a game that isn't won (no winner): a
   forfeit ends games early and ranks seats by it.
2. Register it in `backend/src/games/index.ts`.
3. Describe its view in `schema/game-ws-v1.json` (a `<Id>Game` def and a branch of
   `Snapshot`) and run `npm run gen:api` at the repo root. The browser parses every
   snapshot against that schema and drops ones for games it doesn't know.
4. Frontend: the header title and meta line go in `backend/frontend/src/lib/gameViews/`
   (`index.ts`, `meta.ts`); panels, rows and slots are picked by game id in
   `GameDisplay.svelte`.
5. To let the game be played in teams (Team A vs Team B sharing one score; see X01 for the
   worked example): set `teams: true` on the `GameModule` and add `teamsOf(s)` (the team index
   of every seat). Read `cfg.format`/`cfg.teams` through `backend/src/games/teams.ts`
   (`teamOfSeats`, `seatsByTeam`, `turnOrder`, `seatPlacements`, `teamForfeitPlacements`) rather
   than branching on them directly, so singles and teams stay one code path. Everything outside
   the game — the lobby, `startPlan`, `GameSettings`, the Teams panel — only reads the `teams`
   flag; it never decides teams itself.

## Running and testing

- Full dev stack: `scripts/dev.sh` (Docker: Postgres, backend on :3000,
  Vite on :5173, bridge).
- Tests: `mise run test`, or per part: `cd backend && npm test` (DB tests need
  Postgres, see `DEVELOPMENT.md`), `cd backend/frontend && npm test`,
  `cd bridge && go test ./...`.
- Type checks: `cd backend && npm run typecheck`, `cd backend/frontend && npm run typecheck`.
- Lint: `npm run lint` in `backend/` (oxlint, type-aware, config in `.oxlintrc.json`) and in `backend/frontend/` (ESLint: oxlint can't type-check `.svelte` files).
- Formatting: oxfmt (Prettier-compatible) for TS, Svelte, JSON, YAML and Markdown, run from the repo root: `npm run format` (CI runs `npm run format:check`); config in `.oxfmtrc.json`; `gofmt -w .` in `bridge/`.

## Libraries over hand-rolled code

Don't reinvent what a dependency already does. Before writing a non-trivial helper or UI
behaviour (floating placement, focus traps, menus, dialogs, date maths, parsing, …), check
what the project already uses and build on it:

- UI primitives: bits-ui (popovers, tooltips, selects, dialogs; positioning and collision
  handling come with it), shadcn-style components in `lib/components/ui/`, icons from
  `@lucide/svelte`, charts from layerchart.
- Data and validation: zod, openapi-fetch (typed API client), Kysely for SQL.

If nothing in the project covers it, prefer adding a popular, maintained library over writing
and maintaining our own version, and say why in the commit. Hand-roll only when the library
would be much bigger than the problem.

## Commits and merging

- Commit messages follow commitlint's conventional format: `type(scope): subject`
  (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, …). Keep the subject short
  and to the point: lower case, imperative, no trailing period, under 72
  characters. Add a body only when the why isn't obvious.
- Before merging, rewrite the branch into atomic commits: each one a single
  self-contained change that builds and passes tests. Fold review fixes into the
  commit they fix; no "address review" or "fix lint" commits.
- Merge by rebasing onto `main` and fast-forwarding. Never squash-merge.

## UI design

The UI design lives in the **Dartcade Platform Design** canvas on claude.ai:
https://claude.ai/artifact/2ZyCCfSMhs3PKZzNLzsw23

It is the source of truth for screens, layout and styling. Each screen is an
artboard under `project/<Screen>.dc.html` (e.g. `project/Match.dc.html`,
`project/BullOff.dc.html`, `project/BullOff-Result.dc.html`); the design tokens
are in `project/ds/dartcade/tokens.json`. Read them with the Artifact tool
(`list_files`, then `read_file`) rather than a web fetch.

The `.dc.html` files are reference markup, not runnable code: they depend on
the canvas runtime (`support.js`, `<x-dc>`, `{{holes}}`). Rebuild screens as
Svelte components in `backend/frontend/`.

Layout rule for game views: board in the centre with one panel per side for
2 players, board to the side with stacked player rows for 3 or more.
