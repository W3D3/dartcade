// Made-up numbers for the stats components' showcase (#/dev/stats) and tests: a player around a
// 68 average, the same every time (a fixed sequence, no Math.random).

/** A repeatable wobble in [-1, 1] for step `i`. */
const wobble = (i: number) => Math.sin(i * 0.45) * 0.7 + Math.sin(i * 1.3) * 0.3

/** `n` values around `mid`, `spread` either way, drifting up by `drift` over the run. */
export const series = (n: number, mid: number, spread: number, drift = 0): number[] =>
  Array.from({ length: n }, (_, i) => Math.round((mid + wobble(i) * spread + (drift * i) / n) * 10) / 10)

export const LEG_AVERAGES = series(50, 66, 14, 6)
export const LEGS_WON = LEG_AVERAGES.map((a, i) => a > 68 || i % 7 === 0)

export const BUCKETS = ['0–19', '20–39', '40–59', '60–79', '80–99', '100–139', '140–179', '180']
export const BUCKETS_NOW = [0.03, 0.09, 0.21, 0.24, 0.18, 0.17, 0.06, 0.012]
export const BUCKETS_BEFORE = [0.04, 0.11, 0.21, 0.23, 0.17, 0.15, 0.05, 0.006]

export const BY_VISIT_NOW = [79.4, 77.8, 74.6, 71.2, 67.0, 63.5, 59.8]
export const BY_VISIT_BEFORE = [76.1, 74.9, 71.3, 69.0, 65.2, 61.7, 58.0]

/** Darts at each double and how many went out, by number (25: the bull). */
export const DOUBLES = new Map([
  [20, { hits: 13, attempts: 25 }],
  [16, { hits: 12, attempts: 25 }],
  [8, { hits: 7, attempts: 16 }],
  [10, { hits: 5, attempts: 13 }],
  [18, { hits: 3, attempts: 10 }],
  [12, { hits: 3, attempts: 11 }],
  [4, { hits: 2, attempts: 8 }],
  [1, { hits: 0, attempts: 1 }],
  [25, { hits: 1, attempts: 6 }],
])
