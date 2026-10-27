package bigscreen

import (
	"strings"
	"testing"
)

func TestDesktopEntry(t *testing.T) {
	got, err := desktopEntry("/usr/local/bin/dartcade-bridge")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"Exec=/usr/local/bin/dartcade-bridge big-screen-helper\n",
		"X-GNOME-Autostart-enabled=true", "Hidden=false", "Type=Application",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in\n%s", want, got)
		}
	}
}

func TestDesktopEntryQuoting(t *testing.T) {
	for _, c := range []struct{ exe, want string }{
		{"/opt/my apps/bridge", `Exec="/opt/my apps/bridge" big-screen-helper`},
		{"/opt/100%/bridge", `Exec=/opt/100%%/bridge big-screen-helper`},
		{"/opt/a b%/bridge", `Exec="/opt/a b%%/bridge" big-screen-helper`},
		{`/opt/a"b/bridge`, `Exec="/opt/a\"b/bridge" big-screen-helper`},
		{"/opt/a$b`c/bridge", "Exec=\"/opt/a\\$b\\`c/bridge\" big-screen-helper"},
		// a literal backslash: doubled by the quoting rule, doubled again by the string escaping
		{`/opt/a\b/bridge`, `Exec="/opt/a\\\\b/bridge" big-screen-helper`},
	} {
		got, err := desktopEntry(c.exe)
		if err != nil || !strings.Contains(got, c.want+"\n") {
			t.Errorf("%q: want %q in\n%s (err %v)", c.exe, c.want, got, err)
		}
	}
}

func TestDesktopEntryRejectsLineBreaks(t *testing.T) {
	for _, exe := range []string{"/opt/a\nExec=evil", "/opt/a\rb"} {
		if _, err := desktopEntry(exe); err == nil {
			t.Errorf("%q accepted", exe)
		}
	}
}

func TestLaunchAgentPlist(t *testing.T) {
	got := launchAgentPlist("/Applications/A&B/bridge")
	for _, want := range []string{
		"<string>/Applications/A&amp;B/bridge</string>", "<string>big-screen-helper</string>",
		"<key>RunAtLoad</key>", "<key>KeepAlive</key>", "com.dartcade.big-screen",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in\n%s", want, got)
		}
	}
}
