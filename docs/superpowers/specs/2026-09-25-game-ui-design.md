# Game UI Design — Generic Plugin Architecture

**Date:** 2026-09-25
**Branch:** feat/game-ui
**Status:** Approved for implementation

---

## Goal

Replace the placeholder `GameDisplay.svelte` with a professional, game-type-aware UI modelled on the Autodarts app aesthetic. The UI must be extensible: adding a new game requires only a backend game module + a single frontend stats component, with zero changes to the core display shell.

Success criteria:
- ATC game is fully playable with the new UI end-to-end
- Adding a future game (e.g., 501, Cricket) only requires `games/<id>.ts` + `gameViews/<id>.svelte`
- Layout matches the 3-column dark-navy reference design
- shadcn-svelte primitives installed and used for interactive elements

---

## Visual Design

> The reference screenshots are UX inspiration only — layout, information hierarchy, and interaction patterns. Colours, typography, and visual style are an original design.

### Colour palette

| Token | Value | Usage |
|---|---|---|
| `bg-base` | `#0b1628` | Page background |
| `bg-card-inactive` | `#1a2638` | Inactive player card |
| `bg-footer` | `#111d2e` | Footer / header bars |
| `text-primary` | `#f1f5f9` | Names, scores |
| `text-muted` | `#64748b` | Secondary labels |
| `accent-blue` | `#3b82f6` | Next button, active border |

