// What a player panel or row shows, computed from the game snapshot and the visit history.
import { checkoutHint } from './dartUtils.js'
import { atcCells, atcDone, atcTargetLabel, type AtcCell } from './atc.js'
import { threeDartAvg, type Visit, type VisitHistory } from './visitHistory.js'

type OutMode = 'straight' | 'double' | 'master'

const nums = (game: Record<string, unknown>, key: string): number[] =>
  Array.isArray(game[key]) ? (game[key] as number[]) : []
const fmtAvg = (v: number | null) => (v === null ? '—' : v.toFixed(1))

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
  game: Record<string, unknown>, i: number, history: VisitHistory, o: { active: boolean; suggest: boolean; bust?: boolean },
): X01PlayerView {
  const remaining = nums(game, 'scores')[i] ?? 0
  const opened = (game.opened as boolean[] | undefined)?.[i] ?? true
  const outMode = ((game.config as { outMode?: OutMode } | undefined)?.outMode ?? 'double')
  const running = o.active ? ((game.currentVisitDarts as { score?: number }[] | undefined) ?? []) : []
  const dartsLeft = 3 - running.length
  const hint = o.suggest && !o.bust && opened && remaining > 0 && dartsLeft > 0 ? checkoutHint(remaining, outMode, dartsLeft) : null
  const all = history.all[i] ?? []
  const leg = history.leg[i] ?? []
  return {
    remaining, opened,
    canFinish: hint ? hint.join(' · ') : null,
    avg: fmtAvg(threeDartAvg(all)),
    legAvg: fmtAvg(threeDartAvg(leg)),
    last: all.length ? String(all[all.length - 1].scored) : '—',
    darts: nums(game, 'totalDarts')[i] ?? 0,
    legsWon: nums(game, 'legs')[i] ?? 0,
    firstTo: (game.firstTo as number | undefined) ?? 1,
    visits: leg,
    showFinish: o.suggest,
    current: running.length ? { scored: running.reduce((a, d) => a + (d.score ?? 0), 0), left: remaining, bust: o.bust === true } : null,
  }
}

export type AtcPlayerView = { target: string; done: number; total: number; cells: AtcCell[]; darts: number; hitRate: string }

export function atcPlayer(game: Record<string, unknown>, i: number): AtcPlayerView {
  const seq = nums(game, 'sequence')
  const target = nums(game, 'targets')[i] ?? seq[0] ?? 1
  const darts = nums(game, 'totalDarts')[i] ?? 0
  const hits = nums(game, 'hitCounts')[i] ?? 0
  return {
    target: atcTargetLabel(seq, target), done: atcDone(seq, target), total: seq.length,
    cells: atcCells(seq, target), darts, hitRate: darts ? `${Math.round((hits / darts) * 100)}%` : '0%',
  }
}
