# In-game redesign: design

**Source of truth:** the Dartcade Platform Design canvas (https://claude.ai/artifact/2ZyCCfSMhs3PKZzNLzsw23),
artboards `project/Match.dc.html`, `Match-Correct.dc.html`, `Match-Party.dc.html`, `Solo-X01.dc.html`
(Focus variant), `ATC.dc.html`, `ATC-Party.dc.html`, `Solo-ATC.dc.html` (Focus variant), `Guide-InGame.dc.html`,
`VisitFX.dc.html`, `Settings-InGame.dc.html`, and the tokens in `project/ds/dartcade/tokens.json`.
Read artboards with the Artifact tool (`read_file`); they are reference markup, not runnable code.

## Scope (decided 2026-09-30)

- **In:** the live game screen (`backend/frontend/src/routes/GameDisplay.svelte`) for X01 and Around the Clock,
  desktop layouts for 1 player (Focus variant), 2 players (face-off) and 3+ players (stacked rows);
  visit celebrations (VisitFX); the settings drawer (without the Caller section).
- **Out:** post-match Details/History pages, tablet and phone layouts, the solo coach panel
  (cross-session stats), the "Leg history" drawer, new bust and win states (the existing ones stay,
  restyled only where they already appear), the bull off screen (already redesigned).
- **Stats stay client-side.** No backend changes. Visit history is still reconstructed in the browser
  from snapshots (so it is lost on reload), but moved into a tested module and derived from the
  scores in the snapshot, so busts count 0 and a new leg starts a new chalkboard.

## Layout rules (Guide-InGame)

- Pick the layout by player count. The center column is the same everywhere: board on top, then the
  visit band, then three dart slots and the control bar, pinned to the bottom.
- 1 player: left panel 400px (you), center column takes the rest; the visit band becomes a compact
  tile beside the slots (Focus variant). No coach panel.
- 2 players: player panel, 560px center column, player panel. Sides follow player order and never swap.
  The active panel has the lime border; the waiting X01 player shows "Can finish" as one line.
- 3+ players: stacked rows in player order on the left, a 480px board column on the right. The active
  row is taller (X01: `1.55fr` vs `1fr`) and lime-bordered.
- Number hierarchy: score/target 220px › visit sum 96px › dart labels 66px › stats 15px. On short
  screens the 220px score scales down (`min(220px, 24vh)`).
- Checkout lives in the slots: empty dart slots show the suggested target with a foot line
  ("leaves 24", "Game shot", "to win the leg"; ATC: "your target"). No checkout box for the thrower.
- Takeout advances by itself on a board. The manual advance is a quiet "Skip to next ›" text button
  on board sessions. **Deviation:** boardless sessions have no automatic takeout, so there the button
  reads "Next player ›" and uses the outline style. Undo is an outline button.

## Kept from today (not in the design)

- The Board / Enter toggle in the header and the keypad (`DartEntryPanel`) replacing the board in the
  center column in Enter mode. Its `aria-label`s ("Single 1", …) are used by e2e tests.
- The End button, the board status panel (`BoardStatusPanel`), the winner overlay, the bull off screen.
- Dragging darts on the board to correct them, and click-to-place with exact coordinates.
- E2e selectors: visible text "Bust" on a bust, "Target" and "N of 21 done" for ATC.

## Tokens

Added to `@theme` in `backend/frontend/src/app.css` (names from tokens.json):
surface-panel #151713, surface-inset #1f221c, surface-chip #242820, surface-key #2a2e26,
line-strong #65685f, line-chip #3a3e36, line-key #3a3f35, line-dashed #3e4239, line-popover #454a3f,
line-pip #6a6e63, line-next #6a6f62, ink-soft #d8d8ce, ink-2 #c9c9bf, ink-3 #b4b5aa, ink-faint #828379,
accent-hover #dcff7a, live-soft #3a1a17, danger-text #ff7a70, danger-line #4a2e2b, bg-deep #0a0b09.
Existing tokens keep their names (`surface-1` = surface-rail, `surface-active`, `text`, `text-muted`,
`text-dim`, `accent`, `accent-fg`, `line`, `line-2`).

## Settings

Stored in localStorage under the existing key `dartcade_game_settings`, merged over defaults:
`checkoutSuggestions` (true), `visitSum` (true), `chalkboard` (true), `volume` (0.7),
`soundHit`, `soundMiss`, `soundSwitch`, `soundBust` (all false). `showMarkers` is dropped: 3+ player
ATC always shows other players' targets on the board, as designed. Footer copy: "Saved on this
device. Changes apply right away." (the design's "Saved for this board" would be untrue).

## Visit celebrations (VisitFX, X01 only)

- Any dart ≥ 50: its slot pops once (scale 1.08 at 12%, expanding lime ring), the sum ticks (1.12).
- Visit 100–179: band #1f2618 with a 2px lime border, eyebrow "Ton plus", sum lime, soft pulse (1.6s).
- Visit 180: band lime, all text #0f100e, eyebrow "Maximum", hard pulse (2.6s) and ~30 confetti pieces.
- Each plays once when the dart lands. `prefers-reduced-motion`: no animation, no confetti, colours only.
