package wled

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/charmbracelet/log"
	"github.com/grandcat/zeroconf"
)

type Browser interface {
	Browse(ctx context.Context) ([]string, error)
}

type zcBrowser struct{}

func ZeroconfBrowser() Browser { return zcBrowser{} }

// Browse lists the hosts advertising _wled._tcp, for 3 s.
func (zcBrowser) Browse(ctx context.Context) ([]string, error) {
	r, err := zeroconf.NewResolver(nil)
	if err != nil {
		return nil, err
	}
	entries := make(chan *zeroconf.ServiceEntry)
	var hosts []string
	done := make(chan struct{})
	go func() {
		for e := range entries {
			for _, ip := range e.AddrIPv4 {
				hosts = append(hosts, net.JoinHostPort(ip.String(), strconv.Itoa(e.Port)))
			}
		}
		close(done)
	}()
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if err := r.Browse(ctx, "_wled._tcp", "local.", entries); err != nil {
		return nil, err
	}
	<-ctx.Done()
	<-done
	return hosts, nil
}

type found struct {
	Mac      string `json:"mac"`
	Host     string `json:"host"`
	Name     string `json:"name"`
	Leds     int    `json:"leds"`
	Version  string `json:"version"`
	Segments int    `json:"segments"`
}

func (m *Manager) describe(ctx context.Context, host string) (found, error) {
	if !LocalHost(host) {
		return found{}, fmt.Errorf("%s is not on the local network", host)
	}
	info, err := GetInfo(ctx, m.hc, host)
	if err != nil {
		return found{}, err
	}
	_, segs, err := GetState(ctx, m.hc, host)
	if err != nil {
		return found{}, err
	}
	// Port 80 is WLED's default: keep stored hosts short
	if h, p, err := net.SplitHostPort(host); err == nil && p == "80" {
		host = h
	}
	return found{Mac: info.Mac, Host: host, Name: info.Name, Leds: info.Leds, Version: info.Version, Segments: segs}, nil
}

// Scan browses mDNS, describes every WLED that answers, moves paired devices to their current
// host, and reports the list.
func (m *Manager) Scan(ctx context.Context, b Browser) {
	hosts, browseErr := b.Browse(ctx)
	if browseErr != nil {
		log.Warn("wled: mdns browse failed", "err", browseErr)
	}
	var mu sync.Mutex
	var wg sync.WaitGroup
	devs := []found{}
	seen := map[string]bool{}
	for _, h := range hosts {
		wg.Add(1)
		go func(h string) {
			defer wg.Done()
			d, err := m.describe(ctx, h)
			if err != nil {
				return
			}
			mu.Lock()
			defer mu.Unlock()
			if !seen[d.Mac] {
				seen[d.Mac] = true
				devs = append(devs, d)
			}
		}(h)
	}
	wg.Wait()
	for _, d := range devs {
		m.Rehost(d.Mac, d.Host)
	}
	data := map[string]any{"devices": devs, "scanned_at": time.Now().UTC()}
	if browseErr != nil {
		data["scan_error"] = browseErr.Error()
	}
	m.report(map[string]any{"kind": "wled.found", "data": data})
}

func (m *Manager) Probe(ctx context.Context, host string) {
	data := map[string]any{"devices": []found{}, "scanned_at": time.Now().UTC(), "probe_host": host}
	if d, err := m.describe(ctx, host); err != nil {
		data["probe_error"] = err.Error()
	} else {
		data["devices"] = []found{d}
	}
	m.report(map[string]any{"kind": "wled.found", "data": data})
}

// blinkState is the pairing check: lime, blinking, half brightness on every segment.
var blinkState = json.RawMessage(`{"on":true,"bri":128,"seg":{"col":[[198,242,78]],"fx":1,"sx":200}}`)

// pairedMaxBri returns the MaxBri of the paired device whose worker is bound to host, if any.
func (m *Manager) pairedMaxBri(host string) (int, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, w := range m.workers {
		w.mu.Lock()
		h, max := w.dev.Host, w.dev.MaxBri
		w.mu.Unlock()
		if h == host {
			return max, true
		}
	}
	return 0, false
}

// Blink plays the pairing check on a local host, then puts back what it showed before. A paired
// device is capped at its own max_bri, like any other state sent to it; an unpaired device (still
// being set up) blinks at bri 128.
func (m *Manager) Blink(ctx context.Context, host string) {
	if !LocalHost(host) {
		log.Debug("wled: blink refused a non-local host", "host", host)
		return
	}
	prior, _, err := GetState(ctx, m.hc, host)
	if err != nil {
		log.Debug("wled: blink couldn't read the prior state", "host", host, "err", err)
		return
	}
	state := blinkState
	if maxBri, ok := m.pairedMaxBri(host); ok {
		clamped, err := ClampBri(blinkState, min(128, maxBri))
		if err != nil {
			log.Debug("wled: blink couldn't clamp brightness", "host", host, "err", err)
		} else {
			state = clamped
		}
	}
	if err := PostState(ctx, m.hc, host, state); err != nil {
		log.Debug("wled: blink post failed", "host", host, "err", err)
		return
	}
	time.Sleep(m.blinkFor)
	if err := PostState(context.Background(), m.hc, host, prior); err != nil {
		log.Debug("wled: blink restore failed", "host", host, "err", err)
	}
}
