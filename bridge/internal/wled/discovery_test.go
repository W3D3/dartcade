package wled

import (
	"context"
	"errors"
	"strings"
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
