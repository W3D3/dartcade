// A ranked game's time limit as a pure reducer over (inputs, time). The visit timer is lenient on
// purpose (it only stops stalling) and never pauses: a visit starts when the previous one was
// committed and has `visitSeconds`; after that the seat's team spends its reserve. The clock only
// moves when a visit is committed, from the input's logged time, so replaying the log gives the
// same reserves as the live game. Running out is a logged system input (session/systemInput.ts).

/** What the flags said when the game started, kept with it (ranked_matches.rules). */
export type RankedRules = { visitSeconds: number; reserveSeconds: number; manualEntry: boolean }

export type RankedClock = {
  rules: RankedRules
  /** When the open visit started (ms): the last committed visit's time, or the game's start. */
  visitStart: number
  /** Reserve left (ms), by team (a seat's own index without teams). */
  reserve: number[]
}

export function newRankedClock(rules: RankedRules, seatCount: number, startedAt: Date): RankedClock {
  return { rules, visitStart: startedAt.getTime(), reserve: Array<number>(seatCount).fill(rules.reserveSeconds * 1000) }
}

/** A visit by `team` was committed at `at`: what ran past the visit time comes off its reserve. */
export function chargeVisit(clock: RankedClock, team: number, at: Date): void {
  const over = Math.max(0, at.getTime() - clock.visitStart - clock.rules.visitSeconds * 1000)
  clock.reserve[team] = Math.max(0, clock.reserve[team] - over)
  clock.visitStart = at.getTime()
}

/** When the visit of `team` runs over, and when its reserve is gone (ms). */
export function deadlines(clock: RankedClock, team: number): { visitDeadline: number; forfeitAt: number } {
  const visitDeadline = clock.visitStart + clock.rules.visitSeconds * 1000
  return { visitDeadline, forfeitAt: visitDeadline + clock.reserve[team] }
}

/**
 * When the seat that has to throw in the bull off forfeits for not throwing (ms): each throw has a
 * visit's time and spends no reserve, so a connected player can't hold the game back by staying silent.
 */
export function bullOffDeadline(clock: RankedClock): number {
  return clock.visitStart + clock.rules.visitSeconds * 1000
}

/** Reserve left for `team` at `now` (ms), counting the open visit if it is the team that is up. */
export function reserveLeft(clock: RankedClock, team: number, up: boolean, now: number): number {
  if (!up) return clock.reserve[team]
  const { visitDeadline, forfeitAt } = deadlines(clock, team)
  return Math.max(0, forfeitAt - Math.max(now, visitDeadline))
}

/** The server was away (a restart): the open visit starts over, the reserves stay as they were. */
export function restartVisit(clock: RankedClock, now: Date): void {
  clock.visitStart = now.getTime()
}
