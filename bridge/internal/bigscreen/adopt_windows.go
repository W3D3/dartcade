//go:build windows

package bigscreen

// adopt: shortcut: Windows has no Singleton lock to find a running kiosk by, so none is adopted; add one if it matters there.
func adopt(string) *Running { return nil }
