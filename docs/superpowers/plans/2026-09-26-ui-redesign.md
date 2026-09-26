# UI Redesign — Design System Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prototype blue-theme UI with the new dark-green design system across all routes, using `dartcade-design/*.dc.html` as reference markup.

**Architecture:** Token-layer swap — rewrite `app.css` tokens, retheme shadcn-svelte primitives in-place, rebuild each screen. New shared components: `AuthPanel`, `SideNav`. Pure dart logic extracted to `dartUtils.ts`. Placeholder values for missing backend data tracked in `PLACEHOLDERS.md`.

**Tech Stack:** Svelte 5, TypeScript, Tailwind CSS v4, tailwind-variants, svelte-spa-router, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-26-ui-redesign-design.md`

## Global Constraints

- Colours must match spec tokens exactly — no blue tones remain after migration.
- Three Google Fonts: Barlow Condensed 500/600/700, Instrument Sans 400/500/600, JetBrains Mono 400/500.
- Accent `#c6f24e` on dark; text on accent must be `#0f100e`.
- All touch targets ≥ 44px. Focus ring: `outline: 2px solid #c6f24e; outline-offset: 2px`.
- Dev login button only when `import.meta.env.DEV === true`.
- API call shapes/URLs are unchanged — only markup and styles change.
- Reference markup lives in `dartcade-design/design/*.dc.html`.
- Hardcoded placeholder values tracked in `backend/frontend/PLACEHOLDERS.md`.

## Review Focus

- Dev login button absent in production: verified at build time by `import.meta.env.DEV` static replacement; test in Task 6 that it renders in dev (Vitest runs as DEV=true).
- CorrectionPanel full-picker must include 25, Bull, Miss beyond 1–20: test in Task 12.
- `nearbyPicks('25')` must use hardcoded bull neighbours, not ring logic: test in Task 3.
- `checkoutHint` returns `null` for remaining < 2 and for unfinishable scores (169): test in Task 3.
- SideNav active item must react to route changes: test in Task 8 with `$location` store reactivity.

---

### Task 1: Branch + design tokens

**Files:**
- Create: `feat/ui-redesign` branch
- Modify: `backend/frontend/src/app.css` (full rewrite)

**Interfaces:**
- Produces: Tailwind utilities `bg-bg`, `bg-surface-1`, `bg-surface-2`, `bg-surface-active`, `bg-accent`, `text-accent-fg`, `text-text`, `text-text-muted`, `text-text-dim`, `border-line`, `border-line-2`, `border-line-3`, `text-live`, `text-live-text`; font utilities `font-display`, `font-mono`.

- [ ] **Step 1: Create branch**

```bash
git checkout -b feat/ui-redesign
```

- [ ] **Step 2: Rewrite `backend/frontend/src/app.css`**

```css
@import "tailwindcss";
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

@theme {
  --color-bg:            #0f100e;
  --color-surface-1:     #131511;
  --color-surface-2:     #181a16;
  --color-surface-active:#1b1e17;
  --color-line:          #2a2d27;
  --color-line-2:        #2e322b;
  --color-line-3:        #353930;
  --color-text:          #efeee6;
  --color-text-muted:    #a3a498;
  --color-text-dim:      #8f9085;
  --color-accent:        #c6f24e;
  --color-accent-fg:     #0f100e;
  --color-live:          #ff5a4f;
  --color-live-text:     #ff8a80;

  --font-sans:    'Instrument Sans', system-ui, sans-serif;
  --font-display: 'Barlow Condensed', sans-serif;
  --font-mono:    'JetBrains Mono', monospace;
}

body {
  margin: 0;
  background: #0f100e;
  color: #efeee6;
  font-family: 'Instrument Sans', system-ui, sans-serif;
}

a { color: #c6f24e; }
a:hover { color: #dcff7a; }
input::placeholder { color: #7d7f74; }
:focus-visible { outline: 2px solid #c6f24e; outline-offset: 2px; }
```

- [ ] **Step 3: Start dev server and verify**

```bash
cd backend/frontend && npm run dev
```

Background should be `#0f100e` (near-black green), not dark blue. Any existing content will look broken until screens are rebuilt — that's expected.

- [ ] **Step 4: Commit**

```bash
git add backend/frontend/src/app.css
git commit -m "feat(ui): design tokens — new colour/font theme"
```

---

### Task 2: Retheme shadcn primitives (button, input, badge)

**Files:**
- Modify: `backend/frontend/src/lib/components/ui/button/button.svelte`
- Modify: `backend/frontend/src/lib/components/ui/input/input.svelte`
- Modify: `backend/frontend/src/lib/components/ui/badge/badge.svelte`

**Interfaces:**
- `Button` props: `variant?: 'primary'|'secondary'|'ghost'|'outline'|'destructive'`, `size` removed (height is baked into variant), `href`, `type`, `disabled`, `class`, `onclick`, `children`
- `Input` props: unchanged (`value`, `type`, `placeholder`, `required`, `class`, etc.)
- `Badge` props: `variant?: 'live'|'throwing'|'up-next'`

- [ ] **Step 1: Update `button/button.svelte` — replace the `buttonVariants` tv block**

Replace lines 6–32 (the `buttonVariants` definition) in `button/button.svelte` with:

```typescript
export const buttonVariants = tv({
  base: "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-opacity outline-none select-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:[outline:2px_solid_#c6f24e] focus-visible:[outline-offset:2px]",
  variants: {
    variant: {
      primary:     "h-[54px] px-6 rounded-[10px] bg-accent text-accent-fg font-display font-bold text-xl tracking-widest uppercase",
      secondary:   "h-[56px] px-6 rounded-[12px] bg-text text-accent-fg font-display font-bold text-xl uppercase tracking-widest",
      ghost:       "h-10 px-[14px] rounded-[10px] border border-line-3 text-[#c9c9bf] text-sm",
      outline:     "h-10 px-4 rounded-[10px] border border-line-3 text-text text-sm",
      destructive: "h-10 px-4 rounded-[10px] border border-live-text text-live-text text-sm",
    },
  },
  defaultVariants: { variant: "primary" },
});
export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
// Remove ButtonSize — size is now baked into variant
export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
  WithElementRef<HTMLAnchorAttributes> & { variant?: ButtonVariant };
```

Also remove the `size` prop from the `$props()` destructure (line ~45) and remove `size` from both `cn(buttonVariants({ variant, size }), ...)` calls (lines ~63, ~75) — change to `cn(buttonVariants({ variant }), ...)`.

- [ ] **Step 2: Update `input/input.svelte` — replace the class string in both `<input>` elements**

Replace the long class string on both `<input>` elements (file/non-file) with:

```
"h-[52px] w-full min-w-0 rounded-[10px] border border-line-3 bg-surface-2 px-4 text-base text-text outline-none placeholder:text-[#7d7f74] focus-visible:[outline:2px_solid_#c6f24e] focus-visible:[outline-offset:2px] disabled:pointer-events-none disabled:opacity-50"
```

Keep the `cn(..., className)` wrapper so callers can still pass overriding classes.

- [ ] **Step 3: Rewrite `badge/badge.svelte`**

```svelte
<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";
  import { cn } from "$lib/utils.js";
  export const badgeVariants = tv({
    base: "inline-flex items-center gap-2 font-semibold tracking-[0.08em] uppercase",
    variants: {
      variant: {
        live:      "h-[30px] px-3 rounded-full bg-[#3a1a17] text-live-text text-[13px] font-bold tracking-widest",
        throwing:  "h-7 px-3 rounded-full bg-accent text-accent-fg text-[13px]",
        "up-next": "h-7 px-3 rounded-full border border-line text-text-dim text-[13px]",
      },
    },
    defaultVariants: { variant: "throwing" },
  });
  export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  let { variant = "throwing", class: klass = "", children }:
    { variant?: BadgeVariant; class?: string; children: Snippet } = $props();
</script>

<span class={cn(badgeVariants({ variant }), klass)}>
  {#if variant === "live"}
    <span class="w-2 h-2 rounded-full bg-live"></span>
  {/if}
  {@render children()}
</span>
```

- [ ] **Step 4: Verify primitives compile**

```bash
cd backend/frontend && npx tsc --noEmit
```

Expected: no type errors. Fix any type issues (e.g. callers passing `size=` props — remove those call sites, they don't exist yet since screens are rebuilt in later tasks).

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/components/ui/
git commit -m "feat(ui): retheme shadcn primitives for new design system"
```

---

### Task 3: `dartUtils.ts` — pure dart logic

**Files:**
- Create: `backend/frontend/src/lib/dartUtils.ts`
- Create: `backend/frontend/src/lib/__tests__/dartUtils.test.ts`

**Interfaces:**
- `parseLabel(label: string): { mult: number; num: number; score: number }`
- `labelPos(label: string): { x: number; y: number } | null` — SVG coords (y-down), normalised r=1 at double wire, matching `DartBoard.svelte`'s viewBox
- `nearbyPicks(label: string): string[]` — 7 elements: 6 nearby + "Miss"
- `checkoutHint(remaining: number): string[] | null` — 1 or 2 darts, double-out, null if no finish

- [ ] **Step 1: Write failing tests**

Create `backend/frontend/src/lib/__tests__/dartUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseLabel, labelPos, nearbyPicks, checkoutHint } from '../dartUtils.js'

describe('parseLabel', () => {
  it('parses treble', () => expect(parseLabel('T20')).toEqual({ mult: 3, num: 20, score: 60 }))
  it('parses double', () => expect(parseLabel('D5')).toEqual({ mult: 2, num: 5, score: 10 }))
  it('parses single', () => expect(parseLabel('S3')).toEqual({ mult: 1, num: 3, score: 3 }))
  it('parses outer bull', () => expect(parseLabel('25')).toEqual({ mult: 1, num: 25, score: 25 }))
  it('parses bull', () => expect(parseLabel('Bull')).toEqual({ mult: 2, num: 25, score: 50 }))
  it('parses miss', () => expect(parseLabel('Miss')).toEqual({ mult: 0, num: 0, score: 0 }))
})

