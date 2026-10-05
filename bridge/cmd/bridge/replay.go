package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/differ"
	"github.com/charmbracelet/log"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/oklog/ulid/v2"
)

const (
	// How long connecting to the backend may take in replay mode
	replayDialTimeout = 30 * time.Second
	// How long one write to the backend may take in replay mode
	replayWriteTimeout = 10 * time.Second
)

func runReplay(args []string) {
	fs := flag.NewFlagSet("replay", flag.ExitOnError)
	backendURL := fs.String("backend-url", "", "Send events to this WS backend URL instead of stdout")
	fs.Parse(args)
	files := fs.Args()

	if len(files) == 0 {
		fmt.Fprintln(os.Stderr, "usage: bridge replay [--backend-url ws://...] <file.jsonl>")
		os.Exit(1)
	}

	if *backendURL != "" {
		runReplayToBackend(*backendURL, files[0])
		return
	}

	// Default: print events as JSON to stdout.
	s := differ.State{}
	err := forEachFrame(files[0], func(frame bm.BMFrame) error {
		var evs []differ.Event
		s, evs = differ.Process(s, frame)
		for _, ev := range evs {
			out, _ := json.Marshal(map[string]any{"kind": ev.Kind, "data": ev.Data})
			fmt.Println(string(out))
		}
		return nil
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "replay: %v\n", err)
		os.Exit(1)
	}
}

// runReplayToBackend processes a JSONL recording and sends each event as an
// adbridge/v1 Envelope to the given WS backend (e.g. the visualiser in
// bridge mode). It throttles at roughly real-time using frame timestamps, so
// it runs as long as the recording does (until interrupted); only connecting
// and each write have a timeout.
func runReplayToBackend(backendURL, path string) {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	dialCtx, dialCancel := context.WithTimeout(ctx, replayDialTimeout)
	conn, _, err := websocket.Dial(dialCtx, backendURL, &websocket.DialOptions{
		CompressionMode: websocket.CompressionDisabled,
	})
	dialCancel()
	if err != nil {
		// The URL may carry a token: keep its query out of the output
		fmt.Fprintf(os.Stderr, "dial %s: %s\n", hostOf(backendURL), withoutQuery(err.Error(), backendURL))
		os.Exit(1)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	log.Info("connected to backend", "host", hostOf(backendURL))

	// coder/websocket requires the read path to be driven; without it
	// control frames go unhandled and the conn dies. We discard ACKs here.
	go func() {
		for {
			if _, _, err := conn.Read(ctx); err != nil {
				cancel()
				return
			}
		}
	}()

	write := func(v any) error {
		wctx, wcancel := context.WithTimeout(ctx, replayWriteTimeout)
		defer wcancel()
		return wsjson.Write(wctx, conn, v)
	}

	bootID := ulid.Make().String()

	// Send bridge.hello (not seq-numbered).
	hello := map[string]any{
		"kind": "bridge.hello",
		"data": map[string]string{
			"bridge_version": "0.1.0-replay",
			"schema":         "adbridge/1.0",
		},
	}
	if err := write(hello); err != nil {
		fmt.Fprintf(os.Stderr, "write hello: %v\n", err)
		os.Exit(1)
	}

	s := differ.State{}
	seq := uint64(0)
	var firstWall, firstMono time.Time

	err = forEachFrame(path, func(frame bm.BMFrame) error {
		// Throttle to match original recording tempo.
		if firstWall.IsZero() && !frame.RecvWall.IsZero() {
			firstWall = frame.RecvWall
			firstMono = time.Now()
		}
		if !firstWall.IsZero() && !frame.RecvWall.IsZero() {
			elapsed := frame.RecvWall.Sub(firstWall)
			if wait := elapsed - time.Since(firstMono); wait > 0 {
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(wait):
				}
			}
		}

		var evs []differ.Event
		s, evs = differ.Process(s, frame)
		for _, ev := range evs {
			seq++
			data, _ := json.Marshal(ev.Data)
			env := map[string]any{
				"v":            1,
				"schema":       "adbridge/1.0",
				"bridge_id":    "replay",
				"boot_id":      bootID,
				"seq":          seq,
				"board_id":     "",
				"bm_version":   "",
				"recv_wall":    ev.RecvWall.UTC().Format(time.RFC3339Nano),
				"recv_mono_ns": ev.RecvMonoNs,
				"kind":         ev.Kind,
				"data":         json.RawMessage(data),
			}
			if err := write(env); err != nil {
				return fmt.Errorf("write event: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "replay: %v\n", err)
		return
	}
	log.Info("replay complete", "events", seq)
}

// withoutQuery returns msg with rawURL's query (which may hold a token) taken out.
func withoutQuery(msg, rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil || u.RawQuery == "" {
		return msg
	}
	return strings.ReplaceAll(msg, u.RawQuery, "REDACTED")
}

// forEachFrame calls fn with each Board Manager frame of a JSONL recording, in order,
// skipping blank lines and lines that don't parse. It stops at fn's first error, and
// closes the recording when done.
func forEachFrame(path string, fn func(bm.BMFrame) error) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		frame, err := bm.ParseFrame(line)
		if err != nil {
			log.Warn("parse error", "err", err)
			continue
		}
		if frame == nil {
			continue
		}
		if err := fn(*frame); err != nil {
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scan %s: %w", path, err)
	}
	return nil
}
