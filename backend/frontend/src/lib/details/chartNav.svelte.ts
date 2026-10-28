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

/** The part of a layerchart context this drives: its tooltip, shown for the focused point. */
type TooltipContext<T> = { tooltip: { show: (arg: { data: T }) => void; hide: () => void } }

/**
 * A chart's keyboard path: Left/Right step through `points()`, Escape (or blur) clears it. The point is
 * shown through the chart's own tooltip (`context()`, the chart's bound context), so the pointer
 * tooltip stays the one source of its text; `liveText` repeats it for a screen reader's live region.
 */
export function createChartNav<T>(
  points: () => NavPoint<T, unknown>[],
  describe: (point: T) => string,
  context: () => TooltipContext<T> | undefined,
) {
  let focusIndex = $state<number | null>(null)

  function focusPoint(index: number | null) {
    focusIndex = index
    const n = index === null ? undefined : points().at(index)
    if (n) context()?.tooltip.show({ data: n.point })
    else context()?.tooltip.hide()
  }

  return {
    get liveText(): string {
      const n = focusIndex === null ? undefined : points().at(focusIndex)
      return n ? describe(n.point) : ''
    },
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        focusPoint(stepFocus(focusIndex, e.key === 'ArrowRight' ? 1 : -1, points().length))
      } else if (e.key === 'Escape' && focusIndex !== null) {
        e.preventDefault()
        focusPoint(null)
      }
    },
    blur: () => focusPoint(null),
  }
}
