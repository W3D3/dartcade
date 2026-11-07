# Coach: X01 leg review

Date: 2026-11-02, revised the same day after PR #449's first version. Status: design approved.

## Goal

The Coach from the design canvas (`project/Coach-*.dc.html`), Review side first. After a
finished X01 game, a player opens the **Coach page**, sees their recent legs with what the coach
found, and opens a **leg review** that grades every visit and shows where the darts landed.

The coach judges two things:

- **Execution:** how well the darts went where they were meant to (scoring, doubles).
- **Strategy:** on a finish, whether the number thrown at was a good choice.

**The artboards are the scope floor.** These are built as drawn:

- `Coach-Review.dc.html`: the Coach page's Review tab.
- `Coach-Leg.dc.html`: the leg review, desktop.
- `Coach-Phone-Leg.dc.html`: the leg review, phone.
- `Coach-Mistakes.dc.html`: "What the coach detects", the reference page linked from Review,
  listing the checks this version runs.

Two things are left out this round, because they need data from many games or features that
don't exist yet:

- the Recommendations / Tips tab (`Coach-Recommendations.dc.html`, `Coach-Phone.dc.html`);
- in the leg review, the streak callout, "Open recommendation", the Coach badge and
  "Practise doubles".

They are listed at the end.

**Also added:** an admin-only **Coach sandbox** (`#/admin/coach`). It isn't in the canvas.

## Which games

The coach reviews X01 games that meet all of these:

- `inMode: 'straight'`, `outMode: 'double'`, `bullValue: '25_50'`;
- singles (not teams);
- finished.

It reviews each human seat with an account. Everything is behind the `coach.enabled` flag
(default: admins).

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
  The candidate aims are every aim point on the number the dart landed in or on either of its
  neighbours on the board:
  - for a dart in 20: the trebles, doubles and both singles of 5, 20 and 1, plus every wire that
    touches one of them (12/5, 5/20, 20/1, 1/18);
  - for a dart in 25 or the bull, those two;
  - for a single near the middle (inside the inner single ring, or typed in without a position),
    the bull and 25 as well;
  - for a dart off the board, the number it missed next to (`M<n>` from `segmentAt`); a miss we
    can't place is skipped.

  The coach takes the best candidate, so a good plan that was badly thrown never gets a note.

  Why the neighbours: drifting a wedge sideways is the most common miss there is. With only the
  landed number as candidates, a probe over every score from 2 to 170 with 1–3 darts found that
  a dart in a number next to the best aim's got a note in 703 of 926 (76%); on 2, with D1
  the best aim, a dart in 20 or 18 got a 17-point note. With the neighbours, none of those get a
  note, and wrong numbers further away still do (about a third of those landings).

  Why the bull and 25 for a single near the middle: a dart thrown at either spreads into every
  inner single around it, not only into one number and its neighbours. Without them, the same
  probe found that a dart in an inner single, when the bull or 25 was the best aim, got a note in
  113 of 880 (13%): 162 → T20, S20, S19 got "On 82, S19: better Bull". With them, none do. A
  single typed in without a position gets the same benefit of the doubt, since nothing says it
  wasn't near the middle; its notes for other aims cost a little less (57/1 in 20: about 7 points
  instead of 14).

- **The coach judges the number and its neighbours, not the bed.** Because of benefit of the
  doubt, a dart is judged by the number it landed in and its neighbours (and the bull and 25 for
  a single near the middle).
  - It catches a **wrong number** away from the best aim: S20 on 57, when S17 leaves 40.
  - It can't catch a **wrong bed on the right number**: T1 on 3, T20 on 60, S16 on 32. S1, S20 and
    D16 are candidates for those darts, so the coach assumes the player aimed there and missed.
  - Nor a **neighbour of the right number**: S20 or S18 on 2, S8 or S7 on 32.
  - Telling those apart needs the player's own spread and camera positions, which is later work.

