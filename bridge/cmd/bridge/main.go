package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"slices"
	"time"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/camera"
	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/schema"
	"dartcade/bridge/internal/transport"
	"dartcade/bridge/internal/wled"
	"github.com/charmbracelet/log"
	"github.com/kardianos/service"
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
	if len(os.Args) > 1 && (os.Args[1] == "install" || os.Args[1] == "uninstall") {
		if err := runServiceCommand(os.Args[1], os.Args[2:]); err != nil {
			log.Fatal(err)
		}
		return
	}

	fs := flag.NewFlagSet("bridge", flag.ExitOnError)
	boardURL := fs.String("board-url", "", "Board Manager base URL (e.g. http://192.168.1.10:3180)")
	backendURL := fs.String("backend-url", "", "Backend URL (e.g. wss://host; default: "+defaultBackendURL+")")
	bridgeID := fs.String("bridge-id", "", "Stable bridge identifier (auto-generated if empty)")
	logLevel := fs.String("log-level", "", "Log level: debug, info, warn, error")
	verbose := fs.Bool("verbose", false, "Verbose (debug-level) logging")
	token := fs.String("token", "", "Bridge authentication token (skips pairing if set)")
	installToken := fs.String("install-token", "", "One-time token from the dashboard's install command (also DARTCADE_INSTALL_TOKEN); the bridge pairs itself with it")
	configDir := fs.String("config-dir", "", "Directory holding bridge.toml (also DARTCADE_CONFIG_DIR; default: OS user config dir)")
	fs.Parse(os.Args[1:])

	// Resolve the config path once; it's where bridge.toml is read and where
	// the token + bridge_id are persisted. Mount this dir as a volume to keep a
	// paired bridge paired across container restarts.
	cfgPath, _ := configFilePath(*configDir)

	cfg, err := loadConfig(map[string]string{
		"board_url":     *boardURL,
		"backend_url":   *backendURL,
		"bridge_id":     *bridgeID,
		"log_level":     *logLevel,
		"token":         *token,
		"install_token": *installToken,
	}, cfgPath)
	if err != nil {
		log.Fatal("config error", "err", err)
	}

	level := cfg.LogLevel
	if *verbose {
		level = "debug"
	}
	setLogLevel(level)

	out := os.Stdout
	if runtime.GOOS == "windows" && !service.Interactive() && cfgPath != "" {
		if f, err := openServiceLog(cfgPath); err == nil {
			out = f
			log.SetOutput(f)
		}
	}
	con := newConsole(out)
	con.banner(buildVersion())
	log.Debug("autodarts-bridge starting", "bridge_id", cfg.BridgeID)

	svc, err := service.New(&program{run: func(ctx context.Context) { run(ctx, cfg, cfgPath, con) }}, serviceConfig(nil))
	if err != nil {
		log.Fatal("service error", "err", err)
	}
	if err := svc.Run(); err != nil {
		log.Fatal("service error", "err", err)
	}
}

// run is the bridge itself: it blocks until ctx is cancelled.
func run(ctx context.Context, cfg Config, cfgPath string, con *console) {
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

	// A saved token wins: the install token is single-use, so once spent it is just left in the config
	if cfg.Token == "" && cfg.InstallToken != "" {
		tok, err := exchangeInstallToken(ctx, cfg)
		switch {
		case errors.Is(err, errInstallTokenRefused):
			log.Warn("the install token was already used or has expired, falling back to a pairing code; get a new command from the dashboard to skip it")
		case ctx.Err() != nil:
			return
		case err != nil:
			log.Fatal("install token exchange failed", "err", err)
		default:
			cfg.Token = tok
			if cfgPath != "" {
				if err := persistToken(cfgPath, cfg.Token); err != nil {
					log.Warn("could not persist token — the bridge will need a new install token on restart", "path", cfgPath, "err", err)
				}
			}
			con.pairedOK()
		}
	}

	if cfg.Token == "" {
		pairedToken, err := runPairing(ctx, cfg, con)
		if ctx.Err() != nil {
			return
		}
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

	tr := transport.New(transport.Config{
		BackendURL:    cfg.BackendURL,
		Token:         cfg.Token,
		BridgeID:      cfg.BridgeID,
		BootID:        bootID,
		BoardID:       client.BoardID(),
		BMVersion:     client.BMVersion(),
		BMUrl:         cfg.BoardURL,
		BridgeVersion: buildVersion(),
		OutboxPath:    outboxPath(cfgPath),
	})

	// After a dart, a correction, a takeout or a resync: a new still from each camera,
	// sent on the backend connection (only while it is up)
	// Each round of stills also makes the combined still (camera 3), off the event path
	combined := camera.NewCompositor(cfg.BoardURL, tr.SendStill)
	stills := camera.New(cfg.BoardURL, client.CameraCount, func(st camera.Still) {
		tr.SendStill(st)
		combined.Add(ctx, st)
	})
	lights := wled.New(tr.SendMessage)
	defer lights.Close()
	browser := wled.ZeroconfBrowser()
	lights.SetBrowser(browser) // lets a device that changed IP (a MAC mismatch or a dial error) trigger its own rescan
	tr.OnMessage(func(kind string, data json.RawMessage) {
		if kind == "bm.request" {
			relayBM(ctx, client, tr, data)
			return
		}
		lights.Handle(ctx, browser, kind, data)
	})

	// And on every (re)connect, so viewers see the board after a restart without waiting for a dart.
	// WLEDs are only scanned when a user asks (wled.scan), never on a timer or a connect.
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

// outboxPath is where the transport keeps unacked game data across restarts: next to
// bridge.toml (the volume a container keeps); none without a config path.
func outboxPath(cfgPath string) string {
	if cfgPath == "" {
		return ""
	}
	return filepath.Join(filepath.Dir(cfgPath), "outbox.json")
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

// relayBM answers a backend bm.request: the backend never reaches the board's network, so the
// bridge makes the Board Manager call. It runs off the reader goroutine.
func relayBM(ctx context.Context, client *bm.Client, tr *transport.Transport, data json.RawMessage) {
	var req schema.BmRequestData
	if err := json.Unmarshal(data, &req); err != nil {
		log.Debug("bm.request: malformed, dropped", "err", err)
		return
	}
	go func() {
		res := client.Relay(ctx, req)
		if res.Error != nil {
			log.Warn("Board Manager call failed", "op", req.Op, "err", *res.Error)
		}
		tr.SendMessage(map[string]any{"kind": "bm.response", "data": res})
	}()
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
