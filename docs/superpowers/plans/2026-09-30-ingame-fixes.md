# In-game Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the minor findings left from the in-game redesign review, plus the X01 rule gaps (leaving 1 on double/master out, Bull as a double) and the empty-turn / locked-visit behaviour the user decided on.

**Architecture:** Two backend changes (X01 rules in `backend/src/games/x01.ts`, visit handling in `backend/src/session/engine.ts`), then frontend changes that stay in the pattern of the redesign: rules in small tested modules under `backend/frontend/src/lib/`, components only render.

**Tech Stack:** TypeScript, Vitest (backend and frontend), Svelte 5, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-30-ingame-redesign-design.md` plus the decisions below (made by the user on 2026-09-30).

## Decisions (binding)

1. **Leaving 1 busts** on double out and master out (no dart can finish from 1). Straight out is unchanged.
2. **The Bull counts as a double** for finishing and opening, whatever multiplier the dart carries (manual entry and board clicks send `number: 50, multiplier: 1`; the score stays 50).
3. **A finished visit takes no more darts.** After a bust, a checkout or a win, the engine ignores manual `add_dart`; the keypad and board clicks are disabled and the page says to press "Next player".
4. **An empty turn is three misses.** Pressing the next-player button with no darts records a visit of three misses (darts count towards the player's totals) and moves on. Not during the bull off, not after a win.
5. **Button label:** "Next player" (outline style) when the session has no board, when three darts are in, or when the visit is over; otherwise (board session, 0–2 darts) the quiet "Skip to next". The button is always enabled while the game runs, disabled after a win.
6. **Narrow screens** (< ~1280px) stay out of scope.
7. **Averages** stay points per dart thrown × 3 (standard 3-dart average); unchanged.
8. **"Other players' targets" is an Around the Clock setting only.** The settings drawer does not show it in X01 games (the stored value is kept).

## Global Constraints

- Backend tests: `cd backend && npx vitest run <file>`; the whole backend suite needs `@fastify/rate-limit` installed locally (`src/api/pairing.test.ts` fails to load without it — pre-existing, not caused by this plan). Run `npx vitest run src/games src/session` as the backend gate.
- Frontend tests: `cd backend/frontend && npx vitest run`; types: `npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0 errors). `npm run typecheck` does not work locally (svelte-check missing from node_modules).
- Keep e2e selectors: `DartEntryPanel` `aria-label`s ("Single 1", …), the "Triple" button text, visible "Bust", "Target", "N of 21 done".
- Copy exactly as written here.
- The dev backend runs under `tsx watch` in Docker. After backend edits, check it reloaded (`docker exec dartcade-backend-1 ps -o pid,args` shows one `loader.mjs src/index.ts` process); if two are listed, `docker restart dartcade-backend-1`.

## Review Focus

1. **A bust on the last dart of a visit, then "Next player".** The visit is recorded once, as a bust; no extra misses are added (the empty-turn rule only applies when no dart is in). Pinned by Task 2 "takeout after a bust records that visit, not misses".
2. **Empty turn during the bull off or after a win.** Nothing happens (no misses recorded, no turn change). Pinned by Task 2 "empty takeout is ignored during the bull off" and "… after a win".
3. **Bull checkout with a double-out hint.** The hint says "Bull" at 50 left; clicking the bull or the keypad's "50 · Bull" wins the leg. Pinned by Task 1 "bull finishes a double-out leg".
4. **Undo after a bust.** Undoing the bust dart unlocks the visit again (darts accepted). Pinned by Task 2 "undo after a bust accepts darts again".
5. **Two ATC players on the same target** see two separate initials on the board. Pinned by Task 3 "spreads markers on the same segment".

---

### Task 1: X01 rules — Bull is a double, leaving 1 busts

**Files:**
- Modify: `backend/src/games/x01.ts` (`opensPlayer`, `validFinish`, the two bust conditions in `dart.detected`)
- Test: `backend/src/games/x01.test.ts`

**Interfaces:** none new.

- [ ] **Step 1: Failing tests**

Append to `backend/src/games/x01.test.ts` (helpers `makeState`, `openedVisit`, `dartEvent`, `defaultCfg`, `x01Game` exist at the top of the file):

