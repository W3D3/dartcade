# Dart bots: design

Computer-controlled players for X01, addable to a lobby the same way a guest is. Ten difficulty
levels, each with a specific 3-dart average, driven by a single underlying accuracy parameter
rather than a hand-tuned score table.

## Goal

A host can fill an empty seat (or practice alone) against a bot instead of a human: "Add bot",
pick Level 1–10, play. The bot throws for itself — paced like a real visit, not an instant
resolve — using the exact same event path a human's manual entry or a real board uses, so nothing
downstream (history, undo, replay, remote spectators) needs to know a bot was involved.

## Decisions

- **X01 only, for now.** Around the Clock bots are a natural follow-up but need a different skill
  framing (hit rate on a single target, not an average) — not in this change.
- **Ad hoc per lobby, not a persistent roster.** A bot is `Level 1`–`Level 10`, added to a lobby
  the way a guest is, with no account and no stats that outlive the lobby. A roster of named
  bots (and eventually bots trained on real players) is a plausible future direction, but this
  change doesn't build toward a specific shape for it beyond not painting it into a corner.
- **Accuracy model, not a score table.** Each level is one parameter — σ, the standard deviation
  (board mm) of where a dart lands around the spot the bot aimed at. The bot always aims
  "correctly" (treble-20 while scoring freely, the live checkout suggestion once one's on); all
  of the skill difference is in how tightly it groups around that target. This naturally produces
  busts, missed doubles under pressure, and the occasional total miss at low levels, without any
  bot-specific scoring logic.
- **The 3-dart average is a calibration target, not a tunable itself.** A one-time offline
  simulation picks the σ for each of the 10 levels so its long-run average lands on a fixed
  curve (see Calibration). The result is a constant table checked into source, not computed live.
- **Paced, not instant.** Darts land a couple of seconds apart (randomized within a band), then a
  short pause before takeout, so the match screen, visit animations and remote spectators see an
  ordinary-looking turn. Speed is configurable (see Bot speed).
- **Deterministic from the session's existing seed, not a new one.** Every session already
  persists a `seed` (`rng_seed`), used today only to seed ATC's random target order once at
  `init`. The engine keeps that same seeded `Rng` alive for the session's lifetime instead of
  discarding it after `init`, and every bot dart draws its next value from that same continuing
  stream. Same seed → same sequence of bot throws, for a given uninterrupted live run.
  - This is about a live run, not event-log replay: a bot's dart, once thrown, is stored as an
    ordinary `add_dart` event (an actual segment). Replaying the log (e.g. after a server
    restart) replays that recorded outcome exactly like a human's dart, rather than re-rolling
    it. The seed makes a live run reproducible and testable; it doesn't need to survive a
    restart mid-game, since nothing depends on it doing so.
  - **Undo does not rewind the rng stream.** There's no bookkeeping tracking how many draws
    happened in a now-undone visit, and the stream is only ever reconstructed from the seed when
    the session is freshly loaded into memory. If a bot is asked to throw again for an undone
    slot, it draws the *next* value and throws something new — it is not guaranteed, or expected,
    to repeat the same dart. This matches how undoing a human's or a real board's dart already
    works: a retry is a new event, not a replay of the old one.
- **Bot speed is a per-game config field, shown only when relevant.** Added to `X01Config`
  alongside `inMode`/`outMode`/`bullOff`, using the same `configMeta`/`SegmentedControl` pattern
  as the rest of X01's settings (three presets: Fast / Normal / Slow). It is never part of what a
  human is asked to configure, and never rendered, unless the lobby's game already includes at
  least one bot seat — the same conditional-field pattern `GameSettings` already uses for the
  Format field (`{#if teams && meta.format}`).
- **Not in this change:** ATC bots, a persistent bot roster or bot stats, bots modeled on real
  players, a free-form average slider (fixed Level 1–10 only), and any restriction on an
  all-bot/no-human game (allowed, just not a focus).

## Seats and lobby

A bot slots into the existing guest shape rather than needing a new kind of person:

- `LobbyPerson` (and the `Seat` it becomes at game start, via `planGame`) gains
  `bot: { level: number } | null`, alongside the existing `userId: null`, `addedByUserId: <host>`,
  `boardId: null` a guest already has. A bot is always `ready`, needs no board, and flows through
  team assignment, throw order and bull-off exactly like any other seat — `planGame`,
  `assignTeams`, `seatPlacements` and friends don't need to know bots exist.
- **No changes to `access.ts`.** A bot's `controllerUserId` is the host who added it, exactly
  like a guest's. The bot scheduler acts as that controller internally, calling the engine
  directly rather than through the browser websocket, so `authorizeAction`'s existing
  `controllerUserId === userId` check already covers it.
- The lobby UI gets an "Add bot" control next to "Add guest": pick Level 1–10, done. Naming,
  removal and the rest of guest-row behavior (per `lobby/rules.ts`) apply unchanged.

## The bot scheduler

A new backend-only piece (no websocket, no browser involvement) that drives a bot's turn:

1. **Trigger.** After any state change — the same point the engine already pushes a snapshot
   from — it asks: is the current seat a bot, and is nothing already scheduled for this session?
   If so, schedule that bot's first dart after a short delay (per the game's bot speed).
