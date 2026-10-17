package differ_test

import (
	"testing"
	"time"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/schema"
)

// A resync that finds darts on the board (a bridge restart or BM reconnect mid-visit)
// gives the visit an id: the next dart, the takeout and its end all carry it.
func TestResyncMidVisitOpensAVisitID(t *testing.T) {
	evs, s := process(differ.State{},
		connectFrame(0),
		stateFrame(t, time.Second, "Throw", "Throw detected", s20),
	)
	wantKinds(t, evs, "bm.link", "board.resync")
	if s.VisitID.IsZero() {
		t.Fatal("no visit id after a resync with a dart on the board")
	}
	id := schema.VisitId(s.VisitID.String())

	evs, _ = process(s,
		stateFrame(t, 2*time.Second, "Throw", "Throw detected", s20, s5),
		motionFrame(t, 3*time.Second, bm.BMMotionData{IsHand: true}),
		stateFrame(t, 4*time.Second, "Takeout in progress", "Takeout started", s20, s5),
		stateFrame(t, 5*time.Second, "Throw", "Takeout finished"),
	)
	wantKinds(t, evs, "dart.detected", "takeout.started", "motion", "takeout.finished")
	if d := evs[0].Data.(*schema.DartDetectedData); d.VisitId != id || d.Index != 1 {
		t.Errorf("dart.detected visit %q index %d, want %q index 1", d.VisitId, d.Index, id)
	}
	if d := evs[1].Data.(*schema.TakeoutStartedData); d.VisitId != id {
		t.Errorf("takeout.started visit %q, want %q", d.VisitId, id)
	}
	if d := evs[3].Data.(*schema.TakeoutFinishedData); d.VisitId != id || d.DurationMs != 2000 {
		t.Errorf("takeout.finished visit %q after %dms, want %q after 2000ms", d.VisitId, d.DurationMs, id)
	}
}

func TestResyncMidVisitThenResetClearsThatVisit(t *testing.T) {
	_, s := process(differ.State{}, connectFrame(0), stateFrame(t, time.Second, "Throw", "Throw detected", s20))
	id := schema.VisitId(s.VisitID.String())
	evs, s := process(s, stateFrame(t, 2*time.Second, "Throw", "Manual reset"))
	wantKinds(t, evs, "visit.cleared")
	if d := evs[0].Data.(*schema.VisitClearedData); d.VisitId != id {
		t.Errorf("visit.cleared visit %q, want %q", d.VisitId, id)
	}
	if !s.VisitID.IsZero() {
		t.Error("visit id kept after the visit was cleared")
	}
}

// An empty board on resync has no visit, and the first dart after it opens one as usual.
func TestResyncOnAnEmptyBoardHasNoVisit(t *testing.T) {
	evs, s := process(differ.State{}, connectFrame(0), stateFrame(t, time.Second, "Throw", "Takeout finished"))
	wantKinds(t, evs, "bm.link", "board.resync")
	if !s.VisitID.IsZero() || s.InTakeout {
		t.Fatalf("visit %v, in takeout %v after an empty resync; want none", s.VisitID, s.InTakeout)
	}
	evs, _ = process(s, stateFrame(t, 2*time.Second, "Throw", "Throw detected", s20))
	wantKinds(t, evs, "visit.opened", "dart.detected")
}

func reconnectFrame(at time.Duration) bm.BMFrame {
	return bm.BMFrame{Kind: "bm_reconnect", RecvWall: t0.Add(at)}
}

// A BM WS blip keeps the darts already scored: the board is diffed against what was seen
// before (by polling too), so only what changed meanwhile comes out (#234).
func TestReconnectDiffsAgainstTheDartsAlreadySeen(t *testing.T) {
	_, s := process(differ.State{},
		connectFrame(0),
		stateFrame(t, time.Second, "Throw", "Throw detected"),
		stateFrame(t, 2*time.Second, "Throw", "Throw detected", s20),
		stateFrame(t, 3*time.Second, "Throw", "Throw detected", s20, s5),
	)
	id := schema.VisitId(s.VisitID.String())
	evs, _ := process(s,
		bm.BMFrame{Kind: "bm_disconnect", RecvWall: t0.Add(4 * time.Second)},
		reconnectFrame(5*time.Second),
		stateFrame(t, 5*time.Second, "Throw", "Throw detected", s20, s5),
		stateFrame(t, 6*time.Second, "Takeout", "Throw detected", s20, s5, s1),
	)
	wantKinds(t, evs, "bm.link", "bm.link", "dart.detected")
	if d := evs[2].Data.(*schema.DartDetectedData); d.VisitId != id || d.Index != 2 {
		t.Errorf("dart.detected visit %q index %d, want %q index 2", d.VisitId, d.Index, id)
	}
}

// Without polling during the gap, what happened meanwhile still comes out as a diff:
// darts thrown, or a takeout (which ends the visit).
func TestReconnectDiffsWhatHappenedInTheGap(t *testing.T) {
	_, open := process(differ.State{}, connectFrame(0), stateFrame(t, 0, "Throw", "Throw detected"), stateFrame(t, time.Second, "Throw", "Throw detected", s20))

	evs, _ := process(open, reconnectFrame(2*time.Second), stateFrame(t, 3*time.Second, "Takeout", "Throw detected", s20, s5, s1))
	wantKinds(t, evs, "bm.link", "dart.detected", "dart.detected")

	evs, s := process(open, reconnectFrame(2*time.Second), stateFrame(t, 3*time.Second, "Throw", "Takeout finished"))
	wantKinds(t, evs, "bm.link", "visit.cleared")
	if !s.VisitID.IsZero() {
		t.Error("visit id kept after the board was found empty")
	}
}

// A dart still on the board but changed since (a new visit, or a correction: a diff can't
// tell which) is a resync, in a fresh visit: the backend drops its open visit on a resync.
func TestReconnectWithAChangedDartResyncs(t *testing.T) {
	_, s := process(differ.State{}, connectFrame(0), stateFrame(t, 0, "Throw", "Throw detected"), stateFrame(t, time.Second, "Throw", "Throw detected", s20, s5))
	before := s.VisitID
	evs, s := process(s, reconnectFrame(2*time.Second), stateFrame(t, 3*time.Second, "Throw", "Throw detected", t20))
	wantKinds(t, evs, "bm.link", "board.resync")
	if s.VisitID.IsZero() || s.VisitID == before {
		t.Errorf("visit id %v after the resync, want a new one (was %v)", s.VisitID, before)
	}
	// Only the first state frame after the reconnect is checked
	evs, _ = process(s, stateFrame(t, 4*time.Second, "Throw", "Throw detected", s5))
	wantKinds(t, evs, "dart.corrected")
}
