# In-game Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the live game screen (X01 and Around the Clock, 1 / 2 / 3+ players, desktop) to match the Dartcade Platform Design, with visit celebrations and a settings drawer.

**Architecture:** All game logic the screen needs moves into small, pure, unit-tested TypeScript modules in `backend/frontend/src/lib/` (visit history, dart slots, visit band, per-player stats, ATC helpers, header meta, settings). Svelte components only render what those modules return. `GameDisplay.svelte` picks one of three layouts by player count around a shared center column (board, visit band, dart slots, control bar). No backend changes.

**Tech Stack:** Svelte 5 (runes), TypeScript, Tailwind CSS v4 (tokens in `app.css` `@theme`), Vitest (node, no DOM), Vite dev server.

**Spec:** `docs/superpowers/specs/2026-09-30-ingame-redesign-design.md` (read it first). Design artboards are in the claude.ai Design canvas https://claude.ai/artifact/2ZyCCfSMhs3PKZzNLzsw23 (`project/Match.dc.html`, `Match-Party.dc.html`, `Solo-X01.dc.html`, `ATC.dc.html`, `ATC-Party.dc.html`, `Solo-ATC.dc.html`, `Guide-InGame.dc.html`, `VisitFX.dc.html`, `Settings-InGame.dc.html`); read them with the Artifact tool when a value here is unclear.

## Global Constraints

- Frontend only: every change is under `backend/frontend/`. Do not touch `backend/src/`.
- Svelte 5 runes only (`$props`, `$state`, `$derived`, `$effect`, `$bindable`, snippets); no `export let`, no stores in new code.
- Imports inside `src/lib` use `$lib/...` in `.svelte` files and relative `./x.js` in `.ts` files (match the existing files).
- Colors come from the `@theme` tokens (Task 1). Use a raw hex only where the design uses a one-off value this plan spells out.
- Typography: display numbers `font-display font-bold` (Barlow Condensed), UI text Instrument Sans (default), eyebrows `text-[12px] uppercase tracking-[0.1em]`.
- Number hierarchy: score/target `text-[min(220px,24vh)]` › visit sum 96px › dart labels 66px › stats 44px (panel) / 34px (rows) / 15px (footers).
- Keep for e2e tests: `DartEntryPanel` unchanged (its `aria-label`s like "Single 1"), visible text "Bust" on a bust, "Target" and "N of 21 done" on ATC panels.
- Settings key stays `dartcade_game_settings` in localStorage.
- Copy is exact as written in this plan (sentence case, "Skip to next", "Next player", "Can finish", "No finish yet", "Ton plus", "Maximum", "Saved on this device. Changes apply right away.").
- Commands run from `backend/frontend`: tests `npx vitest run <file>`, all tests `npm test`, types `npm run typecheck` (must report 0 errors after every task).

## Review Focus

1. **Reloading the page mid-leg.** Visit history is client-side, so after a reload the chalkboard only shows the visits since then, averages show "—" until a visit completes, and the visit in progress at load time is not recorded (never a wrong number). Pinned by the Task 2 test "skips a visit that was already under way when the page loaded" and the Task 5 test "averages show a dash without visits".
2. **Bust.** A busted visit shows "Bust" in the visit band and in the unthrown slots, never celebrates (even at 100+ before the bust dart), records 0 scored with the score left unchanged, and the chalkboard marks it "Bust". Pinned by Task 2 "records a bust as 0 scored", Task 3 "fills the rest with bust slots" and "a bust never celebrates".
3. **Winning a leg.** The checkout visit is recorded with 0 left, the chalkboards of all players clear for the new leg, leg pips and the header's "Leg N" advance, and after the match is won the header does not claim a leg that is never played. Pinned by Task 2 "records the checkout and starts a fresh leg board" and Task 4 "does not count past the last leg once the match is won".
4. **No finish possible.** Not opened yet (double in), more than 170 left, or no finish with the darts left: slots show plain next/empty slots, no board rings, "Can finish" is hidden (duel) or reads "No finish yet" (rows); a one-dart finish says "Game shot". Pinned by Task 3 "no suggestions before opening", "one-dart finish says game shot", "no suggestion above 170" and Task 5 "no finish is null".
5. **Many players.** 3 players (not designed) and 5+ players keep every row readable: rows have a minimum height and the list scrolls instead of squashing; long names truncate. Covered by the manual checks in Task 10 (layout only; no logic to unit test).

---

## File Structure

New pure modules (each with a test in `src/lib/__tests__/`):

| File | Responsibility |
|---|---|
| `src/lib/gameSettings.ts` (rewrite) | Settings type, defaults, `loadSettings`, `saveSettings` |
| `src/lib/visitHistory.ts` | Fold snapshots into per-player finished visits; 3-dart average |
| `src/lib/dartSlots.ts` | The three dart slots (thrown, miss, bust, suggestion, empty) for X01 and ATC |
| `src/lib/visitBand.ts` | Visit band content and the celebration level |
| `src/lib/atc.ts` | ATC target labels, progress cells, board segment, leaders |
| `src/lib/playerStats.ts` | Everything a player panel/row shows, per game |
| `src/lib/gameViews/meta.ts` | Header meta line per game |
| `src/lib/sounds.ts` | Web Audio tones with a volume (no test: needs a browser) |
| `src/lib/dartUtils.ts` (add) | `labelToSegment` |

New components (`src/lib/components/`): `BoardLegend`, `VisitBand`, `DartSlots`, `ControlBar`, `LegPips`, `PlayerPill`, `Chalkboard`, `AtcProgress`, `PanelShell`, `X01Panel`, `AtcPanel`, `X01Row`, `AtcRow`, `SettingsDrawer`.

Changed: `src/app.css` (tokens), `DartBoard.svelte` (ATC target styling, checkout rings), `GameHeader.svelte` (restyle, drawer), `gameViews/index.ts` (meta only), `routes/GameDisplay.svelte` (rewrite).

Deleted in the last tasks: `PlayerCard.svelte`, `PlayerListRow.svelte`, `CorrectionPanel.svelte`, `GameSettingsPanel.svelte`, `gameViews/x01.svelte`, `gameViews/atc.svelte`, `gameViews/fallback.svelte`, `__tests__/CorrectionPanel.test.ts`.

---

### Task 1: Design tokens and settings module

**Files:**
- Modify: `backend/frontend/src/app.css` (the `@theme` block, lines 3–21)
- Rewrite: `backend/frontend/src/lib/gameSettings.ts`
- Modify: `backend/frontend/src/routes/GameDisplay.svelte` (settings load/save and `showMarkers`)
- Modify: `backend/frontend/src/lib/components/GameSettingsPanel.svelte` (drop the `showMarkers` row)
- Test: `backend/frontend/src/lib/__tests__/gameSettings.test.ts`

**Interfaces:**
- Produces: `GameSettings` (`checkoutSuggestions`, `visitSum`, `chalkboard`: boolean; `volume`: number 0–1; `soundHit`, `soundMiss`, `soundSwitch`, `soundBust`: boolean), `defaultSettings`, `SETTINGS_KEY`, `loadSettings(storage: Pick<Storage,'getItem'> | null): GameSettings`, `saveSettings(storage: Pick<Storage,'setItem'> | null, s: GameSettings): void`. Tailwind colors `surface-panel`, `surface-inset`, `surface-chip`, `surface-key`, `line-strong`, `line-chip`, `line-key`, `line-dashed`, `line-popover`, `line-pip`, `line-next`, `ink-soft`, `ink-2`, `ink-3`, `ink-faint`, `accent-hover`, `live-soft`, `danger-text`, `danger-line`, `bg-deep`.

- [ ] **Step 1: Write the failing test**

Create `backend/frontend/src/lib/__tests__/gameSettings.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { defaultSettings, loadSettings, saveSettings, SETTINGS_KEY } from '../gameSettings.js'

const store = (value: string | null) => ({ getItem: (k: string) => (k === SETTINGS_KEY ? value : null) })

describe('loadSettings', () => {
  it('returns the defaults without storage or stored value', () => {
    expect(loadSettings(null)).toEqual(defaultSettings)
    expect(loadSettings(store(null))).toEqual(defaultSettings)
  })

  it('merges stored values over the defaults', () => {
    const s = loadSettings(store(JSON.stringify({ chalkboard: false, soundHit: true, volume: 0.3 })))
    expect(s).toEqual({ ...defaultSettings, chalkboard: false, soundHit: true, volume: 0.3 })
  })

  it('ignores unknown keys and values of the wrong type', () => {
    const s = loadSettings(store(JSON.stringify({ showMarkers: true, visitSum: 'no', volume: '1' })))
    expect(s).toEqual(defaultSettings)
    expect(s).not.toHaveProperty('showMarkers')
  })

  it('clamps the volume to 0–1', () => {
    expect(loadSettings(store(JSON.stringify({ volume: 4 }))).volume).toBe(1)
    expect(loadSettings(store(JSON.stringify({ volume: -1 }))).volume).toBe(0)
  })

  it('falls back to the defaults on broken JSON', () => {
    expect(loadSettings(store('{nope'))).toEqual(defaultSettings)
  })
})

describe('saveSettings', () => {
  it('writes JSON under the settings key', () => {
    const written: Record<string, string> = {}
    saveSettings({ setItem: (k, v) => { written[k] = v } }, defaultSettings)
    expect(JSON.parse(written[SETTINGS_KEY])).toEqual(defaultSettings)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/gameSettings.test.ts`
Expected: FAIL (`loadSettings` is not exported).

- [ ] **Step 3: Implement**

Replace `backend/frontend/src/lib/gameSettings.ts` with:

```ts
/** In-game display and sound settings, kept per device in localStorage. */
export interface GameSettings {
  /** Suggested checkout darts in the empty slots, rings on the board, "Can finish". */
  checkoutSuggestions: boolean
  visitSum: boolean
  chalkboard: boolean
  /** 0–1 */
  volume: number
  soundHit: boolean
  soundMiss: boolean
  soundSwitch: boolean
  soundBust: boolean
}

export const defaultSettings: GameSettings = {
  checkoutSuggestions: true,
  visitSum: true,
  chalkboard: true,
  volume: 0.7,
  soundHit: false,
  soundMiss: false,
  soundSwitch: false,
  soundBust: false,
}

export const SETTINGS_KEY = 'dartcade_game_settings'

/** Stored settings over the defaults; unknown keys and values of the wrong type are ignored. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null): GameSettings {
  const out: GameSettings = { ...defaultSettings }
  let raw: unknown
  try {
    raw = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null')
  } catch {
    return out
  }
  if (!raw || typeof raw !== 'object') return out
  const stored = raw as Record<string, unknown>
  for (const key of Object.keys(defaultSettings) as (keyof GameSettings)[]) {
    if (typeof stored[key] === typeof defaultSettings[key]) (out as unknown as Record<string, unknown>)[key] = stored[key]
  }
  out.volume = Number.isFinite(out.volume) ? Math.min(1, Math.max(0, out.volume)) : defaultSettings.volume
  return out
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | null, s: GameSettings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // Storage full or blocked: settings just don't persist
  }
}
```

In `backend/frontend/src/app.css`, add these lines inside `@theme`, after `--color-live-text`:

```css
  /* Design system (Dartcade Platform Design tokens.json) */
  --color-bg-deep:        #0a0b09;
  --color-surface-panel:  #151713;
  --color-surface-inset:  #1f221c;
  --color-surface-chip:   #242820;
  --color-surface-key:    #2a2e26;
  --color-line-strong:    #65685f;
  --color-line-chip:      #3a3e36;
  --color-line-key:       #3a3f35;
  --color-line-dashed:    #3e4239;
  --color-line-popover:   #454a3f;
  --color-line-pip:       #6a6e63;
  --color-line-next:      #6a6f62;
  --color-ink-soft:       #d8d8ce;
  --color-ink-2:          #c9c9bf;
  --color-ink-3:          #b4b5aa;
  --color-ink-faint:      #828379;
  --color-accent-hover:   #dcff7a;
  --color-live-soft:      #3a1a17;
  --color-danger-text:    #ff7a70;
  --color-danger-line:    #4a2e2b;
```

In `backend/frontend/src/routes/GameDisplay.svelte`:
- Replace the import `import { defaultSettings, type GameSettings } from '../lib/gameSettings.js'` with `import { loadSettings, saveSettings, type GameSettings } from '../lib/gameSettings.js'`.
- Replace the whole settings block (from `const SETTINGS_KEY = ...` through the `$effect(...)` that writes localStorage) with:

```ts
  let settings = $state<GameSettings>(loadSettings(typeof localStorage === 'undefined' ? null : localStorage))
  $effect(() => { saveSettings(localStorage, settings) })
```

- In `boardMarkers`, replace `isMultiPlayer && settings.showMarkers` with `isMultiPlayer`.
- In the multi-player legend, replace `{#if settings.showMarkers}` … `{/if}` around "Others' targets" by rendering that `<span>` unconditionally.

In `backend/frontend/src/lib/components/GameSettingsPanel.svelte`, delete the whole "Board section" `<div class="px-5 pt-4 pb-2">…</div>` and the divider `<div class="mx-5 h-px bg-line my-1"></div>` after it (the panel is replaced in Task 9).

- [ ] **Step 4: Run tests and types**

Run: `npx vitest run src/lib/__tests__/gameSettings.test.ts && npm run typecheck`
Expected: 6 tests pass; typecheck 0 errors.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/app.css backend/frontend/src/lib/gameSettings.ts backend/frontend/src/lib/__tests__/gameSettings.test.ts backend/frontend/src/routes/GameDisplay.svelte backend/frontend/src/lib/components/GameSettingsPanel.svelte
git commit -m "feat(ingame): design tokens and a tested settings module"
```

---

### Task 2: Visit history

**Files:**
- Create: `backend/frontend/src/lib/visitHistory.ts`
- Test: `backend/frontend/src/lib/__tests__/visitHistory.test.ts`

**Interfaces:**
- Produces:
  - `type Visit = { scored: number; left: number; darts: number; bust: boolean }` (X01: points scored and left; ATC: targets advanced, `left` 0)
  - `type VisitHistory = { leg: Visit[][]; all: Visit[][]; start: (number | null)[]; prev: {...} | null }` — `leg[i]` visits of the current leg, `all[i]` every visit of the match, `start[i]` player i's score (X01) or progress (ATC `hitCounts`) when their current visit began, `null` when unknown
  - `emptyHistory(): VisitHistory`
  - `trackVisits(h: VisitHistory, game: Record<string, unknown>): VisitHistory` (pure; returns a new object)
  - `threeDartAvg(visits: Visit[]): number | null`

How the snapshot behaves (verified in `backend/src/games/x01.ts` and `backend/src/session/engine.ts`): a visit is finished when `game.totalVisits[i]` goes up (at takeout). During a visit `scores[cp]` already has the darts taken off; a bust puts it back to the score at visit start and sets `bustThisVisit`. A won leg increments `legs[i]` in the same snapshot as `totalVisits[i]` and resets every score to the start score. ATC has no `scores`; its progress is `hitCounts`.

- [ ] **Step 1: Write the failing test**

Create `backend/frontend/src/lib/__tests__/visitHistory.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { emptyHistory, trackVisits, threeDartAvg, type VisitHistory } from '../visitHistory.js'

type G = Record<string, unknown>
const dart = (score: number) => ({ segment: { name: 'S' + score }, score })
const x01 = (o: { scores: number[]; totalVisits: number[]; legs?: number[]; cp: number; darts?: number[]; bust?: boolean }): G => ({
  scores: o.scores, totalVisits: o.totalVisits, legs: o.legs ?? o.scores.map(() => 0), currentPlayer: o.cp,
  currentVisitDarts: (o.darts ?? []).map(dart), bustThisVisit: o.bust ?? false,
})
const run = (games: G[]) => games.reduce<VisitHistory>((h, g) => trackVisits(h, g), emptyHistory())

