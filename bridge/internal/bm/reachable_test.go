package bm

import (
	"net"
	"net/url"
	"testing"
)

func TestReachable(t *testing.T) {
	// A non-loopback board URL is left alone, whatever the backend is
	if got := Reachable("http://192.168.0.109:3180", "wss://play.dartca.de/bridge"); got != "http://192.168.0.109:3180" {
		t.Fatalf("got %s", got)
	}
	// A loopback one is rewritten to a LAN address, keeping scheme and port. A backend on
	// loopback has no LAN route to pick, so only assert when the machine has one.
	got := Reachable("http://localhost:3180", "ws://192.0.2.1:3000/bridge")
	if got == "http://localhost:3180" {
		t.Skip("no network route in this environment")
	}
	u, err := url.Parse(got)
	if err != nil || u.Scheme != "http" || u.Port() != "3180" {
		t.Fatalf("got %s", got)
	}
	if ip := net.ParseIP(u.Hostname()); ip == nil || ip.IsLoopback() {
		t.Fatalf("got %s", got)
	}
}
