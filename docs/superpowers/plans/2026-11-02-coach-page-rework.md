# Coach Page Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework PR #449 into the Coach from the design canvas:

- a `#/coach` page with the Review tab;
- a leg review page, with graded visits and the board;
- a "what the coach detects" page;
- reviews stored server-side at game end;
- an admin Coach sandbox.

**Architecture:**

- **The shared pure model** (`backend/src/shared/coach/`, already on the branch) gains a Tip
  flag, visit grading (`grade.ts`) and a leg review builder (`review.ts`).
- **The backend** builds one `coach_legs` row per (game, leg, human seat) when a game finishes,
  rebuilds stale rows lazily or in the background, and serves two routes.
- **The SPA** renders the canvas pages from those rows. The sandbox runs the shared code in the
  browser.

**Tech Stack:** TypeScript, vitest, Fastify, Kysely + Postgres migrations, openapi (`schema/api-v1.yaml`
→ `npm run gen:api`), Svelte 5, svelte-spa-router.

**Spec:** `docs/superpowers/specs/2026-11-02-coach-leg-review-design.md` (revised). **Design:** the
canvas artboards `project/Coach-Review.dc.html`, `Coach-Leg.dc.html`,
`Coach-Phone-Leg.dc.html` and `Coach-Mistakes.dc.html` at
https://claude.ai/artifact/2ZyCCfSMhs3PKZzNLzsw23. Read them with the Artifact tool (action "read",
`path`). An element inventory is in the executor's scratchpad (`coach-artboards.md`); the
controller passes its path.

## Global Constraints

- **The artboards are the scope floor.** Build every element the spec keeps, as drawn: copy,
  columns, pills, colours (as the existing tokens). Leave out only what the spec's "Out of scope"
  lists.
- **Strategy notes** use the fixed reference player (bot level 7, 81 average) for everyone.
  **Scoring grades** use the player's 30-day X01 average (`x01AverageSince(db, userId,
  PROFILE_AVERAGE_DAYS)`) at game end, falling back to the game's own average.
- **Grades:** Great / Good / OK / Weak / Mistake. **Tags:** Scoring / Setup / Doubling.
  **Tip** is a note that doesn't change the grade (blue Info style).
- **Thresholds:** named constants in `backend/src/shared/coach/grade.ts`. Very low = 26. Low =
  average − 25. Good = average + 15. Great = average + 40. The note threshold of 0.05 stays in
  `notes.ts`.
- **Which games:** X01, `inMode` straight, `outMode` double, `bullValue` 25_50, singles, finished,
  not invalidated. Human seats with an account only.
- **`coach.enabled`** gates every coach route and page.
- **`backend/src/shared/`** stays dependency-free.
- **Commits:** conventional, lower case, **no trailers**. `npm run format` at the root; lint and
  typecheck must be clean in `backend/` and `backend/frontend/`.
- **Don't start docker or the dev stack.** DB tests run when `TEST_DATABASE_URL` is set. A
  Postgres is usually listening on `localhost:5432` (`postgres://postgres:postgres@localhost:5432/dartcade_test`).
  If it isn't, say so.
- **No copied text** from dartscheckoutassistant.com.

## Review Focus

1. **A leg the seat never threw in** (opponent won early): no row, or a row with "–" grades. It
   must never be NaN.
2. **A visit with darts after a bust** (the game stores them): the grade is decided by the bust,
   and the post-bust darts aren't judged.
3. **Old games finished before this shipped:** the list must still show them (lazy or background
   build), with no request taking seconds.
4. **Another user's leg URL:** 404, not someone else's review.
5. **Typed-in darts without coords** on the board card: drawn at the bed centre, hollow, never
   crashing.

---

## File Structure

