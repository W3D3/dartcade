package bm

import (
	"encoding/json"
	"strings"
	"time"
	"unicode"
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

// The status and event wording the differ acts on: Board Manager 1's, which Board Manager 2's
// camelCase values are converted to (BMStateData.UnmarshalJSON).
const (
	StatusTakeoutInProgress = "Takeout in progress"
	EventTakeoutStarted     = "Takeout started"
	EventManualReset        = "Manual reset"
)

// BMStateData is the payload of a Board Manager "state" frame.
type BMStateData struct {
	Connected bool      `json:"connected"`
	Event     string    `json:"event"`
	NumThrows int       `json:"numThrows"`
	Running   bool      `json:"running"`
	Status    string    `json:"status"`
	Throws    []BMThrow `json:"throws"`
}

// UnmarshalJSON reads both Board Manager formats. Board Manager 2 camelCases the status and
// event values ("throwDetected") and drops numThrows; they are turned back into the 1.x
// wording ("Throw detected") the differ and the backend know.
func (d *BMStateData) UnmarshalJSON(b []byte) error {
	type plain BMStateData
	var raw struct {
		plain
		NumThrows *int `json:"numThrows"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return err
	}
	*d = BMStateData(raw.plain)
	d.Event, d.Status = sentenceCase(d.Event), sentenceCase(d.Status)
	d.NumThrows = len(d.Throws)
	if raw.NumThrows != nil {
		d.NumThrows = *raw.NumThrows
	}
	return nil
}

// sentenceCase turns "takeoutInProgress" into "Takeout in progress"; 1.x wording passes through.
func sentenceCase(s string) string {
	if s == "" || strings.Contains(s, " ") {
		return s
	}
	var b strings.Builder
	for i, r := range s {
		switch {
		case i == 0:
			b.WriteRune(unicode.ToUpper(r))
		case unicode.IsUpper(r):
			b.WriteRune(' ')
			b.WriteRune(unicode.ToLower(r))
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// UnmarshalJSON reads both formats: 1.x nests segment and coords, Board Manager 2 flattens
// them (segmentName, segmentNumber, bed, multiplier, coordsX, coordsY).
func (t *BMThrow) UnmarshalJSON(b []byte) error {
	type plain BMThrow
	var raw struct {
		plain
		SegmentName   string   `json:"segmentName"`
		SegmentNumber int      `json:"segmentNumber"`
		Bed           string   `json:"bed"`
		Multiplier    int      `json:"multiplier"`
		CoordsX       *float64 `json:"coordsX"`
		CoordsY       *float64 `json:"coordsY"`
	}
	if err := json.Unmarshal(b, &raw); err != nil {
		return err
	}
	*t = BMThrow(raw.plain)
	if raw.SegmentName != "" {
		t.Segment = BMSegment{Name: raw.SegmentName, Number: raw.SegmentNumber, Bed: raw.Bed, Multiplier: raw.Multiplier}
	}
	if raw.CoordsX != nil && raw.CoordsY != nil {
		t.Coords = &BMCoords{X: *raw.CoordsX, Y: *raw.CoordsY}
	}
	return nil
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
