# Coach Dart Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Classify every dart in a coached leg: its category, its guessed target and its miss
properties. A deliberate bust (Bust-back) is no longer graded a Mistake. The classes show in the
leg review and the admin sandbox.

**Architecture:** One pure module, `backend/src/shared/coach/dartClass.ts`. It picks each
dart's target from the phase's candidates, using a Gaussian likelihood times a prior, then
derives the category and the miss properties. `reviewLeg` attaches the class to each
`ReviewDart`; the class is stored in `coach_legs.review` and served by the existing API. The UI
shows short labels, and the sandbox shows the full properties.

**Tech Stack:** TypeScript, vitest, Svelte 5, openapi (`schema/api-v1.yaml` → `npm run gen:api`),
Playwright screenshots (`e2e/screenshots`).

**Spec:** `docs/superpowers/specs/2026-11-03-coach-dart-classification-design.md`. The Coach spec
it builds on is `docs/superpowers/specs/2026-11-02-coach-leg-review-design.md`.

## Global Constraints

- **Branch:** `feat/coach-darts`, cut from `feat/coach`. The PR targets **main**. The user's
  standing rule is no stacked PR bases.
- **The strategy notes and the benefit of the doubt don't change.** The classification never
  creates notes.
- **Constants** (priors, K = 5, the 3σ cutoff, σ = the reference level 7 sigma, mm per board unit
  = 170) live in one constants block in `dartClass.ts`.
- **`backend/src/shared/`** stays dependency-free. The model (`landing.gen.ts`) must stay out of
  the main SPA chunk; check with a vite build.
- **Commits:** conventional, lower case, no trailers. `npm run format` at the root; typecheck
  and lint clean in `backend/` and `backend/frontend/`.
- **DB tests:** `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test`, or
  a throwaway database if that one holds foreign migrations.
- **The dev stack** (`dartcade-dev`) is running from this worktree. Don't restart it unless a
  task needs to.

---

### Task D1: `classifyDart`, the target, category and miss properties

**Files:** create `backend/src/shared/coach/dartClass.ts` and `dartClass.test.ts`.

**Interface:**

```ts
export type DartKind =
  | 'scoringHit' | 'scoringSingle' | 'scoringMiss'
  | 'route' | 'split' | 'double' | 'bull'
  | 'bustBack' | 'bust' | 'wild' | 'notCounted'
export type DartClass = {
  kind: DartKind
  hit: boolean                      // the dart landed in its target's bed (or did what it was meant to)
  target: { aimId: string; label: string } | null
  detail: string | null             // 'inner' | 'outer' | 'inside' | 'outside' | 'wide' | 'sb' (25 instead of Bull) …
  distanceMm: number | null
  radialMm: number | null
  tangentialMm: number | null
  wedgesOff: number | null
  estimated: boolean
  plannedLeave: number | null
  actualLeave: number | null
}
export function classifyDart(t: Throw, ctx: { evaluate: Evaluator }): DartClass
```

- `Throw` comes from `walk.ts`. Darts after a bust are `notCounted`; check how `walkVisit` /
  `throwsOf` mark them.
- The evaluator is the one shared per visit. Reuse `notes.ts`'s per-visit evaluator. Don't
  build a second one per dart.

**Rules:** exactly as in the spec, Steps 1–3 and the category table:

- **Phase:** Scoring when left > 170, else Finish.
- **Candidates:**
  - Scoring: T20, T19, T18, T17 (the `AIMS` ids).
  - Finish: the evaluator's top 5 aims ∪ the first darts of `CHECKOUTS[left]` (routes, plus
    twoDarts when darts left = 2) ∪ T16.
- **Target pick:** `prior · exp(−d²/2σ²)`.
  - Priors: Scoring T20 1.0, T19 0.6, T18 0.3, T17 0.3. Finish: the evaluator values,
    normalised over the candidates, with a floor at the smallest top-5 value for the
    checkout-table darts and T16.
  - Position: `coords`, else the landed bed's centre with `estimated: true`.
  - **Wild** when `d > 3σ` for every candidate, or a typed miss without a position.
