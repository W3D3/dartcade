// Pure view helpers for Shanghai: the header line, the round and target labels, which darts hit the
// round's number and what the open visit still needs for a Shanghai. Fed by the ShanghaiGame snapshot.
import type { ShanghaiGame } from '../api/game-ws'
import { plural } from '../fmt.js'
import { BULL, dartResult, kindsOf, type ShanghaiKind } from '$shared/shanghai'

export { kindsOf, type ShanghaiKind }

/** 25 is the bull. */
export const targetLabel = (target: number): string => (target === BULL ? 'Bull' : String(target))

/** "Round 3 of 7", "Bull round" or, once a tie plays on, "Sudden death 2". */
export function roundLabel(g: Pick<ShanghaiGame, 'round' | 'rounds' | 'cfg'>): string {
  if (g.round > g.rounds) return `Sudden death ${g.round - g.rounds}`
  if (g.cfg.bullRound && g.round === g.rounds) return 'Bull round'
  return `Round ${g.round} of ${g.rounds}`
}

/** "1–7" or "1–7 + Bull". */
export const rangeLabel = (c: { start: number; end: number; bullRound: boolean }): string =>
  `${c.start}–${c.end}${c.bullRound ? ' + Bull' : ''}`

/** "2 players · 1–7 · Round 3 of 7". */
export const shanghaiMeta = (g: ShanghaiGame, players: number): string =>
  `${plural(players, 'player')} · ${rangeLabel(g.cfg)} · ${roundLabel(g)}`

/** Whether a dart scored on the round's number. */
export const hitsTarget = (dart: { segment: { number: number; multiplier: number } }, target: number): boolean =>
  dartResult(dart, target).kind !== null

/** The kinds the open visit still lacks for a Shanghai, treble first; empty on the bull round, which has none. */
export function missingKinds(g: Pick<ShanghaiGame, 'hits' | 'target'>): ShanghaiKind[] {
  if (g.target === BULL) return []
  return (['treble', 'double', 'single'] as const).filter(k => !g.hits[k])
}

const PREFIX = { single: 'S', double: 'D', treble: 'T' } as const
/** "T3" for the treble of the round's number. */
export const kindLabel = (kind: ShanghaiKind, target: number): string => `${PREFIX[kind]}${target}`

/** "Shanghai!" for a visit that was one, else "7" (or "–" for a round that scored nothing). */
export const visitText = (v: { score: number; shanghai: boolean }): string =>
  v.shanghai ? 'Shanghai' : v.score === 0 ? '–' : String(v.score)
