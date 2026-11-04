import type { components } from '../schema/api.js'

export type LastSeen = components['schemas']['LastSeen']

const HOUR = 3_600_000

/** How long ago, in coarse steps: friends never see an exact time. */
export function lastSeenBucket(at: Date, now: Date): LastSeen {
  const ago = now.getTime() - at.getTime()
  if (ago < HOUR) return 'now'
  if (ago < 24 * HOUR) return 'today'
  if (ago < 48 * HOUR) return 'yesterday'
  if (ago < 7 * 24 * HOUR) return 'week'
  return 'older'
}