```
backend/src/shared/coach/
  walk.ts         MODIFY: Throw gains opponentOnOut: boolean
  notes.ts        MODIFY: CoachNote gains tip: boolean (Tip rule)
  grade.ts        NEW: constants, classifyVisit, legSkills, coachTake, visit text
  review.ts       NEW: reviewLeg → LegReview, legCounts; replaces coachGame
  stats.ts        MODIFY: drop missTendencies (UI gone); keep what grade/review need
  index.ts        MODIFY: exports
backend/src/db/migrations/0NN_coach_legs.sql   NEW (next free number on origin/main at build time)
backend/src/db/schema.ts                        MODIFY: CoachLegs table type
backend/src/coach/store.ts                      NEW: buildCoachLegs(game), ensureCoachLegs(user), backfill
backend/src/api/coach.ts                        NEW: GET /api/coach/legs, GET /api/coach/legs/{gameId}/{leg}
backend/src/index.ts                            MODIFY: build at game end; register routes; start backfill
schema/api-v1.yaml                              MODIFY: CoachList, CoachLegRow, LegReview schemas + paths
backend/frontend/src/lib/components/coach/      REPLACE: DartTile, GradePill, BoardCard, TakeCard,
                                                VisitTable, VisitCards, CountCards (delete CoachSection, CoachLegs)
backend/frontend/src/lib/coach/view.ts          MODIFY: labels, colours, filters, helpers (+ tests)
backend/frontend/src/routes/Coach.svelte        REWRITE: Review tab
backend/frontend/src/routes/CoachLeg.svelte     NEW
backend/frontend/src/routes/CoachChecks.svelte  NEW
backend/frontend/src/routes/AdminCoach.svelte   NEW (+ lib/admin/tools.ts entry)
backend/frontend/src/App.svelte                 MODIFY: routes
backend/frontend/src/routes/GameDetails.svelte, lib/components/details/X01Section.svelte  MODIFY: remove section; "Coach review" link per leg
backend/src/seed/coachGames.ts (+ test)         MODIFY: pin grades
e2e/screenshots/04-features.spec.ts, AGENTS.md  MODIFY
```

---

### Task R1: Tips, and the opponent on an out

**Files:** modify `shared/coach/walk.ts`, `notes.ts`, and their tests.

**Interfaces:**

- `Throw` gains `opponentOnOut: boolean`. It's true when any opponent's score left (the same
  source as `w`: their latest remaining in the leg, or `startScore`) has `nextVisit(score) > 0`.
- `CoachNote` gains `tip: boolean`.

**The Tip rule:**

- Let `v0 = evaluator(t.start, 0)(t.left, t.darts).values`. That's each aim's chance to check out
  _this visit_.
- A note is a **Tip** when `!t.opponentOnOut && v0[best] > v0[candidate] + 0.01`, i.e. the better
  aim goes for the out and nobody threatens to finish.
- Notes stay subject to `NOTE_THRESHOLD` as before. A Tip is still a note, with `tip: true`.

**Tests**, in `notes.test.ts`, using `testLegs`. Find each case with `numberCost` / `v0` while
writing the test, and keep only cases with clear margins:

- **A "set up instead of going out" note:** e.g. 50 left with 3 darts, a dart in 18 (S18, setting
  up 32), where the best aim is Bull. Solo: a note with `tip: true`. Opponent on 32: `tip: false`.
  If 50/18 doesn't give a note, search 41–70 for a clear case, and document it.
- **A wrong-number note that isn't about going out** (57/1 in 20): `tip: false` solo.
- **`opponentOnOut`:** true with an opponent on 32, false with one on 301 or 169.
- All existing notes and walk tests still pass.

Commit: `feat(coach): tips for setting up while nobody is on an out`

---

### Task R2: Visit grades and texts (`grade.ts`)

**Files:** create `shared/coach/grade.ts` and `grade.test.ts`.

**Interfaces:**

```ts
export const VERY_LOW = 26, LOW_BELOW = 25, GOOD_ABOVE = 15, GREAT_ABOVE = 40
export type VisitTag = 'scoring' | 'setup' | 'doubling'
export type VisitGrade = 'great' | 'good' | 'ok' | 'weak' | 'mistake'
export type VisitFacts = {
  start: number                 // score before the visit
  throws: Throw[]               // this visit's walked darts (stops at a bust)
  scored: number; then: number; bust: boolean
  notes: CoachNote[]            // this visit's notes (tips included)
  average: number               // the player's 3-dart average (30-day, or the game's)
  lastVisitOfLostLeg: boolean   // the seat's last visit in a leg the opponent won
}
export function tagOf(f: VisitFacts): VisitTag
export function classifyVisit(f: VisitFacts): { tag: VisitTag; grade: VisitGrade; text: string }
```

