// Throwaway dartboard visualiser prototype — not production code.
// Connects to a Board Manager, diffs state frames, and serves a live
// SVG dartboard view at http://localhost:7180.
package main

import (
	_ "embed"
	"encoding/json"
	"flag"
	"io"
	"log"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

//go:embed board.html
var boardHTML []byte

var boardBase = flag.String("board", "http://192.168.0.109:3180", "Board Manager base URL")
var listenAddr = flag.String("listen", "localhost:7180", "Address to serve on")
var bridgeMode = flag.Bool("bridge", false, "Accept bridge connections at /bridge instead of connecting to Board Manager")

// --- Board Manager types ---

type Segment struct {
	Name       string `json:"name"`
	Number     int    `json:"number"`
	Bed        string `json:"bed"`
	Multiplier int    `json:"multiplier"`
}

type Coords struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Throw struct {
	Segment Segment  `json:"segment"`
	Coords  *Coords  `json:"coords,omitempty"`
	Bouncer bool     `json:"bouncer,omitempty"`
}

type BMState struct {
	Connected  bool    `json:"connected"`
	Running    bool    `json:"running"`
	Status     string  `json:"status"`
	Event      string  `json:"event"`
	NumThrows  int     `json:"numThrows"`
	Throws     []Throw `json:"throws"`
}

type BMFrame struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

// --- Browser WebSocket events ---

type DartEvent struct {
	Type      string  `json:"type"`
	Index     int     `json:"index,omitempty"`
	Segment   string  `json:"segment,omitempty"`
	Score     int     `json:"score"`
	X         float64 `json:"x,omitempty"`
	Y         float64 `json:"y,omitempty"`
	HasCoords bool    `json:"hasCoords,omitempty"`
	Throws    []DartShape `json:"throws,omitempty"` // for resync
	Status    string  `json:"status,omitempty"`
	NumThrows int     `json:"numThrows,omitempty"`
}

type DartShape struct {
	Index     int     `json:"index"`
	Segment   string  `json:"segment"`
	Score     int     `json:"score"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	HasCoords bool    `json:"hasCoords"`
}

func score(t Throw) int {
	return t.Segment.Number * t.Segment.Multiplier
}

func toDartShape(i int, t Throw) DartShape {
	ds := DartShape{
		Index:   i,
		Segment: t.Segment.Name,
		Score:   score(t),
	}
	if t.Coords != nil {
		ds.X = t.Coords.X
		ds.Y = t.Coords.Y
		ds.HasCoords = true
	}
	return ds
}

// --- Browser hub ---

type Hub struct {
	mu      sync.Mutex
	clients map[chan []byte]struct{}
}

func newHub() *Hub { return &Hub{clients: make(map[chan []byte]struct{})} }

func (h *Hub) register(ch chan []byte) {
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) unregister(ch chan []byte) {
	h.mu.Lock()
	delete(h.clients, ch)
	h.mu.Unlock()
}

func (h *Hub) broadcast(ev any) {
	b, _ := json.Marshal(ev)
	h.mu.Lock()
	for ch := range h.clients {
		select {
		case ch <- b:
		default:
		}
	}
	h.mu.Unlock()
}

var hub = newHub()
var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	ch := make(chan []byte, 32)
	hub.register(ch)
	defer func() {
		hub.unregister(ch)
		conn.Close()
	}()
	for msg := range ch {
		if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}

// --- Board Manager connection + diff ---

func httpGet(path string) ([]byte, error) {
	base := strings.TrimRight(*boardBase, "/")
	resp, err := http.Get(base + path)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func diffAndBroadcast(prev, cur []Throw, afterReconnect bool) []Throw {
	if afterReconnect {
		shapes := make([]DartShape, len(cur))
		for i, t := range cur {
			shapes[i] = toDartShape(i, t)
		}
		hub.broadcast(DartEvent{Type: "resync", Throws: shapes})
		return cur
	}

	// Takeout: all darts removed
	if len(cur) == 0 && len(prev) > 0 {
		hub.broadcast(DartEvent{Type: "takeout"})
		return cur
	}

	// New darts
	if len(cur) > len(prev) {
		if len(prev) == 0 {
			hub.broadcast(DartEvent{Type: "visit_opened"})
		}
		for i := len(prev); i < len(cur); i++ {
			t := cur[i]
			ev := DartEvent{
				Type:    "dart",
				Index:   i,
				Segment: t.Segment.Name,
				Score:   score(t),
			}
			if t.Coords != nil {
				ev.X = t.Coords.X
				ev.Y = t.Coords.Y
				ev.HasCoords = true
			}
			hub.broadcast(ev)
		}
	}

	// Corrections (same index, segment changed)
	limit := len(prev)
	if len(cur) < limit {
		limit = len(cur)
	}
	for i := 0; i < limit; i++ {
		if cur[i].Segment.Name != prev[i].Segment.Name {
			t := cur[i]
			ev := DartEvent{
				Type:    "dart_corrected",
				Index:   i,
				Segment: t.Segment.Name,
				Score:   score(t),
			}
			if t.Coords != nil {
				ev.X = t.Coords.X
				ev.Y = t.Coords.Y
				ev.HasCoords = true
			}
			hub.broadcast(ev)
		}
	}

	return cur
}

func pollLoop() {
	for {
		time.Sleep(2 * time.Second)
		b, err := httpGet("/api/state")
		if err != nil {
			continue
		}
		var state BMState
		if err := json.Unmarshal(b, &state); err != nil {
			continue
		}
		hub.broadcast(DartEvent{Type: "status", Status: state.Status, NumThrows: state.NumThrows})
	}
}

func boardLoop() {
	base := strings.TrimRight(*boardBase, "/")
	wsURL := strings.Replace(base, "http://", "ws://", 1) + "/api/events"

	var prev []Throw
	first := true

	for {
		log.Printf("connecting to %s …", wsURL)
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			log.Printf("connect failed: %v — retry in 2 s", err)
			hub.broadcast(DartEvent{Type: "status", Status: "disconnected"})
			time.Sleep(2 * time.Second)
			continue
		}
		log.Printf("connected")
		hub.broadcast(DartEvent{Type: "status", Status: "connected"})

		afterReconnect := !first
		first = false

		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				log.Printf("disconnected: %v", err)
				hub.broadcast(DartEvent{Type: "status", Status: "disconnected"})
				conn.Close()
				break
			}

			var frame BMFrame
			if err := json.Unmarshal(msg, &frame); err != nil || frame.Type != "state" {
				continue
			}

			var state BMState
			if err := json.Unmarshal(frame.Data, &state); err != nil {
				continue
			}

			hub.broadcast(DartEvent{Type: "status", Status: state.Status, NumThrows: state.NumThrows})
			prev = diffAndBroadcast(prev, state.Throws, afterReconnect)
			afterReconnect = false
		}

		time.Sleep(time.Second)
	}
}

func openBrowser(url string) {
	var cmd string
	switch runtime.GOOS {
	case "linux":
		cmd = "xdg-open"
	case "darwin":
		cmd = "open"
	default:
		return
	}
	exec.Command(cmd, url).Start()
}

// --- Bridge backend mode ---

// bridgeDart mirrors the adbridge/v1 Dart payload shape we need to read.
type bridgeDart struct {
	Segment struct {
		Name string `json:"name"`
	} `json:"segment"`
	Score  int     `json:"score"`
	Coords *Coords `json:"coords"`
}

func toDartShapeFromBridge(i int, t bridgeDart) DartShape {
	ds := DartShape{Index: i, Segment: t.Segment.Name, Score: t.Score}
	if t.Coords != nil {
		ds.X, ds.Y, ds.HasCoords = t.Coords.X, t.Coords.Y, true
	}
	return ds
}

func translateBridgeEvent(kind string, data json.RawMessage) {
	switch kind {
	case "bridge.hello":
		hub.broadcast(DartEvent{Type: "status", Status: "bridge connected"})
	case "bm.link":
		var d struct {
			Up bool `json:"up"`
		}
		json.Unmarshal(data, &d)
		if d.Up {
			hub.broadcast(DartEvent{Type: "status", Status: "connected"})
		} else {
			hub.broadcast(DartEvent{Type: "status", Status: "disconnected"})
		}
	case "board.status":
		var d struct {
			Status string `json:"status"`
		}
		json.Unmarshal(data, &d)
		hub.broadcast(DartEvent{Type: "status", Status: d.Status})
	case "board.resync":
		var d struct {
			Throws []bridgeDart `json:"throws"`
		}
		json.Unmarshal(data, &d)
		shapes := make([]DartShape, len(d.Throws))
		for i, t := range d.Throws {
			shapes[i] = toDartShapeFromBridge(i, t)
		}
		hub.broadcast(DartEvent{Type: "resync", Throws: shapes})
	case "visit.opened":
		hub.broadcast(DartEvent{Type: "visit_opened"})
	case "dart.detected":
		var d struct {
			Index int        `json:"index"`
			Dart  bridgeDart `json:"dart"`
		}
		json.Unmarshal(data, &d)
		ev := DartEvent{Type: "dart", Index: d.Index, Segment: d.Dart.Segment.Name, Score: d.Dart.Score}
		if d.Dart.Coords != nil {
			ev.X, ev.Y, ev.HasCoords = d.Dart.Coords.X, d.Dart.Coords.Y, true
		}
		hub.broadcast(ev)
	case "dart.corrected":
		var d struct {
			Index int        `json:"index"`
			Dart  bridgeDart `json:"dart"`
		}
		json.Unmarshal(data, &d)
		ev := DartEvent{Type: "dart_corrected", Index: d.Index, Segment: d.Dart.Segment.Name, Score: d.Dart.Score}
		if d.Dart.Coords != nil {
			ev.X, ev.Y, ev.HasCoords = d.Dart.Coords.X, d.Dart.Coords.Y, true
		}
		hub.broadcast(ev)
	case "takeout.finished", "visit.cleared":
		hub.broadcast(DartEvent{Type: "takeout"})
	}
}

// bridgeConnHandler accepts WS connections from the bridge binary, translates
// adbridge/v1 envelopes to DartEvents, and ACKs each seq so the bridge clears
// its outbox.
func bridgeConnHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	log.Println("bridge connected")

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Printf("bridge disconnected: %v", err)
			hub.broadcast(DartEvent{Type: "status", Status: "disconnected"})
			return
		}
		var env struct {
			Seq  uint64          `json:"seq"`
			Kind string          `json:"kind"`
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(msg, &env); err != nil {
			continue
		}
		if env.Seq > 0 {
			ack, _ := json.Marshal(map[string]uint64{"ack": env.Seq})
			conn.WriteMessage(websocket.TextMessage, ack)
		}
		translateBridgeEvent(env.Kind, env.Data)
	}
}

func main() {
	flag.Parse()

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(boardHTML)
	})
	http.HandleFunc("/ws", wsHandler)

	if *bridgeMode {
		http.HandleFunc("/bridge", bridgeConnHandler)
		log.Printf("bridge mode — run: bridge --backend-url ws://%s/bridge", *listenAddr)
	} else {
		go boardLoop()
		go pollLoop()
	}

	url := "http://" + *listenAddr
	log.Printf("dartcade visualiser — %s", url)
	go func() {
		time.Sleep(500 * time.Millisecond)
		openBrowser(url)
	}()

	log.Fatal(http.ListenAndServe(*listenAddr, nil))
}
