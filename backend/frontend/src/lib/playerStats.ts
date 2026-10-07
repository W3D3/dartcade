// What a player panel or row shows, computed from the game snapshot.
import { checkoutHint, type CheckoutPrefs } from '$shared/checkout.js'
import { atcCells, atcDone, atcTargetLabel, type AtcCell } from './atc.js'
import type { Visit } from './visitHistory.js'
import { shownScore, type ScoreUpdates } from './heldScore.js'
import type { RollOptions } from './rollingNumber.js'

import type { AtcGame, X01Game } from './api/game-ws'

/** A 3-dart average to one decimal; a dash without darts. */
export const fmtAvg = (v: number | null) => (v === null ? '—' : v.toFixed(1))

/** A 3-dart average from points and darts, to one decimal; a dash without darts. */
export const avgOf = (points: number, darts: number) => fmtAvg(darts > 0 ? (points / darts) * 3 : null)

/** Darts at a finish that hit, as "40%" and "2/5"; a dash before the first. */
export const checkoutRate = (hits: number, attempts: number) => ({
  checkout: attempts > 0 ? `${Math.round((hits / attempts) * 100)}%` : '—',
  checkoutDarts: `${hits}/${attempts}`,
})

export type X01PlayerView = {
  remaining: number
  /** The big score: `remaining`, or held at the visit's start while it's open ("Score left: After the visit"). */
  shown: number
  opened: boolean
  /** "T19 · D12", or null when no finish is possible (or suggestions are off). */
  canFinish: string | null
  avg: string
  legAvg: string
  last: string
  /** Darts at a finish that hit: "40%", or a dash before the first. */
  checkout: string
  /** The same as "hits/darts". */
  checkoutDarts: string
  darts: number
  legsWon: number
  firstTo: number
  /** The sum of every seat's legs won (in a team game each seat carries its team's, so a leg
   *  counts once per seat): it goes up exactly when a new leg starts, so the score starts over. */
  leg: number
  /** Finished visits of this leg. */
  visits: Visit[]
  /** Show the "Can finish" line at all (checkout suggestions on). */
  showFinish: boolean
  /** The thrower's running visit, for the chalkboard's highlighted row. */
  current: { scored: number; left: number; bust: boolean } | null
}

export function x01Player(
  game: X01Game,
  i: number,
  o: { active: boolean; suggest: boolean; checkout?: CheckoutPrefs; bust?: boolean; scoreUpdates?: ScoreUpdates },
): X01PlayerView {
  const remaining = game.scores.at(i) ?? 0
  const opened = game.opened.at(i) ?? true
  const running = o.active ? game.currentVisitDarts : []
  const dartsLeft = 3 - running.length
  const hint =
    o.suggest && !o.bust && opened && remaining > 0 && dartsLeft > 0
      ? checkoutHint(remaining, game.config.outMode, dartsLeft, o.checkout)
      : null
  const leg: Visit[] = game.legVisits.filter(v => v.seat === i)
  const last = game.lastVisit.at(i) ?? null
  return {
    remaining,
    opened,
    shown: shownScore({
      mode: o.scoreUpdates ?? 'dart',
      score: remaining,
      thrower: o.active,
      locked: game.visitLocked,
      darts: running,
      start: game.visitStartScores.at(i) ?? null,
    }),
    canFinish: hint ? hint.join(' · ') : null,
    avg: avgOf(game.pointsScored.at(i) ?? 0, game.dartsThrown.at(i) ?? 0),
    legAvg: avgOf(
      leg.reduce((a, v) => a + v.scored, 0),
      leg.reduce((a, v) => a + v.darts, 0),
    ),
    last: last ? String(last.scored) : '—',
    ...checkoutRate(game.checkoutHits.at(i) ?? 0, game.checkoutAttempts.at(i) ?? 0),
    darts: game.totalDarts.at(i) ?? 0,
    legsWon: game.legs.at(i) ?? 0,
    firstTo: game.firstTo,
    leg: game.legs.reduce((a, l) => a + l, 0),
    visits: leg,
    showFinish: o.suggest,
    current: running.length ? { scored: running.reduce((a, d) => a + d.score, 0), left: remaining, bust: o.bust === true } : null,
  }
}

/** How the big X01 score (a player's or a team's) rolls: the shown score, a new leg starts it
 *  over, a bust flashes red, a checkout turns lime. */
export function x01Roll(v: { leg: number; shown: number; current: { bust: boolean } | null }): { value: number } & RollOptions {
  return { value: v.shown, reset: v.leg, bust: v.current?.bust ?? false, checkout: v.shown === 0 }
}

export type AtcPlayerView = { target: string; done: number; total: number; cells: AtcCell[]; darts: number; hitRate: string }

export function atcPlayer(game: AtcGame, i: number): AtcPlayerView {
  const seq = game.sequence
  const target = game.targets.at(i) ?? seq.at(0) ?? 1
  const darts = game.totalDarts.at(i) ?? 0
  const hits = game.hitCounts.at(i) ?? 0
  return {
    target: atcTargetLabel(seq, target),
    done: atcDone(seq, target),
    total: seq.length,
    cells: atcCells(seq, target),
    darts,
    hitRate: darts ? `${Math.round((hits / darts) * 100)}%` : '0%',
  }
}
