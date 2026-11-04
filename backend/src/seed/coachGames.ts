// Scripted X01 games for the sample data, with mistakes the coach is known to note (and good darts
// it must let pass), so a preview shows the coach at work. coachGames.test.ts checks every note,
// every visit's grade and every dart's class.
import { pointFor } from '../bots/accuracy.js'
import type { DartKind } from '../shared/coach/dartClass.js'
import type { VisitGrade } from '../shared/coach/grade.js'

/** A scripted dart's spot: the middle of its bed, a miss just off the board. */
export const scriptedPoint = (label: string): { x: number; y: number } => (label === 'Miss' ? { x: 0, y: 1.05 } : pointFor(label))

/** The dev accounts seedDev() creates (auth/seed.ts). */
export type Who = 'admin' | 'luke' | 'phil' | 'michael' | 'gerwyn'

/** Per seat in throw order, its visits (each up to 3 dart labels like 'S20', 'D16', 'Bull', '25'). */
export type DartScript = string[][][]

/** A dart the coach notes; `visit` counts that seat's visits. */
export type ExpectedNote = { seat: number; leg: 0; visit: number; dart: number }

/** Per seat, each scripted visit's grade in the leg review */
export type ExpectedGrades = VisitGrade[][]

/** Per seat and visit, each scripted dart's class kind in the leg review. Scripted darts sit at their
 *  bed's centre (scriptedPoint), so a single at 20 is a Single, not a Hit. */
export type ExpectedKinds = DartKind[][][]

type CoachSample = {
  players: Who[]
  config: { startScore: number; firstTo: number }
  script: DartScript
  expect: ExpectedNote[]
  grades: ExpectedGrades
  kinds: ExpectedKinds
}

const config = { startScore: 301, firstTo: 1 }

export const COACH_GAMES: CoachSample[] = [
  // Admin, setting up from 121, leaves 37 from 57 with the last dart (no one-dart finish), opponent
  // far away: a Mistake; then a clean D16
  {
    players: ['admin', 'gerwyn'],
    config,
    script: [
      [
        ['T20', 'T20', 'T20'],
        ['T16', 'S16', 'S20'],
        ['S5', 'D16'],
      ],
      [
        ['S20', 'S1', 'S5'],
        ['S20', 'S5', 'S1'],
      ],
    ],
    expect: [{ seat: 0, leg: 0, visit: 1, dart: 2 }],
    grades: [
      // 180 leaves 121, a 3-dart finish: the fewest darts, and hard (Brilliant); S5 D16 checks 57
      // out in two: the fewest too, but an easy one (Excellent)
      ['brilliant', 'bad', 'excellent'],
      // 26 and 26 against a 26 average, spilled into 1 and 5: Inaccuracy at best
      ['inaccuracy', 'inaccuracy'],
    ],
    kinds: [
      [
        ['scoringHit', 'scoringHit', 'scoringHit'],
        // From 121: T16, S16, then S20 on 57: far from every aim worth taking there (S17), so wild
        ['route', 'route', 'wild'],
        ['route', 'double'],
      ],
      [
        ['scoringSingle', 'scoringMiss', 'scoringMiss'],
        ['scoringSingle', 'scoringMiss', 'scoringMiss'],
      ],
    ],
  },
  // The same 57 by admin, with Luke on 20 and Michael on 10: no note, they'd likely finish first.
  // Luke's T20 on 119 and Michael's 25 on 65 are fine too
  {
    players: ['luke', 'michael', 'admin'],
    config,
    script: [
      [['T20', 'S20', 'S20'], ['S20', 'S5', 'T19'], ['T20', 'S19', 'S20'], ['D10']],
      [
        ['T20', 'T20', 'S20'],
        ['S19', 'S20', 'T19'],
        ['25', 'S20', 'S10'],
      ],
      [
        ['S20', 'S1', 'S5'],
        ['T20', 'S19', 'S19'],
        ['T20', 'T20', 'S20'],
      ],
    ],
    expect: [],
    grades: [
      // 100 from T20, S20, S20 in the middle of their beds: a tight group lifts it to Good
      ['good', 'ok', 'inaccuracy', 'excellent'],
      // 140 leaves 161, still a 3-dart finish (Brilliant); from 65, 25 then S20 and S10 chase D10 down to 10
      ['brilliant', 'ok', 'bad'],
      // 26 on an 88 average is Bad; 140 Excellent
      ['bad', 'good', 'excellent'],
    ],
    kinds: [
      [
        ['scoringHit', 'scoringSingle', 'scoringSingle'],
        ['scoringSingle', 'scoringMiss', 'scoringHit'],
        ['route', 'route', 'double'],
        ['double'],
      ],
      [
        ['scoringHit', 'scoringHit', 'scoringSingle'],
        ['route', 'route', 'route'],
        ['bull', 'double', 'double'],
      ],
      [
        ['scoringSingle', 'scoringMiss', 'scoringMiss'],
        ['scoringHit', 'scoringSingle', 'scoringSingle'],
        ['scoringHit', 'route', 'wild'],
      ],
    ],
  },
  // Admin goes in 1 with 47 left and two darts (leaves 46; S15 would leave 32), then busts in 19
  // on 20 with D10 to throw at
  {
    players: ['admin', 'phil'],
    config,
    script: [
      [['T20', 'S20', 'S20'], ['S7', 'T19', 'T20'], ['T10', 'S1', 'S6'], ['S20', 'S19'], ['D20']],
      [
        ['S20', 'S1', 'S5'],
        ['S20', 'S5', 'S1'],
        ['S20', 'S1', 'S5'],
        ['S20', 'S5', 'S1'],
      ],
    ],
    expect: [
      { seat: 0, leg: 0, visit: 2, dart: 1 },
      { seat: 0, leg: 0, visit: 3, dart: 1 },
    ],
    grades: [
      ['great', 'excellent', 'bad', 'bad', 'excellent'],
      ['inaccuracy', 'inaccuracy', 'inaccuracy', 'inaccuracy'],
    ],
    kinds: [
      [
        ['scoringHit', 'scoringSingle', 'scoringSingle'],
        ['scoringMiss', 'scoringHit', 'route'],
        // T10 on 77 and S1 on 47 are far from every aim worth taking there: wild
        ['wild', 'wild', 'route'],
        // S19 on 20 busts with D10 to throw at: not a Bust-back
        ['double', 'bust'],
        ['double'],
      ],
      [
        ['scoringSingle', 'scoringMiss', 'scoringMiss'],
        ['scoringSingle', 'scoringMiss', 'scoringMiss'],
        ['scoringSingle', 'scoringMiss', 'scoringMiss'],
        ['scoringSingle', 'scoringMiss', 'scoringMiss'],
      ],
    ],
  },
]
