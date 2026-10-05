package backoff

import (
	"testing"
	"time"
)

func TestNextDoublesWithJitterUpToMax(t *testing.T) {
	for range 100 {
		if d := Next(time.Second, 30*time.Second); d < 2*time.Second || d > 2500*time.Millisecond {
			t.Fatalf("Next(1s) = %v, want 2s..2.5s", d)
		}
		if d := Next(20*time.Second, 30*time.Second); d < 30*time.Second || d > 37500*time.Millisecond {
			t.Fatalf("Next(20s) = %v, want 30s..37.5s", d)
		}
	}
}