describe('trackVisits (X01)', () => {
  it('records scored and left when a visit is taken out', () => {
    const h = run([
      x01({ scores: [501, 501], totalVisits: [0, 0], cp: 0 }),
      x01({ scores: [441, 501], totalVisits: [0, 0], cp: 0, darts: [60] }),
      x01({ scores: [381, 501], totalVisits: [0, 0], cp: 0, darts: [60, 60] }),
      x01({ scores: [381, 501], totalVisits: [1, 0], cp: 1 }),
    ])
    expect(h.leg[0]).toEqual([{ scored: 120, left: 381, darts: 2, bust: false }])
    expect(h.all[0]).toEqual(h.leg[0])
    expect(h.leg[1]).toEqual([])
    expect(h.start[1]).toBe(501)
  })

  it('records a bust as 0 scored with the score unchanged', () => {
    const h = run([
      x01({ scores: [40, 501], totalVisits: [3, 3], cp: 0 }),
      x01({ scores: [40, 501], totalVisits: [3, 3], cp: 0, darts: [60], bust: true }),
      x01({ scores: [40, 501], totalVisits: [4, 3], cp: 1 }),
    ])
    expect(h.leg[0]).toEqual([{ scored: 0, left: 40, darts: 1, bust: true }])
  })

  it('records the checkout and starts a fresh leg board', () => {
    const h = run([
      x01({ scores: [501, 501], totalVisits: [0, 0], cp: 1 }),
      x01({ scores: [501, 441], totalVisits: [0, 0], cp: 1, darts: [60] }),
      x01({ scores: [501, 441], totalVisits: [0, 1], cp: 0 }),
      x01({ scores: [40, 441], totalVisits: [5, 5], cp: 0 }),
      x01({ scores: [0, 441], totalVisits: [5, 5], cp: 0, darts: [40] }),
      x01({ scores: [501, 501], totalVisits: [6, 5], legs: [1, 0], cp: 1 }),
    ])
    expect(h.leg).toEqual([[], []])
    expect(h.all[0].at(-1)).toEqual({ scored: 40, left: 0, darts: 1, bust: false })
    expect(h.all[1]).toEqual([{ scored: 60, left: 441, darts: 1, bust: false }])
  })

  it('skips a visit that was already under way when the page loaded', () => {
    const h = run([
      x01({ scores: [441, 501], totalVisits: [0, 0], cp: 0, darts: [60] }),
      x01({ scores: [441, 501], totalVisits: [1, 0], cp: 1 }),
    ])
    expect(h.leg[0]).toEqual([])
    expect(h.start[1]).toBe(501)
  })

  it('an undone dart resets the start of the visit', () => {
    const h = run([
      x01({ scores: [501], totalVisits: [0], cp: 0 }),
      x01({ scores: [441], totalVisits: [0], cp: 0, darts: [60] }),
      x01({ scores: [501], totalVisits: [0], cp: 0 }),
    ])
    expect(h.start[0]).toBe(501)
  })
})

describe('trackVisits (ATC)', () => {
  it('records targets advanced per visit', () => {
    const atc = (hitCounts: number[], totalVisits: number[], cp: number, darts: number[] = []): G =>
      ({ hitCounts, totalVisits, currentPlayer: cp, currentVisitDarts: darts.map(dart) })
    const h = run([
      atc([4, 2], [3, 3], 0),
      atc([6, 2], [3, 3], 0, [1, 1, 0]),
      atc([6, 2], [4, 3], 1),
    ])
    expect(h.leg[0]).toEqual([{ scored: 2, left: 0, darts: 3, bust: false }])
    expect(h.start[1]).toBe(2)
  })
})

