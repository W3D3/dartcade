package wled

import (
	"encoding/json"

	"github.com/charmbracelet/log"
)

// The WLED state keys a light may set: the backend checks a raw JSON look against the same list
// (backend/src/shared/lights/wledState.ts; schema/wled-state-allowlist.json is the list both are
// tested against). Nothing else reaches a device from the backend: no preset save or delete, no
// reboot, no sync or network settings.
var (
	allowedState = keySet("on", "bri", "transition", "mainseg", "ps", "seg")
	allowedSeg   = keySet("id", "start", "stop", "len", "grp", "spc", "of", "on", "frz", "bri", "cct", "set", "lc", "n", "col",
		"fx", "sx", "ix", "pal", "c1", "c2", "c3", "sel", "rev", "mi", "o1", "o2", "o3", "si", "m12", "bm")
)

func keySet(keys ...string) map[string]bool {
	s := make(map[string]bool, len(keys))
	for _, k := range keys {
		s[k] = true
	}
	return s
}

// Allowed drops every key of state, and of each of its segments, that is not on the allowlist.
func Allowed(state json.RawMessage) (json.RawMessage, error) {
	var m map[string]any
	if err := json.Unmarshal(state, &m); err != nil {
		return nil, err
	}
	dropped := keep(m, allowedState)
	if segs, ok := m["seg"].([]any); ok {
		for _, s := range segs {
			if so, ok := s.(map[string]any); ok {
				dropped = append(dropped, keep(so, allowedSeg)...)
			}
		}
	}
	if len(dropped) > 0 {
		log.Warn("wled: dropped state keys the backend may not send", "keys", dropped)
	}
	return json.Marshal(m)
}

func keep(o map[string]any, allowed map[string]bool) []string {
	var dropped []string
	for k := range o {
		if !allowed[k] {
			delete(o, k)
			dropped = append(dropped, k)
		}
	}
	return dropped
}
