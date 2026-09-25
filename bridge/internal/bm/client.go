package bm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/charmbracelet/log"
	"github.com/coder/websocket"
)

// Client connects to Board Manager, emits BMFrames, and provides HTTP command methods.
type Client struct {
	boardURL  string
	boardID   atomic.Value // string
	bmVersion string
	frames    chan BMFrame
	startTime time.Time
}

// NewClient creates a new BM client for the given board URL.
func NewClient(boardURL string) *Client {
	return &Client{
		boardURL:  strings.TrimRight(boardURL, "/"),
		frames:    make(chan BMFrame, 64),
		startTime: time.Now(),
	}
}

// Frames returns the channel of BMFrames emitted by the client.
func (c *Client) Frames() <-chan BMFrame { return c.frames }

// BoardID returns the board_id from /api/config (empty until startup completes).
func (c *Client) BoardID() string { v, _ := c.boardID.Load().(string); return v }

// BMVersion returns the Board Manager version string.
func (c *Client) BMVersion() string { return c.bmVersion }

// Init fetches /api/version and /api/config synchronously so that BoardID
// and BMVersion are available before the transport is constructed.
// It is idempotent: a second call returns immediately if already initialised.
// Start calls Init internally, so callers that call Init first don't double-fetch.
func (c *Client) Init(ctx context.Context) error {
	if c.bmVersion != "" {
		return nil
	}
	if err := c.fetchVersion(ctx); err != nil {
		return fmt.Errorf("bm version: %w", err)
	}
	if err := c.fetchConfig(ctx); err != nil {
		return fmt.Errorf("bm config: %w", err)
	}
	return nil
}

// Start calls Init then runs the WS and poll loops. Blocks until ctx is cancelled.
func (c *Client) Start(ctx context.Context) error {
	if err := c.Init(ctx); err != nil {
		return err
	}
	go c.pollLoop(ctx)
	c.wsLoop(ctx)
	return nil
}

func (c *Client) fetchVersion(ctx context.Context) error {
	resp, err := httpGet(ctx, c.boardURL+"/api/version")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var v struct {
		Version string `json:"version"`
	}
	json.NewDecoder(resp.Body).Decode(&v)
	c.bmVersion = v.Version
	log.Info("BM version", "version", c.bmVersion)
	return nil
}

func (c *Client) fetchConfig(ctx context.Context) error {
	resp, err := httpGet(ctx, c.boardURL+"/api/config")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	redacted := redactSecrets(raw)

	var cfg struct {
		Auth struct {
			BoardID string `json:"board_id"`
		} `json:"auth"`
	}
	json.Unmarshal(raw, &cfg)

	prev, _ := c.boardID.Load().(string)
	if prev != "" && prev != cfg.Auth.BoardID {
		return fmt.Errorf("board_id changed from %s to %s — restart required", prev, cfg.Auth.BoardID)
	}
	c.boardID.Store(cfg.Auth.BoardID)

	c.emit(BMFrame{Kind: "startup_config", Data: redacted, RecvWall: time.Now(), RecvMonoNs: c.mono()})
	return nil
}

func (c *Client) wsLoop(ctx context.Context) {
	backoff := 500 * time.Millisecond
	var disconnectedAt time.Time
	first := true
	for {
		if ctx.Err() != nil {
			return
		}
		conn, _, err := websocket.Dial(ctx, c.boardURL+"/api/events", nil)
		if err != nil {
			log.Warn("BM WS connect failed", "err", err, "retry_in", backoff)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			backoff = jitter(minDur(backoff*2, 30*time.Second))
			continue
		}
		if first {
			c.emit(BMFrame{Kind: "bm_connect", RecvWall: time.Now(), RecvMonoNs: c.mono()})
			first = false
		} else {
			gapMs := time.Since(disconnectedAt).Milliseconds()
			c.emit(BMFrame{Kind: "bm_reconnect", GapMs: gapMs, RecvWall: time.Now(), RecvMonoNs: c.mono()})
		}
		stableAt := time.Now().Add(30 * time.Second)
		for {
			_, msg, err := conn.Read(ctx)
			if err != nil {
				log.Warn("BM WS read error", "err", err)
				break
			}
			if time.Now().After(stableAt) {
				backoff = 500 * time.Millisecond
			}
			c.emitRawWS(msg)
		}
		conn.Close(websocket.StatusNormalClosure, "")
		disconnectedAt = time.Now()
		c.emit(BMFrame{Kind: "bm_disconnect", RecvWall: time.Now(), RecvMonoNs: c.mono()})
		backoff = jitter(minDur(backoff*2, 30*time.Second))
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
	}
}

