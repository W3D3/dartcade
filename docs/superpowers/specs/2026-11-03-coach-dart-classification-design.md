# Coach: dart-by-dart classification

Date: 2026-11-03. Status: design approved in chat, spec under review.

This builds on the Coach (`2026-11-02-coach-leg-review-design.md`, PR #449). The branch is
`feat/coach-darts`, cut from `feat/coach`. The PR targets `main`.

## Goal

Give every dart in a coached leg:

- a **category**: what kind of dart it was;
- a **guessed target**: what it was most likely thrown at;
- for anything that isn't a hit, **miss properties**: distance and direction from that target.

Later coach features build on these numbers: per-target spread and bias, success rates per
category, and the player's own σ for the strategy model.

The strategy notes don't change. They keep their benefit of the doubt. The classification
describes **what probably happened**; it never accuses.

## Step 1: the target

One shared function guesses each dart's target from the phase it was thrown in and where it
landed.

**The phase** comes from the score left _before the dart_ and the darts left in the visit:

| Phase       | When               | Candidate targets                                                                                                                                                        |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Scoring** | more than 170 left | T20, T19, T18, T17                                                                                                                                                       |
| **Finish**  | 2–170 left         | the evaluator's top 5 aims for (left, darts left) **∪** the checkout table's first darts for that score **∪** T16 **∪** the aims on the landed number (typed darts only) |

The candidates are then narrowed:

- **The bull.** A dart that landed in the Bull or 25 has the two bull aims (Bull, 25) as its only
  candidates, in both phases. A dart anywhere else has no bull aim, except the Bull on 50 (the
  finishing double there). A dart attributed to that Bull counts only when it landed inside the
  inner single ring; further out it is Wild.
- **The landed number.** For a dart without camera coords (typed, placed at its bed's centre),
  the aims on the number it landed in (its treble, double, both singles and both wires) are
  candidates, so it reads as aimed at its own bed rather than as Wild. A dart with coords meets
  the real candidates only: where it landed, against the aims worth taking.
- **One-dart finishes.** On a one-dart finish (an even score up to 40, or 50) the only double
  that is a candidate is the finishing one. A dart near another double reads as wide of it.
- **Bust aims** (an aim whose likeliest outcome busts) are candidates only when the score is not a
  one-dart finish; on a double you go for it. The finishing double stays one even when its
  likeliest outcome busts (D1 on 2). When busting back is worth at least every other aim, every
  bust aim is a candidate.
- T16 is a candidate for setup shots only, never for scoring.

**The pick.** The target is the candidate aim point _a_ that maximises

```
prior(a) · exp(−d(dart, a)² / 2σ²)
```

- **σ = SIGMA_ATTR = 20 mm** (20/170 board units): an amateur's spread, used only to guess
  targets. The strategy model keeps the reference player's 9.1 mm. With 9.1 mm a 52 mm wide double
  is about 6σ off and loses to any pointless aim on the number it landed in.
- **prior(a):**
  - Scoring: T20 1.0, T19 0.6, T18 0.3, T17 0.3. In the bull: Bull 1, 25 1.
  - Finish: `exp((v(a) − v_best) / τ)`, τ = 0.01, where v is the evaluator's value of the aim
    and v_best the best aim's. The priors are not normalised; only their ratios matter.
  - Floors: the checkout table's first darts and T16 get at least **MIN_PRIOR = exp(−3)**; the
    aims on a typed dart's landed number (and the bull aims for a dart in the bull) get at least
    **LANDED_PRIOR = exp(−6)**. Low enough that a dart about a wedge off a good aim still reads as
    its miss, high enough that one further off isn't Wild.
  - Bust aims, when busting back is best: prior 1.
- **d** is the Euclidean distance in board units:
  - from the dart's `coords` when the camera has them;
  - otherwise from the centre of the bed it landed in (the outer single for a single). Such a
    result is marked `estimated: true`.
- **Wild:** no target when the landed number is more than **2 wedges** from the picked target's
  number, or the dart is a typed miss (no position). There is no distance cutoff; the distance is
  always recorded. Exception: a typed miss on a one-dart finish is a Double attempt at the
  finishing double, `outside`, estimated, without millimetres (on 50: a Bull attempt miss).

All constants (σ, τ, the floors, K = 5, the 2-wedge rule, the Scoring priors) live at the top of
`dartClass.ts`, to be tuned with the admin sandbox.

## Step 2: the category

Decided by the phase, the picked target and the outcome:

| Category           | When                                                                                                                             | Outcome detail                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scoring hit**    | Scoring, landed in the target treble                                                                                             |                                                                                                                                                                             |
| **Scoring single** | Scoring, landed in the target number's single                                                                                    | inner or outer                                                                                                                                                              |
| **Scoring miss**   | Scoring, landed in another number, or in the target number's double                                                              | e.g. 5 or 1 for T20; 12 for T20 is two wedges off                                                                                                                           |
| **Route shot**     | Finish, the target is not the finishing double, a bull aim or a bust aim, and it isn't a split                                   | hit or miss                                                                                                                                                                 |
| **Split shot**     | Finish, the score is a one-dart finish **and** the target's planned leave is one too (38 → S6 to leave D16)                      | hit (left the planned double) or miss                                                                                                                                       |
| **Double attempt** | the target is the finishing double for the score left                                                                            | hit (checkout), inside (its single), outside (0), or wide (a neighbour)                                                                                                     |
| **Bull attempt**   | the target is Bull or 25, in either phase                                                                                        | hit, 25 instead of Bull (`sb`), Bull instead of 25 (`db`), or a miss                                                                                                        |
| **Bust-back**      | the dart busted, the score is not a one-dart finish, and going back to the visit's start was at least as good as every other aim | a deliberate bust. Example: 20 left, S10, S7 → 3 left, bust → back on 20 (D10), which beats S1 leaving 2 (D1). A dart _aimed_ to bust that didn't bust is a Bust-back miss. |
| **Bust**           | the dart busted and it wasn't a Bust-back                                                                                        | keeps its target and miss properties                                                                                                                                        |
| **Wild**           | no target (see Step 1)                                                                                                           |                                                                                                                                                                             |
| **Not counted**    | thrown after a bust in the same visit (the game stores it; it scores nothing)                                                    |                                                                                                                                                                             |

How a bust aim and Bust-back are worked out:

- **An aim that busts:** an aim whose likeliest outcome busts from the current score, e.g. T20
  on 3.
- **"At least as good":** compare `w · nextVisit(visit start)` (the evaluator's bust value)
  with the best value among the aims whose likeliest outcome doesn't bust.
- **Never on a one-dart finish:** a dart thrown on a double is never a Bust-back, even when the
  start is worth more (32 → S16, S10, then a bust on 6 is a Bust).

## Step 3: miss properties

A dart's class is one object: `kind`, `hit`, `target` (`{ aimId, label }` or null), `miss`,
`estimated` and `plannedLeave` / `actualLeave`. Only three kinds carry a `detail`, typed per kind:
Scoring single `inner` / `outer`, Double attempt `inside` / `outside` / `wide`, Bull attempt `sb` /
`db` (null when there is nothing to add: a hit, a typed dart). The miss is a `Miss` object, null
without a position or without a target with a point to miss; its fields are set together:

| Property                               | How                                                                                                                                                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `miss.mm`                              | `d(dart, target) × 170` (r = 1 is the outer double wire, 170 mm)                                                                                                                                                                                                                 |
| `miss.radialMm`                        | the dart's radius minus the target's radius, × 170: **+ outside** (away from the bull), **− inside** (towards it)                                                                                                                                                                |
| `miss.tangentialMm`                    | the target's radius × the signed angle from the target to the dart, × 170: **+ clockwise**, **− anticlockwise**                                                                                                                                                                  |
| `miss.edgeMm`                          | the distance from the dart to the nearest point of the target's **bed**, × 170; 0 inside it. The bed is the aim's radial band (treble, double, inner or outer single) across its number's wedge; the Bull and 25 a whole disc and ring. A wire has no bed: its `edgeMm` is `mm`. |
| `miss.edgeRadialMm` / `…Tangential`    | the vector from that nearest point to the dart, split the same way and with the same signs as `radialMm` / `tangentialMm`; 0 when the dart isn't off that way (a wire's: the centre values)                                                                                      |
| `miss.wedgesOff`                       | the signed wedge distance from the target's number in `SEGS` order: 0, ±1, ±2 …; null around the bull                                                                                                                                                                            |
| `estimated` (on the class)             | true without camera coords (bed-centre position)                                                                                                                                                                                                                                 |
| `plannedLeave` / `actualLeave` (class) | Split, Route, Double and Bull attempts: what the target would have left against what the dart left. For example, planned 32 (D16) and actually left 35.                                                                                                                          |

Every dart with a position and a target gets these, hits too (their `edgeMm` is 0). Wires (the
target `20/1`) use the wire's point as the centre. The centre values feed the stats and the model;
the label uses the edge ones, the miss a player means: a dart just past the treble wire is
"1 mm towards 1", not the 17 mm to the treble's middle. It names the direction with words that
mean the same anywhere on the board: **inside** / **outside** for the radial part and **towards N**
(the neighbouring number on that side) for the tangential part, the larger first, each only above
0.5 mm, the millimetres whole and at least 1. A dart without a position shows "· est." instead of
millimetres.

The nearest point of a bed: inside the wedge's angles, straight in or out to the band (0 in it);
past them, the nearest point of the radial edge on the dart's side (point-to-segment), which is a
corner when the dart is also outside the band. An arc's nearest point past the wedge is its end,
on that edge, so this is exact.

## Visit value

Setup and Doubling visits are graded on what their darts did to the checkout chance, dart by dart
(user ruling, from 59 → Miss, S3, S19 graded OK and 121 → S20, T17, S18 graded "OK · 0 darts at
missed."). Scoring visits keep their rules (see Visit rating).

- **Position value** (`shared/coach/value.ts`, pure, on the visit's shared evaluator from
  `throwEvaluations`): V(left, darts) is the best aim's value from there, with the visit's start
  and w (model.ts: the chance to check out this visit, plus w · the next visit's). V(left, 0) =
  w · nextVisit(left); after a checkout 1; after a bust w · nextVisit(start), the score the bust
  goes back to, so the start's double counts (32 is worth more than 2).
- **A dart's delta** = V(after it) − V(before it), in percentage points (`ReviewDart.delta`). The
  deltas telescope: a visit's sum is V(end) − V(start, 3). For a player of the coaching level
  (see Coaching level: the model's σ) a best-aimed dart's expected delta is 0, so above 0 is better
  than that player would expect from there.
- **Closeness credit** (user ruling: a dart that missed its target grades better the closer it
  was): a dart with a target and camera coords that didn't hit it earns `MISS_CLOSE_MAX ·
  max(0, 1 − edgeMm / MISS_CLOSE_ZERO_MM)` (5 points, 20 mm) in `ReviewDart.closeness`; a hit, a
  typed dart and a dart without a target get none (null). A hit's outcome is already in its delta.
- **A dart's grade** is delta + closeness; **the visit's** is the sum over its walked darts.
- **Order:** (1) a strategy note (not a tip) → Bad, its text; (2) Perfect (fewest darts);
  (3) otherwise by the visit's points on the eight-grade scale (see Eight grades). A bust and a
  Bust-back are graded the same way (user ruling: "a bust can be better than leaving D1": 32 →
  S16, T8 busting back to 32 is Weak at −19, 32 → S16, S8, S6 leaving 2 is Bad at −40); the
  Bust-back class stays on the dart.
- **Texts:** a bust "Busted on 16." / "Busted on purpose to stay on 20 (D10)."; a checkout
  "Checked out on D16." (Perfect keeps its own); a tip-only visit the tip's text (the grade from
  the value); otherwise, when the points are below 0 and the costliest dart lost at least 1 point,
  "S19 on 56 cost 15% checkout chance: 37 left is a single to double (S5 · D16)."; else
  what was left: "32 left is a one-dart finish (D16)." or "169 left: no checkout in three darts.".
  A route is named by its shape (`routeShape`): "one-dart finish" for one dart (D16, Bull), else
  its darts' beds in order: "single to double" (S16 · D16), "treble to double" (T20 · D8),
  "treble to single to bull" (T20 · S11 · Bull), "treble to treble to double"; the 25 is a
  "single bull" ("single bull to double", 25 · D20). The last
  visit of a lost leg with a dart at a double (class Double, or Bull on 50) starts with "Missed the
  match dart. ".
- **Removed:** the missed-doubles count, chased down, the short-finish rule, the leave-based
  OK/Good for setups, bust → Mistake and Bust-back → OK, and the darts-at-the-double counting
  (`doubleDepth`). The leg's doubling stats (`stats.ts` darts at a double) are separate and stay.
- **UI:** the sandbox's Dart classes table has Δ (signed, rounded) and Close columns; the debug
  block shows how the grade was worked out (see Eight grades). The dart tiles' labels don't change.

## Visit rating

A Scoring visit is graded on how accurate it was, not only its score: three S20s in a tight
group beat three scattered ones, and S20s hugging the treble beat S20s in the outer single by the
double. `shared/coach/grouping.ts` (pure) works it out from the visit's walked darts that have
camera coords and a target (at least 2 of them, else no grouping):

| Field      | How                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `darts`    | how many darts it used                                                                                                                            |
| `spreadMm` | their mean distance from their centroid; only when they all share the target `aimId` (else null)                                                  |
| `offsetMm` | the centroid's distance from that shared target's aim point (null without one)                                                                    |
| `edgeMm`   | their mean `edgeMm`: how close they came to their targets' beds                                                                                   |
| `rating`   | `scored + GROUPING_MAX · max(0, 1 − spreadMm / GROUPING_ZERO_MM) + CLOSENESS_MAX · max(0, 1 − edgeMm / CLOSENESS_ZERO_MM)`; a missing part adds 0 |

The constants (one block at the top of `grouping.ts`, to be tuned with the admin sandbox):
GROUPING_MAX 15, GROUPING_ZERO_MM 30, CLOSENESS_MAX 8, CLOSENESS_ZERO_MM 40.

- **Grading:** a Scoring visit compares its rating, not its raw score, with the average
  (the scoring bands of Eight grades). VERY_LOW stays on the raw score. The text still quotes the real
  score; when the rating lifted the grade above the raw score's, it says why: "Scored 60, tight
  group (6 mm), close to the target (7 mm)."
- **Every visit** gets its grouping in `ReviewVisit.grouping` (null without one); only Scoring
  visits are graded on it.
- **The leg** gets the Scoring visits' mean `spreadMm` and `edgeMm` in `LegReview.grouping`
  (each null without any).
- **UI:** the leg review's selected visit shows "Grouping 6 mm (yours: ~14 mm) · 2 mm off T20 ·
  edge 1 mm · rating 75" under What happened; the take's Scoring power line adds " · grouping 12 mm · edge
  4 mm" (desktop); the sandbox shows the visit's grouping line.
- **Grouping comment:** a verdict on the group itself, separate from the rating, judged against the
  player's level. `expectedSpreadMm(average, n)` (`grouping.ts`, pure) is the mean distance from
  the centroid that `n` darts from a player of that 3-dart average would show (the average the
  grades use: 30-day as of the game's finish, else the game's own). `groupingComment(spreadMm,
  expected)` compares the ratio r = spread / expected: `GREAT_GROUP_RATIO` 0.8 → "Great
  grouping", `GOOD_GROUP_RATIO` 1.0 → "Good grouping", `SCATTERED_RATIO` 2.0 (and above) →
  "Scattered"; in between, or without a spread, no comment. Both land in the visit's grouping
  (`expectedSpreadMm`, `comment`), so the client only shows them. Expected over 3 darts: about
  28 mm at a 40 average, 16 mm at 60, 10.5 mm at 81, 7.3 mm at 100; the same 13 mm group is Good
  for the 60 player and unremarkable for the 81. The grade text names the grouping only when the
  comment is Great or Good ("great grouping (6 mm)"), so it never praises a group the pill calls
  Scattered. Shown as a small outlined pill next to the grade pill and tag chip (information, not
  a grade: transparent, a thin neutral border, regular weight, a crosshair icon in Excellent green
  for Great, Good green for Good, Inaccuracy yellow for Scattered) in the
  visit table, the phone cards, the selected visit's card and the sandbox (from its "Your
  average" field); the grouping line adds the expectation: "Grouping 12 mm (yours: ~14 mm) · …".
  The rating's grouping bonus stays absolute.

Examples on a 60 average (S20 × 3, scored 60): clustered 6 mm in the middle of the single rates
74.5 (OK) and scattered 25 mm rates 63.4 (OK); clustered just above the treble rates 78.6 (Good,
"Scored 60, great grouping (6 mm), close to the target (7 mm).") and the same by the double 72.0
(OK). Typed darts have no grouping: the rating is the score.

## Eight grades

User report: "I almost only got OK even though I had some slips". The six grades became eight,
best to worst, after chess.com's move classes: **Perfect, Excellent, Great, Good, OK,
Inaccuracy, Weak, Bad** (`VISIT_GRADES` in `grade.ts`; `perfect | excellent | great | good | ok |
inaccuracy | weak | bad`). Perfect stays the fewest-darts rule and a non-tip strategy note still
makes any visit Bad, whatever its cost (one rule the player can learn, and a note already means
at least `NOTE_THRESHOLD` lost). Every other visit is graded by its value on its tag's scale
(`FINISH_BANDS`, `SCORING_BANDS`, each class from its lower bound, Bad below the last):

| Class      | Setup, Doubling (Σ Δ + closeness) | Scoring (rating − average) |
| ---------- | --------------------------------- | -------------------------- |
| Excellent  | +60 or more (`EXCELLENT_FROM`)    | +50 or more                |
| Great      | +20 to +60 (`GREAT_FROM`)         | +25 to +50                 |
| Good       | +2 to +20 (`GOOD_FROM`)           | +10 to +25                 |
| OK         | −2 to +2 (`OK_FROM`)              | −5 to +10                  |
| Inaccuracy | −15 to −2 (`INACCURACY_FROM`)     | −15 to −5                  |
| Weak       | −20 to −15 (`WEAK_FROM`)          | −30 to −15                 |
| Bad        | below −20                         | below −30                  |

Two scoring rules cap the value's class rather than replace it: a visit under `VERY_LOW` (26)
is Weak at best (it was always Bad; with eight classes a 21 on a 36 average is a slip, not a
blunder, and a 2 still falls to Bad by value), and two or more darts at the 20 spilled into 1 or
5 make it Inaccuracy at best (it was Weak); below Inaccuracy the low-score text wins over the
spill's. A bust is graded by its value as before. The low visits count, the clean leg, the take
and the Setup skill still count Weak and Bad only.

**Calibration** on the dev database's coached legs (the user's 13 games, 16 legs, 114 visits, regraded
with the current model; 61-start test games with typed darts included):

| Class      | Before (6 grades) | After | Of which Scoring / Setup+Doubling |
| ---------- | ----------------- | ----- | --------------------------------- |
| Perfect    | 6                 | 6     | 0 / 6                             |
| Excellent  | –                 | 8     | 4 / 4                             |
| Great      | 11                | 9     | 6 / 3                             |
| Good       | 11                | 16    | 10 / 6                            |
| OK         | 41                | 12    | 4 / 8                             |
| Inaccuracy | –                 | 36    | 1 / 35                            |
| Weak       | 29                | 19    | 8 / 11                            |
| Bad        | 16                | 8     | 1 / 7                             |

Setup visits sat between −9 and +6 (most lose a few points to a single), checkouts between +50
and +72, missed doubles and busts between −4 and −29: OK is now the narrow ±2 band, a setup that
gives away 3–9 points is an Inaccuracy, a whole visit of missed doubles or a cheap bust (−10 to
−15) too, a costly bust Weak, and only big losses Bad. Checkouts split Great (from an easy
finish) and Excellent (a hard one). The bands are named constants in `grade.ts`, to be retuned
as more legs come in.

**Colours** (`--color-grade-*` in `app.css`, one tone map in `lib/coach/tone.ts`): Perfect teal
#1baca6 (filled, dark text, halo), Excellent green #81b64c (filled, dark text), Great blue
#5c8bb0, Good pale green #95b776, OK grey #8f9085, Inaccuracy yellow #f7c631, Weak orange
#e58f2a, Bad red #ca3431; the tinted pills use a lighter `-text` variant, each at least 6.3:1
on its tint over the card (the app is dark only, so there is no light variant). The same map
colours the grade pills, the leg review's eight counts, the checks page legend, the take's skill
letters (A Excellent, B Good, C Weak, D Bad), the Coach page's counts and found pills and the dart
tiles (good Excellent green, even OK grey, slight loss Inaccuracy yellow, costly Weak orange, the
busting dart Bad red).

**How the grade was worked out** (`coach.debug.enabled`, the `VisitNumbers` block): the server
adds `ReviewVisit.value` = `{ points, scoring, rule, startChance }`: the points on the tag's
scale, a Scoring visit's rating parts (scored + grouping bonus + closeness bonus = rating, and the
average), the rule that overrode or capped the value (`perfect`, `note`, `veryLow`, `spill`) and
the checkout chance before the first dart. `gradeWorking` (`lib/coach/numbers.ts`, pure) turns it
into text — "Start: 121 left, 34.0% to check out", "S20: Δ −4.4", "M17: Δ +10.8, closeness +2.3",
"Σ +10.2 → Good (+2 to +20)"; "Scored 60 + grouping 7.5 + closeness 4.0 = rating 71.5", "Your
average: 60.0", "Rating − average = +11.5 → Good (+10 to +25)"; "Perfect: fewest darts — value
ignored" — and a bar of the scale's classes with the bounds labelled and a marker at the visit
(hidden from screen readers: the text says it all).

## Perfect visit

A new top grade, above Great, on any tag (`perfect` in `VisitGrade`). A visit is **Perfect**
when it keeps the fewest-darts finish: `!bust && minDarts(start) === darts + minDarts(left)`,
where `darts` is the visit's walked darts (fewer than 3 on a checkout) and `minDarts(0) = 0`.
`minDarts` (`shared/coach/minDarts.ts`) is a small table, double out (D1–D20 or the bull):
the fewest darts scoring exactly m with any dart, then the best finishing double; 501 is 9,
361 is 7, 330 and 327 are 6, 171 and 159 are 4, 170 is 3, 99 is 3, 100 is 2.

- 501 → T20 T19 T19 (327 left), 171 (330 left) and 180 are Perfect; T20 T20 S20 (361, 7 darts)
  is not. 211 → T20 T20 T17 (40) and T20 T19 T20 (34) are; T20 T20 T20 (31, a 2-dart finish)
  is not. 40 → D20 and 100 → T20 D20 and 170 → T20 T20 Bull are; 40 → S20 D10 is graded by its value (Good).
- It is checked before every other grade rule except the strategy note and the bust: a bust is
  never Perfect, and a note (not a tip) keeps its Mistake.
- Texts: "Checked out in the fewest darts (D20)."; otherwise "Scored 174: 327 left is still a
  6-dart finish, the fewest possible."; on the seat's first visit from 501 leaving a 6-dart
  finish, "Nine-darter still on."
- The grade pill is filled teal with a halo; the leg review's grade counts and the checks page
  list it first. Nothing counts grades as "great or better" today: the skills and the take look at
  Weak and Bad only, so Perfect needs no other wiring.

## Data and UI

- **Data:**
  - `ReviewDart` gains `class: DartClass` (and `delta`, `closeness`: see Visit value), shared by the type, the API schema
    (`schema/api-v1.yaml` + `gen:api`) and the stored review.
  - `ReviewDart.bedAimId` is the AIMS id of the bed the dart landed in (a single's outer bed; null
    off the board), so the client reads a tile's tone, an off-board miss and a hollow pin's spot
    from it instead of parsing the dart's name.
  - `COACH_VERSION` is bumped, so the backfill rebuilds the stored reviews.
- **Leg review:**
  - **Under each dart tile**, a short label: "T20 ✓", "Single 20", "Miss T20 · 14 mm inside, towards 1",
    "Split → D16 ✓", "D16 inside", "Bust-back ✓", "Wild".
  - **In the selected visit's board card**, a faint line from each dart to its target.
  - **The selected visit's card** (400 px wide from 1440 px, sticky while the visit list scrolls;
    inline under its card on phones) keeps the board, the grade, the tag and the "Better:" line,
    and shows the darts as a table: Dart (in its tile's colour), Classification (the tile's label),
    Distance (`edgeMm`, whole mm, to the named target: "4 mm from D16"; "–" for a hit or a dart
    without a position). A missed dart within `NEAR_MISS_MM`
    (5 mm) of its target's bed is tagged "Near miss": on a double, nearly a checkout.
  - **`coach.debug.enabled`** (nobody by default) shows the model's numbers for checking it,
    one block (`VisitNumbers`) under the card and under the live panel's darts: what each dart
    left, every class property, Δ and closeness, the checkout-chance line and the grouping line
    (the aims' checkout % stay for everyone). The admin sandbox always shows it.
  - **Each tile's colour is the dart's own grade** (`dartGrade`: its delta plus closeness credit):
    green (Excellent's) for a hit of its target or +5 and up, plain (OK's grey) above −5, yellow
    (Inaccuracy's) down to −15, orange (Weak's) at −15 or below, red (Bad's) for the busting dart. The bands are grading
    policy: `dartBand` in `shared/coach/grade.ts`, next to `dartGrade`. A dart without a delta
    (Scoring, after a bust) keeps the plain look: treble, double and bull green, single plain,
    miss red-lettered. An off-board miss is dashed in every tone. The tile's screen-reader text
    names the grade ("good", "even", "slight loss", "costly"). One helper (`visitTiles` in
    `lib/coach/dart.ts`, on `dartBand` and its constants `DART_GOOD_FROM`, `DART_PLAIN_ABOVE`,
    `DART_COSTLY_AT`) feeds the leg review, the sandbox and the live panel.
- **Admin sandbox:** shows each placed dart's class with all its properties. This is where the
  numbers get tuned.
- **Code:** pure `backend/src/shared/coach/dartClass.ts` (`classifyDart(throw, ctx) →
  DartClass`), using the evaluator, `checkoutHint`/`CHECKOUTS`, `AIMS` and the board geometry.
  `reviewLeg` attaches the class to each dart.

## Live coach (solo X01)

Behind `coach.live.enabled` (off for everyone by default; the screenshot stack turns it on), a solo
X01 game (one player, straight in, double out) shows the coach while you throw: a side column on
wide screens (1280 px and up), a folded line above the dart slots below that and on phones.

- **Aim now**: the next dart's three best aims (`bestAims` in `lib/coach/sandbox.ts`, w = 1: no
  opponent), each with its chance to check out this visit or the next and what it leaves
  ("T19 · 64% · leaves 67"). Over 170 left nothing checks out soon enough to rank by chance, so it
  shows the three aims with the most points a dart for the coaching level's player (its landing table).
  At level 7: T20, T19, T18.
- **This visit**: each dart as the leg review classes it (`dartLabel`), with its change in checkout
  chance and its near-miss credit (`value.ts`); none on a scoring visit.
- **Last visit**: once the visit is done (three darts, a bust or a checkout) its grade and line from
  `reviewLeg`, kept until the next visit's first dart.
- The average it grades against: your 30-day X01 average from your profile, else this game's, else
  none (the visit's own).
- `lib/coach/live.ts` and the panel load in a lazy chunk, only once the panel shows; the panel then
  fetches the landing table of your coaching level only (from your 30-day average; level 7 until
  the profile arrives or without one) and says "Coached as a 46 average.".

## Coaching level

The checkout model (notes, dart classes' finish priors, values and deltas, the costs quoted, the
setup leave reasons, the opponents' w) exists for every bot level 1–10, and the coach judges a
player with the model of the level just above their own average (user ruling: "the one higher than
the user's average to coach them into getting better": a 40 average was happy with 60 on 100,
which the 81-average model called a loss).

- **Tables:** `npm run gen:coach` (`src/coach/genLanding.ts`) writes
  `shared/coach/landing/level-N.gen.ts` per level: 40,000 seeded throws per aim with that level's
  `LEVEL_SIGMA` and the bots' `SIGMA_JITTER` (the same Monte Carlo as before; level 7's numbers are
  the old `landing.gen.ts`'s, byte for byte). 19–84 kB of source each (level 1 is widest), 11–52 kB
  minified, 2.6–10 kB gzipped.
- **The model** (`model.ts`): `coachModel(level, landing)` builds a level's finish table, nextVisit
  and evaluator; `loadModel(level)` imports a level's table lazily (one chunk each in the SPA) and
  builds its model once. Everything that coaches takes the model explicitly (`throwsOf`,
  `throwEvaluations`, `strategyNotes`, `dartDeltas`, `reviewLeg`'s `ctx.model`, the sandbox and the
  live panel).
- **`coachLevel(average)`:** the level whose `LEVEL_AVERAGE` is the smallest one strictly above the
  average (40 → level 3, 46; 80 → level 7, 81; 81 → level 8, 90); level 10 at or above 105; level 7
  (`DEFAULT_COACH_LEVEL`) without an average.
- **Reviews:** the level comes from the same 30-day average (as of the game's finish) the scoring
  grades use, and is stored in the review JSON (`LegReview.coachLevel`, no migration), so a review
  doesn't shift when the average changes; the leg review says "Coached as a 46 average".
- **Unchanged by the level:** the grade thresholds, Perfect (`minDarts`), the scoring grades
  against the average, the grouping comment's own average-based expectation, and the dart classes'
  attribution σ (`SIGMA_ATTR`).
- **Sandbox:** "Your average" picks the level the same way and shows "Coaching level: 3 (≈ 46
  average)".

## Testing

- **Unit tests** for each category with built darts, with and without coords:
  - S5 and S12 in Scoring → a miss of T20 (wedgesOff −1 and −2);
  - a dart near the centre on 50 → a Bull attempt;
  - 38 → S6 → a Split hit leaving D16;
  - D16 inside, outside and wide;
  - the 20 → S10, S7, bust → Bust-back;
  - a dart aimed to bust that didn't → a Bust-back miss;
  - a far dart → Wild;
  - a dart after a bust → Not counted.
- **Property tests:** the signs of `radialMm` and `tangentialMm` against known board positions;
  `miss.mm` against the geometry.
- **Grading:** the value's telescoping, a checkout's 1 and a bust's start (`value.test.ts`); the two
  user cases, a close and a far miss of the same double, busting back to 32 against leaving 2
  (`grade.test.ts`).
- **Seed:** the scripted coach games get their darts' classes pinned.

## Out of scope, for later

- Aggregating the classes into spread and bias per target, tips, and the player's own σ in the
  model. These consume this data later.
- Using the player's own σ in the target pick. It uses a fixed 20 mm (SIGMA_ATTR) for now.

## Assumptions

Decisions taken while building this without the user, each with why:

- **No distance cutoff for Wild; only the 2-wedge rule and typed misses.** A 3σ cutoff turned
  real wide doubles (about 50 mm, one wedge) into Wild and contradicted this spec's own examples.
  Cost: a few genuinely wild darts get a target up to 2 wedges away.
- **σ for the pick is 20 mm, not the reference 9.1 mm, with a sharp prior (τ = 0.01).** With 9.1 mm
  a one-wedge miss is about 6σ and any aim on the landed number wins (S8 on 32); the intent is
  "the closest big number, or the double you were on".
- **The checkout table's first darts and T16 get a floor of exp(−3)**, inside the top 5 too, so
  the book route is always considered.
- **The aims on the landed number are candidates for typed darts only, at a lower floor exp(−6).**
  A typed dart has no position, so without them S20 on 57, S1 on 47 and T10 on 77 read Wild; with
  the higher floor a one-wedge miss of the best aim read as a hit of the landed bed. For a dart
  with coords they made any dart far from every real aim a hit of its own bed: on 140 with 2 darts
  (no finish this visit) a dart in the middle of the S13 read "Aimed S13 ✓", when the player was
  scoring. With coords it now reads as a miss of T18, two wedges off, and the same three at their
  bed centres read Wild. A value margin (own aims only within 0.15 of the best) was rejected: S20
  on 57 needs 0.148, and 140's D13 and T13 are 0.129 and 0.102 off, so S13 read "Aimed D13".
- **A single is one aim in either bed** (user report): when the outer or inner single of a number
  is a candidate, so is the other bed, at the same prior. On 70 → S18 with the opponent on 40, the
  inner S12 (leaving D20) read as a T12 miss: only the outer S12 made the top 5, and the inner
  single is nearer the treble than the outer single's point.
- **On a one-dart finish the only double candidate is the finishing one.** Otherwise a wide D16
  miss into D8 on 32 reads as a Split hit. Cost: a deliberate double-to-double split reads as a
  wide double. Accepted: 34 → D2 reads as S2 and 36 → D4 as S4 (plausible splits to 32).
- **The finishing double stays a candidate even when its likeliest outcome busts** (D1 on 2).
- **Bust aims are candidates only off a one-dart finish, and when busting back is best all of
  them are, at prior 1.** S7 on 10 read as a Bust-back; ties in the top 5 gave a typed T20 busting
  on 3 the target T12.
- **No Bust-back on a one-dart finish, for the busting dart too**: on a double you go for it.
- **Split needs both the score and the target's planned leave to be one-dart finishes.** "S3 on
  50: Split ✓" was misleading; that is a Route (typed; with coords it is Wild).
- **A dart in the Bull or 25 has the bull aims only, in both phases; a dart elsewhere has none,
  except the Bull on 50**, where an inner single next to the bull is a Bull attempt miss. Before,
  a bull in Scoring (501 → Bull) and 13 finish states read Wild. On a finish the evaluator decides
  between Bull and 25 (on 60 a Bull reads as the 25's miss, `db`).
- **A player's expected spread comes from the bot calibration.** `LEVEL_SIGMA` (per-axis aiming
  σ, board units) and `LEVEL_AVERAGE` (`shared/botLevels.ts`, one source for the bots and the
  coach) map an average to σ, log-linear in σ between levels and clamped outside 30–105. For a
  normal spread of σ per axis, `n` darts sit on average σ·√((n−1)/n)·√(π/2) from their own
  centroid (≈ 1.02σ for 3 darts, 0.89σ for 2), × 170 mm per unit, × e^(J²/2) ≈ 1.13 for the bots'
  log-normal per-dart jitter (`SIGMA_JITTER` J = 0.5, also in `shared/botLevels.ts`): a level's
  darts are on average that much wider than its σ.
- **The comment ratios (0.8 / 1.0 / 2.0) are set so Good means at or better than your level's
  usual group, Great clearly better, and Scattered twice as wide.** Below a 30 average the
  expectation is clamped at level 1's ~35 mm, so a beginner's 29 mm spray still reads Good.
- **A dart attributed to the Bull on 50 that landed outside the inner single ring is Wild**: the
  wedge rule can't apply to the bull, and 100 mm "Bull misses" would poison the stats.
- **In Scoring, a dart in the target number's double (D20 aiming T20) is a Scoring miss**
  (radially high, 0 wedges off).
- **A Double attempt that lands off the board next to another number reads `outside`.**
- **A typed miss on a one-dart finish is a Double attempt, `outside`, estimated, without mm**
  ("D16 outside · est."); on 50 a Bull attempt miss. In Scoring and on a route it stays Wild.
- **Direction words are position-independent**: inside/outside and "towards N". Left/right and
  high/low are wrong on the lower half of the board.
- **A bull miss that isn't `sb`/`db` reads "Miss Bull · N mm"**: around the bull a direction means
  little.
- **A miss without a position shows "· est." instead of millimetres**: the bed centre would make
  the millimetres up.
- **A bounce-out has no position** (issue #458): Board Manager has sent bounce-outs as a Miss at
  {0, 0}, which read as "Miss Bull · 1 mm" and drew a bull note. The coach reads every stored and
  live dart through `coachDart` (`walk.ts`), the same rule as the bridge and `parseBoardEvent`
  (`board.ts` `withoutFalsePosition`): a bouncer, or an Outside dart within the outer double wire,
  has no coords. It is then a typed-style miss ("D10 outside · est." on 20 with a dart).
- **Labels measure a miss from the edge of the target's bed**, not its centre (user ruling): a dart
  just past the treble wire is a 1 mm miss to a player. The centre values stay for the stats.
- **The rating's constants** (GROUPING_MAX 15 / GROUPING_ZERO_MM 30, CLOSENESS_MAX 8 /
  CLOSENESS_ZERO_MM 40) are first guesses: at most 23 points, so a tight group lifts a visit about
  one grade step, never two.
- **VERY_LOW stays on the raw score**: a 26 isn't rescued by a tight group.
- **Grouping needs a shared target**: T20 then T19 after a blocked bed is a switch, not a group,
  so the spread and offset are null; the closeness still counts.
- **Grouping needs at least 2 darts with camera coords and a target**: typed darts sit at their
  bed's centre, which would fake a perfect group. Wild darts (no target) are left out.
- **The seed's scripted darts sit at their bed's centre with coords**, so the coach's seed test
  places them there too; Luke's T20, S20, S20 (100 on an 88 average) now grades Good, not OK.
- **Stored reviews from an older `COACH_VERSION` aren't served**; they take the rebuild path, since
  the API's required `class` would refuse them.

- **The worst grade is Bad** (user ruling), `bad` in the code and the API since the eight grades
  (it was `mistake`).
- **Perfect: the note wins.** A visit with a strategy note (not a tip) stays Bad even if it
  kept the fewest darts: the coach doesn't call a visit perfect while saying another aim was
  better. A tip-only visit can still be Perfect, and keeps the Perfect line (as a checkout keeps
  its own line over a tip); the tip still shows in the visit's note.
- **"Nine-darter still on." only on the seat's first visit from 501**: a later visit on 501 (after
  a zero visit, or in a 701 game) can't be on a nine-darter.

- **Visit value: the thresholds (+15 / +5 / −10 / −20) and the closeness credit (5 points, 20 mm)
  are first guesses**, to be tuned in the sandbox. Three typed misses at D16 from 32 are −19
  (Weak); S16, S8, S4 chasing it down to 4 is −23.5 (Mistake); a camera visit of three misses 2 mm
  outside D16 earns +13.5 back and is OK.
- **The reference player is the coaching level's**: the level one above the seat's 30-day average
  (Coaching level), so the grade says how the darts compare with a slightly better player from the
  same spot. At level 7 (an 80 average) a checkout from an easy finish is Good (32 → S16, D8:
  +7.6), from a hard one Great (81 → T19, S12, D6: +21); for a 40 average (level 3) 32 → S16, S8,
  D4 is Great (+41.9) and 100 → S20, S20, S20 Good (+9.3, OK at level 7: −2.7).
- **Coaching level: one above, not the player's own level** (the user's choice). A player exactly
  on a level's average is coached by the next one up; a player with no 30-day average by level 7,
  as before (their scoring grades still use the game's average). The opponents' threat (w) uses the
  same level's model: their real level isn't known.
- **The level is stored per leg**, inside the review JSON: a rebuild (COACH_VERSION) recomputes it
  from the average as of the game's finish, so it stays the same.
- **The live panel fetches level 7 first** when the player's profile hasn't loaded yet (or never
  will, with progression off), then the right level's table.
- **A tip keeps the value's grade** and shows its text; a bust's or checkout's text wins over a tip.
- **The costliest dart is picked by its delta alone** (the cost quoted is checkout chance), and only
  named when the visit's points are below 0 and that dart lost at least 1 point.
- **The match-dart prefix needs a dart classed Double (or Bull on 50) on a one-dart finish**; it no
  longer changes the grade.
- **A visit still in progress** (the sandbox) ends on the next dart's value, not the next visit's.
- **Dart colours replace "a single on a one-dart finish is red"** (user ruling): a miss just
  outside D10 on 20 isn't a disaster. With the third dart on 20: a miss 10 mm outside D10 is −5.6
  (gold), S15 leaving 5 is −24.6 (red), a D15 bust red. The closeness credit can lift a miss
  within about 7 mm of the wire to plain, and earlier darts lose less: with the first dart on 20
  a miss outside D10 is about −1 (plain) and S15 −14.5 (gold). The thresholds (±5, −15) are first
  guesses, like the visit's.

### Open questions for the user

1. **Scoring darts more than 2 wedges from 20/19/18/17** (the 8, 9, 11, 14) read Wild with no
   distance. Keep that, or attribute them to the nearest scoring treble anyway?
2. **Tuning constants to try in the sandbox:** σ (20 mm), τ (0.01), MIN_PRIOR (exp(−3)),
   LANDED_PRIOR (exp(−6)), the 2-wedge Wild rule, K = 5 and the Scoring priors (1, 0.6, 0.3, 0.3).