- **Category order:**
  1. notCounted;
  2. if the dart busted: bustBack when the bust was at least as good as the best non-bust aim
     (compare `w · nextVisit(start)` with the best value among the aims whose likeliest outcome
     doesn't bust), else bust;
  3. otherwise by the phase and target as in the spec table. A target aim whose likeliest
     outcome busts → `bustBack` with `hit: false` when the dart didn't bust.
- **Miss properties** as in the spec: mm = board units × 170; radial = the dart's r minus the
  target's r; tangential = the target's r × the signed angle (+ clockwise, matching `segAngle`'s
  clockwise order); `wedgesOff` = the signed `SEGS` index distance (−10…+10).
  `plannedLeave`/`actualLeave` for route, split, double, bull and bustBack.

**Tests:**

- One test per spec Testing bullet: S5/S12 in Scoring; near-centre on 50 → bull; 38 → S6 split
  hit; D16 inside, outside and wide; 20 → S10, S7, bust → bustBack; aimed to bust but didn't; far
  → wild; after a bust → notCounted.
- The signs of radial and tangential at known coords (e.g. a dart just clockwise of and below
  T20).
- Estimated without coords.
- Priors: S1 in Scoring is attributed to T20, not T18 (both are neighbours; T20 has the higher
  prior at an equal distance).

Commit: `feat(coach): classify every dart by its likely target`

### Task D2: wire it in: review, grading, schema, store, seed

**Files:**

- `shared/coach/review.ts` (`ReviewDart.class`);
- `grade.ts` (Bust-back is not a Mistake: grade OK, text "Busted on purpose to stay on N (Dx).",
  e.g. "(D10)", with "the bull" for 50);
- `schema/api-v1.yaml` (`DartClass`, `ReviewDart.class`) + `npm run gen:api`;
- `backend/src/coach/store.ts` (`COACH_VERSION` + 1);
- `seed/coachGames.ts` + its test (pin each scripted dart's kind);
- the tests that pin review output.

**Grading test:** a 20-start visit S10, S7, then a bust → tag Doubling, grade OK, the Bust-back
text. The same visit busting from a bad spot stays a Mistake.

Commit: `feat(coach): carry dart classes in the leg review and spare deliberate busts`

### Task D3: show it in the leg review and the sandbox

**Files:** `lib/components/coach/` (`DartTile` or VisitTable/VisitCards: the label under each
tile), `BoardCard.svelte` (a faint line from each dart to its target), `lib/coach/view.ts`
(the pure label builder + tests), `routes/AdminCoach.svelte` (the per-dart class table: kind,
target, distance, radial/tangential, wedges, estimated, leaves).

- **Labels** as in the spec: "T20 ✓", "Single 20", "Miss T20 · 14 mm low-left", "Split → D16 ✓",
  "D16 inside", "Bull ✓", "Bust-back ✓", "Wild", "Not counted". Direction words come from the
  signs: radial − = low (inside for doubles), + = high (outside); tangential − = left,
  - = right. Show only the dominant parts above 3 mm.
- **Accessibility:** labels are text, and the line on the board is `aria-hidden`.
- **The model chunk:** the leg review page still gets the class from the API. Only the sandbox
  may import the model.

Commit: `feat(coach): show each dart's class in the leg review and sandbox`

### Task D4: screenshots, docs, PR

- **Screenshots:**
  - Update `e2e/screenshots/04-features.spec.ts` so the leg review shot shows the dart labels,
    and add a sandbox shot showing the class table.
  - Run `cd e2e && npm run screenshots -- -g coach`. The user asked for screenshots; this starts
    the screenshot docker stack.
  - Commit the PNGs under `docs/coach/`. They also cover the #449 shots that were never run.
- **Docs:**
  - Update AGENTS.md's Coach row (`dartClass.ts`).
  - Append an **"Assumptions"** section to the spec listing every assumption and ruling made
    while building. The controller supplies the list from the ledger.
- **PR:** push `feat/coach-darts`, then `gh pr create --base main`. The title is for players. The
  body covers what it does, the categories, the screenshots (raw links at the branch), the
  Assumptions list, and a note that it stacks on #449 (the diff includes #449 until #449 merges).
