package main

import (
	"reflect"
	"testing"
)

func TestServiceArgs(t *testing.T) {
	got := serviceArgs("/state", "http://b:3180", "", "")
	want := []string{"--config-dir", "/state", "--board-url", "http://b:3180"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	if got := serviceArgs("/s", "", "", ""); !reflect.DeepEqual(got, []string{"--config-dir", "/s"}) {
		t.Fatalf("empty values must be left out, got %v", got)
	}
}
