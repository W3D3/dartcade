package transport_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"dartcade/bridge/internal/camera"
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
	execFn := func(_ context.Context, name string) (int, error) {
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
	execFn := func(_ context.Context, name string) (int, error) {
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

// readUntilKind reads raw messages until one of the given kind arrives.
func readUntilKind(ctx context.Context, conn *websocket.Conn, kind string) (map[string]json.RawMessage, error) {
	for {
		var m map[string]json.RawMessage
		if err := wsjson.Read(ctx, conn, &m); err != nil {
			return nil, err
		}
		var k string
		json.Unmarshal(m["kind"], &k)
		if k == kind {
			return m, nil
		}
	}
}

func TestCameraStillIsSentOnTheLiveConnection(t *testing.T) {
	got := make(chan map[string]json.RawMessage, 1)
	s := newTestServer(t, func(conn *websocket.Conn) {
		m, err := readUntilKind(context.Background(), conn, "camera.still")
		if err != nil {
			return
		}
		got <- m
	})
	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br", BootID: "bt"}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint
	deadline := time.Now().Add(time.Second)
	for !tr.Connected() && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if !tr.Connected() {
		t.Fatal("never connected")
	}

	at := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	tr.SendStill(camera.Still{Cam: 1, CapturedAt: at, JPEG: []byte{0xFF, 0xD8, 0xFF, 0xD9}})

	select {
	case m := <-got:
		if _, ok := m["seq"]; ok {
			t.Error("a camera still has no seq (it is not an event)")
		}
		var d schema.CameraStillData
		if err := json.Unmarshal(m["data"], &d); err != nil {
			t.Fatalf("data: %v", err)
		}
		if d.Cam != 1 || d.ContentType != "image/jpeg" || !d.CapturedAt.Equal(at) || d.Data != "/9j/2Q==" {
			t.Errorf("data: %+v", d)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no camera.still")
	}
}

func TestCameraStillsAreDroppedWhileOffline(t *testing.T) {
	got := make(chan string, 4)
	s := newTestServer(t, func(conn *websocket.Conn) {
		for {
			var m struct {
				Kind string `json:"kind"`
			}
			if err := wsjson.Read(context.Background(), conn, &m); err != nil {
				return
			}
			if m.Kind != "bridge.hello" {
				got <- m.Kind
			}
		}
	})
	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br", BootID: "bt"}, nil)
	// Not connected yet: this still is stale by the time the connection is up
	tr.SendStill(camera.Still{Cam: 0, CapturedAt: time.Now(), JPEG: []byte{1}})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint
	time.Sleep(150 * time.Millisecond)
	tr.Send([]differ.Event{{Kind: "board.status", Data: &schema.BoardStatusData{Status: "Idle", Running: true}}})

	select {
	case k := <-got:
		if k != "board.status" {
			t.Fatalf("first message after hello: %q, want board.status", k)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("nothing received")
	}
}

func TestStillMessageMatchesTheSchemaShape(t *testing.T) {
	b, err := json.Marshal(transport.StillMessage(camera.Still{Cam: 2, CapturedAt: time.Now(), JPEG: []byte("x")}))
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	json.Unmarshal(b, &m)
	if m["kind"] != "camera.still" || len(m) != 2 {
		t.Errorf("message: %s", b)
	}
}

// Each (re)connect runs the OnConnect hook once the connection is up, so the bridge can send
// fresh stills right away.
func TestOnConnectRunsOnEveryConnect(t *testing.T) {
	var conns atomic.Int32
	s := newTestServer(t, func(conn *websocket.Conn) {
		n := conns.Add(1)
		var e transport.Envelope
		wsjson.Read(context.Background(), conn, &e) // hello
		if n == 1 {
			return // drop the first connection
		}
		time.Sleep(300 * time.Millisecond)
	})
	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br", BootID: "bt"}, nil)
	calls := make(chan bool, 4)
	tr.OnConnect(func() { calls <- tr.Connected() })
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint

	for i := 0; i < 2; i++ {
		select {
		case up := <-calls:
			if !up {
				t.Error("OnConnect ran before the connection was up")
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("OnConnect ran %d times, want 2", i)
		}
	}
}

// A command the Board Manager doesn't answer runs off the send loop: events keep flowing
// while it hangs, it gets a deadline, and its result follows once it returns.
func TestHungCommandDoesNotBlockTheSendLoop(t *testing.T) {
	kinds := make(chan string, 10)
	s := newTestServer(t, func(conn *websocket.Conn) {
		ctx := context.Background()
		wsjson.Write(ctx, conn, map[string]any{"command_id": "cmd3", "name": "reset"})
		for {
			e, err := readSkipHello(ctx, conn)
			if err != nil {
				return
			}
			kinds <- e.Kind
		}
	})

	release := make(chan struct{})
	started := make(chan bool, 1)
	execFn := func(ctx context.Context, name string) (int, error) {
		_, hasDeadline := ctx.Deadline()
		started <- hasDeadline
		select {
		case <-release:
			return 200, nil
		case <-ctx.Done():
			return 0, ctx.Err()
		}
	}
	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br", BootID: "bt"}, execFn)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint

	select {
	case hasDeadline := <-started:
		if !hasDeadline {
			t.Error("command ctx has no deadline")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("command never ran")
	}

	tr.Send([]differ.Event{{Kind: "visit.opened", Data: &schema.VisitOpenedData{VisitId: "v"}}})
	select {
	case k := <-kinds:
		if k != "visit.opened" {
			t.Fatalf("got %s while the command hung, want visit.opened", k)
		}
	case <-time.After(time.Second):
		t.Fatal("event not sent while the command hung")
	}

	close(release)
	select {
	case k := <-kinds:
		if k != "command.result" {
			t.Fatalf("got %s, want command.result", k)
		}
	case <-time.After(time.Second):
		t.Fatal("no command.result after the command returned")
	}
}

// A burst of commands while one hangs is never silently dropped: each one gets a
// command.result, refused ones with ok false.
func TestEveryCommandInABurstGetsAResult(t *testing.T) {
	const burst = 60
	results := make(chan string, burst)
	s := newTestServer(t, func(conn *websocket.Conn) {
		ctx := context.Background()
		for i := range burst {
			wsjson.Write(ctx, conn, map[string]any{"command_id": fmt.Sprint(i), "name": "reset"})
		}
		for {
			e, err := readSkipHello(ctx, conn)
			if err != nil {
				return
			}
			if e.Kind == "command.result" {
				var d schema.CommandResultData
				json.Unmarshal(e.Data, &d)
				results <- d.CommandId
			}
		}
	})

	release := make(chan struct{})
	execFn := func(ctx context.Context, name string) (int, error) {
		select {
		case <-release:
			return 200, nil
		case <-ctx.Done():
			return 0, ctx.Err()
		}
	}
	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br", BootID: "bt"}, execFn)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint

	seen := map[string]bool{}
	timeout := time.After(2 * time.Second)
	for len(seen) < burst {
		select {
		case id := <-results:
			seen[id] = true
			// At most commandsInFlight are running or queued, the rest are refused at once;
			// once those are in, let the hung and queued ones finish
			if len(seen) == burst-commandsInFlight {
				close(release)
			}
		case <-timeout:
			t.Fatalf("%d of %d commands got a result", len(seen), burst)
		}
	}
}

// One running plus the queue (transport.commandQueue).
const commandsInFlight = 1 + 16

// Events sent while the backend is unreachable stay in the outbox and are all delivered,
// in order, once it connects, however many batches piled up.
func TestEventsSentWhileDisconnectedAreDelivered(t *testing.T) {
	const batches = 600
	received := make(chan transport.Envelope, batches)
	var up atomic.Bool
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !up.Load() {
			http.Error(w, "down", http.StatusServiceUnavailable)
			return
		}
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close(websocket.StatusNormalClosure, "")
		for {
			e, err := readSkipHello(context.Background(), c)
			if err != nil {
				return
			}
			received <- e
		}
	}))
	t.Cleanup(s.Close)

	tr := transport.New(transport.Config{BackendURL: wsURL(s), BridgeID: "br", BootID: "bt"}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	go tr.Start(ctx) //nolint

	for i := range batches {
		tr.Send([]differ.Event{{Kind: "visit.opened", Data: &schema.VisitOpenedData{VisitId: schema.VisitId(fmt.Sprint(i))}}})
	}
	up.Store(true)

	for want := uint64(1); want <= batches; want++ {
		select {
		case e := <-received:
			if e.Seq != want {
				t.Fatalf("got seq %d, want %d", e.Seq, want)
			}
		case <-ctx.Done():
			t.Fatalf("only %d of %d events delivered", want-1, batches)
		}
	}
}
