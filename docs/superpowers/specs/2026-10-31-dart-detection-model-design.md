# Dart detection model: design

A second opinion on where each dart landed, from our own model in a separate Python service. It
has two uses:

1. **Autocorrect**: when Autodarts scores a dart wrong and our model is confident about where it
   really landed, correct the dart without the player having to.
2. **Later, a cheap model on the device**: a small model next to the board scores each dart, and only
   asks the cloud model when its confidence is below a threshold.

Before any model exists we need training data, so **phase 1 only collects it**. The later phases are
sketched here so that phase 1 collects the right things.

## What the Board Manager already gives us

Found on Board Manager 2.1.0 (Raspberry Pi 5, three 1280×720 cameras), 2026-10-31:

- **Calibration per camera** in `GET /api/system` → `calibration.cams[i]`: intrinsics `k`, distortion
  `d`, a `homography` (and `homographyUndistorted`), `errorPx` (about 0.4 px here). Each camera's
  homography maps its pixels onto one shared top-down 1000×1000 board: the bull at (500, 500), the
  outer double wire at r ≈ 333 px. Ring fits (bull; double/treble inner/outer as ellipses plus 20
  points each) are in `GET /api/config/calibration/ellipses`.
- **Warped stills**: `GET /api/img/cams/{i}?warp=true` is that top-down view, which the bridge already
  fetches after every dart (`bridge/internal/camera`, `camera.still` in `schema/adbridge-v1.json`).
  2.1.0 ignores `width`/`height` and returns 1000×1000. `GET /api/img/cams/{i}` without `warp` is the
  raw frame.
- **Throws** carry `coordsX`/`coordsY` (r = 1 at the outer double wire) and `method: "BestCam"`, but
  no confidence and no estimate per camera.
- `/api/lens/inference`, `/api/img/inference/` and `/api/detect` exist but answer 501 (the first
  two; `/api/detect` was not tried). Autodarts looks to be adding its own inference hook. Worth
  re-checking on newer versions.

**This is what makes the labels free.** The tip of a dart lies on the board plane, and a homography
maps that plane exactly, so in every camera's warped still the tip sits at the pixel given by the
dart's coordinates:

```
px = W/2 + x · W/3
py = W/2 − y · W/3        (W = still width; 20 at the top, y up)
```

Autodarts' coordinates (or a dragged correction's) are therefore pixel labels in all three warped
views at once, with no projection maths and no calibration per board.

## The model, in short (phase 3, for context)

- **Input**: the three warped views of one dart, before and after it landed, stacked as channels:
  3 cameras × 2 stills × RGB = 18 channels, all aligned pixel for pixel because they share the board
  frame.
- **Output**: a heatmap of the tip position. The barrel and flight stand out of the board plane, so
  each camera smears them in a different direction; the smears cross at the tip.
- **Score**: the tip position → segment with plain geometry (`polar`, ring radii). The heatmap peak
  is the confidence.

Not a classifier straight to "T20": 82 classes learned from pixels would have to learn the board's
geometry and would carry over badly between boards.

## Phase 1: collect training data

### Decisions

- **On by default, opt-out per board.** Every camera dart is kept unless the board's owner turns off
  "Help improve dart detection" in the board's settings (`boards.share_training_images`, default
  on). The Privacy text says what is kept (warped camera stills of the board, the dart's score and
  position), why, for how long, and that turning it off or deleting the board deletes them. Because
  it is on without asking, the legal basis is legitimate interest rather than consent; the stills
  show the board and its surround, not the room, which is what makes that defensible. Have it
  checked before launch.
