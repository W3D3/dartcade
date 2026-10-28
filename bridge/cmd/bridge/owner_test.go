//go:build !windows

package main

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func TestChownLikeFollowsRefOwner(t *testing.T) {
	dir := t.TempDir()
	// The state dir is reached through a symlink, like /var/lib/<name> -> /var/lib/private/<name>
	link := filepath.Join(t.TempDir(), "state")
	if err := os.Symlink(dir, link); err != nil {
		t.Fatal(err)
	}
	// As root, play a service user that owns the dir while root owns the file
	if os.Getuid() == 0 {
		if err := os.Chown(dir, 61984, 61984); err != nil {
			t.Fatal(err)
		}
	}
	f := filepath.Join(dir, "bridge.toml")
	if err := os.WriteFile(f, []byte("x\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := chownLike(f, link); err != nil {
		t.Fatal(err)
	}
	fi, _ := os.Stat(f)
	di, _ := os.Stat(dir)
	got, want := fi.Sys().(*syscall.Stat_t), di.Sys().(*syscall.Stat_t)
	if got.Uid != want.Uid || got.Gid != want.Gid {
		t.Fatalf("file owner %d:%d, dir owner %d:%d", got.Uid, got.Gid, want.Uid, want.Gid)
	}
}
