# UI Redesign — Design System Migration

**Date:** 2026-09-26  
**Branch:** `feat/ui-redesign`  
**Approach:** Token-layer swap (A) — update CSS variables, retheme existing shadcn-svelte primitives, rebuild all screens against the `dartcade-design/` handoff.

---

## 1. Design tokens

Replace `backend/frontend/src/app.css` entirely. The new token set:

**Colours (CSS variables):**
```
--bg:            #0f100e   /* page background */
--surface-1:     #131511   /* sidebar, top bar */
--surface-2:     #181a16   /* cards, inactive player */
--surface-active:#1b1e17   /* active player panel */
--line:          #2a2d27   /* default border */
--line-2:        #2e322b   /* card borders */
--line-3:        #353930   /* input borders */
--text:          #efeee6   /* primary */
--text-muted:    #a3a498   /* secondary labels */
--text-dim:      #8f9085   /* tertiary, timestamps */
--accent:        #c6f24e   /* CTA, active player, hits */
--accent-fg:     #0f100e   /* text on accent bg */
--live:          #ff5a4f   /* LIVE dot */
--live-text:     #ff8a80   /* LIVE label text */
```

**Tailwind v4 theme extension** — add to `app.css` via `@theme`:
- Map the above as `--color-*` so Tailwind utility classes (`bg-surface-1`, `text-accent`, etc.) work without config files.

**Typography:**
- Google Fonts import: `Barlow+Condensed:wght@500;600;700`, `Instrument+Sans:wght@400;500;600`, `JetBrains+Mono:wght@400;500`
- Body: `font-family: 'Instrument Sans', system-ui, sans-serif`
- Display / scores / buttons: `font-family: 'Barlow Condensed', sans-serif; font-weight: 700`
- Mono (IPs, event log, step numbers): `font-family: 'JetBrains Mono', monospace`

**Radii:** 10px inputs/buttons, 14–18px cards, 999px pills.

**Focus ring:** `outline: 2px solid #c6f24e; outline-offset: 2px`

---

## 2. Shadcn-svelte primitive retheme

These component files are already in `src/lib/components/ui/`. Edit them to match the new tokens.

### `button/button.svelte`
Replace the current variant map. New variants:
- **primary** (default CTA): `bg-accent text-accent-fg h-[54px] rounded-[10px] font-[Barlow_Condensed] font-bold text-xl tracking-widest uppercase` — used for "Sign in", "Start game"
- **secondary**: `bg-[#efeee6] text-accent-fg h-[56px] rounded-[12px] font-[Barlow_Condensed] font-bold text-xl uppercase` — used for "Takeout · next player"
- **ghost**: `h-10 px-[14px] border border-line-3 rounded-[10px] text-[#c9c9bf] text-sm` — used for "Leg history", "Leave"
- **outline**: `border border-line-3 rounded-[10px]` — misc controls
- **destructive**: `text-live-text border-live` — "Unpair"

### `input/input.svelte`
- `h-[52px] px-4 bg-surface-2 border border-line-3 rounded-[10px] text-text placeholder-[#7d7f74] focus-visible:outline-accent text-base`

### `badge/badge.svelte`
- **live**: `inline-flex items-center gap-2 h-[30px] px-3 rounded-full bg-[#3a1a17] text-live-text text-[13px] font-bold tracking-widest` with a red dot
- **throwing**: `inline-flex items-center h-7 px-3 rounded-full bg-accent text-accent-fg text-[13px] font-bold tracking-[0.08em] uppercase`
- **up-next**: `inline-flex items-center h-7 px-3 rounded-full border border-line text-dim text-[13px] font-semibold uppercase`

---

## 3. New shared component: `SideNav.svelte`

Used by all authenticated app views except Match/ATC (which have their own top bar).

**Props:** `currentPath: string` (used to set `aria-current="page"` and active bg).

**Structure (248px wide, full height, `bg-surface-1 border-r border-line`):**
1. Logo row: dartboard SVG icon + "DARTCADE" in Barlow Condensed 700 24px
2. Nav links (44px touch targets): Play, Live match (+ red dot if session active), Boards, Tournaments, History — icons from the design
3. User footer (margin-top: auto): avatar initial circle, username, Sign out link

**Active link style:** `bg-[#22251f] text-text font-semibold` with accent-coloured icon. Inactive: `text-[#c9c9bf] font-medium`.

**Current path:** Read from svelte-spa-router's `location` store (imported as `import { location } from 'svelte-spa-router'`), not a prop.

**Where used:** Boards.svelte, CreateSession.svelte. The component is a column that wraps inside the page's flex row.

---

## 4. Screen rebuilds

### 4.1 Login (`/login` → `Login.svelte`)

Reference: `Main.dc.html`

