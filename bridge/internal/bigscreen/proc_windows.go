//go:build windows

package bigscreen

import (
	"os/exec"
	"strconv"
)

func setProcessGroup(*exec.Cmd) {}

func killTree(cmd *exec.Cmd) {
	_ = exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid)).Run()
}
