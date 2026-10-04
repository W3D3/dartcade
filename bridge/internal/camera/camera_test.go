package camera_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"dartcade/bridge/internal/camera"
)

var jpeg = []byte{0xFF, 0xD8, 0xFF, 0xE0, 'j', 'p', 'e', 'g', 0xFF, 0xD9}

// fakeBM serves /api/img/cams/{i} like Board Manager: a JPEG for cameras below n, 400 above.
type fakeBM struct {
	t     *testing.T
	n     int
	mu    sync.Mutex
	hits  map[string]int
	query []string
	// When set, each request waits for it to be closed (or receive) before answering
	gate chan struct{}
	body []byte
}

func (f *fakeBM) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	if f.hits == nil {
		f.hits = map[string]int{}
	}
	f.hits[r.URL.Path]++
	f.query = append(f.query, r.URL.RawQuery)
	gate, body := f.gate, f.body
	f.mu.Unlock()
	if gate != nil {
		<-gate
	}
	i, err := strconv.Atoi(strings.TrimPrefix(r.URL.Path, "/api/img/cams/"))
	if err != nil || i >= f.n {
		http.Error(w, "invalid camera index", http.StatusBadRequest)
		return
	}
	if body == nil {
		body = jpeg
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Write(body)
}

func (f *fakeBM) count(path string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.hits[path]
}

type sink struct {
	mu     sync.Mutex
	stills []camera.Still
	got    chan struct{}
}

func newSink() *sink { return &sink{got: make(chan struct{}, 64)} }

func (s *sink) put(st camera.Still) {
	s.mu.Lock()
	s.stills = append(s.stills, st)
	s.mu.Unlock()
	s.got <- struct{}{}
}

