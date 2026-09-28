package main

import (
	"context"
	"flag"
	"os"
	"os/signal"
	"syscall"
	"time"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/transport"
	"github.com/charmbracelet/log"
	"github.com/oklog/ulid/v2"
)

// version is stamped at build time via -ldflags "-X main.version=vX.Y.Z".
var version = "dev"

func main() {
	if len(os.Args) > 1 && os.Args[1] == "replay" {
		runReplay(os.Args[2:])
		return
	}

	fs := flag.NewFlagSet("bridge", flag.ExitOnError)
	boardURL := fs.String("board-url", "", "Board Manager base URL (e.g. http://192.168.1.10:3180)")
	backendURL := fs.String("backend-url", "", "Backend WSS URL")
	bridgeID := fs.String("bridge-id", "", "Stable bridge identifier (auto-generated if empty)")
	logLevel := fs.String("log-level", "", "Log level: debug, info, warn, error")
	verbose := fs.Bool("verbose", false, "Verbose (debug-level) logging")
	token := fs.String("token", "", "Bridge authentication token (skips pairing if set)")
	configDir := fs.String("config-dir", "", "Directory holding bridge.toml (also DARTCADE_CONFIG_DIR; default: OS user config dir)")
	fs.Parse(os.Args[1:])

	// Resolve the config path once; it's where bridge.toml is read and where
	// the token + bridge_id are persisted. Mount this dir as a volume to keep a
	// paired bridge paired across container restarts.
	cfgPath, _ := configFilePath(*configDir)

	cfg, err := loadConfig(map[string]string{
		"board_url":   *boardURL,
		"backend_url": *backendURL,
		"bridge_id":   *bridgeID,
		"log_level":   *logLevel,
		"token":       *token,
	}, cfgPath)
	if err != nil {
		log.Fatal("config error", "err", err)
	}

	level := cfg.LogLevel
	if *verbose {
		level = "debug"
	}
	setLogLevel(level)

	con := newConsole(os.Stdout)
	con.banner(version)
	log.Debug("autodarts-bridge starting", "bridge_id", cfg.BridgeID)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bootID := ulid.Make().String()
	client := bm.NewClient(cfg.BoardURL)

	// Reach the board first: fetch BM version, board_id, and camera count so we
	// can confirm the board is present before asking the user to pair, and so
	// those values are available in every envelope from the first connection.
	initCtx, initCancel := context.WithTimeout(ctx, 30*time.Second)
	if err := client.Init(initCtx); err != nil {
		initCancel()
		con.boardUnreachable(cfg.BoardURL)
		log.Fatal("BM init failed", "err", err)
	}
	initCancel()
	con.boardFound(hostOf(cfg.BoardURL), client.CameraCount())

	if cfg.Token == "" {
		pairedToken, err := runPairing(ctx, cfg, con)
		if err != nil {
			log.Fatal("pairing failed", "err", err)
		}
		cfg.Token = pairedToken
		if cfgPath != "" {
			if err := persistToken(cfgPath, cfg.Token); err != nil {
				log.Warn("could not persist token — the bridge will re-pair on restart",
					"path", cfgPath, "err", err)
			}
		}
		con.pairedOK()
	}

	exec := func(name string) (int, error) {
		execCtx := context.Background()
		switch name {
		case "reset":
			return client.Reset(execCtx)
		case "start":
			return client.StartDetection(execCtx)
		case "stop":
			return client.StopDetection(execCtx)
		}
		return 0, nil
	}

	tr := transport.New(transport.Config{
		BackendURL: cfg.BackendURL + "?token=" + cfg.Token,
		BridgeID:   cfg.BridgeID,
		BootID:     bootID,
		BoardID:    client.BoardID(),
		BMVersion:  client.BMVersion(),
		BMUrl:      cfg.BoardURL,
	}, exec)

	go func() {
		if err := tr.Start(ctx); err != nil && ctx.Err() == nil {
			log.Error("transport stopped", "err", err)
		}
	}()

	eventCh := make(chan []differ.Event, 256)
	go func() {
		for evs := range eventCh {
			tr.Send(evs)
		}
	}()

	go func() {
		if err := client.Start(ctx); err != nil && ctx.Err() == nil {
			log.Error("BM client stopped", "err", err)
		}
		close(eventCh)
	}()

	// Differ loop (main goroutine)
	s := differ.State{}
	for {
		select {
		case <-ctx.Done():
			log.Info("shutting down")
			return
		case frame, ok := <-client.Frames():
			if !ok {
				return
			}
			var evs []differ.Event
			s, evs = differ.Process(s, frame)
			if len(evs) > 0 {
				select {
				case eventCh <- evs:
				default:
					log.Warn("event channel full, dropping batch", "size", len(evs))
				}
			}
		}
	}
}

func setLogLevel(level string) {
	switch level {
	case "debug":
		log.SetLevel(log.DebugLevel)
	case "warn":
		log.SetLevel(log.WarnLevel)
	case "error":
		log.SetLevel(log.ErrorLevel)
	default:
		log.SetLevel(log.InfoLevel)
	}
}
