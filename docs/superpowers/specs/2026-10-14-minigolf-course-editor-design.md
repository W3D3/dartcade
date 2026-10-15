# Minigolf course editor (v1: admins edit the official courses)

Admins design playable Minigolf courses in the app: a course editor and a hole editor, following
the **Golf Editor** artboards in the design canvas (`project/Golf-Editor-Course.dc.html` and
`project/Golf-Editor-Hole.dc.html`; `-Outline` and `-Terrain` are the hole editor with another
tool picked). Courses move from code into the database, with drafts and a Publish step. New games
play the published courses.

Builds on the 3D game (`2026-10-13-minigolf-3d-design.md`).

## Scope

This spec (v1):

- Courses and holes in the database, drafts and Publish, holes shared between courses.
- The course editor and its hole library; the hole editor with all its tools; Test putt in 3D;
  checks; reachability and a suggested par from a putting bot.
- Games start from the published courses.

Later, separate specs:

- The players' course picker (`project/Minigolf-Courses.dc.html`): previews, difficulty.
- v2: user courses (Private / Friends / Public) and sharing.

Not in scope: moving parts (windmills), rounded outline corners, editing in 3D.

## Data

### Tables

`minigolf_holes`

| Column                                     |                                                          |
| ------------------------------------------ | -------------------------------------------------------- |
| `id`                                       | text, ULID                                               |
| `owner_user_id`                            | null for official holes (v2: the author)                 |
| `published`                                | jsonb `Hole`, null until first published                 |
| `draft`                                    | jsonb `Hole`, null when there are no unpublished changes |
| `version`                                  | integer, bumped on every write (conflict check)          |
| `created_at`, `updated_at`, `published_at` |                                                          |

`minigolf_courses`

| Column                                                |                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `id`                                                  | text, ULID                                                                     |
| `owner_user_id`                                       | null for official courses                                                      |
| `visibility`                                          | `'official'` in v1 (`'private' \| 'friends' \| 'public'` in v2)                |
| `published`                                           | jsonb `{ name, description, difficulty, holeIds }`, null until first published |
| `draft`                                               | jsonb, same shape, null when there are no unpublished changes                  |
| `version`, `created_at`, `updated_at`, `published_at` |                                                                                |

`difficulty` is 1–3 (Easy / Medium / Hard). The hole order is `holeIds`, separately in draft and
published, so reordering is a draft change like any other. A hole is the shared `Hole` type the
physics already uses (`backend/src/shared/minigolf/types.ts`), so a stored hole plays without
conversion.

### Holes are shared

A hole can sit in several courses. Editing it changes every course that uses it once it's
published (the design's warning: "copy it first to make your own version"; the course editor's
Duplicate makes that copy). A hole is deleted only when no course (draft or published) uses it;
otherwise the editor offers "Remove from course".

### Drafts and Publish

- Every edit writes the `draft` (creating it from `published` on the first edit), autosaved with a
  short debounce. Each write sends the `version` it started from; a stale write is refused (409,
  "This was changed elsewhere – reload").
- **Publish changes** (per course), in one transaction: runs the checks on the course and every
  hole in its draft; refused with the failing checks if any blocks; otherwise copies each hole's
  draft to `published`, then the course's, and clears the drafts. Holes used by other courses
  change there too.
- **Discard draft** clears the course's draft and the drafts of its holes that no other course's
  draft uses.
- The status the design shows: Published, Draft changes, saved time.

### Seeding

A migration seeds the current test course (`courses/test.ts`, four holes) as the first official
course, published. The code test course stays for tests and the bench.

## Games

- A lobby keeps storing only the course id (or `mixed`).
- When a game starts (lobby launch, `POST /api/sessions`), the server reads the published course
  and writes its name and holes into the game's config. Mixed course: 9 random published holes of
  the official courses, picked then.
- The game's `init` and every replay use those holes, so a later edit or publish never changes a
  game, live or replayed (the game already copies its holes; this moves the copy to the start).
- The setup form's course list comes from the published official courses.
- A course with no published version, or deleted, can't be picked or started.

## Access (v1)

Only admins read drafts and write (any course or hole endpoint other than reading published
official courses). Players read published official courses only. Checked on the server.

## API

REST under `/api/minigolf`, described in `schema/api-v1.yaml`:

- `GET /courses`: courses with status (players: published official only).
- `GET /courses/:id`, `POST /courses`, `PATCH /courses/:id` (draft fields, `version`),
  `POST /courses/:id/publish`, `POST /courses/:id/discard`, `DELETE /courses/:id`.
- `GET /holes` (the library: search, filter), `GET /holes/:id`, `POST /holes` (new, or a copy of
  another), `PATCH /holes/:id` (draft hole, `version`), `DELETE /holes/:id` (refused while used).

## The course editor (`#/admin/minigolf/courses`, `/courses/:id`)

As the design:

- Left: the courses, grouped ("Official" in v1), with a felt thumbnail, holes and par, status chip;
  New course.
