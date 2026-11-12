package bm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"dartcade/bridge/internal/backoff"

	"github.com/coder/websocket"
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

// A Board Manager that stops answering without closing its socket (a hung process, or the
// network to it gone) is noticed by the ping and reported down, a handshake it never answers
// gives up, and once it answers again the bridge reconnects (the board's game goes on).
func TestWSLoopRecoversFromAFrozenBoardManager(t *testing.T) {
	defer func(p backoff.Policy, every, timeout, dial time.Duration) {
		backoff.Reconnect, pingEvery, pingTimeout, dialTimeout = p, every, timeout, dial
	}(backoff.Reconnect, pingEvery, pingTimeout, dialTimeout)
	backoff.Reconnect.Max = 100 * time.Millisecond
	pingEvery, pingTimeout, dialTimeout = 100*time.Millisecond, 200*time.Millisecond, 300*time.Millisecond

	const (
		hangAfterAccept = iota
		hangHandshake
		answer
	)
	var mode atomic.Int32
	gone := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch mode.Load() {
		case hangHandshake:
			<-gone
			return
		case hangAfterAccept:
			if _, err := websocket.Accept(w, r, nil); err == nil {
				<-gone // never reads, so never answers a ping
			}
			return
		}
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		go func() {
			for {
				if _, _, err := c.Read(r.Context()); err != nil {
					return
				}
			}
		}()
		for c.Write(r.Context(), websocket.MessageText, []byte(`{"type":"state","data":{"throws":[]}}`)) == nil {
			time.Sleep(20 * time.Millisecond)
		}
	}))
	defer srv.Close()
	defer close(gone) // before Close, which waits for the hung handlers
	c := NewClient(srv.URL)
	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	defer func() { cancel(); <-stopped }()
	go func() { c.wsLoop(ctx); close(stopped) }()

	waitFrame(t, c, "bm_connect")
	if !c.Linked() {
		t.Error("not linked while connected")
	}
	mode.Store(hangHandshake)
	waitFrame(t, c, "bm_disconnect")
	if c.Linked() {
		t.Error("still linked to a frozen Board Manager")
	}
	time.Sleep(2 * dialTimeout) // a dial or two hangs and gives up
	mode.Store(answer)
	waitFrame(t, c, "bm_reconnect")
	waitFrame(t, c, "ws")
}

func waitFrame(t *testing.T, c *Client, kind string) {
	t.Helper()
	timeout := time.After(3 * time.Second)
	for {
		select {
		case f := <-c.Frames():
			if f.Kind == kind {
				return
			}
		case <-timeout:
			t.Fatalf("no %s frame", kind)
		}
	}
}