```ts
describe('bull as a double, leaving 1', () => {
  it('bull finishes a double-out leg', () => {
    const s = openedVisit(makeState({ scores: [50, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(50, 'Double', 1))
    expect(state.scores[0]).toBe(0)
    expect(state.bustThisVisit).toBe(false)
  })

  it('bull opens a double-in player', () => {
    const s = openedVisit(makeState({ cfg: { ...defaultCfg, inMode: 'double' }, opened: [false, false] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(50, 'Double', 1))
    expect(state.opened[0]).toBe(true)
    expect(state.scores[0]).toBe(451)
  })

  it('leaving 1 on double out busts', () => {
    const s = openedVisit(makeState({ scores: [21, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(21)
    expect(state.bustThisVisit).toBe(true)
  })

  it('leaving 1 on master out busts', () => {
    const s = openedVisit(makeState({ cfg: { ...defaultCfg, outMode: 'master' }, scores: [21, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.bustThisVisit).toBe(true)
  })

  it('leaving 1 on straight out is fine', () => {
    const s = openedVisit(makeState({ cfg: { ...defaultCfg, outMode: 'straight' }, scores: [21, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(1)
    expect(state.bustThisVisit).toBe(false)
  })

  it('leaving 1 with the opening dart on double in / double out busts', () => {
    const s = openedVisit(makeState({ cfg: { ...defaultCfg, inMode: 'double' }, opened: [false, false], scores: [41, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'Double', 2))
    expect(state.scores[0]).toBe(41)
    expect(state.bustThisVisit).toBe(true)
  })
})
```

- [ ] **Step 2: Run** `cd backend && npx vitest run src/games/x01.test.ts` — Expected: the new tests fail (bull finish busts; leaving 1 does not bust); "straight out is fine" passes already.

- [ ] **Step 3: Implement** in `backend/src/games/x01.ts`:

Add above `opensPlayer`:

```ts
// The bull counts as a double however it is reported (Board Manager and manual
// entry send number 50 with multiplier 1; its score is 50 either way).
const isDouble = (dart: Dart) => dart.segment.multiplier === 2 || dart.segment.number === 50
```

Replace the bodies:

```ts
function opensPlayer(dart: Dart, inMode: 'straight' | 'double' | 'master'): boolean {
  if (inMode === 'straight') return true
  if (inMode === 'double') return isDouble(dart)
  return isDouble(dart) || dart.segment.multiplier === 3
}

function validFinish(dart: Dart, outMode: 'straight' | 'double' | 'master'): boolean {
  if (outMode === 'straight') return true
  if (outMode === 'double') return isDouble(dart)
  return isDouble(dart) || dart.segment.multiplier === 3
}

/** Nothing can finish from 1 unless any dart may finish. */
const deadEnd = (score: number, outMode: 'straight' | 'double' | 'master') => score === 1 && outMode !== 'straight'
```

In `dart.detected`, both bust conditions `if (newScore < 0 || (newScore === 0 && !validFinish(dart, s.cfg.outMode)))` become:

```ts
if (newScore < 0 || deadEnd(newScore, s.cfg.outMode) || (newScore === 0 && !validFinish(dart, s.cfg.outMode))) {
```

- [ ] **Step 4: Run** `npx vitest run src/games src/session` — Expected: all pass.

- [ ] **Step 5: Commit** `git add backend/src/games/x01.ts backend/src/games/x01.test.ts && git commit -m "fix(x01): bull counts as a double, leaving 1 busts on double and master out"`

---

### Task 2: Engine — finished visits take no darts, an empty turn is three misses

**Files:**
- Modify: `backend/src/session/engine.ts` (`onUserAction`: `takeout` and `add_dart` branches)
- Test: `backend/src/session/engine.test.ts`

**Interfaces:**
- Produces: `add_dart` is ignored while the current view has `visitLocked === true` or a `winner`; `takeout` with no open events records `visit.opened` plus three `Miss` darts (via `manualDart`) and counts 3 darts, then commits as usual.

