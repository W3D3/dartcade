package update

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"time"

	"dartcade/bridge/internal/schema"
	"github.com/charmbracelet/log"
)

// EnvVar is set by the service the bridge's install command registers (service.go): only such
// a bridge can update itself (bridge.hello's updatable).
const EnvVar = "DARTCADE_SELF_UPDATE"

// Updater runs the backend's bridge.update messages for a running bridge.
type Updater struct {
	StateDir string
	// Current is the running bridge's release
	Current Tag
	// Executable is the running binary, which Apply replaces in the bridge itself. Empty on
	// Linux: there the unit's ExecStopPost applies the update, as root, once Restart ended the bridge
	Executable string
	// Send queues a message to the backend
	Send func(any)
	// Restart ends the bridge so its service manager starts it again (on the new binary)
	Restart func()
	// Unavailable, when set, is why this bridge can't update itself; a bridge.update fails with it
	Unavailable string
	busy        atomic.Bool
}

// Handle runs a bridge.update in the background; it never blocks. A second one while an update
// runs is dropped.
func (u *Updater) Handle(ctx context.Context, data json.RawMessage) {
	var d schema.BridgeUpdateData
	if err := json.Unmarshal(data, &d); err != nil {
		log.Warn("update: malformed bridge.update, dropped", "err", err)
		return
	}
	if u.Unavailable != "" {
		u.status(d.Version, schema.BridgeUpdateStatusDataPhaseFailed, &u.Unavailable)
		return
	}
	if _, ok := ParseTag(d.Version); !ok {
		msg := "not a release version"
		u.status(d.Version, schema.BridgeUpdateStatusDataPhaseFailed, &msg)
		return
	}
	if !u.busy.CompareAndSwap(false, true) {
		return
	}
	go func() {
		defer u.busy.Store(false)
		if err := u.run(ctx, d.Version); err != nil {
			log.Error("update failed, this bridge keeps running", "version", d.Version, "err", err)
			msg := err.Error()
			u.status(d.Version, schema.BridgeUpdateStatusDataPhaseFailed, &msg)
		}
	}()
}

func (u *Updater) run(ctx context.Context, version string) error {
	tag, _ := ParseTag(version) // Handle checked it
	log.Info("updating the bridge", "from", u.Current, "to", tag)
	dir := Dir(u.StateDir)
	if err := Stage(ctx, dir, u.Current, tag, func(p Phase) { u.status(version, schema.BridgeUpdateStatusDataPhase(p), nil) }); err != nil {
		return err
	}
	if u.Executable != "" {
		u.status(version, schema.BridgeUpdateStatusDataPhaseInstalling, nil)
		if err := Apply(dir, u.Executable, u.Current); err != nil {
			return err
		}
	}
	u.status(version, schema.BridgeUpdateStatusDataPhaseRestarting, nil)
	// shortcut: a second for the send loop to flush the status; the backend also learns of the restart from the next hello
	time.Sleep(time.Second)
	log.Info("restarting into the new bridge", "version", tag)
	u.Restart()
	return nil
}

func (u *Updater) status(version string, phase schema.BridgeUpdateStatusDataPhase, errMsg *string) {
	u.Send(map[string]any{
		"kind": "bridge.update.status",
		"data": schema.BridgeUpdateStatusData{Version: version, Phase: phase, Error: errMsg},
	})
}
