package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/charmbracelet/log"
	"github.com/kardianos/service"
)

const (
	serviceName     = "dartcade-bridge"
	defaultBoardURL = "http://localhost:3180"
)

// program runs the bridge under the OS service manager (Windows service, launchd) or, when
// started from a terminal, in the foreground. Stop is called on Ctrl-C and on a service stop.
type program struct {
	run    func(ctx context.Context)
	cancel context.CancelFunc
	done   chan struct{}
}

func (p *program) Start(service.Service) error {
	ctx, cancel := context.WithCancel(context.Background())
	p.cancel = cancel
	p.done = make(chan struct{})
	go func() {
		defer close(p.done)
		p.run(ctx)
		if ctx.Err() == nil {
			// the bridge ended on its own: exit non-zero so the service manager restarts it
			log.Error("the bridge stopped unexpectedly")
			os.Exit(1)
		}
	}()
	return nil
}

func (p *program) Stop(service.Service) error {
	p.cancel()
	select {
	case <-p.done:
	case <-time.After(10 * time.Second):
	}
	return nil
}

// systemdUnit replaces the library's default unit: a dynamic user that owns its state dir and
// little else, and a short restart delay (the default waits 2 minutes).
const systemdUnit = `[Unit]
Description={{Description}}
Documentation=https://github.com/W3D3/dartcade
After=network-online.target
Wants=network-online.target
ConditionFileIsExecutable={{Path | cmdEscape}}

[Service]
ExecStart={{Path | cmdEscape}}{{range Arguments}} {{. | cmd}}{{end}}
Restart=always
RestartSec=10
DynamicUser=yes
StateDirectory=` + serviceName + `
StateDirectoryMode=0700
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
`

func serviceConfig(args []string) *service.Config {
	cfg := &service.Config{
		Name:        serviceName,
		DisplayName: "Dartcade bridge",
		Description: "Connects a dart board to Dartcade",
		Arguments:   args,
		Option: service.KeyValue{
			"OnFailure":              "restart",
			"OnFailureDelayDuration": "10s",
			"KeepAlive":              true,
			"RunAtLoad":              true,
			"LogOutput":              true,
			"SystemdScript":          systemdUnit,
		},
	}
	if runtime.GOOS == "windows" {
		cfg.UserName = `NT AUTHORITY\LocalService`
	}
	return cfg
}

// serviceStateDir is where an installed service keeps bridge.toml: the service runs as no
// particular user, so the per-user config dir would be wrong.
func serviceStateDir() string {
	switch runtime.GOOS {
	case "windows":
		base := os.Getenv("ProgramData")
		if base == "" {
			base = `C:\ProgramData`
		}
		return filepath.Join(base, serviceName)
	case "darwin":
		return "/Library/Application Support/" + serviceName
	default:
		return "/var/lib/" + serviceName
	}
}

// serviceArgs are the flags the installed service starts the bridge with. Tokens are not among
// them: a unit file or service entry is readable by other users, bridge.toml is not.
func serviceArgs(stateDir, boardURL, backendURL, logLevel string) []string {
	args := []string{"--config-dir", stateDir}
	for _, kv := range [][2]string{
		{"--board-url", boardURL}, {"--backend-url", backendURL}, {"--log-level", logLevel},
	} {
		if kv[1] != "" {
			args = append(args, kv[0], kv[1])
		}
	}
	return args
}

// runServiceCommand handles `dartcade-bridge install|uninstall [flags]`.
func runServiceCommand(action string, argv []string) error {
	fs := flag.NewFlagSet(action, flag.ExitOnError)
	boardURL := fs.String("board-url", "", "Board Manager base URL (default: "+defaultBoardURL+")")
	backendURL := fs.String("backend-url", "", "Backend URL (default: "+defaultBackendURL+")")
	installToken := fs.String("install-token", "", "One-time token from the dashboard's install command")
	token := fs.String("token", "", "Bridge authentication token (skips pairing)")
	logLevel := fs.String("log-level", "", "Log level: debug, info, warn, error")
	stateDir := fs.String("config-dir", serviceStateDir(), "Directory for bridge.toml")
	purge := fs.Bool("purge", false, "uninstall: also delete the config and the pairing")
	fs.Parse(argv)

	if action == "install" && *boardURL == "" {
		*boardURL = defaultBoardURL
	}
	svc, err := service.New(&program{}, serviceConfig(serviceArgs(*stateDir, *boardURL, *backendURL, *logLevel)))
	if err != nil {
		return err
	}
	switch action {
	case "install":
		if err := secureDir(*stateDir); err != nil {
			return fmt.Errorf("prepare %s: %w", *stateDir, err)
		}
		for key, val := range map[string]string{"install_token": *installToken, "token": *token} {
			if val == "" {
				continue
			}
			if err := setConfigKey(filepath.Join(*stateDir, "bridge.toml"), key, val); err != nil {
				return fmt.Errorf("save %s: %w", key, err)
			}
		}
		// Installing again replaces the service, so new settings take effect
		_ = service.Control(svc, "stop")
		_ = service.Control(svc, "uninstall")
		if err := service.Control(svc, "install"); err != nil {
			return withElevationHint(err)
		}
		if err := service.Control(svc, "start"); err != nil {
			return withElevationHint(err)
		}
		fmt.Printf("Installed and started %s; it starts at boot and restarts if it stops.\nConfig and pairing: %s\n", serviceName, *stateDir)
	case "uninstall":
		if _, err := svc.Status(); !errors.Is(err, service.ErrNotInstalled) {
			_ = service.Control(svc, "stop")
			if err := service.Control(svc, "uninstall"); err != nil {
				return withElevationHint(err)
			}
		}
		if *purge {
			if err := os.RemoveAll(*stateDir); err != nil {
				return err
			}
			if runtime.GOOS == "linux" && *stateDir == serviceStateDir() {
				// DynamicUser keeps the real state under /var/lib/private; stateDir is only a symlink to it
				if err := os.RemoveAll("/var/lib/private/" + serviceName); err != nil {
					return err
				}
			}
			fmt.Println("Removed the service, its config and its pairing.")
		} else {
			fmt.Printf("Removed the service. Its config and pairing in %s are kept; add --purge to delete them.\n", *stateDir)
		}
	}
	return nil
}

func withElevationHint(err error) error {
	if os.IsPermission(err) || errors.Is(err, os.ErrPermission) || runtime.GOOS == "windows" {
		return fmt.Errorf("%w (run this from an Administrator terminal, or with sudo)", err)
	}
	return fmt.Errorf("%w (run with sudo?)", err)
}

// secureDir creates the state dir private to the service. On Windows Go's 0700 means nothing, so
// the ACL is reset to SYSTEM, Administrators and the service account (LocalService).
func secureDir(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	if runtime.GOOS != "windows" {
		return nil
	}
	out, err := exec.Command("icacls", dir, "/inheritance:r", "/grant:r",
		"*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-19:(OI)(CI)M").CombinedOutput()
	if err != nil {
		return fmt.Errorf("icacls: %w: %s", err, out)
	}
	return nil
}

// openServiceLog is where a Windows service writes its log (it has no console): bridge.log
// beside bridge.toml, started fresh once it passes 5 MB.
func openServiceLog(cfgPath string) (*os.File, error) {
	path := filepath.Join(filepath.Dir(cfgPath), "bridge.log")
	if fi, err := os.Stat(path); err == nil && fi.Size() > 5<<20 {
		_ = os.Rename(path, path+".old")
	}
	return os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
}
