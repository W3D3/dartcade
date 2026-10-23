import { describe, expect, it } from 'vitest'
import type { XpGame } from '../db/progression.js'
import { challengeGame } from './facts.js'

const typedGame: XpGame = {
  id: 'g1',
  gameId: 'x01',
  finishedAt: new Date('2026-10-23T16:00:00Z'),
  seats: [{ seat: 0, userId: 'u1', controllerUserId: 'u1', bot: false, placement: 1, forfeited: false, stats: {} }],
  darts: new Map([[0, { total: 3, camera: 0, oneEighties: 0 }]]),
  visits: new Map([
    [
      0,
      [
        {
          visit: 0,
          leg: 0,
          segs: [
            { n: 20, m: 2 },
            { n: 19, m: 2 },
            { n: 18, m: 2 },
          ],
        },
      ],
    ],
  ]),
  rankedUserIds: new Set(),
  lobbyId: null,
  config: { startScore: 501 },
}
const player = {
  gameId: 'x01',
  ranked: false,
  placement: 1,
  forfeited: false,
  stats: {},
  opponents: [],
  darts: { total: 3, camera: 0, oneEighties: 0 },
}

describe('challengeGame', () => {
  it("leaves a typed-in game's darts out of the challenges", () => {
    expect(challengeGame(typedGame, 'u1', player, null).visits).toEqual([])
  })

  it('counts them with progression.manualDarts on', () => {
    expect(challengeGame(typedGame, 'u1', player, null, true).visits.flatMap(v => v.segs)).toEqual([
      { n: 20, m: 2 },
      { n: 19, m: 2 },
      { n: 18, m: 2 },
    ])
  })
})
