package transport

import (
	"context"
	"encoding/json"
	"math/rand"
	"sync"
	"time"

	"dartcade/bridge/internal/differ"
	"dartcade/bridge/internal/schema"
	"github.com/charmbracelet/log"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const outboxMax = 1000

// Envelope wraps every outbound adbridge/v1 message.
type Envelope struct {
	V          int             `json:"v"`
	Schema     string          `json:"schema"`
	BridgeID   string          `json:"bridge_id"`
	BootID     string          `json:"boot_id"`
	Seq        uint64          `json:"seq"`
	BoardID    string          `json:"board_id"`
	BMVersion  string          `json:"bm_version"`
	RecvWall   string          `json:"recv_wall,omitempty"`
	RecvMonoNs int64           `json:"recv_mono_ns,omitempty"`
	Kind       string          `json:"kind"`
	Data       json.RawMessage `json:"data"`
}

// Config holds the transport's static configuration.
type Config struct {
	BackendURL string
	BridgeID   string
	BootID     string
	BoardID    string
	BMVersion  string
}

// ExecuteFunc is called when the backend sends a valid command.
type ExecuteFunc func(name string) (httpStatus int, err error)

// Transport manages the WSS connection to the backend.
type Transport struct {
	cfg      Config
	execute  ExecuteFunc
	mu       sync.Mutex
	outbox   []outboxEntry
	seq      uint64
	incoming chan []differ.Event
}

type outboxEntry struct {
	env       Envelope
	telemetry bool
}

// New creates a Transport.
func New(cfg Config, execute ExecuteFunc) *Transport {
	return &Transport{
		cfg:      cfg,
		execute:  execute,
		incoming: make(chan []differ.Event, 256),
	}
}

// Send enqueues a batch of events for delivery to the backend.
func (t *Transport) Send(evs []differ.Event) {
	select {
	case t.incoming <- evs:
	default:
		log.Warn("transport incoming channel full, dropping batch")
	}
}

// Start connects to the backend and runs the send loop. Blocks until ctx is cancelled.
func (t *Transport) Start(ctx context.Context) error {
	backoff := 500 * time.Millisecond
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		conn, _, err := websocket.Dial(ctx, t.cfg.BackendURL, nil)
		if err != nil {
			log.Warn("backend connect failed", "err", err, "retry_in", backoff)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
			backoff = jitter(minDur(backoff*2, 30*time.Second))
			continue
		}
		backoff = 500 * time.Millisecond
		log.Info("connected to backend")
		t.runConn(ctx, conn)
		conn.Close(websocket.StatusNormalClosure, "")
	}
}

func (t *Transport) runConn(ctx context.Context, conn *websocket.Conn) {
	// Start ingesting events into outbox
	ingest := make(chan struct{}, 1)
	ingestCtx, ingestCancel := context.WithCancel(ctx)
	defer ingestCancel()
	go func() {
		for {
			select {
			case <-ingestCtx.Done():
				return
			case evs := <-t.incoming:
				t.enqueue(evs)
				select {
				case ingest <- struct{}{}:
				default:
				}
			}
		}
	}()

	// Replay outbox
	t.mu.Lock()
	snapshot := make([]Envelope, len(t.outbox))
	for i, e := range t.outbox {
		snapshot[i] = e.env
	}
	t.mu.Unlock()
	for _, e := range snapshot {
		if err := wsjson.Write(ctx, conn, e); err != nil {
			return
		}
	}

	heartbeat := time.NewTicker(20 * time.Second)
	deadline := time.NewTimer(45 * time.Second)
	defer heartbeat.Stop()
	defer deadline.Stop()

	readErr := make(chan error, 1)
	readMsg := make(chan json.RawMessage, 32)
	go func() {
		for {
			_, msg, err := conn.Read(ctx)
			if err != nil {
				readErr <- err
				return
			}
			deadline.Reset(45 * time.Second)
			select {
			case readMsg <- msg:
			default:
			}
		}
	}()

	// Track highest seq sent to avoid duplicate sends on ingest signal
	var sentUpTo uint64

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
			if err := wsjson.Write(ctx, conn, map[string]string{"ping": "1"}); err != nil {
				return
			}
		case msg := <-readMsg:
			t.handleMessage(ctx, msg)
		case <-ingest:
			// Send newly enqueued entries
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
				if err := wsjson.Write(ctx, conn, e); err != nil {
					return
				}
			}
		}
	}
}

func (t *Transport) enqueue(evs []differ.Event) {
	if len(evs) == 0 {
		return
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	var bmFrameSeq uint64
	for _, ev := range evs {
		t.seq++
		seq := t.seq
		if ev.Kind == "bm.frame" {
			bmFrameSeq = seq
		}

		data, err := marshalData(ev, bmFrameSeq)
		if err != nil {
			log.Error("marshal event data", "kind", ev.Kind, "err", err)
			t.seq--
			continue
		}

		env := Envelope{
			V:        1,
			Schema:   "adbridge/1.0",
			BridgeID: t.cfg.BridgeID,
			BootID:   t.cfg.BootID,
			Seq:      seq,
			BoardID:  t.cfg.BoardID,
			Kind:     ev.Kind,
			Data:     data,
		}

		isTelemetry := ev.Kind == "motion" || ev.Kind == "bm.frame"

		if len(t.outbox) >= outboxMax && isTelemetry {
			// Collapse: replace last entry of same kind
			for i := len(t.outbox) - 1; i >= 0; i-- {
				if t.outbox[i].telemetry && t.outbox[i].env.Kind == ev.Kind {
					t.outbox[i].env = env
					goto next
				}
			}
			// No collapsible entry found, drop
			t.seq--
			goto next
		}

		if len(t.outbox) >= outboxMax && !isTelemetry {
			log.Error("outbox full for game-data event", "kind", ev.Kind)
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

func (t *Transport) handleMessage(ctx context.Context, msg json.RawMessage) {
	// Check for ack
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

	// Check for command
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

	status, err := t.execute(cmd.Name)
	ok := err == nil && status < 300
	t.Send([]differ.Event{{Kind: "command.result", Data: &schema.CommandResultData{
		CommandId:  cmd.CommandID,
		Ok:         ok,
		HttpStatus: &status,
	}}})
}

func jitter(d time.Duration) time.Duration {
	return d + time.Duration(rand.Int63n(int64(d/4)+1))
}

func minDur(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