- **Note.** The dart gets a note when the best aim overall is **5 or more points** of checkout
  chance better than the best candidate.

  In the prototype, at the reference level with no opponent near a finish (w = 1), 5 points
  separates clear mistakes from near-ties. Gaps are best aim overall against the best candidate
  (on the landed number or a neighbour):

  | Dart (score left / darts left, number landed in)                                                       | Gap in points |
  | ------------------------------------------------------------------------------------------------------ | ------------- |
  | 7/3 in 14, 3/3 in 5                                                                                    | 12–20         |
  | 57/1 in 20                                                                                             | about 14      |
  | 47/2 in 1, 47/1 in 20, 57/2 in 20, 35/1 in 20                                                          | 7–9           |
  | 23/2 in 20, 57/3 in 20                                                                                 | 5–6.3         |
  | 7/3 in 20, 48/1 in 20, 64/2 in 20, 100/3 in 19, 81/3 in 20                                             | 2.8–4.4       |
  | 41/1, 41/2, 41/3 in 20, 99/3 in 20, 65/3 in the bull, 90/3 in 18                                       | 0.3–1.4       |
  | 3/3 and 5/3 in 20, 33/1 and 29/1 in 20, 2/3 in 20, 32/3 in 8, 119/3, 131/3, 60/3, 40/3 in 20, 3/3 in 1 | 0             |

  Every first dart in `checkoutTable.ts`, 185 routes, is within 4.6 points of the best (the
  alternative S19 · D13 on 45 is the closest call). The test cases below pin the clear rows on
  both sides, and stay away from the borderline ones.

