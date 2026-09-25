package bm_test

import (
	"encoding/json"
	"testing"
	"time"

	"dartcade/bridge/internal/bm"
)

func TestParseFrame_Connect(t *testing.T) {
	line := []byte(`{"kind":"connect","recv_wall":"2026-01-01T10:00:00Z","recv_mono_ns":0}`)
	f, err := bm.ParseFrame(line)
	if err != nil {
		t.Fatal(err)
	}
	if f == nil {
		t.Fatal("expected frame, got nil")
	}
	if f.Kind != "bm_connect" {
		t.Errorf("kind=%q want bm_connect", f.Kind)
	}
}

func TestParseFrame_Reconnect(t *testing.T) {
	line := []byte(`{"kind":"reconnect","recv_wall":"2026-01-01T10:00:01Z","recv_mono_ns":1000000000,"gap_ms":500}`)
	f, err := bm.ParseFrame(line)
	if err != nil {
		t.Fatal(err)
	}
	if f.Kind != "bm_reconnect" {
		t.Errorf("kind=%q want bm_reconnect", f.Kind)
	}
	if f.GapMs != 500 {
		t.Errorf("gap_ms=%d want 500", f.GapMs)
	}
}

func TestParseFrame_WSFrameState(t *testing.T) {
	line := []byte(`{"kind":"ws_frame","bm_type":"state","data":{"connected":true,"event":"Throw detected","numThrows":1,"running":true,"status":"Throw","throws":[{"coords":{"x":0.021,"y":0.612},"segment":{"bed":"SingleInner","multiplier":1,"name":"S1","number":1}}]},"recv_wall":"2026-01-01T10:00:01Z","recv_mono_ns":1000000000}`)
	f, err := bm.ParseFrame(line)
	if err != nil {
		t.Fatal(err)
	}
	if f.Kind != "ws" {
		t.Errorf("kind=%q want ws", f.Kind)
	}
	if f.BMType != "state" {
		t.Errorf("bm_type=%q want state", f.BMType)
	}

	var s bm.BMStateData
	if err := json.Unmarshal(f.Data, &s); err != nil {
		t.Fatal(err)
	}
	if len(s.Throws) != 1 {
		t.Fatalf("throws len=%d want 1", len(s.Throws))
	}
	if s.Throws[0].Coords == nil {
		t.Fatal("coords is nil")
	}
	if s.Throws[0].Coords.X != 0.021 {
		t.Errorf("x=%v want 0.021", s.Throws[0].Coords.X)
	}
}

func TestParseFrame_Poll(t *testing.T) {
	line := []byte(`{"data":{"connected":true,"event":"Manual reset","numThrows":0,"running":true,"status":"Throw","throws":null},"kind":"poll","recv_mono_ns":19938123,"recv_wall":"2026-09-24T16:07:07.787169604Z"}`)
	f, err := bm.ParseFrame(line)
	if err != nil {
		t.Fatal(err)
	}
	if f.Kind != "poll" {
		t.Errorf("kind=%q want poll", f.Kind)
	}
	if f.BMType != "state" {
		t.Errorf("bm_type=%q want state", f.BMType)
	}
}

func TestParseFrame_BounceOut(t *testing.T) {
	line := []byte(`{"kind":"ws_frame","bm_type":"state","data":{"connected":true,"event":"Throw detected","numThrows":1,"running":true,"status":"Throw","throws":[{"segment":{"bed":"Outside","multiplier":0,"name":"Miss","number":0},"bouncer":true}]},"recv_wall":"2026-01-01T10:00:01Z","recv_mono_ns":1000000000}`)
	f, err := bm.ParseFrame(line)
	if err != nil {
		t.Fatal(err)
	}
	var s bm.BMStateData
	if err := json.Unmarshal(f.Data, &s); err != nil {
		t.Fatal(err)
	}
	if s.Throws[0].Coords != nil {
		t.Error("coords should be nil for bounce-out")
	}
	if !s.Throws[0].Bouncer {
		t.Error("bouncer should be true")
	}
}

func TestParseFrame_SkipStartupVersion(t *testing.T) {
	line := []byte(`{"kind":"startup_version","recv_mono_ns":11656908,"recv_wall":"2026-09-24T16:07:07Z","value":"1.0.7"}`)
	f, err := bm.ParseFrame(line)
	if err != nil {
		t.Fatal(err)
	}
	if f != nil {
		t.Error("expected nil for startup_version")
	}
}

func TestParseFrame_RecvWall(t *testing.T) {
	line := []byte(`{"kind":"connect","recv_wall":"2026-01-01T10:00:00Z","recv_mono_ns":12345}`)
	f, err := bm.ParseFrame(line)
	if err != nil {
		t.Fatal(err)
	}
	want := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	if !f.RecvWall.Equal(want) {
		t.Errorf("recv_wall=%v want %v", f.RecvWall, want)
	}
	if f.RecvMonoNs != 12345 {
		t.Errorf("recv_mono_ns=%d want 12345", f.RecvMonoNs)
	}
}

func TestParseFrame_Disconnect(t *testing.T) {
	line := []byte(`{"kind":"disconnect","recv_wall":"2026-01-01T10:00:02Z","recv_mono_ns":2000000000}`)
	f, err := bm.ParseFrame(line)
	if err != nil {
		t.Fatal(err)
	}
	if f == nil {
		t.Fatal("expected frame, got nil")
	}
	if f.Kind != "bm_disconnect" {
		t.Errorf("kind=%q want bm_disconnect", f.Kind)
	}
}
