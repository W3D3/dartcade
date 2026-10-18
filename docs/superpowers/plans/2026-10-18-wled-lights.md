# WLED Lights v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WLED strips at a board follow the game (turn colours, flashes for 180/bust/checkout and per-game moments, takeout work light, idle scene), set up from Settings → Lights, with the bridge as the only thing that talks to WLED.

**Architecture:** The backend compares each game snapshot with the previous one, derives light triggers, matches them against the built-in profile, and sends finished WLED state patches (`wled.apply`) to the board's bridge. The bridge keeps an allowlist of paired devices, a per-device queue (scene = base, flash = on top, then restore), clamps brightness, and discovers devices over mDNS. The frontend is a new Settings section with a pair dialog.

**Tech Stack:** Go 1.23 (bridge, `github.com/grandcat/zeroconf`), TypeScript/Fastify/Kysely/Postgres (backend), Svelte 5 + bits-ui (frontend), Vitest, `go test`.

**Spec:** `docs/superpowers/specs/2026-10-18-wled-lights-design.md`

## Global Constraints

- Issue #135; every PR body says `Refs #135`. #135 stays open; the last PR opens the v2 follow-up issue.
- Commits: `type(scope): subject`, lower case, imperative, < 72 chars. Scopes: `bridge`, `backend`, `frontend`, `lights`.
- The bridge only calls `GET /json/info`, `GET /json/state`, `POST /json/state` on WLED. Never a URL or path from the backend.
- `wled.apply` only to devices in the latest `wled.devices`; `wled.probe` and `wled.blink` only to RFC 1918, link-local or `.local` hosts.
- Bridge clamps the top-level `bri` (the master) to the device's `max_bri`; segment `bri` is opacity under it. Blinks for unpaired devices use `bri` 128.
- Per device: 1 s HTTP timeout, at least 100 ms between requests.
- `SEAT_COLORS = ['#c6f24e', '#efeee6', '#ff9b45', '#5ad1e6']`, cycled for seats 5+.
- `max_bri` default 178 (70%). Segment modes: `whole` | `perSeat` | `wled`.
- Flag `lights.enabled`, off by default (admins and `FLAGS_ON`).
- Bridges get lights only if `bridge_version` is a `dev…` build or semver ≥ `0.4.0`.
- Lights never block or fail a game: send errors are logged and dropped; no lights toasts during a match.
- Generated files are never edited by hand: `npm run gen:api` (repo root), `npm run gen:types` (backend), `go generate ./internal/schema` (bridge).
- Formatting: `npm run format` at repo root; `gofmt -w .` in `bridge/`.

## Review Focus

1. A WLED device's DHCP lease changes: the old IP now answers as another device (or nothing). Expect the bridge to stop sending there, find the MAC again via mDNS, and the backend to store the new host. (Task 3, Task 4, Task 9)
2. Darts thrown fast: dart 3 of a 180 plus a takeout in under a second. Expect the 180 flash to play for its full hold, the takeout scene to apply after it, and the turn scene to come back after takeout. (Task 3, Task 10)
3. A correction after the visit was committed (the visit reopens, then commits again). Expect no second 180/bust/checkout flash. (Task 7)
4. A remote 2-board game: each board's strip only flashes for its own seats, and shows the waiting scene on the other board's turn. (Task 10)
5. A board with lights paired whose bridge is old (no `wled` support) or offline: nothing is sent, the page says why, and the game plays normally. (Task 9, Task 11, Task 12)

---

# Part 1 — Bridge (PR 1: `feat(bridge): drive wled lights for the backend`)

### Task 1: Schema kinds for `wled.*` messages

**Files:**

- Modify: `schema/adbridge-v1.json` (add `$defs` next to `CameraStillMessage`, ~line 316)
- Modify: `scripts/gen-api.mjs:98` (export the new zod schemas)
- Regenerate: `bridge/internal/schema/schema_gen.go`, `backend/src/schema/zod.ts`, `backend/frontend/src/lib/api/zod.ts`
- Test: `bridge/internal/schema/validate_test.go`

**Interfaces:**

- Produces (Go, generated): `schema.WledDevicesData`, `schema.WledApplyData`, `schema.WledProbeData`, `schema.WledBlinkData`, `schema.WledFoundData`, `schema.WledFoundDevice`, `schema.WledStatusData`.
- Produces (zod): `WledFoundMessageSchema`, `WledStatusMessageSchema` in `backend/src/schema/zod.ts`.

- [ ] **Step 1: Add the defs** to `schema/adbridge-v1.json` `$defs` (not to the root `oneOf`: these messages have no envelope, like `camera.still`):

```json
"WledDevice": {
  "type": "object",
  "required": ["id", "mac", "host", "max_bri"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string" },
    "mac": { "type": "string", "description": "Lower-case hex without separators, as WLED's /json/info reports it." },
    "host": { "type": "string", "description": "IP or .local name, no scheme, no path." },
    "max_bri": { "type": "integer", "minimum": 1, "maximum": 255 }
  }
},
"WledDevicesData": {
  "type": "object", "required": ["devices"], "additionalProperties": false,
  "properties": { "devices": { "type": "array", "items": { "$ref": "#/$defs/WledDevice" } } }
},
"WledApplyData": {
  "type": "object", "required": ["device_id", "state"], "additionalProperties": false,
  "properties": {
    "device_id": { "type": "string" },
    "state": { "type": "object", "description": "A WLED /json/state body." },
    "hold_ms": { "type": "integer", "minimum": 1, "maximum": 60000, "description": "Set: a flash, the base comes back after it. Unset: a scene, the new base." }
  }
},
"WledProbeData": { "type": "object", "required": ["host"], "additionalProperties": false, "properties": { "host": { "type": "string" } } },
"WledBlinkData": { "type": "object", "required": ["host"], "additionalProperties": false, "properties": { "host": { "type": "string" } } },
"WledFoundDevice": {
  "type": "object",
  "required": ["mac", "host", "name", "leds", "version", "segments"],
  "additionalProperties": false,
  "properties": {
    "mac": { "type": "string" }, "host": { "type": "string" }, "name": { "type": "string" },
    "leds": { "type": "integer", "minimum": 0 }, "version": { "type": "string" },
    "segments": { "type": "integer", "minimum": 0 }
  }
},
"WledFoundData": {
  "type": "object", "required": ["devices", "scanned_at"], "additionalProperties": false,
  "properties": {
    "devices": { "type": "array", "items": { "$ref": "#/$defs/WledFoundDevice" } },
    "scanned_at": { "type": "string", "format": "date-time" },
    "probe_host": { "type": "string", "description": "Set when this answers a wled.probe." },
    "probe_error": { "type": "string" }
  }
},
"WledStatusData": {
  "type": "object", "required": ["device_id", "reachable"], "additionalProperties": false,
  "properties": {
    "device_id": { "type": "string" }, "reachable": { "type": "boolean" },
    "version": { "type": "string" }, "error": { "type": "string" }
  }
},
"WledFoundMessage": {
  "type": "object", "required": ["kind", "data"], "additionalProperties": false,
  "properties": { "kind": { "type": "string", "const": "wled.found" }, "data": { "$ref": "#/$defs/WledFoundData" } }
},
"WledStatusMessage": {
  "type": "object", "required": ["kind", "data"], "additionalProperties": false,
  "properties": { "kind": { "type": "string", "const": "wled.status" }, "data": { "$ref": "#/$defs/WledStatusData" } }
}
```

Downstream messages are `{"kind": "wled.devices" | "wled.apply" | "wled.scan" | "wled.probe" | "wled.blink", "data": …}`; `wled.scan` has `data: {}`.

- [ ] **Step 2: Export the zod schemas.** In `scripts/gen-api.mjs` next to `CameraStillMessageSchema: ab.$defs.CameraStillMessage,` add:

```js
WledFoundMessageSchema: ab.$defs.WledFoundMessage,
WledStatusMessageSchema: ab.$defs.WledStatusMessage,
```

- [ ] **Step 3: Regenerate.** Run `cd bridge && go generate ./internal/schema && cd .. && npm run gen:api`. Expected: `schema_gen.go` gains `WledApplyData` etc.; `backend/src/schema/zod.ts` gains `WledFoundMessageSchema`.

  go-jsonschema only emits types reachable from the root. If `WledApplyData` is missing from `schema_gen.go`, check how `CameraStillData` gets emitted (`grep -n CameraStill bridge/internal/schema/schema_gen.go`) and reach the new defs the same way. If camera types are hand-written in Go instead, hand-write these structs in `bridge/internal/wled/messages.go` (Task 2) with the same JSON tags, and add a parity test in `validate_test.go` as below.

- [ ] **Step 4: Write the validation test** in `bridge/internal/schema/validate_test.go`, after `TestCameraStillMessageValidates`, compiling `#/$defs/WledFoundMessage` the same way that test compiles `CameraStillMessage`:

```go
func TestWledFoundMessageValidates(t *testing.T) {
	sch := compileDef(t, "WledFoundMessage") // use the same compile helper as TestCameraStillMessageValidates
	msg := map[string]any{"kind": "wled.found", "data": map[string]any{
		"devices":    []any{map[string]any{"mac": "a8032a7f3a2c", "host": "192.168.1.80", "name": "WLED", "leds": 144, "version": "0.15.0", "segments": 1}},
		"scanned_at": "2026-10-18T12:00:00Z",
	}}
	if err := sch.Validate(roundTrip(t, msg)); err != nil {
		t.Fatal(err)
	}
}
```

If `compileDef`/`roundTrip` don't exist, inline the steps `TestCameraStillMessageValidates` uses. Copy them; don't refactor that test.

- [ ] **Step 5: Run.** `cd bridge && go test ./internal/schema/` → PASS. `cd backend && npm test -- schema-parity` → PASS.

- [ ] **Step 6: Commit.**

```bash
git add schema/adbridge-v1.json scripts/gen-api.mjs bridge/internal/schema backend/src/schema/zod.ts backend/frontend/src/lib/api/zod.ts
git commit -m "feat(bridge): add wled message kinds to the bridge schema"
```

---

### Task 2: WLED HTTP client and host checks

**Files:**

- Create: `bridge/internal/wled/client.go`
- Create: `bridge/internal/wled/hosts.go`
- Test: `bridge/internal/wled/client_test.go`, `bridge/internal/wled/hosts_test.go`

**Interfaces:**

- Produces:
  - `type Info struct { Mac, Name, Version string; Leds int }`
  - `func GetInfo(ctx context.Context, hc *http.Client, host string) (Info, error)`
  - `func GetState(ctx context.Context, hc *http.Client, host string) (json.RawMessage, int /*segments*/, error)`
  - `func PostState(ctx context.Context, hc *http.Client, host string, state json.RawMessage) error`
  - `func LocalHost(host string) bool`
  - `func ClampBri(state json.RawMessage, max int) (json.RawMessage, error)`

- [ ] **Step 1: Write the failing tests.**

`hosts_test.go`:

```go
package wled

import "testing"

func TestLocalHost(t *testing.T) {
	for host, want := range map[string]bool{
		"192.168.1.80": true, "10.0.0.5": true, "172.16.3.4": true, "169.254.1.1": true,
		"wled-7f3a2c.local": true, "127.0.0.1:8080": true, "[fe80::1]": true,
		"8.8.8.8": false, "example.com": false, "": false, "192.168.1.80/json": false,
		"http://192.168.1.80": false, "192.168.1.80@evil.com": false,
	} {
		if got := LocalHost(host); got != want {
			t.Errorf("LocalHost(%q) = %v, want %v", host, got, want)
		}
	}
}

func TestClampBri(t *testing.T) {
	out, err := ClampBri([]byte(`{"on":true,"bri":255,"seg":[{"id":0,"bri":200},{"id":1,"bri":10},{"id":2,"stop":0}]}`), 178)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"bri":178,"on":true,"seg":[{"bri":178,"id":0},{"bri":10,"id":1},{"id":2,"stop":0}]}`
	if string(out) != want {
		t.Errorf("got %s\nwant %s", out, want)
	}
}

func TestClampBriNoBriSetsMax(t *testing.T) {
	out, _ := ClampBri([]byte(`{"on":true}`), 100)
	if string(out) != `{"bri":100,"on":true}` {
		t.Errorf("got %s", out)
	}
}
```

Note: allow loopback in `LocalHost` so tests and a WLED emulator on the same machine work.

`client_test.go`:

```go
package wled

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// fakeWLED answers like a WLED device and records POST bodies.
type fakeWLED struct {
	srv   *httptest.Server
	mac   string
	posts chan string
	state string
}

func newFakeWLED(t *testing.T, mac string) *fakeWLED {
	f := &fakeWLED{mac: mac, posts: make(chan string, 32), state: `{"on":true,"bri":128,"seg":[{"id":0,"start":0,"stop":144}]}`}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/json/info":
			io.WriteString(w, `{"ver":"0.15.0","name":"WLED","mac":"`+f.mac+`","leds":{"count":144}}`)
		case r.Method == http.MethodGet && r.URL.Path == "/json/state":
			io.WriteString(w, f.state)
		case r.Method == http.MethodPost && r.URL.Path == "/json/state":
			b, _ := io.ReadAll(r.Body)
			f.posts <- string(b)
			io.WriteString(w, `{"success":true}`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeWLED) host() string { return strings.TrimPrefix(f.srv.URL, "http://") }

func TestGetInfo(t *testing.T) {
	f := newFakeWLED(t, "a8032a7f3a2c")
	info, err := GetInfo(context.Background(), &http.Client{Timeout: time.Second}, f.host())
	if err != nil {
		t.Fatal(err)
	}
	if info != (Info{Mac: "a8032a7f3a2c", Name: "WLED", Version: "0.15.0", Leds: 144}) {
		t.Errorf("info = %+v", info)
	}
}

func TestGetInfoRejectsNonWLED(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, `{"hello":1}`) }))
	defer srv.Close()
	if _, err := GetInfo(context.Background(), http.DefaultClient, strings.TrimPrefix(srv.URL, "http://")); err == nil {
		t.Fatal("want error for a device without mac/ver")
	}
}

func TestGetStateCountsSegments(t *testing.T) {
	f := newFakeWLED(t, "m")
	_, n, err := GetState(context.Background(), http.DefaultClient, f.host())
	if err != nil || n != 1 {
		t.Fatalf("n=%d err=%v", n, err)
	}
}

func TestPostState(t *testing.T) {
	f := newFakeWLED(t, "m")
	if err := PostState(context.Background(), http.DefaultClient, f.host(), json.RawMessage(`{"on":true}`)); err != nil {
		t.Fatal(err)
	}
	if got := <-f.posts; got != `{"on":true}` {
		t.Errorf("posted %s", got)
	}
}
```

- [ ] **Step 2: Run.** `cd bridge && go test ./internal/wled/` → FAIL (package does not compile).

- [ ] **Step 3: Implement `hosts.go`.**

```go
// Package wled drives WLED devices for the backend: only paired devices, only WLED's /json
// endpoints, only on the local network.
package wled

import (
	"encoding/json"
	"net"
	"strings"
)

// LocalHost reports whether host (an IP or name, optionally with a port, nothing else) is on the
// local network: RFC 1918, link-local, loopback or an mDNS .local name.
func LocalHost(host string) bool {
	if host == "" || strings.ContainsAny(host, "/@?#") || strings.Contains(host, "://") {
		return false
	}
	h := host
	if sh, _, err := net.SplitHostPort(host); err == nil {
		h = sh
	}
	h = strings.Trim(h, "[]")
	if ip := net.ParseIP(h); ip != nil {
		return ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLoopback()
	}
	return strings.HasSuffix(strings.ToLower(h), ".local")
}

// ClampBri caps the master and every segment brightness at max; a state without "bri" gets max.
func ClampBri(state json.RawMessage, max int) (json.RawMessage, error) {
	var m map[string]any
	if err := json.Unmarshal(state, &m); err != nil {
		return nil, err
	}
	clamp := func(o map[string]any, setMissing bool) {
		if b, ok := o["bri"].(float64); ok {
			if int(b) > max {
				o["bri"] = max
			}
		} else if setMissing {
			o["bri"] = max
		}
	}
	clamp(m, true)
	if segs, ok := m["seg"].([]any); ok {
		for _, s := range segs {
			if so, ok := s.(map[string]any); ok {
				clamp(so, false)
			}
		}
	} else if so, ok := m["seg"].(map[string]any); ok {
		clamp(so, false)
	}
	return json.Marshal(m)
}
```

`json.Marshal` of a map sorts keys, which the test's expected string relies on.

- [ ] **Step 4: Implement `client.go`.**

```go
package wled

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

type Info struct {
	Mac, Name, Version string
	Leds               int
}

func get(ctx context.Context, hc *http.Client, host, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+host+path, nil)
	if err != nil {
		return nil, err
	}
	res, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s answered %d", path, res.StatusCode)
	}
	return io.ReadAll(io.LimitReader(res.Body, 1<<20))
}

