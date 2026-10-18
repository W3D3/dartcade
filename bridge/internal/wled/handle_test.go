package wled

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestHandleDevicesThenApply(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	ctx := context.Background()
	m.Handle(ctx, fakeBrowser{}, "wled.devices", json.RawMessage(`{"devices":[{"id":"d1","mac":"aa","host":"`+f.host()+`","max_bri":255}]}`))
	m.Handle(ctx, fakeBrowser{}, "wled.apply", json.RawMessage(`{"device_id":"d1","state":{"on":true}}`))
	recv(t, f)
}

func TestHandleIgnoresUnknownKindsAndBadData(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.Handle(context.Background(), fakeBrowser{}, "wled.devices", json.RawMessage(`{"devices":[{"id":"d1","mac":"aa","host":"`+f.host()+`","max_bri":255}]}`))
	m.Handle(context.Background(), fakeBrowser{}, "wled.selfdestruct", nil)
	m.Handle(context.Background(), fakeBrowser{}, "wled.apply", json.RawMessage(`{"device_id":"d1","state":`))
	none(t, f, 200*time.Millisecond)
}
