package bigscreen

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net"
	"os"
	"sync"
	"testing"
	"time"
)

type fakeLauncher struct {
	mu     sync.Mutex
	urls   []string
	killed int
	last   *Running
}

func (f *fakeLauncher) Launch(url string) (*Running, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.urls = append(f.urls, url)
	done := make(chan struct{})
	var once sync.Once
	end := func() { once.Do(func() { close(done) }) }
	f.last = &Running{Browser: "chromium", Done: done, Kill: func() {
		f.mu.Lock()
		f.killed++
		f.mu.Unlock()
		end()
	}}
	return f.last, nil
}

func (f *fakeLauncher) killCount() int { f.mu.Lock(); defer f.mu.Unlock(); return f.killed }

type status struct {
	Helper  bool   `json:"helper"`
	Running bool   `json:"running"`
	Startup bool   `json:"startup"`
	Browser string `json:"browser"`
}

func readStatus(t *testing.T, r *bufio.Reader) status {
	t.Helper()
	var m struct{ Status status }
	line, err := r.ReadBytes('\n')
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(line, &m); err != nil {
		t.Fatal(err)
	}
	return m.Status
}

func runHelper(t *testing.T, version string, l Launcher) (net.Conn, *bufio.Reader, chan error) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	errc := make(chan error, 1)
	go func() { errc <- RunHelper(ctx, ln.Addr().String(), l, "v1") }()
	c, err := ln.Accept()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.Close() })
	r := bufio.NewReader(c)
	if line, _ := r.ReadString('\n'); line != `{"hello":{"version":"v1"}}`+"\n" {
		t.Fatalf("helper did not speak first: %q", line)
	}
	c.Write([]byte(`{"hello":{"version":"` + version + `"}}` + "\n"))
	return c, r, errc
}

func TestHelperOpenReplacesAndCloseKills(t *testing.T) {
	l := &fakeLauncher{}
	c, r, _ := runHelper(t, "v1", l)
	if s := readStatus(t, r); !s.Helper || s.Running || !s.Startup {
		t.Fatalf("startup %+v", s)
	}
	c.Write([]byte(`{"cmd":"open","url":"https://a.b/"}` + "\n"))
	if s := readStatus(t, r); !s.Running || s.Browser != "chromium" || s.Startup {
		t.Fatalf("open %+v", s)
	}
	c.Write([]byte(`{"cmd":"open","url":"https://b.c/"}` + "\n"))
	if s := readStatus(t, r); !s.Running {
		t.Fatalf("replace %+v", s)
	}
	if l.killCount() != 1 || len(l.urls) != 2 {
		t.Fatalf("kills %d urls %v", l.killCount(), l.urls)
	}
	c.Write([]byte(`{"cmd":"close"}` + "\n"))
	if s := readStatus(t, r); s.Running {
		t.Fatalf("close %+v", s)
	}
	if l.killCount() != 2 {
		t.Fatalf("kills %d", l.killCount())
	}
}

func TestHelperReportsBrowserExit(t *testing.T) {
	l := &fakeLauncher{}
	c, r, _ := runHelper(t, "v1", l)
	readStatus(t, r)
	c.Write([]byte(`{"cmd":"open","url":"https://a.b/"}` + "\n"))
	readStatus(t, r)
	l.last.Kill() // the user closes the window
	if s := readStatus(t, r); s.Running || s.Startup || !s.Helper {
		t.Fatalf("%+v", s)
	}
}

func TestHelperVersionMismatch(t *testing.T) {
	_, _, errc := runHelper(t, "v2", &fakeLauncher{})
	select {
	case err := <-errc:
		if !errors.Is(err, ErrVersionMismatch) {
			t.Fatalf("got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("did not exit")
	}
}

func TestHelperRefusesBadURLs(t *testing.T) {
	for url, ok := range map[string]bool{
		"--gpu-launcher=x":    false,
		"file:///etc/passwd":  false,
		"javascript:alert(1)": false,
		"":                    false,
		"https://example.com/#/big-screen/b1?k=abc": true,
	} {
		if validURL(url) != ok {
			t.Errorf("validURL(%q) = %v", url, !ok)
		}
	}
	l := &fakeLauncher{}
	c, r, _ := runHelper(t, "v1", l)
	readStatus(t, r)
	c.Write([]byte(`{"cmd":"open","url":"file:///etc/passwd"}` + "\n"))
	if s := readStatus(t, r); s.Running {
		t.Fatalf("%+v", s)
	}
	if len(l.urls) != 0 {
		t.Fatalf("launched %v", l.urls)
	}
}

func TestMismatchKillsBrowserAndReexecs(t *testing.T) {
	old, oldR := retryDelay, reexecDelay
	retryDelay, reexecDelay = 10*time.Millisecond, time.Millisecond
	t.Cleanup(func() { retryDelay, reexecDelay = old, oldR })
	t.Setenv(ReexecEnv, "")
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	l := &fakeLauncher{}
	calls := make(chan struct{}, 4)
	errc := make(chan error, 1)
	go func() {
		errc <- RunHelperReexec(context.Background(), ln.Addr().String(), l, "v1", func() error { calls <- struct{}{}; return nil })
	}()
	c, _ := ln.Accept()
	r := bufio.NewReader(c)
	r.ReadString('\n') // the helper's hello
	c.Write([]byte(`{"hello":{"version":"v1"}}` + "\n" + `{"cmd":"open","url":"https://a.b/"}` + "\n"))
	readStatus(t, r)
	readStatus(t, r)
	c.Close() // the bridge restarts into a new release
	c2, err := ln.Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer c2.Close()
	bufio.NewReader(c2).ReadString('\n')
	c2.Write([]byte(`{"hello":{"version":"v2"}}` + "\n"))
	if err := <-errc; err != nil {
		t.Fatal(err)
	}
	if l.killCount() != 1 || len(calls) != 1 {
		t.Fatalf("kills %d reexecs %d", l.killCount(), len(calls))
	}
	if os.Getenv(ReexecEnv) != "v2" {
		t.Fatalf("marker %q", os.Getenv(ReexecEnv))
	}
}

func TestMismatchWithMarkerStaysRunning(t *testing.T) {
	t.Setenv(ReexecEnv, "v2")
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	l := &fakeLauncher{}
	reexecs := make(chan struct{}, 1)
	go RunHelperReexec(ctx, ln.Addr().String(), l, "v1", func() error { reexecs <- struct{}{}; return nil })
	c, err := ln.Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	r := bufio.NewReader(c)
	r.ReadString('\n') // the helper's hello
	c.Write([]byte(`{"hello":{"version":"v2"}}` + "\n" + `{"cmd":"open","url":"https://a.b/"}` + "\n"))
	readStatus(t, r)
	if s := readStatus(t, r); !s.Running {
		t.Fatalf("%+v", s)
	}
	if len(reexecs) != 0 {
		t.Fatal("re-executed")
	}
}
