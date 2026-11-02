// Which finished games the coach reviews. Its own module, so the frontend can ask without loading the model.

/** X01, straight in, double out, bull 25/50, singles. A missing key is X01's default. */
export function coachable(mode: string, config: Record<string, unknown>): boolean {
  return (
    mode === 'x01' &&
    (config.inMode ?? 'straight') === 'straight' &&
    (config.outMode ?? 'double') === 'double' &&
    (config.bullValue ?? '25_50') === '25_50' &&
    (config.format ?? 'singles') !== 'teams'
  )
}