- [ ] **Step 1: Failing tests** — append inside `describe('onUserAction', …)` in `backend/src/session/engine.test.ts`:

```ts
  const T20 = { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 } as const
  const S20 = { name: 'S20', number: 20, bed: 'SingleOuter', multiplier: 1 } as const
  const x01Cfg = { ...x01Module.defaultConfig, startScore: 101 }

  it('empty takeout records three misses and moves on', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', x01Cfg, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, { type: 'takeout' })
    const s = engine.getSession(sessionId)!
    expect(s.totalVisits).toEqual([1, 0])
    expect(s.totalDarts).toEqual([3, 0])
    expect(engine.getSnapshot(sessionId)!.game.currentPlayer).toBe(1)
  })

  it('takeout after a bust records that visit, not misses', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, startScore: 41 }, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: T20 })
    await engine.onUserAction(sessionId, { type: 'takeout' })
    const s = engine.getSession(sessionId)!
    expect(s.totalVisits).toEqual([1, 0])
    expect(s.totalDarts).toEqual([1, 0])
  })

  it('a busted visit takes no more darts', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, startScore: 41 }, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: T20 })
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: S20 })
    expect((engine.getSnapshot(sessionId)!.game.currentVisitDarts as unknown[]).length).toBe(1)
    expect(engine.getSession(sessionId)!.totalDarts).toEqual([1, 0])
  })

  it('undo after a bust accepts darts again', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, startScore: 41 }, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: T20 })
    await engine.onUserAction(sessionId, { type: 'undo_dart' })
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: S20 })
    expect((engine.getSnapshot(sessionId)!.game.currentVisitDarts as unknown[]).length).toBe(1)
    expect(engine.getSnapshot(sessionId)!.game.scores).toEqual([21, 41])
  })

  it('empty takeout is ignored during the bull off', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, bullOff: 'wdc' }, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, { type: 'takeout' })
    const s = engine.getSession(sessionId)!
    expect(s.totalVisits).toEqual([0, 0])
    expect(engine.getSnapshot(sessionId)!.game.phase).toBe('bulloff')
  })

  it('empty takeout is ignored after a win', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, startScore: 40, firstTo: 1 }, [{ name: 'A' }])
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: { name: 'D20', number: 20, bed: 'Double', multiplier: 2 } })
    await engine.onUserAction(sessionId, { type: 'takeout' })
    await engine.onUserAction(sessionId, { type: 'takeout' })
    expect(engine.getSession(sessionId)!.totalVisits).toEqual([1])
  })
```

(If `x01Module.defaultConfig` lacks `firstTo`/`bullOff` keys, the spread still provides them — they are in `defaultConfig` per `backend/src/games/x01.ts:126`.)

- [ ] **Step 2: Run** `cd backend && npx vitest run src/session/engine.test.ts` — Expected: "empty takeout records three misses", "a busted visit takes no more darts" fail; the others pass or fail for the stated reason.

- [ ] **Step 3: Implement** in `backend/src/session/engine.ts`, `onUserAction`:

Replace the start of the `takeout` branch `} else if (action.type === 'takeout') {\n      if (session.openVisitEvents.length > 0) {` with:

```ts
    } else if (action.type === 'takeout') {
      // An empty turn (nothing thrown or nothing detected) counts as three misses
      const current = session.module.view(session.currentState, session.players) as { winner?: number | null }
      if (session.openVisitEvents.length === 0 && !inBullOff(session, session.currentState)
          && (current.winner === null || current.winner === undefined)) {
        const thrower = session.module.getCurrentPlayer(session.currentState)
        const miss = { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 } as const
        session.openVisitEvents = [
          { kind: 'visit.opened', data: { visit_id: 'manual' } as any },
          ...[0, 1, 2].map(index => ({
            kind: 'dart.detected',
            data: { visit_id: 'manual', index, dart: manualDart({ ...miss }), source_seq: 0 } as any,
          } as BoardEvent)),
        ]
        session.totalDarts[thrower] = (session.totalDarts[thrower] ?? 0) + 3
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
      }
      if (session.openVisitEvents.length > 0) {
```

In the `add_dart` branch, directly after `if (dartCount >= 3) return`, add:

