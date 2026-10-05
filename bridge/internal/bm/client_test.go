package bm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// A Board Manager that never answers must not hang the bridge: every call is bounded by
// the shared client's timeout, and commands give up when their ctx does.
func TestCommandsGiveUpOnAHungBoardManager(t *testing.T) {
	if httpClient.Timeout <= 0 {
		t.Fatal("the Board Manager HTTP client has no timeout")
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()
	c := NewClient(srv.URL)

	cmds := map[string]func(context.Context) (int, error){
		"reset": c.Reset,
		"start": c.StartDetection,
		"stop":  c.StopDetection,
	}
	for name, run := range cmds {
		ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
		start := time.Now()
		_, err := run(ctx)
		cancel()
		if err == nil {
			t.Errorf("%s: no error from a Board Manager that never answered", name)
		}
		if d := time.Since(start); d > 2*time.Second {
			t.Errorf("%s: took %v, want it to stop at the ctx deadline", name, d)
		}
	}
}

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

func TestResetPostsToTheBoard(t *testing.T) {
	var method, path string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method, path = r.Method, r.URL.Path
	}))
	defer srv.Close()

	status, err := NewClient(srv.URL).Reset(context.Background())
	if err != nil || status != http.StatusOK {
		t.Fatalf("Reset = %d, %v", status, err)
	}
	if method != http.MethodPost || path != "/api/reset" {
		t.Errorf("got %s %s, want POST /api/reset", method, path)
	}
}
