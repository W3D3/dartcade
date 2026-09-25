# autodarts-bridge: design spec

**Status:** approved, ready for implementation  
**Date:** 2026-09-24  
**Branch:** `feat/bridge`

---

## 1. Overview

`autodarts-bridge` is a Go binary that runs at a venue, alongside the Autodarts Board Manager. It:

1. Connects to the Board Manager's local WebSocket API (`ws://<board>:3180/api/events`) and HTTP endpoints.
2. Stamps every received frame with wall-clock and monotonic timestamps.
3. Diffs consecutive `state` snapshots to derive `adbridge/v1` events (dart detected, corrected, moved, visit opened/cleared, takeout started/finished).
4. Forwards all events to the backend over an outbound WSS connection, with sequence numbers and acknowledgements.
5. Executes allowlisted commands (`reset`, `start`, `stop`) received from the backend.

Pairing, self-update, and installer are out of scope for this spec.

---

## 2. Repository layout

```
bridge/
  cmd/bridge/
    main.go          — flag parsing, wiring, startup sequence
    config.go        — Config struct, koanf loading (file → env → flags)
    replay.go        — `bridge replay <file>` subcommand
  internal/
    bm/
      client.go      — Board Manager WS + HTTP poll, reconnect loop
    differ/
      differ.go      — pure snapshot differ + helpers
      testdata/      — short hand-crafted JSONL fixtures
    transport/
      transport.go   — WSS to backend, seq/ack, outbox, heartbeat
    schema/
      schema_gen.go  — generated (never edit by hand); see §3
  go.mod
  go.sum
schema/
  adbridge-v1.json   — JSON Schema, source of truth (repo root, shared with future backend)
```

---

## 3. Code generation

Go types for all `adbridge/v1` event payloads are **generated** from `schema/adbridge-v1.json` using `omissis/go-jsonschema`. They are never hand-written.

```
//go:generate go run github.com/omissis/go-jsonschema/cmd/gojsonschema@latest \
  --package schema \
  --output internal/schema/schema_gen.go \
  ../../schema/adbridge-v1.json
```

Run `go generate ./...` from `bridge/` to regenerate after schema changes.

Because Go has no discriminated unions, `Envelope.Data` is `json.RawMessage`. Each event kind has its own generated struct (`DartDetectedData`, `TakeoutStartedData`, etc.). The differ constructs typed events and marshals them into `Data`; the transport wraps them in the envelope.

When the TypeScript backend is started, the same `schema/adbridge-v1.json` drives a second generator (e.g. `json-schema-to-typescript`).

---

## 4. Dependencies

| Package | Purpose |
|---|---|
| `coder/websocket` | WS to Board Manager and WSS to backend |
| `knadh/koanf` + TOML provider | Layered config (file → env → flags) |
| `oklog/ulid` | `bridge_id`, `boot_id`, `visit_id` generation |
| `charmbracelet/log` | Structured, levelled logging |
| `omissis/go-jsonschema` | Code generation (dev tool, `go:generate`) |

No other dependencies. Keep it this way.

---

## 5. Configuration

### 5.1 Config struct

```go
type Config struct {
    BoardURL   string `koanf:"board_url"`
    BackendURL string `koanf:"backend_url"`
    BridgeID   string `koanf:"bridge_id"`
    LogLevel   string `koanf:"log_level"`
}
```

### 5.2 Resolution order (highest wins)

1. CLI flags (`--board-url`, `--backend-url`, `--bridge-id`, `--log-level`)
2. Environment variables
3. Config file (TOML)
4. Defaults (`log_level = "info"`)

### 5.3 Environment variables

| Key | Env var |
|---|---|
| `board_url` | `DARTCADE_BOARD_URL` |
| `backend_url` | `DARTCADE_BACKEND_URL` |
| `bridge_id` | `DARTCADE_BRIDGE_ID` |
| `log_level` | `DARTCADE_LOG_LEVEL` |

### 5.4 Config file

Path: `os.UserConfigDir()/dartcade/bridge.toml` (stdlib, cross-platform).

On first run, if no `bridge_id` is set via env or flag, one is generated (`br_<ulid>`) and written to the config file. A log message records the generated ID. Docker deployments pass `DARTCADE_BRIDGE_ID` and never need the config file.

