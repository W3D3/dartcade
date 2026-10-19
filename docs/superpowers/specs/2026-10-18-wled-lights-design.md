# WLED lights (v1) — design

Issue: [#135](https://github.com/W3D3/dartcade/issues/135). Design canvas: `project/Settings-Lights.dc.html`,
`Settings-Lights-Pair.dc.html`, `Settings-Lights-Rules.dc.html`.

## Goal

WLED strips at a board follow the game: the seat colour on each turn, flashes for 180, 100+, bust and
checkout and a few per-game moments, a work light during takeout, an idle scene when no game runs.
Every user can set it up without knowing WLED: the bridge finds the strip, it blinks to confirm, and the
built-in profile works out of the box.

The bridge is the only thing that talks to WLED. WLED sits on the board's LAN, which the backend
usually can't reach. The backend works out what the lights should show and sends finished WLED state
patches to the bridge.

## Scope

**v1 (this spec):** bridge `wled` messages and mDNS discovery; pairing with a blink check; segments
and brightness cap per device; the per-board master switch; the read-only built-in profile
"Dartcade default" with ▶ Test per rule; triggers for every game.

**v2 (follow-up issue):** custom profiles (Duplicate, Import, Export), the rule editor and drag to
reorder, preset / playlist / raw JSON looks, bridge-side matching of board events for latency.

## Decisions

- **The backend runs the rules; the bridge applies the result.** One rules engine, in TypeScript,
  shared with the frontend. The bridge never interprets a game, so new triggers and looks need no
  bridge release. The cost is a bridge → backend → bridge round trip (about 50–150 ms) per flash.
- **Lights belong to a board.** Only the board's owner configures them. The owner's profile applies to
  every game played on that board.
- **Remote games: each board shows only its own seats.** A waiting scene on the other board's turn,
  and flashes only for its own seats. This is data in the default profile (`seats: 'mine' | 'other'`),
  not special code.
- **No stored WLED presets.** The built-in profile sends full state patches and never touches the
  device's `presets.json`.

## 1. Protocol (`schema/adbridge-v1.json`)

Backend → bridge (new; today the bridge only receives `ack`):

| Kind           | Data                                    | Bridge behaviour                                                                                                                                         |
| -------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wled.devices` | `{devices: [{id, mac, host, max_bri}]}` | Replaces the allowlist. Sent on connect and on every change.                                                                                             |
| `wled.apply`   | `{device_id, state, hold_ms?}`          | No `hold_ms`: a **scene**. Apply it and remember it as the device's base. With `hold_ms`: a **flash**. Apply it, then re-apply the base after `hold_ms`. |
| `wled.scan`    | `{}`                                    | Run an mDNS scan now.                                                                                                                                    |
| `wled.probe`   | `{host}`                                | Check that `host` answers as WLED; report it in `wled.found`.                                                                                            |
| `wled.blink`   | `{host}`                                | Play the bridge's own fixed blink pattern (lime, about 3 s), then restore the device's previous state.                                                   |

Bridge → backend (telemetry like `camera.still`: not sequenced, not stored):

- `wled.found {devices: [{mac, host, name, leds, version, segments}]}`: after a scan or probe, and every
  5 minutes.
- `wled.status {device_id, reachable, version, error?}`: when a paired device's reachability changes.

`segments` is the device's current WLED segment count. Unknown kinds are ignored on both sides.

## 2. Bridge (`bridge/internal/wled`)

- **Client:** `GET /json/info` (name, LED count, version, MAC), `GET /json/state` (segment count; the
  state to restore after a blink, or after a flash with no scene yet) and `POST /json/state`. No
  other paths, and the backend never sends a URL or a path.
- **Allowlist:** `apply` goes only to devices in the latest `wled.devices`. `probe` and `blink` go only
  to RFC 1918, link-local or `.local` hosts.
- **Identity:** a device is its MAC. Before the first send to a host, and after any send error, the
  bridge reads `/json/info`. If the MAC differs, it stops sending to that host, reports
  `wled.status{reachable:false, error:"different device at host"}` and looks the MAC up again over mDNS.
- **Brightness cap:** clamp the top-level `bri` (the master); segment `bri` is opacity under it.
- **Queue:** one worker per device, 1 s HTTP timeout, at most 10 requests/s. A new scene replaces a
  pending scene. A new flash replaces a pending or running flash (the restore timer restarts). A scene
  that arrives during a flash becomes the base and is applied when the flash ends.
- **Offline backend:** the strip keeps its last scene; nothing is queued.
- **mDNS:** `_wled._tcp` through `github.com/grandcat/zeroconf` (new dependency: the bridge has no mDNS
  client, and hand-rolling one isn't worth it). Behind an interface so tests use a fake.
- **Wiring:** `transport.handleMessage` routes `wled.*` kinds to the `wled` package; `main` wires the
  package's outgoing reports to `transport.SendStill`-style telemetry sends.

## 3. Backend

### Triggers (`backend/src/lights/triggers/<game>.ts`)

One pure function per game: `(before: View | null, after: View) => Trigger[]`, in the style of the
caller's `callsFor`. Undo or a correction that reopens a visit must not fire the visit's triggers twice.

| Trigger                                       | Fields          | Source                                                                               |
| --------------------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| `turn`                                        | `seat`          | every game: the current seat changed, or the game started                            |
| `game.won`                                    | `seat`          | every game                                                                           |
| `idle`                                        | —               | no active game on the board: after a game ends, on bridge connect                    |
| `takeout.started`, `takeout.finished`         | —               | bridge board events, from the gateway                                                |
| `calibration.started`, `calibration.finished` | —               | bridge `board.status` events: the Board Manager's status enters/leaves `Calibrating` |
| `visit`                                       | `seat, total`   | X01: a visit was committed                                                           |
| `bust`                                        | `seat`          | X01                                                                                  |
| `checkout`                                    | `seat`          | X01: the leg was checked out (precedes `game.won` when it ends the game)             |
| `atc.hit`                                     | `seat, target`  | Around the Clock                                                                     |
| `hilo.lifeLost`                               | `seat`          | Higher Lower                                                                         |
| `golf.sunk`                                   | `seat, strokes` | Minigolf                                                                             |
| `bulloff.won`                                 | `seat`          | bull off, in any game                                                                |

For each board, the service adds `local: boolean` (the seat plays on this board). Takeout, calibration
and idle are always local.

### Rules and patches (`backend/src/shared/lights/`, shared with the frontend)

```ts
type Rule = {
  when: { trigger: TriggerKind; total?: { op: '=' | '>='; n: number }; seats: 'any' | 'mine' | 'other'; game?: GameId }
  type: 'scene' | 'flash'
  look: { color: 'seat' | 'team' | `#${string}`; fx: number; bri: number; speed?: number }
  hold_ms?: number // flash only
}
type Profile = { id: 'default'; name: string; rules: Rule[] }
```

- `match(profile, trigger) => Rule | null`: the first rule whose `when` fits wins.
- `patchFor(rule, trigger, device, seatCount) => WledState`, by the device's `segment_mode`:
  - `whole`: one segment, the whole strip, in the look.
  - `perSeat`: `seatCount` equal segments (the remainder goes to the last). The trigger's seat gets the
    look; the other segments stay lit at 15% in their own seat colour. A trigger without a seat lights
    every segment with the look.
  - `wled`: as `perSeat`, but seat _i_ is the device's existing segment _i_ (segments beyond the device's
    count are skipped).
- `SEAT_COLORS = ['#c6f24e', '#efeee6', '#ff9b45', '#5ad1e6']` (design tokens), cycled for seats 5+.
  `team` uses the team's first seat's colour.

**Dartcade default** (WLED effect IDs: 0 Solid, 1 Blink, 2 Breathe, 9 Rainbow, 20 Sparkle, 41 Lighthouse, 42 Fireworks):

| #   | When                   | Type        | Look                            |
| --- | ---------------------- | ----------- | ------------------------------- |
| 1   | `turn` · mine          | scene       | seat colour · solid · 255       |
| 2   | `turn` · other         | scene       | white · solid · 40 ("Waiting")  |
| 3   | `visit` = 180 · mine   | flash 4 s   | user preset "180"               |
| 4   | `visit` ≥ 100 · mine   | flash 2 s   | seat colour · breathe           |
| 5   | `bust` · mine          | flash 1.5 s | user preset "Busted"            |
| 6   | `checkout` · mine      | flash 3 s   | user preset "Gameshot"          |
| 7   | `game.won` · mine      | flash 5 s   | user preset "Matchshot"         |
| 8   | `atc.hit` · mine       | flash 0.6 s | seat colour · solid             |
| 9   | `hilo.lifeLost` · mine | flash 1.5 s | `#ff3b30` · blink               |
| 10  | `golf.sunk` · mine     | flash 2 s   | seat colour · sparkle           |
| 11  | `bulloff.won` · mine   | flash 2 s   | seat colour · blink             |
| 12  | `takeout.started`      | scene       | `#ffa000` · breathe · 255       |
| 13  | `calibration.started`  | scene       | `#a855f7` · lighthouse · 255    |
| 14  | `idle`                 | scene       | `#c6f24e` · breathe · 60 · slow |

`takeout.finished` and `calibration.finished` have no rule: the service re-applies the board's game
scene (see below).

A won X01 match plays only the game.won look, on the winning dart.

### Service (`backend/src/lights/service.ts`)

- Called after every engine state push with `(session, beforeView, afterView)`, and from the bridge
  gateway for `takeout.*` events, `board.status` events, bridge connects and game ends.
- For each board in the game whose lights are on and that has devices: derive triggers, add `local`,
  `match` each trigger, and send `wled.apply` with `patchFor` to every device through `bridgeConnections`.
- Keeps each board's **game scene** (the last scene from a non-takeout, non-calibration trigger).
  `takeout.started`/`calibration.started` send their scene without replacing the game scene.
  `takeout.finished`/`calibration.finished` re-send the game scene.
- Tracks, per board, whether the Board Manager's last `board.status` reported `Calibrating`: entering
  it fires `calibration.started`, leaving it fires the `takeout.finished`-style restore. A repeated
  status (still/not yet `Calibrating`) does nothing, and malformed `board.status` data is ignored.
- On bridge connect: send `wled.devices`, then the game scene (or the `idle` scene if no game is active).
- Bridges older than the first version with `wled` support (checked from `bridge.hello`'s
  `bridge_version`) get nothing; the API reports `bridgeOutdated: true`.
- Turning lights off sends `{on: false}` to every device, then an empty `wled.devices`, so the strip goes
  dark instead of keeping its last scene.
- Lights never block or fail the game: send errors are logged and dropped.

### Storage (migration `025_wled_lights.sql`)

- `wled_devices`: `id` (ulid), `board_id` (FK, `on delete cascade`), `mac`, `name`, `host`, `leds`,
  `version`, `segments`, `segment_mode` (`whole` | `perSeat` | `wled`), `max_bri` (1–255, default 178 = 70%),
  `created_at`; unique `(board_id, mac)`.
- `boards.lights_enabled boolean not null default true`.
- Found devices and live status: in memory per board (`backend/src/lights/store.ts`), like the camera
  store.

### API (`schema/api-v1.yaml`, `backend/src/api/lights.ts`; owner only, 403 otherwise)

Under `/api/boards/{id}/lights`:

- `GET` → `{enabled, bridgeOnline, bridgeOutdated, devices: [device + {reachable, error?}], found: [...], lastScanAt, profile}`
- `PUT` `{enabled}`
- `POST scan`, `POST probe {host}`, `POST blink {host} | {deviceId}`
- `POST devices {mac, host, name, segment_mode, max_bri}` (the MAC must be in `found`), `PATCH devices/{deviceId}`, `DELETE devices/{deviceId}`
- `POST test {rule: number}`: plays that default-profile rule as a flash (scenes too, held 3 s) for
  seat 1 on every device of the board.

A device found by another of the user's boards is returned with `onBoard: <board name>`.

### Flag

`lights.enabled` in `backend/src/flags/definitions.ts`; off by default, on with `FLAGS_ON`.

## 4. Frontend

`#/settings/lights`: drop `soon` from the Lights entry in `lib/settings/sections.ts` and hide the entry
when `flag('lights.enabled')` is off. Components in `lib/components/lights/`, logic in `lib/lights/`.
The page re-fetches `GET` every 3 s while it's open.

- **Board picker:** the user's boards with device counts; offline boards marked. `?board=<id>`
  preselects one.
- **Master switch:** "Lights on <board>" with "Off keeps devices and rules".
- **Devices:** name, host, LED count, version, segment summary, status (red dot and "Not answering since
  2 min" when unreachable). **Blink**, and a ⋯ menu (Edit, Remove) on the bits-ui menu.
- **Found on this board's network:** unpaired found devices, "Scanning · x min ago", **Rescan**, **Pair**;
  "On <board>" for devices paired elsewhere. **Add by IP** below, with an inline error ("No WLED answered
  at 192.168.1.80").
- **Light profile:** "Dartcade default · built in", seat colour swatches, the numbered read-only rule list
  (trigger, filter, Scene/Flash, look summary) with **▶ Test**. Duplicate, Import, Export shown disabled
  ("Coming soon").
- **Pair dialog** (`ui/modal`): (1) blink check: "Blinking lime now", Blink again, "Yes, it blinked" /
  "No, show me another" (next found device); (2) name (prefilled) and board; (3) segments: Whole strip /
  One per seat / Use WLED segments, with the hint "4 × 36 LEDs"; (4) max brightness, default 70%.
  **Edit** reuses steps 2–4.
- **Boards section:** "Lights · N WLED devices · Manage" in the selected-board panel and an "Add WLED
  lights" chip on board cards, linking to `#/settings/lights?board=<id>`.
- **Offline bridge:** Scan, Blink, Test, Pair disabled with "The bridge is offline". **Outdated bridge:**
  "Update your bridge to use lights".
- No lights toasts during a match.

## 5. Testing

- **Bridge:** against an `httptest` fake WLED: allowlist refusals (unpaired id, public host), MAC change
  stops sends, `bri` clamping (top level and segments), coalescing, flash restore and base-during-flash,
  rate limit. Fake mDNS for discovery.
- **Triggers:** table tests per game from real views, including undo/correction not re-firing.
- **Rules and patches:** first match, `seats` filters with remote seats, segment splits for 1–4 seats and
  odd LED counts, colour cycling.
- **Service:** with a fake `bridgeConnections`: a remote 2-board game (flashes only to the throwing
  board, waiting scene to the other), takeout restore, reconnect re-send, lights off sends nothing,
  outdated bridge gets nothing.
- **DB/API:** owner-only 403s, device CRUD, cascade on board delete, `devices` POST rejects an unfound MAC.
- **Frontend (vitest):** pair dialog steps, the segment hint, disabled states for offline/outdated bridges.
- **Hardware:** a real game against a real WLED strip before the last PR merges.

## 6. Delivery

Three stacked PRs, each building and passing tests on its own, each referencing #135:

1. **Bridge:** schema kinds, `internal/wled`, regenerated Go/TS types.
2. **Backend:** migration, `$shared/lights`, triggers, service, API, flag.
3. **Frontend:** the Lights section, pair dialog, Boards links, a screenshot under `docs/lights/`, the
   AGENTS.md "Where to look" row. Opens the v2 follow-up issue; #135 stays open as the parent.

Implementation runs with subagent-driven development on Sonnet; reviews on the main model.