func (s *sink) wait(t *testing.T, n int) []camera.Still {
	t.Helper()
	for i := 0; i < n; i++ {
		select {
		case <-s.got:
		case <-time.After(2 * time.Second):
			t.Fatalf("got %d stills, want %d", i, n)
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	out := append([]camera.Still(nil), s.stills...)
	sort.Slice(out, func(a, b int) bool { return out[a].Cam < out[b].Cam })
	return out
}

func TestTriggerFetchesAWarpedStillFromEachCamera(t *testing.T) {
	bm := &fakeBM{t: t, n: 3}
	srv := httptest.NewServer(bm)
	defer srv.Close()
	s := newSink()
	f := camera.New(srv.URL, func() int { return 3 }, s.put)

	before := time.Now()
	f.Trigger(context.Background())
	stills := s.wait(t, 3)

	for i, st := range stills {
		if st.Cam != i {
			t.Errorf("still %d: cam=%d", i, st.Cam)
		}
		if !bytes.Equal(st.JPEG, jpeg) {
			t.Errorf("cam %d: body %v", i, st.JPEG)
		}
		if st.CapturedAt.Before(before) {
			t.Errorf("cam %d: captured_at %v before the trigger", i, st.CapturedAt)
		}
	}
	bm.mu.Lock()
	defer bm.mu.Unlock()
	for _, q := range bm.query {
		if q != "warp=true&width=600&height=600" {
			t.Errorf("query %q", q)
		}
	}
}

func TestCamerasTheBoardManagerDoesNotHaveAreSkipped(t *testing.T) {
	bm := &fakeBM{t: t, n: 3}
	srv := httptest.NewServer(bm)
	defer srv.Close()
	s := newSink()
	// Board Manager reports two cameras
	f := camera.New(srv.URL, func() int { return 2 }, s.put)
	f.Trigger(context.Background())
	stills := s.wait(t, 2)
	time.Sleep(50 * time.Millisecond)
	if len(stills) != 2 || bm.count("/api/img/cams/2") != 0 {
		t.Fatalf("stills=%d cam2 requests=%d", len(stills), bm.count("/api/img/cams/2"))
	}
}

func TestAFailedFetchSendsNothing(t *testing.T) {
	// Reports three cameras but only has one
	bm := &fakeBM{t: t, n: 1}
	srv := httptest.NewServer(bm)
	defer srv.Close()
	s := newSink()
	f := camera.New(srv.URL, func() int { return 3 }, s.put)
	f.Trigger(context.Background())
	stills := s.wait(t, 1)
	time.Sleep(100 * time.Millisecond)
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.stills) != 1 || stills[0].Cam != 0 {
		t.Fatalf("stills: %+v", s.stills)
	}
}

func TestAnOversizedStillIsDropped(t *testing.T) {
	bm := &fakeBM{t: t, n: 1, body: bytes.Repeat([]byte{0xFF}, camera.MaxBytes+1)}
	srv := httptest.NewServer(bm)
	defer srv.Close()
	var got atomic.Int32
	f := camera.New(srv.URL, func() int { return 1 }, func(camera.Still) { got.Add(1) })
	f.Trigger(context.Background())
	deadline := time.Now().Add(time.Second)
	for bm.count("/api/img/cams/0") == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	time.Sleep(100 * time.Millisecond)
	if got.Load() != 0 {
		t.Fatal("an oversized still was sent")
	}
}

func TestOneFetchPerCameraInFlightNewerTriggersCoalesce(t *testing.T) {
	gate := make(chan struct{})
	bm := &fakeBM{t: t, n: 1, gate: gate}
	srv := httptest.NewServer(bm)
	defer srv.Close()
	s := newSink()
	f := camera.New(srv.URL, func() int { return 1 }, s.put)

	f.Trigger(context.Background())
	deadline := time.Now().Add(time.Second)
	for bm.count("/api/img/cams/0") == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	// Three more events while the first fetch hangs: one more fetch, not three
	f.Trigger(context.Background())
	f.Trigger(context.Background())
	f.Trigger(context.Background())
	time.Sleep(50 * time.Millisecond)
	if n := bm.count("/api/img/cams/0"); n != 1 {
		t.Fatalf("requests in flight: %d, want 1", n)
	}
	close(gate)
	s.wait(t, 2)
	time.Sleep(100 * time.Millisecond)
	if n := bm.count("/api/img/cams/0"); n != 2 {
		t.Fatalf("requests: %d, want 2", n)
	}
}

func TestAHangingCameraTimesOut(t *testing.T) {
	gate := make(chan struct{})
	bm := &fakeBM{t: t, n: 1, gate: gate}
	srv := httptest.NewServer(bm)
	defer srv.Close()
	// Release the hanging requests before the server waits for them
	defer close(gate)
	f := camera.New(srv.URL, func() int { return 1 }, func(camera.Still) {})
	f.Timeout = 50 * time.Millisecond
	f.Trigger(context.Background())
	time.Sleep(150 * time.Millisecond)
	// The first fetch gave up, so the next trigger fetches again
	f.Trigger(context.Background())
	time.Sleep(30 * time.Millisecond)
	if n := bm.count("/api/img/cams/0"); n != 2 {
		t.Fatalf("requests: %d, want 2", n)
	}
}

func TestTriggers(t *testing.T) {
	for kind, want := range map[string]bool{
		"dart.detected":    true,
		"dart.corrected":   true,
		"takeout.finished": true,
		"board.resync":     true,
		"takeout.started":  false,
		"dart.moved":       false,
		"motion":           false,
		"bm.frame":         false,
		"board.status":     false,
	} {
		if got := camera.Triggers(kind); got != want {
			t.Errorf("Triggers(%q)=%v want %v", kind, got, want)
		}
	}
}

func TestStillsCarryTheirTriggerRound(t *testing.T) {
	bm := &fakeBM{t: t, n: 2}
	srv := httptest.NewServer(bm)
	defer srv.Close()
	s := newSink()
	f := camera.New(srv.URL, func() int { return 2 }, s.put)
	f.Trigger(context.Background())
	s.wait(t, 2)
	f.Trigger(context.Background())
	all := s.wait(t, 2) // every still so far
	rounds := map[uint64]int{}
	for _, st := range all {
		rounds[st.Round]++
	}
	if len(all) != 4 || len(rounds) != 2 || rounds[0] != 0 {
		t.Fatalf("rounds: %v", rounds)
	}
	for r, n := range rounds {
		if n != 2 {
			t.Errorf("round %d has %d stills, want 2 (one per camera)", r, n)
		}
	}
}