### 5.5 Validation

`board_url` and `backend_url` must be set; the binary exits with a clear error if either is missing. `bridge_id` is auto-generated if absent.

---

## 6. Board Manager client (`internal/bm`)

One struct: `Client`. Two goroutines: WS loop, poll loop. One output channel: `chan BMFrame`.

### 6.1 Startup

On `Client.Start()`:
1. `GET /api/version` — emit `startup_version` frame, store version in client for board identity check.
2. `GET /api/config` — redact `auth.api_key` (and any key named `api_key`, `token`, `apikey`, `api-key` at any depth), emit `startup_config`. Store `auth.board_id`.

### 6.2 WS loop

- Connects to `ws://<board>/api/events`.
- On first connect: injects synthetic `bm_connect` frame onto channel.
- On reconnect: injects `bm_reconnect` frame with `gap_ms`.
- On disconnect: injects `bm_disconnect` frame, then reconnects with exponential backoff (0.5 s → 30 s, jitter; reset after 30 s stable).
- Every received frame: stamp `RecvWall` (UTC, ms) and `RecvMonoNs` (ns since process start), then put on channel.
- Any frame with `type = "auth"`: replace `data` with `"[REDACTED]"` before emitting.
- Unknown `type` values: pass through unchanged. Never drop.

### 6.3 Poll loop

- `GET /api/state` every 2 s.
- Emit as `BMFrame` with `Source = "poll"`.
- Provides continuity when WS drops and catches occasional missed WS updates.

### 6.4 Board identity check

After startup, if a subsequent `/api/config` response returns a different `auth.board_id`, log an error and stop emitting frames. The operator must restart after fixing the configuration.

### 6.5 BMFrame type

```go
type BMFrame struct {
    Kind       string          // "ws", "poll", "bm_connect", "bm_reconnect", "bm_disconnect"
    BMType     string          // the "type" field from the WS envelope; empty for synthetic frames
    Data       json.RawMessage // the "data" field; nil for synthetic frames
    RecvWall   time.Time
    RecvMonoNs int64
    GapMs      int64           // only on bm_reconnect
}
```

---

## 7. Differ (`internal/differ`)

### 7.1 Signature

```go
func Process(s State, frame bm.BMFrame) (State, []schema.Event)
```

Pure function. No I/O. The differ loop in `main` calls it for every frame from the BM client channel.

### 7.2 State

```go
type State struct {
    PrevThrows   []schema.Throw
    VisitID      ulid.ULID  // zero value = board empty, no open visit
    InTakeout    bool       // takeout.started emitted, not yet finished
    ExpectResync bool       // true after bm_connect / bm_reconnect
}
```

### 7.3 Frame dispatch

| Frame kind / BMType | Action |
|---|---|
| `bm_connect` | Set `ExpectResync = true`, emit `bm.link{up: true}` |
| `bm_reconnect` | Set `ExpectResync = true`, emit `bm.link{up: true, gap_ms}` |
| `bm_disconnect` | Emit `bm.link{up: false}` |
| `BMType = "state"` | Run diff logic (§7.4) |
| `BMType = "motion_state"` | Run takeout signal logic (§7.5) |
| Anything else | Emit as `bm.frame`, no state change |

### 7.4 Diff logic (on `state` frames)

1. **Resync:** if `ExpectResync`, emit `board.resync{throws: cur.throws}`, clear flag, set `PrevThrows = cur.throws`. Return. Never emit dart events on a resync frame.
2. **New darts:** `len(cur) > len(prev)` — for each new index:
   - If `len(prev) == 0`: emit `visit.opened{visit_id: newULID()}`, set `VisitID`.
   - Emit `dart.detected{visit_id, index, dart: toDart(cur[i]), source_seq: 0}`.