```ts
      // A finished visit (bust, checkout, win) takes no more darts
      const now = session.module.view(session.currentState, session.players) as { visitLocked?: boolean; winner?: number | null }
      if (now.visitLocked === true || (now.winner !== null && now.winner !== undefined)) return
```

Note: during the bull off `withBullOff.view` sets `visitLocked` once the current thrower has a dart, which matches the bull off's own rule (one dart each).

- [ ] **Step 4: Run** `npx vitest run src/games src/session` — Expected: all pass. Check the dev backend reloaded (Global Constraints).

- [ ] **Step 5: Commit** `git add backend/src/session/engine.ts backend/src/session/engine.test.ts && git commit -m "fix(engine): finished visits take no darts, an empty turn counts as three misses"`

---

### Task 3: Frontend rules

**Files:**
- Modify: `backend/frontend/src/lib/playerStats.ts`, `gameViews/meta.ts`, `visitBand.ts`, `dartSlots.ts`, `dartUtils.ts`
- Create: `backend/frontend/src/lib/controls.ts`
- Test: add to `__tests__/playerStats.test.ts`, `meta.test.ts`, `visitBand.test.ts`, `dartSlots.test.ts`, `dartUtils.test.ts`; create `__tests__/controls.test.ts`

**Interfaces (produces):**
- `x01Player(game, i, history, o: { active: boolean; suggest: boolean; bust?: boolean })` — `canFinish` is null during a bust; `current` becomes `{ scored: number; left: number; bust: boolean } | null`; new field `showFinish: boolean` (= `o.suggest`).
- `x01Meta`: after a win, "Leg N" is the leg being played when the match ended (`legs[winner] >= firstTo` → played legs; otherwise played + 1).
- `atcAdvanced(hitCount: number, start: number | null, hits: boolean[]): number`
- `shouldReplay(prevSum: number | null, band: BandData): boolean`
- `bigDartIndex(darts: ThrownDart[], o: { opened: boolean; bust: boolean }): number | null`
- `ThrownDart` gains `segment?: { name?: string; number?: number; multiplier?: number }`; `atcSlots(o: { darts; hits; target; multiplierAdvances?: boolean })`
- `nextButton(o: { manual: boolean; dartCount: number; locked: boolean; active: boolean }): { label: 'Next player' | 'Skip to next'; prominent: boolean; enabled: boolean }`
- `markerPositions(segments: number[]): { x: number; y: number }[]` (SVG coords, y down; same segment → spread along the wedge)

- [ ] **Step 1: Failing tests**

`__tests__/playerStats.test.ts`, inside `describe('x01Player')`:

```ts
  it('during a bust: no finish, running row marked bust', () => {
    const p = x01Player(game(), 0, emptyHistory(), { active: true, suggest: true, bust: true })
    expect(p.canFinish).toBeNull()
    expect(p.current).toEqual({ scored: 60, left: 81, bust: true })
  })

  it('showFinish follows the suggestions setting', () => {
    expect(x01Player(game(), 1, emptyHistory(), { active: false, suggest: false }).showFinish).toBe(false)
    expect(x01Player(game(), 1, emptyHistory(), { active: false, suggest: true }).showFinish).toBe(true)
  })
```

and change the first test's expectation `current: { scored: 60, left: 81 }` to `current: { scored: 60, left: 81, bust: false }`.

`__tests__/meta.test.ts`, inside `describe('x01Meta')`:

```ts
  it('a match ended by the round limit names the leg in play', () => {
    expect(x01Meta(x01({ legs: [0, 0], winner: 1 }), 2)).toBe('501 · Double out · First to 3 legs · Leg 1')
    expect(x01Meta(x01({ legs: [1, 0], winner: 0 }), 2)).toBe('501 · Double out · First to 3 legs · Leg 2')
  })
```

`__tests__/visitBand.test.ts` (import `atcAdvanced, shouldReplay, bigDartIndex` too):

