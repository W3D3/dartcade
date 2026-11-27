import type { MissionGame } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

type V = Pick<MissionGame, 'runs'>

/** A failed attempt (the step starts again) or a run that is out (time, gave up) blinks red, like a bust. */
export function missionTriggers(before: V | null, after: V): Trigger[] {
  if (before === null) return []
  return after.runs.flatMap((run, seat) => {
    const was = before.runs[seat]
    const out = was.status === 'playing' && run.status === 'failed'
    const retried = run.steps.some((s, i) => s.attempts > was.steps[i].attempts)
    return out || retried ? [{ kind: 'bust' as const, seat }] : []
  })
}

/** The game ends when nobody plays on; it is won (Matchshot) only by a run that completed. */
export const missionWon = (game: Pick<MissionGame, 'runs' | 'winner'>): boolean =>
  game.winner !== null && game.runs[game.winner]?.status === 'completed'
