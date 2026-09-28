package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/charmbracelet/log"
	"github.com/knadh/koanf/parsers/toml/v2"
	"github.com/knadh/koanf/providers/env/v2"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
	"github.com/oklog/ulid/v2"
)

// Config holds the bridge runtime configuration.
type Config struct {
	BoardURL   string `koanf:"board_url"`
	BackendURL string `koanf:"backend_url"`
	BridgeID   string `koanf:"bridge_id"`
	LogLevel   string `koanf:"log_level"`
	Token      string `koanf:"token"`
}

// loadConfig builds Config from: defaults → TOML file → env vars → overrides.
// overrides is a map of koanf key → value for CLI flag values; nil is fine.
// cfgPath is where bridge.toml is read from and where a generated bridge_id is
// written back; "" disables both.
func loadConfig(overrides map[string]string, cfgPath string) (Config, error) {
	k := koanf.New(".")

	k.Set("log_level", "info")

	if cfgPath != "" {
		if _, err := os.Stat(cfgPath); err == nil {
			if err := k.Load(file.Provider(cfgPath), toml.Parser()); err != nil {
				log.Warn("could not load config file", "path", cfgPath, "err", err)
			}
		}
	}

	k.Load(env.Provider(".", env.Opt{
		Prefix: "DARTCADE_",
		TransformFunc: func(k, v string) (string, any) {
			return strings.ToLower(strings.TrimPrefix(k, "DARTCADE_")), v
		},
	}), nil)

	for key, val := range overrides {
		if val != "" {
			k.Set(key, val)
		}
	}

	var cfg Config
	if err := k.UnmarshalWithConf("", &cfg, koanf.UnmarshalConf{Tag: "koanf"}); err != nil {
		return cfg, fmt.Errorf("unmarshal config: %w", err)
	}

	if cfg.BoardURL == "" {
		return cfg, fmt.Errorf("board_url is required (--board-url or DARTCADE_BOARD_URL)")
	}
	if cfg.BackendURL == "" {
		return cfg, fmt.Errorf("backend_url is required (--backend-url or DARTCADE_BACKEND_URL)")
	}

	if cfg.BridgeID == "" {
		cfg.BridgeID = "br_" + ulid.Make().String()
		log.Info("generated new bridge_id", "bridge_id", cfg.BridgeID)
		if cfgPath != "" {
			if err := persistBridgeID(cfgPath, cfg.BridgeID); err != nil {
				log.Warn("could not persist bridge_id", "path", cfgPath, "err", err)
			}
		}
	}

	return cfg, nil
}

// configFilePath resolves where bridge.toml lives. Precedence:
//  1. dirOverride (the --config-dir flag) — bridge.toml sits directly in it
//  2. DARTCADE_CONFIG_DIR env var — same
//  3. the OS user-config dir, under dartcade/ (the default)
//
// The override forms make container persistence a single explicit setting:
// point it at a mounted volume and the token + bridge_id survive restarts.
func configFilePath(dirOverride string) (string, error) {
	if dirOverride == "" {
		dirOverride = os.Getenv("DARTCADE_CONFIG_DIR")
	}
	if dirOverride != "" {
		return filepath.Join(dirOverride, "bridge.toml"), nil
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "dartcade", "bridge.toml"), nil
}

func persistBridgeID(path, id string) error {
	return appendConfigLine(path, fmt.Sprintf("\nbridge_id = %q\n", id))
}

func persistToken(path, token string) error {
	return appendConfigLine(path, fmt.Sprintf("\ntoken = %q\n", token))
}

func appendConfigLine(path, line string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.WriteString(line)
	return err
}

// toHTTPBase derives the HTTP origin (scheme://host) for the REST API from
// the backend URL. The backend URL carries the WebSocket path (e.g.
// ws://host:3000/bridge) and may carry a token query; the pairing endpoints
// live at the origin, so the path and query are dropped and ws(s) is mapped
// to http(s).
func toHTTPBase(backendURL string) string {
	u, err := url.Parse(backendURL)
	if err != nil || u.Host == "" {
		return backendURL
	}
	switch u.Scheme {
	case "wss":
		u.Scheme = "https"
	case "ws":
		u.Scheme = "http"
	}
	return u.Scheme + "://" + u.Host
}

