package bigscreen

import (
	"bufio"
	"encoding/json"
	"net"
	"sync/atomic"
	"testing"
	"time"

	"dartcade/bridge/internal/schema"
)

type sent struct {
	kind string
	data schema.BigScreenStatusData
}

// startService returns a service whose backend is reachable while online is true.
func startService(t *testing.T) (*Service, chan sent, *atomic.Bool) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ch := make(chan sent, 16)
	online := &atomic.Bool{}
	online.Store(true)
	s := &Service{Version: "v1", Send: func(kind string, data any) bool {
		if !online.Load() {
			return false
		}
		ch <- sent{kind, data.(schema.BigScreenStatusData)}
		return true
	}}
	go s.Serve(ln)
	t.Cleanup(func() { ln.Close() })
	s.Addr = ln.Addr().String()
	return s, ch, online
}

func next(t *testing.T, ch chan sent) sent {
	t.Helper()
	select {
	case m := <-ch:
		return m
	case <-time.After(2 * time.Second):
		t.Fatal("no message sent")
		return sent{}
	}
}

func none(t *testing.T, ch chan sent) {
	t.Helper()
	select {
	case m := <-ch:
		t.Fatalf("unexpected %+v", m)
	case <-time.After(200 * time.Millisecond):
	}
}

// dial connects as a helper would: it says hello first and reads the service's.
func dial(t *testing.T, s *Service) (net.Conn, *bufio.Reader) {
	t.Helper()
	c, r := dialRaw(t, s)
	c.Write([]byte(`{"hello":{"version":"v0"}}` + "\n"))
	if hello, _ := r.ReadString('\n'); hello != `{"hello":{"version":"v1"}}`+"\n" {
		t.Fatalf("hello %q", hello)
	}
	return c, r
}

func dialRaw(t *testing.T, s *Service) (net.Conn, *bufio.Reader) {
	t.Helper()
	c, err := net.Dial("tcp", s.Addr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.Close() })
	return c, bufio.NewReader(c)
}

func TestHandleForwardsToHelper(t *testing.T) {
	s, ch, _ := startService(t)
	c, r := dial(t, s)
	c.Write([]byte(`{"status":{"helper":true,"running":false,"startup":true}}` + "\n"))
	next(t, ch) // forwarded, so the helper is registered
	if !s.Handle("bigscreen.open", json.RawMessage(`{"url":"u"}`)) {
		t.Fatal("not handled")
	}
	if line, _ := r.ReadString('\n'); line != `{"cmd":"open","url":"u"}`+"\n" {
		t.Fatalf("got %q", line)
	}
	s.Handle("bigscreen.close", json.RawMessage(`{}`))
	if line, _ := r.ReadString('\n'); line != `{"cmd":"close"}`+"\n" {
		t.Fatalf("got %q", line)
	}
	if s.Handle("wled.scan", nil) {
		t.Fatal("handled foreign kind")
	}
}

func TestNoHelperReportsAbsent(t *testing.T) {
	s, ch, _ := startService(t)
	s.Handle("bigscreen.open", json.RawMessage(`{"url":"u"}`))
	m := next(t, ch)
	if m.kind != "bigscreen.status" || m.data.Helper || m.data.Running {
		t.Fatalf("got %+v", m)
	}
	s.Announce()
	if m := next(t, ch); m.kind != "bigscreen.status" {
		t.Fatalf("got %+v", m)
	}
}

func TestHelperStatusForwardedAndDisconnect(t *testing.T) {
	s, ch, _ := startService(t)
	c, _ := dial(t, s)
	c.Write([]byte(`{"status":{"helper":true,"running":true,"browser":"chromium"}}` + "\n"))
	m := next(t, ch)
	if m.kind != "bigscreen.status" || !m.data.Running || m.data.Browser == nil || *m.data.Browser != "chromium" {
		t.Fatalf("got %+v", m)
	}
	c.Close()
	if m = next(t, ch); m.data.Helper {
		t.Fatalf("got %+v", m)
	}
}

func TestAnnounceResendsLastStatusWithoutStartup(t *testing.T) {
	s, ch, _ := startService(t)
	c, _ := dial(t, s)
	c.Write([]byte(`{"status":{"helper":true,"running":true,"browser":"chromium","startup":true}}` + "\n"))
	if m := next(t, ch); m.data.Startup == nil || !*m.data.Startup {
		t.Fatalf("got %+v", m)
	}
	var st schema.BigScreenStatusData
	for i := 0; i < 200; i++ {
		s.Announce()
		if st = next(t, ch).data; st.Helper {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !st.Helper || !st.Running {
		t.Fatalf("got %+v", st)
	}
	if st.Startup != nil {
		t.Fatalf("startup repeated: %+v", st)
	}
}

func TestReplacedHelperIsNotReportedAbsent(t *testing.T) {
	s, ch, _ := startService(t)
	c1, _ := dial(t, s)
	c1.Write([]byte(`{"status":{"helper":true,"running":false}}` + "\n"))
	next(t, ch)
	c2, r2 := dial(t, s)
	c2.Write([]byte(`{"status":{"helper":true,"running":true}}` + "\n"))
	if m := next(t, ch); !m.data.Running {
		t.Fatalf("got %+v", m)
	}
	none(t, ch)
	s.Handle("bigscreen.close", json.RawMessage(`{}`))
	if line, _ := r2.ReadString('\n'); line != `{"cmd":"close"}`+"\n" {
		t.Fatalf("got %q", line)
	}
}

// A connection that doesn't say hello (a browser's fetch to the port, any process sending
// garbage, one that stays silent) must neither evict the connected helper nor take its slot.
func TestStrayConnectionDoesNotEvictHelper(t *testing.T) {
	s, ch, _ := startService(t)
	c, r := dial(t, s)
	c.Write([]byte(`{"status":{"helper":true,"running":false}}` + "\n"))
	next(t, ch)

	http, httpR := dialRaw(t, s)
	http.Write([]byte("GET / HTTP/1.1\r\nHost: 127.0.0.1:47817\r\n\r\n"))
	garbage, _ := dialRaw(t, s)
	garbage.Write([]byte(`{"status":{"helper":true,"running":true,"startup":true}}` + "\n"))
	silent, _ := dialRaw(t, s)
	_ = silent

	if line, _ := httpR.ReadString('\n'); line != "" { // closed without an answer
		t.Fatalf("answered %q", line)
	}
	none(t, ch) // no status forwarded, nobody reported absent
	s.Handle("bigscreen.open", json.RawMessage(`{"url":"u"}`))
	if line, _ := r.ReadString('\n'); line != `{"cmd":"open","url":"u"}`+"\n" {
		t.Fatalf("the helper lost its slot, got %q", line)
	}
	none(t, ch)
}

func TestStartupSurvivesDisconnectOnce(t *testing.T) {
	s, ch, online := startService(t)
	online.Store(false)
	c, _ := dial(t, s)
	c.Write([]byte(`{"status":{"helper":true,"running":false,"startup":true}}` + "\n"))
	for i := 0; i < 200; i++ {
		s.mu.Lock()
		got := s.last != nil
		s.mu.Unlock()
		if got {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	online.Store(true)
	s.Announce()
	if m := next(t, ch); m.data.Startup == nil || !*m.data.Startup {
		t.Fatalf("startup lost: %+v", m)
	}
	s.Announce()
	if m := next(t, ch); m.data.Startup != nil {
		t.Fatalf("startup repeated: %+v", m)
	}
}
