// Scripted X01 games for the sample data, with mistakes the coach is known to note (and good darts
// it must let pass), so a preview shows the coach at work. coachGames.test.ts checks every note.

/** The dev accounts seedDev() creates (auth/seed.ts). */
export type Who = 'admin' | 'luke' | 'phil' | 'michael' | 'gerwyn'

/** Per seat in throw order, its visits (each up to 3 dart labels like 'S20', 'D16', 'Bull', '25'). */
export type DartScript = string[][][]

/** A dart the coach notes; `visit` counts that seat's visits. */
export type ExpectedNote = { seat: number; leg: 0; visit: number; dart: number }

type CoachSample = { players: Who[]; config: { startScore: number; firstTo: number }; script: DartScript; expect: ExpectedNote[] }

const config = { startScore: 301, firstTo: 1 }

export const COACH_GAMES: CoachSample[] = [
  // Admin leaves 37 from 57 with the last dart (no one-dart finish), opponent far away; then a clean D16
  {
    players: ['admin', 'gerwyn'],
    config,
    script: [
      [
        ['T20', 'T20', 'S4'],
        ['T20', 'T20', 'S20'],
        ['S5', 'D16'],
      ],
      [
        ['S20', 'S1', 'S5'],
        ['S20', 'S5', 'S1'],
      ],
    ],
    expect: [{ seat: 0, leg: 0, visit: 1, dart: 2 }],
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
  },
]
