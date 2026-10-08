// Building blocks for a game module's matchStats(): the rows say how to show each value (label,
// format, which way is better), so the details page needs no change when a mode adds a stat.
import type { MatchStats, StatRow } from '../session/types.js'

type RowOptions = { compact?: boolean; value?: string; of?: string }

export function row(key: string, label: string, format: StatRow['format'], better: StatRow['better'], opts: RowOptions = {}): StatRow {
  return {
    key,
    label,
    format,
    better,
    compact: opts.compact ?? false,
    ...(opts.value !== undefined && { value: opts.value }),
    ...(opts.of !== undefined && { of: opts.of }),
  }
}

/** A seat's or team's values without the ones that don't apply (a missing key shows "—"). */
export function values(v: Record<string, number | undefined>): Record<string, number> {
  return Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => e[1] !== undefined))
}

/** For a mode without matchStats(): the page shows the result only. */
export const noStats = (): MatchStats => ({ rows: [], seats: [] })
