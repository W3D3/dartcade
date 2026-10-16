# Play cards: implementation plan

Spec: `docs/superpowers/specs/2026-10-16-play-cards-design.md`.

1. **Game list** (`lib/gameModes.ts`): give every mode a `cat` (`arcade` | `classic` | `practice`),
   an `img` (an imported SVG from `lib/assets/games/`), the design's `name` and `desc`, and
   `small: true` for the strip rows. Add the coming-soon games, drop Tournament, and export the
   categories (`GAME_CATEGORIES`: id, name, sub). Keep `glyph` for the dialog's tiles. Update
   `gameModesFlags.test.ts` if ids move.
2. **`GameCards.svelte`** (`lib/components/`): props `selected`, `open`, `disabled`, `onselect`.
   One button per game that morphs between card and row with CSS transitions (as the artboard
   does), the hover CSS in a scoped `<style>`, and flag filtering as in `GameModeTiles`.
3. **`CreateSession.svelte`**: an `open` state (false at first; true on a pick, on the lobby's
   game for Continue, and always for a member). Above the cards, All games when open. The panel
   (header, `GameSettings` in two columns, footer with `nextGameSummary`, hint, PlayButton and
   New lobby) shows only when open. The subtitle follows the state.
4. **e2e** (`e2e/fixtures/lobby.ts`): pick the card before waiting for Choose players.
5. Verify: typecheck, lint, unit tests, format; screenshot the page at desktop and phone widths
   (grid, hover, picked).
