# Visible lobby: design

Follows "Every game is a lobby" in `2026-10-02-online-multiplayer-design.md` and changes how a
lobby with one account (a _solo_ lobby) is shown.

## Problem

Every game runs in a lobby, and while you're its only account the screens hide it: no side-nav
card, no code on the Play page, no lobby name on the match screen. But the lobby is real and
open. It has a code, it can have pending invites, and with the default access (`friends`) your
friends can join it without the code, all without you seeing it. Meanwhile the Play page says
"Continue in lobby" and the win screen "Back to lobby", pointing at something the UI pretends
isn't there.

## Decisions

- **The lobby is always visible.** No separate local lobby type: that would bring back the two
  concepts "every game is a lobby" removed, and would need a way to open it up anyway.
- **New lobbies are Private.** "Private" is the existing `invite` access under a new label. A
  private lobby you invite nobody to is your local lobby; whoever you invite or give the code to
  can join. The schema value stays `invite`.
- **The Play page's button is "Choose players"**, whether or not you have a lobby yet. It names
  the next step (the Play page picks the game, the lobby picks the people) instead of the place.
- **The win screen gets Rematch** for the host. It's a shortcut over the lobby's Start, not the
  server-side rematch removed on 2026-10-03 ("One Start, no Rematch"): no endpoint, no stored
  last game. After a game the lobby keeps its next game and people, so starting it again is the
  rematch.
- **A lobby with one account closes after 6 hours without activity.** Your guests and bots from
  tonight are offered tomorrow neither by a stale lobby nor by surprise.

## Lobby visibility

- **Side nav card** (`LobbyIndicator.svelte`) and the phone strip always show your lobby: tag,
  name, people line, and the way back into a running game. The solo "Play with friends" card goes
  away. With no lobby: Create lobby / Join a lobby, as now.
