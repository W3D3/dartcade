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
| Camera view: stills from the bridge, kept in memory, shown under the board | `bridge/internal/camera` (fetch; `combined.go`/`compositor.go`: the Combined still, camera 3), `backend/src/camera/store.ts`, `GET /api/boards/{id}/camera/{i}` in `backend/src/api/boards.ts` (plus the owner-only live preview `/camera/{i}/live`, fetched by the bridge like `/status` and the commands: the backend never calls a Board Manager, it sends `bm.request` and the bridge answers with `bm.response` (`bridge/internal/bm/relay.go`, `BridgeConnections.request`)), `backend/frontend/src/lib/camera.ts` (which still the match screen shows); `DartBoard.svelte`'s `cameraSrc` |
| Bridge install: the bridge's own `install`/`uninstall` subcommands register a systemd unit (Linux, hardened, `systemdUnit`), a launchd daemon (macOS) or a Windows service, via kardianos/service | `bridge/cmd/bridge/service.go` (the service, its state dir, the Windows ACL); `scripts/install-bridge.sh` (Linux, macOS) and `scripts/install-bridge.ps1` (Windows) only download the binary and call it; the dialog's commands in `backend/frontend/src/lib/bridgeInstall.ts` |
| Update bridge (Boards page): the release the server offers, the bridge downloading, verifying and installing it | backend `backend/src/boards/bridgeRelease.ts` (`pickBridgeRelease`: never a major above `APP_VERSION`, on 0.x not a minor above it; GitHub releases cached an hour), `boards/bridgeUpdate.ts` (progress per board), `POST /api/boards/{id}/bridge-update` in `api/boards.ts`; messages `bridge.update`/`bridge.update.status` in `schema/adbridge-v1.json`; bridge `bridge/internal/update` (`Stage`, `Apply`, the embedded `release.pub`), the unit's `ExecStopPost` `apply-update` in `service.go`; signed `SHA256SUMS` from `.github/workflows/release.yml` (`BRIDGE_SIGNING_KEY`); frontend `bridgeUpdateView` in `lib/boards.ts`, `BoardsSection.svelte`; how it works per OS in `DEVELOPMENT.md` |
| Recorded Board Manager sessions for differ tests | `bridge/internal/differ/testdata`, `fixtures/` |
| Backend entry point, plugin wiring | `backend/src/index.ts` |
| Session engine: visits, manual darts, corrections, rebuild on restart | `backend/src/session/engine.ts`, `refold.ts` |
| Game module interface, events and user actions | `backend/src/session/types.ts` |
| Shared game-module helpers (config checks, turn order, names) | `backend/src/games/configMeta.ts` (`validateOptions`), `games/turns.ts` (`nextTurn`, `upNext`), `backend/src/shared/gameNames.ts` (one name per mode, server and SPA); a finished game's places reach the client in the snapshot's `results` |
| Per-game tables on the client (one entry per mode, kept complete by the compiler) | `lib/gameViews/rules.ts` (rules line for header, win screen, history and lobby), `gameViews/index.ts`, `gameViews/settings.ts`, `history.ts`, `details/page.ts`, `winScreen.ts`, `dartEvents.ts`, `caller/calls.ts`; a visit's outcome for the caller and the lights in `backend/src/shared/visitOutcome.ts` |
| Match screen frame shared by the modes | `lib/components/match/MatchFrame.svelte` (the `<main>` per `matchLayout`), `match/BoardOrKeypad.svelte` (board or keypad, replacing a selected dart); how to add a mode: `docs/adding-a-game-mode.md` |
| Bull off (wraps any game via `withBullOff`) | `backend/src/session/bullOff.ts`, `withBullOff.ts` |
| Who may act for a seat, who may watch a game | `backend/src/session/access.ts` |
| Game modules (register new ones in `index.ts`) | `backend/src/games/` |
| 121 Checkout: tries, targets, miss rules, lock; match screen and summary | `backend/src/games/p121.ts` (out rules shared with X01 in `outRules.ts`), all-time best `GET /api/games/best` (`db/history.ts` `getBestStat`); frontend `lib/components/p121/`, `lib/p121/`; behind `gamemode.p121.enabled` |
| Higher Lower: two bars, lives, misses; match screen and result | `backend/src/games/hilo.ts`; frontend `lib/components/hilo/`, `lib/hilo/`; behind `gamemode.hilo.enabled` |
| REST API | `backend/src/api/` |
| WebSocket gateways | `backend/src/bridge-gw/` (bridge), `backend/src/browser-gw/` (browser) |
| Auth, DB (Kysely + Postgres, migrations) | `backend/src/auth/` (`bootstrap.ts`: a fresh deployment's first admin, from `ADMIN_EMAIL`/`ADMIN_PASSWORD`, created (or, if `ADMIN_PASSWORD` signs into it, an existing account promoted) on startup while no admin exists; `admin.ts`: `isAdmin`/`requireAdmin`), `backend/src/db/` |
| Mail (SMTP transport, templates, config) | `backend/src/mail/` (`config.ts`, `transport.ts`); MJML templates in `templates/` (`layout.mjml` for account mail, `feedback.mjml` for bug reports, both including `head.mjml`; compiled once at startup in `templates.ts`); `.mjml` is excluded from oxfmt (`.oxfmtrc.json`) because the formatter broke its inline CSS; `SMTP_URL`/`MAIL_FROM` env vars |
| Email verification, password reset, account deletion | `backend/src/auth/options.ts`, `termsGate.ts`, `cleanup.ts` (`cleanUpAccount`, `decideCleanupAction`, `setAccountCleanup`); migration `028_email_verification.sql`; `GET /api/auth-info` in `api/authInfo.ts`, SPA store `lib/authInfo.ts`; frontend `routes/{Verify,Forgot,Reset}.svelte`, `lib/verify.ts`, `lib/publicRoutes.ts`, `lib/components/settings/DeleteAccount.svelte`; sign-in/register share `AuthPanel` (`variant`: `signin` \| `register`). Trap: better-auth puts its redirect query params (`?error=`, `?token=`) in the page query *before* the hash, which the hash router can't see — `lib/authRedirect.ts` maps verify errors to `#/verify` in `App.svelte`, and `Reset.svelte` reads `location.search` itself |
| Bug reports (Alpha badge, Settings → Profile): the dialog, the screenshot, the mail to the operator | frontend `lib/feedback/` (`report.ts`: capture with modern-screenshot, payload), `lib/components/feedback/` (`FeedbackDialog`, `AlphaBadge`, mounted in `Layout.svelte`); `POST /api/feedback` in `backend/src/api/feedback.ts` (per-user rate limit, 3 MB body), `feedbackMail` in `mail/templates.ts`; `FEEDBACK_EMAIL` (falls back to `LEGAL_CONTACT_EMAIL`), shown or hidden by `feedback` in `GET /api/auth-info` |
| Legal texts (Terms, Privacy, Imprint) | `backend/src/legal/` (`load.ts`, defaults in `defaults/*.md`, override with `LEGAL_DIR`), `api/legal.ts`; frontend `routes/Legal.svelte`, `lib/components/AuthFooter.svelte`; `LEGAL_*` env vars fill the templates |
| Admin hub and its pages: users (promote/demote, give XP to test unlocks), feature flags (runtime overrides), system (version, runtime, live counts), cosmetics (every reward and how it unlocks) | `#/admin` (`routes/Admin.svelte`, `lib/admin/tools.ts`), gated by `isAdmin`/`requireAdmin` (`backend/src/auth/admin.ts`); `#/admin/users` (`routes/AdminUsers.svelte`, `lib/admin/users.ts`, API `backend/src/api/adminUsers.ts`; Give XP: `grantXp` in `backend/src/db/progression.ts`, an `admin` ledger row, `lib/components/admin/GrantXpModal.svelte`); `#/admin/flags` (`routes/AdminFlags.svelte`, `lib/admin/flags.ts`, API `backend/src/api/adminFlags.ts`); `#/admin/system` (`routes/AdminSystem.svelte`, `lib/admin/system.ts`; API `backend/src/api/system.ts`, data in `backend/src/system/info.ts`); `#/admin/cosmetics` (`routes/AdminCosmetics.svelte`, `lib/admin/cosmetics.ts`; no API, it reads `PERKS` from `shared/progression.ts`, where `obtainable` hides the challenge rewards from players) |
| Moderator role (looks at and invalidates games, no other admin tool) | `user.role = 'moderator'`; `isModerator`/`requireModerator` in `backend/src/auth/admin.ts` (the game routes in `api/adminGames.ts`), `setRole` in `backend/src/db/adminUsers.ts` (`PUT /api/admin/users/{id}/role`, set on `#/admin/users`), `isModerator` in `GET /api/me`; the hub shows a moderator `toolsFor` (`lib/admin/tools.ts`) |
| Admin all-games page (every game on the platform, aborted/active on request; opens the details page as admin or moderator; invalidate a game with an optional reason, restore it; admins also delete it for good) | `#/admin/games` (`routes/AdminGames.svelte`, `lib/admin/games.ts`), API `backend/src/api/adminGames.ts` (`GET /api/admin/games`, `/api/admin/games/{id}`), query and `invalidateGame` (soft delete: `game_sessions.invalidated_at/by/reason`, migration `030`; stats and ratings leave invalidated games out (players still see them in history and details, marked `invalidated`, with the contact email from `GET /api/auth-info`), `finishedGames` in `backend/src/db/history.ts` and `counts()` in `backend/src/db/ranked.ts`; then the ratings of the modes it was ranked in are replayed (`restoreGame` undoes it the same way; `deleteGame` is the admin-only hard delete, `DELETE /api/admin/games/{id}`): `recalculateRatings` in `backend/src/db/ranked.ts`, per-game rule `rateGame` in `backend/src/shared/ranked.ts`; an `admin_audit` row records it) `backend/src/db/adminGames.ts`, reason dialog `lib/components/admin/InvalidateGameModal.svelte`; design in `docs/superpowers/specs/2026-10-20-admin-moderation-design.md` |
| Impersonate a user (admin "View as", better-auth admin plugin) | `lib/admin/impersonate.ts`, row menu in `routes/AdminUsers.svelte`, `lib/components/admin/ImpersonationBanner.svelte` (mounted in `App.svelte`, shown while `GET /api/me` says `impersonating`); server side `backend/src/auth/sessionHooks.ts` (audit row, keeps `last_login_at`), `req.impersonatedBy` from `auth/session.ts`/`middleware.ts`, friends presence skipped in `browser-gw/lobby.ts`; design in `docs/superpowers/specs/2026-10-20-admin-moderation-design.md` |
| Version stamp: image build args → `APP_VERSION`/`APP_COMMIT`/`APP_BUILD_TIME` (and `VITE_APP_*` in the SPA) | `backend/Dockerfile`, `.github/workflows/release.yml` (previews: `backend/.sprout.yaml`); public `GET /api/version`; SPA `lib/version.ts` (Settings' version line, `UpdateNotice.svelte`: the stale-tab reload toast) |
| Code shared by backend and frontend (`$shared/...`) | `backend/src/shared/` (dependency-free, except `minigolf/`, which uses Rapier and polyclip-ts, each pinned to the same version in both packages) |
| Feature flags (OpenFeature): definitions and per-user rules, OFREP for the SPA | `backend/src/flags/` (`definitions.ts`: add a flag there; `gamemode.<id>.enabled` gates a game mode), `backend/src/api/ofrep.ts`; SPA `backend/frontend/src/lib/flags.ts` (`flag(key)` store), a mode's `flag` in `lib/gameModes.ts`; `FLAGS_ON` turns flags on per deployment; number flags (`numberFlag(key)` in the SPA, the ranked time limit) are set with `FLAG_VALUES`; an admin's runtime override (off/admins/chosen users/everyone, or a number) at `#/admin/flags`, stored in `backend/src/db/flagOverrides.ts`, applied at once by `setOverrides` (`backend/src/flags/index.ts`). Each flag's `description` in `FLAG_META` says what the flag does (shown on `#/admin/flags`); who has it is shown by that page, so don't put `FLAGS_ON` hints in it |
| Minigolf core: holes, dart → shot, physics (Rapier), courses | `backend/src/shared/minigolf/`; the ground and physics (Rapier's deterministic build) in `backend/src/shared/minigolf/3d/`; admin test bench `#/admin/minigolf` (`routes/MinigolfBench.svelte`, `lib/minigolf/`, `lib/components/minigolf/`, `Hole3D.svelte`); the 3D chase camera in `lib/minigolf/view3d.ts` |
| Minigolf courses: drafted and published in the DB, read by a game at start | `backend/src/db/minigolfCourses.ts` (migration `021_minigolf_courses.sql`, `seedOfficialCourses` at startup), API in `backend/src/api/minigolfCourses.ts`; a game reads the published course through `backend/src/games/minigolfCourseSource.ts` (`GameModule.prepareConfig`/`liveOptions`, `backend/src/session/types.ts`); the editor `routes/MinigolfCourses.svelte` (courses) and `routes/MinigolfHoleEditor.svelte` (holes), pieces in `lib/minigolf/editor/` (`shapeOps.ts`: editing a hole's optional circles and curved edges) and `lib/components/minigolf/editor/`, test-putt in `lib/components/minigolf/Playtest.svelte`; baking a hole's editable shape (circles, curved edges) into its plain outline is `backend/src/shared/minigolf/bake.ts` |
| Minigolf checks (what Publish enforces) and the hole-testing bot | `backend/src/shared/minigolf/checks.ts`; the bot that plays a hole in `backend/src/shared/minigolf/bot.ts`, run from the editor in a worker at `lib/minigolf/editor/botWorker.ts` |
| Frontend pages (svelte-spa-router, hash routes) | `backend/frontend/src/routes/`; the match screen is `GameDisplay.svelte` (its layout: phone, portrait (taller than wide), solo, duel, party or teams, picked in `lib/matchLayout.ts`); the Play page (picks the game, not the players) is `CreateSession.svelte` |
| Per-game UI (stats, board highlights) | `backend/frontend/src/lib/gameViews/` |
| Match screen in remote games (seat boards, live/offline/waiting centre, not-your-turn toast) | `backend/frontend/src/lib/remote.ts`, `lib/toast.ts`; components `SeatBoardLine`, `BoardCaption`, `TurnStatusBar`, `OfflineNotice`, `WaitingCard`, `NotTurnToast` |
| Lobbies: rules, start and rematch, resets after games, pushes | `backend/src/lobby/` (`service.ts` is the entry point; pure rules in `rules.ts`, `startPlan.ts`, `view.ts`), queries in `backend/src/db/lobbies.ts` |
| Lobby socket and per-user socket (`/ws/lobby`, `/ws/me`) | `backend/src/browser-gw/lobby.ts`, messages in `schema/lobby-ws-v1.json` |
| Lobby screens (lobby, join, invites, indicator) | `backend/frontend/src/routes/{Lobby,Join,Invites}.svelte`; pieces in `lib/components/lobby/`; logic in `lib/lobby/` (`rules.ts` mirrors the server's rules, `sockets.ts` has `/ws/lobby` and the app-wide `/ws/me`, `start.ts` the soft ready gate, `play.ts` the Play page's Create/Continue/Open lobby button) |
| Ranked matchmaking: ratings (Elo, RP), ranks, the queue, the Matchmaking and Ranks pages | rules in `backend/src/shared/ranked.ts` (shared with the frontend), tables in `backend/src/db/ranked.ts`, `GET /api/ranked/me` in `backend/src/api/ranked.ts`; the queue (in memory: search, match found, accept, start, record) in `backend/src/matchmaking/` (`service.ts`, pairing in `matcher.ts`), its routes in `api/matchmaking.ts`, its state pushed on `/ws/me`; frontend `routes/{Matchmaking,Ranks}.svelte`, `lib/ranked/view.ts`, `lib/ranked/queue.ts`, `lib/components/ranked/` (`RankBadge`, `MatchFound` on every screen); behind the `matchmaking.enabled` flag; design in `docs/superpowers/specs/2026-10-14-matchmaking-design.md` |
| Friends: requests, presence (/ws/me sockets, 30 s grace), statuses, Invisible | `backend/src/friends/` (`service.ts`, `presence.ts`, `status.ts`), `db/friends.ts`, `api/friends.ts`, `api/me.ts`; names in `backend/src/users/`; frontend `routes/Friends.svelte`, `lib/friends/`, `lib/components/friends/` |
| Components (dartboard, bull off, correction, entry) | `backend/frontend/src/lib/components/`; shadcn-style primitives in `ui/` |
| Settings page and the caller | `backend/frontend/src/routes/Settings.svelte` (sections at `#/settings/<section>`, listed in `lib/settings/sections.ts`), its cards in `lib/components/settings/` (`YourCard`: your profile card and the Customise link, `NameCard`, `AccountCard`, `GamePrefs`, `CallerVoices`, `CallerDefaults`, `VoiceSelect`); settings in `lib/gameSettings.ts` (cached per device), the account-wide ones (`ACCOUNT_KEYS`) synced by `lib/accountSettings.ts` through `GET`/`PUT /api/me/preferences` (`api/me.ts`, the `user.preferences` column); the Boards section is `lib/components/boards/BoardsSection.svelte` (`#/boards` redirects there); what the caller says (checkout calls: `checkoutFor`, `requirePart`), its voices and the player in `lib/caller/` (`calls.ts`, `voices.ts`, `player.ts`); voice packs on the server in `backend/src/caller/` (`autodarts.ts` cuts an Autodarts voice MP3 by its timing table, behind `caller.autodartsImport`; the bookmarklet that fetches them is `lib/caller/autodartsVoices.js`, turned into a link in `lib/caller/bookmarklet.ts`), their API in `backend/src/api/voices.ts` |
| Profile pictures: the Dartcade mark in two layers (foreground, background), each one of twenty finishes | `backend/src/shared/avatarFinishes.ts` (the list), rewards `picture.<id>` in `shared/progression.ts` `PERKS`; `user.avatar_preset` (foreground) / `avatar_background` (migration `038`), `setAvatar` in `db/users.ts`, `PATCH /api/me`; art: one standalone SVG per layer, `backend/frontend/src/lib/assets/finishes/<id>/{foreground,background}.svg` (short local ids; add a finish with a folder holding both files plus an `AVATAR_FINISHES` entry), assembled into one sprite of `finish-fg-<id>`/`finish-bg-<id>` symbols at build time by `lib/assets/finishes.ts` (ids prefixed `<id>-<fg|bg>-`), inlined once by `FinishSprite.svelte` (in `App.svelte`), drawn by `FinishPicture.svelte` (one layer or both) inside `Avatar.svelte`; `lib/progress/pictures.ts` (`wearPicture`, `finishAvatar`); picked only on Customise (`routes/Customise.svelte`); initials (`none`) and photos (`upload`, `POST /api/me/avatar`, `avatar.upload.enabled`) still render but have no UI for now |
| Customise your card (picture layers, frame, banner, colours and name style, title, sounds, celebrations): a draft saved together | `#/profile/customise/:tab` (`routes/Customise.svelte`, one route so tabs keep the draft; the Profile page's and Settings → Profile's Customise buttons link here); tabs, draft diffing (`equipChanges`, `pictureChanged`), Hide locked in `lib/progress/customise.ts`; tiles `lib/components/progress/CustomiseTile.svelte`; saves through `equip` (`lib/progress/equip.ts`) and `wearPicture` |
| Lights (WLED): triggers from game snapshots, the built-in profile, devices per board | rules and patches in `backend/src/shared/lights/` (shared with the frontend), triggers per game in `backend/src/lights/triggers/`, `backend/src/lights/service.ts` (sends `wled.apply` to the bridge), reports in `lights/store.ts`, `db/lights.ts`, API in `api/lights.ts`; bridge side `bridge/internal/wled` (allowlist, queue, flash/restore, mDNS; refuses loopback addresses unless `DARTCADE_WLED_ALLOW_LOOPBACK=1`); frontend `lib/components/lights/`, `lib/lights/`; behind `lights.enabled`; spec `docs/superpowers/specs/2026-10-18-wled-lights-design.md`, plan `docs/superpowers/plans/2026-10-18-wled-lights.md` |
| Dart helpers (labels, checkout hints) | `backend/frontend/src/lib/dartUtils.ts` |
| Game history: input log, replay, results | `backend/src/session/{apply,replay}.ts`, `backend/src/history/`, `backend/src/db/history.ts`, `backend/src/api/games.ts`; a finished game's detail is replayed once and stored (`storedDetail` in `history/detail.ts`, table `game_details`, migration `040`; bump `DETAIL_VERSION` or the module `version` to rebuild it) |
| Match details page (a finished game's result, match stats, leg/target sections) | `backend/frontend/src/routes/GameDetails.svelte`, helpers in `lib/details/`, components in `lib/components/details/`; stats from each module's `matchStats()` (`backend/src/games/matchStats.ts`, `x01Stats.ts`, `atcProgress.ts`); the X01 heatmap in `HeatmapView.svelte`/`HeatBoard.svelte` (simpleheat), helpers in `lib/details/heatmap.ts` |
| Architecture overview | `ARCHITECTURE.md`; the original research and Board Manager API findings in `docs/architecture.md` |
| Feature specs and implementation plans | `docs/superpowers/specs/`, `docs/superpowers/plans/` |
| Setup, tests, builds | `DEVELOPMENT.md`, `mise.toml` |
| Early experiments (not shipped) | `spike/` |

## Adding a game

Follow [`docs/adding-a-game-mode.md`](docs/adding-a-game-mode.md): what to write, the shared
pieces to reuse, and a checklist of every file a new mode touches. The short version:

1. A pure-reducer `GameModule` in `backend/src/games/<id>.ts` (replays must give the same
   state), registered in `games/index.ts`, its name in `backend/src/shared/gameNames.ts`.
   Reuse `validateOptions` (`games/configMeta.ts`), `nextTurn`/`upNext` (`games/turns.ts`),
   `withBullOff`, `games/teams.ts`, `games/outRules.ts` and the `games/matchStats.ts` helpers
   rather than writing your own. `summarize` must work without a winner (a forfeit).
2. Its view and detail in `schema/game-ws-v1.json` and `schema/api-v1.yaml`, then
   `npm run gen:api`.
3. On the client, fill the per-game tables the compiler insists on (`lib/gameViews/rules.ts`,
   `gameViews/index.ts`, `gameViews/settings.ts`, `history.ts`, `details/page.ts`, `winScreen.ts`,
   `dartEvents.ts`, `caller/calls.ts`), then build the match screen from `MatchFrame` and
   `BoardOrKeypad` (`lib/components/match/`) and the player-card shells.
4. Teams: `teams: true` plus `teamsOf(s)`, and read `cfg.format`/`cfg.teams` only through
   `games/teams.ts`, so singles and teams stay one code path; nothing outside the game decides
   teams.

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
- Release notes start as one line per merged PR, taken from its title (`cliff.toml`, written by the
  Release workflow on a `v*` tag). Write PR titles for players and self-hosters. Internal PRs use
  `ci`, `docs`, `test`, `refactor` or `chore`, or the `dev`/`preview` scope, and are left out.
- A PR with a big feature (a new game, page or flow) or a significant UI change adds a screenshot
  of it under `docs/<feature>/`, or updates the one already there, so `docs/`, the README and the
  release notes show the app as it is.
- After a release, rewrite its notes by hand (`gh release edit vX.Y.Z --notes-file …`): group the
  changes by area under emoji headers (🎯 New games, 🎮 Playing, 🗣️ Caller, 📊 Stats, ⚙️ Settings,
  🐛 Fixes, 🐳 Self-hosting), describe each in a player's words, end each line with the PR(s) it
  came from (`([#204](https://github.com/W3D3/dartcade/pull/204))`), mark what is still behind a
  flag, and show big features with their screenshot from `docs/`, linked at the tag
  (`https://raw.githubusercontent.com/W3D3/dartcade/vX.Y.Z/docs/<feature>/<file>.png`).

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
