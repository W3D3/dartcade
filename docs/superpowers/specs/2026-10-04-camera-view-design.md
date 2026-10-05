# Camera view: design

Show the board's real camera picture in place of the SVG dartboard: a still from Cam 1, 2 or 3,
straightened by the Board Manager's own calibration, under dartcade's markers and highlights.

## Decisions

- **Board view setting:** SVG (default) / Cam 1 / Cam 2 / Cam 3, per device, in the in-game settings
  drawer's Display section. A combined view of all cameras is a follow-up.
- **Stills, not video.** A new picture after each dart, a correction, a takeout and a board resync.
  The same for everyone in the game.
- **The Board Manager does the straightening.** `GET <bm>/api/img/cams/{i}?warp=true&width=W&height=W`
  returns a square top-down JPEG: bull at the centre, **the outer double wire (r = 1) at a third of
  the width** (333.3 px of 1000), the image edge at r = 1.5, 20 at the top, all three cameras in the
  same frame. That is dartcade's board coordinate system, so no warping maths in dartcade.
  (Found by reading the Board Manager's web UI code and calibration; see "Evidence".)
- **Pictures only travel through the bridge**, so it works in the cloud and self-hosted: browsers
  can't load the Board Manager directly (plain HTTP on the LAN; mixed content), and the backend may
  not reach the board's network.
- **Kept in memory only.** The backend keeps the latest still per board and camera; nothing in the DB
  or the event log.
- **Who may see them:** anyone allowed to watch the game the board is in (`canWatchSession`), not only
  the board's owner.

## Flow

1. **Bridge** (`bridge/`): when it emits `dart.detected`, a dart correction, `takeout.finished` or a
   resync, it fetches a warped still from each camera (`?warp=true&width=600&height=600`, about
   30–50 KB each; cameras the Board Manager reports as missing are skipped), with a short timeout and
   at most one fetch per camera in flight (a newer event replaces a pending one). It sends each as a
   new `camera.still` message up its existing connection: `{ type: 'camera.still', cam: 0|1|2,
   capturedAt, contentType: 'image/jpeg', data: <base64> }` (schema `schema/adbridge-v1.json`; not an
   event, no seq/ack, not stored).
2. **Backend** (`backend/src/bridge-gw/`, a small `camera/` store): keeps `{ version, bytes,
   contentType, capturedAt }` per board and camera (version increments), drops stills bigger than
   1 MiB, and tells the open game pages of any active session on that board, on the game socket:
   `{ type: 'camera', boardId, cam, version }` (schema `schema/game-ws-v1.json`).
3. **API**: `GET /api/boards/{id}/camera/{i}` returns the latest still (`?v=<version>` for caching;
   `Cache-Control: private, max-age=31536000, immutable` when versioned) to anyone allowed to watch a
   game on that board, or 404 when there's none. It no longer fetches from the Board Manager itself
   (that only worked on the same network).
4. **Frontend**: `DartBoard.svelte` gets an optional camera still URL. With one, it draws the image
   **under** its layers at `x=-1.5 y=-1.5 width=3 height=3` (board units, r = 1 at the double wire),
   hides its segment fills, and keeps the numbers ring, dart markers, the aim crosshair and the
   target/checkout highlights (semi-transparent wires so they don't hide the real board). The match
   screen picks the board of the player throwing now (each seat's own board in remote games) and the
   camera from the setting; it falls back to the SVG when there's no still yet, the seat uses manual
   entry, or the board is offline.

## Evidence (Board Manager research, 2026-10-04)

- `/api/img/cams/{i}` raw = 1280×720 JPEG; `?warp=true` = 1000×1000; `width`/`height` resize on the
  server; `/api/img/live?cam=i&warp=true` is the same; ~150–180 ms per GET on the LAN.
- The web UI's calibration screen overlays its board on the server's warped image with
  `OLD_RADIUS = SIZE/3` (r = 1 at 333.3 px of 1000) and 20 at the top; the 4 calibration points per
  camera (`/api/config` → `calibration`, labels "20-1", "6-10", "3-19", "11-14") map the auto-detected
  ring points to within 1° of their segment lines. Lens distortion is negligible (< 0.2 mm on the
  board).
- Not yet seen: a real warped frame with the cameras running (the board was stopped during the
  research, so only black placeholders came back). **The browser check must confirm the double
  ring lines up with the overlay.**

## Testing

- Bridge (Go): fetching stills on the right events, skipping missing cameras, one in flight per camera,
  the message shape; against a fake Board Manager HTTP server.
- Backend: the store (versions, size cap, per board/camera), the push to the right game sockets,
  access (a watcher gets it, a stranger gets 404/403), versioned caching headers.
- Frontend: the setting (default SVG, fallback), which board/camera URL the match screen picks, the
  board renders the image layer only with a still.
- Manual: with the board running, play a few darts with each camera; the double ring and the markers
  line up; a remote viewer sees the stills update after each dart.

## Later

- Combined view of all three cameras; live video at the board.
