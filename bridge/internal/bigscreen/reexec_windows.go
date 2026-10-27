//go:build windows

package bigscreen

import (
	"os"
	"os/exec"
	"syscall"
)

// Reexec starts the (updated) binary with the same arguments; the caller then exits.
func Reexec() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	cmd := exec.Command(exe, os.Args[1:]...)
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x00000200 | 0x00000008} // CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS
	return cmd.Start()
}
