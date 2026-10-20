# Admin tools: all games, delete a game, impersonate a user

Three independent PRs, in this order. All sit behind `requireAdmin` and the existing admin hub (`#/admin`).

## 1. All games (`#/admin/games`)

Read-only list of every game on the platform, for investigating.

- API `GET /api/admin/games` (`backend/src/api/adminGames.ts`, `requireAuth` + `requireAdmin`), cursor-paged like `GET /api/games`.
  Reuses the `listFinishedGames` query in `db/history.ts`, with the "my games" scope and the finished-only filter made optional.
- Filters: mode, player (name or user id), board, date range, ranked, status.
  Status defaults to **finished**; **aborted** and **active** are opt-in.
  Rows show a status column.
- Detail: opens the existing `GameDetails.svelte` through `GET /api/admin/games/:id`, which skips the `visibility`/seat check
  `getViewableGame` does. Account ids are always included for admins.
- Page `routes/AdminGames.svelte`, helpers in `lib/admin/games.ts`, card on the admin hub (`lib/admin/tools.ts`).

## 2. Delete a game, with Elo recalculation

`DELETE /api/admin/games/:id`. Hard delete; `game_players`, `game_darts`, `game_session_events` and `ranked_results`
cascade from `game_sessions`, so history, stats and `/api/games/best` follow on their own.

- Only finished or aborted games. An active game is refused (409).
- Delete button on the admin list and in the details page (admin only), with a confirm dialog.
- An audit row (`admin_audit`: id, admin user id, action, target, JSON detail, created_at) is written in the same transaction.
  It is shared with impersonation (PR 3), so the migration lands here.

### Recalculating ratings

Elo and RP depend on game order, so deleting a ranked game replays the rest.

`recalculateRatings(db, mode, { exclude })` in `db/ranked.ts`:

1. In one transaction under an advisory lock for the mode, read every `ranked_results` row of the mode ordered by `created_at`, minus excluded sessions.
2. Each game's two sides come from `won`; a player's `average` is stored on the row.
3. A player's starting rating is the `rating_before` of their **first** ranked result in the mode (the seed from their X01 average at the time). This keeps the seed even when the removed game was their first, so `x01Average` is never re-evaluated.
4. Replay with the same pure rules `recordRankedResult` uses (`shared/ranked.ts`), rewriting `ranked_results.rating_before/after/placement` and `ranked_ratings` (rating, rank, matches, wins, streak).
5. Players left with no ranked games lose their `ranked_ratings` row, so they re-seed on their next game.

To keep one source of truth, the per-game step is extracted from `recordRankedResult` into a pure function that both use; the replay test checks that replaying a log reproduces live ratings exactly.

Whole-mode replay is simple and correct; the platform is small. If it gets slow, restrict to the connected set of players from the first affected game onwards.

### Voiding without deleting (later, not in this PR)

For a cheater you may want to keep the game as evidence. `recalculateRatings`'s `exclude` input exists for that: a later
`game_sessions.voided_at` column would feed it, and moderators (a role below admin) could set it. Out of scope here.

## 3. Impersonate a user

Uses better-auth's `admin()` plugin (`impersonateUser`, `stopImpersonating`), already installed. Every route resolves the user
through `getAuthUser()`, so the app, `/ws/me` and lobbies act as the target with no per-route change.

- "View as" button on `#/admin/users`; calls the plugin through the auth client, then reloads the SPA.
- Full access while impersonating (start games, settings, friends). Admin pages return 403 while impersonating, since the
  effective user is not an admin; "Stop" restores the admin session.
- Cannot impersonate another admin (plugin default). Impersonation sessions last 1 h (plugin default).
- Persistent banner "Viewing as X, Stop" on every page when the session has `impersonatedBy` (`lib/components/admin/ImpersonationBanner.svelte`, mounted in the app shell).
- Audit rows for start and stop (`admin_audit`).
- Open point to check while building: friends presence and `lastLogin` must not mark the target as online/last seen because of an impersonation session.

## Out of scope

Moderator role, bans, voiding, a richer investigation view (raw input log, bridge events).
