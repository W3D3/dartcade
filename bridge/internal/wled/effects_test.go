package wled

import (
	"reflect"
	"testing"
	"time"
)

// effectsReport waits for the next wled.effects report.
func effectsReport(t *testing.T, r *reports, after int) map[string]any {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		r.mu.Lock()
		for _, msg := range r.msgs[min(after, len(r.msgs)):] {
			if msg["kind"] == "wled.effects" {
				r.mu.Unlock()
				return msg["data"].(map[string]any)
			}
		}
		r.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("no wled.effects report")
	return nil
}

func count(r *reports) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.msgs)
}

func TestReportsEffectsAndPalettesOfEachPairedDevice(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, r := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	got := effectsReport(t, r, 0)
	want := map[string]any{
		"device_id": "d1", "version": "0.15.0",
		"effects": []any{"Solid", "Blink", "Breathe"}, "palettes": []any{"Default", "* Random Cycle"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("report = %v", got)
	}
}

func TestEffectsAreReadOncePerVersion(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, r := newTestManager(t)
	devs := []Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}}
	m.SetDevices(devs)
	effectsReport(t, r, 0)

	// The backend sends wled.devices again (a reconnect): reported again, from the cache
	n := count(r)
	m.SetDevices(devs)
	effectsReport(t, r, n)
	if reads := f.effReads.Load(); reads != 1 {
		t.Errorf("/json/eff read %d times, want 1", reads)
	}

	// An update to WLED may bring other effects: read again
	f.version.Store("0.16.0")
	n = count(r)
	m.SetDevices(devs)
	if got := effectsReport(t, r, n); got["version"] != "0.16.0" {
		t.Errorf("report = %v", got)
	}
	if reads := f.effReads.Load(); reads != 2 {
		t.Errorf("/json/eff read %d times, want 2", reads)
	}
}

func TestNoEffectsFromAnotherDeviceAtTheHost(t *testing.T) {
	f := newFakeWLED(t, "bb")
	m, r := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	m.Close() // waits for the read of the effect list to give up
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, msg := range r.msgs {
		if msg["kind"] == "wled.effects" {
			t.Fatalf("reported %v for a device with another MAC", msg)
		}
	}
	if f.effReads.Load() != 0 {
		t.Error("read the effects of a device with another MAC")
	}
}
