# Matchmaking: design

Date: 2026-10-14
Issue: [#53 Matchmaking: ranked online matches with Elo](https://github.com/W3D3/dartcade/issues/53)
UI: the **Matchmaking** page of the Dartcade Platform Design canvas (`project/MM-*.dc.html`, and the
"Ranked rules (proposal)" note next to them).

## Goal

Find an online opponent (or a pair of them) near your level and play a ranked X01 match. Wins and
losses move a rating, and the rating gives a rank. Ranked games are ordinary lobby games underneath,
so seat control, remote boards, forfeits and history work as they do today.

## Decisions

- **Modes:** solo 1v1 and duo 2v2, both in the first version, rated separately. A duo is a lobby of
  exactly 2; the host starts and cancels the search.
- **Game:** X01 501, double out, first to 2 legs, or first to 3 when both sides picked it. One queue
  for both formats so a small player base isn't split. Bull-off decides who starts.
- **Rating:** Elo in RP. K = 32 once ranked. A side is rated on its players' average rating and
  every player on it moves by that side's stakes (Win +16 · Loss −14), shown before accepting.
- **Placement (decided 2026-10-14):** the first 5 matches in a mode place you, with the rating
  hidden (the page shows "2 / 5 placed", recent games show "Placement" instead of RP).
  - A new player starts from their 3-dart average over their last 20 X01 games, about 15 average
    points per tier (50/3 RP a point: 30 → 800 Bronze I, 45 → 1 050 Silver I, 60 → 1 300 Gold I),
    kept between 600 and 1 800; 1 200 without X01 games.
  - A placement match scores 70% on the result and 30% on performance: your side's match average
    against theirs (even 0.5, 20 points better 1), at K = 64. A win never costs RP and a loss
    never gains any; outthrowing someone you lose to only costs less.
  - After placement only wins and losses move the rating; the average no longer counts.
  - Matchmaking uses the hidden rating while placing, so first opponents are already near your level.
- **Ranks:** 6 tiers (Wood, Bronze, Silver, Gold, Diamond, Elite) × 5 stages (I to V). Wood I starts
  at 0, every stage after it is 50 RP up: Wood II 600 … Gold I 1 300 … Elite V 2 000. You promote
  the moment you reach a stage and drop only 25 RP below the stage you hold. No rank while placing.
- **Time limit:** 120 s per visit (it starts when the last visit is committed), plus a 300 s reserve
  per player (per team in 2v2) used only once a visit runs over. An empty reserve forfeits the match.
  The clock simply runs, with no pausing: timers are lenient, the goal is only to stop stalling. Both
  are number flags (`matchmaking.visitSeconds`, `matchmaking.reserveSeconds`) a deployment can
  change with `FLAG_VALUES`; their values (with `matchmaking.manualEntry`) are kept with the game
  when it starts (`ranked_matches.rules`), so a later flag change never alters a running game. The
  clock is a pure reducer (`session/rankedClock.ts`): the reserve is charged when a visit is
  committed, from the logged time, so a replay ends with the same reserves. Running out is a logged
  input from a source only the server has (`source: 'system'`, `session/systemInput.ts`, parsed by
  its own schema, `SessionEngine.systemInput`): no client message can be one. After a restart a
  running visit starts over and the reserves stay: the outage is not the players' time.
- **Manual entry** is allowed in ranked (trust-based; a board is not required), controlled by the flag
  `matchmaking.manualEntry` (on for everyone). When off, the server refuses hand-entered darts
  (`add_dart`, `correct_dart`) in ranked games.
- **Leaving** a ranked game is a forfeit. **Disconnects** get 2 minutes to come back; then the other
  side wins.
- **Queue:** starts at ±75 RP, widens every 30 s; runs on the server while you browse. A match found
  gives everyone 60 s to accept (the flag `matchmaking.acceptSeconds`, 10 to 300); opponents stay hidden until all accept. Declining or timing out
  pauses your queue for 2 min; everyone else keeps their place. No bots in the queue.
- **Online average:** 3-dart average over the last 20 ranked games.
- **Flag:** `matchmaking.enabled`, on for admins until it ships.

## Data

- `ranked_ratings (user_id, mode)`: rating, held stage (`rank_index`, null while placing), matches,
  wins, streak.
- `ranked_results (session_id, user_id)`: mode, won, whether it was a placement match, rating before
  and after, the game's 3-dart average. Feeds the 30-day trend, the online average and Recent ranked matches.
- `ranked_matches (session_id)`: which games came from the queue, their mode and sides. When a
  ranked game finishes, its result is recorded from this row; an aborted game records nothing.
- `ranked_matches` also keeps the rating each player was matched on (`ratings`: a newcomer is seeded from
  it, not from an X01 average that by now includes the game) and `void_reason` for a finished game
  that is deliberately not rated (`no_winner`, `player_deleted`), so it is not retried at every start.
  The winning side is read off the engine's placements by seat. `ranked_results` also keeps
  `forfeited` (a game with a forfeit is rated on the result alone) and `rank_before`/`rank_after`.
  A ranked game is recorded before its final snapshot is pushed, so the result screen reads the change.
  A game invalidated before it was recorded is recorded and left out again at once.
- `recordRankedResult` moves the ratings for a finished game in one transaction and is idempotent
  per game.

The rank maths (`backend/src/shared/ranked.ts`) is shared with the frontend.

## Slices

1. **Ratings and ranks**: rank and Elo rules, the tables, `GET /api/ranked/me`, the
   Matchmaking page (Find match off) and the Ranks page, behind the flag.
2. **Queue:** matcher with the widening range, queue and match-found states on `/ws/me`, accept and
   decline, the ranked game started straight from the queue (no hidden lobby: each player at their
   lobby board or usual board, else entering darts by hand), ratings recorded when it ends. Solo and
   duo (a duo searches from a lobby of exactly two; its host starts and cancels). The queue lives in
   memory, so a restart drops the searches. Moved on: the ranked result screen, locking the duo's
   lobby while it searches, and stopping a ranked game from being aborted.
3. **Ranked rules in game:** the visit timer and reserve as input events (so replay stays
   deterministic), the disconnect forfeit, the ranked header with stakes.
4. **Everywhere else:** the searching / match-found states in the lobby card, tablet rail and phone
   strip, Matchmaking on tablet and phone, ranks on profiles.
