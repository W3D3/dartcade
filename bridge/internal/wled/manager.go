package wled

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/charmbracelet/log"
)

type Device struct {
	ID, Mac, Host string
	MaxBri        int
}

// Report sends a telemetry message ({"kind", "data"}) to the backend; it must not block.
type Report func(msg any)

type Manager struct {
	hc     *http.Client
	report Report
	minGap time.Duration

	mu      sync.Mutex
	workers map[string]*worker // by device id
}

func New(report Report) *Manager {
	return &Manager{hc: NewHTTPClient(), report: report, minGap: 100 * time.Millisecond, workers: map[string]*worker{}}
}

// SetDevices replaces the allowlist: workers for devices no longer listed stop.
func (m *Manager) SetDevices(ds []Device) {
	m.mu.Lock()
	defer m.mu.Unlock()
	keep := map[string]bool{}
	for _, d := range ds {
		keep[d.ID] = true
		if w, ok := m.workers[d.ID]; ok {
			w.update(d)
			continue
		}
		w := newWorker(m, d)
		m.workers[d.ID] = w
		go w.run()
	}
	for id, w := range m.workers {
		if !keep[id] {
			w.stop()
			delete(m.workers, id)
		}
	}
}

func (m *Manager) Apply(deviceID string, state json.RawMessage, holdMs int) {
	m.mu.Lock()
	w := m.workers[deviceID]
	m.mu.Unlock()
	if w == nil {
		log.Debug("wled: apply for an unpaired device, dropped", "device", deviceID)
		return
	}
	w.push(state, time.Duration(holdMs)*time.Millisecond)
}

// Rehost points the device with this MAC at a new host (mDNS found it there).
func (m *Manager) Rehost(mac, host string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, w := range m.workers {
		w.rehost(mac, host)
	}
}

func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, w := range m.workers {
		w.stop()
		delete(m.workers, id)
	}
}

type worker struct {
	m      *Manager
	wake   chan struct{}
	done   chan struct{}
	ctx    context.Context
	cancel context.CancelFunc

	mu         sync.Mutex
	dev        Device
	verified   bool // the host answered with dev.Mac since the last error
	reachable  *bool
	scene      json.RawMessage // pending scene
	flash      json.RawMessage // pending flash
	hold       time.Duration
	base       json.RawMessage // the scene a flash returns to
	flashUntil time.Time
	lastSend   time.Time
}

func newWorker(m *Manager, d Device) *worker {
	ctx, cancel := context.WithCancel(context.Background())
	return &worker{m: m, dev: d, wake: make(chan struct{}, 1), done: make(chan struct{}), ctx: ctx, cancel: cancel}
}

func (w *worker) poke() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

func (w *worker) update(d Device) {
	w.mu.Lock()
	if d.Host != w.dev.Host || d.Mac != w.dev.Mac {
		w.verified = false
	}
	w.dev = d
	w.mu.Unlock()
}

func (w *worker) rehost(mac, host string) {
	w.mu.Lock()
	if w.dev.Mac == mac && w.dev.Host != host {
		w.dev.Host = host
		w.verified = false
	}
	w.mu.Unlock()
	w.poke()
}

// stop cancels any in-flight or future HTTP call and tells run to exit.
func (w *worker) stop() {
	w.cancel()
	close(w.done)
}

// push queues a scene (hold 0) or a flash; a newer one of the same type replaces the pending one.
func (w *worker) push(state json.RawMessage, hold time.Duration) {
	w.mu.Lock()
	if hold > 0 {
		w.flash, w.hold = state, hold
	} else {
		w.scene = state
	}
	w.mu.Unlock()
	w.poke()
}

func (w *worker) run() {
	timer := time.NewTimer(time.Hour)
	defer timer.Stop()
	for {
		select {
		case <-w.done:
			return
		case <-w.wake:
		case <-timer.C:
		}
		select {
		case <-w.done:
			return
		default:
		}
		next := w.step()
		if next > 0 {
			timer.Reset(next)
		}
	}
}

// step sends at most one request and returns how long to wait before the next step (0: until woken).
func (w *worker) step() time.Duration {
	w.mu.Lock()
	now := time.Now()
	if gap := w.m.minGap - now.Sub(w.lastSend); gap > 0 {
		w.mu.Unlock()
		return gap
	}
	inFlash := now.Before(w.flashUntil)
	var body json.RawMessage
	var hold time.Duration
	switch {
	case w.flash != nil:
		body, hold = w.flash, w.hold
		w.flash = nil
	case w.scene != nil:
		w.base, w.scene = w.scene, nil
		if inFlash {
			left := w.flashUntil.Sub(now)
			w.mu.Unlock()
			return left
		}
		w.flashUntil = time.Time{} // a flash already ended; don't re-POST base for it later
		body = w.base
	case !w.flashUntil.IsZero() && !inFlash:
		w.flashUntil = time.Time{}
		body = w.base
	case inFlash:
		left := w.flashUntil.Sub(now)
		w.mu.Unlock()
		return left
	}
	dev := w.dev
	w.mu.Unlock()
	if body == nil {
		return 0
	}

	ctx, cancel := context.WithTimeout(w.ctx, 2*time.Second)
	defer cancel()
	if err := w.verify(ctx, dev); err != nil {
		log.Debug("wled: verify failed", "device", dev.ID, "err", err)
		w.setReachable(false, err.Error())
		return 0
	}
	if hold > 0 {
		w.mu.Lock()
		noBase := w.base == nil
		w.mu.Unlock()
		if noBase {
			// Nothing to return to yet: come back to what the strip showed before the flash
			if prior, _, err := GetState(ctx, w.m.hc, dev.Host); err == nil {
				w.mu.Lock()
				w.base = prior
				w.mu.Unlock()
			}
		}
	}
	clamped, err := ClampBri(body, dev.MaxBri)
	if err != nil {
		log.Warn("wled: bad state from the backend, dropped", "device", dev.ID, "err", err)
		return 0
	}
	err = PostState(ctx, w.m.hc, dev.Host, clamped)
	w.mu.Lock()
	w.lastSend = time.Now()
	if hold > 0 {
		w.flashUntil = w.lastSend.Add(hold)
	}
	if err != nil {
		w.verified = false
	}
	pendingFlashEnd := !w.flashUntil.IsZero()
	w.mu.Unlock()
	if err != nil {
		log.Debug("wled: post failed", "device", dev.ID, "err", err)
		w.setReachable(false, err.Error())
		return 0
	}
	w.setReachable(true, "")
	if hold > 0 {
		return hold
	}
	if pendingFlashEnd {
		return time.Until(w.flashUntil)
	}
	// Another push may have arrived while sending
	return w.m.minGap + time.Millisecond
}

func (w *worker) verify(ctx context.Context, dev Device) error {
	w.mu.Lock()
	ok := w.verified
	w.mu.Unlock()
	if ok {
		return nil
	}
	info, err := GetInfo(ctx, w.m.hc, dev.Host)
	if err != nil {
		return err
	}
	if info.Mac != dev.Mac {
		return errors.New("different device at host")
	}
	w.mu.Lock()
	w.verified = true
	w.mu.Unlock()
	return nil
}

func (w *worker) setReachable(up bool, errMsg string) {
	w.mu.Lock()
	changed := w.reachable == nil || *w.reachable != up
	w.reachable = &up
	id := w.dev.ID
	w.mu.Unlock()
	if !changed {
		return
	}
	data := map[string]any{"device_id": id, "reachable": up}
	if errMsg != "" {
		data["error"] = errMsg
	}
	w.m.report(map[string]any{"kind": "wled.status", "data": data})
}
