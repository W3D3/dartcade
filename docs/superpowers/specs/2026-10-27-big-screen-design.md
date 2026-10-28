# Big screen

Design source: the "Dartcade Platform Design" canvas, all artboards named `Presenter-*`
(https://claude.ai/artifact/2ZyCCfSMhs3PKZzNLzsw23): idle, X01 (2 players, party), X01 match won (`Presenter-Win-*`),
121 Checkout, Around the Clock, Higher Lower, Cricket, each in landscape and portrait. The designer's file names
still say "Presenter"; the feature is called **Big screen** everywhere in the product and code. Read the
artboards with the Artifact tool and strip the inline SVG first. Designs for result screens of the other games
may still be added to the same canvas.

## Intent

A dart board often has a screen next to it: a monitor on a Raspberry Pi that also runs the bridge, a TV, a
tablet on the wall. People at the board want to glance up and see what is going on, from across the room,
without touching anything. Today the only way is to open the normal match screen, which is built for the
person holding the phone.

Big screen is a view-only page designed to be read from a distance, plus a way to keep it on a screen
permanently: the bridge opens it in a fullscreen browser on the machine it runs on and it follows the board's
live game by itself.

## Goals

- A **Big screen page** that follows one board's current game and shows it in the big-screen design. It is
  view-only: nothing on it can send a dart, a correction or any other action.
- **Switching from where you are:** a "Big screen" button on the board screen (the match screen) and in the
  game settings opens the page in the browser you are already using, signed in as you.
- **Big screen on the board's machine:** a per-board setting `off | auto | manual` and a Start/Stop button.
  The bridge machine opens a fullscreen browser on the page and keeps showing whatever the board is doing.
- It works unattended: idle screen when nothing is running, switches to a game when one starts, shows the
  result when it ends, comes back by itself after a network drop or backend restart.

## Non-goals

- Interacting with the page (no controls, no cursor; the design hides the cursor).
- Remote watching by people who are not at the board (spectator links, public URLs).
- The idle screen's "last game", "tonight" and highlights blocks: **left out of the MVP**. The idle screen
  keeps the clock, the board name, "Waiting for the next game", and the lobby line if the design's lobby block
  can be served from existing data (builder's call; drop it otherwise).
- Showing the board's camera image.
- Updating the bridge's service registration through the self-update (see Install).
- Windows and macOS polish beyond "works": see Install for what must work per OS.

## Anti-goals

- The big-screen page becoming a second copy of the match screen's logic. It reads the same game snapshots;
  only the presentation differs.
- A credential on the board machine that can do more than watch one board.
- The browser on the board machine coming back after someone closed it deliberately.
- Weakening the bridge's hardened service unit (dynamic user, `ProtectHome`, no new privileges) for this.

## What the page shows

Follows one board. "The board's game" is the active game that has a seat on that board.

| State                                                                     | Screen                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No active game, and no finished game being held                           | **Idle** (design: `Presenter-Idle-*`, MVP content above)                                                                                                                     |
| A game is active (bull off included; a lobby that is only waiting is not) | That game's big-screen layout, live                                                                                                                                          |
| A game just ended                                                         | The **result** screen with the winner. Held for **1 minute**, or until a new game starts on the board (which cuts it short), then back to idle. The lobby closing is ignored |

- **Orientation:** landscape and portrait; the page picks by the viewport's aspect ratio. The stage is 1920×1080
  (1080×1920) scaled to the screen.
- **The match screen's own components, bigger.** The live game and the result are the match screen's components
  (`ScoreMatch` for X01 and Around the Clock, `P121Match`, `HiloMatch`, `MinigolfMatch`, `BullOffPanel`,
  `WinScreen`, `P121Summary`), shown view only (`viewOnly`, no callbacks) with the derivations shared through
  `lib/matchView.ts`, so every animation (visit band, dart pop, bust, podium, confetti) and every layout rule
  (board in the middle for 2, stacked rows for 3 or more, teams, portrait) is the match screen's. They are drawn in a
  same-origin iframe (`#/big-screen-frame`, `routes/BigScreenFrame.svelte`) 1.25 times smaller than the stage and
  scaled up with a transform, so media queries, `vh` sizes and breakpoints behave as in a 1536 px window. The page
  keeps the socket, the audio and the previous snapshot and posts what the frame draws (`lib/bigscreen/frame.ts`).
  A big-screen header (`BigHeader`, with LIVE) sits above every live game but minigolf, which is the play-mode
  screen as it is.
- **Fallback:** a game the frame has no component for shows a centred title card, so the page never goes blank.
- **Result screen:** the match screen's win screen without buttons (`WinScreen`; 121 shows its session summary), scaled
  down when it would need scrolling, and a **"Board screen in 0:42" countdown** that is the 1-minute hold. A game
  without a win view (a forfeit, no winner) shows a generic card (winner and placings). Minigolf holds the win screen
  until its last stroke has rolled, as the match screen does. The kiosk shows no XP, and the winner's celebration
  plays only where someone is signed in.
- **Connection state:** if the page loses its socket it keeps the last picture and shows a small, calm
  "reconnecting" marker, then resyncs. It never shows a raw error.
- **Board offline:** the idle screen says so ("Board offline") instead of "Waiting for the next game".

## Sound and caller

The big screen plays the same sounds and caller as the match screen, driven by the **user's existing sound and
caller settings**. There are no big-screen-specific sound options for now (separate per-board toggles are a
possible later addition).

- **In the app:** a big screen opened from the board screen or the game settings uses the signed-in user's
  settings on that device, exactly like the match screen.
- **On the board's machine:** the kiosk has no user, so it uses the **board owner's** saved settings
  (account-wide, `GET /api/me/preferences`: sounds on/off, caller voice, volume, call rules), delivered to the
  page with the follow-board data. The credential still reads nothing else; the voice clips the chosen voice
  needs are served to it through a narrow clip route (builder's call).
- **Autoplay:** browsers block sound without a click. Kiosk launch passes the browser's "allow autoplay"
  option (Chromium `--autoplay-policy=no-user-gesture-required`; the Firefox equivalent preference in the
  helper's own profile). A big screen opened from the app starts after a button press, which counts as the
  click. If sound is blocked anyway, the page shows a small "tap to enable sound" marker, never an error.
- **No doubling:** a person watching the same game on their phone with sound on is a separate device; the big
  screen does not try to detect it.

## Following a board (backend)

Today a browser watches one game: `/ws` with a `sessionId` (`browser-gw/handler.ts`), allowed for the host,
seat controllers and lobby members (`canWatchSession`). Big screen needs "watch a board": a subscription by
board id that is pushed the board's current game snapshot, and the switch from one game to the next, without
the client reconnecting. Shape (message names, one socket or two) is the builder's call. Requirements:

- Who may watch a board: the board's owner and (with board sharing, `2026-10-26-board-sharing-design.md`)
  its grantees, plus the existing `canWatchSession` rule for the game being shown.
- The board machine authenticates with a **big-screen credential**, not a user login (next section).
- Held result: the backend, not the page, decides what "the last game on this board" is, so a reload of the
  kiosk browser still shows the held result.
- Invalidated or aborted games: an aborted game goes to idle at once (no result to hold); an invalidated one
  is treated like aborted.

## Credential on the board machine

The kiosk browser cannot use a user login. The bridge's own token lives in `bridge.toml` in the service's
private state dir (mode 0700), which the desktop user's session cannot read. So:

- The **backend** mints a **big-screen credential** when a monitor is started, scoped to **one board** and
  to the read-only follow-the-board subscription (nothing else: no REST routes, no game actions), with an
  expiry the page can renew from while it is open (builder's call: signed short-lived token that the page
  refreshes over its socket, or a long-lived revocable one stored hashed like board tokens).
- The backend sends it to the bridge over the existing authenticated bridge socket, inside the "open big
  screen" command. The bridge hands the ready-made URL to the user-session helper.
- Revoking: stopping the monitor, deleting the board and unpairing it all invalidate the credential.
- The credential is never put in the unit file, in arguments visible in `ps`, or in the URL's query that the
  browser logs; the helper passes it so that it ends up in the page without being persisted (builder's call:
  URL fragment, or a one-time code exchanged for a cookie).

## Starting it on the board's machine

### Setting and button

- Per board: `bigScreen: off | auto | manual`, default `off`, stored on the board, changed in the Boards
  section (`BoardsSection.svelte`) by the owner only (shared users cannot change it).
- **Start big screen / Stop big screen** button in the board controls, below the existing controls, in a
  colour that stands out. Its label and state follow the real state ("starting…", "running", "not
  installed"). Visible only for boards whose setting is not `off`. Only the owner may press it for now
  (grantees may be added with the shared-board permission work).
- `off`: nothing runs and no button. `manual`: runs only between a Start and a Stop. `auto`: the screen opens
  once each time the user-session helper starts (a desktop login) with the bridge connected, not when a
  game starts, and Stop stops it until the next restart of the helper or the next Start.
- **Closed by hand:** if someone closes the browser window at the board machine, that is respected in every
  mode. It stays closed until a Start press (in `auto` too).

### The user-session helper

The bridge installs as a hardened system service (systemd with `DynamicUser`, a launchd daemon, a Windows
service under `LocalService`). Such a service cannot open a window on the logged-in user's screen: it has no
access to the display socket, no usable home, and on macOS and Windows runs outside the desktop session. So:

- A new subcommand of the same binary, `bridge monitor` (name is the builder's call), runs **in the logged-in
  desktop user's session**: a `systemd --user` unit on Linux (or desktop autostart where there is no user
  manager), a LaunchAgent on macOS, a per-user logon task on Windows. It restarts on failure.
- It is the only thing that opens the browser. It talks to the bridge service over a local channel (loopback
  or a socket both can reach; the builder designs it, and must not make it a way for other local users to
  start or read anything sensitive: it carries commands from the service to the helper and status back).
- It assumes an **already logged-in desktop session** (auto-login on a Pi). No attempt to log in or wake a
  display.
- **Browser choice:** it cannot force "default browser in fullscreen" (a plain open can't hide chrome). It
  tries, in order, an installed Chromium or Chrome (`--kiosk`, with `--app` style flags as needed), then
  Firefox (`--kiosk`), then falls back to the default browser opened normally (the user presses F11). It uses
  its own browser profile directory so the user's normal browser state is untouched.
- Exits and restarts: when the helper's binary is replaced by a bridge self-update, it notices (version
  mismatch with the bridge) and exits, and its restart policy brings it back on the new version.
- Status the bridge reports to the backend (so the button can reflect it): helper connected or not, browser
  running or not, which browser.

### Install and update

- The install command (`scripts/install-bridge.sh` / `.ps1`, the `bridge install` subcommand) also registers
  the user-session helper for the invoking desktop user (the user who ran it, even through `sudo`). The
  install dialog (`lib/bridgeInstall.ts`) mentions big screen.
- The bridge's **self-update replaces only the binary** (`internal/update.Apply`); it does not rewrite the
  systemd unit, launchd job or Windows service. So existing installs **re-run the install command once** to
  get the helper. The UI says so when a board with a monitor setting has no helper ("Re-run the install
  command on this machine to enable big screen"). Teaching `apply-update` to register the helper itself
  (Linux runs it as root) is a possible later improvement, not part of this work.
- A machine without a desktop session (headless server): the helper is not installed or stays down; the board
  shows "not installed", nothing else is affected.

## Decided (by the user)

- The page is called **Big screen** (user-facing "Big screen", `#/big-screen/<board>`).
- Per board `off | auto | manual`; a Start/Stop button below the board controls, in a standing-out colour.
- The helper is a separate user-session piece, not the hardened service; fine to install separately.
- Existing installs re-run the install command once; the update does not need to register it.
- Closing the browser by hand is respected; only a button press brings it back.
- Choosing a specific kiosk browser (Chromium/Chrome, then Firefox, then default) is fine.
- The finished game's result is shown for 1 minute, cut short if a new game starts. The lobby closing is ignored.
- Sounds and caller follow the user's existing settings; no big-screen-specific options for now.
- Minigolf keeps the normal play-mode screen with the 3D course filling most of the screen; no minigolf
  big-screen design.
- A big screen can also be opened from the normal app, in the current browser, from the board screen and the
  game settings.
- The idle screen's last-game/highlight blocks are out of the MVP. Other games' designs come later and are
  not blocked on.

## My calls (check these)

- The page is view-only and the credential is read-only and board-scoped.
- "The board's game" is the active game with a seat on that board; a lobby that only waits does not count;
  a bull off does.
- Games without a design fall back to the normal match screen, full-viewport and non-interactive.
- Aborted/invalidated games drop to idle immediately rather than being held.
- The setting and Start/Stop are owner-only (the same `ownBoard` check).
- The browser runs with its own profile directory.
- The backend mints the credential and sends it to the bridge, rather than the helper reading anything from
  the bridge's state dir.
- Orientation picks itself from the viewport; no setting.
- On the board's machine, sounds and caller use the board owner's saved settings.
- **Fallback screens and the credential:** the credential stays follow-the-board only. The fallback match
  screen must render from the snapshot alone (no `/api/me`, preferences or caller calls): a "no session /
  non-interactive" mode of the match screen with the board owner's settings delivered by the follow-board data (display defaults where none apply). If a
  piece of the match screen turns out to need a flag value, the credential may read the OFREP flag
  endpoint, nothing more. Building minimal big-screen views for every game now is not required.
- **Which game when several qualify:** the most recently started active game with a seat on the board wins.
  There is no "current game for a board" notion today, so the follow-board lookup defines it (the
  database already allows several active games per board through remote seats; one active game per owner).
- **Held result:** derived from existing data, no new table: the latest finished game with a seat on the
  board, shown while `finished_at` is less than 1 minute ago and no newer game is active on the board
  (`game_sessions.finished_at`; the lobby is not consulted). Because it is computed from the timestamp, it
  survives a kiosk reload and the countdown is the same on every screen. (Narrowed in the plan: the finished
  game is read from the engine's memory, so a backend restart inside the minute shows idle.)
- **Board sharing is not merged yet** (its spec and plan are still drafts). Build owner-only now, and write
  the permission checks in one place so grantees can be added by that work. Nothing here waits for it.
- **Credential lifetime:** a long-lived credential stored hashed like board tokens, no hard expiry, revoked
  on Stop, board deletion and unpairing (and when the owner turns the setting to `off`). A short-lived token
  would break unattended recovery after a long outage.

## Left to the builder

- The browser-gateway shape for following a board (new endpoint or new message on the existing one).
- Credential format and renewal; how it reaches the page without being logged or persisted.
- The local channel between the bridge service and the helper, and per-OS helper registration details.
- Exact `--kiosk` flags per browser and how to detect "browser was closed by the user".
- Layouts for 3, 5+ players and teams from the existing X01 layouts.
- Migration for the per-board setting, API (`schema/api-v1.yaml`) and bridge message
  (`schema/adbridge-v1.json`) additions, generated types, feature flag. Suggest `bigscreen.enabled`,
  default on for admins until the other games have designs.
- Tests and the e2e coverage the repo's conventions require.