// GetInfo reads /json/info; a host that doesn't answer with a MAC and version isn't WLED.
func GetInfo(ctx context.Context, hc *http.Client, host string) (Info, error) {
	b, err := get(ctx, hc, host, "/json/info")
	if err != nil {
		return Info{}, err
	}
	var raw struct {
		Ver, Name, Mac string
		Leds           struct{ Count int }
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return Info{}, err
	}
	if raw.Mac == "" || raw.Ver == "" {
		return Info{}, errors.New("not a WLED device")
	}
	return Info{Mac: raw.Mac, Name: raw.Name, Version: raw.Ver, Leds: raw.Leds.Count}, nil
}

// GetState reads /json/state and counts its segments.
func GetState(ctx context.Context, hc *http.Client, host string) (json.RawMessage, int, error) {
	b, err := get(ctx, hc, host, "/json/state")
	if err != nil {
		return nil, 0, err
	}
	var s struct{ Seg []json.RawMessage }
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, 0, err
	}
	return b, len(s.Seg), nil
}

func PostState(ctx context.Context, hc *http.Client, host string, state json.RawMessage) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://"+host+"/json/state", bytes.NewReader(state))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	io.Copy(io.Discard, io.LimitReader(res.Body, 1<<16))
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("/json/state answered %d", res.StatusCode)
	}
	return nil
}
```

The HTTP client the bridge builds must set `CheckRedirect` to refuse redirects, so a device can't bounce requests elsewhere. That happens in Task 3's `New`.

- [ ] **Step 5: Run.** `cd bridge && go test ./internal/wled/` → PASS.

- [ ] **Step 6: Commit.**

```bash
git add bridge/internal/wled
git commit -m "feat(bridge): add a wled json client limited to local hosts"
```

---

### Task 3: Device manager: allowlist, identity, queue, flash restore

**Files:**

- Create: `bridge/internal/wled/manager.go`
- Test: `bridge/internal/wled/manager_test.go`

**Interfaces:**

- Consumes: Task 2 (`GetInfo`, `GetState`, `PostState`, `ClampBri`, `LocalHost`).
- Produces:
  - `type Device struct { ID, Mac, Host string; MaxBri int }`
  - `type Report func(msg any)`: sends a `{"kind","data"}` telemetry message to the backend.
  - `func New(report Report) *Manager` (real `http.Client` with 1 s timeout, no redirects)
  - `func (m *Manager) SetDevices(ds []Device)`
  - `func (m *Manager) Apply(deviceID string, state json.RawMessage, holdMs int)`, where `holdMs == 0` means scene
  - `func (m *Manager) Rehost(mac, host string)`: Task 4 calls it when mDNS finds a known MAC at a new host
  - `func (m *Manager) Close()`
  - The manager's `minGap` field (default 100 ms) can be overridden in tests.

- [ ] **Step 1: Write the failing tests** in `manager_test.go` (same package, reuses `fakeWLED` from `client_test.go`):

```go
package wled

import (
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"
)

type reports struct {
	mu   sync.Mutex
	msgs []map[string]any
}

func (r *reports) add(m any) {
	b, _ := json.Marshal(m)
	var v map[string]any
	json.Unmarshal(b, &v)
	r.mu.Lock()
	r.msgs = append(r.msgs, v)
	r.mu.Unlock()
}

func (r *reports) last() map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.msgs) == 0 {
		return nil
	}
	return r.msgs[len(r.msgs)-1]
}

func recv(t *testing.T, f *fakeWLED) string {
	t.Helper()
	select {
	case p := <-f.posts:
		return p
	case <-time.After(2 * time.Second):
		t.Fatal("no POST")
		return ""
	}
}

func none(t *testing.T, f *fakeWLED, d time.Duration) {
	t.Helper()
	select {
	case p := <-f.posts:
		t.Fatalf("unexpected POST %s", p)
	case <-time.After(d):
	}
}

func newTestManager(t *testing.T) (*Manager, *reports) {
	r := &reports{}
	m := New(r.add)
	m.minGap = 0
	t.Cleanup(m.Close)
	return m, r
}

func TestApplyOnlyToPairedDevices(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.Apply("d1", json.RawMessage(`{"on":true}`), 0)
	none(t, f, 200*time.Millisecond)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	m.Apply("d1", json.RawMessage(`{"on":true}`), 0)
	if p := recv(t, f); !strings.Contains(p, `"on":true`) {
		t.Errorf("posted %s", p)
	}
}

func TestApplyClampsBrightness(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 100}})
	m.Apply("d1", json.RawMessage(`{"bri":255}`), 0)
	if p := recv(t, f); p != `{"bri":100}` {
		t.Errorf("posted %s", p)
	}
}

func TestDifferentMacStopsSends(t *testing.T) {
	f := newFakeWLED(t, "bb") // the host now answers as another device
	m, r := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	m.Apply("d1", json.RawMessage(`{"on":true}`), 0)
	none(t, f, 300*time.Millisecond)
	last := r.last()
	if last["kind"] != "wled.status" || last["data"].(map[string]any)["reachable"] != false {
		t.Errorf("last report %v", last)
	}
}

func TestRehostMovesDevice(t *testing.T) {
	old := newFakeWLED(t, "bb")
	moved := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: old.host(), MaxBri: 255}})
	m.Rehost("aa", moved.host())
	m.Apply("d1", json.RawMessage(`{"on":true}`), 0)
	recv(t, moved)
}

func TestFlashRestoresBase(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	m.Apply("d1", json.RawMessage(`{"ps":1}`), 0)
	recv(t, f)
	m.Apply("d1", json.RawMessage(`{"ps":2}`), 150)
	if p := recv(t, f); p != `{"bri":255,"ps":2}` {
		t.Fatalf("flash %s", p)
	}
	if p := recv(t, f); p != `{"bri":255,"ps":1}` {
		t.Fatalf("restore %s", p)
	}
}

func TestSceneDuringFlashBecomesBase(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	m.Apply("d1", json.RawMessage(`{"ps":1}`), 0)
	recv(t, f)
	m.Apply("d1", json.RawMessage(`{"ps":2}`), 200)
	recv(t, f)
	m.Apply("d1", json.RawMessage(`{"ps":3}`), 0) // takeout scene mid-flash
	none(t, f, 100*time.Millisecond)            // the flash keeps playing
	if p := recv(t, f); p != `{"bri":255,"ps":3}` {
		t.Fatalf("after flash %s", p)
	}
}

func TestFlashWithoutBaseRestoresPriorState(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	m.Apply("d1", json.RawMessage(`{"ps":2}`), 100)
	recv(t, f)
	if p := recv(t, f); !strings.Contains(p, `"stop":144`) {
		t.Fatalf("restore %s", p) // the state read before the flash
	}
}

func TestPendingScenesCoalesce(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.minGap = 200 * time.Millisecond
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	m.Apply("d1", json.RawMessage(`{"ps":1}`), 0)
	recv(t, f)
	m.Apply("d1", json.RawMessage(`{"ps":2}`), 0)
	m.Apply("d1", json.RawMessage(`{"ps":3}`), 0)
	if p := recv(t, f); p != `{"bri":255,"ps":3}` {
		t.Fatalf("got %s, want only the latest scene", p)
	}
	none(t, f, 300*time.Millisecond)
}
```

- [ ] **Step 2: Run.** `cd bridge && go test ./internal/wled/ -run 'Apply|Mac|Rehost|Flash|Scene|Coalesce'` → FAIL (undefined: New).

- [ ] **Step 3: Implement `manager.go`.**

```go
package wled

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/charmbracelet/log"
)

type Device struct {
	ID, Mac, Host string
	MaxBri        int
}

// Report sends a telemetry message ({"kind", "data"}) to the backend; it must not block.
type Report func(msg any)

type Manager struct {
	hc     *http.Client
	report Report
	minGap time.Duration

	mu      sync.Mutex
	workers map[string]*worker // by device id
	closed  bool
}

func New(report Report) *Manager {
	hc := &http.Client{
		Timeout:       time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	return &Manager{hc: hc, report: report, minGap: 100 * time.Millisecond, workers: map[string]*worker{}}
}

// SetDevices replaces the allowlist: workers for devices no longer listed stop.
func (m *Manager) SetDevices(ds []Device) {
	m.mu.Lock()
	defer m.mu.Unlock()
	keep := map[string]bool{}
	for _, d := range ds {
		keep[d.ID] = true
		if w, ok := m.workers[d.ID]; ok {
			w.update(d)
			continue
		}
		w := newWorker(m, d)
		m.workers[d.ID] = w
		go w.run()
	}
	for id, w := range m.workers {
		if !keep[id] {
			w.stop()
			delete(m.workers, id)
		}
	}
}

func (m *Manager) Apply(deviceID string, state json.RawMessage, holdMs int) {
	m.mu.Lock()
	w := m.workers[deviceID]
	m.mu.Unlock()
	if w == nil {
		log.Debug("wled: apply for an unpaired device, dropped", "device", deviceID)
		return
	}
	w.push(state, time.Duration(holdMs)*time.Millisecond)
}

// Rehost points the device with this MAC at a new host (mDNS found it there).
func (m *Manager) Rehost(mac, host string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, w := range m.workers {
		w.rehost(mac, host)
	}
}

func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, w := range m.workers {
		w.stop()
		delete(m.workers, id)
	}
}

type worker struct {
	m    *Manager
	wake chan struct{}
	done chan struct{}

	mu         sync.Mutex
	dev        Device
	verified   bool // the host answered with dev.Mac since the last error
	reachable  *bool
	scene      json.RawMessage // pending scene
	flash      json.RawMessage // pending flash
	hold       time.Duration
	base       json.RawMessage // the scene a flash returns to
	flashUntil time.Time
	lastSend   time.Time
}

func newWorker(m *Manager, d Device) *worker {
	return &worker{m: m, dev: d, wake: make(chan struct{}, 1), done: make(chan struct{})}
}

func (w *worker) poke() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

func (w *worker) update(d Device) {
	w.mu.Lock()
	if d.Host != w.dev.Host || d.Mac != w.dev.Mac {
		w.verified = false
	}
	w.dev = d
	w.mu.Unlock()
}

func (w *worker) rehost(mac, host string) {
	w.mu.Lock()
	if w.dev.Mac == mac && w.dev.Host != host {
		w.dev.Host = host
		w.verified = false
	}
	w.mu.Unlock()
	w.poke()
}

func (w *worker) stop() { close(w.done) }

// push queues a scene (hold 0) or a flash; a newer one of the same type replaces the pending one.
func (w *worker) push(state json.RawMessage, hold time.Duration) {
	w.mu.Lock()
	if hold > 0 {
		w.flash, w.hold = state, hold
	} else {
		w.scene = state
	}
	w.mu.Unlock()
	w.poke()
}

func (w *worker) run() {
	timer := time.NewTimer(time.Hour)
	defer timer.Stop()
	for {
		select {
		case <-w.done:
			return
		case <-w.wake:
		case <-timer.C:
		}
		next := w.step()
		if next > 0 {
			timer.Reset(next)
		}
	}
}

// step sends at most one request and returns how long to wait before the next step (0: until woken).
func (w *worker) step() time.Duration {
	w.mu.Lock()
	now := time.Now()
	if gap := w.m.minGap - now.Sub(w.lastSend); gap > 0 {
		w.mu.Unlock()
		return gap
	}
	inFlash := now.Before(w.flashUntil)
	var body json.RawMessage
	var hold time.Duration
	switch {
	case w.flash != nil:
		body, hold = w.flash, w.hold
		w.flash = nil
	case w.scene != nil:
		w.base, w.scene = w.scene, nil
		if inFlash {
			left := w.flashUntil.Sub(now)
			w.mu.Unlock()
			return left
		}
		body = w.base
	case !w.flashUntil.IsZero() && !inFlash:
		w.flashUntil = time.Time{}
		body = w.base
	case inFlash:
		left := w.flashUntil.Sub(now)
		w.mu.Unlock()
		return left
	}
	dev := w.dev
	w.mu.Unlock()
	if body == nil {
		return 0
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := w.verify(ctx, dev); err != nil {
		w.setReachable(false, err.Error())
		return 0
	}
	if hold > 0 {
		w.mu.Lock()
		noBase := w.base == nil
		w.mu.Unlock()
		if noBase {
			// Nothing to return to yet: come back to what the strip showed before the flash
			if prior, _, err := GetState(ctx, w.m.hc, dev.Host); err == nil {
				w.mu.Lock()
				w.base = prior
				w.mu.Unlock()
			}
		}
	}
	clamped, err := ClampBri(body, dev.MaxBri)
	if err != nil {
		log.Warn("wled: bad state from the backend, dropped", "device", dev.ID, "err", err)
		return 0
	}
	err = PostState(ctx, w.m.hc, dev.Host, clamped)
	w.mu.Lock()
	w.lastSend = time.Now()
	if hold > 0 {
		w.flashUntil = w.lastSend.Add(hold)
	}
	if err != nil {
		w.verified = false
	}
	pendingFlashEnd := !w.flashUntil.IsZero()
	w.mu.Unlock()
	if err != nil {
		w.setReachable(false, err.Error())
		return 0
	}
	w.setReachable(true, "")
	if hold > 0 {
		return hold
	}
	if pendingFlashEnd {
		return time.Until(w.flashUntil)
	}
	// Another push may have arrived while sending
	return w.m.minGap + time.Millisecond
}

func (w *worker) verify(ctx context.Context, dev Device) error {
	w.mu.Lock()
	ok := w.verified
	w.mu.Unlock()
	if ok {
		return nil
	}
	info, err := GetInfo(ctx, w.m.hc, dev.Host)
	if err != nil {
		return err
	}
	if info.Mac != dev.Mac {
		return errors.New("different device at host")
	}
	w.mu.Lock()
	w.verified = true
	w.mu.Unlock()
	return nil
}

func (w *worker) setReachable(up bool, errMsg string) {
	w.mu.Lock()
	changed := w.reachable == nil || *w.reachable != up
	w.reachable = &up
	id := w.dev.ID
	w.mu.Unlock()
	if !changed {
		return
	}
	data := map[string]any{"device_id": id, "reachable": up}
	if errMsg != "" {
		data["error"] = errMsg
	}
	w.m.report(map[string]any{"kind": "wled.status", "data": data})
}
```

When `step` returns `w.m.minGap + 1ms` after a send with nothing pending, the next step finds nothing and returns 0. That re-check is cheap, and it catches pushes that arrived mid-send without needing a poke.

- [ ] **Step 4: Run.** `cd bridge && go test -race ./internal/wled/` → PASS. If a timing test is flaky, raise its hold or wait values; don't drop the assertion.

- [ ] **Step 5: Commit.**

```bash
git add bridge/internal/wled
git commit -m "feat(bridge): queue wled scenes and flashes per paired device"
```

---

### Task 4: Discovery, probe and blink

**Files:**

- Modify: `bridge/go.mod`, `bridge/go.sum` (add `github.com/grandcat/zeroconf`)
- Create: `bridge/internal/wled/discovery.go`
- Test: `bridge/internal/wled/discovery_test.go`

**Interfaces:**

- Consumes: Task 2, Task 3 (`Manager`, `Report`, `Rehost`).
- Produces:
  - `type Browser interface { Browse(ctx context.Context) ([]string /*hosts*/, error) }`
  - `func ZeroconfBrowser() Browser`
  - `func (m *Manager) Scan(ctx context.Context, b Browser)`: runs in its own goroutine; reports `wled.found`
  - `func (m *Manager) Probe(ctx context.Context, host string)`
  - `func (m *Manager) Blink(ctx context.Context, host string)`

- [ ] **Step 1: Add the dependency.** `cd bridge && go get github.com/grandcat/zeroconf@latest && go mod tidy`. The bridge has no mDNS client, and writing one is more code than the library. Say that in the commit body.

- [ ] **Step 2: Write the failing tests** (`discovery_test.go`):

```go
package wled

import (
	"context"
	"strings"
	"testing"
	"time"
)

type fakeBrowser []string

func (f fakeBrowser) Browse(context.Context) ([]string, error) { return f, nil }

func TestScanReportsWLEDsAndRehostsKnownMacs(t *testing.T) {
	a := newFakeWLED(t, "aa")
	m, r := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: "192.168.1.2", MaxBri: 255}})
	m.Scan(context.Background(), fakeBrowser{a.host(), "127.0.0.1:1"}) // the second doesn't answer
	found := r.last()
	if found["kind"] != "wled.found" {
		t.Fatalf("last %v", found)
	}
	devs := found["data"].(map[string]any)["devices"].([]any)
	if len(devs) != 1 || devs[0].(map[string]any)["mac"] != "aa" || devs[0].(map[string]any)["segments"].(float64) != 1 {
		t.Fatalf("devices %v", devs)
	}
	m.Apply("d1", []byte(`{"on":true}`), 0)
	recv(t, a) // rehosted to the scanned address
}

func TestProbeRefusesPublicHosts(t *testing.T) {
	m, r := newTestManager(t)
	m.Probe(context.Background(), "8.8.8.8")
	d := r.last()["data"].(map[string]any)
	if d["probe_host"] != "8.8.8.8" || d["probe_error"] == nil {
		t.Fatalf("got %v", d)
	}
}

