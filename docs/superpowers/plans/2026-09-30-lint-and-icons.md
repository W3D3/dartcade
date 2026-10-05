# Linting and Lucide Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict type-aware linting (no type assertions, no `any`, no non-null assertions) that the frontend passes with zero errors, run it in CI (backend as warnings), and replace the frontend's inline SVG icons with `@lucide/svelte` (issue #32).

**Architecture:** One ESLint flat config per package (`backend/frontend/eslint.config.js`, `backend/eslint.config.js`) built on typescript-eslint's `strictTypeChecked` plus `eslint-plugin-svelte`. The frontend's game logic stops reading the snapshot as an untyped record: modules take the generated `X01Game` / `AtcGame` types (`$lib/api/game-ws`) and `GameDisplay` narrows the snapshot by `gameId`. Icons come from `@lucide/svelte`, imported one by one.

**Tech Stack:** ESLint 9 (flat config), typescript-eslint 8, eslint-plugin-svelte 3, svelte-eslint-parser, globals, @lucide/svelte 1.x, Svelte 5, Vitest.

**Spec:** issue #32 (icons) and the decisions below (made by the user on 2026-09-30). There is no separate spec document.

## Decisions (binding)

1. **Ruleset:** `tseslint.configs.strictTypeChecked` + `svelte.configs.recommended`, plus:
   - `@typescript-eslint/consistent-type-assertions: ['error', { assertionStyle: 'never' }]` — no `as X`, `as any`, `as unknown as X`, `<X>v` (`as const` stays allowed; the rule always permits it).
   - `@typescript-eslint/restrict-template-expressions: ['error', { allowNumber: true }]` (numbers in template strings are fine).
   - `@typescript-eslint/no-confusing-void-expression: ['error', { ignoreArrowShorthand: true }]` (`onclick={() => send(x)}` is fine).
   - No stylistic preset (`stylisticTypeChecked` is left out).