3. **Correction:** same index, `cur[i].segment != prev[i].segment` → emit `dart.corrected{visit_id, index, dart, previous, source_seq: 0}`.
4. **Move:** same index, same segment, Euclidean distance `sqrt((x₂-x₁)²+(y₂-y₁)²) > 0.02` (board coordinate units, r=1 at outer double wire) → emit `dart.moved{visit_id, index, coords, previous_coords}`.
5. **Board cleared:** `len(cur) == 0 && len(prev) > 0`:
   - If `InTakeout`: emit `takeout.finished{visit_id, trigger: "numThrows=0", duration_ms}`.
   - Else: emit `visit.cleared{visit_id, reason: "reset"}`.
   - Clear `VisitID`, `InTakeout = false`.
6. **Partial takeout:** `0 < len(cur) < len(prev)` → no events.
7. Always: set `PrevThrows = cur.throws`.

**Takeout signals from state frames** (step between 2 and 5, only if `!InTakeout && VisitID != zero`):
- `status ∈ {"Takeout", "Takeout in progress"}` or `event == "Takeout started"` → emit `takeout.started{visit_id, trigger}`, set `InTakeout = true`.

**Spurious takeout suppression:** ignore any takeout signal when `cur.numThrows == 0`.

### 7.5 Motion state signals

On `motion_state` frames, if `!InTakeout && VisitID != zero && PrevThrows > 0`:
- `isHand == true` or `isTakeoutPartial == true` → emit `takeout.started{visit_id, trigger: "motion"}`, set `InTakeout = true`.

### 7.6 Dart helpers (pure)

```go
func toDart(t bm.Throw) schema.Dart
```

Computes:
- `score`: `segment.number × segment.multiplier`. Bull-25 → 25, bull-50 → 50, Outside/Miss → 0.
- `polar`: `r = sqrt(x²+y²)`, `theta_deg = atan2(y, x) * 180/π` (standard math convention: 0° = right/6-wedge, 90° = top/20-wedge, matches the BM coordinate system where x is right and y is up). `coords` is nil for bounce-outs; `polar` is omitted when `coords` is absent.

---

## 8. Transport (`internal/transport`)

### 8.1 Envelope

One struct wrapping every outbound message:

```go
type Envelope struct {
    V          int             `json:"v"`            // 1
    Schema     string          `json:"schema"`       // "adbridge/1.0"
    BridgeID   string          `json:"bridge_id"`
    BootID     string          `json:"boot_id"`
    Seq        uint64          `json:"seq"`
    BoardID    string          `json:"board_id"`
    BMVersion  string          `json:"bm_version"`
    RecvWall   string          `json:"recv_wall"`
    RecvMonoNs int64           `json:"recv_mono_ns"`
    Kind       string          `json:"kind"`
    Data       json.RawMessage `json:"data"`
    Raw        json.RawMessage `json:"raw,omitempty"` // only on bm.frame
}
```

`BootID` is a new ULID generated once at process start. `Seq` increases monotonically per `BootID`.

### 8.2 Outbox

A slice of unacked `Envelope` values, bounded at 1000 entries. Two categories:

- **Game-data** (`dart.*`, `visit.*`, `takeout.*`, `bm.link`, `command.result`, `bridge.hello`, `board.resync`, `board.status`): never dropped.
- **Telemetry** (`motion`, `bm.frame` for `stats`/`cam_stats`): under backpressure, collapse to the latest value per `Kind`.

On reconnect to the backend, the full outbox is replayed in seq order before new events are sent.

### 8.3 source_seq backfill

The differ always emits the `bm.frame` event **first** in any batch, followed by derived events. The transport assigns seq numbers in batch order. It notes the seq of the `bm.frame` (the first event in the batch) and sets `source_seq` on all subsequent derived events in the same batch before enqueuing them. The differ sets `source_seq = 0` as a placeholder.

### 8.4 Acknowledgements

The backend sends `{"ack": <seq>}`. The transport removes all envelopes with `Seq ≤ ack` from the outbox.

### 8.5 Heartbeat

App-level ping every 20 s both ways. Link considered dead after 45 s silence. On death, close the WS and reconnect. Cloudflare drops idle and long-lived sockets silently; this is not optional.

### 8.6 Downstream commands

The backend may send:
```json
{"command_id": "…", "name": "reset" | "start" | "stop"}
```

The transport passes valid commands to an `execute func(name string) (httpStatus int, err error)` callback wired in `main` to the BM client's HTTP methods. After execution, emit `command.result{command_id, ok, http_status}`.

