import type { components } from '../schema/api.js'

type GameStats = components['schemas']['GameStats']
type ModeStats = components['schemas']['ModeStats']
type StatAggregate = components['schemas']['StatAggregate']

/** My seat in one finished game. */
export type StatRow = { mode: string; finishedAt: Date; placement: number; seats: number; stats: Record<string, number> }

const DAY_MS = 86_400_000
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

function counts(rows: StatRow[]) {
  const contested = rows.filter(r => r.seats >= 2)
  return { matches: rows.length, contested: contested.length, wins: contested.filter(r => r.placement === 1).length }
}

const valuesOf = (rows: StatRow[], key: string) => rows.flatMap(r => key in r.stats ? [r.stats[key]] : [])

/**
 * Totals and per-mode aggregates over the last `days` before `now`; `previousAvg`
 * compares with the `days` before that. `rows` may reach further back (needs 2 × days).
 * Solo games count as matches but not towards the win rate (wins / contested).
 */
export function aggregateStats(rows: StatRow[], days: number, now: Date): GameStats {
  const start = now.getTime() - days * DAY_MS
  const current = rows.filter(r => r.finishedAt.getTime() >= start)
  const previous = rows.filter(r => r.finishedAt.getTime() < start && r.finishedAt.getTime() >= start - days * DAY_MS)

  const modes: Record<string, ModeStats> = {}
  for (const mode of new Set(current.map(r => r.mode))) {
    const mine = current.filter(r => r.mode === mode)
    const before = previous.filter(r => r.mode === mode)
    const stats: Record<string, StatAggregate> = {}
    for (const key of new Set(mine.flatMap(r => Object.keys(r.stats)))) {
      const values = valuesOf(mine, key)
      const prev = valuesOf(before, key)
      stats[key] = { avg: mean(values), min: Math.min(...values), max: Math.max(...values), previousAvg: prev.length > 0 ? mean(prev) : null }
    }
    modes[mode] = { ...counts(mine), stats }
  }
  return { days, ...counts(current), modes }
}
