// A mission for tests (backend and SPA): nothing ships in code, a fresh install has no missions.
import type { Mission } from './types.js'

export const GAUNTLET: Mission = {
  name: 'Tungsten Gauntlet',
  description: 'Big fish, a perfect 20s streak and a tricky finish route. Good luck.',
  difficulty: 'hard',
  order: 'any',
  onFail: 'retry',
  pause: true,
  rankBy: 'time',
  timeLimit: 900,
  steps: [
    { type: 'checkout', start: 170, maxDarts: 8, finish: 'double' },
    { type: 'hit', targets: ['S20'], hits: 9, inARow: true, order: 'any' },
    { type: 'hit', targets: ['D11', 'B', 'D6'], hits: 1, inARow: false, order: 'in_order', within: 9 },
  ],
}
