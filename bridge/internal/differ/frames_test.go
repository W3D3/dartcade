package differ_test

import (
	"encoding/json"
	"testing"
	"time"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/differ"
)

// Helpers that build Board Manager frames in code, for paths the recordings don't cover.

var t0 = time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)

func throw(name string, number int, bed string, mult int) bm.BMThrow {
	return bm.BMThrow{Segment: bm.BMSegment{Name: name, Number: number, Bed: bed, Multiplier: mult}}
}

var (
	s20 = throw("S20", 20, "SingleInner", 1)
	t20 = throw("T20", 20, "Triple", 3)
	s5  = throw("S5", 5, "SingleInner", 1)
	s1  = throw("S1", 1, "SingleInner", 1)
)

func stateFrame(t *testing.T, at time.Duration, status, event string, throws ...bm.BMThrow) bm.BMFrame {
	t.Helper()
	if throws == nil {
		throws = []bm.BMThrow{}
	}
	data, err := json.Marshal(bm.BMStateData{
		Connected: true, Running: true, Status: status, Event: event,
		NumThrows: len(throws), Throws: throws,
	})
	if err != nil {
		t.Fatal(err)
	}
	return bm.BMFrame{Kind: "ws", BMType: "state", Data: data, RecvWall: t0.Add(at)}
}

func motionFrame(t *testing.T, at time.Duration, m bm.BMMotionData) bm.BMFrame {
	t.Helper()
	data, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	return bm.BMFrame{Kind: "ws", BMType: "motion_state", Data: data, RecvWall: t0.Add(at)}
}

func connectFrame(at time.Duration) bm.BMFrame {
	return bm.BMFrame{Kind: "bm_connect", RecvWall: t0.Add(at)}
}

// process runs frames through the differ from s and returns the derived events (no
// bm.frame or board.status) and the final state.
func process(s differ.State, frames ...bm.BMFrame) ([]differ.Event, differ.State) {
	var all []differ.Event
	for _, f := range frames {
		var evs []differ.Event
		s, evs = differ.Process(s, f)
		for _, e := range evs {
			if e.Kind != "bm.frame" && e.Kind != "board.status" {
				all = append(all, e)
			}
		}
	}
	return all, s
}

func wantKinds(t *testing.T, evs []differ.Event, want ...string) {
	t.Helper()
	got := kindList(evs)
	if len(got) != len(want) {
		t.Fatalf("events %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("events %v, want %v", got, want)
		}
	}
}