```ts
describe('atcAdvanced', () => {
  it('is progress since the visit started', () => expect(atcAdvanced(7, 5, [true, true])).toBe(2))
  it('counts hits when the start is unknown (after a reload)', () => expect(atcAdvanced(7, null, [true, false, true])).toBe(2))
  it('never goes negative', () => expect(atcAdvanced(3, 5, [])).toBe(0))
})

describe('shouldReplay', () => {
  const band = (sum: string, fx: 'none' | 'ton' | 'max' = 'ton', bigDart = false) =>
    ({ ...x01Band({ darts: [], left: 0, bust: false }), sum, fx, bigDart })
  it('replays when a celebrating sum goes up', () => expect(shouldReplay(100, band('140'))).toBe(true))
  it('not when an undo brings the sum down', () => expect(shouldReplay(140, band('100'))).toBe(false))
  it('not for a calm visit', () => expect(shouldReplay(20, band('45', 'none'))).toBe(false))
  it('a big dart replays', () => expect(shouldReplay(0, band('60', 'none', true))).toBe(true))
  it('not on the first snapshot', () => expect(shouldReplay(null, band('140'))).toBe(false))
})

describe('bigDartIndex', () => {
  const d = (score: number) => ({ segment: { name: 'x' }, score })
  it('is the last dart when it is worth 50 or more', () => expect(bigDartIndex([d(1), d(60)], { opened: true, bust: false })).toBe(1))
  it('none before opening or on a bust', () => {
    expect(bigDartIndex([d(60)], { opened: false, bust: false })).toBeNull()
    expect(bigDartIndex([d(60)], { opened: true, bust: true })).toBeNull()
  })
  it('none for a small last dart', () => expect(bigDartIndex([d(60), d(5)], { opened: true, bust: false })).toBeNull())
})
```

`__tests__/dartSlots.test.ts`, inside `describe('atcSlots')`:

```ts
  it('a triple advances three when the multiplier advances', () => {
    const s = atcSlots({ darts: [{ segment: { name: 'T13', number: 13, multiplier: 3 }, score: 39 }], hits: [true], target: '16', multiplierAdvances: true })
    expect(s[0].points).toBe('+3')
  })
  it('a bull always advances one', () => {
    const s = atcSlots({ darts: [{ segment: { name: 'Bull', number: 50, multiplier: 1 }, score: 50 }], hits: [true], target: '✓', multiplierAdvances: true })
    expect(s[0].points).toBe('+1')
  })
```

Create `__tests__/controls.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nextButton } from '../controls.js'

describe('nextButton', () => {
  const base = { manual: false, dartCount: 1, locked: false, active: true }
  it('board session mid-visit: quiet skip', () => expect(nextButton(base)).toEqual({ label: 'Skip to next', prominent: false, enabled: true }))
  it('board session with no darts: quiet skip (records three misses)', () => expect(nextButton({ ...base, dartCount: 0 }).label).toBe('Skip to next'))
  it('three darts in: next player', () => expect(nextButton({ ...base, dartCount: 3 })).toEqual({ label: 'Next player', prominent: true, enabled: true }))
  it('visit over (bust, checkout): next player', () => expect(nextButton({ ...base, locked: true }).label).toBe('Next player'))
  it('no board: always next player', () => expect(nextButton({ ...base, manual: true, dartCount: 0 }).label).toBe('Next player'))
  it('disabled after a win', () => expect(nextButton({ ...base, active: false }).enabled).toBe(false))
})
```

`__tests__/dartUtils.test.ts` (import `markerPositions`):

```ts
describe('markerPositions', () => {
  it('puts a single marker in the middle of the outer single', () => {
    const [p] = markerPositions([20])
    expect(Math.abs(p.x)).toBeLessThan(0.001)
    expect(p.y).toBeLessThan(-0.7)
  })
  it('spreads markers on the same segment', () => {
    const [a, b, c] = markerPositions([20, 20, 6])
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.15)
    expect(c.x).toBeGreaterThan(0.7)
  })
  it('spreads markers on the bull sideways', () => {
    const [a, b] = markerPositions([50, 50])
    expect(a.y).toBeCloseTo(b.y)
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(0.15)
  })
})
```

- [ ] **Step 2: Run** `cd backend/frontend && npx vitest run` — Expected: the new tests fail (missing exports / old behaviour).

- [ ] **Step 3: Implement**

