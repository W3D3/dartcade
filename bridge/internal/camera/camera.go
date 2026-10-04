// Package camera fetches straightened stills from Board Manager's cameras.
//
// Board Manager's GET /api/img/cams/{i}?warp=true returns a square top-down JPEG in
// dartcade's board coordinates: the bull at the centre, the outer double wire (r = 1) at a
// third of the width, the image edge at r = 1.5, 20 at the top. The bridge fetches one per
// camera after each dart, correction, takeout and resync and sends it to the backend, which
// shows it under the match screen's board. Design: docs/superpowers/specs/2026-10-04-camera-view-design.md
package camera

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/log"
)

const (
	// MaxCameras is how many cameras a board can have (Cam 1–3).
	MaxCameras = 3
	// MaxBytes is the largest still the bridge sends (the backend drops bigger ones too).
	MaxBytes = 1 << 20
	// Size is the width and height of the stills, in pixels (about 30–50 KB each).
	Size = 600
	// DefaultTimeout bounds one fetch; Board Manager answers in about 200 ms on the LAN.
	DefaultTimeout = 3 * time.Second
)

// Still is one camera's JPEG.
type Still struct {
	Cam int
	// Round is the Trigger the still was fetched for: stills of one round show the same darts
	Round      uint64
	CapturedAt time.Time
	JPEG       []byte
}

// Triggers reports whether a bridge event changes what the cameras see enough to send new stills.
func Triggers(kind string) bool {
	switch kind {
	case "dart.detected", "dart.corrected", "takeout.finished", "board.resync":
		return true
	}
	return false
}

// Fetcher fetches stills on Trigger, at most one per camera at a time: a trigger while a
// camera's fetch runs queues one more fetch after it (newer triggers join that one).
type Fetcher struct {
	// Timeout bounds each fetch (DefaultTimeout).
	Timeout time.Duration

	baseURL string
	count   func() int
	sink    func(Still)
	client  *http.Client

	mu    sync.Mutex
	cams  [MaxCameras]state
	round uint64
}

type state struct{ running, pending bool }

// New makes a Fetcher for the Board Manager at baseURL. count returns how many cameras it
// reports (cameras beyond are skipped); sink receives every still fetched.
func New(baseURL string, count func() int, sink func(Still)) *Fetcher {
	return &Fetcher{
		Timeout: DefaultTimeout,
		baseURL: strings.TrimRight(baseURL, "/"),
		count:   count,
		sink:    sink,
		client:  &http.Client{},
	}
}

// Trigger fetches a new still from every camera, in the background.
func (f *Fetcher) Trigger(ctx context.Context) {
	f.mu.Lock()
	f.round++
	f.mu.Unlock()
	n := min(f.count(), MaxCameras)
	for i := 0; i < n; i++ {
		f.kick(ctx, i)
	}
}

func (f *Fetcher) kick(ctx context.Context, cam int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.cams[cam].running {
		f.cams[cam].pending = true
		return
	}
	f.cams[cam].running = true
	go f.run(ctx, cam)
}

func (f *Fetcher) run(ctx context.Context, cam int) {
	for {
		// A fetch that starts now shows the newest trigger's board
		f.mu.Lock()
		round := f.round
		f.mu.Unlock()
		if st, err := f.fetch(ctx, cam, round); err != nil {
			log.Debug("camera still not fetched", "cam", cam, "err", err)
		} else {
			f.sink(st)
		}
		f.mu.Lock()
		if !f.cams[cam].pending || ctx.Err() != nil {
			f.cams[cam] = state{}
			f.mu.Unlock()
			return
		}
		f.cams[cam].pending = false
		f.mu.Unlock()
	}
}

func (f *Fetcher) fetch(ctx context.Context, cam int, round uint64) (Still, error) {
	ctx, cancel := context.WithTimeout(ctx, f.Timeout)
	defer cancel()
	url := fmt.Sprintf("%s/api/img/cams/%d?warp=true&width=%d&height=%d", f.baseURL, cam, Size, Size)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Still{}, err
	}
	resp, err := f.client.Do(req)
	if err != nil {
		return Still{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Still{}, fmt.Errorf("Board Manager answered %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "image/jpeg") {
		return Still{}, fmt.Errorf("not a JPEG: %q", ct)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, MaxBytes+1))
	if err != nil {
		return Still{}, err
	}
	if len(body) > MaxBytes {
		return Still{}, fmt.Errorf("still over %d bytes", MaxBytes)
	}
	return Still{Cam: cam, Round: round, CapturedAt: time.Now().UTC(), JPEG: body}, nil
}
