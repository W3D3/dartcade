package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"dartcade/bridge/internal/api"
)

// discardConsole is a console that swallows output, for tests that exercise
// the pairing flow without asserting on the printed lines.
func discardConsole() *console { return &console{w: io.Discard} }

// writeJSON writes a JSON fixture response with the status and content type
// the generated api client requires to populate its JSONxxx fields (it
// switches on both, not just the body shape).
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

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

func TestBackendIdentity(t *testing.T) {
	cases := []struct {
		a, b  string
		equal bool
	}{
		// Same scheme, host and path: same backend, even with a differing query.
		{"wss://play.dartca.de/bridge", "wss://play.dartca.de/bridge?token=abc", true},
		// Case differences in scheme/host don't matter.
		{"WSS://Play.Dartca.De/bridge", "wss://play.dartca.de/bridge", true},
		// A different host is a different backend.
		{"wss://play.dartca.de/bridge", "wss://dev.dartca.de/bridge", false},
		// A different path (e.g. a different deployment behind the same host) too.
		{"wss://host/bridge", "wss://host/other/bridge", false},
	}
	for _, tc := range cases {
		got := backendIdentity(tc.a) == backendIdentity(tc.b)
		if got != tc.equal {
			t.Errorf("backendIdentity(%q) == backendIdentity(%q): got %v, want %v", tc.a, tc.b, got, tc.equal)
		}
	}
}

func TestConfigFilePath(t *testing.T) {
	// An explicit directory override wins and puts bridge.toml directly in it.
	if got, _ := configFilePath("/data"); got != filepath.Join("/data", "bridge.toml") {
		t.Errorf("override: got %q", got)
	}
	// DARTCADE_CONFIG_DIR is used when no override is given.
	t.Setenv("DARTCADE_CONFIG_DIR", "/envdir")
	if got, _ := configFilePath(""); got != filepath.Join("/envdir", "bridge.toml") {
		t.Errorf("env: got %q", got)
	}
	// The explicit override beats the env var.
	if got, _ := configFilePath("/flagdir"); got != filepath.Join("/flagdir", "bridge.toml") {
		t.Errorf("precedence: got %q", got)
	}
}

func TestPersistToken(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bridge.toml")
	persistToken(path, "mytoken123", "wss://play.dartca.de/bridge")

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `token = "mytoken123"`) {
		t.Errorf("token not written, got: %s", data)
	}
	if !strings.Contains(string(data), `token_backend_url = "wss://play.dartca.de/bridge"`) {
		t.Errorf("token_backend_url not written, got: %s", data)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0600 {
		t.Errorf("expected 0600, got %o", info.Mode().Perm())
	}
}

