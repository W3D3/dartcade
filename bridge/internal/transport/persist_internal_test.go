package transport

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/schema"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

// Game data left unacked by a bridge that restarts during a backend outage arrives after
// the restart, under its own boot and seq and before the new boot's events. An ack for the
// old boot never drops the new boot's entry with an overlapping seq.
func TestOutboxSurvivesARestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "outbox.json")
	old := New(Config{BridgeID: "br", BootID: "boot1", OutboxPath: path}, nil)
	old.enqueue([]differ.Event{
		{Kind: "visit.opened", Data: &schema.VisitOpenedData{VisitId: "v"}},
		{Kind: "bm.frame", Data: &schema.BmFrameData{Source: schema.BmFrameDataSourceWs}},
		{Kind: "dart.detected", Data: &schema.DartDetectedData{VisitId: "v"}},
	})
	if err := old.save(); err != nil {
		t.Fatal(err)
	}

	got := make(chan Envelope, 10)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close(websocket.StatusNormalClosure, "")
		ctx := context.Background()
		for n := 0; ; {
			var e Envelope
			if err := wsjson.Read(ctx, c, &e); err != nil {
				return
			}
			if e.Kind == "bridge.hello" {
				continue
			}
			got <- e
			if n++; n == 3 {
				// Only the old boot's events are stored: its last seq is above the new boot's
				wsjson.Write(ctx, c, map[string]any{"ack": 3, "boot_id": "boot1"})
			}
		}
	}))
	t.Cleanup(srv.Close)

	tr := New(Config{BackendURL: "ws" + strings.TrimPrefix(srv.URL, "http"), BridgeID: "br", BootID: "boot2", OutboxPath: path}, nil)
	tr.Send([]differ.Event{{Kind: "board.status", Data: &schema.BoardStatusData{Status: "Idle", Connected: true}}})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint

	type sent struct {
		boot string
		seq  uint64
		kind string
	}
	want := []sent{{"boot1", 1, "visit.opened"}, {"boot1", 3, "dart.detected"}, {"boot2", 1, "board.status"}}
	for i, w := range want {
		select {
		case e := <-got:
			if (sent{e.BootID, e.Seq, e.Kind}) != w {
				t.Fatalf("event %d: got %v, want %v", i, sent{e.BootID, e.Seq, e.Kind}, w)
			}
		case <-ctx.Done():
			t.Fatalf("only %d of %d events arrived", i, len(want))
		}
	}

	// The file ends up holding only the new boot's unacked event
	for {
		envs := loadOutbox(path)
		if len(envs) == 1 && envs[0].BootID == "boot2" && envs[0].Seq == 1 {
			break
		}
		select {
		case <-ctx.Done():
			t.Fatalf("outbox file holds %+v, want only boot2's seq 1", envs)
		case <-time.After(10 * time.Millisecond):
		}
	}
	tr.mu.Lock()
	defer tr.mu.Unlock()
	if len(tr.replay) != 0 || len(tr.outbox) != 1 {
		t.Errorf("replay %d entries, outbox %d: want 0 and 1 (boot2's unacked event)", len(tr.replay), len(tr.outbox))
	}
}
