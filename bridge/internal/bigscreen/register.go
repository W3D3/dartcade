package bigscreen

import (
	"bytes"
	"encoding/xml"
	"errors"
	"strings"
)

// Registering the helper: the bridge service has no desktop session, so `bridge install`
// makes the desktop user's login start `<exe> big-screen-helper` (Register / Unregister, per OS).

// HelperFileCommand is the hidden subcommand an install running as root re-runs itself with,
// as the desktop user, so nothing in that user's home is written with root's authority (a
// planted symlink there can't send root's writes elsewhere).
const HelperFileCommand = "register-helper-file"

// HelperCommand is the subcommand the desktop user's login runs after the exe.
const HelperCommand = "big-screen-helper"

// quoteExec quotes an argument for a desktop entry's Exec line when it needs it. % is a field
// code, so it is doubled. Inside the quotes ", ` and $ get a backslash, and a literal backslash
// becomes four: the quoting rule doubles it, then the file's string escaping doubles it again.
func quoteExec(s string) string {
	s = strings.ReplaceAll(s, "%", "%%")
	if !strings.ContainsAny(s, " \t\"'\\`$<>~|&;*?#()=") {
		return s
	}
	return `"` + strings.NewReplacer(`\`, `\\\\`, `"`, `\"`, "`", "\\`", "$", `\$`).Replace(s) + `"`
}

func desktopEntry(exe string) (string, error) {
	line := quoteExec(exe) + " " + HelperCommand
	if strings.ContainsAny(line, "\n\r") {
		return "", errors.New("the bridge path contains a line break")
	}
	return "[Desktop Entry]\nType=Application\nName=Dartcade Big screen\n" +
		"Comment=Shows the dart board's big screen\nExec=" + line + "\n" +
		"Terminal=false\nX-GNOME-Autostart-enabled=true\nHidden=false\n", nil
}

func xmlEscape(s string) string {
	var b bytes.Buffer
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

func launchAgentPlist(exe string) string {
	var args strings.Builder
	for _, a := range []string{exe, HelperCommand} {
		args.WriteString("\t\t<string>" + xmlEscape(a) + "</string>\n")
	}
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.dartcade.big-screen</string>
	<key>ProgramArguments</key>
	<array>
` + args.String() + `	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
</dict>
</plist>
`
}
