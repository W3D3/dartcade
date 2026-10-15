# Minigolf outline circles and curves: an editable shape baked into the outline

Classic minigolf holes widen into a round green around the cup (a keyhole: a straight lane that
opens into a circle), and many have curved rails. This adds a circle tool and curved (Bézier)
edges to the hole editor. The editor keeps the hole's editable shape — corners, curved edges and
live circles — and bakes it into the plain polygon outline that everything else already plays.

Builds on the course editor (`2026-10-14-minigolf-course-editor-design.md`) and replaces its
"Sharp corners only" rule for the outline.

## Data

A hole keeps `outline: Pt[]`, unchanged: the baked polygon. Physics (2D and 3D), the ground mesh,
the checks, the bot, the 2D and 3D views and games read only this.

New, optional, on `Hole`:

```ts
shape?: { corners: Pt[]; curves: (null | { c1: Pt; c2: Pt })[]; circles: { center: Pt; r: number }[] }
```

- `corners`: the polygon as the editor draws it (what the Outline tool edits today).
- `curves`: one entry per edge, same length as `corners`; entry `i` is the edge from corner `i` to
  corner `i + 1` (wrapping). `null` is a straight edge; `{ c1, c2 }` makes it a cubic Bézier with
  those two control points.
- `circles`: discs merged into it. They may overlap the corners' polygon and each other.
- The editor's source. Saved with the draft and published with the hole; the server stores it and
  checks only that it's well-formed (`holeSchema`, the API spec: finite numbers, `r > 0`,
  `curves.length === corners.length`).
- Games copy the hole as today; `shape` rides along unused.

## Baking

`bakeOutline(shape): Pt[]`, pure, in `backend/src/shared/minigolf/`:

- Each curved edge is flattened into straight segments, split until every piece is within 2 mm of
  the true curve and turns at most 2° (recursive subdivision; at most 256 pieces per edge). Straight edges stay as they
  are. This gives the corners' polygon.
- Each circle becomes a polygon turning 2° per corner (180 sides), its first corner at angle 0, so a
  ball bounces off it at most 1° off a true circle.
- The union of the flattened corners' polygon and every circle, with a polygon-union library (e.g.
  `polygon-clipping`; added to the shared minigolf code, pinned in both packages like nape-js and
  Rapier — say why in the commit).
- The union's outer ring is the outline. Holes inside the union (a ring of circles round an empty
  middle) and pieces that don't touch the rest are refused: the tool keeps the last valid shape and
  says why ("The circle must touch the course").
- Corners closer than 1 mm are merged, so the outline has no slivers.

The editor bakes on every edit to `shape` and saves `outline` and `shape` together. Undo and redo
keep working: each edit is still one hole state.

## Keeping the two in step

The editor always rebakes from `shape`, so the outline can't drift from it. One case needs a rule:
a hole whose `outline` was changed without its `shape` (the bench's JSON editor, an old copy).

- On load, if `shape` is present and `bakeOutline(shape)` doesn't match `outline` (same corners,
  within 1 mm), the editor drops `shape` and edits the outline as plain corners, with a notice:
  "This hole's circles were changed elsewhere and are now plain corners."
- Holes without `shape` (all existing holes) open as plain corners, as today. They get a `shape`
  the first time a circle is added or an edge is curved: `corners` = the current outline, `curves`
  all `null`, plus the new circle or curve.

## Editor

- **Circle tool** in the Outline group (shortcut `O` cycles Outline → Circle, or its own key if
  free): drag from the centre to set the radius; snaps the centre to the 50 mm grid and the radius
  to 10 mm (Shift draws freely). Properties: centre, radius (number fields); Delete removes it.
- **Select** picks a circle by its rim or centre: drag the centre to move it, the rim handle to
  resize it. Circles are listed in Elements ("Circle 1 — r 450 mm").
- **Curved edges** in the Outline tool: a selected edge gets a "Curve" toggle in Properties (and
  the `K` key). Curving it places the two control points a third of the way along the edge, pushed
  out by a sixth of its length, so it bows gently outward; their handles drag freely, snapping to
  the 50 mm grid (Shift draws freely). "Straighten" sets the edge back to `null`. Moving a corner
  moves its edges' neighbouring control points with it, keeping the curve's shape.
- The **Outline tool** edits `shape.corners` and `shape.curves`; with circles present the canvas draws the baked
  outline as the felt and rails, and the corners' polygon and circles as thin guides while the
  Outline or Circle tool is active.
- A circle that would make the shape invalid (see Baking) is refused on release, with the message
  in the Checks list; the drag shows it in red while invalid.

## Checks

The checks run on the baked outline, unchanged — a curve bent into a loop shows up there as the
outline crossing itself. New errors from the shape itself: a circle with `r <= 0`, non-finite
numbers, or `curves` not matching `corners` (`validateHole`, extended to `shape`).

## Testing

- `bakeOutline`: a lane plus a circle round its end gives a keyhole (outline inside both, corner
  count, area within 1% of the analytic union); a circle fully inside the lane leaves the outline
  as the lane; a circle that doesn't touch is refused; deterministic (same input, same corners).
- Flattening: a curve lies within 2 mm of its sampled true points; a straight `null` edge adds no
  corners; a curve bowed into a loop bakes into an outline the checks flag.
- Editor ops: add, move, resize and delete a circle; curve and straighten an edge; moving a corner
  carries its control points; undo; the mismatch rule on load.
- The API and DB keep `shape` through save, publish and a game start.
- 3D physics on a keyhole hole stays within the 150 ms shot budget (`npm run test:perf`), and a
  ball rolled round the circle's rail doesn't snag on its corners.
- E2E: draw a keyhole with a curved rail, publish, play it.

## Not in scope

Rounding sharp corners automatically (fillets; a curved edge does it by hand), arcs that cut into
the outline (subtracting circles), curved or circular walls inside the course.