describe('threeDartAvg', () => {
  it('is points per dart times three', () => {
    expect(threeDartAvg([{ scored: 60, left: 0, darts: 3, bust: false }, { scored: 45, left: 0, darts: 3, bust: false }])).toBe(52.5)
  })
  it('counts the darts of short visits', () => {
    expect(threeDartAvg([{ scored: 40, left: 0, darts: 1, bust: false }])).toBe(120)
  })
  it('is null without darts', () => {
    expect(threeDartAvg([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/visitHistory.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `backend/frontend/src/lib/visitHistory.ts`:

```ts
// Finished visits per player, rebuilt in the browser from game snapshots.
// It only knows what happened since the page loaded.

/** X01: points scored and points left. ATC: targets advanced (`left` is 0). */
export type Visit = { scored: number; left: number; darts: number; bust: boolean }

export type VisitHistory = {
  /** Per player: visits of the current leg. */
  leg: Visit[][]
  /** Per player: every visit of the match, for averages. */
  all: Visit[][]
  /** Per player: score (X01) or progress (ATC) when their current visit began; null when unknown. */
  start: (number | null)[]
  prev: { totalVisits: number[]; legs: number[]; darts: number; bust: boolean } | null
}

export const emptyHistory = (): VisitHistory => ({ leg: [], all: [], start: [], prev: null })

const nums = (game: Record<string, unknown>, key: string): number[] =>
  Array.isArray(game[key]) ? (game[key] as number[]) : []

/** Fold one snapshot's game state into the history. A visit is finished when totalVisits goes up. */
export function trackVisits(h: VisitHistory, game: Record<string, unknown>): VisitHistory {
  const isX01 = Array.isArray(game.scores)
  const progress = isX01 ? nums(game, 'scores') : nums(game, 'hitCounts')
  const totalVisits = nums(game, 'totalVisits')
  const legs = nums(game, 'legs')
  const darts = Array.isArray(game.currentVisitDarts) ? game.currentVisitDarts.length : 0
  const cp = typeof game.currentPlayer === 'number' ? game.currentPlayer : 0
  const n = Math.max(totalVisits.length, progress.length)

  let leg = Array.from({ length: n }, (_, i) => h.leg[i] ?? [])
  const all = Array.from({ length: n }, (_, i) => h.all[i] ?? [])
  const start = Array.from({ length: n }, (_, i) => h.start[i] ?? null)

  const p = h.prev
  if (p) {
    let legOver = false
    for (let i = 0; i < n; i++) {
      if ((totalVisits[i] ?? 0) <= (p.totalVisits[i] ?? 0)) continue
      const wonLeg = (legs[i] ?? 0) > (p.legs[i] ?? 0)
      legOver ||= wonLeg
      const s = start[i]
      start[i] = null
      if (s === null) continue // began before the page loaded
      const now = progress[i] ?? s
      const visit: Visit = isX01
        ? { scored: wonLeg ? s : s - now, left: wonLeg ? 0 : now, darts: p.darts, bust: p.bust }
        : { scored: now - s, left: 0, darts: p.darts, bust: false }
      leg[i] = [...leg[i], visit]
      all[i] = [...all[i], visit]
    }
    if (legOver) leg = leg.map(() => [])
  }

  // A visit (re)starts whenever the thrower has no darts on the board
  if (darts === 0 && cp < n) start[cp] = progress[cp] ?? null

  return {
    leg, all, start,
    prev: { totalVisits: [...totalVisits], legs: [...legs], darts, bust: game.bustThisVisit === true },
  }
}

/** Points per dart times three over the given visits, or null without darts. */
export function threeDartAvg(visits: Visit[]): number | null {
  const darts = visits.reduce((a, v) => a + v.darts, 0)
  if (darts === 0) return null
  return (visits.reduce((a, v) => a + v.scored, 0) / darts) * 3
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/visitHistory.test.ts && npm run typecheck`
Expected: 9 tests pass; typecheck 0 errors.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/visitHistory.ts backend/frontend/src/lib/__tests__/visitHistory.test.ts
git commit -m "feat(ingame): client-side visit history from snapshot scores"
```

---

### Task 3: Dart slots, visit band and label-to-segment

**Files:**
- Create: `backend/frontend/src/lib/dartSlots.ts`, `backend/frontend/src/lib/visitBand.ts`
- Modify: `backend/frontend/src/lib/dartUtils.ts` (add `labelToSegment`)
- Test: `backend/frontend/src/lib/__tests__/dartSlots.test.ts`, `backend/frontend/src/lib/__tests__/visitBand.test.ts`, add to `backend/frontend/src/lib/__tests__/dartUtils.test.ts`

**Interfaces:**
- Consumes: `checkoutHint(remaining, outMode, dartsLeft): string[] | null` and `parseLabel(label)` from `dartUtils.ts`.
- Produces:
  - `type SlotKind = 'thrown' | 'miss' | 'bust' | 'suggested-next' | 'suggested-later' | 'empty-next' | 'empty-later'`
  - `type Slot = { kind: SlotKind; label: string; points: string; foot: string; aria: string }`
  - `type ThrownDart = { segment?: { name?: string }; score?: number }`
  - `x01Slots(o: { darts: ThrownDart[]; remaining: number; outMode: 'straight' | 'double' | 'master'; opened: boolean; bust: boolean; suggest: boolean }): Slot[]` (always 3)
  - `atcSlots(o: { darts: ThrownDart[]; hits: boolean[]; target: string | null }): Slot[]` (always 3)
  - `type VisitFx = 'none' | 'ton' | 'max'`
  - `type BandData = { eyebrow: string; progress: string; progressShort: string; sum: string; afterLabel: string; after: string; fx: VisitFx; bigDart: boolean; bust: boolean }`
  - `visitFx(sum: number): VisitFx`, `isBigDart(score: number): boolean`
  - `x01Band(o: { darts: ThrownDart[]; left: number; bust: boolean }): BandData`
  - `atcBand(o: { dartCount: number; advanced: number; target: string }): BandData`
  - `type Segment = { name: string; number: number; bed: string; multiplier: number }` and `labelToSegment(label: string): Segment` (exported from `dartUtils.ts`)

- [ ] **Step 1: Write the failing tests**

Create `backend/frontend/src/lib/__tests__/dartSlots.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { x01Slots, atcSlots } from '../dartSlots.js'

const d = (name: string, score: number) => ({ segment: { name }, score })
const base = { outMode: 'double' as const, opened: true, bust: false, suggest: true }

describe('x01Slots', () => {
  it('shows thrown darts and suggests the checkout in the empty slots', () => {
    const s = x01Slots({ ...base, darts: [d('T20', 60)], remaining: 81 })
    expect(s.map(x => [x.kind, x.label, x.points, x.foot])).toEqual([
      ['thrown', 'T20', '60', ''],
      ['suggested-next', 'T19', '', 'leaves 24'],
      ['suggested-later', 'D12', '', 'to win the leg'],
    ])
    expect(s[0].aria).toBe('Dart 1: T20, 60 points. Correct this dart')
    expect(s[1].aria).toBe('Dart 2: suggested T19, leaves 24')
  })

  it('one-dart finish says game shot and leaves the last slot empty', () => {
    const s = x01Slots({ ...base, darts: [d('T20', 60)], remaining: 40 })
    expect(s.map(x => [x.kind, x.label, x.foot])).toEqual([
      ['thrown', 'T20', ''], ['suggested-next', 'D20', 'Game shot'], ['empty-later', '', ''],
    ])
  })

  it('a zero-point dart is a miss', () => {
    const s = x01Slots({ ...base, darts: [d('Miss', 0)], remaining: 301 })
    expect(s[0]).toMatchObject({ kind: 'miss', label: 'Miss', points: '0', aria: 'Dart 1: Miss, no hit. Correct this dart' })
  })

  it('no suggestion above 170: next and empty slots', () => {
    const s = x01Slots({ ...base, darts: [], remaining: 301 })
    expect(s.map(x => [x.kind, x.aria])).toEqual([
      ['empty-next', 'Dart 1: next'], ['empty-later', 'Dart 2: not thrown'], ['empty-later', 'Dart 3: not thrown'],
    ])
  })

  it('no suggestions before opening or when turned off', () => {
    expect(x01Slots({ ...base, opened: false, darts: [], remaining: 40 })[0].kind).toBe('empty-next')
    expect(x01Slots({ ...base, suggest: false, darts: [], remaining: 40 })[0].kind).toBe('empty-next')
  })

  it('fills the rest with bust slots', () => {
    const s = x01Slots({ ...base, bust: true, darts: [d('T20', 60)], remaining: 40 })
    expect(s.map(x => [x.kind, x.label])).toEqual([['thrown', 'T20'], ['bust', 'Bust'], ['bust', 'Bust']])
  })

  it('never shows more than three slots', () => {
    expect(x01Slots({ ...base, darts: [d('S1', 1), d('S1', 1), d('S1', 1), d('S1', 1)], remaining: 97 })).toHaveLength(3)
  })
})

describe('atcSlots', () => {
  it('marks hits +1, misses 0, and suggests the target next', () => {
    const s = atcSlots({ darts: [d('S13', 13), d('S11', 11)], hits: [true, false], target: '14' })
    expect(s.map(x => [x.kind, x.label, x.points, x.foot])).toEqual([
      ['thrown', 'S13', '+1', ''], ['miss', 'S11', '0', ''], ['suggested-next', '14', '', 'your target'],
    ])
    expect(s[1].aria).toBe('Dart 2: S11, no hit. Correct this dart')
  })

  it('no suggestion without a target', () => {
    expect(atcSlots({ darts: [], hits: [], target: null })[0].kind).toBe('empty-next')
  })
})
```

Create `backend/frontend/src/lib/__tests__/visitBand.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { visitFx, isBigDart, x01Band, atcBand } from '../visitBand.js'

const d = (score: number) => ({ segment: { name: 'x' }, score })

describe('visitFx', () => {
  it('ton plus from 100 to 179, maximum at 180', () => {
    expect([99, 100, 179, 180].map(visitFx)).toEqual(['none', 'ton', 'ton', 'max'])
  })
})

describe('isBigDart', () => {
  it('is 50 or more', () => {
    expect([49, 50, 60].map(isBigDart)).toEqual([false, true, true])
  })
})

describe('x01Band', () => {
  it('shows the sum and what is left', () => {
    expect(x01Band({ darts: [d(60)], left: 81, bust: false })).toEqual({
      eyebrow: 'This visit', progress: '1 of 3 darts', progressShort: '1 of 3', sum: '60',
      afterLabel: 'Left after', after: '81', fx: 'none', bigDart: true, bust: false,
    })
  })

  it('celebrates a ton and a maximum', () => {
    expect(x01Band({ darts: [d(60), d(60), d(20)], left: 361, bust: false })).toMatchObject({ eyebrow: 'Ton plus', fx: 'ton', bigDart: false })
    expect(x01Band({ darts: [d(60), d(60), d(60)], left: 321, bust: false })).toMatchObject({ eyebrow: 'Maximum', fx: 'max', sum: '180' })
  })

  it('a bust never celebrates', () => {
    expect(x01Band({ darts: [d(60), d(60)], left: 101, bust: true })).toMatchObject({ eyebrow: 'Bust', fx: 'none', bigDart: false, bust: true })
  })
})

describe('atcBand', () => {
  it('shows targets advanced and the target now', () => {
    expect(atcBand({ dartCount: 2, advanced: 1, target: '14' })).toEqual({
      eyebrow: 'This visit', progress: '2 of 3 darts', progressShort: '2 of 3', sum: '+1',
      afterLabel: 'Target now', after: '14', fx: 'none', bigDart: false, bust: false,
    })
  })
})
```

Append to `backend/frontend/src/lib/__tests__/dartUtils.test.ts` (and add `labelToSegment` to its import from `'../dartUtils.js'`):

```ts
describe('labelToSegment', () => {
  it('maps labels to Board Manager segments', () => {
    expect(labelToSegment('T20')).toEqual({ name: 'T20', number: 20, bed: 'Triple', multiplier: 3 })
    expect(labelToSegment('D5')).toEqual({ name: 'D5', number: 5, bed: 'Double', multiplier: 2 })
    expect(labelToSegment('S3')).toEqual({ name: 'S3', number: 3, bed: 'SingleOuter', multiplier: 1 })
    expect(labelToSegment('25')).toEqual({ name: '25', number: 25, bed: 'Single', multiplier: 1 })
    expect(labelToSegment('Bull')).toEqual({ name: 'Bull', number: 50, bed: 'Double', multiplier: 1 })
    expect(labelToSegment('Miss')).toEqual({ name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/dartSlots.test.ts src/lib/__tests__/visitBand.test.ts src/lib/__tests__/dartUtils.test.ts`
Expected: FAIL (modules / export missing).

- [ ] **Step 3: Implement**

Create `backend/frontend/src/lib/dartSlots.ts`:

```ts
// The three dart slots under the board: thrown darts, then what to aim at next.
import { checkoutHint, parseLabel } from './dartUtils.js'

export type SlotKind = 'thrown' | 'miss' | 'bust' | 'suggested-next' | 'suggested-later' | 'empty-next' | 'empty-later'
export type Slot = { kind: SlotKind; label: string; points: string; foot: string; aria: string }
export type ThrownDart = { segment?: { name?: string }; score?: number }

function thrownSlot(d: ThrownDart, i: number, hit: boolean, points: string): Slot {
  const label = d.segment?.name || 'Miss'
  return {
    kind: hit ? 'thrown' : 'miss', label, points, foot: '',
    aria: `Dart ${i + 1}: ${label}, ${hit ? `${points} points` : 'no hit'}. Correct this dart`,
  }
}

/** Slots from `from` to the third: suggestions first, then empty ones. */
function openSlots(from: number, suggestions: { label: string; foot: string }[]): Slot[] {
  const out: Slot[] = []
  for (let i = from; i < 3; i++) {
    const s = suggestions[i - from]
    const next = i === from
    out.push(s
      ? { kind: next ? 'suggested-next' : 'suggested-later', label: s.label, points: '', foot: s.foot, aria: `Dart ${i + 1}: suggested ${s.label}, ${s.foot}` }
      : { kind: next ? 'empty-next' : 'empty-later', label: '', points: '', foot: '', aria: `Dart ${i + 1}: ${next ? 'next' : 'not thrown'}` })
  }
  return out
}

export function x01Slots(o: {
  darts: ThrownDart[]; remaining: number; outMode: 'straight' | 'double' | 'master'
  opened: boolean; bust: boolean; suggest: boolean
}): Slot[] {
  const done = o.darts.slice(0, 3).map((d, i) => {
    const score = d.score ?? 0
    return thrownSlot(d, i, score > 0, String(score))
  })
  if (o.bust) {
    return [...done, ...Array.from({ length: 3 - done.length }, (_, k): Slot =>
      ({ kind: 'bust', label: 'Bust', points: '', foot: '', aria: `Dart ${done.length + k + 1}: bust` }))]
  }
  const dartsLeft = 3 - done.length
  const hint = o.suggest && o.opened && o.remaining > 0 && dartsLeft > 0
    ? checkoutHint(o.remaining, o.outMode, dartsLeft) : null
  let rest = o.remaining
  const suggestions = (hint ?? []).map((label, k, all) => {
    rest -= parseLabel(label).score
    const foot = k < all.length - 1 ? `leaves ${rest}` : all.length === 1 ? 'Game shot' : 'to win the leg'
    return { label, foot }
  })
  return [...done, ...openSlots(done.length, suggestions)]
}

export function atcSlots(o: { darts: ThrownDart[]; hits: boolean[]; target: string | null }): Slot[] {
  const done = o.darts.slice(0, 3).map((d, i) => thrownSlot(d, i, o.hits[i] === true, o.hits[i] === true ? '+1' : '0'))
  return [...done, ...openSlots(done.length, o.target ? [{ label: o.target, foot: 'your target' }] : [])]
}
```

Create `backend/frontend/src/lib/visitBand.ts`:

```ts
// What the visit band says, and how much it celebrates.
import type { ThrownDart } from './dartSlots.js'

export type VisitFx = 'none' | 'ton' | 'max'
export type BandData = {
  eyebrow: string; progress: string; progressShort: string; sum: string
  afterLabel: string; after: string; fx: VisitFx; bigDart: boolean; bust: boolean
}

export const visitFx = (sum: number): VisitFx => (sum === 180 ? 'max' : sum >= 100 ? 'ton' : 'none')
export const isBigDart = (score: number): boolean => score >= 50

const EYEBROW: Record<VisitFx, string> = { none: 'This visit', ton: 'Ton plus', max: 'Maximum' }

export function x01Band(o: { darts: ThrownDart[]; left: number; bust: boolean }): BandData {
  const sum = o.darts.reduce((a, d) => a + (d.score ?? 0), 0)
  const fx = o.bust ? 'none' : visitFx(sum)
  const last = o.darts.at(-1)?.score ?? 0
  return {
    eyebrow: o.bust ? 'Bust' : EYEBROW[fx],
    progress: `${o.darts.length} of 3 darts`, progressShort: `${o.darts.length} of 3`,
    sum: String(sum), afterLabel: 'Left after', after: String(o.left),
    fx, bigDart: !o.bust && isBigDart(last), bust: o.bust,
  }
}

export function atcBand(o: { dartCount: number; advanced: number; target: string }): BandData {
  return {
    eyebrow: 'This visit', progress: `${o.dartCount} of 3 darts`, progressShort: `${o.dartCount} of 3`,
    sum: `+${o.advanced}`, afterLabel: 'Target now', after: o.target, fx: 'none', bigDart: false, bust: false,
  }
}
```

Append to `backend/frontend/src/lib/dartUtils.ts`:

```ts
export type Segment = { name: string; number: number; bed: string; multiplier: number }

/** A picker label (T20, D5, S3, 25, Bull, Miss) as the segment Board Manager would report. */
export function labelToSegment(label: string): Segment {
  if (label === 'Bull') return { name: 'Bull', number: 50, bed: 'Double', multiplier: 1 }
  if (label === '25') return { name: '25', number: 25, bed: 'Single', multiplier: 1 }
  if (label === 'Miss') return { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 }
  const { mult, num } = parseLabel(label)
  return { name: label, number: num, bed: mult === 3 ? 'Triple' : mult === 2 ? 'Double' : 'SingleOuter', multiplier: mult }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/dartSlots.test.ts src/lib/__tests__/visitBand.test.ts src/lib/__tests__/dartUtils.test.ts && npm run typecheck`
Expected: all pass; typecheck 0 errors.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/dartSlots.ts backend/frontend/src/lib/visitBand.ts backend/frontend/src/lib/dartUtils.ts backend/frontend/src/lib/__tests__/dartSlots.test.ts backend/frontend/src/lib/__tests__/visitBand.test.ts backend/frontend/src/lib/__tests__/dartUtils.test.ts
git commit -m "feat(ingame): dart slot and visit band logic with checkout suggestions"
```

---

### Task 4: ATC helpers and header meta

**Files:**
- Create: `backend/frontend/src/lib/atc.ts`, `backend/frontend/src/lib/gameViews/meta.ts`
- Modify: `backend/frontend/src/lib/gameViews/index.ts` (`getSubtitle` of both views)
- Test: `backend/frontend/src/lib/__tests__/atc.test.ts`, `backend/frontend/src/lib/__tests__/meta.test.ts`

**Interfaces:**
- Produces:
  - `type AtcCell = { label: string; short: string; state: 'hit' | 'current' | 'todo' }`
  - `atcTargetLabel(sequence: number[], target: number): string` ("14", "25", "Bull", "✓" when finished)
  - `atcCells(sequence: number[], target: number): AtcCell[]`
  - `atcDone(sequence: number[], target: number): number`
  - `atcTargetSegment(sequence: number[], target: number | undefined): number | null` (1–20, 25, 50; null when finished/unknown)
  - `atcLeaders(hitCounts: number[]): number[]`
  - `x01Meta(game: Record<string, unknown>, playerCount: number): string`, `atcMeta(game: Record<string, unknown>, playerCount: number): string`

ATC encoding (from `backend/src/games/atc.ts`): `sequence` lists targets in order; 1–20 are numbers, 21 is the outer bull, 22 the bull. A player's `targets[i]` not in `sequence` means they finished. `hitCounts[i]` is how many targets they have done.

- [ ] **Step 1: Write the failing tests**

Create `backend/frontend/src/lib/__tests__/atc.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { atcTargetLabel, atcCells, atcDone, atcTargetSegment, atcLeaders } from '../atc.js'

const seq = [...Array.from({ length: 20 }, (_, i) => i + 1), 22]

describe('atc helpers', () => {
  it('labels targets', () => {
    expect([14, 21, 22, 23].map(t => atcTargetLabel([...seq.slice(0, 20), 21, 22], t))).toEqual(['14', '25', 'Bull', '✓'])
  })

  it('builds 21 cells with hit, current and todo', () => {
    const cells = atcCells(seq, 14)
    expect(cells).toHaveLength(21)
    expect(cells[12]).toEqual({ label: '13', short: '13', state: 'hit' })
    expect(cells[13]).toEqual({ label: '14', short: '14', state: 'current' })
    expect(cells[14].state).toBe('todo')
    expect(cells[20]).toEqual({ label: 'Bull', short: 'B', state: 'todo' })
  })

  it('all cells are hit once finished', () => {
    expect(atcCells(seq, 23).every(c => c.state === 'hit')).toBe(true)
    expect(atcDone(seq, 23)).toBe(21)
  })

  it('counts done targets', () => {
    expect(atcDone(seq, 14)).toBe(13)
  })

  it('maps targets to board segments', () => {
    expect(atcTargetSegment([...seq.slice(0, 20), 21, 22], 21)).toBe(25)
    expect(atcTargetSegment(seq, 22)).toBe(50)
    expect(atcTargetSegment(seq, 9)).toBe(9)
    expect(atcTargetSegment(seq, 23)).toBeNull()
    expect(atcTargetSegment(seq, undefined)).toBeNull()
  })

  it('leaders are everyone on the highest count, nobody at zero', () => {
    expect(atcLeaders([13, 8, 16, 16])).toEqual([2, 3])
    expect(atcLeaders([0, 0])).toEqual([])
  })
})
```

Create `backend/frontend/src/lib/__tests__/meta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { x01Meta, atcMeta } from '../gameViews/meta.js'

const x01 = (o: Record<string, unknown> = {}) => ({
  config: { startScore: 501, outMode: 'double', inMode: 'straight' }, legs: [1, 1], firstTo: 3, winner: null, ...o,
})

describe('x01Meta', () => {
  it('two players', () => {
    expect(x01Meta(x01(), 2)).toBe('501 · Double out · First to 3 legs · Leg 3')
  })
  it('party and solo', () => {
    expect(x01Meta(x01({ legs: [0, 1, 0, 0], firstTo: 2 }), 4)).toBe('4 players · 501 · Double out · First to 2 legs · Leg 2')
    expect(x01Meta(x01({ legs: [3] }), 1)).toBe('501 · Double out · Practice · Leg 4')
  })
  it('names a non-straight in mode and a single leg', () => {
    expect(x01Meta(x01({ config: { startScore: 301, outMode: 'master', inMode: 'double' }, legs: [0, 0], firstTo: 1 }), 2))
      .toBe('301 · Double in · Master out · First to 1 leg · Leg 1')
  })
  it('does not count past the last leg once the match is won', () => {
    expect(x01Meta(x01({ legs: [3, 1], winner: 0 }), 2)).toBe('501 · Double out · First to 3 legs · Leg 4')
  })
})

describe('atcMeta', () => {
  const atc = (o: Record<string, unknown> = {}) => ({
    cfg: { order: 'asc', multiplierAdvances: false }, sequence: [1, 2, 22], totalVisits: [11, 11], ...o,
  })
  it('two players', () => {
    expect(atcMeta(atc(), 2)).toBe('1–20, then Bull · any segment counts · Round 12')
  })
  it('party and solo', () => {
    expect(atcMeta(atc({ totalVisits: [11, 12, 11, 11] }), 4)).toBe('4 players · 1–20, then Bull · Round 12')
    expect(atcMeta(atc({ totalVisits: [11] }), 1)).toBe('1–20, then Bull · Practice · Round 12')
  })
  it('names the order and the outer bull', () => {
    expect(atcMeta(atc({ cfg: { order: 'desc', multiplierAdvances: true }, sequence: [20, 21] }), 2))
      .toBe('20–1, then 25 · multiplier advances · Round 12')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/atc.test.ts src/lib/__tests__/meta.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

Create `backend/frontend/src/lib/atc.ts`:

```ts
// Around the Clock: targets are 1–20, 21 = outer bull, 22 = bull; a target outside
// the sequence means the player has finished.

export type AtcCell = { label: string; short: string; state: 'hit' | 'current' | 'todo' }

export function atcTargetLabel(sequence: number[], target: number): string {
  if (!sequence.includes(target)) return '✓'
  return target === 21 ? '25' : target === 22 ? 'Bull' : String(target)
}

export function atcCells(sequence: number[], target: number): AtcCell[] {
  const cur = sequence.indexOf(target)
  return sequence.map((n, i) => ({
    label: n === 22 ? 'Bull' : n === 21 ? '25' : String(n),
    short: n === 22 ? 'B' : n === 21 ? '25' : String(n),
    state: cur === -1 || i < cur ? 'hit' : i === cur ? 'current' : 'todo',
  }))
}

export function atcDone(sequence: number[], target: number): number {
  const i = sequence.indexOf(target)
  return i === -1 ? sequence.length : i
}

/** Board segment for a target (25 = outer bull, 50 = bull), or null when finished or unknown. */
export function atcTargetSegment(sequence: number[], target: number | undefined): number | null {
  if (target === undefined || !sequence.includes(target)) return null
  return target === 21 ? 25 : target === 22 ? 50 : target
}

/** Players on the highest number of targets done; nobody while that is 0. */
export function atcLeaders(hitCounts: number[]): number[] {
  const max = Math.max(0, ...hitCounts)
  return max > 0 ? hitCounts.flatMap((h, i) => (h === max ? [i] : [])) : []
}
```

Create `backend/frontend/src/lib/gameViews/meta.ts`:

```ts
// The meta line next to the game title in the header.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function x01Meta(game: Record<string, unknown>, playerCount: number): string {
  const cfg = (game.config ?? {}) as { startScore?: number; outMode?: string; inMode?: string }
  const legs = (game.legs as number[] | undefined) ?? []
  const firstTo = (game.firstTo as number | undefined) ?? 1
  const played = legs.reduce((a, b) => a + b, 0)
  const parts: string[] = []
  if (playerCount > 2) parts.push(`${playerCount} players`)
  parts.push(String(cfg.startScore ?? 501))
  if (cfg.inMode && cfg.inMode !== 'straight') parts.push(`${cap(cfg.inMode)} in`)
  parts.push(`${cap(cfg.outMode ?? 'double')} out`)
  parts.push(playerCount === 1 ? 'Practice' : `First to ${firstTo} ${firstTo === 1 ? 'leg' : 'legs'}`)
  // Once the match is won the last leg is the one that was just played
  parts.push(`Leg ${game.winner === null || game.winner === undefined ? played + 1 : played}`)
  return parts.join(' · ')
}

export function atcMeta(game: Record<string, unknown>, playerCount: number): string {
  const cfg = (game.cfg ?? {}) as { order?: string; multiplierAdvances?: boolean }
  const seq = (game.sequence as number[] | undefined) ?? []
  const totalVisits = (game.totalVisits as number[] | undefined) ?? []
  const round = totalVisits.length ? Math.min(...totalVisits) + 1 : 1
  const order = cfg.order === 'desc' ? '20–1' : cfg.order === 'random' ? 'Random order' : '1–20'
  const bull = seq.includes(22) ? ', then Bull' : seq.includes(21) ? ', then 25' : ''
  const parts: string[] = []
  if (playerCount > 2) parts.push(`${playerCount} players`)
  parts.push(order + bull)
  if (playerCount === 2) parts.push(cfg.multiplierAdvances ? 'multiplier advances' : 'any segment counts')
  if (playerCount === 1) parts.push('Practice')
  parts.push(`Round ${round}`)
  return parts.join(' · ')
}
```

In `backend/frontend/src/lib/gameViews/index.ts`:
- Add `import { x01Meta, atcMeta } from './meta.js'`.
- Replace the whole `getSubtitle: (game, playerCount) => { … }` of `atcView` with `getSubtitle: (game, playerCount) => atcMeta(game, playerCount ?? 1),`.
- Replace the whole `getSubtitle: (game) => { … }` of `x01View` with `getSubtitle: (game, playerCount) => x01Meta(game, playerCount ?? 1),`.
- Remove the now unused `import type { ATCConfig } …` line.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/atc.test.ts src/lib/__tests__/meta.test.ts && npm run typecheck`
Expected: all pass; typecheck 0 errors.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/atc.ts backend/frontend/src/lib/gameViews/meta.ts backend/frontend/src/lib/gameViews/index.ts backend/frontend/src/lib/__tests__/atc.test.ts backend/frontend/src/lib/__tests__/meta.test.ts
git commit -m "feat(ingame): ATC helpers and header meta lines"
```

---

### Task 5: Per-player stats

**Files:**
- Create: `backend/frontend/src/lib/playerStats.ts`
- Test: `backend/frontend/src/lib/__tests__/playerStats.test.ts`

**Interfaces:**
- Consumes: `checkoutHint` (dartUtils), `atcCells`, `atcDone`, `atcTargetLabel`, `AtcCell` (Task 4), `threeDartAvg`, `Visit`, `VisitHistory` (Task 2).
- Produces:
  - `type X01PlayerView = { remaining: number; opened: boolean; canFinish: string | null; avg: string; legAvg: string; last: string; darts: number; legsWon: number; firstTo: number; visits: Visit[]; current: { scored: number; left: number } | null }`
  - `x01Player(game: Record<string, unknown>, i: number, history: VisitHistory, o: { active: boolean; suggest: boolean }): X01PlayerView`
  - `type AtcPlayerView = { target: string; done: number; total: number; cells: AtcCell[]; darts: number; hitRate: string }`
  - `atcPlayer(game: Record<string, unknown>, i: number): AtcPlayerView`

- [ ] **Step 1: Write the failing test**

Create `backend/frontend/src/lib/__tests__/playerStats.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { x01Player, atcPlayer } from '../playerStats.js'
import { emptyHistory, type VisitHistory } from '../visitHistory.js'

const visit = (scored: number, left: number, darts = 3) => ({ scored, left, darts, bust: false })
const history = (leg: VisitHistory['leg'], all = leg): VisitHistory => ({ ...emptyHistory(), leg, all })
const game = (o: Record<string, unknown> = {}) => ({
  scores: [81, 87], opened: [true, true], legs: [1, 0], firstTo: 3, totalDarts: [16, 18],
  config: { outMode: 'double' }, currentVisitDarts: [{ segment: { name: 'T20' }, score: 60 }], ...o,
})

describe('x01Player', () => {
  it('the thrower: running visit on the chalkboard, finish with the darts left', () => {
    const p = x01Player(game(), 0, history([[visit(100, 401), visit(60, 341)]]), { active: true, suggest: true })
    expect(p).toMatchObject({
      remaining: 81, canFinish: 'T19 · D12', avg: '80.0', legAvg: '80.0', last: '60', darts: 16, legsWon: 1, firstTo: 3,
      current: { scored: 60, left: 81 },
    })
  })

  it('a waiting player has no running visit and three darts to finish', () => {
    const p = x01Player(game(), 1, history([[], [visit(45, 87)]]), { active: false, suggest: true })
    expect(p.current).toBeNull()
    // First two-dart finish the finder meets (it prefers trebles high to low), not the design's sample T17 · D18
    expect(p.canFinish).toBe('T19 · D15')
  })

  it('averages show a dash without visits', () => {
    const p = x01Player(game(), 1, emptyHistory(), { active: false, suggest: true })
    expect([p.avg, p.legAvg, p.last]).toEqual(['—', '—', '—'])
  })

  it('no finish is null (too high, not opened, or suggestions off)', () => {
    expect(x01Player(game({ scores: [301, 87] }), 0, emptyHistory(), { active: true, suggest: true }).canFinish).toBeNull()
    expect(x01Player(game({ opened: [false, true] }), 0, emptyHistory(), { active: true, suggest: true }).canFinish).toBeNull()
    expect(x01Player(game(), 1, emptyHistory(), { active: false, suggest: false }).canFinish).toBeNull()
  })

  it('leg average uses this leg only', () => {
    const p = x01Player(game(), 0, history([[visit(30, 471)]], [[visit(100, 401), visit(30, 471)]]), { active: false, suggest: true })
    expect([p.avg, p.legAvg]).toEqual(['65.0', '30.0'])
  })
})

describe('atcPlayer', () => {
  it('shows target, progress and hit rate', () => {
    const seq = [...Array.from({ length: 20 }, (_, i) => i + 1), 22]
    const p = atcPlayer({ sequence: seq, targets: [14], hitCounts: [13], totalDarts: [35] }, 0)
    expect(p).toMatchObject({ target: '14', done: 13, total: 21, darts: 35, hitRate: '37%' })
    expect(p.cells).toHaveLength(21)
  })

  it('hit rate is 0% before the first dart', () => {
    expect(atcPlayer({ sequence: [1, 2], targets: [1], hitCounts: [0], totalDarts: [0] }, 0).hitRate).toBe('0%')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/playerStats.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `backend/frontend/src/lib/playerStats.ts`:

```ts
// What a player panel or row shows, computed from the game snapshot and the visit history.
import { checkoutHint } from './dartUtils.js'
import { atcCells, atcDone, atcTargetLabel, type AtcCell } from './atc.js'
import { threeDartAvg, type Visit, type VisitHistory } from './visitHistory.js'

type OutMode = 'straight' | 'double' | 'master'

const nums = (game: Record<string, unknown>, key: string): number[] =>
  Array.isArray(game[key]) ? (game[key] as number[]) : []
const fmtAvg = (v: number | null) => (v === null ? '—' : v.toFixed(1))

export type X01PlayerView = {
  remaining: number
  opened: boolean
  /** "T19 · D12", or null when no finish is possible (or suggestions are off). */
  canFinish: string | null
  avg: string
  legAvg: string
  last: string
  darts: number
  legsWon: number
  firstTo: number
  /** Finished visits of this leg. */
  visits: Visit[]
  /** The thrower's running visit, for the chalkboard's highlighted row. */
  current: { scored: number; left: number } | null
}

export function x01Player(
  game: Record<string, unknown>, i: number, history: VisitHistory, o: { active: boolean; suggest: boolean },
): X01PlayerView {
  const remaining = nums(game, 'scores')[i] ?? 0
  const opened = (game.opened as boolean[] | undefined)?.[i] ?? true
  const outMode = ((game.config as { outMode?: OutMode } | undefined)?.outMode ?? 'double') as OutMode
  const running = o.active ? ((game.currentVisitDarts as { score?: number }[] | undefined) ?? []) : []
  const dartsLeft = 3 - running.length
  const hint = o.suggest && opened && remaining > 0 && dartsLeft > 0 ? checkoutHint(remaining, outMode, dartsLeft) : null
  const all = history.all[i] ?? []
  const leg = history.leg[i] ?? []
  return {
    remaining, opened,
    canFinish: hint ? hint.join(' · ') : null,
    avg: fmtAvg(threeDartAvg(all)),
    legAvg: fmtAvg(threeDartAvg(leg)),
    last: all.length ? String(all[all.length - 1].scored) : '—',
    darts: nums(game, 'totalDarts')[i] ?? 0,
    legsWon: nums(game, 'legs')[i] ?? 0,
    firstTo: (game.firstTo as number | undefined) ?? 1,
    visits: leg,
    current: running.length ? { scored: running.reduce((a, d) => a + (d.score ?? 0), 0), left: remaining } : null,
  }
}

export type AtcPlayerView = { target: string; done: number; total: number; cells: AtcCell[]; darts: number; hitRate: string }

export function atcPlayer(game: Record<string, unknown>, i: number): AtcPlayerView {
  const seq = nums(game, 'sequence')
  const target = nums(game, 'targets')[i] ?? seq[0] ?? 1
  const darts = nums(game, 'totalDarts')[i] ?? 0
  const hits = nums(game, 'hitCounts')[i] ?? 0
  return {
    target: atcTargetLabel(seq, target), done: atcDone(seq, target), total: seq.length,
    cells: atcCells(seq, target), darts, hitRate: darts ? `${Math.round((hits / darts) * 100)}%` : '0%',
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/playerStats.test.ts && npm run typecheck`
Expected: 7 tests pass; typecheck 0 errors.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/playerStats.ts backend/frontend/src/lib/__tests__/playerStats.test.ts
git commit -m "feat(ingame): per-player stats for panels and rows"
```

---

### Task 6: Dartboard styling for targets and checkout, board legend

**Files:**
- Modify: `backend/frontend/src/lib/components/DartBoard.svelte`
- Create: `backend/frontend/src/lib/components/BoardLegend.svelte`
- Modify: `backend/frontend/src/routes/GameDisplay.svelte` (the two `<DartBoard …>` usages)

**Interfaces:**
- DartBoard props change: remove `selectedSegments`; add `target?: number | null` (segment 1–20, 25 or 50: lime wedge), `nextTarget?: number | null` (white dashed outline), `dim?: boolean` (45% dark layer over the board, grey numbers). `checkoutTargets` rings get the design size.
- Produces: `BoardLegend.svelte` with props `{ items: { label: string; kind: 'current' | 'next' | 'others' }[] }`.

- [ ] **Step 1: Change DartBoard props**

In `DartBoard.svelte`, in the `let { … } = $props()` destructuring replace `selectedSegments = [],` with `target = null, nextTarget = null, dim = false,`, and in its type replace `selectedSegments?: number[]` with:

```ts
    /** ATC target of the thrower: lime wedge (1–20) or bull ring (25, 50). */
    target?: number | null
    /** ATC target of the next player: white dashed outline. */
    nextTarget?: number | null
    /** Dim the board so the target stands out (ATC). */
    dim?: boolean
```

- [ ] **Step 2: Replace the highlight and label blocks**

Replace everything from `<!-- Selected segment: lime wedge overlay -->` up to (not including) `<!-- Other-player markers: white circle with initial -->` with:

```svelte
  {#if dim}
    <circle cx="0" cy="0" r="1.12" fill="#0a0b09" fill-opacity="0.45" style="pointer-events:none" />
  {/if}

  <!-- ATC targets: thrower's in lime, next player's dashed white -->
  {#each [{ seg: target, next: false }, { seg: nextTarget, next: true }] as t}
    {#if t.seg}
      {@const sector = sectors.find(s => s.num === t.seg)}
      {@const style = t.next
        ? { fill: 'none', 'fill-opacity': '0', stroke: '#efeee6', 'stroke-width': '0.012', 'stroke-dasharray': '0.035 0.024' }
        : { fill: '#c6f24e', 'fill-opacity': '0.38', stroke: '#c6f24e', 'stroke-width': '0.018', 'stroke-dasharray': 'none' }}
      {#if sector}
        <path d={sectorPath(R.bull25, R.db, sector.a1, sector.a2)} {...style} stroke-linejoin="round" style="pointer-events:none" />
      {:else if t.seg === 25 || t.seg === 50}
        <circle cx="0" cy="0" r={t.seg === 25 ? R.bull25 : R.bull50} {...style} style="pointer-events:none" />
      {/if}
    {/if}
  {/each}

  <!-- Number labels — pointer-events:none so clicks go through to paths -->
  {#each sectors as { num, tx, ty }}
    <text x={tx} y={ty} text-anchor="middle" dominant-baseline="central"
      fill={num === target ? '#c6f24e' : dim ? '#8f9085' : '#efeee6'}
      font-size={num === target ? '0.123' : '0.09'}
      font-family="Barlow Condensed, sans-serif" font-weight={num === target ? '700' : '600'}
      style="pointer-events:none">
      {num}
    </text>
  {/each}

```

- [ ] **Step 3: Checkout ring size**

In the `<!-- Checkout target dashed circles (x01) -->` block replace `r="0.055"` with `r="0.076"`, `stroke-width="0.018"` with `stroke-width="0.015"` and `stroke-dasharray="0.025 0.02"` with `stroke-dasharray="0.024 0.018"`.

- [ ] **Step 4: Create BoardLegend**

Create `backend/frontend/src/lib/components/BoardLegend.svelte`:

```svelte
<script lang="ts">
  // Key for the ATC board highlights, shown under the board.
  let { items }: { items: { label: string; kind: 'current' | 'next' | 'others' }[] } = $props()
</script>

<div class="flex items-center justify-center gap-5 text-[13px] text-text-muted">
  {#each items as item (item.label)}
    <span class="flex items-center gap-2 min-w-0">
      {#if item.kind === 'current'}
        <span class="w-3 h-3 shrink-0 rounded-[3px] bg-accent"></span>
      {:else if item.kind === 'next'}
        <span class="w-3 h-3 shrink-0 rounded-[3px] border-2 border-dashed border-text"></span>
      {:else}
        <span class="w-[14px] h-[14px] shrink-0 rounded-full bg-text"></span>
      {/if}
      <span class="truncate">{item.label}</span>
    </span>
  {/each}
</div>
```

- [ ] **Step 5: Keep GameDisplay compiling**

In `backend/frontend/src/routes/GameDisplay.svelte`, in both `<DartBoard …>` usages replace `selectedSegments={highlights}` with `target={highlights[0] ?? null} dim={gameId === 'atc'}`.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: 0 errors; all tests pass. Then, with the dev server (Task 10 describes how), open an ATC game: the board is dimmed, the target wedge lime with a lime number; open an X01 game: unchanged.

- [ ] **Step 7: Commit**

```bash
git add backend/frontend/src/lib/components/DartBoard.svelte backend/frontend/src/lib/components/BoardLegend.svelte backend/frontend/src/routes/GameDisplay.svelte
git commit -m "feat(dartboard): design target highlights, dim mode and checkout rings"
```

---

### Task 7: Center column pieces: visit band, dart slots, control bar

**Files:**
- Create: `backend/frontend/src/lib/components/VisitBand.svelte`, `DartSlots.svelte`, `ControlBar.svelte`

**Interfaces:**
- Consumes: `BandData` (Task 3), `Slot` (Task 3), `nearbyPicks`, `parseLabel` (dartUtils).
- Produces:
  - `VisitBand.svelte` props `{ band: BandData; compact?: boolean }`
  - `DartSlots.svelte` props `{ slots: Slot[]; onCorrect: (dartIndex: number, label: string) => void; popIndex?: number | null; openDart?: number | null (bindable) }`
  - `ControlBar.svelte` props `{ canUndo: boolean; manual: boolean; onUndo: () => void; onNext: () => void }`

These are wired into the page in Task 10; this task ends with them compiling.

- [ ] **Step 1: VisitBand**

Create `backend/frontend/src/lib/components/VisitBand.svelte`:

```svelte
<script lang="ts">
  // The visit sum under the board (or a compact tile beside the slots), with the
  // VisitFX celebrations: ton plus, maximum, and a tick for a big dart.
  import type { BandData } from '$lib/visitBand.js'

  let { band, compact = false }: { band: BandData; compact?: boolean } = $props()

  const tone = $derived(band.bust ? 'bust' : band.fx)
  // Re-mount on every new celebrating sum so each animation plays once when the dart lands
  const replayKey = $derived(band.fx !== 'none' || band.bigDart ? band.sum : 'calm')

  const CONFETTI = ['#e9dfc4', '#c6f24e', '#d23b36', '#1e7a4f', '#dcff7a', '#efeee6']
  const confetti = Array.from({ length: 30 }, (_, i) => ({
    c: CONFETTI[i % CONFETTI.length],
    w: 6 + ((i * 7) % 5), h: 10 + ((i * 5) % 7),
    x: Math.round(Math.cos(i * 2.4) * (120 + ((i * 37) % 160))),
    y: Math.round(-60 - ((i * 53) % 180)),
    r: ((i * 97) % 720) - 360,
  }))

  const box = $derived(
    tone === 'max' ? 'bg-accent border-2 border-accent text-accent-fg fx-max'
    : tone === 'ton' ? 'bg-[#1f2618] border-2 border-accent fx-ton'
    : tone === 'bust' ? 'bg-surface-panel border border-danger-line'
    : 'bg-surface-panel border border-line-2')
  const eyebrowColor = $derived(tone === 'max' ? '' : tone === 'ton' ? 'text-accent font-bold' : tone === 'bust' ? 'text-danger-text font-bold' : 'text-text-muted')
  const sumColor = $derived(tone === 'ton' ? 'text-accent' : tone === 'bust' ? 'text-danger-text line-through' : '')
  const quiet = $derived(tone === 'max' ? '' : 'text-text-dim')
  const afterColor = $derived(tone === 'max' ? '' : 'text-ink-3')
</script>

{#key replayKey}
  {#if compact}
    <div role="status" class="relative h-[min(124px,14vh)] box-border px-[18px] py-3 rounded-[14px] flex flex-col justify-between {box}">
      <span class="flex justify-between gap-2 text-[13px]">
        <span class={eyebrowColor}>{band.eyebrow}</span><span class={quiet}>{band.progressShort}</span>
      </span>
      <span class="font-display font-bold text-[80px] leading-[0.85] tabular-nums self-center {sumColor}" class:fx-tick={band.bigDart}>{band.sum}</span>
      <span class="flex items-baseline justify-between gap-2 text-[13px]">
        <span class={quiet}>{band.afterLabel}</span>
        <span class="font-display font-bold text-[24px] leading-none {afterColor}">{band.after}</span>
      </span>
      {#if tone === 'max'}{@render burst()}{/if}
    </div>
  {:else}
    <div role="status" class="relative grid grid-cols-[1fr_auto_1fr] items-center gap-5 px-[18px] py-[10px] rounded-[14px] {box}">
      <span class="flex flex-col items-end gap-[2px] text-right">
        <span class="text-[12px] uppercase tracking-[0.1em] {eyebrowColor}">{band.eyebrow}</span>
        <span class="text-[13px] {quiet}">{band.progress}</span>
      </span>
      <span class="sum font-display font-bold text-[min(96px,11vh)] leading-[0.85] tabular-nums {sumColor}" class:fx-tick={band.bigDart}>{band.sum}</span>
      <span class="flex flex-col gap-[2px]">
        <span class="text-[12px] uppercase tracking-[0.1em] {quiet}">{band.afterLabel}</span>
        <span class="font-display font-bold text-[30px] leading-none {afterColor}">{band.after}</span>
      </span>
      {#if tone === 'max'}{@render burst()}{/if}
    </div>
  {/if}
{/key}

{#snippet burst()}
  <span class="absolute inset-0 pointer-events-none" aria-hidden="true">
    {#each confetti as p}
      <span class="confetti" style="--c:{p.c};--w:{p.w}px;--h:{p.h}px;--x:{p.x}px;--y:{p.y}px;--r:{p.r}deg"></span>
    {/each}
  </span>
{/snippet}

<style>
  .fx-ton { animation: dc-ton 1.6s ease-in-out 1; }
  .fx-ton .sum { animation: dc-num 1.6s ease-in-out 1; }
  .fx-max { animation: dc-max 2.6s cubic-bezier(.2, .8, .2, 1) 1; }
  .fx-tick { animation: dc-tick 0.9s ease-out 1; }
  .confetti {
    position: absolute; left: 50%; top: 50%;
    width: var(--w); height: var(--h); background: var(--c); border-radius: 2px; opacity: 0;
    animation: dc-conf 2.6s cubic-bezier(.2, .8, .2, 1) 1 forwards;
  }
  @keyframes dc-ton {
    0%, 100% { box-shadow: 0 0 0 0 rgba(198, 242, 78, 0); }
    50% { box-shadow: 0 0 0 8px rgba(198, 242, 78, .16), 0 0 36px rgba(198, 242, 78, .25); border-color: #dcff7a; }
  }
  @keyframes dc-num { 50% { transform: scale(1.05); } }
  @keyframes dc-max {
    0% { transform: scale(1); }
    20% { transform: scale(1.07); box-shadow: 0 0 48px rgba(198, 242, 78, .55); }
    45% { transform: scale(.99); }
    70% { transform: scale(1.04); }
    100% { transform: scale(1); box-shadow: none; }
  }
  @keyframes dc-tick { 12% { transform: scale(1.12); } 100% { transform: scale(1); } }
  @keyframes dc-conf {
    0% { opacity: 1; transform: translate(-50%, -50%) rotate(0deg); }
    100% { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y) + 120px)) rotate(var(--r)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .fx-ton, .fx-ton .sum, .fx-max, .fx-tick { animation: none; }
    .confetti { display: none; }
  }
</style>
```

- [ ] **Step 2: DartSlots**

Create `backend/frontend/src/lib/components/DartSlots.svelte`. The correction popover keeps the compact layout the user approved on PR #35 (below the slots, nearby picks in one row, full picker 1–20 in two rows):

```svelte
<script lang="ts">
  // The three dart slots; tapping a thrown dart opens the correction popover below them.
  import { nearbyPicks, parseLabel } from '$lib/dartUtils.js'
  import type { Slot } from '$lib/dartSlots.js'

  let { slots, onCorrect, popIndex = null, openDart = $bindable(null) }: {
    slots: Slot[]
    onCorrect: (dartIndex: number, label: string) => void
    /** Slot of a dart that just landed big (≥ 50): it pops once. */
    popIndex?: number | null
    /** The dart being corrected (bindable, so the board can highlight it). */
    openDart?: number | null
  } = $props()

  let mode = $state<'quick' | 'full'>('quick')
  let mult = $state<'S' | 'D' | 'T'>('S')

  const isThrown = (s: Slot | undefined) => s?.kind === 'thrown' || s?.kind === 'miss'

  // Close the popover when its dart goes away (undo, takeout)
  $effect(() => { if (openDart !== null && !isThrown(slots[openDart])) openDart = null })

  const quickPicks = $derived(openDart !== null ? nearbyPicks(slots[openDart]?.label ?? 'Miss') : [])

  function toggle(i: number) {
    mode = 'quick'
    openDart = openDart === i ? null : i
  }
  function pick(label: string) {
    if (openDart === null) return
    onCorrect(openDart, label)
    openDart = null
    mode = 'quick'
  }

  const nums = Array.from({ length: 20 }, (_, i) => i + 1)
  const multNames: Record<string, string> = { S: 'Single', D: 'Double', T: 'Treble' }
  const slotBox = 'h-[min(124px,14vh)] box-border rounded-[14px] px-[14px] pt-[10px] pb-3 flex flex-col items-center justify-center gap-2'
  const slotLabel = 'font-display font-bold text-[min(66px,7.5vh)] leading-[0.9]'
</script>

<div class="flex flex-col gap-2 min-w-0">
  <div class="grid grid-cols-3 gap-[10px]">
    {#each slots as slot, i (i)}
      {#if slot.kind === 'thrown' || slot.kind === 'miss'}
        <button type="button" onclick={() => toggle(i)} aria-expanded={openDart === i} aria-label={slot.aria}
          class="{slotBox} cursor-pointer
                 {slot.kind === 'thrown' ? 'bg-accent text-accent-fg border-0' : 'bg-surface-chip text-text border border-line-key'}
                 {openDart === i ? '[box-shadow:0_0_0_3px_#0f100e,0_0_0_5px_#c6f24e]' : ''}"
          class:fx-pop={popIndex === i}>
          <span class={slotLabel}>{slot.label}</span>
          <span class="font-display font-bold text-[30px] leading-none {slot.kind === 'miss' ? 'text-text-muted' : ''}">{slot.points}</span>
        </button>
      {:else}
        <div class="{slotBox}
                    {slot.kind === 'bust' ? 'bg-[#1a0e0c] border border-danger-line'
                      : slot.kind === 'suggested-next' || slot.kind === 'empty-next' ? 'border-2 border-dashed border-accent'
                      : slot.kind === 'suggested-later' ? 'border-[1.5px] border-dashed border-line-next'
                      : 'border-[1.5px] border-dashed border-line-dashed'}">
          <span class="sr-only">{slot.aria}</span>
          {#if slot.kind === 'bust'}
            <span aria-hidden="true" class="text-[13px] font-bold uppercase tracking-[0.12em] text-danger-text">{slot.label}</span>
          {:else if slot.kind === 'empty-next'}
            <span aria-hidden="true" class="w-3 h-3 rounded-full bg-accent"></span>
          {:else if slot.label}
            <span aria-hidden="true" class="{slotLabel} text-text-dim">{slot.label}</span>
            <span aria-hidden="true" class="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-faint">{slot.foot}</span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  {#if openDart !== null}
    <div role="dialog" aria-label="Correct dart {openDart + 1}"
      class="w-full box-border px-3 pt-2 pb-3 rounded-[14px] bg-surface-inset border border-line-popover
             flex flex-col gap-2 [box-shadow:0_16px_40px_rgba(0,0,0,0.5)]">
      <div class="flex items-center gap-2 min-w-0">
        {#if mode === 'full'}
          <button type="button" onclick={() => mode = 'quick'} aria-label="Back to nearby segments"
            class="w-9 h-9 -ml-2 shrink-0 flex items-center justify-center bg-transparent border-0 text-ink-2 cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
          </button>
        {/if}
        <span class="text-[14px] font-semibold whitespace-nowrap">Correct dart {openDart + 1}</span>
        <span class="text-[13px] text-text-muted truncate">
          Detected <strong class="text-text">{slots[openDart]?.label}</strong> · or drag it on the board
        </span>
        <button type="button" onclick={() => { openDart = null; mode = 'quick' }} aria-label="Close"
          class="w-9 h-9 -mr-2 ml-auto shrink-0 flex items-center justify-center bg-transparent border-0 text-ink-2 cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>

      {#if mode === 'quick'}
        <div class="grid gap-[6px]" style:grid-template-columns="repeat({quickPicks.length + 1}, minmax(0, 1fr))">
          {#each quickPicks as label}
            <button type="button" onclick={() => pick(label)}
              class="h-11 flex flex-col items-center justify-center bg-surface-key border border-line-key rounded-[9px] text-text cursor-pointer">
              <span class="font-display font-bold text-[18px] leading-none">{label}</span>
              <span class="text-[10px] text-text-muted leading-tight">{parseLabel(label).score}</span>
            </button>
          {/each}
          <button type="button" onclick={() => mode = 'full'}
            class="h-11 flex items-center justify-center bg-transparent border-[1.5px] border-dashed border-line-pip rounded-[9px]
                   text-accent text-[13px] font-semibold cursor-pointer">Other…</button>
        </div>
      {:else}
        <div class="grid grid-cols-3 gap-1 p-1 bg-bg rounded-[9px]">
          {#each (['S', 'D', 'T'] as const) as m}
            <button type="button" onclick={() => mult = m} aria-pressed={mult === m}
              class="h-9 border-0 rounded-[6px] text-[14px] cursor-pointer
                     {mult === m ? 'bg-accent text-accent-fg font-bold' : 'bg-transparent text-ink-2'}">{multNames[m]}</button>
          {/each}
        </div>
        <div class="grid grid-cols-10 gap-1">
          {#each nums as n}
            <button type="button" onclick={() => pick(`${mult}${n}`)} aria-label="{multNames[mult]} {n}"
              class="h-10 bg-surface-key border border-line-key rounded-[8px] text-text font-display font-bold text-[18px] cursor-pointer">{n}</button>
          {/each}
        </div>
        <div class="grid grid-cols-3 gap-1">
          <button type="button" onclick={() => pick('25')}
            class="h-10 bg-[#1e3a2b] border border-[#2f5a42] rounded-[8px] text-text text-[14px] font-semibold cursor-pointer">25 · Outer bull</button>
          <button type="button" onclick={() => pick('Bull')}
            class="h-10 bg-[#4a1f1c] border border-[#6e2e2a] rounded-[8px] text-text text-[14px] font-semibold cursor-pointer">50 · Bull</button>
          <button type="button" onclick={() => pick('Miss')}
            class="h-10 bg-transparent border border-line-key rounded-[8px] text-ink-2 text-[14px] font-semibold cursor-pointer">Miss · 0</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .fx-pop { animation: dc-pop 2.4s ease-out 1; }
  @keyframes dc-pop {
    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(198, 242, 78, .35); }
    12% { transform: scale(1.08); box-shadow: 0 0 0 10px rgba(198, 242, 78, .35); }
    40%, 100% { transform: scale(1); box-shadow: 0 0 0 18px rgba(198, 242, 78, 0); }
  }
  @media (prefers-reduced-motion: reduce) { .fx-pop { animation: none; } }
</style>
```

- [ ] **Step 3: ControlBar**

Create `backend/frontend/src/lib/components/ControlBar.svelte`:

```svelte
<script lang="ts">
  // Undo, and the manual advance. On a board the takeout advances by itself, so
  // "Skip to next" stays quiet; without a board it is the way on, so it is an outline button.
  let { canUndo, manual, onUndo, onNext }: {
    canUndo: boolean
    manual: boolean
    onUndo: () => void
    onNext: () => void
  } = $props()
</script>

<div class="h-[52px] shrink-0 flex items-center gap-[10px]">
  <button type="button" onclick={onUndo} disabled={!canUndo}
    class="h-12 px-4 flex items-center gap-2 rounded-[10px] border border-line-strong bg-transparent text-text
           text-[15px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-default">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>
    Undo
  </button>
  <span class="flex-1"></span>
  <button type="button" onclick={onNext}
    class="h-12 flex items-center gap-1 rounded-[10px] cursor-pointer
           {manual ? 'px-4 border border-line-strong bg-transparent text-text text-[15px] font-medium'
                   : 'px-2 border-0 bg-transparent text-text-muted text-[14px]'}">
    {manual ? 'Next player' : 'Skip to next'}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
  </button>
</div>
```

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck`
Expected: 0 errors (the new components are not used yet).

```bash
git add backend/frontend/src/lib/components/VisitBand.svelte backend/frontend/src/lib/components/DartSlots.svelte backend/frontend/src/lib/components/ControlBar.svelte
git commit -m "feat(ingame): visit band with celebrations, dart slots and control bar"
```

---

### Task 8: Player pieces: pills, pips, chalkboard, ATC progress, panels and rows

**Files:**
- Create in `backend/frontend/src/lib/components/`: `PlayerPill.svelte`, `LegPips.svelte`, `Chalkboard.svelte`, `AtcProgress.svelte`, `PanelShell.svelte`, `X01Panel.svelte`, `AtcPanel.svelte`, `X01Row.svelte`, `AtcRow.svelte`

**Interfaces:**
- Consumes: `X01PlayerView`, `AtcPlayerView` (Task 5), `Visit` (Task 2), `AtcCell` (Task 4).
- Produces:
  - `type PillKind = 'throwing' | 'up-next' | 'practice' | 'leading' | 'winner'` exported from `PlayerPill.svelte` (`<script module>`); props `{ kind: PillKind; small?: boolean }`
  - `LegPips` `{ total: number; won: number; active: boolean }`
  - `Chalkboard` `{ visits: Visit[]; current: { scored: number; left: number } | null; active: boolean }`
  - `AtcProgress` `{ cells: AtcCell[]; active: boolean; layout?: 'grid' | 'strip'; cellHeight?: number }`
  - `PanelShell` `{ name: string; active: boolean; solo?: boolean; pill: PillKind | null; pillInRow?: boolean; aside?: Snippet; children: Snippet }`
  - `X01Panel` `{ name: string; p: X01PlayerView; active: boolean; solo?: boolean; pill: PillKind | null; chalkboard: boolean }`
  - `AtcPanel` `{ name: string; p: AtcPlayerView; active: boolean; solo?: boolean; pill: PillKind | null }`
  - `X01Row` `{ name: string; p: X01PlayerView; active: boolean; pill: PillKind | null }`
  - `AtcRow` `{ name: string; p: AtcPlayerView; active: boolean; pill: PillKind | null }`

- [ ] **Step 1: Small pieces**

`PlayerPill.svelte`:

```svelte
<script module lang="ts">
  export type PillKind = 'throwing' | 'up-next' | 'practice' | 'leading' | 'winner'
</script>

<script lang="ts">
  let { kind, small = false }: { kind: PillKind; small?: boolean } = $props()
  const LABEL: Record<PillKind, string> = { throwing: 'Throwing', 'up-next': 'Up next', practice: 'Practice', leading: 'Leading', winner: 'Winner' }
</script>

<span class="self-start shrink-0 inline-flex items-center gap-[6px] rounded-full uppercase tracking-[0.08em] whitespace-nowrap
             {small ? 'h-[26px] px-[10px] text-[12px]' : 'h-7 px-3 text-[13px]'}
             {kind === 'throwing' || kind === 'winner' ? 'bg-accent text-accent-fg font-bold'
               : kind === 'leading' ? 'border border-line-pip text-text font-bold'
               : 'border border-line-chip text-text-dim font-semibold'}">
  {#if kind === 'leading'}
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>
    </svg>
  {/if}
  {LABEL[kind]}
</span>
```

`LegPips.svelte`:

```svelte
<script lang="ts">
  let { total, won, active }: { total: number; won: number; active: boolean } = $props()
</script>

<span class="flex gap-[6px]" role="img" aria-label="{won} {won === 1 ? 'leg' : 'legs'} won">
  {#each Array.from({ length: total }) as _, i}
    <span class="w-3 h-3 rounded-full box-border
                 {i < won ? (active ? 'bg-accent' : 'bg-text-muted') : 'border-[1.5px] border-line-pip'}"></span>
  {/each}
</span>
```

`Chalkboard.svelte`:

```svelte
<script lang="ts">
  // Scored | Left for each visit of the leg. Old "left" values are struck through;
  // the thrower's running visit is the highlighted last row.
  import type { Visit } from '$lib/visitHistory.js'

  let { visits, current, active }: {
    visits: Visit[]
    current: { scored: number; left: number } | null
    active: boolean
  } = $props()
</script>

<div class="relative mt-auto min-h-[120px] flex-1 max-h-[340px] flex flex-col box-border px-3 py-[10px] rounded-[12px] border border-line-2
            {active ? 'bg-surface-chip' : 'bg-surface-inset'}" aria-label="Chalkboard">
  <span class="absolute left-1/2 top-[10px] bottom-[10px] w-px bg-line-chip" aria-hidden="true"></span>
  <div class="grid grid-cols-2 h-7 shrink-0 items-center text-[13px] uppercase tracking-[0.1em] text-text-dim">
    <span class="text-right pr-[14px]">Scored</span><span class="pl-[14px]">Left</span>
  </div>
  <!-- Newest at the bottom; older rows scroll out of view at the top -->
  <div class="flex-1 min-h-0 flex flex-col justify-end overflow-hidden">
    {#each visits as v, i}
      {@const latest = !current && i === visits.length - 1}
      <div class="grid grid-cols-2 h-11 shrink-0 items-center font-display text-[34px] leading-none tabular-nums">
        <span class="text-right pr-[14px] font-bold {v.bust ? 'text-danger-text' : active ? 'text-ink-soft' : 'text-ink-3'}">
          {v.bust ? 'Bust' : v.scored}
        </span>
        <span class="pl-[14px] {latest && !active ? 'font-bold text-text' : 'font-semibold text-text-dim line-through'}">{v.left}</span>
      </div>
    {/each}
    {#if current}
      <div class="grid grid-cols-2 h-[46px] shrink-0 items-center rounded-[8px] bg-surface-key font-display font-bold text-[34px] leading-none tabular-nums">
        <span class="text-right pr-[14px] text-accent">{current.scored}…</span>
        <span class="pl-[14px] text-text">{current.left}</span>
      </div>
    {/if}
  </div>
</div>
```

`AtcProgress.svelte`:

```svelte
<script lang="ts">
  // ATC targets 1–20 and bull: a 7-column grid (panels) or a single strip (rows).
  import type { AtcCell } from '$lib/atc.js'

  let { cells, active, layout = 'grid', cellHeight = 36 }: {
    cells: AtcCell[]
    active: boolean
    layout?: 'grid' | 'strip'
    cellHeight?: number
  } = $props()

  const text = $derived(layout === 'strip' ? 'text-[14px] rounded-[5px]' : cellHeight >= 44 ? 'text-[18px] rounded-[7px]' : 'text-[16px] rounded-[7px]')
</script>

<div class="grid {layout === 'grid' ? 'grid-cols-7 gap-[5px]' : 'gap-[3px]'}"
  style:grid-template-columns={layout === 'strip' ? `repeat(${cells.length}, minmax(0, 1fr))` : undefined}>
  {#each cells as c, i (i)}
    <span style:height="{cellHeight}px"
      class="box-border flex items-center justify-center font-display {text}
             {c.state === 'hit' ? (active ? 'bg-accent text-accent-fg font-bold' : 'bg-text-dim text-accent-fg font-bold')
               : c.state === 'current' ? (active ? 'border-2 border-accent text-accent font-bold' : 'border-2 border-dashed border-text text-text font-bold')
               : (active ? 'bg-surface-chip text-text-dim' : 'bg-surface-inset text-text-dim')}">
      {layout === 'strip' ? c.short : c.label}
    </span>
  {/each}
</div>
```

- [ ] **Step 2: Panel shell and panels**

`PanelShell.svelte`:

```svelte
<script lang="ts">
  // Frame of a player panel (1–2 players): avatar, name, optional aside (leg pips), pill.
  import type { Snippet } from 'svelte'
  import PlayerPill, { type PillKind } from './PlayerPill.svelte'

  let { name, active, solo = false, pill, pillInRow = false, aside, children }: {
    name: string
    active: boolean
    solo?: boolean
    pill: PillKind | null
    /** Put the pill at the end of the name row (ATC and solo) instead of under it. */
    pillInRow?: boolean
    aside?: Snippet
    children: Snippet
  } = $props()

  const initial = $derived(name.trim()[0]?.toUpperCase() ?? '?')
</script>

<section aria-label="{name}, {active ? 'throwing' : 'waiting'}"
  class="{solo ? 'w-[400px] shrink-0 p-6 gap-[18px]' : 'flex-1 p-7 gap-[14px]'} min-w-0 min-h-0 box-border rounded-[18px] flex flex-col overflow-hidden
         {active ? 'bg-surface-active border-2 border-accent' : 'bg-surface-panel border border-line-2'}">
  <div class="flex items-center gap-3 min-w-0">
    <span class="w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-[17px]
                 {active ? 'bg-accent text-accent-fg' : 'bg-line-chip text-text'}">{initial}</span>
    <span class="text-[22px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}</span>
    <span class="ml-auto flex items-center gap-3 shrink-0">
      {@render aside?.()}
      {#if pill && pillInRow}<PlayerPill kind={pill} />{/if}
    </span>
  </div>
  {#if pill && !pillInRow}<PlayerPill kind={pill} />{/if}
  {@render children()}
</section>
```

`X01Panel.svelte`:

```svelte
<script lang="ts">
  import PanelShell from './PanelShell.svelte'
  import LegPips from './LegPips.svelte'
  import Chalkboard from './Chalkboard.svelte'
  import type { PillKind } from './PlayerPill.svelte'
  import type { X01PlayerView } from '$lib/playerStats.js'

  let { name, p, active, solo = false, pill, chalkboard }: {
    name: string
    p: X01PlayerView
    active: boolean
    solo?: boolean
    pill: PillKind | null
    chalkboard: boolean
  } = $props()
</script>

<PanelShell {name} {active} {solo} {pill} pillInRow={solo}>
  {#snippet aside()}
    {#if !solo}<LegPips total={p.firstTo} won={p.legsWon} {active} />{/if}
  {/snippet}

  <div class="flex flex-col gap-[6px]">
    {#if solo}<span class="text-[12px] uppercase tracking-[0.1em] text-text-muted">Left</span>{/if}
    <span class="font-display font-bold text-[min(220px,24vh)] leading-[0.8] tracking-[-0.02em] tabular-nums
                 {active ? 'text-text' : 'text-ink-3'}">{p.remaining}</span>
  </div>

  {#if !p.opened}
    <span class="text-[13px] uppercase tracking-[0.1em] text-text-muted">Needs to open</span>
  {:else if !active && p.canFinish}
    <span class="flex items-baseline gap-[10px]">
      <span class="text-[12px] uppercase tracking-[0.1em] text-text-dim">Can finish</span>
      <span class="font-display font-bold text-[28px] leading-none text-ink-3">{p.canFinish}</span>
    </span>
  {/if}

  <div class="flex gap-9">
    {#each [{ label: solo ? 'Leg avg' : 'Avg', value: solo ? p.legAvg : p.avg }, { label: 'Darts', value: String(p.darts) }] as s}
      <span class="flex flex-col gap-1">
        <span class="text-[13px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">{s.label}</span>
        <span class="font-display font-bold text-[44px] leading-none tabular-nums {active ? 'text-text' : 'text-ink-2'}">{s.value}</span>
      </span>
    {/each}
  </div>

  {#if chalkboard}<Chalkboard visits={p.visits} current={p.current} {active} />{/if}
</PanelShell>
```

`AtcPanel.svelte`:

```svelte
<script lang="ts">
  import PanelShell from './PanelShell.svelte'
  import AtcProgress from './AtcProgress.svelte'
  import type { PillKind } from './PlayerPill.svelte'
  import type { AtcPlayerView } from '$lib/playerStats.js'

  let { name, p, active, solo = false, pill }: {
    name: string
    p: AtcPlayerView
    active: boolean
    solo?: boolean
    pill: PillKind | null
  } = $props()
</script>

<PanelShell {name} {active} {solo} {pill} pillInRow>
  <div class="flex flex-col gap-[6px]">
    <span class="text-[12px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">Target</span>
    <span class="font-display font-bold text-[min(220px,24vh)] leading-[0.8] tracking-[-0.02em]
                 {active ? 'text-accent' : 'text-ink-3'}">{p.target}</span>
  </div>

  <div class="flex flex-col gap-[10px]">
    <span class="text-[13px] text-text-muted">
      <strong class="{active ? 'text-text' : 'text-ink-2'}">{p.done}</strong> of {p.total} done
    </span>
    <AtcProgress cells={p.cells} {active} cellHeight={solo ? 44 : 36} />
  </div>

  <div class="mt-auto flex gap-7 text-[15px] text-text-muted">
    <span>Darts <strong class="{active ? 'text-text' : 'text-ink-2'}">{p.darts}</strong></span>
    <span>Hit rate <strong class="{active ? 'text-text' : 'text-ink-2'}">{p.hitRate}</strong></span>
  </div>
</PanelShell>
```

- [ ] **Step 3: Party rows**

`X01Row.svelte`:

```svelte
<script lang="ts">
  import LegPips from './LegPips.svelte'
  import PlayerPill, { type PillKind } from './PlayerPill.svelte'
  import type { X01PlayerView } from '$lib/playerStats.js'

  let { name, p, active, pill }: { name: string; p: X01PlayerView; active: boolean; pill: PillKind | null } = $props()
  const initial = $derived(name.trim()[0]?.toUpperCase() ?? '?')
</script>

<section aria-label="{name}, {active ? 'throwing' : 'waiting'}"
  class="h-full min-h-0 box-border rounded-[16px] px-6 grid grid-cols-[200px_170px_minmax(0,1fr)] items-center gap-5 overflow-hidden
         {active ? 'py-5 bg-surface-active border-2 border-accent' : 'py-4 bg-surface-panel border border-line-2'}">
  <div class="flex flex-col gap-[10px] min-w-0">
    <span class="flex items-center gap-3 min-w-0">
      <span class="w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-[17px]
                   {active ? 'bg-accent text-accent-fg' : 'bg-line-chip text-text'}">{initial}</span>
      <span class="text-[21px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}</span>
    </span>
    {#if pill}<PlayerPill kind={pill} small />{/if}
  </div>

  <span class="font-display font-bold leading-[0.85] tabular-nums
               {active ? 'text-[min(120px,13vh)] text-text' : 'text-[min(88px,9vh)] text-ink-3'}">{p.remaining}</span>

  <div class="grid grid-cols-[minmax(0,1fr)_90px_90px_auto] items-center gap-5 min-w-0">
    <span class="flex flex-col gap-1 min-w-0">
      <span class="text-[12px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">Can finish</span>
      {#if !p.opened}
        <span class="text-[14px] text-text-dim">Needs to open</span>
      {:else if p.canFinish}
        <span class="font-display font-bold leading-none whitespace-nowrap truncate
                     {active ? 'text-[34px] text-accent' : 'text-[24px] text-ink-3'}">{p.canFinish}</span>
      {:else}
        <span class="text-[14px] text-text-dim">No finish yet</span>
      {/if}
    </span>
    {#each [{ label: 'Last', value: p.last }, { label: 'Avg', value: p.avg }] as s}
      <span class="flex flex-col gap-1">
        <span class="text-[12px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">{s.label}</span>
        <span class="font-display font-bold leading-none tabular-nums {active ? 'text-[34px] text-text' : 'text-[24px] text-ink-2'}">{s.value}</span>
      </span>
    {/each}
    <LegPips total={p.firstTo} won={p.legsWon} {active} />
  </div>
</section>
```

`AtcRow.svelte`:

```svelte
<script lang="ts">
  import AtcProgress from './AtcProgress.svelte'
  import PlayerPill, { type PillKind } from './PlayerPill.svelte'
  import type { AtcPlayerView } from '$lib/playerStats.js'

  let { name, p, active, pill }: { name: string; p: AtcPlayerView; active: boolean; pill: PillKind | null } = $props()
  const initial = $derived(name.trim()[0]?.toUpperCase() ?? '?')
</script>

<section aria-label="{name}, {active ? 'throwing' : 'waiting'}"
  class="h-full min-h-0 box-border rounded-[16px] px-6 py-5 grid grid-cols-[210px_150px_minmax(0,1fr)] items-center gap-5 overflow-hidden
         {active ? 'bg-surface-active border-2 border-accent' : 'bg-surface-panel border border-line-2'}">
  <div class="flex flex-col gap-[10px] min-w-0">
    <span class="flex items-center gap-3 min-w-0">
      <span class="w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-[17px]
                   {active ? 'bg-accent text-accent-fg' : 'bg-line-chip text-text'}">{initial}</span>
      <span class="text-[21px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}</span>
    </span>
    {#if pill}<PlayerPill kind={pill} small />{/if}
  </div>

  <span class="flex flex-col gap-1">
    <span class="text-[12px] uppercase tracking-[0.1em] {active ? 'text-text-muted' : 'text-text-dim'}">Target</span>
    <span class="font-display font-bold text-[min(104px,11vh)] leading-[0.85] {active ? 'text-accent' : 'text-ink-3'}">{p.target}</span>
  </span>

  <div class="flex flex-col gap-3 min-w-0">
    <AtcProgress cells={p.cells} {active} layout="strip" cellHeight={32} />
    <span class="flex gap-6 text-[14px] {active ? 'text-text-muted' : 'text-text-dim'}">
      <span>Darts <strong class="{active ? 'text-text' : 'text-ink-2'}">{p.darts}</strong></span>
      <span>Hit rate <strong class="{active ? 'text-text' : 'text-ink-2'}">{p.hitRate}</strong></span>
      <span><strong class="{active ? 'text-text' : 'text-ink-2'}">{p.done}</strong> of {p.total} done</span>
    </span>
  </div>
</section>
```

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck`
Expected: 0 errors.

```bash
git add backend/frontend/src/lib/components/PlayerPill.svelte backend/frontend/src/lib/components/LegPips.svelte backend/frontend/src/lib/components/Chalkboard.svelte backend/frontend/src/lib/components/AtcProgress.svelte backend/frontend/src/lib/components/PanelShell.svelte backend/frontend/src/lib/components/X01Panel.svelte backend/frontend/src/lib/components/AtcPanel.svelte backend/frontend/src/lib/components/X01Row.svelte backend/frontend/src/lib/components/AtcRow.svelte
git commit -m "feat(ingame): player panels, party rows, chalkboard and ATC progress"
```

---

### Task 9: Header, settings drawer and sounds

**Files:**
- Rewrite: `backend/frontend/src/lib/components/GameHeader.svelte`
- Create: `backend/frontend/src/lib/components/SettingsDrawer.svelte`, `backend/frontend/src/lib/sounds.ts`
- Delete: `backend/frontend/src/lib/components/GameSettingsPanel.svelte`
- Modify: `backend/frontend/src/routes/GameDisplay.svelte` (header props, sounds)

**Interfaces:**
- Consumes: `GameSettings` (Task 1).
- Produces:
  - `GameHeader` props `{ title: string; meta?: string; sessionId: string; boardId: string | null; bmStatus: Snapshot['bmStatus']; viewMode: 'board' | 'entry'; canEnd: boolean; showViewToggle?: boolean; settings: GameSettings (bindable); onleave: () => void; onend: () => void; onviewmode: (m: 'board' | 'entry') => void }` (`subtitle` is renamed `meta`)
  - `SettingsDrawer` props `{ settings: GameSettings (bindable); onclose: () => void }`
  - `createSounds(volume: () => number): { hit(): void; miss(): void; switchPlayer(): void; bust(): void }`

- [ ] **Step 1: Sounds**

Create `backend/frontend/src/lib/sounds.ts`:

```ts
// Short Web Audio tones; silent where there is no AudioContext.
export function createSounds(volume: () => number) {
  let ctx: AudioContext | null = null

  function tone(freq: number, dur: number, type: OscillatorType, vol: number) {
    if (typeof AudioContext === 'undefined') return
    const gainValue = vol * volume()
    if (gainValue <= 0) return
    ctx ??= new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(gainValue, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start()
    osc.stop(ctx.currentTime + dur)
  }

  return {
    hit: () => tone(880, 0.12, 'sine', 0.3),
    miss: () => tone(200, 0.18, 'sawtooth', 0.18),
    switchPlayer: () => tone(440, 0.08, 'sine', 0.2),
    bust: () => tone(150, 0.35, 'square', 0.16),
  }
}
```

- [ ] **Step 2: Settings drawer**

Create `backend/frontend/src/lib/components/SettingsDrawer.svelte`:

```svelte
<script lang="ts">
  // Game settings as a drawer on the right, below the header (Settings-InGame board).
  import type { GameSettings } from '$lib/gameSettings.js'

  let { settings = $bindable(), onclose }: { settings: GameSettings; onclose: () => void } = $props()

  const display = [
    { key: 'checkoutSuggestions', label: 'Checkout suggestions', sub: 'In the dart slots when you can finish' },
    { key: 'visitSum', label: 'Visit sum', sub: 'The running total under the board' },
    { key: 'chalkboard', label: 'Chalkboard', sub: 'Scored and left for every visit' },
  ] as const
  const sounds = [
    { key: 'soundHit', label: 'Hit' },
    { key: 'soundMiss', label: 'Miss' },
    { key: 'soundSwitch', label: 'Player switch' },
    { key: 'soundBust', label: 'Bust' },
  ] as const

  let panel: HTMLDivElement | undefined = $state()
  $effect(() => { panel?.focus() })
</script>

<svelte:window onkeydown={e => { if (e.key === 'Escape') onclose() }} />

<div role="presentation" class="fixed inset-x-0 top-16 bottom-0 z-40 bg-[rgba(8,9,7,0.62)]" onclick={onclose}></div>

<div bind:this={panel} tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="game-settings-title"
  class="fixed top-16 right-0 bottom-0 z-50 w-[460px] max-w-full box-border px-7 pt-5 pb-6 flex flex-col overflow-y-auto
         bg-surface-active border-l border-line-2 [box-shadow:-24px_0_48px_rgba(0,0,0,.45)] outline-none">
  <div class="h-12 shrink-0 flex items-center justify-between">
    <h2 id="game-settings-title" class="m-0 font-display font-bold text-[28px] uppercase">Game settings</h2>
    <button type="button" onclick={onclose} aria-label="Close settings"
      class="w-11 h-11 -mr-2 flex items-center justify-center bg-transparent border-0 text-ink-2 cursor-pointer">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </div>

  <section class="py-[18px] border-t border-line-2 flex flex-col gap-4">
    <h3 class="m-0 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-dim">Display</h3>
    {#each display as row (row.key)}
      <div class="flex items-center justify-between gap-4">
        <span class="flex flex-col gap-[2px]">
          <span id="setting-{row.key}" class="text-[15px] text-text">{row.label}</span>
          <span class="text-[13px] text-text-dim">{row.sub}</span>
        </span>
        <button type="button" role="switch" aria-checked={settings[row.key]} aria-labelledby="setting-{row.key}"
          onclick={() => settings[row.key] = !settings[row.key]}
          class="relative w-12 h-7 shrink-0 rounded-full border-0 p-0 cursor-pointer transition-colors
                 {settings[row.key] ? 'bg-accent' : 'bg-line-chip'}">
          <span class="absolute top-[3px] left-[3px] w-[22px] h-[22px] rounded-full transition-transform
                       {settings[row.key] ? 'translate-x-5 bg-accent-fg' : 'bg-text'}"></span>
        </button>
      </div>
    {/each}
  </section>

  <section class="py-[18px] border-t border-line-2 flex flex-col gap-4">
    <h3 class="m-0 text-[12px] font-semibold uppercase tracking-[0.1em] text-text-dim">Sound effects</h3>
    <label class="flex items-center gap-3">
      <span class="text-[15px] w-20">Volume</span>
      <input type="range" min="0" max="100" step="5" value={Math.round(settings.volume * 100)}
        oninput={e => settings.volume = Number(e.currentTarget.value) / 100}
        class="flex-1 accent-accent" />
      <span class="font-mono text-[13px] text-text-muted w-11 text-right">{Math.round(settings.volume * 100)}%</span>
    </label>
    <div class="grid grid-cols-2 gap-x-4">
      {#each sounds as row (row.key)}
        <label class="h-11 flex items-center gap-3 cursor-pointer text-[15px]">
          <input type="checkbox" bind:checked={settings[row.key]} class="w-6 h-6 accent-accent" />
          {row.label}
        </label>
      {/each}
    </div>
  </section>

  <p class="mt-auto mb-0 text-[13px] text-text-dim">Saved on this device. Changes apply right away.</p>
</div>
```

- [ ] **Step 3: Header**

Replace `backend/frontend/src/lib/components/GameHeader.svelte` with:

```svelte
<script lang="ts">
  // Top bar of a live game: leave, title and meta, board/entry toggle, end, live, board, settings.
  import BoardStatusPanel from '$lib/components/BoardStatusPanel.svelte'
  import SettingsDrawer from '$lib/components/SettingsDrawer.svelte'
  import type { GameSettings } from '$lib/gameSettings.js'
  import type { Snapshot } from '$lib/ws.js'

  let {
    title, meta = '', sessionId, boardId, bmStatus, viewMode, canEnd, showViewToggle = true,
    settings = $bindable(), onleave, onend, onviewmode,
  }: {
    title: string
    meta?: string
    sessionId: string
    boardId: string | null
    bmStatus: Snapshot['bmStatus']
    viewMode: 'board' | 'entry'
    canEnd: boolean
    showViewToggle?: boolean
    settings: GameSettings
    onleave: () => void
    onend: () => void
    onviewmode: (m: 'board' | 'entry') => void
  } = $props()

  let showSettings = $state(false)
  const outline = 'h-11 flex items-center gap-2 rounded-[10px] border border-line-strong bg-transparent text-[14px] font-medium cursor-pointer shrink-0'
</script>

<header class="h-16 shrink-0 box-border px-7 flex items-center gap-6 border-b border-line bg-surface-1">
  <button type="button" onclick={onleave} class="{outline} pl-[10px] pr-[14px] text-ink-2">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
    Leave
  </button>

  <div class="flex items-baseline gap-3 min-w-0">
    <h1 class="m-0 font-display font-bold text-[26px] uppercase tracking-[0.04em] leading-none shrink-0">{title}</h1>
    {#if meta}<span class="text-[14px] text-text-muted truncate">{meta}</span>{/if}
  </div>

  <div class="ml-auto flex items-center gap-4 shrink-0">
    {#if showViewToggle}
      <div class="flex items-center p-[3px] bg-bg rounded-[10px] border border-line-2" role="group" aria-label="Dart entry">
        {#each ([{ m: 'board', label: 'Board' }, { m: 'entry', label: 'Enter' }] as const) as o}
          <button type="button" onclick={() => onviewmode(o.m)} aria-pressed={viewMode === o.m}
            class="h-9 px-3 rounded-[7px] text-[14px] font-medium border-0 cursor-pointer transition-colors
                   {viewMode === o.m ? 'bg-surface-key text-text' : 'bg-transparent text-text-dim hover:text-ink-2'}">{o.label}</button>
        {/each}
      </div>
    {/if}

    {#if canEnd}
      <button type="button" onclick={onend} class="{outline} px-[14px] text-live-text">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
        End
      </button>
    {/if}

    <span class="h-[30px] px-3 inline-flex items-center gap-2 rounded-full bg-live-soft text-live-text text-[13px] font-bold tracking-[0.1em]">
      <span class="w-2 h-2 rounded-full bg-live"></span>LIVE
    </span>

    {#if boardId !== null}
      <BoardStatusPanel {sessionId} {bmStatus} />
    {/if}

    <button type="button" onclick={() => showSettings = !showSettings}
      aria-label="Game settings" aria-haspopup="dialog" aria-expanded={showSettings}
      class="w-11 h-11 flex items-center justify-center rounded-[10px] border border-line-strong cursor-pointer transition-colors
             {showSettings ? 'bg-surface-key text-text' : 'bg-transparent text-ink-2 hover:text-text'}">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  </div>
</header>

{#if showSettings}
  <SettingsDrawer bind:settings onclose={() => showSettings = false} />
{/if}
```

Delete `backend/frontend/src/lib/components/GameSettingsPanel.svelte`.

- [ ] **Step 4: Keep GameDisplay compiling**

In `backend/frontend/src/routes/GameDisplay.svelte`:
- In `<GameHeader …>` rename the prop `subtitle=` to `meta=`.
- Replace the whole `// ── Sound effects (Web Audio API)` block (from `let audioCtx` through `function soundSwitch() …`) with:

```ts
  import { createSounds } from '../lib/sounds.js'
  const sounds = createSounds(() => settings.volume)
```

  (move the `import` line up to the other imports).
- In `playSoundEvents`, replace `soundHit()` with `sounds.hit()`, `soundMiss()` with `sounds.miss()`, `soundSwitch()` with `sounds.switchPlayer()`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test`
Expected: 0 errors; all tests pass. In the browser (Task 10 setup): the header matches the design; the cog opens the drawer from the right below the header with a dark scrim; Escape, the X and the scrim close it; toggles and the volume change and survive a reload.

- [ ] **Step 6: Commit**

```bash
git add -A backend/frontend/src/lib/components/GameHeader.svelte backend/frontend/src/lib/components/SettingsDrawer.svelte backend/frontend/src/lib/components/GameSettingsPanel.svelte backend/frontend/src/lib/sounds.ts backend/frontend/src/routes/GameDisplay.svelte
git commit -m "feat(ingame): redesigned header and settings drawer with volume and bust sound"
```

---

### Task 10: Game screen layouts

**Files:**
- Rewrite: `backend/frontend/src/routes/GameDisplay.svelte`
- Rewrite: `backend/frontend/src/lib/gameViews/index.ts`
- Delete: `backend/frontend/src/lib/components/PlayerCard.svelte`, `PlayerListRow.svelte`, `CorrectionPanel.svelte`, `backend/frontend/src/lib/gameViews/x01.svelte`, `atc.svelte`, `fallback.svelte`, `backend/frontend/src/lib/__tests__/CorrectionPanel.test.ts`

**Interfaces:**
- Consumes everything above: `loadSettings`/`saveSettings`, `createSounds`, `emptyHistory`/`trackVisits`, `x01Slots`/`atcSlots`, `x01Band`/`atcBand`/`isBigDart`, `x01Player`/`atcPlayer`, `atcTargetSegment`/`atcLeaders`, `labelToSegment`, and the components from Tasks 6–9.
- Produces: `GameView = { title: string; meta: (game, playerCount) => string }`, `getGameView(gameId)`.

- [ ] **Step 1: Game views**

Replace `backend/frontend/src/lib/gameViews/index.ts` with:

```ts
// Per-game header text. Panels, rows and slots are picked by game id in GameDisplay.
import { x01Meta, atcMeta } from './meta.js'

export interface GameView {
  title: string
  meta: (game: Record<string, unknown>, playerCount: number) => string
}

export const gameViews: Record<string, GameView> = {
  atc: { title: 'Around the Clock', meta: atcMeta },
  x01: { title: 'X01', meta: x01Meta },
}

const fallbackView: GameView = { title: 'Game', meta: () => '' }

export function getGameView(gameId: string): GameView {
  return gameViews[gameId] ?? fallbackView
}
```

- [ ] **Step 2: Rewrite GameDisplay**

Replace `backend/frontend/src/routes/GameDisplay.svelte` with:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import ConfirmModal from '../lib/components/ConfirmModal.svelte'
  import { createSessionStore, type Snapshot } from '../lib/ws.js'
  import { getGameView } from '../lib/gameViews/index.js'
  import DartBoard from '../lib/components/DartBoard.svelte'
  import DartEntryPanel from '../lib/components/DartEntryPanel.svelte'
  import GameHeader from '../lib/components/GameHeader.svelte'
  import BullOffPanel, { type BullOffView } from '../lib/components/BullOffPanel.svelte'
  import BoardLegend from '../lib/components/BoardLegend.svelte'
  import VisitBand from '../lib/components/VisitBand.svelte'
  import DartSlots from '../lib/components/DartSlots.svelte'
  import ControlBar from '../lib/components/ControlBar.svelte'
  import X01Panel from '../lib/components/X01Panel.svelte'
  import AtcPanel from '../lib/components/AtcPanel.svelte'
  import X01Row from '../lib/components/X01Row.svelte'
  import AtcRow from '../lib/components/AtcRow.svelte'
  import type { PillKind } from '../lib/components/PlayerPill.svelte'
  import { loadSettings, saveSettings, type GameSettings } from '../lib/gameSettings.js'
  import { createSounds } from '../lib/sounds.js'
  import { emptyHistory, trackVisits, type VisitHistory } from '../lib/visitHistory.js'
  import { x01Slots, atcSlots, type ThrownDart } from '../lib/dartSlots.js'
  import { x01Band, atcBand, isBigDart } from '../lib/visitBand.js'
  import { x01Player, atcPlayer } from '../lib/playerStats.js'
  import { atcTargetSegment, atcLeaders } from '../lib/atc.js'
  import { labelToSegment, type Segment } from '../lib/dartUtils.js'

  // ── Settings and sound ────────────────────────────────────────────────────
  let settings = $state<GameSettings>(loadSettings(typeof localStorage === 'undefined' ? null : localStorage))
  $effect(() => { saveSettings(localStorage, settings) })
  const sounds = createSounds(() => settings.volume)

  // ── Session ───────────────────────────────────────────────────────────────
  let sessionId = $state('')
  let sessionStore: ReturnType<typeof createSessionStore> | null = null
  let snapshot = $state<Snapshot | null>(null)
  let history = $state<VisitHistory>(emptyHistory())
  let unsubSnap: (() => void) | null = null

  let viewMode = $state<'board' | 'entry'>('board')
  let viewModeSetByUser = false
  let showEndConfirm = $state(false)
  /** Dart open in the correction popover; also highlighted on the board. */
  let correcting = $state<number | null>(null)

  onMount(() => {
    sessionId = window.location.hash.match(/\/session\/([^/]+)/)?.[1] ?? ''
    if (!sessionId) return
    sessionStore = createSessionStore(sessionId)
    unsubSnap = sessionStore.snapshot.subscribe(snap => {
      if (!snap) { snapshot = null; return }
      // Boardless sessions start on the keypad (once)
      if (!viewModeSetByUser && snap.boardId === null) { viewMode = 'entry'; viewModeSetByUser = true }
      if (snapshot) playSounds(snapshot.game, snap.game)
      history = trackVisits(history, snap.game)
      snapshot = snap
    })
  })
  onDestroy(() => { unsubSnap?.(); sessionStore?.destroy() })

  function playSounds(before: Record<string, unknown>, after: Record<string, unknown>) {
    const oldCount = (before.currentVisitDarts as unknown[] | undefined)?.length ?? 0
    const now = (after.currentVisitDarts as ThrownDart[] | undefined) ?? []
    if (after.bustThisVisit === true && before.bustThisVisit !== true) {
      if (settings.soundBust) sounds.bust()
    } else if (now.length > oldCount) {
      const i = now.length - 1
      const hits = after.currentVisitHits as boolean[] | undefined
      const hit = hits ? hits[i] === true : (now[i]?.score ?? 0) > 0
      if (hit && settings.soundHit) sounds.hit()
      if (!hit && settings.soundMiss) sounds.miss()
    } else if (after.currentPlayer !== before.currentPlayer && settings.soundSwitch) {
      sounds.switchPlayer()
    }
  }

  // ── Game state ────────────────────────────────────────────────────────────
  const gameId = $derived(snapshot?.gameId ?? '')
  const isX01 = $derived(gameId === 'x01')
  const boardId = $derived(snapshot?.boardId ?? null)
  const players = $derived(snapshot?.players ?? [])
  const game = $derived(snapshot?.game ?? {})
  const view = $derived(getGameView(gameId))
  const currentPlayer = $derived((game.currentPlayer as number | undefined) ?? 0)
  const winner = $derived((game.winner as number | null | undefined) ?? null)
  const isActive = $derived(winner === null)
  const darts = $derived((game.currentVisitDarts as ThrownDart[] | undefined) ?? [])
  const hits = $derived((game.currentVisitHits as boolean[] | undefined) ?? [])
  const bust = $derived(game.bustThisVisit === true)
  const bullOff = $derived(game.phase === 'bulloff' ? (game.bullOff as BullOffView | undefined) ?? null : null)
  const layout = $derived(players.length === 1 ? 'solo' : players.length === 2 ? 'duel' : 'party')
  const nextPlayer = $derived((currentPlayer + 1) % Math.max(players.length, 1))

  const x01Players = $derived(isX01
    ? players.map((_, i) => x01Player(game, i, history, { active: i === currentPlayer && isActive, suggest: settings.checkoutSuggestions }))
    : [])
  const atcPlayers = $derived(isX01 ? [] : players.map((_, i) => atcPlayer(game, i)))
  const leaders = $derived(isX01 ? [] : atcLeaders((game.hitCounts as number[] | undefined) ?? []))

  // ── Center column ─────────────────────────────────────────────────────────
  const outMode = $derived(((game.config as { outMode?: string } | undefined)?.outMode ?? 'double') as 'straight' | 'double' | 'master')
  const slots = $derived(isX01
    ? x01Slots({
        darts, outMode, bust,
        remaining: x01Players[currentPlayer]?.remaining ?? 0,
        opened: x01Players[currentPlayer]?.opened ?? true,
        suggest: settings.checkoutSuggestions && isActive,
      })
    : atcSlots({ darts, hits, target: isActive ? atcPlayers[currentPlayer]?.target ?? null : null }))

  const hitCount = $derived((game.hitCounts as number[] | undefined)?.[currentPlayer] ?? 0)
  const band = $derived(isX01
    ? x01Band({ darts, left: x01Players[currentPlayer]?.remaining ?? 0, bust })
    : atcBand({
        dartCount: darts.length,
        advanced: Math.max(0, hitCount - (history.start[currentPlayer] ?? hitCount)),
        target: atcPlayers[currentPlayer]?.target ?? '',
      }))
  const popIndex = $derived(isX01 && darts.length && isBigDart(darts[darts.length - 1]?.score ?? 0) ? darts.length - 1 : null)

  const sequence = $derived((game.sequence as number[] | undefined) ?? [])
  const targets = $derived((game.targets as number[] | undefined) ?? [])
  const checkoutTargets = $derived(slots.filter(s => s.kind === 'suggested-next' || s.kind === 'suggested-later').map(s => s.label))
  const boardTarget = $derived(!isX01 && isActive ? atcTargetSegment(sequence, targets[currentPlayer]) : null)
  const boardNext = $derived(!isX01 && isActive && layout === 'duel' ? atcTargetSegment(sequence, targets[nextPlayer]) : null)
  const markers = $derived(!isX01 && isActive && layout === 'party'
    ? players.map((p, i) => ({
        initial: p.name.trim()[0]?.toUpperCase() ?? '?',
        segment: atcTargetSegment(sequence, targets[i]) ?? 0,
        isActive: i === currentPlayer,
      })).filter(m => m.segment > 0)
    : [])
  const legend = $derived.by((): { label: string; kind: 'current' | 'next' | 'others' }[] => {
    if (isX01 || !isActive || layout === 'solo') return []
    if (layout === 'party') return [{ label: 'Current target', kind: 'current' }, { label: "Others' targets", kind: 'others' }]
    return [
      { label: `${players[currentPlayer]?.name} · ${atcPlayers[currentPlayer]?.target}`, kind: 'current' },
      { label: `${players[nextPlayer]?.name} · ${atcPlayers[nextPlayer]?.target}`, kind: 'next' },
    ]
  })

  function pillFor(i: number, rows: boolean): PillKind | null {
    if (winner === i) return 'winner'
    if (!isActive) return null
    if (layout === 'solo') return 'practice'
    if (i === currentPlayer) return 'throwing'
    if (rows && leaders.includes(i)) return 'leading'
    return i === nextPlayer ? 'up-next' : null
  }

  // Party rows: the X01 thrower's row is taller; rows keep a minimum height and scroll
  const rowTemplate = $derived(players
    .map((_, i) => (isX01 && isActive && i === currentPlayer ? 'minmax(150px, 1.55fr)' : 'minmax(96px, 1fr)'))
    .join(' '))

  // ── Actions ───────────────────────────────────────────────────────────────
  const send = (action: Record<string, unknown>) => sessionStore?.send(action)
  const undo = () => send({ type: 'undo_dart' })
  const next = () => send({ type: 'takeout' })
  const addManualDart = (segment: Segment) => send({ type: 'add_dart', segment })
  // Clicking the board keeps the exact spot, so the dart shows where it landed
  const addBoardDart = (hit: { segment: Segment; coords: { x: number; y: number } }) =>
    send({ type: 'add_dart', segment: hit.segment, coords: hit.coords })
  const correct = (dartIndex: number, label: string) =>
    send({ type: 'correct_dart', visitIndex: dartIndex, segment: labelToSegment(label) })
  // Any dart of the open visit can be dragged on the board to correct it
  const moveDart = (dartIndex: number, hit: { segment: Segment; coords: { x: number; y: number } }) =>
    send({ type: 'correct_dart', visitIndex: dartIndex, segment: hit.segment, coords: hit.coords })

  function setViewMode(m: 'board' | 'entry') {
    viewMode = m
    viewModeSetByUser = true
  }

  async function endSession() {
    if (!sessionId) return
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    push('/')
  }
</script>

{#snippet center(variant: 'solo' | 'duel' | 'party')}
  {#if viewMode === 'entry'}
    <div class="flex-1 min-h-0 overflow-y-auto">
      <DartEntryPanel onDart={isActive ? addManualDart : () => {}} dartCount={darts.length} />
    </div>
  {:else}
    <!-- The board takes the height the column has left (capped by its width) -->
    <div class="flex-1 min-h-0 w-full [container-type:size] flex items-center justify-center">
      <div class="aspect-square" style="width: min(100cqw, 100cqh)">
        <DartBoard {darts} dim={!isX01} target={boardTarget} nextTarget={boardNext} playerMarkers={markers}
          checkoutTargets={isActive ? checkoutTargets : []}
          onBoardClick={isActive ? addBoardDart : undefined}
          selectedDart={correcting} onDartMove={isActive ? moveDart : undefined} />
      </div>
    </div>
    {#if legend.length}<BoardLegend items={legend} />{/if}
  {/if}

  {#if variant === 'solo'}
    <div class="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-[10px] items-start">
      <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} />
      {#if settings.visitSum}<VisitBand {band} compact />{/if}
    </div>
  {:else}
    {#if settings.visitSum}<VisitBand {band} />{/if}
    <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} />
  {/if}

  <ControlBar canUndo={isActive && darts.length > 0} manual={boardId === null} onUndo={undo} onNext={next} />
{/snippet}

{#snippet panel(i: number)}
  {#if isX01}
    <X01Panel name={players[i]?.name ?? ''} p={x01Players[i]} active={i === currentPlayer && isActive}
      solo={layout === 'solo'} pill={pillFor(i, false)} chalkboard={settings.chalkboard} />
  {:else}
    <AtcPanel name={players[i]?.name ?? ''} p={atcPlayers[i]} active={i === currentPlayer && isActive}
      solo={layout === 'solo'} pill={pillFor(i, false)} />
  {/if}
{/snippet}

<div class="flex flex-col h-screen bg-bg text-text overflow-hidden">
  {#if !snapshot}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-text-muted text-lg">Connecting…</span>
    </div>
  {:else}
    <GameHeader
      title={bullOff ? 'Bull-off' : view.title}
      meta={bullOff ? `Who throws first in ${view.title}` : view.meta(game, players.length)}
      showViewToggle={!bullOff}
      {sessionId} {boardId} bmStatus={snapshot.bmStatus} {viewMode}
      canEnd={winner === null}
      bind:settings
      onleave={() => push('/')}
      onend={() => showEndConfirm = true}
      onviewmode={setViewMode}
    />

    {#if bullOff}
      <BullOffPanel {players} {bullOff} manual={boardId === null} {send} />

    {:else if layout === 'solo'}
      <main class="flex-grow min-h-0 box-border px-7 py-6 flex gap-6">
        {@render panel(0)}
        <div class="flex-1 min-w-[380px] min-h-0 flex flex-col gap-3">{@render center('solo')}</div>
      </main>

    {:else if layout === 'duel'}
      <main class="flex-grow min-h-0 box-border px-7 py-6 flex gap-6">
        {@render panel(0)}
        <div class="w-[560px] shrink-0 min-h-0 flex flex-col gap-3">{@render center('duel')}</div>
        {@render panel(1)}
      </main>

    {:else}
      <main class="flex-grow min-h-0 box-border px-7 py-6 flex gap-6">
        <div class="flex-1 min-w-0 min-h-0 grid gap-3 overflow-y-auto" style:grid-template-rows={rowTemplate}>
          {#each players as player, i (i)}
            {#if isX01}
              <X01Row name={player.name} p={x01Players[i]} active={i === currentPlayer && isActive} pill={pillFor(i, true)} />
            {:else}
              <AtcRow name={player.name} p={atcPlayers[i]} active={i === currentPlayer && isActive} pill={pillFor(i, true)} />
            {/if}
          {/each}
        </div>
        <aside class="w-[480px] shrink-0 min-h-0 flex flex-col gap-3" aria-label="Board">{@render center('party')}</aside>
      </main>
    {/if}

    <!-- Winner overlay (unchanged; a designed win state is out of scope) -->
    {#if winner !== null}
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="rounded-[18px] px-10 py-8 text-center pointer-events-auto
                    border border-line bg-[rgba(15,16,14,0.92)] [box-shadow:0_24px_60px_rgba(0,0,0,0.7)]">
          <p class="m-0 font-display font-bold text-[48px] text-accent uppercase mb-1">
            {players[winner]?.name} wins!
          </p>
          <button onclick={endSession}
            class="mt-6 h-[54px] px-8 rounded-[10px] bg-accent text-accent-fg font-display
                   font-bold text-xl uppercase tracking-widest border-0 cursor-pointer">
            Back to lobby
          </button>
        </div>
      </div>
    {/if}
  {/if}
</div>

{#if showEndConfirm}
  <ConfirmModal
    title="End this game?"
    body="The current game will be cancelled and all progress will be lost."
    confirmLabel="End game"
    danger
    onconfirm={endSession}
    oncancel={() => showEndConfirm = false} />
{/if}
```

Check `BullOffPanel`'s `send` prop type is `(action: Record<string, unknown>) => void`; `send` above returns `void | undefined`, which satisfies it.

- [ ] **Step 3: Delete the replaced files**

```bash
git rm backend/frontend/src/lib/components/PlayerCard.svelte backend/frontend/src/lib/components/PlayerListRow.svelte backend/frontend/src/lib/components/CorrectionPanel.svelte backend/frontend/src/lib/gameViews/x01.svelte backend/frontend/src/lib/gameViews/atc.svelte backend/frontend/src/lib/gameViews/fallback.svelte backend/frontend/src/lib/__tests__/CorrectionPanel.test.ts
grep -rn "PlayerCard\|PlayerListRow\|CorrectionPanel\|GameSettingsPanel\|getSubtitle\|getPrimaryDisplay" backend/frontend/src
```

Expected: the grep prints nothing.

- [ ] **Step 4: Types and tests**

Run: `npm run typecheck && npm test`
Expected: 0 errors; all tests pass.

- [ ] **Step 5: Check it in the browser**

Setup: the backend runs on :3000 (`scripts/dev.sh`, or the dev compose). Start the frontend locally: `cd backend/frontend && npx vite --port 5174`, open http://localhost:5174 and sign in with the dev account seeded by `backend/src/auth/seed.ts`. Only one game can run per user: end the running one (End button) before creating the next. Create boardless games from the lobby ("Manual only"). Use the header's Board view and click the board to throw.

Check each, at 1440×900 and at 1280×720:
- X01, 2 players: sides fixed; active panel lime-bordered with the 220px score; waiting panel shows "Can finish" when finishable; chalkboard rows appear after each visit (Scored | Left, older Left struck); throw T20 at 81 left → slots show T19 "leaves 24" and D12 "to win the leg", dashed rings on the board; band shows 60 / Left after 21.
- Celebrations: throw T20, T20, S20 → band turns "Ton plus"; T20 ×3 → "Maximum" with confetti; each dart ≥ 50 makes its slot pop once. With the OS "reduce motion" setting on, only colors change.
- Bust: throw more than the score → band "Bust" in red, remaining slots "Bust", chalkboard row "Bust" after "Next player".
- Leg win: check out → pips advance, both chalkboards clear, header "Leg N" increases.
- X01, 1 player: 400px left panel with "Practice", "Left", "Leg avg"; board takes the rest; compact visit tile beside the slots.
- X01, 4 players and 3 players: rows in player order, active row taller with lime "Can finish", waiting rows show "No finish yet" / Last / Avg / pips; 480px board column.
- X01, 6 players: rows keep their minimum height and the list scrolls; a long player name truncates.
- ATC, 2 players: dimmed board, lime target wedge, next player's target dashed, legend under the board; panels with Target, "N of 21 done", 7×3 grid, Darts / Hit rate; band "+1" / Target now; slot suggestion "your target".
- ATC, 4 players: strips of 21 cells, "Leading" pill on the leader, other players' initials on the board, legend "Current target" / "Others' targets".
- Settings drawer: turning off Visit sum, Chalkboard and Checkout suggestions hides them immediately.
- Enter view: the keypad replaces the board; "Single 1" etc. still work.
- Correction: tap a thrown dart → compact popover below the slots; pick a value → the slot updates; drag a dart on the board → corrected.
- Bull off (X01 with bull off, 2 players): unchanged, then the game screen appears.

- [ ] **Step 6: Commit**

```bash
git add -A backend/frontend/src
git commit -m "feat(ingame): solo, face-off and party layouts from the design"
```
