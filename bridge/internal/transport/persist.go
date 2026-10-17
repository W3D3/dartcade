package transport

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"slices"

	"github.com/charmbracelet/log"
)

// The outbox file keeps unacked game data (no telemetry) across a bridge restart, so darts
// thrown while the backend is down still arrive. A new boot replays them under their own
// boot_id and seq (the backend dedupes on bridge_id, boot_id, seq and names the boot in
// its acks).

// loadOutbox reads the entries an earlier boot left unacked; none when path is empty, the
// file is missing or it can't be read.
func loadOutbox(path string) []Envelope {
	if path == "" {
		return nil
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	var envs []Envelope
	if err == nil {
		err = json.Unmarshal(data, &envs)
	}
	if err != nil {
		log.Warn("could not read the outbox file, starting without it", "path", path, "err", err)
		return nil
	}
	if len(envs) > 0 {
		log.Info("replaying unacked events from before the restart", "count", len(envs))
	}
	return envs
}

// markDirty asks runPersist to write the outbox file. Never blocks.
func (t *Transport) markDirty() {
	select {
	case t.dirty <- struct{}{}:
	default:
	}
}

// runPersist writes the outbox file each time its game data changed, until ctx ends. One
// write covers every change since the last, so a burst of acks is a single write.
func (t *Transport) runPersist(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.dirty:
			if err := t.save(); err != nil {
				log.Warn("could not write the outbox file", "path", t.cfg.OutboxPath, "err", err)
			}
		}
	}
}

// save writes the unacked game data, earlier boots' first, to the outbox file: a synced
// temp file renamed over it, so a crash leaves the old file or the new one.
func (t *Transport) save() error {
	t.mu.Lock()
	envs := slices.Clone(t.replay)
	for _, e := range t.outbox {
		if !e.telemetry {
			envs = append(envs, e.env)
		}
	}
	t.mu.Unlock()
	// shortcut: past outboxMax entries the oldest are left out of the file (memory keeps them); raise it if longer outages matter
	if len(envs) > outboxMax {
		envs = envs[len(envs)-outboxMax:]
	}
	data, err := json.Marshal(envs)
	if err != nil {
		return err
	}
	dir := filepath.Dir(t.cfg.OutboxPath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".outbox-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), t.cfg.OutboxPath)
}