**Layout:** Full-viewport flex row (1440×900 design, fluid on smaller).
- **Left panel** (820px max, `bg-surface-1 border-r border-line`): Dartcade logo + brand copy + large dartboard SVG illustration positioned to bleed off-right edge. The board SVG is the same ring-based SVG from the design — decorative, not interactive.
- **Right panel** (flex-grow): centered 400px form column.

**Form fields:**
1. "Sign in" heading (Barlow Condensed 700 48px uppercase) + subtitle
2. Email input
3. Password input + "Forgot password?" link
4. "Keep me signed in" checkbox
5. "Sign in" button (primary variant)
6. "New to Dartcade? Create an account" → `#/register`

**Dev login button** (only rendered when `import.meta.env.DEV === true`):
- Rendered below the main "Sign in" button, full-width, ghost variant, label "Dev: sign in as admin"
- On click: fills email from `import.meta.env.VITE_DEV_EMAIL ?? 'admin@dartcade.local'`, password from `import.meta.env.VITE_DEV_PASSWORD ?? 'password'`, then calls the existing `submit()` function
- No `.env` file is created by this spec — the user adds credentials to `.env.local` if they want non-default values

**Register link:** "Create an account" navigates to `#/register`. The current combined login/register toggle in `Login.svelte` is removed; registration is a separate route.

### 4.2 Register (`/register` → new `Register.svelte`)

Reference: `Register.dc.html` (Step 1 of 2 only — Step 2 "connect board" is not yet designed)

**Layout:** Same split layout as Login. Extract the shared left panel into `src/lib/components/AuthPanel.svelte` (brand panel + dartboard illustration), used by both Login and Register. This avoids duplicating the SVG.

**Form fields:** Player name, email, password + strength meter (4-segment bar: weak/fair/good/strong coloured from red→amber→green→accent), terms checkbox, "Create account" primary CTA.

**Password strength:** Computed client-side by length + character-class count. No external library.

**After success:** Push to `#/` (lobby).

**Back link:** "Already have an account? Sign in" → `#/login`.

### 4.3 Boards (`/boards` → `Boards.svelte`)

Reference: `Boards.dc.html`

**Layout:** `SideNav` (248px) + main content area.

**Main content:**
- Page header: "Boards" title (Barlow Condensed 48px) + subtitle with online count + "Pair new board" primary CTA
- Board grid: 2-column, 2-row grid of board cards. Each card shows: status badge (Online / Online · in game / Offline), name (Barlow Condensed 32px), IP (JetBrains Mono), and a 3-column stat row (Cameras, Bridge version, Games)
- Active/selected card: accent border + `bg-surface-active`. Others: `bg-surface-2 border-line-2`
- **Detail panel** (400px aside, right of grid when a board is selected): 3 camera thumbnail tiles, Board Manager IP, bridge version, latency, live normalised event feed (JetBrains Mono, scrollable), Unpair button (destructive)
- **Pair new board card** (shown in grid when < 4 boards): pairing code input (6-digit) + "Connect" button

The current `Boards.svelte` fetches from `/api/boards` — keep that data layer unchanged, only swap the markup.

### 4.4 Play / New game lobby (`/` → `CreateSession.svelte`)

Reference: `Play.dc.html`

**Layout:** `SideNav` + main content area.

**Main content:**
- Page header: "New game" (Barlow Condensed 48px) + "Choose a mode…" subtitle + board selector button (pill showing connected board name + online dot, right-aligned)
- **Mode grid** (flex-grow, 2×2): 501, Dart Soccer, Challenges, Tournament cards. Selected card: accent border + accent glyph. Unselected: `bg-surface-2 border-line-2` with outlined glyph (`-webkit-text-stroke`). Each card: large display glyph (88px Barlow Condensed), mode name, short description.
- **Setup aside** (400px): X01 options (start score segmented control, checkout mode segmented control, first-to-N-legs selector), players list (add/remove), "Start" CTA.
- Non-X01 setup panels: placeholder "Coming soon" state (same aside, no fields).

Keep existing API calls to `/api/games`, `/api/boards`, `/api/sessions` unchanged.

### 4.5 GameDisplay — 501/X01 match (`/session/:id` → `GameDisplay.svelte`)

Reference: `Match.dc.html`

**Layout:** Full viewport flex column. No sidebar.

**Header** (64px, `bg-surface-1 border-b border-line`):
- "Leave" ghost button (chevron-left icon) → close session
- Game title (Barlow Condensed 26px uppercase) + subtitle (mode, leg info)
- Right cluster: "Leg history" ghost button, LIVE badge, board name