**Rules**, from the spec's table. The worst matching rule wins, in the order Mistake > Weak >
Great > Good > OK.

- **Tag:**
  - Scoring if `start > 170`;
  - Doubling if any dart was thrown on a one-dart finish (`left` even and ≤ 40, or 50);
  - else Setup.
- **Scoring:**
  - Mistake if `scored < VERY_LOW`;
  - Weak if `scored <= average − LOW_BELOW`, or if 2+ darts with `scoringAim === 20` landed in 1
    or 5;
  - Great if `scored >= average + GREAT_ABOVE`;
  - Good if `scored >= average + GOOD_ABOVE`;
  - else OK.
- **Setup:**
  - Mistake if bust, or any note with `!tip`;
  - Good if `then` is a one-dart finish;
  - else OK.
- **Doubling:**
  - Mistake if bust, or any note with `!tip`, or a missed match dart when `then` is not a one-dart
    finish;
  - Weak if 2+ darts at a double and none hit, or a missed match dart when `then` is a one-dart
    finish, or chased down (visit ended on 2 or 4, from a higher double, by single-half misses,
    no bust);
  - Great if checked out;
  - else OK.

  "Any note with `!tip`" in Doubling clarifies the spec: a strategy note is a Mistake on any
  finish visit.

- **A missed match dart:** `lastVisitOfLostLeg`, the visit didn't check out, and it had at least
  one dart at a double.

**Texts.** Each is one sentence, in our own words, with templates as constants:

- **Scoring:**
  - Great with 2 or 3 trebles: "Two trebles." / "Three trebles.";
  - Great or Good otherwise: "Scored N.";
  - Weak or Mistake for a low score: "Scored N; your usual visit is A." (A rounded);
  - the spill: "N darts drifted into 1 or 5.";
  - OK: "Scored N.".
- **Setup with a note:** "On L, Tsingle: better B — reason." The reason is left out when null.
  Prefix "Tip: " for tips.
- **Setup without a note:**
  - "L left is a k-dart finish (route)", with the route from `checkoutHint(then, 'double', 3)`
    and k its length;
  - "L left: no 3-dart finish." when there's no route.
- **Doubling:**
  - "Checked out on Dn." (or "the bull");
  - "k darts at Dn missed.";
  - "Chased down to N.";
  - "Missed the match dart." prefixed for a missed match dart.

**Tests:**

- one case per cell of the rule table (build `VisitFacts` via `throwsOf` + `strategyNotes` on
  `testLegs` visits);
- precedence (a bust beats everything);
- a tip doesn't make a Mistake;
- a missed match dart is Weak when it left a double and a Mistake when not;
- chasing down;
- a few pinned texts.

Commit: `feat(coach): grade every visit and say why`

---

### Task R3: The leg review (`review.ts`) and seed grades

**Files:**

- create `shared/coach/review.ts` and `review.test.ts`;
- modify `index.ts` and `stats.ts` (drop `missTendencies` and its tests);
- modify `seed/coachGames.ts` and its test.

**Interfaces:**

```ts
export type ReviewDart = { name: string; coords: { x: number; y: number } | null; left: number }
export type ReviewVisit = { n: number; left: number; darts: ReviewDart[]; scored: number; then: number;
  bust: boolean; tag: VisitTag; grade: VisitGrade; text: string; notes: CoachNote[] }
export type SkillGrade = { grade: 'A' | 'B' | 'C' | 'D' | null; line: string }
export type LegCounts = { lowVisits: number; badSetups: number; missedDoubles: number; clean: boolean }
export type LegReview = { leg: number; seat: number; won: boolean; darts: number; average: number | null;
  visits: ReviewVisit[]; skills: { scoring: SkillGrade; setup: SkillGrade; doubling: SkillGrade };
  take: string; counts: LegCounts }
export function reviewLeg(legs: readonly CoachLeg[], leg: number, seat: number,
  ctx: { startScore: number; average: number | null; opponentName: (seat: number) => string }): LegReview | null
```

**Rules:**

- `average` is null when the seat has no 30-day average; `reviewLeg` then uses the game's own
  average.
