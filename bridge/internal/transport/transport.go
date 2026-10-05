package transport

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"runtime"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"dartcade/bridge/internal/backoff"
	"dartcade/bridge/internal/camera"
	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/schema"
	"github.com/charmbracelet/log"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const (
	outboxMax     = 1000
	schemaVersion = "adbridge/1.0"
	// How long a backend command may take on the Board Manager
	commandTimeout = 15 * time.Second
	// Backend commands waiting to run; more are refused
	commandQueue = 16
	// How long one write to the backend may take before the connection is dropped
	writeTimeout = 10 * time.Second
)

// Envelope wraps every outbound adbridge/v1 message.
type Envelope struct {
	V          int             `json:"v"`
	Schema     string          `json:"schema"`
	BridgeID   string          `json:"bridge_id"`
	BootID     string          `json:"boot_id"`
	Seq        uint64          `json:"seq"`
	BoardID    string          `json:"board_id"`
	BMVersion  string          `json:"bm_version"`
	RecvWall   string          `json:"recv_wall"`
	RecvMonoNs int64           `json:"recv_mono_ns"`
	Kind       string          `json:"kind"`
	Data       json.RawMessage `json:"data"`
}

// Config holds the transport's static configuration.
type Config struct {
	// Backend WebSocket URL, without the token
	BackendURL string
	// Bridge token, sent as the token query parameter; never logged
	Token     string
	BridgeID  string
	BootID    string
	BoardID   string
	BMVersion string
	BMUrl     string // Board Manager base URL, reported in bridge.hello
	// Bridge build version (main.version), reported in bridge.hello
	BridgeVersion string
}

// ExecuteFunc is called when the backend sends a valid command. It runs off the send loop,
// one command at a time, and ctx ends after commandTimeout.
type ExecuteFunc func(ctx context.Context, name string) (httpStatus int, err error)

// Transport manages the WSS connection to the backend.
type Transport struct {
	cfg     Config
	execute ExecuteFunc
	mu      sync.Mutex
	outbox  []outboxEntry
	seq     uint64
	// Signalled after Send adds to the outbox, so the live connection flushes it
	wake chan struct{}
	// Allowed backend commands waiting for runCommands
	commands chan command
	// Camera stills to send on the live connection (never queued for a later one)
	stills    chan any
	connected atomic.Bool
	onConnect func()
}

type command struct{ id, name string }

type outboxEntry struct {
	env       Envelope
	telemetry bool
}

// New creates a Transport.
func New(cfg Config, execute ExecuteFunc) *Transport {
	return &Transport{
		cfg:      cfg,
		execute:  execute,
		wake:     make(chan struct{}, 1),
		commands: make(chan command, commandQueue),
		stills:   make(chan any, 2*camera.MaxCameras),
	}
}

// OnConnect sets a hook run each time the backend connection comes up (after bridge.hello).
// It runs on the send loop, so it must not block. Set it before Start.
func (t *Transport) OnConnect(f func()) { t.onConnect = f }

// Connected reports whether the backend connection is up.
func (t *Transport) Connected() bool { return t.connected.Load() }

// StillMessage is the camera.still message for a still (schema/adbridge-v1.json
// CameraStillMessage): not an event, so no envelope and no seq.
func StillMessage(st camera.Still) any {
	return map[string]any{
		"kind": "camera.still",
		"data": schema.CameraStillData{
			Cam:         st.Cam,
			CapturedAt:  st.CapturedAt.UTC(),
			ContentType: "image/jpeg",
			Data:        base64.StdEncoding.EncodeToString(st.JPEG),
		},
	}
}

// SendStill sends a camera still on the live connection. Stills are never stored or
// replayed: while the backend is unreachable (or the queue is full) they are dropped.
func (t *Transport) SendStill(st camera.Still) {
	if !t.connected.Load() {
		return
	}
	select {
	case t.stills <- StillMessage(st):
	default:
		log.Debug("camera still queue full, dropping", "cam", st.Cam)
	}
}

// Send adds a batch of events to the outbox for delivery to the backend. It works whether
// or not the backend is connected: the outbox is replayed on the next connection.
func (t *Transport) Send(evs []differ.Event) {
	t.enqueue(evs)
	select {
	case t.wake <- struct{}{}:
	default:
	}
}

// Start connects to the backend and runs the send loop. Blocks until ctx is cancelled.
func (t *Transport) Start(ctx context.Context) error {
	dialURL, err := withToken(t.cfg.BackendURL, t.cfg.Token)
	if err != nil {
		return err
	}
	// The token to keep out of logs, also when it is part of the configured URL
	token := t.cfg.Token
	if u, err := url.Parse(dialURL); err == nil {
		token = u.Query().Get("token")
	}
	go t.runCommands(ctx)
	delay := 500 * time.Millisecond
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		conn, _, err := websocket.Dial(ctx, dialURL, nil)
		if err != nil {
			log.Warn("backend connect failed", "err", redact(err, token), "retry_in", delay)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
			delay = backoff.Next(delay, 30*time.Second)
			continue
		}
		delay = 500 * time.Millisecond
		log.Info("connected to backend")
		t.runConn(ctx, conn)
		conn.Close(websocket.StatusNormalClosure, "")
	}
}

