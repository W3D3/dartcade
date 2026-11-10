/** Darts in one visit. */
export const DARTS_PER_VISIT = 3

/** The most a visit can score: three treble 20s. */
export const MAX_VISIT = 180

export type VisitTier = 'max' | '140' | 'ton'

/** Bands a visit's score: 180, 140 to 179, 100 to 139. Anything lower (or a bust, scored as 0) is null. */
export function visitTier(score: number): VisitTier | null {
  if (score >= MAX_VISIT) return 'max'
  if (score >= 140) return '140'
  if (score >= 100) return 'ton'
  return null
}
