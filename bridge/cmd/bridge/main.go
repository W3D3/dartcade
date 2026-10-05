package main

import (
	"context"
	"flag"
	"os"
	"os/signal"
	"runtime/debug"
	"slices"
	"syscall"
	"time"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/camera"
	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/schema"
	"dartcade/bridge/internal/transport"
	"github.com/charmbracelet/log"
	"github.com/oklog/ulid/v2"
)

// version is stamped at build time via -ldflags "-X main.version=vX.Y.Z".
var version = "dev"

// commit is optionally stamped via -ldflags "-X main.commit=<sha>[-dirty]" for
// builds that can't see .git (e.g. Docker). Otherwise Go's embedded VCS info is used.
var commit = ""

// buildVersion is the version the bridge reports: the stamped tag for releases,
// or "dev+<sha>[-dirty]" for untagged builds so they can be told apart.
func buildVersion() string {
	if version != "dev" {
		return version
	}
	rev := commit
	if rev == "" {
		rev = vcsRevision()
	}
	if rev == "" {
		return version
	}
	return version + "+" + rev
}

// vcsRevision returns the short commit (plus "-dirty") embedded by go build.
func vcsRevision() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return ""
	}
	var rev string
	var dirty bool
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			rev = s.Value
		case "vcs.modified":
			dirty = s.Value == "true"
		}
	}
	if len(rev) > 7 {
		rev = rev[:7]
	}
	if rev != "" && dirty {
		rev += "-dirty"
	}
	return rev
}

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
	con.banner(buildVersion())
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

	exec := func(ctx context.Context, name string) (int, error) {
		switch name {
		case "reset":
			return client.Reset(ctx)
		case "start":
			return client.StartDetection(ctx)
		case "stop":
			return client.StopDetection(ctx)
		}
		return 0, nil
	}

	tr := transport.New(transport.Config{
		BackendURL:    cfg.BackendURL + "?token=" + cfg.Token,
		BridgeID:      cfg.BridgeID,
		BootID:        bootID,
		BoardID:       client.BoardID(),
		BMVersion:     client.BMVersion(),
		BMUrl:         cfg.BoardURL,
		BridgeVersion: buildVersion(),
	}, exec)

	// After a dart, a correction, a takeout or a resync: a new still from each camera,
	// sent on the backend connection (only while it is up)
	// Each round of stills also makes the combined still (camera 3), off the event path
	combined := camera.NewCompositor(cfg.BoardURL, tr.SendStill)
	stills := camera.New(cfg.BoardURL, client.CameraCount, func(st camera.Still) {
		tr.SendStill(st)
		combined.Add(ctx, st)
	})
	// And on every (re)connect, so viewers see the board after a restart without waiting for a dart
	tr.OnConnect(func() { stills.Trigger(ctx) })

	go func() {
		if err := tr.Start(ctx); err != nil && ctx.Err() == nil {
			log.Error("transport stopped", "err", err)
		}
	}()

	eventCh := make(chan []differ.Event, 256)
	go func() {
		for evs := range eventCh {
			tr.Send(evs)
			if calibrationChanged(evs) {
				combined.CalibrationChanged()
			}
			if tr.Connected() && triggersStills(evs) {
				stills.Trigger(ctx)
			}
		}
	}()

	go func() {
		if err := client.Start(ctx); err != nil && ctx.Err() == nil {
			log.Error("BM client stopped", "err", err)
		}
	}()

	runDiffer(ctx, client.Frames(), eventCh)
	log.Info("shutting down")
}

// runDiffer turns Board Manager frames into event batches on eventCh until ctx ends or
// frames is closed. It is eventCh's only sender, so it closes it when it returns.
func runDiffer(ctx context.Context, frames <-chan bm.BMFrame, eventCh chan<- []differ.Event) {
	defer close(eventCh)
	s := differ.State{}
	for {
		select {
		case <-ctx.Done():
			return
		case frame, ok := <-frames:
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

// triggersStills reports whether a batch of events changes what the cameras see.
func triggersStills(evs []differ.Event) bool {
	return slices.ContainsFunc(evs, func(e differ.Event) bool { return camera.Triggers(e.Kind) })
}

// calibrationChanged reports whether Board Manager calibrated (or started to): the combined
// still's weights come from its calibration.
func calibrationChanged(evs []differ.Event) bool {
	return slices.ContainsFunc(evs, func(e differ.Event) bool {
		st, ok := e.Data.(*schema.BoardStatusData)
		return ok && e.Kind == "board.status" && (camera.IsCalibration(st.Status) || camera.IsCalibration(st.Event))
	})
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
