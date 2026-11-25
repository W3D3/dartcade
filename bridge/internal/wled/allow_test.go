package wled

import (
	"encoding/json"
	"os"
	"reflect"
	"sort"
	"testing"
)

func TestAllowlistMatchesTheBackend(t *testing.T) {
	b, err := os.ReadFile("../../../schema/wled-state-allowlist.json")
	if err != nil {
		t.Fatal(err)
	}
	var file struct{ State, Seg []string }
	if err := json.Unmarshal(b, &file); err != nil {
		t.Fatal(err)
	}
	keys := func(m map[string]bool) []string {
		out := make([]string, 0, len(m))
		for k := range m {
			out = append(out, k)
		}
		sort.Strings(out)
		return out
	}
	sort.Strings(file.State)
	sort.Strings(file.Seg)
	if got := keys(allowedState); !reflect.DeepEqual(got, file.State) {
		t.Errorf("state keys %v, the list has %v", got, file.State)
	}
	if got := keys(allowedSeg); !reflect.DeepEqual(got, file.Seg) {
		t.Errorf("segment keys %v, the list has %v", got, file.Seg)
	}
}

func TestAllowedDropsWhatALightMayNotSet(t *testing.T) {
	in := `{"on":true,"bri":90,"psave":3,"rb":true,"udpn":{"send":true},"seg":[{"id":0,"fx":42,"col":[[255,0,0]],"nonsense":1},{"stop":0}]}`
	out, err := Allowed(json.RawMessage(in))
	if err != nil {
		t.Fatal(err)
	}
	var got, want map[string]any
	json.Unmarshal(out, &got)
	json.Unmarshal([]byte(`{"on":true,"bri":90,"seg":[{"id":0,"fx":42,"col":[[255,0,0]]},{"stop":0}]}`), &want)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Allowed = %s", out)
	}
	if _, err := Allowed(json.RawMessage(`[1]`)); err == nil {
		t.Error("want an error for a state that is no object")
	}
}

func TestApplySendsOnlyAllowedKeys(t *testing.T) {
	f := newFakeWLED(t, "aa")
	m, _ := newTestManager(t)
	m.SetDevices([]Device{{ID: "d1", Mac: "aa", Host: f.host(), MaxBri: 255}})
	m.Apply("d1", json.RawMessage(`{"ps":4,"psave":4}`), 0)
	var got map[string]any
	json.Unmarshal([]byte(recv(t, f)), &got)
	if _, saved := got["psave"]; saved || got["ps"] != float64(4) {
		t.Errorf("posted %v", got)
	}
}
