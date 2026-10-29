# Board sharing

## Intent

Boards are single-owner today: `boards.owner_user_id` is the only access
check, enforced by `findOwnBoard` (`backend/src/boards/own.ts`) and repeated
at every call site (`api/boards.ts`, `api/lights.ts`, `api/sessions.ts`,
`lobby/service.ts`'s `canSetBoard`/`ownFreeBoard`).

In practice several people share one physical board: a family member owns
the board and the hardware, but other family members visit and want to play
on it under their own account. Today that means borrowing the owner's
account on their device, opening a lobby, adding a bot, and sitting the
owner out every round — pure friction to work around the single-owner model.

Board sharing lets an owner grant a friend standing access to a board: the
friend can pick it like their own board when starting a session or lobby,
see its camera, and flip its lights on/off — without ever touching the
owner's account, and without the owner being drawn into every game.

## Goals

- An owner can share a board with one or more friends from their accepted
  friends list, each as an invite the friend must accept (mirrors the
  friend-request flow: `backend/src/friends/service.ts`, table shape in
  migration `014_friendships.sql`) — sharing is never silent or automatic,
  even between existing friends.
- Once accepted, the board appears for the friend in the same board
  list/picker used everywhere today (`GET /api/boards`, the `Lobby.svelte`
  board chip, `BoardsSection.svelte`), tagged with whose board it is (e.g.
  "Christoph's board"), not in a separate list.
- A friend with access can:
  - start a solo session or create/join a lobby targeting that board
  - view its camera — the cached stills the match screen and
    `BoardsSection` already poll (`GET /api/boards/:id/camera/:index`), the
    same feed any other watcher sees. **Not** the owner-only
    `.../camera/:index/live` route: that one is the raw board-setup/
    calibration feed and stays owner-only, unchanged — a friend playing a
    game never needs it.
  - toggle its lights fully on/off
- A friend with access can **not**:
  - rename or delete the board
  - install/update/re-pair the bridge
  - change light presets or manage light devices (scan/add/remove/blink)
  - manage who else has access to the board
- The owner can share one board with multiple friends at once (standing,
  concurrent access for all of them — not a single hand-off).
- The owner sees, per board, who currently has accepted access, and can
  revoke any one of them at any time.
- The friend sees pending invites to accept/decline in a new section on
  their own Boards page (not the existing lobby-invites page/`/ws/me`
  invites, which is a different, unrelated inbox).
- Revoking access stops the friend from taking further board-level actions
  (starting new sessions on it, toggling lights, opening the camera) and
  removes the board from their list. It does **not** reach into a session
  already in progress: `session/access.ts` already decides in-game
  authority by `session.ownerUserId`/seat `controllerUserId`, which is
  independent of the board's own `owner_user_id` — a game the friend is
  mid-way through keeps running exactly as it was.
- Unfriending the owner does **not** auto-revoke an already-accepted share.
  The friends-list requirement only gates sending the invite; once
  accepted, the share is its own standing grant the owner revokes
  explicitly, same as any other access grant.

## Non-goals

- No UI or support for the friend sub-sharing the board further, or for
  anything beyond the accepted-friends list (e.g. sharing by email/link to
  a non-friend).
- No change to how many games can run on a board at once — board
  exclusivity during an active session is an existing concern, unaffected
  by who may initiate the next one.
- No per-share customization of permissions (e.g. "this friend may toggle
  lights but not watch camera") — the permission set shared above is fixed
  for every share.
- No notification/push channel beyond what's needed to show the invite in
  the new Boards-page section (no email, no `/ws/me` fan-out requirement) —
  a plain poll/refetch on page load is enough.
- No nav badge for pending invites. Unlike lobby invites (`$me.invites`,
  `SideNav.svelte`'s red `NavBadge`), board-share invites are visible only
  by opening the Boards page — no new field needs to be added to `/ws/me`
  or any other global state for this feature.

## Anti-goals

- A friend being able to touch anything that reaches the bridge's install,
  update, or pairing flow, or rename/delete the board — those stay strictly
  owner-only, with zero softening of the existing `ownBoard`/`findOwnBoard`
  checks in `api/boards.ts`'s rename/delete routes or `api/pairing.ts`.
- A friend being able to change light presets or add/remove/scan light
  devices (`api/lights.ts`'s device CRUD and preset routes) — only the
  master on/off switch is shared.
- Revocation silently killing or corrupting a session the friend is
  actively playing.

## Constraints

- The bridge has no notion of users, owners, or friends at all — every
  board action is authorized entirely in the Fastify route handlers before
  `bridgeConnections.request`/`.send` is ever called with just a board id
  (confirmed: `backend/src/bridge-gw/connections.ts`). Board sharing is
  therefore a purely backend authorization change; nothing in `bridge/`
  needs to change.
- `session/access.ts`'s model already separates "who owns this session"
  from "who owns this board" — a friend who starts a session on a shared
  board becomes that session's `ownerUserId`/host the same way anyone
  starting a session does today, with zero changes needed there.

## Decided

- Invite-and-accept, initiated by the owner from the Boards page, scoped to
  their accepted friends list (reuse `areFriends`/`friendIdsOf` from
  `backend/src/db/friends.ts`).
- Shared board appears in the same list/picker as owned boards, tagged with
  the owner's name — not a separate "shared with me" area.
- Multiple concurrent friends per board.
- Owner sees and can revoke each grantee, per board, from the Boards page.
- Friend sees and accepts/declines pending invites in a new section on
  their own Boards page.
- Permission set is fixed: play (sessions/lobbies) + camera view + lights
  on/off only. No settings, no device/preset management, no delete/rename,
  no bridge install/update, no managing other people's access.
- Revocation is forward-only: it blocks future board-level actions and
  delists the board, but never reaches into a session already running.
  Access is (re)checked only at the moment a board is selected/assigned
  (`ownFreeBoard`, solo-session POST), matching how ordinary ownership
  already works today — there's no existing recheck at game start or
  rematch either, so a friend who already had the board selected on an
  open lobby before revocation can still run that lobby's rematch until
  they touch board selection again. My call, for consistency with current
  behavior rather than introducing a new recheck point just for shares.

## Left to the builder

- Schema for the share/invite relationship: a new table (e.g.
  `board_shares`: `id`, `board_id`, `owner_user_id`, `friend_user_id`,
  `status` pending/accepted, `created_at`, `responded_at`), unique on
  `(board_id, friend_user_id)` — unlike `friendships`, this relationship is
  asymmetric (one board owner, one friend), so the
  `LEAST`/`GREATEST` unique-index trick `friendships` uses doesn't apply
  directly.
- New service/API surface for the request/accept/decline/revoke flow,
  modeled on `backend/src/friends/service.ts` + `api/friends.ts`'s shape
  (one resource, actions as sub-paths) — exact routes and payload shapes are
  the builder's call.
- Extending `GET /api/boards` (and the generated `Board` schema in
  `schema/api-v1.yaml`) to include boards shared with the caller, each
  tagged with the owner's display name, alongside boards they own.
- A new query alongside `getBoardsByOwner` (`backend/src/db/queries.ts`) to
  fetch boards accessible via an accepted share, and a shared-access
  counterpart to `findOwnBoard` (`backend/src/boards/own.ts`) that the
  choke points below can call instead of/alongside the owner-only check:
  - `api/sessions.ts`'s `POST /api/sessions` (`findOwnBoard` call)
  - `lobby/service.ts`'s `ownFreeBoard` and `boardChange`/`rules.ts`'s
    `canSetBoard` (both server-side and its frontend mirror in
    `backend/frontend/src/lib/lobby/rules.ts`)
  - `api/lights.ts`'s master on/off route only (`PUT /api/boards/:id/lights`
    for the `enabled` field) — every other lights route there
    (devices/scan/probe/blink/test, presets) stays owner-only, unchanged.
- Frontend: the "shared by X" tag on `BoardCard`, a pending-invites section
  and a per-board "who has access" + revoke list in
  `backend/frontend/src/lib/components/boards/BoardsSection.svelte`, and
  merging shared boards into `Lobby.svelte`'s `ownBoards`/`boardChoices`
  (`backend/frontend/src/lib/lobby/rules.ts`) so a shared board can be
  picked for a seat exactly like an owned one.
- Exact wording/UX of the invite action on the owner's side (e.g. picking a
  friend from a list already filtered to `friendIdsOf`) is the builder's
  call, following the existing friend-request UI pattern for consistency
  without reusing its page.