- Centre: name, description, difficulty (1–3, editable), totals (holes, par, rough playing time);
  the holes in playing order, drag to reorder (the lobby's sortable helpers), each with Edit and a
  menu (Duplicate, Remove from course); New hole.
- Right: the hole library: search, filters All / Official, cards with provenance ("Official · in 2
  courses"); drag a hole into the course to reuse it.
- Header: draft status, **Preview round** (plays the draft course on the 3D bench, locally),
  **Discard draft**, **Publish changes**.

Entry: an "Edit courses" link for admins on the Minigolf setup. The bench stays at
`#/admin/minigolf`.

## The hole editor (`#/admin/minigolf/holes/:id?course=:id`)

As the design: a 2D top-down canvas, the tool rail with shortcuts (Select V, Outline O, Tee T,
Cup C, Bumper B, Wall W, Terrain R), Undo/Redo (a stack of hole snapshots; Ctrl+Z,
Ctrl+Shift+Z), the hole pager and the strip of the course's holes, hole name and par, the
Properties panel with the Elements list and Checks.

Tools:

- **Outline**: drag corners; ● at an edge's middle adds a corner; a selected corner can be removed;
  snap to a 50 mm grid and to 45° (Shift draws freely). Sharp corners only — superseded by
  `2026-10-15-minigolf-outline-shapes-design.md`, which adds a circle tool and curved edges.
- **Tee**: one, dragged into place.
- **Cup**: one; Standard (r 80 mm) or Beginner (r 110 mm).
- **Bumper**: click to place; size S / M / L (r 40 / 60 / 80 mm); bounce Soft / Normal / Strong
  (restitution 0.6 / 0.85 / 0.95).
- **Wall**: drag to draw, snaps to 45°; thickness Thin / Normal (12 / 20 mm). The physics reads a
  wall's own thickness (new optional `Wall.thickness`; the physics default otherwise).
- **Terrain**: shapes the physics already has, each one an element:
  - **Hill / Dip**: a radial slope (`radial`, strength > 0 or < 0); brush size = radius, strength =
    height or depth.
  - **Ridge**: a bump (`bump`); drag draws the ridge line, brush size = width.
  - **Plateau**: a mesa (`terrain.mesa`); drag draws the area, strength = height, and the direction
    dial picks the side that ramps down (that side's edge is long, the others steep). It stands in
    for the design's "Slope": a plain tilt can't sit in flat felt without a step at its edges.
  - **Flatten**: removes the shape clicked.
  - **Show height map**: shades the ground by height (the felt tint the 3D view uses).
- **Select**: move, resize, delete, duplicate any element; its fields in the Properties panel
  (position, size, the tool's options).

A small live 3D view of the hole (`Hole3D`) sits in the Properties panel and follows every edit.

Editing operations (move a corner, add one, place, snap, delete, duplicate) are pure functions on a
`Hole`, so undo is a snapshot stack and they're unit-tested apart from the UI.

### Test putt

Opens a 3D panel over the editor playing the draft hole locally: dartboard to aim, stroke count,
Reset. No game, no server. The bench's pieces (its state, `Hole3D`, the dartboard) move into a
component the bench and the editor share.

### Checks

Always on, instant:

- Errors, which block Publish: the outline not closed or crossing itself; tee or cup outside the
  outline; non-finite numbers or impossible sizes (`validateHole`, extended to the new fields).
- Warnings: the cup closer than a ball to a rail or wall; a bumper closer than a ball to the rail;
  the tee on a wall; terrain reaching past the outline.

On demand, **Test the hole**: a putting bot plays it with the real 3D physics in a Web Worker
(the editor stays responsive; a progress bar shows):

- A distance map from the cup over the felt, around walls and bumpers (a grid, flood-filled).
- Each stroke: 16 candidate putts (8 directions, 2 strengths); the one whose ball ends nearest the
  cup along the felt wins; it's played with a little noise in aim and strength.
- 20 rounds, up to the game's default maximum of 6 strokes (the maximum is a game option, not part
  of the hole). Result: "Cup reachable · 18 of 20", and a
  **suggested par**: the median strokes, with a button that sets the hole's par to it.
- Seeded, so the same hole gives the same result. About 10–20 s.

## Errors

- Autosave fails: the status shows "Not saved – retrying"; leaving the page warns.
- A stale write (another admin, another tab): refused, "This was changed elsewhere – reload".
- Publish with blocking checks: refused, listing them per hole.
- A course or hole that's gone: the editor says so and goes back to the course list.

## Testing

- DB (Postgres): publish and discard in one transaction; shared holes publish into every course
  using them; refusing to delete a used hole; version conflicts; the seed.
- API: only admins see drafts or write; players see published official courses only.
- Unit: the editing operations, snapping, undo, the checks, the bot (seeded: a straight hole is
  reachable with par 2–3; a hole with the cup walled in is not).
- Game: a game copies the published holes at start; publishing afterwards doesn't change it or its
  replay; the setup lists published courses.
- E2E: an admin edits a hole, publishes, and a new game plays the edited hole.
