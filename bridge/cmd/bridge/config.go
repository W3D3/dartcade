package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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
func loadConfig(overrides map[string]string) (Config, error) {
	k := koanf.New(".")

	k.Set("log_level", "info")

	cfgPath, _ := configFilePath()
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
			persistBridgeID(cfgPath, cfg.BridgeID)
		}
	}

	return cfg, nil
}

func configFilePath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "dartcade", "bridge.toml"), nil
}

func persistBridgeID(path, id string) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "\nbridge_id = %q\n", id)
}

func persistToken(path, token string) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "\ntoken = %q\n", token)
}

func toHTTPBase(wsURL string) string {
	switch {
	case strings.HasPrefix(wsURL, "wss://"):
		return "https://" + strings.TrimPrefix(wsURL, "wss://")
	case strings.HasPrefix(wsURL, "ws://"):
		return "http://" + strings.TrimPrefix(wsURL, "ws://")
	default:
		return wsURL
	}
}

func runPairing(ctx context.Context, cfg Config) (string, error) {
	httpBase := toHTTPBase(cfg.BackendURL)

	pairReq, err := http.NewRequestWithContext(ctx, "POST", httpBase+"/api/pairing/request", strings.NewReader("{}"))
	if err != nil {
		return "", fmt.Errorf("pairing request: %w", err)
	}
	pairReq.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(pairReq)
	if err != nil {
		return "", fmt.Errorf("pairing request: %w", err)
	}
	defer resp.Body.Close()

	var pairResp struct {
		Code      string `json:"code"`
		ExpiresAt string `json:"expiresAt"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&pairResp); err != nil {
		return "", fmt.Errorf("pairing request decode: %w", err)
	}

	expiresAt, err := time.Parse(time.RFC3339, pairResp.ExpiresAt)
	if err != nil {
		return "", fmt.Errorf("pairing expiry parse: %w", err)
	}

	log.Info("bridge not paired — visit the web UI to complete setup",
		"code", pairResp.Code,
		"url", httpBase,
		"expires_in", time.Until(expiresAt).Round(time.Second),
	)

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	deadline := time.NewTimer(time.Until(expiresAt))
	defer deadline.Stop()

	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-deadline.C:
			return "", fmt.Errorf("pairing code %s expired before it was claimed", pairResp.Code)
		case <-ticker.C:
			token, done, err := pollPairingToken(ctx, httpBase, pairResp.Code)
			if err != nil {
				return "", err
			}
			if done {
				return token, nil
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
		return "", false, fmt.Errorf("pairing token already consumed — restart bridge to generate a new code")
	default:
		return "", false, nil
	}
}