// hostOf returns the host:port of a URL for display, falling back to the raw
// string if it cannot be parsed.
func hostOf(rawURL string) string {
	if u, err := url.Parse(rawURL); err == nil && u.Host != "" {
		return u.Host
	}
	return rawURL
}

func runPairing(ctx context.Context, cfg Config, con *console) (string, error) {
	httpBase := toHTTPBase(cfg.BackendURL)
	for {
		token, code, err := runPairingOnce(ctx, httpBase, con)
		if err == nil {
			return token, nil
		}
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		// The code lapsed before anyone claimed it — note it and loop for a
		// fresh one.
		con.codeExpired(code)
	}
}

// runPairingOnce requests one code, shows it, and polls until the code is
// claimed, the code expires, or the context is cancelled. It returns the code
// it displayed so the caller can report an expiry.
func runPairingOnce(ctx context.Context, httpBase string, con *console) (token string, code string, err error) {
	pairReq, err := http.NewRequestWithContext(ctx, "POST", httpBase+"/api/pairing/request", strings.NewReader("{}"))
	if err != nil {
		return "", "", fmt.Errorf("pairing request: %w", err)
	}
	pairReq.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(pairReq)
	if err != nil {
		return "", "", fmt.Errorf("pairing request: %w", err)
	}
	defer resp.Body.Close()

	var pairResp struct {
		Code      string `json:"code"`
		ExpiresAt string `json:"expiresAt"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&pairResp); err != nil {
		return "", "", fmt.Errorf("pairing request decode: %w", err)
	}

	expiresAt, err := time.Parse(time.RFC3339, pairResp.ExpiresAt)
	if err != nil {
		return "", "", fmt.Errorf("pairing expiry parse: %w", err)
	}

	con.pairPrompt(pairResp.Code)
	con.waiting(time.Until(expiresAt))

	display := time.NewTicker(1 * time.Second)
	defer display.Stop()
	poll := time.NewTicker(2 * time.Second)
	defer poll.Stop()
	deadline := time.NewTimer(time.Until(expiresAt))
	defer deadline.Stop()

	for {
		select {
		case <-ctx.Done():
			con.clearWaiting()
			return "", pairResp.Code, ctx.Err()
		case <-deadline.C:
			// The code may have been claimed in its final moments; check once
			// more before giving up (a claimed code delivers its token even
			// after it expires).
			if tok, done, err := pollPairingToken(ctx, httpBase, pairResp.Code); err == nil && done {
				con.clearWaiting()
				return tok, pairResp.Code, nil
			}
			con.clearWaiting()
			return "", pairResp.Code, fmt.Errorf("pairing code %s expired", pairResp.Code)
		case <-display.C:
			con.waiting(time.Until(expiresAt))
		case <-poll.C:
			tok, done, err := pollPairingToken(ctx, httpBase, pairResp.Code)
			if err != nil {
				con.clearWaiting()
				return "", pairResp.Code, err
			}
			if done {
				con.clearWaiting()
				return tok, pairResp.Code, nil
			}
		}
	}
}

func pollPairingToken(ctx context.Context, httpBase, code string) (token string, done bool, err error) {
	req, err := http.NewRequestWithContext(ctx, "GET", httpBase+"/api/pairing/"+code+"/token", nil)
	if err != nil {
		return "", false, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Warn("polling pairing token failed, will retry", "err", err)
		return "", false, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", false, fmt.Errorf("pairing code %s not found or expired", code)
	}

	var body struct {
		Status string `json:"status"`
		Token  string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		log.Warn("polling response decode error, will retry", "err", err)
		return "", false, nil
	}

	switch body.Status {
	case "claimed":
		return body.Token, true, nil
	case "consumed":
		return "", false, fmt.Errorf("pairing token already consumed — a new code will be requested")
	default:
		return "", false, nil
	}
}
