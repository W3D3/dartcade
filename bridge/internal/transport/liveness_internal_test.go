package transport

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// A backend that stopped answering (no pong, no ack) is dropped and redialled even while it keeps
// sending commands: the big screen asks for the board's status every few seconds, which kept a
// stuck connection "online" for good.
func TestABackendThatOnlySendsCommandsIsDropped(t *testing.T) {
	defer func(every, dead time.Duration) { heartbeatEvery, deadAfter = every, dead }(heartbeatEvery, deadAfter)
	heartbeatEvery, deadAfter = 50*time.Millisecond, 300*time.Millisecond

	var conns atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer c.CloseNow()
		conns.Add(1)
		go func() {
			for {
				if _, _, err := c.Read(r.Context()); err != nil {
					return
				}
			}
		}()
		for c.Write(r.Context(), websocket.MessageText, []byte(`{"kind":"bm.request","data":{"id":"x","op":"state"}}`)) == nil {
			time.Sleep(50 * time.Millisecond)
		}
	}))
	defer s.Close()

	tr := New(Config{BackendURL: "ws" + strings.TrimPrefix(s.URL, "http"), BridgeID: "br", BootID: "bt"})
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	tr.Start(ctx) //nolint

	if got := conns.Load(); got < 2 {
		t.Errorf("%d connection(s), want a redial after the backend stopped answering", got)
	}
}
