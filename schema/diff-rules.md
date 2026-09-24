# adbridge/v1 — bridge diff rules

The bridge compares each incoming Board Manager `state` frame against the previous one
to produce the derived events in `adbridge-v1.json`. This document is the authoritative
spec for that logic. Confirmed against hardware (Board Manager 1.0.7, 2026-09-24).

## Inputs

- `prev []Throw` — the `throws[]` array from the last processed `state` frame. Empty at startup and after a takeout.
- `cur []Throw`  — the `throws[]` array from the current `state` frame.
- `prevStatus string` — the `status` field from the last frame.

## Rules (evaluate in order)

### 1. Reconnect baseline

After any reconnect to Board Manager (WS drop + reconnect, or bridge restart), emit
`board.resync` with `cur` as-is. Set `prev = cur`. Do **not** apply any of the rules
below for this frame.

### 2. Spurious takeout guard

If `len(cur) == 0` and `len(prev) == 0`, ignore the frame (no state change that matters).
This suppresses spurious `Takeout started` / `Takeout finished` BM events that fire while
the board is idle (confirmed on hardware).

### 3. New darts

If `len(cur) > len(prev)`:
- If `len(prev) == 0`: emit `visit.opened` with a new ULID `visit_id`.
- For each index `i` in `[len(prev), len(cur))`: emit `dart.detected` with `dart=cur[i]`.

### 4. Correction and movement

For each index `i` in `[0, min(len(cur), len(prev)))`:
- If `cur[i].segment.name != prev[i].segment.name` (or bed/number changed): emit `dart.corrected`.
- Else if both have coords and `dist(cur[i].coords, prev[i].coords) > 0.02`: emit `dart.moved`.

Note: corrections are rare (BM auto-revision of a borderline dart). No manual correction
UI exists in BM 1.0.7. The backend refolds the open visit from `committedState` on
`dart.corrected`; game authors write forward-only reducers.

### 5. Partial takeout

If `0 < len(cur) < len(prev)`: update `prev = cur`. The visit stays open. Do not emit
any event — the backend will see the full takeout when `len(cur)` reaches 0.

### 6. Full takeout / visit cleared

If `len(cur) == 0` and `len(prev) > 0`:
- If the frame's `event` is `"Manual reset"` or a `POST /api/reset` command was recently
  issued: emit `visit.cleared`.
- Otherwise: emit `takeout.finished` (with `duration_ms` measured from `takeout.started`).

### 7. Takeout started (motion signal)

Emit `takeout.started` on whichever arrives first:
1. `motion_state.isHand == true` (earliest — leads the state frame by ~33 ms on hardware).
2. `state.status == "Takeout in progress"` or `state.event == "Takeout started"`.

Only emit if `len(prev) > 0` (guard against spurious idle-board events).

### 8. `status = "Takeout"` on the third dart

When the third dart lands, Board Manager immediately sets `status = "Takeout"` while
`event` is still `"Throw detected"`. This is a `board.status` update, not a scoring event.
Emit `board.status` but do **not** treat it as a takeout signal.

## Miss / Outside dart handling

Outside throws (`bed = "Outside"`) come in two variants:

| Variant    | `name`    | `number` | `coords` | `bouncer` |
|------------|-----------|----------|----------|-----------|
| Bounce-out | `"Miss"`  | `0`      | absent   | `true`    |
| Near-miss  | `"M<n>"`  | `n`      | present (r > 1) | absent |

`coords` is **optional** on every throw — the bridge must not assume it is present.
`score = segment.number × segment.multiplier` gives 0 for both variants.

## Maximum throws per visit

Board Manager hard-caps `numThrows` at 3. A 4th dart thrown before takeout is silently
ignored — no state frame with `numThrows = 4` is ever emitted (confirmed on hardware).
Games that require more than 3 darts per turn must issue `POST /api/reset` to clear the
board mid-visit.

## Bull payloads

| Target | `name` | `number` | `bed`    | `multiplier` | Confirmed |
|--------|--------|----------|----------|--------------|-----------|
| Outer bull (25) | `"25"` | `25` | `"Single"` | `1` | ✅ hardware |
| Inner bull (50) | `"50"` | `50` | `"Double"` | `2` | ❌ assumed by analogy |

## ε for dart.moved

Use `ε = 0.02` (in normalised units). Coordinates jitter slightly between frames even
when a dart is static; this threshold suppresses noise while catching genuine position
revisions.
