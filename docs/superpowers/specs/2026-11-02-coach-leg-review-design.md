# Coach: leg review for X01

Date: 2026-11-02. Status: design approved in brainstorming, not yet planned.

## Goal

After a finished X01 game, show each player what they did well and badly, visit by visit. The
coach judges two things:

- **Execution**: how well the darts went where they were meant to (scoring, doubles, where they
  miss).
- **Strategy**: on a finish, whether the number they threw at was a good choice. Strategy tips
  are what a player can act on straight away, so they are the focus.

The first version has two parts:

- **The leg review:** a Coach section on the match details page of one finished game. It reads
  the game's own data and nothing else.
- **A Coach page** (`#/coach`): your recent X01 games, each linking to its leg review.

The design canvas (`project/Coach-*.dc.html`) shows a bigger coach: trends over the last 50
legs, tips, practice presets, visit grades. Those are out of scope here (see the last section).
From the canvas we take the visit list and the "what happened / better" note.

## Scope

The coach section is shown when all of these hold:

- the game is X01 with `inMode: 'straight'`, `outMode: 'double'` and `bullValue: '25_50'`;
- the game is singles, not teams;
- the game has finished (aborted games have no details page);
- the `coach.enabled` flag is on for the viewer.

The coach judges one player at a time: a picker of the game's human seats, defaulting to the
viewer's own seat (`mySeat`), or else the first human seat. Bots are not in the picker.

## Execution

The coach shows these stats for the chosen player, over the whole game. Leg-level numbers would
be too few darts to mean much.

- **Scoring average** until the player first has 170 or less left in a leg.
- **Busts**: count.
- **Doubles**: for each double thrown at, its hits out of darts, and darts at a double per
  checkout. A dart counts as thrown at a double when it was thrown on a one-dart finish (the
  same rule as `x01Stats.ts`'s checkout attempts, `games/x01.ts`).
- **Miss tendencies**:
  - **Scoring darts** (more than 170 left before the dart). The aim is 20, 19, 18 or 17. A dart
    in an aim's number or one of its neighbours counts as thrown at that aim:
    - 20: 5 and 1
    - 18: 1 and 4
    - 19: 7 and 3
    - 17: 3 and 2

    A dart in 1 or 3 (each next to two aims) goes to the aim nearest the visit's other darts'
    mean position. Without positions, it goes to the aim whose number the visit's other darts
    hit most; a tie goes to the higher-scoring aim. Darts in other numbers (13, 6, 10, 15, 16, 8,
    11, 14, 9, 12), in 25 or the bull, are left out of the tendency. There is no strategy
    judgement on scoring darts.

  - **Doubles**: a dart thrown on a one-dart finish was aimed at that double.
  - **Direction**:
    - Left and right (by wedge) come from the segment, so manual darts count.
    - Inside, outside, high and low come from `coords`, so only camera darts count. The stat
      says how many darts it is based on.

  Shown as a percentage per direction for each aim with at least 6 darts. As built, left and
  right show as the numbers the darts landed in (20: 45% · 1: 20% · 5: 10%), plus inside and
  outside from the camera darts; high and low were dropped.

## Strategy

### The model

The coach scores an aim by **the chance it leads to a checkout**, under a model of how a
reference player's darts land.

- **Throws.** A dart lands on a 2D Gaussian around the aim point, on the real board geometry
  (`shared/board.ts`, `segmentAt`). It uses the same throw model as the bots (`bots/accuracy.ts`
  `throwAt`, including its per-dart σ jitter).
- **Spread: one fixed reference player.** Every player, and every opponent, is judged as a
  player averaging 81: bot level 7, `LEVEL_SIGMA[6]` = 0.05331 in `bots/levels.ts`.
  - **The advice is the same at every skill level.** The prototype judged every case (scores
    2–170, 1–3 darts, every number a dart can land in) at bot levels 1, 3, 5, 7 and 9. A note at
    a weaker level never recommended an aim the level-9 model would flag, and never flagged
    level 9's best aim.
  - **Skill only changes how many notes there are.** A weaker player's checkout chances are
    small everywhere, so fewer gaps reach 5 points: about 875 cases flag at a 30 average, against
    about 6,500 at 81.
  - So a fixed reference teaches the strategy a player grows into, and gives the same verdict to
    everyone. It also needs no per-player data, and old games are judged the same way forever.
  - A note can cost a weak player less today than its number says. That's accepted.
- **Aims.**
  - Per number: its treble, its double, its outer single and its inner single.
  - The wire between each pair of neighbouring outer singles.
  - The bull, and 25.

  That makes 102 aim points.

- **Landing table.** For the reference σ and each aim, the chance of each outcome (points, and whether
  it is a double). Computed by Monte Carlo (40,000 throws per aim) and generated into a data file
  by a script (`npm run gen:coach`). Outcomes under 0.1% are dropped. The data is loaded lazily
  by the coach section only.
- **Value of a state**, where `r` is the score left and `k` the darts left in the visit:

  ```
  value(r, k) = P(check out this visit)
              + w · P(not this visit, then check out with three darts next visit from what's left)
  ```

  - A bust ends the visit, and the next visit starts from the visit's starting score, as in the
    game.
  - **w** is the chance the player gets a next visit: the chance that every opponent fails to
    check out in their next visit. Each opponent's chance comes from the same reference model,
    from their score left at that moment.
  - So w is about 1 when the opponents are far from a finish, and low when an opponent is on a
    finish. That's why the model sets up calmly in the first case and goes for the finish in the
    second.

- **Solving.**
  - First, a table of each score's chance to check out within 1, 2 or 3 darts (scores 2
    to 170).
  - Then the value of each aim for the darts being judged, memoised per visit.
  - Both take milliseconds in the browser.

