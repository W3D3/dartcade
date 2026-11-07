// One player's X01 legs as the Stats page reads them, from a finished game's stored detail
// (games/x01.ts detail()): their visits only, each dart with the score left before it and the
// one-dart finish it was thrown at, walked with the game's own in and out rules.
import { meetsMode, scoreDart, type BullValue, type OutMode } from '../games/outRules.js'
import type { HistoryGame } from '../db/history.js'
import type { X01Detail } from '../session/types.js'
import { checkoutHint } from '../shared/checkout.js'

export type MatchKind = 'ranked' | 'casual' | 'bots' | 'solo'

export type StatGame = {
  id: string
  finishedAt: Date
  startScore: number
  outMode: OutMode
  kind: MatchKind
  /** The other seats' names, in seat order. */
  opponents: string[]
}

export type StatDart = {
  name: string
  number: number
  multiplier: number
  /** The score left before it. */
  left: number
  /** The dart that would have finished from `left` ("D16", "Bull"); null when one dart can't. */
  target: string | null
}

export type StatVisit = { start: number; scored: number; bust: boolean; checkout: boolean; darts: StatDart[] }

export type StatLeg = { game: StatGame; leg: number; won: boolean; visits: StatVisit[] }

type Rules = { startScore: number; inMode: OutMode; outMode: OutMode; bullValue: BullValue }

const MODES: readonly OutMode[] = ['straight', 'double', 'master']
const modeOf = (v: unknown, fallback: OutMode): OutMode => MODES.find(m => m === v) ?? fallback

/** The game's rules from its stored config, with X01's defaults for anything missing. */
export function rulesOf(config: Record<string, unknown>): Rules {
  return {
    startScore: typeof config.startScore === 'number' ? config.startScore : 501,
    inMode: modeOf(config.inMode, 'straight'),
    outMode: modeOf(config.outMode, 'double'),
    bullValue: config.bullValue === '50_50' ? '50_50' : '25_50',
  }
}

/** Each dart of a visit from `start`: what was left and what one dart could finish. Darts after a
 *  bust or before the leg is opened (double or master in) are thrown but have no target. */
function walk(start: number, opened: boolean, darts: X01Detail['legs'][number]['visits'][number]['darts'], rules: Rules): StatDart[] {
  let left = start
  let open = opened
  let over = false
  return darts.map(({ segment }) => {
    const dart = { segment, score: segment.number * segment.multiplier }
    const before = left
    let target: string | null = null
    if (!over) {
      if (!open) open = meetsMode(dart, rules.inMode)
      if (open) {
        target = checkoutHint(left, rules.outMode, 1)?.[0] ?? null
        const next = scoreDart(left, dart, rules.outMode, rules.bullValue)
        over = next === 'bust' || next === 0
        if (next !== 'bust') left = next
      }
    }
    return { name: segment.name, number: segment.number, multiplier: segment.multiplier, left: before, target }
  })
}

/** The seat's legs of a finished X01 game; a team game counts a leg its team won as won. */
export function x01Legs(game: HistoryGame, detail: X01Detail, seat: number, ranked: boolean): StatLeg[] {
  const rules = rulesOf(game.config)
  const others = game.seats.filter(s => s.seat !== seat)
  const kind: MatchKind = ranked ? 'ranked' : others.length === 0 ? 'solo' : others.some(s => s.bot_level !== null) ? 'bots' : 'casual'
  const statGame: StatGame = {
    id: game.id,
    finishedAt: game.finished_at,
    startScore: rules.startScore,
    outMode: rules.outMode,
    kind,
    opponents: others.map(s => s.name),
  }
  const team = detail.teams?.find(t => t.seats.includes(seat))?.seats ?? [seat]
  return detail.legs.flatMap(l => {
    const mine = l.visits.filter(v => v.seat === seat)
    if (mine.length === 0) return []
    const visits = mine.map(v => {
      const start = v.bust ? v.remaining : v.remaining + v.scored
      return {
        start,
        scored: v.scored,
        bust: v.bust,
        checkout: v.remaining === 0,
        darts: walk(start, rules.inMode === 'straight' || start < rules.startScore, v.darts, rules),
      }
    })
    return [{ game: statGame, leg: l.leg, won: l.winner !== null && team.includes(l.winner), visits }]
  })
}