- It returns null when the seat threw no darts in that leg.
- **Skills**, as in the spec's table:
  - **Scoring:** the leg's average until 170 against `average`. A ≥ +10, B within ±10,
    C −10 to −25, D below.
  - **Setup:** the share of Setup visits without a non-tip note. A = 100%, B ≥ 75%, C ≥ 50%,
    D below.
  - **Doubling:** hits / darts at a double. A ≥ 40%, B ≥ 25%, C ≥ 10%, D below.

  Each skill is null, with "–", when it had nothing to judge.

- **Lines**, as drawn:
  - "Leg average 71.0 · one low visit";
  - "1 of 2 setup visits left a bad number";
  - "0 of 5 darts at a double".
- **Take:**
  - **Sentence 1:**
    - won: "Won in D darts.";
    - lost on a finish (you were on a 2-dart finish or less when the opponent checked out): "You
      were on a finish after D darts and still lost.";
    - else: "Lost: Opp checked out first.".
  - **Sentence 2:** the weakest skill's line in words:
    - "The scoring held you back."
    - "S setup visits left a bad number."
    - "M missed doubles."
    - "A clean leg." when all skills are A or B.
  - **Appended when they apply:**
    - "From your first finish to the checkout took N darts." (Long finish: more than 9);
    - "Your scoring dropped after visit 3." (Late-leg drop).
- **Counts:**
  - `lowVisits`: Scoring visits graded Weak or Mistake;
  - `badSetups`: Setup and Doubling visits with a non-tip note;
  - `missedDoubles`: darts at a double that missed;
  - `clean`: no Weak or Mistake visit.
- **Remove** `coachGame`, `missTendencies` and their tests. Export the new API from `index.ts`.

**Tests:**

- **`review.test.ts`:** a built 2-seat leg (`testLegs`) against an expected `LegReview` (tags,
  grades, skills, take, counts); a lost-on-a-finish take; a "–" skill; null for a seat with no
  darts.
- **`coachGames.test.ts`:** also pins each scripted visit's grade. Read them from `reviewLeg`, and
  record the actual grades once they match the scripts' intent (notes → Mistake or Tip as the
  rules say).

Commit: `feat(coach): review a leg with grades, skills and the coach's take`

---

### Task R4: Store reviews (`coach_legs`)

**Files:**

- create the migration and `backend/src/coach/store.ts` (+ a DB test);
- modify `db/schema.ts` and `index.ts`.

**Table `coach_legs`:**

```sql
user_id text references "user"(id) on delete cascade, game_id uuid references game_sessions(id) on delete cascade,
leg int, seat int, finished_at timestamptz not null, won boolean not null, ranked boolean not null,
darts int not null, average real, low_visits int not null, bad_setups int not null,
missed_doubles int not null, clean boolean not null, opponents jsonb not null, context text not null,
review jsonb not null, version int not null, primary key (game_id, leg, seat)
```

Plus an index on `(user_id, finished_at desc)`.

- **Match the real column types.** Check `game_sessions.id` and `user.id` in earlier migrations,
  and follow how they define their keys.
- **`context`** is the subtitle, e.g. "501 · Friday darts · leg 3" or "Ranked 1v1 · leg 3". It
  comes from the lobby name / ranked flag the game summary carries. Find these fields in
  `db/history.ts` / `GameSummary`.

**`store.ts`:**

- `COACH_VERSION = 1`
- `buildCoachLegs(db, game: HistoryGame, warn)`: uses `storedDetail`/`buildDetail` for the X01
  detail. For each coachable human seat with a `userId`, and each leg, it calls `reviewLeg`, with
  the average from `x01AverageSince(db, userId, PROFILE_AVERAGE_DAYS)`. It upserts the rows.
- `ensureCoachLegs(db, userId, warn, max = 10)`: builds missing or stale rows for the user's most
  recent coachable games, at most `max` per call.
- `backfillCoachLegs(db, warn)`: started once at boot, not awaited. It walks every coachable game
  with missing or stale rows, oldest last, and yields between games (`setImmediate`).
- **Game-end hook:** in `backend/src/index.ts`, next to the stored detail, not awaited:
  `buildCoachLegs(...)` for finished games, with errors going to `warn`.

**Tests (DB):**