Player colour palette (index → gradient pair, used for active card and as the player's identity colour throughout). Lives in `frontend/src/lib/constants.ts`:

```ts
const PLAYER_COLORS = [
  { from: '#be2584', to: '#7b2fa8' },  // pink-purple
  { from: '#1e40af', to: '#0f766e' },  // blue-teal
  { from: '#b45309', to: '#92400e' },  // amber
  { from: '#065f46', to: '#1e3a8a' },  // green-navy
]
```

Active card: vivid gradient. Inactive card: `bg-card-inactive`, muted text.

### Layout

```
┌────────────────────────────────────────────────────────────┐
│  ← Exit   [ATC]  [Mode tags…]                              │  TopBar (48px)
├────────────────────────────────────────────────────────────┤
│  🎯 ─────   🎯 ─────   🎯 ─────          12    [👤]        │  ThrowTracker (64px)
├─────────────────┬────────────────────┬─────────────────────┤
│                 │                    │                      │
│  [PlayerCard]   │    [DartBoard]     │    [PlayerCard]      │  main (flex-1)
│                 │                    │                      │
├────────────────────────────────────────────────────────────┤
│  [⚡ BM]                             [↩ Undo]  [Next ▶]   │  GameFooter (56px)
└────────────────────────────────────────────────────────────┘
```

- **2 players:** 3-column (card ¹⁄₄ | board ¹⁄₂ | card ¹⁄₄). Cards fill height.
- **3–4 players:** Cards stack on each side (2 per side, or top+side).
- **Mobile / narrow:** Dartboard stacks above player cards (single column).

---

## Backend Change (minimal)

`gameId` must be included in the WS snapshot so the frontend can select the correct game view plugin.

**`src/session/types.ts`** — add `gameId` to `Snapshot`:

```ts
export type Snapshot = {
  type: 'snapshot'
  sessionId: string
  gameId: string          // ← add
  players: Player[]
  game: Record<string, unknown>
}
```

**`src/session/engine.ts`** — `getSnapshot()`:

```ts
return {
  type: 'snapshot',
  sessionId: session.id,
  gameId: session.module.id,   // ← add
  players: session.players,
  game: { ...session.module.view(session.currentState, session.players), currentVisitDarts },
}
```

Update the `Snapshot` type in `frontend/src/lib/ws.ts` to match.

---

## Frontend Game View Plugin System

### Registry

```ts
// src/lib/gameViews/index.ts

export interface GameView {
  PlayerStats: Component          // Svelte component, rendered inside PlayerCard
  getBoardHighlights?: (
    game: Record<string, unknown>,
    playerIndex: number,
  ) => number[]                   // segment numbers to highlight (1–20); empty = no highlight
}

export const gameViews: Record<string, GameView> = {
  atc: {
    PlayerStats: ATCPlayerStats,
    getBoardHighlights: (game, i) => {
      const targets = game.targets as number[]
      const t = targets[i]
      return t >= 1 && t <= 20 ? [t] : []
    },
  },
}

export function getGameView(gameId: string): GameView {
  return gameViews[gameId] ?? { PlayerStats: FallbackPlayerStats }
}
```

### ATC PlayerStats component

Props: `game: Record<string, unknown>`, `playerIndex: number`, `isActive: boolean`

Renders:
- Target number (large, `text-7xl font-bold`)
- Leg badge (`[0]`)
- `Hit% —` as placeholder (styled as `text-muted italic`, tooltip: "stat tracking coming soon")

### Fallback PlayerStats

Renders the raw `game` object as a `<pre>` block. Useful during development of new game modules.

---

## Component Specifications

### `GameDisplay.svelte` (route)

Responsibilities:
- Reads `sessionId` from URL hash (`/session/:id`)
- Creates and manages `sessionStore` (WS connection)
- Looks up `getGameView(snapshot.gameId)`
- Renders the 4-zone layout (TopBar, ThrowTracker, main 3-col, GameFooter)
- Passes game view to children; holds no game-specific logic itself

```svelte
<GameDisplay>
  <TopBar {sessionId} gameId={snap.gameId} players={snap.players} />
  <ThrowTracker darts={snap.game.currentVisitDarts} />
  <main>
    {#each snap.players as player, i}
      {#if i === 0 || i === 1}
        <PlayerCard {player} {i} {snap} {view} {currentPlayer} {winner} />
      {/if}
    {/each}
    <DartBoard darts={currentDarts} highlightedSegments={highlights} />
  </main>
  <GameFooter {sessionId} onUndo={undo} />
</GameDisplay>
```

### `ThrowTracker.svelte`

Props: `darts: Dart[]` (0–3 items)

Renders a row of 3 dart slots:
- Empty slot: dart silhouette icon, greyed out
- Filled slot: dart icon + segment name (`T20`, `D5`, `1`, `Miss`)
- Right side: current visit total score (sum of `dart.score`)

### `PlayerCard.svelte`

Props: `player`, `playerIndex`, `gameState`, `view: GameView`, `isActive`, `isWinner`

Structure:
```
[avatar initial] [name] [flag placeholder]    ← header
─────────────────────────────────────────
<svelte:component this={view.PlayerStats}      ← game-specific stats
  game={gameState} playerIndex={playerIndex}
  isActive={isActive} />
─────────────────────────────────────────
[ prev visit ]  [ prev visit ]              ← score history (last 4 visits)
```

Active state: gradient background using `PLAYER_COLORS[playerIndex]`.
Inactive state: `bg-card-inactive`.
Winner state: gold border + trophy badge.

Score history: stored as a `previousVisits: number[][]` array in `GameDisplay` state (not per-card), updated when `currentVisitDarts` transitions from non-empty to empty in the snapshot. Must ignore `board.resync` resets (which also zero `currentVisitDarts`) — distinguished by whether darts were present in the immediately prior snapshot. Purely client-side; no backend stat tracking.

### `DartBoard.svelte` (enhanced)

New prop: `highlightedSegments: number[]` (default `[]`)

When non-empty:
- Segments in the list render at full opacity/colour
- All other single/triple/double sectors rendered at 25% opacity (multiply filter or `fill-opacity`)
- Bull always remains at full opacity
- Dart markers unchanged

### `GameFooter.svelte`

Left: BM status indicator (green dot = running, grey = not running), clicking shows minimal start/stop/reset buttons as a popover.

Right: `Undo` button (shadcn `Button` variant `ghost`) + `Next` button (shadcn `Button` variant `default`, blue). Next = sends `{ type: 'next_turn' }` user action (currently a no-op; bridges to manual turn advance in future).

### `TopBar.svelte`

Left: back arrow + game mode tags (gameId, config summary).
Right: connection indicator.

---

## shadcn-svelte Installation

```bash
# In frontend/
npx shadcn-svelte@latest init
npx shadcn-svelte@latest add button badge card separator
```

Requires Svelte 5 + Tailwind v4 — both present. shadcn-svelte ≥ 0.14 supports this stack.

Components used:
- `Button` — Undo, Next, BM controls
- `Badge` — leg count, player indicators
- `Separator` — card dividers
- `Card` (optional base) — or raw `<div>` for player cards since we need full gradient control

---

## Data Flow

```
WS → Snapshot { gameId, players, game: { ...gameView, currentVisitDarts } }
       │
       ├─ gameId ──────→ getGameView(gameId) → { PlayerStats, getBoardHighlights }
       │
       ├─ currentVisitDarts → ThrowTracker
       │                    → DartBoard (dart markers)
       │
       ├─ getBoardHighlights(game, activePlayerIndex) → DartBoard.highlightedSegments
       │
       └─ players × game → PlayerCard[]
                              └─ <PlayerStats game={game} playerIndex={i} />
```

User actions sent over WS:
- `{ type: 'undo_dart' }` — already implemented in engine
- `{ type: 'next_turn' }` — future: manual turn advance (no-op in engine for now)

---

## File Manifest

| Path | Action |
|---|---|
| `src/session/types.ts` | Add `gameId: string` to `Snapshot` |
| `src/session/engine.ts` | Include `gameId` in `getSnapshot()` |
| `frontend/src/lib/ws.ts` | Add `gameId` to `Snapshot` type |
| `frontend/src/routes/GameDisplay.svelte` | Full redesign |
| `frontend/src/lib/components/TopBar.svelte` | New |
| `frontend/src/lib/components/ThrowTracker.svelte` | New |
| `frontend/src/lib/components/PlayerCard.svelte` | Redesign |
| `frontend/src/lib/components/DartBoard.svelte` | Add `highlightedSegments` prop |
| `frontend/src/lib/components/GameFooter.svelte` | New |
| `frontend/src/lib/gameViews/index.ts` | New — registry + `GameView` interface |
| `frontend/src/lib/gameViews/atc.svelte` | New — ATC `PlayerStats` component |
| `frontend/src/lib/gameViews/fallback.svelte` | New — dev fallback |

shadcn-svelte components added under `frontend/src/lib/components/ui/` (managed by the CLI).

---

## Out of Scope

- 501 game module (future — slots into `gameViews/x01.svelte` when ready)
- Cumulative stat tracking (Leg avg, Match avg, Hit%) → **GitHub issue to file**
- Correction UI / segment picker (existing `CorrectionPanel.svelte` retained as-is)
- Profile avatars / flag images (placeholder initials used)
- Mobile layout (noted above, not built in this iteration)
