//go:build windows

package bigscreen

import (
	"errors"
	"os/user"
	"syscall"

	"golang.org/x/sys/windows/registry"
)

const (
	runKey   = `Software\Microsoft\Windows\CurrentVersion\Run`
	runValue = "DartcadeBigScreen"
)

// InvokingUser is the user running the (elevated) install: HKCU is theirs.
func InvokingUser() (*user.User, error) { return user.Current() }

// RunHelperFile is the Unix install's privilege-dropped child; Windows writes the registry directly.
func RunHelperFile([]string) error { return errors.New(HelperFileCommand + " is not used on Windows") }

func Register(exe string, _ *user.User) error {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	return k.SetStringValue(runValue, `"`+exe+`" `+HelperCommand)
}

func Unregister(*user.User) error {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		if err == registry.ErrNotExist || err == syscall.ERROR_FILE_NOT_FOUND {
			return nil
		}
		return err
	}
	defer k.Close()
	if err := k.DeleteValue(runValue); err != nil && err != registry.ErrNotExist {
		return err
	}
	return nil
}