func (c *Client) emitRawWS(msg []byte) {
	var env struct {
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(msg, &env); err != nil {
		return
	}
	if env.Type == "auth" {
		c.emit(BMFrame{
			Kind:       "ws",
			BMType:     "auth",
			Data:       json.RawMessage(`"[REDACTED]"`),
			RecvWall:   time.Now(),
			RecvMonoNs: c.mono(),
		})
		return
	}
	c.emit(BMFrame{Kind: "ws", BMType: env.Type, Data: env.Data, RecvWall: time.Now(), RecvMonoNs: c.mono()})
}

func (c *Client) pollLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
		resp, err := httpGet(ctx, c.boardURL+"/api/state")
		if err != nil {
			log.Warn("BM poll failed", "err", err)
			continue
		}
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		c.emit(BMFrame{Kind: "poll", BMType: "state", Data: raw, RecvWall: time.Now(), RecvMonoNs: c.mono()})
	}
}

// Reset calls POST /api/reset on the board.
func (c *Client) Reset(ctx context.Context) (int, error) {
	resp, err := http.Post(c.boardURL+"/api/reset", "application/json", nil)
	if err != nil {
		return 0, err
	}
	resp.Body.Close()
	return resp.StatusCode, nil
}

// StartDetection calls PUT /api/start (with fallback to /api/detection/start).
func (c *Client) StartDetection(ctx context.Context) (int, error) {
	return c.putWithFallback(ctx, "/api/start", "/api/detection/start")
}

// StopDetection calls PUT /api/stop (with fallback to /api/detection/stop).
func (c *Client) StopDetection(ctx context.Context) (int, error) {
	return c.putWithFallback(ctx, "/api/stop", "/api/detection/stop")
}

func (c *Client) putWithFallback(ctx context.Context, path, fallback string) (int, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodPut, c.boardURL+path, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	resp.Body.Close()
	if resp.StatusCode == 404 || resp.StatusCode == 405 {
		req2, _ := http.NewRequestWithContext(ctx, http.MethodPut, c.boardURL+fallback, nil)
		resp2, err := http.DefaultClient.Do(req2)
		if err != nil {
			return 0, err
		}
		resp2.Body.Close()
		return resp2.StatusCode, nil
	}
	return resp.StatusCode, nil
}

func (c *Client) emit(f BMFrame) {
	select {
	case c.frames <- f:
	default:
		log.Warn("BM frame channel full, dropping", "kind", f.Kind)
	}
}

func (c *Client) mono() int64 { return time.Since(c.startTime).Nanoseconds() }

func httpGet(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	return http.DefaultClient.Do(req)
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

// redactSecrets replaces values of sensitive keys at any depth in a JSON object.
func redactSecrets(data []byte) json.RawMessage {
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		return data
	}
	redactAny(v)
	out, _ := json.Marshal(v)
	return out
}

var secretKeys = map[string]bool{
	"api_key": true, "apikey": true, "api-key": true, "token": true,
}

func redactAny(v any) {
	switch m := v.(type) {
	case map[string]any:
		for k, val := range m {
			if secretKeys[strings.ToLower(k)] {
				m[k] = "[REDACTED]"
			} else {
				redactAny(val)
			}
		}
	case []any:
		for _, elem := range m {
			redactAny(elem)
		}
	}
}
