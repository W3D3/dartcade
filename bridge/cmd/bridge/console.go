package main

import (
	"fmt"
	"io"
	"os"
	"strings"
	"time"
)

// newConsole builds a console writing to f, enabling colour + in-place line
// updates only when f is an interactive terminal (not a pipe or docker logs).
func newConsole(f *os.File) *console {
	color := false
	if fi, err := f.Stat(); err == nil && fi.Mode()&os.ModeCharDevice != 0 {
		color = true
	}
	return &console{w: f, color: color}
}

// ANSI colours (only emitted when color is true).
const (
	ansiReset = "\033[0m"
	ansiDim   = "\033[90m"       // grey secondary text
	ansiGreen = "\033[38;5;155m" // accent lime, close to the UI accent
	ansiBold  = "\033[1m"
)

// console renders the lean, human-friendly bridge output. color is disabled
// when stdout is not a terminal (piped, docker logs) so the raw ANSI codes
// don't leak into log aggregators.
type console struct {
	w        io.Writer
	color    bool
	lastWait time.Time
}

func (c *console) paint(code, s string) string {
	if !c.color {
		return s
	}
	return code + s + ansiReset
}

func (c *console) line(format string, a ...any) {
	fmt.Fprintf(c.w, format+"\n", a...)
}

const codeCharset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// formatCode uppercases the pairing code and groups it as XXXX-XXXX for
// readability. Characters outside the charset are dropped.
func formatCode(raw string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(raw) {
		if strings.ContainsRune(codeCharset, r) {
			b.WriteRune(r)
		}
	}
	s := b.String()
	if len(s) <= 4 {
		return s
	}
	return s[:4] + "-" + s[4:]
}

// fmtCountdown renders a duration as M:SS, clamped at zero.
func fmtCountdown(d time.Duration) string {
	if d < 0 {
		d = 0
	}
	total := int(d.Round(time.Second).Seconds())
	return fmt.Sprintf("%d:%02d", total/60, total%60)
}

// banner prints the startup line with the bridge version.
func (c *console) banner(version string) {
	c.line("%s %s", c.paint(ansiBold, "dartcade-bridge"), c.paint(ansiDim, version))
}

// boardFound prints the board-manager and camera confirmation lines.
func (c *console) boardFound(addr string, cams int) {
	check := c.paint(ansiGreen, "✓")
	c.line("%s Board Manager found at %s", check, addr)
	noun := "cameras"
	if cams == 1 {
		noun = "camera"
	}
	c.line("%s %d %s detected", check, cams, noun)
}

// boardUnreachable prints a friendly failure line when the board can't be
// reached, so a non-technical user knows what to check.
func (c *console) boardUnreachable(addr string) {
	c.line("%s Couldn't reach the Board Manager at %s", c.paint(ansiBold, "✗"), addr)
	c.line("%s", c.paint(ansiDim, "  Check that the board is on and dartcade-bridge points at the right address."))
}

// pairPrompt prints the "Pair this board" block with the code shown large.
func (c *console) pairPrompt(code string) {
	c.lastWait = time.Time{} // let the first waiting line print promptly
	c.line("")
	c.line("%s", c.paint(ansiDim, "── Pair this board ────────────────────"))
	c.line("In Dartcade, open %s and enter:", c.paint(ansiBold, "Boards → Pair new board"))
	c.line("")
	c.line("    %s", c.paint(ansiBold+ansiGreen, formatCode(code)))
	c.line("")
}

// codeExpired notes that a code lapsed and a fresh one is on the way.
func (c *console) codeExpired(code string) {
	c.line("%s", c.paint(ansiDim, fmt.Sprintf("· code %s expired · new code issued", formatCode(code))))
}

// waiting renders the single status line under the code. When the output is a
// terminal it is rewritten in place (carriage return, no newline); otherwise
// it is printed as a normal line.
func (c *console) waiting(remaining time.Duration) {
	msg := fmt.Sprintf("Next code in %s · older codes stop working · Waiting for pairing…", fmtCountdown(remaining))
	if c.color {
		// Interactive terminal: rewrite the line in place every tick.
		fmt.Fprintf(c.w, "\r%s%s%s", ansiDim, msg, ansiReset)
		return
	}
	// Non-terminal (docker logs, pipes): a line per second is noise — emit at
	// most one every 30s.
	if time.Since(c.lastWait) < 30*time.Second {
		return
	}
	c.lastWait = time.Now()
	fmt.Fprintf(c.w, "%s\n", msg)
}

// clearWaiting ends the in-place waiting line so following output starts clean.
func (c *console) clearWaiting() {
	if c.color {
		fmt.Fprint(c.w, "\n")
	}
}

// pairedOK prints the confirmation after a successful pairing.
func (c *console) pairedOK() {
	c.line("%s Paired! Connecting to Dartcade…", c.paint(ansiGreen, "✓"))
}
