import { describe, it, expect } from 'vitest'
import { getGameView } from '../gameViews/index.js'

describe('getGameView', () => {
  it('an unknown game has a plain title and no meta line', () => {
    const view = getGameView('soccer')
    const snapshot = { type: 'snapshot', sessionId: 's', gameId: 'soccer', boardId: null, players: [], game: {}, bmStatus: null } as any
    expect(view.title).toBe('Game')
    expect(view.meta(snapshot)).toBe('')
  })

  it("Cricket's title and meta line", () => {
    const view = getGameView('cricket')
    const game = { config: { mode: 'standard', firstTo: 3 }, round: 2 } as any
    const snapshot = { type: 'snapshot', sessionId: 's', gameId: 'cricket', boardId: null, players: [{}, {}], game, bmStatus: null } as any
    expect(view.title).toBe('Cricket')
    expect(view.meta(snapshot)).toBe('2 players · Standard · First to 3 · Round 2')
  })
})