- **Lobby page** (`Lobby.svelte`): the code, link, QR code and activity feed show for solo lobbies
  too. `solo` still exists, but only shapes the page: while solo the invite panel sits prominently
  next to the people list, and **ready states are hidden** (no ready dots on rows, no Ready
  control): every row is yours or your guests' and bots', and the server already skips the ready
  check for rows the starter controls, so ready means nothing there. They appear as soon as a
  second account joins. Close is offered to the host of a solo lobby too. Leave stays hidden while
  solo (there's nobody to hand the lobby to).
- **Match screen and history** show the lobby name for solo games as well: `launch` passes
  `lobbyName: lobby.name` always (today it's `null` while solo). Old games keep their stored null.
- `solo`'s description in `schema/lobby-ws-v1.json` changes from "the screens keep the lobby out
  of the way" to "only one account: the screens give the invite panel more room and hide ready
  states".

## Private by default

- Migration `018`: `ALTER TABLE lobbies ALTER COLUMN access SET DEFAULT 'invite'`. Open lobbies
  keep their setting. `create` doesn't pass `access`, so new lobbies pick up the default.
- Labels: the lobby's access control reads **Friends** / **Private**, Private's hint "Only people
  you invite or give the code to". Every UI string saying "Invite only" changes.
- `2026-10-04-friends-design.md` ("Lobby access") gets a note: the default is now `invite`.

## Play page

`playAction` (`lib/lobby/play.ts`) keeps its three cases; the labels change:

| You                                                    | Primary                                                | Secondary     |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------- |
| No lobby                                               | **Choose players** (creates one with the picked game)  | —             |
| Host, no game running, you're the lobby's only account | **Choose players** (saves the picked game, goes there) | **New lobby** |
| Host, others in it or a game running                   | **Choose players**                                     | —             |
| Member of someone else's lobby                         | **Open lobby**                                         | —             |

- **New lobby** closes your lobby (`POST /api/lobbies/{id}/close`, host only, refused while a game
  runs) and creates a fresh one with the picked game, then goes there. Your guests and bots go
  with the old lobby; the new one has you on your usual board. Offered only while you're the
  lobby's only account, so it never strands anyone and needs no confirm.
- Both buttons carry the "Play on this board" board choice as today (`lobbyPath`).

## Win screen

`WinScreen.svelte` takes a primary and an optional secondary action instead of `doneLabel`.
What the viewer gets (`winActions(snapshot, userId)` next to `afterGameRoute` in
`lib/endControl.ts`):

| Viewer                      | Primary           | Secondary         |
| --------------------------- | ----------------- | ----------------- |
| Host of a lobby game        | **Rematch**       | **Back to lobby** |
| Anyone else in a lobby game | **Back to lobby** | —                 |
| A game outside a lobby      | **Back to Play**  | —                 |

History stays as it is.

**Rematch:**

1. End the game: `DELETE /api/sessions/{id}`, as Back to lobby does today. The engine's ended
   hook enqueues the lobby's reset before the DELETE returns, so anything the lobby does next runs
   after the reset.
2. If the lobby is solo (`$me.lobby.solo`): `POST /api/lobbies/{id}/start` (no `force`). On
   success go to the new match (`#/session/{id}`). On a refusal (a board offline, someone's game
   running) go to the lobby, which shows the refusal in its start-problem dialog as if Start had
   been pressed there.
3. Otherwise: mark yourself ready (`PATCH /api/lobbies/{id}/people/{personId}`, `ready: true`) and go to the lobby, where
   the others see you ready and the usual ready check runs when you press Start.

The rematch keeps the game, settings, people and throw order the lobby has after its reset; with
Bull off on, the rematch bulls off again. It doesn't swap who throws first.

## Idle close

- `LobbyService.closeIdleLobbies(now)`: finds open lobbies with exactly one account
  (`isSolo`), no running game (`engine.getLobbySession`), and whose last activity is more than 6
  hours before `now`. Last activity: the newest `lobby_activity.at`, else `lobbies.created_at`.
  Each one closes through its own queue with the same checks re-run inside it (like
  `closeIfSoloAndIdle`), so a lobby that someone joined or started a game in meanwhile stays.
- `index.ts` runs it every 5 minutes (`setInterval`, cleared on shutdown); failures are logged
  and retried on the next tick.
- Closing pushes `/ws/me` as any close does, so an open Play page falls back to "Choose players".
- The lobby query is one SQL statement (`db/lobbies.ts`, `idleSoloLobbyIds(db, before)`);
  the 6 h is a constant in the service (`SOLO_IDLE_MS`).

Activity rows are written for joins, leaves, guests added, board changes and games played,
not for setting changes. Changing only the next game's settings doesn't keep a lobby alive;
that's fine, as playing a game does.

## Errors and edge cases

- **Rematch after someone else already ended the game:** the DELETE returns 404; carry on with
  step 2/3 (the reset ran anyway).
- **Rematch when the lobby closed meanwhile** (idle close can't hit a lobby with a running game,
  but the host may have closed it in another tab): `start` 404s; go to the Play page.
- **New lobby when the close is refused** (a game started in another tab): show the error, stay.
- **Idle close vs. a joining friend:** both go through the lobby's queue; the close re-checks
  solo and idle inside it.

## Testing

- Backend service tests: `closeIdleLobbies` closes only idle solo lobbies (not shared, not with a
  running game, not with recent activity, not already closed); a lobby that becomes shared
  between query and close stays open. Migration test: new lobbies default to `invite`. `launch`
  passes the lobby name for solo lobbies.
- Frontend unit tests: ready states hidden on the lobby page while solo, shown once shared;
  `winActions` for host / member / no lobby; the Play page's labels and the
  New lobby condition (`play.ts`); the Rematch flow's branches (solo start ok, start refused, not
  solo, DELETE 404).
- E2E: the solo lobby flow now expects the side-nav card and the code; a rematch from the win
  screen starts a new game.