### When a dart gets a note

A dart is judged when the player had **170 or less** left before it, and it isn't the dart that
checked out.

- **Benefit of the doubt.** We don't know what the player aimed at, only where the dart landed.
  The candidate aims are every aim point on the number the dart landed in:
  - its treble, double and both singles, plus the two wires next to it;
  - for a dart in 25 or the bull, those two;
  - for a dart off the board, the number it missed next to (`M<n>` from `segmentAt`).

  The coach takes the best candidate, so a good plan that was badly thrown never gets a note.

- **The coach judges the number, not the bed.** Because of benefit of the doubt, a dart is only
  judged by the number it landed in.
  - It catches a **wrong number**: S20 on 57, when S17 leaves 40.
  - It can't catch a **wrong bed on the right number**: T1 on 3, T20 on 60, S16 on 32. S1, S20 and
    D16 are candidates for those darts, so the coach assumes the player aimed there and missed.
  - Telling those apart needs the player's own spread and camera positions, which is later work.

- **Note.** The dart gets a note when the best aim overall is **5 or more points** of checkout
  chance better than the best candidate.

  In the prototype, at the reference level with no opponent near a finish (w = 1), 5 points
  separates clear mistakes from near-ties. Gaps are best aim overall against best aim on the
  landed number:

  | Dart (score left / darts left, number landed in)                                                     | Gap in points |
  | ---------------------------------------------------------------------------------------------------- | ------------- |
  | 7/3 in 20, 23/2 in 20, 57/1 in 20, 47/1 in 20, 35/1 in 20                                            | 14–15         |
  | 3/3 in 20, 5/3 in 20                                                                                 | about 12      |
  | 57/2 in 20, 41/1 in 20, 33/1 in 20, 29/1 in 20                                                       | 7.5–8.7       |
  | 57/3 in 20, 41/3 in 20, 41/2 in 20                                                                   | 4.4–5.6       |
  | 81/3 in 20, 100/3 in 19, 64/2 in 20, 48/1 in 20                                                      | 3–4           |
  | 99/3 in 20, 119/3 in 20, 131/3 in 20, 65/3 in the bull, 90/3 in 18, 3/3 in 1, 60/3 in 20, 40/3 in 20 | 0–1           |

  Every first dart in `checkoutTable.ts`, 184 routes, is within 3.4 points of the best, except
  the alternative S19 · D13 on 45 (5.5). The test cases below pin the clear rows on both sides,
  and stay away from the borderline ones.

