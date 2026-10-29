package bm

import (
	"encoding/json"
	"testing"
)

func TestStateDataBoardManager2(t *testing.T) {
	raw := `{"connected":true,"event":"throwDetected","running":true,"status":"takeoutInProgress","throws":[
		{"bed":"SingleInner","bouncer":false,"coordsX":-0.04,"coordsY":0.46,"multiplier":1,"segmentName":"S20","segmentNumber":20}]}`
	var s BMStateData
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		t.Fatal(err)
	}
	want := BMSegment{Name: "S20", Number: 20, Bed: "SingleInner", Multiplier: 1}
	if s.Event != "Throw detected" || s.Status != "Takeout in progress" || s.NumThrows != 1 ||
		s.Throws[0].Segment != want || s.Throws[0].Coords == nil || s.Throws[0].Coords.Y != 0.46 {
		t.Fatalf("got %+v", s)
	}
}

func TestStateDataBoardManager1(t *testing.T) {
	raw := `{"event":"Manual reset","numThrows":1,"status":"Throw","throws":[{"coords":{"x":0,"y":0.5},"segment":{"bed":"SingleInner","multiplier":1,"name":"S20","number":20}}]}`
	var s BMStateData
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		t.Fatal(err)
	}
	if s.Event != "Manual reset" || s.Status != "Throw" || s.NumThrows != 1 || s.Throws[0].Segment.Number != 20 || s.Throws[0].Coords.Y != 0.5 {
		t.Fatalf("got %+v", s)
	}
}
