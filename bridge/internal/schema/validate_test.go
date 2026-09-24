package schema_test

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dartcade/bridge/internal/bm"
	"dartcade/bridge/internal/differ"
	jsonschema "github.com/santhosh-tekuri/jsonschema/v5"
	_ "github.com/santhosh-tekuri/jsonschema/v5/httploader"
)

// kindToDef maps adbridge event kinds to their $defs entry in adbridge-v1.json.
var kindToDef = map[string]string{
	"bm.link":          "BmLinkData",
	"bm.frame":         "BmFrameData",
	"board.status":     "BoardStatusData",
	"board.resync":     "BoardResyncData",
	"visit.opened":     "VisitOpenedData",
	"dart.detected":    "DartDetectedData",
	"dart.corrected":   "DartCorrectedData",
	"dart.moved":       "DartMovedData",
	"takeout.started":  "TakeoutStartedData",
	"takeout.finished": "TakeoutFinishedData",
	"visit.cleared":    "VisitClearedData",
	"motion":           "MotionData",
	"command.result":   "CommandResultData",
	"bridge.hello":     "BridgeHelloData",
}

func TestSchemaValidation(t *testing.T) {
	schemaPath, err := filepath.Abs("../../../schema/adbridge-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(schemaPath); err != nil {
		t.Fatalf("schema file not found at %s: %v", schemaPath, err)
	}

	compiler := jsonschema.NewCompiler()
	schemaURL := "file://" + schemaPath

	// Pre-compile each $def sub-schema so we can validate data payloads directly.
	subSchemas := map[string]*jsonschema.Schema{}
	for kind, def := range kindToDef {
		sch, err := compiler.Compile(schemaURL + "#/$defs/" + def)
		if err != nil {
			t.Fatalf("compile $defs/%s: %v", def, err)
		}
		subSchemas[kind] = sch
	}

	fixtureDir := "../differ/testdata"
	entries, err := os.ReadDir(fixtureDir)
	if err != nil {
		t.Fatalf("read testdata: %v", err)
	}

	for _, entry := range entries {
		if filepath.Ext(entry.Name()) != ".jsonl" {
			continue
		}
		t.Run(strings.TrimSuffix(entry.Name(), ".jsonl"), func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(fixtureDir, entry.Name()))
			if err != nil {
				t.Fatal(err)
			}
			s := differ.State{}
			for _, line := range bytes.Split(data, []byte("\n")) {
				if len(bytes.TrimSpace(line)) == 0 {
					continue
				}
				frame, err := bm.ParseFrame(line)
				if err != nil || frame == nil {
					continue
				}
				var evs []differ.Event
				s, evs = differ.Process(s, *frame)
				for _, ev := range evs {
					payload, err := json.Marshal(ev.Data)
					if err != nil {
						t.Errorf("kind=%s: marshal error: %v", ev.Kind, err)
						continue
					}
					sch, ok := subSchemas[ev.Kind]
					if !ok {
						t.Errorf("kind=%s: no $defs entry known", ev.Kind)
						continue
					}
					var v any
					json.Unmarshal(payload, &v)
					if err := sch.Validate(v); err != nil {
						t.Errorf("kind=%s: schema validation failed: %v\npayload: %s", ev.Kind, err, payload)
					}
				}
			}
		})
	}
}