// withToken adds the token to the backend URL's query, keeping any query it already has.
func withToken(backendURL, token string) (string, error) {
	u, err := url.Parse(backendURL)
	if err != nil {
		return "", fmt.Errorf("backend url: %w", redact(err, token))
	}
	if token == "" {
		return backendURL, nil
	}
	q := u.Query()
	q.Set("token", token)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

// redact returns err with the token taken out of its message (dial errors carry the
// full URL).
func redact(err error, token string) error {
	if token == "" {
		return err
	}
	msg := err.Error()
	for _, s := range []string{url.QueryEscape(token), url.PathEscape(token), token} {
		msg = strings.ReplaceAll(msg, s, "REDACTED")
	}
	return errors.New(msg)
}

func (t *Transport) runConn(ctx context.Context, conn *websocket.Conn) {
	// Send bridge.hello on every connect (not seq-numbered, not in outbox).
	hello := map[string]any{
		"kind": "bridge.hello",
		"data": schema.BridgeHelloData{
			BridgeVersion: t.cfg.BridgeVersion,
			Schema:        schemaVersion,
			Os:            runtime.GOOS,
			Arch:          runtime.GOARCH,
			BmVersion:     t.cfg.BMVersion,
			BmUrl:         t.cfg.BMUrl,
		},
	}
	if err := write(ctx, conn, hello); err != nil {
		return
	}
	// Stills queued for the previous connection are stale now
	for drained := false; !drained; {
		select {
		case <-t.stills:
		default:
			drained = true
		}
	}
	t.connected.Store(true)
	defer t.connected.Store(false)
	if t.onConnect != nil {
		t.onConnect()
	}

	// Replay unacknowledged outbox entries. Advance sentUpTo so the first wake
	// signal after replay doesn't re-deliver the whole outbox.
	t.mu.Lock()
	snapshot := make([]Envelope, len(t.outbox))
	for i, e := range t.outbox {
		snapshot[i] = e.env
	}
	t.mu.Unlock()

	var sentUpTo uint64
	for _, e := range snapshot {
		if err := write(ctx, conn, e); err != nil {
			return
		}
		sentUpTo = e.Seq
	}

	heartbeat := time.NewTicker(20 * time.Second)
	deadline := time.NewTimer(45 * time.Second)
	defer heartbeat.Stop()
	defer deadline.Stop()

	// The reader handles each message itself: acks and command queueing never block, so
	// nothing the backend sends is dropped and the send loop never waits on it
	readErr := make(chan error, 1)
	go func() {
		for {
			_, msg, err := conn.Read(ctx)
			if err != nil {
				readErr <- err
				return
			}
			deadline.Reset(45 * time.Second)
			t.handleMessage(msg)
		}
	}()

	// flush sends the outbox entries not sent on this connection yet; false when the write failed
	flush := func() bool {
		t.mu.Lock()
		var toSend []Envelope
		for _, e := range t.outbox {
			if e.env.Seq > sentUpTo {
				toSend = append(toSend, e.env)
			}
		}
		if len(t.outbox) > 0 {
			sentUpTo = t.outbox[len(t.outbox)-1].env.Seq
		}
		t.mu.Unlock()
		for _, e := range toSend {
			if err := write(ctx, conn, e); err != nil {
				return false
			}
		}
		return true
	}

	for {
		select {
		case <-ctx.Done():
			return
		case err := <-readErr:
			log.Warn("backend read error", "err", err)
			return
		case <-deadline.C:
			log.Warn("backend heartbeat timeout")
			return
		case <-heartbeat.C:
			if err := write(ctx, conn, map[string]string{"ping": "1"}); err != nil {
				return
			}
		case st := <-t.stills:
			// Events first: a dart waiting in the outbox never queues behind a picture
			if !flush() {
				return
			}
			if err := write(ctx, conn, st); err != nil {
				return
			}
		case <-t.wake:
			if !flush() {
				return
			}
		}
	}
}

// write sends v on conn, giving up after writeTimeout so a stalled backend can't hang the
// send loop.
func write(ctx context.Context, conn *websocket.Conn, v any) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	return wsjson.Write(ctx, conn, v)
}

