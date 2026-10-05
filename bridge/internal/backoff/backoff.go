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
