package transport_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/schema"
	"dartcade/bridge/internal/transport"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

func newTestServer(t *testing.T, handler func(conn *websocket.Conn)) *httptest.Server {
	t.Helper()
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			t.Logf("accept error: %v", err)
			return
		}
		defer c.Close(websocket.StatusNormalClosure, "")
		handler(c)
	}))
	t.Cleanup(s.Close)
	return s
}

func wsURL(s *httptest.Server) string {
	return "ws" + strings.TrimPrefix(s.URL, "http")
}

// readSkipHello reads from conn until it gets a non-bridge.hello envelope.
func readSkipHello(ctx context.Context, conn *websocket.Conn) (transport.Envelope, error) {
	for {
		var e transport.Envelope
		if err := wsjson.Read(ctx, conn, &e); err != nil {
			return transport.Envelope{}, err
		}
		if e.Kind != "bridge.hello" {
			return e, nil
		}
	}
}

// TestBridgeHelloOnConnect verifies that bridge.hello is the first message sent.
func TestBridgeHelloOnConnect(t *testing.T) {
	received := make(chan transport.Envelope, 1)
	s := newTestServer(t, func(conn *websocket.Conn) {
		ctx := context.Background()
		var e transport.Envelope
		if err := wsjson.Read(ctx, conn, &e); err != nil {
			return
		}
		received <- e
	})

	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br", BootID: "bt"}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint

	select {
	case e := <-received:
		if e.Kind != "bridge.hello" {
			t.Errorf("first message kind=%q want bridge.hello", e.Kind)
		}
		var d schema.BridgeHelloData
		json.Unmarshal(e.Data, &d)
		if d.Os == "" {
			t.Error("bridge.hello data.os is empty")
		}
		if d.Schema == "" {
			t.Error("bridge.hello data.schema is empty")
		}
	case <-time.After(2 * time.Second):
		t.Error("timeout waiting for bridge.hello")
	}
}

