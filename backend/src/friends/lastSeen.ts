import type { components } from '../schema/api.js'
import { HOUR_MS } from '../shared/time.js'

export type LastSeen = components['schemas']['LastSeen']

/** How long ago, in coarse steps: friends never see an exact time. */
export function lastSeenBucket(at: Date, now: Date): LastSeen {
  const ago = now.getTime() - at.getTime()
  if (ago < HOUR_MS) return 'now'
  if (ago < 24 * HOUR_MS) return 'today'
  if (ago < 48 * HOUR_MS) return 'yesterday'
  if (ago < 7 * 24 * HOUR_MS) return 'week'
  return 'older'
}
