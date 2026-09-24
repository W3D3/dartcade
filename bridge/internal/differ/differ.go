package differ

import (
	"encoding/json"
	"math"
	"time"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/schema"
	"github.com/oklog/ulid/v2"
)

// Event is one outbound adbridge/v1 event produced by the differ.
// Data is a pointer to one of the generated schema structs.
type Event struct {
	Kind string
	Data any
}

// State is the differ's mutable context between frames.
type State struct {
	PrevThrows       []bm.BMThrow
	VisitID          ulid.ULID  // zero value = no open visit
	InTakeout        bool
	ExpectResync     bool
	PrevStatus       string
	PrevEvent        string
	PrevRunning      bool
	TakeoutStartedAt time.Time // zero when !InTakeout
}

// ExportedToDart wraps toDart for tests.
func ExportedToDart(t bm.BMThrow) schema.Dart { return toDart(t) }

func toDart(t bm.BMThrow) schema.Dart {
	score := t.Segment.Number * t.Segment.Multiplier
	d := schema.Dart{
		Segment: schema.Segment{
			Name:       t.Segment.Name,
			Number:     t.Segment.Number,
			Bed:        schema.SegmentBed(t.Segment.Bed),
			Multiplier: schema.SegmentMultiplier(t.Segment.Multiplier),
		},
		Score: score,
	}
	if t.Bouncer {
		v := true
		d.Bouncer = &v
	}
	if t.Coords != nil {
		d.Coords = &schema.Coords{X: t.Coords.X, Y: t.Coords.Y}
		r := math.Sqrt(t.Coords.X*t.Coords.X + t.Coords.Y*t.Coords.Y)
		theta := math.Atan2(t.Coords.Y, t.Coords.X) * 180.0 / math.Pi
		d.Polar = &schema.Polar{R: r, ThetaDeg: theta}
	}
	return d
}

// Process applies one BMFrame to the current state and returns the new state
// plus any derived events. Always emits bm.frame first for ws/poll frames
// so the transport can assign source_seq.
func Process(s State, frame bm.BMFrame) (State, []Event) {
	switch frame.Kind {
	case "bm_connect":
		s.ExpectResync = true
		return s, []Event{{Kind: "bm.link", Data: &schema.BmLinkData{Up: true}}}
	case "bm_reconnect":
		s.ExpectResync = true
		return s, []Event{{Kind: "bm.link", Data: &schema.BmLinkData{Up: true}}}
	case "bm_disconnect":
		reason := "disconnected"
		return s, []Event{{Kind: "bm.link", Data: &schema.BmLinkData{Up: false, Reason: &reason}}}
	case "ws", "poll":
		switch frame.BMType {
		case "state":
			return processState(s, frame)
		case "motion_state":
			return processMotion(s, frame)
		default:
			src := schema.BmFrameDataSourceWs
			if frame.Kind == "poll" {
				src = schema.BmFrameDataSourcePoll
			}
			return s, []Event{{Kind: "bm.frame", Data: &schema.BmFrameData{Source: src}}}
		}
	default:
		return s, nil
	}
}

