// What a finished game did from one account's seat, as the challenges read it (challenges.ts).
// Pure: the X01 detail (scores, busts, who won each leg) comes in from the history replay.
import type { XpGame } from '../db/progression.js'
import type { X01Detail } from '../session/types.js'
import type { ChallengeGame, Checkout, Visit } from './challenges.js'
import { isManual, qualifies, type PlayerGame } from './rules.js'

/**
 * A manual-entry game still counts as a game (and a win), but its typed-in darts don't count
 * towards dart challenges (trebles, checkouts, …), like they pay no dart XP, unless
 * `manualDarts` (the progression.manualDarts flag, for testing without a board) lets them.
 */
export function challengeGame(
  game: XpGame,
  userId: string,
  player: Omit<PlayerGame, 'previousBest'>,
  x01: X01Detail | null,
  manualDarts = false,
): ChallengeGame {
  const typed = !manualDarts && isManual({ ...player, previousBest: null })
  const detail = typed ? null : x01
  const me = game.seats.find(s => s.userId === userId)
  const seat = me?.seat ?? -1
  const raw = typed ? [] : (game.visits.get(seat) ?? [])
  // X01: each visit's score and bust, by visit number
  const scored = new Map(detail?.legs.flatMap(l => l.visits.filter(v => v.seat === seat).map(v => [v.visit, v] as const)) ?? [])
  const visits: Visit[] = raw.map(v => {
    const d = scored.get(v.visit)
    return { leg: v.leg, segs: v.segs, scored: d?.scored ?? null, bust: d?.bust ?? false }
  })

  const startScore =
    typeof game.config === 'object' && game.config !== null && 'startScore' in game.config ? Number(game.config.startScore) : 0
  const checkouts: Checkout[] = []
  const legResults: boolean[] = []
  let maxDeficit = 0
  for (const leg of detail?.legs ?? []) {
    if (leg.winner !== null) legResults.push(leg.winner === seat)
    // Remaining per seat as the leg goes: how far you trailed the leader
    const left = new Map<number, number>()
    for (const v of leg.visits) {
      left.set(v.seat, v.remaining)
      const mine = left.get(seat)
      const others = [...left].filter(([s]) => s !== seat).map(([, r]) => r)
      if (mine !== undefined && others.length > 0) maxDeficit = Math.max(maxDeficit, mine - Math.min(...others))
    }
    const last = leg.visits.filter(v => v.seat === seat).at(-1)
    if (leg.winner === seat && last && last.darts.length > 0) {
      const dart = last.darts[last.darts.length - 1].segment
      checkouts.push({
        last: { n: dart.number, m: dart.multiplier },
        value: last.scored,
        darts: leg.visits.filter(v => v.seat === seat).reduce((a, v) => a + v.darts.length, 0),
        startScore,
      })
    }
  }

  return {
    id: game.id,
    mode: game.gameId,
    qualifies: qualifies({ ...player, previousBest: null }),
    won: player.placement === 1 && player.opponents.length > 0,
    boardDarts: player.darts.camera,
    visits,
    checkouts,
    legResults,
    maxDeficit,
    average: player.stats.average ?? null,
  }
}