**Main area** (flex row, padding 24px 28px, gap 24px):
- **Player panel × 2** (flex: 1 each, `rounded-[18px]`):
  - Active player: `bg-surface-active border-2 border-accent`
  - Inactive player: `bg-surface-2 border border-line-2`
  - Content: name + avatar + leg dots, status badge (Throwing / Up next), remaining score (220px Barlow Condensed), checkout hint box, avg/darts stats, last 3 visits chips
- **Board column** (560px, centred):
  - `DartBoard` component (540×540) — rethemed to use design ring colours: green `#1e7a4f`, red `#d23b36`, cream `#e9dfc4`, black `#1a1a17`. Checkout target overlays as dashed accent circles. Dart dots as solid accent circles with `#0f100e` stroke.
  - **Dart tiles** (3 columns, 72px each): thrown darts show `bg-accent text-accent-fg`; waiting slots show dashed outline. Tapping a thrown dart opens the correction panel.
  - **CorrectionPanel**: popover anchored above tiles. Two modes:
    - *Quick*: nearby picks grid (4 columns, 56px buttons, `bg-[#2a2e26]`) + "Other…" dashed button
    - *Full*: S/D/T segmented toggle + 1–20 grid (5 columns) + 25/Bull/Miss row
    - Corrected dart tile labelled "Corrected" in uppercase tag
  - Action row: "Undo" ghost button + "Takeout · next player" secondary CTA
  - Hint line: "Tap a dart to correct it · Visit so far N"

**Winner overlay:** unchanged from current (modal over full screen).

**DartBoard SVG retheme:** The current `DartBoard.svelte` uses normalised geometry (r=1) which is good. Update `ringColor` to return `#d23b36` / `#1e7a4f` (treble/double) and `#e9dfc4` / `#1a1a17` (single rings). Change number text to `#efeee6`, font to Barlow Condensed. Update wire stroke to `#8d8e84`. Dart dots: `#c6f24e` fill, `#0f100e` stroke.

### 4.6 ATC game view (`src/lib/gameViews/atc.svelte`)

Reference: `ATC.dc.html` (2-player)

Update `PlayerCard` usage and the 21-step progress grid to use new tokens:
- Current target wedge: `bg-accent text-accent-fg`
- Completed: `bg-[#242820] text-text-muted`
- Opponent's current target: dashed accent border
- Progress grid: 21 cells (1–20 + Bull), 7×3 layout, 44px cells

The `GameDisplay.svelte` board-side vs sidebar layout rule ("board centre for 2 players, board to side for 3+") is already handled by the existing `getGameView` hook — keep that logic, just update the visual output.

---

## 5. Components deleted / merged

These existing components are absorbed into the screen rebuilds and should be removed:

| Deleted | Absorbed into |
|---------|---------------|
| `TopBar.svelte` | `GameDisplay.svelte` header bar |
| `GameFooter.svelte` | `GameDisplay.svelte` action row |
| `ThrowTracker.svelte` | `GameDisplay.svelte` dart tiles row |
| `PlayerList.svelte` | `CreateSession.svelte` players section |

`CorrectionPanel.svelte` and `PlayerCard.svelte` remain as standalone components (they're referenced in `GameDisplay.svelte`), but are fully rebuilt to match the new design.

**CorrectionPanel interface change:** The existing component is a simple dropdown form (`onUndo`, `onCorrect(visitIndex, number, bed, multiplier)`, `dartCount`). The rebuild expands this significantly:
- New props: `darts` (the current visit's dart array), `detectedLabels: string[]` (e.g. `["T20", "S5", null]`), `onCorrect(dartIndex, label)`, `onUndo`
- Internal state: `openDart: number | null`, `mode: 'quick' | 'full'`
- Nearby-picks algorithm and checkout hint logic move into `src/lib/dartUtils.ts` (new file): `nearbyPicks(label)`, `checkoutHint(remaining)`, `parseLabel(label)`, `labelPos(label)` — these are pure functions, easily unit-tested
- `CorrectionPanel` calls these utils internally; `GameDisplay` only sees the `onCorrect(dartIndex, label)` callback

---

## 6. Route changes

| Route | Before | After |
|-------|--------|-------|
| `#/login` | combined login + register | sign-in only |
| `#/register` | *(none)* | new Register screen |
| `#/` | CreateSession (plain) | Play lobby with sidebar |
| `#/boards` | Boards (plain) | Boards with sidebar |
| `#/session/:id` | GameDisplay (plain) | Match with new header |

`App.svelte` gains the `/register` entry in the route map.

---

## 7. What is not in scope

- Tournaments page, History page, leg-history drawer (not designed)
- Dart Soccer / Challenges / Tournament setup (placeholders in Play)
- Board pairing flow step 2 (board connect — not designed)
- ATC Party (4-player layout) — `ATC-Party.dc.html` exists but the 4-player path is not wired in the backend yet
- Mobile / responsive layout (design is 1440×900 desktop)
