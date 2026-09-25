package bm

import (
	"encoding/json"
	"time"
)

// BMFrame is the common envelope for every frame the BM client emits.
type BMFrame struct {
	Kind       string          // "ws", "poll", "bm_connect", "bm_reconnect", "bm_disconnect"
	BMType     string          // BM event type ("state", "motion_state", etc.); empty for synthetic frames
	Data       json.RawMessage // nil for synthetic frames
	RecvWall   time.Time
	RecvMonoNs int64
	GapMs      int64 // only on bm_reconnect
}

// BMStateData is the payload of a Board Manager "state" frame.
type BMStateData struct {
	Connected bool      `json:"connected"`
	Event     string    `json:"event"`
	NumThrows int       `json:"numThrows"`
	Running   bool      `json:"running"`
	Status    string    `json:"status"`
	Throws    []BMThrow `json:"throws"`
}

// BMThrow is one dart in a state frame.
type BMThrow struct {
	Segment BMSegment `json:"segment"`
	Coords  *BMCoords `json:"coords,omitempty"`
	Bouncer bool      `json:"bouncer,omitempty"`
}

// BMSegment is the segment descriptor from Board Manager.
type BMSegment struct {
	Name       string `json:"name"`
	Number     int    `json:"number"`
	Bed        string `json:"bed"`
	Multiplier int    `json:"multiplier"`
}

// BMCoords is the normalised board coordinate pair.
type BMCoords struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// BMMotionData is the payload of a Board Manager "motion_state" frame.
type BMMotionData struct {
	IsDart           bool `json:"isDart"`
	IsHand           bool `json:"isHand"`
	IsStable         bool `json:"isStable"`
	IsTakeoutPartial bool `json:"isTakeoutPartial"`
	IsTakeoutFull    bool `json:"isTakeoutFull"`
	IsWaiting        bool `json:"isWaiting"`
}