Any command name not in `{reset, start, stop}` is rejected: log an error, emit `command.result{ok: false}`, never forward to BM.

### 8.7 start/stop firmware fallback

The BM client tries `PUT /api/start` (new path) first; on 404 or 405, falls back to `PUT /api/detection/start` (old path). Same for stop.

### 8.8 Reconnect

Exponential backoff (0.5 s → 30 s, jitter; reset after 30 s stable). Independent from BM-side reconnect.

On connect, send `bridge.hello` before replaying the outbox:
```json
{
  "kind": "bridge.hello",
  "data": {
    "bridge_version": "0.1.0",
    "schema": "adbridge/1.0",
    "os": "linux",
    "arch": "arm64",
    "bm_version": "1.0.7",
    "bm_url": "http://192.168.0.109:3180"
  }
}
```

---

## 9. Main wiring

Three goroutines, two channels:

```
BMClient ──chan bm.BMFrame──▶ differ loop ──chan []schema.Event──▶ Transport
```

The differ loop is the only place `differ.Process` is called. It reads one `BMFrame` at a time, calls `Process`, and puts resulting events onto the transport channel. No goroutines inside the differ.

Startup sequence in `main`:
1. Load config (koanf).
2. If no `bridge_id`, generate and persist one.
3. Generate `boot_id` (new ULID, in memory only).
4. Start BM client (`client.Start()`).
5. Start transport.
6. Run differ loop (blocks; handle OS signals for clean shutdown).

---

## 10. Replay subcommand

```
bridge replay <file.jsonl>
```

- Reads BM frames from a JSONL file in the format produced by the spike recorder.
- Passes each frame through `differ.Process` using the same code path as live operation.
- Writes resulting events as newline-delimited JSON to stdout.
- Accepts an optional `--backend` flag; if set, connects to the backend WSS and sends events live instead of printing to stdout.

No replay-specific code inside the differ. The subcommand is the only caller that constructs a `BMFrame` from a JSONL record instead of from a live WS connection.

---

## 11. Testing

### 11.1 Differ unit tests

Short hand-crafted JSONL fixtures in `internal/differ/testdata/`. Each covers one scenario (≤ 20 frames). Table-driven: each row is a fixture file + expected `[]schema.Event` sequence.

Required fixtures:

| Fixture | Covers |
|---|---|
| `first-dart.jsonl` | `visit.opened` + `dart.detected` |
| `three-darts-takeout.jsonl` | Three darts, `takeout.started` via `status=Takeout`, `takeout.finished` |
| `correction.jsonl` | `dart.corrected` on same index |
| `move.jsonl` | `dart.moved` on coord shift > 0.02 |
| `takeout-motion.jsonl` | `takeout.started` via `motion_state.isHand` |
| `visit-cleared.jsonl` | `visit.cleared` via `numThrows=0` without takeout |
| `spurious-takeout.jsonl` | Takeout signal with `numThrows=0` → nothing emitted |
| `resync.jsonl` | `bm_reconnect` → `board.resync`, no `dart.detected` |
| `bounce-out.jsonl` | Throw with no `coords` field |
| `near-miss.jsonl` | Throw with `r > 1.0` |
| `unknown-frame.jsonl` | Unknown `BMType` passes through as `bm.frame` |

### 11.2 Transport unit tests

Seq assignment, ack processing, outbox drop/collapse, command allowlist. Use a small in-process WS server via `net/http/httptest` — no mocks.

### 11.3 Schema validation

One test marshals each differ fixture's output events and validates them against `schema/adbridge-v1.json`. Catches drift between code and schema early.

### 11.4 Manual replay

The 8 long recordings in `spike/recorder/` are for manual testing only:
```
cd bridge && go run ./cmd/bridge replay ../spike/recorder/recording-2026-09-24T16-20-56Z.jsonl
```
Not automated. Not used as test fixtures.

---

## 12. Out of scope

- Pairing flow (`bridge pair`, 8-character code)
- Self-update from GitHub Releases
- Installer / systemd service management
- Local status page
- Multi-board (single `board_url` only)
- Cloud API integration
