package camera

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/log"
)

const (
	// Rounds kept while waiting for their stills (older ones can't be the newest any more)
	keepRounds = 4
	// The calibration is re-read at least this often (and after a calibration event).
	calibrationMaxAge = 10 * time.Minute
	combinedQuality   = 85
)

// IsCalibration reports whether a Board Manager status or event text is about calibrating
// ("Calibrating", "Calibration started", "Calibration finished").
func IsCalibration(s string) bool { return strings.Contains(s, "Calibrat") }

// Compositor makes the combined still from each round of camera stills (one Fetcher trigger:
// the same darts in every picture), off the event path: one compose at a time, a newer round
// joins the pending one. Stills of different rounds are never blended.
type Compositor struct {
	// Debounce waits for the rest of a round after its first still.
	Debounce time.Duration

	baseURL string
	client  *http.Client
	send    func(Still)
	now     func() time.Time

	mu        sync.Mutex
	rounds    map[uint64]*[MaxCameras]*Still
	scheduled bool
	running   bool
	pending   bool
	stale     bool
	cal       *Calibration
	calAt     time.Time
	maps      *Maps
	mapsSize  int
}

// NewCompositor makes a Compositor reading the calibration from the Board Manager at baseURL
// and handing each combined still (camera CombinedCam) to send.
func NewCompositor(baseURL string, send func(Still)) *Compositor {
	return &Compositor{
		Debounce: 300 * time.Millisecond,
		baseURL:  strings.TrimRight(baseURL, "/"),
		client:   &http.Client{},
		send:     send,
		now:      time.Now,
	}
}

// CalibrationChanged makes the next compose re-read the calibration.
func (c *Compositor) CalibrationChanged() {
	c.mu.Lock()
	c.stale = true
	c.mu.Unlock()
}

// Add takes a camera still and schedules a compose.
func (c *Compositor) Add(ctx context.Context, st Still) {
	if st.Cam < 0 || st.Cam >= MaxCameras {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.rounds == nil {
		c.rounds = map[uint64]*[MaxCameras]*Still{}
	}
	r := c.rounds[st.Round]
	if r == nil {
		r = &[MaxCameras]*Still{}
		c.rounds[st.Round] = r
	}
	r[st.Cam] = &st
	for id := range c.rounds {
		if id+keepRounds < st.Round {
			delete(c.rounds, id)
		}
	}
	if c.running {
		c.pending = true
		return
	}
	if !c.scheduled {
		c.scheduled = true
		time.AfterFunc(c.Debounce, func() { c.run(ctx) })
	}
}

func (c *Compositor) run(ctx context.Context) {
	c.mu.Lock()
	c.scheduled, c.running = false, true
	c.mu.Unlock()
	for {
		if err := c.compose(ctx); err != nil {
			log.Debug("combined still not made", "err", err)
		}
		c.mu.Lock()
		if !c.pending || ctx.Err() != nil {
			c.running, c.pending = false, false
			c.mu.Unlock()
			return
		}
		c.pending = false
		c.mu.Unlock()
		// Let the rest of the newer round arrive
		time.Sleep(c.Debounce)
	}
}

func (c *Compositor) compose(ctx context.Context) error {
	round, ok := c.newestRound()
	if !ok {
		return nil
	}
	var newest time.Time
	for _, st := range round {
		if st != nil && st.CapturedAt.After(newest) {
			newest = st.CapturedAt
		}
	}
	var stills [MaxCameras]image.Image
	n := 0
	for i, st := range round {
		if st == nil {
			continue
		}
		img, err := jpeg.Decode(bytes.NewReader(st.JPEG))
		if err != nil {
			continue
		}
		stills[i] = img
		n++
	}
	if n < 2 {
		return nil
	}
	var size int
	for _, img := range stills {
		if img != nil {
			size = img.Bounds().Dx()
			break
		}
	}
	maps, err := c.weights(ctx, size)
	if err != nil {
		return err
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, Blend(maps, stills), &jpeg.Options{Quality: combinedQuality}); err != nil {
		return err
	}
	c.send(Still{Cam: CombinedCam, CapturedAt: newest, JPEG: buf.Bytes()})
	return nil
}

// newestRound is the newest round with stills from at least two cameras; older rounds are
// dropped (a newer one replaced them).
func (c *Compositor) newestRound() ([MaxCameras]*Still, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var best uint64
	found := false
	for id, r := range c.rounds {
		n := 0
		for _, st := range r {
			if st != nil {
				n++
			}
		}
		if n >= 2 && (!found || id > best) {
			best, found = id, true
		}
	}
	if !found {
		return [MaxCameras]*Still{}, false
	}
	for id := range c.rounds {
		if id < best {
			delete(c.rounds, id)
		}
	}
	return *c.rounds[best], true
}

// weights returns the weight maps for size×size stills, re-reading the calibration when it
// is missing, stale or old, and recomputing the maps when it or the size changed.
func (c *Compositor) weights(ctx context.Context, size int) (*Maps, error) {
	c.mu.Lock()
	refresh := c.cal == nil || c.stale || c.now().Sub(c.calAt) >= calibrationMaxAge
	cal, maps, mapsSize := c.cal, c.maps, c.mapsSize
	c.mu.Unlock()

	changed := false
	if refresh {
		fresh, err := c.readCalibration(ctx)
		switch {
		case err == nil:
			changed = cal == nil || *cal != fresh
			cal = &fresh
			c.mu.Lock()
			c.cal, c.calAt, c.stale = cal, c.now(), false
			c.mu.Unlock()
		case cal == nil:
			return nil, err
		default:
			log.Debug("calibration not re-read; keeping the last one", "err", err)
		}
	}
	if maps != nil && !changed && mapsSize == size {
		return maps, nil
	}
	maps = Weights(*cal, size)
	if maps == nil {
		return nil, fmt.Errorf("no camera sees the board")
	}
	c.mu.Lock()
	c.maps, c.mapsSize = maps, size
	c.mu.Unlock()
	return maps, nil
}

// readCalibration GETs /api/config and keeps only the calibration (ParseCalibration); the rest
// of the body (auth, …) is never kept, logged or sent.
func (c *Compositor) readCalibration(ctx context.Context) (Calibration, error) {
	ctx, cancel := context.WithTimeout(ctx, DefaultTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/config", nil)
	if err != nil {
		return Calibration{}, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return Calibration{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Calibration{}, fmt.Errorf("Board Manager answered %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, MaxBytes))
	if err != nil {
		return Calibration{}, err
	}
	return ParseCalibration(body)
}
