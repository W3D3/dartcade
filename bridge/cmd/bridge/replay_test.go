package main

import (
	"strings"
	"testing"
)

func TestWithoutQueryHidesTheToken(t *testing.T) {
	msg := `Get "http://h:3000/bridge?token=s3cr3t": connection refused`
	got := withoutQuery(msg, "ws://h:3000/bridge?token=s3cr3t")
	if strings.Contains(got, "s3cr3t") {
		t.Errorf("token still in %q", got)
	}
	if got := withoutQuery("x", "ws://h/bridge"); got != "x" {
		t.Errorf("got %q for a URL without a query", got)
	}
}
