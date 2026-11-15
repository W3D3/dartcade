// The admin Activity page (`#/admin/activity`): its data and how its numbers read (schema/api-v1.yaml, getAdminActivity).
import { api, type AdminActivity } from '$lib/api'

export type { AdminActivity }

export const RANGES = [7, 30, 90] as const
export type Range = (typeof RANGES)[number]

export async function loadActivity(days: Range): Promise<AdminActivity | null> {
  const res = await api.GET('/api/admin/activity', { params: { query: { days } } })
  return res.data ?? null
}

/** A whole number with a thin gap between the thousands, as the design shows it ("1 284"). */
export const formatCount = (n: number): string => n.toLocaleString('en', { useGrouping: true }).replaceAll(',', ' ')

/** The change from `before` to `now` in whole percent, with its arrow ("▲ 18%"); null when there is nothing to compare with. */
export function trend(now: number, before: number): { label: string; up: boolean } | null {
  if (before === 0) return null
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0) return { label: '0%', up: true }
  return { label: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`, up: pct > 0 }
}

/** A share (0 to 1) as "11%", with a decimal below ten percent ("3.4%"). */
export function percent(share: number): string {
  const pct = share * 100
  return `${pct < 10 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`
}

/** One stacked bar of the games chart: its day, total and each mode's share of the tallest day. */
export type DayBar = { day: Date; total: number; parts: { mode: string; count: number; height: number }[] }

/** The games chart's bars, oldest first, `today` being the last one's UTC day; heights are percent of the busiest day. */
export function dayBars(perDay: Record<string, number>[], modes: string[], today: Date): DayBar[] {
  const totals = perDay.map(d => Object.values(d).reduce((a, b) => a + b, 0))
  const peak = Math.max(1, ...totals)
  return perDay.map((counts, i) => ({
    day: new Date(today.getTime() - (perDay.length - 1 - i) * 86_400_000),
    total: totals[i],
    parts: modes.flatMap(mode => (counts[mode] ? [{ mode, count: counts[mode], height: (counts[mode] / peak) * 100 }] : [])),
  }))
}

/** Bar heights (percent of the tallest) for a list of counts; a flat zero list is all zero. */
export function barHeights(counts: number[]): number[] {
  const peak = Math.max(1, ...counts)
  return counts.map(n => (n / peak) * 100)
}

const HEAT_LEVELS = [0, 1, 2, 3, 4] as const

/** The heat of one cell of the busiest-hours grid, 0 (none) to 4 (the most), by share of the busiest cell. */
export function heatLevel(count: number, peak: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || peak <= 0) return 0
  return HEAT_LEVELS[Math.min(4, Math.ceil((count / peak) * 4))] ?? 0
}

/** "Sat 20–22 h": the busiest two-hour stretch of the week grid (rows Monday first, 24 UTC hours each); null when empty. */
export function busiestSlot(grid: number[][]): string | null {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  let best = { sum: 0, day: 0, hour: 0 }
  grid.forEach((row, day) => {
    for (let hour = 0; hour < 23; hour++) {
      const sum = row[hour] + row[hour + 1]
      if (sum > best.sum) best = { sum, day, hour }
    }
  })
  return best.sum === 0 ? null : `${days[best.day]} ${best.hour}–${best.hour + 2} h`
}

/** Bar colours per mode, in legend order, from the design tokens; modes past the palette share the last one. */
export const MODE_COLORS = ['bg-accent', 'bg-grade-great', 'bg-warn', 'bg-grade-brilliant', 'bg-ink-faint'] as const
export const modeColor = (modes: string[], mode: string): string =>
  MODE_COLORS[Math.min(Math.max(0, modes.indexOf(mode)), MODE_COLORS.length - 1)]
