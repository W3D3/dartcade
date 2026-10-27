package main

import "golang.org/x/sys/windows"

// detachConsole drops the console window the console-subsystem build opens for the helper.
// x/sys/windows has no FreeConsole wrapper, so it calls kernel32 directly.
func detachConsole() {
	_, _, _ = windows.NewLazySystemDLL("kernel32.dll").NewProc("FreeConsole").Call()
}
