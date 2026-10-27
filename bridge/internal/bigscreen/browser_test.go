package bigscreen

import (
	"errors"
	"reflect"
	"testing"
)

func lookFor(present ...string) func(string) (string, error) {
	return func(n string) (string, error) {
		for _, p := range present {
			if p == n {
				return n, nil
			}
		}
		return "", errors.New("not found")
	}
}

func TestChooseCommand(t *testing.T) {
	chromiumArgs := []string{"--kiosk", "--incognito", "--user-data-dir=/p", "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--noerrdialogs", "--disable-infobars", "--", "http://u"}
	cases := []struct {
		name    string
		look    func(string) (string, error)
		goos    string
		cmd     string
		args    []string
		browser string
	}{
		{"chromium", lookFor("chromium", "firefox"), "linux", "chromium", chromiumArgs, "chromium"},
		{"chrome after chromium-browser", lookFor("google-chrome"), "linux", "google-chrome", chromiumArgs, "chrome"},
		{"firefox only", lookFor("firefox"), "linux", "firefox", []string{"--kiosk", "--profile", "/p", "--private-window", "http://u"}, "firefox"},
		{"none linux", lookFor(), "linux", "xdg-open", []string{"http://u"}, "default"},
		{"none darwin", lookFor(), "darwin", "open", []string{"http://u"}, "default"},
		{"none windows", lookFor(), "windows", "rundll32", []string{"url.dll,FileProtocolHandler", "http://u"}, "default"},
		{"darwin chrome app", lookFor("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"), "darwin", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", chromiumArgs, "chrome"},
		{"windows chrome", lookFor(`C:\Program Files\Google\Chrome\Application\chrome.exe`), "windows", `C:\Program Files\Google\Chrome\Application\chrome.exe`, chromiumArgs, "chrome"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cmd, args, browser := chooseCommand(c.look, c.goos, "/p", "http://u")
			if cmd != c.cmd || browser != c.browser || !reflect.DeepEqual(args, c.args) {
				t.Fatalf("got %q %q %q", cmd, args, browser)
			}
		})
	}
}
