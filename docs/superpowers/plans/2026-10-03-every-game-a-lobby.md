# Every game is a lobby: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the separate local "New game" flow. Every game runs in a lobby; playing alone feels like the old New game until a second account joins.

**Architecture:** The backend decides whether a lobby is solo (one member account) and sends `solo` (and `nextHostName`) with the lobby state and the summary; the screens only read those flags and never count players. It also counts the starter's own rows as ready, closes your solo lobby when you join another, and stops accepting `@account` seats on `POST /api/sessions`. The Play page always works in your lobby (opening one if needed) and edits the players inline while solo; the indicator, lobby page and leave flow adapt to solo.

**Tech Stack:** Fastify + Kysely + Postgres, Svelte 5 runes + Tailwind v4, vitest, zod/TS generated from `schema/` (`npm run gen:api`).

**Spec:** `docs/superpowers/specs/2026-10-02-online-multiplayer-design.md`, section "Every game is a lobby (decided 2026-10-03)". Builds on plan `2026-10-03-lobby-screens.md` (same branch).

## Global Constraints

- Generated files change only through `npm run gen:api` at the repo root; never edit them by hand.
- No TypeScript casts in non-test code. `svelte-check` 0 errors and 0 warnings; `npm run lint` exit code 0 (check `echo $?`).
- Copy says "manual entry", never "by hand". Codes show as `K7Q4-MD`.
- Components over markup: reuse the lobby components (`PeopleList`, `BoardChip`, `AddSomeone`, `PersonControls`, `SegmentedControl`, `Panel`, `Field`, `ErrorText`, kit `Button` variants) and extract new pieces rather than inline long markup.
- The board rule from plan 3 stays: menus list only your own boards plus Manual.
- **The server decides, the screens read.** Whether a lobby is solo and who would take over as host come from the server (`solo`, `nextHostName`); no frontend code counts members or players to decide what to show.
- Run npm with the node on PATH (mise's Node 22 isn't installed in the sandbox); never `npm install`.
- Backend DB tests: `TEST_DATABASE_URL=postgres://dartgames:dev@172.18.0.2:5432/dartcade_lb_test npm test` in `backend/`.

## Review Focus

1. **Opening Play with no lobby, twice at once** (two tabs, or a fast reload): exactly one lobby gets opened; the second `POST /api/lobbies` gets `in_lobby` and the page just uses that lobby. → Task 4.
2. **Joining by code while your solo lobby has a game running:** blocked with the running-game message, nothing closes. → Task 2 test.
3. **A solo host who invited someone:** the invite is pending, the lobby is still solo (no indicator) until they accept; accepting turns the lobby into a shared one live for both. → Task 1 test (`solo`), Task 5 and Task 8 verify.
4. **Starting with a guest you un-readied:** the starter's own guests count as ready, so a solo start never asks "Start anyway?". → Task 1 test.
5. **The Play page for a member of someone else's lobby** stays read-only (plan 3) and never opens a lobby of its own. → Task 4.

---

### Task 1: Solo lobbies on the server: `solo` and `nextHostName`, the starter is ready, no lobby name on solo games

**Files:**
- Modify: `schema/lobby-ws-v1.json` (`Lobby.solo`, `Lobby.nextHostName`, `LobbySummary.solo`), then `npm run gen:api`
- Modify: `backend/src/lobby/view.ts`, `backend/src/lobby/view.test.ts`
- Modify: `backend/src/lobby/startPlan.ts`, `backend/src/lobby/startPlan.test.ts`
- Modify: `backend/src/lobby/service.ts` (`launch`, and the `board_moved` activity data)
- Modify: `backend/frontend/src/lib/lobby/format.ts` `activityLine` and its test
- Modify (fixtures that build a full `LobbySummary`): `backend/src/lobby/hub.test.ts` and any other test the typecheck points at