- finishing a scripted game builds rows with the expected counts;
- `ensureCoachLegs` rebuilds after a version bump (pass the version in, or stub it);
- invalidated games are skipped;
- games that aren't coachable (straight out, teams) have no rows.

Commit: `feat(coach): store a review of every coachable leg`

---

### Task R5: The API

**Files:** modify `schema/api-v1.yaml`, then `npm run gen:api` at the root. Create
`backend/src/api/coach.ts` (+ a test). Register it in `index.ts`.

- **`GET /api/coach/legs?filter=all|lost|ranked|missedDoubles|badSetups|lowVisits&cursor=`**
  returns `{ counts: { legs, lowVisits, badSetups, missedDoubles, cleanLegs }, legs:
  CoachLegRow[], nextCursor: string|null, updatedAt: string|null }`.
  - The counts cover the user's **last 50** stored legs; the filter doesn't change them.
  - `legs` pages by 40 and is filtered server-side.
  - It calls `ensureCoachLegs` first.
  - `CoachLegRow = { gameId, leg, finishedAt, opponents: string[], context, won, darts, average,
    lowVisits, badSetups, missedDoubles, clean }`.
- **`GET /api/coach/legs/{gameId}/{leg}`** returns `{ review: LegReview, title: { opponents,
  context, finishedAt, won, winnerName, winnerDarts } }` for the requesting user's own row, or 404.
- **Both** need `requireAuth` and the flag (the `flagEnabled(...)` pattern in `api/progress.ts`),
  and return 404 when the flag is off.
- **The `LegReview` schema** in yaml mirrors the shared type exactly. Keep them in sync: a backend
  test parses a stored review with the generated zod schema, if `gen:api` produces one for
  responses; otherwise, a type-level assignment test.

**Tests (DB):**

- the counts and the filters;
- paging;
- 404 for another user's leg;
- 404 with the flag off.

Commit: `feat(coach): coach legs api`

---

### Task R6: Shared UI pieces, and the details page goes back to a link

**Files:**

- delete `lib/components/coach/CoachSection.svelte`, `CoachLegs.svelte` and their test;
- create `lib/components/coach/{DartTile,GradePill,BoardCard}.svelte`;
- modify `lib/coach/view.ts` (+ tests), `GameDetails.svelte` and `X01Section.svelte`.

- **`DartTile`:** a dart as drawn — a treble on green, a single plain, a "missed or red" single, a
  pure miss with a dashed outline.
- **`GradePill`:** grade colours as drawn (Great `#c6f24e`, Good `#7fd18f`, OK `#8f9085`, Weak
  `#f3c76a`, Mistake `#ff5a4f`, Tip/Info `#9ec8ff`). **Map these to existing tokens**
  (`backend/frontend/src/app.css` / tokens.json); add a token only if none exists.
- **`BoardCard`:** the board from `lib/details/boardGeometry.ts`, as `HeatBoard` draws it, plus:
  - the visit's darts at their `coords`, or hollow at the bed centre when `coords` is null. Use
    `pointFor`-like centres; there's `shared/board.ts` geometry;
  - the better aim's bed highlighted blue, and its likely misses labelled;
  - a pulsing ring on the selected dart.

  Props: `{ darts: ReviewDart[]; better?: { label: string; aim: Aim } | null }`. It's used by
  the leg review and the sandbox.

- **Details page:** remove `CoachSection` from `GameDetails.svelte`. In `X01Section`, when a
  single leg is selected, the flag is on, the game is coachable and the viewer has a seat, show a
  "Coach review" link to `#/coach/leg/<gameId>/<leg>`.

Commit: `feat(coach): dart tile, grade pill and board card; link legs to the coach`

---

### Task R7: Coach page, Review tab, and "What the coach detects"

**Files:**

- rewrite `routes/Coach.svelte`;
- create `routes/CoachChecks.svelte` and `lib/components/coach/CountCards.svelte`;
- modify `App.svelte` (`/coach/checks`), `lib/coach/view.ts` (+ tests).

**Coach page** (`Coach-Review.dc.html`):

- **Header:** "Coach", the subtitle "A second look at any of your last 50 X01 legs.", and
  "Updated after your last game · HH:MM".
