// Keyboard navigation shared by RemainingChart and RaceChart: Left/Right arrows step through
// every point of every series (not just one line), in ascending x order, so the tooltip and its
// screen-reader announcement reach every visit/dart in the chart from the keyboard alone.

export type NavPoint<T, K> = { seriesKey: K; point: T }

/** Every point across every series, in ascending x order, for a single shared tab order. */
export function flattenByX<T, K>(series: { key: K; points: T[] }[], x: (point: T) => number): NavPoint<T, K>[] {
  return series.flatMap(s => s.points.map(point => ({ seriesKey: s.key, point }))).sort((a, b) => x(a.point) - x(b.point))
}

/**
 * Next focus index for an arrow key press: from nothing focused, ArrowRight (`delta` 1) starts at
 * the first point and ArrowLeft (`delta` -1) starts at the last; otherwise clamps at the ends
 * instead of wrapping around.
 */
export function stepFocus(current: number | null, delta: 1 | -1, length: number): number | null {
  if (length === 0) return null
  if (current === null) return delta > 0 ? 0 : length - 1
  return Math.min(length - 1, Math.max(0, current + delta))
}
