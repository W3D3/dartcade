package differ_test

import (
	"bytes"
	"math"
	"os"
	"path/filepath"
	"testing"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/schema"
)

// ---- helper tests (Task 3) ----

func TestToDart_Normal(t *testing.T) {
	th := bm.BMThrow{
		Segment: bm.BMSegment{Name: "T20", Number: 20, Bed: "Triple", Multiplier: 3},
		Coords:  &bm.BMCoords{X: 0.0, Y: 0.9},
	}
	d := differ.ExportedToDart(th)
	if d.Score != 60 {
		t.Errorf("score=%d want 60", d.Score)
	}
	if d.Coords == nil {
		t.Error("coords should not be nil")
	}
	if d.Polar == nil {
		t.Error("polar should not be nil")
	}
	wantR := 0.9
	if math.Abs(d.Polar.R-wantR) > 1e-9 {
		t.Errorf("r=%v want %v", d.Polar.R, wantR)
	}
	wantTheta := 90.0 // atan2(0.9, 0) * 180/π = 90°
	if math.Abs(d.Polar.ThetaDeg-wantTheta) > 0.001 {
		t.Errorf("theta_deg=%v want %v", d.Polar.ThetaDeg, wantTheta)
	}
}

func TestToDart_BounceOut(t *testing.T) {
	th := bm.BMThrow{
		Segment: bm.BMSegment{Name: "Miss", Number: 0, Bed: "Outside", Multiplier: 0},
		Bouncer: true,
	}
	d := differ.ExportedToDart(th)
	if d.Score != 0 {
		t.Errorf("score=%d want 0", d.Score)
	}
	if d.Coords != nil {
		t.Error("coords should be nil for bounce-out")
	}
	if d.Polar != nil {
		t.Error("polar should be nil for bounce-out")
	}
	if d.Bouncer == nil || !*d.Bouncer {
		t.Error("bouncer should be true")
	}
}

func TestToDart_NearMiss(t *testing.T) {
	th := bm.BMThrow{
		Segment: bm.BMSegment{Name: "M17", Number: 17, Bed: "Outside", Multiplier: 0},
		Coords:  &bm.BMCoords{X: 1.052, Y: 0.431},
	}
	d := differ.ExportedToDart(th)
	if d.Score != 0 {
		t.Errorf("score=%d want 0", d.Score)
	}
	if d.Coords == nil {
		t.Error("coords should be present for near-miss")
	}
	if d.Polar == nil {
		t.Error("polar should be present for near-miss")
	}
	if d.Polar.R <= 1.0 {
		t.Errorf("r=%v should be > 1.0 for near-miss", d.Polar.R)
	}
}

func TestToDart_Bull25(t *testing.T) {
	th := bm.BMThrow{
		Segment: bm.BMSegment{Name: "25", Number: 25, Bed: "Single", Multiplier: 1},
		Coords:  &bm.BMCoords{X: 0.0, Y: 0.0},
	}
	d := differ.ExportedToDart(th)
	if d.Score != 25 {
		t.Errorf("score=%d want 25", d.Score)
	}
}

func TestToDart_ThetaDeg_SixWedge(t *testing.T) {
	// x>0, y=0 → atan2(0, x) = 0° (right side = 6-wedge direction)
	th := bm.BMThrow{
		Segment: bm.BMSegment{Name: "S6", Number: 6, Bed: "SingleInner", Multiplier: 1},
		Coords:  &bm.BMCoords{X: 0.5, Y: 0.0},
	}
	d := differ.ExportedToDart(th)
	if math.Abs(d.Polar.ThetaDeg) > 0.001 {
		t.Errorf("theta_deg=%v want 0", d.Polar.ThetaDeg)
	}
}

// ---- Process tests (Task 4) — stubs only; extraChecks added later ----

func loadFixture(t *testing.T, name string) []bm.BMFrame {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	var frames []bm.BMFrame
	for _, line := range bytes.Split(data, []byte("\n")) {
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		f, err := bm.ParseFrame(line)
		if err != nil {
			t.Fatalf("parse fixture line in %s: %v", name, err)
		}
		if f != nil {
			frames = append(frames, *f)
		}
	}
	return frames
}

