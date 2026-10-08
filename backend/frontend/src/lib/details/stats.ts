// The details page's stats table, for any game mode: each row from the server says how to show
// its value and which way is better.
import type { StatRow, StatValues } from '../api'
import { plural } from '../fmt.js'

const has = (values: Record<string, number>, key: string | undefined): key is string => key !== undefined && Object.hasOwn(values, key)

/** 1–20, 21 = 25, 22 = Bull. */
export const targetLabel = (n: number): string => (n === 22 ? 'Bull' : n === 21 ? '25' : String(n))

/** The number to compare (a ratio's rate); undefined when the stat doesn't apply. */
export function statNumber(row: StatRow, values: Record<string, number>): number | undefined {
  const key = row.value ?? row.key
  if (!has(values, key)) return undefined
  if (row.format !== 'ratio') return values[key]
  if (!has(values, row.of) || values[row.of] === 0) return undefined
  return values[key] / values[row.of]
}

export function formatStat(row: StatRow, values: Record<string, number>): string {
  const n = statNumber(row, values)
  if (n === undefined) return '—'
  switch (row.format) {
    case 'decimal':
      return n.toFixed(1)
    case 'darts':
      return plural(n, 'dart')
    case 'target':
      return targetLabel(n)
    case 'ratio':
      return `${Math.round(n * 100)}% · ${values[row.value ?? row.key]}/${values[row.of ?? '']}`
    default:
      return String(n)
  }
}

/** Who holds the best value; nobody without a direction, with fewer than two values, or all equal. */
export function betterIndexes(row: StatRow, all: StatValues[]): Set<number> {
  if (row.better === null) return new Set()
  const scored = all.flatMap(s => {
    const n = statNumber(row, s.values)
    return n === undefined ? [] : [{ index: s.index, n }]
  })
  if (scored.length < 2) return new Set()
  const best = row.better === 'higher' ? Math.max(...scored.map(s => s.n)) : Math.min(...scored.map(s => s.n))
  if (scored.every(s => s.n === best)) return new Set()
  return new Set(scored.filter(s => s.n === best).map(s => s.index))
}