- **Note text.** The note names the better aim and why. The why comes from the candidate's worst
  difference against the better aim, taken from its outcomes:
  - "a dart in T20 busts" (a bust outcome carries the gap; e.g. aiming at 20 on 7);
  - "S20 leaves 37, which can't be finished with one dart" (the leave's value carries the gap);
  - "S20 leaves 99, which two darts can't finish".

  When the checkout table (`shared/checkoutTable.ts`) has a route for this score and darts left,
  the note also shows it as "The book plays T19 · S10 · D16". The model decides whether there is
  a note; the book is only shown for reference.

The note text is our own. The tips on dartscheckoutassistant.com (bust risk next to the target,
singles that still leave a finish, friendly misses, awkward doubles) shaped the reasons the note
gives, but no text is copied.

### Validation against published routes

The prototype compared the model's best first dart, with 3 darts, against the routes on
dartscheckoutassistant.com (157 scores) and our checkout table:

| Level (average) | Best aim = site's main route | Best aim is one of the site's routes | Site's main route within 3 points of the best |
| --------------- | ---------------------------- | ------------------------------------ | --------------------------------------------- |
| 3 (46)          | 106                          | 129                                  | 157                                           |
| 5 (63)          | 115                          | 141                                  | 157                                           |
| 7 (81)          | 111                          | 137                                  | 156                                           |
| 9 (98)          | 111                          | 131                                  | 157                                           |

So the coach never flags a route the site recommends. The comparison script is not shipped. The
test suite pins our own checkout table instead (below).

## UI

This is a **Coach** section on `GameDetails.svelte`, below the X01 section. Its parts live in
`lib/components/coach/`.

The section has the anchor `coach`, so links can open the page at it.

- **Header:** the player picker (`Chip`s, as elsewhere on the page) and one line saying the
  notes judge every dart against an 81-average player's chances.
- **Biggest mistakes:** the game's three costliest notes, sorted by cost, each linking to its
  visit below. It is hidden when the game has no notes.
- **Stats:** the execution numbers as a small `StatsTable`-style grid.
- **Where you miss:** per aim (T20, T19, D16, …), the percentage per direction, with the dart
  count.
- **Legs:** one block per leg. Each visit is a row:
  - remaining before → the three darts → remaining after;
  - a bust marker;
  - its notes underneath.

  A visit with no note shows no badge. A leg with no notes says "No strategy notes".

- **Note:** "Better: S17 (leaves 40, D20). S20 left 37." Plus the book route when there is one,
  and how much checkout chance the throw cost ("−15%").

The phone layout stacks the same blocks. Light and dark themes come from the existing tokens.

### Coach page

`#/coach` (`routes/Coach.svelte`) is a list of your finished X01 games that the coach can review:
double out, singles, `25_50` bull.

- **Data:** it comes from `GET /api/games?mode=x01`, filtered on the client by each game's
  `config`. The list pages with `nextCursor`, as History does.
- **Rows:** each row shows the date, the opponents (or "Solo"), the result, your average and the
  legs. A row opens `#/history/<id>`, scrolled to the Coach section.
- **No coach numbers in the list.** The rows show no note counts or filters, because those would
  need the coach run over every game on the server.
- **Empty state:** "Play an X01 game with double out to get a review", linking to Play.
- **Navigation:** the page is reachable from the History page, behind `coach.enabled`. It gets a
  top-level menu entry once the flag is on for everyone.

## Code

```
backend/src/shared/coach/
  aims.ts        the 102 aim points and the Outcome type
  landing.gen.ts generated (aims × outcomes at the reference σ)
  model.ts       finish-chance table, evaluator: each aim's value and its outcomes' values
  walk.ts        a seat's darts with the score left before each, the visit start, checkout/bust
  aim.ts         number a dart landed in, candidate aims, scoring aim (20/19/18/17 + neighbours)
  notes.ts       strategy notes and their reasons
  stats.ts       execution stats and miss tendencies
  index.ts       coachGame(): notes + stats + tendencies
backend/src/coach/genLanding.ts   Monte Carlo over the bots' throwAt; npm run gen:coach
```

- **Pure functions, no I/O.** The frontend imports them through `$shared/coach`. Nothing changes
  in the API, the schema or the DB: `GET /api/games/{id}` already returns every dart with its
  segment, coords and the visit's remaining and bust.
- **Remaining before each dart** is rebuilt from the visit's starting remaining and the darts'
  scores.
- **The flag** `coach.enabled` goes in `flags/definitions.ts`, default rule `admins`, with a
  `FLAG_META` description.

## Testing

- `model.test.ts`:
  - Finish chances behave as expected. 2 and 3-dart finish chances are 0 for 159, 162, 163, 165,
    166, 168 and 169, and for numbers 2 darts can't finish.
  - Each aim's outcome chances in the generated table sum to 1, give or take the dropped tail.
- `review.test.ts`, with built `X01Detail` legs, so these are behaviour tests:
  - Notes, all in 20: 57/1, 47/1, 7/3, 3/3 and 23/2.
  - No note:
    - 99/3 in 20, 119/3 in 20, 65/3 in the bull, 90/3 in 18;
    - 3/3 in 1, and 60/3 in 20 (benefit of the doubt);
    - any dart that checks out, and any dart with more than 170 left.
  - Opponent weight: the last dart in 20 on 57 gets a note when solo, and none with the opponent
    on 32.
  - Every first dart of `checkoutTable.ts` (routes and two-dart routes) costs under 5 points,
    except the alternative S19 on 45.
- `aim.test.ts`: scoring-aim attribution, including the 1/3 split by the visit's other darts.
- Frontend: `lib/coach/view.test.ts`. The section is hidden for straight out, double in, teams and
  `50_50`. The picker lists humans only and defaults to `mySeat`.
- A screenshot under `docs/coach/`.

## Out of scope, for later

- Note counts, count cards and filters on the Coach page, which would need a server-side coach
  run stored per game.
- Trends over the last N legs, tips, practice presets, dismissing tips, week-over-week numbers
  (all in the canvas).
- Personal sensitivity: showing what a note cost _this_ player, with σ from their 30-day average
  (`x01AverageSince`, `PROFILE_AVERAGE_DAYS`). The verdicts would still come from the reference.
- σ and bias measured from a player's camera darts. A personal miss direction could change the
  best aim, unlike the spread alone.
- Judging darts with more than 170 left (setting up into the finish from 171–230), and scoring
  aims for weak players. Optimal-aim research says the best scoring aim moves away from T20 as σ
  grows.
- Straight and master out, `50_50` bull, teams.
- Visit and leg grades (Great to Mistake, A–D).
- A generated table of every score's fine and off aims, for reviewing the model's verdicts (we
  parked this idea in brainstorming).
