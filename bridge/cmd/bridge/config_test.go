package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestToHTTPBase(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"wss://dartcade.example.com", "https://dartcade.example.com"},
		{"ws://localhost:3000", "http://localhost:3000"},
		{"https://already.example.com", "https://already.example.com"},
		{"http://localhost:3000", "http://localhost:3000"},
		// The backend URL carries the WS path (/bridge) and may carry a
		// query — pairing endpoints live at the origin, so both are dropped.
		{"ws://localhost:3000/bridge", "http://localhost:3000"},
		{"wss://dartcade.example.com/bridge", "https://dartcade.example.com"},
		{"ws://localhost:3000/bridge?token=abc", "http://localhost:3000"},
	}
	for _, tc := range cases {
		got := toHTTPBase(tc.in)
		if got != tc.want {
			t.Errorf("toHTTPBase(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestPersistToken(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bridge.toml")
	persistToken(path, "mytoken123")

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `token = "mytoken123"`) {
		t.Errorf("token not written, got: %s", data)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0600 {
		t.Errorf("expected 0600, got %o", info.Mode().Perm())
	}
}

func TestRunPairing_Success(t *testing.T) {
	expiry := time.Now().Add(10 * time.Minute)

	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == "POST" && r.URL.Path == "/api/pairing/request":
			json.NewEncoder(w).Encode(map[string]string{
				"code":      "ABCD1234",
				"expiresAt": expiry.Format(time.RFC3339),
			})
		case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/api/pairing/"):
			callCount++
			if callCount < 2 {
				json.NewEncoder(w).Encode(map[string]string{"status": "pending"})
			} else {
				json.NewEncoder(w).Encode(map[string]string{"status": "claimed", "token": "tok-secret"})
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	cfg := Config{BackendURL: srv.URL, BridgeID: "br_test"}
	token, err := runPairing(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "tok-secret" {
		t.Errorf("got token %q, want %q", token, "tok-secret")
	}
}

// The dev backend URL carries the WS path (ws://host/bridge). Pairing must
// still reach /api/pairing/* at the origin, not /bridge/api/pairing/*.
func TestRunPairing_BackendURLWithPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == "POST" && r.URL.Path == "/api/pairing/request":
			json.NewEncoder(w).Encode(map[string]string{
				"code":      "ABCD1234",
				"expiresAt": time.Now().Add(10 * time.Minute).Format(time.RFC3339),
			})
		case r.Method == "GET" && r.URL.Path == "/api/pairing/ABCD1234/token":
			json.NewEncoder(w).Encode(map[string]string{"status": "claimed", "token": "tok-path"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	cfg := Config{BackendURL: srv.URL + "/bridge", BridgeID: "br_test"}
	token, err := runPairing(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "tok-path" {
		t.Errorf("got token %q, want %q", token, "tok-path")
	}
}

func TestRunPairing_CtxCancelledDuringRequest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := runPairing(ctx, Config{BackendURL: srv.URL, BridgeID: "br_test"})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("expected DeadlineExceeded, got: %v", err)
	}
}

func TestRunPairing_RetryAfterExpiry(t *testing.T) {
	requestCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == "POST" && r.URL.Path == "/api/pairing/request":
			requestCount++
			expiry := time.Now().Add(10 * time.Minute)
			if requestCount == 1 {
				expiry = time.Now().Add(100 * time.Millisecond) // first code expires fast
			}
			json.NewEncoder(w).Encode(map[string]string{
				"code":      "ABCD1234",
				"expiresAt": expiry.Format(time.RFC3339),
			})
		case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/api/pairing/"):
			if requestCount >= 2 {
				json.NewEncoder(w).Encode(map[string]string{"status": "claimed", "token": "tok-retry"})
			} else {
				json.NewEncoder(w).Encode(map[string]string{"status": "pending"})
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	cfg := Config{BackendURL: srv.URL, BridgeID: "br_test"}
	token, err := runPairing(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "tok-retry" {
		t.Errorf("got token %q, want %q", token, "tok-retry")
	}
	if requestCount < 2 {
		t.Errorf("expected at least 2 pairing requests (retry), got %d", requestCount)
	}
}

func TestRunPairing_StopsOnCtxCancelDuringRetry(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" && r.URL.Path == "/api/pairing/request" {
			expiry := time.Now().Add(100 * time.Millisecond)
			json.NewEncoder(w).Encode(map[string]string{
				"code":      "ABCD1234",
				"expiresAt": expiry.Format(time.RFC3339),
			})
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 350*time.Millisecond)
	defer cancel()

	cfg := Config{BackendURL: srv.URL, BridgeID: "br_test"}
	_, err := runPairing(ctx, cfg)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("expected DeadlineExceeded, got: %v", err)
	}
}
