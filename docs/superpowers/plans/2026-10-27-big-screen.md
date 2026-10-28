> **Superseded in part:** the per-game big-screen views this plan built (`LiveFrame`, `X01Live`, `X01Win`, `P121Live`, `AtcLive`, `HiloLive`, `MinigolfLive`, their view models, `CheckoutPanel`) were replaced by the match screen's own components in a frame; see the design spec.

# Big screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A view-only, distance-readable page that follows one board's live game, plus a user-session helper that opens it fullscreen on the bridge machine (off / auto / manual per board, Start/Stop button), and a button to open it from the match screen and game settings.

**Architecture:** The backend gets a board-following WebSocket (`/ws/board`) that pushes one "screen" per board (idle, live game snapshot, or finished game held for 1 minute), authenticated either by the owner's session cookie or by a board-scoped read-only _big-screen token_. The page (`#/big-screen/<boardId>`) renders per-game views scaled to a fixed 1920×1080 (or 1080×1920) stage. The bridge service gets `bigscreen.open`/`bigscreen.close` commands and forwards them over loopback to a `dartcade-bridge big-screen-helper` process that runs in the desktop user's session and launches a kiosk browser.

**Tech Stack:** Fastify + Kysely/Postgres + zod (backend), Svelte 5 + svelte-spa-router (frontend), Go + kardianos/service (bridge), vitest, Go test, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-27-big-screen-design.md` (read it first; this plan lists where it was narrowed, below).

## Working rules (all tasks)

- Work only in the worktree `/home/wedenigc/Dev/dartcade/.claude/worktrees/feat-big-screen` (branch `feat/big-screen`). Never `cd` to the main checkout.
- Commits: conventional (`feat(big-screen): …`), lower case, imperative, < 72 chars, **no `Co-Authored-By` or `Claude-Session` trailers**. One atomic, building, tested commit per task (more if the task says so). Run `npm run format` at the repo root before committing, plus `gofmt -w .` in `bridge/` for Go.
- Generated files are never hand-edited: `npm run gen:api` (repo root), `npm run gen:types` (backend), `go generate ./internal/schema` (bridge).
- Checks per area: `cd backend && npm test && npm run typecheck && npm run lint`; `cd backend/frontend && npm test && npm run typecheck && npm run lint`; `cd bridge && go test ./... && gofmt -l .`. DB tests need Postgres (`DEVELOPMENT.md`; container `dartcade-test-pg` is up).
- Naming: the feature is **Big screen** everywhere: code `bigScreen` / `big-screen` / `bigscreen`; never "presenter" outside this plan's references to artboard file names.
- Design reference: the canvas artboards are saved at `/tmp/claude-1000/-home-wedenigc-Dev-dartcade/75554abc-2ff2-4357-8dbf-a6091cfafbc7/scratchpad/artifact-files/0cb391cd-7f96-4e9a-aa25-d5e56042fad4/project/` as `Presenter-*.dc.html` (idle, X01 `Presenter-Landscape`/`-Portrait`/`-Landscape-Party`, `Presenter-Win-*`, `Presenter-121-*`, `Presenter-ATC-*`, `Presenter-HiLo-*`). They are reference markup, not runnable (the body is one long line: split on `><` or strip tags to read). **Ignore `Presenter-Cricket-*` and `Presenter-Minigolf-*`.**

## Narrowed from the spec (my calls, mark them in the PR)

1. **Fallback and generic result.** The spec's "fall back to the normal match screen" would mean refactoring the 1092-line `GameDisplay.svelte`. Instead: Minigolf renders the existing `MinigolfMatch.svelte` directly from the snapshot (3D course filling the stage, no controls); a game id with no big-screen view shows a centred title card (`FallbackCard.svelte`); a finished game with no result design (121, ATC, HiLo, minigolf) shows a generic result card (`GenericResult.svelte`: winner and placings from the snapshot) with the same 1-minute countdown.
2. **Held result survives a kiosk reload but not a backend restart.** The finished session is read from the engine's memory (finished games stay in `byId` for 10 minutes). After a backend restart within the minute the board shows idle. `// shortcut:` comment at the code.
3. **Kiosk caller voices: built-in voices only.** Custom voice packs and camera stills are `requireAuth` routes; the kiosk token does not reach them. A kiosk whose owner picked a custom voice falls back to the default built-in voice. `// shortcut:` comment at the code. (Opened from the app, the signed-in user's own settings apply as everywhere.)
4. **Helper registration:** Linux XDG autostart `.desktop` file, macOS LaunchAgent, Windows `HKCU\…\Run` value, all written for the invoking desktop user by `bridge install`. No `systemd --user` unit.
5. **Service ↔ helper channel:** loopback TCP `127.0.0.1:47817` (a `--helper-addr` flag overrides). Any local user could connect; accepted for a dart machine (the token it carries is board-scoped and read-only). `// shortcut:` comment.
6. Cricket has artboards but is not a game in the repo: skipped.
7. **The token is visible to local users on the bridge machine.** It is in the browser's command line (`ps`) and crosses the unauthenticated loopback channel. The browser runs private (`--incognito`, `--private-window`) so it stays out of the history. Residual risk accepted for a dart machine: the token is board-scoped, read-only and revoked by Stop, `off` or deleting the board.

## Global Constraints

- Board setting values exactly `off | auto | manual`, default `off`; stored on `boards.big_screen_mode`.
- Result is held **60 seconds** after `finished_at`, cut short when a newer game becomes active on the board; the lobby closing is ignored. Aborted/invalidated games go straight to idle.
- "The board's game" = the most recently started **active** game having a seat on the board (bull off included).
- The page is view-only: no cursor (`cursor: none`), no buttons, nothing sends a `ClientMessage`.
- Big-screen token: random 32 bytes hex, stored as SHA-256 hash like board tokens, board-scoped, valid only for `/ws/board`, revoked on Stop, mode set to `off`, board delete.
- Owner-only for the setting, Start/Stop and the token (`findOwnBoard`); keep checks in `boards/own.ts` so board sharing can extend them.
- Flag `bigscreen.enabled` (default rule `admins`) gates the UI (buttons, setting) and `/ws/board` for the cookie path; the token path is gated by the flag evaluated for the board owner.
- Orientation by viewport aspect ratio: width ≥ height → landscape stage 1920×1080, else portrait stage 1080×1920; stage scaled to fit with `transform: scale()`.
- The hardened systemd unit (`systemdUnit` in `bridge/cmd/bridge/service.go`) is not weakened.
- Browser order for the helper: Chromium/Chrome (`--kiosk`, own profile dir), Firefox (`--kiosk`), else default browser opened normally. A window closed by the user stays closed until the next Start.

## Review Focus

- Token in the wrong place: the token must never appear in a server URL/query log; page URL carries it only in the hash query, the page strips it after reading, the WS sends it as the first message. Test: `/ws/board` with token in the query string is rejected.
- Token of board A used on board B's socket, a revoked token, and an owner of another board: all closed `Forbidden`/`Unauthorized`, nothing pushed.
- Two games qualify (remote seat + local): newest start wins; when it ends the older one shows.
- Result clock: a push at 59.9 s still shows the result; the expiry timer pushes idle at 60 s even with no other event; a new game cancels the timer.
- Browser closed by hand in `auto` mode must not be reopened by the backend or helper until a Start; helper restart (`startup:true`) in `auto` reopens it.
- Socket drop on the kiosk: last picture stays, small reconnecting marker, resync on reconnect without a reload.

---

## File structure

Backend

- `backend/src/db/migrations/041_big_screen.sql` — columns on `boards`.
- `backend/src/db/schema.ts`, `queries.ts` — types and queries.
- `backend/src/bigscreen/{screen.ts,service.ts,token.ts}` (+ `*.test.ts`) — pure screen picker, the follow service, token mint/hash.
- `backend/src/browser-gw/bigScreen.ts` — `/ws/board` plugin.
- `backend/src/api/boards.ts` (+ test) — `bigScreen` field, `PATCH /api/boards/{id}/big-screen`, `POST …/big-screen/start|stop`.
- `backend/src/bridge-gw/handler.ts` — handle `bigscreen.status`.
- `backend/src/flags/definitions.ts`, `backend/src/index.ts`, `backend/src/app.ts` — wiring.
- `schema/api-v1.yaml`, `schema/adbridge-v1.json` — contract.
- `backend/src/shared/bigScreen.ts` — wire types shared with the frontend (`BigScreenMessage`, `BigScreenMode`).

Bridge

- `bridge/internal/bigscreen/{service.go,helper.go,browser.go,register_*.go}` (+ tests) — service-side forwarder, helper, browser launch, per-OS registration.
- `bridge/cmd/bridge/main.go`, `service.go` — wiring, subcommand, install hook.
- `scripts/install-bridge.{sh,ps1}`, `backend/frontend/src/lib/bridgeInstall.ts` — install text.

Frontend (`backend/frontend/src`)

- `routes/BigScreen.svelte` — the page.
- `lib/bigscreen/{store.ts,stage.ts,audio.ts,select.ts}` (+ tests in `lib/__tests__/`) — socket store, scaling/orientation, sound+caller, view picker.
- `lib/components/bigscreen/*` — `Stage`, `Idle`, `X01Live`, `X01Win`, `AtcLive`, `P121Live`, `HiloLive`, `GenericResult`, `FallbackCard`, `Reconnecting`.
- `lib/components/BoardStatusPanel.svelte`, `SettingsDrawer.svelte`, `boards/BoardsSection.svelte` — buttons and setting.
- `App.svelte` — route and kiosk exemption.

---

### Task 1: Board setting, token storage, flag, contract

**Files:**

- Create: `backend/src/db/migrations/041_big_screen.sql`, `backend/src/shared/bigScreen.ts`, `backend/src/bigscreen/token.ts`, `backend/src/bigscreen/token.test.ts`
- Modify: `backend/src/db/schema.ts` (BoardsTable ~:40), `backend/src/db/queries.ts` (near `renameBoard` :369), `backend/src/api/boards.ts` (`listBoards` :104, new route), `backend/src/flags/definitions.ts`, `schema/api-v1.yaml` (`Board` :3410, paths), `backend/src/api/boards.test.ts`; generated: `npm run gen:api`.

**Interfaces:**

- Produces (`backend/src/shared/bigScreen.ts`): `export type BigScreenMode = 'off' | 'auto' | 'manual'`; `export const BIG_SCREEN_MODES: readonly BigScreenMode[]`.
- Produces (`token.ts`): `mintBigScreenToken(): { token: string; hash: string }`; `hashBigScreenToken(token: string): string` (SHA-256 hex, same as board tokens).
- Produces (`queries.ts`): `setBigScreenMode(db, boardId: string, mode: BigScreenMode): Promise<void>`; `setBigScreenTokenHash(db, boardId: string, hash: string | null): Promise<void>`; `getBoardByBigScreenTokenHash(db, hash: string): Promise<BoardRow | undefined>`.
- Produces (API): `Board.bigScreen: { mode: BigScreenMode; running: boolean; helper: boolean }` (running/helper default `false` here; Task 4 fills them); `PATCH /api/boards/{id}/big-screen` body `{ mode }` → `{ id, mode }`, owner-only (`findOwnBoard`), turning to `off` also sets the token hash `null`.

- [ ] **Step 1: Write failing tests.** `token.test.ts`: `mintBigScreenToken()` returns a 64-hex token whose `hashBigScreenToken(token) === hash`, two mints differ. `boards.test.ts` (follow its mock pattern): `PATCH /api/boards/b1/big-screen {mode:'auto'}` → 200 `{id:'b1',mode:'auto'}` and `setBigScreenMode` called; `{mode:'sideways'}` → 400; non-owner → 403/404 as rename does; `{mode:'off'}` also calls `setBigScreenTokenHash(db,'b1',null)`; `GET /api/boards` items contain `bigScreen: {mode:'off',running:false,helper:false}`.
- [ ] **Step 2: Run them, expect FAIL** (`cd backend && npx vitest run src/bigscreen src/api/boards.test.ts`).
- [ ] **Step 3: Implement.** Migration 041: `ALTER TABLE boards ADD COLUMN big_screen_mode TEXT NOT NULL DEFAULT 'off' CHECK (big_screen_mode IN ('off','auto','manual')), ADD COLUMN big_screen_token_hash TEXT UNIQUE;` (`scripts/check-migrations.sh` must pass). Types, queries, schema yaml (`Board.bigScreen` in `required` and `properties`, `BigScreenModeRequest`/`BigScreenModeResponse`, the PATCH path with `operationId: setBigScreenMode`), route in `api/boards.ts` using `ownBoard`, flag `bigscreen.enabled` in both places in `flags/definitions.ts` (`FLAG_META` description "Big screen: a view-only game display that follows a board, optionally on the bridge machine's screen"; `defaultRule: 'admins'`).
- [ ] **Step 4: `npm run gen:api` at the repo root; run `cd backend && npm test && npm run typecheck && npm run lint` and `cd backend/frontend && npm run typecheck`.** Expect PASS (frontend typecheck may need `Board` fixtures in tests updated with `bigScreen`).
- [ ] **Step 5: Commit** `feat(big-screen): per-board mode, token storage and flag`.

---

### Task 2: Screen picker and follow service

**Files:**

- Create: `backend/src/bigscreen/screen.ts`, `screen.test.ts`, `service.ts`, `service.test.ts`
- Modify: `backend/src/shared/bigScreen.ts`

**Interfaces:**

- Consumes: Task 1 `BigScreenMode`; engine `getAllSessions()` / `getSnapshot(sessionId, view)` (`backend/src/session/engine.ts` :562), `Session` seats' `boardId`, status, start time and `finishedAt` (read the `Session` type in `session/types.ts` and add a small accessor if `finishedAt`/`startedAt` are not on it).
- Produces (`shared/bigScreen.ts`):
  ```ts
  export const RESULT_HOLD_MS = 60_000
  export type BigScreenScreen =
    | { kind: 'idle' }
    | { kind: 'game'; snapshot: unknown }
    | { kind: 'result'; snapshot: unknown; until: number } // epoch ms
  export type BigScreenMessage = {
    type: 'big_screen'
    board: { id: string; name: string; online: boolean }
    prefs: Record<string, unknown> // the board owner's account settings
    screen: BigScreenScreen
  }
  ```
- Produces (`screen.ts`): `pickScreenSession(sessions: PickInput[], boardId: string, now: number): { id: string; kind: 'game' | 'result'; until?: number } | null` where `PickInput = { id: string; boardIds: string[]; status: 'active' | 'finished' | 'aborted'; startedAt: number; finishedAt: number | null; invalidated: boolean }`.
- Produces (`service.ts`): `class BigScreenService` constructed with `{ getSessions(): PickInput[]; getSnapshot(sessionId: string): unknown | undefined; getBoard(boardId: string): Promise<{ name: string; ownerUserId: string } | undefined>; isOnline(boardId: string): boolean; getPrefs(userId: string): Promise<Record<string, unknown>>; now?: () => number; setTimer?: typeof setTimeout }`, with `add(boardId: string, send: (m: BigScreenMessage) => void): () => void` (subscribe, sends the current message immediately, returns unsubscribe), `onSessionChanged(sessionId: string): void`, `onBoardPresence(boardId: string): void`, `close(): void`.

- [ ] **Step 1: Write failing tests** for `pickScreenSession`: (a) no sessions → `null`; (b) one active session with the board → `{kind:'game'}`; (c) two active, newer `startedAt` wins; (d) finished 30 s ago, nothing active → `{kind:'result', until: finishedAt+60000}`; (e) finished 60 s ago → `null`; (f) finished 30 s ago and an active one exists → the active game; (g) aborted or invalidated finished → `null`; (h) a session on another board is ignored. `service.test.ts` with fake timers: `add` sends the idle message at once; `onSessionChanged` for a session on the board re-sends; a result schedules a push at `until` that sends idle even with no events; a new active game cancels the timer; `unsubscribe` stops sends; two boards do not cross-talk; prefs are those of the board owner.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Pure picker (sort/filter), service recomputes per subscribed board on each trigger (cheap), one timer per board for the result expiry. `// shortcut:` comment for the memory-only held result (see narrowing 2).
- [ ] **Step 4: Run tests + typecheck + lint, expect PASS.**
- [ ] **Step 5: Commit** `feat(big-screen): pick a board's screen and push it to followers`.

---

### Task 3: `/ws/board` socket and wiring

**Files:**

- Create: `backend/src/browser-gw/bigScreen.ts`, `backend/src/browser-gw/bigScreen.test.ts`
- Modify: `backend/src/index.ts` (engine `pushRaw`, `ended`, `onBoardPresence`, service construction ~:85-140), `backend/src/app.ts` (register plugin ~:203), `backend/src/browser-gw/authedSocket.ts` only if a helper is reusable.

**Interfaces:**

- Consumes: Task 2 `BigScreenService`; Task 1 `getBoardByBigScreenTokenHash`, `hashBigScreenToken`, `findOwnBoard`, `getAuthUser`, `WsCloseCode`, flag lookup `flagEnabled(key, await loadFlagUser(db, userId))`.
- Produces: `bigScreenGwPlugin: FastifyPluginAsync<{ db: Kysely<Database>; service: BigScreenService }>`; route `GET /ws/board?boardId=<id>` (websocket). Auth: if a valid cookie session exists and `findOwnBoard` passes → ok; else the **first client message must be** `{"type":"auth","token":"<hex>"}` within 5 s, whose hash must match `getBoardByBigScreenTokenHash` **and** that board's id equals `boardId`. Any `token` in the query string → close `Forbidden` (4403). Failures: `Unauthorized` 4401, `Forbidden` 4403, `NotFound` 4404. After auth the socket receives `BigScreenMessage` JSON and ignores everything else it sends.
- `index.ts` calls `bigScreen.onSessionChanged(id)` from `pushRaw` and the engine's `ended`, and `bigScreen.onBoardPresence(boardId)` from the existing `onBoardPresence` hook.

- [ ] **Step 1: Write failing tests** (pattern: `browser-gw/lobby.test.ts`): owner cookie connects and receives an idle message; non-owner closed 4403; token as first message for the right board receives messages; token for board A on `boardId=B` closed 4403; revoked/unknown token closed 4401; token in query closed 4403; no auth message in 5 s closed 4401 (fake timers); flag off → closed 4403; a game start (service callback) delivers a `game` screen to the open socket.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the plugin (reuse `socketQuery`, `withAuthedSocket` where it fits, else a small variant) and wire the service in `index.ts`/`app.ts`. The service's `getPrefs` reads the same data as `GET /api/me/preferences` (`api/me.ts:127`, extract a shared function if it is inline). The flag check for the token path evaluates for the board's owner.
- [ ] **Step 4: Run backend tests, typecheck, lint; expect PASS.** Also boot check: `cd backend && npx tsx -e "import('./src/app.js')"` (or the repo's usual start) shows no wiring error.
- [ ] **Step 5: Commit** `feat(big-screen): follow a board over /ws/board`.

---

### Task 4: Start/Stop API, bridge messages, auto mode

**Files:**

- Modify: `schema/adbridge-v1.json`, `schema/api-v1.yaml`, `backend/src/api/boards.ts`, `backend/src/bridge-gw/handler.ts`, `backend/src/bridge-gw/connections.ts` (per-board helper/running state), `backend/src/boards/` (new `bigScreenState.ts`), tests alongside; generated via `npm run gen:api` + `npm run gen:types`, `cd bridge && go generate ./internal/schema`.
- Create: `backend/src/boards/bigScreenState.ts`, `bigScreenState.test.ts`

**Interfaces:**

- Contract (`adbridge-v1.json`): server→bridge `$defs` `BigScreenOpenData` (`kind: 'bigscreen.open'`, `{ url: string }`) and `BigScreenCloseData` (`kind: 'bigscreen.close'`, `{}`); bridge→server `BigScreenStatusData` (`kind: 'bigscreen.status'`, `{ helper: boolean; running: boolean; startup?: boolean; browser?: string }`), non-event message (no envelope/seq; add to the early-kind list like `wled.status`).
- Produces (`bigScreenState.ts`): `class BigScreenState { set(boardId: string, s: { helper: boolean; running: boolean; browser?: string }): void; get(boardId: string): { helper: boolean; running: boolean; browser?: string }; clear(boardId: string): void }` (in memory; cleared when the bridge disconnects).
- Produces (API): `POST /api/boards/{id}/big-screen/start` and `…/stop` (owner-only; 409 when mode is `off`; 409 when the bridge is offline; start: mint token, `setBigScreenTokenHash`, send `bigscreen.open` with `url = <public app base>/#/big-screen/<boardId>?k=<token>`; stop: send `bigscreen.close`, hash `null`). Both reply `{ running: boolean }`. `Board.bigScreen.running/helper` come from `BigScreenState`. Find the public base URL the way mail links do (`backend/src/mail/` or auth options base URL).
- Auto mode: on `bigscreen.status` with `startup: true` and `helper: true`, if the board's mode is `auto` → do the same as start. Never reopen on `running:false` without `startup`.
- Board status push: after a status message, fire the existing `onBoardStatus(ownerUserId, boardId, online)` hook so the owner's Boards page refetches.

- [ ] **Step 1: Write failing tests:** start sends `{kind:'bigscreen.open', data:{url}}` whose url contains `#/big-screen/b1?k=` and the hash of that token is stored; stop sends close and nulls the hash; mode `off` → 409; offline → 409; non-owner 403; `bigscreen.status{startup:true,helper:true}` for an `auto` board triggers an open, for `manual` does not, and `{running:false}` alone (browser closed by hand) triggers nothing; `listBoards` reflects the state; bridge disconnect clears it.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** (schema first, regenerate, then handler/route/state). Bridge schema Go regeneration needs network the first time.
- [ ] **Step 4: Run all three checks (backend, frontend typecheck, `cd bridge && go build ./...`); expect PASS.**
- [ ] **Step 5: Commit** `feat(big-screen): start and stop the board's screen via the bridge`.

---

### Task 5: Bridge service side and helper

**Files:**

- Create: `bridge/internal/bigscreen/service.go`, `helper.go`, `browser.go`, `browser_test.go`, `service_test.go`, `helper_test.go`
- Modify: `bridge/cmd/bridge/main.go` (OnMessage switch ~:240, new subcommand `big-screen-helper`), `bridge/cmd/bridge/service.go` only for the `--helper-addr` flag plumbing.

**Interfaces:**

- Consumes: transport `tr.OnMessage`/`tr.SendMessage`/`tr.OnConnect`, generated schema types from Task 4.
- Produces (`service.go`): `type Service struct{ Addr string; Send func(kind string, data any) }`; `func (s *Service) Run(ctx context.Context) error` (listens on `Addr`, default `127.0.0.1:47817`, accepts helper connections); `func (s *Service) Handle(kind string, data json.RawMessage) bool` (true for `bigscreen.open`/`bigscreen.close`, forwards `{"cmd":"open","url":…}` / `{"cmd":"close"}` as JSON lines to the connected helper; if no helper is connected it sends `bigscreen.status{helper:false,running:false}`); on helper connect/line `{"status":{…}}` it calls `Send("bigscreen.status", …)`.
- Produces (`helper.go`): `func RunHelper(ctx context.Context, addr string, launch Launcher) error` — dials `addr` (retry every 5 s), sends `{"status":{"helper":true,"running":false,"startup":true}}` on connect, handles `open` (launch browser, status `running:true, browser:<name>`), `close` (kill it), and reports `running:false` when the process exits; exits when the bridge's version differs from the helper's (the service sends its version in a `{"hello":{"version":…}}` line on connect; mismatch → return `ErrVersionMismatch` so the OS restarts/relaunches it at next login — document this).
- Produces (`browser.go`): `type Launcher interface{ Launch(url string) (*Running, error) }`; `func DefaultLauncher(profileDir string) Launcher` choosing, via `exec.LookPath`, the first of `chromium`, `chromium-browser`, `google-chrome`, `google-chrome-stable`, `chrome` (macOS: the `.app` binaries under `/Applications`; Windows: `Program Files` paths) with args `--kiosk --user-data-dir=<profileDir> --autoplay-policy=no-user-gesture-required --no-first-run --noerrdialogs --disable-infobars <url>`; else `firefox --kiosk --profile <profileDir> <url>`; else the OS opener (`xdg-open`/`open`/`rundll32 url.dll,FileProtocolHandler`) with `Running.Browser = "default"` and no kill handle.
- main.go: `bridge big-screen-helper [--helper-addr addr]` runs `RunHelper` with `profileDir = <UserConfigDir>/dartcade-bridge/big-screen-browser`; the service wires `bigscreen.Service.Handle` into the `OnMessage` switch before `lights.Handle` and starts `Service.Run` beside the bridge.

- [ ] **Step 1: Write failing tests:** `browser_test.go` — a table test of `chooseCommand(lookPath func(string)(string,error), goos string, profile, url string) (name string, args []string, browser string)` for Chromium present, only Firefox present, none present, per OS; asserts the exact flags above. `service_test.go` — with a fake TCP helper: `Handle("bigscreen.open", {"url":"u"})` writes `{"cmd":"open","url":"u"}`; no helper → status `helper:false` sent; helper status line is forwarded via `Send`. `helper_test.go` — against an in-memory listener with a fake `Launcher`: connects, reports startup status, `open` launches and reports `running:true`, process exit reports `running:false` with no `startup`, `close` stops it, version-mismatch hello returns `ErrVersionMismatch`.
- [ ] **Step 2: Run `cd bridge && go test ./internal/bigscreen/...`, expect FAIL.**
- [ ] **Step 3: Implement.** `// shortcut:` comment on the unauthenticated loopback (narrowing 5).
- [ ] **Step 4: `cd bridge && go test ./... && gofmt -l .` (empty) — expect PASS.**
- [ ] **Step 5: Commit** `feat(bridge): big screen forwarder and kiosk helper`.

---

### Task 6: Helper registration at install

**Files:**

- Create: `bridge/internal/bigscreen/register.go` (shared interface), `register_linux.go`, `register_darwin.go`, `register_windows.go`, `register_test.go`
- Modify: `bridge/cmd/bridge/service.go` (`runServiceCommand` install/uninstall), `scripts/install-bridge.sh`, `scripts/install-bridge.ps1`, `backend/frontend/src/lib/bridgeInstall.ts` (+ its test), `DEVELOPMENT.md`.

**Interfaces:**

- Produces: `func Register(exe string, u *user.User, helperAddr string) error` and `func Unregister(u *user.User) error`; `func InvokingUser() (*user.User, error)` (`SUDO_USER` when running as root on Unix, else `user.Current()`; error when root without `SUDO_USER` — then install skips registration and prints a one-line note, does not fail).
- Linux: writes `<home>/.config/autostart/dartcade-big-screen.desktop` (`Exec=<exe> big-screen-helper`, `X-GNOME-Autostart-enabled=true`, `Hidden=false`), chowned to the user. macOS: `<home>/Library/LaunchAgents/com.dartcade.big-screen.plist` (RunAtLoad, KeepAlive). Windows: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value `DartcadeBigScreen` = `"<exe>" big-screen-helper` (use `golang.org/x/sys/windows/registry`, already an indirect dependency of kardianos/service; check `go.mod`).
- Pure, tested seam: `desktopEntry(exe string) string`, `launchAgentPlist(exe string) string`.
- Install also tells the user how to start it now (Linux/macOS: it starts at next login) — print one line.
- `bridgeInstall.ts`: `OS_NOTES` mention "also sets up Big screen for the logged-in desktop user"; no change to the command strings except where tests demand.

- [ ] **Step 1: Write failing tests:** `desktopEntry`/`launchAgentPlist` content (exact `Exec` / `ProgramArguments`), `Register` into a temp `HOME` writes the file with the user's ownership on Linux/macOS (skip the chown assertion when not root), `Unregister` removes it and is idempotent, `InvokingUser` picks `SUDO_USER`. `bridgeInstall.test.ts` still passes and asserts the new note text.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** and call `Register` after a successful service install in `runServiceCommand` (and `Unregister` on uninstall); add the install-script messages.
- [ ] **Step 4: `cd bridge && go test ./... && GOOS=windows go build ./... && GOOS=darwin go build ./...`; frontend `npm test`; expect PASS.**
- [ ] **Step 5: Commit** `feat(bridge): register the big screen helper for the desktop user`.

---

### Task 7: Page shell, store, stage, idle, result, sound

**Files:**

- Create: `backend/frontend/src/routes/BigScreen.svelte`, `lib/bigscreen/store.ts`, `stage.ts`, `select.ts`, `audio.ts`, `lib/components/bigscreen/{Stage,Idle,Reconnecting,FallbackCard,GenericResult}.svelte`, tests in `lib/__tests__/bigScreenStore.test.ts`, `bigScreenStage.test.ts`, `bigScreenSelect.test.ts`
- Modify: `App.svelte` (route `'/big-screen/:board'`; kiosk exemption), `lib/publicRoutes.ts` only if that is the chosen exemption.

**Interfaces:**

- Consumes: `BigScreenMessage` (`$shared/bigScreen`), `reconnectingSocket(url, handlers, open?)` (`lib/reconnectingSocket.ts`), `SnapshotSchema`/`parseSnapshot` (`lib/ws.ts`), `callGame`/`callsFor`/`checkoutFor`/`createCheckoutMemory`/`requirePart` (`lib/caller/calls.ts`), `createCaller` (`lib/caller/player.ts`), `createSounds`, `dartSound`, `snapshotEvent`, `loadSettings`.
- Produces (`store.ts`): `createBigScreenStore(boardId: string, token: string | null, open?: (url: string) => WebSocket): { message: Readable<BigScreenMessage | null>; connected: Readable<boolean>; destroy(): void }` — connects to `/ws/board?boardId=…`; when `token` is set it sends `{type:'auth',token}` as the first message on every (re)open; parses the payload (`screen.snapshot` through `SnapshotSchema`, invalid → treated as idle); never redirects to login.
- Produces (`stage.ts`): `orientationFor(width: number, height: number): 'landscape' | 'portrait'`; `stageScale(width: number, height: number): { orientation; scale: number; w: number; h: number }` (landscape 1920×1080, portrait 1080×1920, `scale = min(width/w, height/h)`).
- Produces (`select.ts`): `viewFor(screen: BigScreenScreen): { component: 'idle' | 'x01' | 'atc' | 'p121' | 'hilo' | 'minigolf' | 'fallback' | 'x01-win' | 'generic-result'; … }` choosing by `snapshot.gameId` and `screen.kind`.
- `BigScreen.svelte`: reads `board` from the route and `k` from the hash query, **removes `k` from the URL** (`history.replaceState`) and keeps it in a variable (no storage); wraps the chosen view in `Stage`; `cursor: none`; shows `Reconnecting` when `!connected` while keeping the last view; result views get a `countdown` derived from `screen.until` ticking each second ("Board screen in 0:42" text lives in the win/generic views); minigolf renders `MinigolfMatch.svelte` from the snapshot.
- Kiosk exemption in `App.svelte`: a hash starting `#/big-screen/` skips `currentUser.refresh()`/login redirect, `loadAccountSettings`, `me.start()`; when a user _is_ signed in (opened from the app) the normal flow runs.
- `audio.ts`: `createBigScreenAudio(opts: { settings: GameSettings }): { onSnapshot(prev, next): void; wake(): void; destroy(): void }` reproduces GameDisplay's call+sound logic for snapshots (see `GameDisplay.svelte` ~:188-215 and :263) using `message.prefs` merged over `defaultSettings` on the kiosk and the user's own `loadSettings` + account settings when signed in; custom voices fall back to the default built-in voice (`// shortcut:` narrowing 3); shows a small "tap to enable sound" marker when the AudioContext stays suspended; muted entirely when `callerOn`/sound toggles are off.

- [ ] **Step 1: Write failing tests:** store — token sent first on open and again after a reconnect, no token → nothing sent, invalid snapshot → idle, destroy closes (use the `FakeSocket` pattern of `lobbySockets.test.ts`); stage — landscape/portrait choice and scale for 1920×1080, 1280×720, 1080×1920, 800×1000; select — each `gameId`×`kind` maps as specified, unknown game id → `fallback`, finished without a result design → `generic-result`, minigolf → `minigolf`; audio — a snapshot where X01 score changes triggers the caller `say` once when `callerOn`, not when off (inject fakes).
- [ ] **Step 2: Run `cd backend/frontend && npx vitest run src/lib/__tests__/bigScreen*`, expect FAIL.**
- [ ] **Step 3: Implement.** `Idle` follows `Presenter-Idle-*` minus the last-game/tonight/highlights blocks (clock, date, board name, "Waiting for the next game" / "Board offline", the DARTCADE mark and animated board); `GenericResult` shows the winner and placings from the snapshot with the 60 s countdown; use design tokens/fonts already in the app (the artboards use Barlow Condensed, Instrument Sans, JetBrains Mono — check `lib` for bundled fonts and reuse).
- [ ] **Step 4: Run frontend tests, typecheck, lint; expect PASS.** Manual: run the page against the dev backend in a browser after Task 3 is merged (see Task 10).
- [ ] **Step 5: Commit** `feat(big-screen): the big screen page, idle and result cards`.

---

### Task 8: X01 live and X01 win views

**Files:**

- Create: `lib/components/bigscreen/X01Live.svelte`, `X01Win.svelte`, tests `lib/__tests__/bigScreenX01.test.ts` (pure view-model helpers)
- Create: `lib/bigscreen/x01View.ts` — pure view-model functions
- Modify: `routes/BigScreen.svelte` (register the views), `lib/bigscreen/select.ts` only if names change.

**Interfaces:**

- Consumes: X01 snapshot shape from `lib/api/game-ws.ts` / `gameState(snap)`; the checkout/darts helpers in `lib/dartUtils.ts`.
- Produces (`x01View.ts`): `x01Live(snap): { header: {title: string; meta: string}; seats: Array<{name; initial; score; avg; darts; throwing: boolean; next: boolean}>; visit: {darts: string[]; total: number; leaves: number | null}; checkout: {text: string; route: string} | null; party: boolean }` and `x01Win(snap): { winner; legs: number[]; stats: Array<{label: string; values: string[]}>; gameShot: string | null; party: boolean; standings: Array<{place; name; legs; avg; firstNine}> }` — `party` is true for 3+ seats.
- `X01Live` renders landscape/portrait, 2-seat (`Presenter-Landscape`/`-Portrait`) and 3+ seats (`Presenter-Landscape-Party`; portrait party reuses the 2-seat portrait stack of rows); `X01Win` renders `Presenter-Win-*` (landscape 2p, party; portrait 2p, party) with the countdown from the page.

- [ ] **Step 1: Write failing tests** for `x01Live` and `x01Win` using a recorded/hand-built X01 snapshot (find fixtures in `lib/__tests__` or `backend/src/session` test helpers): thrower flagged, next flagged, `leaves` computed as `remaining - visitTotal`, checkout text only when a finish is possible, `party` threshold at 3 seats, win standings ordered by placement, stats rows labelled exactly `3-DART AVERAGE`, `FIRST 9 AVERAGE`, `CHECKOUT`, `HIGHEST FINISH`, `180S`, `BEST LEG` as in the artboard.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the view-model functions, then the two components against the artboards (type scale: remaining score 230 px, etc., copy the artboard's measurements via the stage). Teams use the seat/team rule from `backend/src/games/teams.ts` as the app does.
- [ ] **Step 4: Run frontend tests, typecheck, lint; expect PASS.**
- [ ] **Step 5: Commit** `feat(big-screen): X01 live and match-won views`.

---

### Task 9: 121, Around the Clock and Higher Lower live views

**Files:**

- Create: `lib/components/bigscreen/P121Live.svelte`, `AtcLive.svelte`, `HiloLive.svelte`, `lib/bigscreen/{p121View,atcView,hiloView}.ts`, `lib/__tests__/bigScreenGames.test.ts`
- Modify: `routes/BigScreen.svelte`.

**Interfaces:**

- Produces: `p121Live(snap)`, `atcLive(snap)`, `hiloLive(snap)` view-model functions returning exactly what the artboards `Presenter-121-*`, `Presenter-ATC-*`, `Presenter-HiLo-*` show: 121 — try n of N, target, left, darts left, checkout route, this visit, session tries list (`TRY 1 · 121 · missed · reset`…), made/total; ATC — per seat target, hit rate, darts, "13 of 21 done", the 1–20+B progress strip, this visit; HiLo — seats with lives (`2 of 3 lives`), last visit, the NEEDS OVER/UNDER bars (`OVER 60 or UNDER 15`), this visit and what it beats.

- [ ] **Step 1: Write failing tests** per view model with hand-built snapshots of each game's `Snapshot` branch (copy shapes from `schema/game-ws-v1.json` and existing fixtures in `lib/p121`, `lib/hilo`): the exact strings/numbers listed above for one fixture each, plus an ATC 3+ seat case and a HiLo life-lost case.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** view models, then the three components for landscape and portrait.
- [ ] **Step 4: Run tests, typecheck, lint; expect PASS.**
- [ ] **Step 5: Commit** `feat(big-screen): 121, Around the Clock and Higher Lower views`.

---

### Task 10: Buttons, setting, e2e, docs

**Files:**

- Modify: `lib/components/BoardStatusPanel.svelte` (after Calibrate: Start/Stop big screen; "Open big screen here" link), `lib/components/SettingsDrawer.svelte` ("Big screen" button opening `#/big-screen/<boardId>` in the current window), `lib/components/boards/BoardsSection.svelte` (`off|auto|manual` select in `boardDetails`, helper-missing hint), `lib/api/boardActions.ts` or `lib/boards.ts` (helpers), `AGENTS.md` (map rows for big screen), `DEVELOPMENT.md`, `e2e/tests/big-screen.spec.ts`, `docs/big-screen/*.png`.
- Tests: `lib/__tests__/bigScreenControls.test.ts` (pure helper `bigScreenButton(board): { label: string; action: 'start' | 'stop' | null; hint: string | null }`).

**Interfaces:**

- Consumes: `Board.bigScreen` (Task 1/4), `flag('bigscreen.enabled')`, endpoints from Task 4 via the typed `api` client (`PATCH /api/boards/{id}/big-screen`, `POST …/start|stop`).
- Produces: `bigScreenButton(board)`: hidden (`action: null`) when mode is `off` or the flag is off; `Stop big screen` when `running`; `Start big screen` otherwise; `hint: 'Re-run the install command on this machine to enable big screen'` when `!helper` and the bridge is online; styled as a prominent blue button below the existing controls (use an existing blue/accent token). The "Open big screen here" link is shown whenever the flag is on, for the board's owner, regardless of mode.

- [ ] **Step 1: Write failing tests** for `bigScreenButton` (all branches) and an e2e (`e2e/tests/big-screen.spec.ts`, fixtures in `e2e/fixtures/`): owner enables the flag, opens `#/big-screen/<board>`, sees "Waiting for the next game"; starts an X01 game through the existing helpers and the page switches to the live view (assert the thrower's name and score text); finishing it shows the result with a countdown and, after the 60 s hold (use a short test override only if the backend exposes one; otherwise assert the countdown element and skip the wait), idle.
- [ ] **Step 2: Run unit test, expect FAIL.**
- [ ] **Step 3: Implement** the controls and docs: AGENTS.md map row "Big screen" (page, `/ws/board`, service, helper, registration, flag `bigscreen.enabled`, spec link), DEVELOPMENT.md section "Big screen on the bridge machine" (how to run the helper by hand against the dev stack: `bridge big-screen-helper`).
- [ ] **Step 4: Run frontend tests/typecheck/lint, `npm run format:check`, and the e2e (`cd e2e && npx playwright test big-screen`); expect PASS.**
- [ ] **Step 5: Screenshots** with the repo's screenshot setup (`e2e/screenshots.config.ts`) into `docs/big-screen/` (idle, X01 live, X01 win) and reference them in the PR.
- [ ] **Step 6: Commit** `feat(big-screen): board controls, setting, e2e and docs`.

---

## Finish (controller, not a task)

1. Whole-branch review by an Opus reviewer against the spec and this plan; fix findings (fold into the owning commit via fixup/rebase).
2. `git fetch && git rebase origin/main`, re-run all checks; atomic commits as above.
3. Push `feat/big-screen`, open the PR (title for players: "Big screen: a distance-readable game display for your board's screen"), body lists the narrowed decisions, screenshots under `docs/big-screen/`.
4. Replace the dev stack (see below) and leave it running for the user.

### Dev stack replacement

Dev stack is currently stopped (`docker ps` shows only the test DB). From the worktree: copy `/home/wedenigc/Dev/dartcade/.env` into it if missing, `./scripts/dev.sh` (project `dartcade-dev`, ports 3000/5173/8025; bind-mounts the worktree's `backend` and `backend/frontend`, bridge image rebuilt with `--build`). Keep `lights.enabled` overridden **off** in the dev DB (`feature_flag_overrides`, see memory `dev-stack-lights-off`), enable `bigscreen.enabled` for the admin there, and verify `http://localhost:5173/#/big-screen/<board>` shows the idle screen.
