// The arrow a stat carries against an earlier value, and the number formats stat tiles use.

export type Better = 'higher' | 'lower'
/** decimal: "▲ 3.1"; pts: a share's change in percentage points, "▼ 2 pts"; count: "▲ 2". */
export type TrendUnit = 'decimal' | 'pts' | 'count'
/** `good`: the change is an improvement, given which way is better. */
export type Trend = { text: string; good: boolean }

/** The arrow from `before` to `now`; null when either is missing or nothing changed at the shown precision. */
export function trendOf(now: number | null, before: number | null, unit: TrendUnit, better: Better): Trend | null {
  if (now === null || before === null) return null
  const diff =
    unit === 'pts' ? Math.round((now - before) * 100) : unit === 'decimal' ? Math.round((now - before) * 10) / 10 : Math.round(now - before)
  if (diff === 0) return null
  const size = unit === 'decimal' ? Math.abs(diff).toFixed(1) : String(Math.abs(diff))
  return { text: `${diff > 0 ? '▲' : '▼'} ${size}${unit === 'pts' ? ' pts' : ''}`, good: diff > 0 === (better === 'higher') }
}

/** "68.4"; "–" for nothing to show. */
export const dec1 = (n: number | null): string => (n === null ? '–' : n.toFixed(1))

/** A 0–1 share as "36%"; under 2% with one decimal ("1.2%"), so a rare thing doesn't read as 0% or 1%. */
export function pct(n: number | null): string {
  if (n === null) return '–'
  return n > 0 && n < 0.02 ? `${(n * 100).toFixed(1)}%` : `${Math.round(n * 100)}%`
}
