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

func TestRunPairing_Expired(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == "POST" && r.URL.Path == "/api/pairing/request":
			expiry := time.Now().Add(100 * time.Millisecond)
			json.NewEncoder(w).Encode(map[string]string{
				"code":      "ABCD1234",
				"expiresAt": expiry.Format(time.RFC3339),
			})
		default:
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
		}
	}))
	defer srv.Close()

	cfg := Config{BackendURL: srv.URL, BridgeID: "br_test"}
	_, err := runPairing(context.Background(), cfg)
	if err == nil {
		t.Fatal("expected an error for expired code, got nil")
	}
}
