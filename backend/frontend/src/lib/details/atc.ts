// Around the Clock on the details page: the target-by-target grid, the race chart and the
// sentences around them, from the server's per-seat progress.
import type { AtcDetail, StatValues } from '../api'
import { targetLabel } from './stats.js'

export type GridCell = { target: number; state: 'hit' | 'ended' | 'none'; darts: number; tone: 1 | 2 | 3 | 4 | null; skipped: boolean }

export function targetGrid(detail: AtcDetail, sequence: number[]): { seat: number; cells: GridCell[] }[] {
  return detail.progress.map(p => ({
    seat: p.seat,
    cells: sequence.map(target => {
      const step = p.steps.find(s => s.target === target)
      if (!step) return { target, state: 'none', darts: 0, tone: null, skipped: false }
      const skipped = step.hit && step.darts === 0
      let tone: 1 | 2 | 3 | 4 | null = null
      if (step.hit && !skipped) {
        const capped = Math.min(step.darts, 4)
        // At this point, capped is 1, 2, 3, or 4 due to Math.min with 4
        tone = capped === 1 ? 1 : capped === 2 ? 2 : capped === 3 ? 3 : 4
      }
      return { target, state: step.hit ? 'hit' : 'ended', darts: step.darts, tone, skipped }
    }),
  }))
}

export function raceSeries(detail: AtcDetail) {
  return detail.progress.map(p => {
    let darts = 0,
      hits = 0
    const points = [{ darts: 0, hits: 0 }]
    for (const s of p.steps) {
      darts += s.darts
      if (!s.hit) continue
      hits += 1
      points.push({ darts, hits })
    }
    return { seat: p.seat, points }
  })
}

export function hardestLine(stats: StatValues[], nameOf: (seat: number) => string): string {
  const parts = stats
    .filter(s => Object.hasOwn(s.values, 'hardestTarget'))
    .map(s => `${targetLabel(s.values.hardestTarget)} cost ${nameOf(s.index)} the most`)
  return parts.length > 0 ? `${parts.join('; ')}.` : ''
}

export function atcResult(values: Record<string, number>): string {
  if (values.finished === 1) {
    const darts = Object.hasOwn(values, 'dartsThrown') ? values.dartsThrown : 0
    return `Finished · ${darts} darts`
  }
  return Object.hasOwn(values, 'reached') ? `Reached ${targetLabel(values.reached)}` : ''
}
