// Package bigscreen opens the Big screen page in a kiosk browser on the board's display. The
// bridge service (often a system service with no desktop) forwards the backend's
// bigscreen.open/close to a helper that runs in the desktop user's session (RunHelper), over a
// loopback TCP socket of JSON lines.
package bigscreen

import (
	"context"
	"encoding/json"
	"net"
	"sync"
	"time"

	"dartcade/bridge/internal/schema"
	"github.com/charmbracelet/log"
)

// DefaultAddr is where the service listens for the helper.
const DefaultAddr = "127.0.0.1:47817"

// helloTimeout is how long a new connection gets to say hello.
const helloTimeout = 5 * time.Second

// wire is one JSON line between the service and the helper, in either direction. The helper
// speaks first (Hello): the service ignores a connection that doesn't, so a stray local client
// (a browser's fetch, any process) never takes the helper's slot. The service answers with its
// own Hello (its release, which the helper compares: ErrVersionMismatch).
type wire struct {
	Hello  *hello                      `json:"hello,omitempty"`
	Status *schema.BigScreenStatusData `json:"status,omitempty"`
	Cmd    string                      `json:"cmd,omitempty"` // "open" | "close"
	URL    string                      `json:"url,omitempty"`
}

type hello struct {
	Version string `json:"version"`
}

// Service is the bridge side: it takes the helper's connection and forwards the backend's commands.
type Service struct {
	// Addr is the listen address
	Addr string
	// Version is this binary's release, sent to the helper
	Version string
	// Send queues a message to the backend; false when it was dropped (the backend is unreachable)
	Send func(kind string, data any) bool

	mu     sync.Mutex
	helper net.Conn
	last   *schema.BigScreenStatusData // the helper's last status, resent when the bridge reconnects; nil: no helper
}

var absent = schema.BigScreenStatusData{}

// Run listens for the helper until ctx ends.
func (s *Service) Run(ctx context.Context) error {
	// shortcut: unauthenticated loopback, any local process may drive the screen; upgrade with a shared secret if that matters
	ln, err := net.Listen("tcp", s.Addr)
	if err != nil {
		return err
	}
	go func() { <-ctx.Done(); ln.Close() }()
	s.Serve(ln)
	return nil
}

// Serve accepts helpers on ln until it closes.
func (s *Service) Serve(ln net.Listener) {
	for {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		go s.serve(c)
	}
}

func (s *Service) serve(c net.Conn) {
	defer c.Close()
	dec := json.NewDecoder(c)
	var first wire
	c.SetReadDeadline(time.Now().Add(helloTimeout))
	if err := dec.Decode(&first); err != nil || first.Hello == nil {
		log.Debug("bigscreen: not a helper, ignored", "err", err)
		return
	}
	c.SetReadDeadline(time.Time{})
	if err := json.NewEncoder(c).Encode(wire{Hello: &hello{s.Version}}); err != nil {
		return
	}
	s.mu.Lock()
	old := s.helper
	s.helper = c
	s.mu.Unlock()
	if old != nil {
		log.Info("bigscreen: a new helper replaces the connected one")
		old.Close() // one helper at a time; its own serve then leaves without reporting it absent
	}
	for {
		var m wire
		if err := dec.Decode(&m); err != nil {
			break
		}
		if m.Status == nil {
			continue
		}
		s.mu.Lock()
		if s.helper != c { // replaced meanwhile: its status would reorder after the new helper's
			s.mu.Unlock()
			return
		}
		s.last = m.Status
		s.mu.Unlock()
		s.report(m.Status)
	}
	s.mu.Lock()
	mine := s.helper == c
	if mine {
		s.helper, s.last = nil, nil
	}
	s.mu.Unlock()
	if mine {
		s.Send("bigscreen.status", absent)
	}
}

// report sends st to the backend. Once it got there, startup is forgotten (if st is still the
// remembered status): it is a one-time fact, but one that must survive until then (a helper
// starts at boot, often before the bridge is connected).
func (s *Service) report(st *schema.BigScreenStatusData) {
	s.mu.Lock()
	cp := *st
	s.mu.Unlock()
	if s.Send("bigscreen.status", cp) {
		s.mu.Lock()
		if s.last == st {
			st.Startup = nil
		}
		s.mu.Unlock()
	}
}

// Announce tells the backend what is known, on every (re)connect: the helper's last status, or
// that there is none (it can't tell "unknown" from "absent" otherwise).
func (s *Service) Announce() {
	s.mu.Lock()
	st := s.last
	s.mu.Unlock()
	if st == nil {
		s.Send("bigscreen.status", absent)
		return
	}
	s.report(st)
}

// Handle forwards bigscreen.open and bigscreen.close to the helper; false for any other kind.
func (s *Service) Handle(kind string, data json.RawMessage) bool {
	var cmd wire
	switch kind {
	case "bigscreen.open":
		var d schema.BigScreenOpenData
		if err := json.Unmarshal(data, &d); err != nil {
			log.Warn("bigscreen: malformed bigscreen.open, dropped", "err", err)
			return true
		}
		cmd = wire{Cmd: "open", URL: d.Url}
	case "bigscreen.close":
		cmd = wire{Cmd: "close"}
	default:
		return false
	}
	s.mu.Lock()
	c := s.helper
	s.mu.Unlock()
	if c != nil {
		c.SetWriteDeadline(time.Now().Add(2 * time.Second))
		if err := json.NewEncoder(c).Encode(cmd); err == nil {
			return true
		}
		// a failed or partial write could corrupt the line stream: drop the connection
		s.mu.Lock()
		if s.helper == c {
			s.helper, s.last = nil, nil
		}
		s.mu.Unlock()
		c.Close()
	}
	s.Send("bigscreen.status", absent)
	return true
}
