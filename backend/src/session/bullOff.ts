import type { Dart } from './types.js'

export type BullOffMode = 'off' | 'wdc' | 'pdc'

export type BullOffConfig = {
  mode: BullOffMode
  playerCount: number
}

/** One player's bull off dart. `mm` is the distance from the centre; null = off the board. */
export type BullOffThrow = {
  mm: number | null
  segment: string
  /** Angle of the dart (degrees, counter-clockwise from 3 o'clock) when the cameras report it. */
  thetaDeg: number | null
  /** true when the distance is estimated from the segment (manual entry or a corrected dart). */
  estimated: boolean
}

export type BullOffResult = {
  /** Player indices, closest first — the throwing order for the game. */
  order: number[]
  rethrow: boolean
  reason?: 'tie' | 'bullseye' | 'all_missed'
}

export type BullOffState = {
  active: boolean
  throws: (BullOffThrow | null)[]
  /** Who throws when (player indices); reversed on every rethrow. */
  sequence: number[]
  /** Position in `sequence` of the player throwing now. */
  step: number
  currentPlayer: number
  playerCount: number
  /** Set once everyone has thrown; the game starts (or a rethrow happens) from here. */
  result: BullOffResult | null
}

// Standard board geometry in mm from the centre.
const DOUBLE_OUTER_MM = 170 // normalised coords use r = 1 at the outer double wire
const BULLSEYE_MM = 6.35
const TIE_MM = 0.5

// Distance estimates for darts without camera coordinates: the middle of each bed.
const BED_ESTIMATE_MM: Record<string, number> = {
  SingleInner: 57,
  Triple: 103,
  SingleOuter: 135,
  Single: 100,
  Double: 166,
}

export function initBullOff(cfg: BullOffConfig): BullOffState {
  return {
    active: cfg.mode !== 'off',
    throws: Array<BullOffThrow | null>(cfg.playerCount).fill(null),
    sequence: Array.from({ length: cfg.playerCount }, (_, i) => i),
    step: 0,
    currentPlayer: 0,
    playerCount: cfg.playerCount,
    result: null,
  }
}

/** Turn a detected dart into a bull off throw, measuring from the cameras when possible. */
export function throwFromDart(dart: Dart): BullOffThrow {
  const { segment } = dart
  const onBoard = segment.bed !== 'Outside'
  const r = dart.polar?.r ?? (dart.coords ? Math.hypot(dart.coords.x, dart.coords.y) : null)
  if (onBoard && r !== null) {
    return {
      mm: Math.round(r * DOUBLE_OUTER_MM * 10) / 10,
      segment: segment.name,
      thetaDeg: dart.polar?.theta_deg ?? (dart.coords ? (Math.atan2(dart.coords.y, dart.coords.x) * 180) / Math.PI : null),
      estimated: false,
    }
  }
  if (!onBoard) return { mm: null, segment: segment.name || 'Miss', thetaDeg: null, estimated: false }
  const mm = segment.number === 50 ? BULLSEYE_MM / 2 : segment.number === 25 ? 11.1 : (BED_ESTIMATE_MM[segment.bed] ?? 100)
  return { mm, segment: segment.name, thetaDeg: null, estimated: true }
}

/** Call on dart.detected during the bull off. Only a player's first dart counts. */
export function onBullOffDart(s: BullOffState, dart: Dart): BullOffState {
  if (s.result || s.throws[s.currentPlayer] !== null) return s
  const throws = s.throws.map((t, i) => (i === s.currentPlayer ? throwFromDart(dart) : t))
  return { ...s, throws }
}

/** Call on takeout: moves to the next player, or ranks everyone once all have thrown. */
export function onBullOffTakeout(s: BullOffState): BullOffState {
  if (s.result) return s
  if (s.step < s.sequence.length - 1) {
    const step = s.step + 1
    return { ...s, step, currentPlayer: s.sequence[step] }
  }
  return { ...s, result: rank(s.throws) }
}

/** The current player gives up their dart (counts as off the board) and play moves on. */
export function skipBullOffThrow(s: BullOffState): BullOffState {
  if (s.result) return s
  const throws = s.throws.map((t, i) =>
    i === s.currentPlayer && t === null ? { mm: null, segment: 'Miss', thetaDeg: null, estimated: false } : t,
  )
  return onBullOffTakeout({ ...s, throws })
}

/** Clears the current player's dart so they throw again (e.g. the board was reset). */
export function clearCurrentBullOffThrow(s: BullOffState): BullOffState {
  if (s.result) return s
  return { ...s, throws: s.throws.map((t, i) => (i === s.currentPlayer ? null : t)) }
}

/** Everyone throws again, in reverse order: whoever threw last now throws first. */
export function rethrowBullOff(s: BullOffState): BullOffState {
  const sequence = [...s.sequence].reverse()
  return { ...s, throws: Array<BullOffThrow | null>(s.playerCount).fill(null), sequence, step: 0, currentPlayer: sequence[0], result: null }
}

/**
 * Closest to the centre throws first. A rethrow is needed when nobody hit the
 * board, more than one dart is in the bullseye, or the top two are within 0.5 mm.
 */
export function rank(throws: (BullOffThrow | null)[]): BullOffResult {
  const dist = (i: number) => throws[i]?.mm ?? Infinity
  const order = throws.map((_, i) => i).sort((a, b) => dist(a) - dist(b) || a - b)
  if (order.every(i => dist(i) === Infinity)) return { order, rethrow: true, reason: 'all_missed' }
  if (order.filter(i => dist(i) <= BULLSEYE_MM).length > 1) return { order, rethrow: true, reason: 'bullseye' }
  if (order.length > 1 && dist(order[1]) - dist(order[0]) < TIE_MM) return { order, rethrow: true, reason: 'tie' }
  return { order, rethrow: false }
}