- **A kill switch, not a gate**: the flag `classifier.collect.enabled` (`defaultRule: 'everyone'`,
  evaluated for the board's owner) lets an admin stop collection at `#/admin/flags` without a
  deploy. A self-hosted deployment collects too, but only onto its own disk: nothing is sent to us.
- **One sample per camera dart**: the before and after warped still of each of the three cameras,
  plus a link to the dart. Manual darts have no images and are not kept.
- **Before = that camera's previous still.** The bridge sends stills after every dart, correction,
  takeout and resync, so the still after dart _n−1_ (or after the takeout, for dart 1) is the
  "before" of dart _n_. The backend already holds it in `CameraStills`. A sample is kept only when
  all six stills exist and each "before" belongs to the board event just before the dart. The
  bridge coalesces fetches (a newer event replaces a pending one) and drops stills while the backend
  is unreachable; samples with a gap are skipped, not repaired.
- **Stills say which event they follow.** `camera.still` gets a `source_seq`: the seq of the event
  that triggered it. Without it the backend can only guess which dart a still belongs to.
- **Labels are not copied, they are joined at export.** The game already records each dart's final
  segment, coords and `corrected` flag in `game_darts`. A sample stores the `bridge_events.id` of
  its `dart.detected`, `game_darts` gets that id too (`bridge_event_id`, null for manual darts), and
  the export joins them. A correction made later in the game, or an Undo, is then picked up without
  any extra hook.
- **Images on disk, index in Postgres.** JPEGs under `CLASSIFIER_DATA_DIR` (default
  `/data/dart-samples`, a `VOLUME` in the image; `<board>/<sample>/{before,after}-{cam}.jpg`); one
  row per sample in `dart_samples`. Images do not go in the DB.
- **A size cap, because it is on for everyone.** `CLASSIFIER_MAX_GB` (default 20). Over it, the
  oldest `autodarts` samples go first; corrected samples are kept until they alone exceed the cap.
- **Deleting is real.** Turning the setting off, deleting the board or deleting the account deletes
  that board's samples, rows and files (`cleanUpAccount` covers the account case).
- **Admins get the images from an admin page**, `#/admin/dart-samples` (see below). The same
  download endpoint serves the training scripts. Invalidated games are left out.

### Data

```sql
CREATE TABLE dart_samples (
  id              TEXT PRIMARY KEY,
  board_id        TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  bridge_event_id BIGINT NOT NULL REFERENCES bridge_events(id) ON DELETE CASCADE,
  bm_version      TEXT NOT NULL,
  still_px        INT  NOT NULL,          -- width of the stills (square)
  captured_at     TIMESTAMPTZ NOT NULL
);
ALTER TABLE boards     ADD COLUMN share_training_images BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE game_darts ADD COLUMN bridge_event_id BIGINT REFERENCES bridge_events(id) ON DELETE SET NULL;
```

`labels.jsonl`, one line per sample:

```json
{
  "sample": "…", "board": "…", "bm_version": "2.1.0", "still_px": 1000,
  "autodarts": { "segment": "D6", "coords": { "x": 0.986, "y": 0.048 } },
  "final":     { "segment": "D6", "coords": { "x": 0.986, "y": 0.048 }, "corrected": false },
  "label":     "autodarts"
}
```

`label` says how much to trust the sample:

- **`autodarts`**: not corrected. A weak label: right most of the time, sometimes wrong and nobody
  noticed.
- **`corrected_spot`**: corrected by dragging the dart on the board, so `final.coords` is a position
  someone chose. Gold.
- **`corrected_segment`**: corrected with a segment only, so we know the segment but not the spot
  (`final.coords` is null). Gold for the segment; phase 2 adds the spot.

### Flow

1. **Bridge**: sets `source_seq` on every `camera.still`. Nothing else changes.
2. **Backend, on a still for a `dart.detected`** on a board that shares (setting on, flag on for its
   owner): once all three cameras' stills for that seq are in, check that each camera's previous
   still follows the board event before the dart, then write the six JPEGs and the `dart_samples`
   row. Failures are logged and dropped; collection never delays or breaks a game.
3. **Engine**: writes `bridge_event_id` into `game_darts` for camera darts.
4. **Download**: joins `dart_samples` → `game_darts` (via `bridge_event_id`) → the original
   `bridge_events` payload, and streams the archive.

### How admins get the images

`#/admin/dart-samples`, an admin tool on the hub (admins only, not moderators):

- **Totals**: samples by label (`autodarts`, `corrected_spot`, `corrected_segment`), boards that
  share, disk used against the cap, the newest sample.
- **Browse**: the latest samples, newest first, filterable by label. Each row shows the after still
  of each camera with two markers, where Autodarts put the dart and where it ended up, so a wrong
  label shows at a glance. Clicking a row opens all six stills. This page is where phase 2's tip
  clicks will go.
- **Download dataset**: `GET /api/admin/dart-samples/export?after=<sample id>&label=…` streams a
  `.tar` (the images plus `labels.jsonl`; tar because the JPEGs are already compressed). Sample ids
  sort by time (UUIDv7), and the archive's last id goes into its file name, so the next download
  can ask for only what is new. The page remembers the last id per admin.
- **For scripts**: the training scripts call the same endpoint with an admin's session cookie.
  Separate API tokens wait until a scheduled job needs them.

### Size

The bridge asks for 600 px stills, about 30–50 KB each. 2.1.0 returns 1000 px (to be measured,
roughly 80–120 KB). Six stills per dart: about 0.3–0.7 MB per dart, so 10,000 darts is 3–7 GB.

### Testing

- Backend: the sample decision (all six stills present, each "before" right after the previous
  event, setting on, flag on) is a pure function with unit tests, including a coalesced still (gap →
  skipped) and a dart right after a takeout (before = the takeout's still).
- DB test: the export join returns `corrected_spot`, `corrected_segment` and `autodarts` rows for a
  game with a dragged correction, a segment-only correction and an untouched dart, and leaves out an
  invalidated game.
- Deleting the board, turning the setting off and deleting the account each remove rows and files.
- Bridge: `source_seq` matches the event that triggered the fetch.

## Later phases (sketch)

- **Phase 2, tip labelling**: an admin page that shows `corrected_segment` samples' warped stills and
  takes a click on the tip. A few hundred clicks should cover the hard cases.
- **Phase 3, the service**: `classifier/` at the repo root: Python, FastAPI, PyTorch for training,
  ONNX for serving. Training starts from a pretrained backbone, trains on `corrected_*` samples
  weighted up and `autodarts` samples, and validates on boards it never saw. The backend calls it
  on each `dart.detected` with the six stills it already holds and logs the answer next to
  Autodarts' (**shadow mode**): no effect on games, but it tells us how often and how confidently the
  two disagree, measured against later corrections.
- **Phase 4, autocorrect**: when the service is confident and disagrees, the backend corrects the
  dart. The correction goes into the game's event log as an input with its own source (`classifier`),
  so replays never call the model again and stay deterministic. The match screen marks an
  autocorrected dart, and the player can correct it back the usual way.
- **Phase 5, on the device**: the same architecture, smaller and quantized, run by the bridge. It
  scores once per dart rather than once per frame, which may fit on a Pi 5 next to Board Manager
  (about 70% CPU on this one). It asks the cloud service only below a confidence threshold. To be
  measured, not assumed.

## Open questions

- **Still size for collection**: ask for 1000 px explicitly (the double ring is about 16 px wide
  instead of 9.5)? On Board Manager 1.x, which honoured `width`/`height`, that raises the bandwidth
  for every game, not only for boards that share.
- **Board Manager 1.x**: does its warp use the same frame (r = 1 at W/3, 20 at the top)? The camera
  view spec says yes; check before training on a mix of versions.
- **Raw frames**: worth also keeping the raw 1280×720 frames plus the homography, in case a model on
  the raw view does better than one on the warped view? It doubles the storage; not in phase 1.
