# Autodarts voices and checkout calls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** X01's caller says "You require N" when the next thrower can finish (#132), and a player can import Autodarts' caller voices from a zip a bookmarklet builds on play.autodarts.com (behind `caller.autodartsImport`).

**Architecture:** Checkout calls are pure frontend logic in `lib/caller/calls.ts` on top of a new shared `canCheckOut`; a `Call` part gains "phrase" choices so `require_N` can fall back to `you_require` + `N`. The import reuses the zip upload: `readPack` recognises a zip holding one `.mp3` and its `.json` table and hands it to a new pure cutter (`caller/autodarts.ts`) that slices the MP3 on frame boundaries. The player trims edge silence after decoding.

**Tech Stack:** TypeScript, Fastify, Kysely/Postgres, zod 4, Svelte 5, vitest, OpenFeature flags.

**Spec:** `docs/superpowers/specs/2026-10-16-autodarts-voices-and-checkout-calls-design.md`

## Global Constraints

- Work in the worktree `/home/wedenigc/Dev/dartcade-adimport` (branch `feat/autodarts-voice-import`). Dependencies are installed (`npm ci` at the root, `backend/`, `backend/frontend/`).
- **Nothing from Autodarts goes in the repo**: no audio, no timing tables, no extracted JSON. Tests build tiny synthetic MP3s.
- **No new dependencies.**
- Commits: conventional (`type(scope): subject`, lower case, imperative, < 72 chars), **unsigned** (the worktree has `commit.gpgsign=false`; don't pass `-S`), each ending with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01VULn7Ep988Zc1dpFgEAVRi
  ```
- Before each commit: `npm run format` at the repo root (oxfmt), and in each package you touched `npm run typecheck` and `npm run lint` (`backend/`, `backend/frontend/`).
- Tests: backend `cd backend && npx vitest run <file>`; DB tests need `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test` (the `dartcade-test-pg` container is running). Frontend `cd backend/frontend && npx vitest run <file>`.
- Code style: match the surrounding code — short `//` comments that say why, JSDoc on exports, no semicolons, single quotes, 2-space indent, plain English copy ("Checkout calls", not "Enable checkout announcements").
- Keys: `require_N` (N 1–180) is the whole "You require N" phrase; `you_require` is the lead-in. Autodarts renames: `game_on` → `gameon`, `game_shot` → `gameshot`, `game_shot_match` → `matchshot`.
- Flag key: `caller.autodartsImport` (on for admins, on for everyone with `FLAGS_ON=caller.autodartsImport`). Checkout calls are **not** flagged.

## Review Focus

- An undo or correction of a committed visit (total visits go down, or stay the same) must not say "You require" again → `checkoutFor` returns null (test in Task 3).
- A page opened mid-game (`before` is null) says no checkout call → test in Task 3.
- An MP3 that ends with an ID3v1 `TAG` block (common after re-saving) still imports → the frame walk stops at the tag (test in Task 6).
- A regular voice pack zip that happens to contain a `.json` and several clips must not be treated as Autodarts → read as before (test in Task 7).
- A bust with "repeat" off: the same remaining score isn't announced twice in a row, but is again in the next leg → test in Task 3.

---

### Task 1: `canCheckOut` and the 180 cap

**Files:**

- Modify: `backend/src/shared/checkout.ts`
- Test: `backend/src/shared/checkout.test.ts`

**Interfaces:**

- Produces: `export function canCheckOut(remaining: number, outMode?: 'straight' | 'double' | 'master'): boolean` in `backend/src/shared/checkout.ts` (the frontend imports it as `$shared/checkout.js`).

- [ ] **Step 1: Write the failing tests** — append to `checkout.test.ts` (and add `canCheckOut` to its import from `./checkout.js`):

```ts
describe('canCheckOut', () => {
  it('double out: up to 170, not the bogey numbers, not 1', () => {
    for (const n of [2, 40, 50, 101, 170]) expect(canCheckOut(n, 'double')).toBe(true)
    for (const n of [1, 159, 162, 163, 165, 166, 168, 169, 171, 180]) expect(canCheckOut(n, 'double')).toBe(false)
  })

  it('straight and master out reach 180', () => {
    for (const n of [1, 171, 174, 177, 180]) expect(canCheckOut(n, 'straight')).toBe(true)
    for (const n of [172, 173, 175, 176, 178, 179, 181]) expect(canCheckOut(n, 'straight')).toBe(false)
    for (const n of [171, 180]) expect(canCheckOut(n, 'master')).toBe(true)
    for (const n of [1, 179]) expect(canCheckOut(n, 'master')).toBe(false)
  })

  it('suggests a route for 180 in straight out', () => {
    expect(checkoutHint(180, 'straight')).toEqual(['T20', 'T20', 'T20'])
  })
})
```

- [ ] **Step 2: Run, expect failures** — `cd backend && npx vitest run src/shared/checkout.test.ts` → FAIL (`canCheckOut` is not exported; 180 straight is null).

- [ ] **Step 3: Implement** — in `checkout.ts`, change the first line of `checkoutHint`'s body and add `canCheckOut` below it:

```ts
  // Three darts finish 170 on a double, 180 (T20 T20 T20) when any dart may finish
  if (remaining < 1 || remaining > (outMode === 'double' ? 170 : 180) || dartsLeft < 1) return null
```

```ts
/** Whether `remaining` can be finished in one visit (three darts) under the out mode. */
export function canCheckOut(remaining: number, outMode: OutMode = 'double'): boolean {
  return checkoutHint(remaining, outMode, 3) !== null
}
```

- [ ] **Step 4: Run** `cd backend && npx vitest run src/shared/ src/games/` → PASS (x01's checkout-attempt stats use one dart, so they don't change; fix any test that asserted `null` above 170 for straight/master out by updating it to the new, correct route).

- [ ] **Step 5: Commit** — `fix(checkout): reach 180 in straight and master out, add canCheckOut`

---

### Task 2: phrase choices in a call, and what a voice borrows

**Files:**

- Modify: `backend/frontend/src/lib/caller/calls.ts` (`Call`, `pickClips`)
- Modify: `backend/frontend/src/lib/caller/voices.ts` (`mergeClips`)
- Test: `backend/frontend/src/lib/__tests__/callerCalls.test.ts`, `backend/frontend/src/lib/__tests__/callerVoices.test.ts`

**Interfaces:**

- Produces: `export type Call = (string | string[])[][]` — parts said in order; each part lists choices by preference: a key, or a phrase (keys said one after another) that plays only when the voice has every one of them. `pickClips<T>(call: Call, clips: Record<string, T[]>, pick?): T[]` keeps its signature.
- Produces: `mergeClips(voice, base)` never borrows `and` or `you_require`, and borrows no `require_*` when the voice has its own `you_require`.

- [ ] **Step 1: Write the failing tests**

In `callerCalls.test.ts` (inside the existing `describe` for `pickClips`, or a new one):

```ts
describe('pickClips with phrases', () => {
  const first = () => 0
  it('plays the first choice the voice has; a phrase only when it has every key', () => {
    const call = [['require_121', ['you_require', '121']]]
    expect(pickClips(call, { require_121: ['r'], you_require: ['y'], '121': ['n'] }, first)).toEqual(['r'])
    expect(pickClips(call, { you_require: ['y'], '121': ['n'] }, first)).toEqual(['y', 'n'])
    expect(pickClips(call, { you_require: ['y'] }, first)).toEqual([])
  })
})
```

In `callerVoices.test.ts` (next to the existing `mergeClips` tests):

```ts
it('never borrows you_require; a voice with its own lead-in borrows no require_ phrases', () => {
  const base = { you_require: ['b-y'], require_121: ['b-r'], '121': ['b-n'], and: ['b-and'] }
  expect(mergeClips({ '60': ['v-60'] }, base)).toEqual({ require_121: ['b-r'], '121': ['b-n'], '60': ['v-60'] })
  expect(mergeClips({ you_require: ['v-y'] }, base)).toEqual({ '121': ['b-n'], you_require: ['v-y'] })
})
```

- [ ] **Step 2: Run, expect failures** — `cd backend/frontend && npx vitest run src/lib/__tests__/callerCalls.test.ts src/lib/__tests__/callerVoices.test.ts` → FAIL (type error / wrong clips).

- [ ] **Step 3: Implement**

`calls.ts`:

```ts
/** Parts said in order; each part lists choices by preference: a key, or a phrase (keys said one
 *  after another) that plays only when the voice has every one of them. */
export type Call = (string | string[])[][]
```

```ts
/** One clip per key of the first choice the voice has, a random variant of each. Missing parts are skipped. */
export function pickClips<T>(
  call: Call,
  clips: Record<string, T[]>,
  pick: (n: number) => number = n => Math.floor(Math.random() * n),
): T[] {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const has = (k: string) => (clips[k]?.length ?? 0) > 0
  const out: T[] = []
  for (const part of call) {
    const choice = part.find(c => (typeof c === 'string' ? has(c) : c.every(has)))
    if (choice === undefined) continue
    for (const k of typeof choice === 'string' ? [choice] : choice) out.push(clips[k][pick(clips[k].length)])
  }
  return out
}
```

`voices.ts`:

```ts
/** A voice's clips over the built-in voice's: keys the voice lacks fall back to it, except the lead-ins. */
export const mergeClips = (voice: Clips, base: Clips): Clips => {
  // "and" and "you_require" lead into the voice's own next clip, so another voice's would mix voices
  // mid-sentence; a voice with its own "you_require" says checkouts with it, not with borrowed phrases
  const { and: _and, you_require: _youRequire, ...rest } = base
  const ownLeadIn = (voice.you_require?.length ?? 0) > 0
  const borrowed = ownLeadIn ? Object.fromEntries(Object.entries(rest).filter(([k]) => !k.startsWith('require_'))) : rest
  return { ...borrowed, ...voice }
}
```

(If lint flags `voice.you_require?.` as unnecessary, use the same `eslint-disable-next-line` as `pickClips`.)

- [ ] **Step 4: Run** `cd backend/frontend && npx vitest run src/lib/__tests__/caller*` → PASS; `npm run typecheck` → clean (`callsFor`'s `string[][]` results still fit `Call`).

- [ ] **Step 5: Commit** — `feat(caller): let a call part choose a phrase, keep lead-ins unborrowed`

---

### Task 3: checkout calls (pure logic)

**Files:**

- Modify: `backend/frontend/src/lib/caller/calls.ts`
- Test: `backend/frontend/src/lib/__tests__/callerCalls.test.ts`

**Interfaces:**

- Consumes: `canCheckOut` (Task 1, `$shared/checkout.js`), `Call` (Task 2).
- Produces (all exported from `calls.ts`):
  - `CallGame` now also picks `'config'` from `X01Game`.
  - `type Checkout = { seat: number; remaining: number; leg: number }`
  - `checkoutFor(before: CallGame | null, after: CallGame): Checkout | null`
  - `requirePart(n: number): (string | string[])[]` → `[`require_${n}`, ['you_require', String(n)]]`
  - `createCheckoutMemory(): (c: Checkout, repeat: boolean) => boolean`

- [ ] **Step 1: Write the failing tests** — in `callerCalls.test.ts`, first add `config` to the `game()` fixture defaults:

```ts
  config: { outMode: 'double', startScore: 501, inMode: 'straight', botSpeed: 'normal' },
```

then add (importing `checkoutFor`, `requirePart`, `createCheckoutMemory`):

```ts
describe('checkoutFor', () => {
  const three = [dart(60), dart(60), dart(60)]
  // Seat 0's visit over (three darts), then the takeout hands the turn to seat 1
  const over = (o: Partial<CallGame> = {}) => game({ scores: [141, 121], currentVisitDarts: three, ...o })
  const next = (o: Partial<CallGame> = {}) => game({ scores: [141, 121], currentPlayer: 1, totalVisits: [1, 0], ...o })

  it('names what the next thrower needs when they can finish', () => {
    expect(checkoutFor(over(), next())).toEqual({ seat: 1, remaining: 121, leg: 0 })
  })

  it("says nothing for a score that can't be finished, or before a visit is committed", () => {
    expect(checkoutFor(over({ scores: [141, 169] }), next({ scores: [141, 169] }))).toBeNull()
    expect(checkoutFor(game({ scores: [381, 121], currentVisitDarts: [dart(60)] }), over())).toBeNull()
  })

  it('follows the out mode: 180 finishes in straight out', () => {
    const config = { outMode: 'straight', startScore: 501, inMode: 'straight', botSpeed: 'normal' } as const
    expect(checkoutFor(over({ scores: [141, 180], config }), next({ scores: [141, 180], config }))).toEqual({ seat: 1, remaining: 180, leg: 0 })
  })

  it('not at a new leg, not mid-game on open, not on an undo', () => {
    expect(checkoutFor(over(), next({ legs: [1, 0] }))).toBeNull()
    expect(checkoutFor(null, next())).toBeNull()
    expect(checkoutFor(next(), over({ totalVisits: [0, 0] }))).toBeNull()
  })

  it("uses the team's score in team games", () => {
    const teams = [
      { id: 'A', name: 'A', seats: [0, 2], score: 141, legs: 0 },
      { id: 'B', name: 'B', seats: [1, 3], score: 40, legs: 0 },
    ] as CallGame['teams']
    const before = over({ scores: [141, 501, 141, 501], visitStartScores: [501, 501, 501, 501], totalVisits: [0, 0, 0, 0], teams })
    const after = next({ scores: [141, 501, 141, 501], visitStartScores: [501, 501, 501, 501], totalVisits: [1, 0, 0, 0], teams })
    expect(checkoutFor(before, after)).toEqual({ seat: 1, remaining: 40, leg: 0 })
  })
})

describe('requirePart', () => {
  it('the whole phrase, else the lead-in and the number', () => {
    expect(requirePart(121)).toEqual(['require_121', ['you_require', '121']])
  })
})

describe('createCheckoutMemory', () => {
  it('without repeat, skips the same score for the same seat until the next leg', () => {
    const say = createCheckoutMemory()
    expect(say({ seat: 1, remaining: 121, leg: 0 }, false)).toBe(true)
    expect(say({ seat: 1, remaining: 121, leg: 0 }, false)).toBe(false)
    expect(say({ seat: 0, remaining: 121, leg: 0 }, false)).toBe(true)
    expect(say({ seat: 1, remaining: 80, leg: 0 }, false)).toBe(true)
    expect(say({ seat: 1, remaining: 121, leg: 1 }, false)).toBe(true)
  })

  it('with repeat, always says it', () => {
    const say = createCheckoutMemory()
    expect(say({ seat: 1, remaining: 121, leg: 0 }, true)).toBe(true)
    expect(say({ seat: 1, remaining: 121, leg: 0 }, true)).toBe(true)
  })
})
```

(If the `teams` type cast doesn't fit `X01Game['teams']`, check the generated type in `src/lib/api/game-ws.ts` and match its fields.)

- [ ] **Step 2: Run, expect failures** — `cd backend/frontend && npx vitest run src/lib/__tests__/callerCalls.test.ts` → FAIL (not exported).

- [ ] **Step 3: Implement** — in `calls.ts`: add `| 'config'` to `CallGame`'s `Pick`, `import { canCheckOut } from '$shared/checkout.js'`, and after `endOfVisit`:

```ts
/** What the next thrower needs and in which leg, when they can finish it. */
export type Checkout = { seat: number; remaining: number; leg: number }

/** At the takeout: what the next thrower needs, when they can finish it in one visit. Null when no
 *  visit was committed (an undo or a correction), at a new leg or the end, and on a fresh page. */
export function checkoutFor(before: CallGame | null, after: CallGame): Checkout | null {
  if (before?.phase !== 'game' || after.phase !== 'game') return null
  if (sum(after.totalVisits) <= sum(before.totalVisits)) return null
  const leg = legsPlayed(after)
  if (leg !== legsPlayed(before)) return null
  const seat = after.currentPlayer
  const remaining = after.teams?.find(t => t.seats.includes(seat))?.score ?? after.scores[seat]
  return canCheckOut(remaining, after.config.outMode) ? { seat, remaining, leg } : null
}

/** "You require N": the whole phrase, else the lead-in and the number. */
export const requirePart = (n: number): (string | string[])[] => [`require_${n}`, ['you_require', String(n)]]

/** Whether to say a checkout call: with `repeat` off, not again for a seat whose score is the one
 *  last announced for it in this leg (after a bust or a no-score visit). Remembers what it lets through. */
export function createCheckoutMemory(): (c: Checkout, repeat: boolean) => boolean {
  let leg = -1
  const said = new Map<number, number>()
  return (c, repeat) => {
    if (c.leg !== leg) {
      said.clear()
      leg = c.leg
    }
    if (!repeat && said.get(c.seat) === c.remaining) return false
    said.set(c.seat, c.remaining)
    return true
  }
}
```

- [ ] **Step 4: Run** `cd backend/frontend && npx vitest run src/lib/__tests__/callerCalls.test.ts && npm run typecheck` → PASS. `GameDisplay.svelte` passes `next.x01` (a full `X01Game`) so the wider `CallGame` still type-checks.

- [ ] **Step 5: Commit** — `feat(caller): work out checkout calls at the takeout`

---

### Task 4: checkout call settings and wiring

**Files:**

- Modify: `backend/frontend/src/lib/gameSettings.ts` (type, defaults, schema)
- Modify: `backend/frontend/src/lib/accountSettings.ts` (`ACCOUNT_KEYS`, `accountPart`)
- Modify: `schema/api-v1.yaml` (the preferences object next to `callerOn`, ~line 2234), then `npm run gen:api` at the repo root
- Modify: `backend/frontend/src/lib/components/settings/CallerDefaults.svelte`
- Modify: `backend/frontend/src/lib/components/SettingsDrawer.svelte` (the X01 Caller section, ~line 188)
- Modify: `backend/frontend/src/routes/GameDisplay.svelte` (~line 168)
- Test: `backend/frontend/src/lib/__tests__/gameSettings.test.ts`, `accountSettings.test.ts`

**Interfaces:**

- Consumes: `checkoutFor`, `requirePart`, `createCheckoutMemory` (Task 3).
- Produces: `GameSettings.callerCheckouts: boolean` (default `true`), `GameSettings.callerCheckoutRepeat: boolean` (default `true`), both account-wide.

- [ ] **Step 1: Write the failing tests** — in `gameSettings.test.ts` add:

```ts
it('checkout calls are on by default and repeat by default', () => {
  const s = parseSettings({})
  expect(s.callerCheckouts).toBe(true)
  expect(s.callerCheckoutRepeat).toBe(true)
})
```

(Use the file's existing parse helper; read the top of the test file for its name.) In `accountSettings.test.ts`, if a test lists the account keys or round-trips `accountPart`, add the two keys there.

- [ ] **Step 2: Run, expect failure** — `cd backend/frontend && npx vitest run src/lib/__tests__/gameSettings.test.ts src/lib/__tests__/accountSettings.test.ts` → FAIL.

- [ ] **Step 3: Implement settings**

`gameSettings.ts`, after `callerVoice` in the type:

```ts
  /** X01: the caller says what the next thrower requires when they can finish ("You require 121"). */
  callerCheckouts: boolean
  /** X01: the checkout call is said again while the thrower's score stays the same (after a bust or a no-score visit). */
  callerCheckoutRepeat: boolean
```

defaults `callerCheckouts: true, callerCheckoutRepeat: true,`; schema `callerCheckouts: flag(d.callerCheckouts), callerCheckoutRepeat: flag(d.callerCheckoutRepeat),`.

`accountSettings.ts`: add `'callerCheckouts', 'callerCheckoutRepeat',` after `'callerVoice'` in `ACCOUNT_KEYS`, and `callerCheckouts: s.callerCheckouts, callerCheckoutRepeat: s.callerCheckoutRepeat,` in `accountPart`.

`schema/api-v1.yaml`, after `callerVoice`'s block in the preferences properties:

```yaml
        callerCheckouts: { type: boolean, description: 'X01: the caller says "You require N" when the next thrower can finish' }
        callerCheckoutRepeat: { type: boolean, description: 'The checkout call is said again while the score stays the same' }
```

Run `npm run gen:api` at the repo root (regenerates `backend/src/schema/*` and the SPA's `lib/api/*`; don't edit those by hand).

- [ ] **Step 4: Implement the switches** — `CallerDefaults.svelte`, after the `pref-callerOn` switch:

```svelte
  {#if settings.callerOn}
    <SettingSwitch
      id="pref-callerCheckouts"
      label="Checkout calls"
      sub="“You require 121” when the next thrower can finish"
      bind:checked={settings.callerCheckouts}
    />
    {#if settings.callerCheckouts}
      <SettingSwitch
        id="pref-callerCheckoutRepeat"
        label="Repeat checkout calls"
        sub="Say it again while the score stays the same"
        bind:checked={settings.callerCheckoutRepeat}
      />
    {/if}
  {/if}
```

`SettingsDrawer.svelte`, after the `setting-callerOn` switch, the same block with ids `setting-callerCheckouts` / `setting-callerCheckoutRepeat`.

- [ ] **Step 5: Wire it in `GameDisplay.svelte`** — import `checkoutFor, requirePart, createCheckoutMemory` from `$lib/caller/calls`; next to `const caller = createCaller(...)` add `let checkoutMemory = createCheckoutMemory()`; replace the caller block in the snapshot subscription with:

```ts
      if (next.x01 && settings.callerOn) {
        // A new session starts the checkout memory afresh too
        if (snapshot?.sessionId !== snap.sessionId) checkoutMemory = createCheckoutMemory()
        const call = callsFor(before.x01, next.x01)
        const checkout = settings.callerCheckouts ? checkoutFor(before.x01, next.x01) : null
        if (checkout && checkoutMemory(checkout, settings.callerCheckoutRepeat)) call.push(requirePart(checkout.remaining))
        if (call.length) void callerClips.then(c => c && caller.say(call, c))
      }
```

(`callsFor` returns `string[][]`; type `call` as `Call` (import the type) so the push type-checks.)

- [ ] **Step 6: Verify** — `cd backend/frontend && npx vitest run && npm run typecheck && npm run lint`; `cd backend && npx vitest run src/api/me.test.ts` (with `TEST_DATABASE_URL`) → PASS.

- [ ] **Step 7: Commit** — `feat(caller): say checkout calls in x01, with on and repeat settings` (closes #132 in the body: `Closes #132`).

---

### Task 5: `require_N` and `you_require` in packs, and en-adam's clips

**Files:**

- Modify: `backend/src/caller/pack.ts` (`isCallerKey`, `keyFromName`)
- Test: `backend/src/caller/pack.test.ts`
- Modify: `scripts/caller-voice/lines.json`, `scripts/caller-voice/README.md` (the key list under Running)
- Generated: `backend/frontend/public/voices/en-adam/require_*.mp3`, `you_require.mp3`, `manifest.json`

**Interfaces:**

- Produces: `isCallerKey('require_121') === true`, `isCallerKey('you_require') === true`, `keyFromName('you require.mp3') === 'you_require'`.

- [ ] **Step 1: Write the failing test** — in `pack.test.ts`, remove `'you_require'` from the rejected list on line 10 and add:

```ts
  it('takes checkout calls: require_1 to require_180 and the you_require lead-in', () => {
    for (const k of ['require_1', 'require_121', 'require_180', 'you_require']) expect(isCallerKey(k)).toBe(true)
    for (const k of ['require_0', 'require_181', 'require_07', 'require_']) expect(isCallerKey(k)).toBe(false)
    expect(keyFromName('you require.mp3')).toBe('you_require')
    expect(keyFromName('You-Require+2.mp3')).toBe('you_require')
  })
```

- [ ] **Step 2: Run, expect failure** — `cd backend && npx vitest run src/caller/pack.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `pack.ts`, add `'you_require'` to `SHOTS`, and in `isCallerKey`:

```ts
export function isCallerKey(key: string): boolean {
  if (/^(0|[1-9]\d?|1[0-7]\d|180)$/.test(key)) return true
  if (/^require_([1-9]\d?|1[0-7]\d|180)$/.test(key)) return true
  return /^(leg|set)_\d+$/.test(key) || SHOTS.has(key)
}
```

In `keyFromName`, fold the spaced spelling like the shots:

```ts
  if (key === 'you require') return 'you_require'
  return SPELLED.test(key) ? key.replace(/[_ ]/, '') : key
```

Update `keyFromName`'s JSDoc to mention "you require" → "you_require".

- [ ] **Step 4: Run** `cd backend && npx vitest run src/caller/` → PASS. Commit — `feat(caller): accept checkout call clips in voice packs`

- [ ] **Step 5: Add en-adam's lines** — with a one-off command (not committed), add to `lines.json` `"you_require": ["You require"]` and `"require_N": ["You require <number as lines.json says it>"]` for N 1–180:

```bash
cd scripts/caller-voice && node -e '
const fs = require("fs"); const l = JSON.parse(fs.readFileSync("lines.json", "utf8"))
l.you_require = ["You require"]
for (let n = 1; n <= 180; n++) { const t = l[String(n)][0].replace(/!$/, ""); l["require_" + n] = ["You require " + t[0].toLowerCase() + t.slice(1)] }
fs.writeFileSync("lines.json", JSON.stringify(l, null, 2) + "\n")'
node -e 'const l=require("./lines.json");console.log(l.require_121, l.require_1, l.you_require)'
```

Expected: `[ 'You require one hundred and twenty-one' ] [ 'You require one' ] [ 'You require' ]`.

- [ ] **Step 6: Generate the clips** — `cd scripts/caller-voice && npm install` (first run downloads the Kokoro model, a few hundred MB), then:

```bash
node generate.mjs you_require $(node -e 'console.log(Array.from({length:180},(_,i)=>"require_"+(i+1)).join(" "))')
```

Expected: "Wrote … clips". Check: `ls ../../backend/frontend/public/voices/en-adam | grep -c '^require_'` → 180; `du -sh ../../backend/frontend/public/voices/en-adam` well under 4 MB; spot-check durations with `nix shell nixpkgs#ffmpeg -c ffprobe -v error -show_entries format=duration -of csv=p=0 ../../backend/frontend/public/voices/en-adam/require_121.mp3` (about 1.5–3 s) and `you_require.mp3` (about 0.5–1 s). Update the README's key list ("…`leg_1`…`leg_15`, `bulling_start`, `and`, `you_require`, `require_1`…`require_180`").

- [ ] **Step 7: Commit** — `feat(caller): give en-adam checkout calls` (lines.json, README, the new clips, manifest.json; don't commit `node_modules`).

---

### Task 6: the Autodarts cutter

**Files:**

- Create: `backend/src/caller/autodarts.ts`
- Create: `backend/src/caller/mp3Fixture.ts` (test helper, like `zipFixture.ts`)
- Test: `backend/src/caller/autodarts.test.ts`

**Interfaces:**

- Produces:
  - `export interface AutodartsVoice { name: string; lang: string | null; total: number; clips: Record<string, Uint8Array> }` — `clips` keys already renamed (`gameon`, `gameshot`, `matchshot`), **not** filtered by `isCallerKey` (the caller of `cutAutodarts` filters).
  - `export function cutAutodarts(mp3: Uint8Array, table: unknown): AutodartsVoice` — throws `ZipError` with a user-facing message.
  - `export function mp3Frames(b: Uint8Array): { sampleRate: number; frames: { start: number; end: number }[] }`
  - Test helper `makeMp3(o?: { frames?: number; id3?: boolean; info?: boolean; tag?: boolean; mpeg2?: boolean }): Uint8Array` — 48 kHz, 128 kbps, stereo MPEG-1 Layer III frames of 384 bytes; frame `k`'s body is filled with the byte `k & 0xff` (an `Info` frame, if any, with `0xee`).

- [ ] **Step 1: Write the fixture** — `backend/src/caller/mp3Fixture.ts`:

```ts
// Tiny CBR MP3s built by hand for the Autodarts cutter's tests: 48 kHz, 128 kbps, stereo MPEG-1
// Layer III frames (384 bytes, 24 ms each). Not playable audio: frame k's body is the byte k & 0xff,
// so a test can tell which frames a slice holds.

const FRAME = 384

function frame(fill: number, mpeg2 = false): Uint8Array {
  const f = new Uint8Array(FRAME).fill(fill)
  // Sync, MPEG-1 (or MPEG-2) Layer III without CRC; 128 kbps, 48 kHz, no padding; stereo
  f.set([0xff, mpeg2 ? 0xf3 : 0xfb, 0x94, 0x00], 0)
  return f
}

export function makeMp3(o: { frames?: number; id3?: boolean; info?: boolean; tag?: boolean; mpeg2?: boolean } = {}): Uint8Array {
  const parts: Uint8Array[] = []
  if (o.id3) {
    // An ID3v2 header announcing 20 bytes of tag (syncsafe size), then the 20 bytes
    parts.push(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20]), new Uint8Array(20))
  }
  if (o.info) {
    const info = frame(0xee)
    info.set([0x49, 0x6e, 0x66, 0x6f], 4 + 32) // "Info" after the stereo side info
    parts.push(info)
  }
  for (let k = 0; k < (o.frames ?? 100); k++) parts.push(frame(k & 0xff, o.mpeg2))
  if (o.tag) parts.push(new Uint8Array(128).fill(0x20).fill(0x54, 0, 1).fill(0x41, 1, 2).fill(0x47, 2, 3)) // ID3v1 "TAG"
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
```

- [ ] **Step 2: Write the failing tests** — `backend/src/caller/autodarts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cutAutodarts, mp3Frames } from './autodarts.js'
import { makeMp3 } from './mp3Fixture.js'

const FRAME = 384
// 100 frames of 24 ms: 2400 ms of audio; the last clip ends at 2390 ms
const sprite = { '1': [0, 500], game_shot: [500, 700], require_2: [1200, 1190] }
const table = (mp3: Uint8Array, o: Record<string, unknown> = {}) => ({
  voice: 'dotty-floor-english',
  mp3: 'dotty-floor-english-Ab12.mp3',
  mp3Bytes: mp3.length,
  unit: 'ms',
  sprite,
  ...o,
})
const firstFrame = (clip: Uint8Array) => clip[4] // the fill byte after the header

describe('mp3Frames', () => {
  it('walks the frames, skipping an ID3 tag and the Info frame, stopping at an ID3v1 TAG', () => {
    const { sampleRate, frames } = mp3Frames(makeMp3({ id3: true, info: true, tag: true }))
    expect(sampleRate).toBe(48000)
    expect(frames).toHaveLength(100)
    expect(frames[0].start).toBe(30 + FRAME)
  })

  it('refuses what is not MPEG-1 Layer III', () => {
    expect(() => mp3Frames(makeMp3({ mpeg2: true }))).toThrow(/Not an Autodarts voice/)
    expect(() => mp3Frames(new Uint8Array(1000))).toThrow(/Not an Autodarts voice/)
  })
})

describe('cutAutodarts', () => {
  it('cuts each clip on frame boundaries, two frames early, rounded outward', () => {
    const mp3 = makeMp3({ info: true })
    const v = cutAutodarts(mp3, table(mp3))
    // "1": 0–500 ms → frames 0..20 (ceil(500 / 24) = 21), no room for a lead-in
    expect(v.clips['1'].length).toBe(21 * FRAME)
    expect(firstFrame(v.clips['1'])).toBe(0)
    // game_shot: 500–1200 ms → frames 20 − 2 = 18 up to 50
    expect(v.clips.gameshot.length).toBe(32 * FRAME)
    expect(firstFrame(v.clips.gameshot)).toBe(18)
    expect(v.clips.require_2.length).toBe((100 - 48) * FRAME)
  })

  it('renames the shots, keeps the rest, names the voice', () => {
    const mp3 = makeMp3()
    const v = cutAutodarts(mp3, table(mp3, { sprite: { ...sprite, game_on: [0, 100], game_shot_match: [100, 100], '0': [200, 100] } }))
    expect(Object.keys(v.clips).sort()).toEqual(['0', '1', 'gameon', 'gameshot', 'matchshot', 'require_2'])
    expect(v).toMatchObject({ name: 'Autodarts Dotty (English)', lang: 'en', total: 6 })
    expect(cutAutodarts(mp3, table(mp3, { voice: 'hware-floor-german' }))).toMatchObject({ name: 'Autodarts Hware (German)', lang: 'de' })
  })

  it('refuses a table for another MP3, timings that do not fit, and malformed tables', () => {
    const mp3 = makeMp3()
    expect(() => cutAutodarts(mp3, table(mp3, { mp3Bytes: mp3.length + 1 }))).toThrow(/different MP3/)
    expect(() => cutAutodarts(mp3, table(mp3, { sprite: { '1': [0, 2000] } }))).toThrow(/timings don't fit/)
    expect(() => cutAutodarts(mp3, table(mp3, { unit: 's' }))).toThrow(/Not an Autodarts voice table/)
    expect(() => cutAutodarts(mp3, table(mp3, { sprite: { '1': [-5, 100] } }))).toThrow(/Not an Autodarts voice table/)
    expect(() => cutAutodarts(mp3, 'nope')).toThrow(/Not an Autodarts voice table/)
  })
})
```

- [ ] **Step 3: Run, expect failure** — `cd backend && npx vitest run src/caller/autodarts.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement** — `backend/src/caller/autodarts.ts`:

```ts
// Autodarts' caller voices: one long MP3 (an audio sprite) and the table of where each clip sits in
// it, both saved by the player on play.autodarts.com (the SPA's bookmarklet zips them). The MP3 is
// cut on its own frame boundaries: no decoding, no re-encoding.
// Design: docs/superpowers/specs/2026-10-16-autodarts-voices-and-checkout-calls-design.md

import { z } from 'zod'
import { ZipError } from './zip.js'

export interface AutodartsVoice {
  name: string
  lang: string | null
  /** Clips in the table. */
  total: number
  /** Key → the clip's MP3 frames; shots renamed to our keys, nothing dropped yet. */
  clips: Record<string, Uint8Array>
}

const TableSchema = z.object({
  voice: z.string().regex(/^[a-z]+(-[a-z]+)+$/),
  mp3: z.string().min(1),
  mp3Bytes: z.number().int().positive(),
  unit: z.literal('ms'),
  sprite: z
    .record(z.string(), z.tuple([z.number().nonnegative(), z.number().positive()]))
    .refine(s => Object.keys(s).length > 0 && Object.keys(s).length <= 400),
})

const NOT_MP3 = 'Not an Autodarts voice file'
// MPEG-1 Layer III bitrates (kbps) and sample rates by their header index
const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const RATES = [44100, 48000, 32000]
// Frames before a clip's start: a frame's audio may begin in the up to 511 bytes before it (the bit
// reservoir), under two frames at 128 kbps. They decode inside the previous clip's padding
const LEAD_IN_FRAMES = 2
// How far the table's end may be from the audio's (seen: 36 ms, about the encoder's delay)
const END_SLACK_MS = 60
const RENAME: Record<string, string> = { game_on: 'gameon', game_shot: 'gameshot', game_shot_match: 'matchshot' }
const LANGS: Record<string, string> = { english: 'en', german: 'de' }

/** The audio frames of a CBR MPEG-1 Layer III file: after an ID3v2 tag, without the Info/Xing frame,
 *  up to the end or whatever isn't a frame (an ID3v1 tag). */
export function mp3Frames(b: Uint8Array): { sampleRate: number; frames: { start: number; end: number }[] } {
  let i = 0
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f)
    i = 10 + size + (b[5] & 0x10 ? 10 : 0)
  }
  const frames: { start: number; end: number }[] = []
  let sampleRate = 0
  while (i + 4 <= b.length) {
    const h = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
    if (h >>> 21 !== 0x7ff) break
    const bitrate = BITRATES[(h >>> 12) & 15]
    const rate = RATES[(h >>> 10) & 3]
    if (((h >>> 19) & 3) !== 3 || ((h >>> 17) & 3) !== 1 || !bitrate || !rate) throw new ZipError(NOT_MP3)
    if (sampleRate !== 0 && rate !== sampleRate) throw new ZipError(NOT_MP3)
    sampleRate = rate
    const end = i + Math.floor((144000 * bitrate) / rate) + ((h >>> 9) & 1)
    if (end > b.length) break
    frames.push({ start: i, end })
    i = end
  }
  if (frames.length === 0) throw new ZipError(NOT_MP3)
  // The first frame may be an Info/Xing header: it sits after the side info and holds no audio
  const f = frames[0].start
  const mono = ((b[f + 3] >>> 6) & 3) === 3
  const at = f + 4 + (b[f + 1] & 1 ? 0 : 2) + (mono ? 17 : 32)
  const tag = String.fromCharCode(...b.subarray(at, at + 4))
  if (tag === 'Info' || tag === 'Xing') frames.shift()
  if (frames.length === 0) throw new ZipError(NOT_MP3)
  return { sampleRate, frames }
}

/** Cuts an Autodarts voice MP3 into its clips by its table. */
export function cutAutodarts(mp3: Uint8Array, table: unknown): AutodartsVoice {
  const parsed = TableSchema.safeParse(table)
  if (!parsed.success) throw new ZipError('Not an Autodarts voice table')
  const t = parsed.data
  if (mp3.length !== t.mp3Bytes) throw new ZipError('This table belongs to a different MP3')
  const { sampleRate, frames } = mp3Frames(mp3)
  const frameMs = (1152 * 1000) / sampleRate
  const lastEnd = Math.max(...Object.values(t.sprite).map(([offset, duration]) => offset + duration))
  if (Math.abs(frames.length * frameMs - lastEnd) > END_SLACK_MS) throw new ZipError("The timings don't fit this MP3")

  const clips: Record<string, Uint8Array> = {}
  for (const [key, [offset, duration]] of Object.entries(t.sprite)) {
    const last = Math.min(frames.length, Math.max(1, Math.ceil((offset + duration) / frameMs)))
    const first = Math.min(last - 1, Math.max(0, Math.floor(offset / frameMs) - LEAD_IN_FRAMES))
    clips[RENAME[key] ?? key] = mp3.slice(frames[first].start, frames[last - 1].end)
  }
  const parts = t.voice.split('-')
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
  const language = parts[parts.length - 1]
  return {
    name: `Autodarts ${cap(parts[0])} (${cap(language)})`,
    lang: LANGS[language] ?? null,
    total: Object.keys(t.sprite).length,
    clips,
  }
}
```

- [ ] **Step 5: Run** `cd backend && npx vitest run src/caller/autodarts.test.ts` → PASS; `npm run typecheck && npm run lint` → clean.

- [ ] **Step 6: Commit** — `feat(caller): cut autodarts voice sprites into clips`

---

### Task 7: read Autodarts zips on upload, behind the flag

**Files:**

- Modify: `backend/src/caller/pack.ts` (`readPack` option, `autodartsVoice`)
- Modify: `backend/src/flags/definitions.ts`
- Modify: `backend/src/api/voices.ts` (upload handler)
- Test: `backend/src/caller/pack.test.ts`, `backend/src/api/voices.test.ts`, `backend/src/flags/flags.test.ts` (if it lists flag keys)

**Interfaces:**

- Consumes: `cutAutodarts` (Task 6), `makeMp3` (Task 6), `makeZip` (`zipFixture.ts`), `flagEnabled`, `loadFlagUser` (`backend/src/flags/index.ts`).
- Produces: `readPack(bytes: Uint8Array, fileName: string, opts?: { autodarts?: boolean }): Promise<ParsedPack>`; flag `caller.autodartsImport`.

- [ ] **Step 1: Write the failing tests** — in `pack.test.ts` (import `makeMp3` from `./mp3Fixture.js` and `makeZip` from `./zipFixture.js` if not already):

```ts
describe('readPack: Autodarts voices', () => {
  const mp3 = makeMp3()
  const json = JSON.stringify({
    voice: 'dotty-floor-english',
    mp3: 'dotty-floor-english-Ab12.mp3',
    mp3Bytes: mp3.length,
    unit: 'ms',
    sprite: { '1': [0, 500], game_shot: [500, 700], require_2: [1200, 1190], murmel: [100, 100] },
  })
  const zip = makeZip([
    { name: 'dotty-floor-english-Ab12.mp3', data: mp3, method: 0 },
    { name: 'dotty-floor-english-Ab12.json', data: json },
  ])

  it('cuts the MP3 by its table when Autodarts imports are on', async () => {
    const pack = await readPack(zip, 'dotty-floor-english-Ab12.zip', { autodarts: true })
    expect(pack).toMatchObject({ name: 'Autodarts Dotty (English)', lang: 'en', total: 4 })
    expect(Object.keys(pack.clips).sort()).toEqual(['1', 'gameshot', 'require_2'])
    expect(pack.clips.gameshot[0].mime).toBe('audio/mpeg')
  })

  it('reads it as an ordinary pack when they are off (and finds no clips)', async () => {
    await expect(readPack(zip, 'dotty-floor-english-Ab12.zip')).rejects.toThrow('No caller clips in this pack')
  })

  it('a pack with a .json and several clips is an ordinary pack', async () => {
    const pack = await readPack(
      makeZip([
        { name: '180.mp3', data: 'a' },
        { name: 'gameshot.mp3', data: 'b' },
        { name: 'notes.json', data: '{}' },
      ]),
      'mine.zip',
      { autodarts: true },
    )
    expect(Object.keys(pack.clips).sort()).toEqual(['180', 'gameshot'])
  })
})
```

In `api/voices.test.ts` (inside the DB-gated describe; follow how the file builds its app and signs in — read its first 80 lines), add a test that uploads the same zip twice: after `await setupFlags(new Set(['caller.autodartsImport']))` expect 201 and `name: 'Autodarts Dotty (English)'`; after `await setupFlags(new Set())` expect 400 with `error: 'No caller clips in this pack'`. Import `setupFlags` from `../flags/index.js`.

- [ ] **Step 2: Run, expect failure** — `cd backend && npx vitest run src/caller/pack.test.ts` → FAIL.

- [ ] **Step 3: Implement `readPack`** — in `pack.ts`, `import { cutAutodarts } from './autodarts.js'`, change the signature and add the branch right after the first `listEntries`:

```ts
export async function readPack(bytes: Uint8Array, fileName: string, opts: { autodarts?: boolean } = {}): Promise<ParsedPack> {
  let zip = bytes
  let entries = listEntries(zip).filter(e => !isJunk(e.name))
  if (opts.autodarts) {
    const voice = await autodartsVoice(zip, entries)
    if (voice) return voice
  }
  // …the rest unchanged
```

and below `readPack`:

```ts
/** An Autodarts voice zip (the bookmarklet's: one .mp3 and its .json table) cut into the caller's
 *  clips; null for any other zip. */
async function autodartsVoice(zip: Uint8Array, entries: ZipEntry[]): Promise<ParsedPack | null> {
  const sounds = entries.filter(e => SOUND.test(e.name))
  const table = entries.find(e => /\.json$/i.test(e.name))
  if (!table || sounds.length !== 1 || !/\.mp3$/i.test(sounds[0].name)) return null
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(await readEntry(zip, table, ENTRY_MAX)))
  } catch (err) {
    if (err instanceof ZipError) throw err
    throw new ZipError('Not an Autodarts voice table')
  }
  const voice = cutAutodarts(await readEntry(zip, sounds[0], ENTRY_MAX), json)
  const clips: Record<string, Clip[]> = {}
  for (const [key, bytes] of Object.entries(voice.clips)) if (isCallerKey(key)) clips[key] = [{ bytes, mime: MIME.mp3 }]
  if (Object.keys(clips).length === 0) throw new ZipError('No caller clips in this pack')
  return { name: voice.name, lang: voice.lang, total: voice.total, clips }
}
```

Add a line to the file's header comment: "A third shape, behind a flag: an Autodarts voice (one MP3 and its timing table; see autodarts.ts)."

- [ ] **Step 4: Add the flag** — in `definitions.ts`, after `matchmaking.enabled`:

```ts
    // Importing Autodarts' caller voices is tried by admins until it ships (FLAGS_ON=caller.autodartsImport for everyone)
    'caller.autodartsImport': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('caller.autodartsImport', isAdmin),
    },
```

- [ ] **Step 5: Use it in the upload route** — in `api/voices.ts`, `import { flagEnabled, loadFlagUser } from '../flags/index.js'` and change the upload handler's read:

```ts
          // Autodarts voices only for users the flag is on for; for others such a zip has no caller clips
          const read = async () =>
            readPack(orEmpty(req.body), req.query.name, {
              autodarts: await flagEnabled('caller.autodartsImport', await loadFlagUser(db, req.userId)),
            })
          const pack = await runImport(req, read, { kind: 'upload' })
```

- [ ] **Step 6: Run** — `cd backend && npx vitest run src/caller/ src/flags/` and `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test npx vitest run src/api/voices.test.ts src/api/ofrep.test.ts` → PASS (update a flag-key list in `flags.test.ts`/`ofrep.test.ts` if one asserts the exact set). `npm run typecheck && npm run lint`.

- [ ] **Step 7: Commit** — `feat(caller): import autodarts voice zips behind caller.autodartsImport`

---

### Task 8: trim edge silence in the player

**Files:**

- Modify: `backend/frontend/src/lib/caller/player.ts`
- Test: `backend/frontend/src/lib/__tests__/callerPlayer.test.ts`

**Interfaces:**

- Produces: `export function audibleRange(channels: Float32Array[], threshold: number, margin: number): [number, number]`.

- [ ] **Step 1: Write the failing tests** — in `callerPlayer.test.ts`:

```ts
describe('audibleRange', () => {
  const clip = (...runs: [number, number][]) => Float32Array.from(runs.flatMap(([v, n]) => Array<number>(n).fill(v)))

  it('trims quiet edges only, keeping a pause inside and a margin either side', () => {
    const mono = clip([0, 1000], [0.5, 100], [0, 300], [0.5, 100], [0.001, 500])
    expect(audibleRange([mono], 0.01, 20)).toEqual([980, 1520])
  })

  it('counts a sample loud on any channel, and keeps a clip that is all quiet', () => {
    expect(audibleRange([clip([0, 50]), clip([0, 10], [0.2, 5], [0, 35])], 0.01, 0)).toEqual([10, 15])
    expect(audibleRange([clip([0, 50])], 0.01, 5)).toEqual([0, 50])
  })
})
```

- [ ] **Step 2: Run, expect failure** — `cd backend/frontend && npx vitest run src/lib/__tests__/callerPlayer.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `player.ts`, above `createCaller`:

```ts
// Quieter than this on every channel is padding: about −50 dBFS
const QUIET = 10 ** (-50 / 20)
// Kept either side of the sound, so a soft start or a breath isn't clipped
const MARGIN_S = 0.02

/** The samples [start, end) to keep: quiet edges trimmed (below `threshold` on every channel), with
 *  `margin` samples left either side. Pauses inside stay; a clip that is all quiet is kept whole. */
export function audibleRange(channels: Float32Array[], threshold: number, margin: number): [number, number] {
  const n = channels[0]?.length ?? 0
  const loud = (i: number) => channels.some(c => Math.abs(c[i]) >= threshold)
  let start = 0
  while (start < n && !loud(start)) start++
  if (start === n) return [0, n]
  let end = n
  while (end > start && !loud(end - 1)) end--
  return [Math.max(0, start - margin), Math.min(n, end + margin)]
}

/** A decoded clip without its silent padding (packs pad clips; Autodarts' up to 0.35 s). */
function trimmed(ctx: AudioContext, b: AudioBuffer): AudioBuffer {
  const channels = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i))
  const [start, end] = audibleRange(channels, QUIET, Math.round(MARGIN_S * b.sampleRate))
  if (start === 0 && end === b.length) return b
  const out = ctx.createBuffer(b.numberOfChannels, end - start, b.sampleRate)
  channels.forEach((c, i) => {
    out.copyToChannel(c.subarray(start, end), i)
  })
  return out
}
```

and in `load`, `return trimmed(ctx, await ctx.decodeAudioData(data))`. Update the file's header comment: "…Each URL is fetched, decoded and trimmed of silent edges once; …".

- [ ] **Step 4: Run** `cd backend/frontend && npx vitest run src/lib/__tests__/callerPlayer.test.ts` → PASS. If the existing tests' fake `decodeAudioData` returns an object without `getChannelData`/`numberOfChannels`, extend that fake (e.g. `numberOfChannels: 1, length: n, sampleRate: 22050, getChannelData: () => new Float32Array(n).fill(0.5)`) rather than guarding the code. `npm run typecheck && npm run lint`.

- [ ] **Step 5: Commit** — `feat(caller): trim silent edges off clips before playing`

---

### Task 9: the bookmarklet

**Files:**

- Create: `backend/frontend/src/lib/caller/autodartsVoices.js`
- Create: `backend/frontend/src/lib/caller/bookmarklet.ts`
- Test: `backend/frontend/src/lib/__tests__/autodartsVoices.test.ts`

**Interfaces:**

- Produces: `autodartsVoices.js` default export `async function getAutodartsVoices(load = url => import(url)): Promise<string[]>` (one report line per voice; runs on play.autodarts.com). `bookmarklet.ts` exports `consoleSnippet: string` and `bookmarkletHref: string`.

- [ ] **Step 1: Write the failing test** — `autodartsVoices.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import getAutodartsVoices from '../caller/autodartsVoices.js'
import { bookmarkletHref, consoleSnippet } from '../caller/bookmarklet.js'

const ORIGIN = 'https://play.autodarts.com'
const files: Record<string, string | Uint8Array> = {
  [`${ORIGIN}/assets/index-x1.js`]: 'a="assets/dotty-floor-english-Ab12.mp3";b=()=>import("./dotty-floor-english-Cd34.js");c="hware-floor-english-Ef56.js"',
  [`${ORIGIN}/assets/dotty-floor-english-Ab12.mp3`]: new Uint8Array([1, 2, 3, 4]),
}

function page() {
  const downloads: { name: string; blob: Blob }[] = []
  const blobs = new Map<string, Blob>()
  vi.stubGlobal('location', { origin: ORIGIN })
  vi.stubGlobal('fetch', async (url: string) => new Response(files[url] ?? '', { status: files[url] ? 200 : 404 }))
  vi.stubGlobal('alert', vi.fn())
  vi.stubGlobal('document', {
    // The entry script; performance stays Node's own (vitest relies on it), which lists no resources
    querySelectorAll: (sel: string) => (sel === 'script[src]' ? [{ src: `${ORIGIN}/assets/index-x1.js` }] : []),
    body: { append: () => {} },
    createElement: () => {
      const a = { href: '', download: '', click: () => downloads.push({ name: a.download, blob: blobs.get(a.href)! }), remove: () => {} }
      return a
    },
  })
  vi.spyOn(URL, 'createObjectURL').mockImplementation(b => {
    const u = `blob:${blobs.size}`
    blobs.set(u, b as Blob)
    return u
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  return downloads
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getAutodartsVoices', () => {
  it('zips each voice: its MP3 and a JSON table from the chunk', async () => {
    const downloads = page()
    const load = vi.fn(async (url: string) => {
      expect(url).toBe(`${ORIGIN}/assets/dotty-floor-english-Cd34.js`)
      return { default: { '1': [0, 654], '2': [654, 498] }, game_on: [1152, 904], other: 'x' }
    })
    const report = await getAutodartsVoices(load)
    expect(report).toEqual(['dotty-floor-english: 3 clips', 'hware-floor-english: no mp3 found'])
    expect(downloads.map(d => d.name)).toEqual(['dotty-floor-english-Ab12.zip'])
    const bytes = new Uint8Array(await downloads[0].blob.arrayBuffer())
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('PK\x03\x04')).toBe(true)
    expect(text).toContain('dotty-floor-english-Ab12.mp3')
    expect(text).toContain('"mp3Bytes":4')
    expect(text).toContain('"game_on":[1152,904]')
  })

  it('says so when it finds no voices', async () => {
    page()
    files[`${ORIGIN}/assets/index-x1.js`] = 'nothing here'
    expect(await getAutodartsVoices(vi.fn())).toEqual([])
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('no Autodarts voices found'))
  })
})

describe('bookmarklet', () => {
  it('is the same code as a javascript: URL that parses', () => {
    expect(bookmarkletHref.startsWith('javascript:')).toBe(true)
    expect(decodeURIComponent(bookmarkletHref.slice('javascript:'.length))).toBe(consoleSnippet)
    expect(() => new Function(consoleSnippet)).not.toThrow()
    expect(consoleSnippet).not.toContain('export default')
  })
})
```

- [ ] **Step 2: Run, expect failure** — `cd backend/frontend && npx vitest run src/lib/__tests__/autodartsVoices.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement `autodartsVoices.js`** (plain JS: the SPA ships its text as the bookmarklet, so it must not import anything):

```js
// The "Get Autodarts voices" bookmarklet (the Caller voices card in Settings). It runs on
// play.autodarts.com, in the player's own logged-in tab: finds each caller voice's MP3 and the chunk
// with its timings, reads the timings from the chunk's exports, and downloads one zip per voice (the
// MP3 and a JSON table) to import in dartcade. Self-contained: the SPA turns this file's text into the
// bookmarklet, so it can't import anything. Design:
// docs/superpowers/specs/2026-10-16-autodarts-voices-and-checkout-calls-design.md
export default async function getAutodartsVoices(load = url => import(url)) {
  const NAME = /((?:dotty|hware)-floor-[a-z]+)-([\w-]{4,}?)\.(mp3|js)\b/g
  // Where the names are: the page's scripts and every JS file it has loaded
  const sources = new Set([
    ...[...document.querySelectorAll('script[src]')].map(s => s.src),
    ...[...document.querySelectorAll('link[rel=modulepreload]')].map(l => l.href),
    ...performance
      .getEntriesByType('resource')
      .map(e => e.name)
      .filter(u => /\.js(\?|$)/.test(u)),
  ])
  const found = {}
  for (const src of sources) {
    if (!src.startsWith(location.origin)) continue
    let text = ''
    try {
      text = await (await fetch(src)).text()
    } catch {
      continue
    }
    for (const m of text.matchAll(NAME)) (found[m[1]] ??= {})[m[3]] = new URL(`${m[1]}-${m[2]}.${m[3]}`, src).href
  }
  if (Object.keys(found).length === 0) {
    alert('dartcade: no Autodarts voices found. Play a caller voice once in Autodarts, then try again.')
    return []
  }

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = bytes => {
    let c = 0xffffffff
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  // A zip of stored (not deflated) files: an MP3 doesn't shrink
  const zip = entries => {
    const enc = new TextEncoder()
    const local = []
    const central = []
    let offset = 0
    for (const { name, bytes } of entries) {
      const n = enc.encode(name)
      const crc = crc32(bytes)
      const lh = new DataView(new ArrayBuffer(30))
      lh.setUint32(0, 0x04034b50, true)
      lh.setUint16(4, 20, true)
      lh.setUint32(14, crc, true)
      lh.setUint32(18, bytes.length, true)
      lh.setUint32(22, bytes.length, true)
      lh.setUint16(26, n.length, true)
      local.push(lh, n, bytes)
      const ch = new DataView(new ArrayBuffer(46))
      ch.setUint32(0, 0x02014b50, true)
      ch.setUint16(4, 20, true)
      ch.setUint16(6, 20, true)
      ch.setUint32(16, crc, true)
      ch.setUint32(20, bytes.length, true)
      ch.setUint32(24, bytes.length, true)
      ch.setUint16(28, n.length, true)
      ch.setUint32(42, offset, true)
      central.push(ch, n)
      offset += 30 + n.length + bytes.length
    }
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true)
    end.setUint16(8, entries.length, true)
    end.setUint16(10, entries.length, true)
    end.setUint32(12, central.reduce((s, p) => s + p.byteLength, 0), true)
    end.setUint32(16, offset, true)
    return new Blob([...local, ...central, end], { type: 'application/zip' })
  }
  const save = (blob, name) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  }
  const isClip = v => Array.isArray(v) && v.length >= 2 && v.every(n => typeof n === 'number')

  const report = []
  for (const [voice, { mp3, js }] of Object.entries(found)) {
    if (!mp3 || !js) {
      report.push(`${voice}: no ${mp3 ? 'timings' : 'mp3'} found`)
      continue
    }
    try {
      // The chunk's default export maps scores to [offset, duration]; the other calls are exports of their own
      const mod = await load(js)
      const sprite = {}
      for (const [k, v] of Object.entries(mod.default ?? {})) if (isClip(v)) sprite[k] = v.slice(0, 2)
      for (const [k, v] of Object.entries(mod)) if (k !== 'default' && isClip(v)) sprite[k] = v.slice(0, 2)
      const audio = new Uint8Array(await (await fetch(mp3)).arrayBuffer())
      const mp3Name = mp3.split('/').pop()
      const stem = mp3Name.replace(/\.mp3$/, '')
      const table = JSON.stringify({ voice, mp3: mp3Name, mp3Bytes: audio.length, unit: 'ms', sprite })
      save(
        zip([
          { name: mp3Name, bytes: audio },
          { name: `${stem}.json`, bytes: new TextEncoder().encode(table) },
        ]),
        `${stem}.zip`,
      )
      report.push(`${voice}: ${Object.keys(sprite).length} clips`)
    } catch (err) {
      console.error('[dartcade]', voice, err)
      report.push(`${voice}: failed (${err instanceof Error ? err.message : String(err)})`)
    }
  }
  alert(`dartcade:\n${report.join('\n')}`)
  return report
}
```

Note the test expects `'hware-floor-english: no mp3 found'` — only its `.js` name is in the bundle.

- [ ] **Step 4: Implement `bookmarklet.ts`**:

```ts
// The "Get Autodarts voices" bookmarklet: autodartsVoices.js's text (?raw: the build leaves it as
// written) as one expression, for the console, and as a javascript: URL, for the bookmarks bar.
import source from './autodartsVoices.js?raw'

/** The code to paste into the browser console on play.autodarts.com. */
export const consoleSnippet = `(${source.replace(/^export default /m, '')})()`
/** The same code as a bookmark's URL. */
export const bookmarkletHref = `javascript:${encodeURIComponent(consoleSnippet)}`
```

(The header comments end up inside the parentheses, each on its own line, which is valid JS. If `?raw` doesn't type-check, check that `vite/client` types are included in the SPA's tsconfig; they normally are.)

- [ ] **Step 5: Run** `cd backend/frontend && npx vitest run src/lib/__tests__/autodartsVoices.test.ts && npm run typecheck && npm run lint` → PASS (if ESLint objects to the plain `.js` file's globals, give it the browser globals the repo's ESLint config already uses for `.js`, or an `/* eslint-env browser */`-style config entry matching the existing setup).

- [ ] **Step 6: Commit** — `feat(caller): add the get autodarts voices bookmarklet`

---

### Task 10: the guide in Settings, and the docs

**Files:**

- Modify: `backend/frontend/src/lib/components/settings/CallerVoices.svelte`
- Modify: `AGENTS.md` (the caller row of "Where to look")

**Interfaces:**

- Consumes: `bookmarkletHref`, `consoleSnippet` (Task 9), `flag(key)` from `$lib/flags`.

- [ ] **Step 1: Add the guide** — in `CallerVoices.svelte`'s script: `import { flag } from '$lib/flags'`, `import { bookmarkletHref, consoleSnippet } from '$lib/caller/bookmarklet'`, `const autodartsOn = flag('caller.autodartsImport')`, and `let copied = $state(false)`. Inside `{#if importsOn}`, after the upload/result block and before the format hint `<p>`:

```svelte
      {#if $autodartsOn}
        <div class="flex flex-col gap-2">
          <span class="text-[14px] font-semibold">Import Autodarts voices</span>
          <ol class="m-0 pl-5 flex flex-col gap-1 text-[13px] leading-[1.5] text-text-muted">
            <li>
              Drag
              <!-- A bookmarklet: dragged to the bookmarks bar, not clicked here -->
              <a
                href={bookmarkletHref}
                onclick={e => {
                  e.preventDefault()
                }}
                class="font-semibold text-accent cursor-grab">Get Autodarts voices</a
              >
              to your bookmarks bar.
            </li>
            <li>Open play.autodarts.com, signed in, and click the bookmark. If a voice is missing, play it once in Autodarts first.</li>
            <li>Drop each downloaded .zip here, one at a time.</li>
          </ol>
          <details class="text-[13px] text-text-muted">
            <summary class="cursor-pointer min-h-10 flex items-center">Bookmarks blocked? Paste the code into the console instead</summary>
            <div class="flex flex-col gap-2">
              <pre class="m-0 max-h-40 overflow-auto p-3 rounded-[9px] bg-bg border border-line-chip font-mono text-[11px] whitespace-pre-wrap break-all">{consoleSnippet}</pre>
              <Button
                type="button"
                variant="key"
                class="self-start h-10 px-4 rounded-[9px]"
                onclick={async () => {
                  await navigator.clipboard.writeText(consoleSnippet)
                  copied = true
                }}>{copied ? 'Copied' : 'Copy code'}</Button
              >
            </div>
          </details>
          <span class="text-[12px] leading-[1.45] text-text-dim"
            >Autodarts' voices stay yours: they're imported to your account only and never shared.</span
          >
        </div>
      {/if}
```

Also extend the format hint `<p>` with the checkout clip: "…`busted.mp3`, `require_121.mp3`. Missing clips fall back to the built-in voice." (Use the same `<span class="font-mono text-ink-2">` markup as its siblings.)

- [ ] **Step 2: Update AGENTS.md** — in the "Settings page and the caller" row, after "voice packs on the server in `backend/src/caller/`", add: "(`autodarts.ts` cuts an Autodarts voice MP3 by its timing table, behind `caller.autodartsImport`; the bookmarklet that fetches them is `lib/caller/autodartsVoices.js`, turned into a link in `lib/caller/bookmarklet.ts`)"; and after "what the caller says" mention "checkout calls (`checkoutFor`, `requirePart`)".

- [ ] **Step 3: Verify** — `cd backend/frontend && npm run typecheck && npm run lint && npx vitest run`; `npm run format` at the root. Then run the dev stack check: with `scripts/dev.sh` running (or the already running `dartcade-dev-*` containers serving this worktree is NOT guaranteed — if they serve the main checkout, start Vite from this worktree on another port: `cd backend/frontend && npx vite --port 5174`, proxying to the dev backend on :3000), sign in as the dev admin (`admin@dartcade.local`) and open `#/settings/caller`: the "Import Autodarts voices" section shows; as a non-admin it doesn't. Take a screenshot if a browser tool is available.

- [ ] **Step 4: Commit** — `feat(caller): guide autodarts voice imports in settings` (AGENTS.md change in the same commit, or a separate `docs(agents): …` commit).

---

### Task 11: check against the real files (manual, not committed)

**Files:** none committed. Scratch script in the session scratchpad.

- [ ] **Step 1:** Write a scratch TS script (run with `npx tsx` from `backend/`) that imports `cutAutodarts` and `readPack`, reads `~/Downloads/dotty-floor-english.mp3`, takes the `dotty-english` entry of `~/.claude/uploads/1cdb7a0f-bf70-4920-bd01-90de4fdbc783/62329078-sprite-tables.json` and adds `voice: 'dotty-floor-english'`, `mp3`, `mp3Bytes: <file size>`, and cuts it.
- [ ] **Step 2:** Compare with the reference zip `~/.claude/uploads/1cdb7a0f-bf70-4920-bd01-90de4fdbc783/8dddaf08-dotty-english.zip` (read with `listEntries`/`readEntry` from `src/caller/zip.ts`): the key set of our clips filtered by `isCallerKey` equals the reference's `.mp3` names (minus `.mp3`); for every key our clip's duration (frames × 24 ms) is ≥ the reference clip's duration (reference clips are MPEG-2 Layer III 22.05 kHz mono: 576 samples per frame — count frames with the same header walk adapted for MPEG-2, or skip ID3 and divide bytes by the frame size for its bitrate). Report any key where ours is shorter.
- [ ] **Step 3:** If the Hware and Dotty German MP3s are available (ask the user; they can run the bookmarklet and drop the zips), repeat for them with `readPack(zip, name, { autodarts: true })`.
- [ ] **Step 4:** On the dev stack with the flag on (admin), import the Dotty zip through Settings, pick it as the voice, play a short X01 game on the keypad, and listen for: score calls, "game shot · and the · leg 2", and "… you require 121". The user does the listening; report what was checked.
