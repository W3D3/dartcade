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
- **A kill switch, not a gate**: the flag `detection.collect.enabled` (`defaultRule: 'everyone'`,
  evaluated for the board's owner) lets an admin stop collection at `#/admin/flags` without a
  deploy, and hides the board setting. A self-hosted deployment collects too, but only into its own
  database: nothing is sent to us.
- **One sample per camera dart**: the before and after warped still of each of the three cameras,
  plus a link to the dart. Manual darts have no images and are not kept. Boards with fewer than
  three cameras give no samples for now.
- **Stills say which round they belong to.** Every batch of bridge events starts with a `bm.frame`
  whose seq is the `source_seq` of each event in it. `camera.still` carries the `source_seq` of the
  batch that triggered its round and the `previous_seq` of the round before. The after stills of a
  `dart.detected` are the three with its `source_seq`; each camera's before still is that camera's
  still with the after still's `previous_seq` (after dart _n−1_, the takeout or a resync). The
  bridge coalesces fetches (a newer trigger replaces a pending one) and drops stills while the
  backend is unreachable; a dart missing any of the six is skipped, not repaired. Stills and events
  travel on separate queues, so the pairing (`backend/src/detection/pairing.ts`) waits for whichever
  comes last, keeping three rounds per board in memory (about 1 MB).
- **Labels are not copied, they are joined when read.** The game records each dart's final
  segment, coords and `corrected` flag in `game_darts`, and the engine gives a camera dart's
  `thrown_at` the same timestamp as the `created_at` of the game input that logged it, which names
  its `bridge_event_id`. So `dart_samples` → `game_session_events` (by `bridge_event_id`) →
  `game_darts` (by session and `thrown_at`) finds the final dart with no engine change, and a
  correction made later in the visit, or an Undo, is in it.
- **Stills in Postgres**, as `BYTEA` in `dart_sample_stills`, like voice packs and avatar photos:
  no volume for self-hosters to add, and deleting a board or account removes them by cascade.
- **A size cap, because it is on for everyone.** `DART_SAMPLES_MAX_GB` (default 20; `0` turns
  collection off). The 5-minute sweep deletes the oldest uncorrected samples first once over it;
  corrected samples go only when they alone exceed the cap.
- **Deleting is real.** Turning the setting off deletes the board's samples; deleting the board
  (unpairing) or the account deletes them by cascade.
- **Admins get the images from an admin page**, `#/admin/dart-samples` (see below). The same
  download endpoint serves the training scripts. Invalidated games are left out.

### Data

```sql
CREATE TABLE dart_samples (
  id              BIGSERIAL PRIMARY KEY,
  board_id        TEXT   NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  bridge_event_id BIGINT NOT NULL UNIQUE REFERENCES bridge_events(id) ON DELETE CASCADE,
  bm_version      TEXT,
  bytes           INT    NOT NULL,          -- the six stills, for the cap
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE dart_sample_stills (
  sample_id BIGINT REFERENCES dart_samples(id) ON DELETE CASCADE,
  phase     TEXT CHECK (phase IN ('before', 'after')),
  cam       SMALLINT CHECK (cam BETWEEN 0 AND 2),
  jpeg      BYTEA NOT NULL,
  PRIMARY KEY (sample_id, phase, cam)
);
ALTER TABLE boards ADD COLUMN share_training_images BOOLEAN NOT NULL DEFAULT true;
```

The still size is not stored: training reads it from the JPEG (`px = W/2 + x·W/3`).

`labels.jsonl`, one line per sample (the API's `DartSample`):

```json
{
  "id": "123", "boardId": "…", "bmVersion": "2.1.0", "capturedAt": "2026-11-07T10:00:00.000Z",
  "autodarts": { "segment": "D6", "coords": { "x": 0.986, "y": 0.048 } },
  "final":     { "segment": "D6", "coords": { "x": 0.986, "y": 0.048 }, "corrected": false },
  "label":     "autodarts"
}
```

`final` is null for a dart outside a game, or one whose visit was never committed. `label` says how
much to trust the sample:

- **`autodarts`**: not corrected by a player. A weak label: right most of the time, sometimes wrong
  and nobody noticed. (Board Manager's own re-scoring shows in `final`, not as a correction.)
- **`corrected_spot`**: corrected by dragging the dart on the board, so `final.coords` is a position
  someone chose. Gold.
- **`corrected_segment`**: corrected with a segment only, so we know the segment but not the spot
  (`final.coords` is null). Gold for the segment; phase 2 adds the spot.

### Flow

1. **Bridge**: `Transport.Send` returns the batch's frame seq, `Fetcher.Trigger` takes it, and each
   still carries its round's seq and the previous round's.
2. **Backend**: the bridge gateway hands every still and every stored `dart.detected` to the
   `SampleCollector`. When a dart's six stills are in and its board shares (setting on, flag on for
   its owner), it stores the sample. Failures are logged and dropped; collection never delays or
   breaks a game.
3. **Download**: joins the samples to their final darts and streams the archive.

### How admins get the images

`#/admin/dart-samples`, an admin tool on the hub (admins only, not moderators):

- **Totals**: samples by label, boards with samples and boards that share, storage against the
  cap, the newest sample.
- **Browse**: the latest samples, newest first, filterable by label. Each shows the after still of
  each camera with two markers, where Autodarts put the dart and where a player moved it, so a
  wrong label shows at a glance; opening one shows the before stills too. Phase 2's tip clicks will
  go here.
- **Download dataset**: `GET /api/admin/dart-samples/export?upTo=<id>&after=<id>&label=…` streams a
  `.tar` (`<id>/{before,after}-{cam}.jpg` and `labels.jsonl`; tar because the JPEGs are already
  compressed), written as it is read. Only samples at least an hour old are included, so their
  visit can no longer be corrected. The page asks for everything up to the newest such sample
  (`settledNewestId`) and remembers that id in the browser, so the next download fetches only what
  is new.
- **For scripts**: the training scripts call the same endpoint with an admin's session cookie.
  Separate API tokens wait until a scheduled job needs them.

### Size

The bridge asks for 600 px stills, about 30–50 KB each. 2.1.0 returns 1000 px (to be measured,
roughly 80–120 KB). Six stills per dart: about 0.3–0.7 MB per dart, so 10,000 darts is 3–7 GB.

### Testing

- `pairing.test.ts`: a dart pairs with its after stills and the previous round's, in either arrival
  order; a coalesced camera or a first round after a reconnect gives no sample; each dart gives one.
- `collector.test.ts`: only boards that share are stored, the combined still and untagged stills are
  ignored, a failed save is logged.
- `dartSamples.test.ts` (DB): the labels for an untouched, a dragged, a segment-only and a
  no-game dart; label filter, paging and the hour's wait; invalidated games left out; turning
  sharing off and deleting the board remove stills; the cap drops uncorrected samples first.
- `adminDartSamples.test.ts`: admins only, the list and totals, a still, and a download unpacked and
  checked, including one after a cursor.
- Bridge: stills carry their round's seq and the previous one; `Send` returns the frame seq.

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
