// Throwaway hardware spike recorder — not production code.
// Connects to an Autodarts Board Manager's local API, logs every WS frame and
// HTTP poll to a JSONL file with wall-clock and monotonic timestamps, and lets
// you insert labelled markers by typing a line on stdin.
package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var (
	boardBase = flag.String("board", "http://192.168.0.109:3180", "Board Manager base URL")
	outPath   = flag.String("out", "", "Output JSONL file (default: recording-<timestamp>.jsonl)")
	startMono = time.Now()
)

var (
	mu     sync.Mutex
	output *os.File
)

func monoNs() int64    { return time.Since(startMono).Nanoseconds() }
func wallStr() string  { return time.Now().UTC().Format(time.RFC3339Nano) }

func emit(rec map[string]interface{}) {
	b, _ := json.Marshal(rec)
	mu.Lock()
	fmt.Fprintf(output, "%s\n", b)
	mu.Unlock()
}

// redactSecrets removes api_key and token values anywhere in a parsed JSON value.
func redactSecrets(v interface{}) {
	switch m := v.(type) {
	case map[string]interface{}:
		for k := range m {
			switch strings.ToLower(k) {
			case "api_key", "token", "apikey", "api-key":
				m[k] = "[REDACTED]"
			default:
				redactSecrets(m[k])
			}
		}
	case []interface{}:
		for _, elem := range m {
			redactSecrets(elem)
		}
	}
}

func httpGet(path string) ([]byte, error) {
	base := strings.TrimRight(*boardBase, "/")
	resp, err := http.Get(base + path)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func startup() {
	// /api/version — plain text
	v, err := httpGet("/api/version")
	if err != nil {
		log.Printf("version fetch error: %v", err)
	} else {
		ver := strings.TrimSpace(string(v))
		emit(map[string]interface{}{
			"kind":         "startup_version",
			"recv_wall":    wallStr(),
			"recv_mono_ns": monoNs(),
			"value":        ver,
		})
		log.Printf("Board Manager version: %s", ver)
	}

	// /api/config — JSON, secrets must never be written to disk
	b, err := httpGet("/api/config")
	if err != nil {
		log.Printf("config fetch error: %v", err)
	} else {
		var cfg interface{}
		if json.Unmarshal(b, &cfg) == nil {
			redactSecrets(cfg)
			emit(map[string]interface{}{
				"kind":         "startup_config",
				"recv_wall":    wallStr(),
				"recv_mono_ns": monoNs(),
				"data":         cfg,
			})
		}
		log.Printf("Config saved (secrets redacted)")
	}
}

func pollLoop() {
	for {
		b, err := httpGet("/api/state")
		if err != nil {
			log.Printf("poll: %v", err)
		} else {
			var data interface{}
			json.Unmarshal(b, &data)
			emit(map[string]interface{}{
				"kind":         "poll",
				"recv_wall":    wallStr(),
				"recv_mono_ns": monoNs(),
				"data":         data,
			})
		}
		time.Sleep(2 * time.Second)
	}
}

func markerLoop() {
	scanner := bufio.NewScanner(os.Stdin)
	fmt.Println()
	fmt.Println("Recording. Type a label and press Enter to insert a marker.")
	fmt.Println("Examples:  T20   bull-25   miss   takeout-full   disconnect-cable")
	fmt.Println("Just Enter = plain separator.")
	fmt.Println()
	for {
		fmt.Print("marker> ")
		if !scanner.Scan() {
			break
		}
		label := strings.TrimSpace(scanner.Text())
		if label == "" {
			label = "---"
		}
		emit(map[string]interface{}{
			"kind":         "marker",
			"recv_wall":    wallStr(),
			"recv_mono_ns": monoNs(),
			"label":        label,
		})
		log.Printf("✓ marker: %s", label)
	}
}

func wsLoop() {
	base := strings.TrimRight(*boardBase, "/")
	wsURL := strings.Replace(base, "http://", "ws://", 1) + "/api/events"

	first := true
	var disconnectedAt time.Time

	for {
		log.Printf("→ connecting to %s", wsURL)
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			log.Printf("  connect failed: %v — retrying in 2 s", err)
			time.Sleep(2 * time.Second)
			continue
		}

		rec := map[string]interface{}{
			"kind":         "connect",
			"recv_wall":    wallStr(),
			"recv_mono_ns": monoNs(),
		}
		if !first {
			rec["kind"] = "reconnect"
			rec["gap_ms"] = time.Since(disconnectedAt).Milliseconds()
		}
		first = false
		emit(rec)
		log.Printf("  connected")

		for {
			_, msg, err := conn.ReadMessage()
			w, m := wallStr(), monoNs()
			if err != nil {
				disconnectedAt = time.Now()
				emit(map[string]interface{}{
					"kind":         "disconnect",
					"recv_wall":    w,
					"recv_mono_ns": m,
					"reason":       err.Error(),
				})
				log.Printf("disconnected: %v", err)
				conn.Close()
				break
			}

			var env struct {
				Type string          `json:"type"`
				Data json.RawMessage `json:"data"`
			}
			if err := json.Unmarshal(msg, &env); err != nil {
				// Unknown shape — store raw bytes.
				emit(map[string]interface{}{
					"kind":         "ws_frame",
					"recv_wall":    w,
					"recv_mono_ns": m,
					"bm_type":      "?",
					"raw":          string(msg),
				})
				continue
			}

			// Redact auth frames — never write their contents.
			var data interface{}
			if strings.ToLower(env.Type) == "auth" {
				data = "[REDACTED]"
			} else {
				json.Unmarshal(env.Data, &data)
			}

			emit(map[string]interface{}{
				"kind":         "ws_frame",
				"recv_wall":    w,
				"recv_mono_ns": m,
				"bm_type":      env.Type,
				"data":         data,
			})
		}

		time.Sleep(1 * time.Second)
	}
}

func main() {
	flag.Parse()

	if *outPath == "" {
		*outPath = "recording-" + time.Now().UTC().Format("2006-01-02T15-04-05Z") + ".jsonl"
	}

	f, err := os.Create(*outPath)
	if err != nil {
		log.Fatalf("cannot create output file %s: %v", *outPath, err)
	}
	output = f
	defer f.Close()

	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.Printf("dartcade recorder — writing to %s", *outPath)
	log.Printf("board: %s", *boardBase)

	startup()
	go pollLoop()
	go wsLoop()
	markerLoop() // blocks on stdin; Ctrl-D / EOF to quit
}
