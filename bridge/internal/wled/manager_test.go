package wled

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// countingBrowser counts how many times Browse is called, to check the scan-on-error debounce.
type countingBrowser struct {
	hosts []string
	calls *int32
}

func (c countingBrowser) Browse(context.Context) ([]string, error) {
	atomic.AddInt32(c.calls, 1)
	return c.hosts, nil
}

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

func TestSetDevicesResetsReachableForKeptWorkers(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, r := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	m.Apply("d1", json.RawMessage(`{"on":true}`), 0)
	recv(t, f)
	none(t, f, 100*time.Millisecond) // let the first reachable report land
	r.mu.Lock()
	before := len(r.msgs)
	r.mu.Unlock()
	// The backend re-sends wled.devices on every hello, even for an unchanged device: a worker
	// that was already reachable must report again, not stay silent because nothing changed —
	// otherwise a dead device that went quiet while the bridge was offline still shows green.
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	m.Apply("d1", json.RawMessage(`{"on":true}`), 0)
	recv(t, f)
	none(t, f, 100*time.Millisecond)
	r.mu.Lock()
	after := len(r.msgs)
	r.mu.Unlock()
	if after <= before {
		t.Fatalf("want a fresh wled.status after SetDevices resent an unchanged device, got %d msgs (was %d)", after, before)
	}
}

// A device that changed IP (a MAC mismatch at its old host) must not wait up to 5 min for the
// periodic scan: the manager rescans itself, which rehosts it by MAC, so the next apply reaches it.
func TestMacMismatchTriggersRescanAndRehosts(t *testing.T) {
	old := newFakeWLED(t, "bb")   // the paired device moved off this host; it now answers as another one
	moved := newFakeWLED(t, "aa") // where mDNS finds it now
	var scans int32
	browser := countingBrowser{hosts: []string{moved.host()}, calls: &scans}
	m, _ := newTestManager(t)
	m.SetBrowser(browser)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: old.host(), MaxBri: 255}})
	m.Apply("d1", json.RawMessage(`{"on":true}`), 0)
	none(t, old, 300*time.Millisecond) // the mismatch triggers a rescan, which rehosts d1 to moved
	m.Apply("d1", json.RawMessage(`{"on":true}`), 0)
	recv(t, moved)
	if got := atomic.LoadInt32(&scans); got != 1 {
		t.Fatalf("browse calls = %d, want exactly 1 (debounced)", got)
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
	none(t, f, 100*time.Millisecond)              // the flash keeps playing
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

func TestUnpairFlushesPendingScene(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	ctx := context.Background()
	m.Handle(ctx, fakeBrowser{}, "wled.devices", json.RawMessage(`{"devices":[{"id":"d1","mac":"aa","host":"`+f.host()+`","max_bri":255}]}`))
	m.Handle(ctx, fakeBrowser{}, "wled.apply", json.RawMessage(`{"device_id":"d1","state":{"on":false}}`))
	m.Handle(ctx, fakeBrowser{}, "wled.devices", json.RawMessage(`{"devices":[]}`)) // d1 unpaired right behind the apply
	if p := recv(t, f); !strings.Contains(p, `"on":false`) {
		t.Fatalf("posted %s, want the pending off to still go out", p)
	}
}

func TestUnpairDuringFlashSkipsRestore(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	m.Apply("d1", json.RawMessage(`{"ps":1}`), 150)
	recv(t, f) // the flash POST
	m.SetDevices(nil)
	none(t, f, 400*time.Millisecond) // the restore, due ~150ms later, must not be sent
}

func TestCloseDuringFlashSkipsRestore(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	m.Apply("d1", json.RawMessage(`{"ps":1}`), 150)
	recv(t, f) // the flash POST
	m.Close()
	none(t, f, 400*time.Millisecond) // the restore, due ~150ms later, must not be sent
}
