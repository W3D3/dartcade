package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/differ"
	"github.com/charmbracelet/log"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/oklog/ulid/v2"
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
	scanner := replayScanner(files[0])
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
		var evs []differ.Event
		s, evs = differ.Process(s, *frame)
		for _, ev := range evs {
			out, _ := json.Marshal(map[string]any{"kind": ev.Kind, "data": ev.Data})
			fmt.Println(string(out))
		}
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "scan error: %v\n", err)
		os.Exit(1)
	}
}

// runReplayToBackend processes a JSONL recording and sends each event as an
// adbridge/v1 Envelope to the given WS backend (e.g. the visualiser in
// bridge mode). It throttles at roughly real-time using frame timestamps.
func runReplayToBackend(backendURL, path string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, backendURL, &websocket.DialOptions{
		CompressionMode: websocket.CompressionDisabled,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "dial %s: %v\n", backendURL, err)
		os.Exit(1)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	log.Info("connected to backend", "url", backendURL)

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

	bootID := ulid.Make().String()

	// Send bridge.hello (not seq-numbered).
	hello := map[string]any{
		"kind": "bridge.hello",
		"data": map[string]string{
			"bridge_version": "0.1.0-replay",
			"schema":         "adbridge/1.0",
		},
	}
	if err := wsjson.Write(ctx, conn, hello); err != nil {
		fmt.Fprintf(os.Stderr, "write hello: %v\n", err)
		os.Exit(1)
	}

	s := differ.State{}
	seq := uint64(0)
	scanner := replayScanner(path)
	var firstWall, firstMono time.Time

	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		frame, err := bm.ParseFrame(line)
		if err != nil || frame == nil {
			continue
		}

		// Throttle to match original recording tempo.
		if firstWall.IsZero() && !frame.RecvWall.IsZero() {
			firstWall = frame.RecvWall
			firstMono = time.Now()
		}
		if !firstWall.IsZero() && !frame.RecvWall.IsZero() {
			elapsed := frame.RecvWall.Sub(firstWall)
			sinceStart := time.Since(firstMono)
			if elapsed > sinceStart {
				time.Sleep(elapsed - sinceStart)
			}
		}

		var evs []differ.Event
		s, evs = differ.Process(s, *frame)
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
			if err := wsjson.Write(ctx, conn, env); err != nil {
				fmt.Fprintf(os.Stderr, "write event: %v\n", err)
				return
			}
		}
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "scan error: %v\n", err)
	}
	log.Info("replay complete", "events", seq)
}

func replayScanner(path string) *bufio.Scanner {
	f, err := os.Open(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open %s: %v\n", path, err)
		os.Exit(1)
	}
	s := bufio.NewScanner(f)
	s.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)
	return s
}
