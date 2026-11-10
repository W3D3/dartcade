// Package backoff spaces out reconnect attempts.
package backoff

import (
	"math/rand"
	"time"
)

// Next doubles the delay up to max, plus up to a quarter of jitter so reconnects don't line up.
func Next(d, max time.Duration) time.Duration {
	d = min(d*2, max)
	return d + time.Duration(rand.Int63n(int64(d/4)+1))
}

// Policy is a reconnect schedule: start at Initial, grow to Max, and fall back to Initial
// once a connection has stayed up for StableAfter.
type Policy struct {
	Initial, Max, StableAfter time.Duration
}

// Next is the delay after d.
func (p Policy) Next(d time.Duration) time.Duration { return Next(d, p.Max) }

// Reset returns Initial when the connection made at connectedAt has outlived StableAfter, else d.
func (p Policy) Reset(d time.Duration, connectedAt time.Time) time.Duration {
	if time.Since(connectedAt) > p.StableAfter {
		return p.Initial
	}
	return d
}

// Reconnect is the schedule for the bridge's long-lived connections (backend, Board Manager).
var Reconnect = Policy{Initial: 500 * time.Millisecond, Max: 30 * time.Second, StableAfter: 30 * time.Second}