func TestProbeReportsTheDevice(t *testing.T) {
	a := newFakeWLED(t, "aa")
	m, r := newTestManager(t)
	m.Probe(context.Background(), a.host())
	d := r.last()["data"].(map[string]any)
	if d["probe_error"] != nil || len(d["devices"].([]any)) != 1 {
		t.Fatalf("got %v", d)
	}
}

func TestBlinkThenRestores(t *testing.T) {
	a := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.blinkFor = 100 * time.Millisecond
	m.Blink(context.Background(), a.host())
	if p := recv(t, a); !strings.Contains(p, `"fx":1`) || !strings.Contains(p, `"bri":128`) {
		t.Fatalf("blink %s", p)
	}
	if p := recv(t, a); !strings.Contains(p, `"stop":144`) {
		t.Fatalf("restore %s", p)
	}
}
```

Add a `blinkFor time.Duration` field to `Manager`, default `3 * time.Second`, set in `New`.

- [ ] **Step 3: Run.** `go test ./internal/wled/ -run 'Scan|Probe|Blink'` → FAIL.

- [ ] **Step 4: Implement `discovery.go`.**

```go
package wled

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/grandcat/zeroconf"
)

type Browser interface {
	Browse(ctx context.Context) ([]string, error)
}

type zcBrowser struct{}

func ZeroconfBrowser() Browser { return zcBrowser{} }

// Browse lists the hosts advertising _wled._tcp, for 3 s.
func (zcBrowser) Browse(ctx context.Context) ([]string, error) {
	r, err := zeroconf.NewResolver(nil)
	if err != nil {
		return nil, err
	}
	entries := make(chan *zeroconf.ServiceEntry)
	var hosts []string
	done := make(chan struct{})
	go func() {
		for e := range entries {
			for _, ip := range e.AddrIPv4 {
				hosts = append(hosts, net.JoinHostPort(ip.String(), strconv.Itoa(e.Port)))
			}
		}
		close(done)
	}()
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if err := r.Browse(ctx, "_wled._tcp", "local.", entries); err != nil {
		return nil, err
	}
	<-ctx.Done()
	<-done
	return hosts, nil
}

type found struct {
	Mac      string `json:"mac"`
	Host     string `json:"host"`
	Name     string `json:"name"`
	Leds     int    `json:"leds"`
	Version  string `json:"version"`
	Segments int    `json:"segments"`
}

func (m *Manager) describe(ctx context.Context, host string) (found, error) {
	if !LocalHost(host) {
		return found{}, fmt.Errorf("%s is not on the local network", host)
	}
	info, err := GetInfo(ctx, m.hc, host)
	if err != nil {
		return found{}, err
	}
	_, segs, err := GetState(ctx, m.hc, host)
	if err != nil {
		return found{}, err
	}
	// Port 80 is WLED's default: keep stored hosts short
	if h, p, err := net.SplitHostPort(host); err == nil && p == "80" {
		host = h
	}
	return found{Mac: info.Mac, Host: host, Name: info.Name, Leds: info.Leds, Version: info.Version, Segments: segs}, nil
}

// Scan browses mDNS, describes every WLED that answers, moves paired devices to their current
// host, and reports the list.
func (m *Manager) Scan(ctx context.Context, b Browser) {
	hosts, err := b.Browse(ctx)
	if err != nil {
		hosts = nil
	}
	var mu sync.Mutex
	var wg sync.WaitGroup
	devs := []found{}
	seen := map[string]bool{}
	for _, h := range hosts {
		wg.Add(1)
		go func(h string) {
			defer wg.Done()
			d, err := m.describe(ctx, h)
			if err != nil {
				return
			}
			mu.Lock()
			defer mu.Unlock()
			if !seen[d.Mac] {
				seen[d.Mac] = true
				devs = append(devs, d)
			}
		}(h)
	}
	wg.Wait()
	for _, d := range devs {
		m.Rehost(d.Mac, d.Host)
	}
	m.report(map[string]any{"kind": "wled.found", "data": map[string]any{"devices": devs, "scanned_at": time.Now().UTC()}})
}

func (m *Manager) Probe(ctx context.Context, host string) {
	data := map[string]any{"devices": []found{}, "scanned_at": time.Now().UTC(), "probe_host": host}
	if d, err := m.describe(ctx, host); err != nil {
		data["probe_error"] = err.Error()
	} else {
		data["devices"] = []found{d}
	}
	m.report(map[string]any{"kind": "wled.found", "data": data})
}

// blinkState is the pairing check: lime, blinking, half brightness on every segment.
var blinkState = json.RawMessage(`{"on":true,"bri":128,"seg":{"col":[[198,242,78]],"fx":1,"sx":200}}`)

