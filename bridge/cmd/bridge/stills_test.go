package main

import (
	"testing"

	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/schema"
)

func TestTriggersStills(t *testing.T) {
	batch := func(kinds ...string) []differ.Event {
		evs := make([]differ.Event, len(kinds))
		for i, k := range kinds {
			evs[i] = differ.Event{Kind: k}
		}
		return evs
	}
	if !triggersStills(batch("bm.frame", "visit.opened", "dart.detected")) {
		t.Error("a dart should trigger stills")
	}
	if !triggersStills(batch("bm.frame", "takeout.finished")) {
		t.Error("a takeout should trigger stills")
	}
	if triggersStills(batch("bm.frame", "motion", "board.status")) {
		t.Error("telemetry should not trigger stills")
	}
}

func TestCalibrationChanged(t *testing.T) {
	status := func(st, ev string) []differ.Event {
		return []differ.Event{{Kind: "bm.frame"}, {Kind: "board.status", Data: &schema.BoardStatusData{Status: st, Event: ev}}}
	}
	if !calibrationChanged(status("Calibrating", "Calibration started")) || !calibrationChanged(status("Running", "Calibration finished")) {
		t.Error("a calibration should be noticed")
	}
	if calibrationChanged(status("Throw", "Throw detected")) || calibrationChanged([]differ.Event{{Kind: "motion"}}) {
		t.Error("not a calibration")
	}
}
