//go:build !windows

package bigscreen

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// findKiosk returns the pid of a live browser using profile. Chromium keeps one instance per
// profile and records it in SingletonLock (a symlink "host-pid"); argsOf says what a pid runs, so
// a pid the OS handed to another program after the browser died is not adopted.
func findKiosk(profile string, argsOf func(pid int) string) (int, bool) {
	target, err := os.Readlink(filepath.Join(profile, "SingletonLock"))
	if err != nil {
		return 0, false
	}
	pid, err := strconv.Atoi(target[strings.LastIndex(target, "-")+1:])
	if err != nil || pid <= 0 || syscall.Kill(pid, 0) != nil {
		return 0, false
	}
	return pid, strings.Contains(argsOf(pid)+" ", "--user-data-dir="+profile+" ")
}

func psArgs(pid int) string {
	out, _ := exec.Command("ps", "-o", "args=", "-p", strconv.Itoa(pid)).Output()
	return strings.TrimSpace(string(out))
}

// adopt wraps a kiosk that is already open (one an earlier helper launched, or one this helper lost
// track of) as a Running, so it shows as running and Stop and Start can end it.
func adopt(profile string) *Running {
	pid, ok := findKiosk(profile, psArgs)
	if !ok {
		return nil
	}
	alive := func() bool { return syscall.Kill(pid, 0) == nil }
	done := make(chan struct{})
	go func() {
		for alive() {
			time.Sleep(2 * time.Second)
		}
		close(done)
	}()
	return &Running{Browser: "chromium", Done: done, Kill: func() {
		if pg, err := syscall.Getpgid(pid); err == nil && pg == pid {
			_ = syscall.Kill(-pid, syscall.SIGKILL) // its whole tree: the browser leads its process group
		} else {
			_ = syscall.Kill(pid, syscall.SIGKILL)
		}
		for i := 0; i < 30 && alive(); i++ {
			time.Sleep(100 * time.Millisecond)
		}
	}}
}