- **Tabs:** the big tabs with only Review ("N legs" pill).
- **Count cards:** four, with copy as drawn.
- **Filters:** six chips, server-side.
- **Table columns:** When · Leg · Result · Darts · Avg · Coach found · Review button. The first row
  gets the primary button.
- **"Coach found":** pills ("2 missed doubles" red, "1 bad setup" yellow, "N low visits" yellow,
  "Clean leg" green).
- **More:** "Show 40 more legs".
- **Link:** "What the coach detects →".
- **Phone:** stacked cards.
- **Empty state:** "Play an X01 game with double out to get a review".

**"What the coach detects"** (`Coach-Mistakes.dc.html`): the checks this version runs, grouped
Scoring / Setup / Doubling / Leg patterns. Each shows its label pill, source dot, "Detected when",
an example and "Coach says", in our own words, consistent with the grade rules. Generate the
list from a constant in `lib/coach/checks.ts`.

**History link:** History keeps its "Coach" link; it points to `#/coach`.

Commit: `feat(coach): coach page with the review tab`

---

### Task R8: Leg review page

**Files:**

- create `routes/CoachLeg.svelte`, `lib/components/coach/{TakeCard,VisitTable,VisitCards}.svelte`;
- modify `App.svelte` (`/coach/leg/:gameId/:leg`).

As `Coach-Leg.dc.html` (desktop) and `Coach-Phone-Leg.dc.html` (phone):

- **Header:** the breadcrumb "← Review", the H1 "Leg N vs Opp", the subtitle, and a "Match
  details" button.
- **TakeCard:** the take, plus three skill rows (letter badge, skill name, line).
- **"Every visit":**
  - the legend with counts;
  - chips (All N / Scoring / Setup / Doubling);
  - the table: # · Left · Darts (DartTile ×3) · Scored · Then · Coach (GradePill, tag, text;
    tips in blue).
  - Clicking a row selects it.
- **Right rail:** "Visit N · L left" + GradePill, the `BoardCard` with the selected visit's darts
  and the best note's better aim, "What happened: …" / "Better: …" (blue), and ← Visit / Visit →.
- **Phone:**
  - the 3-up grade row;
  - the take paragraph;
  - the chips;
  - visit cards ("501 → 361").

  Tapping a card opens the `BoardCard` under it.

- **Errors:** a 404 shows "This leg has no review" with a link back.

Commit: `feat(coach): leg review page`

---

### Task R9: Admin Coach sandbox

**Files:**

- create `routes/AdminCoach.svelte`;
- modify `lib/admin/tools.ts` and `App.svelte` (`/admin/coach`, gated like the other admin
  routes).

- **Inputs:**
  - the score left at the visit's start;
  - the opponent's score left (optional);
  - your average (default 60).
- **Board:** a clickable board that places up to 3 darts with `coords`. Reuse the board the match
  screen uses for manual entry with positions (`DartBoard` in `BoardOrKeypad`), if it emits
  positions; otherwise `BoardCard` with a click handler and `segmentAt`. Undo and clear are
  available.
- **The pipeline:** build a one-visit `CoachLeg`, with an opponent visit when an opponent score
  is set, then run `throwsOf` → `strategyNotes` → `classifyVisit`.
- **Output:**
  - the tag + GradePill + text;
  - per dart, its note or tip (better aim, reason, cost, book route);
  - for the next dart, the top 5 aims with checkout chances (`evaluator(start, w)(left,
    dartsLeft)`);
  - the `BoardCard`.
- **No API calls.**

**Tests:** a unit test for the sandbox's pure helper (building the leg from the inputs) in
`lib/coach/sandbox.ts`.

Commit: `feat(coach): admin sandbox to try a visit`

---

### Task R10: Docs and screenshots

**Files:** `e2e/screenshots/04-features.spec.ts` and `AGENTS.md`.

- **Screenshots:**
  - Review tab and leg review, desktop and phone, as admin on a scripted seed game with notes;
  - the sandbox with three darts placed.

  Assert visible content before each shot. **Don't run docker.** The user runs
  `cd e2e && npm run screenshots -- -g coach`.

- **AGENTS.md:** rewrite the Coach row: pages, routes, `coach_legs`, `store.ts`, grade constants,
  and the sandbox.

Commit: `docs(coach): coach page screenshots and where to find it`
