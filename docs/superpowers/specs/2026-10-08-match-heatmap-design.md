# Match heatmap

A second view on the X01 match details page: where every dart landed, per player, as a fuzzy
heatmap on the board, with a few cards about the throwing. Stacked on the match details page
(`docs/superpowers/specs/2026-10-08-match-details-design.md`).

Design canvas: `project/X01-Details-Heatmap.dc.html`, `X01-Details-Party-Heatmap`,
`X01-Details-Teams-Heatmap`.

## Scope

In:

- X01 only: "Leg by leg" and "Heatmap" become the two views of the right-hand section.
- Duel, party and teams; desktop, tablet, phone.
- Everything from the existing `GET /api/games/{id}` response: no API change.

Out (later): Around the Clock (its cards would need a different "aim"), per-leg heatmaps,
comparing two players on one board.

## Page

The X01 section's title becomes two title-tabs: **Leg by leg** and **Heatmap** (the artboards'
large Barlow titles; the inactive one is muted and clickable). `role="tablist"`, arrow keys
switch, the selected view's panel is `role="tabpanel"`. The view isn't in the URL.

Heatmap view, top to bottom (side by side from `lg`: board left, summary right):

- **Player chips** ("Show heatmap for"): one chip per player with their avatar; teams group the
  chips under Team A / Team B. One selected at a time; default: you, else the winner (the
  existing `highlightDefault`).
- **Board**: a muted dartboard (segments in the surface greys, numbers in `text-dim`), the heat
  layer, and a dot per dart that has a position (`coords`), drawn like the artboard (dark fill,
  light ring). Legend under it: "Fewer ▬ More darts · ● Dart".
- **Summary line**: "Christoph · All 4 legs · 66 darts"; when some were entered by hand:
  "· 12 entered by hand, not on the board".
- **Cards**:
  - **In the 20**: share of darts in S20/D20/T20, "74%", sub "49 of 66".
  - **Trebles**: count, sub the most common treble "T20 × 16" ("—" when none).
  - **Miss side**: darts in 1 or 18 ("Right") against 5 or 12 ("Left"); the bigger side, sub
    "1 / 18 · 8 vs 6" (or "5 / 12 · …"); "Even" on a tie; "—" when neither has any.
  - **Grouping**: mean distance of positioned darts from their centroid in mm (outer double wire
    = 170 mm from the centre), sub "avg. spread"; "—" with fewer than 3 positioned darts.
- **Most hit**: the top 5 segments by count (label like the chalkboard: S20, T20, D16, 25,
  Bull; misses aren't a segment), with a bar relative to the first.

All darts count in the cards and Most hit (their segment is known); only positioned darts get a
dot, feed the heat and count for Grouping.

## Heat layer

[simpleheat](https://github.com/mourner/simpleheat) (≈1 KB, no dependencies, BSD-2) on a canvas
stacked over the SVG board and under the SVG dots, the same size as the board.

- Positions: `coords` are board units (y up, r = 1 at the outer double wire); map to the board's
  pixel space.
- Gradient from our tokens at runtime: transparent → `--color-accent` (lime) at the densest, via
  a muted lime; read with `getComputedStyle` so the theme drives it.
- Sharp everywhere: canvas sized by `devicePixelRatio`, redrawn on resize (`ResizeObserver`);
  blob radius and blur scale with the board size so the look is the same at 500 px and 300 px;
  `max` set from the data so a handful of darts still shows.
- The canvas is `aria-hidden`; the board has `role="img"` and an `aria-label` like "Heatmap of 66
  dart positions for Christoph; most hit S20, T20, S5; average spread 38 mm".
- No canvas during SSR (render tests): the layer mounts in the browser only.

## Code

- `backend/frontend/src/lib/details/heatmap.ts` (pure, unit tested): the selected player's
  darts across all legs (from `detail.legs[].visits[].darts`, by `seat`), `inThe20`, `trebles`,
  `missSide`, `grouping` (mm), `mostHit(5)`, the summary line and the board's aria label.
- Components in `lib/components/details/`: `HeatmapView.svelte` (chips, layout, cards),
  `HeatBoard.svelte` (SVG board + canvas heat + dots), and the title-tabs in `X01Legs.svelte`'s
  section (or a small `X01Section.svelte` wrapping Leg by leg and Heatmap).
- Dependency: `simpleheat` (types: a small local `.d.ts` if it ships none).

## Edge cases

- A player with no positioned darts (manual game): no heat or dots; the board shows "No dart
  positions — these darts were entered by hand" over it; cards still fill.
- A player with no darts at all (forfeited before throwing): "No darts thrown" and empty cards.
- Busts and checkouts count like any dart; bull-off darts aren't in `detail.legs` and don't count.

## Testing

- Unit: `heatmap.ts` — manual darts counted but not positioned, misses (no segment number),
  bulls (25 / Bull labels), ties in Miss side and Most hit, Grouping with < 3 positions, the mm
  scale.
- Render (SSR): the tabs switch views; the heatmap view shows chips, the summary line with the
  hand-entered note, the cards and Most hit; teams group chips by team.
- e2e: open a finished game's details, switch to Heatmap, see the cards.
- The heat layer itself is checked by eye in the preview (canvas isn't rendered in SSR).