2. **One dart.** When the timer fires, re-check it's still that bot's turn and the visit isn't
   already locked (bust/checkout/a human undid something while it waited); if not, stop quietly.
   Otherwise: pick a target, draw from the session's `Rng`, resolve to a segment (see Accuracy
   module), and call `onUserAction('add_dart', …)` — the same entry point manual entry uses.
   Schedule the next dart.
3. **End of visit.** Once three darts are thrown or the visit locks, schedule one more short
   delay, re-check, then call `onUserAction('takeout')`.
4. **Cleanup.** A pending timer is cancelled if the session ends or is aborted. The re-check in
   steps 2–3 is the actual safety net against everything else (undo, forfeit, the lobby closing).
5. **Bull off.** The same single-dart step (2), aimed at the bull instead of a scoring target,
   covers a bot in a bull off — no separate code path.

## Accuracy module

Given the score left, darts remaining and out-mode, pick a target and resolve a thrown dart:

- **Target:** treble-20 while scoring freely; the suggested checkout once a finish is reachable
  with the darts left, falling back to treble-20 otherwise.
- **Throw:** sample a 2D offset from `N(0, σ)` (board mm) around the target's coordinates, resolve
  the resulting point to a real segment.

Two pieces of existing logic move to `backend/src/shared/` (currently empty; exactly what it's
for) so the bot and the human-facing UI share one implementation instead of two that can drift:

- `checkout.ts`'s pure math (today frontend-only) — the bot's checkout targeting and the match
  screen's suggested-checkout highlight become the same function.
- The board's segment-geometry math (today only inside `DartBoard.svelte`'s `segmentAt`) — "where
  did this point land" has one implementation.

The frontend re-imports both via the existing `$shared/...` alias; nothing about how the browser
uses them changes.

## Calibration

A one-time offline script Monte-Carlo-simulates full legs at a range of σ values, records the
resulting long-run 3-dart average, and picks σ per level to land on a target curve (roughly
Level 1 ≈ 30 through Level 10 ≈ 100+, spaced so consecutive levels feel meaningfully different).
The output is a small constant table (`backend/src/bots/levels.ts` or similar) checked into
source — not computed at runtime, and not re-derived from a live average target.

## Testing

- Unit tests for target-picking and throw-resolution, deterministic with an injected `Rng`.
- An engine-level test with fake timers driving a bot through a full visit and takeout.
- A lobby-level test: a bot seat flows through `planGame` like a guest does, including teams.
- A calibration sanity check (simulate N visits per level, assert the average lands within a
  tolerance band) — generous tolerance, not re-validated on every CI run.
