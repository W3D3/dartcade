/** The profile's X01 average (and its badge) covers games finished in this many days. */
export const PROFILE_AVERAGE_DAYS = 30

/** Lowest and highest class; below the lowest a player has no badge (User-Badge, Avg-Classes boards). */
export const AVG_CLASS_MIN = 20
export const AVG_CLASS_MAX = 100

/** The 5-point class of an X01 3-dart average (53.1 → 50, 100 and up → 100); null without an average or under 20. */
export function avgClass(average: number | null): number | null {
  if (average === null || !Number.isFinite(average) || average < AVG_CLASS_MIN) return null
  return Math.min(AVG_CLASS_MAX, Math.floor(average / 5) * 5)
}
