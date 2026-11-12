//go:build !windows

package bigscreen

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func TestFindKioskReadsTheSingletonLock(t *testing.T) {
	profile := t.TempDir()
	pid := os.Getpid()
	if err := os.Symlink("raspberrypi-"+strconv.Itoa(pid), filepath.Join(profile, "SingletonLock")); err != nil {
		t.Fatal(err)
	}
	argsOf := func(p int) string { return "chromium --kiosk --user-data-dir=" + profile }
	if got, ok := findKiosk(profile, argsOf); !ok || got != pid {
		t.Fatalf("found %d %v", got, ok)
	}
	// the pid was reused by a process that is not a browser on this profile
	other := func(int) string { return "sshd --user-data-dir=" + profile + "-other" }
	if _, ok := findKiosk(profile, other); ok {
		t.Fatal("adopted an unrelated process")
	}
	// a stale lock: its process is gone
	os.Remove(filepath.Join(profile, "SingletonLock"))
	os.Symlink("raspberrypi-2147483646", filepath.Join(profile, "SingletonLock"))
	if _, ok := findKiosk(profile, argsOf); ok {
		t.Fatal("adopted a dead process")
	}
}
