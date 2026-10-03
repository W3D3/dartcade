# Online multiplayer: design

Date: 2026-10-02
Issue: [#41 Multiplayer: invite other accounts into a game](https://github.com/W3D3/dartcade/issues/41)
Follow-ups: [#53 Matchmaking](https://github.com/W3D3/dartcade/issues/53),
[#54 Friends system](https://github.com/W3D3/dartcade/issues/54)

## Goal

Friends play one match together from different places. Each person throws on their own
Autodarts board, or enters darts by hand if they have none. People at the same board can
play too: anyone in the lobby can add guests at a board. Everyone sees the same live
game, and the result lands in every account holder's history.

This is the base for matchmaking (#53). Results must be tied to accounts, and only the
person who owns a seat can act for it.

## Decisions

- **Who plays:** friends with accounts. There are no strangers and no public lobbies.
  Matchmaking comes later on top of the same model.
- **Lobbies are private** and not tied to a game mode. A lobby lives across many games
  (rematch, then another mode, with the same people and boards).
- **Getting in:** a lobby code, link or QR code. In v1 the host can also invite by
  username into the invitee's pending invites. Username invites are replaced by friends
  in #54.
- **Seat control is strict.** Only a seat's controller can add, correct or undo darts or
  trigger a takeout for it. There is no host override.
- **Boards:** a board menu only ever lists *your own* boards (plus Manual where you may
  choose it).
  - **No board yet** (Manual): anyone can put that person on one of their own boards. This
    covers joining while you're at someone else's place: whoever owns the board there
    gives you theirs.
  - **Has a board:** only the person themselves (for a guest, the member who added them)
    changes it, to one of their own boards or Manual. The board's owner can also take it
    back, which sets the person to Manual.
  - A joiner starts on their most recently used board (Manual if they own none), a guest
    on their adder's board.
  - The host has no extra rights over boards.
- **Disconnects:** the game waits ("waiting for X"). A dead bridge falls back to manual
  entry for that seat. There is no forfeit timeout in v1; it's tracked in #53.
- **Ending a game early:**
  - The host **aborts**: the game ends with no result.
  - A member **abandons**: their seats forfeit and are placed last. The game ends and
    the others are ranked by their current standing. The result counts.
- **The local flow stays.** "New game" without a lobby works exactly as today: a single
  owner who controls everything, named seats, one board.

## Scope

In:

- Lobbies: create, join by code/link, invite by username, roster, guests, board
  assignment, a soft ready state, sitting out a single game, throw order, host handover,
  close.
- Live lobby updates over WebSocket, plus presence.
- Starting sessions from a lobby, with seats tied to a controller account and a board.
- Routing board events across several boards in one session.
- Checking each action against the seat it targets.
- Forfeit and abort.
- The lobby activity feed (joins, leaves, board moves, games played).
- Frontend: Lobby (host and member views), Join, lobby indicator, pending invites, and
  the remote states on the match screen.

Out:

- Linking a guest at the board to an account with confirmation on their phone ([#55](https://github.com/W3D3/dartcade/issues/55)). The
  canvas shows this ("Who's playing as Guest 1?").
- The forfeit timeout, ratings and matchmaking (#53).
- Friends (#54): the "Friends:" chips with online dots and "All friends" in the canvas.
  In v1 that slot holds the username search.
- Public lobbies, spectators who aren't in the lobby.
- Video or camera streams.

## Data model

Migration `009_lobbies.sql`. Lobbies are plain mutable rows. Only games keep an event
log.

### `lobbies`

| Column | Notes |
|---|---|
| `id UUID PK` | |
| `name TEXT` | Defaults to "<host name>'s lobby"; the host can rename it. |
| `host_user_id NULL` | FK user (null after the host's account is deleted; the next change hands over) |
| `code TEXT` | Unique among open lobbies. 6 characters from an unambiguous alphabet, shown as `K7Q4-MD`. The host can regenerate it. |
| `throw_order TEXT` | `lobby \| random \| bulloff`, default `lobby` |
| `next_game JSONB NULL` | `{ gameId, config }` as the host last set it |
| `last_game JSONB NULL` | `{ gameId, config, personIds }` of the last game started here; Rematch repeats it |
| `created_at` | |
| `closed_at NULL` | |

### `lobby_people`

One row per person in the lobby, member or guest, in lobby order.

| Column | Notes |
|---|---|
| `id UUID PK` | |
| `lobby_id` | FK lobbies |
| `user_id NULL` | Set for members. Null for a guest. |
| `added_by_user_id` | The member themselves; for a guest, the member who added them. This member becomes the seat's controller. |
| `name TEXT` | Account name for members, free text for guests |
| `board_id NULL` | FK boards. Null means manual entry. |
| `position INT` | Lobby order, which is the default throw order |
| `plays BOOL` | False means sitting out the next game. It resets to true after every game. |
| `ready BOOL` | Soft ready. It resets after every game: to false for members, to true for guests. |
| `board_moved_by NULL` | Who put them on the current board when it wasn't their own pick, for the "Moved by you" hint |
| `joined_at` | |

A unique index on `user_id` (where it isn't null) enforces **one open lobby per user**.
That works because rows only exist for open lobbies:
- When a member leaves, their row and their guests' rows are deleted.
- When a lobby closes, all its rows are deleted.

Games played in a lobby stay linked through `game_sessions.lobby_id`.

### `lobby_activity`

The feed in the lobby's "Lobby history" panel, newest first. Columns: `lobby_id`, `at`,
`kind`, `actor_user_id`, `data JSONB`. Kinds:
- `opened`
- `joined`
- `left`
- `removed`
- `guest_added`
- `board_moved` (who, from, to)
- `game_played` (session id, mode, summary, winner)
- `game_aborted`
- `host_changed`

The rows are deleted when the lobby closes.

### `lobby_invites`

`lobby_id`, `invitee_user_id`, `inviter_user_id`, `status` (`pending | accepted |
declined | expired`), `created_at`. Invites expire when the lobby closes.

Pending invites show in the lobby's people list as "Pending · Waiting for X to
confirm", after the joined people. They don't count as players until accepted.

### `game_sessions` (changed)

- **`lobby_id NULL`:** FK lobbies. Null for local games.
- **Owner:** for a lobby game, `owner_user_id` is the host at start.
- **Index:** `game_sessions_one_active_per_owner` is dropped. It's replaced by the
  per-user rule in [Active-session rules](#active-session-rules).
- **`board_db_id`:** stays for local games. It's null for lobby games, which use
  per-seat boards.

### `game_players` (changed)

- **`controller_user_id`:** who may act for the seat. For local games this is the owner,
  backfilled.
- **`board_db_id NULL`:** where the seat's darts come from. For local games it's
  backfilled from the session's board.
- **`forfeited BOOL DEFAULT false`.**
- **`user_id`:** as before. Set for members and null for guests.

### `game_session_events` (changed)

- `board_db_id NULL`: which board a `board` event came from. Recorded for inspection;
  replay doesn't read it back — only accepted events are logged, so replay stays
  deterministic without re-checking routing.

## Lobby lifecycle

1. **Create.** From the sidebar, "Create lobby" opens a new lobby with you as host on
   your most recently used board. If you're already in a lobby, you're asked to leave it
   first.
2. **Join.**
   - You join by code (`#/join` page), link (`#/join/K7Q4MD`), QR code, or by accepting
     an invite.
   - You must be signed in. Opening a join link while signed out goes through sign-in
     and back.
   - Joining while in another lobby asks you to leave that one first.
   - A joiner comes in with their most recently used board, or manual if they own none.
3. **Open.**
   - **Everyone:**
     - add guests at a board
     - pick their own board, and their guests' (one they own, or Manual)
     - give anyone without a board (Manual) one of their own boards
     - take their own board back from anyone on it (they go to Manual)
     - set ready and "I'm in" / "sitting out" for themselves and their guests
   - **Host only:**
     - reorder people
     - remove people
     - sit anyone out (the "Who plays" chips)
     - pick throw order and the next game: mode, plus settings edited in place in the
       next-game card. Changes reach everyone live.
     - start the game
   - **Nobody** sets someone else's ready, not even the host.
4. **In game.**
   - Start needs at least one playing seat and a config the module accepts (`validate`).
   - **Soft ready gate:**
     - The start button reads "Start · N players". The people list header shows
       "R of M ready".
     - If any playing person isn't ready, the host gets a confirmation ("Lena and Max
       aren't ready. Start anyway?") and can still start.
     - A hard gate would let one person who stepped away block the lobby, and v1 has no
       timeout to get past them.
   - Every playing person's board must be free and online; manual seats are always
     free.
   - The roster is copied into seats. While the game runs, the roster is frozen for that
     session, but people can still join or leave the lobby for the next game.
5. **Back to open.** The lobby returns to open when the game finishes, is aborted, or
   ends through a forfeit. When it does:
   - Everyone who sat out is back in, because sitting out lasts a single game.
   - Members' ready resets to false, and guests' ready resets to true.
   - A `game_played` or `game_aborted` line goes into the activity feed.
6. **Close.**
   - The lobby closes when the host closes it or the last member leaves.
   - It can't close while a game is running: the host aborts first.
   - Pending invites expire, and members get a "lobby closed" toast.

**Host handover.** If the host leaves, the member who has been in the lobby longest
becomes host. During a game, a member who leaves the lobby stays in the game's seats,
because leaving the lobby isn't abandoning. The game waits for them as with a
disconnect.

**Who is in a lobby.** A member counts as in a lobby while they have a lobby socket
open, so the roster can show them as Away. The lobby socket stays open while they play.

## Sessions from a lobby

### Seats

- **What a seat holds:** each playing person becomes a seat with `name`, `user_id`
  (members only), `controller_user_id` and `board_db_id`.
- **Order:**
  - **Lobby order:** as the lobby lists people.
  - **Random:** shuffled with the session's `rng_seed`, so it's deterministic.
  - **Bull-off:** the module is wrapped in `withBullOff` as today. Each player throws
    their bull on their own board, because bull-off is turn-based too. Once the bull
    off is decided (not a rethrow), the winner is the seat that's up, so the game's
    first visit is opened on the winner's board and the others' boards are ignored; a
    rethrow starts with whoever threw last, on their board.

### Routing board events

- **Indexing.** The engine's `byBoard` index maps every board used by an active session
  to that session.
- **Logging.** `onBridgeEvent(boardId, e)` finds the session. It logs and applies the
  event only if `boardId` is the board of the seat whose turn it is
  (`getCurrentPlayer`).
- **Out of turn.** Any other board's darts, takeout or resync are dropped before
  logging. Only a dropped dart (`dart.detected`) tells that board's people with a
  transient `notice` ("Not your turn"); a dropped takeout or other housekeeping event is
  silently ignored. Because only accepted events are in the log, a replay stays
  deterministic. `board_db_id` is still stored with each event, for inspection; replay
  doesn't read it back.
- **Turn changes** stay as today: a seat's turn ends on takeout. In a remote game, your
  turn ends when you pull your darts.
- **Status.** `board.status` from any board in the session updates that board's online
  status in the snapshot. As today, it isn't logged.

### Manual entry

The controller of a seat can always send `add_dart` and `takeout` for it, board or not.
This covers boardless players and a dead bridge without a separate mode. A visit that
mixes board and manual darts already works.

### Active-session rules

- **Boards:** a board is in at most one active session. The engine checks this at start,
  as it does for one board today.
- **Users:** a user controls seats in at most one active session, local or lobby.
- **Collisions:** starting a local game while your lobby game runs is refused, and the
  other way round.

## Access

### Opening a session socket

- **Local game:** the owner, as today.
- **Lobby game:** any person with a seat controller account in it, or any member of its
  lobby.
- **REST:** `GET /api/sessions/:id` follows the same rule.

### Actions

The engine takes the sender's user id with every action and resolves which seat it
targets.

| Action | Targets | Who may send it |
|---|---|---|
| `add_dart`, `undo_dart`, `takeout`, `correct_dart`, `bulloff_skip` | the current seat | its controller |
| `bulloff_start`, `bulloff_rethrow` | the match | the host (owner) |
| `forfeit` | all seats the sender controls | any controller in the game |
| game-specific actions | the match | the host (owner) |

- **Game-specific actions:** there's no `actionScope` hook; no current game action is
  per-seat, so unknown and game-specific actions are host only, same as the bull off's
  `bulloff_start`/`bulloff_rethrow`. `bulloff_skip` skips the current thrower, so it's
  per seat like the other turn actions.
- **Rejections:** a rejected action is answered with `{ type: 'error', code: 'forbidden'
  }` and isn't logged.
- **Local games:** the owner controls every seat, so nothing changes for them.
- **Abort** isn't a WS action: it's the existing `DELETE /api/sessions/:id` (host only,
  as today). See [Ending early](#ending-early).

## Ending early

### Abort (host)

- Abort is the existing `DELETE /api/sessions/:id` (host only), not a new WS action.
  Lobby games use it the same way local games do today: no placements, nothing counted
  toward stats. It now pushes a final snapshot with `status: 'aborted'` to every socket
  before dropping the session, so lobby members see the game end.
- **Local games:** "Abandon" in the canvas (`Play-Abandon`) means this abort and keeps
  its wording.

### Forfeit (member, labelled "Abandon" in lobby games)

- `forfeit` is a logged user event.
- **Seats:** all seats the sender controls (their own and their guests') are marked
  `forfeited`.
- **Status:** the session finishes with `status = 'finished'`.
- **Discarding the open visit:** a forfeit drops the visit in progress, the same way a
  `board.resync` does, and rolls its darts back out of the thrower's dart count. This can
  be a different seat than the one forfeiting (the forfeiter isn't necessarily up), and
  it means nothing half-thrown counts in stats.
- **Ranked by committed state:** placements come from the state before the open visit.
  A checkout dart that has been thrown but not yet taken out when someone forfeits is
  discarded with the open visit, so it doesn't win the game.
- **Placements:** there's no `standings` hook. `summarize` already ranks seats by
  standing when `winner` is null (`rankSeats`), so a forfeit reuses it:
  - X01: legs won, then lowest remaining score.
  - Around the Clock: most hits, then fewer darts.
  - Forfeited seats come last, tied; the rest keep the order `summarize` gave them.
- **Stats:** `summarize` must accept a game that isn't won yet. The engine takes the
  stats from it and replaces the placements.
- **Nobody left to lose to:** there's no "one controller wins" rule. Instead, a forfeit
  is rejected outright if the sender controls every seat that hasn't forfeited yet,
  because there'd be nobody left to rank ahead of them.

## Snapshots

New fields on the session snapshot (`schema/game-ws-v1.json`, then `npm run gen:api`).

**Per seat:**
- `controllerUserId`
- `boardId`, `boardName`
- `boardOnline`
- `controllerConnected`
- `disconnectedAt`: server time the controller's last socket of the game closed; null while
  they have it open, or if they haven't opened it since the server started
- `forfeited`

**Top level:**
- `ownerUserId` (the host)
- `lobbyName` (null for a local game; set by the lobbies plan)
- `lobbyId` (comes with lobbies, plans 2/3)
- `mySeats`: computed for each socket, so snapshots are now sent to each socket, not
  broadcast byte-for-byte.

**New server messages:**
- `notice` (`not_your_turn`, with `throwerName` and `throwerBoard`, the up seat's board
  name or null when they enter by hand; `board_offline` comes with lobbies and the
  frontend, plans 2/3)
- `error` (`forbidden`, `board_busy`, …)

### Lobby channel

A new lobby channel, `GET /ws/lobby?lobbyId=…`, follows the session channel's pattern
in `browser-gw/` with its own `LobbyConnections`. It pushes a full lobby snapshot on
every change:
- name, code
- host
- people, with presence and board
- throw order
- next game
- current session id
- pending invites
- the activity feed (latest 50)

Lobby changes go through REST (below). The socket only pushes; it doesn't take
commands.

## API

All under `requireAuth`. The schemas go in `schema/api-v1.yaml`.

| Endpoint | Purpose |
|---|---|
| `POST /api/lobbies` | create (host = me) |
| `GET /api/lobbies/current` | my open lobby, or 404 |
| `GET /api/lobby-codes/:code` | preview for the Join page: name, host, board names, people count |
| `POST /api/lobbies/:id/join` | body `{ code }` (invites are accepted with `POST /api/invites/:id/accept`) |
| `POST /api/lobbies/:id/leave` | |
| `PATCH /api/lobbies/:id` | host: name, throw order, next game, regenerate code |
| `POST /api/lobbies/:id/people` | add a guest `{ name, boardId? }` |
| `PATCH /api/lobbies/:id/people/:pid` | board, plays, ready, position (by permission, see Lifecycle) |
| `DELETE /api/lobbies/:id/people/:pid` | host removes anyone; a member removes their own guests |
| `POST /api/lobbies/:id/start` | host: creates the session and returns its id |
| `POST /api/lobbies/:id/rematch` | host: the last game again, same people and settings |
| `POST /api/lobbies/:id/close` | host |
| `GET /api/users?q=` | username search for invites (existing endpoint; removed by #54) |
| `POST /api/lobbies/:id/invites` | `{ userId }` |
| `GET /api/invites` | my pending invites |
| `POST /api/invites/:id/accept`, `/decline` | |

Live state: `GET /ws/lobby?lobbyId=` and `GET /ws/me`, messages in `schema/lobby-ws-v1.json`.

## Frontend

Screens follow the **Dartcade Platform Design** canvas:

| Screen | Canvas | Route / place |
|---|---|---|
| Lobby, host view | `Lobby.dc.html` | `#/lobby` |
| Lobby, member view (phone) | `Lobby-Phone.dc.html` | `#/lobby` |
| Join lobby | `Lobby-Join.dc.html` | `#/join`, `#/join/:code` |
| Lobby indicator | `Lobby-Indicator.dc.html` | sidebar, tablet rail, phone strip |
| Play page with lobby entry | `Play-InProgress`, `Play-Abandon` | `#/` (CreateSession.svelte) |

- **Lobby screen:**
  - a people table (Player, Board, Status) with board chips and "Moved by you · usually
    X"
  - a ready toggle for your own rows and read-only ready for others
  - a row menu for Move up/down and Remove
  - "Add someone: name or @username": a plain name adds a guest, an @username sends an
    invite
  - the next-game card with inline settings
  - "Who plays" chips
  - throw order selector
  - Start · N players
  - "Lobby history" (the activity feed)
- **Shared pieces:** the next-game card reuses the mode setup from `CreateSession.svelte`.
- **Phone member view:** `Lobby-Phone` still shows one combined "I'm in · ready" /
  "Sitting this one out" toggle. It needs a separate Ready button to match the host
  view.

### Designed since (canvas, 2026-10-02 afternoon)

`Lobby-Host-Phone`, `Lobby-Phone` (member, with a separate Ready), `Invites-Phone`,
`Match-Remote`, `Match-Remote-Waiting`, `Match-Remote-Manual`, `Mobile-Match-Manual`,
`Match-Toast`, `Mobile-Match-Toast`, `Match-Leave`, `Match-Leave-Member`,
`Mobile-Leave-Host`, `Mobile-Leave-Member`, `Match-End-Lobby`, `Match-End-Forfeit`,
`Match-End-Aborted`. Where they differ from this spec, "Update after the lobby designs"
below decides.

## Errors and edge cases

- **Wrong seat:** an action for a seat you don't control is rejected with `forbidden`.
  The UI shouldn't offer it.
- **Board busy:** a board in another active session is refused at assignment and again
  at start (`board_busy`).
- **Board offline at start:** start is refused with the names of the offline boards.
  The host can move those people to manual.
- **Bridge drops mid-game:** `boardOnline` turns false and the controller enters darts
  manually. When it reconnects, board darts count again.
- **Restart:**
  - Lobbies reload from the DB.
  - Sessions rebuild from the log, including `byBoard` for every seat's board.
  - Presence starts empty and fills as sockets reconnect.
- **Joining a full or closed lobby:** 404 for an unknown or closed code. There's no size
  limit in v1.
- **Deleting a board** that a lobby uses sets those people to manual. Deleting one used
  in a running game is refused (409), as today.
- **Account deletion:** the account's lobby rows cascade away. Seats keep their names,
  because `user_id` and `controller_user_id` are set to null.

## Testing

- **Engine unit tests:**
  - routing: the active seat's board is accepted; other boards are dropped and not
    logged
  - access per action and seat
  - forfeit placements, ranked by standing
  - a forfeit rejected when the sender controls every seat still in the game
  - abort
  - replay determinism with several boards
  - the local flow is unchanged
- **Module tests:** `summarize` on a game that isn't won, ranked by standing (X01 by legs
  then score, ATC by hits then darts).
- **API and DB tests:**
  - lobby lifecycle
  - ready and plays reset after a game
  - the soft-gate start with people who aren't ready
  - activity feed entries
  - code join, regenerating the code
  - invites
  - host handover
  - the one-open-lobby and one-active-session rules
  - board permissions: anyone gives a Manual person their own board; only the person (or
    a guest's adder) or the board's owner changes it after that; `board_busy`
  - start validation
- **E2E**, building on the e2e plan:
  - two browser contexts as two accounts, each with its own fake bridge
  - create, join by code, play a full X01 leg across both boards
  - a dart thrown out of turn is ignored
  - kill a bridge, continue manually
  - forfeit records a result
  - host abort records none

## Decided after review

- **Board assignment:** see Decisions → Boards. Anyone can put a person on a board they
  own, as long as that person hasn't picked a board themselves.
- **Wording:** in lobby games, the member action stays labelled **Abandon**. Its dialog
  states that it counts as a loss for your seats. The host action is **Abort game**, and
  local games keep `Play-Abandon` as designed.

## Update after the lobby designs (2026-10-02, 18:40)

The canvas gained the lobby, invite, remote-play, leave and end-of-game screens. Where
they differ from the sections above, this decides:

- **Boards:** as in Decisions → Boards (only your own boards in the menu). Where the
  canvas lets the host move anyone onto any board, it follows this rule instead. The
  "picked it myself" lock is gone.
- **Members on their phone** (`Lobby-Phone`): besides "I'm in" and Ready, they pick
  their own board, add guests and invite, as in Lobby lifecycle → Open. The canvas
  member view lacks these; they reuse the host view's patterns.
- **Sitting out** lasts a single game: everyone is back in after each game (the
  end-of-game screens' "I'm in stays as it was" is not followed).
- **Rematch** (`Match-End-*`): host only, the same players and settings, the same soft
  ready gate as Start, also after an abort. `POST /api/lobbies/:id/rematch`.
- **"At the board" vs "joined from phone":** not modelled. A member has an account, a
  guest sits at a member's board.
- **Forfeit ranking and the abandon preview** ("If you leave now", `Match-Leave-Member`)
  use the committed score (before the open visit), as built. The engine exposes the
  preview in the snapshot so the dialog shows the real outcome.
- **Host:** aborts; the host can't abandon. A host who leaves the lobby mid-game stays in
  the game; the host role passes on after it.
- **Aborted games** keep their row with `status = 'aborted'` and a new
  `aborted_by_user_id`, and the final snapshot carries the standings, so
  `Match-End-Aborted` can show them. History still hides aborted games.
- **Waiting and manual entry** (`Match-Remote-Waiting`, `Match-Remote-Manual`):
  - the controller of the seat that's up has no socket open → everyone sees
    "Waiting for Lena · disconnected 1:12" (the time from a server-side
    `disconnectedAt` per seat); only the host also gets Abort
  - the seat's board is offline → its controller enters darts by hand (keypad), the
    others see "Lena's board is offline"
- **Not your turn** (`Match-Toast`): the notice also names the thrower and their board
  (`throwerName`, `throwerBoard`). It goes to the controllers of the seats on the board
  the dart came from.
- **Lobby name in the match header** (`Match-Remote`): the snapshot gets `lobbyName`.
- **QR code:** the host's lobby shows a QR code of the join link; people scan it with the
  phone's camera (no in-app scanner).
- **Live per-user updates** (invite badge, lobby indicator with "you throw next · Leg 2"):
  a per-user socket, `GET /ws/me`, pushes the user's pending invites and their lobby
  summary.
- **New game inside a lobby** (`Play`, `Mobile-Play`): "Game on" starts the lobby game
  with the lobby's players; the players card ("From your lobby · Manage") opens the
  lobby. Outside a lobby, New game works as now (including `@` account players).

### Work split

1. **Match remote states** (frontend + small snapshot additions): board names, lobby
   name, waiting with `disconnectedAt`, manual entry when the board is offline, the
   richer not-your-turn toast.
2. **Backend lobbies:** migration, REST, lobby socket, `/ws/me`, invites, start and
   rematch, resets, activity feed, `lobby_id` on sessions.
3. **Frontend lobby screens:** Lobby (host desktop and phone, member phone), Join, the
   indicator, Invites with badge, the Play page's lobby card.
4. **Leave and end-of-game flows:** the Abort and Abandon dialogs (with the preview), the
   three result screens, Back to lobby and Rematch.

1 and 2 can run in parallel; 3 needs 2; 4 needs 2 and the engine's abort/preview changes.

### Match remote states, as built

- A game is **remote** when its seats have more than one controller or more than one board.
  Seat board lines, "Live from", the offline fallback and the header board pill apply only
  there; local games look as before.
- Waiting: `disconnectedAt` is null when the controller never opened the game since the
  server started; the card then says "Not connected yet". Waiting beats board offline.
- The timer counts from `disconnectedAt` with the browser clock, clamped at 0:00.
- Abort in the waiting card uses the existing end-game confirm (`DELETE /api/sessions/:id`)
  until plan 4's dialogs.
- Copy is gender-neutral: "Their score is kept. The game carries on as soon as Lena is back."
- Not your turn: the centre always shows the board; the toast lasts 6 s, the newest replaces
  it, and it can be dismissed.
- Placement of the waiting card: over the seat's panel in the duel layout, in the board's
  place in the party layout and on phones.
- The match starts on the keypad when none of the viewer's seats has a board; the Next
  button is "manual" when the up seat has no board or (remote) its board is offline.

## Decided while planning the lobby backend (2026-10-02)

1. **Migration number.** `008` is taken (`008_multiplayer_seats.sql`), so this is `009_lobbies.sql`.
2. **Codes.** 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no I, L, O, 0, 1). They're unique among *open* lobbies only (partial unique index), so closed lobbies keep theirs. Input is normalized: case and any non-alphanumeric characters (`K7Q4-MD`, `k7q4 md`) are ignored. The API returns the raw code; the client formats it.
3. **Rematch.** `lobbies.last_game` (JSONB `{ gameId, config, personIds }`) records each lobby game at start. A rematch repeats exactly that: the same people (minus anyone who left the lobby), mode and settings. It ignores the current "Who plays" flags and the next-game card. It works after a finished or an aborted game, with the same soft ready gate as Start.
4. **Soft ready gate.** Start and rematch answer `409 { code: 'not_ready', notReady: [{ personId, name }] }`. The client confirms by sending the same request with `{ "force": true }`. `force` only skips the ready check. Hard problems (unknown game, nobody plays, an offline board, a busy board, someone already in a game) are checked first and always refuse.
5. **Throw order.**
   - `bulloff` turns the game's own `bullOff` setting on: it keeps `wdc`/`pdc` if the host set one, otherwise `wdc`.
   - `lobby` and `random` force `bullOff: 'off'`.
   - A game without a bull off (ATC) refuses `bulloff` at start (400).
   - `random` shuffles the seats in the engine with the game's `rng_seed` (`createWithSeats({ shuffleSeats: true })`). Seats are stored in the shuffled order, so a replay needs nothing extra.
6. **Next game.** Stored as `{ gameId, config }` (the spec's "mode" is the API's `gameId`). It defaults to null, and Start then answers 400 "pick a game first". At start the config is merged over the module's `defaultConfig`.
7. **Ready** is a field of `PATCH /api/lobbies/:id/people/:pid`, next to `boardId`, `plays` and `position`. A PATCH is all-or-nothing: if one field isn't allowed, nothing is written.
8. **Invites.**
   - Any member may invite (the Update section lets members invite from their phone).
   - Inviting yourself is 400. Inviting a member or someone with a pending invite is 409.
   - `POST /api/lobbies/:id/join` takes only `{ code }`. An invite is accepted with `POST /api/invites/:id/accept`, which joins directly.
   - Accepting while in another lobby is `409 in_lobby`, and the invite stays pending.
   - Joining by code marks your pending invite to that lobby accepted.
9. **Leaving.** A member who leaves (or is removed) takes their guests along. People on the leaver's boards go to Manual. A left member's lobby sockets are closed with 4403.
10. **Host handover.**
    - If the host leaves between games, the member who joined longest ago becomes host (ties: lobby order), with a `host_changed` line.
    - If the host leaves during a game, `host_user_id` stays until the game ends; then the role passes on.
    - A lobby whose last member leaves during a game stays open (empty) until the game ends, then closes.
    - `host_user_id` is nullable (`ON DELETE SET NULL`, for account deletion). The next change to the lobby hands over.
11. **Board changes.**
    - `board_moved_by` is set when someone other than the person (or the guest's adder) puts them on a board. It's cleared on any change made by the person themselves and on any move to Manual.
    - Every board change, including take-backs, logs `board_moved`.
    - "Busy" at assignment means the board is in an active game that isn't this lobby's own.
12. **Activity data** stores names at write time (`data.name`, board names, `winnerName`, `players`), so the feed still reads right after people leave. `game_played` has no actor. `game_aborted`'s actor is whoever aborted.
13. **Where the lobby schema lives.** `schema/lobby-ws-v1.json` is a new draft-07 schema for both push sockets. It isn't in `game-ws-v1.json` for three reasons:
    - Lobby messages aren't game messages.
    - The match-remote plan edits `game-ws-v1.json` in parallel.
    - The full lobby needs nullable fields (`type: [string, null]`), which `common-v1.json` can't hold (it must stay valid OpenAPI 3.0).

    REST answers with small shapes (`LobbyRef`, `LobbyPreview`, `Invite`) in `api-v1.yaml`, the same way `SessionDetail.game` points at `game-ws-v1.json`. The full lobby only comes over the socket. `PendingInvite` (socket) and `Invite` (REST) are the same shape, built by one function (`inviteView`).
14. **`/ws/me` summary.**
    - `youThrowNext`: the viewer controls the seat that's up now in the lobby's running game.
    - `leg`: 0-based, from the module's `getLeg`; null for games without legs.
    - A message equal to the last one sent to that user isn't sent again. Game snapshots trigger a check after every dart.
15. **Presence.** A member is `online` while they have at least one lobby socket open, otherwise `away`. Guests have `presence: null`.
16. **Watching lobby games.** Members of the game's lobby may open its socket and `GET /api/sessions/:id`, besides the host and seat controllers. `GET /api/sessions` (my sessions) is unchanged.
17. **Lobby name in the match header.** It's taken at start, so a rename shows from the next game. After a server restart, a running game shows the lobby's current name.
18. **User search** reuses the existing `GET /api/users?q=` (the spec's `/api/users/search` isn't added).
19. **Snapshot `lobbyId`.** It's added now (the spec lists it under "comes with lobbies").

## Lobby screens, as built (plan 3, 2026-10-03)

- **Routes:** `#/lobby` (your lobby, or Create/Join), `#/join` and `#/join/:code` (the join
  link and the QR code open the latter), `#/invites`.
- **Live state:** the lobby page listens on `/ws/lobby`. The whole app keeps one `/ws/me` while
  you're signed in, for the indicator (desktop side nav card, phone strip above the tab bar) and
  the invite badge (phone Play tab; desktop "Invites" link). The summary says whether you're the
  host (`youHost`).
- **Controls:** the screens show only what the server would accept (`lib/lobby/rules.ts`
  mirrors `backend/src/lobby/rules.ts`). The board menu lists Manual and your own boards.
- **Who plays:** the host sits people out with the chips on the next-game card; everyone switches
  "In" / "Sits out" and Ready on their own rows (you and your guests).
- **Inline settings:** X01 only (start score 301/501/701, check-out, first to); "Change game"
  opens the Play page, where the host's "Game on" saves the next game and starts it. Members
  see "<host> starts the game" there.
- **Starting:** whoever has a seat goes to the game when it starts; a "Game running" bar leads
  back. A start with people not ready asks "Start anyway?".
- **Lobby closed or left:** the lobby page says so (no toast); the indicator just disappears.
- **Invites:** show the lobby, who invited you and when (the API has no boards or people for an
  invite). Accepting or joining while in another lobby asks to leave it first.
- **Not built:** the tablet rail (no tablet layout), friends chips (#54), an in-app QR scanner.
