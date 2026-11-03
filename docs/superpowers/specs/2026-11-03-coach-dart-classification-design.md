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

| Phase       | When               | Candidate targets                                                                                                                                     |
| ----------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scoring** | more than 170 left | T20, T19, T18, T17                                                                                                                                    |
| **Finish**  | 2–170 left         | the evaluator's top 5 aims for (left, darts left) **∪** the checkout table's first darts for that score **∪** T16 **∪** the aims on the landed number |

The candidates are then narrowed:

- **The bull.** A dart that landed in the Bull or 25 has the two bull aims (Bull, 25) as its only
  candidates, in both phases. A dart anywhere else has no bull aim, except the Bull on 50 (the
  finishing double there). A dart attributed to that Bull counts only when it landed inside the
  inner single ring; further out it is Wild.
- **The landed number.** The aims on the number the dart landed in (its treble, double, both
  singles and both wires) are candidates, so a dart nowhere near a good aim reads as aimed at its
  own bed rather than as Wild.
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
    aims on the landed number (and the bull aims for a dart in the bull) get at least
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

Every dart with a target that isn't a hit gets:

| Property                       | How                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `distanceMm`                   | `d(dart, target) × 170` (r = 1 is the outer double wire, 170 mm)                                                                                        |
| `radialMm`                     | the dart's radius minus the target's radius, × 170: **+ outside** (away from the bull), **− inside** (towards it)                                       |
| `tangentialMm`                 | the target's radius × the signed angle from the target to the dart, × 170: **+ clockwise**, **− anticlockwise**                                         |
| `wedgesOff`                    | the signed wedge distance from the target's number in `SEGS` order: 0, ±1, ±2 …                                                                         |
| `estimated`                    | true without camera coords (bed-centre position)                                                                                                        |
| `plannedLeave` / `actualLeave` | Split, Route, Double and Bull attempts: what the target would have left against what the dart left. For example, planned 32 (D16) and actually left 35. |

Wires (the target `20/1`) use the wire's point as the centre. The label names the direction with
words that mean the same anywhere on the board: **inside** / **outside** for the radial part and
**towards N** (the neighbouring number on that side) for the tangential part, the larger first,
each only above 3 mm. A dart without a position shows "· est." instead of millimetres.

## Grading change

- **A bust is a Mistake**, except when its busting dart is a **Bust-back**. Bust-back replaces
  only that rule: the match-dart, chased-down and missed-doubles rules still apply, so busting
  never grades better than not busting.
- **A Bust-back visit** is graded **OK** with the text "Busted on purpose to stay on 20 (D10)."
  when none of those rules fire.
- **Darts at the double:** a dart on a one-dart finish counts as one unless its class is Split,
  Route or Bust-back (38 → S6, S16, S8 is "2 darts at D16 and D8 missed.", not 3). A typed miss
  on a double counts (it is a Double attempt).
- The other grade rules don't change.

## Data and UI

- **Data:**
  - `ReviewDart` gains `class: DartClass`, shared by the type, the API schema
    (`schema/api-v1.yaml` + `gen:api`) and the stored review.
  - `COACH_VERSION` is bumped, so the backfill rebuilds the stored reviews.
- **Leg review:**
  - **Under each dart tile**, a short label: "T20 ✓", "Single 20", "Miss T20 · 14 mm inside, towards 1",
    "Split → D16 ✓", "D16 inside", "Bust-back ✓", "Wild".
  - **In the selected visit's board card**, a faint line from each dart to its target.
- **Admin sandbox:** shows each placed dart's class with all its properties. This is where the
  numbers get tuned.
- **Code:** pure `backend/src/shared/coach/dartClass.ts` (`classifyDart(throw, ctx) →
  DartClass`), using the evaluator, `checkoutHint`/`CHECKOUTS`, `AIMS` and the board geometry.
  `reviewLeg` attaches the class to each dart.

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
  `distanceMm` against the geometry.
- **Grading:** a Bust-back visit is OK, not a Mistake.
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
- **The aims on the landed number are candidates, at a lower floor exp(−6).** Without them S20 on
  57, S1 on 47 and T10 on 77 read Wild; with the higher floor a one-wedge miss of the best aim
  read as a hit of the landed bed.
- **On a one-dart finish the only double candidate is the finishing one.** Otherwise a wide D16
  miss into D8 on 32 reads as a Split hit. Cost: a deliberate double-to-double split reads as a
  wide double. Accepted: 34 → D2 reads as S2 and 36 → D4 as S4 (plausible splits to 32).
- **The finishing double stays a candidate even when its likeliest outcome busts** (D1 on 2).
- **Bust aims are candidates only off a one-dart finish, and when busting back is best all of
  them are, at prior 1.** S7 on 10 read as a Bust-back; ties in the top 5 gave a typed T20 busting
  on 3 the target T12.
- **No Bust-back on a one-dart finish, for the busting dart too**: on a double you go for it.
- **Split needs both the score and the target's planned leave to be one-dart finishes.** "S3 on
  50: Split ✓" was misleading; that is a Route.
- **A dart in the Bull or 25 has the bull aims only, in both phases; a dart elsewhere has none,
  except the Bull on 50**, where an inner single next to the bull is a Bull attempt miss. Before,
  a bull in Scoring (501 → Bull) and 13 finish states read Wild. On a finish the evaluator decides
  between Bull and 25 (on 60 a Bull reads as the 25's miss, `db`).
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
- **Bust-back only replaces bust → Mistake** (see Grading change): busting must never grade
  better than not busting.
- **Darts classed Split, Route or Bust-back are not darts at the double, in every visit.** "Split →
  D16 ✓" next to "3 darts at D19, D16 and D8 missed" contradicted itself.
- **Stored reviews from an older `COACH_VERSION` aren't served**; they take the rebuild path, since
  the API's required `class` would refuse them.

### Open questions for the user

1. **Scoring darts more than 2 wedges from 20/19/18/17** (the 8, 9, 11, 14) read Wild with no
   distance. Keep that, or attribute them to the nearest scoring treble anyway?
2. **Tuning constants to try in the sandbox:** σ (20 mm), τ (0.01), MIN_PRIOR (exp(−3)),
   LANDED_PRIOR (exp(−6)), the 2-wedge Wild rule, K = 5 and the Scoring priors (1, 0.6, 0.3, 0.3).
