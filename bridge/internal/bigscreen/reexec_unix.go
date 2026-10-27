//go:build !windows

package bigscreen

import (
	"os"
	"syscall"
)

// Reexec replaces this process with the (updated) binary on disk, same arguments.
func Reexec() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	return syscall.Exec(exe, os.Args, os.Environ())
}
