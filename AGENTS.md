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
| Generated TS types for the schema | `backend/src/schema/types.ts` (regenerate with `npm run gen:types`; don't edit by hand) |
| Generated zod schemas for incoming data (bridge events, browser messages, snapshots) | `backend/src/schema/zod.ts`, copied to `backend/frontend/src/lib/api/zod.ts` (regenerate with `npm run gen:api` at the repo root; don't edit by hand) |
| Bridge: Board Manager client, snapshot differ, transport | `bridge/internal/{bm,differ,transport}`, CLI in `bridge/cmd/bridge` |
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
| Frontend pages (svelte-spa-router, hash routes) | `backend/frontend/src/routes/`; the match screen is `GameDisplay.svelte` |
| Per-game UI (stats, board highlights) | `backend/frontend/src/lib/gameViews/` |
| Match screen in remote games (seat boards, live/offline/waiting centre, not-your-turn toast) | `backend/frontend/src/lib/remote.ts`, `lib/toast.ts`; components `SeatBoardLine`, `BoardCaption`, `TurnStatusBar`, `OfflineNotice`, `WaitingCard`, `NotTurnToast` |
| Components (dartboard, bull off, correction, entry) | `backend/frontend/src/lib/components/`; shadcn-style primitives in `ui/` |
| Dart helpers (labels, checkout hints) | `backend/frontend/src/lib/dartUtils.ts` |
| Game history: input log, replay, results | `backend/src/session/{apply,replay}.ts`, `backend/src/history/`, `backend/src/db/history.ts`, `backend/src/api/games.ts` |
| Architecture, Board Manager API findings | `docs/architecture.md` |
| Feature specs and implementation plans | `docs/superpowers/specs/`, `docs/superpowers/plans/` |
| Setup, tests, builds | `DEVELOPMENT.md`, `mise.toml` |
| Early experiments (not shipped) | `spike/` |

## Adding a game

1. Write a `GameModule` in `backend/src/games/<id>.ts`: `init` (use the `rng` it gets for
   anything random), `onBoardEvent`, `onUserAction`, `view`, `defaultConfig`/`configMeta`
   for the setup form, and for the history `version`, `summarize` (placement and stats per
   seat), `detail` (its per-mode detail; add the schema to `schema/api-v1.yaml` and the
   `GameDetail.detail` union) and `getLeg` if it has legs. Keep it a pure reducer: games
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

## Running and testing

- Full dev stack: `scripts/dev.sh` (Docker: Postgres, backend on :3000,
  Vite on :5173, bridge).
- Tests: `mise run test`, or per part: `cd backend && npm test` (DB tests need
  Postgres, see `DEVELOPMENT.md`), `cd backend/frontend && npm test`,
  `cd bridge && go test ./...`.
- Type checks: `cd backend && npm run typecheck`, `cd backend/frontend && npm run typecheck`.

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