`playerStats.ts` — `x01Player` options become `o: { active: boolean; suggest: boolean; bust?: boolean }`; add `showFinish: boolean` to `X01PlayerView` and change `current` to `{ scored: number; left: number; bust: boolean } | null`:

```ts
  const hint = o.suggest && !o.bust && opened && remaining > 0 && dartsLeft > 0 ? checkoutHint(remaining, outMode, dartsLeft) : null
  …
    showFinish: o.suggest,
    current: running.length ? { scored: running.reduce((a, d) => a + (d.score ?? 0), 0), left: remaining, bust: o.bust === true } : null,
```

`gameViews/meta.ts` — replace the last `parts.push(`Leg …`)` with:

```ts
  // After the match: the leg in play when it ended (a won final leg, or one cut short by the round limit)
  const winner = game.winner as number | null | undefined
  const finalLegWon = winner !== null && winner !== undefined && (legs[winner] ?? 0) >= firstTo
  parts.push(`Leg ${finalLegWon ? played : played + 1}`)
```

`visitBand.ts` — add:

```ts
/** ATC targets advanced this visit; counts hits when the visit's start is unknown (after a reload). */
export function atcAdvanced(hitCount: number, start: number | null, hits: boolean[]): number {
  return start === null ? hits.filter(Boolean).length : Math.max(0, hitCount - start)
}

/** Replay the celebration only when a celebrating sum goes up (not on undo, not on load). */
export function shouldReplay(prevSum: number | null, band: BandData): boolean {
  const sum = Number(band.sum.replace('+', ''))
  return prevSum !== null && sum > prevSum && (band.fx !== 'none' || band.bigDart)
}

/** The slot to pop: the last dart when it is worth 50+ and actually scored. */
export function bigDartIndex(darts: ThrownDart[], o: { opened: boolean; bust: boolean }): number | null {
  const last = darts.length - 1
  return last >= 0 && o.opened && !o.bust && isBigDart(darts[last].score ?? 0) ? last : null
}
```

`dartSlots.ts` — `ThrownDart` becomes `{ segment?: { name?: string; number?: number; multiplier?: number }; score?: number }`; `atcSlots`:

```ts
export function atcSlots(o: { darts: ThrownDart[]; hits: boolean[]; target: string | null; multiplierAdvances?: boolean }): Slot[] {
  // With multiplierAdvances a double/treble moves 2/3 targets; bulls always move one
  const steps = (d: ThrownDart) => {
    const n = d.segment?.number ?? 0
    return o.multiplierAdvances && n <= 20 ? Math.max(1, d.segment?.multiplier ?? 1) : 1
  }
  const done = o.darts.slice(0, 3).map((d, i) => thrownSlot(d, i, o.hits[i] === true, o.hits[i] === true ? `+${steps(d)}` : '0'))
  return [...done, ...openSlots(done.length, o.target ? [{ label: o.target, foot: 'your target' }] : [])]
}
```

Create `controls.ts`:

```ts
// The manual advance: "Next player" when the visit is over (or without a board),
// otherwise the quiet "Skip to next" (on a board the takeout advances by itself).
export function nextButton(o: { manual: boolean; dartCount: number; locked: boolean; active: boolean }) {
  const done = o.manual || o.dartCount >= 3 || o.locked
  return { label: done ? 'Next player' as const : 'Skip to next' as const, prominent: done, enabled: o.active }
}
```

