package bigscreen

import (
	"os/exec"
	"runtime"
)

// Running is a launched big-screen window.
type Running struct {
	Browser string
	// Done closes when the window's process exits; nil when it can't be watched (the default browser)
	Done <-chan struct{}
	// Kill ends the window's whole process tree; nil when it can't be (the default browser)
	Kill func()
}

// Launcher opens a URL as a big screen.
type Launcher interface {
	Launch(url string) (*Running, error)
}

type candidate struct{ name, bin string }

func chromiumCandidates(goos string) []candidate {
	switch goos {
	case "darwin":
		return []candidate{
			{"chromium", "/Applications/Chromium.app/Contents/MacOS/Chromium"},
			{"chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"},
		}
	case "windows":
		return []candidate{
			{"chrome", `C:\Program Files\Google\Chrome\Application\chrome.exe`},
			{"chrome", `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`},
		}
	}
	return []candidate{{"chromium", "chromium"}, {"chromium", "chromium-browser"}, {"chrome", "google-chrome"}, {"chrome", "google-chrome-stable"}, {"chrome", "chrome"}}
}

func firefoxCandidates(goos string) []string {
	switch goos {
	case "darwin":
		return []string{"/Applications/Firefox.app/Contents/MacOS/firefox"}
	case "windows":
		return []string{`C:\Program Files\Mozilla Firefox\firefox.exe`}
	}
	return []string{"firefox"}
}

// chooseCommand picks the browser: Chromium or Chrome (own profile, kiosk), then Firefox
// (kiosk), else the OS opener with the default browser, which can't be told to go kiosk or killed.
func chooseCommand(lookPath func(string) (string, error), goos, profile, url string) (name string, args []string, browser string) {
	for _, c := range chromiumCandidates(goos) {
		if _, err := lookPath(c.bin); err == nil {
			return c.bin, []string{"--kiosk", "--user-data-dir=" + profile, "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--noerrdialogs", "--disable-infobars", "--", url}, c.name
		}
	}
	for _, bin := range firefoxCandidates(goos) {
		if _, err := lookPath(bin); err == nil {
			return bin, []string{"--kiosk", "--profile", profile, url}, "firefox"
		}
	}
	switch goos {
	case "darwin":
		return "open", []string{url}, "default"
	case "windows":
		return "rundll32", []string{"url.dll,FileProtocolHandler", url}, "default"
	}
	return "xdg-open", []string{url}, "default"
}

type osLauncher struct{ profileDir string }

// DefaultLauncher opens the page in an installed browser, with its own profile in profileDir.
func DefaultLauncher(profileDir string) Launcher { return osLauncher{profileDir} }

func (l osLauncher) Launch(url string) (*Running, error) {
	name, args, browser := chooseCommand(exec.LookPath, runtime.GOOS, l.profileDir, url)
	cmd := exec.Command(name, args...)
	setProcessGroup(cmd)
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	if browser == "default" {
		// degraded: no kiosk, no kill handle, so close can't close this window and running stays latched until the next open or close
		go cmd.Wait() // the opener returns at once; the browser it started is not ours to stop
		return &Running{Browser: browser}, nil
	}
	done := make(chan struct{})
	go func() { cmd.Wait(); close(done) }()
	return &Running{Browser: browser, Done: done, Kill: func() { killTree(cmd) }}, nil
}
