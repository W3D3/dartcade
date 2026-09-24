package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

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
