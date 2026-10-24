package main

import (
	"context"
	"errors"
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

	"dartcade/bridge/internal/api"
)

// defaultBackendURL is the hosted dartcade, used when no backend_url is set.
const defaultBackendURL = "wss://play.dartca.de/bridge"

// Config holds the bridge runtime configuration.
type Config struct {
	BoardURL   string `koanf:"board_url"`
	BackendURL string `koanf:"backend_url"`
	BridgeID   string `koanf:"bridge_id"`
	LogLevel   string `koanf:"log_level"`
	Token      string `koanf:"token"`
	// InstallToken is the one-time token from the install command; it is swapped for Token on first start.
	InstallToken string `koanf:"install_token"`
}

// loadConfig builds Config from: defaults → TOML file → env vars → overrides.
// overrides is a map of koanf key → value for CLI flag values; nil is fine.
// cfgPath is where bridge.toml is read from and where a generated bridge_id is
// written back; "" disables both.
func loadConfig(overrides map[string]string, cfgPath string) (Config, error) {
	k := koanf.New(".")

	k.Set("log_level", "info")
	k.Set("backend_url", defaultBackendURL)

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
	u, err := url.Parse(cfg.BackendURL)
	if err != nil || u.Host == "" {
		return cfg, fmt.Errorf("backend_url %q is not a valid URL (want e.g. wss://host/bridge)", cfg.BackendURL)
	}
	// A bare host would reach the SPA, which answers the WebSocket dial with 200.
	if u.Path == "" || u.Path == "/" {
		u.Path = "/bridge"
		cfg.BackendURL = u.String()
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
	return setConfigKey(path, "bridge_id", id)
}

func persistToken(path, token string) error {
	return setConfigKey(path, "token", token)
}

// setConfigKey writes key = "value" into the TOML file at path, replacing an
// existing line for key (and dropping duplicates) rather than appending, since
// a duplicate key makes the whole file unparseable. Other lines are kept as
// they are. The file is replaced atomically and keeps its permissions.
func setConfigKey(path, key, value string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	mode := os.FileMode(0600)
	data, err := os.ReadFile(path)
	if err == nil {
		if info, err := os.Stat(path); err == nil {
			mode = info.Mode().Perm()
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	entry := fmt.Sprintf("%s = %q", key, value)
	var out []string
	written := false
	for _, line := range strings.Split(strings.TrimRight(string(data), "\n"), "\n") {
		if name, _, ok := strings.Cut(line, "="); ok && strings.TrimSpace(name) == key {
			if !written {
				out = append(out, entry)
				written = true
			}
			continue
		}
		out = append(out, line)
	}
	if !written {
		out = append(out, entry)
	}
	content := strings.TrimLeft(strings.Join(out, "\n"), "\n") + "\n"

	tmp, err := os.CreateTemp(filepath.Dir(path), ".bridge.toml-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(mode); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
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

// errInstallTokenRefused means the backend does not know the install token: it was used or has expired.
var errInstallTokenRefused = errors.New("install token is unknown, used or expired")

// exchangeInstallToken swaps the one-time install token for this bridge's own board token.
func exchangeInstallToken(ctx context.Context, cfg Config) (string, error) {
	client, err := api.NewClientWithResponses(toHTTPBase(cfg.BackendURL))
	if err != nil {
		return "", fmt.Errorf("install token client: %w", err)
	}
	resp, err := client.ExchangeBridgeInstallTokenWithResponse(ctx, api.ExchangeBridgeInstallTokenJSONRequestBody{Token: cfg.InstallToken})
	if err != nil {
		return "", fmt.Errorf("install token exchange: %w", err)
	}
	if resp.StatusCode() == http.StatusNotFound {
		return "", errInstallTokenRefused
	}
	if resp.JSON201 == nil {
		return "", fmt.Errorf("install token exchange: unexpected status %d", resp.StatusCode())
	}
	return resp.JSON201.Token, nil
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
	client, err := api.NewClientWithResponses(httpBase)
	if err != nil {
		return "", "", fmt.Errorf("pairing client: %w", err)
	}
	pairResp, err := client.RequestPairingWithResponse(ctx)
	if err != nil {
		return "", "", fmt.Errorf("pairing request: %w", err)
	}
	if pairResp.JSON201 == nil {
		return "", "", fmt.Errorf("pairing request: unexpected status %d", pairResp.StatusCode())
	}
	code = pairResp.JSON201.Code
	expiresAt := pairResp.JSON201.ExpiresAt

	con.pairPrompt(code)
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
			return "", code, ctx.Err()
		case <-deadline.C:
			// The code may have been claimed in its final moments; check once
			// more before giving up (a claimed code delivers its token even
			// after it expires).
			if tok, done, err := pollPairingToken(ctx, client, code); err == nil && done {
				con.clearWaiting()
				return tok, code, nil
			}
			con.clearWaiting()
			return "", code, fmt.Errorf("pairing code %s expired", code)
		case <-display.C:
			con.waiting(time.Until(expiresAt))
		case <-poll.C:
			tok, done, err := pollPairingToken(ctx, client, code)
			if err != nil {
				con.clearWaiting()
				return "", code, err
			}
			if done {
				con.clearWaiting()
				return tok, code, nil
			}
		}
	}
}

func pollPairingToken(ctx context.Context, client *api.ClientWithResponses, code string) (token string, done bool, err error) {
	resp, err := client.GetPairingTokenWithResponse(ctx, code)
	if err != nil {
		log.Warn("polling pairing token failed, will retry", "err", err)
		return "", false, nil
	}
	if resp.StatusCode() == http.StatusNotFound {
		return "", false, fmt.Errorf("pairing code %s not found or expired", code)
	}
	if resp.JSON200 == nil {
		log.Warn("unexpected pairing poll response, will retry", "status", resp.StatusCode())
		return "", false, nil
	}

	switch string(resp.JSON200.Status) {
	case "claimed":
		if resp.JSON200.Token == nil {
			return "", false, fmt.Errorf("pairing claimed without a token")
		}
		return *resp.JSON200.Token, true, nil
	case "consumed":
		return "", false, fmt.Errorf("pairing token already consumed — a new code will be requested")
	default:
		return "", false, nil
	}
}