// Blink plays the pairing check on a local host, then puts back what it showed before.
func (m *Manager) Blink(ctx context.Context, host string) {
	if !LocalHost(host) {
		return
	}
	prior, _, err := GetState(ctx, m.hc, host)
	if err != nil {
		return
	}
	if err := PostState(ctx, m.hc, host, blinkState); err != nil {
		return
	}
	time.Sleep(m.blinkFor)
	_ = PostState(context.Background(), m.hc, host, prior)
}
```

Callers run `Scan`, `Probe` and `Blink` in goroutines (Task 5), so the `Sleep` doesn't block anything.

- [ ] **Step 5: Run.** `go test -race ./internal/wled/` → PASS.

- [ ] **Step 6: Commit.**

```bash
git add bridge/go.mod bridge/go.sum bridge/internal/wled
git commit -m "feat(bridge): find wled devices over mdns, probe and blink them" -m "Adds grandcat/zeroconf: the bridge has no mDNS client and one is more code than the library."
```

---

### Task 5: Wire `wled.*` messages into the transport and main

**Files:**

- Modify: `bridge/internal/transport/transport.go` (add `OnMessage`, `SendMessage`; route in `handleMessage` ~line 424; make `SendStill` use `SendMessage`)
- Create: `bridge/internal/wled/handle.go`
- Modify: `bridge/cmd/bridge/main.go:146-194`
- Test: `bridge/internal/transport/transport_test.go`, `bridge/internal/wled/handle_test.go`

**Interfaces:**

- Consumes: Task 3, Task 4.
- Produces:
  - `func (t *Transport) OnMessage(f func(kind string, data json.RawMessage))`: set before Start. It runs on the reader goroutine and must not block.
  - `func (t *Transport) SendMessage(v any)`: queued telemetry, dropped if not connected or the queue is full.
  - `func (m *Manager) Handle(ctx context.Context, b Browser, kind string, data json.RawMessage)`: never blocks.
  - `func (m *Manager) Every(ctx context.Context, b Browser, d time.Duration)`: periodic scan.

- [ ] **Step 1: Write the failing transport test**, modelled on the `SendStill` test at `transport_test.go:443`:

```go
func TestOnMessageGetsKindedMessages(t *testing.T) {
	got := make(chan string, 1)
	s := newTestServer(t, func(conn *websocket.Conn) {
		readUntilKind(t, conn, "bridge.hello")
		wsjson.Write(context.Background(), conn, map[string]any{"kind": "wled.scan", "data": map[string]any{}})
		time.Sleep(time.Second)
	})
	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br", BootID: "bt"})
	tr.OnMessage(func(kind string, _ json.RawMessage) { got <- kind })
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint
	select {
	case k := <-got:
		if k != "wled.scan" {
			t.Errorf("kind %q", k)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no message")
	}
}
```

Match `readUntilKind`'s real signature in the file. If the test server's handler shape differs, follow the existing camera test exactly.

- [ ] **Step 2: Run.** `cd bridge && go test ./internal/transport/ -run OnMessage` → FAIL.

- [ ] **Step 3: Implement in `transport.go`.** Add the field `onMessage func(string, json.RawMessage)` to `Transport`. Then:

```go
// OnMessage receives every backend message with a kind (wled.*). It runs on the reader
// goroutine, so it must not block. Set it before Start.
func (t *Transport) OnMessage(f func(kind string, data json.RawMessage)) { t.onMessage = f }

// SendMessage queues a telemetry message (no envelope, not stored); dropped when offline or full.
func (t *Transport) SendMessage(v any) {
	if !t.connected.Load() {
		return
	}
	select {
	case t.stills <- v:
	default:
		log.Debug("telemetry queue full, dropping")
	}
}

func (t *Transport) SendStill(st camera.Still) { t.SendMessage(StillMessage(st)) }
```

In `handleMessage`, before the ack handling:

```go
var m struct {
	Kind string          `json:"kind"`
	Data json.RawMessage `json:"data"`
}
if json.Unmarshal(msg, &m) == nil && m.Kind != "" {
	if t.onMessage != nil {
		t.onMessage(m.Kind, m.Data)
	}
	return
}
```

Raise the `stills` channel capacity in `New` from `2*camera.MaxCameras` to `2*camera.MaxCameras + 16`, so status bursts don't push out stills. Also change the `handleMessage` comment to say that it handles acks and kinded messages.

- [ ] **Step 4: Write the failing handler test** (`handle_test.go`):

```go
package wled

import (
	"context"
	"encoding/json"
	"testing"
)

func TestHandleDevicesThenApply(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	ctx := context.Background()
	m.Handle(ctx, fakeBrowser{}, "wled.devices", json.RawMessage(`{"devices":[{"id":"d1","mac":"aa","host":"`+f.host()+`","max_bri":255}]}`))
	m.Handle(ctx, fakeBrowser{}, "wled.apply", json.RawMessage(`{"device_id":"d1","state":{"on":true}}`))
	recv(t, f)
}

func TestHandleIgnoresUnknownKindsAndBadData(t *testing.T) {
	m, _ := newTestManager(t)
	m.Handle(context.Background(), fakeBrowser{}, "wled.selfdestruct", nil)
	m.Handle(context.Background(), fakeBrowser{}, "wled.apply", json.RawMessage(`{"device_id":`))
}
```

- [ ] **Step 5: Implement `handle.go`.**

```go
package wled

import (
	"context"
	"encoding/json"
	"time"

	"github.com/charmbracelet/log"
	"dartcade/bridge/internal/schema"
)

// Handle runs one backend message. It never blocks: network work runs in goroutines.
func (m *Manager) Handle(ctx context.Context, b Browser, kind string, data json.RawMessage) {
	switch kind {
	case "wled.devices":
		var d schema.WledDevicesData
		if json.Unmarshal(data, &d) != nil {
			return
		}
		ds := make([]Device, 0, len(d.Devices))
		for _, x := range d.Devices {
			ds = append(ds, Device{ID: x.Id, Mac: x.Mac, Host: x.Host, MaxBri: x.MaxBri})
		}
		m.SetDevices(ds)
	case "wled.apply":
		var d schema.WledApplyData
		if json.Unmarshal(data, &d) != nil {
			return
		}
		state, err := json.Marshal(d.State)
		if err != nil {
			return
		}
		hold := 0
		if d.HoldMs != nil {
			hold = *d.HoldMs
		}
		m.Apply(d.DeviceId, state, hold)
	case "wled.scan":
		go m.Scan(ctx, b)
	case "wled.probe":
		var d schema.WledProbeData
		if json.Unmarshal(data, &d) == nil {
			go m.Probe(ctx, d.Host)
		}
	case "wled.blink":
		var d schema.WledBlinkData
		if json.Unmarshal(data, &d) == nil {
			go m.Blink(ctx, d.Host)
		}
	default:
		log.Debug("wled: unknown message kind", "kind", kind)
	}
}

// Every scans now and then every d until ctx ends.
func (m *Manager) Every(ctx context.Context, b Browser, d time.Duration) {
	t := time.NewTicker(d)
	defer t.Stop()
	for {
		m.Scan(ctx, b)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
```

Use the exact generated field names from `schema_gen.go` (`Id` vs `ID`, `MaxBri`, `HoldMs` pointer or value, `State` as `map[string]interface{}`) and adjust the lines above to match.

- [ ] **Step 6: Wire `main.go`.** After `tr := transport.New(...)` and before `go tr.Start`:

```go
lights := wled.New(tr.SendMessage)
defer lights.Close()
browser := wled.ZeroconfBrowser()
tr.OnMessage(func(kind string, data json.RawMessage) { lights.Handle(ctx, browser, kind, data) })
go lights.Every(ctx, browser, 5*time.Minute)
```

Merge this with the existing `tr.OnConnect(func() { stills.Trigger(ctx) })`. Keep that line; there's no extra connect behaviour, since the backend sends devices on hello.

- [ ] **Step 7: Run.** `cd bridge && gofmt -w . && go vet ./... && go test -race ./...` → PASS.

- [ ] **Step 8: Commit.**

```bash
git add bridge
git commit -m "feat(bridge): run wled messages from the backend"
```

- [ ] **Step 9: Open PR 1.** Branch `feat/wled-bridge` off `feat/wled-lights` (the spec and plan commits). Title: `feat(bridge): drive wled lights for the backend`. Body: what the bridge accepts, the security limits, `Refs #135`.

---

# Part 2 — Backend (PR 2: `feat(backend): light up wled strips from the game`)

### Task 6: Shared rules: types, seat colours, default profile, match, patches

**Files:**

- Create: `backend/src/shared/lights/types.ts`, `backend/src/shared/lights/profile.ts`, `backend/src/shared/lights/patch.ts`, `backend/src/shared/lights/index.ts`
- Test: `backend/src/shared/lights/profile.test.ts`, `backend/src/shared/lights/patch.test.ts`

**Interfaces:**

- Produces (import from `$shared/lights/index.js` in the frontend, `../shared/lights/index.js` in the backend):

```ts
export type GameId = 'x01' | 'atc' | 'p121' | 'hilo' | 'minigolf'
export type Trigger =
  | { kind: 'turn'; seat: number }
  | { kind: 'game.won'; seat: number }
  | { kind: 'idle' }
  | { kind: 'takeout.started' }
  | { kind: 'takeout.finished' }
  | { kind: 'visit'; seat: number; total: number }
  | { kind: 'bust'; seat: number }
  | { kind: 'checkout'; seat: number }
  | { kind: 'atc.hit'; seat: number; target: number }
  | { kind: 'hilo.lifeLost'; seat: number }
  | { kind: 'golf.sunk'; seat: number; strokes: number }
  | { kind: 'bulloff.won'; seat: number }
export type TriggerKind = Trigger['kind']
export type BoardTrigger = Trigger & { local: boolean }
export type Look = { color: 'seat' | 'team' | `#${string}`; fx: number; bri: number; speed?: number }
export type Rule = {
  when: { trigger: TriggerKind; total?: { op: '=' | '>='; n: number }; seats: 'any' | 'mine' | 'other'; game?: GameId }
  type: 'scene' | 'flash'
  look: Look
  holdMs?: number
}
export type Profile = { id: 'default'; name: string; rules: Rule[] }
export type SegmentMode = 'whole' | 'perSeat' | 'wled'
export type LightDevice = { leds: number; segmentMode: SegmentMode; segments: number }
export type SeatLayout = { seatCount: number; teams?: number[][] } // teams: seats per team
export type WledSeg = { id: number; start?: number; stop?: number; on?: boolean; bri?: number; col?: number[][]; fx?: number; sx?: number }
export type WledState = { on: true; bri: number; seg: WledSeg[] }
export const SEAT_COLORS: readonly string[]
export const DEFAULT_PROFILE: Profile
export function seatColor(seat: number): string
export function match(profile: Profile, t: BoardTrigger, game: GameId | null): Rule | null
export function patchFor(rule: Rule, t: BoardTrigger, device: LightDevice, layout: SeatLayout): WledState
```

- [ ] **Step 1: Write the failing tests.**

`profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, match } from './index.js'

const rule = (t: Parameters<typeof match>[1], game: Parameters<typeof match>[2] = 'x01') => match(DEFAULT_PROFILE, t, game)

describe('match', () => {
  it('picks 180 over 100+ because it comes first', () => {
    expect(rule({ kind: 'visit', seat: 0, total: 180, local: true })?.look.fx).toBe(42)
    expect(rule({ kind: 'visit', seat: 0, total: 140, local: true })?.look.fx).toBe(2)
  })
  it('ignores visits under 100', () => {
    expect(rule({ kind: 'visit', seat: 0, total: 60, local: true })).toBeNull()
  })
  it('flashes only for this board in remote games', () => {
    expect(rule({ kind: 'bust', seat: 1, local: false })).toBeNull()
    expect(rule({ kind: 'bust', seat: 1, local: true })?.type).toBe('flash')
  })
  it('shows the waiting scene on the other board’s turn', () => {
    const r = rule({ kind: 'turn', seat: 1, local: false })
    expect(r?.type).toBe('scene')
    expect(r?.look).toEqual({ color: '#ffffff', fx: 0, bri: 40 })
  })
  it('has no rule for takeout.finished (the service restores the game scene)', () => {
    expect(rule({ kind: 'takeout.finished', local: true }, null)).toBeNull()
  })
  it('respects a game filter', () => {
    const p = { ...DEFAULT_PROFILE, rules: [{ ...DEFAULT_PROFILE.rules[0], when: { ...DEFAULT_PROFILE.rules[0].when, game: 'atc' as const } }] }
    expect(match(p, { kind: 'turn', seat: 0, local: true }, 'x01')).toBeNull()
    expect(match(p, { kind: 'turn', seat: 0, local: true }, 'atc')).not.toBeNull()
  })
})
```

`patch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, patchFor, type Rule } from './index.js'

const turn = DEFAULT_PROFILE.rules[0] // seat colour, solid, 255
const lime = [198, 242, 78]
const offWhite = [239, 238, 230]

describe('patchFor', () => {
  it('whole strip: one segment over every LED, the rest removed', () => {
    const s = patchFor(turn, { kind: 'turn', seat: 0, local: true }, { leds: 120, segmentMode: 'whole', segments: 1 }, { seatCount: 2 })
    expect(s.bri).toBe(255)
    expect(s.seg[0]).toEqual({ id: 0, start: 0, stop: 120, on: true, bri: 255, col: [lime], fx: 0, sx: 128 })
    expect(s.seg.slice(1)).toEqual(Array.from({ length: 15 }, (_, i) => ({ id: i + 1, stop: 0 })))
  })
  it('one per seat: equal parts, remainder to the last, others dimmed in their own colour', () => {
    const s = patchFor(turn, { kind: 'turn', seat: 1, local: true }, { leds: 145, segmentMode: 'perSeat', segments: 1 }, { seatCount: 4 })
    expect(s.seg.slice(0, 4).map(g => [g.start, g.stop])).toEqual([[0, 36], [36, 72], [72, 108], [108, 145]])
    expect(s.seg[1]).toMatchObject({ bri: 255, col: [offWhite] })
    expect(s.seg[0]).toMatchObject({ bri: 38, col: [lime], fx: 0 })
    expect(s.seg[4]).toEqual({ id: 4, stop: 0 })
  })
  it('one per seat with a seatless trigger lights every part with the look', () => {
    const takeout = DEFAULT_PROFILE.rules.find(r => r.when.trigger === 'takeout.started') as Rule
    const s = patchFor(takeout, { kind: 'takeout.started', local: true }, { leds: 60, segmentMode: 'perSeat', segments: 1 }, { seatCount: 2 })
    expect(s.seg.slice(0, 2).every(g => g.bri === 255 && g.col?.[0].join() === '255,255,255')).toBe(true)
  })
  it('WLED segments: seat i is segment i, no layout changes, extra seats skipped', () => {
    const s = patchFor(turn, { kind: 'turn', seat: 0, local: true }, { leds: 60, segmentMode: 'wled', segments: 2 }, { seatCount: 3 })
    expect(s.seg).toHaveLength(2)
    expect(s.seg.every(g => g.start === undefined && g.stop === undefined)).toBe(true)
  })
  it('team colour is the team’s first seat', () => {
    const r: Rule = { ...turn, look: { ...turn.look, color: 'team' } }
    const s = patchFor(r, { kind: 'turn', seat: 3, local: true }, { leds: 10, segmentMode: 'whole', segments: 1 }, { seatCount: 4, teams: [[0, 2], [1, 3]] })
    expect(s.seg[0].col).toEqual([offWhite])
  })
  it('seat colours cycle after four', () => {
    const s = patchFor(turn, { kind: 'turn', seat: 4, local: true }, { leds: 10, segmentMode: 'whole', segments: 1 }, { seatCount: 6 })
    expect(s.seg[0].col).toEqual([lime])
  })
  it('a strip with fewer LEDs than seats still gets valid segments', () => {
    const s = patchFor(turn, { kind: 'turn', seat: 0, local: true }, { leds: 3, segmentMode: 'perSeat', segments: 1 }, { seatCount: 4 })
    for (const g of s.seg.slice(0, 4)) expect(g.stop! >= g.start!).toBe(true)
    expect(s.seg[3].stop).toBe(3)
  })
})
```

- [ ] **Step 2: Run.** `cd backend && npx vitest run src/shared/lights` → FAIL (cannot find module).

- [ ] **Step 3: Implement `types.ts`** with exactly the types in **Interfaces** above (everything except the constants and functions).

- [ ] **Step 4: Implement `profile.ts`.**

```ts
import type { BoardTrigger, GameId, Profile, Rule } from './types.js'

/** The seats' colours, from the design tokens; seat 5 on wraps around. */
export const SEAT_COLORS: readonly string[] = ['#c6f24e', '#efeee6', '#ff9b45', '#5ad1e6']
export const seatColor = (seat: number): string => SEAT_COLORS[((seat % SEAT_COLORS.length) + SEAT_COLORS.length) % SEAT_COLORS.length]

// WLED effect ids
const SOLID = 0, BLINK = 1, BREATHE = 2, RAINBOW = 9, SPARKLE = 20, FIREWORKS = 42
const RED = '#ff3b30'

const flash = (trigger: Rule['when']['trigger'], look: Rule['look'], holdMs: number, extra: Partial<Rule['when']> = {}): Rule => ({
  when: { trigger, seats: 'mine', ...extra },
  type: 'flash',
  look,
  holdMs,
})

/** The built-in profile. The first matching rule wins, so specific rules come first. */
export const DEFAULT_PROFILE: Profile = {
  id: 'default',
  name: 'Dartcade default',
  rules: [
    { when: { trigger: 'turn', seats: 'mine' }, type: 'scene', look: { color: 'seat', fx: SOLID, bri: 255 } },
    { when: { trigger: 'turn', seats: 'other' }, type: 'scene', look: { color: '#ffffff', fx: SOLID, bri: 40 } },
    flash('visit', { color: 'seat', fx: FIREWORKS, bri: 255 }, 4000, { total: { op: '=', n: 180 } }),
    flash('visit', { color: 'seat', fx: BREATHE, bri: 255 }, 2000, { total: { op: '>=', n: 100 } }),
    flash('bust', { color: RED, fx: BLINK, bri: 255 }, 1500),
    flash('checkout', { color: 'seat', fx: SPARKLE, bri: 255 }, 3000),
    flash('game.won', { color: 'seat', fx: RAINBOW, bri: 255 }, 5000),
    flash('atc.hit', { color: 'seat', fx: SOLID, bri: 255 }, 600),
    flash('hilo.lifeLost', { color: RED, fx: BLINK, bri: 255 }, 1500),
    flash('golf.sunk', { color: 'seat', fx: SPARKLE, bri: 255 }, 2000),
    flash('bulloff.won', { color: 'seat', fx: BLINK, bri: 255 }, 2000),
    { when: { trigger: 'takeout.started', seats: 'any' }, type: 'scene', look: { color: '#ffffff', fx: SOLID, bri: 255 } },
    { when: { trigger: 'idle', seats: 'any' }, type: 'scene', look: { color: '#c6f24e', fx: BREATHE, bri: 60, speed: 40 } },
  ],
}

const seatsFit = (seats: Rule['when']['seats'], local: boolean) => seats === 'any' || (seats === 'mine') === local

const totalFits = (total: Rule['when']['total'], t: BoardTrigger) =>
  total === undefined || (t.kind === 'visit' && (total.op === '=' ? t.total === total.n : t.total >= total.n))

/** The first rule of the profile that fits the trigger, or null. */
export function match(profile: Profile, t: BoardTrigger, game: GameId | null): Rule | null {
  return (
    profile.rules.find(
      r => r.when.trigger === t.kind && seatsFit(r.when.seats, t.local) && totalFits(r.when.total, t) && (r.when.game === undefined || r.when.game === game),
    ) ?? null
  )
}
```

- [ ] **Step 5: Implement `patch.ts`.**

```ts
import { seatColor } from './profile.js'
import type { BoardTrigger, LightDevice, Rule, SeatLayout, WledSeg, WledState } from './types.js'

// Segments cleared after the ones a whole/perSeat layout uses, so an older layout doesn't linger
const MAX_SEGMENTS = 16
const DIM = 38 // 15%: the other seats' parts in "one per seat"
const DEFAULT_SPEED = 128

const rgb = (hex: string): number[] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const seatOf = (t: BoardTrigger): number | null => ('seat' in t ? t.seat : null)

function lookColor(rule: Rule, seat: number | null, layout: SeatLayout): string {
  const c = rule.look.color
  if (c === 'seat') return seatColor(seat ?? 0)
  if (c === 'team') {
    const team = layout.teams?.find(ts => seat !== null && ts.includes(seat))
    return seatColor(team?.[0] ?? seat ?? 0)
  }
  return c
}

/** The WLED state that shows `rule` for trigger `t` on one device. */
export function patchFor(rule: Rule, t: BoardTrigger, device: LightDevice, layout: SeatLayout): WledState {
  const seat = seatOf(t)
  const look = { on: true, bri: 255, col: [rgb(lookColor(rule, seat, layout))], fx: rule.look.fx, sx: rule.look.speed ?? DEFAULT_SPEED }
  const part = (i: number) => (seat === null || i === seat ? look : { on: true, bri: DIM, col: [rgb(seatColor(i))], fx: 0, sx: DEFAULT_SPEED })
  const clear = (from: number): WledSeg[] => Array.from({ length: MAX_SEGMENTS - from }, (_, k) => ({ id: from + k, stop: 0 }))

  if (device.segmentMode === 'whole') {
    return { on: true, bri: rule.look.bri, seg: [{ id: 0, start: 0, stop: device.leds, ...look }, ...clear(1)] }
  }
  const n = Math.max(1, layout.seatCount)
  if (device.segmentMode === 'perSeat') {
    const size = Math.floor(device.leds / n)
    const seg: WledSeg[] = Array.from({ length: n }, (_, i) => ({
      id: i,
      start: Math.min(i * size, device.leds),
      stop: i === n - 1 ? device.leds : (i + 1) * size,
      ...part(i),
    }))
    return { on: true, bri: rule.look.bri, seg: [...seg, ...clear(n)] }
  }
  const count = Math.min(n, device.segments)
  return { on: true, bri: rule.look.bri, seg: Array.from({ length: count }, (_, i) => ({ id: i, ...part(i) })) }
}
```

Check that the patch test's 4-LED case holds: with `leds` 3 and 4 seats, `size` is 0, so segments are `[0,0],[0,0],[0,0],[0,3]`. Every `stop >= start`, and the last segment ends at 3.

- [ ] **Step 6: `index.ts`** re-exports `./types.js`, `./profile.js`, `./patch.js`.

- [ ] **Step 7: Run.** `cd backend && npx vitest run src/shared/lights && npm run typecheck` → PASS. Check that `$shared` resolves in the frontend: `cd backend/frontend && npm run typecheck`.

- [ ] **Step 8: Commit.**

```bash
git add backend/src/shared/lights
git commit -m "feat(lights): add light rules, the default profile and wled patches"
```

---

### Task 7: Triggers per game

**Files:**

- Create: `backend/src/lights/triggers/index.ts`, `common.ts`, `x01.ts`, `atc.ts`, `hilo.ts`, `minigolf.ts`
- Test: `backend/src/lights/triggers/triggers.test.ts`

**Interfaces:**

- Consumes: `Trigger`, `GameId` (Task 6); `Snapshot` from `backend/src/schema/game-ws.ts` (the snapshot `game` includes the engine fields `currentVisitDarts`, `totalVisits`, `totalDarts`).
- Produces: `export function triggersFor(before: Snapshot | null, after: Snapshot): Trigger[]`. `before` is null when the game is new to the service. The game id comes from `after.gameId`.

Detection rules (each game's views, verified in research):

- **common** (every game): `game.won` when `before.game.winner === null && after.game.winner !== null`. `turn` when there's no winner and (`before` is null, or `currentPlayer` changed, or `phase` left `'bulloff'`). `bulloff.won` when `before.game.phase === 'bulloff' && after.game.phase !== 'bulloff'`, with seat = `after.game.currentPlayer` (the bull-off winner throws first).
- **x01:** mirrors `callsFor` in `backend/frontend/src/lib/caller/calls.ts`. Only while `before.phase === 'game'`. `visitOver(locked, darts) = locked || darts >= 3`. If the visit wasn't over before, the player didn't change, and it's over now, emit `bust` when `bustThisVisit`, else `checkout` when `scores[cp] === 0`, else `visit` with total `visitStartScores[cp] - scores[cp]`. If it wasn't over and the visit was committed (`sum(totalVisits)` grew, an early takeout), emit `visit` with total from `before`. If the visit was already over before, emit nothing: this covers corrections and reopened visits.
- **atc:** `atc.hit` (seat `cp`, target `before.targets[cp]`) when the player didn't change and `after.currentVisitHits` has more `true` than `before`.
- **hilo:** `hilo.lifeLost` for each seat whose `seats[i].lives` dropped.
- **minigolf:** `golf.sunk` for each seat whose `balls[i].status` became `'holed'` on the same `holeIdx` (strokes from `after.balls[i].strokes`).

Order: game-specific flashes first, then `game.won`, `bulloff.won`, `turn`.

- [ ] **Step 1: Write the failing tests.** Build snapshots from small factories so each case shows only the fields that matter. Cast with `as unknown as Snapshot`, so the factories don't have to fill in every field.

```ts
import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../schema/game-ws.js'
import { triggersFor } from './index.js'

type G = Record<string, unknown>
const snap = (gameId: string, game: G): Snapshot => ({ gameId, game }) as unknown as Snapshot

const x01 = (g: G = {}) =>
  snap('x01', {
    phase: 'game', currentPlayer: 0, winner: null, scores: [501, 501], visitStartScores: [501, 501],
    bustThisVisit: false, visitLocked: false, currentVisitDarts: [], totalVisits: [0, 0], legs: [0, 0], firstTo: 1,
    ...g,
  })

describe('common triggers', () => {
  it('a new game lights the first seat', () => {
    expect(triggersFor(null, x01())).toEqual([{ kind: 'turn', seat: 0 }])
  })
  it('a seat change is a turn', () => {
    expect(triggersFor(x01(), x01({ currentPlayer: 1 }))).toEqual([{ kind: 'turn', seat: 1 }])
  })
  it('a win is game.won and no turn', () => {
    expect(triggersFor(x01({ currentPlayer: 0 }), x01({ currentPlayer: 1, winner: 0, phase: 'finished' }))).toEqual([{ kind: 'game.won', seat: 0 }])
  })
  it('the end of a bull off is bulloff.won for the first thrower, then their turn', () => {
    const b = x01({ phase: 'bulloff', currentPlayer: 1 })
    expect(triggersFor(b, x01({ currentPlayer: 1 }))).toEqual([{ kind: 'bulloff.won', seat: 1 }, { kind: 'turn', seat: 1 }])
  })
  it('nothing changed, nothing fires (board presence pushes)', () => {
    expect(triggersFor(x01(), x01())).toEqual([])
  })
})

describe('x01', () => {
  const darts = (n: number) => Array.from({ length: n }, () => ({}))
  it('the third dart of a 180', () => {
    const before = x01({ currentVisitDarts: darts(2), scores: [381, 501] })
    const after = x01({ currentVisitDarts: darts(3), scores: [321, 501] })
    expect(triggersFor(before, after)).toEqual([{ kind: 'visit', seat: 0, total: 180 }])
  })
  it('a bust', () => {
    const before = x01({ currentVisitDarts: darts(1), scores: [30, 501], visitStartScores: [40, 501] })
    const after = x01({ currentVisitDarts: darts(2), scores: [40, 501], visitStartScores: [40, 501], bustThisVisit: true, visitLocked: true })
    expect(triggersFor(before, after)).toEqual([{ kind: 'bust', seat: 0 }])
  })
  it('a checkout', () => {
    const before = x01({ currentVisitDarts: darts(1), scores: [40, 501], visitStartScores: [40, 501] })
    const after = x01({ currentVisitDarts: darts(2), scores: [0, 501], visitStartScores: [40, 501], visitLocked: true })
    expect(triggersFor(before, after)).toEqual([{ kind: 'checkout', seat: 0 }])
  })
  it('committing an already-over visit fires nothing more (the turn is the next seat)', () => {
    const before = x01({ currentVisitDarts: darts(3), scores: [321, 501] })
    const after = x01({ currentPlayer: 1, currentVisitDarts: [], scores: [321, 501], totalVisits: [1, 0] })
    expect(triggersFor(before, after)).toEqual([{ kind: 'turn', seat: 1 }])
  })
  it('an early takeout commits the visit with its total', () => {
    const before = x01({ currentVisitDarts: darts(2), scores: [401, 501] })
    const after = x01({ currentPlayer: 1, currentVisitDarts: [], scores: [401, 501], visitStartScores: [401, 501], totalVisits: [1, 0] })
    expect(triggersFor(before, after)).toEqual([{ kind: 'visit', seat: 0, total: 100 }, { kind: 'turn', seat: 1 }])
  })
  it('a correction to a visit that was already over does not flash again', () => {
    const before = x01({ currentVisitDarts: darts(3), scores: [321, 501] })
    const after = x01({ currentVisitDarts: darts(3), scores: [341, 501] })
    expect(triggersFor(before, after)).toEqual([])
  })
  it('a reopened visit committed again does not flash again', () => {
    const reopened = x01({ currentVisitDarts: darts(3), scores: [321, 501], totalVisits: [0, 0] })
    const recommitted = x01({ currentPlayer: 1, currentVisitDarts: [], scores: [321, 501], totalVisits: [1, 0] })
    expect(triggersFor(reopened, recommitted)).toEqual([{ kind: 'turn', seat: 1 }])
  })
})

describe('other games', () => {
  it('atc: a hit on the current target', () => {
    const g = (hits: boolean[], target: number) => snap('atc', { currentPlayer: 0, winner: null, targets: [target, 1], currentVisitHits: hits })
    expect(triggersFor(g([false], 3), g([false, true], 4))).toEqual([{ kind: 'atc.hit', seat: 0, target: 3 }])
  })
  it('hilo: a life lost', () => {
    const g = (lives: number) => snap('hilo', { phase: 'game', currentPlayer: 0, winner: null, seats: [{ lives }, { lives: 3 }] })
    expect(triggersFor(g(3), g(2))).toEqual([{ kind: 'hilo.lifeLost', seat: 0 }])
  })
  it('minigolf: a ball sunk', () => {
    const g = (status: string, strokes: number) =>
      snap('minigolf', { currentPlayer: 0, winner: null, holeIdx: 2, balls: [{ status, strokes }, { status: 'waiting', strokes: 0 }] })
    expect(triggersFor(g('playing', 2), g('holed', 3))).toEqual([{ kind: 'golf.sunk', seat: 0, strokes: 3 }])
  })
  it('minigolf: a new hole resetting the balls is not a sink', () => {
    const a = snap('minigolf', { currentPlayer: 1, winner: null, holeIdx: 2, balls: [{ status: 'done', strokes: 3 }, { status: 'playing', strokes: 1 }] })
    const b = snap('minigolf', { currentPlayer: 1, winner: null, holeIdx: 3, balls: [{ status: 'holed', strokes: 0 }, { status: 'playing', strokes: 0 }] })
    expect(triggersFor(a, b).filter(t => t.kind === 'golf.sunk')).toEqual([])
  })
})
```

- [ ] **Step 2: Run.** `cd backend && npx vitest run src/lights/triggers` → FAIL.

- [ ] **Step 3: Implement.** `common.ts`:

```ts
import type { Trigger } from '../../shared/lights/index.js'

type Common = { currentPlayer: number; winner: number | null; phase?: string }

/** Turn, win and bull-off triggers, the same in every game. */
export function commonTriggers(before: Common | null, after: Common): Trigger[] {
  if (after.winner !== null) return before === null || before.winner === null ? [{ kind: 'game.won', seat: after.winner }] : []
  const out: Trigger[] = []
  const leftBullOff = before?.phase === 'bulloff' && after.phase !== 'bulloff'
  if (leftBullOff) out.push({ kind: 'bulloff.won', seat: after.currentPlayer })
  if (before === null || before.currentPlayer !== after.currentPlayer || leftBullOff) out.push({ kind: 'turn', seat: after.currentPlayer })
  return out
}
```

`x01.ts`:

```ts
import type { X01Game } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

type V = Pick<X01Game, 'phase' | 'currentPlayer' | 'scores' | 'visitStartScores' | 'bustThisVisit' | 'visitLocked' | 'currentVisitDarts' | 'totalVisits'>

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const visitOver = (locked: boolean, darts: number) => locked || darts >= 3
const total = (g: V) => (g.visitStartScores[g.currentPlayer] ?? 0) - g.scores[g.currentPlayer]

// Mirrors the caller (lib/caller/calls.ts): a visit lights once, when it's over
export function x01Triggers(before: V | null, after: V): Trigger[] {
  if (before === null || before.phase !== 'game') return []
  if (visitOver(before.visitLocked, before.currentVisitDarts.length)) return []
  const seat = before.currentPlayer
  if (after.currentPlayer === seat && visitOver(after.visitLocked, after.currentVisitDarts.length)) {
    if (after.bustThisVisit) return [{ kind: 'bust', seat }]
    if (after.visitLocked && after.scores[seat] === 0) return [{ kind: 'checkout', seat }]
    return [{ kind: 'visit', seat, total: total(after) }]
  }
  if (sum(after.totalVisits) > sum(before.totalVisits)) return [{ kind: 'visit', seat, total: total(before) }]
  return []
}
```

`atc.ts`:

```ts
import type { AtcGame } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

type V = Pick<AtcGame, 'currentPlayer' | 'targets' | 'currentVisitHits'>
const hits = (g: V) => g.currentVisitHits.filter(Boolean).length

export function atcTriggers(before: V | null, after: V): Trigger[] {
  if (before === null || before.currentPlayer !== after.currentPlayer || hits(after) <= hits(before)) return []
  return [{ kind: 'atc.hit', seat: after.currentPlayer, target: before.targets[before.currentPlayer] }]
}
```

`hilo.ts`:

```ts
import type { HiloGame } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

type V = Pick<HiloGame, 'seats'>

export function hiloTriggers(before: V | null, after: V): Trigger[] {
  if (before === null) return []
  return after.seats.flatMap((s, seat) => (s.lives < (before.seats[seat]?.lives ?? s.lives) ? [{ kind: 'hilo.lifeLost' as const, seat }] : []))
}
```

`minigolf.ts`:

```ts
import type { MinigolfGame } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

type V = Pick<MinigolfGame, 'holeIdx' | 'balls'>

export function minigolfTriggers(before: V | null, after: V): Trigger[] {
  if (before === null || before.holeIdx !== after.holeIdx) return []
  return after.balls.flatMap((b, seat) =>
    b.status === 'holed' && before.balls[seat]?.status !== 'holed' ? [{ kind: 'golf.sunk' as const, seat, strokes: b.strokes }] : [],
  )
}
```

`index.ts`:

```ts
import type { Snapshot } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'
import { atcTriggers } from './atc.js'
import { commonTriggers } from './common.js'
import { hiloTriggers } from './hilo.js'
import { minigolfTriggers } from './minigolf.js'
import { x01Triggers } from './x01.js'

/** What the lights react to between two snapshots of one game; `before` null: the game is new here. */
export function triggersFor(before: Snapshot | null, after: Snapshot): Trigger[] {
  const prev = before?.gameId === after.gameId ? before : null
  return [...gameTriggers(prev, after), ...commonTriggers(prev?.game ?? null, after.game)]
}

function gameTriggers(before: Snapshot | null, after: Snapshot): Trigger[] {
  switch (after.gameId) {
    case 'x01':
      return x01Triggers(before?.gameId === 'x01' ? before.game : null, after.game)
    case 'atc':
      return atcTriggers(before?.gameId === 'atc' ? before.game : null, after.game)
    case 'hilo':
      return hiloTriggers(before?.gameId === 'hilo' ? before.game : null, after.game)
    case 'minigolf':
      return minigolfTriggers(before?.gameId === 'minigolf' ? before.game : null, after.game)
    case 'p121':
      return []
  }
}
```

If `Snapshot` doesn't discriminate on `gameId` (check `game-ws.ts`'s `X01Snapshot`), narrow with `after.game as X01Game` per case, the way `getSnapshot` does. The `switch` must stay exhaustive, so a new game id is a type error. If minigolf's `balls` can be null between holes, guard with `after.balls ?? []`.

- [ ] **Step 4: Run.** `cd backend && npx vitest run src/lights/triggers && npm run typecheck` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/lights/triggers
git commit -m "feat(backend): derive light triggers from game snapshots"
```

---

### Task 8: Storage: `wled_devices` and `boards.lights_enabled`

**Files:**

- Create: `backend/src/db/migrations/025_wled_lights.sql`
- Modify: `backend/src/db/schema.ts` (`BoardsTable` at :26, `interface Database` at :271)
- Create: `backend/src/db/lights.ts`
- Test: `backend/src/db/lights.test.ts`

**Interfaces:**

- Consumes: `SegmentMode` (Task 6).
- Produces:

```ts
export type WledDeviceRow = { id: string; board_id: string; mac: string; name: string; host: string; leds: number; version: string; segments: number; segment_mode: SegmentMode; max_bri: number; created_at: Date }
export type NewWledDevice = Omit<WledDeviceRow, 'id' | 'created_at'>
export function listWledDevices(db: Kysely<Database>, boardId: string): Promise<WledDeviceRow[]>
export function insertWledDevice(db: Kysely<Database>, d: NewWledDevice): Promise<WledDeviceRow> // throws on duplicate (board_id, mac)
export function updateWledDevice(db: Kysely<Database>, boardId: string, id: string, patch: Partial<Pick<WledDeviceRow, 'name' | 'segment_mode' | 'max_bri'>>): Promise<WledDeviceRow | undefined>
export function deleteWledDevice(db: Kysely<Database>, boardId: string, id: string): Promise<boolean>
export function rehostWledDevices(db: Kysely<Database>, boardId: string, found: { mac: string; host: string; version: string; leds: number; segments: number }[]): Promise<boolean> // true if any row changed
export function getLightsEnabled(db: Kysely<Database>, boardId: string): Promise<boolean>
export function setLightsEnabled(db: Kysely<Database>, boardId: string, enabled: boolean): Promise<void>
```

The spec's column list leaves out `segments` (the device's WLED segment count). Add it: `patchFor`'s `wled` mode needs it. It's refreshed from `wled.found`.

