package camera

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func solidJPEG(t *testing.T, size int, c color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, size, size))
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3] = c.R, c.G, c.B, 255
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

type configServer struct {
	srv   *httptest.Server
	reads atomic.Int32
}

func newConfigServer(t *testing.T, body string) *configServer {
	cs := &configServer{}
	cs.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/config" {
			http.NotFound(w, r)
			return
		}
		cs.reads.Add(1)
		w.Write([]byte(body))
	}))
	t.Cleanup(cs.srv.Close)
	return cs
}

type stillSink struct {
	mu  sync.Mutex
	got []Still
	ch  chan Still
}

func newStillSink() *stillSink { return &stillSink{ch: make(chan Still, 16)} }
func (s *stillSink) send(st Still) {
	s.mu.Lock()
	s.got = append(s.got, st)
	s.mu.Unlock()
	s.ch <- st
}
func (s *stillSink) next(t *testing.T) Still {
	t.Helper()
	select {
	case st := <-s.ch:
		return st
	case <-time.After(3 * time.Second):
		t.Fatal("no combined still")
	}
	return Still{}
}
func (s *stillSink) none(t *testing.T, wait time.Duration) {
	t.Helper()
	select {
	case st := <-s.ch:
		t.Fatalf("unexpected still: cam %d", st.Cam)
	case <-time.After(wait):
	}
}

func newTestCompositor(baseURL string, sink *stillSink) *Compositor {
	c := NewCompositor(baseURL, sink.send)
	c.Debounce = 10 * time.Millisecond
	return c
}

func TestCompositorSendsACombinedStillAfterARound(t *testing.T) {
	cs := newConfigServer(t, realConfig)
	sink := newStillSink()
	c := newTestCompositor(cs.srv.URL, sink)
	ctx := context.Background()
	now := time.Now()
	for i, col := range []color.RGBA{{200, 0, 0, 255}, {0, 200, 0, 255}, {0, 0, 200, 255}} {
		c.Add(ctx, Still{Cam: i, CapturedAt: now, JPEG: solidJPEG(t, 60, col)})
	}
	st := sink.next(t)
	if st.Cam != CombinedCam || !st.CapturedAt.Equal(now) {
		t.Errorf("still: cam %d at %v", st.Cam, st.CapturedAt)
	}
	img, err := jpeg.Decode(bytes.NewReader(st.JPEG))
	if err != nil || img.Bounds().Dx() != 60 {
		t.Fatalf("not a 60 px JPEG: %v", err)
	}
	// The three Adds in a row made one compose, from one config read
	sink.none(t, 100*time.Millisecond)
	if n := cs.reads.Load(); n != 1 {
		t.Errorf("config reads: %d", n)
	}
}

func TestCompositorNeverMixesRounds(t *testing.T) {
	cs := newConfigServer(t, realConfig)
	sink := newStillSink()
	c := newTestCompositor(cs.srv.URL, sink)
	ctx := context.Background()
	now := time.Now()
	green := solidJPEG(t, 60, color.RGBA{0, 200, 0, 255})
	// Round 5 from cameras 1 and 2; camera 0's still of round 4 (the dart before) arrives late
	c.Add(ctx, Still{Cam: 1, Round: 5, CapturedAt: now, JPEG: green})
	c.Add(ctx, Still{Cam: 2, Round: 5, CapturedAt: now, JPEG: green})
	c.Add(ctx, Still{Cam: 0, Round: 4, CapturedAt: now, JPEG: solidJPEG(t, 60, color.RGBA{220, 0, 0, 255})})
	check := func(st Still) {
		img, err := jpeg.Decode(bytes.NewReader(st.JPEG))
		if err != nil {
			t.Fatal(err)
		}
		for y := 0; y < 60; y++ {
			for x := 0; x < 60; x++ {
				if r, _, _, _ := img.At(x, y).RGBA(); r>>8 > 120 { // JPEG ringing at black edges stays far below the red (220)
					t.Fatalf("camera 0's round-4 picture in round 5's combined still at (%d, %d)", x, y)
				}
			}
		}
	}
	check(sink.next(t))
	// A late compose (if any) is still round 5 from cameras 1–2
	select {
	case st := <-sink.ch:
		check(st)
	case <-time.After(100 * time.Millisecond):
	}
}

func TestCompositorNeedsTwoCameras(t *testing.T) {
	cs := newConfigServer(t, realConfig)
	sink := newStillSink()
	c := newTestCompositor(cs.srv.URL, sink)
	c.Add(context.Background(), Still{Cam: 0, CapturedAt: time.Now(), JPEG: solidJPEG(t, 60, color.RGBA{1, 2, 3, 255})})
	sink.none(t, 100*time.Millisecond)
	// A second camera, but of another round: still not a round of two
	c.Add(context.Background(), Still{Cam: 1, Round: 1, CapturedAt: time.Now(), JPEG: solidJPEG(t, 60, color.RGBA{1, 2, 3, 255})})
	sink.none(t, 100*time.Millisecond)
}

func TestCompositorSkipsWithoutCalibration(t *testing.T) {
	cs := newConfigServer(t, `{"auth":{"api_key":"k"},"cam":{"width":1280,"height":720}}`)
	sink := newStillSink()
	c := newTestCompositor(cs.srv.URL, sink)
	now := time.Now()
	c.Add(context.Background(), Still{Cam: 0, CapturedAt: now, JPEG: solidJPEG(t, 60, color.RGBA{1, 2, 3, 255})})
	c.Add(context.Background(), Still{Cam: 1, CapturedAt: now, JPEG: solidJPEG(t, 60, color.RGBA{1, 2, 3, 255})})
	sink.none(t, 150*time.Millisecond)
}

func TestCompositorRereadsTheCalibrationWhenItChangesOrGetsOld(t *testing.T) {
	cs := newConfigServer(t, realConfig)
	sink := newStillSink()
	c := newTestCompositor(cs.srv.URL, sink)
	clock := time.Now()
	var mu sync.Mutex
	c.now = func() time.Time { mu.Lock(); defer mu.Unlock(); return clock }
	round := func() {
		mu.Lock()
		at := clock
		mu.Unlock()
		for i := 0; i < 2; i++ {
			c.Add(context.Background(), Still{Cam: i, CapturedAt: at, JPEG: solidJPEG(t, 60, color.RGBA{9, 9, 9, 255})})
		}
		sink.next(t)
	}
	round()
	round()
	if n := cs.reads.Load(); n != 1 {
		t.Fatalf("config reads after two rounds: %d, want 1", n)
	}
	c.CalibrationChanged()
	round()
	if n := cs.reads.Load(); n != 2 {
		t.Fatalf("config reads after a calibration: %d, want 2", n)
	}
	mu.Lock()
	clock = clock.Add(11 * time.Minute)
	mu.Unlock()
	round()
	if n := cs.reads.Load(); n != 3 {
		t.Fatalf("config reads after 11 minutes: %d, want 3", n)
	}
}

func TestCalibrationEvent(t *testing.T) {
	for _, s := range []string{"Calibrating", "Calibration finished", "Calibration started"} {
		if !IsCalibration(s) {
			t.Errorf("%q", s)
		}
	}
	for _, s := range []string{"Throw", "Takeout finished", ""} {
		if IsCalibration(s) {
			t.Errorf("%q", s)
		}
	}
}
