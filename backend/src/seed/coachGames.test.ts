import { describe, it, expect } from 'vitest'
import { reviewLeg } from '../shared/coach/index.js'
import { strategyNotes } from '../shared/coach/notes.js'
import { leg, visit, REF } from '../shared/coach/testLegs.js'
import { throwsOf, type CoachVisit } from '../shared/coach/walk.js'
import { COACH_GAMES, scriptedPoint, type DartScript } from './coachGames.js'

/** The leg as the game stores it: each seat's scripted visits in throw order, up to the checkout,
 *  each dart where the seed throws it. */
function legOf(script: DartScript, start: number): CoachVisit[] {
  const left = script.map(() => start)
  const visits: CoachVisit[] = []
  for (let i = 0; ; i++) {
    for (const [seat, seatVisits] of script.entries()) {
      const names = seatVisits.at(i)
      if (!names) return visits
      const v = visit(seat, left[seat], names)
      // Every scripted dart is thrown: a visit only ends early by its last dart
      expect(v.darts, `seat ${seat} visit ${i}`).toHaveLength(names.length)
      visits.push({ ...v, darts: v.darts.map(d => ({ ...d, coords: scriptedPoint(d.segment.name) })) })
      left[seat] = v.remaining
      if (v.remaining === 0) return visits
    }
  }
}

describe('sample games with known coach mistakes', () => {
  it.each(COACH_GAMES.map((g, i) => [i, g] as const))('game %i', (_i, { players, config, script, expect: expected, grades, kinds }) => {
    const start = (config as { startScore: number }).startScore
    const visits = legOf(script, start)

    // It ends with the last scripted visit, a checkout
    expect(visits).toHaveLength(script.flat().length)
    expect(visits.at(-1)).toMatchObject({ remaining: 0, bust: false })

    const noted = script.flatMap((_, seat) =>
      strategyNotes(throwsOf([leg(visits)], seat, start, REF), REF).map(n => ({
        seat,
        leg: n.leg,
        visit: visits.slice(0, n.visit).filter(v => v.seat === seat).length,
        dart: n.dart,
        cost: n.cost,
      })),
    )
    expect(noted.map(({ cost: _, ...n }) => n)).toEqual(expected)
    // Clear of the 5-point threshold, so a regenerated landing table doesn't drop them
    for (const n of noted) expect(n.cost, JSON.stringify(n)).toBeGreaterThanOrEqual(0.07)

    // Every scripted visit's grade, against the game's own average (the seed users have no other),
    // and every dart's class
    const winner = visits.at(-1)?.seat
    const reviews = script.map(
      (_, seat) =>
        reviewLeg([{ ...leg(visits), winner }], 0, seat, {
          startScore: start,
          average: null,
          model: REF,
          referenceModel: REF,
          opponentName: s => players[s],
        })?.visits,
    )
    expect(reviews.map(vs => vs?.map(v => v.grade))).toEqual(grades)
    expect(reviews.map(vs => vs?.map(v => v.darts.map(d => d.class.kind)))).toEqual(kinds)
  })
})
