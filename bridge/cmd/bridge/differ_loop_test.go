package main

import (
	"context"
	"testing"
	"time"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/differ"
)

// The differ loop is the only sender on the event channel: it closes the channel when it
// stops, whether the Board Manager client finished or the bridge is shutting down.
func TestRunDifferClosesEventsWhenItStops(t *testing.T) {
	t.Run("frames closed", func(t *testing.T) {
		frames := make(chan bm.BMFrame, 1)
		events := make(chan []differ.Event, 4)
		frames <- bm.BMFrame{Kind: "bm_connect"}
		close(frames)
		done := make(chan struct{})
		go func() { runDiffer(context.Background(), frames, events); close(done) }()
		waitReturned(t, done)
		if evs, ok := <-events; !ok || evs[0].Kind != "bm.link" {
			t.Fatalf("first batch = %v, %v; want the bm.link", evs, ok)
		}
		if _, ok := <-events; ok {
			t.Fatal("event channel still open")
		}
	})
	t.Run("ctx cancelled", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		events := make(chan []differ.Event)
		done := make(chan struct{})
		go func() { runDiffer(ctx, make(chan bm.BMFrame), events); close(done) }()
		cancel()
		waitReturned(t, done)
		if _, ok := <-events; ok {
			t.Fatal("event channel still open")
		}
	})
}

func waitReturned(t *testing.T, done <-chan struct{}) {
	t.Helper()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("runDiffer did not return")
	}
}
