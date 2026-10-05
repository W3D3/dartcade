package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"

	"dartcade/bridge/internal/bm"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const recording = "../../internal/differ/testdata/first-dart.jsonl"

func TestForEachFrameReadsTheRecording(t *testing.T) {
	var kinds []string
	err := forEachFrame(recording, func(f bm.BMFrame) error {
		kinds = append(kinds, f.Kind)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(kinds) == 0 || kinds[0] != "bm_connect" {
		t.Errorf("frames %v, want the recording starting with bm_connect", kinds)
	}

	stop := errors.New("stop")
	n := 0
	err = forEachFrame(recording, func(bm.BMFrame) error { n++; return stop })
	if !errors.Is(err, stop) || n != 1 {
		t.Errorf("got %v after %d frames, want it to stop at the first error", err, n)
	}
}

// The recording is closed after each replay.
func TestForEachFrameClosesTheRecording(t *testing.T) {
	fds := func() int {
		entries, err := os.ReadDir("/proc/self/fd")
		if err != nil {
			t.Skip("no /proc/self/fd")
		}
		return len(entries)
	}
	before := fds()
	for range 20 {
		if err := forEachFrame(recording, func(bm.BMFrame) error { return nil }); err != nil {
			t.Fatal(err)
		}
	}
	if after := fds(); after > before+2 {
		t.Errorf("%d open files after 20 replays, %d before", after, before)
	}
}

func TestReplayToBackendSendsEveryEvent(t *testing.T) {
	got := make(chan string, 64)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close(websocket.StatusNormalClosure, "")
		for {
			var m struct {
				Kind string `json:"kind"`
			}
			if err := wsjson.Read(r.Context(), c, &m); err != nil {
				close(got)
				return
			}
			got <- m.Kind
		}
	}))
	defer srv.Close()

	runReplayToBackend("ws"+strings.TrimPrefix(srv.URL, "http"), recording)
	var kinds []string
	for k := range got {
		kinds = append(kinds, k)
	}
	if len(kinds) == 0 || kinds[0] != "bridge.hello" || !slices.Contains(kinds, "dart.detected") {
		t.Errorf("backend got %v, want the hello and the recording's events", kinds)
	}
}

func TestWithoutQueryHidesTheToken(t *testing.T) {
	msg := `Get "http://h:3000/bridge?token=s3cr3t": connection refused`
	got := withoutQuery(msg, "ws://h:3000/bridge?token=s3cr3t")
	if strings.Contains(got, "s3cr3t") {
		t.Errorf("token still in %q", got)
	}
	if got := withoutQuery("x", "ws://h/bridge"); got != "x" {
		t.Errorf("got %q for a URL without a query", got)
	}
}
