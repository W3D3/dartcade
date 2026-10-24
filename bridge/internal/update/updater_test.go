package update

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"dartcade/bridge/internal/schema"
)

type sent struct {
	mu   sync.Mutex
	msgs []schema.BridgeUpdateStatusData
}

func (s *sent) send(v any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.msgs = append(s.msgs, v.(map[string]any)["data"].(schema.BridgeUpdateStatusData))
}

func (s *sent) phases() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []string
	for _, m := range s.msgs {
		out = append(out, string(m.Phase))
	}
	return out
}

func TestUpdaterInstallsInProcessAndRestarts(t *testing.T) {
	newRelease(t, "v0.9.2", "v0.9.2")
	exe := filepath.Join(t.TempDir(), "dartcade-bridge")
	os.WriteFile(exe, []byte("old"), 0o755)
	var s sent
	restarted := make(chan struct{})
	u := &Updater{StateDir: t.TempDir(), Current: tag("v0.9.0"), Executable: exe, Send: s.send, Restart: func() { close(restarted) }}
	u.Handle(context.Background(), []byte(`{"version":"v0.9.2"}`))
	select {
	case <-restarted:
	case <-time.After(10 * time.Second):
		t.Fatalf("no restart; sent %v", s.phases())
	}
	if got := strings.Join(s.phases(), ","); got != "downloading,verifying,installing,restarting" {
		t.Fatalf("phases %s", got)
	}
	if b, _ := os.ReadFile(exe); !strings.Contains(string(b), "echo v0.9.2") {
		t.Fatal("the executable was not replaced")
	}
}

func TestUpdaterRefusesWhenItCannotUpdate(t *testing.T) {
	var s sent
	u := &Updater{Unavailable: "not a service", Send: s.send, Restart: func() { t.Fatal("restarted") }}
	u.Handle(context.Background(), []byte(`{"version":"v0.9.2"}`))
	u.Handle(context.Background(), []byte(`{"version":"https://evil.example/x"}`))
	if len(s.msgs) != 1 || s.msgs[0].Phase != "failed" || *s.msgs[0].Error != "not a service" {
		t.Fatalf("sent %+v", s.msgs)
	}
}
