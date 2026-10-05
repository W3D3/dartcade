package transport

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"dartcade/bridge/internal/camera"
	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/schema"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// An event waiting in the outbox goes out before a camera still that is ready at the same
// time, so a slow uplink never holds a dart behind pictures.
func TestEventsGoBeforeStills(t *testing.T) {
	kinds := make(chan string, 8)
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
			if err := wsjson.Read(context.Background(), c, &m); err != nil {
				return
			}
			if m.Kind != "bridge.hello" {
				kinds <- m.Kind
			}
		}
	}))
	defer srv.Close()

	tr := New(Config{BackendURL: "ws" + strings.TrimPrefix(srv.URL, "http"), BridgeID: "br", BootID: "bt"}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint
	for !tr.Connected() && ctx.Err() == nil {
		time.Sleep(5 * time.Millisecond)
	}

	// Both ready together: the event is in the outbox (no wake signal yet), the still queued
	tr.enqueue([]differ.Event{{Kind: "dart.detected", Data: &schema.DartDetectedData{VisitId: "v", Dart: schema.Dart{Segment: schema.Segment{Name: "S20", Number: 20, Bed: "SingleOuter", Multiplier: 1}, Score: 20}}}})
	tr.stills <- StillMessage(camera.Still{Cam: 0, CapturedAt: time.Now(), JPEG: []byte{1}})

	for _, want := range []string{"dart.detected", "camera.still"} {
		select {
		case got := <-kinds:
			if got != want {
				t.Fatalf("got %q, want %q", got, want)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("no %s", want)
		}
	}
}
