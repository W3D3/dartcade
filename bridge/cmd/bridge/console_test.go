package main

import (
	"bytes"
	"strings"
	"testing"
	"time"
)

func TestFormatCode(t *testing.T) {
	cases := []struct{ in, want string }{
		{"7KQ4M2XD", "7KQ4-M2XD"},
		{"7kq4m2xd", "7KQ4-M2XD"},
		{"ABCD2345", "ABCD-2345"},
		{"ABC", "ABC"},
	}
	for _, tc := range cases {
		if got := formatCode(tc.in); got != tc.want {
			t.Errorf("formatCode(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestFmtCountdown(t *testing.T) {
	cases := []struct {
		d    time.Duration
		want string
	}{
		{7*time.Minute + 42*time.Second, "7:42"},
		{9 * time.Second, "0:09"},
		{10 * time.Minute, "10:00"},
		{-5 * time.Second, "0:00"},
	}
	for _, tc := range cases {
		if got := fmtCountdown(tc.d); got != tc.want {
			t.Errorf("fmtCountdown(%v) = %q, want %q", tc.d, got, tc.want)
		}
	}
}

func TestConsole_BoardFound(t *testing.T) {
	var buf bytes.Buffer
	c := &console{w: &buf, color: false}
	c.boardFound("192.168.1.61:3180", 3)
	out := buf.String()
	if !strings.Contains(out, "Board Manager found at 192.168.1.61:3180") {
		t.Errorf("missing board-found line: %q", out)
	}
	if !strings.Contains(out, "3 cameras detected") {
		t.Errorf("missing cameras line: %q", out)
	}
}

func TestConsole_PairPrompt(t *testing.T) {
	var buf bytes.Buffer
	c := &console{w: &buf, color: false}
	c.pairPrompt("7KQ4M2XD")
	out := buf.String()
	if !strings.Contains(out, "Pair this board") {
		t.Errorf("missing pair header: %q", out)
	}
	if !strings.Contains(out, "7KQ4-M2XD") {
		t.Errorf("code not shown grouped: %q", out)
	}
	if !strings.Contains(out, "Pair new board") {
		t.Errorf("missing web instruction: %q", out)
	}
}

func TestConsole_CodeExpired(t *testing.T) {
	var buf bytes.Buffer
	c := &console{w: &buf, color: false}
	c.codeExpired("3HNT-V8QW")
	out := buf.String()
	if !strings.Contains(out, "expired") || !strings.Contains(out, "new code") {
		t.Errorf("missing expiry notice: %q", out)
	}
}
