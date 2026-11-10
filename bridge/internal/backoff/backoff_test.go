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

func TestPolicyResetsOnlyAfterStable(t *testing.T) {
	p := Policy{Initial: time.Second, Max: 30 * time.Second, StableAfter: 30 * time.Second}
	if d := p.Reset(8*time.Second, time.Now().Add(-time.Second)); d != 8*time.Second {
		t.Fatalf("short connection reset the delay to %v", d)
	}
	if d := p.Reset(8*time.Second, time.Now().Add(-31*time.Second)); d != time.Second {
		t.Fatalf("stable connection left the delay at %v", d)
	}
}
