package transport

import (
	"testing"

	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/schema"
)

// A full outbox collapses telemetry by dropping the older entry and appending the newer
// one, so the outbox stays sorted by seq and flush never re-sends or reorders entries.
func TestTelemetryCollapseKeepsSeqOrder(t *testing.T) {
	tr := New(Config{BridgeID: "br", BootID: "bt"}, nil)
	frame := differ.Event{Kind: "bm.frame", Data: &schema.BmFrameData{Source: schema.BmFrameDataSourceWs}}
	for range outboxMax {
		tr.enqueue([]differ.Event{frame})
	}
	tr.enqueue([]differ.Event{{Kind: "visit.opened", Data: &schema.VisitOpenedData{VisitId: "v"}}})
	tr.enqueue([]differ.Event{frame})

	if got, want := len(tr.outbox), outboxMax+1; got != want {
		t.Fatalf("outbox size %d, want %d", got, want)
	}
	for i := 1; i < len(tr.outbox); i++ {
		if tr.outbox[i-1].env.Seq >= tr.outbox[i].env.Seq {
			t.Fatalf("outbox not sorted at %d: seq %d then %d", i, tr.outbox[i-1].env.Seq, tr.outbox[i].env.Seq)
		}
	}
	last := tr.outbox[len(tr.outbox)-1].env
	if last.Kind != "bm.frame" || last.Seq != tr.seq {
		t.Errorf("last entry %s seq %d, want the newest bm.frame (seq %d)", last.Kind, last.Seq, tr.seq)
	}
}
