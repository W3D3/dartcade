// Reading LayerChart's scales from a chart's context, where they are typed to return anything.

/** Where `value` lands on `scale`, in pixels; 0 when the scale has no place for it. */
export function scaled(scale: (value: number | string) => unknown, value: number | string): number {
  const out = scale(value)
  return typeof out === 'number' ? out : 0
}

/** A band scale's band width in pixels; 0 for any other scale. */
export const bandwidth = (scale: { bandwidth?: () => number }): number => scale.bandwidth?.() ?? 0