func filterBMFrame(evs []differ.Event) []differ.Event {
	var out []differ.Event
	for _, e := range evs {
		if e.Kind != "bm.frame" {
			out = append(out, e)
		}
	}
	return out
}

func kindList(evs []differ.Event) []string {
	ks := make([]string, len(evs))
	for i, e := range evs {
		ks[i] = e.Kind
	}
	return ks
}

func assertHasKind(t *testing.T, evs []differ.Event, kind string) {
	t.Helper()
	for _, e := range evs {
		if e.Kind == kind {
			return
		}
	}
	t.Errorf("expected event kind %q not found in %v", kind, kindList(evs))
}

func assertNoKindCount(t *testing.T, evs []differ.Event, kind string, maxAllowed int) {
	t.Helper()
	c := countKindAll(evs, kind)
	if c >= maxAllowed {
		t.Errorf("kind %q count=%d, want <%d", kind, c, maxAllowed)
	}
}

func countKind(evs []differ.Event, kind string) int {
	return countKindAll(filterBMFrame(evs), kind)
}

func countKindAll(evs []differ.Event, kind string) int {
	n := 0
	for _, e := range evs {
		if e.Kind == kind {
			n++
		}
	}
	return n
}

func runFixture(t *testing.T, name string) ([]differ.Event, differ.State) {
	t.Helper()
	frames := loadFixture(t, name)
	s := differ.State{}
	var all []differ.Event
	for _, f := range frames {
		var evs []differ.Event
		s, evs = differ.Process(s, f)
		all = append(all, evs...)
	}
	return all, s
}

// ---- Process table tests ----

func TestProcess_FirstDart(t *testing.T) {
	all, _ := runFixture(t, "first-dart.jsonl")
	derived := filterBMFrame(all)
	wantKinds := []string{"bm.link", "board.resync", "board.status", "visit.opened", "dart.detected"}
	if len(derived) != len(wantKinds) {
		t.Fatalf("event count=%d want %d: got %v", len(derived), len(wantKinds), kindList(derived))
	}
	for i, k := range wantKinds {
		if derived[i].Kind != k {
			t.Errorf("[%d] kind=%q want %q", i, derived[i].Kind, k)
		}
	}
}

func TestProcess_ThreeDartsTakeout(t *testing.T) {
	all, _ := runFixture(t, "three-darts-takeout.jsonl")

	// Check no takeout.started on the status=Takeout frame
	for i, e := range all {
		if e.Kind == "board.status" {
			if d, ok := e.Data.(*schema.BoardStatusData); ok && d.Status == "Takeout" {
				if i+1 < len(all) && all[i+1].Kind == "takeout.started" {
					t.Error("takeout.started must NOT immediately follow board.status{status=Takeout}")
				}
			}
		}
	}

	// Check takeout.started trigger
	for _, e := range all {
		if e.Kind == "takeout.started" {
			d := e.Data.(*schema.TakeoutStartedData)
			if d.Trigger != schema.TakeoutStartedDataTriggerStatusTakeoutInProgress {
				t.Errorf("trigger=%q want %q", d.Trigger, schema.TakeoutStartedDataTriggerStatusTakeoutInProgress)
			}
		}
	}

	assertHasKind(t, all, "takeout.started")
	assertHasKind(t, all, "takeout.finished")

	// Check takeout.finished trigger
	for _, e := range all {
		if e.Kind == "takeout.finished" {
			d := e.Data.(*schema.TakeoutFinishedData)
			if d.Trigger != schema.TakeoutFinishedDataTriggerNumThrowsZero {
				t.Errorf("finished trigger=%q want numThrows.zero", d.Trigger)
			}
		}
	}
}

