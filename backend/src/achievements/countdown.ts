// What a finished countdown game looked like from one seat, as the achievements read it. X01 comes
// from the challenges' own reading (progression/facts.ts); 121 Checkout has no legs, so its checkouts
// are the made tries, read from the seat's visits: the finishing darts are the try's last darts, and
// the checkout's value is what the finishing visit scored (as in X01), not the try's target.
import type { XpGame } from '../db/progression.js'
import type { Detail } from '../history/detail.js'
import { challengeGame } from '../progression/facts.js'
import type { PlayerGame } from '../progression/rules.js'
import type { ChallengeGame, Checkout, Visit } from '../progression/challenges.js'

type Try = { target: number; made: boolean; darts: number }

/** The made tries as checkouts. `visits` are the seat's visits in order, `tries` its finished tries. */
export function p121Checkouts(visits: Visit[], tries: Try[]): Checkout[] {
  const darts = visits.flatMap((v, visit) => v.segs.map(seg => ({ seg, visit })))
  let used = 0
  return tries.flatMap(t => {
    used += t.darts
    const last = darts.at(used - 1)
    if (!t.made || !last) return []
    // A try can take several visits: the value is the finishing visit's darts within it
    const value = darts
      .slice(used - t.darts, used)
      .filter(d => d.visit === last.visit)
      .reduce((a, d) => a + d.seg.n * d.seg.m, 0)
    const prev = darts.at(used - 2)
    return [
      {
        last: last.seg,
        value,
        darts: t.darts,
        startScore: t.target,
        ...(prev?.visit === last.visit && { prev: prev.seg }),
      },
    ]
  })
}

export function countdownGame(
  game: XpGame,
  userId: string,
  player: Omit<PlayerGame, 'previousBest'>,
  detail: Detail | null,
  manualDarts: boolean,
): ChallengeGame {
  const g = challengeGame(game, userId, player, detail?.mode === 'x01' ? detail : null, manualDarts)
  if (detail?.mode !== 'p121') return g
  const seat = game.seats.find(s => s.userId === userId)?.seat ?? -1
  return { ...g, checkouts: p121Checkouts(g.visits, detail.seats[seat]?.tries ?? []) }
}
