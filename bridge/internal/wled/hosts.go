// Package wled drives WLED devices for the backend: only paired devices, only WLED's /json
// endpoints, only on the local network.
package wled

import (
	"encoding/json"
	"net"
	"os"
	"strings"
)

// allowLoopback lets dev/test setups (the backend and a WLED emulator on the same machine) treat
// loopback as local. Off by default: on a real bridge host, loopback also reaches the Board
// Manager and any other local daemon, which a paired "device" must not be able to hit.
var allowLoopback = os.Getenv("DARTCADE_WLED_ALLOW_LOOPBACK") == "1"

// LocalHost is the cheap pre-check (filtering discovery results, rejecting an obviously-bad
// pairing host) for whether host (an IP or name, optionally with a port, nothing else) is on the
// local network: RFC 1918, link-local, or an mDNS .local name. It is not the real guard: a
// .local name resolves over unicast DNS and can point anywhere, so NewHTTPClient's dialer
// re-checks the resolved IP at connect time, which is what actually matters.
func LocalHost(host string) bool {
	if host == "" || strings.ContainsAny(host, "/@?#") || strings.Contains(host, "://") {
		return false
	}
	h := host
	if sh, _, err := net.SplitHostPort(host); err == nil {
		h = sh
	}
	h = strings.Trim(h, "[]")
	if ip := net.ParseIP(h); ip != nil {
		if ip.IsLoopback() {
			return allowLoopback
		}
		return ip.IsPrivate() || ip.IsLinkLocalUnicast()
	}
	return strings.HasSuffix(strings.ToLower(h), ".local")
}

// ClampBri caps the master and every segment brightness at max; a state without "bri" gets max.
// A "bri" that isn't a plain number — WLED also accepts relative strings like "~255" or "~+50"
// — is treated as uncappable and replaced with max rather than passed through.
func ClampBri(state json.RawMessage, max int) (json.RawMessage, error) {
	var m map[string]any
	if err := json.Unmarshal(state, &m); err != nil {
		return nil, err
	}
	clamp := func(o map[string]any, setMissing bool) {
		v, exists := o["bri"]
		if !exists {
			if setMissing {
				o["bri"] = max
			}
			return
		}
		if b, ok := v.(float64); ok {
			if int(b) > max {
				o["bri"] = max
			}
			return
		}
		o["bri"] = max
	}
	clamp(m, true)
	if segs, ok := m["seg"].([]any); ok {
		for _, s := range segs {
			if so, ok := s.(map[string]any); ok {
				clamp(so, false)
			}
		}
	} else if so, ok := m["seg"].(map[string]any); ok {
		clamp(so, false)
	}
	return json.Marshal(m)
}