func (t *Transport) enqueue(evs []differ.Event) {
	if len(evs) == 0 {
		return
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	var bmFrameSeq uint64
	for _, ev := range evs {
		// A seq is never reused, even for an event that is dropped below: source_seq
		// must keep pointing at its bm.frame (gaps are fine, the backend only dedupes)
		t.seq++
		seq := t.seq
		if ev.Kind == "bm.frame" {
			bmFrameSeq = seq
		}

		data, err := marshalData(ev, bmFrameSeq)
		if err != nil {
			log.Error("marshal event data", "kind", ev.Kind, "err", err)
			continue
		}

		recvWall := ""
		if !ev.RecvWall.IsZero() {
			recvWall = ev.RecvWall.UTC().Format(time.RFC3339Nano)
		}

		env := Envelope{
			V:          1,
			Schema:     schemaVersion,
			BridgeID:   t.cfg.BridgeID,
			BootID:     t.cfg.BootID,
			Seq:        seq,
			BoardID:    t.cfg.BoardID,
			BMVersion:  t.cfg.BMVersion,
			RecvWall:   recvWall,
			RecvMonoNs: ev.RecvMonoNs,
			Kind:       ev.Kind,
			Data:       data,
		}

		isTelemetry := ev.Kind == "motion" || ev.Kind == "bm.frame"

		if len(t.outbox) >= outboxMax && isTelemetry {
			// Collapse: drop the last entry of the same kind and append this one, to bound
			// telemetry. The outbox must stay sorted by seq: flush and replay rely on it.
			for i := len(t.outbox) - 1; i >= 0; i-- {
				if t.outbox[i].telemetry && t.outbox[i].env.Kind == ev.Kind {
					t.outbox = append(slices.Delete(t.outbox, i, i+1), outboxEntry{env: env, telemetry: true})
					goto next
				}
			}
			// No collapsible entry found; drop to stay within bound.
			goto next
		}

		// Game-data events are never dropped (spec §8.2). The outbox grows
		// unboundedly during extended backend outages; this is intentional.
		// Log once per event to aid diagnosis; don't spam per-second.
		if len(t.outbox) >= outboxMax && !isTelemetry {
			log.Warn("outbox over capacity — game-data retained", "kind", ev.Kind, "size", len(t.outbox))
		}

		t.outbox = append(t.outbox, outboxEntry{env: env, telemetry: isTelemetry})
	next:
	}
}

func marshalData(ev differ.Event, bmFrameSeq uint64) (json.RawMessage, error) {
	if bmFrameSeq > 0 {
		switch d := ev.Data.(type) {
		case *schema.DartDetectedData:
			d.SourceSeq = int(bmFrameSeq)
		case *schema.DartCorrectedData:
			d.SourceSeq = int(bmFrameSeq)
		case *schema.DartMovedData:
			d.SourceSeq = int(bmFrameSeq)
		}
	}
	return json.Marshal(ev.Data)
}

// handleMessage handles a message from the backend: an ack or a command. It must not block.
func (t *Transport) handleMessage(msg []byte) {
	var ack struct {
		Ack *uint64 `json:"ack"`
	}
	json.Unmarshal(msg, &ack)
	if ack.Ack != nil {
		t.mu.Lock()
		newBox := t.outbox[:0]
		for _, e := range t.outbox {
			if e.env.Seq > *ack.Ack {
				newBox = append(newBox, e)
			}
		}
		t.outbox = newBox
		t.mu.Unlock()
		return
	}

	var cmd struct {
		CommandID string `json:"command_id"`
		Name      string `json:"name"`
	}
	json.Unmarshal(msg, &cmd)
	if cmd.CommandID == "" {
		return
	}

	allowed := map[string]bool{"reset": true, "start": true, "stop": true}
	if !allowed[cmd.Name] {
		log.Error("rejected unknown command", "name", cmd.Name)
		t.Send([]differ.Event{{Kind: "command.result", Data: &schema.CommandResultData{
			CommandId: cmd.CommandID,
			Ok:        false,
		}}})
		return
	}

	if t.execute == nil {
		t.Send([]differ.Event{{Kind: "command.result", Data: &schema.CommandResultData{
			CommandId: cmd.CommandID,
			Ok:        false,
		}}})
		return
	}

	// Run it off the send loop: a Board Manager that doesn't answer must not stall
	// heartbeats, acks and events. The result goes out through the outbox.
	select {
	case t.commands <- command{id: cmd.CommandID, name: cmd.Name}:
	default:
		log.Error("too many backend commands waiting, rejecting", "name", cmd.Name)
		t.Send([]differ.Event{{Kind: "command.result", Data: &schema.CommandResultData{
			CommandId: cmd.CommandID,
			Ok:        false,
		}}})
	}
}

// runCommands runs backend commands in the order they came, until ctx ends.
func (t *Transport) runCommands(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case cmd := <-t.commands:
			execCtx, cancel := context.WithTimeout(ctx, commandTimeout)
			status, err := t.execute(execCtx, cmd.name)
			cancel()
			if err != nil {
				log.Warn("backend command failed", "name", cmd.name, "err", err)
			}
			t.Send([]differ.Event{{Kind: "command.result", Data: &schema.CommandResultData{
				CommandId:  cmd.id,
				Ok:         err == nil && status < 300,
				HttpStatus: &status,
			}}})
		}
	}
}