**Interfaces:**
- Produces: `Lobby.solo: boolean` and `LobbySummary.solo: boolean` (true while one account is in the lobby; guests and pending invites don't count); `Lobby.nextHostName: string | null` (who becomes host if the host leaves, from `rules.nextHost`; null when nobody would); `planGame(lobby, game, { force, isBoardOnline, starterUserId })`.

- [ ] **Step 1: Failing tests.**
  - `view.test.ts`: a lobby with chris, lena and a guest has `solo: false` (snapshot and summary) and `nextHostName: 'Lena'`; chris with only a guest and a pending invite has `solo: true` and `nextHostName: null`.
  - `startPlan.test.ts`, new case:
    ```ts
    it('counts the starter and the rows they control as ready', () => {
      const notReady = lobby({ people: [{ ...chris, ready: false }, { ...guest, addedByUserId: 'chris', ready: false }, { ...lena, ready: false }] })
      const r = planGame(notReady, { ...all, personIds: ['c', 'g', 'l'] }, { ...online, starterUserId: 'chris' })
      expect(!r.ok && r.problem).toMatchObject({ code: 'not_ready', notReady: [{ personId: 'l', name: 'Lena' }] })
      const solo = planGame(lobby({ people: [{ ...chris, ready: false }, { ...guest, addedByUserId: 'chris', ready: false }] }), { ...all, personIds: ['c', 'g'] }, { ...online, starterUserId: 'chris' })
      expect(solo.ok).toBe(true)
    })
    ```
    Update the existing calls to pass `starterUserId: 'chris'` (the host in the fixture).
- [ ] **Step 2: Run them; watch them fail.** `cd backend && npx vitest run src/lobby/view.test.ts src/lobby/startPlan.test.ts`
- [ ] **Step 3: Implement.**
  - `schema/lobby-ws-v1.json`: add `"solo": { "type": "boolean", "description": "Only one account is in the lobby (guests and pending invites don't count). The screens keep the lobby out of the way while solo." }` to both `Lobby` and `LobbySummary` (and their `required`), and `"nextHostName": { "type": ["string", "null"], "description": "Who becomes host if the host leaves now; null when nobody would." }` to `Lobby`; `npm run gen:api` at the repo root.
  - `rules.ts` (server): `isSolo(lobby)`; `view.ts` sets `solo` in both and `nextHostName` from `rules.nextHost(lobby)?.name ?? null`.
  - `startPlan.ts`: `opts` gains `starterUserId: string`; the not-ready list skips people with `controllerOf(p) === opts.starterUserId` (import `controllerOf` from `./rules.js`). Update the doc comment.
  - `board_moved` activity data gains the moved person's `userId` (null for a guest; add it to the activity schema in `schema/lobby-ws-v1.json`). `activityLine` then says "You moved to …" when that `userId` is the actor, instead of comparing names (the final fix pass compared names). Test both, first.
  - `service.ts` `launch`: pass `starterUserId: hostUserId`; pass `lobbyName: memberIds(lobby).length > 1 ? lobby.name : null` (a solo lobby's games don't carry the lobby name; spec "History and the match screen").
- [ ] **Step 4: Run** the two files, then the whole backend suite with the DB, `npm run typecheck`, `npm run lint`; and in `backend/frontend` `npm run typecheck` (the generated type changed; fix fixtures that build a `LobbySummary`).
- [ ] **Step 5: Commit** `feat(lobby): solo lobbies: member count, the starter counts as ready`

### Task 2: Joining another lobby closes your solo one

**Files:**
- Modify: `backend/src/lobby/service.ts` (`addMember`), `backend/src/lobby/service.test.ts`

**Interfaces:**
- Consumes: `closeNow`, `rules.isMember`, `memberIds`, `this.deps.engine.getLobbySession`.

- [ ] **Step 1: Failing tests** in `service.test.ts` (follow the file's existing setup helpers):
  1. Luke is alone in his lobby with a guest; he joins Admin's lobby by code → he's in Admin's lobby, his old lobby is closed (`closedAt` set), his guest is gone with it, and his `/ws/me` push shows Admin's lobby.
  2. Same, by accepting an invite.
  3. Luke's lobby has another member (Phil) → joining Admin's lobby still answers `in_lobby` with Luke's lobby id; nothing closes.
  4. Luke is alone but his lobby has a game running → joining answers `in_lobby` (or the running-game conflict the code uses; assert the lobby stays open and Luke isn't added).
- [ ] **Step 2: Run; watch them fail.**
- [ ] **Step 3: Implement** in `addMember`: when `getOpenLobbyIdOfUser` returns another lobby, load it; if the user is its only member and `engine.getLobbySession(thatId)` is null, close it with `closeNow` inside that lobby's queue (use `this.enqueue(thatId, …)`; mind that `addMember` already runs in the target lobby's queue: don't await the other queue from inside a queue if that can deadlock with a symmetric join — if it can, close it with a direct DB close guarded by a re-check, and explain the choice in a comment). Otherwise throw `inLobby(open)` as today.
- [ ] **Step 4: Run** the backend suite with the DB, typecheck, lint.
- [ ] **Step 5: Commit** `feat(lobby): joining another lobby closes your solo lobby`

### Task 3: (folded into Task 1)

The screens read `solo` and `nextHostName` from the server (Task 1); there are no frontend helpers for them. Nothing to do here.

### Task 4: The Play page always plays in your lobby

**Files:**
- Modify: `backend/frontend/src/routes/CreateSession.svelte`
- Create: `backend/frontend/src/lib/components/lobby/SoloPlayers.svelte` (the inline players editor while solo)
- Possibly delete: components only the local flow used (`PlayerRow`, `BoardSelector`, `PlayWithFriends`) once nothing imports them — check with grep; keep any that another screen still uses.

**Interfaces:**
- Consumes: `me` (lobby summary with `solo`), `createLobby()` (final fix pass), `createLobbyStore` (lobby state with `solo`), `isHost`, `PeopleList`/`BoardChip`/`AddSomeone`/`PersonControls` (as fits), `LobbyPlayersCard` (plan 3), `startGame`, `StartAnywayConfirm`, `initialGameSelection`.
- Produces: no local mode left in `CreateSession.svelte`.

- [ ] **Step 1:** Read `CreateSession.svelte` as it is now (plan 3 Task 14, its fix round, and the final fix pass changed it).
- [ ] **Step 2: Open your lobby when there is none.** On mount (and when `/ws/me` says you have no lobby), call `createLobby()` once; an `in_lobby` answer means another tab won — just use `/ws/me`'s lobby. Never open a lobby for a member of someone else's lobby (they already have one).
- [ ] **Step 3: Remove the local mode:** the `@username` player search, the board selector, the local `start()` and `POST /api/sessions`; the page always starts through the lobby (`startInLobby`).
- [ ] **Step 4: Solo players card** (`SoloPlayers.svelte`, shown when `lobby.solo`): your row with its `BoardChip`, your guests (name, board chip, remove), `AddSomeone` (plain name → guest, `@username` → invite, as on the lobby page), the throw order (`SegmentedControl` lobby order / random / bull off, PATCH `throwOrder`; hide bull off where the game has none, using the helper from the final fix pass), and a "Manage" link to the lobby page. Pending invites show as "Invited · waiting for Phil". When `lobby.solo` is false, show `LobbyPlayersCard` as today. Don't count people to decide this.
- [ ] **Step 5: Checks:** `npm test`, typecheck 0/0, lint 0. (The controller does the browser pass: solo game on, guests, invite, a second account joining turns the card into the shared one.)
- [ ] **Step 6: Commit** `feat(frontend): the Play page always plays in your lobby`

### Task 5: Solo in the nav and on the lobby page; the host can leave

**Files:**
- Modify: `backend/frontend/src/lib/components/LobbyIndicator.svelte`, `LobbyStrip.svelte`
- Modify: `backend/frontend/src/routes/Lobby.svelte`, `backend/frontend/src/lib/components/lobby/LobbyHeader.svelte`
- Create: `backend/frontend/src/lib/components/lobby/LeaveLobbyConfirm.svelte` (or extend an existing confirm if it fits)

**Interfaces:**
- Consumes: `summary.solo`, `lobby.solo`, `lobby.nextHostName` (Task 1). No counting in the browser.

- [ ] **Step 1: Indicator:** the side nav card and the phone strip show only when `!$me.lobby.solo`. While solo, the side nav shows a small "Play with friends" card (one line and a link to `#/lobby`); the phone shows nothing extra.
- [ ] **Step 2: Lobby page while `lobby.solo`:** hide Close lobby and the history; lead with the code, link, QR code and the add field under a heading "Invite friends". The next-game card stays.
- [ ] **Step 3: The host can leave** when the lobby isn't solo: Leave next to Close (a small menu or a second button, whichever reads better at 390 px); the confirm says "<name> becomes host." using `lobby.nextHostName`. Members' Leave is unchanged.
- [ ] **Step 4: Checks:** `npm test`, typecheck 0/0, lint 0.
- [ ] **Step 5: Commit** `feat(frontend): solo lobbies stay out of the way; hosts can leave`

### Task 6: No more `@account` seats on `POST /api/sessions`

**Files:**
- Modify: `schema/api-v1.yaml` (`SeatRequest.userId` and the `players` description), then `npm run gen:api`
- Modify: `backend/src/api/sessions.ts`, `backend/src/api/sessions.test.ts`
- Modify: anything the typecheck flags in `backend/frontend` (Task 4 should have removed the last user)

- [ ] **Step 1:** Update `sessions.test.ts` first: drop the account-seat cases, add one that a `userId` on a player is refused with 400 (the schema's `additionalProperties: false` does it once the field is gone).
- [ ] **Step 2: Run; watch the new case fail.**
- [ ] **Step 3: Implement:** remove `userId` from `SeatRequest`, update the descriptions ("The first player is the signed-in user; the others are guests at the same board"), `npm run gen:api`, remove the accounts branch from `sessions.ts` (`engine.create` only).
- [ ] **Step 4:** Backend suite with the DB, typecheck, lint, `npm run lint:api` at the root; frontend typecheck and tests.
- [ ] **Step 5: Commit** `feat(api)!: new games no longer take other accounts as seats` with a body: "Other accounts join through a lobby invite or code."

### Task 7: Docs as built

**Files:**
- Modify: `README.md` (Lobbies move from "Coming next" into the features; describe playing alone, with guests, and with friends through a lobby; drop "Add an account with `@username`" as a seat)
- Modify: `ARCHITECTURE.md` ("Several players, several boards": games start from a lobby), `AGENTS.md` (Play page row if needed), `DEVELOPMENT.md` (the dev-login paragraph: "Start a game with `@Luke` as a player" becomes inviting `@Luke` to your lobby)
- Modify: the spec's "Every game is a lobby" section only if something was built differently (say what and why)

- [ ] **Step 1:** Read the code as built, then update the docs. Plain, short sentences.
- [ ] **Step 2: Commit** `docs: every game is a lobby`

### Task 8: Browser pass and screenshots (controller)

Folded into the lobby-screens plan's Task 16: the controller walks solo play (open Play with no lobby, add a guest, Game on without a ready prompt), inviting a friend from Play, the second account joining (the card and the indicator switch to shared), joining someone else's lobby while solo (no question, the old lobby closes), and the host leaving. Screenshots add `play-solo-phone.png` and `play-solo-desktop.png`.

---

## Added 2026-10-03 13:24 (user): New game picks the game, the lobby holds the people; #67, #68, #69

Run Tasks 9–12 before Task 7 (docs) and Task 8 (browser pass). Same Global Constraints; the
server decides, the screens read.

### Task 9: New game picks the game; players only in the lobby

**Files:** `backend/frontend/src/routes/CreateSession.svelte`, `routes/Lobby.svelte`, the lobby
components it uses; delete `components/lobby/SoloPlayers.svelte` (and anything else only it used).

- [ ] **Play page:** game tiles (`GameModeTiles`) and settings (`GameSettings`) only; no players,
  no throw order, no board, no lobby socket for people. Main button:
  - not in a lobby → **Create lobby**: `createLobby()`, then PATCH `nextGame` with the chosen game
    and settings (`lobbyActions(id).updateLobby`), then go to `#/lobby`. An `in_lobby` answer means
    you have one: PATCH that one instead and go.
  - host of a lobby → **Continue in lobby**: PATCH `nextGame`, go to `#/lobby`. Start the editor
    from the lobby's `nextGame` (`initialGameSelection`), as today.
  - member of someone else's lobby → the planned game read-only (as today) and **Open lobby**.
  Read the lobby state from `/ws/me` (`$me.lobby`: id, `youHost`, `nextGame` if the summary has it;
  if the summary lacks what the editor needs, open the lobby store only for that, read-only).
- [ ] **Remove** the Play page's auto-open (the first-state flag, the 1.5 s "Start playing"
  fallback) and `SoloPlayers`; the Play page never opens a lobby by itself.
- [ ] **Lobby page while solo:** show the people list (`PeopleList` with the add field, board chips,
  remove) together with "Invite friends" (code, link, QR); still hide Close and the history.
- [ ] **Boards page "Play on this board":** keep it working: it now goes to New game as before;
  "Create lobby"/"Continue in lobby" puts your row on that board (`updatePerson`) before going to
  the lobby. Read how it's wired today (Task 4 moved your row once on the Play page).
- [ ] Tests for any pure helper (e.g. which main button: `playAction(meLobby)` →
  `'create' | 'continue' | 'open'`), test-first. Checks: frontend tests, typecheck 0/0, lint 0.
- [ ] **Commit** `feat(frontend): New game picks the game; players join in the lobby`

### Task 10: The QR code in a popover (#67)

**Files:** `components/lobby/JoinCodeCard.svelte`, `QrCode.svelte`, `PopoverMenu` (or a small
`Popover` primitive if PopoverMenu's menu semantics don't fit).

- [ ] The QR button opens the code in a popover anchored to the button (Escape and an outside click
  close it, focus returns to the button), sized for scanning across a room (about 240 px), with the
  join link written under it. The page doesn't move. Works on phone widths (the popover stays on
  screen).
- [ ] Checks as usual. **Commit** `feat(frontend): the lobby QR code opens in a popover` (body: `Closes #67`).

### Task 11: Invited people in the list (#68)

**Files:** `components/lobby/PeopleList.svelte`, `PersonRow.svelte` (or a small `InvitedRow.svelte`),
`schema/lobby-ws-v1.json` only if the snapshot lacks what the row needs.

- [ ] Each pending invite shows as a row after the people: avatar and name, greyed out, with a small
  pending spinner and "Invited". It turns into a member row when they accept and disappears when
  they decline or the invite ends (both come from the server's snapshot). Replaces the
  "Invited · waiting for …" line. No new client-side rules: render the snapshot's invites.
- [ ] Checks as usual. **Commit** `feat(frontend): invited people show in the lobby list` (body: `Closes #68`).

### Task 12: The server pushes your running game (#69)

**Files:** `schema/lobby-ws-v1.json` (`MeMessage`), `backend/src/lobby/service.ts` (`meMessage`, pushes),
the engine's start/end hooks as needed, `backend/frontend/src/lib/activeSession.ts`,
`lib/lobby/sockets.ts`, the banner (`components/SessionBanner.svelte`) and `TabBar`.

- [ ] **Server:** `MeMessage` gains `game: { sessionId, gameId, lobbyName } | null` (the user's
  active session, from the engine). Push `/ws/me` to every account seated in a session when it
  starts and when it ends (finished, aborted, forfeit), for lobby and non-lobby sessions. Tests
  first: a start pushes `game` to each seated account; an end pushes `game: null`.
- [ ] **Frontend:** `activeSessionId` (and the banner and Live tab) read `$me.game`; drop the
  one-time `GET /api/sessions` load and the manual `.refresh()` calls, or keep a load only as the
  initial value until `/ws/me` connects. The banner disappears the moment the game ends, on every
  device.
- [ ] Backend suite with the DB, frontend tests, typechecks, lint. **Commit**
  `feat: push your running game over /ws/me` (body: `Closes #69`).