func processState(s State, frame bm.BMFrame) (State, []Event) {
	var cur bm.BMStateData
	if err := json.Unmarshal(frame.Data, &cur); err != nil {
		return s, nil
	}

	src := schema.BmFrameDataSourceWs
	if frame.Kind == "poll" {
		src = schema.BmFrameDataSourcePoll
	}
	evs := []Event{{Kind: "bm.frame", Data: &schema.BmFrameData{Source: src}}}

	// 1. Resync
	if s.ExpectResync {
		throws := make([]schema.Dart, len(cur.Throws))
		for i, t := range cur.Throws {
			throws[i] = toDart(t)
		}
		evs = append(evs, Event{Kind: "board.resync", Data: &schema.BoardResyncData{Throws: throws}})
		s.ExpectResync = false
		s.PrevThrows = cur.Throws
		s.PrevStatus = cur.Status
		s.PrevEvent = cur.Event
		s.PrevRunning = cur.Running
		return s, evs
	}

	// 2. Spurious frame guard: skip if both empty
	if len(cur.Throws) == 0 && len(s.PrevThrows) == 0 {
		evs = append(evs, boardStatusEvents(s, cur)...)
		s.PrevStatus = cur.Status
		s.PrevEvent = cur.Event
		s.PrevRunning = cur.Running
		return s, evs
	}

	// 3. board.status (before dart events)
	evs = append(evs, boardStatusEvents(s, cur)...)

	// 4. Takeout signals from state — only if visit open, not already in takeout, numThrows > 0
	// NOTE: status="Takeout" on 3rd dart is board.status ONLY (diff-rules §8); NOT a takeout signal.
	if !s.InTakeout && !s.VisitID.IsZero() && cur.NumThrows > 0 {
		if cur.Status == "Takeout in progress" {
			s.InTakeout = true
			s.TakeoutStartedAt = frame.RecvWall
			evs = append(evs, Event{Kind: "takeout.started", Data: &schema.TakeoutStartedData{
				VisitId: schema.VisitId(s.VisitID.String()),
				Trigger: schema.TakeoutStartedDataTriggerStatusTakeoutInProgress,
			}})
		} else if cur.Event == "Takeout started" {
			s.InTakeout = true
			s.TakeoutStartedAt = frame.RecvWall
			evs = append(evs, Event{Kind: "takeout.started", Data: &schema.TakeoutStartedData{
				VisitId: schema.VisitId(s.VisitID.String()),
				Trigger: schema.TakeoutStartedDataTriggerEventTakeoutStarted,
			}})
		}
	}

	// 5. New darts
	if len(cur.Throws) > len(s.PrevThrows) {
		if len(s.PrevThrows) == 0 {
			s.VisitID = ulid.Make()
			evs = append(evs, Event{Kind: "visit.opened", Data: &schema.VisitOpenedData{
				VisitId: schema.VisitId(s.VisitID.String()),
			}})
		}
		for i := len(s.PrevThrows); i < len(cur.Throws); i++ {
			evs = append(evs, Event{Kind: "dart.detected", Data: &schema.DartDetectedData{
				VisitId:   schema.VisitId(s.VisitID.String()),
				Index:     i,
				Dart:      toDart(cur.Throws[i]),
				SourceSeq: 0, // transport backfills
			}})
		}
	}

	// 6. Correction and movement
	minLen := len(cur.Throws)
	if len(s.PrevThrows) < minLen {
		minLen = len(s.PrevThrows)
	}
	for i := 0; i < minLen; i++ {
		c, p := cur.Throws[i], s.PrevThrows[i]
		if c.Segment.Name != p.Segment.Name || c.Segment.Number != p.Segment.Number || c.Segment.Bed != p.Segment.Bed {
			evs = append(evs, Event{Kind: "dart.corrected", Data: &schema.DartCorrectedData{
				VisitId:   schema.VisitId(s.VisitID.String()),
				Index:     i,
				Dart:      toDart(c),
				Previous:  toDart(p),
				SourceSeq: 0,
			}})
		} else if c.Coords != nil && p.Coords != nil {
			dx := c.Coords.X - p.Coords.X
			dy := c.Coords.Y - p.Coords.Y
			if dx*dx+dy*dy > 0.02*0.02 {
				evs = append(evs, Event{Kind: "dart.moved", Data: &schema.DartMovedData{
					VisitId:        schema.VisitId(s.VisitID.String()),
					Index:          i,
					Coords:         schema.Coords{X: c.Coords.X, Y: c.Coords.Y},
					PreviousCoords: schema.Coords{X: p.Coords.X, Y: p.Coords.Y},
					SourceSeq:      0,
				}})
			}
		}
	}

	// 7. Full takeout / visit cleared
	if len(cur.Throws) == 0 && len(s.PrevThrows) > 0 {
		if s.InTakeout {
			dur := frame.RecvWall.Sub(s.TakeoutStartedAt).Milliseconds()
			if dur < 0 {
				dur = 0
			}
			evs = append(evs, Event{Kind: "takeout.finished", Data: &schema.TakeoutFinishedData{
				VisitId:    schema.VisitId(s.VisitID.String()),
				Trigger:    schema.TakeoutFinishedDataTriggerNumThrowsZero,
				DurationMs: int(dur),
			}})
		} else {
			reason := schema.VisitClearedDataReasonUnknown
			if cur.Event == "Manual reset" {
				reason = schema.VisitClearedDataReasonManualReset
			}
			evs = append(evs, Event{Kind: "visit.cleared", Data: &schema.VisitClearedData{
				VisitId: schema.VisitId(s.VisitID.String()),
				Reason:  reason,
			}})
		}
		s.VisitID = ulid.ULID{}
		s.InTakeout = false
		s.TakeoutStartedAt = time.Time{}
	}

	s.PrevThrows = cur.Throws
	s.PrevStatus = cur.Status
	s.PrevEvent = cur.Event
	s.PrevRunning = cur.Running
	return s, evs
}

func processMotion(s State, frame bm.BMFrame) (State, []Event) {
	var cur bm.BMMotionData
	if err := json.Unmarshal(frame.Data, &cur); err != nil {
		return s, nil
	}
	evs := []Event{{Kind: "bm.frame", Data: &schema.BmFrameData{Source: schema.BmFrameDataSourceWs}}}

	if !s.InTakeout && !s.VisitID.IsZero() && len(s.PrevThrows) > 0 {
		if cur.IsHand || cur.IsTakeoutPartial {
			s.InTakeout = true
			s.TakeoutStartedAt = frame.RecvWall
			evs = append(evs, Event{Kind: "takeout.started", Data: &schema.TakeoutStartedData{
				VisitId: schema.VisitId(s.VisitID.String()),
				Trigger: schema.TakeoutStartedDataTriggerMotionIsHand,
			}})
		}
	}
	evs = append(evs, Event{Kind: "motion", Data: &schema.MotionData{
		IsDart:           cur.IsDart,
		IsHand:           cur.IsHand,
		IsStable:         cur.IsStable,
		IsTakeoutPartial: cur.IsTakeoutPartial,
		IsTakeoutFull:    cur.IsTakeoutFull,
		IsWaiting:        cur.IsWaiting,
	}})
	return s, evs
}

func boardStatusEvents(s State, cur bm.BMStateData) []Event {
	if cur.Status == s.PrevStatus && cur.Event == s.PrevEvent && cur.Running == s.PrevRunning {
		return nil
	}
	return []Event{{Kind: "board.status", Data: &schema.BoardStatusData{
		Status:    cur.Status,
		Event:     cur.Event,
		Running:   cur.Running,
		Connected: cur.Connected,
	}}}
}
