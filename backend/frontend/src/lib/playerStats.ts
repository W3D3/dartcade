// What a player panel or row shows, computed from the game snapshot.
import { checkoutHint, type CheckoutPrefs } from '$shared/checkout.js'
import { atcCells, atcDone, atcTargetLabel, type AtcCell } from './atc.js'
import type { Visit } from './visitHistory.js'
import { shownScore, type ScoreUpdates } from './heldScore.js'
import type { RollOptions } from './rollingNumber.js'
import type { Stat } from './statPages.js'

import type { AtcGame, X01Game } from './api/game-ws'
import { DARTS_PER_VISIT, perVisitAverage } from '$shared/darts.js'

/** A 3-dart average to one decimal; a dash without darts. */
export const fmtAvg = (v: number | null) => (v === null ? '—' : v.toFixed(1))

/** A 3-dart average from points and darts, to one decimal; a dash without darts. */
export const avgOf = (points: number, darts: number) => fmtAvg(perVisitAverage(points, darts))

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
  /** The score of the last finished visit (a bust is 0) by the player's team; a dash before the first. */
  last: string
  /** The fewest darts the player's team needed to win a leg of this match; a dash until one is won. */
  bestLeg: string
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

/** Darts thrown this leg by these seats (a seat, or a team's), the running visit included for the thrower. */
export function legDarts(game: Pick<X01Game, 'legVisits' | 'currentVisitDarts'>, seats: number[], active: boolean): number {
  const thrown = game.legVisits.reduce((a, v) => a + (seats.includes(v.seat) ? v.darts : 0), 0)
  return thrown + (active ? game.currentVisitDarts.length : 0)
}

export function x01Player(
  game: X01Game,
  i: number,
  o: { active: boolean; suggest: boolean; checkout?: CheckoutPrefs; bust?: boolean; scoreUpdates?: ScoreUpdates },
): X01PlayerView {
  const remaining = game.scores.at(i) ?? 0
  const opened = game.opened.at(i) ?? true
  const running = o.active ? game.currentVisitDarts : []
  const dartsLeft = DARTS_PER_VISIT - running.length
  const hint =
    o.suggest && !o.bust && opened && remaining > 0 && dartsLeft > 0
      ? checkoutHint(remaining, game.config.outMode, dartsLeft, o.checkout)
      : null
  const leg: Visit[] = game.legVisits.filter(v => v.seat === i)
  const last = game.lastVisit.at(i) ?? null
  const bestLeg = game.bestLeg.at(i) ?? null
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
    bestLeg: bestLeg === null ? '—' : String(bestLeg),
    ...checkoutRate(game.checkoutHits.at(i) ?? 0, game.checkoutAttempts.at(i) ?? 0),
    darts: legDarts(game, [i], o.active),
    legsWon: game.legs.at(i) ?? 0,
    firstTo: game.firstTo,
    leg: game.legs.reduce((a, l) => a + l, 0),
    visits: leg,
    showFinish: o.suggest,
    current: running.length ? { scored: running.reduce((a, d) => a + d.score, 0), left: remaining, bust: o.bust === true } : null,
  }
}

/** The averages a stacked row shows: this leg's beside the match's (dimmed), or one "Avg" in a single-leg game. */
export function x01Averages(p: Pick<X01PlayerView, 'avg' | 'legAvg' | 'firstTo'>): { label: string; value: string; dim: boolean }[] {
  if (p.firstTo <= 1) return [{ label: 'Avg', value: p.avg, dim: false }]
  return [
    { label: 'Leg avg', value: p.legAvg, dim: false },
    { label: 'Match avg', value: p.avg, dim: true },
  ]
}

/** The darts cell of a row or card: the darts thrown this leg. Labelled "Darts", not "Darts thrown", so the label stays on one line (#495). */
export function x01Darts(p: { darts: number }): { label: string; value: string } {
  return { label: 'Darts', value: String(p.darts) }
}

/** The two pages of a card's stat strip: leg avg, last score and darts; then match avg,
 *  checkout % and best leg. One "Avg" on the first page in a single-leg game, where the two averages
 *  are the same and the match avg is left out. */
export function x01Pages(
  p: Pick<X01PlayerView, 'avg' | 'legAvg' | 'firstTo' | 'last' | 'bestLeg' | 'darts' | 'checkout' | 'checkoutDarts'>,
): Stat[][] {
  const single = p.firstTo <= 1
  return [
    [{ label: single ? 'Avg' : 'Leg avg', value: single ? p.avg : p.legAvg }, { label: 'Last score', value: p.last }, x01Darts(p)],
    [
      ...(single ? [] : [{ label: 'Match avg', value: p.avg, dim: true }]),
      { label: 'Checkout %', value: p.checkout, title: `${p.checkoutDarts} darts at a finish`, dim: true },
      { label: 'Best leg', value: p.bestLeg, dim: true },
    ],
  ]
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
