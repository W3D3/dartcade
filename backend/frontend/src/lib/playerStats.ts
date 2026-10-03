// What a player panel or row shows, computed from the game snapshot and the visit history.
import { checkoutHint } from './dartUtils.js'
import { atcCells, atcDone, atcTargetLabel, type AtcCell } from './atc.js'
import { threeDartAvg, type Visit, type VisitHistory } from './visitHistory.js'

import type { AtcGame, X01Game } from './api/game-ws'

/** A 3-dart average to one decimal; a dash without darts. */
export const fmtAvg = (v: number | null) => (v === null ? '—' : v.toFixed(1))

export type X01PlayerView = {
  remaining: number
  opened: boolean
  /** "T19 · D12", or null when no finish is possible (or suggestions are off). */
  canFinish: string | null
  avg: string
  legAvg: string
  last: string
  darts: number
  legsWon: number
  firstTo: number
  /** Finished visits of this leg. */
  visits: Visit[]
  /** Show the "Can finish" line at all (checkout suggestions on). */
  showFinish: boolean
  /** The thrower's running visit, for the chalkboard's highlighted row. */
  current: { scored: number; left: number; bust: boolean } | null
}

export function x01Player(
  game: X01Game, i: number, history: VisitHistory, o: { active: boolean; suggest: boolean; bust?: boolean },
): X01PlayerView {
  const remaining = game.scores.at(i) ?? 0
  const opened = game.opened.at(i) ?? true
  const running = o.active ? game.currentVisitDarts : []
  const dartsLeft = 3 - running.length
  const hint = o.suggest && !o.bust && opened && remaining > 0 && dartsLeft > 0 ? checkoutHint(remaining, game.config.outMode, dartsLeft) : null
  const all = history.all.at(i) ?? []
  const leg = history.leg.at(i) ?? []
  const last = all.at(-1)
  return {
    remaining, opened,
    canFinish: hint ? hint.join(' · ') : null,
    avg: fmtAvg(threeDartAvg(all)),
    legAvg: fmtAvg(threeDartAvg(leg)),
    last: last ? String(last.scored) : '—',
    darts: game.totalDarts.at(i) ?? 0,
    legsWon: game.legs.at(i) ?? 0,
    firstTo: game.firstTo,
    visits: leg,
    showFinish: o.suggest,
    current: running.length ? { scored: running.reduce((a, d) => a + d.score, 0), left: remaining, bust: o.bust === true } : null,
  }
}

export type AtcPlayerView = { target: string; done: number; total: number; cells: AtcCell[]; darts: number; hitRate: string }

export function atcPlayer(game: AtcGame, i: number): AtcPlayerView {
  const seq = game.sequence
  const target = game.targets.at(i) ?? seq.at(0) ?? 1
  const darts = game.totalDarts.at(i) ?? 0
  const hits = game.hitCounts.at(i) ?? 0
  return {
    target: atcTargetLabel(seq, target), done: atcDone(seq, target), total: seq.length,
    cells: atcCells(seq, target), darts, hitRate: darts ? `${Math.round((hits / darts) * 100)}%` : '0%',
  }
}
