package bm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Frames is closed once Start returns, so readers see the end instead of blocking, and
// nothing is sent on it afterwards.
func TestFramesClosedWhenStartReturns(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/version":
			w.Write([]byte(`{"version":"1.0.7"}`))
		case "/api/config":
			w.Write([]byte(`{"auth":{"board_id":"b1"},"cam":{"cams":["a","b","c"]}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	c := NewClient(srv.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	if err := c.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}
	for range c.Frames() {
	}
}

// A Board Manager that answers with an error or something that isn't JSON fails Init,
// rather than leaving the bridge with an empty board_id and no cameras.
func TestInitChecksBoardManagerResponses(t *testing.T) {
	const version, config = `{"version":"1.0.7"}`, `{"auth":{"board_id":"b1"},"cam":{"cams":["a","b","c"]}}`
	cases := map[string]struct {
		version, config string
		status          int
		wantErr         bool
	}{
		"ok":                   {version, config, 0, false},
		"version is html":      {"<html>oops</html>", config, 0, true},
		"config is html":       {version, "<html>oops</html>", 0, true},
		"board manager errors": {version, config, http.StatusInternalServerError, true},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tc.status != 0 {
					w.WriteHeader(tc.status)
				}
				switch r.URL.Path {
				case "/api/version":
					w.Write([]byte(tc.version))
				case "/api/config":
					w.Write([]byte(tc.config))
				}
			}))
			defer srv.Close()
			c := NewClient(srv.URL)
			err := c.Init(context.Background())
			if tc.wantErr {
				if err == nil {
					t.Fatalf("Init succeeded with board_id %q and %d cameras", c.BoardID(), c.CameraCount())
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if c.BMVersion() != "1.0.7" || c.BoardID() != "b1" || c.CameraCount() != 3 {
				t.Errorf("version %q board %q cameras %d", c.BMVersion(), c.BoardID(), c.CameraCount())
			}
		})
	}
}

// A poll whose GET was in flight when a WS frame arrived may hold older state; emitting it
// after the WS frame would replay darts or a visit (#211). A poll with no WS frame in
// between, as when the WS is down, is still emitted.
func TestPollDroppedIfAWSFrameArrivedMeanwhile(t *testing.T) {
	inGet, release := make(chan struct{}), make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inGet <- struct{}{}
		<-release
		w.Write([]byte(`{"throws":[{"segment":{"name":"S9"}}]}`))
	}))
	defer srv.Close()
	c := NewClient(srv.URL)

	done := make(chan struct{})
	go func() { c.pollOnce(context.Background()); close(done) }()
	<-inGet
	c.emitRawWS([]byte(`{"type":"state","data":{"throws":[]}}`))
	release <- struct{}{}
	<-done
	if f := <-c.Frames(); f.Kind != "ws" {
		t.Fatalf("first frame %q, want ws", f.Kind)
	}
	if len(c.Frames()) != 0 {
		t.Fatalf("stale poll emitted after the WS frame: %+v", <-c.Frames())
	}

	done = make(chan struct{})
	go func() { c.pollOnce(context.Background()); close(done) }()
	<-inGet
	release <- struct{}{}
	<-done
	if f := <-c.Frames(); f.Kind != "poll" {
		t.Fatalf("frame %q, want poll when no WS frame arrived", f.Kind)
	}
}