- [ ] **Step 1: Migration.**

```sql
-- WLED devices paired to a board, and the board's lights master switch (#135)
CREATE TABLE wled_devices (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  mac TEXT NOT NULL,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  leds INTEGER NOT NULL CHECK (leds >= 0),
  version TEXT NOT NULL,
  segments INTEGER NOT NULL DEFAULT 1 CHECK (segments >= 0),
  segment_mode TEXT NOT NULL CHECK (segment_mode IN ('whole', 'perSeat', 'wled')),
  max_bri INTEGER NOT NULL DEFAULT 178 CHECK (max_bri BETWEEN 1 AND 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_id, mac)
);
ALTER TABLE boards ADD COLUMN lights_enabled BOOLEAN NOT NULL DEFAULT true;
```

Check `boards.id`'s type in an earlier migration (`grep -n "CREATE TABLE boards" -A5 backend/src/db/migrations/*.sql`) and match it (TEXT vs UUID).

- [ ] **Step 2: `schema.ts`.** Add `lights_enabled: ColumnType<boolean, boolean | undefined, boolean>` to `BoardsTable`. Add a `WledDevicesTable` with `created_at: ColumnType<Date, never, never>`, `segments`/`max_bri` as `ColumnType<number, number | undefined, number>`, and `segment_mode: SegmentMode`. Register `wled_devices: WledDevicesTable` in `Database`.

- [ ] **Step 3: Write the failing DB test** (`lights.test.ts`), following `db/preferences.test.ts`:

```ts
import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { deleteWledDevice, getLightsEnabled, insertWledDevice, listWledDevices, rehostWledDevices, setLightsEnabled, updateWledDevice } from './lights.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('wled lights', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const dev = { board_id: 'b1', mac: 'aa', name: 'Ring', host: '192.168.1.48', leds: 120, version: '0.15.0', segments: 1, segment_mode: 'whole' as const, max_bri: 178 }

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('lights_db_test'))
    // insert user u1 and board b1 the way preferences.test.ts / queries.test.ts insert fixtures
  })
  afterAll(async () => { await close() })

  it('stores, lists, updates and deletes a device', async () => {
    const row = await insertWledDevice(db, dev)
    expect((await listWledDevices(db, 'b1')).map(d => d.id)).toEqual([row.id])
    expect((await updateWledDevice(db, 'b1', row.id, { max_bri: 100 }))?.max_bri).toBe(100)
    expect(await updateWledDevice(db, 'other', row.id, { max_bri: 1 })).toBeUndefined()
    expect(await deleteWledDevice(db, 'b1', row.id)).toBe(true)
    expect(await listWledDevices(db, 'b1')).toEqual([])
  })
  it('refuses the same MAC twice on a board', async () => {
    await insertWledDevice(db, { ...dev, mac: 'dup' })
    await expect(insertWledDevice(db, { ...dev, mac: 'dup' })).rejects.toThrow()
  })
  it('follows a device to its new host', async () => {
    await insertWledDevice(db, { ...dev, mac: 'mv' })
    expect(await rehostWledDevices(db, 'b1', [{ mac: 'mv', host: '192.168.1.99', version: '0.15.1', leds: 120, segments: 2 }])).toBe(true)
    expect((await listWledDevices(db, 'b1')).find(d => d.mac === 'mv')).toMatchObject({ host: '192.168.1.99', version: '0.15.1', segments: 2 })
    expect(await rehostWledDevices(db, 'b1', [{ mac: 'mv', host: '192.168.1.99', version: '0.15.1', leds: 120, segments: 2 }])).toBe(false)
  })
  it('lights are on by default and can be turned off', async () => {
    expect(await getLightsEnabled(db, 'b1')).toBe(true)
    await setLightsEnabled(db, 'b1', false)
    expect(await getLightsEnabled(db, 'b1')).toBe(false)
  })
  it('deleting the board deletes its devices', async () => {
    await db.deleteFrom('boards').where('id', '=', 'b1').execute()
    expect(await listWledDevices(db, 'b1')).toEqual([])
  })
})
```

Fill in the fixture insert in `beforeAll` exactly as `db/queries.test.ts` creates a user and a board; copy those lines.

- [ ] **Step 4: Run.** `cd backend && TEST_DATABASE_URL=… npx vitest run src/db/lights` → FAIL. See `DEVELOPMENT.md` for the URL.

- [ ] **Step 5: Implement `db/lights.ts`.** Use free functions with Kysely, ids from `ulid()` (use whatever id helper `insertBoard` uses; grep `db/queries.ts`). `rehostWledDevices` loops over the found entries and runs `update ... where board_id and mac and (host <> new or version <> new or leds <> new or segments <> new)`. It returns whether any `numUpdatedRows > 0n`.

- [ ] **Step 6: Run** the DB test → PASS. Also run `npm run typecheck`, and in CI style `npx tsx src/db/checkMigrations.ts` (or the npm script that wraps it; grep `package.json`).

- [ ] **Step 7: Commit.**

```bash
git add backend/src/db
git commit -m "feat(backend): store wled devices per board"
```

---

### Task 9: Bridge gateway: lights telemetry, hello hook, in-memory store

**Files:**

- Create: `backend/src/lights/store.ts`, `backend/src/lights/version.ts`
- Modify: `backend/src/bridge-gw/handler.ts` (route `wled.found`/`wled.status` next to `camera.still` at :207; call `opts.onBridgeHello` after the hello at :198; call `opts.onBoardEvent` after `recordEvent` at :251; call `opts.onBridgeGone` in `onceGone` at :269)
- Modify: `backend/src/bridge-gw/connections.ts` (add `send(boardDbId, msg): boolean`)
- Test: `backend/src/lights/store.test.ts`, `backend/src/lights/version.test.ts`, `backend/src/bridge-gw/handler.test.ts`

**Interfaces:**

- Produces:

```ts
// lights/store.ts
export type FoundDevice = { mac: string; host: string; name: string; leds: number; version: string; segments: number }
export type DeviceStatus = { reachable: boolean; error?: string; since: Date }
export class LightsStore {
  setFound(boardId: string, devices: FoundDevice[], scannedAt: Date): void   // replaces the scan list (merges probe results, see below)
  addProbe(boardId: string, host: string, device: FoundDevice | null, error?: string): void
  found(boardId: string): { devices: FoundDevice[]; scannedAt: Date | null; probe: { host: string; error?: string } | null }
  setStatus(boardId: string, deviceId: string, s: { reachable: boolean; error?: string }): void
  status(boardId: string, deviceId: string): DeviceStatus | null
  clear(boardId: string): void
}
export const lightsStore: LightsStore
// lights/version.ts
export function supportsLights(bridgeVersion: string | null | undefined): boolean // dev… or semver >= 0.4.0
// connections.ts
send(boardDbId: string, msg: object): boolean // false when offline or hello not received
// handler.ts Opts gains:
onBridgeHello?: (boardId: string) => void
onBridgeGone?: (boardId: string) => void
onBoardEvent?: (boardId: string, kind: string) => void
onLightsFound?: (boardId: string, devices: FoundDevice[]) => void // after the store is updated
```

- [ ] **Step 1: Write the failing tests.**

`version.test.ts`:

```ts
import { expect, it } from 'vitest'
import { supportsLights } from './version.js'

it.each([
  ['0.4.0', true], ['0.4.1', true], ['1.0.0', true], ['v0.4.0', true], ['dev', true], ['dev+abc123-dirty', true],
  ['0.3.1', false], ['0.3.9', false], [null, false], [undefined, false], ['', false], ['garbage', false],
])('supportsLights(%s) = %s', (v, want) => {
  expect(supportsLights(v)).toBe(want)
})
```

`store.test.ts`:

```ts
import { expect, it } from 'vitest'
import { LightsStore } from './store.js'

const d = (mac: string, host = '192.168.1.80') => ({ mac, host, name: 'WLED', leds: 144, version: '0.15.0', segments: 1 })

it('a scan replaces the list; a probe adds to it until the next scan', () => {
  const s = new LightsStore()
  s.setFound('b', [d('aa')], new Date(1))
  s.addProbe('b', '192.168.1.90', d('bb', '192.168.1.90'))
  expect(s.found('b').devices.map(x => x.mac)).toEqual(['aa', 'bb'])
  s.setFound('b', [d('cc')], new Date(2))
  expect(s.found('b').devices.map(x => x.mac)).toEqual(['cc'])
})
it('a failed probe is remembered for the page', () => {
  const s = new LightsStore()
  s.addProbe('b', '192.168.1.90', null, 'not a WLED device')
  expect(s.found('b').probe).toEqual({ host: '192.168.1.90', error: 'not a WLED device' })
})
it('status keeps when it last changed', () => {
  const s = new LightsStore()
  s.setStatus('b', 'd1', { reachable: false, error: 'timeout' })
  const since = s.status('b', 'd1')!.since
  s.setStatus('b', 'd1', { reachable: false, error: 'timeout' })
  expect(s.status('b', 'd1')!.since).toBe(since)
})
```

In `handler.test.ts`, follow its existing fake-socket setup (read the file first). Add:

- After hello, `onBridgeHello` is called with the board id.
- A `{"kind":"wled.found","data":{devices:[…], scanned_at}}` message lands in an injected `LightsStore` and calls `onLightsFound`. It's not stored in `bridge_events` and gets no ack.
- A `{"kind":"wled.found","data":{"probe_host":"x", "probe_error":"e", devices:[], scanned_at}}` message records a failed probe.
- An invalid `wled.found` payload is dropped silently.
- A `takeout.started` event calls `onBoardEvent(boardId, 'takeout.started')` after the engine call.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `version.ts`.**

```ts
const MIN = [0, 4, 0]

/** Bridges from 0.4.0 run wled messages; dev builds always do. */
export function supportsLights(v: string | null | undefined): boolean {
  if (!v) return false
  if (v.startsWith('dev')) return true
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v)
  if (!m) return false
  const parts = m.slice(1).map(Number)
  for (let i = 0; i < 3; i++) if (parts[i] !== MIN[i]) return parts[i] > MIN[i]
  return true
}
```

- [ ] **Step 4: Implement `store.ts`.** Use a `Map<boardId, {scan: FoundDevice[]; probes: FoundDevice[]; scannedAt; probe}>` and a `Map<\`${boardId}/${deviceId}\`, DeviceStatus>`. `found().devices`lists scan entries first, then probes whose MAC isn't in the scan.`setStatus`keeps`since`when`reachable`and`error`are unchanged. Export the`lightsStore`singleton, like`cameraStills`.

- [ ] **Step 5: `connections.ts` `send`.**

```ts
/** Sends a JSON message to the board's bridge; false when it's not connected (or hasn't said hello). */
send(boardDbId: string, msg: object): boolean {
  const conn = this.byBoard.get(boardDbId)
  if (!conn?.helloReceived || conn.ws.readyState !== conn.ws.OPEN) return false
  conn.ws.send(JSON.stringify(msg))
  return true
}
```

- [ ] **Step 6: Route in `handler.ts`.** Add `lights?: LightsStore` to `Opts` (default `lightsStore`) along with the callbacks above. After the camera branch:

```ts
const kind = MessageKindSchema.safeParse(parsed).data?.kind
if (kind === 'wled.found') {
  const m = WledFoundMessageSchema.safeParse(parsed)
  if (m.success) {
    const { devices, scanned_at, probe_host, probe_error } = m.data.data
    if (probe_host !== undefined) lights.addProbe(boardDbId, probe_host, devices[0] ?? null, probe_error)
    else lights.setFound(boardDbId, devices, new Date(scanned_at))
    opts.onLightsFound?.(boardDbId, devices)
  }
  return
}
if (kind === 'wled.status') {
  const m = WledStatusMessageSchema.safeParse(parsed)
  if (m.success) lights.setStatus(boardDbId, m.data.data.device_id, { reachable: m.data.data.reachable, error: m.data.data.error })
  return
}
```

Reuse the camera branch's existing `MessageKindSchema` parse rather than parsing twice. After `conn.bmUrl = hello.bmUrl`, call `opts.onBridgeHello?.(boardDbId)`. After `engine.onBridgeEvent` (inside the try, after the await), call `opts.onBoardEvent?.(boardDbId, kind)`. In `onceGone`, call `lights.clear(boardDbId)` and `opts.onBridgeGone?.(boardDbId)`.

- [ ] **Step 7: Run.** `cd backend && npx vitest run src/lights src/bridge-gw && npm run typecheck` → PASS.

- [ ] **Step 8: Commit.**

```bash
git add backend/src/lights/store.ts backend/src/lights/store.test.ts backend/src/lights/version.ts backend/src/lights/version.test.ts backend/src/bridge-gw
git commit -m "feat(backend): take wled reports from the bridge"
```

---

### Task 10: Lights service

**Files:**

