package wled

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeBrowser []string

func (f fakeBrowser) Browse(context.Context) ([]string, error) { return f, nil }

type failBrowser string

func (f failBrowser) Browse(context.Context) ([]string, error) { return nil, errors.New(string(f)) }

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

func TestScanReportsBrowseFailure(t *testing.T) {
	m, r := newTestManager(t)
	m.Scan(context.Background(), failBrowser("no multicast"))
	d := r.last()["data"].(map[string]any)
	if d["scan_error"] != "no multicast" {
		t.Fatalf("got %v", d)
	}
	if len(d["devices"].([]any)) != 0 {
		t.Fatalf("want no devices on a failed browse, got %v", d["devices"])
	}
}

// A probe's real error (which host, what refused it) must never reach the browser: it would let
// someone use the probe box as a port-scan oracle. The browser always gets the same fixed message.
func TestProbeRefusesPublicHosts(t *testing.T) {
	m, r := newTestManager(t)
	m.Probe(context.Background(), "8.8.8.8")
	d := r.last()["data"].(map[string]any)
	if d["probe_host"] != "8.8.8.8" || d["probe_error"] != "no WLED answered" {
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

// Each Blink reads the strip's state before posting lime; a naive second blink while the first is
// still playing would read lime as ITS "prior" and restore to lime forever, or (the timer-based
// coalescing this replaced) double-fire the restore and double-close a shared channel. A second
// blink for a host already blinking is just ignored — reserved before the first even reads state,
// so it can never observe lime as its own prior.
func TestOverlappingBlinksRestoreTheOriginalOnce(t *testing.T) {
	a := newFakeWLED(t, "aa")
	a.slowPost = 50 * time.Millisecond // the first blink's lime POST is still in flight when the second arrives
	m, _ := newTestManager(t)
	m.blinkFor = 100 * time.Millisecond
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		m.Blink(context.Background(), a.host())
	}()
	time.Sleep(10 * time.Millisecond)
	// Overlapping: must be ignored outright, not read lime. Called directly, not in its own
	// goroutine — it's reserved-out and returns at once, and this keeps the test from leaking an
	// unsynchronized goroutine into later tests (which raced on the package's allowLoopback var).
	m.Blink(context.Background(), a.host())
	if p := recv(t, a); !strings.Contains(p, `"fx":1`) {
		t.Fatalf("lime %s", p)
	}
	none(t, a, 60*time.Millisecond) // no second lime POST from the ignored overlapping call
	if p := recv(t, a); !strings.Contains(p, `"stop":144`) {
		t.Fatalf("restore %s, want the true original state", p)
	}
	wg.Wait() // the first call's goroutine has now fully returned
}

// Once the first blink has finished (host released), a later blink for the same host runs again.
func TestBlinkAgainAfterTheFirstFinishes(t *testing.T) {
	a := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.blinkFor = 20 * time.Millisecond
	m.Blink(context.Background(), a.host())
	recv(t, a) // lime
	recv(t, a) // restore
	m.Blink(context.Background(), a.host())
	if p := recv(t, a); !strings.Contains(p, `"fx":1`) {
		t.Fatalf("second blink's lime %s", p)
	}
	recv(t, a) // its restore
}

func TestBlinkCapsAtPairedMaxBri(t *testing.T) {
	a := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.blinkFor = 100 * time.Millisecond
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: a.host(), MaxBri: 50}})
	m.Blink(context.Background(), a.host())
	if p := recv(t, a); !strings.Contains(p, `"bri":50`) {
		t.Fatalf("blink %s", p)
	}
	recv(t, a) // restore
}
