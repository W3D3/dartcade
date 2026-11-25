package wled

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"dartcade/bridge/internal/schema"
	"github.com/charmbracelet/log"
)

// The most names a list keeps, and the longest name: WLED has a few hundred effects at most.
const (
	maxNames   = 512
	maxNameLen = 64
)

// names is what one device reported, for the WLED version it ran.
type names struct {
	version           string
	effects, palettes []string
}

// GetNames reads a JSON list of names: /json/eff (effects) or /json/pal (palettes), by WLED id.
func GetNames(ctx context.Context, hc *http.Client, host, path string) ([]string, error) {
	b, err := get(ctx, hc, host, path)
	if err != nil {
		return nil, err
	}
	var list []string
	if err := json.Unmarshal(b, &list); err != nil {
		return nil, err
	}
	if len(list) > maxNames {
		list = list[:maxNames]
	}
	for i, n := range list {
		if r := []rune(n); len(r) > maxNameLen {
			list[i] = string(r[:maxNameLen])
		}
	}
	return list, nil
}

// reportEffects reports the device's effect and palette names (wled.effects), read once per MAC
// and WLED version and kept: the backend asks again on every wled.devices, after a restart too.
func (m *Manager) reportEffects(ctx context.Context, d Device) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	info, err := GetInfo(ctx, m.hc, d.Host)
	if err != nil || info.Mac != d.Mac {
		log.Debug("wled: no effect list", "device", d.ID, "err", err)
		return
	}
	m.namesMu.Lock()
	n, ok := m.names[d.Mac]
	m.namesMu.Unlock()
	if !ok || n.version != info.Version {
		effects, err := GetNames(ctx, m.hc, d.Host, "/json/eff")
		if err != nil {
			log.Debug("wled: no effect list", "device", d.ID, "err", err)
			return
		}
		palettes, err := GetNames(ctx, m.hc, d.Host, "/json/pal")
		if err != nil {
			log.Debug("wled: no palette list", "device", d.ID, "err", err)
			return
		}
		n = names{version: info.Version, effects: effects, palettes: palettes}
		m.namesMu.Lock()
		m.names[d.Mac] = n
		m.namesMu.Unlock()
	}
	m.report(map[string]any{"kind": "wled.effects", "data": schema.WledEffectsData{
		DeviceId: d.ID, Version: n.version, Effects: n.effects, Palettes: n.palettes,
	}})
}