- Create: `backend/src/lights/service.ts`
- Test: `backend/src/lights/service.test.ts`
- Modify: `backend/src/index.ts:51-68` (push callback, `ended`, `forgotten`), `backend/src/app.ts:124-153` (pass the service's hooks to `bridgeGwPlugin`)

**Interfaces:**

- Consumes: Tasks 6–9; `SessionEngine.getSession(id)`, `getSnapshot(id)`, `getSessionByBoard(boardId)`; `Session.seats[i].boardId`, `Session.boardId`.
- Produces:

```ts
export type LightsDeps = {
  send: (boardId: string, msg: object) => boolean
  bridgeVersion: (boardId: string) => string | null | undefined
  devices: (boardId: string) => Promise<WledDeviceRow[]>
  enabled: (boardId: string) => Promise<boolean>
  getSession: (sessionId: string) => { boardId: string | null; seats: { boardId: string | null }[] } | undefined
  getSnapshot: (sessionId: string) => Snapshot | undefined
  sessionOnBoard: (boardId: string) => string | null // the active session id on the board
  warn: (msg: string, details?: unknown) => void
}
export class LightsService {
  constructor(deps: LightsDeps)
  onPush(sessionId: string): Promise<void>
  onGameEnded(sessionId: string): Promise<void>    // boards go idle (after the win flash)
  onForgotten(sessionId: string): void
  onBoardEvent(boardId: string, kind: string): Promise<void>
  onBridgeHello(boardId: string): Promise<void>     // devices, then the current scene
  devicesChanged(boardId: string): Promise<void>     // same as hello; called by the API
  test(boardId: string, ruleIndex: number): Promise<boolean> // false: no such rule or bridge offline
}
```

Behaviour:

- `onPush`: `after = getSnapshot(id)` and `before = last.get(id) ?? null`. Store `after` as the new `last`. Then `triggersFor(before, after)`. Boards are `session.boardId` plus the distinct non-null `seats[].boardId`. For each board, `local(seat) = (session.seats[seat]?.boardId ?? session.boardId) === board`. Seatless triggers are always local. Each trigger goes through `fire`.
- `fire(board, t, game, layout)`: return if lights are off, the bridge is unsupported, or there are no devices. `rule = match(DEFAULT_PROFILE, t, game)`; return if null. For each device, `send(board, {kind:'wled.apply', data:{device_id, state: patchFor(rule, t, dev, layout), hold_ms: rule.type==='flash' ? rule.holdMs : undefined}})`. If the rule is a scene and the trigger isn't `takeout.started`, remember `scene.set(board, {t, game, layout})`.
- `onBoardEvent` with `takeout.started`: fire it. With `takeout.finished`: re-send the remembered scene, or idle if there is none.
- `onGameEnded`: for each of the session's boards, forget the scene and fire `idle`. The bridge holds an idle scene that arrives during the win flash as the base.
- Lights off: `onBridgeHello` sends nothing (a fresh bridge has an empty allowlist). `devicesChanged` with lights off sends `wled.apply {state: {on: false}}` to every device, then `wled.devices {devices: []}`, so the strip goes dark instead of keeping its last scene.
- `onBridgeHello`/`devicesChanged` with lights on: if the bridge is supported, send `{kind:'wled.devices', data:{devices:[{id, mac, host, max_bri}]}}`. Then re-send the remembered scene. If there is none and a session is active, re-derive it with `triggersFor(null, snapshot)` (the `turn`). Otherwise fire `idle`.
- `layout = {seatCount: session.seats.length || <number of scores/seats in the view>, teams: snapshot.gameId === 'x01' ? snapshot.game.teams?.map(t => t.seats) : undefined}`. If `session.seats` is empty for local games, use the view's `scores.length` (x01, minigolf `balls.length`, hilo `seats.length`, atc `targets.length`). Write a small `seatCount(snapshot)` helper with a `switch` on `gameId`.
- Every send is wrapped: a thrown error calls `warn` and never reaches the engine.

- [ ] **Step 1: Write the failing tests** with fakes for every dep:

```ts
import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../schema/game-ws.js'
import { LightsService, type LightsDeps } from './service.js'

type Sent = { board: string; msg: { kind: string; data: Record<string, unknown> } }

function setup(over: Partial<LightsDeps> = {}) {
  const sent: Sent[] = []
  const snaps = new Map<string, Snapshot>()
  const sessions = new Map<string, { boardId: string | null; seats: { boardId: string | null }[] }>()
  const dev = (id: string, board: string) => ({ id, board_id: board, mac: id, name: id, host: '192.168.1.2', leds: 60, version: '0.15.0', segments: 1, segment_mode: 'whole' as const, max_bri: 178, created_at: new Date() })
  const deps: LightsDeps = {
    send: (board, msg) => (sent.push({ board, msg: msg as Sent['msg'] }), true),
    bridgeVersion: () => '0.4.0',
    devices: async board => [dev(`dev-${board}`, board)],
    enabled: async () => true,
    getSession: id => sessions.get(id),
    getSnapshot: id => snaps.get(id),
    sessionOnBoard: () => null,
    warn: () => undefined,
    ...over,
  }
  return { svc: new LightsService(deps), sent, snaps, sessions }
}

const x01 = (g: Record<string, unknown>) =>
  ({ gameId: 'x01', game: { phase: 'game', currentPlayer: 0, winner: null, scores: [501, 501], visitStartScores: [501, 501], bustThisVisit: false, visitLocked: false, currentVisitDarts: [], totalVisits: [0, 0], ...g } }) as unknown as Snapshot
const applies = (sent: Sent[], board: string) => sent.filter(s => s.board === board && s.msg.kind === 'wled.apply').map(s => s.msg.data)

describe('LightsService', () => {
  it('a local game lights the board in the first seat’s colour', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    const [a] = applies(sent, 'b1')
    expect(a.device_id).toBe('dev-b1')
    expect(a.hold_ms).toBeUndefined()
    expect((a.state as { seg: { col: number[][] }[] }).seg[0].col).toEqual([[198, 242, 78]])
  })

  it('remote game: a bust flashes only the throwing board; the other board shows waiting', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: null, seats: [{ boardId: 'b1' }, { boardId: 'b2' }] })
    snaps.set('s', x01({ currentVisitDarts: [{}], scores: [30, 501], visitStartScores: [40, 501] }))
    await svc.onPush('s')
    sent.length = 0
    snaps.set('s', x01({ currentVisitDarts: [{}, {}], scores: [40, 501], visitStartScores: [40, 501], bustThisVisit: true, visitLocked: true }))
    await svc.onPush('s')
    expect(applies(sent, 'b1').map(a => a.hold_ms)).toEqual([1500])
    expect(applies(sent, 'b2')).toEqual([])
    sent.length = 0
    snaps.set('s', x01({ currentPlayer: 1, totalVisits: [1, 0] }))
    await svc.onPush('s')
    const b1 = applies(sent, 'b1')[0].state as { bri: number }
    expect(b1.bri).toBe(40) // waiting: the other board's turn
    expect(applies(sent, 'b2')[0].hold_ms).toBeUndefined()
  })

  it('takeout lights white, then the game scene comes back', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    const turn = applies(sent, 'b1')[0].state
    sent.length = 0
    await svc.onBoardEvent('b1', 'takeout.started')
    await svc.onBoardEvent('b1', 'takeout.finished')
    const [white, back] = applies(sent, 'b1')
    expect((white.state as { seg: { col: number[][] }[] }).seg[0].col).toEqual([[255, 255, 255]])
    expect(back.state).toEqual(turn)
  })

  it('lights off or an old bridge sends nothing', async () => {
    for (const over of [{ enabled: async () => false }, { bridgeVersion: () => '0.3.1' }]) {
      const { svc, sent, snaps, sessions } = setup(over)
      sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }] })
      snaps.set('s', x01({}))
      await svc.onPush('s')
      await svc.onBridgeHello('b1')
      expect(sent).toEqual([])
    }
  })

  it('a reconnecting bridge gets its devices, then the scene', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }, { boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    sent.length = 0
    await svc.onBridgeHello('b1')
    expect(sent.map(s => s.msg.kind)).toEqual(['wled.devices', 'wled.apply'])
    expect(sent[0].msg.data).toEqual({ devices: [{ id: 'dev-b1', mac: 'dev-b1', host: '192.168.1.2', max_bri: 178 }] })
  })

  it('a board with no game goes idle on hello', async () => {
    const { svc, sent } = setup()
    await svc.onBridgeHello('b1')
    const state = applies(sent, 'b1')[0].state as { bri: number; seg: { fx: number }[] }
    expect(state.bri).toBe(60)
    expect(state.seg[0].fx).toBe(2)
  })

  it('the game ending makes the board idle', async () => {
    const { svc, sent, snaps, sessions } = setup()
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }] })
    snaps.set('s', x01({}))
    await svc.onPush('s')
    sent.length = 0
    await svc.onGameEnded('s')
    expect((applies(sent, 'b1')[0].state as { bri: number }).bri).toBe(60)
  })

  it('a send that throws is logged, not raised', async () => {
    const warns: string[] = []
    const { svc, snaps, sessions } = setup({ send: () => { throw new Error('socket') }, warn: m => warns.push(m) })
    sessions.set('s', { boardId: 'b1', seats: [{ boardId: null }] })
    snaps.set('s', x01({}))
    await expect(svc.onPush('s')).resolves.toBeUndefined()
    expect(warns.length).toBeGreaterThan(0)
  })

  it('turning lights off darkens the strip, then clears the allowlist', async () => {
    const { svc, sent } = setup({ enabled: async () => false })
    await svc.devicesChanged('b1')
    expect(sent.map(s => s.msg.kind)).toEqual(['wled.apply', 'wled.devices'])
    expect(sent[0].msg.data.state).toEqual({ on: false })
    expect(sent[1].msg.data).toEqual({ devices: [] })
  })

  it('test plays a rule as a flash for seat 1', async () => {
    const { svc, sent } = setup()
    expect(await svc.test('b1', 0)).toBe(true) // rule 1 is a scene; Test holds it 3 s
    expect(applies(sent, 'b1')[0].hold_ms).toBe(3000)
    expect(await svc.test('b1', 99)).toBe(false)
  })
})
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `service.ts`** using the behaviour above. Keep two maps, `last: Map<sessionId, Snapshot>` and `scene: Map<boardId, {t, game, layout}>`. `onForgotten` deletes `last`. `test(board, i)`: take `rule = DEFAULT_PROFILE.rules[i]` and return false if it's missing. Use `t = {...sampleTrigger(rule.when.trigger), local: true}` (seat 0, total 180 for `visit`). Send with `hold_ms: rule.type === 'flash' ? rule.holdMs : 3000`. Test needs lights on and a supported bridge (with lights off the bridge has no allowlist); the API answers 409 then and the UI disables ▶ Test while the switch is off.

- [ ] **Step 4: Wire `index.ts`.** Create the service before the engine callback runs. It reads `engine` lazily, the same way the push closure already does:

```ts
const lights: LightsService = new LightsService({
  send: (b, m) => bridgeConnections.send(b, m),
  bridgeVersion: b => bridgeConnections.get(b)?.bridgeVersion,
  devices: b => listWledDevices(db, b),
  enabled: b => getLightsEnabled(db, b),
  getSession: id => engine.getSession(id),
  getSnapshot: id => engine.getSnapshot(id),
  sessionOnBoard: b => engine.getSessionByBoard(b)?.id ?? null,
  warn,
})
```

In the push callback, add `lights.onPush(sessionId).catch(err => warn('lights', err))`. In `ended`, add `lights.onGameEnded(ended.sessionId)`. Chain `forgotten`: `{ forgotten: id => { forgetSession(id); lights.onForgotten(id) } }`. Pass `lights` into `buildApp`. In `app.ts`, add to `bridgeGwPlugin`'s options: `onBridgeHello: b => void lights.onBridgeHello(b)`, `onBoardEvent: (b, k) => void lights.onBoardEvent(b, k)`, `onLightsFound: (b, found) => void rehostWledDevices(db, b, found).then(changed => changed && lights.devicesChanged(b))`. Match `warn`'s real signature from index.ts and use `.catch` the way the lobby call does. Check `engine.getSession`'s return type (`Session`) against `LightsDeps.getSession`; it's a structural subset, so it fits.

- [ ] **Step 5: Run.** `cd backend && npx vitest run src/lights && npm run typecheck && npm run lint` → PASS. Then run all backend tests: `npm test`.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/lights backend/src/index.ts backend/src/app.ts
git commit -m "feat(backend): send wled scenes and flashes as games change"
```

---

### Task 11: Flag and API

**Files:**

- Modify: `backend/src/flags/definitions.ts` (add `lights.enabled` after `matchmaking.enabled`)
- Modify: `schema/api-v1.yaml` (paths and schemas below); regenerate with `npm run gen:api`
- Create: `backend/src/api/lights.ts`
- Modify: `backend/src/app.ts` (register `lightsApiPlugin` after `boardsApiPlugin`)
- Test: `backend/src/api/lights.test.ts`

**Interfaces:**

- Consumes: Tasks 8–10, `ownBoard`'s helper `findOwnBoard` from `backend/src/boards/own.ts`, `fromSpec`, `Route`, `requireAuth`.
- Produces (operationIds): `getBoardLights`, `setBoardLights`, `scanBoardLights`, `probeBoardLights`, `blinkBoardLights`, `addWledDevice`, `updateWledDevice`, `deleteWledDevice`, `testBoardLight`.
- Produces (schemas): `BoardLights`, `WledDevice`, `FoundWledDevice`, `LightRule`, `LightProfile`.

- [ ] **Step 1: Flag.**

```ts
'lights.enabled': {
  variants: { on: true, off: false },
  defaultVariant: 'off',
  disabled: false,
  contextEvaluator: on('lights.enabled', isAdmin),
},
```

- [ ] **Step 2: OpenAPI.** Under `paths`, using the `BoardId` parameter and the error responses exactly as `/api/boards/{id}/status` does:

```yaml
/api/boards/{id}/lights:
  parameters: [{ $ref: '#/components/parameters/BoardId' }]
  get:
    operationId: getBoardLights
    summary: The board's WLED devices, what its bridge found, and the light profile
    tags: [lights]
    responses:
      '200': { description: Lights, content: { application/json: { schema: { $ref: '#/components/schemas/BoardLights' } } } }
      '401': { $ref: '#/components/responses/Unauthorized' }
      '403': { $ref: '#/components/responses/Forbidden' }
      '404': { $ref: '#/components/responses/NotFound' }
  put:
    operationId: setBoardLights
    summary: Turn the board's lights on or off (devices and rules are kept)
    tags: [lights]
    requestBody:
      required: true
      content: { application/json: { schema: { type: object, required: [enabled], additionalProperties: false, properties: { enabled: { type: boolean } } } } }
    responses:
      '204': { description: Saved }
      '401': { $ref: '#/components/responses/Unauthorized' }
      '403': { $ref: '#/components/responses/Forbidden' }
      '404': { $ref: '#/components/responses/NotFound' }
/api/boards/{id}/lights/scan:
  parameters: [{ $ref: '#/components/parameters/BoardId' }]
  post:
    operationId: scanBoardLights
    summary: Ask the bridge to look for WLED devices now
    tags: [lights]
    responses:
      '202': { description: Asked }
      '401': { $ref: '#/components/responses/Unauthorized' }
      '403': { $ref: '#/components/responses/Forbidden' }
      '404': { $ref: '#/components/responses/NotFound' }
      '503': { $ref: '#/components/responses/BoardUnavailable' }
/api/boards/{id}/lights/probe:
  parameters: [{ $ref: '#/components/parameters/BoardId' }]
  post:
    operationId: probeBoardLights
    summary: Ask the bridge whether a WLED answers at this address
    tags: [lights]
    requestBody:
      required: true
      content: { application/json: { schema: { type: object, required: [host], additionalProperties: false, properties: { host: { type: string, minLength: 1, maxLength: 253, pattern: '^[A-Za-z0-9.\-:\[\]]+$' } } } } }
    responses:
      '202': { description: Asked }
      '401': { $ref: '#/components/responses/Unauthorized' }
      '403': { $ref: '#/components/responses/Forbidden' }
      '404': { $ref: '#/components/responses/NotFound' }
      '503': { $ref: '#/components/responses/BoardUnavailable' }
/api/boards/{id}/lights/blink:
  parameters: [{ $ref: '#/components/parameters/BoardId' }]
  post:
    operationId: blinkBoardLights
    summary: Blink a found or paired WLED device so you can tell which one it is
    tags: [lights]
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            additionalProperties: false
            properties: { host: { type: string, maxLength: 253 }, deviceId: { type: string } }
    responses:
      '202': { description: Asked }
      '400': { $ref: '#/components/responses/BadRequest' }
      '401': { $ref: '#/components/responses/Unauthorized' }
      '403': { $ref: '#/components/responses/Forbidden' }
      '404': { $ref: '#/components/responses/NotFound' }
      '503': { $ref: '#/components/responses/BoardUnavailable' }
/api/boards/{id}/lights/devices:
  parameters: [{ $ref: '#/components/parameters/BoardId' }]
  post:
    operationId: addWledDevice
    summary: Pair a WLED device the bridge found
    tags: [lights]
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [mac, name, segmentMode, maxBri]
            additionalProperties: false
            properties:
              mac: { type: string }
              name: { type: string, minLength: 1, maxLength: 40 }
              segmentMode: { type: string, enum: [whole, perSeat, wled] }
              maxBri: { type: integer, minimum: 1, maximum: 255 }
    responses:
      '201': { description: Paired, content: { application/json: { schema: { $ref: '#/components/schemas/WledDevice' } } } }
      '400': { $ref: '#/components/responses/BadRequest' }
      '401': { $ref: '#/components/responses/Unauthorized' }
      '403': { $ref: '#/components/responses/Forbidden' }
      '404': { $ref: '#/components/responses/NotFound' }
      '409': { $ref: '#/components/responses/Conflict' }
/api/boards/{id}/lights/devices/{deviceId}:
  parameters:
    - $ref: '#/components/parameters/BoardId'
    - { name: deviceId, in: path, required: true, schema: { type: string } }
  patch:
    operationId: updateWledDevice
    summary: Rename a device or change its segments or brightness cap
    tags: [lights]
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            additionalProperties: false
            properties:
              name: { type: string, minLength: 1, maxLength: 40 }
              segmentMode: { type: string, enum: [whole, perSeat, wled] }
              maxBri: { type: integer, minimum: 1, maximum: 255 }
    responses:
      '200': { description: Saved, content: { application/json: { schema: { $ref: '#/components/schemas/WledDevice' } } } }
      '401': { $ref: '#/components/responses/Unauthorized' }
      '403': { $ref: '#/components/responses/Forbidden' }
      '404': { $ref: '#/components/responses/NotFound' }
  delete:
    operationId: deleteWledDevice
    summary: Unpair a device
    tags: [lights]
    responses:
      '204': { description: Removed }
      '401': { $ref: '#/components/responses/Unauthorized' }
      '403': { $ref: '#/components/responses/Forbidden' }
      '404': { $ref: '#/components/responses/NotFound' }
/api/boards/{id}/lights/test:
  parameters: [{ $ref: '#/components/parameters/BoardId' }]
  post:
    operationId: testBoardLight
    summary: Play one rule of the board's light profile on its devices
    tags: [lights]
    requestBody:
      required: true
      content: { application/json: { schema: { type: object, required: [rule], additionalProperties: false, properties: { rule: { type: integer, minimum: 0 } } } } }
    responses:
      '202': { description: Played }
      '400': { $ref: '#/components/responses/BadRequest' }
      '401': { $ref: '#/components/responses/Unauthorized' }
      '403': { $ref: '#/components/responses/Forbidden' }
      '404': { $ref: '#/components/responses/NotFound' }
      '409': { $ref: '#/components/responses/Conflict' }
      '503': { $ref: '#/components/responses/BoardUnavailable' }
```

Under `components.schemas`:

```yaml
WledDevice:
  type: object
  required: [id, mac, name, host, leds, version, segments, segmentMode, maxBri, reachable]
  properties:
    id: { type: string }
    mac: { type: string }
    name: { type: string }
    host: { type: string }
    leds: { type: integer }
    version: { type: string }
    segments: { type: integer }
    segmentMode: { type: string, enum: [whole, perSeat, wled] }
    maxBri: { type: integer }
    reachable: { type: [boolean, 'null'], description: null until the bridge has sent to it }
    error: { type: string }
    since: { type: string, format: date-time }
FoundWledDevice:
  type: object
  required: [mac, host, name, leds, version, segments]
  properties:
    mac: { type: string }
    host: { type: string }
    name: { type: string }
    leds: { type: integer }
    version: { type: string }
    segments: { type: integer }
    onBoard: { type: string, description: Name of another of your boards this device is paired to }
LightRule:
  type: object
  required: [when, type, look]
  properties:
    when:
      type: object
      required: [trigger, seats]
      properties:
        trigger: { type: string }
        seats: { type: string, enum: [any, mine, other] }
        total: { type: object, required: [op, n], properties: { op: { type: string, enum: ['=', '>='] }, n: { type: integer } } }
        game: { type: string }
    type: { type: string, enum: [scene, flash] }
    look:
      type: object
      required: [color, fx, bri]
      properties: { color: { type: string }, fx: { type: integer }, bri: { type: integer }, speed: { type: integer } }
    holdMs: { type: integer }
LightProfile:
  type: object
  required: [id, name, builtIn, rules]
  properties:
    id: { type: string }
    name: { type: string }
    builtIn: { type: boolean }
    rules: { type: array, items: { $ref: '#/components/schemas/LightRule' } }
BoardLights:
  type: object
  required: [enabled, bridgeOnline, bridgeOutdated, devices, found, lastScanAt, probe, profile]
  properties:
    enabled: { type: boolean }
    bridgeOnline: { type: boolean }
    bridgeOutdated: { type: boolean }
    devices: { type: array, items: { $ref: '#/components/schemas/WledDevice' } }
    found: { type: array, items: { $ref: '#/components/schemas/FoundWledDevice' } }
    lastScanAt: { type: [string, 'null'], format: date-time }
    probe: { type: ['object', 'null'], required: [host], properties: { host: { type: string }, error: { type: string } } }
    profile: { $ref: '#/components/schemas/LightProfile' }
```

If `Conflict` or `BadRequest` responses don't exist under `components.responses`, add them modelled on `NotFound`. Match the yaml's OpenAPI version for nullable types: `type: [x, 'null']` is 3.1. If the file is 3.0, use `nullable: true`. Run `npm run gen:api` at the repo root.

- [ ] **Step 3: Write the failing API tests** (`api/lights.test.ts`). Follow the setup of the existing boards API test (`ls backend/src/api/*.test.ts`, then copy its app builder and auth helpers). Inject a fake `LightsService` (the `test`, `devicesChanged` spies), a `LightsStore` and a fake `send`. Cases:
  - Every route returns 403 for a user who doesn't own the board and 404 for an unknown board.
  - `GET` returns `found` without devices already paired to this board. A device paired to another of the owner's boards comes back with `onBoard`.
  - `GET` reports `bridgeOutdated: true` for `bridgeVersion` `0.3.1` and `bridgeOnline: false` when not connected.
  - `POST devices` with a MAC that's not in `found` → 400. With a found MAC → 201, the row stored with `host`/`leds`/`version`/`segments` from `found`, and `devicesChanged` called.
  - The same MAC paired twice → 409.
  - `POST probe` with host `example.com` → 400 ("Local addresses only"). With `192.168.1.80` → 202, and the bridge was sent `{kind:'wled.probe', data:{host}}`.
  - `POST blink {deviceId}` sends the device's host. `{host}` must be in `found`, otherwise 400.
  - `POST scan` / `probe` / `blink` / `test` while the bridge is offline → 503. `POST test` with lights off → 409.
  - `PUT {enabled:false}` stores it and calls `devicesChanged` (so the board goes dark on its next trigger, which nothing sends).
  - `DELETE` → 204, then `devicesChanged`.

- [ ] **Step 4: Run** → FAIL.

- [ ] **Step 5: Implement `api/lights.ts`.** It's a callback plugin like `boardsApiPlugin`, with `Opts = FastifyPluginOptions & { db; lights: LightsService; store?: LightsStore; send?: (b, m) => boolean; bridgeVersion?: (b) => string | null | undefined; isOnline?: (b) => boolean }`. Default the injectables to `bridgeConnections`/`lightsStore`. Each route uses `preValidation: requireAuth, schema: fromSpec('<opId>')` and the `ownBoard` pattern (404/403). Rules:
  - Probe hosts are checked server-side too, with a TS copy of the bridge's `LocalHost` (IPv4 private, link-local, loopback, `.local`), so users get a clear 400 before the bridge drops the request.
  - Map DB rows to the camelCase `WledDevice` shape, with `reachable`, `error` and `since` from `store.status`.
  - `profile` is `{...DEFAULT_PROFILE, builtIn: true}`.
  - A unique violation on insert → 409. Use the existing helper in `db/errors.ts` (grep `isUniqueViolation` or similar).
  - After every change to devices or `enabled`, call `lights.devicesChanged(boardId)`. Don't await it inside the response path's error handling, or a lights failure could fail the request: use `void lights.devicesChanged(id).catch(...)`.
  - `GET` is not flag-gated server-side (the flag hides the UI). Every route is owner-only.

- [ ] **Step 6: Register** in `app.ts` after `boardsApiPlugin`: `await app.register(lightsApiPlugin, { db, lights })`.

- [ ] **Step 7: Run.** `cd backend && npm test && npm run typecheck && npm run lint` → PASS.

- [ ] **Step 8: Commit.**

```bash
git add backend/src/flags schema/api-v1.yaml schema/api-v1.deref.json backend/src/schema backend/frontend/src/lib/api backend/src/api/lights.ts backend/src/api/lights.test.ts backend/src/app.ts
git commit -m "feat(backend): add the board lights api behind lights.enabled"
```

(Add whatever else `gen:api` regenerates. Check with `git status`.)

- [ ] **Step 9: Open PR 2** (based on PR 1's branch). Title: `feat(backend): light up wled strips from the game`. Body: triggers, the default profile, remote behaviour, the API, `Refs #135`.

---

# Part 3 — Frontend (PR 3: `feat(frontend): add lights to settings`)

### Task 12: Settings → Lights page

**Files:**

- Modify: `backend/frontend/src/lib/settings/sections.ts` (drop `soon` from Lights; add `flag?: string`)
- Modify: `backend/frontend/src/routes/Settings.svelte` (filter sections by flag in both navs and the phone list; render `<LightsSection />` for `shown === 'lights'`)
- Create: `backend/frontend/src/lib/lights/view.ts` (pure helpers)
- Create: `backend/frontend/src/lib/components/lights/LightsSection.svelte`, `LightsBoardPicker.svelte`, `WledDeviceRow.svelte`, `FoundDevices.svelte`, `LightProfileCard.svelte`
- Test: `backend/frontend/src/lib/__tests__/lightsView.test.ts`, `backend/frontend/src/lib/__tests__/settingsSections.test.ts` (update), `backend/frontend/src/lib/__tests__/lightsSection.test.ts`

**Interfaces:**

- Consumes: the API from Task 11 (`api.GET('/api/boards/{id}/lights', …)` etc.), `DEFAULT_PROFILE`/`SEAT_COLORS` types from `$shared/lights/index.js`, `flag(key)` from `$lib/flags`, `SettingSwitch.svelte`, the `Button`/`Badge`/`Chip`/`Input` primitives in `lib/components/ui/`, and bits-ui `Popover` for the ⋯ menu (as in `lobby/PopoverPanel.svelte`).
- Produces (`lib/lights/view.ts`):

```ts
export function ruleLabel(rule: LightRule): { when: string; filter: string | null; type: 'Scene' | 'Flash'; look: string }
export function segmentHint(leds: number, mode: SegmentMode, seats: number, wledSegments: number): string // '4 × 36 LEDs', 'whole strip', '2 WLED segments'
export function deviceSummary(d: { segmentMode: SegmentMode; segments: number }): string // '1 segment · whole ring' style: 'Whole strip', 'One per seat', 'WLED segments · 2'
export function since(iso: string | undefined, now: Date): string // 'since 2 min'
export function sectionVisible(s: { flag?: string }, flags: Record<string, boolean>): boolean
```

Copy from the design: trigger labels are "Turn changes", "Visit scored", "Bust", "Checkout", "Game won", "Target hit", "Life lost", "Ball sunk", "Bull off won", "Takeout", "No game". The filter reads `= 180` / `≥ 100`, plus `· other board` for `seats: 'other'`. The look reads `seat colour · solid`, `red · blink · 1.5 s`, `#ffffff` → `white`, `#ff3b30` → `red`. Effect names come from a small fx map: 0 solid, 1 blink, 2 pulse (the design calls Breathe "pulse"), 9 rainbow, 20 sparkle, 42 fireworks.

- [ ] **Step 1: Write the failing tests** for `view.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '$shared/lights/index.js'
import { ruleLabel, sectionVisible, segmentHint, since } from '$lib/lights/view'

describe('lights view', () => {
  it('labels the default rules like the design', () => {
    expect(ruleLabel(DEFAULT_PROFILE.rules[0])).toEqual({ when: 'Turn changes', filter: null, type: 'Scene', look: 'seat colour · solid' })
    expect(ruleLabel(DEFAULT_PROFILE.rules[2])).toEqual({ when: 'Visit scored', filter: '= 180', type: 'Flash', look: 'seat colour · fireworks · 4 s' })
    expect(ruleLabel(DEFAULT_PROFILE.rules[4])).toEqual({ when: 'Bust', filter: null, type: 'Flash', look: 'red · blink · 1.5 s' })
    expect(ruleLabel(DEFAULT_PROFILE.rules[1]).filter).toBe('other board')
  })
  it('segment hints', () => {
    expect(segmentHint(144, 'perSeat', 4, 1)).toBe('4 × 36 LEDs')
    expect(segmentHint(145, 'perSeat', 4, 1)).toBe('3 × 36 + 37 LEDs')
    expect(segmentHint(120, 'whole', 2, 1)).toBe('120 LEDs')
    expect(segmentHint(60, 'wled', 2, 3)).toBe('3 WLED segments')
  })
  it('since', () => {
    expect(since('2026-10-18T12:00:00Z', new Date('2026-10-18T12:02:10Z'))).toBe('since 2 min')
    expect(since('2026-10-18T12:00:00Z', new Date('2026-10-18T12:00:20Z'))).toBe('since just now')
  })
  it('a flagged section shows only with its flag', () => {
    expect(sectionVisible({ flag: 'lights.enabled' }, {})).toBe(false)
    expect(sectionVisible({ flag: 'lights.enabled' }, { 'lights.enabled': true })).toBe(true)
    expect(sectionVisible({}, {})).toBe(true)
  })
})
```

In `settingsSections.test.ts`, update any assertion that relied on Lights being `soon`. `sectionOf('lights')` now returns `'lights'`; the flag check happens in the component.

`lightsSection.test.ts` renders `LightProfileCard` server-side with `render` from `svelte/server`, following `boardViewToggle.test.ts`. It asserts 13 rule rows, "Dartcade default", "built in", disabled Duplicate/Import/Export, and that every ▶ Test button is `disabled` when `bridgeOnline` is false.

- [ ] **Step 2: Run.** `cd backend/frontend && npx vitest run src/lib/__tests__/lights* src/lib/__tests__/settingsSections*` → FAIL.

- [ ] **Step 3: Implement `view.ts`** to satisfy the tests.

- [ ] **Step 4: Sections and Settings.** In `sections.ts`: `{ id: 'lights', label: 'Lights', flag: 'lights.enabled' }`, and drop the "listed, not built" comment. In `Settings.svelte`: `const lightsOn = flag('lights.enabled')`, `const visible = $derived(SETTINGS_SECTIONS.filter(s => sectionVisible(s, { 'lights.enabled': $lightsOn })))`. Use `visible` in both navs and the phone list. If `shown === 'lights'` and the flag is off, show the profile section instead, the same way an unknown section is handled. Add `{:else if shown === 'lights'}<LightsSection />`.

- [ ] **Step 5: Build the components** from `project/Settings-Lights.dc.html`. Read it with the Artifact tool (`read`, path `project/Settings-Lights.dc.html`, URL https://claude.ai/artifact/2ZyCCfSMhs3PKZzNLzsw23) for exact spacing, type sizes and token classes. Match the Caller and Boards sections' card styles in this repo.
  - `LightsSection.svelte`: loads `GET /api/boards` and picks the board from `?board=` or the first board. Polls `GET /api/boards/{id}/lights` every 3 s while mounted (`setInterval` cleared in the `$effect` teardown) and pauses while `document.hidden`. Renders the picker, the master switch (`SettingSwitch`, label "Lights on {board.name}", sub "Off keeps devices and rules", `onchange` → `PUT`), the device list, found devices, and the profile card. Banners: if `bridgeOutdated`, "Update your bridge to use lights". If `!bridgeOnline`, "The bridge is offline", and every action is disabled.
  - `LightsBoardPicker.svelte`: board buttons with "N devices" (`devices.length` from each board's lights, fetched once per board on mount) and "offline" for `!board.online`.
  - `WledDeviceRow.svelte`: name, `host · leds LEDs · v{version}`, `deviceSummary`. A red dot and `Not answering ${since}` when `reachable === false`. **Blink** (`POST blink {deviceId}`) and a ⋯ Popover with Edit (opens the dialog from Task 13 in edit mode) and Remove (`DELETE`, inline confirm inside the popover: "Remove {name}?" with Remove/Cancel; no browser `confirm()`).
  - `FoundDevices.svelte`: the "Found on this board's network" header with "Scanning · {ago}" and **Rescan** (`POST scan`). Rows show `name`, `host · leds LEDs · version`, then **Pair** (opens Task 13's dialog at this device), or "On {onBoard}" without a button. Below that, **Add by IP**: an `Input` and an Add button (`POST probe`), with `probe.error` shown inline as `No WLED answered at {host}` when `probe.host` matches the last request. The hint reads "Local addresses only. The bridge checks that the device answers as WLED before it sends anything."
  - `LightProfileCard.svelte`: "Light profile", "Dartcade default · built in", disabled Duplicate/Import/Export buttons with a `title="Coming soon"` tooltip (bits-ui Tooltip if the project already wraps it, otherwise `title`), "Seat colours come from the game:" with `SEAT_COLORS` swatches, numbered rule rows from `ruleLabel`, and **▶ Test** (`POST test {rule: i}`; disabled while the master switch is off). Footer copy: "The built-in default can't be edited and never touches your WLED presets."
  - All requests go through `api` from `$lib/api` (openapi-fetch). On a failed request, show the error inline in the card that made it. No toasts.

- [ ] **Step 6: Run.** `cd backend/frontend && npm test && npm run typecheck && npm run lint` → PASS.

- [ ] **Step 7: Check in the browser.** Run `scripts/dev.sh`, turn on `lights.enabled` (`FLAGS_ON=lights.enabled` or an admin user), and open `#/settings/lights`. Check against the design artboard: board picker, switch, empty device list, found list, profile card. Check the phone width (375 px) too.

- [ ] **Step 8: Commit.**

```bash
git add backend/frontend/src
git commit -m "feat(frontend): add the lights settings section"
```

---

### Task 13: Pair and edit dialog

**Files:**

- Create: `backend/frontend/src/lib/components/lights/PairWledDialog.svelte`
- Modify: `LightsSection.svelte`, `FoundDevices.svelte`, `WledDeviceRow.svelte` (open it)
- Create: `backend/frontend/src/lib/lights/pair.ts` (step state machine)
- Test: `backend/frontend/src/lib/__tests__/lightsPair.test.ts`

**Interfaces:**

- Consumes: Task 12 (`segmentHint`), the API (`blinkBoardLights`, `addWledDevice`, `updateWledDevice`), `Modal` from `lib/components/ui/modal` (`onclose`, `title`, `subtitle`, `footer`).
- Produces:

```ts
// lib/lights/pair.ts
export type PairStep = 'check' | 'details'
export type PairState = { step: PairStep; index: number; name: string; boardId: string; segmentMode: SegmentMode; maxBri: number }
export function startPair(found: FoundWledDevice[], mac: string, boardId: string): PairState // step 'check', name prefilled from WLED
export function startEdit(d: WledDevice, boardId: string): PairState                         // step 'details'
export function nextCandidate(s: PairState, found: FoundWledDevice[]): PairState            // "No, show me another": next unpaired found device, wraps
export function confirmBlink(s: PairState): PairState                                       // → 'details'
export function brightnessPercent(maxBri: number): number                                   // 178 → 70
export function maxBriFromPercent(p: number): number                                        // 70 → 178
```

Props: `PairWledDialog { boardId, boards, found, device?: WledDevice, seats?: number = 4, onclose, onsaved }`.

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from 'vitest'
import { brightnessPercent, confirmBlink, maxBriFromPercent, nextCandidate, startEdit, startPair } from '$lib/lights/pair'

const f = (mac: string, name = `WLED-${mac}`) => ({ mac, host: `192.168.1.${mac.length}`, name, leds: 144, version: '0.15.0', segments: 1 })
const found = [f('a'), f('bb', 'Shelf'), { ...f('ccc'), onBoard: 'Garage' }]

describe('pair flow', () => {
  it('starts at the blink check with the WLED name', () => {
    const s = startPair(found, 'bb', 'b1')
    expect(s).toMatchObject({ step: 'check', index: 1, name: 'Shelf', segmentMode: 'whole', maxBri: 178 })
  })
  it('"show me another" skips devices paired elsewhere and wraps', () => {
    const s = nextCandidate(startPair(found, 'bb', 'b1'), found)
    expect(s.index).toBe(0)
    expect(s.name).toBe('WLED-a')
  })
  it('confirming the blink moves to the details', () => {
    expect(confirmBlink(startPair(found, 'a', 'b1')).step).toBe('details')
  })
  it('editing skips the blink check', () => {
    const s = startEdit({ id: 'd', mac: 'a', name: 'Ring', host: 'h', leds: 120, version: 'v', segments: 1, segmentMode: 'perSeat', maxBri: 255, reachable: true }, 'b1')
    expect(s).toMatchObject({ step: 'details', name: 'Ring', segmentMode: 'perSeat', maxBri: 255 })
  })
  it('brightness round-trips through percent', () => {
    expect(brightnessPercent(178)).toBe(70)
    expect(maxBriFromPercent(70)).toBe(178)
    expect(maxBriFromPercent(100)).toBe(255)
    expect(maxBriFromPercent(1)).toBe(2)
  })
})
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `pair.ts`.** `maxBriFromPercent = p => Math.max(1, Math.floor(p * 2.55))` (70 → 178, 100 → 255, 1 → 2), `brightnessPercent = b => Math.round(b / 2.55)` (178 → 70), default `maxBri` 178.

- [ ] **Step 4: Build `PairWledDialog.svelte`** from `project/Settings-Lights-Pair.dc.html` (read it with the Artifact tool). Title: "Pair WLED device", or "Edit {name}" when editing. Subtitle: "Found by the {board} bridge on your network".
  1. **Check it's the right one** (pairing only). On open, `POST blink {host}`. Shows "Blinking lime now", `{name} · {host} · {leds} LEDs`, **Blink again**, "Is this the strip at your board?", **Yes, it blinked** → `confirmBlink`, and **No, show me another** → `nextCandidate` plus a blink of the new candidate. Hide "show me another" when there's only one candidate.
  2. **Name it and pick the board**: an `Input` (max 40) and a board select (`OptionSelect`), defaulting to the current board. Pairing only lists boards where the device was found; in practice that's the current one. When editing, the board is shown read-only.
  3. **Segments**: a radiogroup (the same pattern as `BoardViewToggle`) with Whole strip / One per seat / Use WLED segments, plus `segmentHint(leds, mode, seats, segments)` and the copy "The strip splits into as many parts as there are seats; each lights in its seat colour on that seat's turn." The "Use WLED segments" option is disabled when `segments < 2`.
  4. **Max brightness**: a native `<input type="range" min="1" max="100">` with `class="flex-1 accent-accent"` (as in `SettingsDrawer.svelte`), showing `{p}%` and the copy "Caps every rule, so a small power supply never gets overloaded."
  - Footer: Cancel and **Pair device** (or **Save**). Pairing calls `POST devices`; editing calls `PATCH devices/{id}`. On success it calls `onsaved()`, which reloads the section, then `onclose()`. A 409 shows "This device is already paired to this board." Other errors show inline in the footer.

- [ ] **Step 5: Wire it up.** **Pair** in `FoundDevices` opens the dialog with `startPair(found, mac, boardId)`. **Edit** in the ⋯ menu opens it with `startEdit`. The dialog renders inside `LightsSection` (one instance, `{#if dialog}`).

- [ ] **Step 6: Run.** `cd backend/frontend && npm test && npm run typecheck && npm run lint` → PASS.

- [ ] **Step 7: Check in the browser.** In the dev stack, add a device by IP. With no real WLED, point it at a fake: `npx http-server` can't fake `/json/info`, so run this tiny Node fake on `127.0.0.1:8099` from the scratchpad:

```js
// fake-wled.mjs — node fake-wled.mjs
import http from 'node:http'
let state = { on: true, bri: 128, seg: [{ id: 0, start: 0, stop: 144 }] }
http.createServer((req, res) => {
  if (req.url === '/json/info') return res.end(JSON.stringify({ ver: '0.15.0', name: 'Fake WLED', mac: 'fa4e0000c0de', leds: { count: 144 } }))
  if (req.url === '/json/state' && req.method === 'GET') return res.end(JSON.stringify(state))
  if (req.url === '/json/state' && req.method === 'POST') {
    let b = ''
    req.on('data', c => (b += c)).on('end', () => { console.log('POST', b); state = { ...state, ...JSON.parse(b) }; res.end('{"success":true}') })
    return
  }
  res.statusCode = 404; res.end()
}).listen(8099, '127.0.0.1')
```

Add `127.0.0.1:8099`, pair it, then play a local X01 game with manual darts. Check that the fake logs a turn scene, a 180 flash with its restore, and a takeout scene.

- [ ] **Step 8: Commit.**

```bash
git add backend/frontend/src
git commit -m "feat(frontend): pair and edit wled devices"
```

---

### Task 14: Boards links, screenshot, docs, follow-up issue

**Files:**

- Modify: `backend/frontend/src/lib/components/boards/BoardsSection.svelte` (the `boardDetails` snippet at ~306), `BoardCard.svelte` (the chip next to Online/Offline, lines 27-30)
- Create: `docs/lights/settings-lights.png`
- Modify: `AGENTS.md` ("Where to look" table)
- Modify: `docs/superpowers/specs/2026-10-18-wled-lights-design.md` (only if implementation changed a detail; keep the spec true)

**Interfaces:**

- Consumes: `flag('lights.enabled')`, `GET /api/boards/{id}/lights` (for the device count).

- [ ] **Step 1: Boards.** In `boardDetails`, when `$lightsOn`, add a row: "Lights · {n} WLED devices · Manage" linking to `#/settings/lights?board={id}`. Fetch the count once when the selected board changes. Show "Add WLED lights" when `n === 0`. In `BoardCard`, show a `Chip` "Lights · {n}" or "Add WLED lights", linking to the same place. It gets the count as an optional prop `lights?: number`, filled by `BoardsSection`. The card doesn't fetch anything itself.

- [ ] **Step 2: Test.** Add a server-render test (`lib/__tests__/boardCardLights.test.ts`) showing the chip text for `lights: 2`, for `lights: 0` ("Add WLED lights"), and no chip for `undefined`.

- [ ] **Step 3: Run.** `cd backend/frontend && npm test && npm run typecheck && npm run lint` → PASS.

- [ ] **Step 4: Screenshot.** With the dev stack and the fake WLED from Task 13 paired, take a desktop-width screenshot of `#/settings/lights` with Claude in Chrome. Save it as `docs/lights/settings-lights.png`.

- [ ] **Step 5: AGENTS.md row** (keep the table's style):

```markdown
| Lights (WLED): triggers from game snapshots, the built-in profile, devices per board | rules and patches in `backend/src/shared/lights/` (shared with the frontend), triggers per game in `backend/src/lights/triggers/`, `backend/src/lights/service.ts` (sends `wled.apply` to the bridge), reports in `lights/store.ts`, `db/lights.ts`, API in `api/lights.ts`; bridge side `bridge/internal/wled` (allowlist, queue, flash/restore, mDNS); frontend `lib/components/lights/`, `lib/lights/`; behind `lights.enabled`; spec `docs/superpowers/specs/2026-10-18-wled-lights-design.md` |
```

- [ ] **Step 6: Format and verify everything.** At the repo root: `npm run format && npm run format:check`. Then `cd bridge && gofmt -l . && go test ./...`, `cd backend && npm test && npm run typecheck && npm run lint`, `cd backend/frontend && npm test && npm run typecheck && npm run lint`. All must pass.

- [ ] **Step 7: Commit.**

```bash
git add backend/frontend/src docs/lights AGENTS.md docs/superpowers/specs
git commit -m "feat(frontend): link boards to their lights"
```

- [ ] **Step 8: Follow-up issue and PR 3.** Ask the user before creating the issue (it's outward-facing). Draft: title "Lights v2: custom profiles and the rule editor"; body listing Duplicate/Import/Export, the rule editor (Settings-Lights-Rules), drag to reorder, preset/playlist/raw JSON looks, bridge-side matching of takeout/dart events for latency, and "Refs #135". Open PR 3, based on PR 2's branch, titled `feat(frontend): add lights to settings`. The body has the screenshot, `Refs #135`, and the hardware check still to do: a real game against a real WLED strip before merging.
