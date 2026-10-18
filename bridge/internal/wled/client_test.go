package wled

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// TestMain allows loopback for this package's tests: fakeWLED serves on 127.0.0.1, and the
// client/host tests that need it (TestLocalHost, the NewHTTPClient-vs-loopback tests) toggle
// allowLoopback themselves around the specific case that needs it off.
func TestMain(m *testing.M) {
	allowLoopback = true
	os.Exit(m.Run())
}

// fakeWLED answers like a WLED device and records POST bodies.
type fakeWLED struct {
	srv      *httptest.Server
	mac      string
	posts    chan string
	state    string
	slowPost time.Duration // delays every POST /json/state response, so a test can overlap calls for real
}

func newFakeWLED(t *testing.T, mac string) *fakeWLED {
	f := &fakeWLED{mac: mac, posts: make(chan string, 32), state: `{"on":true,"bri":128,"seg":[{"id":0,"start":0,"stop":144}]}`}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/json/info":
			io.WriteString(w, `{"ver":"0.15.0","name":"WLED","mac":"`+f.mac+`","leds":{"count":144}}`)
		case r.Method == http.MethodGet && r.URL.Path == "/json/state":
			io.WriteString(w, f.state)
		case r.Method == http.MethodPost && r.URL.Path == "/json/state":
			if f.slowPost > 0 {
				time.Sleep(f.slowPost)
			}
			b, _ := io.ReadAll(r.Body)
			f.posts <- string(b)
			io.WriteString(w, `{"success":true}`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeWLED) host() string { return strings.TrimPrefix(f.srv.URL, "http://") }

func TestGetInfo(t *testing.T) {
	f := newFakeWLED(t, "a8032a7f3a2c")
	info, err := GetInfo(context.Background(), &http.Client{Timeout: time.Second}, f.host())
	if err != nil {
		t.Fatal(err)
	}
	if info != (Info{Mac: "a8032a7f3a2c", Name: "WLED", Version: "0.15.0", Leds: 144}) {
		t.Errorf("info = %+v", info)
	}
}

func TestGetInfoRejectsNonWLED(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, `{"hello":1}`) }))
	defer srv.Close()
	if _, err := GetInfo(context.Background(), http.DefaultClient, strings.TrimPrefix(srv.URL, "http://")); err == nil {
		t.Fatal("want error for a device without mac/ver")
	}
}

func TestGetStateCountsSegments(t *testing.T) {
	f := newFakeWLED(t, "m")
	_, n, err := GetState(context.Background(), http.DefaultClient, f.host())
	if err != nil || n != 1 {
		t.Fatalf("n=%d err=%v", n, err)
	}
}

func TestPostState(t *testing.T) {
	f := newFakeWLED(t, "m")
	if err := PostState(context.Background(), http.DefaultClient, f.host(), json.RawMessage(`{"on":true}`)); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-f.posts:
		if got != `{"on":true}` {
			t.Errorf("posted %s", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for the POST to arrive")
	}
}

func TestNewHTTPClientRefusesPublicIP(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, "http://8.8.8.8:80/", nil)
	if err != nil {
		t.Fatal(err)
	}
	_, err = NewHTTPClient().Do(req)
	if err == nil || !strings.Contains(err.Error(), "refus") {
		t.Fatalf("want a refusal error dialing a public IP, got %v", err)
	}
}

func TestNewHTTPClientRefusesLoopbackByDefault(t *testing.T) {
	saved := allowLoopback
	allowLoopback = false
	defer func() { allowLoopback = saved }()

	f := newFakeWLED(t, "m")
	if _, err := GetInfo(context.Background(), NewHTTPClient(), f.host()); err == nil || !strings.Contains(err.Error(), "refus") {
		t.Fatalf("want a refusal error dialing loopback when disallowed, got %v", err)
	}
}

func TestNewHTTPClientAllowsLoopbackWhenEnabled(t *testing.T) {
	f := newFakeWLED(t, "m") // allowLoopback is true for this package's tests (see TestMain)
	info, err := GetInfo(context.Background(), NewHTTPClient(), f.host())
	if err != nil {
		t.Fatal(err)
	}
	if info.Mac != "m" {
		t.Errorf("mac = %q, want %q", info.Mac, "m")
	}
}