2. **Frontend:** errors, and `npx eslint src` must report 0 problems at the end of this branch.
3. **Backend:** the same config as errors (changed by the user's goal on 2026-09-30: fix front and backend). A Task 5b fixes the backend findings.
4. **Tests (`**/*.test.ts`):** relaxed — assertions, `any`, the `no-unsafe-*` rules and non-null assertions are off.
5. **Generated files are not linted:** `src/lib/api/schema.ts`, `src/lib/api/game-ws.ts` (frontend), `src/schema/**` (backend).
6. **Icons:** Lucide for every UI icon. Not icons (stay inline): the dartboard SVG in `DartBoard.svelte`, and the brand mark (the lime three-ring logo in `AuthPanel.svelte` and `SideNav.svelte`), which becomes one `BrandMark.svelte` component.

## Global Constraints

- Work in `backend/frontend` unless a step says otherwise. Commands: `npx eslint src` (lint), `npx vitest run` (tests), `npm run typecheck` (tsc + svelte-check; 0 errors).
- A type assertion is never the fix for a lint error. Allowed tools: the generated types, narrowing (`in`, `typeof`, `Array.isArray`, discriminants like `gameId`), user-defined type guards (`(x: unknown): x is T`), `satisfies`, and explicit handling of `undefined`.
- Types that other files import must live in `.ts` files: typed linting cannot see types exported from `.svelte` files (they arrive as `any` and trip `no-unsafe-*`).
- Behaviour does not change except where a step says so. Existing tests keep passing.
- Keep e2e selectors: `DartEntryPanel` `aria-label`s ("Single 1", …), the "Triple" button text, visible "Bust", "Target", "N of 21 done".
- Icons keep their current size (`size` prop = the old `width`) and stroke width (`strokeWidth`, default 2 as before), stay `aria-hidden` (Lucide sets it by default), and keep any classes (`animate-spin`, `opacity-50`).

## Review Focus

1. **A snapshot for an unknown `gameId`** (a future game) must not crash the page: `GameDisplay` shows the header and "Unsupported game" instead of X01/ATC panels. Pinned by Task 3's `gameState` test "unknown game ids give null".
2. **Malformed WebSocket messages** (not JSON, not a snapshot) are ignored, not assigned. Pinned by Task 5's `isSnapshot` tests.
3. **Stored settings with junk values** still load as defaults without assertions. Pinned by the existing `gameSettings` tests (they must still pass after Task 2's rewrite).
4. **Spinning icons** (board actions busy, pairing) still spin: the `animate-spin` class moves onto the Lucide component. Covered by the browser check in Task 7.
5. **Icon sizes** don't shift layouts (e.g. the 9px spinner in `Boards.svelte`, the 10px one in `BoardStatusPanel.svelte`). Covered by the browser check in Task 7.

---

### Task 1: ESLint setup (frontend errors, backend warnings)

**Files:**

- Create: `backend/frontend/eslint.config.js`, `backend/eslint.config.js`
- Modify: `backend/frontend/package.json`, `backend/package.json` (devDependencies, `lint` script), `mise.toml` (lint tasks)

- [ ] **Step 1: Install**

```bash
cd backend/frontend && npm i -D eslint@9.39.5 typescript-eslint@8.71.0 eslint-plugin-svelte@3.23.0 svelte-eslint-parser@1 globals@16
cd .. && npm i -D eslint@9.39.5 typescript-eslint@8.71.0 globals@16
```

- [ ] **Step 2: Frontend config** — `backend/frontend/eslint.config.js`:

```js
// Strict, type-aware linting: no type assertions, no any, no non-null assertions.
import tseslint from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist/**', 'src/lib/api/schema.ts', 'src/lib/api/game-ws.ts'] },
  ...tseslint.configs.strictTypeChecked,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname, extraFileExtensions: ['.svelte'] },
    },
  },
  { files: ['**/*.svelte', '**/*.svelte.ts'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
  {
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },
  {
    // Tests may cast and use any to build partial fixtures
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
```

- [ ] **Step 3: Backend config** — `backend/eslint.config.js`:

```js
// Same rules as the frontend, as warnings for now (the backend is cleaned up in a follow-up).
import tseslint from 'typescript-eslint'
import globals from 'globals'

const strict = tseslint.config(
  ...tseslint.configs.strictTypeChecked,
  {
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },
)

// Every rule that is on becomes a warning
const asWarnings = strict.map(c => c.rules
  ? { ...c, rules: Object.fromEntries(Object.entries(c.rules).map(([k, v]) =>
      [k, v === 'off' || v === 0 || (Array.isArray(v) && (v[0] === 'off' || v[0] === 0)) ? v
        : Array.isArray(v) ? ['warn', ...v.slice(1)] : 'warn'])) }
  : c)

export default tseslint.config(
  { ignores: ['dist/**', 'frontend/**', 'src/schema/**'] },
  ...asWarnings,
  { languageOptions: { globals: { ...globals.node }, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } } },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
```

- [ ] **Step 4: Scripts** — add `"lint": "eslint src"` to both `package.json` `scripts`. In `mise.toml` add:

```toml
[tasks."lint:frontend"]
description = "Lint the frontend (errors)"
run = "cd backend/frontend && npm run lint"

[tasks."lint:backend"]
description = "Lint the backend (warnings only)"
run = "cd backend && npm run lint"
```

- [ ] **Step 5: Baseline** — run `cd backend/frontend && npx eslint src | tail -3` — Expected: about 190 problems (errors), mostly `consistent-type-assertions` (45), `svelte/require-each-key` (30), `no-unnecessary-condition` (25). `cd backend && npx eslint src | tail -3` — Expected: only warnings (about 350), exit code 0. Existing tests and typecheck unchanged.

- [ ] **Step 6: Commit** `git commit -m "chore(lint): strict type-aware ESLint for the frontend, warnings for the backend"` (both configs, package.json/lock files, mise.toml).

---

### Task 2: Settings and dart utilities without assertions

**Files:** `src/lib/gameSettings.ts`, `src/lib/dartUtils.ts`, `src/lib/controls.ts`; tests unchanged.

- [ ] **Step 1:** `gameSettings.ts` — replace the loop that casts with per-key type guards:

```ts
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

/** Stored settings over the defaults; unknown keys and values of the wrong type are ignored. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null): GameSettings {
  let raw: unknown
  try {
    raw = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? 'null')
  } catch {
    return { ...defaultSettings }
  }
  const s = isRecord(raw) ? raw : {}
  const d = defaultSettings
  const volume = typeof s.volume === 'number' && Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : d.volume
  return {
    showMarkers: bool(s.showMarkers, d.showMarkers),
    checkoutSuggestions: bool(s.checkoutSuggestions, d.checkoutSuggestions),
    visitSum: bool(s.visitSum, d.visitSum),
    chalkboard: bool(s.chalkboard, d.chalkboard),
    volume,
    soundHit: bool(s.soundHit, d.soundHit),
    soundMiss: bool(s.soundMiss, d.soundMiss),
    soundSwitch: bool(s.soundSwitch, d.soundSwitch),
    soundBust: bool(s.soundBust, d.soundBust),
  }
}
```

- [ ] **Step 2:** `dartUtils.ts` — the three `finishMap.get(x)!` become lookups that handle `undefined`:

```ts
  const one = finishMap.get(remaining)
  if (n >= 1 && one) return [one]
  …
      const fin = finishMap.get(rest)
      if (rest >= 1 && fin) return [d.l, fin]
  …
        const fin = finishMap.get(r2)
        if (r2 >= 1 && fin) return [d1.l, d2.l, fin]
```

and `markerPositions`' `SEGS.indexOf(s)` path stays as is (no assertions there). In `controls.ts` replace `'Next player' as const` / `'Skip to next' as const` with a typed return:

```ts
export type NextButton = { label: 'Next player' | 'Skip to next'; prominent: boolean; enabled: boolean }
export function nextButton(o: { manual: boolean; dartCount: number; locked: boolean; active: boolean }): NextButton {
  const done = o.manual || o.dartCount >= 3 || o.locked
  // After a win the button stays usable while the winning visit is open, so it can be committed
  return { label: done ? 'Next player' : 'Skip to next', prominent: done, enabled: o.active || o.dartCount > 0 }
}
```

- [ ] **Step 3:** Run `npx vitest run src/lib/__tests__/gameSettings.test.ts src/lib/__tests__/dartUtils.test.ts src/lib/__tests__/controls.test.ts` → pass; `npx eslint src/lib/gameSettings.ts src/lib/dartUtils.ts src/lib/controls.ts` → 0 problems.

- [ ] **Step 4: Commit** `git commit -m "refactor(lint): settings, checkout finder and controls without type assertions"`

---

### Task 3: Typed game state in the game logic

The logic modules take the generated game types instead of `Record<string, unknown>`.

**Files:**

- Create: `src/lib/gameState.ts`, test `src/lib/__tests__/gameState.test.ts`
- Modify: `src/lib/visitHistory.ts`, `playerStats.ts`, `gameViews/meta.ts`, `gameViews/index.ts`; tests for these (fixtures may keep casting — tests are relaxed)

**Interfaces (produces):**

- `gameState(snapshot: Snapshot | null): { x01: X01Game; atc: null } | { x01: null; atc: AtcGame } | { x01: null; atc: null }` — narrows by `gameId`; unknown ids give both null.
- `trackVisits(h: VisitHistory, game: X01Game | AtcGame): VisitHistory`
- `x01Player(game: X01Game, i, history, o)`, `atcPlayer(game: AtcGame, i)`
- `x01Meta(game: X01Game, playerCount)`, `atcMeta(game: AtcGame, playerCount)`; `GameView.meta` becomes `(snapshot: Snapshot) => string` and dispatches on `gameId`.

- [ ] **Step 1: Failing test** — `src/lib/__tests__/gameState.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { gameState } from '../gameState.js'

const base = { type: 'snapshot', sessionId: 's', boardId: null, players: [{ name: 'A' }], bmStatus: null } as const

describe('gameState', () => {
  it('narrows an X01 snapshot', () => {
    const game = { scores: [501] } as any
    expect(gameState({ ...base, gameId: 'x01', game })).toEqual({ x01: game, atc: null })
  })
  it('narrows an ATC snapshot', () => {
    const game = { targets: [1] } as any
    expect(gameState({ ...base, gameId: 'atc', game })).toEqual({ x01: null, atc: game })
  })
  it('unknown game ids give null', () => {
    expect(gameState({ ...base, gameId: 'soccer', game: {} } as any)).toEqual({ x01: null, atc: null })
    expect(gameState(null)).toEqual({ x01: null, atc: null })
  })
})
```

- [ ] **Step 2:** Run it — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/gameState.ts`:

```ts
// The snapshot's game, narrowed by game id (the generated Snapshot type is a union on gameId).
import type { AtcGame, Snapshot, X01Game } from './api/game-ws'

export type GameState = { x01: X01Game; atc: null } | { x01: null; atc: AtcGame } | { x01: null; atc: null }

export function gameState(snapshot: Snapshot | null): GameState {
  if (snapshot?.gameId === 'x01') return { x01: snapshot.game, atc: null }
  if (snapshot?.gameId === 'atc') return { x01: null, atc: snapshot.game }
  return { x01: null, atc: null }
}
```

- [ ] **Step 4: Retype the modules.**

`visitHistory.ts` — `trackVisits(h, game: X01Game | AtcGame)`: replace the `nums` helper and casts with:

```ts
  const isX01 = 'scores' in game
  const progress = isX01 ? game.scores : game.hitCounts
  const { totalVisits, totalDarts } = game
  const legs = isX01 ? game.legs : []
  const darts = game.currentVisitDarts.length
  const cp = game.currentPlayer
  …
    prev: { totalVisits: [...totalVisits], totalDarts: [...totalDarts], legs: [...legs], darts, bust: isX01 && game.bustThisVisit, cp },
```

`playerStats.ts` — `x01Player(game: X01Game, …)` reads `game.scores[i] ?? 0`, `game.opened[i] ?? true`, `game.config.outMode`, `game.currentVisitDarts`, `game.totalDarts[i] ?? 0`, `game.legs[i] ?? 0`, `game.firstTo`; `atcPlayer(game: AtcGame, i)` reads `game.sequence`, `game.targets[i] ?? game.sequence[0] ?? 1`, `game.totalDarts[i] ?? 0`, `game.hitCounts[i] ?? 0`. Delete `nums`.

`gameViews/meta.ts` — `x01Meta(game: X01Game, n)` uses `game.config`, `game.legs`, `game.firstTo`, `game.winner` directly; `atcMeta(game: AtcGame, n)` uses `game.cfg`, `game.sequence`, `game.totalVisits`.

`gameViews/index.ts`:

```ts
import type { Snapshot } from '../api/game-ws'
import { x01Meta, atcMeta } from './meta.js'

export interface GameView { title: string; meta: (snapshot: Snapshot) => string }

const titles: Record<string, string> = { x01: 'X01', atc: 'Around the Clock' }

export function getGameView(gameId: string): GameView {
  return {
    title: titles[gameId] ?? 'Game',
    meta: s => (s.gameId === 'x01' ? x01Meta(s.game, s.players.length) : s.gameId === 'atc' ? atcMeta(s.game, s.players.length) : ''),
  }
}
```

Tests of these modules: fixtures that build partial games keep working because tests may cast (`as X01Game`, `as AtcGame`) — add the cast where TypeScript now complains; do not change expectations.

- [ ] **Step 5:** `npx vitest run` → all pass; `npx eslint src/lib` → no `consistent-type-assertions` left in `src/lib/*.ts`.

- [ ] **Step 6: Commit** `git commit -m "refactor(ingame): game logic reads the typed X01/ATC game instead of casting"`

---

### Task 4: GameDisplay and components on typed state

**Files:** `src/routes/GameDisplay.svelte`, `src/lib/components/*.svelte`, create `src/lib/components/pills.ts`

- [ ] **Step 1: `PillKind` to a `.ts` file** — create `src/lib/components/pills.ts` with `export type PillKind = 'throwing' | 'up-next' | 'practice' | 'leading' | 'winner'`; `PlayerPill.svelte` imports it from there (drop its `<script module>`); `PanelShell`, `X01Panel`, `AtcPanel`, `X01Row`, `AtcRow`, `GameDisplay` import `type PillKind` from `./pills.js` / `'../lib/components/pills.js'`.

- [ ] **Step 2: GameDisplay** — replace `asRecord`/`game` with the narrowed state:

```ts
  const state = $derived(gameState(snapshot))
  const x01 = $derived(state.x01)
  const atc = $derived(state.atc)
  const game = $derived(x01 ?? atc) // shared fields: currentPlayer, winner, currentVisitDarts, totals
```

and derive every value from `x01` / `atc` / `game` without casts, for example:

```ts
  const currentPlayer = $derived(game?.currentPlayer ?? 0)
  const winner = $derived(game?.winner ?? null)
  const darts = $derived(game?.currentVisitDarts ?? [])
  const hits = $derived(atc?.currentVisitHits ?? [])
  const bust = $derived(x01?.bustThisVisit === true)
  const locked = $derived(x01?.visitLocked === true || winner !== null)
  const bullOff = $derived(x01?.phase === 'bulloff' ? x01.bullOff : null)
  const outMode = $derived(x01?.config.outMode ?? 'double')
  const sequence = $derived(atc?.sequence ?? [])
  const targets = $derived(atc?.targets ?? [])
```

`history = trackVisits(history, g)` only when `gameState(snap)` gives a game; `playSounds(before, after)` takes `X01Game | AtcGame`; the header meta is `view.meta(snapshot)`. When `snapshot` is set but both `x01` and `atc` are null, render the header and a centred `<p class="text-text-muted">Unsupported game</p>` instead of the layouts.

- [ ] **Step 3: Remaining component findings.** Run `npx eslint src/lib/components src/routes/GameDisplay.svelte` and fix by rule:
  - `svelte/require-each-key`: add a key — the item's id or name where unique (`(board.id)`, `(row.key)`, `(label)`), otherwise the index `(i)`.
  - `no-unnecessary-condition`: remove `?.` / `??` on values the types say are defined (e.g. `game.currentPlayer ?? 0` on a non-null game); keep them where the value can really be undefined (array index reads are `number | undefined` only with `noUncheckedIndexedAccess`, which is off — so `arr[i] ?? 0` is flagged: keep the fallback by using `arr.at(i) ?? 0`).
  - `no-non-null-assertion` in `BullOffPanel` (`result!.order`): guard (`result && !result.rethrow ? result.order.indexOf(p) : -1`).
  - `DartBoard.svelte:142` (`e.currentTarget as Element`): `e.currentTarget` is typed on the handler — type the handler parameter as `PointerEvent & { currentTarget: SVGGElement }` and call `e.currentTarget.setPointerCapture(...)`.
  - `SettingsDrawer`: type the row lists with `satisfies readonly { key: BooleanSettingKey; … }[]` where `type BooleanSettingKey = { [K in keyof GameSettings]: GameSettings[K] extends boolean ? K : never }[keyof GameSettings]` (in `gameSettings.ts`), so `settings[row.key]` is a boolean without casts.
  - `DartSlots.svelte:52` (`querySelectorAll<HTMLElement>('button')[openDart]?.focus()`): use `.item(openDart)` and an `instanceof HTMLElement` check.
  - `CodeInput`, `GameConfigForm`: replace `e.target as HTMLInputElement` with `e.currentTarget` (typed by Svelte's event handler types).

- [ ] **Step 4:** `npx eslint src/lib/components src/routes/GameDisplay.svelte` → 0; `npm run typecheck` → 0 errors; `npx vitest run` → pass.

- [ ] **Step 5: Commit** `git commit -m "refactor(lint): game screen and components pass the strict rules"`

---

### Task 5: Pages, WebSocket and entry points

**Files:** `src/lib/ws.ts`, `src/main.ts`, `src/routes/{Boards,CreateSession,Login,Register}.svelte`, `src/App.svelte`, `src/lib/pairing.ts`, `src/lib/auth.ts`, `src/lib/components/ui/**`, remaining findings; test `src/lib/__tests__/ws.test.ts`

- [ ] **Step 1: Failing test** for a snapshot guard — `src/lib/__tests__/ws.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isSnapshot } from '../ws.js'

describe('isSnapshot', () => {
  it('accepts a snapshot message', () => {
    expect(isSnapshot({ type: 'snapshot', sessionId: 's', gameId: 'x01', players: [], game: {}, boardId: null, bmStatus: null })).toBe(true)
  })
  it('rejects anything else', () => {
    for (const m of [null, 'x', 42, {}, { type: 'hello' }, { type: 'snapshot' }]) expect(isSnapshot(m)).toBe(false)
  })
})
```

- [ ] **Step 2:** Run — FAIL (`isSnapshot` not exported).

- [ ] **Step 3: Implement** in `ws.ts`:

```ts
/** A snapshot from the server (shallow check; the backend validates the full shape against the schema). */
export function isSnapshot(m: unknown): m is Snapshot {
  return typeof m === 'object' && m !== null
    && 'type' in m && m.type === 'snapshot'
    && 'gameId' in m && typeof m.gameId === 'string'
    && 'game' in m && typeof m.game === 'object' && m.game !== null
    && 'players' in m && Array.isArray(m.players)
}
```

and in `onmessage`: `const msg: unknown = JSON.parse(e.data)` (with `e.data` checked `typeof e.data === 'string'`), `if (isSnapshot(msg)) { snapshot.set(msg); backoff = 500 }`. Close codes: compare `e.code` with `Number(WsCloseCode.Unauthorized)` etc. (fixes `no-unsafe-enum-comparison`).

- [ ] **Step 4: Remaining findings.** `src/main.ts`: `const target = document.getElementById('app'); if (!target) throw new Error('#app missing')`. `no-floating-promises`: `void` fire-and-forget calls (`void push('/')`) or `await` them inside async handlers. `no-misused-promises`: wrap async handlers (`onclick={() => void save()}`). `Login`/`Register` `no-unsafe-assignment` on `import.meta.env.VITE_DEV_EMAIL` / `VITE_DEV_PASSWORD`: declare them in `src/vite-env.d.ts`:

```ts
interface ImportMetaEnv {
  readonly VITE_DEV_EMAIL?: string
  readonly VITE_DEV_PASSWORD?: string
}
```

`CreateSession`:

- `loadPrefs()` returns `JSON.parse(...)` (any): parse into `unknown` and accept it only through a `isSavedPrefs(v: unknown): v is SavedPrefs` guard (object with a string `mode`, an object `configs`, optional string `boardId`); otherwise `null`.
- The four `config.maxRounds as number` / similar reads (lines ~273–299): read through `typeof config.maxRounds === 'number' ? config.maxRounds : <the default from the game's defaultConfig>`, or a small helper `num(v: unknown, d: number)`.
- Line ~322 `no-unsafe-assignment`: same helper for the value read from the config record.
  `ui/input/input.svelte` (`no-unsafe-assignment` on the `files` binding): give the props an explicit type for `files` (`files?: FileList | null`). `ui/button/button.svelte` (`no-useless-default-assignment`): drop the `= undefined` default. `App.svelte` `no-floating-promises`: `void push(...)` / `void` the async init call. Everything else: fix per the rule's message; no assertions, no `eslint-disable` comments.

- [ ] **Step 5:** `npx eslint src` → **0 problems**; `npm run typecheck` → 0; `npx vitest run` → pass.

- [ ] **Step 6: Commit** `git commit -m "refactor(lint): pages, WebSocket and entry points pass the strict rules"`

---

### Task 6: Lucide icons

**Files:** `backend/frontend/package.json`; create `src/lib/components/BrandMark.svelte`; modify the files in the table.

- [ ] **Step 1:** `cd backend/frontend && npm i @lucide/svelte@1.49.0`

- [ ] **Step 2: BrandMark** — move the three-ring logo from `AuthPanel.svelte:6` into `src/lib/components/BrandMark.svelte` with a `size: number` prop (the SVG keeps `viewBox="0 0 32 32"`), and use it in `AuthPanel.svelte` (size 32) and `SideNav.svelte` (size 28).

- [ ] **Step 3: Replace** each inline icon SVG with the Lucide component (`import { Name } from '@lucide/svelte'`), passing `size` = the old width and `strokeWidth` when it was not 2, and moving `class` (e.g. `animate-spin`, `opacity-50`) onto the component:

| File (line)                                                                                                                                  | Old shape                               | Lucide                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `BoardSelector.svelte` (24, 64)                                                                                                              | pencil in a box                         | `SquarePen`                                                                                                                |
| `BoardSelector.svelte` (37)                                                                                                                  | chevron down                            | `ChevronDown`                                                                                                              |
| `BoardStatusPanel.svelte` (98, 127, 153, 172, 193, 215)                                                                                      | spinner arc                             | `LoaderCircle`                                                                                                             |
| `BoardStatusPanel.svelte` (107)                                                                                                              | three lines with dots                   | `SlidersHorizontal`                                                                                                        |
| `BoardStatusPanel.svelte` (158), `Boards.svelte` (231)                                                                                       | play triangle (filled)                  | `Play` with `fill="currentColor"`                                                                                          |
| `BoardStatusPanel.svelte` (177), `Boards.svelte` (236)                                                                                       | square (filled)                         | `Square` with `fill="currentColor"`                                                                                        |
| `BoardStatusPanel.svelte` (198), `Boards.svelte` (241)                                                                                       | rotate counter-clockwise                | `RotateCcw`                                                                                                                |
| `BoardStatusPanel.svelte` (220), `Boards.svelte` (248)                                                                                       | sun (calibrate)                         | `Sun`                                                                                                                      |
| `Boards.svelte` (219, 461)                                                                                                                   | spinner arc                             | `LoaderCircle`                                                                                                             |
| `Boards.svelte` (271), `CreateSession.svelte` (346)                                                                                          | plus                                    | `Plus`                                                                                                                     |
| `Boards.svelte` (370)                                                                                                                        | pencil                                  | `Pencil`                                                                                                                   |
| `Boards.svelte` (423)                                                                                                                        | external link                           | `ExternalLink`                                                                                                             |
| `ControlBar.svelte` (19)                                                                                                                     | undo arrow                              | `Undo2`                                                                                                                    |
| `ControlBar.svelte` (29), `PairBoardModal.svelte` (112)                                                                                      | chevron right                           | `ChevronRight`                                                                                                             |
| `DartSlots.svelte` (94), `GameHeader.svelte` (33)                                                                                            | chevron left                            | `ChevronLeft`                                                                                                              |
| `DartSlots.svelte` (104), `GameHeader.svelte` (56), `SettingsDrawer.svelte` (50), `ui/modal/modal.svelte` (76), `ui/toast/toast.svelte` (60) | cross                                   | `X`                                                                                                                        |
| `GameHeader.svelte` (74)                                                                                                                     | gear                                    | `Settings`                                                                                                                 |
| `PairBoardModal.svelte` (172)                                                                                                                | spinner arc                             | `LoaderCircle`                                                                                                             |
| `PlayerPill.svelte` (16), `SideNav.svelte` (63)                                                                                              | trophy                                  | `Trophy`                                                                                                                   |
| `SessionBanner.svelte` (33), `CreateSession.svelte` (377)                                                                                    | arrow right                             | `ArrowRight`                                                                                                               |
| `SideNav.svelte` (50)                                                                                                                        | target                                  | `Target`                                                                                                                   |
| `SideNav.svelte` (57)                                                                                                                        | monitor                                 | `Monitor`                                                                                                                  |
| `SideNav.svelte` (68)                                                                                                                        | clock                                   | `Clock`                                                                                                                    |
| `CreateSession.svelte` (191)                                                                                                                 | check                                   | `Check`                                                                                                                    |
| `ui/toast/toast.svelte` (29, 34)                                                                                                             | check / exclamation in a coloured badge | the badge `<span>` is replaced by `CircleCheck` (success, `text-accent`) / `CircleAlert` (error, `text-live`), `size={24}` |

`Boards.svelte`'s local icon snippets (`startIcon`, `stopIcon`, …) and the `icon: Snippet` parameter of its `control` snippet become a Lucide component passed as a prop (`icon: typeof Play` — the Lucide component type, imported as `type Icon` from `@lucide/svelte`) and rendered with `<icon size={12} />` (Svelte 5 dynamic component).

- [ ] **Step 4:** `grep -rn '<svg' src --include='*.svelte'` → only `DartBoard.svelte` and `BrandMark.svelte`. `npx eslint src` → 0; `npm run typecheck` → 0; `npx vitest run` → pass.

- [ ] **Step 5: Commit** `git commit -m "feat(ui): Lucide icons instead of inline SVGs (#32)"`

---

### Task 7: CI and browser check

**Files:** `.github/workflows/ci.yml`

- [ ] **Step 1:** In `test-frontend`, after `npm run typecheck`: `- run: npm run lint` (`working-directory: backend/frontend`). In `test-backend`, after `npm run typecheck`: `- run: npm run lint` (`working-directory: backend`; warnings only, exits 0).

- [ ] **Step 2: Browser** (dev frontend on :5174 against the dev backend; use your own test games): side nav and sign-in logo; boards page (board card actions Start/Stop/Reset/Calibrate icons, spinner while busy, pencil, external link, plus); board status panel in a game header; game header (Leave, End, cog), control bar (Undo, Next player), correction popover (back, close), settings drawer close, leading trophy pill; toasts (success/error); pairing modal spinner. Sizes and spin as before.

- [ ] **Step 3: Commit** `git commit -m "ci: lint frontend (errors) and backend (warnings)"`
