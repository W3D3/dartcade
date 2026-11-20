// X01 handicaps: a private lobby's host gives one player their own start score, check-in or check-out.

export type InOutMode = 'straight' | 'double' | 'master'

/** The rules a seat plays X01 by. */
export type X01Rules = { startScore: number; inMode: InOutMode; outMode: InOutMode }

/** What a handicap overrides; a field left out plays the game's own. */
export type Handicap = Partial<X01Rules>

export const HANDICAP_START_MIN = 101
export const HANDICAP_START_MAX = 1001

/** The game's config as far as a handicap reads it: per seat, null for none (singles only). */
export type X01RulesConfig = X01Rules & { handicaps?: readonly (Handicap | null)[] | null }

const MODES: readonly InOutMode[] = ['straight', 'double', 'master']
const modeOf = (v: unknown): InOutMode | undefined => MODES.find(m => m === v)

function readHandicap(v: unknown): Handicap | null {
  if (typeof v !== 'object' || v === null) return null
  const h: Handicap = {}
  if ('startScore' in v && typeof v.startScore === 'number') h.startScore = v.startScore
  const inMode = 'inMode' in v ? modeOf(v.inMode) : undefined
  if (inMode) h.inMode = inMode
  const outMode = 'outMode' in v ? modeOf(v.outMode) : undefined
  if (outMode) h.outMode = outMode
  return isHandicap(h) ? h : null
}

/** A stored or unsaved X01 config read defensively, with X01's defaults (501, straight in, double out) for what's missing. */
export function readRulesConfig(config: Record<string, unknown>): X01RulesConfig {
  return {
    startScore: typeof config.startScore === 'number' ? config.startScore : 501,
    inMode: modeOf(config.inMode) ?? 'straight',
    outMode: modeOf(config.outMode) ?? 'double',
    ...(Array.isArray(config.handicaps) && { handicaps: config.handicaps.map(readHandicap) }),
  }
}

/** The rules `seat` plays by: the game's own with its handicap on top. */
export const seatRules = (cfg: X01RulesConfig, seat: number): X01Rules => ({
  startScore: cfg.startScore,
  inMode: cfg.inMode,
  outMode: cfg.outMode,
  ...cfg.handicaps?.[seat],
})

/** "301 · double in · double out": every rule a seat plays by, for a player card or the details page. */
export const rulesText = (r: X01Rules): string => `${r.startScore} · ${r.inMode} in · ${r.outMode} out`

/** A handicap that overrides nothing is none. */
export const isHandicap = (h: Handicap | null | undefined): h is Handicap =>
  h != null && (h.startScore !== undefined || h.inMode !== undefined || h.outMode !== undefined)

/** Why a handicap can't be played; null when it can. */
export function handicapProblem(h: Handicap): string | null {
  const s = h.startScore
  if (s !== undefined && (!Number.isInteger(s) || s < HANDICAP_START_MIN || s > HANDICAP_START_MAX)) {
    return `start score must be ${HANDICAP_START_MIN} to ${HANDICAP_START_MAX}`
  }
  return null
}

/** The handicap changes something against the game's own rules (one set earlier can match them now). */
export const changesRules = (game: X01Rules, h: Handicap | null): h is Handicap => h !== null && handicapLine(game, h) !== ''

/** "301 → 501, double in": what a handicap changes against the game's own rules, for a row or a card. */
export function handicapLine(game: X01Rules, h: Handicap): string {
  const parts: string[] = []
  if (h.startScore !== undefined && h.startScore !== game.startScore) parts.push(`${game.startScore} → ${h.startScore}`)
  if (h.inMode !== undefined && h.inMode !== game.inMode) parts.push(`${h.inMode} in`)
  if (h.outMode !== undefined && h.outMode !== game.outMode) parts.push(`${h.outMode} out`)
  return parts.join(', ')
}
