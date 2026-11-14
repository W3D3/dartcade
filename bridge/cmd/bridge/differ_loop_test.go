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
		go func() { runDiffer(context.Background(), frames, nil, events); close(done) }()
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
		go func() { runDiffer(ctx, make(chan bm.BMFrame), nil, events); close(done) }()
		cancel()
		waitReturned(t, done)
		if _, ok := <-events; ok {
			t.Fatal("event channel still open")
		}
	})
}

// A backend that (re)connects hears the board's current motion state again, with the time it began.
func TestRunDifferResendsMotionStateOnSignal(t *testing.T) {
	frames := make(chan bm.BMFrame)
	resend := make(chan struct{}, 1)
	events := make(chan []differ.Event, 8)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go runDiffer(ctx, frames, resend, events)

	resend <- struct{}{} // nothing seen yet: nothing to say
	began := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	frames <- bm.BMFrame{Kind: "ws", BMType: "motion_state", Data: []byte(`{"isHand":true}`), RecvWall: began}
	first := <-events
	if first[len(first)-1].Kind != "motion.state" {
		t.Fatalf("first batch = %v, want it to end in motion.state", first)
	}
	resend <- struct{}{}
	select {
	case again := <-events:
		if len(again) != 1 || again[0].Kind != "motion.state" || !again[0].RecvWall.Equal(began) {
			t.Fatalf("resent = %+v, want the one motion.state from %v", again, began)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("motion state not resent")
	}
}

func waitReturned(t *testing.T, done <-chan struct{}) {
	t.Helper()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("runDiffer did not return")
	}
}
