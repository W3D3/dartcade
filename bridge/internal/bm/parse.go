package bm

import (
	"encoding/json"
	"fmt"
	"time"
)

// recorderLine is the top-level shape of every line the spike recorder emits.
type recorderLine struct {
	Kind       string          `json:"kind"`
	BMType     string          `json:"bm_type"`
	Data       json.RawMessage `json:"data"`
	RecvWall   string          `json:"recv_wall"`
	RecvMonoNs int64           `json:"recv_mono_ns"`
	GapMs      int64           `json:"gap_ms"`
}

// ParseFrame parses one JSONL line from the spike recorder format into a BMFrame.
// Returns (nil, nil) for lines that should be skipped (startup_version, startup_config, marker, etc.).
func ParseFrame(line []byte) (*BMFrame, error) {
	var r recorderLine
	if err := json.Unmarshal(line, &r); err != nil {
		return nil, fmt.Errorf("parse recorder line: %w", err)
	}

	var wall time.Time
	var err error
	wall, err = time.Parse(time.RFC3339Nano, r.RecvWall)
	if err != nil {
		wall, err = time.Parse(time.RFC3339, r.RecvWall)
		if err != nil {
			return nil, fmt.Errorf("parse recv_wall %q: %w", r.RecvWall, err)
		}
	}

	switch r.Kind {
	case "connect":
		return &BMFrame{Kind: "bm_connect", RecvWall: wall, RecvMonoNs: r.RecvMonoNs}, nil
	case "reconnect":
		return &BMFrame{Kind: "bm_reconnect", RecvWall: wall, RecvMonoNs: r.RecvMonoNs, GapMs: r.GapMs}, nil
	case "disconnect":
		return &BMFrame{Kind: "bm_disconnect", RecvWall: wall, RecvMonoNs: r.RecvMonoNs}, nil
	case "ws_frame":
		return &BMFrame{Kind: "ws", BMType: r.BMType, Data: r.Data, RecvWall: wall, RecvMonoNs: r.RecvMonoNs}, nil
	case "poll":
		return &BMFrame{Kind: "poll", BMType: "state", Data: r.Data, RecvWall: wall, RecvMonoNs: r.RecvMonoNs}, nil
	case "startup_version", "startup_config", "marker":
		return nil, nil
	default:
		return nil, nil // unknown kinds are skipped, not errors
	}
}