`dartUtils.ts` — add (uses the module's `SEGS` and `R`):

```ts
/** Board positions (SVG coords, y down) for player markers on segments; markers on the
 *  same segment are spread along the wedge (bull: sideways) so none hides another. */
export function markerPositions(segments: number[]): { x: number; y: number }[] {
  const mid = (R.tr + R.so) / 2
  const seen = new Map<number, number>()
  const total = new Map<number, number>()
  segments.forEach(s => total.set(s, (total.get(s) ?? 0) + 1))
  return segments.map(s => {
    const k = seen.get(s) ?? 0
    seen.set(s, k + 1)
    const off = (k - ((total.get(s) ?? 1) - 1) / 2) * 0.18
    if (s === 25 || s === 50) return { x: off, y: 0 }
    const a = Math.PI / 2 - SEGS.indexOf(s) * (Math.PI / 10)
    const r = mid + off
    return { x: r * Math.cos(a), y: -r * Math.sin(a) }
  })
}
```

- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json --threshold error` — Expected: all pass, 0 errors (if a component breaks on the changed types, fix it in Task 4's way now).

- [ ] **Step 5: Commit** `git commit -m "fix(ingame): rules for bust rows, leg label, ATC steps, celebrations, next button and markers"` (add the changed files).

---

### Task 4: Wire the rules into the screen

**Files:**
- Modify: `routes/GameDisplay.svelte`, `components/ControlBar.svelte`, `DartEntryPanel.svelte`, `VisitBand.svelte`, `Chalkboard.svelte`, `X01Row.svelte`, `DartBoard.svelte`, `GameHeader.svelte`, `SettingsDrawer.svelte`

**Interfaces:**
- `ControlBar` props become `{ canUndo: boolean; label: string; prominent: boolean; enabled: boolean; onUndo: () => void; onNext: () => void }`.
- `DartEntryPanel` gains `locked?: boolean`.
- `GameHeader` and `SettingsDrawer` gain `gameId: string`.
- `Chalkboard` `current` gains `bust: boolean`.

- [ ] **Step 1: GameDisplay**

- `let history = $state<VisitHistory>(emptyHistory())` → `$state.raw` (it is replaced, never mutated).
- `const locked = $derived(game.visitLocked === true || winner !== null)`
- `x01Player(…, { active: …, suggest: settings.checkoutSuggestions, bust: i === currentPlayer && bust })`
- ATC band: `advanced: atcAdvanced(hitCount, history.start[currentPlayer] ?? null, hits)`.
- `atcSlots({ darts, hits, target: …, multiplierAdvances: (game.cfg as { multiplierAdvances?: boolean } | undefined)?.multiplierAdvances === true })`
- `popIndex`: `isX01 ? bigDartIndex(darts, { opened: x01Players[currentPlayer]?.opened ?? true, bust }) : null`
- Board: `onBoardClick={isActive && !locked ? addBoardDart : undefined}`; keypad `<DartEntryPanel … locked={locked} />`.
- Party rows: `rowTemplate` uses `minmax(110px, 1fr)` for ATC rows (keep `minmax(150px, 1.55fr)` / `minmax(96px, 1fr)` for X01).
- `const next = $derived(nextButton({ manual: boardId === null, dartCount: darts.length, locked, active: isActive }))` and `<ControlBar canUndo={isActive && darts.length > 0} label={next.label} prominent={next.prominent} enabled={next.enabled} onUndo={undo} onNext={nextPlayer} />` (rename the `next` action function to `nextPlayer`).

- [ ] **Step 2: ControlBar** — use the new props: the button text is `{label}`, style `prominent ? outline : quiet` (the two class sets already there), `disabled={!enabled}` with `disabled:opacity-40 disabled:cursor-default`.

- [ ] **Step 3: DartEntryPanel** — add `locked = false` to the props; `const full = $derived(locked || dartCount >= 3)`; the hint becomes:

```svelte
  {#if full}
    <p class="text-center text-[13px] text-text-dim">
      {locked ? 'Visit over — press Next player' : '3 darts thrown — press Next player'}
    </p>
  {/if}
```

- [ ] **Step 4: VisitBand** — replay only via `shouldReplay`, and a stable live region:

```ts
  let replays = $state(0)
  let lastSum: number | null = null
  $effect(() => {
    if (shouldReplay(lastSum, band)) replays++
    lastSum = Number(band.sum.replace('+', ''))
  })
```

Replace `{#key replayKey}` with `{#key replays}`, remove `replayKey`, remove `role="status"` from both band containers, and add before `{#key}`:

```svelte
<span class="sr-only" role="status" aria-live="polite">{band.eyebrow}: {band.sum}. {band.afterLabel} {band.after}</span>
```

- [ ] **Step 5: Chalkboard** — the container gets `role="region"`; the running row shows a bust:

```svelte
        <span class="text-right pr-[14px] {current.bust ? 'text-danger-text' : 'text-accent'}">{current.bust ? 'Bust' : `${current.scored}…`}</span>
```

- [ ] **Step 6: X01Row** — wrap the whole "Can finish" `<span class="flex flex-col gap-1 min-w-0">…</span>` in `{#if p.showFinish}…{:else}<span></span>{/if}` (the empty span keeps the grid column).

- [ ] **Step 7: DartBoard** — markers: replace the `{#each playerMarkers.filter(m => !m.isActive) as marker}` block's position lookup with `markerPositions`:

```svelte
  {#each playerMarkers.filter(m => !m.isActive) as marker, k}
    {@const pos = otherMarkerPos[k]}
```

with, in the script, `import { labelPos, markerPositions } from '$lib/dartUtils.js'` and
`const otherMarkerPos = $derived(markerPositions(playerMarkers.filter(m => !m.isActive).map(m => m.segment)))`; delete the old `markerPos` function if nothing else uses it (BullOffPanel has its own).

- [ ] **Step 7b: ATC-only setting** — `SettingsDrawer` gets a `gameId: string` prop and renders the Display rows from
  `const rows = $derived(display.filter(r => r.key !== 'showMarkers' || gameId === 'atc'))`; `GameHeader` gets `gameId: string` and passes it on (`<SettingsDrawer bind:settings {gameId} …/>`); `GameDisplay` passes `{gameId}` to `GameHeader`. In an X01 game the drawer shows Checkout suggestions, Visit sum and Chalkboard only.

- [ ] **Step 8: Verify** `npx vitest run && npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json --threshold error` → all pass, 0 errors.

- [ ] **Step 9: Commit** `git commit -m "fix(ingame): locked visits, next-player button, bust rows, ATC steps and markers on screen"`

---

### Task 5: Accessibility of the drawer and the correction popover

**Files:** `components/SettingsDrawer.svelte`, `components/DartSlots.svelte`

- [ ] **Step 1: SettingsDrawer** — return focus and trap Tab:

```ts
  let panel: HTMLDivElement | undefined = $state()
  $effect(() => {
    const opener = document.activeElement as HTMLElement | null
    panel?.focus()
    return () => opener?.focus()
  })
  function trap(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !panel) return
    const items = [...panel.querySelectorAll<HTMLElement>('button, input')]
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
```

and add `onkeydown={trap}` on the dialog `<div>`.

- [ ] **Step 2: DartSlots popover** — Escape closes it and focus moves into it:

```ts
  let popover: HTMLDivElement | undefined = $state()
  $effect(() => { if (openDart !== null) popover?.querySelector<HTMLElement>('button')?.focus() })
```

`<svelte:window onkeydown={e => { if (e.key === 'Escape' && openDart !== null) { openDart = null; mode = 'quick' } }} />` and `bind:this={popover}` on the dialog `<div>`.

- [ ] **Step 3: Verify** types (0 errors) and in the browser: Tab stays inside the drawer; closing it returns focus to the cog; Escape closes the correction popover.

- [ ] **Step 4: Commit** `git commit -m "fix(ingame): focus handling for the settings drawer and the correction popover"`

---

### Task 6: Browser check

Local frontend on :5174 (`cd backend/frontend && npx vite --port 5174`) against the dev backend (check it reloaded, see Global Constraints). Use test games only; ask before ending a game you did not create.

- X01 double out at 21: S20 → "Bust" (leaving 1). At 50: click the bull → leg won.
- After a bust: keypad disabled with "Visit over — press Next player", board clicks ignored, button reads "Next player"; Undo unlocks.
- Board session: button reads "Skip to next" with 0–2 darts, "Next player" with 3. No darts + button → a visit of three misses on the chalkboard ("0").
- Boardless: always "Next player".
- ATC with multiplier advances: a treble shows "+3" in its slot.
- 140 visit, undo to 100: no "Ton plus" replay. Before opening (double in): T20 does not pop.
- ATC 4 players, two on the same target: two separate initials.
- After a win: the button is disabled.
- Settings drawer: X01 game has no "Other players' targets"; ATC game has it.
