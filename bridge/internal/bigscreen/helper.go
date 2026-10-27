package bigscreen

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/url"
	"os"
	"sync"
	"time"

	"dartcade/bridge/internal/schema"
	"github.com/charmbracelet/log"
)

// ErrVersionMismatch is returned when the service is a different release than this helper. The
// OS (autostart at the next desktop login) then starts the helper again, from the new binary.
var ErrVersionMismatch = errors.New("bigscreen: helper and bridge are different versions")

type helper struct {
	launch  Launcher
	version string // this binary's release

	mu      sync.Mutex
	conn    net.Conn
	current *Running
	startup bool // the next status is the first of this process

	degraded string // a service version to serve despite the mismatch
	warned   bool
}

var retryDelay = 5 * time.Second

// RunHelperReexec is RunHelper that, on a version mismatch (the bridge updated), closes its window
// and calls reexec to become the new binary; if that fails, the error is returned and the
// next desktop login starts the helper.
func RunHelperReexec(ctx context.Context, addr string, launch Launcher, version string, reexec func() error) error {
	err := serveHelper(ctx, addr, launch, version, os.Getenv(ReexecEnv))
	var mm *mismatch
	if !errors.As(err, &mm) {
		return err
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(reexecDelay):
	}
	os.Setenv(ReexecEnv, mm.service) // read by the new process, see serveHelper's degraded
	return reexec()
}

// ReexecEnv carries the service version a re-executed helper was started for. If the new process
// meets the same version again, re-executing would not help (the binary it runs is not the
// service's): it stays and serves instead of looping.
const ReexecEnv = "DARTCADE_HELPER_REEXEC"

var reexecDelay = time.Second

type mismatch struct{ service string }

func (e *mismatch) Error() string { return ErrVersionMismatch.Error() + " (bridge " + e.service + ")" }
func (e *mismatch) Unwrap() error { return ErrVersionMismatch }

// RunHelper connects to the bridge service at addr (retrying every 5 s) and opens and closes the
// kiosk window on its command. It returns when ctx ends or the service is another release.
func RunHelper(ctx context.Context, addr string, launch Launcher, version string) error {
	return serveHelper(ctx, addr, launch, version, "")
}

// serveHelper: a mismatch with the service version named degraded is tolerated (and logged once).
func serveHelper(ctx context.Context, addr string, launch Launcher, version, degraded string) error {
	h := &helper{launch: launch, version: version, startup: true, degraded: degraded}
	for {
		err := h.session(ctx, addr)
		if errors.Is(err, ErrVersionMismatch) {
			// the window would outlive this helper, and the new one's launch could clash with its profile
			h.mu.Lock()
			h.stopLocked()
			h.mu.Unlock()
			return err
		}
		if ctx.Err() != nil {
			if err == nil {
				err = ctx.Err()
			}
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(retryDelay):
		}
	}
}

func (h *helper) session(ctx context.Context, addr string) error {
	var d net.Dialer
	c, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return err
	}
	defer c.Close()
	defer context.AfterFunc(ctx, func() { c.Close() })()
	// speak first: the service ignores a connection that doesn't say hello, so no status may go out before it
	if err := json.NewEncoder(c).Encode(wire{Hello: &hello{h.version}}); err != nil {
		return err
	}
	h.mu.Lock()
	h.conn = c
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		h.conn = nil
		h.mu.Unlock()
	}()
	dec := json.NewDecoder(c)
	for {
		var m wire
		if err := dec.Decode(&m); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
		switch {
		case m.Hello != nil:
			if m.Hello.Version != h.version {
				if m.Hello.Version != h.degraded {
					return &mismatch{m.Hello.Version}
				}
				if !h.warned {
					h.warned = true
					log.Warn("bigscreen: helper and bridge differ and re-executing did not help, serving anyway", "bridge", m.Hello.Version, "helper", h.version)
				}
			}
			h.report()
		case m.Cmd == "open":
			h.open(m.URL)
		case m.Cmd == "close":
			h.close()
		}
	}
}

// report sends the current state; the first one of the process carries startup.
func (h *helper) report() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.reportLocked()
}

func (h *helper) reportLocked() {
	if h.conn == nil {
		return
	}
	st := schema.BigScreenStatusData{Helper: true, Running: h.current != nil}
	if h.current != nil {
		st.Browser = &h.current.Browser
	}
	if h.startup {
		t := true
		st.Startup = &t
		h.startup = false
	}
	h.conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	json.NewEncoder(h.conn).Encode(wire{Status: &st})
}

// stopLocked ends the open window, if any, without reporting it.
func (h *helper) stopLocked() {
	if h.current != nil && h.current.Kill != nil {
		h.current.Kill()
	}
	h.current = nil
}

// validURL: only a web page may be opened, whatever the bridge (or something on loopback) sends.
func validURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func (h *helper) open(target string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if !validURL(target) {
		log.Warn("bigscreen: refusing to open a non-http(s) URL")
		h.reportLocked()
		return
	}
	h.stopLocked()
	r, err := h.launch.Launch(target)
	if err != nil {
		log.Warn("bigscreen: could not open the browser", "err", err)
		h.reportLocked()
		return
	}
	h.current = r
	h.reportLocked()
	if r.Done != nil {
		go func() {
			<-r.Done
			h.mu.Lock()
			defer h.mu.Unlock()
			if h.current == r { // not replaced or closed meanwhile
				h.current = nil
				h.reportLocked()
			}
		}()
	}
}

func (h *helper) close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.stopLocked()
	h.reportLocked()
}