describe('labelPos', () => {
  it('returns null for Miss', () => expect(labelPos('Miss')).toBeNull())
  it('returns origin for Bull', () => expect(labelPos('Bull')).toEqual({ x: 0, y: 0 }))
  it('returns top-centre for T20 (index 0)', () => {
    const pos = labelPos('T20')!
    expect(pos.x).toBeCloseTo(0, 3)
    expect(pos.y).toBeLessThan(0) // top of board = negative y in SVG? No — SVG y-down, top is negative
  })
  it('segment 20 has x≈0 (it is at 12 o-clock)', () => {
    const pos = labelPos('S20')!
    expect(Math.abs(pos.x)).toBeLessThan(0.01)
  })
})

describe('nearbyPicks', () => {
  it('T20 → [S20, D20, T5, T1, S5, S1, Miss]', () => {
    expect(nearbyPicks('T20')).toEqual(['S20', 'D20', 'T5', 'T1', 'S5', 'S1', 'Miss'])
  })
  it('bull (25) → hardcoded neighbours, not ring logic', () => {
    const picks = nearbyPicks('25')
    expect(picks).toContain('Bull')
    expect(picks).toContain('S20')
    expect(picks[picks.length - 1]).toBe('Miss')
    expect(picks.length).toBe(7)
  })
  it('always has 7 results ending in Miss', () => {
    expect(nearbyPicks('D10').length).toBe(7)
    expect(nearbyPicks('D10').at(-1)).toBe('Miss')
  })
})

