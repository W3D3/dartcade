# Admin tools: all games, invalidate a game, moderators, impersonate a user

Independent PRs, in this order. They sit behind the existing admin hub (`#/admin`): the game tools for admins and moderators (`requireModerator`), everything else for admins only (`requireAdmin`).

## 1. All games (`#/admin/games`)

Read-only list of every game on the platform, for investigating.

- API `GET /api/admin/games` (`backend/src/api/adminGames.ts`, `requireAuth` + `requireModerator`), cursor-paged like `GET /api/games`.
  Reuses the `listFinishedGames` query in `db/history.ts`, with the "my games" scope and the finished-only filter made optional.
- Filters: mode, player (name or user id), board, date range, ranked, status.
  Status defaults to **finished**; **aborted** and **active** are opt-in.
  Rows show a status column.
- Detail: opens the existing `GameDetails.svelte` through `GET /api/admin/games/:id`, which skips the `visibility`/seat check
  `getViewableGame` does. Account ids are always included for admins.
- Page `routes/AdminGames.svelte`, helpers in `lib/admin/games.ts`, card on the admin hub (`lib/admin/tools.ts`).

## 2. Invalidate a game, with Elo recalculation

`POST /api/admin/games/:id/invalidate` with an optional `reason` (at most 500 characters; blank counts as none). A soft delete:
the game, its seats, darts and input log stay, so an investigation can still open it, but it stops counting.

- Migration `030_game_invalidation.sql`: `game_sessions.invalidated_at`, `invalidated_by` (the moderator, `ON DELETE SET NULL`), `invalidation_reason`.
- Only a finished game that is not invalidated yet. An aborted or active one, or one already invalidated, is refused (409).
- Out of stats and best values, and ratings, for the players: `finishedGames` in `db/history.ts` leaves invalidated games out unless asked, as do the ranked reads in `db/ranked.ts` (`counts()`) and `x01Average`.
- Still in the players' history and details, marked: `listFinishedGames` and `getViewableGame` ask for them, `GameSummary.invalidated` says so, the history row shows an "Invalidated" pill and the details page a note. The reason and the moderator stay with moderators. The note points to the operator's contact email (`LEGAL_CONTACT_EMAIL`, served as `contactEmail` by `GET /api/auth-info`) when one is set.
- Moderators see it in the all-games list (an "invalidated" badge, who, when and why) and can filter for only those (`status=invalidated`); its details page shows a banner and no longer offers the button.
- An audit row (`admin_audit`: id, user id, action `game.invalidate`, target, JSON detail with the reason, created_at) is written in the same transaction.
  It is shared with impersonation (PR 3), so the migration lands here.
- Restore: `POST /api/admin/games/:id/restore` clears the three columns and replays the ratings with the game again (it slots back in where it was played), with a `game.restore` audit row. Moderators get a Restore button on the list row and in the details banner. The replay writes `ranked_ratings` as an upsert, so a player whose rating row went away while their only ranked game was invalidated gets it back.
- Hard delete, admins only (`DELETE /api/admin/games/:id`, `requireAdmin`; a moderator gets 403): the game row goes, and its seats, darts, input log and `ranked_results` cascade, invalidated or not, so it cannot be restored. A game in progress is refused (409). The ratings of the modes it was rated in are replayed without it, and a `game.delete` audit row records it (with whether it was invalidated and why). Admins get a Delete button next to Invalidate on the list row and in the details header, with a confirmation that says it is permanent.

## Moderators

`user.role = 'moderator'` (better-auth's admin role column; `admin` keeps meaning admin). `isModerator` is true for both; `GET /api/me` says so.
A moderator gets the all-games page, a game's details, and invalidate and restore, and the hub card for them; the hard delete, and the users, flags,
system and minigolf tools, stay admin-only. Admins set the role on `#/admin/users` (`PUT /api/admin/users/:id/role` with `admin`, `moderator` or `null`);
the last admin cannot be turned into anything else.

### Recalculating ratings

Elo and RP depend on game order, so invalidating a ranked game replays the rest.

`recalculateRatings(db, mode, exclude)` in `db/ranked.ts`:

1. In one transaction under an advisory lock for the mode, read every `ranked_results` row of the mode ordered by `created_at`, minus excluded sessions and invalidated games.
2. Each game's two sides come from `won`; a player's `average` is stored on the row.
3. A player's starting rating is the `rating_before` of their **first** ranked result in the mode (the seed from their X01 average at the time). This keeps the seed even when the removed game was their first, so `x01Average` is never re-evaluated.
4. Replay with the same pure rules `recordRankedResult` uses (`shared/ranked.ts`), rewriting `ranked_results.rating_before/after/placement` and `ranked_ratings` (rating, rank, matches, wins, streak).
5. Players left with no ranked games lose their `ranked_ratings` row, so they re-seed on their next game.
6. A game whose other side has no accounts left (deleted users cascade their `ranked_results`) cannot be re-rated; the survivor keeps the change it recorded (`applyResult` with `rating_after - rating_before`).

Recording a game and recalculating hold the same per-mode advisory lock.

To keep one source of truth, the per-game step is a pure function in `shared/ranked.ts` (`rateGame`) that both use; the replay test checks that replaying a log reproduces live ratings exactly.

Whole-mode replay is simple and correct; the platform is small. If it gets slow, restrict to the connected set of players from the first affected game onwards.

## 3. Impersonate a user

Uses better-auth's `admin()` plugin (`impersonateUser`, `stopImpersonating`), already installed. Every route resolves the user
through `getAuthUser()`, so the app, `/ws/me` and lobbies act as the target with no per-route change.

- "View as" item in the row menu of `#/admin/users` (not offered for admins or yourself); it calls `authClient.admin.impersonateUser` (the admin client plugin) and reloads the app, so every store, socket and flag starts afresh for the shown account. `lib/admin/impersonate.ts`.
- Full access while impersonating (start games, settings, friends). Admin pages return 403 while impersonating, since the
  effective user is not an admin; "Stop" restores the admin session and reloads on the users page.
- Cannot impersonate another admin (plugin default). Impersonation sessions last 1 h (plugin default).
- `GET /api/me` has `impersonating`; a floating "Viewing as X, Stop" pill on every page while it is true (`lib/components/admin/ImpersonationBanner.svelte`, mounted in `App.svelte`).
- `auth/sessionHooks.ts`: a session with `impersonatedBy` writes an `admin_audit` row (`user.impersonate`, admin and target) and does not stamp the user's `last_login_at`. Stopping is not audited (the plugin has no hook for it; the start row and the 1 h limit bound it).
- An impersonating `/ws/me` socket does not count as the user being online for their friends (`withAuthedSocket` passes `impersonated`).

## Out of scope

Bans, a richer investigation view (raw input log, bridge events).
