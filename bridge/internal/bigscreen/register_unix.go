//go:build !windows

package bigscreen

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strconv"
	"syscall"
)

// InvokingUser is the desktop user the helper is registered for: the one who ran sudo when
// this runs as root, else the current user.
func InvokingUser() (*user.User, error) {
	if os.Geteuid() == 0 {
		name := os.Getenv("SUDO_USER")
		if name == "" {
			return nil, errors.New("running as root without SUDO_USER")
		}
		return user.Lookup(name)
	}
	return user.Current()
}

func registrationPath(u *user.User) string {
	if runtime.GOOS == "darwin" {
		return filepath.Join(u.HomeDir, "Library", "LaunchAgents", "com.dartcade.big-screen.plist")
	}
	return filepath.Join(u.HomeDir, ".config", "autostart", "dartcade-big-screen.desktop")
}

// dropPrivilegesCmd is `exe register-helper-file args...` running as u, with u's home and
// little else in its environment.
func dropPrivilegesCmd(exe string, u *user.User, args ...string) (*exec.Cmd, error) {
	uid, err := strconv.ParseUint(u.Uid, 10, 32)
	if err != nil {
		return nil, fmt.Errorf("bad uid of %s: %w", u.Username, err)
	}
	gid, err := strconv.ParseUint(u.Gid, 10, 32)
	if err != nil {
		return nil, fmt.Errorf("bad gid of %s: %w", u.Username, err)
	}
	var groups []uint32
	if ids, err := u.GroupIds(); err == nil {
		for _, g := range ids {
			if n, err := strconv.ParseUint(g, 10, 32); err == nil {
				groups = append(groups, uint32(n))
			}
		}
	}
	cmd := exec.Command(exe, append([]string{HelperFileCommand}, args...)...)
	cmd.Dir = u.HomeDir
	cmd.Env = []string{"HOME=" + u.HomeDir, "USER=" + u.Username, "PATH=/usr/bin:/bin"}
	cmd.SysProcAttr = &syscall.SysProcAttr{Credential: &syscall.Credential{Uid: uint32(uid), Gid: uint32(gid), Groups: groups}}
	return cmd, nil
}

// asUser runs a helper-file action for u: directly when this already is that user, else as
// a child with u's credentials.
func asUser(u *user.User, args ...string) error {
	if os.Geteuid() != 0 || u.Uid == "0" {
		return helperFile(u.HomeDir, args)
	}
	self, err := os.Executable()
	if err != nil {
		return err
	}
	cmd, err := dropPrivilegesCmd(self, u, args...)
	if err != nil {
		return err
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%w: %s", err, out)
	}
	return nil
}

// Register makes u's next login start `exe big-screen-helper`.
func Register(exe string, u *user.User) error {
	return asUser(u, "write", exe)
}

// Unregister removes the registration; none left is fine.
func Unregister(u *user.User) error { return asUser(u, "remove") }

// RunHelperFile does `write <exe>` or `remove` under $HOME, as the user it runs as.
func RunHelperFile(args []string) error {
	return helperFile(os.Getenv("HOME"), args)
}

func helperFile(home string, args []string) error {
	if home == "" || len(args) == 0 {
		return errors.New("usage: " + HelperFileCommand + " write <exe> | remove (with HOME set)")
	}
	path := registrationPath(&user.User{HomeDir: home})
	switch args[0] {
	case "remove":
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	case "write":
		if len(args) != 2 {
			return errors.New("write needs <exe>")
		}
		var content string
		if runtime.GOOS == "darwin" {
			content = launchAgentPlist(args[1])
		} else {
			var err error
			if content, err = desktopEntry(args[1]); err != nil {
				return err
			}
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		return os.WriteFile(path, []byte(content), 0o644)
	}
	return fmt.Errorf("unknown action %q", args[0])
}
