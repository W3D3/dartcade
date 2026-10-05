package differ_test

import (
	"testing"
	"time"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/schema"
)

// Partial takeout (diff-rules §5): throws shrinking to a non-zero length emit nothing, and
// the visit stays open until the board is empty.
func TestThrowsShrinkingToNonZeroEmitNothing(t *testing.T) {
	_, s := process(differ.State{}, stateFrame(t, 0, "Throw", "Throw detected", s20, s5, s1))
	id := schema.VisitId(s.VisitID.String())

	evs, s := process(s, stateFrame(t, time.Second, "Takeout", "Throw detected", s20))
	wantKinds(t, evs)
	if string(id) != s.VisitID.String() {
		t.Fatalf("visit %v after a partial takeout, want %v still open", s.VisitID, id)
	}
	if len(s.PrevThrows) != 1 {
		t.Errorf("prev throws %d, want the 1 left on the board", len(s.PrevThrows))
	}

	evs, _ = process(s, stateFrame(t, 2*time.Second, "Throw", "Takeout finished"))
	wantKinds(t, evs, "visit.cleared")
	if d := evs[0].Data.(*schema.VisitClearedData); d.VisitId != id {
		t.Errorf("visit.cleared visit %q, want %q", d.VisitId, id)
	}
}

// A dart left on the board that BM rescored during a partial takeout is still a correction.
func TestShrinkingThrowsStillReportCorrectionsOfTheDartsLeft(t *testing.T) {
	_, s := process(differ.State{}, stateFrame(t, 0, "Throw", "Throw detected", s20, s5))
	evs, _ := process(s, stateFrame(t, time.Second, "Throw", "Throw detected", t20))
	wantKinds(t, evs, "dart.corrected")
	if d := evs[0].Data.(*schema.DartCorrectedData); d.Index != 0 || d.Dart.Score != 60 {
		t.Errorf("corrected index %d to score %d, want index 0 to 60", d.Index, d.Dart.Score)
	}
}

// Any change to the segment is a correction, the multiplier (and so the score) included.
func TestCorrectionWhenOnlyTheMultiplierChanges(t *testing.T) {
	_, s := process(differ.State{}, stateFrame(t, 0, "Throw", "Throw detected", s20))
	rescored := s20
	rescored.Segment.Multiplier = 2
	evs, _ := process(s, stateFrame(t, time.Second, "Throw", "Throw detected", rescored))
	wantKinds(t, evs, "dart.corrected")
	d := evs[0].Data.(*schema.DartCorrectedData)
	if d.Dart.Score != 40 || d.Previous.Score != 20 {
		t.Errorf("corrected %d -> %d, want 20 -> 40", d.Previous.Score, d.Dart.Score)
	}
}

// The same throws again (jitter below ε included) emit nothing.
func TestUnchangedThrowsEmitNothing(t *testing.T) {
	a, b := s20, s20
	a.Coords = &bm.BMCoords{X: 0, Y: 0.5}
	b.Coords = &bm.BMCoords{X: 0.01, Y: 0.5}
	_, s := process(differ.State{}, stateFrame(t, 0, "Throw", "Throw detected", a))
	evs, _ := process(s, stateFrame(t, time.Second, "Throw", "Throw detected", b))
	wantKinds(t, evs)
}