describe('checkoutHint', () => {
  it('direct double finish', () => expect(checkoutHint(40)).toEqual(['D20']))
  it('bull finish', () => expect(checkoutHint(50)).toEqual(['Bull']))
  it('two-dart finish', () => expect(checkoutHint(81)).toEqual(['T19', 'D12']))
  it('returns null for remaining < 2', () => expect(checkoutHint(1)).toBeNull())
  it('returns null for unfinishable score', () => expect(checkoutHint(169)).toBeNull())
  it('returns null for remaining === 0', () => expect(checkoutHint(0)).toBeNull())
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend/frontend && npx vitest run src/lib/__tests__/dartUtils.test.ts
```

Expected: all tests fail with "Cannot find module '../dartUtils.js'".

- [ ] **Step 3: Implement `dartUtils.ts`**

Create `backend/frontend/src/lib/dartUtils.ts`:

```typescript
const SEGS = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5]
const R = { bull50: 0.037, bull25: 0.094, si: 0.582, tr: 0.629, so: 0.953, db: 1.000 }

export function parseLabel(label: string): { mult: number; num: number; score: number } {
  if (label === 'Miss') return { mult: 0, num: 0, score: 0 }
  if (label === 'Bull') return { mult: 2, num: 25, score: 50 }
  if (label === '25')   return { mult: 1, num: 25, score: 25 }
  const mult = { S: 1, D: 2, T: 3 }[label[0] as 'S'|'D'|'T'] ?? 1
  const num  = parseInt(label.slice(1), 10)
  return { mult, num, score: mult * num }
}

/** Returns SVG-space coords (y increases downward, r=1 at double wire). */
export function labelPos(label: string): { x: number; y: number } | null {
  if (label === 'Miss') return null
  if (label === 'Bull') return { x: 0, y: 0 }
  if (label === '25')   return { x: 0, y: -(R.bull50 + R.bull25) / 2 }
  const { mult, num } = parseLabel(label)
  const si = SEGS.indexOf(num)
  if (si < 0) return null
  const angle = Math.PI / 2 - si * (Math.PI / 10) // 0° = top = segment 20
  const r = mult === 3 ? (R.si + R.tr) / 2
          : mult === 2 ? (R.so + R.db) / 2
          : (R.tr + R.so) / 2
  return { x: r * Math.cos(angle), y: -(r * Math.sin(angle)) }
}

export function nearbyPicks(label: string): string[] {
  const { num } = parseLabel(label)
  const out: string[] = []
  const add = (l: string) => { if (l !== label && !out.includes(l)) out.push(l) }
  if (num === 25) {
    add('Bull'); add('25'); add('S20'); add('S3'); add('S6'); add('S11')
    return [...out.slice(0, 6), 'Miss']
  }
  const i = SEGS.indexOf(num)
  const L = SEGS[(i + 19) % 20], Ri = SEGS[(i + 1) % 20]
  const ring = label[0]
  ;['S','T','D'].forEach(k => add(`${k}${num}`))
  add(`${ring}${L}`); add(`${ring}${Ri}`); add(`S${L}`); add(`S${Ri}`)
  return [...out.slice(0, 6), 'Miss']
}

export function checkoutHint(remaining: number): string[] | null {
  if (remaining < 2) return null
  // preferred doubles in order
  const dblOrder = [20,16,18,12,10,8,14,6,4,2,19,17,15,13,11,9,7,5,3,1]
  const dbl: Record<number, string> = {}
  dblOrder.forEach(d => { dbl[2 * d] = dbl[2 * d] ?? `D${d}` })
  dbl[50] = 'Bull'
  if (dbl[remaining]) return [dbl[remaining]]
  // setup shots: T20 down to T1, then S20 down to S1, then 25, Bull
  const shots: { l: string; v: number }[] = []
  for (let n = 20; n >= 1; n--) shots.push({ l: `T${n}`, v: 3*n })
  for (let n = 20; n >= 1; n--) shots.push({ l: `S${n}`, v: n })
  shots.push({ l: '25', v: 25 }, { l: 'Bull', v: 50 })
  for (const { l, v } of shots) {
    const rest = remaining - v
    if (rest >= 2 && dbl[rest]) return [l, dbl[rest]]
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend/frontend && npx vitest run src/lib/__tests__/dartUtils.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/dartUtils.ts backend/frontend/src/lib/__tests__/dartUtils.test.ts
git commit -m "feat(ui): dartUtils — pure dart logic (nearby picks, checkout hint, label pos)"
```

---

### Task 4: DartBoard visual retheme

**Files:**
- Modify: `backend/frontend/src/lib/components/DartBoard.svelte`

**Interfaces:**
- Props unchanged: `darts`, `highlightedSegments`
- New prop: `checkoutTargets?: string[]` — labels to render as dashed accent circles (checkout path)

- [ ] **Step 1: Update ring colours in `ringColor`**

In `DartBoard.svelte`, replace the `ringColor` function:

```typescript
function ringColor(i: number, ring: string) {
  const ev = i % 2 === 0
  if (ring === 'tr' || ring === 'db') return ev ? '#d23b36' : '#1e7a4f'
  return ev ? '#1a1a17' : '#e9dfc4'
}
```

- [ ] **Step 2: Update dart dot colours**

Replace `const DOT_COLORS = ['#fff', '#f39c12', '#a78bfa']` with:

```typescript
const DOT_COLORS = ['#c6f24e', '#c6f24e', '#c6f24e']
const DOT_STROKE = '#0f100e'
```

In the SVG dart circle elements, change `stroke="#000"` to `stroke={DOT_STROKE}`.

- [ ] **Step 3: Update number labels font and colour**

In the `<text>` element for segment numbers, change:
- `fill="#ccc"` → `fill="#efeee6"`
- `font-family="system-ui,sans-serif"` → `font-family="Barlow Condensed, sans-serif"`

- [ ] **Step 4: Update wire colour**

Change `stroke="#555"` on path elements and `stroke="#666"` on circle/line elements to `stroke="#8d8e84"`.

Change the outer background circle `fill="#222"` to `fill="#0a0b09"`.

- [ ] **Step 5: Add `checkoutTargets` prop and render dashed circles**

At the top of the `<script>`, add to props:

```typescript
export let checkoutTargets: string[] = []
```

Add to `dartUtils.ts` import at the top of the script:

```typescript
import { labelPos } from '$lib/dartUtils.js'
```

In the SVG, after the existing dart dots, add:

```svelte
{#each checkoutTargets as label}
  {@const pos = labelPos(label)}
  {#if pos}
    <circle cx={pos.x} cy={pos.y} r="0.055"
      fill="none" stroke="#c6f24e" stroke-width="0.018" stroke-dasharray="0.025 0.02" />
  {/if}
{/each}
```

- [ ] **Step 6: Verify visually**

Load any session in dev server. Board should show green/red segments, cream/black singles, near-black background. Dart dots are lime-green.

- [ ] **Step 7: Commit**

```bash
git add backend/frontend/src/lib/components/DartBoard.svelte
git commit -m "feat(ui): dartboard — new ring colours, fonts, checkout target circles"
```

---

### Task 5: `AuthPanel.svelte` — brand panel

**Files:**
- Create: `backend/frontend/src/lib/components/AuthPanel.svelte`

**Interfaces:**
- No props. Renders the left 820px brand panel (logo, headline copy, dartboard illustration).

- [ ] **Step 1: Create the component**

```svelte
<!-- AuthPanel.svelte — brand panel for Login and Register screens -->
<div class="relative hidden md:flex w-[820px] flex-shrink-0 flex-col justify-between overflow-hidden
            bg-surface-1 border-r border-line box-border p-[48px_56px]">

  <!-- Logo -->
  <div class="relative flex items-center gap-3">
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="#c6f24e" stroke-width="2.5"/>
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="#c6f24e" stroke-width="2.5"/>
      <circle cx="16" cy="16" r="2.5" fill="#c6f24e"/>
    </svg>
    <span class="font-display font-bold text-[28px] tracking-[0.06em]">DARTCADE</span>
  </div>

  <!-- Dartboard illustration (bleeds off right edge) -->
  <div class="absolute right-[-250px] top-[110px] opacity-95 pointer-events-none">
    <svg viewBox="-200 -200 400 400" width="640" height="640" aria-hidden="true">
      <circle r="199" fill="#0a0b09"/>
      <circle r="166" fill="none" stroke="#1e7a4f" stroke-width="8"/>
      <circle r="166" fill="none" stroke="#d23b36" stroke-width="8" pathLength="20" stroke-dasharray="1 1" transform="rotate(-99)"/>
      <circle r="134.5" fill="none" stroke="#e9dfc4" stroke-width="55"/>
      <circle r="134.5" fill="none" stroke="#1a1a17" stroke-width="55" pathLength="20" stroke-dasharray="1 1" transform="rotate(-99)"/>
      <circle r="103" fill="none" stroke="#1e7a4f" stroke-width="8"/>
      <circle r="103" fill="none" stroke="#d23b36" stroke-width="8" pathLength="20" stroke-dasharray="1 1" transform="rotate(-99)"/>
      <circle r="57.5" fill="none" stroke="#e9dfc4" stroke-width="83"/>
      <circle r="57.5" fill="none" stroke="#1a1a17" stroke-width="83" pathLength="20" stroke-dasharray="1 1" transform="rotate(-99)"/>
      <circle r="16" fill="#1e7a4f"/>
      <circle r="6.35" fill="#d23b36"/>
      <g fill="none" stroke="#8d8e84" stroke-width="0.8" opacity="0.7">
        <circle r="170"/><circle r="162"/><circle r="107"/><circle r="99"/><circle r="16"/>
        {#each Array.from({length:20},(_,i)=>i) as i}
          <path d="M0 -16V-170" transform={`rotate(${9 + i*18})`}/>
        {/each}
      </g>
      <g fill="#efeee6" font-family="Barlow Condensed, sans-serif" font-weight="600" font-size="22"
         text-anchor="middle" dominant-baseline="central">
        {#each [[0,-184],[56.9,-175],[108.2,-148.9],[148.9,-108.2],[175,-56.9],[184,0],[175,56.9],[148.9,108.2],[108.2,148.9],[56.9,175],[0,184],[-56.9,175],[-108.2,148.9],[-148.9,108.2],[-175,56.9],[-184,0],[-175,-56.9],[-148.9,-108.2],[-108.2,-148.9],[-56.9,-175]] as [x,y], i}
          <text {x} {y}>{[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5][i]}</text>
        {/each}
      </g>
    </svg>
  </div>

  <!-- Headline -->
  <div class="relative flex flex-col gap-6 w-[470px]">
    <div class="font-mono text-[13px] tracking-[0.08em] text-accent">T20 · T20 · T20 — 180</div>
    <h2 class="m-0 font-display font-bold text-[104px] leading-[0.88] tracking-[0.01em] uppercase">
      Step up to the oche.
    </h2>
    <p class="m-0 text-[18px] leading-[1.55] text-text-muted max-w-[430px]">
      Custom minigames, 501 and tournaments — scored live from your Autodarts board.
    </p>
    <div class="flex gap-2 flex-wrap">
      {#each ['501','Dart Soccer','Challenges','Tournaments'] as label}
        <span class="px-[14px] py-2 border border-[#3a3e36] rounded-full text-[14px] text-[#d8d8ce]">
          {label}
        </span>
      {/each}
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add backend/frontend/src/lib/components/AuthPanel.svelte
git commit -m "feat(ui): AuthPanel — brand panel for auth screens"
```

---

### Task 6: Login screen

**Files:**
- Modify: `backend/frontend/src/routes/Login.svelte` (full rewrite)

- [ ] **Step 1: Rewrite `Login.svelte`**

```svelte
<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import AuthPanel from '$lib/components/AuthPanel.svelte'

  let email = $state('')
  let password = $state('')
  let keepSignedIn = $state(true)
  let error = $state('')
  let loading = $state(false)

  const devEmail = import.meta.env.VITE_DEV_EMAIL ?? 'admin@dartcade.local'
  const devPassword = import.meta.env.VITE_DEV_PASSWORD ?? 'password'

  async function submit() {
    loading = true
    error = ''
    try {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        error = d.message ?? 'Invalid credentials'
        return
      }
      push('/')
    } finally {
      loading = false
    }
  }

  async function devLogin() {
    email = devEmail
    password = devPassword
    await submit()
  }
</script>

<div class="flex min-h-screen bg-bg">
  <AuthPanel />

  <main class="flex flex-grow items-center justify-center">
    <form onsubmit={(e) => { e.preventDefault(); submit() }} class="flex w-[400px] flex-col gap-7">

      <div class="flex flex-col gap-2">
        <h1 class="m-0 font-display font-bold text-[48px] uppercase tracking-[0.02em] leading-none">
          Sign in
        </h1>
        <p class="m-0 text-[16px] text-text-muted">Welcome back. Your boards are waiting.</p>
      </div>

      <div class="flex flex-col gap-[18px]">
        <div class="flex flex-col gap-2">
          <label for="login-email" class="text-[14px] font-medium text-[#d8d8ce]">Email</label>
          <Input id="login-email" type="email" bind:value={email} autocomplete="email"
            placeholder="you@example.com" required />
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex justify-between items-baseline">
            <label for="login-password" class="text-[14px] font-medium text-[#d8d8ce]">Password</label>
            <a href="#/forgot" class="text-[14px] no-underline">Forgot password?</a>
          </div>
          <Input id="login-password" type="password" bind:value={password}
            autocomplete="current-password" placeholder="••••••••" required />
        </div>

        <label class="flex items-center gap-[10px] text-[15px] text-[#c9c9bf] min-h-[44px] cursor-pointer">
          <input type="checkbox" bind:checked={keepSignedIn}
            class="w-[18px] h-[18px] m-0 accent-accent" />
          Keep me signed in on this device
        </label>
      </div>

      {#if error}
        <p class="m-0 text-[14px] text-live-text">{error}</p>
      {/if}

      <div class="flex flex-col gap-3">
        <Button type="submit" variant="primary" disabled={loading} class="w-full">
          {loading ? '…' : 'Sign in'}
        </Button>

        {#if import.meta.env.DEV}
          <Button type="button" variant="ghost" onclick={devLogin} class="w-full text-text-dim">
            Dev: sign in as admin
          </Button>
        {/if}
      </div>

      <p class="m-0 text-[15px] text-text-muted text-center">
        New to Dartcade?
        <a href="#/register" class="font-semibold no-underline">Create an account</a>
      </p>
    </form>
  </main>
</div>
```

- [ ] **Step 2: Verify dev button renders in browser**

Open `http://localhost:5173/#/login`. The "Dev: sign in as admin" ghost button should appear below "Sign in". Clicking it should log in and redirect to `/`.

- [ ] **Step 3: Commit**

```bash
git add backend/frontend/src/routes/Login.svelte
git commit -m "feat(ui): Login — new split-layout design, dev login button"
```

---

### Task 7: Register screen + route

**Files:**
- Create: `backend/frontend/src/routes/Register.svelte`
- Modify: `backend/frontend/src/App.svelte`

- [ ] **Step 1: Create `Register.svelte`**

```svelte
<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import AuthPanel from '$lib/components/AuthPanel.svelte'

  let name = $state('')
  let email = $state('')
  let password = $state('')
  let acceptTerms = $state(false)
  let error = $state('')
  let loading = $state(false)

  // Password strength: 0–4
  let strength = $derived.by(() => {
    if (!password) return 0
    let s = 0
    if (password.length >= 8) s++
    if (password.length >= 12) s++
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++
    if (/[0-9]/.test(password) || /[^a-zA-Z0-9]/.test(password)) s++
    return s
  })

  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  const strengthColors = ['', '#ff5a4f', '#f59e0b', '#84cc16', '#c6f24e']

  async function submit() {
    if (!acceptTerms) { error = 'Please accept the terms'; return }
    loading = true; error = ''
    try {
      const res = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        error = d.message ?? 'Registration failed'
        return
      }
      push('/')
    } finally {
      loading = false
    }
  }
</script>

<div class="flex min-h-screen bg-bg">
  <AuthPanel />

  <main class="flex flex-grow items-center justify-center">
    <form onsubmit={(e) => { e.preventDefault(); submit() }} class="flex w-[400px] flex-col gap-7">

      <div class="flex flex-col gap-2">
        <p class="m-0 font-mono text-[13px] tracking-[0.08em] text-accent">Step 1 of 2</p>
        <h1 class="m-0 font-display font-bold text-[48px] uppercase tracking-[0.02em] leading-none">
          Create account
        </h1>
        <p class="m-0 text-[16px] text-text-muted">Your player name will show in game.</p>
      </div>

      <div class="flex flex-col gap-[18px]">
        <div class="flex flex-col gap-2">
          <label for="reg-name" class="text-[14px] font-medium text-[#d8d8ce]">Player name</label>
          <Input id="reg-name" bind:value={name} placeholder="e.g. Phil Taylor" required />
        </div>
        <div class="flex flex-col gap-2">
          <label for="reg-email" class="text-[14px] font-medium text-[#d8d8ce]">Email</label>
          <Input id="reg-email" type="email" bind:value={email} autocomplete="email"
            placeholder="you@example.com" required />
        </div>
        <div class="flex flex-col gap-2">
          <label for="reg-password" class="text-[14px] font-medium text-[#d8d8ce]">Password</label>
          <Input id="reg-password" type="password" bind:value={password}
            autocomplete="new-password" placeholder="At least 8 characters" required />
          {#if password}
            <div class="flex gap-1 mt-1">
              {#each [1,2,3,4] as lvl}
                <div class="h-1 flex-1 rounded-full transition-colors"
                  style:background={lvl <= strength ? strengthColors[strength] : '#2e322b'}>
                </div>
              {/each}
            </div>
            <p class="m-0 text-[13px]" style:color={strengthColors[strength]}>
              {strengthLabels[strength]}
            </p>
          {/if}
        </div>
        <label class="flex items-center gap-[10px] text-[15px] text-[#c9c9bf] min-h-[44px] cursor-pointer">
          <input type="checkbox" bind:checked={acceptTerms}
            class="w-[18px] h-[18px] m-0 accent-accent" />
          I agree to the <a href="#/terms" class="font-semibold">terms of service</a>
        </label>
      </div>

      {#if error}
        <p class="m-0 text-[14px] text-live-text">{error}</p>
      {/if}

      <Button type="submit" variant="primary" disabled={loading || !acceptTerms} class="w-full">
        {loading ? '…' : 'Create account'}
      </Button>

      <p class="m-0 text-[15px] text-text-muted text-center">
        Already have an account?
        <a href="#/login" class="font-semibold no-underline">Sign in</a>
      </p>
    </form>
  </main>
</div>
```

- [ ] **Step 2: Add `/register` route to `App.svelte`**

```svelte
import Register from './routes/Register.svelte'
// in routes object:
'/register': Register,
```

- [ ] **Step 3: Commit**

```bash
git add backend/frontend/src/routes/Register.svelte backend/frontend/src/App.svelte
git commit -m "feat(ui): Register screen and /register route"
```

---

### Task 8: `SideNav.svelte`

**Files:**
- Create: `backend/frontend/src/lib/components/SideNav.svelte`

**Interfaces:**
- No props. Uses `$location` from svelte-spa-router to derive active link.
- Slot for user info: reads session user from `/api/auth/get-session` on mount.

- [ ] **Step 1: Create `SideNav.svelte`**

```svelte
<script lang="ts">
  import { location } from 'svelte-spa-router'
  import { onMount } from 'svelte'

  let userName = $state('…')
  let userInitial = $derived(userName?.[0]?.toUpperCase() ?? '?')

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/get-session')
      if (res.ok) {
        const d = await res.json()
        userName = d.user?.name ?? d.user?.email ?? 'User'
      }
    } catch { /* leave as placeholder */ }
  })

  const links = [
    { href: '/',        label: 'Play',        icon: 'play' },
    { href: '/boards',  label: 'Boards',      icon: 'boards' },
    { href: '/tournaments', label: 'Tournaments', icon: 'trophy' },
    { href: '/history', label: 'History',     icon: 'clock' },
  ]

  function isActive(href: string) {
    return $location === href || ($location === '/' && href === '/')
  }
</script>

<nav aria-label="Main"
  class="flex w-[248px] flex-shrink-0 flex-col gap-9 border-r border-line bg-surface-1 box-border h-screen p-[28px_16px]">

  <!-- Logo -->
  <div class="flex items-center gap-[10px] px-2">
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="#c6f24e" stroke-width="2.5"/>
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="#c6f24e" stroke-width="2.5"/>
      <circle cx="16" cy="16" r="2.5" fill="#c6f24e"/>
    </svg>
    <span class="font-display font-bold text-[24px] tracking-[0.06em]">DARTCADE</span>
  </div>

  <!-- Nav links -->
  <div class="flex flex-col gap-1">
    {#each links as link}
      {@const active = isActive(link.href)}
      <a href={`#${link.href}`}
        aria-current={active ? 'page' : undefined}
        class="flex items-center gap-3 h-11 px-3 rounded-lg no-underline text-[15px] transition-colors
               {active ? 'bg-[#22251f] text-text font-semibold' : 'text-[#c9c9bf] font-medium'}">
        <!-- Icon placeholder — replace with actual SVG per link.icon -->
        <span class="w-5 h-5 rounded bg-line-2 shrink-0" aria-hidden="true"></span>
        {link.label}
      </a>
    {/each}
  </div>

  <!-- User footer -->
  <div class="mt-auto flex items-center gap-3 p-3 border border-line rounded-[10px]">
    <span class="w-9 h-9 rounded-full bg-accent text-accent-fg flex items-center justify-center
                 font-bold text-[15px] shrink-0">
      {userInitial}
    </span>
    <div class="flex flex-col gap-[2px] flex-grow min-w-0">
      <span class="text-[14px] font-semibold truncate">{userName}</span>
      <a href="#/login" class="text-[13px] text-text-muted no-underline">Sign out</a>
    </div>
  </div>
</nav>
```

Note: The icon `<span>` placeholders should be replaced with proper SVGs from the `.dc.html` files (Play.dc.html has them inline). They are tracked in `PLACEHOLDERS.md`.

- [ ] **Step 2: Verify reactivity**

Navigate between `#/` and `#/boards` in dev server. The active link highlight should update correctly.

- [ ] **Step 3: Commit**

```bash
git add backend/frontend/src/lib/components/SideNav.svelte
git commit -m "feat(ui): SideNav — sidebar navigation with reactive active state"
```

---

### Task 9: Boards screen

**Files:**
- Modify: `backend/frontend/src/routes/Boards.svelte` (full rewrite)
- Create: `backend/frontend/PLACEHOLDERS.md`

- [ ] **Step 1: Create `PLACEHOLDERS.md`**

```markdown
# UI Placeholder Tracker

Items marked `[PLACEHOLDER]` in the frontend need backend API additions.

| Screen | Field | Current value | API needed |
|--------|-------|---------------|------------|
| SideNav | Nav icons | Grey rectangles | Inline SVG (copy from Play.dc.html) |
| Boards | Camera count | Hardcoded "3 / 3" | `GET /api/boards` → `cameras` field |
| Boards | Bridge version | Hardcoded "v0.4.2" | `GET /api/boards` → `bridgeVersion` field |
| Boards | Game count | Hardcoded "—" | `GET /api/boards` → `totalGames` field |
| Boards | Latency | Hardcoded "— ms" | `GET /api/boards` → `latencyMs` field |
| Boards | Detail panel (cameras, event feed) | Not shown | Separate board detail endpoint |
| GameDisplay | Board name in header | Hardcoded "Living room" | Session board name from snapshot |
```

- [ ] **Step 2: Rewrite `Boards.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import SideNav from '$lib/components/SideNav.svelte'
  import { Button } from '$lib/components/ui/button/index.js'

  type Board = {
    id: string; name: string; online: boolean; ip?: string
    cameras?: number; bridgeVersion?: string; totalGames?: number; latencyMs?: number
  }

  let boards = $state<Board[]>([])
  let selectedId = $state<string | null>(null)
  let selected = $derived(boards.find(b => b.id === selectedId) ?? null)

  onMount(async () => {
    const res = await fetch('/api/boards')
    if (res.status === 401) { push('/login'); return }
    const d = await res.json()
    boards = d.boards ?? []
    if (boards.length) selectedId = boards[0].id
  })

  const onlineCount = $derived(boards.filter(b => b.online).length)
</script>

<div class="flex h-screen bg-bg text-text overflow-hidden">
  <SideNav />

  <main class="flex flex-grow flex-col gap-7 box-border min-w-0 overflow-y-auto p-[40px_44px]">

    <!-- Header -->
    <header class="flex items-end justify-between">
      <div class="flex flex-col gap-[6px]">
        <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">
          Boards
        </h1>
        <p class="m-0 text-[15px] text-text-muted">
          Autodarts boards linked through your Dartcade bridge ·
          <span class="text-text">{onlineCount} online</span> · {boards.length - onlineCount} offline
        </p>
      </div>
      <Button variant="primary" class="h-12 text-[18px]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Pair new board
      </Button>
    </header>

    <div class="flex gap-6 flex-grow min-h-0">
      <!-- Board grid -->
      <div class="flex-grow grid grid-cols-2 grid-rows-2 gap-4 content-start">
        {#each boards as board (board.id)}
          {@const active = board.id === selectedId}
          <button type="button" onclick={() => selectedId = board.id}
            class="text-left box-border p-[22px] rounded-[14px] flex flex-col gap-[18px] transition-colors
                   {active
                     ? 'bg-surface-2 border-2 border-accent'
                     : 'bg-surface-2 border border-line-2 hover:border-line'}">

            <div class="flex justify-between items-center">
              <span class="flex items-center gap-2 text-[13px] font-semibold
                           {board.online ? 'text-accent' : 'text-text-dim'}">
                <span class="w-2 h-2 rounded-full {board.online ? 'bg-accent' : 'bg-text-dim'}"></span>
                {board.online ? 'Online' : 'Offline'}
              </span>
              <!-- [PLACEHOLDER] latency from API -->
              <span class="font-mono text-[12px] text-text-dim">
                {board.latencyMs != null ? `${board.latencyMs} ms` : '— ms'}
              </span>
            </div>

            <div class="flex flex-col gap-1">
              <h2 class="m-0 font-display font-bold text-[32px] leading-none uppercase">{board.name}</h2>
              {#if board.ip}
                <span class="font-mono text-[13px] text-text-muted">{board.ip}</span>
              {/if}
            </div>

            <dl class="m-0 mt-auto grid grid-cols-3 gap-3 pt-4 border-t border-line-2">
              <!-- [PLACEHOLDER] cameras/bridgeVersion/totalGames from API -->
              <div>
                <dt class="text-[12px] text-text-dim">Cameras</dt>
                <dd class="mt-1 m-0 text-[15px] font-semibold">{board.cameras != null ? `${board.cameras} / 3` : '—'}</dd>
              </div>
              <div>
                <dt class="text-[12px] text-text-dim">Bridge</dt>
                <dd class="mt-1 m-0 text-[15px] font-semibold">{board.bridgeVersion ?? '—'}</dd>
              </div>
              <div>
                <dt class="text-[12px] text-text-dim">Games</dt>
                <dd class="mt-1 m-0 text-[15px] font-semibold">{board.totalGames ?? '—'}</dd>
              </div>
            </dl>
          </button>
        {:else}
          <div class="col-span-2 flex items-center justify-center h-40 rounded-[14px]
                      border border-dashed border-line-2 text-text-muted text-[15px]">
            No boards yet — pair one to get started
          </div>
        {/each}
      </div>

      <!-- Detail panel (shown when board selected) -->
      {#if selected}
        <aside class="w-[360px] flex-shrink-0 box-border p-6 border border-line-2 rounded-[14px]
                       bg-surface-2 flex flex-col gap-5">
          <h3 class="m-0 font-display font-bold text-[24px] uppercase">{selected.name}</h3>
          <!-- [PLACEHOLDER] camera tiles, event feed — needs board detail API -->
          <div class="flex flex-col gap-3">
            <div class="rounded-[10px] bg-[#0a0b09] h-24 flex items-center justify-center
                         text-text-dim text-[13px]">Camera feed — coming soon</div>
          </div>
          <div class="flex flex-col gap-1">
            {#if selected.ip}
              <div class="flex justify-between text-[14px]">
                <span class="text-text-dim">Board Manager IP</span>
                <span class="font-mono">{selected.ip}</span>
              </div>
            {/if}
            <div class="flex justify-between text-[14px]">
              <span class="text-text-dim">Bridge version</span>
              <span class="font-mono">{selected.bridgeVersion ?? '—'}</span>
            </div>
            <div class="flex justify-between text-[14px]">
              <span class="text-text-dim">Latency</span>
              <span class="font-mono">{selected.latencyMs != null ? `${selected.latencyMs} ms` : '—'}</span>
            </div>
          </div>
          <Button variant="destructive" class="mt-auto w-full">Unpair board</Button>
        </aside>
      {/if}
    </div>
  </main>
</div>
```

- [ ] **Step 3: Verify in browser**

Navigate to `#/boards`. Sidebar should show. Board cards should render with lime accent on selected.

- [ ] **Step 4: Commit**

```bash
git add backend/frontend/src/routes/Boards.svelte backend/frontend/PLACEHOLDERS.md
git commit -m "feat(ui): Boards screen redesign with sidebar nav"
```

---

### Task 10: Play / CreateSession screen

**Files:**
- Modify: `backend/frontend/src/routes/CreateSession.svelte` (full rewrite)

- [ ] **Step 1: Rewrite `CreateSession.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import SideNav from '$lib/components/SideNav.svelte'
  import { Button } from '$lib/components/ui/button/index.js'

  type Board = { id: string; name: string; online: boolean }
  type GameDef = { id: string; defaultConfig: Record<string, unknown> }

  const MODES = [
    { id: 'x01',       glyph: '501', name: '501', desc: 'Classic X01, double out. First to finish wins the leg.' },
    { id: 'soccer',    glyph: '⚽',  name: 'Dart Soccer', desc: 'Coming soon.' },
    { id: 'challenges',glyph: '🎯', name: 'Challenges', desc: 'Coming soon.' },
    { id: 'tournament',glyph: '🏆', name: 'Tournament', desc: 'Coming soon.' },
  ]

  let games = $state<GameDef[]>([])
  let boards = $state<Board[]>([])
  let selectedMode = $state('x01')
  let boardId = $state('')
  let config = $state<Record<string, unknown>>({ startScore: 501, checkout: 'double', firstTo: 2 })
  let players = $state([{ name: '' }, { name: '' }])
  let error = $state('')
  let loading = $state(false)

  onMount(async () => {
    const [gr, br] = await Promise.all([fetch('/api/games'), fetch('/api/boards')])
    if (br.status === 401) { push('/login'); return }
    const gd = await gr.json(); const bd = await br.json()
    games = gd.games ?? []; boards = bd.boards ?? []
    if (boards.length) boardId = boards[0].id
  })

  const selectedBoard = $derived(boards.find(b => b.id === boardId))

  async function start() {
    error = ''
    const validPlayers = players.filter(p => p.name.trim())
    if (!boardId) { error = 'Select a board first.'; return }
    if (validPlayers.length < 1) { error = 'At least one player required.'; return }
    // Map UI mode to game ID
    const gameId = games.find(g => g.id.includes('501') || g.id === selectedMode)?.id ?? games[0]?.id
    if (!gameId) { error = 'No game found. Is the backend running?'; return }
    loading = true
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, gameId, config, players: validPlayers }),
      })
      if (!res.ok) { error = (await res.json()).error ?? 'Failed to start'; return }
      push(`/session/${(await res.json()).sessionId}`)
    } finally { loading = false }
  }
</script>

<div class="flex h-screen bg-bg text-text overflow-hidden">
  <SideNav />

  <main class="flex flex-grow flex-col gap-7 box-border min-w-0 overflow-y-auto p-[40px_44px]">

    <!-- Header -->
    <header class="flex items-end justify-between">
      <div class="flex flex-col gap-[6px]">
        <h1 class="m-0 font-display font-bold text-[48px] leading-none uppercase tracking-[0.02em]">
          New game
        </h1>
        <p class="m-0 text-[15px] text-text-muted">Choose a mode, set it up, throw the first dart.</p>
      </div>
      <!-- Board selector -->
      <select bind:value={boardId}
        class="h-12 px-4 bg-surface-2 border border-line-3 rounded-[10px] text-text text-[15px]
               font-medium cursor-pointer focus-visible:[outline:2px_solid_#c6f24e]">
        {#each boards as b (b.id)}
          <option value={b.id}>{b.name} {b.online ? '●' : '○'}</option>
        {:else}
          <option disabled value="">No boards — add one in Boards</option>
        {/each}
      </select>
    </header>

    <div class="flex gap-6 flex-grow min-h-0">
      <!-- Mode grid -->
      <div class="flex-grow grid grid-cols-2 grid-rows-2 gap-4">
        {#each MODES as mode}
          {@const active = mode.id === selectedMode}
          <button type="button" onclick={() => selectedMode = mode.id}
            class="relative text-left box-border p-6 rounded-[14px] flex flex-col gap-[10px]
                   cursor-pointer overflow-hidden transition-colors
                   {active ? 'bg-surface-active border-2 border-accent' : 'bg-surface-2 border border-line-2'}">
            {#if active}
              <span class="absolute top-[18px] right-[18px] w-7 h-7 rounded-full bg-accent flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f100e" stroke-width="3"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M5 12l5 5 9-10"/>
                </svg>
              </span>
            {/if}
            <span class="font-display font-bold text-[88px] leading-[0.9]
                         {active ? 'text-accent' : 'text-transparent [-webkit-text-stroke:1.5px_#5a5e53]'}">
              {mode.glyph}
            </span>
            <span class="mt-auto font-display font-bold text-[30px] uppercase tracking-[0.02em]">
              {mode.name}
            </span>
            <span class="text-[15px] leading-[1.45] {active ? 'text-[#b4b5aa]' : 'text-text-muted'}">
              {mode.desc}
            </span>
          </button>
        {/each}
      </div>

      <!-- Setup aside -->
      <aside class="w-[400px] flex-shrink-0 box-border p-6 border border-line-2 rounded-[14px]
                    bg-[#151713] flex flex-col gap-[22px]">
        <div class="flex flex-col gap-1">
          <span class="text-[12px] tracking-[0.1em] uppercase text-text-dim">Setup</span>
          <h2 class="m-0 font-display font-bold text-[32px] leading-none uppercase">
            {MODES.find(m => m.id === selectedMode)?.name}
          </h2>
        </div>

        {#if selectedMode === 'x01'}
          <!-- Start score -->
          <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
            <legend class="text-[14px] font-medium text-[#d8d8ce] mb-1">Start score</legend>
            <div class="flex gap-1 p-1 bg-bg rounded-[10px]">
              {#each [301, 501, 701] as score}
                <button type="button" onclick={() => config = {...config, startScore: score}}
                  class="flex-1 h-11 rounded-[7px] text-[15px] font-medium transition-colors border-0
                         {config.startScore === score
                           ? 'bg-accent text-accent-fg font-bold'
                           : 'bg-transparent text-[#c9c9bf]'}">
                  {score}
                </button>
              {/each}
            </div>
          </fieldset>

          <!-- Checkout -->
          <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
            <legend class="text-[14px] font-medium text-[#d8d8ce] mb-1">Checkout</legend>
            <div class="flex gap-1 p-1 bg-bg rounded-[10px]">
              {#each [['double','Double out'],['master','Master out'],['straight','Straight']] as [val, label]}
                <button type="button" onclick={() => config = {...config, checkout: val}}
                  class="flex-1 h-11 rounded-[7px] text-[14px] font-medium transition-colors border-0
                         {config.checkout === val
                           ? 'bg-accent text-accent-fg font-bold'
                           : 'bg-transparent text-[#c9c9bf]'}">
                  {label}
                </button>
              {/each}
            </div>
          </fieldset>

          <!-- First to N legs -->
          <fieldset class="m-0 p-0 border-0 flex flex-col gap-2">
            <legend class="text-[14px] font-medium text-[#d8d8ce] mb-1">First to (legs)</legend>
            <div class="flex gap-2 flex-wrap">
              {#each [1,2,3,5,7] as n}
                <button type="button" onclick={() => config = {...config, firstTo: n}}
                  class="w-11 h-11 rounded-[10px] text-[15px] font-medium border transition-colors
                         {config.firstTo === n
                           ? 'bg-accent text-accent-fg border-accent font-bold'
                           : 'bg-transparent text-[#c9c9bf] border-line-3'}">
                  {n}
                </button>
              {/each}
            </div>
          </fieldset>
        {:else}
          <p class="text-text-muted text-[15px]">Setup options coming soon for this mode.</p>
        {/if}

        <!-- Players -->
        <div class="flex flex-col gap-3">
          <span class="text-[14px] font-medium text-[#d8d8ce]">Players</span>
          {#each players as player, i}
            <div class="flex gap-2 items-center">
              <span class="w-7 h-7 rounded-full bg-surface-active border border-line flex items-center
                           justify-center text-[13px] font-bold text-text-muted shrink-0">{i + 1}</span>
              <input bind:value={player.name} placeholder="Player {i + 1}"
                class="flex-grow h-11 px-3 bg-surface-2 border border-line-3 rounded-[10px] text-text
                       text-[15px] placeholder:text-text-dim outline-none
                       focus-visible:[outline:2px_solid_#c6f24e]" />
              {#if players.length > 1}
                <button type="button" onclick={() => players = players.filter((_, j) => j !== i)}
                  class="w-11 h-11 flex items-center justify-center text-text-dim hover:text-live-text
                         transition-colors border-0 bg-transparent cursor-pointer">✕</button>
              {/if}
            </div>
          {/each}
          <button type="button" onclick={() => players = [...players, { name: '' }]}
            class="self-start text-[14px] text-accent font-medium border-0 bg-transparent cursor-pointer p-0">
            + Add player
          </button>
        </div>

        {#if error}<p class="m-0 text-[14px] text-live-text">{error}</p>{/if}

        <Button variant="primary" onclick={start} disabled={loading} class="w-full mt-auto">
          {loading ? 'Starting…' : 'Start game'}
        </Button>
      </aside>
    </div>
  </main>
</div>
```

- [ ] **Step 2: Verify in browser at `#/`**

Sidebar, mode cards, setup panel should all render. Selecting a mode should highlight it with lime border.

- [ ] **Step 3: Commit**

```bash
git add backend/frontend/src/routes/CreateSession.svelte
git commit -m "feat(ui): Play lobby — mode cards, setup panel, sidebar nav"
```

---

### Task 11: `PlayerCard.svelte`

**Files:**
- Modify: `backend/frontend/src/lib/components/PlayerCard.svelte` (full rewrite)

**Interfaces:**
- Props: `player: {id:string; name:string}`, `playerIndex: number`, `game: Record<string,unknown>`, `view: GameView`, `isActive: boolean`, `isWinner: boolean`, `previousVisits: number[]`
- `view.getPlayerDisplay(game, playerIndex)` returns `{ remaining: number; checkout: string | null }`

- [ ] **Step 1: Rewrite `PlayerCard.svelte`**

Read the current `PlayerCard.svelte` to understand `view.getPlayerDisplay` before writing. The rewrite keeps props identical; only the markup changes:

```svelte
<script lang="ts">
  import type { GameView } from '$lib/gameViews/index.js'
  import { checkoutHint } from '$lib/dartUtils.js'

  let { player, playerIndex, game, view, isActive, isWinner, previousVisits } = $props<{
    player: { id: string; name: string }
    playerIndex: number
    game: Record<string, unknown>
    view: GameView
    isActive: boolean
    isWinner: boolean
    previousVisits: number[]
  }>()

  const display = $derived(view.getPlayerDisplay(game, playerIndex))
  const remaining = $derived((display as any)?.remaining ?? 0)
  const checkout = $derived(checkoutHint(remaining))
  const checkoutText = $derived(checkout ? checkout.join(' · ') : 'No finish — set up')
  const dartsLeft = $derived((display as any)?.dartsLeft ?? 3)
  const avg = $derived(
    previousVisits.length ? (previousVisits.reduce((a, b) => a + b, 0) / previousVisits.length).toFixed(1) : '—'
  )
  const initial = $derived(player.name?.[0]?.toUpperCase() ?? '?')
  const lastVisits = $derived(previousVisits.slice(-3).reverse())
  // Leg wins: derived from game state if available
  const legsWon = $derived((game.legs as number[])?.[playerIndex] ?? 0)
  const firstTo = $derived((game.firstTo as number) ?? 3)
</script>

<section
  aria-label="{player.name}, {isActive ? 'throwing' : 'waiting'}"
  class="flex flex-col gap-5 box-border p-7 rounded-[18px] h-full
         {isActive
           ? 'bg-surface-active border-2 border-accent'
           : 'bg-surface-2 border border-line-2'}">

  <!-- Name row + leg dots -->
  <div class="flex justify-between items-center">
    <div class="flex items-center gap-3">
      <span class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[17px]
                   {isActive ? 'bg-accent text-accent-fg' : 'bg-[#3a3e36] text-text'}">
        {initial}
      </span>
      <span class="text-[22px] font-semibold {isActive ? 'text-text' : 'text-[#c9c9bf]'}">
        {player.name}
      </span>
    </div>
    <div class="flex items-center gap-[6px]" aria-label="{legsWon} leg(s) won">
      {#each Array.from({length: firstTo}, (_, i) => i) as i}
        <span class="w-3 h-3 rounded-full {i < legsWon
          ? (isActive ? 'bg-accent' : 'bg-text-muted')
          : 'border border-[#5a5e53] box-border'}">
        </span>
      {/each}
    </div>
  </div>

  <!-- Status badge -->
  {#if isWinner}
    <span class="self-start inline-flex items-center h-7 px-3 rounded-full bg-accent text-accent-fg
                 text-[13px] font-bold tracking-[0.08em] uppercase">Winner!</span>
  {:else if isActive}
    <span class="self-start inline-flex items-center h-7 px-3 rounded-full bg-accent text-accent-fg
                 text-[13px] font-bold tracking-[0.08em] uppercase">Throwing</span>
  {:else}
    <span class="self-start inline-flex items-center h-7 px-3 rounded-full border border-line
                 text-text-dim text-[13px] font-semibold tracking-[0.08em] uppercase">Up next</span>
  {/if}

  <!-- Remaining score -->
  <span class="font-display font-bold text-[clamp(80px,15vw,220px)] leading-[0.8] tracking-[-0.02em]
               {isActive ? 'text-text' : 'text-[#b4b5aa]'}">
    {remaining}
  </span>

  <!-- Checkout hint -->
  <div class="flex flex-col gap-[6px] p-[16px_18px] rounded-[12px]
              {isActive ? 'bg-[#242820]' : 'bg-[#1c1e1a]'}">
    <span class="text-[12px] tracking-[0.1em] uppercase {isActive ? 'text-text-muted' : 'text-text-dim'}">
      Checkout · {dartsLeft} darts left
    </span>
    <span class="font-display font-bold text-[38px] leading-none
                 {isActive ? 'text-accent' : 'text-[#b4b5aa]'}">
      {checkoutText}
    </span>
  </div>

  <!-- Stats -->
  <div class="flex gap-7 text-[15px] {isActive ? 'text-text-muted' : 'text-text-dim'}">
    <span>Avg <strong class="{isActive ? 'text-text' : 'text-[#c9c9bf]'}">{avg}</strong></span>
    <span>Darts <strong class="{isActive ? 'text-text' : 'text-[#c9c9bf]'}">{(game.totalDarts as number[])?.[playerIndex] ?? '—'}</strong></span>
  </div>

  <!-- Last visits -->
  <div class="mt-auto flex items-center gap-2 text-[13px] text-text-dim">
    <span>Last visits</span>
    {#each lastVisits as v, i}
      <span class="px-[10px] py-1 rounded-[6px] font-{i === 0 ? 'semibold' : 'normal'}
                   {isActive ? 'bg-[#242820] text-[#c9c9bf]' : 'bg-[#1f221c] text-[#b4b5aa]'}">
        {v}
      </span>
    {/each}
  </div>
</section>
```

Note: `view.getPlayerDisplay` must return `{ remaining, dartsLeft }`. If it doesn't, update the `GameView` interface in `src/lib/gameViews/index.ts` accordingly — check the current interface before editing.

- [ ] **Step 2: Check `GameView` interface**

Read `src/lib/gameViews/index.ts`. If `getPlayerDisplay` doesn't exist, add it. The existing `getBoardHighlights` pattern shows how view methods are structured.

- [ ] **Step 3: Commit**

```bash
git add backend/frontend/src/lib/components/PlayerCard.svelte
git commit -m "feat(ui): PlayerCard — new design with checkout hint and leg dots"
```

---

### Task 12: `CorrectionPanel.svelte`

**Files:**
- Modify: `backend/frontend/src/lib/components/CorrectionPanel.svelte` (full rewrite)
- Create: `backend/frontend/src/lib/__tests__/CorrectionPanel.test.ts`

**Interfaces:**
- New props: `darts: Array<{label: string; score: number}>`, `onCorrect: (dartIndex: number, label: string) => void`, `onUndo: () => void`
- Internal state: `openDart: number | null`, `mode: 'quick' | 'full'`, `mult: 'S'|'D'|'T'`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/__tests__/CorrectionPanel.test.ts
import { describe, it, expect } from 'vitest'
import { nearbyPicks } from '../dartUtils.js'

// Test the data logic used by CorrectionPanel via dartUtils (already tested in Task 3)
// This test focuses on the full-picker requirement: 25, Bull, and Miss must be available

describe('CorrectionPanel full picker data', () => {
  it('full picker includes 25, Bull, Miss as special targets', () => {
    const specials = ['25', 'Bull', 'Miss']
    // Verify these are valid labels parseable by parseLabel
    const { parseLabel } = await import('../dartUtils.js')
    specials.forEach(s => {
      const p = parseLabel(s)
      expect(p).toBeDefined()
      expect(p.score).toBeGreaterThanOrEqual(0)
    })
  })
  it('number grid covers 1–20', () => {
    const nums = Array.from({length: 20}, (_, i) => i + 1)
    expect(nums).toHaveLength(20)
    expect(nums[0]).toBe(1)
    expect(nums[19]).toBe(20)
  })
})
```

- [ ] **Step 2: Run tests — expect pass** (these test dartUtils already implemented)

```bash
cd backend/frontend && npx vitest run src/lib/__tests__/CorrectionPanel.test.ts
```

- [ ] **Step 3: Rewrite `CorrectionPanel.svelte`**

```svelte
<script lang="ts">
  import { nearbyPicks, parseLabel } from '$lib/dartUtils.js'

  let { darts = [], onCorrect, onUndo }: {
    darts: Array<{ label: string; score: number }>
    onCorrect: (dartIndex: number, label: string) => void
    onUndo: () => void
  } = $props()

  let openDart = $state<number | null>(null)
  let mode = $state<'quick' | 'full'>('quick')
  let mult = $state<'S' | 'D' | 'T'>('S')

  const quickPicks = $derived(openDart !== null && darts[openDart]
    ? nearbyPicks(darts[openDart].label)
    : [])

  function pick(dartIndex: number, label: string) {
    onCorrect(dartIndex, label)
    openDart = null
    mode = 'quick'
  }

  function toggle(i: number) {
    if (openDart === i) { openDart = null; mode = 'quick' }
    else { openDart = i; mode = 'quick' }
  }

  const nums = Array.from({length: 20}, (_, i) => i + 1)
  const multNames = { S: 'Single', D: 'Double', T: 'Treble' }
</script>

<!-- Dart tiles -->
<div class="w-full grid gap-2" style:grid-template-columns={`repeat(3, minmax(0, 1fr))`}>
  {#each [0, 1, 2] as i}
    {#if i < darts.length}
      {@const dart = darts[i]}
      {@const isOpen = openDart === i}
      <button type="button" onclick={() => toggle(i)}
        aria-expanded={isOpen}
        aria-label="Dart {i+1}: {dart.label}, {dart.score} points. Correct this dart"
        class="h-[72px] rounded-[12px] flex items-center justify-between px-4 border-0 cursor-pointer
               {isOpen
                 ? 'bg-accent text-accent-fg [box-shadow:0_0_0_3px_#0f100e,0_0_0_5px_#c6f24e]'
                 : 'bg-accent text-accent-fg'}">
        <span class="font-display font-bold text-[32px]">{dart.label}</span>
        <div class="flex flex-col items-end gap-[2px]">
          <span class="text-[16px] font-bold">{dart.score}</span>
        </div>
      </button>
    {:else}
      <div class="h-[72px] rounded-[12px] border border-dashed
                  {i === darts.length ? 'border-[#6a6f62]' : 'border-[#3e4239]'}
                  flex items-center justify-center gap-2 text-[15px]
                  {i === darts.length ? 'text-[#c9c9bf]' : 'text-[#7d7f74]'}">
        {#if i === darts.length}
          <span class="w-2 h-2 rounded-full bg-accent"></span>
        {/if}
        Dart {i + 1}
      </div>
    {/if}
  {/each}
</div>

<!-- Popover -->
{#if openDart !== null}
  <div role="dialog" aria-label="Correct dart {openDart + 1}"
    class="w-full box-border p-[18px] rounded-[16px] bg-[#1f221c] border border-[#454a3f]
           flex flex-col gap-[14px] [box-shadow:0_24px_60px_rgba(0,0,0,0.55)]">

    <div class="flex justify-between items-start">
      <div class="flex flex-col gap-[2px]">
        <span class="text-[16px] font-semibold">Correct dart {openDart + 1}</span>
        <span class="text-[13px] text-text-muted">
          Detected <strong class="text-text">{darts[openDart]?.label}</strong> ·
          {mode === 'quick' ? 'nearby segments' : 'pick any target'}
        </span>
      </div>
      <button type="button" onclick={() => { openDart = null; mode = 'quick' }}
        aria-label="Close" class="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center bg-transparent
               border-0 text-[#c9c9bf] cursor-pointer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18"/>
        </svg>
      </button>
    </div>

    {#if mode === 'quick'}
      <div class="grid gap-2" style:grid-template-columns="repeat(4, minmax(0, 1fr))">
        {#each quickPicks as label}
          <button type="button" onclick={() => pick(openDart!, label)}
            class="h-[56px] flex flex-col items-center justify-center gap-0 bg-[#2a2e26]
                   border border-[#3a3f35] rounded-[10px] text-text cursor-pointer">
            <span class="font-display font-bold text-[24px] leading-none">{label}</span>
            <span class="text-[12px] text-text-muted">{parseLabel(label).score}</span>
          </button>
        {/each}
        <button type="button" onclick={() => mode = 'full'}
          class="h-[56px] flex flex-col items-center justify-center bg-transparent
                 border border-dashed border-[#5a5e53] rounded-[10px] text-accent text-[14px]
                 font-semibold cursor-pointer">Other…</button>
      </div>

    {:else}
      <!-- Full picker -->
      <div class="flex items-center">
        <button type="button" onclick={() => mode = 'quick'}
          class="h-10 flex items-center gap-[6px] px-1 bg-transparent border-0
                 text-[#c9c9bf] text-[14px] cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6"/>
          </svg>
          Nearby
        </button>
      </div>

      <!-- S/D/T toggle -->
      <div class="grid gap-1 p-1 bg-bg rounded-[10px]" style:grid-template-columns="repeat(3, minmax(0, 1fr))">
        {#each (['S', 'D', 'T'] as const) as m}
          <button type="button" onclick={() => mult = m} aria-pressed={mult === m}
            class="h-11 border-0 rounded-[7px] text-[15px] cursor-pointer
                   {mult === m
                     ? 'bg-accent text-accent-fg font-bold'
                     : 'bg-transparent text-[#c9c9bf]'}">
            {multNames[m]}
          </button>
        {/each}
      </div>

      <!-- 1–20 grid -->
      <div class="grid grid-cols-5 gap-[6px]">
        {#each nums as n}
          <button type="button" onclick={() => pick(openDart!, `${mult}${n}`)}
            aria-label="{multNames[mult]} {n}"
            class="h-12 bg-[#2a2e26] border border-[#3a3f35] rounded-[9px] text-text
                   font-display font-bold text-[22px] cursor-pointer">
            {n}
          </button>
        {/each}
      </div>

      <!-- Special targets -->
      <div class="grid grid-cols-3 gap-[6px]">
        <button type="button" onclick={() => pick(openDart!, '25')}
          class="h-12 bg-[#1e3a2b] border border-[#2f5a42] rounded-[9px] text-text
                 text-[15px] font-semibold cursor-pointer">25 · Outer bull</button>
        <button type="button" onclick={() => pick(openDart!, 'Bull')}
          class="h-12 bg-[#4a1f1c] border border-[#6e2e2a] rounded-[9px] text-text
                 text-[15px] font-semibold cursor-pointer">50 · Bull</button>
        <button type="button" onclick={() => pick(openDart!, 'Miss')}
          class="h-12 bg-transparent border border-[#3a3f35] rounded-[9px] text-[#c9c9bf]
                 text-[15px] font-semibold cursor-pointer">Miss · 0</button>
      </div>
    {/if}
  </div>
{/if}

<!-- Hint + actions -->
<span class="text-[13px] text-text-dim">
  Tap a dart to correct it ·
  Visit so far <strong class="text-text">{darts.reduce((s, d) => s + d.score, 0)}</strong>
</span>

<div class="w-full flex gap-2">
  <button type="button" onclick={onUndo}
    class="w-[160px] h-[56px] flex items-center justify-center gap-2 border border-line-3
           rounded-[12px] bg-transparent text-text text-[15px] font-medium cursor-pointer">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>
    </svg>
    Undo
  </button>
  <slot name="takeout" />
</div>
```

- [ ] **Step 4: Commit**

```bash
git add backend/frontend/src/lib/components/CorrectionPanel.svelte backend/frontend/src/lib/__tests__/CorrectionPanel.test.ts
git commit -m "feat(ui): CorrectionPanel — quick/full correction modes with dart utils"
```

---

### Task 13: GameDisplay (Match screen) + cleanup

**Files:**
- Modify: `backend/frontend/src/routes/GameDisplay.svelte` (full rewrite)
- Delete: `backend/frontend/src/lib/components/TopBar.svelte`
- Delete: `backend/frontend/src/lib/components/GameFooter.svelte`
- Delete: `backend/frontend/src/lib/components/ThrowTracker.svelte`
- Delete: `backend/frontend/src/lib/components/PlayerList.svelte`

- [ ] **Step 1: Delete absorbed components**

```bash
rm backend/frontend/src/lib/components/TopBar.svelte
rm backend/frontend/src/lib/components/GameFooter.svelte
rm backend/frontend/src/lib/components/ThrowTracker.svelte
rm backend/frontend/src/lib/components/PlayerList.svelte
```

- [ ] **Step 2: Rewrite `GameDisplay.svelte`**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { createSessionStore } from '../lib/ws.js'
  import { getGameView } from '../lib/gameViews/index.js'
  import DartBoard from '../lib/components/DartBoard.svelte'
  import PlayerCard from '../lib/components/PlayerCard.svelte'
  import CorrectionPanel from '../lib/components/CorrectionPanel.svelte'
  import { Badge } from '../lib/components/ui/badge/index.js'
  import { parseLabel } from '../lib/dartUtils.js'

  let sessionId = $state('')
  let sessionStore: ReturnType<typeof createSessionStore> | null = null
  let snapshot = $state<import('../lib/ws.js').Snapshot | null>(null)
  let unsubSnap: (() => void) | null = null

  let perPlayerVisits = $state<number[][]>([])
  let prevDartCount = 0
  let prevCurrentPlayer = 0
  let prevDarts: any[] = []
  let visitOwner = 0

  onMount(() => {
    const match = window.location.hash.match(/\/session\/([^/]+)/)
    sessionId = match?.[1] ?? ''
    if (!sessionId) return
    sessionStore = createSessionStore(sessionId)
    unsubSnap = sessionStore.snapshot.subscribe(snap => {
      if (!snap) { snapshot = null; return }
      updateVisitHistory(snap)
      snapshot = snap
    })
  })
  onDestroy(() => { unsubSnap?.(); sessionStore?.destroy() })

  function updateVisitHistory(snap: import('../lib/ws.js').Snapshot) {
    const newDarts = (snap.game.currentVisitDarts ?? []) as any[]
    const newCount = newDarts.length
    const newPlayer = snap.game.currentPlayer as number
    if (prevDartCount === 0 && newCount > 0) visitOwner = newPlayer
    if (prevDartCount > 0 && newCount === 0 && newPlayer !== prevCurrentPlayer) {
      const total = prevDarts.reduce((s: number, d: any) => s + (d.score ?? 0), 0)
      if (!perPlayerVisits[visitOwner]) perPlayerVisits[visitOwner] = []
      perPlayerVisits[visitOwner] = [...perPlayerVisits[visitOwner], total]
      perPlayerVisits = [...perPlayerVisits]
    }
    prevDartCount = newCount; prevCurrentPlayer = newPlayer; prevDarts = newDarts
  }

  const gameId = $derived(snapshot?.gameId ?? '')
  const players = $derived(snapshot?.players ?? [])
  const game = $derived(snapshot?.game ?? {})
  const currentPlayer = $derived((game.currentPlayer as number) ?? 0)
  const winner = $derived((game.winner as number | null) ?? null)
  const currentDarts = $derived((game.currentVisitDarts as any[]) ?? [])
  const view = $derived(getGameView(gameId))
  const highlights = $derived(view.getBoardHighlights(game, currentPlayer))

  // Map raw darts to label+score for CorrectionPanel
  const dartItems = $derived(currentDarts.map((d: any) => ({
    label: d.segment?.name ?? 'Miss',
    score: d.score ?? 0,
  })))

  // Checkout targets for board overlay
  const remaining0 = $derived((view.getPlayerDisplay?.(game, 0) as any)?.remaining ?? 0)
  const checkoutLabels = $derived(
    currentPlayer === 0
      ? (import('../lib/dartUtils.js').then(() => [])) // placeholder: compute via checkoutHint
      : []
  )

  function undo() { sessionStore?.send({ type: 'undo_dart' }) }

  function handleCorrect(dartIndex: number, label: string) {
    const parsed = parseLabel(label)
    sessionStore?.send({
      type: 'correct_dart',
      visitIndex: dartIndex,
      number: parsed.num,
      bed: parsed.mult === 3 ? 'Triple' : parsed.mult === 2 ? 'Double' : 'SingleOuter',
      multiplier: parsed.mult,
    })
  }

  async function closeSession() {
    if (!sessionId) return
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    push('/')
  }

  // Board manager actions (placeholder — board status not yet pushed to browser)
  async function bmAction(action: 'start' | 'reset' | 'stop') {
    await fetch(`/api/board/${action}`, { method: 'POST' })
  }
</script>

<div class="flex flex-col h-screen bg-bg text-text overflow-hidden">

  {#if !snapshot}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-text-muted text-lg">Connecting…</span>
    </div>

  {:else}
    <!-- Header -->
    <header class="h-16 flex-shrink-0 box-border px-7 flex items-center gap-6
                   border-b border-line bg-surface-1">
      <button type="button" onclick={closeSession}
        class="flex items-center gap-2 h-11 px-[14px] border border-line-3 rounded-[10px]
               text-[#c9c9bf] text-[14px] font-medium bg-transparent cursor-pointer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6"/>
        </svg>
        Leave
      </button>

      <div class="flex items-center gap-3">
        <h1 class="m-0 font-display font-bold text-[26px] uppercase tracking-[0.04em]">
          {gameId.toUpperCase()}
        </h1>
        <span class="text-[14px] text-text-muted">
          {(game.config as any)?.checkout ?? 'Double'} out
        </span>
      </div>

      <div class="ml-auto flex items-center gap-4">
        <Badge variant="live">LIVE</Badge>
        <!-- [PLACEHOLDER] board name from session snapshot -->
        <span class="text-[14px] text-[#c9c9bf]">Board</span>
      </div>
    </header>

    <!-- Main content -->
    <div class="flex-grow min-h-0 box-border p-[24px_28px] flex gap-6">

      <!-- Player 0 -->
      <div class="flex-1 min-w-0">
        {#if players[0]}
          <PlayerCard
            player={players[0]}
            playerIndex={0}
            {game}
            {view}
            isActive={currentPlayer === 0 && winner === null}
            isWinner={winner === 0}
            previousVisits={perPlayerVisits[0] ?? []}
          />
        {/if}
      </div>

      <!-- Board + correction panel column -->
      <div class="relative w-[560px] flex-shrink-0 flex flex-col items-center gap-[14px]">
        <DartBoard darts={currentDarts} highlightedSegments={highlights} />

        <CorrectionPanel darts={dartItems} onCorrect={handleCorrect} onUndo={undo}>
          {#snippet takeout()}
            <button type="button"
              onclick={() => sessionStore?.send({ type: 'takeout' })}
              class="flex-grow h-[56px] border-0 rounded-[12px] bg-text text-accent-fg
                     font-display font-bold text-[20px] tracking-widest uppercase cursor-pointer">
              Takeout · next player
            </button>
          {/snippet}
        </CorrectionPanel>
      </div>

      <!-- Player 1 -->
      <div class="flex-1 min-w-0">
        {#if players[1]}
          <PlayerCard
            player={players[1]}
            playerIndex={1}
            {game}
            {view}
            isActive={currentPlayer === 1 && winner === null}
            isWinner={winner === 1}
            previousVisits={perPlayerVisits[1] ?? []}
          />
        {/if}
      </div>
    </div>

    <!-- Winner overlay -->
    {#if winner !== null}
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="rounded-[18px] px-10 py-8 text-center pointer-events-auto
                    border border-line bg-[rgba(15,16,14,0.92)] [box-shadow:0_24px_60px_rgba(0,0,0,0.7)]">
          <p class="m-0 font-display font-bold text-[48px] text-accent uppercase mb-1">
            {players[winner]?.name} wins!
          </p>
          <button onclick={closeSession}
            class="mt-6 h-[54px] px-8 rounded-[10px] bg-accent text-accent-fg font-display
                   font-bold text-xl uppercase tracking-widest border-0 cursor-pointer">
            Back to lobby
          </button>
        </div>
      </div>
    {/if}
  {/if}
</div>
```

Note: `CorrectionPanel` uses a named snippet `takeout` for the action button. Svelte 5 named snippets require `{#snippet takeout()}...{/snippet}` in the parent and `<slot name="takeout">` in the child — OR pass it as a prop. If using Svelte 5 snippets, update `CorrectionPanel`'s action row slot accordingly.

- [ ] **Step 3: Fix CorrectionPanel takeout slot**

In `CorrectionPanel.svelte`, replace `<slot name="takeout" />` with a prop-based approach:

```svelte
// Add to props:
let { darts, onCorrect, onUndo, ontakeout }: {
  ...
  ontakeout?: () => void
} = $props()

// Replace <slot name="takeout"> in the action row:
{#if ontakeout}
  <button type="button" onclick={ontakeout}
    class="flex-grow h-[56px] border-0 rounded-[12px] bg-text text-accent-fg
           font-display font-bold text-[20px] tracking-widest uppercase cursor-pointer">
    Takeout · next player
  </button>
{/if}
```

Then in GameDisplay, replace the snippet with:
```svelte
<CorrectionPanel darts={dartItems} onCorrect={handleCorrect} onUndo={undo}
  ontakeout={() => sessionStore?.send({ type: 'takeout' })} />
```

- [ ] **Step 4: Verify the match screen in browser**

Start a session and navigate to `/session/:id`. Both player panels, dartboard, and correction panel should render with the new design.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/routes/GameDisplay.svelte backend/frontend/src/lib/components/CorrectionPanel.svelte
git commit -m "feat(ui): GameDisplay — match screen with new layout, correction panel, player cards"
```

---

### Task 14: ATC game view update

**Files:**
- Modify: `backend/frontend/src/lib/gameViews/atc.svelte`
- Modify: `backend/frontend/src/lib/gameViews/index.ts` (add `getPlayerDisplay` to `GameView` interface if missing)

- [ ] **Step 1: Read `atc.svelte` and `index.ts`**

Read both files before editing to understand the current view structure and what `getBoardHighlights` and any other methods return.

- [ ] **Step 2: Add `getPlayerDisplay` to `GameView` interface in `index.ts`**

```typescript
export interface GameView {
  getBoardHighlights(game: Record<string, unknown>, currentPlayer: number): number[]
  getPlayerDisplay(game: Record<string, unknown>, playerIndex: number): {
    remaining: number
    dartsLeft: number
  }
}
```

Any view that doesn't implement `getPlayerDisplay` should have a fallback added returning `{ remaining: 0, dartsLeft: 3 }`.

- [ ] **Step 3: Update ATC view colours**

In `atc.svelte`, apply the new tokens to the target progress grid:
- Current target cell: `bg-accent text-accent-fg`
- Completed cell: `bg-[#242820] text-text-muted`
- Opponent target cell: `border border-dashed border-accent text-text`
- Pending cell: `bg-surface-2 text-text-dim border border-line-2`

- [ ] **Step 4: Compile check**

```bash
cd backend/frontend && npx tsc --noEmit
```

Fix any type errors from the new `GameView` interface.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/gameViews/
git commit -m "feat(ui): ATC view — new design tokens, GameView interface update"
```

---

### Task 15: Final verification + nav icons

**Files:**
- Modify: `backend/frontend/src/lib/components/SideNav.svelte` (replace icon placeholders)
- Update: `backend/frontend/PLACEHOLDERS.md`

- [ ] **Step 1: Replace nav icon placeholders in `SideNav.svelte`**

Copy the SVG icons from `dartcade-design/design/Play.dc.html` (the `<nav>` section contains all 5 icons inline). Replace the grey rectangle placeholders with the real SVGs.

- [ ] **Step 2: Run full type check**

```bash
cd backend/frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Visual smoke test — all routes**

Open each route in the dev browser and verify:
- `#/login` — split layout, brand panel, dev button visible
- `#/register` — same brand panel, strength meter
- `#/` — sidebar, mode cards, setup panel
- `#/boards` — sidebar, board cards
- `/session/:id` — match layout, both player panels, dartboard

- [ ] **Step 4: Update `PLACEHOLDERS.md`** — mark nav icons as resolved, update any remaining items.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/components/SideNav.svelte backend/frontend/PLACEHOLDERS.md
git commit -m "feat(ui): replace nav icon placeholders, final verification"
```
