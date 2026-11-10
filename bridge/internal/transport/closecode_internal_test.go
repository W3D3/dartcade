package transport

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

// The generated Go type has no named constants, so pin statusUnauthorized to the schema's BridgeCloseCode.
func TestStatusUnauthorizedMatchesSchema(t *testing.T) {
	raw, err := os.ReadFile("../../../schema/adbridge-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Defs struct {
			BridgeCloseCode struct {
				Enum  []int    `json:"enum"`
				Names []string `json:"tsEnumNames"`
			} `json:"BridgeCloseCode"`
		} `json:"$defs"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	def := doc.Defs.BridgeCloseCode
	i := slices.Index(def.Names, "Unauthorized")
	if i < 0 || def.Enum[i] != int(statusUnauthorized) {
		t.Fatalf("statusUnauthorized = %d, schema BridgeCloseCode has %v for %v", statusUnauthorized, def.Enum, def.Names)
	}
}
