// The six missions of the Missions artboards, as plain definitions for the screenshot scenes.
// Nothing ships in code: the scenes mock the list and make the mission a game needs through the API.

const numbers = (ring: '' | 'S' | 'D' | 'T'): string[] => Array.from({ length: 20 }, (_, i) => `${ring}${i + 1}`)
const shanghai = (n: number) => ({
  type: 'hit',
  targets: [`S${n}`, `D${n}`, `T${n}`],
  hits: 1,
  inARow: false,
  order: 'any',
  within: 'visit',
})

const base = { order: 'any', onFail: 'retry', pause: true, rankBy: 'time' }

export const MISSIONS: Record<string, unknown>[] = [
  {
    ...base,
    name: 'Around the Clock Sprint',
    description: '1 to 20, then the bull. Every dart counts.',
    difficulty: 'medium',
    rankBy: 'darts',
    steps: [{ type: 'hit', targets: [...numbers(''), 'B'], hits: 1, inARow: false, order: 'in_order', within: 40 }],
  },
  {
    ...base,
    name: 'Bull Rush',
    description: 'All about the middle of the board.',
    difficulty: 'easy',
    timeLimit: 300,
    steps: [
      { type: 'hit', targets: ['B'], hits: 5, inARow: false, order: 'any' },
      { type: 'hit', targets: ['DB'], hits: 2, inARow: false, order: 'any' },
      { type: 'checkout', start: 50, maxDarts: 3, finish: 'double' },
    ],
  },
  {
    ...base,
    name: 'Double Trouble Drill',
    description: 'Every double once, then a classic finish.',
    difficulty: 'medium',
    timeLimit: 600,
    steps: [
      { type: 'hit', targets: numbers('D'), hits: 1, inARow: false, order: 'any' },
      { type: 'checkout', start: 40, maxDarts: 3, finish: 'double' },
    ],
  },
  {
    ...base,
    name: 'Ton Machine',
    description: 'Heavy scoring, then keep it up.',
    difficulty: 'medium',
    order: 'in_order',
    steps: [
      { type: 'visits', compare: 'at_least', points: 100, visits: 5, inARow: true },
      { type: 'average', average: 60, visits: 10 },
    ],
  },
  {
    ...base,
    name: 'Shanghai Night',
    description: 'Single, double and treble of a number in one visit, three times.',
    difficulty: 'hard',
    order: 'in_order',
    timeLimit: 1800,
    steps: [shanghai(20), shanghai(19), shanghai(18)],
  },
  {
    ...base,
    name: 'Tungsten Gauntlet',
    description: 'Big fish, a perfect 20s streak and a tricky finish route. Good luck.',
    difficulty: 'hard',
    timeLimit: 900,
    steps: [
      { type: 'checkout', start: 170, maxDarts: 8, finish: 'double' },
      { type: 'hit', targets: ['S20'], hits: 9, inARow: true, order: 'any' },
      { type: 'hit', targets: ['D11', 'B', 'D6'], hits: 1, inARow: false, order: 'in_order', within: 9 },
    ],
  },
]