func TestPersistToken_ReturnsErrorWhenDirUnwritable(t *testing.T) {
	dir := t.TempDir()
	// A regular file where a parent directory is expected makes MkdirAll fail,
	// so callers can surface "couldn't persist token" instead of silently
	// re-pairing on the next start.
	blocker := filepath.Join(dir, "blocker")
	if err := os.WriteFile(blocker, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := persistToken(filepath.Join(blocker, "sub", "bridge.toml"), "tok", "wss://play.dartca.de/bridge"); err == nil {
		t.Fatal("expected an error persisting under a file, got nil")
	}
}

// Persisting a key twice must rewrite it, not append a duplicate: a duplicate
// key makes the TOML unparseable and the bridge would ignore the whole file.
func TestPersistToken_RewritesExistingKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.toml")
	orig := "# my board\nboard_url = \"ws://board:3180\"\ntoken = \"old\"\ntoken = \"older\"\n"
	if err := os.WriteFile(path, []byte(orig), 0640); err != nil {
		t.Fatal(err)
	}
	for _, tok := range []string{"first", "second"} {
		if err := persistToken(path, tok, "ws://localhost:3000/bridge"); err != nil {
			t.Fatal(err)
		}
	}
	if err := persistBridgeID(path, "br_x"); err != nil {
		t.Fatal(err)
	}

	data, _ := os.ReadFile(path)
	want := "# my board\nboard_url = \"ws://board:3180\"\ntoken = \"second\"\ntoken_backend_url = \"ws://localhost:3000/bridge\"\nbridge_id = \"br_x\"\n"
	if string(data) != want {
		t.Errorf("got:\n%s\nwant:\n%s", data, want)
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0640 {
		t.Errorf("permissions changed to %o", info.Mode().Perm())
	}

	cfg, err := loadConfig(map[string]string{"backend_url": "ws://localhost:3000/bridge"}, path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Token != "second" || cfg.BridgeID != "br_x" || cfg.BoardURL != "ws://board:3180" {
		t.Errorf("file did not load back: %+v", cfg)
	}
}

func TestLoadConfig_DefaultsBackendPathToBridge(t *testing.T) {
	for in, want := range map[string]string{
		"wss://play.example":          "wss://play.example/bridge",
		"wss://play.example/":         "wss://play.example/bridge",
		"ws://localhost:3000?token=x": "ws://localhost:3000/bridge?token=x",
		"ws://localhost:3000/bridge":  "ws://localhost:3000/bridge",
		"wss://host/dartcade/bridge":  "wss://host/dartcade/bridge",
	} {
		cfg, err := loadConfig(map[string]string{
			"board_url":   "ws://board:3180",
			"backend_url": in,
			"bridge_id":   "br_test",
		}, "")
		if err != nil {
			t.Fatal(err)
		}
		if cfg.BackendURL != want {
			t.Errorf("backend_url %q: got %q, want %q", in, cfg.BackendURL, want)
		}
	}
}

func TestLoadConfig_DefaultsBackendURLToHosted(t *testing.T) {
	cfg, err := loadConfig(map[string]string{"board_url": "ws://board:3180", "bridge_id": "br_test"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.BackendURL != defaultBackendURL {
		t.Errorf("got %q, want %q", cfg.BackendURL, defaultBackendURL)
	}
}

// Pairing against one backend then pointing the bridge at another (CLI flag,
// DARTCADE_BACKEND_URL, or a reused bridge.toml) must not send that backend
// the other one's token — it should be dropped so pairing runs again instead
// of the backend rejecting it with the generic "token changed" message.
func TestLoadConfig_ClearsTokenWhenBackendURLDiffers(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.toml")
	orig := "board_url = \"ws://board:3180\"\ntoken = \"old-tok\"\ntoken_backend_url = \"wss://old.example/bridge\"\n"
	if err := os.WriteFile(path, []byte(orig), 0600); err != nil {
		t.Fatal(err)
	}

	cfg, err := loadConfig(map[string]string{"backend_url": "wss://new.example/bridge"}, path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Token != "" {
		t.Errorf("expected the stale token to be dropped, got %q", cfg.Token)
	}
}

// Same backend_url as it was paired against: the token is still good.
func TestLoadConfig_KeepsTokenWhenBackendURLMatches(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.toml")
	orig := "board_url = \"ws://board:3180\"\ntoken = \"good-tok\"\ntoken_backend_url = \"wss://play.dartca.de/bridge\"\n"
	if err := os.WriteFile(path, []byte(orig), 0600); err != nil {
		t.Fatal(err)
	}

	cfg, err := loadConfig(map[string]string{"backend_url": "wss://play.dartca.de/bridge"}, path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Token != "good-tok" {
		t.Errorf("expected the token to survive a matching backend_url, got %q", cfg.Token)
	}
}

// A backend_url move that keeps the same scheme/host/path but changes only the
// query (e.g. a dev-tunnel token in the URL) isn't a different backend.
func TestLoadConfig_KeepsTokenWhenOnlyQueryDiffers(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.toml")
	orig := "board_url = \"ws://board:3180\"\ntoken = \"good-tok\"\ntoken_backend_url = \"wss://play.dartca.de/bridge?token=abc\"\n"
	if err := os.WriteFile(path, []byte(orig), 0600); err != nil {
		t.Fatal(err)
	}

	cfg, err := loadConfig(map[string]string{"backend_url": "wss://play.dartca.de/bridge"}, path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Token != "good-tok" {
		t.Errorf("expected the token to survive a query-only difference, got %q", cfg.Token)
	}
}

// An older bridge.toml, written before token_backend_url existed, has no way to
// tell whether the token still matches — trust it rather than forcing every
// existing install to re-pair for free on upgrade.
func TestLoadConfig_KeepsTokenWhenNoStoredBackendURL(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.toml")
	orig := "board_url = \"ws://board:3180\"\ntoken = \"legacy-tok\"\n"
	if err := os.WriteFile(path, []byte(orig), 0600); err != nil {
		t.Fatal(err)
	}

	cfg, err := loadConfig(map[string]string{"backend_url": "wss://new.example/bridge"}, path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Token != "legacy-tok" {
		t.Errorf("expected the token to survive with no stored token_backend_url, got %q", cfg.Token)
	}
}

func TestLoadConfig_RejectsMalformedBackendURL(t *testing.T) {
	for _, bad := range []string{"localhost:3000/bridge", "not a url", "ws://%zz"} {
		_, err := loadConfig(map[string]string{
			"board_url":   "ws://board:3180",
			"backend_url": bad,
			"bridge_id":   "br_test",
		}, "")
		if err == nil || !strings.Contains(err.Error(), "backend_url") {
			t.Errorf("backend_url %q: got err %v, want a backend_url error", bad, err)
		}
	}
}

func TestRunPairing_Success(t *testing.T) {
	expiry := time.Now().Add(10 * time.Minute)

	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == "POST" && r.URL.Path == "/api/pairing/request":
			writeJSON(w, http.StatusCreated, map[string]string{
				"code":      "ABCD1234",
				"expiresAt": expiry.Format(time.RFC3339),
			})
		case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/api/pairing/"):
			callCount++
			if callCount < 2 {
				writeJSON(w, http.StatusOK, map[string]string{"status": "pending"})
			} else {
				writeJSON(w, http.StatusOK, map[string]string{"status": "claimed", "token": "tok-secret"})
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	cfg := Config{BackendURL: srv.URL, BridgeID: "br_test"}
	token, err := runPairing(context.Background(), cfg, discardConsole())
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
			writeJSON(w, http.StatusCreated, map[string]string{
				"code":      "ABCD1234",
				"expiresAt": time.Now().Add(10 * time.Minute).Format(time.RFC3339),
			})
		case r.Method == "GET" && r.URL.Path == "/api/pairing/ABCD1234/token":
			writeJSON(w, http.StatusOK, map[string]string{"status": "claimed", "token": "tok-path"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	cfg := Config{BackendURL: srv.URL + "/bridge", BridgeID: "br_test"}
	token, err := runPairing(context.Background(), cfg, discardConsole())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "tok-path" {
		t.Errorf("got token %q, want %q", token, "tok-path")
	}
}

// A code claimed in its final moments must still be delivered: when the local
// deadline fires, runPairingOnce does one last poll before giving up.
func TestRunPairing_ClaimedAtDeadline(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == "POST" && r.URL.Path == "/api/pairing/request":
			// Short TTL so the deadline fires before the 2s poll ticker — the
			// only poll that can happen is the deadline's final one.
			writeJSON(w, http.StatusCreated, map[string]string{
				"code":      "ABCD1234",
				"expiresAt": time.Now().Add(250 * time.Millisecond).Format(time.RFC3339Nano),
			})
		case r.Method == "GET" && r.URL.Path == "/api/pairing/ABCD1234/token":
			writeJSON(w, http.StatusOK, map[string]string{"status": "claimed", "token": "tok-deadline"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cfg := Config{BackendURL: srv.URL, BridgeID: "br_test"}
	token, err := runPairing(ctx, cfg, discardConsole())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "tok-deadline" {
		t.Errorf("got token %q, want %q", token, "tok-deadline")
	}
}

func TestRunPairing_CtxCancelledDuringRequest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := runPairing(ctx, Config{BackendURL: srv.URL, BridgeID: "br_test"}, discardConsole())
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
			writeJSON(w, http.StatusCreated, map[string]string{
				"code":      "ABCD1234",
				"expiresAt": expiry.Format(time.RFC3339),
			})
		case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/api/pairing/"):
			if requestCount >= 2 {
				writeJSON(w, http.StatusOK, map[string]string{"status": "claimed", "token": "tok-retry"})
			} else {
				writeJSON(w, http.StatusOK, map[string]string{"status": "pending"})
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	cfg := Config{BackendURL: srv.URL, BridgeID: "br_test"}
	token, err := runPairing(context.Background(), cfg, discardConsole())
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

func TestRunPairingOnce_PairingRequestUnexpectedStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" && r.URL.Path == "/api/pairing/request" {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	_, _, err := runPairingOnce(context.Background(), srv.URL, discardConsole())
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if !strings.Contains(err.Error(), "500") {
		t.Errorf("expected the error to mention the unexpected status 500, got: %v", err)
	}
}

func TestPollPairingToken_ClaimedWithoutToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/api/pairing/") {
			// Backend bug or drift: claimed but the token field is missing.
			writeJSON(w, http.StatusOK, map[string]string{"status": "claimed"})
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	client, err := api.NewClientWithResponses(srv.URL)
	if err != nil {
		t.Fatalf("unexpected error creating client: %v", err)
	}
	_, _, err = pollPairingToken(context.Background(), client, "ABCD1234")
	if err == nil {
		t.Fatal("expected an error, got nil")
	}
	if err.Error() != "pairing claimed without a token" {
		t.Errorf("got error %q, want %q", err.Error(), "pairing claimed without a token")
	}
}

func TestRunPairing_StopsOnCtxCancelDuringRetry(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" && r.URL.Path == "/api/pairing/request" {
			expiry := time.Now().Add(100 * time.Millisecond)
			writeJSON(w, http.StatusCreated, map[string]string{
				"code":      "ABCD1234",
				"expiresAt": expiry.Format(time.RFC3339),
			})
		}
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 350*time.Millisecond)
	defer cancel()

	cfg := Config{BackendURL: srv.URL, BridgeID: "br_test"}
	_, err := runPairing(ctx, cfg, discardConsole())
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("expected DeadlineExceeded, got: %v", err)
	}
}

func TestExchangeInstallToken(t *testing.T) {
	var gotBody map[string]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&gotBody)
		if r.Method != "POST" || r.URL.Path != "/api/bridge-install-tokens/exchange" || gotBody["token"] != "good" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"token": "board-token"})
	}))
	defer srv.Close()

	tok, err := exchangeInstallToken(context.Background(), Config{BackendURL: srv.URL + "/bridge", InstallToken: "good"})
	if err != nil || tok != "board-token" {
		t.Fatalf("got %q, %v", tok, err)
	}
	if _, err := exchangeInstallToken(context.Background(), Config{BackendURL: srv.URL + "/bridge", InstallToken: "used"}); !errors.Is(err, errInstallTokenRefused) {
		t.Errorf("a refused token should give errInstallTokenRefused, got %v", err)
	}
}

func TestLoadConfig_ReadsInstallTokenFromEnv(t *testing.T) {
	t.Setenv("DARTCADE_INSTALL_TOKEN", "once")
	cfg, err := loadConfig(map[string]string{"board_url": "http://board:3180"}, "")
	if err != nil || cfg.InstallToken != "once" {
		t.Fatalf("got %+v, %v", cfg, err)
	}
}
