# Minigolf Course Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins design, test and publish the official Minigolf courses in the app; new games play the published courses.

**Architecture:** Courses and holes move into Postgres (`published` and `draft` JSON, shared holes, a version per row). An admin-only REST API reads and writes them; publishing is one transaction. Games resolve the published course at start through a new async `prepareConfig` hook, so `init` stays a pure reducer over holes copied into the config. The SPA gets a course editor and a 2D hole editor (pure editing operations, an undo stack, autosave), a shared 3D playtest, live checks, and a seeded putting bot in a Web Worker.

**Tech Stack:** TypeScript, Fastify, Kysely + Postgres (raw-SQL migrations), OpenAPI (`schema/api-v1.yaml`, `fromSpec`, openapi-fetch), Svelte 5, three.js / Rapier (existing), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-14-minigolf-course-editor-design.md`

## Global Constraints

- Only admins read drafts or write (`requireAuth` + `requireAdmin` from `backend/src/auth/admin.ts`); players read published official courses only. Checked on the server.
- A game copies the published course's holes into its config at start; `init` and replays use only those; a later publish never changes a game.
- Holes are shared between courses; a hole is deleted only when no course (draft or published) uses it.
- Every write carries the row's `version`; a stale write answers 409 `{ error: 'conflict' }`.
- Publish: one transaction; refused (422 with the failing checks per hole) if any blocking check fails.
- Presets: cup Standard r 80 / Beginner r 110 mm; bumper S/M/L r 40/60/80 mm; bounce Soft/Normal/Strong restitution 0.6/0.85/0.95; wall Thin/Normal 12/20 mm; grid 50 mm; 45° snap.
- Terrain tools map onto existing shapes: Hill/Dip → `slopes[].radial` (strength > 0 / < 0), Ridge → `slopes[].bump`, Plateau → `terrain[].mesa`; Flatten removes one.
- The putting bot: 20 rounds, 16 candidates per stroke (8 directions × 2 strengths), max 6 strokes, seeded; runs in a Web Worker.
- Commits: conventional, unsigned (`git -c commit.gpgsign=false commit`), ending with the session's attribution lines. Never push.
- Branch: `feat/minigolf-editor` (exists, holds the spec).

## Review Focus

1. Two admins (or two tabs) editing the same hole: the second save must get 409, never silently overwrite. Test in Task 3 (DB) and Task 8 (store shows "changed elsewhere").
2. A course whose draft references a hole that was deleted or never published: publish must refuse cleanly, games must not start on it. Test in Task 3.
3. Starting a game while an admin publishes: the game gets either the old or the new course whole, never a mix. Test in Task 5 (resolve reads one published snapshot).
4. Dragging an outline corner across another edge (self-intersection): the editor shows the blocking check; autosave still saves the draft (drafts may be broken), publish refuses. Test in Task 7 (ops don't forbid it) and Task 2 (check flags it).
5. A dev-DB game created before this change (config without `holes`) must still replay. Test in Task 5 (falls back to the code course).

---

## File Structure

| File                                                                 | Responsibility                                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `backend/src/shared/minigolf/types.ts`                               | `Wall.thickness?`                                                                   |
| `backend/src/shared/minigolf/simulate.ts`, `3d/physics3d.ts`         | read `w.thickness ?? physics.wallThickness`                                         |
| `backend/src/shared/minigolf/presets.ts` (new)                       | the spec's preset numbers                                                           |
| `backend/src/shared/minigolf/checks.ts` (new)                        | `holeChecks(hole)`: errors + warnings                                               |
| `backend/src/shared/minigolf/bot.ts` (new)                           | distance field + greedy putting bot (pure, seeded)                                  |
| `backend/src/db/migrations/020_minigolf_courses.sql` (new)           | tables + seed                                                                       |
| `backend/src/db/schema.ts`                                           | `MinigolfHolesTable`, `MinigolfCoursesTable`                                        |
| `backend/src/db/minigolfCourses.ts` (new)                            | queries, publish/discard transactions                                               |
| `backend/src/api/minigolfCourses.ts` (new)                           | REST routes                                                                         |
| `schema/api-v1.yaml`                                                 | the routes and schemas                                                              |
| `backend/src/session/types.ts`, `engine.ts`                          | `GameModule.prepareConfig?`                                                         |
| `backend/src/games/minigolfCourseSource.ts` (new)                    | where minigolf reads published courses (DB in prod, code in tests)                  |
| `backend/src/games/minigolf.ts`                                      | config `holes`/`courseName`, `prepareConfig`, dynamic course options                |
| `backend/src/api/games.ts`                                           | `/api/gamemodes` asks modules for live options                                      |
| `backend/frontend/src/lib/minigolf/editor/ops.ts` (new)              | pure editing operations                                                             |
| `backend/frontend/src/lib/minigolf/editor/history.ts` (new)          | undo/redo stack                                                                     |
| `backend/frontend/src/lib/minigolf/editor/store.svelte.ts` (new)     | load, autosave with version, status                                                 |
| `backend/frontend/src/lib/components/minigolf/Playtest.svelte` (new) | the 3D playtest (extracted from the bench)                                          |
| `backend/frontend/src/routes/MinigolfCourses.svelte` (new)           | course list + course editor                                                         |
| `backend/frontend/src/routes/MinigolfHoleEditor.svelte` (new)        | hole editor page                                                                    |
| `backend/frontend/src/lib/components/minigolf/editor/*` (new)        | `EditorCanvas`, `ToolRail`, `Properties`, `ElementList`, `CheckList`, `HoleLibrary` |
| `backend/frontend/src/lib/minigolf/editor/botWorker.ts` (new)        | Web Worker running the bot                                                          |

---

### Task 1: Presets and per-wall thickness in the core

**Files:**

- Modify: `backend/src/shared/minigolf/types.ts`, `simulate.ts:46-48`, `3d/physics3d.ts:89-92`, `hole.ts` (validate `thickness`)
- Create: `backend/src/shared/minigolf/presets.ts`
- Test: `backend/src/shared/minigolf/simulate.test.ts`, `3d/physics3d.test.ts`, `hole.test.ts`

**Interfaces:**

- Produces: `Wall.thickness?: number`; `presets.ts`: `CUP = { standard: 80, beginner: 110 }`, `BUMPER_R = { S: 40, M: 60, L: 80 }`, `BOUNCE = { soft: 0.6, normal: 0.85, strong: 0.95 }`, `WALL = { thin: 12, normal: 20 }`, `GRID = 50`.

- [ ] **Step 1: Failing tests.** In `hole.test.ts`: `validateHole({ ...ok, walls: [{ points: [[0,0],[100,0]], thickness: 0 }] })` contains `'wall 1 thickness must be positive'`. In `simulate.test.ts` and `physics3d.test.ts`: a ball rolled at a wall 300 mm away along the lane stops/bounces earlier with `thickness: 200` than with `thickness: 12` (compare the y where its path turns back).
- [ ] **Step 2: Run** `cd backend && npx vitest run src/shared/minigolf` — expect FAIL.
- [ ] **Step 3: Implement.** `types.ts`: `export interface Wall { points: Pt[]; closed?: boolean; restitution?: number; /** mm; Physics.wallThickness when absent. */ thickness?: number }`. In both engines pass `w.thickness ?? physics.wallThickness` where the wall segments are built (outline rails keep `physics.wallThickness`). `hole.ts`: `else if (w.thickness !== undefined && !(w.thickness > 0)) errors.push(\`wall ${i + 1} thickness must be positive\`)`. Add `presets.ts` with the constants above (one-line comments).
- [ ] **Step 4: Run** the minigolf tests and `npm run test:perf` alone — PASS; golden snapshots unchanged (no wall in the test course sets `thickness`).
- [ ] **Step 5: Commit** — `feat(minigolf): let a wall have its own thickness`

### Task 2: Hole checks

**Files:**

- Create: `backend/src/shared/minigolf/checks.ts`, `checks.test.ts`

**Interfaces:**

- Consumes: `validateHole`, `pointInPolygon`, `distanceToSegment`, `heightAt` (ground.ts), `BALL_R`.
- Produces: `type Check = { level: 'error' | 'warning'; message: string; element?: ElementRef }`, `type ElementRef = { kind: 'outline' | 'tee' | 'cup' | 'bumper' | 'wall' | 'slope' | 'terrain'; index: number }`, `holeChecks(hole: Hole): Check[]`.

- [ ] **Step 1: Failing tests** (one `it` each): a valid test-course hole has no errors; an outline with crossing edges gives an `error` on `{ kind: 'outline', index: 0 }`; cup within `BALL_R * 2` of the outline gives a `warning` "Cup is close to the rail" on the cup; a bumper whose edge is within `BALL_R * 2` of the outline gives a warning on that bumper; the tee within `BALL_R` of a wall gives a warning on the tee; a hill whose radius reaches past the outline gives a warning on that slope.
- [ ] **Step 2: Run** `cd backend && npx vitest run src/shared/minigolf/checks.test.ts` — FAIL.
- [ ] **Step 3: Implement** `holeChecks`: map every `validateHole` message to `{ level: 'error', message, element }` (parse the element from the message prefix: `outline`, `tee`, `cup`, `wall N`, `bumper N`, `slope N`, `terrain N`, 1-based → 0-based index), then the warnings above using `distanceToSegment` against every outline edge and wall segment.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(minigolf): check a hole for errors and warnings`

### Task 3: Courses and holes in the database

**Files:**

- Create: `backend/src/db/migrations/020_minigolf_courses.sql`, `backend/src/db/minigolfCourses.ts`, `backend/src/db/minigolfCourses.test.ts`
- Modify: `backend/src/db/schema.ts`

**Interfaces:**

- Consumes: `holeChecks` (Task 2), `testCourse` (seed).
- Produces (all `db: Kysely<Database>` first):
  - `type CourseContent = { name: string; description: string; difficulty: 1 | 2 | 3; holeIds: string[] }`
  - `type CourseRow = { id; ownerUserId: string | null; visibility: 'official'; published: CourseContent | null; draft: CourseContent | null; version: number; updatedAt: Date; publishedAt: Date | null }`
  - `type HoleRow = { id; ownerUserId: string | null; published: Hole | null; draft: Hole | null; version: number; updatedAt: Date; publishedAt: Date | null }`
  - `listCourses(db, opts: { drafts: boolean }): Promise<CourseRow[]>` (without drafts: only rows with `published`, `draft` nulled)
  - `getCourse(db, id)`, `getHole(db, id)`: `Promise<CourseRow | undefined>` / `HoleRow | undefined`
  - `listHoles(db, opts: { search?: string }): Promise<(HoleRow & { usedBy: number })[]>`
  - `createCourse(db, content: CourseContent): Promise<CourseRow>`, `createHole(db, hole: Hole): Promise<HoleRow>` (draft only)
  - `saveCourseDraft(db, id, version, content)`, `saveHoleDraft(db, id, version, hole)`: `Promise<CourseRow | 'conflict' | 'missing'>` / `HoleRow | …`
  - `publishCourse(db, id): Promise<{ ok: true; course: CourseRow } | { ok: false; problems: { holeId: string; checks: Check[] }[] } | 'missing'>`
  - `discardCourseDraft(db, id): Promise<CourseRow | 'missing'>`
  - `deleteHole(db, id): Promise<'deleted' | 'in-use' | 'missing'>`, `deleteCourse(db, id): Promise<boolean>`
  - `publishedCourse(db, id): Promise<{ name: string; holes: Hole[] } | undefined>` and `publishedOfficialHoles(db): Promise<Hole[]>` (for games)

- [ ] **Step 1: Migration** `020_minigolf_courses.sql`:

```sql
-- Minigolf courses and holes the editor writes; a game copies the published course in at its start.
-- Design: docs/superpowers/specs/2026-10-14-minigolf-course-editor-design.md
CREATE TABLE minigolf_holes (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  published JSONB,
  draft JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE TABLE minigolf_courses (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'official',
  published JSONB,
  draft JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
```

Seeding the test course is data, not schema (and the migration runner splits files on `;`, which a JSON hole could contain), so this departs from the spec's "a migration seeds": do it in `minigolfCourses.ts` as `seedOfficialCourses(db)` (inserts the four test holes with their ids and a course `id: 'test'`, published, only when `minigolf_courses` is empty), called once at startup from `backend/src/index.ts` after migrations.

- [ ] **Step 2: Failing DB tests** (`describe.skipIf(!process.env.TEST_DATABASE_URL)`, `openTestSchema('minigolf_courses_test')`): seed creates one published course of 4 holes; `saveHoleDraft` with the current version updates and bumps it, with an old one returns `'conflict'`; `publishCourse` copies hole and course drafts to published and clears them in one go (a hole draft with a crossing outline makes it return `ok: false` with that hole's checks and changes nothing); a hole shared by two courses, published via course A, reads the new version through `publishedCourse(B)`; `deleteHole` of a used hole returns `'in-use'`; a draft referencing a deleted hole id makes `publishCourse` return a problem for that id; `publishedCourse` of a never-published course is `undefined`; `discardCourseDraft` clears the course draft and its holes' drafts, but keeps a hole draft that another course's draft also uses.
- [ ] **Step 3: Run** `cd backend && TEST_DATABASE_URL=… npx vitest run src/db/minigolfCourses.test.ts` — FAIL.
- [ ] **Step 4: Implement** the tables in `schema.ts` (JSON columns `unknown`, parsed with zod at the module boundary as `lobbies.ts` does: a `HoleSchema` — reuse the bench's `holeSchema` by moving it to `backend/src/shared/minigolf/holeSchema.ts` and importing it from both `bench.ts` and here; zod is a dependency of both packages), and the functions. Saves are `UPDATE … SET draft = $, version = version + 1, updated_at = now() WHERE id = $ AND version = $ RETURNING *` (no row → check existence → `'conflict'` or `'missing'`). `publishCourse` in `db.transaction()`: lock the course row (`FOR UPDATE`), take `draft ?? published`, for each hole id load `draft ?? published` (missing → problem), run `holeChecks`, collect errors; if none, set every hole's `published = draft, draft = null, published_at = now()` where it has a draft, then the course's. `publishedCourse` reads the course and its holes in one `REPEATABLE READ` transaction, so a game started during a publish gets the old or the new course whole.
- [ ] **Step 5: Run** — PASS. Also `npx vitest run src/db/migrations.test.ts`.
- [ ] **Step 6: Commit** — `feat(minigolf): store courses and holes with drafts`

### Task 4: The courses API

**Files:**

- Create: `backend/src/api/minigolfCourses.ts`, `minigolfCourses.test.ts`
- Modify: `schema/api-v1.yaml` (tag `minigolf`, paths, schemas `MinigolfCourse`, `MinigolfHoleRow`, `MinigolfCourseContent`, `MinigolfPublishProblem`), `backend/src/app.ts`; `npm run gen:api`

**Interfaces:**

- Consumes: Task 3's functions.
- Produces: `GET /api/minigolf/courses` (`listMinigolfCourses`), `POST /api/minigolf/courses` (`createMinigolfCourse`), `GET|PATCH|DELETE /api/minigolf/courses/{id}` (`getMinigolfCourse`, `saveMinigolfCourse`, `deleteMinigolfCourse`), `POST /api/minigolf/courses/{id}/publish` (`publishMinigolfCourse`), `POST /api/minigolf/courses/{id}/discard` (`discardMinigolfCourse`), `GET /api/minigolf/holes` (`listMinigolfHoles`, query `search`), `POST /api/minigolf/holes` (`createMinigolfHole`, body `{ hole }` or `{ copyOf }`), `GET|PATCH|DELETE /api/minigolf/holes/{id}` (`getMinigolfHole`, `saveMinigolfHole`, `deleteMinigolfHole`). PATCH bodies carry `version`. Errors: 403 `forbidden`, 404 `not found`, 409 `conflict`, 409 `in use`, 422 `{ error: 'invalid', problems }`.

- [ ] **Step 1: Failing API tests** (the app with a test DB, as other API tests do): a player gets only published official courses (no `draft` field) and 403 on every write and on `GET /holes`; an admin creates a hole and a course, saves drafts (version round-trip, 409 on stale), publishes (200) and a broken hole draft makes publish 422 with `problems`; deleting a used hole is 409 `in use`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the plugin like `api/voices.ts` (`fromSpec`, `Route<K>`), `preValidation: [requireAuth, requireAdmin]` on admin routes, `requireAuth` only on `GET /courses` and `GET /courses/{id}` (which hide drafts from non-admins via `isAdmin`). Register in `app.ts`. Add the YAML (copy the voice-packs blocks' shape); `npm run gen:api`.
- [ ] **Step 4: Run** the API tests and `src/api/spec.test.ts` — PASS.
- [ ] **Step 5: Commit** — `feat(minigolf): serve courses and holes to admins`

### Task 5: Games start from the published courses

**Files:**

- Modify: `backend/src/session/types.ts` (`prepareConfig?`), `backend/src/session/engine.ts` (`start`), `backend/src/games/minigolf.ts`, `backend/src/api/games.ts`, `backend/src/index.ts`
- Create: `backend/src/games/minigolfCourseSource.ts`
- Test: `backend/src/games/minigolf.test.ts`, `backend/src/session/engine.test.ts`, `backend/src/api/games.test.ts`

**Interfaces:**

- Consumes: `publishedCourse`, `publishedOfficialHoles`, `listCourses` (Task 3).
- Produces:
  - `GameModule.prepareConfig?(cfg: Cfg, rng: () => number): Promise<Cfg>` — called in `SessionEngine.start` after `validate`, before `newSession`; its result is the config stored and replayed. Throws `InvalidConfigError` for a course that can't be played.
  - `GameModule.liveOptions?(field: string): Promise<{ value: string; label: string }[] | null>` — `/api/gamemodes` replaces that field's static options with it.
  - `minigolfCourseSource.ts`: `type CourseSource = { course(id: string): Promise<{ name: string; holes: Hole[] } | undefined>; officialHoles(): Promise<Hole[]>; officialCourses(): Promise<{ id: string; name: string }[]> }`, `setCourseSource(s: CourseSource)`, `courseSource(): CourseSource` (defaults to the code courses, so tests and the bench work without a DB).
  - `MinigolfConfig` gains `holes?: Hole[]` and `courseName?: string` (filled by `prepareConfig`).

- [ ] **Step 1: Failing tests:**
  - minigolf: `prepareConfig({ course: 'test' })` with an in-memory source fills `holes` (4) and `courseName`; `'mixed'` picks 9 (or all, if fewer) from `officialHoles` with the given rng; an unknown course throws `InvalidConfigError`; `init` with `holes` uses them; `init` without `holes` (an old config) falls back to `getCourse` from code.
  - engine: a module's `prepareConfig` result is what the session stores (`config` read back from the session row equals the prepared one); a source publish after start doesn't change `state.holes`.
  - games API: `/api/gamemodes` lists the course options from `liveOptions` (an in-memory source with two courses shows both plus Mixed).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** `engine.start`: `const config = mod.prepareConfig ? await mod.prepareConfig(spec.config, seededRng(seed ^ 0x9e3779b9)) : spec.config` and use `config` from there on. minigolf: `prepareConfig` via `courseSource()`; `validate` keeps only the synchronous checks (course is a non-empty string); `init` uses `cfg.holes ?? (getCourse(cfg.course)?.holes ?? mixedHoles(rng))` and `cfg.courseName ?? …`; `liveOptions('course')` returns the official courses plus Mixed. `index.ts`: after migrations and `seedOfficialCourses`, `setCourseSource` with a DB-backed source (`publishedCourse`, `publishedOfficialHoles`, `listCourses({ drafts: false })`). `api/games.ts`: for each mode, `await mod.liveOptions?.(key)` per config field.
- [ ] **Step 4: Run** `cd backend && npm test` (with `TEST_DATABASE_URL`) — PASS; golden snapshots unchanged.
- [ ] **Step 5: Commit** — `feat(minigolf): start games from the published courses`

### Task 6: A shared 3D playtest

**Files:**

- Create: `backend/frontend/src/lib/components/minigolf/Playtest.svelte`
- Modify: `backend/frontend/src/routes/MinigolfBench.svelte` (uses it), `backend/frontend/src/lib/minigolf/bench.ts` (holeSchema moved to `$shared/minigolf/holeSchema` in Task 3)
- Test: `backend/frontend/src/lib/__tests__/minigolfBench.test.ts` (unchanged behaviour), a render test for `Playtest`

**Interfaces:**

- Produces: `<Playtest hole={Hole} physics={Physics} assist={boolean} onclose?={() => void} />` — owns `BenchState`, the dartboard, `Hole3D` (3D physics), stroke count, Reset/Undo/Replay; exports nothing else. The bench keeps its own toggles (view, physics, felt, shading, debug, forces, free camera) and passes what Playtest needs; the bench's 2D/debug paths stay in the bench.

- [ ] **Step 1: Failing test:** rendering `Playtest` (svelte/server) with the test course's hole 1 shows the dartboard (`aria-label="Dartboard"`), "Strokes 0", and a Reset button.
- [ ] **Step 2: Run** `cd backend/frontend && npx vitest run src/lib/__tests__/minigolfPlaytest.test.ts` — FAIL.
- [ ] **Step 3: Implement** by moving the bench's 3D play path (`shoot` with `simulateShot3d`, `playFrames`, `follow`, `replay`, aim preview) into `Playtest.svelte`; the bench renders `<Playtest>` when its view is 3D and physics 3D, and keeps its existing 2D path otherwise.
- [ ] **Step 4: Run** the frontend tests, typecheck, lint, and `e2e/tests/minigolf-bench.spec.ts` — PASS.
- [ ] **Step 5: Commit** — `refactor(minigolf): share the bench's 3D play as a playtest`

### Task 7: Pure editing operations and undo

**Files:**

- Create: `backend/frontend/src/lib/minigolf/editor/ops.ts`, `history.ts`, `backend/frontend/src/lib/__tests__/minigolfEditorOps.test.ts`

**Interfaces:**

- Consumes: `ElementRef` (Task 2), presets (Task 1).
- Produces (every op returns a new `Hole`, never mutates):
  - `snap(p: Pt, opts: { grid: boolean; angle45From?: Pt }): Pt`
  - `moveCorner(h, i, p)`, `addCorner(h, afterIndex)` (at the edge's middle), `removeCorner(h, i)` (refuses below 3: returns `h`)
  - `moveTee(h, p)`, `moveCup(h, p)`, `setCupSize(h, 'standard' | 'beginner')`
  - `addBumper(h, at, size: 'S' | 'M' | 'L', bounce: 'soft' | 'normal' | 'strong')`, `addWall(h, from, to, thickness: 'thin' | 'normal')`
  - `addHill(h, center, radius, heightMm)`, `addDip(h, center, radius, depthMm)` (radial strength = `height * G / radius`, negative for a dip), `addRidge(h, from, to, width, heightMm)` (bump strength = `height * G / width`), `addPlateau(h, from, to, heightMm, rampSide: 'N' | 'E' | 'S' | 'W')` (that side's edge 600 mm, others 60 mm)
  - `moveElement(h, ref, delta: Pt)`, `removeElement(h, ref)`, `duplicateElement(h, ref, offset: Pt)`
  - `elementsOf(h): { ref: ElementRef; label: string; detail: string }[]` (the Elements list: "Bumper 2 — M · normal", "Hill — 58 mm", "Plateau — ramp south")
  - `history.ts`: `createHistory(initial: Hole, limit = 100)` with `push(h)`, `undo(): Hole | null`, `redo(): Hole | null`, `canUndo`, `canRedo`.

- [ ] **Step 1: Failing tests:** each op on the test course's hole 1 (one `it` per op family: corners, tee/cup, bumper, wall, the four terrain shapes with their computed strengths and edges, move/remove/duplicate by ref, `elementsOf` labels); `snap` to the grid and to 45° (a point at 30° from the anchor snaps to 45°); a corner dragged across another edge is allowed (the op doesn't forbid it) and `holeChecks` then reports the outline error; history push/undo/redo/limit.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** them.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(minigolf): editing operations and undo for holes`

### Task 8: The editor's data store and autosave

**Files:**

- Create: `backend/frontend/src/lib/minigolf/editor/store.svelte.ts`, `backend/frontend/src/lib/__tests__/minigolfEditorStore.test.ts`

**Interfaces:**

- Consumes: the API (Task 4) via `api` (openapi-fetch).
- Produces: `createHoleStore(id: string, save = apiSaveHole, delayMs = 800)` returning `{ hole: Hole | null; status: 'loading' | 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict' | 'missing'; savedAt: Date | null; load(): Promise<void>; edit(h: Hole): void }` — `edit` updates `hole` at once and debounces a save with the last known version; a 409 sets `conflict`; a failure sets `error` and retries with backoff (1 s, 2 s, 5 s, then every 10 s). `createCourseStore(id)` the same for `CourseContent`, plus `publish()` (returns problems) and `discard()`.

- [ ] **Step 1: Failing tests** with a fake `save`: two edits within the delay make one save with the latest hole; the returned version is used next time; a 409 sets `conflict` and stops saving; a thrown error sets `error` and a later success sets `saved`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(minigolf): autosave editor drafts`

### Task 9: The course editor page

**Files:**

- Create: `backend/frontend/src/routes/MinigolfCourses.svelte`, `backend/frontend/src/lib/components/minigolf/editor/HoleLibrary.svelte`, `HoleThumb.svelte`
- Modify: `backend/frontend/src/App.svelte` (routes `/admin/minigolf/courses`, `/admin/minigolf/courses/:id`, lazy), `backend/frontend/src/routes/CreateSession.svelte` (an "Edit courses" link for admins under the Minigolf setup)
- Test: render tests for the course editor's pieces

**Interfaces:**

- Consumes: `createCourseStore` (Task 8), the API, `sortable`/`createReorder` (`$lib/actions/sortable`, `$lib/lobby/reorder.svelte` — generalise `createReorder` to `createReorder<T extends { id: string }>` if it's typed to lobby people).
- Produces: the page as the spec's "The course editor" section: left list (Official group, New course), centre (name, description, difficulty dots, totals, hole rows with drag handle / Edit / menu Duplicate · Remove from course, New hole), right library (search, All / Official, drag a card into the list), header (status, Preview round → `#/admin/minigolf?course=<id>&draft=1`, Discard draft, Publish changes with the problems listed under the header when refused). A course that's gone (`missing`) shows a notice and returns to the list. Guard: the bench's admin `$effect` + `{#if $currentUser?.isAdmin}`.

- [ ] **Step 1: Failing render tests:** the hole rows show index, name, par and the total par; a refused publish lists "Hole 2 · Outline crosses itself"; non-admins see nothing.
- [ ] **Step 2–4:** implement; frontend tests, typecheck, lint PASS; screenshots of the page (desktop) to the scratchpad for the reviewer.
- [ ] **Step 5: Commit** — `feat(minigolf): edit courses`

### Task 10: The hole editor page

**Files:**

- Create: `backend/frontend/src/routes/MinigolfHoleEditor.svelte`, `backend/frontend/src/lib/components/minigolf/editor/EditorCanvas.svelte`, `ToolRail.svelte`, `Properties.svelte`, `ElementList.svelte`, `CheckList.svelte`
- Modify: `backend/frontend/src/App.svelte` (route `/admin/minigolf/holes/:id`), `backend/frontend/src/routes/MinigolfBench.svelte` (reads `?course=&draft=1` for Preview round)

**Interfaces:**

- Consumes: ops + history (Task 7), `createHoleStore` (Task 8), `holeChecks` (Task 2), `Playtest` (Task 6), `Hole3D`, `HoleView` (as the canvas's base drawing).
- Produces: the page as the spec's "The hole editor": header (back to course, pager, name, par stepper, Undo/Redo, status, Test putt, Done), `ToolRail` (V O T C B W R; the active tool), `EditorCanvas` (draws with `HoleView`'s layers plus handles: corner squares and edge-midpoint ●, element selection ring, placement previews; pointer events in course mm via the SVG's `getScreenCTM`; snapping from `snap`), `Properties` (the active tool's options or the selection's fields; Duplicate/Delete), `ElementList`, `CheckList` (live `holeChecks`, clicking a check selects its element), a Show height map toggle (tints the 2D felt with `heightTint` from `$lib/minigolf/view3d`), a small `Hole3D` preview, a `beforeunload` warning while the store's status is `unsaved`/`saving`/`error`, a "This hole is gone" notice that links back to the course list when the store reports `missing`, keyboard shortcuts (tools, Ctrl+Z/Ctrl+Shift+Z, Delete, Escape), and Test putt opening `Playtest` in a modal.

- [ ] **Step 1: Failing render tests:** the tool rail lists the seven tools with their keys; selecting a bumper (props) shows its size/bounce; the check list shows the outline error for a crossing outline.
- [ ] **Step 2–4:** implement; frontend tests, typecheck, lint PASS; a headless-browser check on the dev stack (admin): draw a wall, place a bumper and a hill, undo, the 3D preview follows; screenshots to the scratchpad.
- [ ] **Step 5: Commit** — `feat(minigolf): edit holes`

### Task 11: The putting bot

**Files:**

- Create: `backend/src/shared/minigolf/bot.ts`, `bot.test.ts`, `backend/frontend/src/lib/minigolf/editor/botWorker.ts`
- Modify: `backend/frontend/src/routes/MinigolfHoleEditor.svelte` (Test the hole: progress, result, "Use as par")

**Interfaces:**

- Consumes: `simulateShot3d`/`initPhysics3d`, `seededRng`-style rng (copy the session's `seededRng` into shared code if it isn't there).
- Produces: `distanceField(hole: Hole, cell = 50): (p: Pt) => number` (felt distance to the cup around walls and bumpers, `Infinity` off the felt); `testHole(hole: Hole, physics: Physics, opts: { rounds: number; seed: number; maxStrokes: number; onRound?: (done: number) => void }): { reached: number; rounds: number; strokes: number[]; suggestedPar: number }`; the worker answers `{ type: 'progress', done }` and `{ type: 'result', result }` to `{ hole, physics, seed }`.

- [ ] **Step 1: Failing tests** (backend, `initPhysics3d` in setup): on the test course's Straight hole, `testHole(…, { rounds: 6, seed: 1, maxStrokes: 6 })` reaches every round and suggests par 2 or 3; the same seed gives the same result; a hole whose cup is enclosed by a closed wall square reaches 0; `distanceField` around a wall is longer than the straight line.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (greedy: per stroke, 8 directions × powers {0.45, 0.8}, simulate each, pick the lowest field value at rest (holed = −1), play it with aim noise ±3° and power noise ±8%). **Step 4: Run** — PASS; note the time for 20 rounds on the Dogleg in the report.
- [ ] **Step 5:** wire the worker (`new Worker(new URL('./botWorker.ts', import.meta.url), { type: 'module' })`) and the UI; frontend checks PASS.
- [ ] **Step 6: Commit** — `feat(minigolf): test a hole with a putting bot`

### Task 12: End to end and docs

**Files:**

- Create: `e2e/tests/minigolf-editor.spec.ts`
- Modify: `AGENTS.md` (Minigolf rows: courses in the DB, the editor's files, the course source), `DEVELOPMENT.md` (the seed)

- [ ] **Step 1:** e2e (admin): open `#/admin/minigolf/courses`, open the test course, edit hole 1's par in the hole editor, back, Publish changes; start a solo Minigolf game and see the new par on the hole card.
- [ ] **Step 2:** run the Minigolf e2e specs (`--workers=1`, fresh stack) — PASS.
- [ ] **Step 3:** docs.
- [ ] **Step 4: Commit** — `test(minigolf): edit, publish and play a course end to end` and `docs(minigolf): note the course editor`
