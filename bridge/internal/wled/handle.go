package wled

import (
	"context"
	"encoding/json"
	"time"

	"dartcade/bridge/internal/schema"
	"github.com/charmbracelet/log"
)

// Handle runs one backend message. It never blocks: network work runs in goroutines.
func (m *Manager) Handle(ctx context.Context, b Browser, kind string, data json.RawMessage) {
	switch kind {
	case "wled.devices":
		var d schema.WledDevicesData
		if err := json.Unmarshal(data, &d); err != nil {
			log.Debug("wled: malformed message, dropped", "kind", kind, "err", err)
			return
		}
		ds := make([]Device, 0, len(d.Devices))
		for _, x := range d.Devices {
			ds = append(ds, Device{ID: x.Id, Mac: x.Mac, Host: x.Host, MaxBri: x.MaxBri})
		}
		m.SetDevices(ds)
	case "wled.apply":
		var d schema.WledApplyData
		if err := json.Unmarshal(data, &d); err != nil {
			log.Debug("wled: malformed message, dropped", "kind", kind, "err", err)
			return
		}
		state, err := json.Marshal(d.State)
		if err != nil {
			log.Debug("wled: malformed message, dropped", "kind", kind, "err", err)
			return
		}
		hold := 0
		if d.HoldMs != nil {
			hold = *d.HoldMs
		}
		m.Apply(d.DeviceId, state, hold)
	case "wled.scan":
		go m.Scan(ctx, b)
	case "wled.probe":
		var d schema.WledProbeData
		if err := json.Unmarshal(data, &d); err != nil {
			log.Debug("wled: malformed message, dropped", "kind", kind, "err", err)
			return
		}
		go m.Probe(ctx, d.Host)
	case "wled.blink":
		var d schema.WledBlinkData
		if err := json.Unmarshal(data, &d); err != nil {
			log.Debug("wled: malformed message, dropped", "kind", kind, "err", err)
			return
		}
		go m.Blink(ctx, d.Host)
	default:
		log.Debug("wled: unknown message kind", "kind", kind)
	}
}

// Every scans now and then every d until ctx ends.
func (m *Manager) Every(ctx context.Context, b Browser, d time.Duration) {
	t := time.NewTicker(d)
	defer t.Stop()
	for {
		m.Scan(ctx, b)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
