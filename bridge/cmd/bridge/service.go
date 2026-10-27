package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"dartcade/bridge/internal/bigscreen"
	"dartcade/bridge/internal/update"
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
			if restarting.Load() {
				log.Info("exiting for the service manager to start the updated bridge")
			} else {
				log.Error("the bridge stopped unexpectedly")
			}
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
// little else, and a short restart delay (the default waits 2 minutes). The bridge can't write
// its own binary, so an update it staged in its state dir is installed by ExecStopPost, which
// runs as root ("+") once the bridge exited and re-verifies the update (update.Apply).
const systemdUnit = `[Unit]
Description={{Description}}
Documentation=https://github.com/W3D3/dartcade
After=network-online.target
Wants=network-online.target
ConditionFileIsExecutable={{Path | cmdEscape}}

[Service]
ExecStart={{Path | cmdEscape}}{{range Arguments}} {{. | cmd}}{{end}}
ExecStopPost=+{{Path | cmdEscape}} apply-update{{range Arguments}} {{. | cmd}}{{end}}
{{range EnvVars}}{{.}}
{{end}}Restart=always
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
		// Tells the bridge it runs as the service this install registered, so it may update itself
		EnvVars: map[string]string{update.EnvVar: "1"},
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
	cfg := serviceConfig(serviceArgs(*stateDir, *boardURL, *backendURL, *logLevel))
	if runtime.GOOS == "windows" {
		cfg.Executable = windowsServiceExe(*stateDir)
	}
	svc, err := service.New(&program{}, cfg)
	if err != nil {
		return err
	}
	switch action {
	case "install":
		if err := secureDir(*stateDir); err != nil {
			return fmt.Errorf("prepare %s: %w", *stateDir, err)
		}
		cfgPath := filepath.Join(*stateDir, "bridge.toml")
		for key, val := range map[string]string{"install_token": *installToken, "token": *token} {
			if val == "" {
				continue
			}
			if err := setConfigKey(cfgPath, key, val); err != nil {
				return fmt.Errorf("save %s: %w", key, err)
			}
		}
		// A reinstall finds the state dir owned by the service's dynamic user
		if err := chownLike(cfgPath, *stateDir); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("give %s to the service: %w", cfgPath, err)
		}
		// Installing again replaces the service, so new settings take effect
		_ = service.Control(svc, "stop")
		_ = service.Control(svc, "uninstall")
		if runtime.GOOS == "windows" {
			if err := copySelf(cfg.Executable); err != nil {
				return fmt.Errorf("copy the bridge to %s: %w", cfg.Executable, err)
			}
		}
		if err := service.Control(svc, "install"); err != nil {
			return withElevationHint(err)
		}
		if err := service.Control(svc, "start"); err != nil {
			return withElevationHint(err)
		}
		fmt.Printf("Installed and started %s; it starts at boot and restarts if it stops.\nConfig and pairing: %s\n", serviceName, *stateDir)
		registerHelper()
	case "uninstall":
		unregisterHelper()
		if _, err := svc.Status(); !errors.Is(err, service.ErrNotInstalled) {
			_ = service.Control(svc, "stop")
			if err := service.Control(svc, "uninstall"); err != nil {
				return withElevationHint(err)
			}
		}
		if runtime.GOOS == "windows" {
			_ = os.Remove(cfg.Executable)
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

// registerHelper makes the desktop user's login start the big screen helper. It never fails the
// install: without a desktop user or a writable home the big screen just isn't set up.
func registerHelper() {
	u, err := bigscreen.InvokingUser()
	if err != nil {
		fmt.Println("Big screen: not set up (run the install with sudo from your desktop user to enable it).")
		return
	}
	// The installed binary, not the service's copy in its state dir: that one is closed to
	// the desktop user on Windows. After a self-update the helper may be a build behind; it
	// copes with that (degraded mode).
	exe, err := os.Executable()
	if err == nil {
		exe, err = filepath.EvalSymlinks(exe)
	}
	if err != nil {
		fmt.Println("Big screen: not set up:", err)
		return
	}
	if err := bigscreen.Register(exe, u); err != nil {
		fmt.Println("Big screen: not set up:", err)
		return
	}
	now := fmt.Sprintf("`%s big-screen-helper &`", exe)
	if runtime.GOOS == "windows" {
		now = fmt.Sprintf("`Start-Process \"%s\" big-screen-helper` in PowerShell", exe)
	}
	fmt.Printf("Big screen: the helper starts at your next login; to start it now, run %s in your desktop session.\n", now)
}

func unregisterHelper() {
	u, err := bigscreen.InvokingUser()
	if err != nil {
		return
	}
	if err := bigscreen.Unregister(u); err != nil {
		fmt.Println("Big screen: could not remove the helper's autostart:", err)
	}
}

// windowsServiceExe is the copy of the bridge a Windows service runs: in its state dir, which
// the service account (LocalService) may write, so it can update itself. The copy in Program
// Files stays the administrator's: no administrator ever runs this one.
func windowsServiceExe(stateDir string) string {
	return filepath.Join(stateDir, serviceName+".exe")
}

// copySelf copies the running binary to dst (a temp file renamed over it). A dst that still runs
// is renamed away first, which Windows allows (the bridge removes it when it next starts).
func copySelf(dst string) error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	in, err := os.Open(self)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".tmp"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	if cerr := out.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		os.Remove(dst + ".old")
		if rerr := os.Rename(dst, dst+".old"); rerr != nil && !os.IsNotExist(rerr) {
			err = rerr
		}
	}
	if err == nil {
		err = os.Rename(tmp, dst)
	}
	if err != nil {
		os.Remove(tmp)
	}
	return err
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