- **Note text.** The note names the better aim and why. The why is what the dart itself did, never
  the benefit-of-the-doubt aim (which can sit on a neighbour the dart didn't hit):
  - "S14 busts" (a dart in 14 on 7);
  - "S20 leaves 37, with no one-dart finish" (the last dart of the visit);
  - "S20 leaves 3, which one dart can't finish" (darts still to come);
  - "S11 leaves 159, which one visit can't finish" (the last dart, on a bogey);
  - none when the score it leaves is fine on its own (S20 on 32 leaves 12).

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

### Tips: setting up instead of going out

A strategy note is a **Tip** (the canvas's "Info: worth knowing, not graded"), not a Mistake, when
the better aim is simply the **direct one-dart out** for the score left (not some other, better
setup), nobody threatens to finish first, and the dart didn't bust — a bust is already its own
Mistake, never a setup choice.

- **"On an out"** means an opponent's score left can be checked out in three darts (2–170, and
  not 159, 162, 163, 165, 166, 168 or 169).

It only shows on a **Doubling** visit, as the visit's own text, when it's the costliest note and
the visit didn't check out (a checkout keeps its own "Checked out on …" line).

## Visit classification

Every visit gets one **tag** and one **grade**, as in `Coach-Leg.dc.html`.

**Tag**, by the score left before each dart (see `2026-11-07-coach-per-dart-judging.md`: a visit takes
every phase it went through, not the one of its start):

- **Scoring**: more than 170.
- **Doubling**: at least one dart of the visit was thrown on a one-dart finish (an even number up
  to 40, or 50).
- **Setup**: otherwise.

**Grade.** The worst rule that matches wins. A strategy note that isn't a Tip is checked first and
makes **any** visit — Scoring, Setup or Doubling — a Mistake, before the tag's own rules below. The
good grades (Great, Good) only apply when no bad rule matched.

| Grade       | Scoring                                                      | Setup                  | Doubling                                                                                                                                         |
| ----------- | ------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mistake** | scored under 26                                              | bust                   | bust · a missed match dart, when the visit did not leave a double                                                                                |
| **Weak**    | 25+ below your average visit · 2+ darts at 20 land in 1 or 5 | —                      | 2+ darts at a double, none hit · a missed match dart that still left a double · chased down to D1 or D2 (`32 → 16 → 8 → 4 → 2` by misses inside) |
| **Great**   | 40+ above your average visit                                 | —                      | checked out                                                                                                                                      |
| **Good**    | 15+ above your average visit                                 | left a one-dart finish | —                                                                                                                                                |
| **OK**      | anything else                                                | anything else          | anything else                                                                                                                                    |

Definitions:

- **"Your average visit"** is your **30-day X01 3-dart average** at the time the game finished
  (`x01AverageSince(db, userId, PROFILE_AVERAGE_DAYS)`). For a player without one, it's this
  game's own average.
- **A missed match dart** is a dart at a double, in a visit that didn't check out, in a leg the
  opponent then won.
- **A Tip** doesn't change the grade. It shows as a note with the canvas's blue Info style.

All thresholds (26, 25, 40, 15, the 5-point note threshold) are named constants in one file
(`shared/coach/grade.ts`). The numbers will be tuned later with the sandbox.

**Visit note.** Each visit row has one line of text, as on the artboard:

- **Scoring:** "Scored 41; your usual visit is 64." Great visits: "Two trebles." when it applies,
  else "Scored 140."
- **Setup with a note:** what happened and the better aim, from the strategy note: "After T20 you
  had 16 left, a double. The last dart took it to 15, which has no double." When no note
  applies: "95 left is a 2-dart finish (T19 · D19)", from `checkoutHint`.
- **Doubling:** "2 darts at D4 missed (S4 inside, then outside)", or "Checked out on D16".

The note sentences are templates over the note's fields (dart, leave, better aim, reason), in our
own words.

## Leg grades and the coach's take

`Coach-Leg.dc.html` shows three grade rows, A–D, each with a sub-line.

| Skill             | Measure                                                          | A     | B          | C          | D         |
| ----------------- | ---------------------------------------------------------------- | ----- | ---------- | ---------- | --------- |
| **Scoring power** | the leg's average until 170, against your average                | ≥ +10 | within ±10 | −10 to −25 | below −25 |
| **Setup shots**   | share of setup visits without a strategy note (Tips don't count) | 100%  | ≥ 75%      | ≥ 50%      | below     |
| **Doubling**      | doubles hit out of darts at a double                             | ≥ 40% | ≥ 25%      | ≥ 10%      | below     |

- **Sub-lines**, as drawn: "Leg average 71.0 · one low visit", "1 of 2 setup visits left a bad
  number", "0 of 5 darts at a double".
- **No data:** a skill shows "–" when it had nothing to judge (no setup visits, no darts at a
  double).

**The coach's take** is one or more sentences built from the leg:

- the result (won in N darts, on a finish and still lost, lost to a checkout, or nobody checked
  out);
- the biggest factor: when a skill is graded C or D, what dragged it down ("The scoring held you
  back.", "N bad setup visits.", "N missed doubles."); otherwise, `A clean leg.`
  when no visit graded Weak or Mistake (the **clean-leg rule**), else the fault count — one clause
  per grade that fired, Mistakes before Weak visits, joined with "and": "One mistake and one weak
  visit.";
- plus the leg patterns from `Coach-Mistakes`, each when it fires:
  - **Long finish:** more than 9 darts from first reaching 170 or less to checking out;
  - **Lost on a finish:** the opponent checks out while you're on a two-dart finish or less;
  - **Late-leg drop:** visits 4 and later average 20+ less than visits 1–3.

Example: "You were on a finish after 15 darts and still lost. One mistake and one weak visit."

"Slow start" needs a personal First 9 baseline and is left out.

## Pages

### Coach page: Review tab (`#/coach`)

As `Coach-Review.dc.html`.

- **Header:**
  - H1 "Coach";
  - the subtitle "A second look at any of your last 50 X01 legs.", reworded because there are no
    tips yet;
  - "Updated after your last game · <time>".
- **Tabs:** the canvas's big tabs, with **Review** only, carrying a pill with the leg count ("50
  legs"). The Recommendations tab is hidden until it exists.
- **Count cards**, over your last 50 coached legs:
  - Low visits: visits graded Weak or Mistake for scoring;
  - Bad setups: setup visits graded Mistake (shown as Bad), for a strategy note or by their
    checkout chance, the same visits as the Setup skill's line;
  - Missed doubles: darts at a double that missed;
  - Clean legs: legs with no Weak or Mistake visit.

  Colours as drawn.

- **Filters:** All legs / Lost / Ranked / Missed doubles / Bad setups / Low visits. Each filter
  is server-side, over the stored rows.
- **The legs table:** When · Leg (opponents, or Solo, with "501 · <lobby or Ranked> · leg N") ·
  Result pill · Darts · Avg · Coach found · a **Review** button.
  - "Coach found" holds the tag pills, as drawn: "2 missed doubles", "1 bad setup", "Clean leg".
  - **Show more** pages by 40, as drawn ("Show 40 more legs").
- **"What the coach detects →"** links to `#/coach/checks`, which is `Coach-Mistakes.dc.html` with
  the checks this version runs. Those are the ones in this spec, with each check's label, source
  and an example. Checks we don't run are left off.
- **Phone:** the canvas has no phone version of the leg list, so the desktop list stacks: each
  row becomes a card with the same fields, and the count cards become a 2×2 grid.

### Leg review (`#/coach/leg/:gameId/:leg`)

As `Coach-Leg.dc.html` (desktop) and `Coach-Phone-Leg.dc.html` (phone).

- **Header:**
  - the breadcrumb "← Review";
  - the H1 "Leg 3 vs Lena";
  - the subtitle "501 · double out · <lobby> · <when> · lost, Lena checked out in 21 darts";
  - a **Match details** button to `#/history/<id>`.
- **Coach's take:** the card with the take, plus the three A–D grade rows.
- **Every visit:**
  - the legend with the count of each grade;
  - filter chips (All N / Scoring / Setup / Doubling);
  - the visit table: # · Left · Darts (dart tiles, styled by bed as drawn) · Scored · Then ·
    Coach (grade pill, tag, note).

  Clicking a row selects it.

- **Selected-visit card** (right rail; on a phone, it opens under the tapped visit card):
  - "Visit N · X left", plus the grade pill;
  - **the board diagram**: the full board with the visit's darts where they landed, from camera
    `coords`, or the bed's centre for typed-in darts, drawn hollow to show they're estimates;
  - the **better aim** highlighted in the canvas's blue (#9ec8ff), with its likely misses
    labelled ("a miss into S8 still leaves 8 = D4");
  - "What happened: S19 (76 left), T20 (16 left), S1 (15 left)." and "Better: …" in blue. The
    dart that busted reads "T20 bust"; darts the game kept after it read "D8 (not counted)" (the
    review marks each dart's `bust`, from the same walk the notes use, and leaves the darts after
    a bust on the visit's start);
  - **← Visit N−1 / Visit N+1 →**.

  It reuses the details page's board drawing (`HeatBoard.svelte` / `boardGeometry.ts`) rather
  than a new SVG.

- **Phone:**
  - the 3-up grade row (letter + skill);
  - the take as a paragraph;
  - the chips;
  - stacked visit cards ("501 → 361", the dart tiles, the grade pill, the tag, the note).
- **Match details** links here: a "Coach review" link per leg on the X01 details page, behind the
  flag. The details-page section from #449's first version is removed.

### Coach sandbox (admin, `#/admin/coach`)

Not in the canvas. It's a tool page in the admin hub (`lib/admin/tools.ts`), gated like the other
admin pages.

- **Inputs:**
  - the score left at the start of the visit;
  - optionally, the opponent's score left (empty means no opponent);
  - your average, which feeds the scoring grades.
- **Throwing:** up to three darts on a board: click to place, with the position. Undo and clear
  are available.
- **Output:**
  - the visit's **tag and grade**, as in the leg review;
  - **each dart's note or tip**, with the better aim, the reason, the cost and the book route;
  - for the _next_ dart, the **top 5 aims** with their checkout chances;
  - the selected-visit board card, reused, with the better aim highlighted.
- **It runs in the browser** on the shared code (`classifyVisit`, the evaluator). It makes no API
  calls.

## Storage and API

Reviews are computed **once when a game finishes** and stored, the same way `storedDetail` does it
(`history/detail.ts`).

- **The table `coach_legs`** (migration `047_coach_legs.sql`) has one row per (game, leg, human
  seat with an account):
  - `user_id`, `game_id`, `leg`, `seat`, `finished_at`;
  - `won`, `ranked`, `darts`, `average`;
  - the counts: `low_visits`, `bad_setups`, `missed_doubles`, `clean`;
  - `opponents`: names, for the list; `winner_name`, `winner_darts`: the leg's winner and their
    darts (null on a round-limit cut-off with no winner), stored at build for the leg review's
    subtitle ("lost, Lena checked out in 21 darts");
  - `context`: the lobby or ranked line, for the leg heading;
  - `review`: JSON, the full leg review the page renders (visits with darts and coords, tags,
    grades, notes, tips, leg grades, the take);
  - `version`: the `COACH_VERSION` that built it.

- **When it's built:** in the game-finished hook in `backend/src/index.ts`, next to
  `storedDetail` (`backend/src/coach/store.ts`, `buildCoachLegs`). The average is each seat's
  `x01AverageSince` as of the game's `finished_at`, so a later rebuild grades the leg the same way.
  The build yields to the event loop before each leg's review, so a long game doesn't stall live
  sockets.
- **Rebuilds:** stale or missing rows (an older `version`, or a game finished before this shipped)
  are rebuilt lazily, capped at the 10 most recently finished coachable games per request
  (`ensureCoachLegs`) — enough to catch up a list or a leg request without delaying it. The rest
  catch up in the background: `backfillCoachLegs` runs once at boot, newest first, pausing 50 ms
  between games so it never gets ahead of live requests. Bumping `COACH_VERSION` rebuilds
  everything.
- **Invalidation:** games that are invalidated (`game_sessions.invalidated_at`) are left out of the
  list and the counts.
- **The API**, in `schema/api-v1.yaml`, then `npm run gen:api`:
  - `GET /api/coach/legs?filter=&cursor=` returns `{ counts, legs, nextCursor, updatedAt }`. The
    counts cover the last 50 legs.
  - `GET /api/coach/legs/{gameId}/{leg}` returns the leg review for your own seat, or 404. When
    the row is missing, it first builds the game's rows (`ensureCoachGame`) if it's your finished,
    valid, coachable game without rows of this version, so the details page's link works before
    the backfill gets there. The link is hidden for an invalidated game.
  - Both are behind `coach.enabled`, and only for your own legs.

The model runs on the server at game end. It takes about 0.3 s for a long game. It runs after the
game is stored, so it doesn't delay the finish.

## Code

```
backend/src/shared/coach/   (pure, shared by backend and frontend)
  aims.ts, landing.gen.ts, model.ts, walk.ts, visitStart.ts, aim.ts   model (unchanged)
  notes.ts      strategy notes; adds the Tip flag (going-out note while no opponent is on an out)
  grade.ts      NEW: thresholds, classifyVisit(), legGrades(), coachTake(), visit note text
  review.ts     NEW: reviewLeg(leg, seat, ctx) → LegReview (the stored JSON), legCounts()
  stats.ts      execution stats (kept; feeds leg grades)
  index.ts      exports
backend/src/coach/          genLanding.ts (unchanged); store.ts NEW (build/rebuild coach_legs)
backend/src/api/coach.ts    NEW: the two routes
backend/frontend/src/routes/Coach.svelte          rewritten: Review tab
backend/frontend/src/routes/CoachLeg.svelte       NEW: leg review
backend/frontend/src/routes/CoachChecks.svelte    NEW: what the coach detects
backend/frontend/src/routes/AdminCoach.svelte     NEW: sandbox
backend/frontend/src/lib/components/coach/        visit table/cards, grade pill, dart tile,
                                                  board card, take card, count cards
```

- **Removed from #449's first version:**
  - `CoachSection.svelte` and `CoachLegs.svelte` on the details page;
  - the client-side `coachGame` view;
  - `missTendencies` and the "where you miss" UI. No artboard shows them, and they come back with
    the Recommendations tab.

  The model, the walk, the notes, the seed games and the flag stay.

- **Shared components:** the dart tile, the grade pill and the board card are shared by the leg
  review and the sandbox.

## Testing

- **The model** keeps its tests (`model`, `walk`, `aim`, `notes`, `stats`).
- **`grade.test.ts`** has one case per row of the grade table, the Tip rule (with and without an
  opponent on an out), the missed match dart (Weak when it left a double, Mistake when not), and
  the leg-grade cut points with the "–" case.
- **`review.test.ts`** checks a built leg against an expected `LegReview`: tags, grades, counts,
  the take.
- **Seed games** (`coachGames.test.ts`) also pin each scripted visit's grade.
- **API tests** (DB) cover:
  - rows built at game end;
  - lazy rebuild on a version bump;
  - the filters;
  - only your own legs;
  - invalidated games left out;
  - 404 for another player's leg.
- **The frontend** gets unit tests for the view helpers (labels, pills, filters).
- **Screenshots** under `docs/coach/`: the Review tab, the leg review (desktop and phone) and the
  sandbox. The visual-regression baseline doesn't change, because the flag is off there.

## Out of scope, for later

- **The Recommendations / Tips tab:**
  - skills over the last 50 legs against the 50 before;
  - tips with dismiss;
  - practice presets;
  - the Coach badge;
  - the streak callout and "Open recommendation" in the leg review;
  - "Practise doubles".
- **Checks needing a personal baseline by stage of the leg** (Slow start), and the
  dart-position or estimated checks: Covered treble, Miss outside, No re-plan, Setup instead of a
  finish as its own check.
- **Higher bogeys and judging darts above 170:** an expected-darts-to-finish model up to 501
  (dartscheckoutassistant.com's "reaching a checkout" guide).
- **Personal spread and bias** from camera darts.
- **Wrong bed on the right number** (T1 on 3) and **a neighbour of the right number** (S20 on 2),
  which benefit of the doubt hides.
- **Straight and master out, `50_50` bull, teams.**
