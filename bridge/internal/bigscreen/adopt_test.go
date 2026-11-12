package bigscreen

import (
	"sync"
	"testing"
)

// adoptLauncher is a fakeLauncher with a kiosk that was already open before the helper started.
type adoptLauncher struct {
	fakeLauncher
	existing *Running
	killed   chan struct{}
}

func newAdoptLauncher() *adoptLauncher {
	done, killed := make(chan struct{}), make(chan struct{})
	var once sync.Once
	a := &adoptLauncher{killed: killed}
	a.existing = &Running{Browser: "chromium", Done: done, Kill: func() {
		once.Do(func() { close(killed); close(done) })
	}}
	return a
}

func (a *adoptLauncher) Adopt() *Running {
	select {
	case <-a.killed:
		return nil
	default:
		return a.existing
	}
}

func TestHelperAdoptsAKioskAlreadyOpen(t *testing.T) {
	a := newAdoptLauncher()
	_, r, _ := runHelper(t, "v1", a)
	if s := readStatus(t, r); !s.Helper || !s.Running || s.Browser != "chromium" || !s.Startup {
		t.Fatalf("hello %+v", s)
	}
}

func TestHelperCloseEndsAnAdoptedKiosk(t *testing.T) {
	a := newAdoptLauncher()
	c, r, _ := runHelper(t, "v1", a)
	readStatus(t, r)
	c.Write([]byte(`{"cmd":"close"}` + "\n"))
	if s := readStatus(t, r); s.Running {
		t.Fatalf("close %+v", s)
	}
	select {
	case <-a.killed:
	default:
		t.Fatal("the adopted kiosk was not closed")
	}
}

func TestHelperOpenReplacesAnAdoptedKiosk(t *testing.T) {
	a := newAdoptLauncher()
	c, r, _ := runHelper(t, "v1", a)
	readStatus(t, r)
	c.Write([]byte(`{"cmd":"open","url":"https://a.b/"}` + "\n"))
	if s := readStatus(t, r); !s.Running {
		t.Fatalf("open %+v", s)
	}
	select {
	case <-a.killed:
	default:
		t.Fatal("a second window opened beside the adopted one")
	}
	if len(a.urls) != 1 {
		t.Fatalf("urls %v", a.urls)
	}
}

func TestHelperReportsAnAdoptedKioskThatExits(t *testing.T) {
	a := newAdoptLauncher()
	_, r, _ := runHelper(t, "v1", a)
	readStatus(t, r)
	a.existing.Kill() // the window is closed by hand
	if s := readStatus(t, r); s.Running {
		t.Fatalf("exit %+v", s)
	}
}
