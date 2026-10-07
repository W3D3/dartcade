# Friends: design

Friends and their live status, as designed in the Dartcade Platform Design canvas
(`Friends.dc.html`, `Friends-Phone.dc.html`, `Tablet-Friends.dc.html`, `User-Badge.dc.html`, the
lobby's "Friends:" quick-add in `Lobby.dc.html` / `Lobby-Host-Phone.dc.html` / `Tablet-Lobby.dc.html`).
Tracked as issue #54. Agreed with the user on 2026-10-04; breaking changes are fine.

## Scope

- **In:** unique names (the handle), friend requests, the Friends page on phone / tablet / desktop,
  the Friends nav item and its badge, online status with Invisible, the lobby's friends-first add
  and quick-add, and a new lobby access setting (Friends / Invite only).
- **Later:** the player chip and profile card with stats ("View profile"), avatar photos, blocking.

## Names are unique

- `user.name` is the handle: unique ignoring case (unique index on `lower(name)`), 2–20
  characters, letters (Unicode letters, so umlauts work), digits, `.`, `_` and `-`; no spaces.
  Shown as `@name` wherever the designs show a handle; display stays the name itself.
- Sign-up and Settings have a Name field that checks availability while typing
  (`GET /api/users/name-available?name=`: `{ available, reason? }` with reasons `taken`,
  `invalid`). Changing it is `PATCH /api/me { name }`.
- **Migration:** existing names that are duplicates (all but the oldest of each group) or break the
  rules are flagged (`user.name_needs_change = true`); the index covers the rest. A flagged user
  gets a one-time **"Pick your name"** screen after sign-in (a suggestion filled in: the name
  cleaned to the allowed characters, made unique with a number), and can't use the app until it's
  done. No fallbacks for old names.

## Friend requests

- Table `friendships`: `id`, `requester_id`, `addressee_id`, `status` (`pending` | `accepted`),
  `created_at`, `responded_at`; one row per unordered pair (unique on
  `least(requester, addressee), greatest(...)`).
- `POST /api/friends/requests { name }` (exact name, case-insensitive): errors for yourself, an
  unknown name, an existing friendship or a pending request in either direction — except that a
  request to someone who already asked you **accepts** theirs.
- `POST /api/friends/requests/{id}/accept`, `.../decline` (addressee only; decline deletes the row
  silently — the sender just sees it disappear from "Sent", and may ask again), `DELETE
  /api/friends/requests/{id}` (requester cancels), `DELETE /api/friends/{userId}` (either side
  removes the friendship).
- `GET /api/friends`: friends (id, name, status, see below, `friendsSince`), incoming requests
  (id, from, `mutualFriends` count, `createdAt`), outgoing requests (id, to, `createdAt`).

## Online status

- **Online** = at least one open `/ws/me` socket (every signed-in page holds one). Counted in
  memory in the backend (one process, as today). Going offline waits a **30 s grace** so reloads
  and short drops don't flicker.
- What a friend sees, first match wins:
  1. `playing`: seated in a running game session — with the game id (e.g. "Playing X01").
  2. `lobby`: member of an open lobby — with the lobby's name and id, and `joinable: true` when
     that lobby's access is Friends and its host is this viewer's friend.
  3. `online`.
  4. `offline`.
- **Invisible** (`user.invisible`, `PATCH /api/me { invisible }`, chosen in the account menu as
  Online / Invisible): friends see `offline` and nothing about lobbies or games. Lobby members,
  invites and games are unaffected (the design's copy).
- Only accepted friends see status; nobody else.
- **Live:** `/ws/me` (`schema/lobby-ws-v1.json`) gains a `friends` message with the same shape as
  `GET /api/friends`, sent on connect and again to exactly the users affected whenever a friend's
  status changes (online/offline after grace, lobby joined/left/closed, game started/ended,
  Invisible toggled, a lobby's access changed) or a request is sent / answered / cancelled, or a
  friendship removed. Debounce bursts per user (~250 ms).

## Lobby access

- New lobby setting `access`: `friends` (default for new lobbies; `invite`, labelled Private, since
  2026-10-08, see `2026-10-08-visible-lobby-design.md`) | `invite`. Host-only change in
  the lobby's settings; pushed to members like other settings.
- `friends`: the host's friends see the lobby in the host's status ("In a lobby · Join") and can
  join without a code: `POST /api/lobbies/{id}/join` with no code is allowed iff access is
  `friends` and the caller is the host's friend; otherwise 403. Seats/limits as for a code join.
- `invite`: today's behaviour (code, link, invites).
- Code, link and invites keep working under both.

## Screens

- **Friends page** (`#/friends`), per the artboards on each size:
  - Tabs All / Online / Requests (with count).
  - Friend rows: name + `@name`, status line coloured by kind ("Online", "In Friday darts · Join",
    "Playing X01", "Offline"), "In your lobby" pill, **Invite to lobby** (when you're in a lobby
    they aren't; becomes "Invited") or **Join** (joinable lobby), ⋯ menu with **Remove friend**
    (confirm). No View profile yet.
  - Requests: "Requests for you" (Accept / Decline, "N friends in common", time) and "Sent by you"
    (Cancel, time).
  - "Add a friend" field: name → Send request; results "✓ Request sent to @name", "No player
    called …", "You're already friends", "Request already sent", "They asked you first — you're
    friends now".
  - Empty states as designed.
- **Navigation:** a Friends item with a badge (incoming requests) in the desktop sidebar, the
  tablet rail and on phones (where `Friends-Phone` puts it).
- **Account menu** (per `User-Badge`): Online / Invisible control with the design's copy.
- **Lobby:** the add field lists friends first as one-tap "Friends: + name" chips (online first,
  with status), then anyone by exact name; the Friends / Invite only setting.
- **Settings:** Name field with the availability check. **Sign-up:** the same check.
- **Pick your name:** a one-time screen for flagged users.

## Testing

- Backend: name rules, availability, the migration flagging duplicates/invalid; request rules
  (self, unknown, duplicate both directions, crossing requests accept, decline, cancel, remove);
  status priority and Invisible; the 30 s grace (fake timers); pushes reach only affected users;
  friend join without a code (friend of host + friends access: ok; otherwise 403); access setting.
- Frontend: Friends page states, the badge, the add-friend results, the name field, the lobby
  quick-add.
- Browser: two users befriend each other, see each other's status change live (online, lobby,
  playing, invisible, offline after grace), and one joins the other's lobby from Friends.
