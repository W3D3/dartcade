package main

import (
	"testing"

	"dartcade/bridge/internal/differ"
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