func TestSeqIncrement(t *testing.T) {
	received := make(chan transport.Envelope, 10)
	s := newTestServer(t, func(conn *websocket.Conn) {
		ctx := context.Background()
		seqCount := 0
		for seqCount < 3 {
			var e transport.Envelope
			if err := wsjson.Read(ctx, conn, &e); err != nil {
				return
			}
			if e.Kind == "bridge.hello" {
				continue
			}
			received <- e
			seqCount++
		}
	})

	tr := transport.New(transport.Config{
		BackendURL: wsURL(s),
		BridgeID:   "br_test",
		BootID:     "boot_test",
	}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint
	time.Sleep(100 * time.Millisecond)

	tr.Send([]differ.Event{
		{Kind: "board.status", Data: &schema.BoardStatusData{Status: "Idle", Event: "Idle", Running: true, Connected: true}},
		{Kind: "board.status", Data: &schema.BoardStatusData{Status: "Throw", Event: "Throw detected", Running: true, Connected: true}},
		{Kind: "visit.opened", Data: &schema.VisitOpenedData{VisitId: "01J0000000000000000000000A"}},
	})

	var envs []transport.Envelope
	timeout := time.After(2 * time.Second)
	for len(envs) < 3 {
		select {
		case e := <-received:
			envs = append(envs, e)
		case <-timeout:
			t.Fatalf("timeout waiting for envelopes, got %d", len(envs))
		}
	}

	for i, e := range envs {
		wantSeq := uint64(i + 1)
		if e.Seq != wantSeq {
			t.Errorf("[%d] seq=%d want %d", i, e.Seq, wantSeq)
		}
	}
}

func TestAckClearsOutbox(t *testing.T) {
	acked := make(chan struct{}, 1)
	s := newTestServer(t, func(conn *websocket.Conn) {
		ctx := context.Background()
		// Skip hello, ack the first real event
		e, err := readSkipHello(ctx, conn)
		if err != nil {
			return
		}
		wsjson.Write(ctx, conn, map[string]any{"ack": e.Seq})
		acked <- struct{}{}
		// keep connection alive
		wsjson.Read(ctx, conn, &e)
	})

	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br_test", BootID: "boot_test"}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint
	time.Sleep(100 * time.Millisecond)

	tr.Send([]differ.Event{{Kind: "board.status", Data: &schema.BoardStatusData{Status: "Idle", Event: "", Running: true, Connected: true}}})

	select {
	case <-acked:
	case <-time.After(2 * time.Second):
		t.Error("server never sent ack")
	}
}

func TestCommandAllowlist_RejectsUnknown(t *testing.T) {
	resultReceived := make(chan transport.Envelope, 10)
	s := newTestServer(t, func(conn *websocket.Conn) {
		ctx := context.Background()
		// send an invalid command
		wsjson.Write(ctx, conn, map[string]any{"command_id": "cmd1", "name": "explode"})
		// read until we see command.result
		for {
			var e transport.Envelope
			if err := wsjson.Read(ctx, conn, &e); err != nil {
				return
			}
			if e.Kind == "command.result" {
				resultReceived <- e
				return
			}
		}
	})

	executed := false
	execFn := func(name string) (int, error) {
		executed = true
		return 200, nil
	}
	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br_test", BootID: "boot_test"}, execFn)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint

	select {
	case e := <-resultReceived:
		if executed {
			t.Error("disallowed command should not have been executed")
		}
		var d schema.CommandResultData
		json.Unmarshal(e.Data, &d)
		if d.Ok {
			t.Error("command.result.ok should be false for rejected command")
		}
	case <-time.After(2 * time.Second):
		t.Error("timeout waiting for command.result")
	}
}

func TestCommandAllowlist_ExecutesAllowed(t *testing.T) {
	resultReceived := make(chan transport.Envelope, 10)
	s := newTestServer(t, func(conn *websocket.Conn) {
		ctx := context.Background()
		wsjson.Write(ctx, conn, map[string]any{"command_id": "cmd2", "name": "reset"})
		for {
			var e transport.Envelope
			if err := wsjson.Read(ctx, conn, &e); err != nil {
				return
			}
			if e.Kind == "command.result" {
				resultReceived <- e
				return
			}
		}
	})

	executed := make(chan string, 1)
	execFn := func(name string) (int, error) {
		executed <- name
		return 200, nil
	}
	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br_test", BootID: "boot_test"}, execFn)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint

	select {
	case name := <-executed:
		if name != "reset" {
			t.Errorf("executed %q want reset", name)
		}
	case <-time.After(2 * time.Second):
		t.Error("timeout waiting for command execution")
	}
	select {
	case e := <-resultReceived:
		var d schema.CommandResultData
		json.Unmarshal(e.Data, &d)
		if !d.Ok {
			t.Error("command.result.ok should be true for allowed command")
		}
	case <-time.After(500 * time.Millisecond):
		t.Error("timeout waiting for command.result")
	}
}

func TestSourceSeqBackfill(t *testing.T) {
	received := make(chan transport.Envelope, 10)
	s := newTestServer(t, func(conn *websocket.Conn) {
		ctx := context.Background()
		seqCount := 0
		for seqCount < 2 {
			var e transport.Envelope
			if err := wsjson.Read(ctx, conn, &e); err != nil {
				return
			}
			if e.Kind == "bridge.hello" {
				continue
			}
			received <- e
			seqCount++
		}
	})

	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br_test", BootID: "boot_test"}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint
	time.Sleep(100 * time.Millisecond)

	tr.Send([]differ.Event{
		{Kind: "bm.frame", Data: &schema.BmFrameData{Source: schema.BmFrameDataSourceWs}},
		{Kind: "dart.detected", Data: &schema.DartDetectedData{
			VisitId: "01J0000000000000000000000A", Index: 0,
			Dart:      schema.Dart{Score: 20, Segment: schema.Segment{Name: "S20", Number: 20, Bed: schema.SegmentBedSingleInner, Multiplier: 1}},
			SourceSeq: 0,
		}},
	})

	var envs []transport.Envelope
	timeout := time.After(2 * time.Second)
	for len(envs) < 2 {
		select {
		case e := <-received:
			envs = append(envs, e)
		case <-timeout:
			t.Fatalf("timeout waiting for envelopes, got %d", len(envs))
		}
	}

	if len(envs) < 2 {
		t.Fatalf("got %d envelopes want 2", len(envs))
	}
	bmFrameSeq := envs[0].Seq
	if envs[0].Kind != "bm.frame" {
		t.Errorf("first event kind=%q want bm.frame", envs[0].Kind)
	}
	var dartData schema.DartDetectedData
	json.Unmarshal(envs[1].Data, &dartData)
	if dartData.SourceSeq != int(bmFrameSeq) {
		t.Errorf("source_seq=%d want %d (seq of bm.frame)", dartData.SourceSeq, bmFrameSeq)
	}
}

// TestEnvelopeRequiredFields verifies bm_version, recv_wall, recv_mono_ns are set.
func TestEnvelopeRequiredFields(t *testing.T) {
	received := make(chan transport.Envelope, 5)
	s := newTestServer(t, func(conn *websocket.Conn) {
		ctx := context.Background()
		for {
			var e transport.Envelope
			if err := wsjson.Read(ctx, conn, &e); err != nil {
				return
			}
			if e.Kind == "bridge.hello" {
				continue
			}
			received <- e
			return
		}
	})

	recvTime := time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)
	tr := transport.New(transport.Config{
		BackendURL: wsURL(s),
		BridgeID:   "br_test",
		BootID:     "bt_test",
		BMVersion:  "1.2.3",
	}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint
	time.Sleep(100 * time.Millisecond)

	tr.Send([]differ.Event{{
		Kind:       "board.status",
		Data:       &schema.BoardStatusData{Status: "Idle", Connected: true},
		RecvWall:   recvTime,
		RecvMonoNs: 999,
	}})

	select {
	case e := <-received:
		if e.BMVersion != "1.2.3" {
			t.Errorf("bm_version=%q want 1.2.3", e.BMVersion)
		}
		wantWall := recvTime.UTC().Format(time.RFC3339Nano)
		if e.RecvWall != wantWall {
			t.Errorf("recv_wall=%q want %q", e.RecvWall, wantWall)
		}
		if e.RecvMonoNs != 999 {
			t.Errorf("recv_mono_ns=%d want 999", e.RecvMonoNs)
		}
	case <-time.After(2 * time.Second):
		t.Error("timeout waiting for envelope")
	}
}

// TestReplayNoDuplicate verifies that sentUpTo is advanced after replay so that
// the first new event after reconnect doesn't trigger re-delivery of the whole outbox.
func TestReplayNoDuplicate(t *testing.T) {
	var mu sync.Mutex
	var connIdx int
	var conn2Envs []transport.Envelope
	replayReady := make(chan struct{}, 1)

	s := newTestServer(t, func(conn *websocket.Conn) {
		ctx := context.Background()
		mu.Lock()
		idx := connIdx
		connIdx++
		mu.Unlock()

		if idx == 0 {
			// First connection: read hello + 2 seq-numbered events, close without acking.
			seqCount := 0
			for seqCount < 2 {
				var e transport.Envelope
				if err := wsjson.Read(ctx, conn, &e); err != nil {
					return
				}
				if e.Seq > 0 {
					seqCount++
				}
			}
			return
		}
		// Second connection: collect non-hello envelopes; signal when 2 received.
		for {
			var e transport.Envelope
			if err := wsjson.Read(ctx, conn, &e); err != nil {
				return
			}
			if e.Kind == "bridge.hello" {
				continue
			}
			mu.Lock()
			conn2Envs = append(conn2Envs, e)
			n := len(conn2Envs)
			mu.Unlock()
			if n == 2 {
				select {
				case replayReady <- struct{}{}:
				default:
				}
			}
		}
	})

	tr := transport.New(transport.Config{
		BackendURL: wsURL(s),
		BridgeID:   "br_test",
		BootID:     "bt_test",
	}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint
	time.Sleep(50 * time.Millisecond)

	tr.Send([]differ.Event{
		{Kind: "board.status", Data: &schema.BoardStatusData{Status: "A", Connected: true}},
		{Kind: "board.status", Data: &schema.BoardStatusData{Status: "B", Connected: true}},
	})

	select {
	case <-replayReady:
	case <-time.After(3 * time.Second):
		t.Fatal("timeout waiting for replay on second connection")
	}

	// Send one new event — with the duplicate-replay bug this would re-send all 3.
	tr.Send([]differ.Event{
		{Kind: "board.status", Data: &schema.BoardStatusData{Status: "C", Connected: true}},
	})

	time.Sleep(200 * time.Millisecond)

	mu.Lock()
	got := len(conn2Envs)
	mu.Unlock()

	if got != 3 {
		t.Errorf("second connection got %d envelopes, want 3 (2 replay + 1 new)", got)
	}
}

// TestBridgeHelloOnReconnect verifies bridge.hello is sent on every connect, not just first.
func TestBridgeHelloOnReconnect(t *testing.T) {
	var helloCount atomic.Int32
	var connIdx atomic.Int32

	s := newTestServer(t, func(conn *websocket.Conn) {
		ctx := context.Background()
		n := connIdx.Add(1)
		var e transport.Envelope
		if err := wsjson.Read(ctx, conn, &e); err != nil {
			return
		}
		if e.Kind == "bridge.hello" {
			helloCount.Add(1)
		}
		if n == 1 {
			return // close first connection
		}
		// keep second alive briefly
		time.Sleep(200 * time.Millisecond)
	})

	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br", BootID: "bt"}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint

	time.Sleep(600 * time.Millisecond)

	if got := helloCount.Load(); got < 2 {
		t.Errorf("bridge.hello sent %d times, want ≥2 (once per connect)", got)
	}
}
