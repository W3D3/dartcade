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
	// Even if the bridge had a visit open before the reconnect
	_, open := process(differ.State{}, stateFrame(t, 0, "Throw", "Throw detected", s20))
	evs, s := process(open,
		bm.BMFrame{Kind: "bm_reconnect", RecvWall: t0.Add(time.Second)},
		stateFrame(t, 2*time.Second, "Throw", "Takeout finished"),
	)
	wantKinds(t, evs, "bm.link", "board.resync")
	if !s.VisitID.IsZero() || s.InTakeout {
		t.Fatalf("visit %v, in takeout %v after an empty resync; want none", s.VisitID, s.InTakeout)
	}
	evs, _ = process(s, stateFrame(t, 3*time.Second, "Throw", "Throw detected", s20))
	wantKinds(t, evs, "visit.opened", "dart.detected")
}

// A new resync mid-visit starts a fresh visit: the backend drops its open visit on a resync.
func TestResyncGivesAFreshVisitID(t *testing.T) {
	_, s := process(differ.State{}, stateFrame(t, 0, "Throw", "Throw detected", s20))
	before := s.VisitID
	_, s = process(s,
		bm.BMFrame{Kind: "bm_reconnect", RecvWall: t0.Add(time.Second)},
		stateFrame(t, 2*time.Second, "Throw", "Throw detected", s20),
	)
	if s.VisitID.IsZero() || s.VisitID == before {
		t.Errorf("visit id %v after the resync, want a new one (was %v)", s.VisitID, before)
	}
}
