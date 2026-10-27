# Home page

Design source: the "Dartcade Platform Design" canvas, artboards `Home`, `Tablet-Home`, `Mobile-Home`
(https://claude.ai/artifact/2ZyCCfSMhs3PKZzNLzsw23). Read them with the Artifact tool; strip the inline
SVG and `data:` images first, they make the files huge.

## Intent

Signing in lands on a page that is about the player, not a game picker: how they are doing, what their
friends are up to, a way back into the last game. Today `#/` is the Play page (`CreateSession.svelte`).
Home becomes `#/`, Play moves to `#/play`.

## Goals

- `#/` is Home for signed-in users, laid out as in the three artboards (desktop, tablet, mobile).
- Every section shows real data. Anything the design shows that the backend cannot serve yet is left out
  (see "Left out"), not faked.
- Home is behind a flag `home.enabled`, **default on**. Off: `#/` is the Play page as before.

## Non-goals

- Customising Home (reorder, hide, add sections; the section options menu; "Customize" button; Settings › Home).
  First MVP renders the default order. The page footer line about Settings › Home is left out too.
- Tournaments nav item, "Live match" nav item changes, any new nav work beyond the Home and Play entries.

## Anti-goals

- Placeholder numbers or invented feed entries. A section with nothing to show says so plainly
  (e.g. "No ranked games yet") or hides itself where noted.
- A second source of truth for things that exist (stats, ranked, history, friend status).

## Sections (default order, as designed)

Header: date, "Good evening, <name>" (morning/afternoon/evening by local time), **New game** → `#/play`.

| Section          | Data                                                                                                                               | Notes                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Your form        | `GET /api/games/stats?days=30` (X01: 3-dart avg, `previousAvg` for the ▲/▼ trend, checkout %, best checkout, games over all modes) | "Full stats" → own profile. Window label is "last 30 days"; the design's "this month" becomes "last 30 days" (my call). Best leg is not stored per game (it would need new tracking in the X01 reducer), so the tile shows Best checkout instead. The checkout rate needs `checkoutHits`/`checkoutAttempts` in X01's seat stats, which games finished from now on keep; older games show a dash. |
| Ranked           | `GET /api/ranked/me`: rank, RP, progress to next rank, last 5 games as W/L                                                         | Only when `matchmaking.enabled`. "Find a ranked match" → matchmaking page.                                                                                                                                                                                                                                                                                                                       |
| Featured         | Static list in the frontend (`lib/home/featured.ts`), each slide with an optional flag                                             | A slide shows only if its feature is enabled for the user (a `gamemode.<id>.enabled` or `lights.enabled` flag, or no flag). Carousel with prev/next and dots; hidden when no slide qualifies. Built with Minigolf and Board lights: Cricket and Stats have no page. A slide whose target page does not exist is dropped.                                                                         |
| Friends' lobbies | New: `GET /api/home/lobbies`                                                                                                       | Friends' lobbies the viewer can see, see below.                                                                                                                                                                                                                                                                                                                                                  |
| Friend activity  | New: `friend_activity` table, `GET /api/home/activity`, see below                                                                  |                                                                                                                                                                                                                                                                                                                                                                                                  |
| What's new       | Static list in the frontend (`lib/home/news.ts`): date, title, text, link                                                          | Newest first, at most 3 shown. "Changelog" link → the repo's releases page.                                                                                                                                                                                                                                                                                                                      |
| Jump back in     | `GET /api/games?limit=3`                                                                                                           | Row: mode, opponents and result, relative date. Action: **Play again** → `#/play` (a rematch exists only for a live lobby, not from a past game).                                                                                                                                                                                                                                                |

Layout: desktop two-column rows as in the artboard (form + ranked; lobbies + activity; news + recent),
featured full width between. Tablet and mobile collapse to one column in the artboards' order.

## Friends' lobbies (new endpoint)

`GET /api/home/lobbies` returns lobbies of the viewer's friends that the viewer may see: the host is a friend
and the lobby is open (`access = friends`) and not closed. Per lobby: lobby id, name, host, state
(`open` | `in_game`), game mode id and a short settings label (e.g. "501"), people count, board count.
Open → **Join** (same path the friend list's join uses). In game → listed, no action (Watch does not exist).
Reuses `openLobbiesOf` in `db/friends.ts`. A lobby whose host is Invisible is left out, as in the friends list (hosts who are merely offline are not checked: that needs presence). Live updates are not part of the MVP: the list loads on
entering Home and refetches when the existing `/ws/me` friend statuses change.

## Friend activity (new)

Table `friend_activity` (migration `043`): `id`, `user_id`, `game_id` (FK to the session),
`kind`, `payload jsonb`, `created_at`, unique on `(game_id, user_id, kind)`.

**When events are written (my call):** at game finish only, never per visit, so replays, restarts and
corrected darts cannot duplicate or leave a stale event: the finish step inserts with `ON CONFLICT DO
NOTHING`. Aborted and forfeited games write nothing. Every finished game counts, including solo, bot and
manual-entry games, except a moderator-invalidated one: invalidating a game deletes its events,
restoring does not bring them back (events are cheap, not a record). Events carry `game_id` so the feed
query and the invalidation can find them. If a user has several qualifying 180s in one game, one event
carries the count in `payload`.

Events written at finish, in the finishing transaction:

- `one_eighty` — a visit of 180 in X01. Payload `{ count }`: the number of 180s in that game.
- `ton_out` — a checkout of 100 or more in X01 (the score left when the checkout visit started, as
  `bestCheckout` counts it). Payload `{ count, best }`: how many ton-plus outs in that game and the highest.
  Added at the owner's request. Both X01 kinds need two new per-seat counters (`count180`, `tonOuts`) and
  `best` (the existing `bestCheckout`) in X01's `summarize` stats; the writer reads them from the seat
  results at finish, so no input log replay is involved.
- `rank_up` — a ranked result moved `rank_index` up (`recalculateRatings`/the result write in `db/ranked.ts`).

Not in the MVP: new bests (owner's call), lobby-started, minigolf course finished. (The design shows
them; they are the same mechanism and can be added by writing another `kind`.) Events are written for
Invisible users too (owner's call): Invisible hides presence, not what you played.

`GET /api/home/activity` returns the newest 20 events from the last 7 days by the viewer's friends,
joined with the user's display name and avatar. A game moderators invalidated leaves its events out.
Rows older than 30 days are pruned by the existing cleanup job (builder finds it or adds it next to
`auth/cleanup.ts`'s pattern).

No GG button (owner's call): the feed is read-only. Rows are: avatar, "<name> hit a 180 in X01" /
"<name> hit 2 180s in X01" / "<name> checked out 129 in X01" / "<name> reached <rank> in ranked", relative time.

## Route, flag, links

- `routes['/']` → `Home`, `routes['/play']` → `CreateSession`. Every link in the app that means "the Play
  page" and uses `#/` or `push('/')` moves to `#/play`; links that mean "home" stay. The builder greps for
  both and decides each. The nav gets Home and Play as two items.
- `home.enabled` in `backend/src/flags/definitions.ts` with default on, `FLAG_META` description saying what it
  does. The SPA reads it through `flag('home.enabled')`. Off → `#/` renders `CreateSession`.
- Signed-out users still get the sign-in screen at `#/` as today.

## API and codegen

New operations (`getHomeLobbies`, `getHomeActivity`) go into `schema/api-v1.yaml`, then
`npm run gen:api`. Responses are validated like the other routes (`fromSpec`).

## Links the builder must verify

"Full stats" (→ `#/profile`), the Featured slides' targets (Cricket has no game mode or page; Stats has no
page of its own) and Jump back in's Rematch (can History start one from a past game id, or only a live
lobby?). Each link whose target does not exist is dropped, not stubbed. Expect the carousel to start with
Minigolf and Board lights only; it still renders as a carousel with prev/next when two or more qualify and
as a single banner when one does.

## Left out because the data does not exist

- "Average per day" sparkline in Your form (no per-day series).
- "#412 in Austria" in Ranked (no country on users, no leaderboard).
- Customize button, section menus, Settings › Home.
- Watch (live spectator scoreboard) for in-game lobbies.

## Done means

- Backend tests for both endpoints (visibility: only friends, not strangers, not closed lobbies, not
  invalidated games) and for each activity writer; frontend tests for the section view
  logic (greeting, trend arrow, W/L, featured filtering by flag, relative dates).
- Typecheck, lint, format, `check-generated`, `check-migrations` green.
- Screenshots of desktop and phone under `docs/home/`.

## Decided by the owner

- No `new_best` events, no GG. Ton-plus outs are in (`ton_out`).
- In-game lobbies are shown (no action, since Watch does not exist), not hidden.
- Invisible users' activity events are written and shown like anyone's.
