// The run summary (Dungeon-Pixel-Summary): the end screen and the details page read the same one.
import type { MapRoom } from './map.js'
import type { BestVisit, RunState, SeatStats } from './run.js'
import type { Hero } from './state.js'

export type RunSummary = {
  outcome: 'victory' | 'defeat' | null
  difficulty: RunState['cfg']['difficulty']
  floors: number
  cleared: number
  gold: number
  /** The rooms taken, from floor 1. */
  path: MapRoom[]
  heroes: (Pick<Hero, 'seat' | 'classId' | 'hp' | 'maxHp' | 'artifacts'> & SeatStats)[]
  best: BestVisit | null
}

export function runSummary(s: RunState): RunSummary {
  return {
    outcome: s.scene.phase === 'ended' ? s.scene.outcome : null,
    difficulty: s.cfg.difficulty,
    floors: s.cfg.floors,
    cleared: s.cleared,
    gold: s.gold,
    path: s.path.flatMap((lane, i) => s.map.floors[i]?.filter(r => r.lane === lane) ?? []),
    heroes: s.heroes.map(h => ({ seat: h.seat, classId: h.classId, hp: h.hp, maxHp: h.maxHp, artifacts: h.artifacts, ...s.stats[h.seat] })),
    best: s.best,
  }
}

/** The hero who dealt the most damage; null when nobody dealt any. */
export const mvpOf = (summary: RunSummary): number | null => {
  const top = Math.max(0, ...summary.heroes.map(h => h.damage))
  return top > 0 ? (summary.heroes.find(h => h.damage === top)?.seat ?? null) : null
}
