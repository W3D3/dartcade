# Higher Lower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Higher Lower (issue #109): a 2+ player lives game with a high and a low bar. It
gets a pure reducer, a match screen built around a 0–180 scale, an end screen, and every lobby,
history and setup touchpoint a game mode needs.

**Architecture:** A new `GameModule` `backend/src/games/hilo.ts`, wrapped with `withBullOff`, built
the way `backend/src/games/p121.ts` is (read it first: it is the worked example for every
backend task). The snapshot gets a `HiloGame` branch in `schema/game-ws-v1.json`, and the history a
`HiloDetail` branch in `schema/api-v1.yaml`. The frontend gets `HiloMatch` and `HiloSummary`, wired
into `GameDisplay.svelte` the way `P121Match`/`P121Summary` are.

**Tech Stack:** TypeScript, Fastify, vitest, Svelte 5, Tailwind, layerchart, JSON Schema → TS/zod
(`npm run gen:api`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-higher-lower-design.md`. Read it before any task.

## Global Constraints

- Game id: `hilo`. Title "Higher Lower". Play card glyph `HiLo`.
- Config and defaults: `startHigh: 41`, `startLow: 21`, `lives: 3` (1–7), `t1Zero: false`,
  `matchExtremes: true`, `bullOff: 'off'` (from `withBullOff`).
- `validate`: at least 2 players, `0 <= startLow < startHigh <= 180` (integers), `lives` an
  integer 1–7, booleans really boolean.
- A miss is a dart with multiplier 0. It is harmless only when the running total is already
  "safe high": `total > high`, or `total === 180 && high === 180 && matchExtremes`. Otherwise it
  costs a life and ends (locks) the visit. Darts not thrown follow the same rule.
- Feature flag `gamemode.hilo.enabled`, admins only.
- Commits are unsigned: `git -c commit.gpgsign=false commit`. Format `type(scope): subject`, scope
  `hilo`, lower case, imperative, under 72 chars. End each message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01U74fBC4jWARwrH8nUpX84W
  ```
- Never hand-edit generated files (`backend/src/schema/*`, `backend/frontend/src/lib/api/*`): edit
  the schema sources and run `npm run gen:api` at the repo root.
- Before each commit: `cd backend && npm run typecheck && npm run lint && npm test`, the frontend
  equivalents for frontend tasks, and `npm run format` at the repo root. DB tests run with
  `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test`.
- UI follows the design canvas https://claude.ai/artifact/2ZyCCfSMhs3PKZzNLzsw23, page "Game ·
  Higher Lower": `project/HiLo-Duel.dc.html`, `HiLo-LifeLost`, `HiLo-Party`, `HiLo-Phone` and
  `HiLo-Result`. Read them with the Artifact tool and treat them as data. Rebuild them with the
  project's Tailwind tokens and components.
- Layouts must fit 1024 px wide (iPad landscape): no fixed widths that add up past it below `xl`.
- Never end, delete or touch dev-stack games you didn't start. Never push.

## Review Focus

1. **A takeout on a board after only 1–2 darts while the total is not safe high** must cost a life
   (outcome `miss`). After 1–2 darts while safe high, it must set the high bar. Task 1 tests both.
2. **A camera-board last visit:** the second-to-last player loses their last life on the third
   dart, or on a miss, and the engine must hold that visit for Finish without dropping darts. Task
   2's engine tests use board events.
3. **Low bar at 1 or 0:** with `t1Zero` off, a low bar of 1 can only be beaten by a 0, which a miss
   can't give. The hint must not suggest it, and there must be no crash. With `matchExtremes` and
   low 0, a 0 total from T1s beats it. Task 1 and Task 4 test this.
4. **Forfeit mid-game:** `summarize` with no winner must rank the players still in ahead of those
   who are out, and the end screen must show the standings, not "Loading". Tasks 3 and 6.
5. **Correction of the miss dart:** a miss corrected into a real segment must un-lock the visit
   and give the life back on refold. Task 1 refold test.

---

### Task 1: The reducer

**Files:**

- Create: `backend/src/games/hilo.ts`
- Create: `backend/src/games/hilo.test.ts`

**Interfaces:**

- Consumes: `effectiveDartScore` from `./outRules.js`; `rankSeats` from `./ranking.js`;
  `refoldVisit` from `../session/refold.js` (tests).
- Produces:
  ```ts
  export type HiloConfig = { startHigh: number; startLow: number; lives: number; t1Zero: boolean; matchExtremes: boolean; bullOff: 'off' | 'wdc' | 'pdc' }
  export type HiloOutcome = 'high' | 'low' | 'between' | 'miss'
  /** A committed visit: who, the round, its total, what it did, and the bars after it. */
  export type HiloVisit = { seat: number; round: number; total: number; outcome: HiloOutcome; high: number; low: number }
  export type HiloResult = { seat: number; total: number; outcome: HiloOutcome; high: number; low: number } // bars BEFORE the visit
  export type HiloState = {
    cfg: HiloConfig
    high: number
    low: number
    lives: number[]
    /** Index into `visits` of the visit that took a player's last life; null while in. */
    outAt: (number | null)[]
    visits: HiloVisit[]
    order: number[]
    turn: number
    currentPlayer: number
    round: number
    visitTotal: number
    visitDarts: number
    missed: boolean
    phase: 'game' | 'finished'
    winner: number | null
    lastResult: HiloResult | null
  }
  export function safeHigh(total: number, high: number, cfg: HiloConfig): boolean
  export function judge(total: number, high: number, low: number, cfg: HiloConfig): 'high' | 'low' | 'between'
  export function dartScore(dart: Dart, cfg: HiloConfig): number | 'miss'
  export function compareSeats(s: HiloState, a: number, b: number): number // negative: a ahead; no seat-index fallback
  export const configMeta: Record<Exclude<keyof HiloConfig, 'bullOff'>, ConfigFieldMeta>
  export const hiloGame: GameModule<HiloState, HiloConfig, HiloView, 'hilo', HiloDetail> // view/summarize/detail stubbed until Tasks 2–3
  ```

Rules the reducer implements:

- `safeHigh(t, high, cfg) = t > high || (cfg.matchExtremes && high === 180 && t === 180)`.
- `judge(t, high, low, cfg)`: `safeHigh` gives `'high'`; `t < low || (cfg.matchExtremes && low === 0 && t === 0)` gives `'low'`; anything else gives `'between'`.
- `dartScore(d, cfg)`: multiplier 0 gives `'miss'`; `cfg.t1Zero && number === 1 && multiplier === 3` gives `0`; otherwise `effectiveDartScore(d, '25_50')`.
- **`visit.opened`:** reset `visitTotal`, `visitDarts`, `missed`.
- **`dart.detected`:**
  - When `phase === 'finished'`, or `missed`, or `visitDarts >= 3`: return `s` unchanged.
  - Otherwise clear `lastResult` and work out `dartScore`.
  - On `'miss'`: if `safeHigh(visitTotal)`, count the dart only (`visitDarts + 1`). Else set `missed = true` and count the dart.
  - Otherwise add the score to `visitTotal` and count the dart.
- **`takeout.finished` / `visit.cleared`** (no-op when `phase === 'finished'`):
  - The outcome is `'miss'` if `missed`, or if `visitDarts < 3 && !safeHigh(visitTotal)`. Otherwise it's `judge(visitTotal, …)`.
  - `'high'` sets `high = visitTotal`, and `'low'` sets `low = visitTotal`.
  - `'between'` and `'miss'` cost a life. At 0 lives, `outAt[seat] = visits.length`, the index of the visit being pushed.
  - Push the `HiloVisit` (with the bars after it) and set `lastResult` (with the bars before it).
  - Then advance: the next seat in `order` with lives > 0. When fewer than 2 seats have lives left, set `phase = 'finished'` and `winner` to the seat still in. A turn index that wraps increments `round`.
  - Reset the open-visit fields.
- **Placement** (`compareSeats`): a seat still in ranks ahead of a seat that's out. Among seats still in, more lives first. Among seats that are out, the later `outAt` first.
- `init`: `order = [0…n-1]`, lives filled, round 1, bars from cfg.
- `version: 1`.
- `defaultConfig` includes `bullOff: 'off'`, as p121 does.
- `configMeta`:
  - `startHigh`, `startLow` and `lives`: labels and tooltips, no options (Steppers).
  - `t1Zero`, label "Treble 1 counts as 0": Off/On options.
  - `matchExtremes`, label "Match the extremes", tooltip "180 beats a high bar of 180, and 0 beats a low bar of 0.": Off/On options.
- `validate` per Global Constraints. Return reason strings like p121's ("At least 2 players", "Low bar must be below the high bar", …).
- `throwOrder: s => [...s.order]`.
- `getCurrentPlayer: s => s.currentPlayer`.
- `onUserAction` returns `s`.

- [ ] **Step 1: Write the failing tests** `backend/src/games/hilo.test.ts`. Build the helpers like `p121.test.ts` (`dart(n, m, i)`, `opened`, `takeout`, `play(s, ...visits)`):

```ts
const cfg: HiloConfig = { startHigh: 41, startLow: 21, lives: 3, t1Zero: false, matchExtremes: true, bullOff: 'off' }
const duo = (c: Partial<HiloConfig> = {}) => hiloGame.init({ ...cfg, ...c }, [{ name: 'A' }, { name: 'B' }])
const T20: [number, number] = [20, 3], S20: [number, number] = [20, 1], S1: [number, number] = [1, 1], MISS: [number, number] = [0, 0]

describe('judge', () => {
  it.each([
    [60, 41, 21, true, 'high'], [41, 41, 21, true, 'between'], [21, 41, 21, true, 'between'], [20, 41, 21, true, 'low'],
    [180, 180, 21, true, 'high'], [180, 180, 21, false, 'between'], [0, 60, 0, true, 'low'], [0, 60, 0, false, 'between'],
  ] as const)('%i on %i/%i, extremes %s → %s', (t, high, low, matchExtremes, out) => {
    expect(judge(t, high, low, { ...cfg, matchExtremes })).toBe(out)
  })
})

describe('a visit', () => {
  it('above the high bar sets it', () => {
    const s = play(duo(), [T20, S1, S1]) // 62
    expect(s).toMatchObject({ high: 62, low: 21, currentPlayer: 1 })
    expect(s.visits[0]).toEqual({ seat: 0, round: 1, total: 62, outcome: 'high', high: 62, low: 21 })
  })
  it('below the low bar sets it', () => expect(play(duo(), [S1, S1, [5, 1]]).low).toBe(7))
  it('between costs a life, bars stay', () => {
    const s = play(duo(), [S20, [5, 1], [5, 1]]) // 30
    expect(s).toMatchObject({ high: 41, low: 21, lives: [2, 3] })
    expect(s.lastResult).toEqual({ seat: 0, total: 30, outcome: 'between', high: 41, low: 21 })
  })
  it('a miss below the high bar costs a life and locks the visit', () => {
    let s = hiloGame.onBoardEvent(duo(), opened).state
    s = hiloGame.onBoardEvent(s, dart(5, 1, 0)).state
    s = hiloGame.onBoardEvent(s, dart(0, 0, 1)).state
    expect(s.missed).toBe(true)
    s = hiloGame.onBoardEvent(s, dart(20, 3, 2)).state // ignored
    s = hiloGame.onBoardEvent(s, takeout).state
    expect(s).toMatchObject({ lives: [2, 3], high: 41, low: 21 })
    expect(s.visits[0].outcome).toBe('miss')
  })
  it('a miss already under the low bar still costs a life', () => {
    expect(play(duo(), [S1, MISS, S1]).lives).toEqual([2, 3])
  })
  it('a miss once safe high is harmless', () => {
    const s = play(duo(), [T20, MISS, MISS])
    expect(s).toMatchObject({ high: 60, lives: [3, 3] })
  })
  it('an early takeout: a life unless safe high', () => {
    expect(play(duo(), [S1]).lives).toEqual([2, 3])
    expect(play(duo(), [T20]).high).toBe(60)
  })
  it('T1 counts as 0 with the option', () => {
    expect(play(duo({ t1Zero: true, startLow: 1 }), [[1, 3], [1, 3], [1, 3]]).low).toBe(0)
    expect(play(duo({ startLow: 10 }), [[1, 3], [1, 3], S1]).low).toBe(7)
  })
})

describe('turns and the end', () => {
  it('skips players who are out, rounds count up, the last one in wins', () => {
    const g = hiloGame.init({ ...cfg, lives: 1 }, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
    let s = play(g, [S20, [5, 1], [5, 1]]) // A out (30 between)
    s = play(s, [T20, S1, S1]) // B 62 high
    expect(s.currentPlayer).toBe(2)
    s = play(s, [S20, S20, S20]) // C 60, between 21 and 62 → out
    expect(s).toMatchObject({ phase: 'finished', winner: 1 })
    expect(s.outAt).toEqual([0, null, 2])
  })
  it('round increments when play wraps', () => {
    const s = play(duo(), [T20, S1, S1], [S1, S1, S1])
    expect(s.round).toBe(2)
  })
  it('compareSeats: in before out, more lives first, later out first', () => {
    const s = { ...duo(), lives: [0, 2, 0, 1], outAt: [3, null, 5, null] } as HiloState
    const order = [0, 1, 2, 3].sort((a, b) => compareSeats(s, a, b))
    expect(order).toEqual([1, 3, 2, 0])
  })
})

describe('corrections', () => {
  it('correcting the miss into a segment unlocks the visit on refold', () => {
    const start = hiloGame.onBoardEvent(duo(), opened).state
    expect(refoldVisit(hiloGame, duo(), [opened, dart(0, 0, 0)]).missed).toBe(true)
    expect(refoldVisit(hiloGame, duo(), [opened, dart(20, 1, 0)]).missed).toBe(false)
    void start
  })
})

describe('validate', () => {
  const two = [{ name: 'A' }, { name: 'B' }]
  it('passes the defaults', () => expect(hiloGame.validate!(hiloGame.defaultConfig, two)).toBeNull())
  it('refuses bad setups', () => {
    expect(hiloGame.validate!(cfg, [{ name: 'A' }])).not.toBeNull()
    expect(hiloGame.validate!({ ...cfg, startLow: 41 }, two)).not.toBeNull()
    expect(hiloGame.validate!({ ...cfg, startHigh: 181 }, two)).not.toBeNull()
    expect(hiloGame.validate!({ ...cfg, lives: 8 }, two)).not.toBeNull()
    expect(hiloGame.validate!({ ...cfg, lives: '3' as unknown as number }, two)).not.toBeNull()
  })
})
```

Re-derive any expectation that fails from the rules before changing it, and record it in the report.

- [ ] **Step 2: Run the tests and check they fail.** `cd backend && npx vitest run src/games/hilo.test.ts`.
- [ ] **Step 3: Implement `hilo.ts`.** Keep `endVisit`, `advance` and `compareSeats` as small module-level functions, as in p121. Stub `view` to `{}` and `summarize`/`detail` with minimal typed values, with placeholder `HiloView`/`HiloDetail` types. Don't register the module.
- [ ] **Step 4: Run the tests and check they pass.** Then run typecheck and lint.
- [ ] **Step 5: Commit.** `feat(hilo): add the higher lower reducer`

---

### Task 2: View, snapshot, registration, flag, engine tests

**Files:**

- Modify: `schema/game-ws-v1.json` (`HiloGame`, `HiloSnapshot`, a `Snapshot.oneOf` branch); run `npm run gen:api`
- Modify: `backend/src/session/views.ts` (`HiloView`, `HiloModuleView`)
- Modify: `backend/src/session/types.ts` (`AnyGameModule` branch, `D` = `unknown` for now)
- Modify: `backend/src/games/hilo.ts` (real `view`, `hiloModule = withBullOff(hiloGame, { applyStartOrder })`)
- Modify: `backend/src/games/index.ts`, `backend/src/flags/definitions.ts` (`gamemode.hilo.enabled`, admins only, a copy of `gamemode.p121.enabled`)
- Fix exhaustive game-id switches that break (`grep -rn "'p121'" backend/src` shows them, e.g. `engine.ts`, `history/detail.ts`)
- Test: `backend/src/games/hilo.test.ts`, plus an engine test next to the existing "121 on a camera board" test in `backend/src/session/engine.test.ts`

**Interfaces:**

- Consumes: Task 1.
- Produces the snapshot `game` for `gameId: 'hilo'`:

  ```
  HiloGame {
    cfg: { startHigh, startLow, lives, t1Zero, matchExtremes }
    phase: 'bulloff' | 'game' | 'finished'
    high, low, round, currentPlayer, nextPlayer: int|null, winner: int|null, visitLocked: boolean
    visitTotal: int
    seats: [{ lives, out: boolean, place: int|null, outRound: int|null, visits: [{ round, total, outcome }] }]
    lastResult: { seat, total, outcome, high, low } | null
    bullOff, currentVisitDarts, totalDarts, totalVisits
  }
  ```
  - `visitLocked = missed`.
  - `place` for a seat that's out is the number of seats still in, plus the number out after it,
    plus 1. In other words, it's the seat's position in the `compareSeats` ranking. The winner
    gets 1 once the game is finished.
  - `nextPlayer` uses the same `advance` logic, with no copy. It's null when finished, or when
    this visit would end the game.
  - `outRound` is the round of the visit at `outAt`.

- [ ] **Step 1: Write the failing tests.**
  - View tests: after a high visit; a seat that's out has `out: true` with `place`; `winner` is always present.
  - `hiloModule.init({...cfg, bullOff: 'wdc'}, two).stage === 'bulloff'`.
  - Engine-level tests driven by board events, copying how the 121 camera-board test drives `onBridgeEvent`:
    - (a) Two players at 1 life each. The player up throws S20, S5, S5 = 30, between the bars. After the third dart `awaitsFinish` is true, and the takeout ends the game.
    - (b) After S5 and a miss, the visit is locked and held. Darts after it are dropped. The Finish ends the game.
    - (c) A non-final visit after one dart is not held: the second dart is accepted.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement the schema, view, registration and flag.** Run `npm run gen:api`, then fix any switches the typecheck flags.
- [ ] **Step 4: Run the backend typecheck, lint and full tests.** Run the frontend typecheck too.
- [ ] **Step 5: Commit.** `feat(hilo): register higher lower behind its flag`

---

### Task 3: History

**Files:**

- Modify: `schema/api-v1.yaml` (add `HiloDetail`, plus its branch and mapping in `GameDetail.detail`; use `nullable: true`, OpenAPI 3.0, not type arrays); run `npm run gen:api`
- Modify: `backend/src/session/types.ts` (`HiloDetail`, the `D` of the branch)
- Modify: `backend/src/games/hilo.ts` (`summarize`, `detail`, `matchStats`)
- Test: `hilo.test.ts`, `backend/src/games/detail.contract.test.ts`

**Interfaces:**

- Produces `HiloDetail`:
  `{ mode: 'hilo', start: { high, low }, visits: [{ seat, round, total, outcome, high, low }], seats: [{ place, outRound: int|null(nullable), livesLeft }] }`.
- Stat keys from `summarize`:
  - `livesLeft`, `visits`, `livesLostBetween`, `livesLostMiss`, `dartsThrown` (from `ctx.totalDarts[i]`)
  - `highestSet`/`lowestSet`: only when that seat set one
  - `outRound`: only when the seat went out
- `matchStats` rows, built with the `row()`/`values()` helpers:
  - `visitsSurvived`: ratio of visits
  - `highestSet`: higher is better
  - `lowestSet`: lower is better
  - `livesLost`: lower is better

- [ ] **Step 1: Write the failing tests.**
  - `summarize` on a finished 3-player game: placements 1, 2, 3 by when each went out, plus the exact stats.
  - `summarize` on a forfeit-style unfinished game with no winner: seats still in rank first.
  - `detail` for a short game.
  - The contract test validates `hiloModule.detail(...)` and `matchStats(...)` against the schema, as the P121 case does.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement the history functions.**
- [ ] **Step 4: Run the backend suite (with the DB) and the frontend typecheck.**
- [ ] **Step 5: Commit.** `feat(hilo): keep higher lower results and match stats`

---

### Task 4: Frontend plumbing: everything a game mode touches outside its screens

**Files:**

- Modify: `backend/frontend/src/lib/gameState.ts` (a `hilo` member in every variant)
- Modify: `backend/frontend/src/lib/gameViews/index.ts`, `meta.ts` (title "Higher Lower", `hiloMeta`, the shared `hiloRules`)
- Modify: `backend/frontend/src/lib/gameModes.ts` (`hilo`: desc, glyph `HiLo`, `available: true`, flag)
- Modify: `backend/frontend/src/lib/components/GameSettings.svelte` (a `hilo` branch: Steppers for start high, start low and lives, toggles for `t1Zero` and `matchExtremes`, bull off. The labels come from `meta`; read how the p121 and X01 branches do it)
- Modify: `backend/frontend/src/lib/lobby/play.ts` (`chosenGame` carries all six hilo fields) and `lib/__tests__/lobbyPlay.test.ts`
- Modify: `backend/frontend/src/lib/lobby/format.ts` (the next-game line, e.g. "Higher Lower · 41 / 21 · 3 lives") and wherever `GAME_NAMES` / the lobby glyph live (see how p121 was added: `git log --oneline -S"121 Checkout" -- backend/frontend/src`)
- Modify: `backend/frontend/src/lib/history.ts` (`rulesLine`, `historyStat` showing the place a player went out, e.g. "Out in round 4" or "Winner", `statTiles` entries) and its tests
- Modify: `backend/frontend/src/lib/winScreen.ts` (`winView` null and `winMeta` for `hilo`)
- Create: `backend/frontend/src/lib/hilo/view.ts` with its test

**Interfaces:**

- Consumes: the generated `HiloGame` type.
- Produces, in `lib/hilo/view.ts`:

  ```ts
  export function hiloMeta(game: HiloGame, players: number): string                 // "2 players · 3 lives · Round 4"
  export function needsLine(game: HiloGame): string                                  // "Over 60 · under 15"
  /** The smallest total for the darts left that beats the high bar; null when not reachable (needs > 60 × darts left) or already safe. */
  export function highHint(game: HiloGame, dartsThrown: number): { need: number; label: string } | null // { need: 36, label: '36+ · beats HIGH 60' }
  export function outcomeText(v: { total: number; outcome: HiloOutcome }): string    // 'Set HIGH 60' | 'Set LOW 7' | 'Lost a life · 45' | 'Missed the board'
  export function bannerText(r: NonNullable<HiloGame['lastResult']>): string | null  // '−1 life · 45 is between 15 and 60' | '−1 life · missed the board' | null for high/low
  export function zoneOf(total: number, game: HiloGame): 'safe-high' | 'safe-low' | 'danger'
  ```

  `highHint` uses the visit total so far: `need = high + 1 - visitTotal`, which must be ≤ 60 × darts left and > 0. With `matchExtremes` on and the high bar at 180, there's no hint.

- [ ] **Step 1: Write the failing tests.**
  - `view.test.ts`: each helper, including `highHint` null when out of reach and with the high bar at 180, `zoneOf` at the extremes, and both banner variants.
  - `lobbyPlay.test.ts`: the hilo fields carried and no leaking keys.
  - history: `rulesLine` and `historyStat` for a hilo row.
- [ ] **Step 2: Run them and check they fail.**
- [ ] **Step 3: Implement.** Fix every `gameState` destructuring the typecheck flags.
- [ ] **Step 4: Run the frontend typecheck, lint and tests.**
- [ ] **Step 5: Commit.** `feat(hilo): set up higher lower in the play page, lobby and history`

---

### Task 5: The match screen

**Files:**

- Create: `backend/frontend/src/lib/components/hilo/HiloScale.svelte` (`orientation: 'vertical' | 'horizontal'`)
- Create: `backend/frontend/src/lib/components/hilo/HiloPanel.svelte` (duel panel), `HiloRow.svelte` (party row), `Hearts.svelte` (lives)
- Create: `backend/frontend/src/lib/components/hilo/HiloMatch.svelte` (layouts `duel` | `party` | `phone`; `solo` never happens since a hilo game has 2+ players)
- Modify: `backend/frontend/src/routes/GameDisplay.svelte` (`hilo` derived, `{:else if hilo}` branch like `p121`, `locked` and `bullOff` include `hilo`)
- Test: component SSR tests like `p121Match.test.ts`

**Interfaces:**

- Consumes: Task 4's helpers, `DartSlots`, `ControlBar`, `DartBoard`, `DartKeypad` (with `replacing` for keypad corrections: copy P121Match's `keyDart`), `ConfirmModal` (not needed: there's no give up).
- `HiloMatch` props: the same shape as `P121Match`'s (game, players, darts, layout, canThrow, locked, canUndo, next, onUndo, onNext, onBoardClick, onCorrect, onDart, keypad, settings), without `onGiveUp`.

Layout, per the artboards:

- **Duel:** a panel on each side of the board. Each panel shows the name, a Throwing/Up next pill, hearts with lost ones dimmed, "Needs", the last visit and the visit list. In the centre, the vertical `HiloScale` sits next to the board, then the "This visit" band coloured by `zoneOf`, the slots (the third slot shows `highHint`), and Undo / Next.
- **LifeLost moment:** `lastResult` with a life lost shows the red banner from `bannerText` in place of the "This visit" band until the next dart. The losing player's panel goes red, and their heart pulses unless reduced motion is on.
- **Party:** stacked rows on the left, the board and scale on the right. Players who are out are dimmed and show "Out · 4th".
- **Phone:** a compact row for the other player, a card for the thrower, the horizontal `HiloScale`, the board, the slots and Undo / Next.
- **Widths:** below `xl`, panels and the scale narrow so the duel fits 1024 px. Check this in the browser.
- **Accessibility:** the scale is `role="img"` with an `aria-label` like the artboard's ("Scale from 0 to 180. HIGH bar at 60, LOW bar at 15. This visit is 25, between the bars."). Hearts are `role="img"` labelled "2 of 3 lives left". The banner uses `role="alert"`.

- [ ] **Step 1: Write failing SSR tests.**
  - The duel renders both names, "Over 60 · under 15", and a scale label with both bars.
  - The third slot shows "36+".
  - With a `lastResult` of `between`, the banner text appears.
  - In party, a player who is out shows "Out · 2nd".
- [ ] **Step 2: Build the components and the GameDisplay branch.**
- [ ] **Step 3: Check it in the dev stack** (http://localhost:5173, admin@dartcade.local has the flag). Start a 2-player hilo game with a guest and manual darts, and play a high, a low, a between and a miss.
  - Take screenshots of the duel, life lost, party (add 2 guests) and phone (390 px). Check the duel at 1024 px wide; a same-origin iframe of that width works if the window can't be resized.
  - Compare them with the artboards. Save them under the workspace `screens/` folder the controller names.
- [ ] **Step 4: Run the frontend typecheck, lint and tests.**
- [ ] **Step 5: Commit.** `feat(hilo): add the higher lower match screen`

---

### Task 6: The end screen

**Files:**

- Create: `backend/frontend/src/lib/hilo/summary.ts` with its test (pure data shaping from `HiloDetail` plus the match stats)
- Create: `backend/frontend/src/lib/components/hilo/HiloSummary.svelte`, `HiloBarsChart.svelte` (layerchart, in the style of `P121TriesChart`)
- Modify: `backend/frontend/src/routes/GameDisplay.svelte` (show the summary for a finished hilo game; fetch `/api/games/{id}` for hilo even with no winner; fanfare once), `backend/frontend/src/routes/GameDetails.svelte` (a hilo section without buttons), `lib/details/page.ts` if it switches on mode

**Interfaces:**

- Produces:
  ```ts
  export type HiloSummaryData = {
    winner: { seat: number; livesLeft: number } | null
    tiles: { visitsSurvived: [number, number]; highestSet: { value: number; seat: number; round: number } | null; lowestSet: { value: number; seat: number; round: number } | null; livesLost: { total: number; between: number; miss: number } }
    series: { visit: number; high: number; low: number; lost: 'between' | 'miss' | null }[]
    placings: { seat: number; place: number; outRound: number | null; outVisit: { total: number; high: number; low: number } | null; livesLeft: number }[]
  }
  export function summaryData(detail: HiloDetail): HiloSummaryData
  /** Standings from the snapshot alone (spectators, a failed fetch, before the fetch lands); forfeited seats last. */
  export function snapshotStandings(game: HiloGame, players: { name: string }[], forfeited: boolean[]): { seat: number; name: string; place: number; livesLeft: number }[]
  ```

Layout, per `HiLo-Result`:

- "Last one standing", "<Name> wins", hearts left.
- Four tiles: visits survived (x/y), highest bar set (with who and in which round), lowest bar set, lives lost (split between and missed).
- The HIGH/LOW chart over every visit, with the danger area between the bars shaded and markers for lives lost (filled for between, a ring for missed).
- Placings, each with the round the player went out and the visit that knocked them out ("Out in round 7 · 58 between 4 and 121").
- "How lives were lost" bars.
- Buttons from `winActions()`: a primary `rematch` reads "Rematch", the rest use `WIN_LABELS`.
- On the details page, the same component without buttons, inside a `<main>`.

- [ ] **Step 1: Write the failing tests** for `summaryData` and `snapshotStandings`: a forfeit puts the forfeited player last, and the series has one point per visit.
- [ ] **Step 2: Implement it, then check the tests pass.**
- [ ] **Step 3: Build the components and wire them in.** A failed fetch falls back to the standings, never to an endless "Loading".
- [ ] **Step 4: Check in the dev stack.** Finish a 2-player game with lives 1 (it's quick). Screenshot the end screen, the details page and the phone. Compare them with `HiLo-Result`.
- [ ] **Step 5: Run the frontend checks.**
- [ ] **Step 6: Commit.** `feat(hilo): show the higher lower result`

---

### Task 7: E2E and docs

**Files:**

- Create: `e2e/tests/game-hilo.spec.ts` (copy `game-p121.spec.ts`'s setup; `startGame` in `e2e/fixtures/lobby.ts` takes a `mode` union, so add `'Higher Lower'`)
- Modify: `AGENTS.md` (a "Where to look" row)

- [ ] **Step 1: Write the e2e test.** Admin user, then Play, pick Higher Lower, set lives to 1, add one guest, start.
  - Player 1 throws T20, S1, S1 (62: sets HIGH).
  - The guest throws S20, S5, S5 (30: between). With one life the guest is out, and the game ends.
  - The summary shows "<name> wins" and "Rematch".
- [ ] **Step 2: Run it** with the repo's e2e command (see `e2e/package.json` and how 121's ran). It must pass.
- [ ] **Step 3: Add the AGENTS.md row:**
      `| Higher Lower: two bars, lives, misses; match screen and result | backend/src/games/hilo.ts; frontend lib/components/hilo/, lib/hilo/; behind gamemode.hilo.enabled |`
- [ ] **Step 4: Run `npm run format`, then the backend and frontend unit suites.**
- [ ] **Step 5: Commit.** `test(hilo): play a higher lower game end to end`. The AGENTS.md row can go in its own `docs(hilo): note where higher lower lives` commit.
