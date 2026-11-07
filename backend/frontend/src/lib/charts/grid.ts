// Settings every line chart shares, so a discrete point is easy to read off the axis.

/** The faint vertical rule drawn at each x position a chart has a point at. */
const X_RULE = { class: 'stroke-line', strokeWidth: 1 }

/** LayerChart's `grid` prop: a vertical rule at each of `xTicks` plus the chart's own horizontal grid. */
export function chartGrid(xTicks: number[], y: false | { class: string; strokeWidth: number; yTicks?: number[] }) {
  const { yTicks, ...line } = y || {}
  return { x: X_RULE, y: y && line, xTicks, yTicks }
}

/** The distinct x values of a chart's points, ascending. */
export const xPositions = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b)

/**
 * Whole-number axis labels between `from` and `to`: every number while `maxLabels` fit, otherwise
 * the multiples of an even 2, 5, 10, 20 ... step, so the labels never look skipped or fractional.
 */
export function integerTicks(from: number, to: number, maxLabels = 12): number[] {
  const count = to - from + 1
  let step = 1
  for (let decade = 1; Math.ceil(count / step) > maxLabels; decade *= 10) {
    step = [1, 2, 5].map(b => b * decade).find(s => Math.ceil(count / s) <= maxLabels) ?? step
  }
  const out: number[] = []
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) out.push(t)
  return out
}
