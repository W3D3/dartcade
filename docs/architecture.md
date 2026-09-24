# Autodarts minigames: architecture plan

Status: **design draft, nothing implemented yet**. Researched 2026-09-24.

Custom dart minigames (soccer, challenges, similar to Dartom) on physical boards that use
Autodarts computer vision. The system talks to each board's local **Board Manager** directly
and does not use darts-caller, darts-extern or darts-hub.

Contents:
1. [TL;DR](#1-tldr)
2. [What the Board Manager local API actually exposes](#2-what-the-board-manager-local-api-actually-exposes)
3. [Review of the stated architecture](#3-review-of-the-stated-architecture)
4. [Components and technology choices](#4-components-and-technology-choices)
5. [Internal event schema (`adbridge/v1`)](#5-internal-event-schema-adbridgev1)
6. [Data flow](#6-data-flow)
7. [Deployment](#7-deployment)
8. [Risks and open questions](#8-risks-and-open-questions)
9. [Suggested first steps](#9-suggested-first-steps)
10. [Sources](#10-sources)

---

## 1. TL;DR

- **Spatial data is available locally.** Each detected dart in Board Manager's state carries
  `coords: {x, y}` as well as the scored `segment`. I checked all five published live
  samples against dartboard geometry. The coordinates are **centred on the bull, with radius
  1.0 at the outer double wire, x pointing right and y pointing up** (details in §2.4). Soccer
  zone mapping can therefore live in the backend as planned. This is not a blocker.
- **The local API sends board state, not throw events.** `ws://<board>:3180/api/events`
  pushes a full `state` snapshot (`status`, `event`, `numThrows`, `throws[]`) whenever
  something changes. There is no "dart N landed" message, no dart ID, no timestamp and no
  sequence number. A dart already reported can also **change afterwards** (a correction).
  Someone has to compare each snapshot with the previous one to work out what happened, and
  the rule engine has to cope with darts being revised. That shapes most of the schema.
- **No timestamps come from Board Manager.** The bridge has to stamp every frame when it
  arrives (wall clock and monotonic clock). Otherwise takeout timing and similar data are
  lost for good.
- **Your architecture stands, with three changes:**
  1. The bridge works out dart and takeout events (protocol normalisation, still no game
     logic) **and** forwards every raw frame unchanged.
  2. The bridge→backend link needs a **narrow downstream command channel**, mainly
     `POST /api/reset`. The bridge still opens the connection, but messages flow both ways.
  3. "Forward everything unfiltered" needs **one exception: secrets**. `/api/config`
     returns the board's cloud `api_key`.
- **Cloud API: skip it for v1.** Autodarts replaced Keycloak with its own OAuth service
  (`api.autodarts.io/auth/v1`). The password grant is gone, and third-party clients need a
  client ID that Autodarts approves by hand. Local detection does not need the cloud.
- **Stack:** Go single-binary bridge (systemd/Windows service, `curl | bash` installer like
  Autodarts' own) → JSON over WSS with sequence numbers and acknowledgements → TypeScript
  (Node) backend with pure per-game reducers over an append-only event log in Postgres →
  Svelte SPA frontend over WebSocket. The backend runs on hades behind the Cloudflare Tunnel.

---

## 2. What the Board Manager local API actually exposes

Autodarts publishes no API documentation. Everything below comes from community client
source code, which I read directly rather than relying on READMEs, plus Autodarts'
changelog. The confidence column tells you how far to trust each item.

### 2.1 Transport

| Item | Finding | Confidence |
|---|---|---|
| Port | `3180`, plain HTTP and WS, reachable from other LAN hosts, not only localhost | High: every client uses it |
| Auth for local reads | None. Clients connect with no credentials. | High |
| Auth for local **writes** | None either. `PUT /api/start`, `POST /api/reset`, `PATCH /api/config` and others are unauthenticated on the LAN. | High (HACSAutodarts client) |
| Push channel | `GET ws://<host>:3180/api/events`. No subscribe message is needed; the server pushes after connect. | High: used by an ESP32 client in 2023 and HACSAutodarts in 2026, so stable across versions |
| Frame format | Text JSON envelope `{"type": <string>, "data": <object>}` | High |
| Poll fallback | `GET /api/state` returns the same shape as a `state` frame's `data` | High |
| Server keepalive / ping cadence | Not documented. HACSAutodarts uses a client heartbeat of 30 s. | Unverified |

### 2.2 WebSocket frame types seen

| `type` | `data` | Notes |