func TestProcess_Correction(t *testing.T) {
	all, _ := runFixture(t, "correction.jsonl")
	assertHasKind(t, all, "dart.corrected")
	n := countKind(all, "dart.detected")
	if n != 1 {
		t.Errorf("dart.detected count=%d want 1", n)
	}
	for _, e := range all {
		if e.Kind == "dart.corrected" {
			d := e.Data.(*schema.DartCorrectedData)
			if d.Index != 0 {
				t.Errorf("index=%d want 0", d.Index)
			}
			if string(d.Dart.Segment.Name) != "S5" {
				t.Errorf("dart.segment.name=%q want S5", d.Dart.Segment.Name)
			}
			if string(d.Previous.Segment.Name) != "D20" {
				t.Errorf("previous.segment.name=%q want D20", d.Previous.Segment.Name)
			}
		}
	}
}

func TestProcess_Move(t *testing.T) {
	all, _ := runFixture(t, "move.jsonl")
	assertHasKind(t, all, "dart.moved")
}

func TestProcess_TakeoutMotion(t *testing.T) {
	all, _ := runFixture(t, "takeout-motion.jsonl")
	for _, e := range all {
		if e.Kind == "takeout.started" {
			d := e.Data.(*schema.TakeoutStartedData)
			if d.Trigger != schema.TakeoutStartedDataTriggerMotionIsHand {
				t.Errorf("trigger=%q want motion.isHand", d.Trigger)
			}
		}
	}
	assertHasKind(t, all, "takeout.started")
	assertHasKind(t, all, "takeout.finished")
}

func TestProcess_VisitCleared(t *testing.T) {
	all, _ := runFixture(t, "visit-cleared.jsonl")
	assertHasKind(t, all, "visit.cleared")
	assertNoKindCount(t, all, "takeout.started", 1)
	for _, e := range all {
		if e.Kind == "visit.cleared" {
			d := e.Data.(*schema.VisitClearedData)
			if d.Reason != schema.VisitClearedDataReasonManualReset {
				t.Errorf("reason=%q want manual_reset", d.Reason)
			}
		}
	}
}

func TestProcess_SpuriousTakeout(t *testing.T) {
	all, _ := runFixture(t, "spurious-takeout.jsonl")
	assertNoKindCount(t, all, "takeout.started", 1)
	assertNoKindCount(t, all, "takeout.finished", 1)
}

func TestProcess_Resync(t *testing.T) {
	all, _ := runFixture(t, "resync.jsonl")
	assertNoKindCount(t, all, "dart.detected", 1)
	assertNoKindCount(t, all, "visit.opened", 1)
	c := countKind(all, "board.resync")
	if c != 2 {
		t.Errorf("board.resync count=%d want 2", c)
	}
}

func TestProcess_BounceOut(t *testing.T) {
	all, _ := runFixture(t, "bounce-out.jsonl")
	for _, e := range all {
		if e.Kind == "dart.detected" {
			d := e.Data.(*schema.DartDetectedData)
			if d.Dart.Score != 0 {
				t.Errorf("score=%d want 0", d.Dart.Score)
			}
			if d.Dart.Coords != nil {
				t.Error("coords should be nil for bounce-out")
			}
			if d.Dart.Bouncer == nil || !*d.Dart.Bouncer {
				t.Error("bouncer should be true")
			}
		}
	}
	assertHasKind(t, all, "dart.detected")
}

func TestProcess_NearMiss(t *testing.T) {
	all, _ := runFixture(t, "near-miss.jsonl")
	for _, e := range all {
		if e.Kind == "dart.detected" {
			d := e.Data.(*schema.DartDetectedData)
			if d.Dart.Score != 0 {
				t.Errorf("score=%d want 0", d.Dart.Score)
			}
			if d.Dart.Coords == nil {
				t.Error("coords should be present for near-miss")
			}
			if d.Dart.Polar == nil {
				t.Error("polar should be present for near-miss")
			}
			if d.Dart.Polar.R <= 1.0 {
				t.Errorf("r=%v want >1.0", d.Dart.Polar.R)
			}
		}
	}
}

func TestProcess_UnknownFrame(t *testing.T) {
	all, _ := runFixture(t, "unknown-frame.jsonl")
	c := countKindAll(all, "bm.frame")
	if c != 2 {
		t.Errorf("bm.frame count=%d want 2", c)
	}
}
