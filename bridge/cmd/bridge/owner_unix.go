//go:build !windows

package main

import (
	"fmt"
	"os"
	"syscall"
)

// chownLike gives path the owner of ref. `install` runs as root, so what it writes into the
// state dir is root's; with DynamicUser the service is another user, and systemd only fixes
// ownership when it creates or migrates the dir, not for files added to one the user already
// owns (a reinstall). Following symlinks, so ref may be /var/lib/<name> (a link to /var/lib/private).
func chownLike(path, ref string) error {
	fi, err := os.Stat(ref)
	if err != nil {
		return err
	}
	st, ok := fi.Sys().(*syscall.Stat_t)
	if !ok {
		return fmt.Errorf("no owner for %s", ref)
	}
	return os.Chown(path, int(st.Uid), int(st.Gid))
}
